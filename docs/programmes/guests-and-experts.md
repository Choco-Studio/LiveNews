# The channel's experts — style bible

Eight recurring analysts of GLOBIT 24's own, all fictional. A story of their field is put to one of them after the presenter reads it: the presenter introduces them and asks a question, they explain the story from its source, they are asked one more and are thanked. They join from a studio of their desk, never from the scene. Owner, 23:05: "Don't forget the EXPERTS — that brings the programme to life." Owner, 9 Oct: "termina lo de los expertos. Los fondos pulelos. Voces también. Apariencias también." LISTA item 18; WAVE3 §3.6 and §6. This file builds on `docs/ART_DIRECTION.md` and `docs/programmes/world-now.md` (the correspondents' links, whose machinery the experts share).

The names, looks and voices are proposals until the owner approves them (WAVE3 §13: a famous-name check before air).

## 1. The roster

| Expert | Title (strap) | Desk | Programmes | Studio | Look | Voice (Kokoro) |
|---|---|---|---|---|---|---|
| Omar Ledger | Economics Editor | economics | WORLD NOW, MONEY MINUTE | markets | receding hairline with a thin salt-and-pepper crop, trimmed grey beard, dark rectangular glasses, near-black charcoal suit, blue tie | am_michael 55% + bm_daniel 45%, en-GB, 1.03 |
| Clara Meridian | Diplomatic Correspondent | diplomacy | WORLD NOW | bureau | short silver pixie with a side-swept fringe, pearl studs, royal-blue blazer, white blouse, silver brooch | bf_isabella 55% + af_bella 45%, en-GB, 0.95 |
| Dev Isobar | Climate Correspondent | climate | WORLD NOW, COSMOS DESK | field | high-top of short twists over faded sides, clean-shaven, deep brown skin, forest-green blazer over a cream knit | am_fenrir 50% + am_liam 30% + am_onyx 20%, en-US, 1.13 |
| Dr Tomas Albedo | Planetary Scientist | planetary | COSMOS DESK | observatory | bald crown with wild white tufts above and behind the ears, white moustache, round glasses, brown cardigan, pale shirt | am_michael 52% + am_eric 48%, en-US, 0.90 |
| June Kernel | Security & Hardware Analyst | tech | TECH BYTES | lab | asymmetric magenta undercut (one side shaved, the long top swept to the jaw), black roll-neck | af_sarah 60% + af_aoede 40%, en-US, 1.11 |
| Dr Amara Pulse | Health Correspondent | health | WORLD NOW | clinic | shoulder-length box braids (two gold cuffs), deep brown skin, gold hoops, white jacket over a navy top | af_alloy 55% + bf_emma 45%, en-GB, 0.98 |
| Leo Sepia | Culture Correspondent | culture | WORLD NOW | gallery | ginger curly mop, short ginger beard, charcoal blazer over a mustard knit | bm_fable 60% + bm_daniel 40%, en-GB, 1.15 |
| Ines Clause | Legal Affairs Correspondent | legal | WORLD NOW | chambers | long chestnut waves from a centre parting, tan skin, plum tailored jacket, white blouse, fine gold chain | af_kore 55% + af_sky 45%, en-US, 1.14 |

- **Config:** each is a presenter in `config/channel.json` with `role`, `personality`, `voice` and `expert: { desk, backdrop }`. A programme lists its experts (`experts`, its own speciality first: ties go to that order) and how many analyses it airs (`analyses`, 0 to 2; WORLD NOW, TECH BYTES, COSMOS DESK and MONEY MINUTE air 1 each today, NEWS IN 60 and WORLD WEATHER none). A programme may name a `resident` among its experts: part of its format, booked whenever a story fits (MONEY MINUTE's Omar, TECH BYTES' June, COSMOS DESK's Tomas). `server/channel.js` refuses an unknown expert, a presenter without a known desk or a backdrop, `analyses` out of range, or a resident who is not one of the programme's experts; the tests check that every backdrop is a drawn studio.
- **Desks:** `server/experts.js` `EXPERT_DESKS`: what each covers, the feed categories that lean its way, the words of its field, and the presenter's stock questions.

## 2. Which story, and what they may say

- **The story:** a main story of the expert's field. Never the number of the day, a round-up item, "And finally", a breaking, grave or sad story, or a story given to a correspondent.
  - The writer names the expert (`analysis.expert`). If the story clearly belongs to another expert's field, it goes to that expert (`expertFor`: the desk with the most distinct words of its field in the headline, summary and kicker, two at least; "storm" and "Storms" count once).
  - The strongest match airs first, up to the programme's `analyses`.
- **Rotation** (`restedExperts`, the producer's memory of the last 6 hours): an expert booked on a programme rests there for 2 hours (WAVE3: once per 2 h per programme, the speciality aside). The resident never rests. The others are offered the one seen longest ago first, on any programme, so ties spread the bookings across the roster. In six rotations of the demo news all eight are on air, and WORLD NOW never books the same expert twice in a row.
- **The exchange** (`server/writer.js` `expandAnalyses`): the story ends on the presenter's introduction ("Our Economics Editor, Omar Ledger, is with us.") and the first question addressed by first name ("Omar, what is behind it?"). Then four `cross` segments of kind `expert`:
  1. **piece:** the expert's answer, 2 or 3 sentences;
  2. **ask:** the follow-up, fitted to the answer ("what happens next?" when it looks ahead, "what else should people know?" otherwise);
  3. **answer:** 1 or 2 more sentences;
  4. **thanks.**
  The ask and answer are left out when there is nothing more to say.
- **Variety:** the presenter's lines round the expert come from fixed sets (10 introductions, 7 stock questions per desk, 6 follow-ups that look ahead and 6 that do not, 6 thanks). The station counts its analyses, and each kind of line walks through all its forms before one comes back, so the same introduction or thanks is never heard twice running. A follow-up the writer gave, and the question it wrote, take precedence over the sets.
- **Grounding:** every answer sentence must be supported by the story's source, like the presenter's own (`groundAnalysis`).
  - Dropped: a question, a claim to have seen or spoken to anyone (`presenceClaim`: "I've seen", "told me", "here in…"), advice in their own voice ("savers should…", "I'd recommend"), and a line the presenter already read.
  - The same fact twice in the answers (once with more to it) airs once, the fuller way.
  - A question with a figure or a name of its own, or over 14 words, is replaced by the desk's stock question.
  - Fewer than two answers left: the story airs as a plain story.
- **Hard rules (WAVE3 §6, in the writer's prompt and in code):** the expert explains and never reports. No scene, no unnamed sources, no opinion and no prediction the source does not make, no financial or medical advice, no view on a real person or on politics. Always labelled as GLOBIT 24 staff (the strap's source line is the channel).
- **The offline writer** (`server/providers/mock.js`) picks a story of four or more sentences that clearly belongs to one of the programme's experts. The expert's answers are the story's remaining source sentences. The first sometimes gets a short spoken frame ("The key detail is this:", walked through like the presenter's lines, and on about one answer in three no frame at all), after which the sentence runs on in lower case, a name or a place keeping its capital.
- **Review:** `collapseCrosses` folds the exchange back into the story's `analysis` for the standards editor, and a second pass rebuilds it the same.

## 3. On air

- **Shots:** the correspondents' (director `playCross`, `linkplan.js`).
  - **TWO-WAY:** the presenter's single and the expert side by side, for the questions. It comes up with the introduction (the story's line before the question): the story is marked `linkKind: 'expert'`, and the v2 shot plan leaves both lines to the hand-over, so the two-way has held the floor when the expert starts.
  - **LOCATION:** the expert in a medium close-up on the left third, in front of their studio, for each answer (from the first words; without pictures to cut to, by their second sentence at the latest).
  - Never B-roll or FILE: an expert has no place.
  - In the two-way each box keeps 3 px above the crown of the hair (Dev's high-top, Leo's curls, Nova's coils on the presenter's side): the box rises when the head would be cut.
- **Graphics** (`public/js/graphics/remote.js`):
  - **ANALYSIS** where a link's place tag would be;
  - the expert's title on their box in the two-way;
  - the strap with their first words: name, title, GLOBIT 24.
- **Voice slots:** the experts take the R slots after the correspondents' (`episode.correspondents`, e.g. `{ R1: 'vic', R2: 'mika', R3: 'omar' }`). One analysis per programme today, so two experts are never heard back to back.

## 4. Looks (`public/js/v2/canvas25d/cast/experts.js`)

- **Hair of their own** (`cast/hair-experts.js`; owner 12 Oct: "el pelo de algunos es muy parecido con los de otros presentadores"): the experts first borrowed the presenters' hair drawers in other colours and read as their twins (Omar as Paco, Tomas as Nova's halo in white). Each now has a drawer of their own, following the presenters' craft (head-local units, yaw and pitch, the three LOD tiers, a clean outer edge for a painted hair light, follow-through on what hangs): Omar's receding crop, Clara's pixie, Dev's high-top of twists, Tomas's bald crown and professor's ring, June's asymmetric undercut, Amara's box braids (the scalp in front, the hanging braids behind the ears and the neck), Leo's curly mop, Ines's waves (with the hair behind the neck). `test/experts.test.js` checks no expert draws hair with a presenter's, a correspondent's or another expert's drawer.
- **Built on proven parts otherwise:** Max's beard, Paco's moustache, Ada's glasses and stud (`drawSpecs`, `drawStud`), and the wardrobe outfits.
- **Outfits apart too** (owner 12 Oct): Omar's suit is a near-black charcoal with a blue tie and no pocket square (it was Paco's navy and red); Ines's jacket is plum, its shade cooled to ink (her charcoal was Rhea's on the same tan skin, and Nova's plum knit shades to maroon).
- **What marks an expert:** the correspondents' earpiece (its tube into the collar) and lapel microphone.
- **One identity each at 1x:**
  - a silhouette (the bald crown and white tufts, the high-top, the half-shaved magenta sweep, the braids, the curly mop, the waves, the pixie, the receding crop);
  - a colour (each outfit is its own);
  - a detail (glasses, beard, hoops, brooch, chain).
  - No expert's colour histogram is within 35% of any other face's (`test/experts.test.js`).
- **Skin:** Dev and Amara's deep skin is lit like Nova's (`drawWarmHead`: the planes facing the key turn to tan). The face stays the warmest, brightest thing in each frame.
- **Lab:** `public/lab/experts.html` shows each expert in their studio through the real Stage, location or two-way, taking turns with the presenter.

## 5. Studios (`public/js/v2/canvas25d/studio/experts.js`)

One virtual set per desk, in the palette, with flat bands and dithered seams, and a lens falloff (one palette step darker at the edges). The space behind the head is calm and mid-dark; the desk's story sits on the right two thirds, below the top right corner where the clock and the ANALYSIS tag sit (nothing that matters above y 40 there); there is no text anywhere. Each studio is built once into a cached layer, and a few pixels move on top of it, slowly. Live pixels take the falloff too, so a light at the edge is never brighter than its surroundings.

| Studio | The set | What moves |
|---|---|---|
| markets | an office high over a city at dusk: towers with lit windows, a spire, a market chart on the sill, dark wood | windows going on and off, the spire's aircraft light, the chart's last point, an airliner once a minute |
| bureau | wood panelling, an old map of the world on parchment in a gilt frame under a brass picture light, a sconce | capitals on the map glowing in turn |
| field | a window on snowy mountains and green hills, three wind turbines, plants in terracotta | clouds drifting behind the peaks, the turbines' blades |
| observatory | a dome at night: ribs, the open slit with the Milky Way and stars, a white telescope on its pier, red night lamps | stars twinkling, a meteor every 13 s, the mount's light |
| lab | server racks with status lights, a cable tray, an oscilloscope, a cyan light strip, a wash on the wall behind the speaker | the lights blinking at their own rates, the scope's trace |
| clinic | pale walls, blinds, a lightbox with a chest X-ray, a heart monitor on its arm | the monitor's sweep and beat, its heart light |
| gallery | a slate wall under track spots: a landscape in oils, a small portrait, a colour field, a board floor | dust turning in the spots' light |
| chambers | shelves of bound law reports in shadow, a desk, a green banker's lamp and its pool, a brass scales | dust in the lamp's light |

The two-way crops round the head (176 x 99), so each studio also reads in that box: the sky and towers, the panelling and sconce, the window's edge, the dome's ribs, the racks' glow, the blinds, a painting, the shelves.

## 6. Voices (`server/voice/casting.json`)

Re-cast in the voices round of 16 Oct (owner: "los nuevos personajes tienen voces algo artificiales";
`docs/roadmap/critique/voices-naturalness.md`). The first casting had a rule that every blend be made of components
no one else used; with every English Kokoro voice taken, it gave the experts voices of other languages reading
English (ff_siwis, hf_alpha, im_nicola, ef_dora) and Kokoro's weakest English voices (am_adam, am_santa, am_liam,
af_jessica). The rules now:

- **English voices only**, the dominant one graded C or better by Kokoro's own release notes
  (`tools/voice/voice-grades.json`), written first in the blend.
- **Never the lead voice of a presenter they air with** (a presenter of another programme may share it), nor any of
  Paco's own components (bm_george, bm_lewis); no advert leads with an expert's lead voice (`adcast.json`).
- **Measured, not assumed** (`tools/voice/audit.py`, summary in `tools/voice/voice-audit.json`, tested by
  `test/voice-casting.test.js`): every two people of one programme at least 40 apart in timbre, every two voices of
  the channel at least 25; a recogniser's word error rate and a predicted listening score on the channel's own
  copy; the accent a classifier hears.
- **Accent:** each reads with the config's phonemes and is heard with that accent (an accent classifier, see the
  critique). Clara leads with bf_isabella; Leo leads with bm_fable, which is only lightly British, so his second
  voice is British too (bm_daniel: with am_puck he was heard as American); Amara has bf_emma and Omar bm_daniel in
  their blends, which is what makes them sound British (an American voice read with British phonemes alone still
  sounds American).
- **Pace:** each speed keeps the old voice's pace on the same copy within a few per cent (characters a second), so
  the programmes' timings hold. All use WORLD NOW's pause set.
- **Going back:** the replaced blend of each stays in its entry (`previous`): copying `previous.voice`,
  `previous.speed` and `previous.lang` over the entry brings it back.

## 7. Files

- `server/experts.js`: desks, `expertsOf`, `expertFor`, the presenter's lines.
- `server/writer.js`: `analysisRule`, `ANALYSIS_SCHEMA`, `groundAnalysis`, `expandAnalyses`, `collapseCrosses`.
- `server/providers/mock.js`: the offline analyses.
- `server/channel.js`: validation, and `expert` in the public channel.
- `public/js/director.js`: `remoteOf` (kind and studio).
- `public/js/graphics/remote.js`: ANALYSIS and the box title.
- `public/js/v2/canvas25d/cast/experts.js`: the looks.
- `public/js/v2/canvas25d/studio/experts.js`: the studios.
- `public/js/v2/canvas25d/runtime/stage.js`: `remoteCut` and `drawRemote` (the studio, never footage).
- `server/voice/casting.json`: the voices.
- `public/lab/experts.html`: the lab.
- `test/experts.test.js`: the tests.

## 8. Open

- The owner's approval of the names, looks and voices (WAVE3 §13).
- Laughter in the exchanges (LISTA decision 5: "pueden reírse en las charlas") is off: the three synthetic chuckles were rejected by the owner (12 Oct), so nobody laughs on air until a truly natural sound exists (LISTA item 14).
- The guests of WAVE3 §3.6: the re-staged public figures are on air (section 9, IN THEIR WORDS); AI-built likenesses (`likeness: 'caricature'`, a FaceSpec) are not.
- The demo feeds carry a story for every desk (the Pacific tuna treaty for Clara, the Amsterdam night-flights ruling for Ines, the Cairo boats exhibition and the Seoul drone show for Leo, the probe, the telescope and the rover for Tomas). With the real writer and real news, more stories qualify, and a second analysis can be allowed per programme (`analyses: 2`).

## Grave stories (decision 3, owner 12 Oct: "se presentan con respeto pero bien")

- An expert may now analyse a grave story too, soberly.
  - The question is plain: the writer's own only when it asks for the background or what happens now, else one of `GRAVE_ASK` ("What do we know so far?", "What happens now?").
  - The offline writer's answer frame is plain or "What we know is this:" (`answerFrame(..., { grave: true })`).
  - Never a guess at causes or blame, and never a figure of the dead or hurt the source does not give.
- IN THEIR WORDS re-staging (`server/guests/restage.js`): in a grave story, only an official or a politician speaking in their role. They are staged soberly (`grave: true`, a serious expression). Victims, relatives and witnesses are never re-staged.


## 9. IN THEIR WORDS: re-staged guests (owner 12 Oct: "llevarlo a un nivel superior")

When a story quotes a person in a public role, that person appears in a press room and says their own exact public words, as a clearly labelled RECREATION. The server side (who may be re-staged, the booking, the hand-over, the audit) is `server/guests/restage.js` and the producer's `guests` stage; the rules are WAVE3 §6. This section is what the viewer sees.

- **On air:** a programme opts in with `restage` (0 to 2) in `config/channel.json`; WORLD NOW, TECH BYTES, COSMOS DESK and MONEY MINUTE have `restage: 1`. `RESTAGE=0` turns every recreation back into the quote card.
- **The sequence** (`public/js/director.js`):
  1. the presenter reads the story; its last sentence is the hand-over that says where the words come from ("In the words of the spokesperson, as reported by Circuit Weekly:"). It is read to camera on the presenter's own shot (a picture or a card on air cuts back to the close); no quote card, because the person is about to say those words;
  2. the cut to the person, full frame in the press room (the Stage's LOCATION shot), once the programme's shot floor allows; the label and the name super are on screen with the cut itself, and the first word comes 0.4 s later;
  3. the words, in the voice the server recorded for the booking (a generic synthetic blend, never an imitation), exactly as the source has them, in the captions too;
  4. the next segment cuts back to the studio, once the guest's shot has had the programme's floor (a one-line piece holds the person a moment after their last word). No B-roll, no two-way, no question and no thanks. No caption crosses the cut either way: the presenter's last line never sits under the guest.
  - Without the v2 Stage (the old renderer draws no guest) the words play over their quote card, still labelled. A piece whose booking was lost is labelled from its own source. A recreation is never on screen without its label.
- **The label** (`public/js/graphics/recreation.js`), static from the first frame of the piece to the last (no wipe that could leave a frame without it):
  - under the clock: RECREATION on a yellow plate, "— WORDS FROM PUBLIC STATEMENTS" white on black, and "SOURCE: <OUTLET>" on its own plate below, all in body type;
  - the name super in the strap's place: the role on the programme's accent tag (IN THEIR WORDS when the source names a role only), the name on the ink bar;
  - the story's strap is gone on the first frame (never leaving over the guest), a breaking item waits, the captions sit above the name super, one line at a time.
- **The look** (`public/js/v2/canvas25d/cast/guest.js`): the booking's LookSpec v1 drawn on the channel's proven parts.
  - Hair by style: Paco's side parting, Sam's crop, Max's textured quiff, Lola's bob, Mika's fringed bob, Ada's long straight hair, Penny's sleek pull-back (bun, ponytail), Nova's coils (a short halo), and the experts' receding crop, pixie, high-top, mop, waves and braids; plus a bald crown with clipped sides of its own.
  - Skin: the six spec tones on the palette's warm ramps (porcelain, light, medium, tan, brown, deep; deep lit like Nova's). Beards are Max's (a close one for stubble), moustaches Paco's, glasses FACES' (rect or round).
  - Face: a generic adult face seeded from the id inside narrow ranges (never a caricature), heavier lids with age, no resting smile.
  - Wear: a suit with a plain tie or an open collar, a blazer over a top, a tailored jacket over a blouse, in navy, charcoal, slate, brown or plum (never red, green or cyan). No earpiece and no lapel microphone: those mark the channel's own people.
  - **Never a twin of the cast:** a guest whose hair has the same drawer (or a related one) and colour family as a presenter, correspondent or expert, and shares one more cue (the skin's group, glasses, a beard or a moustache), takes the style's next drawer, else the next colour, else the other frame, else no glasses. For the seven anchors the same hair in the same colour family is enough. Over 3,000 seeded bookings: no twin, about 6 % drawn a colour off the spec and fewer than 1 % with other glasses.
  - Deterministic for the booking (same id and spec, same pixels), cached by id (the last 32 looks). `lookFor()` returns it for any `rp_` id or `kind: 'restaged'` booking, and a guest never falls back to Paco or Lola.
  - Materials are shared by colour (`base.js` `matKeys`: `guest:<part>:<colour>`), so hundreds of guests add at most ~200 entries to the material table, once.
- **The press room** (`public/js/v2/canvas25d/studio/press.js`, built with the experts' studio kit): fabric panels in a quiet blue-grey over a navy wainscot, one broad soft wash, a plain plaque on the right third (two rings round an abstract diamond: no words, no flag, nobody's real mark), and in front of the speaker a lectern (wood, or brushed steel before a brown suit) with five microphones on goosenecks below the chin (blank windshields and cubes, no broadcaster's logo). Nothing moves. The grave variant is darker and cooler, with no colour on the cubes.
- **Performance:** a neutral face (serious in a grave story, whatever the cue says), small head dips at sentence starts at most every 6.5 s (rarer when grave), no hands (they are behind the lectern), no smile, no sounds; blinks and breath as everyone.
- **Lab:** `public/lab/guests.html` shows the bookings in `public/lab/guests.json` (written by `node tools/guests-lab.mjs` with the server's own `bookGuest`) in the press room through the real Stage and graphics; `?guest=3`, `?grave=1`, `?graphics=0`, `?still=1`, and `window.__lab.show(i, t)` for `tools/shoot.mjs --step`.
- **Files:** `cast/guest.js` (looks), `studio/press.js` (the room), `runtime/stage.js` (`remoteCut`, `drawRemote`, the guest's face and nods), `graphics/recreation.js` (label and name super), `graphics/index.js` (the strap's place, captions), `director.js` (`remoteOf`, `playRestage`, the hand-over), `test/guests-screen.test.js`.
- **Open:** the owner's look at the press room and a few guests; named people with a checked identity keep a generic look (`likeness: 'none'`), never a portrait.
