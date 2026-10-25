# Shorts v2: built for the first seconds (25 Oct 2026)

The owner, 25 Oct: "Ponte a rediseñar los shorts para que tengan éxito real. Aplica todo lo que puedas y diséñalo
como lo haría un genio de la psicología real." The evidence is the study of the same day (a Claude Doc, «Estudio: qué
hace que un Short enganche, aplicado a GLOBIT 24»: 14 sections, about 100 sources, reviewed twice), which builds on
`attention.md` (24 Oct). This page is the design: each change, the finding behind it, where it lives, and how it is
measured. The server had published for a week when it was written; its numbers decide what stays (§4).

## 1. The principles

1. **The first seconds decide, and the edit sets the drop-off.** In 9.2 million TikTok views, 24 % stopped before the
   first fifth of the video; swipes cluster at the start, and each video's pattern is its own (Zannettou et al. 2024;
   Li et al. 2023). Instagram ranks on who leaves before 3 s.
2. **The eye goes to what starts to move, to faces and to text** (Abrams & Christ 2003; Cerf et al. 2007, 2009), and
   a face's gaze moves it further, cartoon faces included (Friesen & Kingstone 1998).
3. **Curiosity needs a specific question the viewer half knows, answered inside the clip** (Loewenstein 1994; Kang
   et al. 2009; Ruan et al. 2018). A generic label ("PLAY ALONG") opens no gap; bait costs trust and shares
   (Mukherjee et al. 2022).
4. **A guess first makes the answer stick**: a wrong guess before the answer improves its memory (Kornell, Hays &
   Bjork 2009). The quiz's "your guess?" is the method, not decoration.
5. **The peak and the end are what is remembered** (Alaybek et al. 2022): the reveal is the peak, and nothing but the
   AI notice comes after it.
6. **Fluency**: big type, one idea at a time, whole caption lines, and a clip as loud as the feed around it.
7. **Familiar faces build a bond, a series builds a habit** (Tukachinsky et al. 2020; Montoya et al. 2017).
8. **Test, do not guess**: one change at a time, alternated clip by clip, kept only when it wins (§4).

## 2. Phase A (this change)

| # | Change | Principle | Where |
|---|---|---|---|
| A1 | Every clip is brought to −14 LUFS integrated, true peak −1.5 dBTP at most (half a decibel under the feeds' −1, for the AAC encoder's overshoot), by one linear gain on its whole sound: measured first as the graph will mix it, measured again once made, both kept in the clip's JSON. No compressor and no limiter: the house mix keeps its dynamics. YouTube plays at about −14 and never turns a quiet video up; our clips measured −15.7 to −17.1. | 6 | `server/publish/render.js` `LOUDNESS`, `loudnessArgs`, `loudnessGain`, `composeArgs({ gain })`; `tools/publish/factory.mjs` |
| A2 | Every quiz question clip starts on its question. The round's title card (its name and its rules) is no longer the first four seconds of the round's first question: the board the question opens on names the game. The whole-round clip still opens on the card. | 1, 3 | `server/publish/moments.js` `quizMoments` |
| A3 | On the vertical HOW MANY? board the question is asked in big type from its first frame: GUESS THE NUMBER · 2 OF 3 as its kicker, then HOW MANY PONIES?, HOW MANY LIGHT-YEARS?, HOW MUCH? (a sum), WHAT PERCENT? (a share) at 2x on up to two lines, made from the figure's label alone, so never its answer (a label that is no plain plural, STEAM from "the $789 Steam Deck", gives HOW MANY?). The room comes from the guess boxes (21 rows, not 25) and then the shorter question; where nothing is left under the guesses, the question turns into its answer at the reveal, in the reveal's yellow (THE ANSWER, ABOUT 100 PONIES): the peak where the eye already is. The mast beside the bug says the topic (NASA, EXMOOR PONY HERD) instead of PLAY ALONG. The vertical live shows the same board. | 2, 3, 5, 6 | `public/js/scenes/quiz-ask.js` `askOf`, `askLines`, `quizTopic`; `public/js/clip/vquiz.js` `howManyPlan`, `askHeader`; lab: `/lab/vquiz.html?glass=1&only=howmanyponies` |
| A4 | The words around a quiz clip lead with its topic and say the board's question in plain words ("How many ponies?"; WHERE IN THE WORLD? asks "Which country?"). The first cover is the question itself (HOW MANY PONIES?), else the topic with it (NASA: HOW MANY?); the title beside it the challenge ("Exmoor Pony Herd: can you beat Paco and Penny?"), the second title the question ("…: how many ponies? Guess before the answer"), the caption's first line both; one topic hashtag before #newsquiz #quiz #news. The AI writer is told the same. | 3, search | `server/publish/packaging.js` `fallbackPackage`, `quizCovers`, `hashtagsFor`, `packagePrompt`; `server/publish/moments.js` `quizWords` |
| A5 | The quiz's end card asks for the next question: FOLLOW FOR THE over NEXT QUESTION at 2x under the programme's plate, inside the quiz's marquee (the emblem at 3x and the slogan's row make the room); the AI notice under it is unchanged, and so are the card's 2.6 s. One card goes to every feed, so it says FOLLOW. | 5, 7 | `public/js/clip/cards.js` `END_CTAS`; `tools/publish/factory.mjs` (`&cta=next-question`) |

## 3. Phase B (next)

- **B1, the face hook** (an experiment, §4): the question's host as a cut-out sliding in under the board in the first
  0.25 s, looking up at the question, gone by 2.5 s (motion onset, a face, a gaze cue: principles 1 and 2).
- **B2, the numbers**: a free reader of each published clip's figures (YouTube's views, engaged views, average viewed
  and retention; Instagram's skip rate, watch time and sends; TikTok's counts), by experiment arm.
- **B3, the series**: already there on YouTube: every upload joins its programme's playlist (`adapters/youtube.js`:
  "PAY ATTENTION · Shorts"); TikTok's playlists are made in its app, by hand.
- **B4, captions clear of TikTok's button column** once a phone screenshot of a published Short shows where it falls.

## 4. How we know

The study's rule (its §11): one experiment at a time, its two arms alternated clip by clip on the same days, at least
20 clips an arm; a change stays only when the share that stayed to watch (or, on Instagram, the skip rate) improves by
5 points or more and neither the average viewed nor the sends fall. Phase A's changes are not experiments: each fixes a
measured fault (the sound, a generic first frame, a start on rules) or follows a platform's own advice (search); they
are judged on the week before against the weeks after.

## 5. The samples (25 Oct)

PAY ATTENTION of 24 Oct made again with phase A (the same episode, its voices and the deterministic writer, as the
study's audit made it the day before; the gate holds every clip here only for the missing editorial contact):

| | 24 Oct (before) | 25 Oct (phase A) |
|---|---|---|
| The NASA question's first frame | ROUND THREE · HOW MANY? and its rules; the question at 4 s | GUESS THE NUMBER · 1 OF 3, HOW MANY LIGHT-YEARS? at 2x, the mast NASA'S WEBB |
| Its length | 28.3 s | 24.3 s (the end card's 2.6 s included) |
| Loudness, the five clips | −15.7 to −16.0 LUFS, peaks −5.3 dBTP | −14.0 to −14.1 LUFS, peaks −3.2 to −3.6 dBTP (+1.7 to +2 dB) |
| The ponies question's reveal | the figure inside the sentence only | THE ANSWER over ABOUT 100 PONIES, in gold where the question was |
| Its words | "How many? A question about Exmoor Pony Herd from this week's news", covers BEAT PACO? | "Exmoor Pony Herd: can you beat Paco and Penny?", covers HOW MANY PONIES? / BEAT PACO? / EXMOOR PONY HERD?, #ExmoorPonyHerd |
| The DOUBLE OR NOTHING question's words | "Can you beat Paco and Penny? This week's news quiz", no cover | "Elon Musk: can you beat Paco and Penny?", cover WHICH COUNTRY? |
| The end card | the programme and the AI notice | the same, with FOLLOW FOR THE NEXT QUESTION |
