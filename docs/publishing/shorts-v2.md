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

## 2. Phase A

| # | Change | Principle | Where |
|---|---|---|---|
| A1 | Every clip is brought to −14 LUFS integrated, true peak −1.5 dBTP at most (half a decibel under the feeds' −1, for the AAC encoder's overshoot), by one linear gain on its whole sound: measured first as the graph will mix it, measured again once made, both kept in the clip's JSON. No compressor and no limiter: the house mix keeps its dynamics. YouTube plays at about −14 and never turns a quiet video up; our clips measured −15.7 to −17.1. | 6 | `server/publish/render.js` `LOUDNESS`, `loudnessArgs`, `loudnessGain`, `composeArgs({ gain })`; `tools/publish/factory.mjs` |
| A2 | Every quiz question clip starts on its question. The round's title card (its name and its rules) is no longer the first four seconds of the round's first question: the board the question opens on names the game. The whole-round clip still opens on the card. | 1, 3 | `server/publish/moments.js` `quizMoments` |
| A3 | On the vertical HOW MANY? board the question is asked in big type from its first frame: GUESS THE NUMBER · 2 OF 3 as its kicker, then HOW MANY PONIES?, HOW MANY LIGHT-YEARS?, HOW MUCH? (a sum), WHAT PERCENT? (a share) at 2x on up to two lines, made from the figure's label alone, so never its answer (a label that is no plain plural, STEAM from "the $789 Steam Deck", gives HOW MANY?). The room comes from the guess boxes (21 rows, not 25) and then the shorter question; where nothing is left under the guesses, the question turns into its answer at the reveal, in the reveal's yellow (THE ANSWER, ABOUT 100 PONIES): the peak where the eye already is. The mast beside the bug says the topic (NASA, EXMOOR PONY HERD) instead of PLAY ALONG. The vertical live shows the same board. | 2, 3, 5, 6 | `public/js/scenes/quiz-ask.js` `askOf`, `askLines`, `quizTopic`; `public/js/clip/vquiz.js` `howManyPlan`, `askHeader`; lab: `/lab/vquiz.html?glass=1&only=howmanyponies` |
| A4 | The words around a quiz clip lead with its topic and say the board's question in plain words ("How many ponies?"; WHERE IN THE WORLD? asks "Which country?"). The first cover is the question itself (HOW MANY PONIES?), else the topic with it (NASA: HOW MANY?); the title beside it the challenge ("Exmoor Pony Herd: can you beat Paco and Penny?"), the second title the question ("…: how many ponies? Guess before the answer"), the caption's first line both; one topic hashtag before #newsquiz #quiz #news. The AI writer is told the same. | 3, search | `server/publish/packaging.js` `fallbackPackage`, `quizCovers`, `hashtagsFor`, `packagePrompt`; `server/publish/moments.js` `quizWords` |
| A5 | The quiz's end card asks for the next question: FOLLOW FOR THE over NEXT QUESTION at 2x under the programme's plate, inside the quiz's marquee (the emblem at 3x and the slogan's row make the room); the AI notice under it is unchanged, and so are the card's 2.6 s. One card goes to every feed, so it says FOLLOW. | 5, 7 | `public/js/clip/cards.js` `END_CTAS`; `tools/publish/factory.mjs` (`&cta=next-question`) |

## 3. Phase B

- **B1, the face hook** (an experiment, §4; running from 25 Oct): on half the quiz questions' clips, alternated clip by
  clip, the two players rise from behind their desk under the question board in the first quarter second, eyes and
  heads turned up toward the question, and sink back by 2.6 s (or a tenth of a second before the clip's first cut):
  motion where the eye starts, two faces, their gaze on the words (principles 1 and 2). Not the host: the host's voice
  reads the question, and a still face under a speaking voice reads as wrong. The strip is the players' own cut-outs
  (`clip/sprite.js`, now with a head's pitch and the eyes' direction), drawn by `/lab/clip.html` `__clipLab.faces` and
  laid over the band above the desk by the clip's graph (`render.js` `FACES`); the arm is in the clip's JSON, its queue
  item and its ledger line (`server/publish/experiments.js`, the turns in `data/publish/experiments.json`).
- **B2, the numbers** (built): `node tools/publish/metrics.mjs` reads back every clip the ledger says went out, by API
  or marked "Ya lo he publicado" by hand, and writes `data/publish/metrics/latest.json` (and a dated copy) with the
  owner's summary in Spanish: by network and kind, by experiment arm, each experiment's verdict
  (`server/publish/metrics.js`). A clip published by hand without its link is found by its title among the channel's
  uploads. What each network gives with the credentials the uploads already use, and what the owner grants once:
  - YouTube: views, likes and comments now; the average viewed, its minutes and the shares with the scope
    `yt-analytics.readonly` in a new `YOUTUBE_REFRESH_TOKEN`. The share that stayed to watch rather than swiped away
    is in YouTube Studio alone: copied by hand, weekly.
  - Instagram: views, reach, likes, comments, shares, saves and the average watch time with
    `instagram_business_manage_insights` on `INSTAGRAM_ACCESS_TOKEN`.
  - TikTok: views, likes, comments and shares with the scope `video.list` and each post's link (an inbox upload's id
    is not its video's).
- **B3, the series**: already there on YouTube: every upload joins its programme's playlist (`adapters/youtube.js`:
  "PAY ATTENTION · Shorts"); TikTok's playlists are made in its app, by hand.
- **B4, captions clear of TikTok's button column** once a phone screenshot of a published Short shows where it falls.

## 4. How we know

The study's rule (its §11): one experiment at a time, its two arms alternated clip by clip on the same days, at least
20 clips an arm; a change stays only when the share that stayed to watch (or, on Instagram, the skip rate) improves by
5 points or more and neither the average viewed nor the sends fall. The metrics tool applies the half it can read:
"collecting" until 20 clips an arm, "drop" when the average viewed or the sends a thousand views fall, else "check
Studio" (the owner reads the share that stayed to watch there: no tool declares a win alone). Phase A's changes are
not experiments: each fixes a measured fault (the sound, a generic first frame, a start on rules) or follows a
platform's own advice (search); they are judged on the week before against the weeks after.

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

## 6. The intro: the hook is the programme's own spectacle (26 Oct)

The owner, 26 Oct, after the quiz clips of §2 ("Sinceramente eso es una caca"): "necesitamos el hook. Podemos usar la
intro para ello como en los programas: espectacular, que dure 3 segundos como máximo y con una música que mantenga
atención. Empieza con el de cosmos". On the tries that followed: "para este formato vertical sería mejor hacer un
acercamiento desde fuera de la galaxia, con todas las estrellas y puntitos moviéndose dando un efecto potente"; "evita
recuadros con texto; si lo haces, que sean letras que tengan que ver con el estilo metidas dentro; no hace falta tampoco
muchísimo texto"; "mejor que lleve hasta Saturno, que es el icono… que parezca una galaxia de verdad cuando te acercas,
como el espacio real. Y las letras currátelas, puntitos no queda muy creativo"; "puedes usar 4 segundos de intro si
quieres. Por lo que he visto es buen gancho".

So every vertical clip of a programme that has one opens on its intro, then cuts to the clip's first frame, where the
story's words, the bug and the programme's tag are. COSMOS DESK's (`public/js/scenes/opens/cosmosintro.js`, its theme
`audio/themes.js` `introTheme`, both on `cues.js` `INTRO_CUES.cosmos`): six beats at 92 BPM, 3.9 s (117 frames), one
unbroken fall from outside a spiral galaxy down to Saturn:

| Beats | The picture | The theme (E lydian) |
|---|---|---|
| 0-1.75 | A spiral galaxy seen from outside it, tilted: a cream core, two blue-white arms threaded with pink nebulae and cut by dark dust lanes, its older disc a warm glow; the camera already falling toward a point in its near arm; three of its giants catch the light | On the first frame a felt thump, a timpani stroke and a pluck chord over the strings' Emaj7 and a sine sub; the orbit in sixteenths, climbing; a bell on each giant; a felt pulse on each beat |
| 1.75-2.6 | The glow resolves into stars as the camera reaches the arm, and they stream past it, filling the frame; the camera swings round as it falls, so the galaxy it leaves becomes a band across the sky | A timpani roll, the strings louder, an air swell |
| 3 | The camera passes the Sun: it grows from a star to a disc of light and flares | The stroke; the channel's signature at double speed, its DAH here |
| 3-5 | Saturn swells out of the glare to the emblem's place (the title sequence's own planet, 38 px across the radius on the hit), lit from the Sun behind the camera, its moon running a last orbit; COSMOS rises in under it letter by letter, then DESK between two magenta rules | The signature's colour (A#, the #4); a chime as each letter lands |
| 5-6 | The emblem and the logotype over the galaxy's band, a shine across the letters on the hit | The 5 on Emaj9#11, ringing on into the clip |

How the picture is drawn: about 80,000 points in space (the galaxy's core, disc, arms, nebulae and dust; the stars of
the arm round Saturn and of the Sun's neighbourhood, at every distance; a backdrop of sky) seen through one lens, the
camera's distance on a logarithmic track (powers of ten, from 57 units to 0.0003), the world turning about Saturn.
Each point gives the light a star at its distance would (falling as the square of the distance, so the galaxy's glow
holds its brightness as it resolves into stars) into three light buffers by colour and one of dust; a point that
moves draws its travel since the last frame, its light spread along it; an adaptation like the eye's brings the light
down when the frame fills with it. The light is then brought to the palette on three ramps (warm, blue, pink) through
the screen's Bayer matrix: a photograph's gradients in the channel's 32 colours.

The logotype: COSMOS in the channel's 5x7 face at four times its size, each pixel a 4 x 4 block with its outer corners
rounded where the letter turns, filled from white through cream and pink to magenta (Saturn's light over the
programme's colour), a white edge along its tops and a purple one under them, a black outline and a violet glow; the
letters rise in one after another with a little overshoot. DESK at twice the size, its letters spaced, between two
magenta rules. No plate, no box.

The rules it keeps, from §1 and the study: motion where the eye starts, on the first frame (principle 1); the rhythm
and the light climbing toward one peak, the Sun, on the music's stroke (anticipation that pays off; a feed's silence
is a swipe, so the theme sounds from the first frame); the icon the viewer will know the programme by at the end; few
words, the programme's name alone; the clip's own words take over at the cut, in the title band where they stay.

How it is made (`tools/publish/factory.mjs` `introClip`, once a run): `/lab/clip.html` draws it frame by frame
(`__clipLab.intro`) and renders its theme offline from its first beat (`__clipLab.introSound`, the channel's own mixer),
so the sound lands on the picture to the sample (the deterministic recorder runs a second of the page before its first
frame); the two go into a lossless file as the masters do. The clip's graph (`server/publish/render.js` `composeArgs`,
`introParts`) puts its picture and its sound to the cut first and lays the theme's tail, 6 dB down (the channel's music
dips so under a voice) and fading over `INTRO_TAIL` (2.2 s), under the clip's first words; the loudness is measured and
set on the whole (`loudnessArgs` mixes the same sound). Everything timed on the clip's own clock moves by the intro's
length in the made file: the caption files (`srtFor`/`vttFor` `offset`), the RECREATION label's evidence, TikTok's cover
frame (`coverAt`); the overlays (the hook, the face hook) are laid on the clip before the intro is put in front.
`--no-intro` makes clips without it. Horizontal clips have none. The other programmes' intros follow once the owner has
signed off COSMOS's: each its own idea for a phone, ending on its own emblem and logotype.
