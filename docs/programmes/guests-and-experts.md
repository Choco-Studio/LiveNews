# The channel's experts — style bible

Eight recurring analysts of GLOBIT 24's own, all fictional. A story of their field is put to one of them after the presenter reads it: the presenter introduces them and asks a question, they explain the story from its source, they are asked one more and are thanked. They join from a studio of their desk, never from the scene. Owner, 23:05: "Don't forget the EXPERTS — that brings the programme to life." Owner, 9 Oct: "termina lo de los expertos. Los fondos pulelos. Voces también. Apariencias también." LISTA item 18; WAVE3 §3.6 and §6. This file builds on `docs/ART_DIRECTION.md` and `docs/programmes/world-now.md` (the correspondents' links, whose machinery the experts share).

The names, looks and voices are proposals until the owner approves them (WAVE3 §13: a famous-name check before air).

## 1. The roster

| Expert | Title (strap) | Desk | Programmes | Studio | Look | Voice (Kokoro) |
|---|---|---|---|---|---|---|
| Omar Ledger | Economics Editor | economics | WORLD NOW, MONEY MINUTE | markets | salt-and-pepper side parting, trimmed grey beard, dark rectangular glasses, midnight suit, burgundy tie | am_adam 60% + am_onyx 40%, en-GB, 0.96 |
| Clara Meridian | Diplomatic Correspondent | diplomacy | WORLD NOW | bureau | silver hair to the shoulder, pearl studs, royal-blue blazer, white blouse, silver brooch | ff_siwis 50% + af_sky 50%, en-GB, 0.95 |
| Dev Isobar | Climate Correspondent | climate | WORLD NOW, COSMOS DESK | field | black textured crop, clean-shaven, deep brown skin, forest-green blazer over a cream knit | am_liam, en-US, 1.03 |
| Dr Tomas Albedo | Planetary Scientist | planetary | COSMOS DESK | observatory | wild halo of white hair, white moustache, round glasses, brown cardigan, pale shirt | am_santa 60% + am_onyx 40%, en-US, 0.94 |
| June Kernel | Security & Hardware Analyst | tech | TECH BYTES | lab | magenta bob, black roll-neck | af_jessica, en-US, 1.06 |
| Dr Amara Pulse | Health Correspondent | health | WORLD NOW | clinic | close natural crop, deep brown skin, gold hoops, white jacket over a navy top | hf_alpha 50% + af_river 50%, en-GB, 0.98 |
| Leo Sepia | Culture Correspondent | culture | WORLD NOW | gallery | ginger side parting, short ginger beard, charcoal blazer over a mustard knit | am_liam 60% + im_nicola 40%, en-GB, 1.04 |
| Ines Clause | Legal Affairs Correspondent | legal | WORLD NOW | chambers | long chestnut hair, tan skin, charcoal tailored jacket, white blouse, fine gold chain | ef_dora 55% + af_sky 45%, en-US, 1.02 |

- **Config:** each is a presenter in `config/channel.json` with `role`, `personality`, `voice` and `expert: { desk, backdrop }`. A programme lists its experts (`experts`, its own speciality first: ties go to that order) and how many analyses it airs (`analyses`, 0 to 2; WORLD NOW, TECH BYTES, COSMOS DESK and MONEY MINUTE air 1 each today, NEWS IN 60 and WORLD WEATHER none). `server/channel.js` refuses an unknown expert, a presenter without a known desk or a backdrop, or `analyses` out of range; the tests check that every backdrop is a drawn studio.
- **Desks:** `server/experts.js` `EXPERT_DESKS`: what each covers, the feed categories that lean its way, the words of its field, and the presenter's stock questions.

## 2. Which story, and what they may say

- **The story:** a main story of the expert's field. Never the number of the day, a round-up item, "And finally", a breaking, grave or sad story, or a story given to a correspondent.
  - The writer names the expert (`analysis.expert`). If the story clearly belongs to another expert's field, it goes to that expert (`expertFor`: the desk with the most distinct words of its field in the headline, summary and kicker, two at least; "storm" and "Storms" count once).
  - The strongest match airs first, up to the programme's `analyses`.
- **The exchange** (`server/writer.js` `expandAnalyses`): the story ends on the presenter's introduction ("Our Economics Editor, Omar Ledger, is with us.") and the first question addressed by first name ("Omar, what is behind it?"). Then four `cross` segments of kind `expert`:
  1. **piece:** the expert's answer, 2 or 3 sentences;
  2. **ask:** the follow-up, fitted to the answer ("what happens next?" when it looks ahead, "what else should people know?" otherwise);
  3. **answer:** 1 or 2 more sentences;
  4. **thanks.**
  The ask and answer are left out when there is nothing more to say.
- **Grounding:** every answer sentence must be supported by the story's source, like the presenter's own (`groundAnalysis`).
  - Dropped: a question, a claim to have seen or spoken to anyone (`presenceClaim`: "I've seen", "told me", "here in…"), advice in their own voice ("savers should…", "I'd recommend"), and a line the presenter already read.
  - A question with a figure or a name of its own, or over 14 words, is replaced by the desk's stock question.
  - Fewer than two answers left: the story airs as a plain story.
- **Hard rules (WAVE3 §6, in the writer's prompt and in code):** the expert explains and never reports. No scene, no unnamed sources, no opinion and no prediction the source does not make, no financial or medical advice, no view on a real person or on politics. Always labelled as GLOBIT 24 staff (the strap's source line is the channel).
- **The offline writer** (`server/providers/mock.js`) picks a story of four or more sentences that clearly belongs to one of the programme's experts. The expert's answers are the story's remaining source sentences, the first with a short spoken frame ("The key detail is this:").
- **Review:** `collapseCrosses` folds the exchange back into the story's `analysis` for the standards editor, and a second pass rebuilds it the same.

## 3. On air

- **Shots:** the correspondents' (director `playCross`, `linkplan.js`).
  - **LOCATION:** the expert in a medium close-up on the left third, in front of their studio.
  - **TWO-WAY:** the presenter's single and the expert side by side, for the questions.
  - Never B-roll or FILE: an expert has no place.
- **Graphics** (`public/js/graphics/remote.js`):
  - **ANALYSIS** where a link's place tag would be;
  - the expert's title on their box in the two-way;
  - the strap with their first words: name, title, GLOBIT 24.
- **Voice slots:** the experts take the R slots after the correspondents' (`episode.correspondents`, e.g. `{ R1: 'vic', R2: 'mika', R3: 'omar' }`). One analysis per programme today, so two experts are never heard back to back.

## 4. Looks (`public/js/v2/canvas25d/cast/experts.js`)

- **Built on proven parts:** the presenters' hair drawers (Paco's short cut, Lola's bob, Ada's straight cut, Max's textured cut, Nova's coils, which now take a look's own `halo`), Max's beard, Paco's moustache, Ada's glasses and stud (`drawSpecs`, `drawStud`), and the wardrobe outfits. The presenters render pixel-identical after the refactor.
- **What marks an expert:** the correspondents' earpiece (its tube into the collar) and lapel microphone.
- **One identity each at 1x:**
  - a silhouette (the white halo, the magenta bob, the close crop, the silver hair);
  - a colour (each outfit is its own);
  - a detail (glasses, beard, hoops, brooch, chain).
  - No expert's colour histogram is within 35% of any other face's (`test/experts.test.js`).
- **Skin:** Dev and Amara's deep skin is lit like Nova's (`drawWarmHead`: the planes facing the key turn to tan). The face stays the warmest, brightest thing in each frame.
- **Lab:** `public/lab/experts.html` shows each expert in their studio through the real Stage, location or two-way, taking turns with the presenter.

## 5. Studios (`public/js/v2/canvas25d/studio/experts.js`)

One virtual set per desk, in the palette, with flat bands and dithered seams, and a lens falloff (one palette step darker at the edges). The space behind the head is calm and mid-dark; the desk's story sits on the right two thirds; there is no text anywhere. Each studio is built once into a cached layer, and a few pixels move on top of it, slowly. Live pixels take the falloff too, so a light at the edge is never brighter than its surroundings.

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

- **Auditioned on an analyst's answer:** 79 candidate blends over four rounds (`casting.json` notes). Measured:
  - timbre: 40-band mel cepstrum, coefficients 1-12;
  - pitch: median F0 and IQR;
  - intelligibility: PocketSphinx's word error rate on the same copy.
- **Distance from the cast:** every expert is at least 55 from the presenter they talk to and from the voices of their programmes; the cast's own closest pairs are 63-66.
  - Tomas sits nearest UNIT-8 (51, heard through its robot effect) and Sam (53, never on COSMOS).
  - Clara and Ines share af_sky (37 apart), but differ by accent (en-GB, en-US), pace, and a French against a Spanish colour.
- **Never** an advert's lead voice either (`adcast.json`): Ines leads with ef_dora and Clara holds af_sky to an equal share, since an advert leads with af_sky.
- **Never** a presenter's lead voice, nor any of Paco's (bm_george, bm_lewis, bm_daniel).
- **Accent:** non-English Kokoro voices (ff_siwis, hf_alpha, im_nicola, ef_dora) are blended for colour and read with English phonemes, so the accent stays the config's.
- **Pace:** each speed follows the personality: Tomas unhurried 0.94, June quick 1.06. All use WORLD NOW's pause set.

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
- Laughter in the exchanges (LISTA decision 5: "pueden reírse en las charlas") waits for the sounds work (LISTA item 14, decision 7).
- The guests of WAVE3 §3.6 (re-staged public figures, IN THEIR WORDS, AI-built looks) are a separate piece of work. The experts here are the roster only.
- The sample stories come from the demo feeds. With the real writer and real news, more stories qualify, and a second analysis can be allowed per programme (`analyses: 2`).
