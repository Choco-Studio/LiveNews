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
**traffic** (a 24/7 stream at 1080p and 4.5 Mbit/s is about 1,500 GB a month; at 720p and 3 Mbit/s about 1,000 GB).

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
- **Models** (into `data/models/`, git-ignored): `tools/voice/fetch-models.sh` (Kokoro, about 350 MB, from GitHub
  releases, checked by SHA-256); the face reader fetches its own two models on first run (`tools/pictures/faces.mjs`).
- **Swap:** a 4 GB swap file (`fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile`,
  plus the `/etc/fstab` line) so a memory peak slows the machine instead of killing a process.
- **Firewall:** `apt install -y ufw && ufw allow OpenSSH && ufw enable` (check that SSH still works before closing the
  console).

## 3. Check the install

- `npm test` must pass in full, as on the cloud machine (2,955 tests on 17 Oct; on 2 cores expect 10–15 minutes).
- `tools/voice/fetch-models.sh --check` and one voice line through `tools/voice/say.py` (then delete the file).
- Start the station once (`PORT=8080 VOICE_ENGINE=kokoro VOICE_PYTHON=... node server/index.js`), open
  `http://127.0.0.1:8080/api/status` with curl, and stop it.

## 4. The 24-hour test (files only)

Run the station and the live supervisor under systemd (or tmux) so they survive a closed console:

```
PORT=8080 VOICE_ENGINE=kokoro VOICE_PYTHON=$HOME/globit/venv/bin/python node server/index.js
node tools/publish/live.mjs --url "http://127.0.0.1:8080/?autostart=1&voice=tts" --out data/test24/live-{n}.flv --for 86400
```

- **Two runs if time allows:** first at 1280×720, 3000k video (the likely choice for this traffic allowance), then
  1920×1080, 4500k. `tools/stream.mjs` takes `--size` and `--bitrate`; if `live.mjs` does not pass them through, add
  that with a test.
- **Disk:** a day of 720p at 3 Mbit/s is about 33 GB. Keep the first and last hour and a sample every 3 hours; delete
  the rest as you go.
- **Measure every minute** into `data/test24/` (CSV): CPU per process (browser, ffmpeg, node, the voice worker), RAM
  and swap in use, load average; and from the logs: the encoder's speed (must stay ≥ 1.0x), dropped or duplicated
  frames, stalls and restarts by the supervisor, and whether the voices stay ahead of what airs.
- **Watch by eye:** pull three short pieces (start, middle, end) and check picture, sound and lip timing.

## 5. Report to the owner (in Spanish, plainly)

- Did it hold for 24 hours? CPU, memory and swap at their peaks; any restart or stall, and why.
- 720p or 1080p on this machine, and what that means for the monthly traffic.
- If it does not hold: the cheapest real fix (voices generated further ahead, a lower encoder preset, or a bigger
  plan: 4 cores and 8 GB). No workaround that lowers what viewers see without saying so.
- Then add the result to `docs/roadmap/LISTA.md` (section H), commit (full suite first) and push.
