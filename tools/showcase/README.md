# Showcase recorder with sound (`tools/showcase/`)

Records the **real GLOBIT 24 channel page** — whatever the server produced live with its AI
provider (offline: the mock provider and the fixture feeds; a showcase: the inbox provider) — into
a broadcast-ready MP4: 1920x1080 H.264 picture, neural voices, every jingle / sting / ident / ad
bed the channel plays, music beds, loudness-normalised AAC. Nothing is hand-authored: the harness
only *records* what the server and the client decide at runtime, so a long programme with many
stories, photos, ads and the change to the next programme is just a longer recording.

```sh
PORT=8602 VOICE_ENGINE=kokoro timeout 1800 npm run demo:offline &   # or the real channel with your providers
node tools/showcase/record-show.mjs --port 8602 --start open --seconds 90 --out /tmp/show.mp4
# a whole programme, its break (ident, ads, promo) and the start of the next programme:
node tools/showcase/record-show.mjs --port 8602 --start open --until next-open+20 --seconds 900 --out /tmp/long.mp4
# two programmes, both breaks and the open of the third (see "A long show" below):
node tools/showcase/record-show.mjs --port 8602 --start open --until next-open+20 --count 2 --seconds 900 --out /tmp/two.mp4
python3 tools/showcase/check-av.py /tmp/show.mp4   # A/V sync measured on the finished file
node tools/showcase/selftest.mjs        # pure checks (cue rules, casting, onset detector)
node tools/showcase/selftest-page.mjs   # browser checks of the page instrumentation (clock, ended, value, speech, windowed render)
```

Outputs next to `--out`:

| file | what |
| --- | --- |
| `show.mp4` | picture + mixed sound |
| `show-sheet.png` | contact sheet: a frame every N s with time, shot, programme / ad, who speaks and what |
| `show-audio.png` | audio picture: voice / server voice / WebAudio / beds / mix levels on the recording clock, shots, music cues, grave and ad zones |
| `show-timeline.json` | every director event, shot, caption, utterance (voice, text, clip, start/end/cut), recorded clip the channel played, music cue, plus the reports (loudness, bed duck, sync, synthesis, page stats) |
| `show-avcheck.json` | written by `check-av.py`: audio offset of the MP4 vs the pre-encode mix, every stinger (wipe frame, whoosh, cut frame, thump) and every caption (frame vs voice onset) |
| `show.work/` | stems (`voice.wav`, `speechbus.wav`, `webaudio.wav`, `beds.wav`, `mix.wav`, `mix.m4a`), `mix.json` (kept; `--keep` also keeps the raw float renders and the lossless native-size video) |

## Voices: two paths, both recorded

- **Server voices (the production path, `--voices auto`, default).** With `VOICE_ENGINE=kokoro` the
  server's pipeline synthesises every segment (and every advert line) with the channel's casting
  before air and the episode carries `seg.audio`. The page plays those clips itself through WebAudio,
  so the WebAudio capture records them, sample-exact, with the channel's own speech bus, captions,
  mouths and ducking. Anything the page still speaks through `speechSynthesis` (a clip that was not
  ready, an advert line without a recording) goes to the harness voices below.
- **Harness voices (`--voices harness`, or a server with browser voices).** The URL gets
  `voices=browser`, so every line goes through the fake `speechSynthesis` and is synthesised here
  with Kokoro, **with the same casting the server uses**: presenters from `server/voice/casting.json`
  (voice blend, speed, lang, pauses, UNIT-8's robot effect), advert voice-overs from
  `server/voice/adcast.json` (per ad, else a default per gender and accent); `tools/voice/presets.json`
  and the default cast are fallbacks.

## A long show (many stories, photos, ads, the change to the next programme)

The harness never writes a programme: it records what the server produces live. For a long
showcase, let the server work a few episodes ahead, then record several programmes in one go:

```sh
# 1. the channel: offline (mock writer, fixture feeds and photos) or with the inbox provider, where an
#    agent answers the server's real prompts (PROVIDERS=inbox,mock: the mock takes over on a timeout)
QUEUE_SIZE=3 VOICE_ENGINE=kokoro PORT=8602 timeout 5400 npm run demo:offline &
# 2. wait until the queued episodes carry their server voices (every spoken segment has `audio`):
curl -s http://127.0.0.1:8602/api/queue | python3 -c "import json,sys; print([(e['program']['id'], all(s.get('audio') for s in e['segments'] if s.get('text'))) for e in json.load(sys.stdin)])"
# 3. record from the next open through N programmes and their breaks, 20 s into the next programme
node tools/showcase/record-show.mjs --port 8602 --v2 --start open --until next-open+20 --count 2 \
  --seconds 900 --max-wait 120 --out show.mp4
python3 tools/showcase/check-av.py show.mp4
```

The page clock runs faster than real time when nothing needs synthesis (a 209 s show records in
~70 s), so the recording can overtake production: `QUEUE_SIZE` should cover every episode the
recording will reach (`--count` + 1), and step 2 makes sure their voices are rendered (otherwise the
harness voices those lines itself, with the same casting, and the clock waits for Kokoro).

## How it works

1. **Deterministic picture.** Playwright's fake clock is installed *paused* (`clock.install` then
   `clock.pauseAt`: after a plain `install()` time keeps flowing in real time). Page time only moves
   when the recorder calls `clock.runFor(1/fps)`; `#screen` is grabbed after every step and piped as
   PNG to a lossless native-size file; the nearest-neighbour 5x H.264 encode runs once at the end,
   with the mux. The page renders once per video frame (the fake clock ticks rAF every 16 ms; the
   second render of each frame is skipped). Before each step the recorder waits for fetches, image
   loads and **audio decodes** in flight (tracked by the init script), so replies land at the fake
   time they were asked for, and for any voice the page is waiting for.
2. **WebAudio capture** (`page-init.js`). `window.AudioContext` is replaced by an
   `OfflineAudioContext` subclass whose `currentTime` follows the fake clock, `state` is always
   `running` and `resume/suspend/close` resolve. Every factory and node constructor registers its
   node's AudioParams, so `param.value = v` becomes `setValueAtTime(v, now)` (offline it would apply
   from t = 0) and `param.value` reads the automation timeline (as a live context would).
   `disconnect()` is a no-op on captured nodes (offline it would delete the node for the *whole*
   render). **`ended` fires on the fake clock**: a live context fires it when a source stops, an
   offline one only while rendering (after the recording) — and the engine waits for it (a recorded
   voice holds its segment until `src.onended`). Captured sources get it at start + buffer length /
   playback rate, or at `stop()`, whichever comes first; the offline render's own `ended` never
   reaches the page. After the last frame the context is rendered through an AudioWorklet tap that
   keeps only the recorded window (a second tap on the engine's **speech bus** gives the server
   voices as a separate stem for the duck reference and the caption check): open themes, ad beds,
   stingers, idents, promo and sign-off cues, sfx, recorded voices — with the channel's own ducking —
   land sample-exactly where the picture has them.
3. **Harness voices.** A fake `window.speechSynthesis` offers en-GB / en-US male and female voices,
   so the engine stays in `tts` mode and runs its real code (sentence split, speech normaliser,
   timelines, captions, mouth sync). `speak()` calls a Playwright binding (`__scSpeak`) that starts
   the Kokoro synthesis at once, with the slot speaking, the presenter cast in it (read from the
   director's scene) and the ad on air; the clock is **held** until the result is delivered (duration
   + word times); `start`, `boundary` (one per word) and `end` then fire on the fake clock 45 ms after
   the call, so the director, captions and mouths follow the real audio. `cancel()` truncates the
   clip (and the mix cuts it there) and reports `interrupted`.
   - Engine: `voice_worker.py` uses the voice stream's `tools/voice/engine.py` (phrase planning,
     pauses, broadcast chain at -16 LUFS, phoneme-weighted word times) and falls back to plain
     kokoro-onnx if it fails to load or fails a request. Clips are cached by (engine, presets, text,
     voice, speed, lang, effect, pauses) in `~/.cache/globit-showcase/voices` (`--cache`).
   - Prefetch: when an episode or an ad starts (and the next queued episode once a break starts), the
     page predicts every sentence the engine will speak with the engine's own splitter and normaliser;
     `--voice-workers` (default 2) synthesise them in the background, so the clock rarely waits.
     Lines the server already recorded are not prefetched.
4. **Music beds** (`lib/music.mjs`). The music stream has not wired a bed engine into the channel yet,
   so the director's timeline is turned into the calls it will make (`open`, `headlines` per headline
   line + `pip`, `greeting`, one segment moment per segment — `story` with emotion/grave/breaking,
   `roundup`, `number`, `finally`, `chat`, `outro` — `signoffEnd`, `endcard`, break silence, `ad`,
   `upNext`, `standby`) and rendered offline with the proposal's own engine (default
   `public/js/music/proposals/lofi`, `--music broadcast` for the other one, `--music none` to skip).
   Sentences of the server's recorded voices are read from the captions (each appears as its first
   recorded word is heard) and the speech-bus stem (last sound before the next caption), so headline
   lines, pips and the last word of the sign-off land on the real voice. The proposal's cue sheet
   decides what plays per programme (style bibles): grave stories and the segment after them get no
   bed, ads and idents carry their own music. **Once the music stream integrates its engine into the
   channel, the WebAudio capture records the beds by itself: use `--music none`.**
5. **Mix** (`mix.py`). Harness voices (24 kHz, polyphase-upsampled) placed sample-exactly + WebAudio
   (with the server voices in it) + beds. On top of the bed engine's own duck an extra duck makes every
   voice sit **>= 16 dB** over the bed (lead 0.12 s, hold 0.35 s, release 0.7 s; deeper where the engine
   ducked less). The bed keeps the composer's calibration against -16 LUFS voices (`--bed-under-voice N`
   re-levels it to sit N dB under the voice instead). Then gain to **-16 LUFS** and a
   look-ahead true-peak limiter (4x oversampled), verified on the decoded AAC (**TP <= -1.5 dBTP**),
   re-run until both hold. The report includes the bed duck measured against the same cues rendered
   without speech, and the bed level inside grave stories and ads.
6. **Checks** (`lib/analysis.mjs`, in the timeline report): each stinger's whoosh onset in the
   WebAudio stem vs. the picture's wipe start and its thump vs. the cut; each caption vs. the first
   word of its harness voice (`captionLeadMs`) or vs. the onset of the server voice on the speech bus
   (`recordedCaptionToVoiceMs`); each harness clip's audible onset vs. its start event.
7. **File check** (`check-av.py`, run on the finished MP4, independent of the recorder's own report).
   Decodes the picture back to native 384x216 (the 5x encode is nearest-neighbour) and the AAC
   through ffmpeg (edit list applied, so encoder priming counts) and measures: the audio offset of
   the MP4 against `mix.wav` by cross-correlation; for every stinger the first frame the wipe
   changes, the whoosh onset (on the WebAudio stem; reported as masked when other channel sounds are
   already loud, e.g. over the end-card theme), the frame of the cut (the timeline's next shot,
   confirmed by the changed pixels) and the thump (steepest rise in the mix); for every caption the
   frame its block rolls in (white glyphs counted in the caption column) and the voice onset after it
   (on the voice stems, which `mix.py` sums at the same sample indices). `--frames DIR` writes the
   frames around the first stinger and the first two captions for a look.

## Options

`--start now|open|break|endcard` (begin at the next programme open / break / end card),
`--skip N` (channel seconds to run first), `--until next-open+S|break-end+S|episode-end+S`
(stop S s after that event; `--seconds` is then the cap), `--count N` (stop at the Nth such event:
N programmes), `--max-wait N` (seconds of channel time
allowed to reach `--start`, default 240), `--fps 30 --scale 5`, `--voices auto|harness`, `--v2`
(adds `v2=1`: the wave-2 presenters/studio), `--music lofi|broadcast|none`, `--bed-db` (bed trim,
default 0), `--bed-under-voice N` (re-level the bed N dB under the voice; default off: the composer's level),
`--duck-db` (minimum extra bed duck on top of the >= 16 dB rule, default 0), `--stories soft|off|drone` (lofi's
bed under light/neutral story copy, default soft),
`--lufs -16`, `--tp -1.5`, `--voice-workers 2`, `--voice-engine auto|fallback`, `--cache DIR`,
`--time ISO` (the wall-clock time the channel shows), `--sheet-every S`, `--url URL`,
`--preset veryfast` (x264 preset of the final encode), `--measure-duck` (render the beds a second time
without speech to measure the duck; on by default up to 900 s), `--no-raf-throttle`, `--keep`.

## Notes and limits

- The skip / start-wait phase runs the clock in 50-100 ms steps with *estimated* harness speech
  (natural pace, no synthesis); recording starts in `tts` mode with real voices. With `--start now` a
  sentence in progress at the start stays silent.
- The OfflineAudioContext length is fixed when the page unlocks audio:
  `max-wait + skip + seconds + 30` s at 48 kHz (~23 MB per minute of stereo float). Long shows: set
  `--seconds` to the cap you need (with `--until` it is only a cap). The render tap posts only the
  frames inside the recorded window (in 4096-frame batches), so minutes of waiting before `--start`
  cost render time but no main-thread traffic.
- What the beds do is the proposal's per-programme cue sheet, which follows the style bibles: WORLD
  NOW speaks its lead stories, the number and the sign-off dry (bed under the headlines, the round-ups,
  And Finally and the chat after it); TECH BYTES, MONEY MINUTE and NEWS IN 60 keep a bed under the
  outro; grave stories and the segment after a grave or breaking one are always dry; breaks, idents,
  ads and promos carry their own music. `--stories off` drops the soft bed under light story copy.
- `AnalyserNode` reads return silence offline; the engine drives the jaw of a recorded voice from the
  clip's own `levels` envelope (voice service), so mouths still follow the real loudness.
- Synthesis speed depends on machine load: Kokoro runs about real time on an idle 4-core box, and
  6-10x slower when the box is saturated. Server voices cost the recorder nothing; the harness cache
  makes re-recordings of the same episodes free.
- Nothing in `public/` or `server/` is modified: `main.js` is served to the recorder with one extra
  line that exposes `audio`, `player`, `renderer` and `scene` to the instrumentation.
