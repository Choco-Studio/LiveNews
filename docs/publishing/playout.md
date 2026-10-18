# Pre-rendered playout: everything made ahead, aired from files

Written 17 October 2026, for the owner's server session and for whoever works on the stream next.

**Why.** Live, the channel renders in a headless browser in real time, its voices are made close to air and ffmpeg
encodes on the fly. On the owner's server (2 fast cores, 4 GB) the 24-hour 720p test held at only 1.05x encoder speed:
the voices take almost a core, the browser and the encoder the rest. The owner's decision: **make everything ahead and
air what is already made, about an hour ahead.** Nobody minds the news being an hour old.

**What it is.** Three processes:

| Process | Command | What it does |
| --- | --- | --- |
| The station | `tools/playout/station.mjs` | `server/index.js` as ever (feeds, writers, voices, the schedule), but in PLAYOUT mode and on the **air clock** |
| The renderer | `tools/playout/render.mjs` | Plays the viewer's part about an hour ahead: renders each item to a finished file at its **air time**, checks it, queues it |
| The playout | `tools/playout/air.mjs` | Airs the queued files back to back through **one** long-lived ffmpeg; filler when the queue runs dry |

`tools/playout/run.mjs` starts all three and starts any of them again if it stops. Files only by default; RTMP stays
behind `PUBLISH_LIVE=1` and the publisher's dry-run rules, unchanged. Live mode is untouched: without `PLAYOUT=1` the
station, the page and the live supervisor behave exactly as before.

## 1. The flow

```
 station (air clock)            renderer (real clock)                       playout (real clock)
 ────────────────────           ─────────────────────                       ────────────────────
 feeds → writer → GATE ─┐       wait until a programme is ready
 (held: data/playout/   │       choose its air time (frontier, or later)
  held/, no voices)     │       GET /api/next?air=<t> ─────────► break / episode
 voices (all of them)   │       fresh page, fake clock = air time
 queue (2 ready) ◄──────┘       render every frame + sound → segment.mkv
                                GATE again, with the recording ──► held: next unit, same air time
                                queue/<airtime>-<id>.json ─────────────────► at its time: video copied,
                                masters/<ep id>/ (clip master)                          sound → AAC once
                                                                            nothing at its time: filler card
```

A **unit** is a break and the programme it promotes ("UP NEXT"), or a programme alone. The gate passes or holds them
together, so no break ever promotes something that does not air.

## 2. The air clock (`server/playout/clock.js`)

The station lives at the time its programmes **air**. The renderer tells it what time that is: with every request for
the next item (`/api/next?air=<ms>`) and every two seconds of rendered air (`POST /api/playout/clock?t=<ms>`, loopback
only). Between two words the clock runs on at real speed for at most `PLAYOUT_CLOCK_CAP_S` (60 s), so a production
budget measured on the clock still runs out while the renderer waits, and the clock never wanders far from the moment
being rendered while the renderer is idle. `tools/playout/station.mjs` installs it as the process's `Date` before the
server loads: the 137 places that read the time read the air time.

What reads right for the moment of air because of it:

- **The words.** The writer's greeting ("good evening" at 20:10, "good morning" at 08:40, "hello" within half an hour
  of a boundary), the daypart rule ("this morning" only near the morning), the sport desk's "last night" and its
  results by the day, the weather's hours (the forecast's "now" is the air hour), what the weekly calls "this morning".
- **The schedule.** NEWS IN 60 on its :00 and :30 marks, the dayparts that leave MONEY MINUTE out at night and at the
  weekend, the break's countdown clock before a pinned programme: the station plans them on the air clock exactly as
  it does live on the real one.
- **The picture.** The renderer sets the page's own clock (the recorder's fake clock) to the item's air time: the
  on-screen London clock, the studio's sky over WORLD NOW, the standby card, everything the page reads from `Date`.
- **STILL TO COME, UP NEXT, "after the break".** They name what follows in the same rendered sequence, so they are
  true by construction: the station only hands the renderer a break once the programme it promotes is finished
  (`Station.nextReady`), and the gate holds a break with its programme.

Like the live channel, the station keeps two programmes ready, so a programme's words are written for the air clock
a few minutes before it airs; the writer's "hello" near a boundary covers that, as live.

## 3. The check before air (`server/playout/gate.js`)

Every programme passes the compliance desk's `preflight` (`server/compliance/`, through `server/publish/compliance.js`)
as the stream's own output (`kind: 'live'`, compliance.md §1's first column): **rights** (a picture without its rights
record, demo or fixture material), **verbatim** (the outlet's sentences copied), **disclosure** (the AI notice at the programme's start and every ten minutes, the ident)
and **recreations** (the label in frame, the owner's review, election holds), plus the register (a story withdrawn, a
person who asked to be left out) and the **no-LIVE rule** (§5). Twice:

1. **When the station makes it**, on the finished words and before the voices (`Producer` stage `gate`): a programme
   that fails costs no voice time, is never queued, and the station makes the next one in its place.
2. **When the renderer has rendered it**, with the recording's report (the timeline of what aired): the recreation
   labels and the AI notice checked against it (compliance.md §3.1: a programme whose recording shows no notice in its
   first 30 s, or goes 12 minutes without one, is held). A unit that fails is held and the renderer renders the **next unit for
   the same air time**: the hole is filled by programming, and no clock on screen is wrong.

What fails is kept in `data/playout/held/<airtime>-<id>.json` with its reasons, logged in `events.jsonl`, and shown on
the approval page (`tools/publish/approve.mjs`, tab **Retenidos del aire**, in Spanish, read only: nothing there can put
a held programme on air).

Rules about uploads, not the picture, are reported as `skipped` and do not hold: `editorial-contact-missing` (the
stream's description and every upload name who answers), `flag-missing` / `flag-unavailable` (the synthetic-media flag
is set once on the broadcast, compliance.md §2.5) and `unmarked` (C2PA cannot survive RTMP ingest, §4).

**Two switches, strict by default:** `PLAYOUT_VERBATIM=block|warn` and `PLAYOUT_REVIEW=1|0` (a recreation needs the
owner's review before air: `register.recordReview`). Relaxed for a test, the station still logs what the strict check
would have held (`strict-would-hold` in `events.jsonl`).

> **What this means today.** The offline fallback writer copies: 95 % of the last 300 aired stories break the verbatim
> rule (`archiveSample`, 17 Oct), and the compliance desk now refuses anything it wrote outright (rule `offline-writer`,
> verbatim.md §7). Under the strict gate, with no AI writer answering, every news programme is held and the channel
> airs WORLD WEATHER, SEVEN DAYS and filler. That is the rule doing its job; with the AI writer that composes in the
> channel's own words (the beta's writer, `server/ownwords.js`) news programmes can pass it. For a test without an AI
> key, `PLAYOUT_VERBATIM=warn` airs them as the live channel does today, with every verdict logged (the offline-writer
> and verbatim rules both become warnings). The same for recreations: with nobody reviewing an hour ahead,
> `PLAYOUT_REVIEW=1` holds every programme with an IN THEIR WORDS piece; `RESTAGE=0` makes programmes without them.
> The beta's `PUBLISH_MODE=manual` keeps the stream off: the playout refuses `--rtmp` then, as the live supervisor does.

## 4. The playout (`tools/playout/air.mjs`, `server/playout/queue.js`, `server/playout/encode.js`)

- **One ffmpeg, video copied.** Every file the renderer makes has the same H.264 settings (`encode.js`: High profile,
  the level for the size, 30 fps, a closed GOP of 2 s, no B-frames, SPS/PPS before every IDR, an access unit
  delimiter before every frame) and starts on an IDR frame. The playout extracts each file's video as raw Annex B and
  writes it, byte after byte, into the long-lived ffmpeg's video pipe (`-c:v copy`).
- **The sound encoded once.** Each file carries its sound as FLAC, exactly 1600 samples a frame (48 kHz at 30 fps). The
  playout decodes it to PCM into the audio pipe and the long-lived ffmpeg encodes AAC continuously: no AAC priming or
  padding at the joins, no gap, no drift between picture and sound, however many files.
- **Paced.** Both inputs are read at real time (`-re`); the playhead (the air time of the next frame written) runs at
  most a few seconds ahead of the clock.
- **On time, or not at all.** A file airs when the playhead reaches its air time. One whose time has passed by more than
  2 s is dropped (`drop` in the log): aired late, its clock would lie and push every later file off its time.
- **Never black.** A gap before the next file is filled up to its time with the **filler card** (BACK SHORTLY · GLOBIT
  24 · NEWS 24 HOURS A DAY, the channel's test card without a clock, drawn by the channel's own code) under a quiet
  bed, encoded on the spot with the programmes' settings; nothing queued at all is filler two seconds at a time, logged
  as an **underrun** (`underrun` and `underrun-end` with its length). The schedule is joined again at the next file's
  air time, which is the next programme boundary.
- **The join looks like a cut on air.** Each item opens on the channel stinger; the renderer hands its page the last
  frame of what airs before it (or the filler card after a gap), held under the stinger's first half, so the file
  boundary falls where the live channel would cut. A programme's end card into the filler card is a plain cut, the
  bed fading in under it. `tools/playout/joins.mjs` draws the frames around each join from the playout's own output
  and the sound's level across it.
- **Output.** `--out file` (`.ts`, `.flv`, `.mkv`, `.mp4`; `{n}` numbers restarts), `--segment <s>` for one file per
  period (a 24-hour test keeps hours, not one 30 GB file). RTMP: `--rtmp <server> --key-env <VAR>`, refused unless
  `PUBLISH_LIVE=1`. If the encoder dies (an RTMP drop), a new one starts and the schedule is joined at the next
  programme's time.

## 5. No false LIVE

Anything pre-recorded never says LIVE. In PLAYOUT mode the station tells the page (`/api/channel` → `airMode:
'recorded'`), and `public/js/airmode.js` decides every label:

| Where | Live channel | Pre-rendered playout |
| --- | --- | --- |
| Top row tag (`graphics/bug.js`; the opens' lock-up, `opens/kit.js`) | LIVE, red pip | **24/7**, silver, no pip (REPLAY stays REPLAY) |
| End card (`director.js`, `quizdirector.js`) | GLOBIT 24 · LIVE 24 HOURS | GLOBIT 24 · 24 HOURS A DAY |
| Start screen (`scenes/cards.js`) | LIVE • 24 HOURS | NEWS • 24 HOURS |
| Old renderer's idle wall (`set.js`) | LIVE pill | 24/7 pill |
| Browser tab | GLOBIT 24 · Live | GLOBIT 24 · 24/7 |
| YouTube live title (`server/publish/live.js`) | GLOBIT 24 LIVE · Now: … | GLOBIT 24 · Now: … · pixel-art news 24/7 |
| YouTube live description | — | adds "Each programme is produced and checked ahead of time and aired from a recording…" |

The words: the writers' banks, the continuity voice and the ads make no live claim (tested); the correspondents were
already barred from "live from" (correspondents.js). The gate's `false-live` rule holds any pre-recorded programme whose
title, words, headlines, kickers or straps say "we're live", "coming to you live", "live from the studio", "live on
GLOBIT", "this is live" or carry the LIVE label (`falseLive`). The word "live" itself is left alone ("people who live
there", an outlet's live page, a launch's live stream).

Compliance and YouTube: the YouTube adapter's `liveUpdate` and the broadcast's disclosure are the same in both modes (a
YouTube Live broadcast carrying recorded programmes is still set as "altered or synthetic" on the broadcast,
compliance.md §2.5). Two lines of compliance.md assumed live and are updated: the stream now has a publish check of its
own (§1 table and §9), and the editorial-review exemption is still not relied on (nobody reads the programmes before
air: the gate is automated).

## 6. Reuse: the clip factory and the whole-programme uploads read the masters

Every programme's page also draws its **twin picture** (`?twin=1`, `studio.js`): the same shot under the clip graphics
(`clip/graphics.js`: no clock, no ticker, the AI notice under the bug as on air, clip captions), on a second canvas, captured with
the air picture in the same frame grab. The renderer writes it as the publishing desk's own master format (384x216,
lossless RGB H.264 + FLAC) with its report and the episode as aired, into `data/playout/masters/<episode id>/`, as the
publishing desk's rendered-master hook reads it (`server/publish/masters.js`, `pipeline.md` §8):

```
horizontal.mkv   horizontal.report.json   episode.json (airedAt = its air time)   unit.json
```

- `node tools/publish/factory.mjs --from-playout data/playout/masters/<episode id> --out <dir>` cuts the horizontal
  clips from that master: nothing is recorded again (with `--episode`, `RENDERED_MASTERS=data/playout/masters` does
  the same). The vertical picture (9:16) is a different composition (the stage framed again, the vertical graphics),
  so the factory records it as before; the beta's clips are vertical only (`beta.mjs`), so today they are still
  recorded. When done, the folder gets `factory.json`. An episode aired again keeps its first master once it is cut.
- `node tools/publish/upload.mjs --from-playout data/playout/masters/<episode id> --out <dir>`: the whole programme
  for YouTube, from the same master and report.
- `--no-twin` on the renderer: the air file only (about a tenth less rendering work: 1.09 against 1.19 CPU-s per air
  second on the same programme, §10).

## 7. Breaking news (design note; not built)

An urgent story should still reach air in the next slot, not an hour later:

1. **Detect** as today (`station.refreshNews`: `isBreaking` on a fresh uncovered story), on the real clock.
2. **Make** a short breaking programme at once (a NEWS IN 60 with the story first, `breaking: true`), through the gate
   on its words; its voices are short (about 20 s).
3. **Splice it in at the next unit boundary on air**, not at the end of the buffer: the renderer renders it for the
   boundary's air time (`renderPlan` with a forced air time) and the playout airs it there. Everything already queued
   after that boundary is shifted later by the bulletin's length: the files cannot be moved (their clocks are baked
   in), so the renderer **re-renders** the units after it in order (the station keeps their episodes; their words do
   not change, only their clocks and countdowns), while the playout airs the old ones until each re-render is ready.
   At 2 cores this costs about one unit of re-render per bulletin; the buffer shrinks by the bulletin's length.
4. **Simpler first step:** a breaking caption over the next units (the director's `breaking` flash, which the renderer
   already records when the station emits it) and the full bulletin at the next NEWS IN 60 mark.

## 8. Disk (`server/playout/disk.js`)

The buffer is never touched. After each unit the renderer applies the policy and logs every deletion (`delete`):

| What | Kept | Switch |
| --- | --- | --- |
| An aired (or dropped) air file | `airedHours` after it aired (2 h) | `PLAYOUT_KEEP_AIRED_H` |
| A held unit's air files | `heldHours` (24 h), for a look | `PLAYOUT_KEEP_HELD_H` |
| A programme's master folder | until the clip factory has cut it (`factory.json`) plus an hour, or `masterHours` after it aired (48 h; 0: until cut) | `PLAYOUT_KEEP_MASTER_H` |

Sizes measured here (720p at 3000k): about 1.1 GB an hour of air files (the video rarely reaches its cap; FLAC sound
is about a quarter of it), 0.35 GB an hour of masters (the lossless pixel-art picture is small; most of a master is its
FLAC sound). An hour of buffer, two of tail and a day of uncut masters: about 12 GB; with the factory cutting as it
goes, about 4 GB. The playout's own output (`--out`) is the test's recording, about 1.45 GB an hour: keep what the test
needs and delete the rest (server-setup.md §4b).

## 9. Switches

| Switch | Default | What |
| --- | --- | --- |
| `PLAYOUT=1` | off | The station's playout mode (set by `tools/playout/station.mjs`) |
| `--buffer <min>` / `PLAYOUT_BUFFER_MIN` | 60 | The buffer the renderer keeps |
| `--start-lead <s>` | 900 | A cold start's first air time (filler until then) |
| `--size`, `--bitrate` / `PLAYOUT_SIZE`, `PLAYOUT_BITRATE` | 1280x720, 3000k | The air files (the playout's filler follows them) |
| `--no-twin` | twin on | Skip the clip-mode master |
| `PLAYOUT_VERBATIM` | block | `warn`: copying is logged, not held (a test) |
| `PLAYOUT_REVIEW` | 1 | `0`: recreations air without the owner's review (as live today) |
| `PLAYOUT_WAIT_S` | 900 | How long `/api/next` waits for a programme before the station airs filler ads |
| `PLAYOUT_CLOCK_CAP_S` | 60 | How far the air clock runs on between two words from the renderer |
| `VOICE_BUDGET_S` | 1800 (in playout) | Every voice is made before the programme is queued |
| `KOKORO_THREADS`, `VOICE_MODEL` | 1 thread, fp32 | The voices' CPU (`docs/roadmap/critique/voices-speed.md`): one thread is the cheapest beside the renderer; `fp16` waits for the owner |
| `PLAYOUT_KEEP_AIRED_H`, `PLAYOUT_KEEP_HELD_H`, `PLAYOUT_KEEP_MASTER_H` | 2, 24, 48 | §8 |
| `PLAYOUT_DIR` | data/playout | The queue, segments, masters, held, status and events |
| `PUBLISH_LIVE=1` + `--rtmp` | off | Streaming (setup.md §8), with every live switch for the title updates |

Status: `data/playout/render-status.json` (buffer, speed, units, held, late), `air-status.json` (what is on air, the
playhead, filler and underrun counts), `events.jsonl` (one line per render, gate verdict, air, filler, underrun, drop,
deletion). `tools/playout/measure.mjs` samples CPU and memory per part into a CSV; `tools/playout/report.mjs` sums a run
up (render speed and CPU per air second per programme, the voices' speed, CPU and memory per part, the buffer over time,
filler, underruns, holds, what the strict rules would have held); `tools/playout/joins.mjs` checks the joins.

## 10. Running it on the owner's server

One command (files only):

```
PORT=8790 VOICE_ENGINE=kokoro VOICE_PYTHON=$HOME/globit/venv/bin/python \
  node tools/playout/run.mjs --out data/test24/air/air-%03d.ts --segment 3600 --buffer 60
```

Then the approval page shows what was held, and the factory can cut from the masters. The 24-hour test of this mode
is in `server-setup.md` §4.

### Measured here (17-18 Oct, a 4-core cloud machine shared with other sessions)

95 minutes on real feeds (14 of the feeds answered 403 through this machine's proxy; the others gave about 150
stories), Kokoro voices, the offline writer (no AI key here), 720p at 3000k, the twin on, files only, the station on
port 8790, with `PLAYOUT_VERBATIM=warn PLAYOUT_REVIEW=0` (the strict verdicts logged). The machine was shared: its load
averaged 11 (up to 20) on 4 cores, so speeds swing; CPU seconds per second of air are the numbers that carry over.

- **Render:** 19 items, 57 minutes of air rendered in 52 (1.10x overall, 0.54x to 1.67x an item as the voices
  competed for the cores), **1.10 CPU-s per second of air** (0.97 to 1.30; programmes 1.09, breaks 1.13). Where it
  goes (one NEWS IN 60, measured alone): the browser 0.55 (drawing, the twin, the PNG of each frame), the encoders 0.45
  (720p x264 veryfast 0.32, the twin's lossless master 0.08, the PNG decode), node 0.07. PNG frames beat raw ones
  (raw: 2.06 CPU-s, the base64 of 650 KB a frame); without the twin 1.09 against 1.19; x264 `superfast` saves 0.08 and
  `ultrafast` 0.15 (both cost picture quality at the same bitrate).
- **Voices:** Kokoro made 2,620 s of speech for 10 programmes at 0.31x to 2.0x real time (2.0x when the machine was
  quiet: 203 s of speech in 101 s on three threads, about **1.5 CPU-s per second of speech**). Speech is about 85 % of a
  news programme's air and none of a break's (the adverts' voices are made once).
- **Airing:** the playout and its encoder, **0.06 cores** and 250 MB. Video copied, sound encoded once.
- **Memory:** the renderer's browser up to 1.34 GB (a 9-minute WORLD NOW: its sound lives in the page until the end),
  the voice worker 1.06 GB, the station 0.23 GB, the encoders 0.2 GB: **2.8 GB at most** for everything. No swap.
- **The buffer did not hold** here: it swung between 0 and 11 minutes and never approached the hour. The renderer was
  not the limit (it rendered faster than real time); **the voices were**: the renderer waited 2,602 s for the station
  to finish programmes. The playout aired 19 files at their times (every join within 8 ms of its air time, none late,
  none dropped), and 30 minutes of filler: 6 gaps where the renderer had jumped its frontier ahead and 4 underruns,
  each joined again at the next programme's time.
- **Joins, by eye and by ear** (`tools/playout/joins.mjs`, 24 joins): every programme opens on its stinger sweeping
  over the last frame of what aired before (or the filler card); end card to filler is a clean cut; the sound has no
  hole and no click: each join is the outgoing tail fading, then the stinger's whoosh starting on the join's frame
  (within 20 ms, the AAC encoder's own delay).
- **The air clock on screen:** WORLD NOW's open at 23:44:46 UTC reads NEW YORK 19:44; the break before NEWS IN 60 counts
  down to "NEWS IN 60 AT 01:00", then AT 02:00 an hour later; NEWS IN 60 at 23:59 UTC shows LONDON 00:59 and 24/7 in the
  top row; WORLD WEATHER at 00:13 UTC shows 01:13 to 01:16; the writer greets "good evening" at 00:44 London (its night
  rule). The station placed NEWS IN 60 on the :00 marks of the air clock, as live (its countdown, capped at 90 s, ends
  early when the break runs short of its estimate: the live channel's behaviour, unchanged).
- **The check before air:** nothing was held under the relaxed switches; the strict rules would have held 8 of the 10
  news programmes (verbatim 8, the owner's review 2). WORLD WEATHER passes them. (In an earlier test the strict gate
  held a WORLD NOW for an election's silence period, on its own.)
- **Disk:** the policy deleted 10 aired files and masters as they aged (`PLAYOUT_KEEP_AIRED_H=0.5` for the test).
- **Reuse:** the clip factory cut a WORLD NOW clip from the playout's master with no new recording ("horizontal master:
  kept"; the timeline found 20 of 20 segments in the report).

**Estimate for the owner's 2 cores.** A second of air costs about 1.1 CPU-s to render and about 1.1 CPU-s of voices
(0.75 s of speech at 1.5), plus 0.1 for the station and the playout: **about 2.3 CPU-s per second of air on cores like
these, so about 0.85x on two of them: the buffer would drain.** The owner's cores are described as fast: if they are
25 to 30 % quicker than these (the live test's voices took "almost a core" in real time, which fits), it is about
1.05 to 1.1x, a thin margin. `--no-twin` and `--preset superfast` take about 0.2 CPU-s off (to about 1.2x); the
voices are half the cost and are the lever that matters (a faster voice engine or a third core). The 24-hour test
(server-setup.md §4b) measures it on the machine itself; if the buffer does not grow past the first hour there, the
honest answer is 4 cores, not a lower picture.

**After the voices' speed round (18 Oct, `docs/roadmap/critique/voices-speed.md`).** The 1.5 was onnxruntime's two
spinning threads fighting the renderer for two cores. The voice engine now runs one thread (same samples), a cheaper
broadcast chain (same samples) and a phrase cache: **about 1.04 CPU-s per second of speech beside a busy renderer
(1.49 before), 0.78 per second of air**. A second of air now costs about **2.0 CPU-s on cores like these (1.01x on
two cores: the buffer stops draining, with no margin), 1.8 with `--no-twin --preset superfast` (1.12x)**, about
1.25–1.4x if the owner's cores are 25–30 % quicker. The release's smaller "fp16" weights would take the voices to 0.65
per second of air (1.08x, 1.21x with the rendering switches), but they measurably read a little less naturally
(predicted listening score −0.08), so they wait for the owner's ears (`VOICE_MODEL=fp16`).

## 11. Limits

- **The renderer must average faster than real time.** The buffer absorbs slow stretches, not a slow machine: if
  rendering plus voices take more than the two cores can give per second of air, the buffer drains, the renderer
  falls behind, renders for later times and the playout airs filler between programmes (every gap logged). §10 has
  the numbers.
- **News is about an hour old**, by the owner's decision; breaking news waits for §7.
- **A programme's words are written a few minutes before its air time** (the station keeps two ready), as live.
- **The air clock is cooperative:** only the station process reads it. The renderer and the playout keep the real
  clock; logs of the station's own durations ("ready in 0.0 s") are on the air clock and can read oddly.
