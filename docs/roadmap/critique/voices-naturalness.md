# Voices — naturalness round (16 Oct)

The owner, after watching the new programmes: "La voz de la chica de camiseta roja suena fatal" (PAY ATTENTION's
host, `qm`, candidate A in the crimson blazer) and "las voces de los nuevos programas necesitan más naturalidad. Los
nuevos personajes tienen voces algo artificiales. Haz una ronda que mejore todas las voces de forma real." **Gate:
above 9.7 on a hostile critique; nothing counts as done below it.** No breaths, no laughter (the owner's rules);
UNIT-8 stays the soft robot he chose.

The panel: a **voice director** (casting, delivery, character), a **sound designer** (processing, artefacts,
loudness), a **senior broadcast director** (pace, distinctness on air, the programmes as a whole) and a **first-time
listener** (anything that sounds odd, foreign where it should not, robotic or "AI-made").

Six categories, each 0–10; **the round's score is the lowest category**:

- **naturalness**: measured where it can be (a predicted listening score, the accent a classifier hears, Kokoro's
  own grade of the voice in the lead, the processing's A/B), argued where it cannot;
- **intelligibility**: a speech recogniser's word error rate on the channel's own copy;
- **distinctness**: the timbre distance between every two voices, strictest between the people of one programme;
- **consistency** with each character's look and role: the accent the config gives them, the gender of the look,
  the pace and pitch their personality asks for;
- **robustness**: the voice service still works, falls back to the browser voice without Kokoro, and caches; the
  owner can have any old voice back in one step;
- **tests**.

**What is measured and what is not.** Every number below was measured by a machine on audio rendered through the
channel's own engine (`tools/voice/engine.py`, the broadcast chain at −16 LUFS). None of it is a human ear. A
predicted listening score is a model trained on people's ratings of synthetic speech; it hears processing damage and
roughness well and an accent hardly at all (it scored the old host, a Japanese voice reading English, 4.15). The
accent classifier hears accents, not quality. The recogniser forgives a great deal. **Naturalness is finally the
owner's ears**: the samples listed at the end are for that.

## How it was measured

- **The copy** (`tools/voice/audit-lines.json`): the channel's own lines. Four read by every voice (a WORLD NOW story
  from the archive of 14–16 Oct, a PAY ATTENTION question from the quiz's scripts, an analyst's answer with the
  experts' own frame, a FULL TIME result), so the voices are compared on the same words; and two to four of each
  character's own programme (archive stories, the quiz's host lines, Kai's and Rosa's banks, the experts' answers,
  the correspondents' links, the bumper's two lines). The re-staged guests' voices read the four shared lines.
- **The requests** (`tools/voice/audit-requests.mjs`): planned exactly as the station plans a segment
  (`server/voice/plan.js` `segmentRequest` with the speechtext planner: the newsreader text, phrasing, pauses and
  melody), then rendered by the worker's own engine (`tools/voice/audit.py render`).
- **The measures** (`tools/voice/audit.py measure`), per clip, averaged per voice:
  - **word error rate**: an offline neural speech recogniser (a large English-only open model, int8 on the CPU),
    both transcripts normalised the same way (numbers, money and spelling forms; digits compared one by one, round
    4), errors over the reference's words.
    The recogniser now and then skips a whole sentence of a long clip (its long-form decoding jumps ahead: on the
    quiz question it dropped "Smart ring maker… blank." for two voices whose audio holds all of it); when a transcript
    falls well short of the text, the clip is heard again phrase by phrase, as the engine made it, and the closer
    transcript counts;
  - **a predicted listening score** (1–5): a neural MOS predictor trained on listening tests of synthetic speech
    (the strong learner of the VoiceMOS 2022 challenge), run offline;
  - **accent**: an English-accent classifier (16 accents, trained on Common Voice), run offline: the score of the
    accent the character's config gives (England for en-GB; the US or Canada for en-US) minus the best accent that
    is none of England, the US or Canada (India, Africa, Singapore...). A native English voice scores 0.25 to 0.5;
    a voice of another language reading English scores near zero or below;
  - **timbre**: the 40-band log-mel cepstrum (coefficients 1–12, dB) averaged over the speech frames of the four
    shared lines, and the distance between two voices' averages (`tools/voice/metrics.py` `timbre_distance`,
    scaled so the earlier castings' figures read the same: Clara–Ines 35 here, noted 32–37 then);
  - **pace** (characters a second, the writers' timing unit), **pitch** (median F0, its spread), and two signs of
    processing damage: the **aperiodicity** at the period and the **harmonics-to-noise ratio** of the voiced frames.
- The recogniser, the score predictor and the classifier are downloaded models: they are not part of the channel,
  and the audit runs without them (`--scorer` plugs them in). Kokoro's own grade of each voice comes from the model's
  release notes (`tools/voice/voice-grades.json`).

## Round 1 — the cast as it was (16 Oct, before any change)

Every voice of `server/voice/casting.json` and the host's three candidates, on the audit copy, through the engine as
it was (175 clips). The panel's findings, each from a measurement:

1. **The host's three candidates were voices of other languages reading English.** A: jf_gongitsune 70% + pf_dora
   (Japanese and Brazilian Portuguese); B: hm_psi (Hindi); C: jf_nezumi 65% + pf_dora. On the pure voices, the
   accent classifier hears hm_psi as Indian English (−0.25), jf_nezumi as foreign (−0.12), pf_dora barely English
   (+0.05); the predictor scores jf_gongitsune 3.78 and jf_nezumi 3.48, among the lowest of all 37 voices auditioned.
   On the quiz's lines, B scored 3.80 and −0.21 (Indian). A held up only on the predictor (4.15), which does not
   hear accents; its accent score, +0.18, is half a native voice's. The owner's "suena fatal" is what the old rule
   produced: every English voice was taken, so the host had to be built of foreign ones.
2. **The same rule gave four experts foreign voices.** The classifier heard Amara (hf_alpha 50%) at −0.23 and Clara
   (ff_siwis 50%) at −0.17: neither sounded English, let alone British as their config says. Leo (im_nicola 40%) was
   +0.17 with no settled accent; Ines (ef_dora 55%) +0.36, saved by af_sky.
3. **And seven characters Kokoro's weakest English voices**: Omar am_adam (F+, the lowest grade of all), Tomas
   am_santa (D−), Dev and Leo am_liam (D), June af_jessica (D), Vic am_eric (D), Rhea bf_lily (D); Kai's bm_lewis (D+)
   and Rosa's bf_alice (D) too. They show it: Tomas had the lowest listening score of the cast (3.51), and Omar,
   Tomas, Kai and Dev the roughest voicing (aperiodicity 0.10–0.12 against 0.02–0.08 for the rest; a creak or a
   rasp).
4. **The accent of four "British" characters was American or nowhere**: Omar +0.04 (heard as American or Canadian),
   Leo +0.17, Clara and Amara below zero.
5. **The melody bend damaged every voice.** The engine bent each sentence's pitch to the planner's melody: up to
   2 semitones a sentence, lifts of up to 1.7 semitones on single words, and 90% of Kokoro's own sentence pitch
   steered away. A/B below: it cost 0.15 on the listening score, 20 of 21 clips.
6. **The closest pair on one programme was Clara–Ines at 35** (they shared af_sky), and Kai–Max 34.5 (am_puck).
7. Intelligibility was not the problem: every voice's word error rate on the copy was 0.021 to 0.060, the errors mostly the copy's own names.

### The pitch bend, A/B

The seven presenters, three lines each (two shared, one of their own programme), one Kokoro pass per phrase and the
melody stage varied (`tools/voice/engine.py`), predicted listening score, paired against the bend as it was:

| Variant | Score | Better than the bend | Harmonics-to-noise | Aperiodicity |
|---|---|---|---|---|
| the bend as it was (steered 90%) | 4.30 | – | 12.0 dB | 0.057 |
| a lighter bend (no steering, half the plan) | 4.39 | 19 of 21 | 11.9 dB | 0.059 |
| a constant 1-semitone shift, no melody | 4.37 | 19 of 21 | 12.3 dB | 0.054 |
| **no bend, the plan as loudness only** | **4.45** | **20 of 21** | 11.3 dB | 0.066 |
| no melody at all | 4.45 | 20 of 21 | 11.3 dB | 0.066 |

Per presenter, bend → no bend: Paco 4.11 → 4.38, Sam 4.22 → 4.41, Lola 4.30 → 4.48, Ada 4.30 → 4.44, Penny 4.35 →
4.47, Max 4.36 → 4.46, Nova 4.44 → 4.50. Two causes, separable: the processing itself (a constant shift, no melody,
still loses 0.08 to no bend: the resample and splices smooth the voice's own roughness, harmonics-to-noise +0.3 to
+0.7 dB and aperiodicity down, the "processed" colour) and the planned swings (another 0.07). The planned loudness
lifts cost nothing measurable (4.446 against 4.447 with no melody at all) and keep the emphasis on the words worth
leaning on, so they stay.

### Phrasing and pauses

Looked at and kept: one synthesis per sentence (or clause at a colon, semicolon or dash), the planner's pauses after
each, Kokoro's own comma pauses cut to the programme's comma pause. Measured in the clips, the silences between
phrases arrive as planned: 0.43 s median over the cast (0.29–0.53 s between the 10th and 90th percentiles; Max the
quickest at 0.37, Nova the most deliberate at 0.51, as their bibles ask), 0.04 s over the plan (the clips' own
edges). Joining a short sentence ("Nicely done, Lola.") to the next in one pass was
considered (Kokoro is weaker on very short utterances) and not done: inside a pass the engine cuts every silence to
the comma pause, so the full stop between the two would shrink to about 0.17 s, a rush the listening score would
not catch. The one phrasing change is the bend: Kokoro reads each sentence with a melody of its own, which a
newsreader's sentence also has; the planner's line across a story is now heard as loudness only.

### Round 1 scored (the cast as it was)

| Category | Score | Why |
|---|---|---|
| Naturalness | 5.5 | Three host candidates and four experts built on voices of other languages (host B heard as Indian English; Amara and Clara as neither British nor American); seven characters on Kokoro's weakest English voices; every voice bent by the pitch melody (−0.15). |
| Intelligibility | 9.5 | Every voice at 0.021 to 0.060 on the copy; the highest, host B's, a Hindi voice reading English. Clear, but held to no bar. |
| Distinctness | 8.5 | Clara–Ines 35 and Kai–Max 34.5 (shared af_sky, am_puck); everyone else 46 and up. |
| Consistency with look and role | 6.0 | Four "British" characters heard as American or foreign; the host's and three experts' accents not the config's at all. |
| Robustness | 9.5 | The service, the cache and the browser fallback worked; no way back to a previous voice but git. |
| Tests | 7.0 | The tests pinned a rule (components no one else uses) that made the voices worse; nothing measured a voice. |
| **Round** | **5.5** | |

### Who was re-cast, and why this blend

Thirteen characters and the three host candidates, in the order the owner asked: the new characters first, then the
experts and the correspondents. Grades are Kokoro's own (A best, F worst); every blend leads with its dominant voice.

| Character | Before | After | Why this one |
|---|---|---|---|
| PAY ATTENTION host A (Quinn Query) | jf_gongitsune 70% + pf_dora (Japanese, Portuguese) | af_bella 60% + af_kore, en-US | af_bella (A−) is the best English voice no player leads with; af_kore gives her a lower, rounder middle than Lola's heart-and-bella (47 apart). Bright and quick, as the look. |
| host B (Theo Tally) | hm_psi (Hindi) | am_puck 55% + am_eric, en-US | am_puck (C+) is the one good American male voice no player leads with; am_eric lifts it to a lighter, livelier baritone, 58 from Max (who has 40% am_puck). |
| host C (Layla Level) | jf_nezumi 65% + pf_dora | af_kore 50% + bf_emma 25% + bf_lily 25%, en-GB | af_kore (C+) for a calm, even, lower voice; British vowels from a quarter each of bf_emma and bf_lily (Ada leads with bf_emma, so it may only be a colour). First cast with 45% bf_emma, which left her 25.5 from Rosa (round 3). |
| Kai | bm_lewis 55% + am_puck | bm_george 55% + bm_fable, en-GB | The two best British male voices (C): British to the ear (+0.28) where every American voice read with British phonemes was heard as American. Paco leads with bm_george too but never airs on FULL TIME, and is far in timbre. |
| Rosa | if_sara 40% + bf_alice (Italian, D) | bf_isabella 55% + af_nova, en-GB | bf_isabella (C) with af_nova: a calm, dry British alto. First cast with bf_emma in the lead, 38 from Rhea (round 4). |
| Omar | am_adam 60% + am_onyx (F+, D) | am_michael 55% + bm_daniel, en-GB | am_michael (C+) for a steady, low voice; bm_daniel's 45% is what makes him British (with bm_fable, or with British phonemes alone, he was heard as American). bm_daniel is not in Paco's voice and measures far from him. |
| Clara | ff_siwis 50% + af_sky (French) | bf_isabella 55% + af_bella, en-GB | A British lead (C) no WORLD NOW presenter has; af_bella colours it. Penny and Rosa lead with bf_isabella too, on other programmes, 39 from her. |
| Dev | am_liam (D) | am_fenrir 50% + am_liam 30% + am_onyx 20%, en-US | am_fenrir (C+) in the lead, the one good American male voice nobody on his two programmes leads with; his old am_liam now a colour. Max leads with am_fenrir too (TECH, never with Dev): with 40% am_liam Dev sat 32 from him, the closest pair on the channel; the onyx share takes him to 40 (round 3). With bm_fable he had sat 41 from Leo and Vic (round 2). |
| Tomas | am_santa 60% + am_onyx (D−, D) | am_michael 52% + am_eric, en-US | am_michael for the low, unhurried professor; read slower (0.90). The old one had the lowest listening score of the cast. First cast with 40% am_eric, 32 from Omar and 34 from Sam, who lead with am_michael too (round 4). |
| June | af_jessica (D) | af_sarah 60% + af_aoede, en-US | af_sarah (C+), bright and quick, as the brightest of the experts. |
| Amara | hf_alpha 50% + af_river (Hindi, D) | af_alloy 55% + bf_emma, en-GB | af_alloy (C), the calmest, lowest female voice, with British vowels: the doctor who reassures. |
| Leo | am_liam 60% + im_nicola (D, Italian) | bm_fable 60% + bm_daniel, en-GB | bm_fable (C), British and warm; bm_daniel keeps him British (first cast with am_puck for liveliness, which made him sound American: round 4). Two adverts that led with bm_fable now lead with onyx and lewis. |
| Ines | ef_dora 55% + af_sky (Spanish, C−) | af_kore 55% + af_sky, en-US | af_kore (C+), careful and level, with her old blend's airy af_sky. First cast with 40% af_aoede, 40.6 from Mika (af_aoede alone) on WORLD NOW, the closest pair on a programme (round 4). |
| Rhea | bf_lily 75% + bf_emma (D) | bf_emma 60% + af_aoede, en-GB | bf_emma (B−), British, livelier with af_aoede; 47 from Ada, who never airs on WORLD NOW. |
| Vic | am_eric 70% + am_onyx (D) | am_puck 65% + am_michael 20% + am_onyx 15%, en-US | am_puck (C+), brisk, 40+ from Omar; speed 1.26 keeps his quick pace (am_eric read fast). First cast with 30% am_michael, 34 from Max, who has 40% am_puck (round 4). |

Kept: Paco, Lola, Max, Ada, Nova, Penny, Sam (approved by the owner; nothing but the bend hurt them, and the bend is
gone), Mika (af_aoede alone, C+, clean and native), UNIT-8 (the owner's soft robot). The continuity announcer of the
break bumper was re-cast in round 3.

### The changes, in short

- **Processing** (`tools/voice/engine.py` `BEND = False`, `server/voice/plan.js` recipe 7): the melody shapes the
  loudness only; Kokoro's pitch is its own. One switch brings the bend back.
- **Casting** (`server/voice/casting.json`; each replaced blend kept under `previous`, each host candidate's too):
  English voices only, the dominant one graded C or better by Kokoro's own notes, never the lead of someone on the
  same programme, distinctness measured. Thirteen characters re-cast, the three host candidates new; the eight main
  presenters (UNIT-8 among them) and Mika keep their voices (only the processing changed for them: the owner
  approved them, and none of them was hurt by anything but the bend).
- **The other voices on air** (round 3): the break bumper's announcer (`adcast.json` and `casting.json`
  `continuity`, previously the adverts' default bf_alice) and the six generic voices of re-staged guests
  (`server/guests/restage.js` `GUEST_VOICES`), measured with the cast and held to the same bars.
- **Two adverts** that led with bm_fable (now Leo's lead) lead with onyx and lewis, fable kept as their colour
  (`server/voice/adcast.json`); every line of both still fits its slot (rendered and timed: the tightest now ends
  0.01 s inside its slot, where the old blend ran 0.21 s past it).
- **Pace kept**: every re-cast speed was set so the character keeps the old voice's characters a second on the same
  copy (Leo −4.9% to Tomas +3.3%), so the writers' timings (the quiz's `VOICE_RATE`, FULL TIME's) still hold.
- **The audit** (`tools/voice/audit.py`, `audit-requests.mjs`, `audit-lines.json`), its summary
  (`tools/voice/voice-audit.json`) and the rules as tests (`test/voice-casting.test.js`); the expert, correspondent
  and host tests now ask for a voice unlike the people they air with, measured, instead of components no one uses.

## Round 2 — the first new cast, measured, and what it still did wrong

The thirteen re-cast voices and three candidates as first chosen (screened on two shared lines, then rendered on the
whole copy through the new engine), with the bend off. The panel's findings, each measured:

1. **Omar was still heard as American** (accent margin −0.03): am_michael with 40% bm_fable, read with British
   phonemes. bm_fable does not carry a British accent into an American voice (am_michael with half bm_fable: +0.04);
   bm_daniel does (+0.15). Re-cast: am_michael 55% + bm_daniel 45%.
2. **Omar and Vic were 39.9 apart**, both with am_michael in their blend, on WORLD NOW where the bar is 40; Dev sat 41
   from Leo and Vic (bm_fable shared with Leo). Re-cast: Vic am_puck 70% + am_michael 30%, Dev am_fenrir 60% +
   am_liam 40%. On the shared lines WORLD NOW's men are now 43 apart at the closest.
3. **Three paces had moved more than 5%**: Omar −7%, Kai −5.6%, Vic −5.2% (characters a second against the old
   voice on the same lines), and the host +4.8% (the quiz writer's timings assume the old host's rate). Speeds
   re-set: Kai 1.19, Vic 1.20, Omar 1.03, the host A 1.00 and B 1.02.
4. **The recogniser skipped a sentence** of the quiz question for two voices whose audio holds it all: a fault of the
   measuring, not the voice (fixed in the scorer: a transcript well short of its text is heard again phrase by
   phrase).

### Round 2 scored

| Category | Score | Why |
|---|---|---|
| Naturalness | 9.0 | Every character on an English voice led by a well-graded one, the bend gone (+0.15 on the listening score); Omar's British read as American. |
| Intelligibility | 9.6 | The word error rates of the new voices were as low as the old ones'; two clips mis-measured (the skipped sentence). |
| Distinctness | 9.0 | Omar–Vic 39.9 on WORLD NOW, under the bar; Dev 41 from Leo and Vic. |
| Consistency with look and role | 8.0 | Omar not British; four paces off by 5–7%, the quiz host's among them. |
| Robustness | 9.5 | As round 1, plus every old voice kept under `previous`. |
| Tests | 8.5 | The rules measured at last, but the recogniser's skips would have failed a clear voice. |
| **Round** | **8.0** | |

## Round 3 — past the characters: every other voice the channel speaks with

With the characters settled, the panel listened for every other voice that airs and for the closest pairs left. Each
finding measured, each fixed the same way (auditions on the shared lines through the engine, then the whole copy):

1. **The break bumper spoke with a weak voice.** "We'll be right back" is voiced like an advert's line and had no
   entry of its own, so it took the adverts' default British woman, bf_alice (graded D): 3.59 on the predictor over
   its two lines, the shorter heard as Scottish. The casting sheet's continuity entry named bm_fable, which nothing
   voiced (and Leo now leads with). Five blends auditioned:

   | Bumper voice | Bumper lines | Accent | Nearest character |
   |---|---|---|---|
   | bf_alice (as it aired) | 3.59 | −0.03 / +0.08 | Penny 76 |
   | bf_alice 55% + bf_isabella | 4.15 | +0.19 / +0.13 | Penny 44 |
   | bf_lily 60% + bf_isabella | 4.18 | +0.19 / +0.10 | Penny 44 |
   | bf_lily 55% + bf_emma | 4.21 | +0.33 / +0.08 | Rhea 44 |
   | **bf_lily 50% + bf_isabella 25% + bf_emma 25%, speed 0.87** | **4.17** | **+0.29 / +0.13** | **Rosa 45** |

   The last keeps bf_alice's pace exactly (1.46 and 1.86 s against 1.47 and 1.90 s; the bumper's slot is 3 s) and
   is heard as English on all six lines it read; at 0.95 it scored 4.28 but ran 9% quicker. bf_lily leads because
   every British woman's voice graded C or better leads a character, and a bumper that led with a presenter's voice
   would sound like the presenter who has just handed over. The bumper and the casting sheet now name it both
   (`adcast.json` `continuity`, `casting.json` `continuity`, a test holds them equal).
2. **Host C was the closest pair on the channel**: 25.5 from Rosa and 26.8 from Rhea, three women led or coloured by
   bf_emma. Three re-blends auditioned on the shared lines and the quiz's: with 45% bf_lily she moved 34 from
   everyone but was heard as Scottish or American (−0.05 on a British config); with a quarter each of bf_isabella and
   bf_emma, 20 from Rosa; with **a quarter each of bf_emma and bf_lily** (af_kore 50%), nearest June 31, Rhea 40, heard as English on
   all eight lines, and 4.49 on the predictor where the first blend (auditioned at speed 1.04) had 4.37 on the same two lines. Taken.
3. **The re-staged guests' voices had never been measured.** IN THEIR WORDS puts a recreated official on WORLD NOW,
   TECH, COSMOS, MONEY and FULL TIME in one of six generic blends (`server/guests/restage.js`). Measured with the cast, four sat
   on or near a character: a man led by bm_george (Paco's lead, 40 from him), a man of am_fenrir and bm_lewis (29 from
   Max on TECH, 33 from Dev), a woman led by bf_emma (33 from Rhea), a woman led by af_alloy (Amara's lead since round
   2, and heard as Canadian on a British config, −0.11); and one woman was led by af_nicole, a breathy voice, at 4.07,
   the lowest of all (3.91 on the quiz line). Two of these collisions were the new cast's doing. Eleven blends of the
   voices no character leads with were auditioned; the six kept:

   | Guest voice | Before | Listening score | Accent | Nearest on their programmes | After | Listening score | Accent | Nearest on their programmes |
   |---|---|---|---|---|---|---|---|---|
   | man 1 | bm_daniel 50% + am_adam, en-GB | 4.40 | +0.19 | Ines 51 | (kept) | | | |
   | man 2 | bm_george 65% + am_santa, en-GB | 4.36 | +0.32 | Paco 40, his lead | am_eric 60% + am_onyx, en-US | 4.48 | +0.38 | Kai 52 |
   | man 3 | bm_lewis 55% + am_fenrir, en-GB | 4.38 | +0.28 | Max 29 | am_onyx 60% + am_liam, en-US | 4.45 | +0.40 | Leo 67 |
   | woman 1 | af_nicole 55% + bf_isabella, en-GB | 4.07 | +0.22 | Penny 38 | bf_lily 60% + af_sky, en-GB | 4.43 | +0.18 | June 54 |
   | woman 2 | bf_emma 55% + af_heart, en-GB | 4.38 | +0.29 | Rosa 31, Rhea 33 | af_sky 55% + af_jessica, en-US | 4.45 | +0.34 | Lola 44 |
   | woman 3 | af_alloy 60% + bf_alice, en-GB | 4.46 | −0.11 | Ines 39, Amara 43 (her lead) | bf_alice 55% + af_river, en-GB | 4.43 | +0.10 | Penny 68 |

   (Auditions on the four shared lines, all through the engine as it is now.) None of the six leads with a character's lead; the leads are the voices no character has (bm_daniel, am_eric, am_onyx, bf_lily, af_sky, bf_alice), five of them graded D and one C−, measured instead of trusted. Three are American now: a re-staged official can be from anywhere, and American blends read with British phonemes were heard as American anyway. The lab's bookings were regenerated (`public/lab/guests.json`).

4. **Dev and Max shared am_fenrir, 31.6 apart**: the closest pair of characters, below the old cast's closest
   (Kai–Max 34.5). Dev's lead is forced (am_fenrir is the one American male voice graded C or better that nobody on his
   two programmes leads with: Omar and Tomas lead with am_michael, Vic with am_puck), so his colour moved: **fenrir
   50%, liam 30%, onyx 20%**, 39.5 from Max, 45 from Vic, listening score 4.47, median pitch 119 Hz (his old voice
   125, the first re-cast 129), pace 2% above the old. Tried and dropped: fenrir with 45% onyx (46 from everyone, but
   2.5 semitones under his old voice, graver than "keen"), fenrir with 45% eric (35 from Max). Tomas and Omar, both
   led by am_michael and 32 apart (never on one programme), were tried too: each blend that moved Tomas away from
   Omar brought him to Sam (14 to 23 apart); kept.
5. **Nothing tested that a person on a live programme has a casting entry**: a new presenter would fall to the
   planner's generic blend of weak voices (`server/voice/plan.js` `castFor`) without a test failing. Test added.

### Round 3 scored

| Category | Score | Why |
|---|---|---|
| Naturalness | 9.3 | The bumper, heard every break, on a D voice at 3.59; a guest on a breathy voice at 4.07. |
| Intelligibility | 9.6 | The new voices' auditions as clear as the old; the whole copy not yet heard by the recogniser (round 4). |
| Distinctness | 9.0 | Guests 29 from Max and 33 from Rhea, one on Amara's lead; host C 25.5 from Rosa; Dev–Max 31.6. |
| Consistency with look and role | 9.4 | A guest configured British heard as Canadian; the casting sheet's continuity entry not the voice on air. |
| Robustness | 9.6 | As round 2; the bumper's old voice could not be had back from the casting sheet (it was never in it). |
| Tests | 9.2 | The bumper and the guests outside every test; no test that a live person has a voice of their own. |
| **Round** | **9.0** | |

## Round 4 — the round-3 cast on the whole copy, every measure

With every voice rendered on the whole copy and heard by all three models, the panel found six more things:

1. **Leo was heard as American** on a British config: accent margin 0.00, American on four of his six lines. His
   40% am_puck carries its accent into bm_fable, which is only lightly British on its own (0.17 alone, the weakest
   of the British voices). Four blends auditioned on his lines:

   | Leo's blend (en-GB, 1.15) | Accent, mean (lowest line) | Pitch movement | Aperiodicity | Nearest |
   |---|---|---|---|---|
   | bm_fable 60% + am_puck (round 3) | 0.00 (−0.27) | | | |
   | bm_fable 70% + am_puck | +0.08 (−0.13) | 6.0 st | 0.084 | UNIT-8 49 |
   | bm_fable 55% + bm_daniel 25% + am_puck | +0.15 (−0.04) | 5.4 st | 0.093 | host B 43 |
   | **bm_fable 60% + bm_daniel** | **+0.31 (+0.15)** | **5.4 st** | **0.096** | **a guest 43** |
   | bm_fable 60% + bm_lewis | +0.45 (+0.37) | 6.8 st | 0.127 | Nova 46 |

   Taken: **bm_fable 60% + bm_daniel 40%**, heard as English on every line, with the pitch movement the puck blends had. bm_lewis was more British still but rougher (the aperiodicity of a creak) and graver (111 Hz). Omar also has bm_daniel (45%) and measures far from him (over 50).
2. **Ines and Mika were 40.6 apart** on WORLD NOW, the closest pair on a programme: Ines's 40% af_aoede is all of
   Mika's voice. Four second voices auditioned with af_kore: af_sarah (22 from host C, 29 from Amara), af_river (24
   from host C and June), af_nova (30 from Nova), **af_sky 45%** (49 or more from everyone; heard as American by
   +0.38; listening score 4.48, as before; the airy colour her old blend had). Taken.
3. **Kai's word error rate, 0.063, was over the bar**, four of its eight errors on one line: the recogniser wrote his
   "six-four, six-three" as "64-63" where it had written the old Kai's as "6-4, 6-3". Heard alone, the new clip
   gives "6-4, 6-3" too, with the same 0.08 s pause at the comma. A fault of the measure's number formatting, not of
   the voice: digits are now compared one by one, on every clip of both casts (the words counted are still the
   reference's). It changes this one clip of the 300 and more: 8 errors to 4; Kai 0.042, the old Kai 0.047. The
   other four errors on the line are names (Ana Vela, Lia Moreau), as for every voice.
4. **Omar is now heard as British** (+0.17 with bm_daniel): the test's exception for him, written in round 2 when
   bm_fable left him American, is gone.
5. **Across programmes the good voices cluster.** The old cast, built of voices nobody else used, had two pairs of
   characters under 46 anywhere (Kai–Max 34.5, Clara–Ines 35); the new one had eight under 40, all between people
   who never share a programme, most in the am_michael family (Omar–Tomas 31.8, Sam–Tomas 34.3, Omar–Sam 36.7) and
   the am_puck one (Max–Vic 33.7), with Rhea–Rosa 37.6 (bf_emma) and Clara–Penny 38.9 (bf_isabella). The men's
   leads are forced (each is the one good voice nobody on that person's programmes leads with), so their colours
   were tried, and Rosa's lead, which is free (nobody on FULL TIME leads with bf_isabella):
   - **Tomas with 48% am_eric**: 37 from Omar, 40 from Sam, his old pace within 1%, listening score 4.48. Taken.
   - **Vic with 20% am_michael and 15% am_onyx**: 46 from Max, 41 from Dev, 39 from Sam; 4.43, accent +0.42, his pace
     within 2% of the first re-cast; lower, 4.2 semitones under his old voice where the first re-cast was
     3.3. Taken. With
     35% am_eric he came within 8 of host B; with 35% am_onyx, 39 from Leo on his own programme.
   - **Rosa led by bf_isabella** (55%, af_nova kept): 62 from Rhea, 44 from Penny, 39 from Clara (neither on FULL
     TIME); 4.49, accent +0.29 as before. Taken.
   - Omar with more bm_daniel, or a fifth of bm_lewis, gained one to three points and came to 40 from Vic; Clara with
     af_river in place of af_bella moved 3 from Penny but lost most of her British accent (+0.10 against +0.30).
     Dropped.
6. **Two paces had slipped by 6%** on the whole copy, old voice against new (the median over every clip): Ines
   (−6.1%) and Vic (−6.0%). Speeds raised, Ines 1.08 → 1.14 and Vic 1.20 → 1.26, and measured again: −3.4% and −1.0%,
   listening scores 4.47 and 4.41 (4.48 and 4.43 before), word error rates 0.030 and 0.037 (0.024 and 0.056).

### Round 4 scored

| Category | Score | Why |
|---|---|---|
| Naturalness | 9.6 | Every voice measured natural and native (UNIT-8's robot apart); nothing yet but the predictor and the panel's reasoning has heard them. |
| Intelligibility | 9.6 | Kai over the bar on a recogniser's formatting; found, shown, and fixed in the measure for every clip alike. |
| Distinctness | 9.4 | Ines–Mika 40.6 on WORLD NOW; eight pairs under 40 across programmes, Omar–Tomas 31.8 the closest. |
| Consistency with look and role | 9.2 | Leo, a British culture correspondent, heard as American on four lines of six. |
| Robustness | 9.7 | Every change one entry to undo; the bumper's old voice now in the casting sheet's `previous`. |
| Tests | 9.5 | An exception left standing after its reason had gone (Omar); the word-error bar tripped by number formatting. |
| **Round** | **9.2** | |

## Round 5 — the cast as delivered

Every voice the channel speaks with, before (as it aired: the old blend through the engine with its pitch bend) and
after (the delivered blend through the engine as it is now), on the audit copy. The listening score is the
predictor's, 1–5; the accent column is the config's accent over the best second-language accent (above 0.05 is
heard as the config says; below zero, as another language's speaker); nearest is the closest other voice in timbre,
anywhere on the channel.

| Voice | Before | After | WER b → a | Listening score b → a | Accent b → a | Nearest b → a |
|---|---|---|---|---|---|---|
| host A (on air) | jf_gongitsune 70% + pf_dora 30% | af_bella 60% + af_kore 40% (en-us, ×1) | 0.040 → 0.040 | 4.15 → 4.46 | +0.18 → +0.34 | Rhea 73 → Lola 47 |
| host B | hm_psi | am_puck 55% + am_eric 45% (en-us, ×1.02) | 0.060 → 0.045 | 3.80 → 4.47 | −0.21 → +0.40 | Leo 75 → Vic 37 |
| host C | jf_nezumi 65% + pf_dora 35% | af_kore 50% + bf_emma 25% + bf_lily 25% (en-gb, ×1.06) | 0.040 → 0.040 | 4.17 → 4.47 | −0.05 → +0.18 | Rosa 65 → June 31 |
| Kai | bm_lewis 55% + am_puck 45% | bm_george 55% + bm_fable 45% (en-gb, ×1.19) | 0.047 → 0.042 | 4.17 → 4.36 | +0.34 → +0.29 | Max 34 → host B 39 |
| Rosa | if_sara 40% + bf_alice 60% | bf_isabella 55% + af_nova 45% (en-gb, ×0.98) | 0.028 → 0.044 | 4.18 → 4.49 | +0.26 → +0.29 | the bumper 34 → Clara 39 |
| Omar | am_adam 60% + am_onyx 40% | am_michael 55% + bm_daniel 45% (en-gb, ×1.03) | 0.034 → 0.022 | 4.32 → 4.41 | +0.04 → +0.17 | Vic 52 → Sam 37 |
| Clara | ff_siwis 50% + af_sky 50% | bf_isabella 55% + af_bella 45% (en-gb, ×0.95) | 0.023 → 0.023 | 4.37 → 4.42 | −0.17 → +0.30 | Ines 35 → Rosa 39 |
| Dev | am_liam | am_fenrir 50% + am_liam 30% + am_onyx 20% (en-us, ×1.13) | 0.030 → 0.030 | 4.15 → 4.47 | +0.38 → +0.41 | Leo 50 → Max 40 |
| Tomas | am_santa 60% + am_onyx 40% | am_michael 52% + am_eric 48% (en-us, ×0.9) | 0.025 → 0.025 | 3.51 → 4.47 | +0.39 → +0.42 | Sam 47 → Omar 37 |
| June | af_jessica | af_sarah 60% + af_aoede 40% (en-us, ×1.11) | 0.030 → 0.030 | 4.02 → 4.50 | +0.34 → +0.34 | Rosa 51 → host C 31 |
| Amara | hf_alpha 50% + af_river 50% | af_alloy 55% + bf_emma 45% (en-gb, ×0.98) | 0.024 → 0.024 | 4.40 → 4.44 | −0.23 → +0.09 | Clara 54 → host C 44 |
| Leo | am_liam 60% + im_nicola 40% | bm_fable 60% + bm_daniel 40% (en-gb, ×1.15) | 0.026 → 0.026 | 4.33 → 4.38 | +0.17 → +0.31 | Dev 50 → guest, man 2 43 |
| Ines | ef_dora 55% + af_sky 45% | af_kore 55% + af_sky 45% (en-us, ×1.14) | 0.042 → 0.030 | 4.05 → 4.47 | +0.36 → +0.38 | Clara 35 → Leo 43 |
| Rhea | bf_lily 75% + bf_emma 25% | bf_emma 60% + af_aoede 40% (en-gb, ×0.98) | 0.028 → 0.028 | 4.05 → 4.38 | +0.36 → +0.29 | Rosa 51 → host C 40 |
| Vic | am_eric 70% + am_onyx 30% | am_puck 65% + am_michael 20% + am_onyx 15% (en-us, ×1.26) | 0.037 → 0.037 | 4.25 → 4.41 | +0.41 → +0.41 | Omar 52 → host B 37 |
| Mika | af_aoede | (same) | 0.042 → 0.037 | 4.21 → 4.41 | +0.39 → +0.40 | Omar 65 → the host 53 |
| Paco | bm_george 60% + bm_lewis 40% | (same) | 0.022 → 0.022 | 4.10 → 4.34 | +0.34 → +0.36 | Kai 54 → Omar 48 |
| Lola | af_heart 75% + af_bella 25% | (same) | 0.031 → 0.036 | 4.26 → 4.44 | +0.35 → +0.35 | Amara 59 → guest, woman 2 44 |
| Max | am_fenrir 60% + am_puck 40% | (same) | 0.049 → 0.049 | 4.23 → 4.42 | +0.41 → +0.37 | Kai 34 → Dev 40 |
| Ada | bf_emma 70% + af_sarah 30% | (same) | 0.033 → 0.043 | 4.20 → 4.42 | +0.35 → +0.36 | Rhea 71 → Rhea 49 |
| Nova | af_nova 55% + af_alloy 25% + af_kore 20% | (same) | 0.033 → 0.028 | 4.42 → 4.49 | +0.38 → +0.37 | Omar 58 → Leo 48 |
| UNIT-8 | am_echo 70% + am_fenrir 30% | (same) | 0.033 → 0.047 | 2.73 → 2.73 | +0.49 → +0.49 | Tomas 51 → Leo 54 |
| Penny | bf_isabella 60% + af_kore 25% + bf_alice 15% | (same) | 0.021 → 0.021 | 4.37 → 4.46 | +0.34 → +0.35 | Amara 55 → Clara 39 |
| Sam | am_michael 75% + am_onyx 25% | (same) | 0.036 → 0.026 | 4.12 → 4.36 | +0.41 → +0.42 | Tomas 47 → Omar 37 |
| the bumper | bf_alice | bf_lily 50% + bf_isabella 25% + bf_emma 25% (en-gb, ×0.87) | 0.046 → 0.031 | 3.69 → 4.30 | +0.18 → +0.32 | Rosa 34 → guest, woman 3 32 |
| guest, man 1 | see round 3 | bm_daniel 50% + am_adam 50% (en-gb, ×0.97) | – → 0.034 | – → 4.40 | – → +0.19 | – → Dev 45 |
| guest, man 2 | see round 3 | am_eric 60% + am_onyx 40% (en-us, ×0.97) | – → 0.034 | – → 4.48 | – → +0.38 | – → Leo 43 |
| guest, man 3 | see round 3 | am_onyx 60% + am_liam 40% (en-us, ×0.97) | – → 0.042 | – → 4.45 | – → +0.40 | – → Leo 55 |
| guest, woman 1 | see round 3 | bf_lily 60% + af_sky 40% (en-gb, ×0.98) | – → 0.034 | – → 4.43 | – → +0.18 | – → June 54 |
| guest, woman 2 | see round 3 | af_sky 55% + af_jessica 45% (en-us, ×0.98) | – → 0.042 | – → 4.45 | – → +0.34 | – → Lola 44 |
| guest, woman 3 | see round 3 | bf_alice 55% + af_river 45% (en-gb, ×0.98) | – → 0.051 | – → 4.43 | – → +0.10 | – → the bumper 32 |

Closest pairs on each programme (after → the old cast):

- WORLD NOW: Dev–Vic 40.9, Ines–Leo 42.8 (old: Clara–Ines 35.0, Dev–Leo 50.1)
- TECH BYTES: June–Max 83.5, Ada–June 84.8 (old: Ada–June 100.5, Ada–Max 112.3)
- COSMOS DESK: Dev–Tomas 56.7, Nova–UNIT-8 62.5 (old: Tomas–UNIT-8 50.7, Dev–Tomas 65.6)
- MONEY MINUTE: Omar–Penny 99.3 (old: Omar–Penny 88.6)
- SEVEN DAYS: Lola–Paco 116.9 (old: Lola–Paco 121.3)
- FULL TIME: Kai–Rosa 89.0 (old: Kai–Rosa 101.7)
- PAY ATTENTION: Lola–the host 47.2, Nova–the host 59.2 (old: Max–Sam 65.6, Max–Paco 66.8)

Anywhere on the channel, the closest characters: Omar–Sam 36.7, Omar–Tomas 37.4, Clara–Rosa 38.8, Clara–Penny 38.9, Dev–Max 39.5, Sam–Vic 39.5 (old: Kai–Max 34.5, Clara–Ines 35.0, Sam–Tomas 46.6).

The panel's defects that remain (QUALITY_LOOP rule 2: at least ten, concrete), each weighed in the scores below:

1. **Five good male voices for ten men.** Kokoro grades C or better only am_fenrir, am_michael, am_puck, bm_fable
   and bm_george among the men, so leads are shared across programmes, never within one (tested): bm_george by Paco
   and Kai (67 apart), am_michael by Sam, Omar and Tomas (Sam–Omar 37, Sam–Tomas 40, Omar–Tomas 37), am_fenrir by Max and Dev
   (40), am_puck by Vic and host B (37). A viewer who watches WORLD NOW and FULL TIME may hear
   family between Paco and Kai; the timbre says they are apart, but not far.
2. **The closest pair of characters anywhere is Omar–Sam 36.7** (the old cast's: Kai–Max 34.5); on one programme,
   Dev–Vic 40.9, on WORLD NOW (the old cast's: Clara–Ines 35, on WORLD NOW).
3. **bm_fable is a common colour**: Leo's lead, Kai's second voice, two adverts' second voice. The closest two of
   them measure 46 apart.
4. **Omar's British share is bm_daniel, graded D** (45%): the only British male voice that is neither Paco's nor
   Leo's lead and carries the accent (bm_fable did not). His listening score is 4.41; Kokoro's grade is a
   warning the predictor does not repeat, which only a human ear can settle.
5. **Amara and host C are lightly British** (Amara +0.09, host C +0.18, against +0.17 to +0.36 for the other British characters):
   heard as English on every line, not strongly; their British share is bf_emma's quarter to half, the rest American
   voices, because the British women graded C or better lead others.
6. **Six characters run fast on the model** to keep their old pace: Vic 1.26, Kai 1.19, Sam 1.19 (as before), Leo
   1.15, Ines 1.14, Dev 1.13. Their listening scores (Vic 4.41, Kai 4.36, Sam 4.36, Leo 4.38, Ines 4.47, Dev 4.47) show no damage (Vic's 4.41 at 1.26 against 4.43
   at 1.20, the same lines), but a fast model speed shortens vowels more than consonants: brisk, and a human might
   hear it as hurried. Pace kept, old voice against new on the same copy: Leo −4.9% to Tomas +3.3%.
7. **Tomas does not sound as old as he looks** (white tufts, a professor's cardigan). Every blend with am_santa, the
   one elderly voice, either cost the listening score or put him beside Sam; the slow read (0.90) carries the age.
8. **The newsreader line across a story is quieter**: its lead-high, close-low step is now loudness only, and
   Kokoro's own sentence melody does the rest. The predictor prefers it by 0.15; whether the stories still step down
   is for the owner's ear.
9. **Some leads are graded D** where no better voice is free: the bumper's bf_lily and five of the six guest voices.
   Each is measured instead (4.30 to 4.48 on the predictor), but a grade is the model's makers' own ear.
10. **The recogniser's errors are the copy's names** (Ultrahuman, Teo Vance, "2-2" said as "two all", Ana Vela, Lia Moreau, Rafe Lindqvist), the same for every voice: the floor of the word
    error rate, not the voices'. One fault of formatting was found and fixed in the measure (round 4).
11. **The measures have limits**: the predictor is nearly deaf to accents, the accent classifier coarse, the
    recogniser forgiving; and no human has heard this round.
12. **The host's voice is still three**: the owner's choice decides the channel's final closest pairs (A: Lola 47, Mika 53; B: Vic 37, Kai 39; C: June 31, Rhea 40).
13. **The adverts' voices were not audited** (performances cast by ear on 4 Oct); an advert that led with a
    character's voice would fail a test.

### Round 5 scored

| Category | Score | Why |
|---|---|---|
| Naturalness | 9.8 | Every voice is an English voice heard as native; every character leads with a voice graded C or better except UNIT-8 (the owner's robot); the listening score is 4.30 or more for every voice but UNIT-8 (the old cast's lowest 3.51; mean 4.15 → 4.43); the bend that cost 0.15 is gone. Held back by what nobody has heard (defects 6–9 and 11): a fast read, Tomas's age, the quieter newsreader line, D-graded leads where no better voice was free. Measured and reasoned, not heard: the owner's ears decide. |
| Intelligibility | 9.8 | Word error rate 0.021 to 0.051 for every voice (old cast 0.021 to 0.060), the errors the copy's names; one fault of the measure found and fixed for every clip alike. |
| Distinctness | 9.8 | On every programme the closest pair is Dev–Vic 40.9, on WORLD NOW (old: 35); no two people of one programme share a lead; the guests 40 or more from everyone they air with; anywhere, Omar–Sam 36.7 (old: Kai–Max 34.5). The shared leads across programmes (defect 1) are the price of a pool of five good male voices. |
| Consistency with look and role | 9.8 | Every character heard with the accent of their config (+0.09 or more), the gender of their look, their old pace within Leo −4.9% to Tomas +3.3%; Tomas younger than his hair (defect 7). |
| Robustness | 9.8 | The service renders, caches and falls back to the browser voice with the new recipe (checked on the real worker); every changed voice keeps its old blend one copy away; the bend one switch away. |
| Tests | 9.8 | `test/voice-casting.test.js`: every rule measured on the audit's summary, which must match the cast exactly (voices, candidates, the bumper, the guests); a live person without a voice of their own fails; the expert, correspondent and host tests ask for what the ear needs. The audit's models are not part of the suite: the summary is re-measured by hand after a casting change (the test says so when it is stale, or when the rendering recipe has changed since). |
| **Round** | **9.8** | |

## What could not be measured, said plainly

- **Nobody listened.** No human ear has heard any voice of this round, before or after. Every judgement of
  naturalness here is a model's prediction or the panel's reasoning from Kokoro's grades and the measures.
- **The listening-score predictor is one model.** It was trained on people's ratings of synthetic speech of 2022 and
  tracks processing damage and roughness; it is nearly deaf to accents (it gave the Japanese voice reading English
  4.15) and it does not follow Kokoro's own grades closely (af_bella, graded A−, scores 4.06 alone; am_eric, graded
  D, 4.40). It is evidence, not a verdict.
- **The accent classifier** was trained on volunteers' recordings (Common Voice), not on broadcasters; it separates a
  native English voice from a foreign one well (every English Kokoro voice +0.17 to +0.49, the foreign ones −0.25 to
  +0.09, one outlier) but its "British" and "American" are coarse.
- **The recogniser** is strong and forgiving: a word error rate near zero says the words are clear, not that the
  delivery is natural.
- **Phrasing and melody** were measured only through these three (and the pauses' durations); the newsreader line
  across a story, now loudness only, was judged by the panel, not by listeners.
- **The writers' timings** were protected by keeping each voice's characters a second; the quiz's and FULL TIME's
  edition lengths were not re-measured on air.
- **The bend and the recogniser**: the seven presenters who kept their voices differ before and after only by the
  bend, so their word error rates on the whole copy are its A/B there: 0.032 with the bend, 0.032 without, on average (Paco 0.022 → 0.022, Lola 0.031 → 0.036, Max 0.049 → 0.049, Ada 0.033 → 0.043, Nova 0.033 → 0.028, Penny 0.021 → 0.021, Sam 0.036 → 0.026): within a couple of errors per voice either way, the noise of a recogniser on this much copy.
- **The adverts' voice-overs were not audited**: they are performances cast by ear (`adcast.json`, 4 Oct), outside
  the characters. Only the two that led with Leo's new lead changed, and every line of theirs was timed against its
  slot.
- **Blocked:** the score predictor's usual home on GitHub refused the download (403 from the proxy, not worked
  around); the same model's published weights were used from Hugging Face, which the proxy allows.

## For the owner

- **Listen before and after**, the same line in the old voice and the new one:
  - in the voice lab, `public/lab/voice.html` (the table under the monitor: no server needed for it);
  - the host's three candidates on the quiz's own lines, `public/lab/pay-attention-cast.html` (voices A, B, C);
  - the files named in Spanish handed over with this round (`<personaje>-antes.ogg` / `-despues.ogg`, one
    `programa-*-antes/despues.ogg` per programme: a short exchange, old voices then new).
- **The host's voice**: A (provisional, af_bella + af_kore), B (am_puck + am_eric) or C (af_kore + bf_emma + bf_lily). Look B
  takes voice B; looks A and C take voice A or C. To choose: copy `qm.candidates[letter]` (`voice`, `speed`, `lang`)
  into `qm` in `server/voice/casting.json`, and its `gender`, `lang`, `pitch` and `rate` into `presenters.qm.voice`
  in `config/channel.json`, with the name.
- **To have any old voice back**: in `server/voice/casting.json`, copy that character's `previous.voice`,
  `previous.speed` and `previous.lang` over its own (the host's candidates each keep theirs too). One character at a
  time; nothing else changes.
- **The bumper's old voice** (bf_alice): copy `continuity.previous` over the `continuity` entries of both
  `casting.json` and `adcast.json`. **The guests' old voices**: the six blends are listed in round 3 above, to put
  back in `server/guests/restage.js` `GUEST_VOICES` (the voice-casting test will then say which collide).
- **To have the old pitch melody back**: `BEND = True` in `tools/voice/engine.py`.
- The cache re-renders on its own: the engine and the recipe changed (`server/voice/plan.js` recipe 7), so every clip
  is voiced again the first time it airs.
