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
record, demo or fixture material), **verbatim** (the outlet's sentences copied), **disclosure** (the channel's ident before the programme, compliance.md §3.1)
and **recreations** (the label in frame, the owner's review, election holds), plus the register (a story withdrawn, a
person who asked to be left out) and the **no-LIVE rule** (§5). Twice:

1. **When the station makes it**, on the finished words and before the voices (`Producer` stage `gate`): a programme
   that fails costs no voice time, is never queued, and the station makes the next one in its place.
2. **When the renderer has rendered it**, with the recording's report (the timeline of what aired): the recreation
   labels and the channel's ident checked against it (compliance.md §3.1: a programme whose recording does not open with
   the ident, or that with the break after it would leave the stream more than 15 minutes without one, is held). A unit that fails is held and the renderer renders the **next unit for
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
'recorded'`), and `public/js/airmode.js` decides every label. A clip's end card points to a stream only when the
stream's address is set (`CHANNEL_LIVE_URL`, the one the descriptions link): without it (the manual beta has no stream)
the card says nothing about where to watch, in either column. The same rule holds for the page (the server's `stream`,
`airmode.js` `pageMode`): without a live stream nothing says LIVE, and a programme's end card shows the channel's name
alone, also in the recordings the publishing desk makes (`server/publish/playback.js` `stream`).

| Where | Live channel | Pre-rendered playout |
| --- | --- | --- |
| Top row tag (`graphics/bug.js`; the opens' lock-up, `opens/kit.js`) | LIVE, red pip | **24/7**, silver, no pip (REPLAY stays REPLAY) |
| End card (`director.js`, `quizdirector.js`) | GLOBIT 24 · LIVE 24 HOURS | GLOBIT 24 · NEWS 24 HOURS A DAY |
| Start screen (`scenes/cards.js`) | LIVE • 24 HOURS | NEWS • 24 HOURS |
| A clip's end card (`clip/cards.js`, `airmode.js` `streamOf`, `watchLine`) | NEWS 24 HOURS A DAY · WATCH LIVE | NEWS 24 HOURS A DAY |
| Old renderer's idle wall (`set.js`) | LIVE pill | 24/7 pill |
| Browser tab | GLOBIT 24 · Live | GLOBIT 24 · 24/7 |
| YouTube live title (`server/publish/live.js`) | GLOBIT 24 LIVE · Now: … · AI-produced news 24/7 | GLOBIT 24 · Now: … · AI-produced news 24/7 |
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
(`clip/graphics.js`: no clock, no ticker, the bug alone, clip captions), on a second canvas, captured with
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

Sizes measured here (720p at 3000k, before §12; at 1080p crf 20 the video averages about 1 to 2.5 Mbit/s): about 1.1 GB an hour of air files (the video rarely reaches its cap; FLAC sound
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
| `--size` / `PLAYOUT_SIZE` | 1920x1080 | The air files' size, a whole multiple of the 384x216 canvas (x5; 1152x648 is x3). Anything else is rounded to the nearest whole multiple, with a warning (1280x720 is aired as 1152x648): §12 |
| `--crf`, `--bitrate` / `PLAYOUT_CRF`, `PLAYOUT_BITRATE` | 20, 5500k | Constant quality under a cap (§12); `PLAYOUT_CRF=off`: a constant 4500k (the filler follows the files) |
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

## 12. Lean rendering: the page's memory, the picture's size, one encode (18 Oct)

The owner's server ran the live channel for a day at 720p and reported three things: the browser's memory grew for
hours and was never given back (over 1 GB in swap), 1280x720 is not a whole multiple of the 384x216 canvas, and the live
stream encodes twice. The size and the double encode are fixed, and the page's main memory growth (the pictures, the canvases); two smaller growths are measured and still open (§12.1). What was measured, and how to measure it again, follows.

### 12.1 What the page kept (live mode)

The tool: `node tools/leak/watch.mjs` runs the channel page in headless Chromium and, every sample, forces the garbage
collector and counts what the page still holds from every side: a census in the page (`tools/leak/census.mjs`: every
canvas, image, video, AudioContext, AudioBuffer, audio node and large typed array, counted when made and when freed,
**by the line of code that made it**), the DOM counters, the JS heap, heap-snapshot summaries and their diff
(`tools/leak/snapshot.mjs`), and each browser process's RSS and swap (`tools/leak/proc.mjs`). `tools/leak/playlist.mjs`
puts a fixed playlist of saved programmes in front of a running station (every round with fresh story ids, so the
page meets new stories as on air), so a before and an after can run side by side on the same programmes, faster than
real time on a fake clock when the machine allows (`--speed`).

What it found, on the real station (real feeds, Kokoro voices, port 8796) and on the playlist:

- **The pictures (the leak).** Each programme's pictures were loaded as `<img>` elements and drawn into canvases to be
  pixelated. Chromium keeps a decoded `<img>`'s pixels in its image cache, outside the garbage collector's reach,
  until the system is short of memory: on a server with swap that moment never comes, it swaps first. Measured
  (`director.prepareImages`'s own path, the 37 pictures of the saved programmes pixelated ten times over, collector
  forced): the renderer **+92, +179, +257 … +605 MB**, about 80 MB more each round until a ceiling (Chromium's own
  limit for that cache, here 600 MB; it scales with the machine's memory), never released; on air a WORLD NOW alone
  brings a dozen new pictures. Through `createImageBitmap(blob)` and `bitmap.close()` after pixelating: **+28 MB once,
  then flat** (+33 after ten rounds). The fix (`pixelate.js loadPicture/releasePicture`, used by the director and
  PAY ATTENTION's pictures): the decoded picture is freed the moment its pixelated canvases are made. The pixelated
  result is the same picture: drawn from a bitmap, the downscale's sampling differs slightly, so the palette's colours
  move a few levels (mean 5 of 255); side by side the two read the same. The recorder's fake clock now holds for
  these decodes too (`tools/recorder/page.mjs`), so recordings stay deterministic.
- **The "DOM nodes" of the 12 Oct soak (438 to 3,154)** are canvases: 2,264 of the 2,295 nodes after 45 minutes, none in
  the document. 1,654 of them were rendered strings (`font.js`): bounded at 400 per font, scale and colour, which
  across a day's clocks, tickers and captions in their colours is thousands. A canvas costs the renderer about
  **20 kB however small** (5,000 canvases of 40x9: +101 MB; 100 of 384x216: +33 MB, their pixels). Now one bound for
  all of them, 512, the least recently drawn going first.
- **Kept twice or too many:** a locator board kept its pixels on its canvas and again in its plan (0.33 MB twice, up to
  64 boards); the director kept up to 40 stories' pictures (~0.9 MB of canvases each) and 60 locator boards. Now the
  pixels once, and 24 pictures and boards (the current rundown always kept: a WORLD NOW has up to 18 stories).
- **Bounded and left as they are:** the adverts' baked art (124 canvases, 33 MB once the spots have aired; released
  after each break, it would be baked again on the next break's first frames), the title sequences' art (about 10 MB),
  the v2 wall's prepared pictures (the last 24, ~1.2 MB each), the v2 studio's tables, the guests' looks (32 at most),
  the voices' decoded clips (8), the footage deck (4 clips of 426x240). The audio graph does not grow: one
  AudioContext, 70 to 400 live nodes at any moment (notes come and go), all freed; no object URLs.

Before and after, side by side (the playlist of 8 saved programmes, every round's stories new, both pages on the same
machine at once; 126 minutes of air, 46 programmes, the census in both pages):

| Air (min) | Programmes | Renderer MB before → after | Browser MB before → after | Canvases before → after | JS heap MB before → after |
| --- | --- | --- | --- | --- | --- |
| 1 | 2 | 345 → 304 | 678 → 642 | 572 → 548 | 18 → 13.9 |
| 31 | 12 | 736 → 693 | 1088 → 1053 | 1747 → 1070 | 28.8 → 28 |
| 61 | 26 | 687 → 610 | 1049 → 978 | 2082 → 1073 | 32.9 → 31.7 |
| 92 | 34 | 771 → 692 | 1136 → 1063 | 2095 → 1086 | 33.3 → 32.6 |
| 121 | 45 | 836 → 758 | 1205 → 1134 | 2139 → 1118 | 33.5 → 33.1 |

And the live streams themselves, no instruments in the page (the old stream on the old page at 720p, the new on the new
page at 1080p, 66 minutes until the machine's memory limit, shared by four other sessions, stopped both): the renderer
532 → 496 MB at 10 minutes, 853 → 756 at 60, 819 → 742 at 66; the whole browser about the same in both (1.2 GB: the new
capture's worker and network process); the stream's node 267 MB and growing before (its encoder's backlog, queued
without end), 216 MB now (and bounded since: §12.3).

What this does and does not show. The playlist airs few pictures (about one a programme: 42 in 126 minutes, against the
37 a round of the mechanism test), so the pictures' share here is the constant 80 to 100 MB between the columns; on air
the station brings 15 to 20 pictures an hour, about 2 MB each in the cache, so the old page reached the cache's ceiling
within a day: that part is gone. The canvases are bounded (1,100 against 2,100 and climbing). **What is not fixed yet:**

- **The footage deck** (`footage/deck.js`, the WORLD NOW B-roll): drawing a playing `<video>` into a canvas fills
  Chromium's decoded-image cache with every frame. Measured (a 360p clip grabbed 12 times a second, Chromium's own
  memory dumps, `tools/leak/allocators.mjs`): +400 MB in 30 s, +516 MB at 60 s (the cache's ceiling here), still held
  after the clip stops and after a simulated memory-pressure warning; the same through `createImageBitmap(video)` or a
  `VideoFrame` drawn into the canvas; nothing with the clip playing undrawn, and nothing (+4 MB) when the frame is read
  with WebCodecs (`new VideoFrame(video).copyTo(buffer, { format: 'RGBA' })`) instead of a canvas. On air it shows as
  the WORLD NOW bump (+150 to 190 MB, given back when the deck drops the clip). The fix is that copyTo path (async, a
  JS downscale); not made in this round.
- **A slow rise in both pages**, about 100 MB per round of 8 programmes after the first hour (malloc outside the
  canvases, the JS heap and the audio graph flat; WebAudio node churn ruled out: 30,000 notes left 1.6 MB). Not
  attributed yet; `node tools/leak/watch.mjs --allocators` records Chromium's breakdown each sample to find it, over a
  longer run than this machine allowed.

### 12.2 The picture's size: whole multiples only

`server/airsize.js` decides the size for both modes: a whole multiple k of the canvas, each art pixel a k x k block
(nearest neighbour). **1920x1080 (x5) is the default**; 1152x648 (x3) on request (`--size 1152x648` or `648p`). Any
other size is rounded to the nearest whole multiple with a warning (`1280x720` → `1152x648`), so the old commands
still run; where files must join byte to byte (the playout's encoder settings) a fractional size is refused outright.

The colours: ffmpeg converted RGB to YUV with BT.601 and wrote nothing in the stream, while players and YouTube read an
untagged HD picture as BT.709: the channel's green 0x00e436 reached the viewer as 0x00c12f, its red 0xff004d as
0xff1b4c. Both modes now convert with BT.709 and tag it (limited range): within 2–4 levels of the palette.

**YouTube** (sources at the end of this section):

- Its standard sizes are 2160p, 1440p, 1080p (1920x1080), 720p (1280x720), 480p (854x480), 360p, 240p. YouTube re-encodes
  everything; the help pages do not say what it does with a size between two rungs. Users report that an in-between
  size is filed under the rung below it: a 1600x900 upload "only registered at 720p", a 960x540 one offered 480p at
  most. **So 1152x648 would be labelled and served as 480p: YouTube's 854x480 rendition, a x2.22 downscale of the art
  (blurred pixels), and "SD".** 1920x1080 is served as 1080p: YouTube's top rendition is our picture at x5 exactly
  (its 720p and lower renditions are YouTube's own downscales, as for every channel).
- YouTube's live encoder settings (manual): 1080p30 H.264 minimum 5 Mbit/s, recommended 14; 720p30 minimum 3,
  recommended 8; 480p 0.4 to 4; "CBR"; keyframes every 2 s. The automatic setting (the default) takes whatever
  arrives; a stream below the minimum works, and Live Control Room may say the bitrate is low.

**The bitrate this picture needs** (`tools/live/quality.py`, lossless 384x216 recordings of real programmes encoded at
1080p, veryfast, `-tune animation`, decoded as a player would, compared with the recording at x5: SSIM, its worst 1 %
of frames, PSNR):

| Programme (seconds measured) | Setting | Mbit/s | SSIM | worst 1 % | PSNR |
| --- | --- | --- | --- | --- | --- |
| COSMOS DESK, a news programme (20) | lossless 4:2:0 (crf 0): the ceiling | 1.10 | 0.991 | 0.982 | 37.6 |
| | crf 18 | 0.82 | 0.987 | 0.977 | 37.1 |
| COSMOS DESK (40) | crf 20 | 1.11 | 0.983 | 0.972 (worst) | 36.6 |
| | crf 24 | 0.85 | 0.978 | 0.960 (worst) | 36.1 |
| | CBR 4500k | 2.55 | 0.986 | 0.861 (worst) | 37.0 |
| WORLD NOW, open and stories (60) | crf 20, cap 4500k | 1.71 | 0.975 | 0.952 | 34.5 |
| | crf 18, cap 4500k | 1.85 | 0.976 | 0.950 | 34.5 |
| | CBR 4500k | 2.65 | 0.979 | 0.959 | 34.7 |
| A break: bumper, two adverts (75) | crf 18 | 2.93 | 0.969 | 0.914 | 38.0 |
| | crf 20 | 2.43 | 0.965 | 0.903 | 37.7 |
| | crf 20, cap 4500k | 2.37 | 0.964 | 0.901 | 37.6 |
| | crf 20, cap 2500k | 1.92 | 0.953 | 0.833 | 36.6 |
| | CBR 4500k | 3.85 | 0.970 | 0.877 | 38.0 |
| WORLD WEATHER, the world map (15) | lossless 4:2:0: the ceiling | 11.0 | 0.930 | 0.926 | 26.5 |
| | crf 20, no cap | 7.17 | 0.920 | 0.912 | 26.3 |
| | crf 20, cap 6000k | 5.75 | 0.910 | 0.881 | 26.0 |
| | **crf 20, cap 5500k** | 5.37 | 0.906 | 0.861 | 25.9 |
| | crf 20, cap 4500k | 4.52 | 0.894 | 0.814 | 25.5 |

(The weather map's low ceiling is 4:2:0 itself: at x5 an art pixel is 5 screen pixels, an odd number, so one chroma
sample in every five straddles two art pixels, and the map changes colour at nearly every art pixel. YouTube's own
1080p, 4:2:0 too, does the same to it.) x264 presets on the same seconds, crf 20 under the cap: veryfast 0.63–0.75
CPU-s per second of video (news, adverts), superfast 0.50–0.58 with the same SSIM at 1.5 times the bits (2.4 and 4.1
Mbit/s), ultrafast 0.34–0.37 with the adverts pinned to the cap and SSIM down 0.013, faster 1.1–1.3 for no gain.

Pixel art upscaled by 5 is mostly flat blocks: a news programme needs 1 to 2 Mbit/s at 1080p for a picture close to
lossless (lossless 4:2:0 itself takes 1.1 Mbit/s on COSMOS DESK); the adverts' dithered gradients need about 2.5; only
the weather map wants more than any cap worth paying for. A constant 4.5 Mbit/s spends most of its bits where nothing
moves and too few on the map, and its first frames and cuts are worse than constant quality's (the rate control starts
from a guess: worst frame SSIM 0.86 at CBR 4500k against 0.97 at crf 20 on the same seconds of COSMOS DESK).

**Recommendation: 1920x1080, constant quality crf 20 under a 5500k cap** (`--crf 20 --bitrate 5500k`, the default of
both modes). The month (2,000 GB allowed): at a guessed mix of the day (news three quarters of the air at about 1.5
Mbit/s, breaks a fifth at 2.4, the weather a tenth at the cap), about 2.1 Mbit/s of video and 0.16 of sound, **about
750 GB a month**; the cap holds even the impossible worst case (5.5 + 0.16 Mbit/s every second: 1,860 GB) under the
allowance. The stream's own average is in its file sizes from the first day (server-setup.md §4). If YouTube's low
bitrate note in Live Control Room ever matters more than traffic, `--rc cbr --bitrate 5000k` meets its 1080p minimum at
about 1,700 GB a month. 1152x648 saves encoder CPU (§12.4), not quality: on YouTube it is 480p.

### 12.3 Live: one encode instead of two

Until now the page recorded its canvas with MediaRecorder (VP8 asked for 2.5 Mbit/s, Opus sound), and ffmpeg decoded
that and encoded x264. Measured with `tools/live/lab.mjs` (20 s of a real programme played into a page in real time,
captured exactly as the stream captures, aligned frame by frame) and `tools/live/quality.py`:

| Way to air | at 384x216 (SSIM, worst 1 %, PSNR) | after x264 1080p crf 18 (SSIM, worst 1 %, PSNR, Mbit/s) |
| --- | --- | --- |
| x264 straight from the page's pixels (the reference) | — | 0.987, 0.977, 37.1 dB, 0.82 |
| MediaRecorder VP8, then x264 (before) | 0.970, 0.947, 32.3 dB (one frame 0.47) | 0.961, 0.932, 32.0 dB, 1.27 |
| The page's pixels as PNG frames, then x264 (now) | 0.9998, 1.000, 45.3 dB | 0.987, 0.977, 36.5 dB, 0.82 |

The browser's VP8 takes far less than it is offered (586 kbit/s of the 2.5 Mbit/s), in 4:2:0 at the canvas's own size
(the chroma of every two art pixels shared), and blurs its cuts; magnified x5 every artefact is five times larger, and
x264 then spends half as many bits again encoding them. The frame sheet (`img/live-capture.png`: the page at x5, before,
now; one frame, a crop at 1080p) shows it: soft outlines, chroma smeared off the pink strap, the necklace's dots gone.

![The same frame three ways](img/live-capture.png)

**Now (`--capture png`, the default):** the page copies its canvas 30 times a second (a 1/30 s slot by its own clock),
a worker encodes each frame as PNG (a pixel-art frame is ~40 kB) and sends it over a loopback WebSocket to the stream
(`tools/live/capture.mjs`, `tools/live/sink.mjs`); the sound leaves as 16-bit PCM from an AudioWorklet on the same
tap, each block with its sample index. The sink writes both to the one ffmpeg at a steady rate on node's clock: a frame
that did not arrive is the frame before again, the sound is cut by sample index (silence where none came, a stalled
sound clock picked up without losing its blocks), and a stalled page still gives the encoder a steady stream. The
sound is not encoded twice either (no Opus before the AAC). Picture and sound in step, end to end
(`tools/live/sync.mjs`, a flash and a beep every 2 s through the real stream): **the sound 17 ms ahead, steady over
the run**; through the old VP8 path −17 ms but jumping to −617 ms after half a minute. `--capture vp8` keeps the old
capture as a switch; `frames` sends raw RGBA (more CPU in node). An encoder that cannot keep up is never queued without
end (the old stream's node grew by 220 MB in 54 minutes when its encoder fell behind): once it holds 3 seconds of
picture it has not read, the sink skips frames, counts them, and the stream's 10-second line says `SKIPPED: the
encoder is behind`, with the levers (`--preset superfast`, then `ultrafast`, or `--size 1152x648`: §12.4).

The other ways the browser can hand over its picture, in the same lab on the same 20 s (the browser's and node's
CPU while capturing, the machine loaded):

| Capture | Sent | At 384x216: SSIM, worst 1 %, worst frame, PSNR | After x264 1080p crf 18: SSIM, PSNR, Mbit/s | Browser + node, cores |
| --- | --- | --- | --- | --- |
| **PNG frames (`png`, now)** | 16 Mbit/s on loopback | **0.9998**, 1.000, 0.94, 45.3 dB | **0.987**, 36.5 dB, 0.82 | 0.31 + 0.05 |
| MediaRecorder VP8 at 2.5 Mbit/s (`vp8`, before) | 0.59 Mbit/s | 0.970, 0.947, 0.47, 32.3 dB | 0.961, 32.0 dB, 1.27 | 0.22 + 0.01 |
| VP8 asked for 12 Mbit/s (`vp8hq`) | 3.5 Mbit/s | 0.971, 0.955, 0.91, 32.9 dB | 0.962, 32.6 dB, 1.20 | 0.17 + 0.01 (71 frames of 600 lost) |
| VP9 asked for 12 Mbit/s (`vp9`) | 3.6 Mbit/s | 0.973, 0.950, 0.90, 32.8 dB | 0.964, 32.5 dB, 1.16 | 0.21 + 0.02 |
| Raw RGBA frames (`frames`) | 80 Mbit/s on loopback | the same pixels as PNG | as PNG | more in node (0.19 in a first version) |

More bits do not save the recorder: VP8 or VP9 at six times the rate still lands at SSIM 0.97, because the browser
encodes 4:2:0 at the canvas's own size (two art pixels share one colour sample: the loss is in the format, not the
bitrate); more bits only spare the worst frames. The PNG capture costs the browser about 0.1 core more than VP8 and node
0.04 more, and saves the encoder 0.1 (no VP8 to decode, no artefacts for x264 to chase): the same CPU for the page's
own pixels. It is the default; `vp8` stays as a switch, for comparison only.

**CPU.** This machine was shared with four other sessions all afternoon (load 30 to 40 on 4 cores), so no
configuration held real time at 1080p while it was measured: the encoder got a third of a core and skipped frames, and
every page dropped some. What each part *used* live is below; what each part *needs* comes from the encoder's work on
recorded programmes (every frame, counted in CPU-seconds, which load does not change much).

The encoder, per second of video (x264 with the playout's settings, 60 s of COSMOS DESK and 60 s of a break, decoded
from lossless recordings; `.ts` bitrate):

| Encoder | COSMOS DESK | a break | Mbit/s (news, break) |
| --- | --- | --- | --- |
| 1280x720, constant 3000k, veryfast (before) | 0.35 | 0.44 | 2.5, 3.0 |
| **1920x1080, crf 20 under 5500k, veryfast (now)** | **0.68** | **0.73** | 1.8, 3.0 |
| 1920x1080, the same, superfast | 0.55 | 0.67 | 2.8, 4.7 |
| 1920x1080, ultrafast (the live settings, under 4500k: the adverts pinned to the cap) | 0.34 | 0.37 | 3.1, 4.5 |
| 1152x648, crf 20 under 5500k, veryfast | 0.25 | 0.31 | 1.3, 1.6 |

On top of x264: decoding the PNG frames 0.015 to 0.03; the VP8 path's decode 0.01, and x264 working harder on VP8's
artefacts (+0.08 to +0.12 at 1080p). x264 at 1080p holds about 390 MB with the 6 threads it starts on 4 cores, 320 MB
with the 3 it starts on 2 (220 MB at 720p); fewer threads or a shorter lookahead save no CPU.

Live, as used (CPU-seconds per second of air; 180 s each on the same playlist, 2 rounds, the machine loaded; "skipped"
is the share of frames the encoder could not take):

| Configuration | Rounds | Browser (of it the page) | Encoder | node | Total | Page fps | Repeated | Skipped |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Before: VP8 capture, 720p constant 3000k (the old stream) | 2 | 0.43–0.67 (0.48) | 0.45–0.52 | 0.01 | 0.88–1.20 | — | — | none counted: it queued, and ran on 37 s after the page stopped |
| **Now: PNG capture, 1080p (the defaults)** | 2 | 0.55–0.66 (0.51) | 0.30–0.70 | 0.03 | 0.87–1.39 | 22 | 30 % | 44 % |
| Now, the page drawing 60 a second (`--page-fps 0`) | 2 | 0.72 (0.59) | 0.48–0.79 | 0.03 | 1.24–1.54 | 45 | 21 % | 26 % |
| Now at 1152x648 | 1 | 0.65 (0.54) | 0.37 | 0.04 | 1.06 | 27 | 13 % | 0 % |
| VP8 capture at 1080p (`--capture vp8`) | 1 | 0.56 (0.50) | 0.59 | 0.01 | 1.16 | — | — | — |

Read it for its shape, not its sums: on this loaded machine every encoder got what the others left it. 1152x648 was the
only size whose encoder kept up (none skipped); at 1080p it skipped a quarter to half of the frames. Drawing only the
pictures the stream takes saves the browser about 0.15 cores.

Side by side for 66 minutes (§12.1's run: the same programmes at the same moment, the old stream at 720p on the old
page, the new at 1080p on the new page, until the machine's memory limit stopped both): the browser 0.48 cores before,
0.51 now (the page drawing 30 pictures a second instead of 60, and a worker making PNGs); node 0.005 and 0.02; the
encoders 0.24 and 0.28, both short of CPU.

### 12.4 What each mode costs now

CPU-seconds per second of air on cores like these, from the parts above, §10 and the voices' round
(`docs/roadmap/critique/voices-speed.md`: Kokoro at 1.04 CPU-s per second of speech, 0.75 s of speech a second):

| | Live before (720p, VP8 then x264) | **Live now (1080p, one encode)** | Playout before (720p) | **Playout now (1080p)** |
| --- | --- | --- | --- | --- |
| The page (browser) | 0.55 | 0.55 | 0.55 (with the twin) | 0.55 |
| Encoders | 0.46 | 0.73 | 0.45 | 0.76 |
| node (the stream; the renderer) | 0.01 | 0.03 | 0.10 | 0.10 |
| Voices | 0.78 | 0.78 | 0.78 | 0.78 |
| Station (and the playout) | 0.05 | 0.05 | 0.10 | 0.10 |
| **Total** | **1.85** | **2.14** | **1.98** | **2.29** |
| **On 2 cores** | 93 % busy | **107 %: the encoder falls behind** | 1.01x | **0.87x: the buffer drains** |
| with `--preset superfast` | | 2.04 (102 %) | | 2.19 (0.91x); with `--no-twin` too 2.09 (0.96x) |
| with `--preset ultrafast` | | 1.79 (90 %) | | 1.94 (1.03x) |
| at 1152x648 | | 1.71 (86 %) | | 1.87 (1.07x); about 1.7 with both switches (1.2x) |

The whole-number picture costs CPU: x264 has 2.25 times the pixels of 720p to encode, **+0.3 CPU-s per second of air in
both modes**, and 100 to 170 MB more memory for the encoder. Everything else is unchanged or cheaper (the second encode is gone; the page draws
half as often). On two cores like these neither mode holds 1080p at `veryfast`; if the owner's cores are 25 to 30 %
quicker (§10), live is 1.65–1.7 (83–86 % of two cores: it holds) and the playout 1.09–1.14x. The 24-hour tests
(server-setup.md §4, §4b) decide on the machine itself. The levers, in order: `--preset superfast` (the same picture
at 1.5 times the bits, still well inside the month's traffic), `--preset ultrafast` (the adverts' dithered gradients a
little softer, pinned to the cap), then 1152x648 (cheapest, but YouTube's 480p). The stream says when it needs one
(`SKIPPED`); the playout's buffer says it in the renderer's log.

Memory, live, after an hour (§12.1): the renderer about 750 MB, the whole browser 1.2 GB, x264 at 1080p 320–410 MB,
the stream's node 200 MB (it was 270 MB and growing before, its encoder's backlog), the station 200 MB and its voice
worker 0.7–1.1 GB: about 2.7–3.1 GB of the server's 4.

### 12.5 Sources (YouTube)

- YouTube Help, "Choose live encoder settings, bitrates, and resolutions" (support.google.com/youtube/answer/2853702),
  read 18 Oct 2026: the table above, CBR, 2 s keyframes.
- YouTube Help, "YouTube recommended upload encoding settings" (support.google.com/youtube/answer/1722171): upload
  bitrates (1080p 8 Mbit/s, 720p 5, 480p 2.5 at 24–30 fps); no word on in-between sizes.
- YouTube Help, "Video resolution & aspect ratios" (support.google.com/youtube/answer/6375112): the standard sizes
  (480p is 854x480).
- OBS forum, "Is there REALLY a benefit to streaming at 1600x900?" (obsproject.com/forum/threads/84949, May 2018): a
  1600x900 upload "only registered at 720P"; "it always downscales to one of those sizes if you're in-between".
- VideoHelp forum, "Is there any way at all to get a 960 x 540 video to upload HD on youtube?" (forum.videohelp.com,
  thread 377813): a 960x540 upload offered 480p at most (the page itself answered 503 here; quoted from the search
  result).
- Not found: an official statement of how YouTube labels a 1152x648 stream or upload, or of the bitrates of its
  delivered 1080p and 720p live renditions. The only sure test is an unlisted upload of a minute at 1152x648 and
  `yt-dlp -F` on it (not done: nothing is published from here).

## 13. The vertical live (24 Oct)

The owner, 24 Oct: "directos en vertical sin perder la calidad, para Shorts". A second 24/7 stream, 9:16, for the
vertical feeds (YouTube's Shorts feed shows vertical live streams; other vertical platforms where the channel is allowed
to stream take the same file). The same programmes at the same moment as the horizontal channel: drawn from the same
frames by the same renderer, so nothing is written, voiced or rendered twice.

### 13.1 What airs

- **The programmes:** the vertical picture of the clips (`vertical.md`): 216x384 at 5x = 1080x1920, the same pixel as
  the horizontal channel, the presenter's single made tall in the programme's set stood on end, the boards on glass, the
  captions burned in at 2x (the feeds play with the sound off). The title band holds the programme's name beside the
  channel's bug (a clip's hook is laid over it only by the factory).
- **The channel's own moments, set for the frame** (`public/js/clip/vchannel.js`; before, the vertical frame showed the
  middle of the horizontal card, cutting its words and the countdown's ring in half). Round 2 (owner, 24 Oct: "está
  como descentrado", "necesita claras mejoras la adaptación"): every card centred on the frame, its rows stacked round
  the frame's middle between two accent rules as far from either edge (rows 30 and 352), never under the feeds' band:
  - the **ident** before every programme: the earth from orbit under the frame, the lock-up, and the AI notice in the
    end card's three rows (AI-PRODUCED NEWS · PRESENTERS ARE AI CHARACTERS · FACTS FROM CREDITED SOURCES), the only
    disclosure, as on the horizontal channel; never in a break (a test counts it);
  - the **break bumper** (BACK IN / 1 MINUTE, what comes after the break, the break's clock and rail), the **UP NEXT
    promo** (the programme on its plate, its line, its presenters cut out by the rig, standing side by side, their
    names), the **countdown clock**, the **standby** card (and the vertical playout's filler, BACK SHORTLY), the
    **breaking** card;
  - the **films**: an advert and a programme's **title sequence** are 384x216 pictures, so they are not redrawn. The
    frame carries the ADVERTISEMENT tag and the break's clock over a window (or the programme's name on its plate) and
    what comes after the break (or the presenters and the programme's line) under it; the window, centred on the frame
    across and down (x 31–185, rows 148–235), is left transparent and the renderer's encoder fills it with the film
    itself at **2x** (768x432 in the 770x435 window of the 1080x1920 picture, every pixel a 2x2 block, nothing
    resampled). A centre crop would have cut every spot's titles and every title sequence's name;
  - a programme's **end card** set for the frame (its name on its plate, STAY WITH US, the channel's line, the logo).
- **The story line** (the live only): the title band's plate (`TITLE_BOX`) holds the story on air, its headline from the
  rundown (else the strap's, else the programme's line), two lines at 2x when they fit, else up to three at 1x,
  centred; a new story wipes in. A viewer who arrives mid-programme reads what it is about. A clip's hook fills the
  same box, so a hook laid over a master made on air covers it whole.
- **The stinger** between programmes and breaks, drawn for the frame (the logo at 1x: at 2x it is wider than the frame),
  and the **held frame** under an item's opening stinger is the last vertical frame of what aired before.
- Every word a viewer must read is in the safe column, centred on the frame (x 28-188 of 216, clear of the feeds'
  buttons on the right) and above their band at the foot (y 300): tested.

### 13.2 How it is made

| Part | What it does |
|---|---|
| The page, `?vertical=1` (`public/js/main.js`) | The renderer draws each frame once; a clean copy (no air graphics, no stinger) goes to a second canvas (`renderer.twins`, `studio.js`), and the vertical compositor (`clip/index.js installVertical`, `live: true`) draws the 216x384 picture from it, as a vertical clip is drawn |
| The grab (`tools/playout/render.mjs`) | One image a frame, side by side: the air picture, the twin master, the clean frame, the vertical picture (`encode.js grabLayout`), its window's transparency kept |
| The encode (`server/playout/encode.js renderGraph`) | One ffmpeg: the air picture as before; the vertical picture at 5x over the clean frame at 2x padded into the window; the air's settings (H.264 high, 2 s GOP, no B-frames, crf 20 under 5500k, BT.709) at 1080x1920; the vertical master lossless at 1x |
| The queue | `<dir>/vertical/` (a playout store of its own): each segment the horizontal one's, with the vertical file, the same sound and the same air time. The gate's verdict is the horizontal unit's: held together, queued together, late together |
| The playout | A second `air.mjs` on `<dir>/vertical`, to its own stream key and its own live video's title (`--video-env`); its filler is the vertical BACK SHORTLY |
| The masters | Each programme's vertical master beside its horizontal one (`masters/<id>/vertical.mkv` and its report): the clip factory cuts its vertical clips from it and records nothing (`server/publish/masters.js`) |
| Disk | The vertical queue's aired files go by the same policy as the horizontal ones (§8) |

### 13.3 Running it

Files only (a test): `run.mjs` takes the vertical playout as a fourth process.

```
PORT=8790 VOICE_ENGINE=kokoro node tools/playout/run.mjs --out data/playout/air/air-%03d.ts --segment 3600 \
  --vertical --vertical-out data/playout/vertical/air/air-%03d.ts
```

On air (only on the owner's word; the keys in `/etc/globit24.env`, never in a chat or a commit):

```
PUBLISH_LIVE=1 node tools/playout/run.mjs --rtmp rtmp://a.rtmp.youtube.com/live2 --key-env YOUTUBE_STREAM_KEY \
  --vertical --vertical-rtmp rtmp://a.rtmp.youtube.com/live2 \
  --vertical-key-env YOUTUBE_VERTICAL_STREAM_KEY --vertical-video-env YOUTUBE_VERTICAL_VIDEO_ID
```

Or the parts by hand: `render.mjs --vertical` (or `PLAYOUT_VERTICAL=1`; `--vertical-size 1080x1920` by default, a
portrait whole multiple of 216x384), and `air.mjs --dir data/playout/vertical --rtmp … --key-env
YOUTUBE_VERTICAL_STREAM_KEY --video-env YOUTUBE_VERTICAL_VIDEO_ID`.

### 13.4 What it costs

Measured here (24 Oct, the 4-core cloud machine shared with other sessions; the same break of two spots and the same
NEWS IN 60 rendered both ways from a playback server; CPU seconds per second of air, by process):

| | The browser | The encoders | Node | All |
|---|---|---|---|---|
| Horizontal 1080p and its twin master | 0.62 | 0.72 | 0.06 | **1.42** |
| ... and the vertical live (first build) | 1.14 | 2.24 | 0.08 | 3.46 |
| ... and the vertical live (as built) | 1.15 | 1.51 | 0.08 | **2.74** |

- **The encoders.** The first build laid the clean frame over the whole 1080x1920 picture (an RGBA scale and a
  full-frame overlay): the filters alone cost 1.06 CPU-s a second. Now the vertical frame is scaled and converted to
  4:2:0 in one pass and the spot is laid over its window alone, its alpha the frame's window inverted: **0.19**. What
  is left is the second x264 encode at 1080x1920 (about 0.55, as much as the horizontal one: the same number of
  pixels) and the lossless vertical master. Benchmarked on the masters' own frames (600 frames,
  `renderGraph` as it is): horizontal 0.75, with the vertical 1.48.
- **The browser** (+0.5): the vertical compositor draws its own frame every frame, and its presenter's single is a
  second render of the presenter at the vertical's framing (the tall single); the grab is larger. A programme of
  singles costs more than a break (3.02 against 2.42 CPU-s a second).
- **So:** the vertical live adds about 1.3 CPU-s per second of air to the renderer's 1.4: about **2.7 cores** for the
  renderer alone, at real time, before the voices (about 1.5 CPU-s per second of speech with Kokoro, §10) and the
  station. Both streams together want **4 cores at the least, 6 to keep the hour's buffer**; the horizontal stream
  alone keeps needing what §10 measured. Memory: the encoder holds about 0.9 GB with both pictures (0.3 GB without).
  Traffic: a second stream of the same kind, about 750 GB a month (§12.2), so both together about 1,500 GB.

### 13.5 Limits

- The vertical live runs on the pre-rendered playout only. A live capture of the page (`tools/stream.mjs` with
  `?format=vertical`) gives the clip's vertical picture, without the channel's moments set for the frame.
- A spot's pixel in the window is 2x2 against 5x5 for everything else: square and even, finer.
- The vertical title band names the programme, not the story (a clip's hook is the factory's).
- The platforms: a vertical stream on YouTube is a second live stream on the channel with its own key (set up in
  YouTube Studio, vertical, 1080x1920); TikTok LIVE gives a stream key only to eligible accounts; Instagram streams
  from software only for professional accounts. Each platform's AI label and rules apply as for the clips (`compliance.md`).
