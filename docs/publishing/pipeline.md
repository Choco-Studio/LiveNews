# The publishing pipeline

From an aired programme to a post on a network, with the owner in between and nothing sent unless he has switched it
on. Code in `server/publish/` (the library) and `tools/publish/` (the commands). All state lives in `data/publish/`,
which is never in git.

    programme ──► factory (clips) ─────┐
    archive ───► posts (text) ─────────┼─► queue ─► approval page ─► scheduler ─► publisher ─► adapters ─► networks
    programme ──► upload (whole show) ─┘     ▲            (owner)                   │ gate · mark · ledger · outbox
    channel ───► live supervisor ────────────┼───────────────────────────────────────┘ (live title: YouTube adapter)
                                         compliance (checkClip / preflight / markFile / register)

## 1. The commands

| Command | What it does |
|---|---|
| `tools/publish/factory.mjs` | One episode's clips, both formats, into the queue (`clips.md`) |
| `tools/publish/posts.mjs --day` | A day of text posts, written to a file and optionally into the queue (`plan.md` §4); `--data` another data folder's archive and articles (the beta's news day) |
| `tools/publish/upload.mjs` | A whole programme for YouTube: video, thumbnail, title, description, chapters (`plan.md` §5); `--video` queues one made earlier |
| `tools/publish/approve.mjs` | The owner's approval page on http://127.0.0.1:8740/ (§3); `--manual` for hand publishing (§8) |
| `tools/publish/beta.mjs` | The beta, published by hand (§8, `beta.md`): `hacer` makes the day's pieces, `estado` says what the day offers, no argument opens the page |
| `tools/publish/run.mjs` | The publisher's round: re-check what waits, schedule what is approved, publish what is due (§4) |
| `tools/publish/auto.mjs` | The autonomous round (a timer, every 30 minutes): each programme the playout rendered becomes its clips (`factory.mjs --from-playout`) and its whole-programme upload (`upload.mjs --from-playout`), then `run.mjs`. What goes out is still the settings and the five switches (§4) |
| `tools/publish/recheck.mjs` | The re-check alone: the gate again on everything waiting; what no longer passes is held (§4.1) |
| `tools/publish/live.mjs` | The 24/7 stream kept up, and its title (§6) |
| `tools/publish/material.mjs` | Episodes from the archive, offline, with recorded voices (for rehearsal and measurement) |
| `tools/publish/playback-server.mjs` | One saved episode served to the recorder |

## 2. The queue (`queue.js`)

Every piece waits here as one JSON file (`queue/<id>.json`, written whole through a temporary file, so a crash never
leaves half of one). Each item holds its preview (video, cover, contact sheet, captions), its text, its network, its
compliance verdict, its score and its history.

**Statuses.**

- `pending` waits for the owner. From there an item becomes `approved`, then `scheduled`, then `published` or
  `failed`.
- `held` is a compliance refusal. It is never approved over, by the page or by any mode.
- `rejected` is the owner's decision.
- `duplicate` means it is already in the ledger.

**Modes per network**, set on the approval page:

- `manual`: everything waits for the owner.
- `sample` (Phase 3 only): one item in five waits.
- `auto` (Phase 3 only): approved at once.
- `off`: nothing is queued for that network.

A grave item waits for the owner in every mode.

**The ledger.**

- `ledger.jsonl` records what was really published. `ledger-dry.jsonl` records what a dry run would have published:
  it blocks another dry run, but never the real thing.
- An item is refused at enqueue, and again at the moment of publishing, when any of these is true:
  - its content key (network, moment and format, or the episode, or the stories of a post) is already there;
  - the same video bytes went to that network;
  - a post on the same story went to that network in the last 24 hours.

**The scheduler** gives every approved item, best first, the earliest time that is:

- inside its network's hours, in its time zone;
- at least its network's spacing after any other item there;
- at least ten minutes from any upload anywhere;
- within its network's daily cap for the phase.

## 3. The approval page (`approval.js`)

The owner's view, in Spanish (`setup.md` §6). It shows a card per item: the video with its cover and captions, the
title and text (editable, with a character count against the network's limit), the links, the compliance verdict
(with each rule's message when held), the time it would go out, the contact sheet and the full description. Its
buttons are approve, reject (with a reason), save changes, "schedule what is approved", and the settings (each
network's mode and the time zone).

**Safe by construction:**

- It listens on 127.0.0.1 only and answers only its own Host, against DNS rebinding.
- Every change is a JSON POST carrying the page's random token in a header, and an Origin, when sent, must be the
  page's own. A form on another site can send neither.
- Strict content policy: no outside requests, and scripts only by nonce.
- Media are served only from the paths the item names, inside the folders the page was given, with the extensions a
  preview needs. Video supports range requests.
- No credential passes through it. It cannot switch off the dry run or switch a network live: those settings are not
  editable from the page.
- The owner's approval or rejection is also written to the compliance register as his review, when the real module is
  there. The real `checkClip` requires that review for anything with a recreation.

## 4. The publisher (`publisher.js`)

Each round first re-checks everything waiting (§4.1), then schedules what is approved. Then, for each item whose time
has come:

1. **The ledger** (above).
2. **The compliance gate**, again, at the moment of publishing (`compliance.preflight`). It gets the clip's episode,
   its recording's report, its range, its frame (vertical: 216 × 384 at 5x), the flags its adapter will actually send
   (`aiFlags`), its text, its publish time and the register. Any violation holds the item and sends nothing.
   A text post is checked as the network will show it: its text is the adapter's own `postText(item)` (Telegram's
   HTML with the tags stripped, the others' text as it is), and it carries its `sourceTexts` (the titles and summaries
   of the stories it tells, plus the article when the compliance desk's cache has it), so the verbatim rule (no run of
   12 copied words, no more than 20 % copied, an attributed quotation exempt) is checked on the words that would go
   out. The posts writer checks the same rule upstream (`posts.js`), so a copied line is dropped before it is written,
   and the gate is the second lock.
   A clip carries its stories' aired words twice, in the voice and in the burned-in captions, so its gate is given
   their sources too (`clipGetStory(item.source.storyIds, archiveGetStory({ dataDir }))`: the clip's own stories only,
   not the rest of its episode). The factory, the upload and the publisher all pass it, and a clip whose words copy is
   held (`verbatim`). Until the writer composes its own sentences (`verbatim.md` §5), that is most news clips.
3. **The C2PA mark.** `compliance.markFile` signs a copy beside the clip (`.c2pa.mp4`), never the clip itself, whose
   hash stays its identity in the ledger. The real module's `readMark` then reads it back. An unmarked file is never
   sent live: it is held. The signed copy is what gets uploaded.
4. **The adapter** (`platforms.md`): a dry run unless every switch is on.
5. **The record.** The ledger (real or dry), the outbox (`outbox.jsonl`: what was sent or would have been, with
   secrets redacted, and which switch was off), and the item's status. A retryable failure goes back to the schedule,
   three times at most.

### 4.1 The re-check of what waits (`recheck.js`, `tools/publish/recheck.mjs`)

A clip, an upload or a post can wait days in the queue while the rules move under it. A takedown may arrive in the
compliance register, a story may be withdrawn, a person may ask not to be re-staged. A picture's licence may be read
again (`server/rights.js` `rejudge`). The article cache (`verbatim.md` §4) may now hold the article a post's line must
be measured against. An election period may begin.

Before each round, the publisher runs the gate again on every item that is pending, approved or scheduled
(`Publisher.recheck()`, at the start of `run()` and of `tools/publish/run.mjs`). It runs against:
- the current rules;
- the register as it is now, on the item's own stories too (`storyIds`). Before round 5 the gate read only the
  episode's story list, which a quiz episode does not have, so a takedown of a story did not hold the quiz clips made
  from it. The factory, the posts and the upload now give the gate the register too;
- the archive and its articles as they are now;
- each picture's rights record judged again under today's licence terms (`refreshRights`). A record is never cleared
  by judging it again if it was not cleared before.

What no longer passes is **held**. Its slot is given back, and its history says `held` by `recheck` and what its status
was. The approval page shows it as *Retenido al revisarlo otra vez antes de publicar (algo cambió mientras esperaba)*,
with each reason in Spanish (`RULE_ES`) and the desk's English message under it. A held item is never approved over.
An item the re-check held that passes again (the complaint was closed) goes back to the owner as **pending**, never
straight out. `node tools/publish/recheck.mjs [--queue …] [--data …] [--at …] [--json]` runs it by hand and prints the
reasons in Spanish. It never schedules, publishes or sends anything.

**One publisher at a time.** A round takes `data/publish/publisher.lock`, which holds its process id. Without it, a round
started by hand while the scheduled one runs would race it to the same items. A second round is refused while that
process lives. A lock left by a process that has gone is taken over. The lock is released when the round ends, even on
an error.

**Rehearsed on 17 Oct 2026** (`tools/publish/run.mjs --at … --all-due` on a copy of the batch's queue): 39 approved
clips were dry-published over five days. YouTube, TikTok and Instagram each kept their hours, spacing and daily cap,
with ten minutes between any two uploads. Each entry in the outbox lists the switches that were off, and none carries a
secret.

**A live publish needs all of these** (`liveBlockers`):

- `PUBLISH_LIVE=1`
- `settings.dryRun` set to false
- the network switched on in `settings.live`
- the real compliance module, never the stub
- the owner's approval in the item's history (or its mode's, in Phase 3)
- the network's credentials

## 5. Compliance (`compliance.js`, `compliance-stub.js`)

The publishing desk's only door to the compliance desk (`server/compliance/`, contract in `compliance.md` §8):
`disclosureFor`, `creditsFor`, `describe`, `textPost`, `checkClip`, `preflight`, `buildManifest`, `markFile`,
`register` and `recordReview`.

- **The stub.** While `server/compliance/index.js` is absent, a clearly marked stub stands in. It has the same names
  and shapes, and takes the safe side of every rule: it refuses demo data, cuts inside sentences and quotes, a
  recreation without its provenance or its label in every frame, missing flags and election periods. Its `markFile`
  only writes a sidecar and returns `ok: false`, so on the stub nothing can go live.
- **The real module** is loaded whenever it is there. A real module that fails to load is an error, never a silent
  fallback.
- **The contract tests** (`test/publish-compliance.test.js`) run the same assertions against whichever module is
  loaded, and against the stub. On 17 Oct 2026 they also passed against the compliance desk's module in its own
  branch.
- **The verbatim rule fails closed** (round 6). The door's `preflight` adds `sources-missing` for every story an item
  tells (a clip's own stories; every story of a whole programme) whose sources the archive does not hold: its words
  cannot be shown not to copy them. The compliance desk's lint counts such a story as "unverified" and lets it pass
  unless asked to be strict; the publishing desk never publishes it. The factory, the upload, the publisher and its
  re-check all go through this door.

## 6. The live supervisor (`live.js`)

It keeps `tools/stream.mjs` up.

- **Restarts.** It restarts the stream when it ends, waiting 2, 5, 15, 30 and then 60 s between quick failures. Five
  healthy minutes reset the wait.
- **Health.** The streamer's "N KB/s from the page" line must come at least every 45 s and stay at 8 KB/s or more, and
  a test file must keep growing. Otherwise the supervisor stops its own child process (SIGTERM, then SIGKILL) and
  starts it again.
- **The channel server.** Before every start it checks that the server answers (`/api/schedule`). While it does not,
  the supervisor waits.
- **Too many restarts.** More than 12 in an hour pause it for ten minutes, and the status file says so.
- **The title.** It follows the programme on air ("GLOBIT 24 LIVE · Now: COSMOS DESK · pixel-art news 24/7"). The
  description says what is on, what comes next and how the channel is made. The title changes at most every 20
  minutes and 60 times a day, through the YouTube adapter's `videos.update` (50 quota units). In a dry run the update
  is written to `outbox-live.jsonl` and nothing is sent.
- **Status.** `data/publish/live-status.json` records the state, pid, run, restarts in the last hour, the last rate,
  the title and the last error.

**Tested into files only.** On 17 Oct 2026 it ran against a local playback server. The stream's renderer was killed
by hand to fake a page crash: the streamer exited with code 2, the supervisor started run 2 within 2 s, the dry-run
title went to the outbox, and both runs' files played (1920 × 1080 H.264 + AAC). Streaming to a server is refused
unless `PUBLISH_LIVE=1`.

Under pre-rendered playout (`playout.md`) the stream is `tools/playout/air.mjs`, not `tools/stream.mjs`: it uses the
same supervisor class in `recorded` mode for the title and description (no LIVE: "GLOBIT 24 · Now: … · pixel-art news
24/7"), with the same rate limits and dry-run rules, fed by what the playout has on air rather than by the station's
schedule (which runs an hour ahead).

## 7. Files in `data/publish/`

| File | What it is |
|---|---|
| `queue/<id>.json` | The items |
| `settings.json` | The phase, the dry-run switch, the modes, the time zones, the live switches |
| `ledger.jsonl` | What was published |
| `ledger-dry.jsonl` | What a dry run would have published |
| `outbox.jsonl` | Every publish attempt, redacted |
| `outbox-live.jsonl` | The live title's updates |
| `live-status.json` | The supervisor's status |
| `publisher.lock` | The running publisher's process id, while a round runs |
| `posts/` | The day's posts (the `posts.mjs` default) |
| `factory/<day>/` | The beta's pieces of the day (`beta.mjs hacer`): its episodes, clips, cards and posts, inside the page's media root |

## 8. Hand publishing: the beta (`PUBLISH_MODE=manual`; `mode.js`, `manual.js`; the owner's guide: `beta.md`)

The networks' API audits take days or weeks: an unaudited YouTube API project's uploads are locked private, and
TikTok's Content Posting API posts privately until the app is audited (`platforms.md`). So the beta is published by
hand, from the approval page, with every rule of the pipeline still in force.

**What the mode changes.**

- **No adapter reaches a network.** `Adapter.publish()` only describes the requests, whatever the switches and the
  credentials, and `Adapter.request()`, the one door every live call goes through (the live title's `videos.update`
  too), refuses. `liveBlockers` names the mode first.
- **The publisher's round only re-checks** (`Publisher.run()`, `tools/publish/run.mjs`): nothing is scheduled, and
  nothing is published or dry-run (a dry run would mark an item published and take it off the owner's page).
- **The live supervisor never streams** (`tools/publish/live.mjs` refuses `--rtmp`; a test into files is allowed).
- **The page offers the day's pick** (`dailyPick`): per network, its best waiting items, up to the lower end of the
  phase's daily range less what was published there today (Phase 1: 3 YouTube Shorts, 3 TikToks, 2 Reels; a text post
  network 2), never a compliance refusal, never anything grave in Phase 1, never what the ledger holds. About 15
  minutes of review (`plan.md` §2), plus the uploads by hand. The rest waits in *Por aprobar*. "Programar lo aprobado"
  is gone.

**For each approved item** (`manual.js`):

1. **Preparar para publicar** (`POST /api/prepare`). The item's files are signed into copies beside them
   (`<name>.<item id>.c2pa.mp4`, and its cover `.c2pa.jpg`: `compliance.markFile`), and the gate runs again on what
   will go out: the signed files (read back: `unmarked` otherwise), the words the owner will paste, the flags he will
   set, the register and the stories' sources as they are now. What fails is **held**, by `recheck`, with its reasons
   in Spanish, and goes back to *Por aprobar* if it passes again later; its copies are removed. What passes is handed
   out for six hours (`PREPARED_TTL`); after that, or after an edit, it is prepared again.
2. **Descargar**: the signed video (vertical for Shorts, TikTok and Reels; horizontal for a whole programme) and the
   signed cover, as attachments (`GET /download/<id>/video|cover`), only while the package is fresh.
3. **Copiar** (`manualTexts`), exactly the words the gate measured:
   - YouTube: the title, the description (the disclosure first, the programme, the sources, the credits, the channel
     statement and who answers for the channel as `EDITORIAL_CONTACT` says now) and the hashtags;
   - TikTok, Instagram: the caption, its first line the AI disclosure, then the lead, the source and a line of credits;
     and the hashtags;
   - a text post: its text as the network shows it ("AI-generated:" first), and the article's link (Telegram's message
     shows its links as labels, so by hand the address goes under the text).
4. **The network's own switches** (`checklistFor`), ticked one by one: YouTube "altered or synthetic content" yes and
   "made for kids" no; TikTok's "AI-generated content" label on, the privacy, no branded content; Instagram's "AI info"
   label; Facebook's label by hand. The wording quoted is the networks' own as read for `compliance.md` §2.5–2.7; the
   apps' Spanish labels were not read, so each switch is described by what it does.
5. **Ya lo he publicado** (`POST /api/published`, `recordManual`), with the post's address if he has it (https, on the
   network's own host), once every switch is ticked. The item becomes `published` (`result.manual`), the real ledger
   records it (nothing twice: the same moment, the same video bytes or the same story there within a day is refused
   from then on), and the compliance register records the publication (`recordPublication`: the network, the address,
   the stories, the outlets, the switches ticked, the C2PA files), so a takedown finds it (`compliance.md` §7).

**The beta's day** (`tools/publish/beta.mjs hacer`, at low priority, each step timed):

1. **The news, with the AI writer** (`server/publish/newsday.js`), when the provider chain has one (the owner's key:
   `PROVIDERS=anthropic,mock`, `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL`; the Codex CLI counts only when installed). The day's news programmes
   are made fresh from the live feeds through the channel's own producer (the write, the own-words check and its
   rewrites, the standards editor, the fit, the voices), as `tools/writer/try.mjs` makes them. Which and how many:
   `--noticias` or `BETA_NEWS` (Phase 1's light news by default: COSMOS DESK, TECH BYTES, FULL TIME when the day has
   results) and `--ediciones` (1 each). Each told story is recorded, with the article the desk read, in the day's own
   sources folder (`factory/<day>/sources/archive`, `…/compliance/articles`), never in the station's archive. An
   edition the AI did not write (it fell back to the offline writer) is reported and not recorded. Without an AI
   writer, `hacer` says plainly, in Spanish, that the news needs the key, and goes on with the quiz.
   **Pictures, as on air** (`docs/pictures/RIGHTS.md`). The rights desk (`server/picturedesk.js`) decides each
   candidate's cleared picture within `--fotos-segundos` (120 a programme), from what it keeps and from Wikimedia,
   paced. Its store is the beta's own (`data/publish/pictures/answers.json`, kept across days), seeded at each run from
   the station's decisions ahead of air (`data/pictures/answers.json`, only read: two processes never write one file),
   so most decisions are ready at once. The producer verifies each picture through the image cache and puts its rights
   record and credit on the episode, exactly as on air. The files go to `factory/<day>/pictures/<storyId>.<ext>` for the
   recorder (`factory.mjs --pictures`). The factory refuses a moment that shows a picture without a cleared record
   (`markUncleared`), "Preparar" and the re-check refuse it too (`rights-missing`), the description credits it, and the
   vertical clip draws its credit (`drawVerticalCredit`). An outlet's own photo is never shown: only
   `PICTURE_RIGHTS=preview` would, and nothing of a preview is ever queued. `--fotos no`: maps and boards.
   `beta.mjs fotos` decides the day's candidates' pictures from the live feeds without the writer or the key, and
   says how many got one (a dry run: nothing made).
2. **PAY ATTENTION**, remade from the archive with its voices (`material.mjs`: at the day's hours it airs, latest first,
   until the quiz desk plans an edition).
3. **The clips** in vertical (`factory.mjs`, under `factory/<day>/`; the news with `--sources` that folder). A
   programme the offline writer wrote is skipped (`offline-writer`, `verbatim.md` §7). **A rendered master** (the
   pre-rendered playout another desk is building) is used when one exists (`server/publish/masters.js`:
   `<root>/<episode id>/vertical.mkv` and `vertical.report.json`, the recorder's report at 30 fps, under
   `RENDERED_MASTERS` or `--masters-from`): it is linked where the factory keeps a master, and cut instead of recorded.
   An item made with `--sources` keeps that folder (`gate.sourcesDir`), and every later check measures it there too:
   the re-check, the publisher and the page's "Preparar" (`compliance.sourcesForItem`).
   **Nothing under 10 seconds** is published (`moments.js` `CLIP_MIN_SECONDS`, YouTube's and TikTok's minimum; the
   day's pick leaves out a shorter clip queued before the floor).
4. **The posts** for the networks set to *Manual* (`posts.mjs --data` the day's sources folder when the AI wrote the
   news): a post carries an aired line only when the line passes the verbatim rule against the article.

Then what the day offers and why the rest is held. `estado` prints only that. With no argument `beta.mjs` re-checks
everything waiting and opens the page in hand publishing.
