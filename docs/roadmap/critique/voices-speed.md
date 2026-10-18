# Voices — speed round (18 Oct)

**Why.** The owner's server has 2 fast cores and 4 GB. The pre-rendered playout (`docs/publishing/playout.md` §10)
measured about 1.1 CPU-seconds of rendering per second of air and about 1.5 CPU-seconds of Kokoro per second of speech
(about 1.1 per second of air): half of the 2.3 CPU-s a second of air costs, and the bottleneck (0.85x real time on two
cores; the hour of buffer cannot hold). **Goal: voices at least 1.5x cheaper in CPU with no audible loss.** The owner
chose these voices with care (`voices-naturalness.md`); nothing here changes a voice, a speed or the processing chain,
and "no audible loss" is measured, not claimed.

**Result.** With the same samples as before (identical, or within one 16-bit step), the voices cost **1.04 CPU-s per
second of speech instead of 1.49: 1.43x cheaper**, beside a busy renderer on two cores. That is just short of the
1.5x asked. Most of it is onnxruntime's thread pool: its two spinning threads fought the renderer for the two cores,
and one thread does the same work cheaper and no slower. A cheaper broadcast chain and a cache of short phrases add the
rest. The one option that goes past 1.5x, the release's smaller "fp16" weights (0.86, **1.73x**), measurably reads a
little less naturally (predicted listening score −0.08, not better on 244 of 256 lines), so it is off, one line away
(`VOICE_MODEL=fp16`) for the owner to try by ear. A second of air drops from about 2.3 to 2.0 CPU-s: on two cores
like these, from 0.86x to 1.01x real time (1.12x with the playout's rendering switches).

## How it was measured

- **The machine**: the cloud machine (4 cores of a 2.8 GHz Xeon with AVX-512 VNNI, shared with other sessions; load
  0 to 7 during the runs). Every speed run was pinned to **two cores** (`--cpus 0,1`), and the runs that imitate the
  station kept **one busy loop on the same two cores** for the whole run (`--hog 1`: the renderer's browser and
  encoder take about a core). CPU seconds are counted over all the process's threads plus the Ogg/Opus encode, so
  they carry over to other machines better than wall time does.
- **The tool**: `tools/voice/bench.py` (new). Every request goes through the worker's own path
  (`engine.VoiceEngine.speak`, the loudness envelope the service asks for, the `.ogg` it writes), one at a time, after
  a warm-up line, and is timed by part: the model (onnxruntime), phonemes, the broadcast chain, the encode, the rest.
- **The lines**: the station's own requests, planned exactly as the service plans them (`server/voice/plan.js`
  `segmentRequest` with the speechtext planner), for the eight main presenters (Paco, Lola, Max, Ada, Nova, UNIT-8,
  Penny, Sam):
  - the **speed set**, 24 lines (each presenter's own audit line from `tools/voice/audit-lines.json`, one story and
    one short line from the day below), 233 s of speech;
  - the **quality set**, 256 lines: 32 per presenter (the 7 audit lines and 25 lines of the day, 8 of them short),
    about 2,400 s of speech.
- **The day**: `tools/lengths/replay.mjs` on the channel's archive, 16 Oct 14:00 to 17 Oct 14:00 UTC: the 190
  editions the station aired that day (74 WORLD NOW, 49 NEWS IN 60, 33 TECH BYTES, 28 COSMOS DESK, 6 MONEY MINUTE)
  written again by the station's producer with the offline writer, every spoken segment planned as the service plans
  it: 2,682 clips. (WORLD WEATHER and SEVEN DAYS are not in the archive.)
- **Quality**: the measures of the naturalness round, on the quality set rendered both ways
  (`tools/voice/audit.py measure` with the same scorer: a predicted listening score, the neural MOS predictor of the
  VoiceMOS 2022 challenge's strong learner, and the word error rate of an offline speech recogniser), and the new
  `audit.py compare`: whether the samples are identical, the duration drift, the median pitch and its spread, the
  speech level and its spread, and clicks, clip by clip.

## The baseline

The settings until today: the full-precision weights, and onnxruntime's own thread count, one spinning thread per
core (two on the owner's machine). Speed set, CPU-seconds per second of speech:

| | quiet (2 free cores) | beside a busy core |
| --- | --- | --- |
| **2 threads, spinning (the old default)** | 1.22 (1.19, 1.25), 1.5x real time | **1.49** (1.46, 1.55, 1.50, 1.51, 1.45), 0.8x real time |
| 1 thread (the new default) | 1.07 (1.05, 1.09, 1.07), 0.93x | **1.07** (1.08, 1.04, 1.09, 1.09, 1.07, 1.08, 1.04), 0.9x |
| 2 threads, not spinning | 1.14 (1.08, 1.20), 1.3x | 1.22 (1.27, 1.17), 0.8x |

Per character, beside a busy core (speed set, 3 lines each):

| | Paco | Lola | Max | Ada | Nova | UNIT-8 | Penny | Sam |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2 threads, spinning | 1.49 | 1.40 | 1.45 | 1.64 | 1.48 | 1.58 | 1.47 | 1.60 |
| 1 thread | 1.08 | 1.04 | 1.05 | 1.13 | 1.04 | 1.12 | 1.03 | 1.06 |
| 2 threads, not spinning | 1.20 | 1.17 | 1.17 | 1.30 | 1.20 | 1.27 | 1.21 | 1.31 |

The old default's 1.49 matches what the playout measured on a loaded machine (1.5). Where it goes (one thread): the
model **92 %**, the broadcast chain 5 %, the Ogg/Opus encode 1.6 %, phonemes and timing 0.2 %. UNIT-8 costs a little
more (the robot chain) and Ada and Sam a little more per second (shorter lines: each Kokoro pass has a fixed cost of
about 0.15 CPU-s on top of 0.96 per second of speech).

## The candidates

| Candidate | CPU-s per speech-s, beside a busy core | The audio | Verdict |
| --- | --- | --- | --- |
| **One onnxruntime thread** (no pool to spin) | 1.49 → **1.07** (1.39x) | identical: 16 of 24 clips sample for sample, the rest within one 16-bit step (92–104 dB under the signal, below the dither the file writer adds) | **default** |
| Two threads without spinning | 1.22 | identical (as above) | for a machine with an idle core: 1.3–1.5x real time, ~7 % more CPU quiet, 14 % beside a busy core; spinning off by default for anyone who sets 2 |
| Graph optimisation `extended` (default `all`) | 1.05 | identical | no gain (within the runs' spread) |
| Graph optimisation `basic` | 1.13 | not identical (unfused operators round differently) | slower |
| Memory arena off | 1.16, and 1.41 GB at peak instead of 1.02 | identical | slower and bigger |
| Denormals flushed to zero | 1.05; paired, four times each: model 0.973 (0.954–0.984) against 0.965 (0.960–0.972) | identical | no gain |
| **The release's "fp16" weights** | **0.89** (0.82 model): −17 % on the model, −14 % per line | **not identical, measurably a little less natural**: listening score −0.08 (better on 12 of 256 lines), read 1.9 % slower, melody 0.2 st flatter (below) | **behind `VOICE_MODEL=fp16`, off** |
| The release's int8 weights | **2.53** (2.4x the cost), 0.38x real time | not identical: pitch −0.25 st, its spread −0.16 st, listening score −0.04 on the speed set (better on 3 of 24 clips) | slower here: a switch for other machines only |
| **Broadcast chain** (`dsp.py`, `loudness.py`) | chain 0.055 → **0.042** (−24 %), about 1 % of the total | identical (bit for bit on the 24 clips; tested) | **default** |
| **Phrase cache** (short phrases said again) | −3.2 % of the model CPU left after the clip cache (the day) | identical (the same samples; tested) | **default** (64 MB) |
| Clip cache (already there) | 30 % of the day's speech is said again whole and is never voiced twice | identical | unchanged |
| Pre-warming the banks in idle time | at most 0.2 % of a day | — | not built |
| Batching phrases into one pass | would save the fixed cost per pass | changes the reading: each phrase is its own pass so the timing and the melody hold | not done |
| Shorter generated silence | 14 % of what Kokoro generates is trimmed silence (0.17 s before a phrase, 0.34 s after) | only by changing the model's input or graph, so the audio | not done |

### Threads

Onnxruntime gives the model one thread per core, and its pool threads **spin** while they wait for work. Beside a
busy renderer the two threads take turns with it on two cores: each barrier waits for a thread that is not running,
and the spinning one burns its turn. One thread does the same work with no barrier: **1.07 CPU-s per speech-s at
0.9x real time, against 1.49 at 0.8x**: cheaper and faster on a busy machine. Two threads only help while a core is
idle (1.5x real time quiet), which on the owner's server happens only once the buffer is full. The samples do not
depend on it: onnxruntime splits the work differently, not the arithmetic (the last bit of a few sums moves).

### The broadcast chain

5 % of the cost. Profiled on the speed set's dry clips: the loudness normalisation (true peak by 4x oversampling,
gated loudness) was 36 % of the chain, UNIT-8's vocoder most of his. Three changes, each the same numbers computed
once (checked bit for bit on the 24 clips; `test_cached_buzz_and_k_weighting_are_the_same_numbers`):
- the K-weighting filter's response was built again on every FFT bin for each of the four or five loudness
  measurements of a clip: it is kept for the next measurement of the same length (`loudness._k_response`);
- the limiter oversampled a clip twice when it was over the ceiling (once to check, once to limit): one serves both;
- UNIT-8's buzz (about a hundred cosines over every sample) is sliced from one long copy per pitch (`dsp._buzz`).

The chain went from 0.055 to 0.042 CPU-s per speech-s (to 0.039 on a quiet machine). What is left is FFTs the chain's
design needs.

### Caching

- **The clip cache** (`server/voice/cache.js`, keyed by the request, the recipe and the engine's fingerprint) already
  catches whole lines said again: on the day, **920 of 2,682 clips (34 %), 30 % of the speech** by characters. It is
  mostly the sign-offs (97 % of outros), the openings of NEWS IN 60, and stories the offline writer tells again in the
  next edition with the same sentences. The day was written by the offline writer without the articles' dossiers, so
  its programmes are short and its sentences repeat more than the AI writer's will: an upper bound. On real feeds, in
  the 95-minute playout test of 17 Oct, 28 of 182 clips came from the cache (15 %; 11 of 154, 7 %, without one
  programme the cache knew from an earlier test).
- **Phrases** (new, `engine.PhraseCache`): a short phrase said again inside a clip that is new as a whole ("Thanks,
  Paco." before a new story, "And finally:", "Still to come:", "Our number of the day:", a sign-off in another melody).
  Each phrase is one deterministic Kokoro pass, so its raw samples are stored (`data/voice/phrases`, float32, keyed by
  the phonemes, the voice's style, the speed, the weights, the session and the library versions) and used instead of a
  new pass. Only phrases of up to about 80 characters are kept (1,791 distinct ones a day, 418 said again); the least
  recently used go past 64 MB. On the day it saves **4.5 % of the characters still voiced after the clip cache (2.7 %
  from the short phrases it keeps), 3.2 % of the model CPU**.
- **Pre-warming** the banks in idle time would only save the first time each formula is said: the first sign-off and
  greeting of each kind on the day are **0.2 %** of the speech voiced; stories cannot be known ahead. Not built.

## No audible loss: fp16 against the full-precision weights

Every change made default above gives the same samples (identical as 16-bit PCM, or within one 16-bit step for the
thread count), so there is nothing to hear. The release's smaller weights are another matter. Its "fp16" file is not
plain half precision: onnxruntime's profiler shows **306 of its 528 convolution runs as 8-bit `QLinearConv`**, with
`DequantizeLinear` around them. That is where its speed comes from on a CPU with no half-precision arithmetic (8-bit
convolutions run fast with AVX-512 VNNI; on a CPU without it the gain may be smaller), and why it does not sound the
same. Convolutions are 64 % of the full-precision model's time and already run on onnxruntime's best CPU kernels,
so there is no identical-sounding share of that speed to take.

The quality set, 32 lines per presenter, rendered with both weights through the same engine (one thread), measured
with the naturalness round's scorer and `audit.py compare`:

| | Listening score fp32 → fp16 | fp16 better on | Word error rate | Duration | Median pitch | Pitch spread | Level | Clicks |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Paco | 4.29 → 4.19 (−0.10) | 3 of 32 | 0.056 → 0.065 | +1.5 % (max 4.3) | −0.20 st | −0.21 st | +0.17 dB | 0 → 0 |
| Lola | 4.45 → 4.41 (−0.04) | 2 of 32 | 0.103 → 0.101 | +0.6 % (max 2.6) | −0.20 st | −0.16 st | +0.13 dB | 0 → 0 |
| Max | 4.39 → 4.30 (−0.09) | 2 of 32 | 0.061 → 0.057 | +1.5 % (max 3.6) | −0.09 st | −0.23 st | +0.06 dB | 0 → 0 |
| Ada | 4.39 → 4.26 (−0.13) | 0 of 32 | 0.041 → 0.050 | +2.1 % (max 7.7) | −0.19 st | −0.25 st | +0.10 dB | 4 → 0 |
| Nova | 4.48 → 4.44 (−0.04) | 0 of 32 | 0.049 → 0.053 | +1.6 % (max 7.3) | −0.10 st | −0.11 st | +0.10 dB | 2 → 1 |
| UNIT-8 | 2.71 → 2.57 (−0.14) | 2 of 32 | 0.033 → 0.035 | +6.1 % (max 10.2) | −0.03 st | −0.02 st | +0.02 dB | 0 → 1 |
| Penny | 4.44 → 4.42 (−0.02) | 3 of 32 | 0.107 → 0.108 | +0.3 % (max 2.7) | −0.16 st | −0.29 st | +0.12 dB | 0 → 1 |
| Sam | 4.36 → 4.29 (−0.07) | 0 of 32 | 0.062 → 0.069 | +1.5 % (max 4.2) | −0.21 st | −0.30 st | −0.11 dB | 0 → 0 |
| **All** | **4.19 → 4.11 (−0.08)** | **12 of 256** | 0.065 → 0.068 | **+1.9 %** (max 10.2) | −0.15 st | −0.20 st | +0.07 dB | 6 → 3 |

(UNIT-8's low score is his robot chain, which the predictor dislikes on either weights.) The loss is small but
consistent: not better on 244 of 256 lines, for every presenter, about half of what the pitch bend cost before the
naturalness round removed it (0.15). Every presenter also reads a little slower (the duration predictor moves) with a
slightly flatter melody, and UNIT-8 6 % slower, which shifts the writers' timings. No new artefact: the click
detector found fewer clicks, not more, and the loudness is within 0.2 dB. **By measurement fp16 is not
indistinguishable, so it is not the default.** It stays one line away for the owner, who may hear no difference:
the A/B pairs are for that. The 8-bit file measured the same size of loss on the speed set (−0.04 there, fp16 −0.04
on the same lines) and is slower here anyway.

## What changed and what waits

**Default now** (all measured identical to before):
- one onnxruntime thread (`KOKORO_THREADS` empty or 0; `auto` gives onnxruntime's own choice), spinning off, the
  graph fully optimised, the memory arena on (`tools/voice/engine.py` `SESSION_DEFAULTS`, `session_settings`);
- the broadcast chain's three savings;
- the phrase cache (`VOICE_PHRASE_CACHE_MB`, 64; 0 turns it off).

**Waits for the owner**: `VOICE_MODEL=fp16` (`tools/voice/fetch-models.sh --model fp16`, 169 MB). On the numbers it
is a little less natural, so it is not recommended; it is there because the owner's ears outrank a predictor. The
A/B pairs are in the handover (`para-el-dueno/voces-velocidad/`): three short lines per main presenter, A and B in a
drawn order, the key and these measurements in `CLAVE.txt`. If he hears no difference, or prefers fp16, set
`VOICE_MODEL=fp16`; the cache keeps the two renditions apart (the worker reports the weights it loaded and the service
names the clips by them), so going back is taking the line out. The writers' timings would move by the slower read
(+1.9 %, UNIT-8 +6 %).

**The cache re-renders once**: the engine's files changed, so every clip is voiced again the first time it airs (the
voices themselves are the same).

## The cost per second of air (the playout, 2 cores)

Speech is about 0.75 s of a second of air (playout.md §10). On cores like these, CPU-seconds per second of air:

| | Before | Now (defaults) | With fp16, if the owner approves it |
| --- | --- | --- | --- |
| Rendering (browser, encoders, node) | 1.10 | 1.10 | 1.10 |
| Voices (0.75 s of speech) | 1.12 (at 1.49) | **0.78** (at 1.04: 1.07 measured, less the phrase cache's 3 %) | 0.65 (at 0.86) |
| Station and playout | 0.10 | 0.10 | 0.10 |
| **Total** | **2.32** | **1.98** | 1.85 |
| **On 2 cores** | 0.86x real time: the buffer drains | **1.01x**: it stops draining, with no margin | 1.08x |
| ... with `--no-twin --preset superfast` (−0.2 of rendering) | 0.94x | **1.12x** | 1.21x |

The voices go from half of a second of air's cost to 40 %. Lines said again whole are never voiced twice (the clip
cache: 7–15 % of clips on real feeds, up to 30 % of the speech on an offline-writer day), which lowers the voices' row
further, by an amount only the station's own log can say. If the owner's cores are 25 to 30 % quicker than these
(playout.md §10), the default is about 1.25–1.3x and 1.4x with the rendering switches. The 24-hour test
(server-setup.md §4b) decides; `server-setup.md` §3b measures the voices on the server first.

## Not measured

- **The owner's CPU.** These are a cloud Xeon's numbers. `server-setup.md` §3b measures the same on the server in five
  minutes; the ratios between settings should hold, the absolute numbers will not. On a CPU without AVX-512 the 8-bit
  and half-precision results may differ (both depend on the instructions onnxruntime finds).
- **The AI writer's day.** The hit rates are the offline writer's; the station's own log (`[voice] ...: N/M clips
  (K cached)`) gives the real ones.
- **Human ears.** The listening score is a model of people's ratings; the owner's A/B decides fp16.
