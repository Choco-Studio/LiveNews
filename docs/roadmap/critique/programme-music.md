# The programmes' music: critique log

Owner, 9 Oct: "now polish the whole music system of every programme (not the intros, inside the programme)". The music inside the programmes is the bed engine `public/js/music/proposals/lofi`, live through `music/live.js` and cued by `director.js` at each moment (headlines, stories, chats, features, sign-off, breaks). The method is the one used for the opens:
- measure before judging;
- fix the cause, not the instance;
- keep every rule of the bibles (`docs/programmes/*.md`).

## Round 1

### Before: score 7.6 (lowest: harmony)

1. **Semitone rubs in nearly every bed.** Chords were voiced in close position, so a chord's 9th sat a semitone under its 3rd (Em9's F#3 against G3 in NEWS IN 60), or its 7th under the root. A held layer also rubbed on another layer's notes (TECH's pad B4 against its arpeggio's C5). Counted over 32 bars of each song and moment:
   - within one chord: 416 in TECH BYTES, 384 in WORLD NOW's soft story bed, 288 in NEWS IN 60, 128–256 in COSMOS;
   - between layers: up to 384.
   Only the beds without held chords were clean (WORLD NOW's round-up, the bumper).
2. **WORLD WEATHER had no music of its own.** It borrowed WORLD NOW's "and finally" song in D major straight after its own open in C major: a key change on the first sentence.
3. **The stings rubbed too.** The ident film, the short ident, the replay marker and up next held a chord a semitone from their own signature.
4. **The lab did not hear what airs.** It rendered every open as the old 4 s one (the title sequences run 6.8–10.2 s), the story beds off (they are on air: `music/live.js` `stories: 'soft'`), and the opens' tails without the duck under the first words.

### After: score 9.5

The voicing (`theory.js` `voiceChord`):
- candidates in close, drop 2 and spread positions;
- none with two voices a semitone or a minor ninth apart (unless the chord asks for its b9);
- the low interval limits: no second below G3, no third below C3;
- of the valid ones, the closest to the last chord (voice leading as before);
- `avoid`: the notes another layer holds, so the layer voices round them.

The arrangement (`arranger.js`):
- the keys are voiced first and the pad round them;
- a signature melody is written first and the held layers voice round it;
- a sparse melody picks chord tones that no other layer holds a semitone away;
- the arpeggio's steps skip a note that would land a semitone from the melody;
- a held layer under an arpeggio or the keys plays the chord's guide tones (`guideTones`): the moving layer carries the colour, as an arranger would split it;
- a bass note that climbs into the chord's register drops an octave rather than rub.

WORLD WEATHER: its own bed (`palettes.js` `'world-weather'`):
- 92 BPM in C, the 7th as its colour;
- a soft pluck in eighths over long Rhodes chords, a warm pad, triangle roots and a few soft triangle notes;
- brighter for tomorrow, keys and bass for the sign-off, silence under the warnings;
- its ident film in C.

The stings voice their chords round their own melody, on its guide tones where needed.

The lab: each open at its on-air length, the story beds as on air, the open's tail ducked under the first words as `audio.js` does, and a WORLD WEATHER bulletin with the weather presenter's voice (house chain, -16 LUFS).

Evidence:
- semitone rubs: 0 in every song and moment over 96 bars, standby included, and 0 in every sting (`test/music-beds.test.js`; the engine's own `selftest.mjs`, 13 of 13);
- every bed in its programme's open key (tested).

- under speech, one bulletin per programme with the house voices (the lab's 3 s method, median and lowest window): WORLD NOW 21.1 and 15.4 LU, TECH BYTES 23.5 and 19.2, COSMOS 23.4 and 19.7, MONEY MINUTE 34.0 and 18.8 (its stories carry the 800 Hz drone, about 34 LU under), NEWS IN 60 24.4 and 23.2, WORLD WEATHER 20.3 and 18.9;
- the 1-4 kHz rule (voice over bed in the speech band, 5th percentile): 26-35 dB in every bulletin;
- the beds keep their levels: the same moments render within 0.7 LU of before.

Nitpicks left:
1. The judgement is by structure and measurement, not by ear.
2. The first syllable after a title sequence's cut sits 11–12 dB over the open's last chord in 1–4 kHz for one 400 ms window, under the 15 dB rule. The open is ducked from that word on.
