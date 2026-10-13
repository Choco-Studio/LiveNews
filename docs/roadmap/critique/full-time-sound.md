# FULL TIME sound: critique log

The brief (`docs/programmes/full-time.md` §6):
- **The open:** the theme scores the final whistle (three blasts, the last long) on the brass.
- **The bed:** 116 BPM, punchy drums, bass and muted guitar.
- **SCORE CENTRE:** a ticking bed of its own, a tick per row.
- **The lead's scoreline card:** a crowd swell, if an A/B says it sounds like a crowd and not like rain; otherwise a
  brass stab and a timpani hit.
- **After a grave story:** nothing under it nor in the segment after, but SCORE CENTRE's ticks stay as quiet sound
  effects.
- **The sign-off:** the theme's tail, except after grave news.
- **Never:** laughter (the owner rejected it), a real broadcaster's or club's jingle, an anthem, or a quotation of an
  existing theme.

Method: `docs/roadmap/QUALITY_LOOP.md`. The same hostile panel as the open (`full-time-open.md`): a broadcast composer
and sound designer, a senior broadcast director, a lead pixel artist and a first-time viewer. Renders and measurements
only: nobody on the panel can listen, so every judgement below rests on measurement and on the note lists. The bar is
above 9.7 in every category, and a round's score is its lowest category.

**Rubric:**
- the theme's identity and mix (loudness comparable with the other opens);
- the bed's groove, and fatigue over 8 minutes;
- the scoreline sting;
- SCORE CENTRE's ticks;
- the grave rules.

**Where it is:**
- the theme and the tail in `public/js/audio/themes.js`: `fullTimeTitles`, the `'full-time'` branch of
  `buildOutro`, and `buildScoreTick` (the row tick);
- the bed in `public/js/music/proposals/lofi/palettes.js` (`'full-time'`); its kit in `arranger.js`
  (`DRUMS.punchy`, `COMP.chops`) and `synth.js` (`punchKick`, `punchSnare`, `mute`);
- the stings in `stings.js` (`scoreCrowd`, `scoreBrass`, `scoreSting`, `SCORE_STING`);
- the rules in `cuesheet.js` (`SPORT`, `signoffAllowed`) and `public/js/music/live.js` (its grave memory);
- the director's three hooks in `public/js/director.js`:
  - `musicSegment` passes `feature`;
  - `playBoardSegment` ticks a row;
  - `playStory` cues the sting on the scoreline card;
  - the sign-off asks `signoffAllowed`;
- the lab at `public/lab/full-time-sound.html` (`window.__audio.render(...)`: the theme, a cue, the bed with cues,
  voices, ticks and tunes on a timeline, stems, the stings, the A/B references);
- tests in `test/full-time-sound.test.js`.

**Renders** are in `/tmp/full-time-sound/`:
- the theme: `theme.wav` (rounds 1 and 1b: `theme-r1*.wav`);
- the open with sound: `full-time-open.mp4`;
- the two sting candidates: `sting-A-crowd-swell.wav`, `sting-B-brass-timpani.wav`;
- the A/B references: `ref-pink-noise.wav`, `ref-rain.wav`, `ref-pulsed-control.wav`;
- the A/B's measures: `ab-measures.jsonl`;
- an edition with a grave story: `edition-grave-mix.wav`, 158 s, with its cue log;
- an 8-minute matchday edition: `edition-matchday-8min-mix.wav`, with its cue log.

## Round 1: score 8.9 (lowest: the sting)

(Rounds 1 and 2 were scored afterwards from their renders, which are kept.)

Defects:
1. **The theme's count-in outweighed its tune.** The four flood thunks peaked at a momentary −18 LUFS, louder than the
   groove after them (−20). The open's first half sounded like the band warming up.
2. **The groove under the sweep was thin.** The guitar's chops and the hats sat under the stabs.
3. **The first crowd candidate was a noise swell with formants**: only 6.0 dB of formant over its trend, and its
   breath noise as loud as its voices.
4. **The sting's laugh test was set up wrong.** The pre-registered criterion ("no regular pulse": the 3–7 Hz
   modulation peak under 2.0 times its mean) failed pink noise itself (2.09). A criterion that rejects noise cannot
   tell a crowd from laughter.
5. **The sign-off cue played after grave news.** `audio.sfx('outro')` is a sound effect: the cue sheet's rule never
   reached it.
6. **SCORE CENTRE's rows had only the ticking bed**, so after grave news (no bed) nothing marked them.
7. **A substitution bug.** The bed engine's substitutions turn maj7, maj9 and add9 chords into "6/9" on later passes,
   which the chord parser reads as a slash chord with a wrong bass.

## Round 2: score 9.4 (lowest: the sting)

Fixed from round 1:
- **Theme levels.** The thunks are lower and the groove is up: momentary −21 → −18 through the floods, −18 to −20 in
  the groove, −14 to −17 on the whistle, −13 on the signature and the hit.
- **The bed's chords** avoid maj7, maj9 and add9 (6ths, minor 11ths, the lydian IV, a suspended V). The parser bug
  itself is out of scope and left for its own fix.
- **The tail.** `signoffAllowed`: FULL TIME's tail is held back in the segment after grave news. `music/live.js` keeps
  the grave memory, the director asks before `audio.sfx('outro')`, and every other programme's cue plays as before.
- **The row tick.** `audio.sfx('scoreTick')`: a mallet B-flat and a dry click, a sound effect that stays after grave
  news.
- **The laugh test was recalibrated against a positive control** (`ref-pulsed-control.wav`: the crowd's spectrum
  pulsed at 5 Hz like laughter). The control measures 6.88 on the pulse ratio and 6.49 on the 3–8 Hz modulation; pink
  noise measures 2.09 and 0.29. The new criterion: pulse ratio under 3.5 and 3–8 Hz modulation under 1.5. This change
  was made after seeing pink noise fail the first criterion, and it is recorded here as such.

Defects:
1. **The crowd's vowels.** Varied vowels for every voice spread the formants: 3.9 dB, which reads as noise.
2. **The crowd's centroid.** Back to a few open vowels with Q 9 band-passes and less breath, the formants were
   6.6 dB, but the centroid was 340 Hz: the ground's rumble was too loud, a roar from a cellar.
3. **Ticks against the voice.** The ticks under speech were 17–19 dB under the voice broadband and about 12 dB in
   1–5 kHz: audible, unobtrusive.

## Round 3 (final): score 9.6 (lowest: the sting)

Fixed from round 2:
- the crowd's rumble is at 0.07, so its centroid rose to 694 Hz;
- the formants stand 7.0 dB over the trend (peaks at 707 and 1,260 Hz: an open "aah");
- 22 voices, none on the scale's notes (tested), each with its own vowel, pitch drift, coming and going, a few shouts
  at random moments, a top rolled off above 4 kHz (−10 dB), a 0.6 s swell and a fall of 12 dB in 0.9 s;
- ducked under the voice it lands on (`duckedSting`).

### The A/B: a crowd or rain?

Both candidates, pink noise and rain (pink noise with drops) were rendered with the crowd's envelope, so only the
spectrum and the texture differ. The criteria were set before the crowd was tuned. Each row's limit is in the first
column; the crowd passes all six.

| Measure (`ab.mjs`) | A: crowd | B: brass | Pink noise | Rain | Pulsed control |
|---|---|---|---|---|---|
| Centroid, loudest second (500–2,000 Hz, ≥ 1.5 kHz under rain) | 694 Hz | 217 Hz | 2,928 Hz | 4,357 Hz | 845 Hz |
| Energy over 4 kHz against 0.3–3 kHz (≤ −12 dB) | −27.8 dB | −32.2 dB | −1.1 dB | +4.9 dB | −23.2 dB |
| Spectral flatness (≤ half of pink's 0.575) | 0.022 | 0.001 | 0.575 | 0.871 | 0.026 |
| Formant over the trend (≥ 6 dB) | 7.0 dB (707, 1,260 Hz) | 7.9 dB (harmonics) | 1.0 dB | 3.1 dB (3.6 kHz, the drops) | 16.4 dB |
| Rise 10→90 % (0.3–1.0 s); fall 12 dB (within 2.5 s) | 0.5 s; 0.9 s | 0 s; 0.9 s | 0.8 s; 0.95 s | 0.95 s; 0.8 s | 0 s; 0.15 s |
| No regular pulse (3–7 Hz ratio < 3.5, 3–8 Hz modulation < 1.5) | 3.25; 0.85 | 2.06; 1.53 | 2.09; 0.29 | 2.16; 0.68 | 6.88; 6.49 |

**What the measures say:**
- **Voices, not hiss.** The crowd's spectrum is a voice's: a centroid near the formants, nothing above 4 kHz, a flat
  spectrum's opposite, and two formant peaks where an open vowel has them.
- **Rain is the reverse:** bright, flat and formant-less, with energy over 4 kHz.
- **A crowd's envelope:** the swell and fall.
- **No laughter's pulse.** The control's 6.88 shows what laughter would measure.

The crowd's pulse ratio, 3.25, sits closer to noise than to the control, but above pink noise's 2.09. The voices' own
random comings and goings put some energy at 3–7 Hz.

**The pick is A, the crowd swell** (`SCORE_STING = 'scoreCrowd'`). Both candidates stay in `stings.js` for the owner to
hear.

**Level:**
- The crowd's momentary peak is −18.7 LUFS in the clear and the brass's is −16 to −17.7.
- Both are about 9 dB lower ducked under a voice.
- In the 158 s edition, the 3 s window with the sting under the voice is still 19.3 LU under it: the lowest window
  of the edition.

### The edition renders

The edition renders run the bed engine as `music/live.js` does, on a timeline of cues with the house voices:
- the cues are the director's: the theme at the open, the tail after the sign-off, the row ticks;
- the owner's soft switch is on, so light stories have their very soft bed: the worst case for fatigue;
- they are rendered three ways: the mix, the music alone and the voices alone.

**The grave edition (158 s).** The lead story is followed by a chat, then a grave story, then SCORE CENTRE. The cue
log shows:
- 45.3 s, the grave story: silence;
- 56.3 s, SCORE CENTRE, the segment after: silence, and its three row ticks remain (56.4, 61.5, 64.5 s);
- 72.9 s: the beds come back with the next story.

The tail is held back only in the segment after grave news. Here the sign-off is many segments later, so it plays.

**The bed under the voice.** The music critique's method: 3 s windows with speech in at least 80 % of them, voice
minus music in LU, median per moment; and the 1–4 kHz rule, the 5th percentile of voice over music in 400 ms windows.

| Moment | Under the voice (LU, median) | 1–4 kHz p5 |
|---|---|---|
| Headlines | 19.6 | 13.5 dB |
| Greeting | 20.9 | 22.9 dB |
| Stories (soft switch) | 26.2 (lowest 19.3, with the sting) | 15.3 dB |
| Chats | 26.6 | 22.4 dB |
| THE NUMBER | 25.8 | 18.9 dB |
| The moment | 23.5 | 23.7 dB |
| COMING UP | 24.9 | 16.9 dB |
| Sign-off | 23.3 | 4.8 dB |

The same method on TECH BYTES and SEVEN DAYS headlines gives 20.8 LU / 9.0 dB and 18.4 LU / 11.4 dB, so FULL TIME's
headlines bed sits where the channel's beds sit, a little clearer in the speech band.

The sign-off's 4.8 dB is one window out of fifteen (150.0 s). It falls in a pause between two words: the voice is
19 dB there against 30–49 dB in the windows round it. Without that window the sign-off's lowest is 22.4 dB. It is not
masking.

**The theme's level:**

| Open | Integrated loudness |
|---|---|
| WORLD NOW | −16.7 LUFS |
| TECH BYTES | −16.2 LUFS |
| COSMOS DESK | −15.8 LUFS |
| MONEY MINUTE | −16.5 LUFS |
| NEWS IN 60 | −16.5 LUFS |
| WORLD WEATHER | −16.6 LUFS |
| SEVEN DAYS | −16.2 LUFS |
| FULL TIME | −16.1 LUFS (LRA 6.0 LU, true peak −2.9 dBFS) |

All are measured at the director's volume (0.6).

**Variety over 8 minutes** (`variety.mjs`, the engine's note lists over about 8 minutes per moment):

| Moment | Distinct bars | Distinct 4-bar phrases |
|---|---|---|
| FULL TIME headlines | 230 of 232 | 58 of 58, no phrase repeated back to back |
| SCORE CENTRE | 167 distinct bars | |
| Chats | 218 distinct bars | |
| TECH BYTES (same method) | 79 | 52 |
| SEVEN DAYS (same method) | 94 | 39 |
| WORLD NOW round-up (same method) | 38 | 23 |

The four-chord loop has variety in its comping, its kit's fills and its substitutions, so it does not loop audibly at
these lengths.

**The 8-minute matchday edition (458 s).**
- **Running order:** the open, the headlines, the greeting, the lead with its scoreline sting, SCORE CENTRE, about
  forty stories and chats, THE NUMBER, the moment, COMING UP and the sign-off with the tail.
- **Loudness:** the mix is −13.5 LUFS (LRA 3.0 LU, true peak −1.9 dBFS). The music alone is −30.6 LUFS (LRA 6.4 LU)
  and the voices alone −13.4 LUFS, so over the whole edition the music sits 17 LU under the voices.

| Moment | Under the voice (LU, median, lowest) | 1–4 kHz p5 |
|---|---|---|
| Headlines | 19.6, 19.5 | 13.5 dB |
| Greeting | 20.9, 20.6 | 22.9 dB |
| Stories (204 windows, soft switch) | 26.1, 19.3 (the sting) | 18.5 dB |
| Chats | 26.6, 25.5 | 24.0 dB |
| SCORE CENTRE (ticking bed and row ticks) | 23.4, 22.2 | 16.1 dB |
| THE NUMBER | 25.7, 25.3 | 30.4 dB |
| The moment | 23.9, 23.4 | 16.8 dB |
| COMING UP | 24.2, 23.1 | 12.8 dB |
| Sign-off | 23.1, 23.0 | 10.8 dB |

Over eight minutes the bed never comes closer to the voice than the headlines do. The loudest it gets under speech is
the sting's moment. With the soft switch it changes moment at every segment, so no texture runs longer than one
segment.

The lab now schedules the bed as the render goes (suspending every 4 s). The first attempt at this edition scheduled
all eight minutes up front and was stopped after 37 minutes of rendering. Scheduled progressively, the same cue log
renders in about two minutes. The 158 s edition gives an identical cue log and loudness either way.

### Final scores

| Category | Score | What keeps it from 10 |
|---|---|---|
| The theme's identity and mix | 9.7 | The signature and FULL TIME's colour (#5 → 6) on bright section brass; the whistle on the brass, with the pea whistle's flutter on the long blast; the count-in thunks; a groove in the bed's tempo family. Loudness matches the other opens (−16.1 against −15.8 to −16.7). The whistle's flutter is the engine's fastest vibrato, a stylisation more than a whistle, and nobody has heard it on a phone speaker. |
| The bed's groove, and fatigue over 8 min | 9.7 | The most varied bed on the channel by the note lists, at the channel's level under the voice. The 116 BPM is close to NEWS IN 60's 120. The punchy kit is the rig's synthesis, not samples, and its "punch" is a pitch-swept sine and a filtered noise crack. |
| The scoreline sting | 9.6 | It passes the A/B by every measure set for it. But it is 22 synthesised voices through formant filters: the measures say "voices, not rain", which is not "a real crowd". The laugh criterion was recalibrated after the first one failed on pink noise (disclosed above). Its pulse ratio, 3.25, has the least margin of any measure. A sound designer would ask for a listening test before calling it a crowd. |
| SCORE CENTRE's ticks | 9.7 | A dry mallet and a click on each row as it flips in (−28 dBFS peak, about 12 dB under the voice in 1–5 kHz), over a ticking bed whose ticks are eighths. The row tick lands off the bed's grid (it follows the voice, not the beat). That is right for its job, but a composer would hear the two ticks disagree. |
| The grave rules | 9.9 | Verified in the grave edition's cue log and by tests. There is no bed in a grave story nor the segment after it, no sting on or after grave news, and no tail after it; the row ticks stay. The sting's grave check reads the story's emotion. A grave story with no emotion set relies on the segment memory. |

The round's score is 9.6. That is under the bar for the sting, and it is reported as such. The next step is a
listening test with the owner (both candidates are in `stings.js`, `SCORE_STING` picks one). Brass B is the bible's
fallback and needs no claim that it sounds like anything.
