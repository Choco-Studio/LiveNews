# The owner's server: setup and the 24-hour test

For the Claude session that runs **on the owner's server** (started with `claude remote-control`). The owner is not
technical and reads Spanish: talk to them in short, plain Spanish, one step at a time, and say what each step is for.

The goal of this document: the GLOBIT 24 station installed on the server, then **a 24-hour recording test into files**
that measures whether this machine can carry the channel, and at which quality. Nothing is published.

## Rules (they come before everything below)

- **Never ask for or accept a password, token or key in the chat.** Logins happen on the owner's own screen (device
  codes, browser pages). Keys the channel needs later go in `/etc/globit24.env` (`chmod 600`, owned by root), which the
  owner fills in themselves; never print it, never commit it, never `cat` it.
- **Nothing goes out.** No stream to YouTube or anywhere else, no upload, no post. `PUBLISH_LIVE` stays unset and the
  publishing queue stays in dry run until the owner says so in their own words. The test records to local files.
- **Only SSH is open to the internet.** The station (port 8080) and the approval page (port 8740) listen on 127.0.0.1;
  the owner reaches the approval page through an SSH tunnel (`ssh -L 8740:127.0.0.1:8740 root@<server>`), never by
  opening a port.
- **Never `pkill`/`killall` by pattern**; stop only processes you started, by PID or by their systemd unit.
- **Commits:** work on branch `claude/charming-gates-sc3lbb`; run the full suite before any commit; no model names in
  code, commits or docs. Machine-specific files (env, logs, measurements) stay out of git (`data/` is ignored).

## The machine (from the owner, 17 Oct)

2 cores (described by the owner as premium, fast cores), 4096 MB RAM, 90 GB disk, 2000 GB of traffic a month. Probably
Linux; check with `head -2 /etc/os-release`. The steps below are for Ubuntu or Debian; adapt them for anything else.

What to watch: the **memory** (4 GB for a headless browser, the video encoder and the voice engine at once) and the
**traffic** (a 24/7 stream at a constant 4.5 Mbit/s is about 1,500 GB a month; since 18 Oct the stream is constant
quality under a 5.5 Mbit/s cap: about 750 GB a month, 1,860 GB at the very most: playout.md §12.2).

## 1. Get the project

```
apt update && apt install -y gh git
gh auth login          # GitHub.com, HTTPS, "Login with a web browser": the owner types the code on their own screen
gh repo clone choco-studio/livenews ~/globit/livenews -- -b claude/charming-gates-sc3lbb
cd ~/globit/livenews
```

## 2. System packages

- **Node.js 22** (the project needs ≥ 20; the cloud machine runs 22.22): NodeSource's `setup_22.x` or `nvm`.
- **ffmpeg** (`apt install -y ffmpeg`).
- **Chromium for Playwright 1.56.1** with its system libraries:
  `npm i -D --no-save playwright@1.56.1 && npx playwright@1.56.1 install --with-deps chromium`
  (`tools/record.mjs` imports `playwright`; keep it out of `package.json` unless the tests need it).
- **Python 3 with a venv for the voices** (Kokoro, ONNX, on the CPU):
  ```
  apt install -y python3-venv
  python3 -m venv ~/globit/venv
  ~/globit/venv/bin/pip install kokoro-onnx==0.6.1 onnxruntime==1.30.0 numpy soundfile
  ```
  Then the station runs with `VOICE_ENGINE=kokoro VOICE_PYTHON=$HOME/globit/venv/bin/python`.
- **C2PA signing** (every file published, by hand too, is signed as AI-made: `compliance.md` §4):
  `~/globit/venv/bin/pip install -r tools/c2pa/requirements.txt` and `C2PA_PYTHON=$HOME/globit/venv/bin/python` in
  `/etc/globit24.env`. `node tools/compliance/cli.mjs launch` must not say "C2PA SDK missing". The beta, published by
  hand (`docs/publishing/beta.md`), cannot prepare anything without it.
- **Models** (into `data/models/`, git-ignored): `tools/voice/fetch-models.sh` (Kokoro, about 350 MB, from GitHub
  releases, checked by SHA-256); the face reader fetches its own two models on first run (`tools/pictures/faces.mjs`).
  Also fetch the half-precision voice weights, so the owner can try them without another download:
  `tools/voice/fetch-models.sh --model fp16` (169 MB more, same release, checked the same way). They are used only
  with `VOICE_MODEL=fp16` (§3b); the default stays the full-precision weights the cast was chosen on.
- **Swap:** a 4 GB swap file (`fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile`,
  plus the `/etc/fstab` line) so a memory peak slows the machine instead of killing a process.
- **Firewall:** `apt install -y ufw && ufw allow OpenSSH && ufw enable` (check that SSH still works before closing the
  console).

## 3. Check the install

- `npm test` must pass in full, as on the cloud machine (2,955 tests on 17 Oct; on 2 cores expect 10–15 minutes).
- `tools/voice/fetch-models.sh --check` and one voice line through `tools/voice/say.py` (then delete the file).
- Start the station once (`PORT=8080 VOICE_ENGINE=kokoro VOICE_PYTHON=... node server/index.js`), open
  `http://127.0.0.1:8080/api/status` with curl, and stop it.

### 3b. What the voices cost on this machine

The voices are about half the CPU of the channel (`playout.md` §10), so measure them here before the 24-hour test
(about 5 minutes):

```
node tools/voice/audit-requests.mjs --out /tmp/vb/reqs.jsonl --only paco,lola,max,nova,penny,sam
~/globit/venv/bin/python tools/voice/bench.py --reqs /tmp/vb/reqs.jsonl --per-label 3 --hog 1 --json /tmp/vb/fp32.json
VOICE_MODEL=fp16 ~/globit/venv/bin/python tools/voice/bench.py --reqs /tmp/vb/reqs.jsonl --per-label 3 --hog 1 --json /tmp/vb/fp16.json
```

`--hog 1` keeps one core busy, as the renderer will. The last line of each run is the number that matters: CPU-seconds
per second of speech, and how fast that is against real time. On the cloud machine (18 Oct, 2 cores of a 2.8 GHz Xeon
with one busy): **about 1.07 with the defaults** (one thread), 1.49 with the settings before 18 Oct, about 0.89 with
`VOICE_MODEL=fp16` (`docs/roadmap/critique/voices-speed.md`). Then `rm -r /tmp/vb`.

The voice settings, all in `/etc/globit24.env` (or `.env`):
- `KOKORO_THREADS`: empty, the default (one thread: the least CPU beside a busy renderer). `2` only pays while a
  core is idle; an old `KOKORO_THREADS=0` line means the default too.
- `VOICE_MODEL`: empty (the full-precision weights). **`fp16` waits for the owner**: about 15 % less voice CPU, but
  measured a little less natural (predicted listening score −0.08) and 2 % slower to read; he decides by ear (the
  A/B pairs, `voices-speed.md`). If he approves it: `VOICE_MODEL=fp16`, restart; the clips are voiced again as they
  come up (the cache keeps the two apart), and taking the line out goes back.
- `VOICE_PHRASE_CACHE_MB` (64): short phrases said again inside new clips, kept in `data/voice/phrases`.

## 4. The 24-hour test (files only)

Run the station and the live supervisor under systemd (or tmux) so they survive a closed console:

```
PORT=8080 VOICE_ENGINE=kokoro VOICE_PYTHON=$HOME/globit/venv/bin/python node server/index.js
node tools/publish/live.mjs --url "http://127.0.0.1:8080/?autostart=1&voice=tts" --out data/test24/live-{n}.flv --for 86400
```

What that runs since 18 Oct (`docs/publishing/playout.md` §12; the defaults, nothing to add):

- **1920×1080, whole-number scaling (x5).** Never 1280×720 any more: it is x3.33 of the 384×216 canvas (uneven
  pixels), and `--size 1280x720` is now rounded to 1152×648 with a warning. 1152×648 (`--size 1152x648`) is x3 and
  cheaper to encode, but YouTube files an in-between size under the rung below: 480p, its own 854×480 downscale of
  our picture. For YouTube, 1080p.
- **Constant quality under a cap** (`--crf 20 --bitrate 5500k`): close to lossless, 1 to 2 Mbit/s for the news, about
  2.5 for the adverts, the weather map at the cap; about 750 GB a month for the day's mix, never more than 1,860 GB
  (the cap every second) of the 2,000 allowed. `--rc cbr --bitrate 5000k`
  is the constant rate YouTube's manual settings ask for at 1080p (about 1,700 GB a month): only if the owner wants
  Live Control Room's bitrate note gone.
- **One encode:** the page's own pixels (PNG frames from a worker) and its sound (PCM) go straight to the one x264 +
  AAC encoder (`--capture png`). The old capture (MediaRecorder VP8, decoded and encoded again) stays a switch,
  `--capture vp8`, for comparison only.
- **The page draws 30 pictures a second**, the ones the stream takes (it drew 60): `--page-fps 0` gives back the old
  rate.
- **The page's memory grows less:** the pictures, the rendered strings and the locator boards no longer pile up
  (§12.1); the footage deck's video frames and a slow rise of about 100 MB per round of programmes are still open there. The stream prints every 10 s what the page sent, the CPU of the browser, the encoder and node, the
  renderer's memory, the page's frame rate and how many frames had to be repeated.

- **Disk:** a day at 1080p crf 20 is about 25 GB (the cap every second would be 60). Keep the first and last hour and a sample every 3 hours; delete the
  rest as you go.
- **Measure every minute** into `data/test24/` (CSV): CPU per process (browser, ffmpeg, node, the voice worker), RAM
  and swap in use, load average; and from the logs: the stream's 10-second lines (cores per part, the renderer's MB,
  the page's fps and the repeated frames: a steady 10 % or more means the machine is short of CPU), stalls and
  restarts by the supervisor, and whether the voices stay ahead of what airs.
- **The memory over the day:** note the renderer's MB from the stream's lines every hour. It rises for the first hour
  (the adverts' and title sequences' art, baked once), jumps by up to 200 MB during WORLD NOW's file footage and gives
  it back, and still creeps (playout.md §12.1). For a closer look, `node tools/leak/watch.mjs --port 8080 --minutes 60
  --allocators` on a second page names what the page holds by the code that made it and Chromium's own breakdown (it
  takes programmes from the station: run it on a test station, not beside the real stream).
- **CPU:** a `SKIPPED: the encoder is behind` in the stream's lines means two cores cannot encode 1080p beside the page
  and the voices (playout.md §12.4): restart with `--preset superfast`, then `--preset ultrafast`, and only then
  `--size 1152x648` (YouTube's 480p).
- **Watch by eye:** pull three short pieces (start, middle, end) and check picture, sound and lip timing.

### 4b. The 24-hour test of pre-rendered playout (files only)

The owner's decision of 17 Oct: everything made about an hour ahead and aired from files (`docs/publishing/playout.md`).
This test measures whether the server keeps the buffer full. Stop the live test first (one station per machine).

1. **Before it starts:** `npm test` passes; Kokoro speaks (§3); at least 10 GB free (`df -h ~`). Make the folder:
   `mkdir -p data/test24/air`.
2. **Run it** under systemd or tmux (one command starts the station, the renderer and the playout, and restarts any
   of them that stops):
   ```
   PORT=8080 VOICE_ENGINE=kokoro VOICE_PYTHON=$HOME/globit/venv/bin/python \
   PLAYOUT_VERBATIM=warn PLAYOUT_REVIEW=0 PLAYOUT_KEEP_AIRED_H=2 \
     node tools/playout/run.mjs --out data/test24/air/air-%03d.ts --segment 3600 --buffer 60
   ```
   - The air files are 1920×1080 (x5) at constant quality crf 20 under a 5500k cap, BT.709, since 18 Oct (playout.md
     §12): no `--size` or `--bitrate` needed. Files rendered before that (720p) cannot join the new ones: start with
     an empty `data/playout/queue`. If the renderer cannot keep up on two cores (§12.4), `--preset superfast` first.
   - `PLAYOUT_VERBATIM=warn` and `PLAYOUT_REVIEW=0` only for this test: with the strict rules almost every news
     programme is held today (without the AI key the offline writer's news is never aired, `offline-writer`, and it
     copies its sources: playout.md §3), and the test would measure filler. Every verdict
     the strict rules would give is still logged (`strict-would-hold` in `data/playout/events.jsonl`); count them for
     the report. Never set them on the real channel without the owner's word.
   - Nothing leaves the machine: no `--rtmp`, `PUBLISH_LIVE` unset.
3. **Measure every minute** into `data/test24/`:
   `node tools/playout/measure.mjs --pid <the run.mjs PID> --dir data/playout --out data/test24/playout.csv --every 60`
   (CPU in cores and memory per part: station, voices, renderer, browser, encoders, playout; load, memory, swap; the
   buffer in minutes; what is on air; filler seconds, underruns, dropped files).
4. **What to watch:**
   - **The buffer** (`data/playout/render-status.json`, `bufferMinutes`): after the first hour it should reach the
     target (60) and stay near it; the renderer then waits (`waiting (buffer full)`). If it never grows, the machine
     renders and voices slower than real time: note the render speed (`speed`) and the CPU per air second the
     renderer logs for every item (`cpuPerAirSecond` in `events.jsonl`, type `rendered`).
   - **Underruns and gaps** (`events.jsonl`, types `underrun`, `filler`, `gap`, `late`, `drop`): each is filler on
     air. A cold start airs about 15 minutes of filler (`--start-lead 900`), then none should follow.
   - **Held programmes** (`held`, and the approval page's tab "Retenidos del aire"): the reasons.
   - **Memory:** the renderer's browser holds a programme's sound while it renders (about 400 MB for WORLD NOW);
     with Kokoro and the station, about 2.5 GB in all. Swap use above a few hundred MB is worth reporting.
   - **Disk:** `du -sh data/playout data/test24` every few hours. The playout keeps the buffer, two hours of aired
     files and the masters for 48 hours (playout.md §8). The test's recording (`data/test24/air`) is about 1.4 GB an
     hour: keep the first and last hour and one every three hours, delete the rest as you go.
5. **Check by eye** (three times: start, middle, end): `node tools/playout/joins.mjs --dir data/playout --out
   data/test24/joins` writes a strip of frames around each recent join and the sound's level across it (look for a
   frame that does not belong, black, or a hole in the level); open one hour file and check the on-screen clock
   against the file's air time, the top row (24/7, never LIVE), picture and lip sync.
6. **Afterwards:** stop `run.mjs` (Ctrl+C or `systemctl stop`); `node tools/playout/report.mjs --dir data/playout --csv
   data/test24/playout.csv --log <run.mjs's log>` sums it up. Report as §5 says, plus: the buffer over the day,
   underruns (how many, how long), render speed and CPU per air second, peak memory and swap, how many programmes the
   strict rules would have held and why.

## 5. Report to the owner (in Spanish, plainly)

- Did it hold for 24 hours? CPU, memory and swap at their peaks; any restart or stall, and why.
- 1080p on this machine (CPU per air second, playout.md §12.4), and what the month's traffic came to (the stream's average
  bitrate: constant quality uses what the programmes need, under the 5.5 Mbit/s cap).
- If it does not hold: the cheapest real fix (voices generated further ahead, a lower encoder preset, or a bigger
  plan: 4 cores and 8 GB). No workaround that lowers what viewers see without saying so.
- For the pre-rendered playout test (§4b): did the buffer reach an hour and stay there; how much filler aired and
  when; what the strict rules would have kept off air.
- Then add the result to `docs/roadmap/LISTA.md` (section H), commit (full suite first) and push.

## 6. The AI writer trial (with the owner's key)

Without an AI key the channel airs the offline writer, which copies its sources, and none of its episodes can be
published (`verbatim.md` §7). The AI writer tells the stories in the channel's own words. This trial shows whether it
does, on this server, with the owner's key.

- **The key: the owner puts it in, never in the chat.** They add these lines to `/etc/globit24.env` on their own screen:
  ```
  OPENAI_API_KEY=<typed by the owner>
  PROVIDERS=openai,mock
  ```
  The second line is there because the Codex CLI is not installed on this server. Then run
  `chown root:root /etc/globit24.env && chmod 600 /etc/globit24.env`. Never `cat`, print or commit the file. The
  station reads it through its systemd unit (`EnvironmentFile=/etc/globit24.env`), or when started by hand with
  `node --env-file=/etc/globit24.env server/index.js`.
- **The trial.** It writes files only and takes about 10–20 minutes:
  ```
  node --env-file=/etc/globit24.env tools/writer/try.mjs --episodes 2
  ```
  - It makes 2 real episodes of each AI-written programme from the live feeds: NEWS IN 60, WORLD NOW, TECH BYTES,
    COSMOS and MONEY MINUTE (`--programmes full-time` adds the draft).
  - The episodes go through the real pipeline: the write, the own-words check and its rewrites, the editor and the fit.
  - It writes `data/writer-trial/<time>/report.txt`, `report.json`, `log.txt` and `episodes/`. Nothing is published,
    streamed, archived or voiced.
- **Reading the report.**
  - `breaking the verbatim rule as aired` must be 0. Each story's copied share (at most 20 %) and longest copied run
    (at most 12 words) are listed.
  - `own words` gives the stories rewritten, cut and dropped, and the rewrites refused. Many drops mean the prompt
    needs work: keep the `[own words]` lines of `log.txt`.
  - `editor (review faults)` is what the standards editor changed: sentences, fields, stories taken out.
  - `by mock (OFFLINE…)` means the AI did not answer (the key, the quota, the network). `calls[].error` in
    `report.json` says why.
  - Tokens and time are given per stage (write, rewrite, review). `A MONTH OF 24/7 AIR` gives the month's tokens on the
    channel's clock and `cost a month = A × P_in + B × P_cached + C × P_out`. Put in the provider's prices per million
    tokens.
- **A manual run without a key** (to read the prompts and answer them by hand):
  `PROVIDERS=inbox,mock AI_INBOX_TIMEOUT_MS=900000 node tools/writer/try.mjs --programmes news-60 --episodes 1`, then
  answer the files in `data/ai-inbox/` (its README says how).
- **A dry run of the tool itself:** `PROVIDERS=mock FEEDS_FILE=config/feeds.fixture.json node tools/writer/try.mjs --episodes 1`.
- **Report it to the owner in Spanish** (section 5): the zero, the drops, and the month's tokens with the formula.

## 7. The beta, published by hand (`docs/publishing/beta.md`)

No live stream; the owner publishes every piece himself from the approval page. On this server:

- In `/etc/globit24.env`: `PUBLISH_MODE=manual`, the owner's `EDITORIAL_CONTACT` and `EDITORIAL_RESPONSIBLE` (he types
  them himself), `C2PA_PYTHON` (§2), and the voices' `VOICE_ENGINE`/`VOICE_PYTHON`. In this mode no adapter calls a
  network, `tools/publish/run.mjs` only re-checks, and `tools/publish/live.mjs` refuses to stream.
- The station keeps running (it reads the news and archives what it airs); the live supervisor does not.
- Each evening, a systemd timer (`OnCalendar=*-*-* 21:30 Europe/London`, `EnvironmentFile=/etc/globit24.env`,
  `WorkingDirectory=` the checkout) runs `node tools/publish/beta.mjs hacer`: the day's light programmes remade from
  the archive with their voices, their clips in vertical, all into `data/publish`. It takes a while (each programme is
  recorded once); its last lines say what the day offers, why the rest is held, and how long each step took. With the
  owner's key (§6) it first writes the day's news programmes fresh from the live feeds with the AI writer, with their
  voices (`BETA_NEWS`: COSMOS DESK, TECH BYTES and FULL TIME by default; `--noticias`, `--ediciones`); without it,
  only PAY ATTENTION gives clips, and it says so. The news gets its cleared pictures from the rights desk, as on air,
  reading the station's decisions ahead of air first (`data/pictures/answers.json`, never written by the beta: its own
  store is `data/publish/pictures/`); `node tools/publish/beta.mjs fotos` shows, without the key, how many of the day's
  candidates have one. It runs at nice 10. If the pre-rendered playout has rendered a
  programme (`RENDERED_MASTERS`, `docs/publishing/pipeline.md` §8), its master is cut instead of recorded (the
  playout renders the horizontal master, `RENDERED_MASTERS=data/playout/masters`, playout.md §6; the beta's clips are
  vertical, so they are still recorded).
- The approval page as a service, `node tools/publish/beta.mjs` (127.0.0.1:8740), reached through the SSH tunnel.
- `node tools/publish/beta.mjs estado` prints the day's offer at any time; `node tools/compliance/cli.mjs launch` the
  launch check (for the beta only `EDITORIAL_CONTACT` and a working C2PA SDK must be in place: `beta.md`).
