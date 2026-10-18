# The publishing plan: networks, frequency, formats, phases

GLOBIT 24 airs around the clock. This plan covers what it publishes beyond the live stream, and when. The owner asked
for clips, the live stream, and text posts that link to the outlets. Everything the channel publishes must be useful:
a clip that makes sense alone, a post that says what is new and sends the reader to the source.

Every programme can feed four things:

1. **The live stream**, always.
2. **A full upload**, when the programme is worth one (`uploads.js` `worthUploading`).
3. **Clips** of its best moments.
4. **Text posts** on its most-told stories.

The machinery is in `pipeline.md`, the clip rules in `clips.md`, the picture in `vertical.md`, and the networks' facts in
`platforms.md`.

## 1. The rules every piece keeps

- **Only what aired.**
  - A clip is the programme's own picture and sound, cut on sentence boundaries, never inside a quote.
  - A post's headline is the outlet's own (the archive's title). Its line of news is a whole sentence the channel said.
    Nothing is rewritten, and no opinion is added.
- **Disclosed as AI-made, every time.**
  - Each upload's AI field is set (YouTube `containsSyntheticMedia`, TikTok `is_aigc`, Instagram `is_ai_generated`;
    Facebook and Threads by hand), and the gate holds a video without it.
  - Every clip's caption opens with the AI disclosure, and its end card says AI-PRODUCED NEWS · PRESENTERS ARE AI
    CHARACTERS · FACTS FROM CREDITED SOURCES in the channel ident's design. A whole programme opens on the ident. Nothing
    stands over a programme or a clip's first seconds, and no AI plate beside the bug (owner, 18 Oct: `compliance.md`
    §2.10, §3.2).
  - Every text post opens "AI-generated:".
  - The compliance desk's `checkClip` and `preflight` refuse anything that misses a rule. A refused item is held and
    never published.
- **The source credited and linked.** Each clip's text names the outlet and links its article where the network
  allows a link. Each text post links the article itself, so the credit and the traffic go to the source.
- **Grave news is treated as grave.**
  - No emoji, no joke and no lit caption word on a grave story.
  - In Phase 1 nothing grave is published at all.
  - In every phase a grave item waits for the owner, whatever the mode.
- **Nothing twice.** The ledger refuses the same moment to the same network, the same video bytes, and the same story
  on the same network within 24 hours.
- **Dry run until the owner says otherwise.** Publishing for real needs five switches, all on (`setup.md` §7).

## 2. Phase 1 (the first 30 days): light programmes only

A new channel earns trust with what cannot hurt anyone. Phase 1 publishes moments from:

- PAY ATTENTION (the quiz)
- WORLD WEATHER (the boards, never the demo forecast)
- FULL TIME (results)
- COSMOS DESK and TECH BYTES (their light stories, UNIT-8)
- PRESS START

Within those programmes, a story of a kind the quiz desk refuses as a game is not light either. That covers harm,
disaster, crime, conflict, children, politics, health and people's money (`server/quiz/desk.js` `excludedKind`), and
anything grave by the channel's own measure (`server/facts.js` `severity`).

**The owner's day:** about 15 minutes on the approval page (`setup.md` §6). He watches each clip, fixes a title if he
wants, then approves or rejects it. Then he presses "Programar lo aprobado".

**The beta, published by hand** (`beta.md`, `pipeline.md` §8). Until the networks audit the apps (unaudited API uploads
stay private on YouTube and TikTok), Phase 1 runs with `PUBLISH_MODE=manual` and no live stream: the page offers the
day's pick (the lower end of each network's range: 3 Shorts, 3 TikToks, 2 Reels), and for each approved clip the signed
file, its cover, the texts and the network's switches; the owner uploads it himself and says so on the page.

## 3. The networks and how often (`platforms.js` `DAILY`, `PHASE_PLATFORMS`)

Each network has its own hours (in the audience's time zone, London by default), its own spacing between posts and a
daily cap. On top of that, no two uploads go out anywhere within ten minutes of each other. The scheduler
(`queue.js` `schedule`) keeps all of it, best-scored first.

| Network | Phase 1 | Phase 2 (months 2–3) | Phase 3 (months 4–12) | Format | Hours, spacing |
|---|---|---|---|---|---|
| YouTube | 24/7 live; 3–5 Shorts a day | + 1–2 full programmes a day, SEVEN DAYS weekly | 4–6 Shorts, 1–3 programmes | Shorts 9:16 up to 3 min; programmes 16:9 | 08–22, 2 h |
| TikTok | 3–5 a day, some over 1 minute | the same | 4–6 | 9:16, ideally 61–150 s | 09–22, 3 h |
| Instagram | 2–3 Reels a day | the same | 3–4 | 9:16 up to 90 s | 09–21, 4 h |
| Facebook | — | 1–2 Reels, 2–4 posts | 2–3 Reels, 3–5 posts | Reels 3–90 s; text with a link | 08–22, 4 h |
| X | — | 3–6 posts | 4–8 | text ≤ 280 with the link (a link costs $0.20) | 07–23, 1.5 h |
| Threads | — | — | 4–8 posts | text ≤ 500, link card | 07–23, 1.5 h |
| Bluesky | — | — | 4–8 posts | text ≤ 300 graphemes, link card | 07–23, 1.5 h |
| Telegram | — | — | 6–12 posts | HTML: the headline bold, the line, the link | 07–23, 1 h |

**Phase 2** adds Facebook and X, the best full programmes on YouTube, the weekly SEVEN DAYS, and hard news gradually:
first the news programmes' light and explainer moments, then their leads, never a grave one without the owner.

**Phase 3** turns on automated publishing with sample review (`sample` mode: one item in five waits for the owner),
15–30 pieces a day, and community features and sponsors. The automatic modes are refused before Phase 3 (`queue.js`
`saveSettings`).

## 4. Text posts

The day's most-told stories each get one post per network: the most airings, leads counting double, breaking news
first (`posts.js` `dayStories`). Each post has:

**Every word is the channel's own, or the outlet's cited** (`wording.js`; the compliance desk's verbatim rule,
`verbatim.md`: no run of more than 12 words copied from the story's sources, at most 20 % of the words copied).

1. "AI-generated:"
2. **The post's own headline:** the channel's aired headline when it passes the rule against the story's sources, else
   the channel's label of the story, made from its facts: its kicker and its place ("Wildfire · California, USA"),
   each only when the story's own title and summary bear it out. On 17 Oct the channel's kicker and map said VOLCANO
   for black-hole "eruptions" and JUSTICE · USA for a trial in Mexico: such a label is left out, and the citation
   speaks alone.
3. **One line of what is new**, only when the article itself is at hand to check it against
   (`data/compliance/articles`, the compliance desk's audit cache) and it passes the rule. The channel's aired text is
   largely the outlet's: the compliance desk measured it, so an aired sentence checked against the title and summary
   alone could still be the article's own. With the article, the line is the aired sentence most about the headline's
   subject that says something new: a figure, a time, a name the headline does not have, or an event reported, never
   background ("he has started companies of his own"). It is whole, under 200 characters, with no pronoun before a
   name, no clause that needs another, no time that points back ("At the time…"), no set-up for a quote the post will
   not carry ("here is how she put it"), no adjective of opinion, and no trailing attribution.
4. **The credit beside the article's link:** "via NPR Science" when the headline is the channel's own; else the
   outlet's headline as an attributed citation ('BBC Science: “Evacuation orders as fast-moving California wildfire
   burns homes”'), whole and in quotation marks. A link carries no tracking parameters (`utm_*`, `at_*`, `fbclid`,
   `gclid` and the like); everything else in it is kept.
5. Our clip's link, when the clip is published and the post has room.

The compliance desk's `preflight` measures every post as its network will show it (Telegram composes its message from
the title and the links) against the story's sources, and holds one that copies.

No emoji, ever, and no joke. A grave story's post waits for the owner whatever the mode. A story is grave when:

- it was read sad on air (the archive's `grave`, which means only that);
- or its words are grave (`facts.js` `severity` 2 or more: deaths, harm, illness), in their grave sense: money
  "sunk" into a gym chain and "cancer-fighting" cells are not (`facts.js` lookalikes, with the channel's others);
- or it is a named person's illness;
- or it names a death in other words ("deadly", "fatal", "lethal": "Russian man linked to deadly London hospitals
  hack arrested").

The archive's `grave: false` does not mean the channel judged a story light: every story read "serious" archives
that way, a pope's cancer among them. On X, a link costs $0.20 a post, so X takes the day's top 3–8 stories only. A
day's posts are made with `tools/publish/posts.mjs --day`.

## 5. Full programmes on YouTube (Phase 2)

A programme is uploaded whole when it runs at least 2.5 minutes, is not the demo forecast, has every voice recorded,
and is not NEWS IN 60 (that one is a clip already).

- **The title:** the programme and its first two stories ("COSMOS DESK: Barn owls…, Arctic sea ice… and more · 17 Oct"),
  at most 100 characters.
- **The description**, at most 5,000 bytes:
  - the compliance desk's disclosure first;
  - what the edition covers;
  - chapters from the aired timeline (0:00 first, at least three, each at least ten seconds, as YouTube requires);
  - every source with its article;
  - the credits.
- **The thumbnail:** one of the programme's own frames, from a clean plate: the presenter's first close shot in the
  first story, with the programme's name and its lead in the channel's type on the side away from her (`vertical.md`
  §6).

All of this is made with `tools/publish/upload.mjs`. An upload made before Phase 2 is queued later without a new render:
`--video <its .mp4> --report <its master's report>`.

## 6. What a programme feeds

| Programme | Live | Full upload | Clips | Posts |
|---|---|---|---|---|
| PAY ATTENTION | yes | Phase 2 (weekly) | every question, frame to reveal; a whole round (over a minute, for TikTok) | — |
| WORLD WEATHER | yes | Phase 2 | HOT AND COLD, THE NEXT THREE DAYS, the warning (grave) | — |
| FULL TIME | yes | Phase 2 | results with their score card, the SCORE CENTRE | — |
| COSMOS DESK, TECH BYTES, PRESS START | yes | Phase 2 | light stories, runs of 2–4 light stories (25–75 s), UNIT-8 with the story it answers, NUMBER OF THE DAY | their stories (Phase 2+) |
| WORLD NOW, MONEY MINUTE | yes | Phase 2 | (Phase 2+) the montage, the lead with its board, WHAT WE KNOW, the expert's answer, NUMBER OF THE DAY | the day's top stories |
| SEVEN DAYS | yes | weekly (Phase 2) | THE WEEK IN 60 SECONDS | — |
| NEWS IN 60 | yes | no | — | its stories |

## 7. What to watch in the first 30 days

Track, for each network:

- 2-second hold (the share of views past the hook)
- average view duration against the clip's length
- completions and shares
- follows per 1,000 views
- comments that report a mistake. Each one goes to the compliance register as a correction (`compliance.md`).

A kind of moment that holds viewers gets more slots, and one that loses them gets fewer: the scheduler sorts by
`score`, and the scores' weights (`moments.js` `KIND_BASE`) are where that learning goes.
