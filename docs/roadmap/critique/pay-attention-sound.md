# PAY ATTENTION sound: critique log

The brief (`docs/programmes/pay-attention.md` §6):
- **The open** (≈8 s, 112 BPM): the lamps light in turn on the beat, the board flips, the plate.
- **The bed:** 112 BPM, light, bright, plucked.
- **The countdown:** ticks on the bed's half notes (1.07 s), each countdown a whole number of half notes.
- **RIGHT:** two bright notes. **WRONG:** a soft low note, never a buzzer's sneer.
- **DOUBLE OR NOTHING:** a drumroll.
- **Never:** laughter or applause (the owner's rule; there is no studio audience), a real game show's jingle, or a
  quotation of an existing theme.

Method: `docs/roadmap/QUALITY_LOOP.md`. The same hostile panel as the set and the open: a lead pixel artist, a senior
broadcast director, a senior quiz-show producer, a sound designer and composer, and a first-time viewer. Renders and
measurements only: nobody on the panel can listen, so every judgement below rests on measurement and on the note lists.
The bar is above 9.7 in every category, and a round's score is its lowest category.

**Rubric:**
- the theme's identity and mix (loudness comparable with the other opens);
- the bed: light, bright, plucked; its groove and fatigue;
- the countdown's ticks;
- RIGHT and WRONG;
- the drumroll;
- the rules (no laughter, no applause; grave days).

**Where it is:**
- the theme, its colour and the sign-off tail: `public/js/audio/themes.js` (`payAttentionTitles`, `OPENS['pay-attention']`,
  `COLOURS.quiz`, the `'pay-attention'` branch of `buildOutro`); the cue sheet shared with the picture:
  `public/js/scenes/opens/cues.js`;
- the bed: `public/js/music/proposals/lofi/palettes.js` (`'pay-attention'`, moments welcome, question, scores, chat,
  double, result, signoff); its kit in `arranger.js` (`DRUMS.light`, perc `'snap'`); its colour in `theory.js`;
- the stings: `stings.js` (`quizRight`, `quizWrong`, `quizDrumroll`, `quizTick`; their names for the director in
  `QUIZ_STINGS`);
- the rules: `cuesheet.js` (`QUIZ`, `QUIZ_MOMENTS`, the cue sheet's rows);
- the countdown on the bed's grid: `engine.js` (`LofiEngine.countdown`) and `public/js/music/live.js`
  (`LiveMusic.countdown`);
- the lab: `public/lab/pay-attention-sound.html` (`window.__audio`: the theme, a cue, the bed with cues, voices,
  countdowns and stems, each sting);
- tests: `test/pay-attention-sound.test.js` (22 tests: the open's picture and music, the bed, the cue sheet, the
  countdown, the stings, the rules); the network's sonic identity in `test/visemes.test.js` now knows the quiz's colour.

**Renders** (offline, the lab in Chromium at the director's volume, 0.6; measured with ffmpeg's EBU R128 meter; a phone
speaker modelled as mono, 300 Hz–7 kHz, fourth order each side): the theme, the sign-off tail, each sting, each moment
of the bed, a countdown of eight half notes asked at 2.4 s into a question bed (and the same bed without it, subtracted
to find the ticks), and three beds under the house voices (stems apart). The files are listed in the step's report.

(The scores of rounds 1 and 2 were given afterwards, from each round's renders and measures; round 3's is the panel's
verdict on the final ones, looked at again from scratch.)

## The theme (round 3)

A-flat major, 112 BPM, the open's cue sheet: 8.3 s, the hit at 7.5 s.
- **The dark** (beats 0–2): an A-flat sub and an open fifth.
- **The lamps** (beats 2–5): a ping per lamp on its beat, the channel's signature an octave up (E-flat 5, A-flat 5,
  B-flat 5, E-flat 6), left for A's circle and right for B's square; the pad opens to add9.
- **The room's light** (beat 6): the band, light and plucked: a pizzicato arpeggio in eighths, a plucked bass bouncing on
  the pedal, a soft kick on 1 and 3, a snap on 2 and 4, off-beat hats.
- **The board's turn** (beats 6.5–7.5): a mallet run up the scale, eight notes from E-flat.
- **The emblem** (beat 10): the signature on the lead (E-flat, A-flat, B-flat, E-flat) over D-flat on A-flat; then the
  colour, B-flat (the 9th, `COLOURS.quiz`), over A-flat sus2, rising to C (the 10th) on the hit, A-flat 6/9 with bells.
  Under the colour the bass holds A-flat (the network's rule: the colour over the tonic pedal), in the open, in the
  package's 4 s version and in the sign-off tail.

## Round 0 — the build (not scored)

1. A D-flat chord and its arpeggio a semitone off, and a D natural (outside A-flat major) in the flip's run: fixed from
   the note lists before any render.
2. **The theme measured −16.8 LUFS**, against FULL TIME's −16.1 and NEWS IN 60's −16.5 on the same tooling; by section it
   had the family's shape (the dark, the pings near −20, the groove −18 to −19, the signature and the hit −13 to −14):
   the dark second at its head reads the integrated level low. Trimmed 0.5 dB: **−16.3 LUFS**.

## Round 1 — the first measures. Score 9.0 (lowest: the countdown's ticks)

Faults:
1. **WRONG louder than RIGHT** (max momentary −22.8 against −25.1 LUFS): the consolation louder than the reward
   (quiz producer).
2. **The ticks were buried**: −43.8 LUFS, under the question bed's own level (sound designer).
3. **The drumroll was hot**: −15.5 LUFS max momentary and a true peak of −5.7 dBFS, louder than the theme's groove
   (sound designer).
4. **The network's sonic identity failed** (`test/visemes.test.js`): its colour map did not know the quiz, and the
   package's 4 s version bounced the bass to E-flat under the colour instead of holding the tonic pedal (composer).

| Category | Score |
|---|---|
| The theme's identity and mix | 9.4 |
| The bed | 9.6 |
| The countdown's ticks | 9.0 |
| RIGHT and WRONG | 9.1 |
| The drumroll | 9.3 |
| The rules | 9.8 |

## Round 2 — rebalanced. Score 9.3 (lowest: RIGHT and WRONG)

What changed: RIGHT up (max momentary −21.0), WRONG down (−27.3), the drumroll's bus down (−18.3, true peak −8.3);
the ticks up twice (to −34.8, then 3 dB more: −31.7), so they stand 6.9 to 11.6 dB over the bed's own peaks at each
tick; the colour in the identity table; the package's bass on the A-flat pedal. A new test of the pedal found it broken
for a twentieth of a beat between notes: the pedal is held through.

New fault, from the phone model:
1. **WRONG vanished on a phone.** A bare D-flat 3 (a triangle and its sine) lost 18 dB through a phone's speaker: −48
   LUFS momentary against the question bed's −40. On most of the channel's audience's speakers the wrong answer would
   be silence (sound designer).

| Category | Score |
|---|---|
| The theme's identity and mix | 9.8 |
| The bed | 9.7 |
| The countdown's ticks | 9.7 |
| RIGHT and WRONG | 9.3 |
| The drumroll | 9.7 |
| The rules | 9.9 |

## Round 3 — WRONG revoiced; the panel from scratch

What changed: WRONG is a felt electric piano on D-flat 4 (no tine, a soft index: round, its gentle harmonics the part a
phone plays) over the triangle's D-flat 3 body; still one pitch class, the key's 4th (not home, not a clash), one
attack, no saw, no square, no bend, 0.9 s, ducked under the voice.

The measures (round 3):

| | Full range (max momentary) | Phone (max momentary) | Notes |
|---|---|---|---|
| Theme | −16.3 LUFS integrated, LRA 6.0, true peak −3.1 dBFS | | the other opens −15.8 to −16.7 |
| Sign-off tail | −17.2 LUFS integrated | | |
| RIGHT | −21.0 | −24.1 (loses 0 dB) | E-flat 6 then A-flat 6 a sixteenth later, pluck and bell, a short room; 1.2 s |
| WRONG | −25.4 (4.4 dB under RIGHT) | −34.6 (loses 6.4 dB; 5.4 dB over the question bed) | one D-flat; 0.9 s |
| Tick | −31.7 | −35.0 (5 dB over the question bed) | a pluck on E-flat 6, the last on A-flat 6 (home), with the rig's tick; 0.15 s |
| Drumroll | −18.3, true peak −8.3 dBFS | −30.8 | 64 snare 32nds in a crescendo (two bars, 4.3 s) over timpani on E-flat 2, landing on timpani A-flat 2 with a kick, a bell arpeggio (A-flat, B-flat, C, E-flat) and the band |
| Question bed | −33.9 LUFS integrated | −40.0 | the pluck, the bass and a pad; no kit (the ticks are the time) |
| Welcome / scores / chat / result | −30.5 / −32.3 / −34.0 / −30.3 integrated | welcome −38.3 | |

- **The countdown on the grid**: eight half notes asked at 2.4 s into a question bed: the first tick on the bed's next
  half note (3.274 s), then every 1.0714 s; 0 ms from the grid in the engine's log; the audio's onsets 6.6–7.9 ms after
  the grid (the pluck's attack); each tick 6.9–11.6 dB over the bed's peaks around it. Without the engine (beds off)
  the director gets the same grid from the asking time.
- **Under the voice** (the house voices, stems apart): the voice over the music by a median of 26.0 LU in a question
  (minimum 12.8), 27.0 in a chat, 23.6 in the welcome.
- **Variety** (the arranger's note lists over 8 minutes, 224 bars): welcome 201 distinct bars and 56 of 56 four-bar
  phrases; scores 207 and 56; result 200 and 56; chat 168 and 56; question 115 and 55 (no keys and no kit by design);
  double 52 and 30 (a held pedal); no phrase repeated back to back in any moment. (FULL TIME's headlines: 230 and 58;
  TECH BYTES 79 and 52 by the same method.)

Still open (the panel, round 3):
1. **Nobody has listened.** Every judgement rests on meters, a phone model and note lists (composer).
2. **WRONG still loses 6.4 dB on a phone** (its body is low by design) and sits only 4.4 dB under RIGHT at full range,
   a compromise between "soft" and "heard on a phone" (sound designer).
3. **Two rising bright notes** for RIGHT is the genre's grammar; it is the channel's because the notes are the key's
   5th and root over the bed, but a quiz fan will hear "ding-ding" (quiz producer).
4. **The first tick can wait up to a half note** (0.87 s in the measured case) after the director asks: the countdown
   bar must run from the returned start, not from the asking moment (director).
5. **The drumroll is the rig's noise snare**, filtered noise in 32nds rather than a drum's skin, and its length is fixed
   (two bars): the director starts it 4.3 s before the reveal (sound designer, director).
6. **112 BPM sits near FULL TIME's 116**; the beds differ in kit (no snare here, a snap) and in colour (sound designer).
7. **The theme's instruments are the rig's synthesis** (pluck, bell, mallet), bright and clean, not recorded
   pizzicato (composer).

| Category | Score | What keeps it from 10 |
|---|---|---|
| The theme's identity and mix | 9.8 | The signature, then the quiz's colour (the 9th rising to the 10th on the hit) over the A-flat pedal; the lamps' pings on their beats, left and right as the desks stand; the band on the room's light; the run on the board's turn. Loudness in the family. The instruments are synthesised (7), and nobody has heard it (1). |
| The bed | 9.8 | Light, bright, plucked: a pizzicato arpeggio, plucked chords, a bouncing bass, a light kit with no snare; 200 distinct bars in 8 minutes where it carries a segment; at the channel's level under the voice. The tempo is near FULL TIME's (6). |
| The countdown's ticks | 9.8 | On the grid (0 ms in the engine's schedule), a whole number of half notes, the last tick home on A-flat, 7–12 dB over the bed and 5 dB over it on a phone. The wait for the grid (4); never heard against a voice reading a question (1). |
| RIGHT and WRONG | 9.8 | RIGHT bright and whole on a phone; WRONG soft, low and one note, never a buzzer, audible on a phone. 2, 3. |
| The drumroll | 9.8 | A crescendo to a landing on the home timpani, the bed stopped for it, no crash. 5. |
| The rules | 9.9 | No laughter and no applause anywhere: no such file, no such sound in the code, no clap in the theme (tested); RIGHT and WRONG never on or near a grave story; silence after grave news (the quiz does not air on a grave day, §3.3). |

**Round score: 9.8. Passed** (the gate is above 9.7).

What keeps each category from 10, in one line each:
- **The theme**: synthesised instruments, unheard by a human ear.
- **The bed**: a tempo near FULL TIME's.
- **The ticks**: up to a half note's wait for the grid; never tested under a reading voice.
- **RIGHT and WRONG**: the genre's two-note grammar; WRONG's 6 dB loss on a phone.
- **The drumroll**: a synthesised snare of fixed length.
- **The rules**: nothing.
