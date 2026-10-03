# Owner feedback log (newest last) — every agent should read this

- 16:55 "¿Por qué se ven tan lag?" → the videos stuttered: live screen recording dropped frames. Use tools/record.mjs (deterministic). Motion must be smooth.
- 17:00 "Y con sonido, no?" → videos must have sound (music, sfx, voices). Voices team builds recording with sound + neural voices.
- 17:05 "Música suave de fondo para cada programa y momento, transiciones suaves, sin tapar al presentador y solo en buen momento."
- 17:08 "Mejora las voces, que realmente parezca que nos hemos esforzado."
- 17:15 "Ahora parece un programa infantil." → TONE CORRECTION (adult, mature indie pixel art, dry wit). Ads relaunched.
- 17:16 "Aunque lo de WORLD NOW está bastante bien." → the WORLD NOW open v2 is the tone reference.
- 17:20 "Los programas no se planean: el servidor los hace en tiempo real (adelantado unos minutos) con sus herramientas."
- 17:25 "Analiza noticieros reales que lo hacen bien. No todos los programas tienen que tener el mismo estilo." → docs/programmes/*.md.
- 17:35 "Ya empiezo a ver una mejora. Pero necesita pulido real todo." → finish quality is now the bar.
- 17:45 OWNER DECISION ON THE PRESENTER PROTOTYPES: "De los dos vídeos, el primero. El del traje negro es perfecto. Faltan pulir
  detalles del aspecto, manos etc. Pero los movimientos son naturales, me gustan." → PROTOTYPE A (canvas25d: Canvas 2.5D pixel
  rig, Paco in the dark suit) WINS. Keep its motion system (natural, continuous) and its look; POLISH appearance details,
  especially HANDS, plus faces/hair/clothing finish. Prototype B (webgl3d) is not used; at most graft small ideas.
  Prototype A code is now in the shared tree: public/js/v2/canvas25d/** + public/lab/foundation-canvas25d.html.
- 17:47 OWNER LOVED THIS DETAIL (keep it and build on it): "the girl in blue looks at him when he has spoken (not all the time, only
  at the start) felt incredibly natural — that is doing it right." → LISTENER BEHAVIOUR PRINCIPLE: the co-presenter briefly
  glances at the speaker at the START of the other's turn (and at hand-overs), then returns to camera/notes; occasional subtle nods
  or reactions motivated by content; never constant staring, never mechanical repetition. Generalise it to every pair and solo
  presenters (e.g. glance down at notes, at the video wall when it changes). This kind of motivated, understated life is the bar.
- 17:50 "Pule un poco más su aspecto, quita eso de que parezcan dibujos hechos con triángulos, cuadrados y círculos. Ya sabes. Añádele
  detalle." → PIXEL-ART CRAFT: presenters (and everything) must look hand-pixelled, not built from geometric primitives. Organic
  silhouettes; 3-4 tone shading ramps with hue shift; manual anti-aliasing on curves; selective outlines (sel-out, darker local
  colour instead of black everywhere); fabric folds, seams, lapel stitching, tie knot and dimple, shirt collar points; hair as
  strands/clumps with highlights, sideburns and hairline; ears, knuckles, fingernails, wrist creases; subtle skin variation (cheeks,
  nose shadow, under-eye); specular highlights on glasses/jewellery; clean clusters (no pillow shading, no noise, no banding).
  Close-ups get the most detail; wide shots keep readable silhouettes.
- 18:45 ADS: "Los anuncios me gustan bastante, pero necesitan alguna mejora ya que se ven un poco sin nada. Las patatas por ejemplo
  solo se las ve caer y encima caen raro." → The adult direction is right, but the spots feel EMPTY. Fill every shot: a real
  environment (set dressing, props, textures, light sources, depth layers), secondary action (steam, dust in light, reflections,
  background life), and product interaction (hands, people using it) instead of objects floating on black. Physically credible
  motion: falling objects tumble with angular velocity, air drag, believable arcs, contact, bounce and settle (squash only if
  materially right), with motion that reads at 1x. Corners (the crisps) is the explicit example: they only fall, and they fall oddly.
- 18:52 "¡Bravo! ¡BRAVO! El vídeo me ha dejado sorprendido y todavía no tiene ni audio. Igual es muy rápido (date cuenta que vamos a
  tener el stream abierto con este sistema funcionando 24/7)." → The direction of the full channel (graphics, opens, maps, number
  cards, editorial features) is RIGHT — keep it. PACE: it feels too fast for a 24/7 stream people leave on for hours. Calmer
  rhythm: longer shots (no cut faster than ~4 s; median 5-7 s), breathing room between segments (0.7-1.5 s), headlines and cards held
  long enough to read comfortably twice, ticker items held longer with gentle transitions, speech pacing at natural broadcast rates
  (per style bibles, ~150-170 wpm) also in mute/blips modes (the mute timeline must not run faster than real speech would), no
  frantic overlays. 24/7 ALSO MEANS: no fatigue (variety in shots, music beds, phrasing, ads rotation), no memory growth or leaks over
  many hours, no stalls, graceful recovery — a soak test is required before we call it done.
- 18:58 "Genera ahora un programa largo que junte muchas noticias, use fotos etc. (recuerda que eso lo tiene que poder hacer el programa con
  el suministrador de IA aunque por ahora lo impulses tú). Que tenga la voz, música, anuncios y cambio al siguiente programa." → showcase
  workflow: inbox AI provider (an agent answers the server's real prompts), recording harness with sound (tools/showcase/), long WORLD NOW
  → break → up next → TECH BYTES.
- 19:20 CORRECTION FROM THE OWNER: "Yo no dije nada de menos mapas, dije que las fotos las encuentren y las pongan." → KEEP THE MAPS.
  The goal is that the system FINDS photos for stories and SHOWS them: feed media, enclosures, og:image/twitter:image of the article,
  images from other outlets' reports of the same event (same-event cluster), and any other legitimate source the pipeline can reach;
  then put them on air (video wall, full-frame photo shots, photo + map in the same story when both exist). Never reduce map usage to
  make room for photos — add photos.
- 20:30 "WOW, hay cositas a pulir, pero está de cine! Es fascinante que esto funcione tan bien. Si logramos hacer varios programas,
  ajustes y además añadir alguna cosita más podemos tener un canal 24/7 que de verdad lo vale." → The direction is RIGHT (first
  sound video + wave-2 glance/close-ups/camera). Keep polishing; the goal is a 24/7 channel worth watching: several programmes,
  tuning, and a few extra features (orchestrator proposed: dayparts with set lighting/music by London time, more formats such as a
  weekend long review / explainer / good-news / photo of the day, breaking-news interruption, on-screen schedule, channel idents for
  air between blocks) — awaiting the owner's pick.
- 20:40 OWNER NOTES ON THE FIRST SOUND VIDEO (showcase-test-1.mp4):
  (1) "Al inicio en el resumen lo de Panamá no sale y cambia de los molinos al tren antes de que termine el diálogo de los molinos." →
      the headline montage must be driven by the SPOKEN teaser: each frame cuts in exactly when its sentence starts (real word times
      when segment.audio/words exist, else the speech timeline) and holds until that sentence ends; every teased story gets a frame
      (photo, else map, else a title card) — the Panama (breaking, no photo) frame was missing on screen.
  (2) "Cuando pasa del resumen al inicio y sale el banner o lo de noticias (es una transición rápida) se ve de fondo ya a los
      presentadores." → timeline shows a 'wide' studio shot set at 19.70 s, stinger at 20.00 s, breaking card at 20.40 s: the studio
      flashes behind the transition. Never show a shot for less than the minimum hold; go montage → stinger → card directly; the
      stinger must cover full-frame (no studio visible through it).
  (3) "Tienen pocos gestos y acaba haciéndose repetitivo. ¿Puedes ponerles más?" → more gestures and more variety: motivated
      gestures on most sentences of light/neutral stories, idle micro-gestures (papers, notes, hands shifting, posture), never the
      same gesture twice in a row, rotate variants, seeded per episode, still adult and restrained (grave stories: fewer, slower).
- 20:55 "En esos vídeos están temblando las personas, como si vibraran." → DIAGNOSED: recording artefact, not the product. The orchestrator
  recorded the wave-2 lab pages without ?still=1, so the lab's own real-time loop interleaved with the deterministic --step renders
  (whole figure alternating 1-2 px every frame). With ?still=1: 0 direction flips, smooth motion. RULE FOR EVERY AGENT: always add
  ?still=1 when capturing a lab page with --step. Critics: still treat any idle jitter/oscillation as a BLOCKER.
- 21:05 "En el vídeo donde enseña cómo mueve los dedos y cuenta, cada x tiempo se glitchea y desaparece el plató." → CONFIRMED REAL BUG
  (amplified by the orchestrator's clip concatenation): on a fresh page the v2 set is baked asynchronously, so the first 1-11 frames
  (up to 0.37 s) show the presenter on an empty background with no desk (evidence: $SP/reel/h-glitch.png). On air this would happen
  at start-up and whenever the set variant changes (programme change). RULE: never present a frame without the set — pre-bake all
  programme variants during warm-up, bake synchronously on first use, or keep showing the previous variant until the new bake is
  ready. Critics: BLOCKER.

## 22:40 — "Why are the photos that should come from Google hand-made? A model like gpt6luna couldn't do that. And it will be the orchestrator."
- The owner's production AI ("gpt6luna", via the provider chain) will be the ORCHESTRATOR: it picks stories and writes; it never draws.
- Photos must be REAL pictures found on the web for each story, never hand-made art on air. Hand-drawn/procedural pictures are
  acceptable ONLY as offline test fixtures (this container's network policy blocks news sites, so the demo uses invented stories).
- Action: after editorial-2, add an image-search TOOL the orchestrator can use: when a story has no usable picture from the feed /
  article page / same-event cluster, the model writes search terms and the server searches a configured image source
  (default Wikimedia Commons — free licences, no key; optional Google Custom Search / Bing with the operator's API key), with the
  same safety and quality gates, credit line ('PHOTO: <source>'), and never a drawn fallback on air (map or studio shot instead).
- The owner offered their own computer for CPU/GPU (only reachable via a local Claude Code / Remote Control session).

## 22:50 — on the 100 s video (v1 presenters) — ROUTED
1. [cast-b + w2-integ] The young presenter with headphones and hoodie (Max, v1 close-up portrait): headphones badly drawn; he looks very
   different from far (wide) vs close — "the change is brutal" for both presenters (Max, Ada). v2 must keep ONE identity across every
   framing (same rig/wardrobe/hair/colours at wide, medium, close); if headphones exist in any v2 look, redraw them properly or drop them.
   Making v2 the default path removes the v1 portrait mismatch — PRIORITY for the post-merge INTEG.
2. [ads-1] Ads are good; CLOUDBRELLA IS PERFECT (keep as is). BitFizz has visual bugs: the PERSON (nose/tasting shot) and the POUR — the
   glass grows bigger while the liquid is poured (scale pop). Fix both; no size changes of props within a shot unless it's a camera move.
3. [w2-integ + opens + director] Headline montage ("what's coming up") STILL buggy: sometimes BLACK, sometimes the PREVIOUS photo because
   the AUDIO RUNS AHEAD. Needs a real solution: cards cut on the teaser sentence onset of the actual audio clip (voice word timings), the
   picture of card N is preloaded before card N's line starts, and a card with no picture shows a designed fallback (headline over map /
   branded field) — NEVER black, never the previous story's picture. Must hold on both paths until v1 is retired. Add a test.
4. [WAVE 3 — new] Programmes must be MUCH LONGER for 24/7 ("if the programme ends in 3 minutes we have nothing"): more possibilities per
   programme, many more slide/graphic types, segments with depth, and GUESTS to simulate interviews (a new programme and/or inside some
   programmes). Guests get a CHARACTER CUSTOMIZATION the AI sets to resemble the person; optionally the FACE ONLY "sculpted" by the AI —
   then the orchestrator must prepare it well ahead (booking pipeline).
5. [voices — next level] "The voices improved a LOT, but take the step to the next level: more natural, even if it still sounds
   artificial — e.g. laughs etc. (without exaggerating)." → paralinguistics: soft chuckles/short laughs in light chats and banter (never in
   grave stories), audible breaths at phrase starts, natural micro-pauses and hesitations used sparingly, emphasis on key words, question
   intonation, warmer reactions ("mm", "right") between presenters; synced face (smile/laugh) and captions that don't print the noises.
6. [w2-hands + w2-face] Hands: "besides adding more gestures, make sure they DON'T OVERUSE them." → gesture density budget per speaker
   (most of the time hands rest or do tiny beats; a marked gesture only on meaningful words; cooldowns; listeners almost still), varied,
   never repetitive; adult news-anchor restraint.

## 23:00 — guests/interviews: owner APPROVED the responsible-design proposal, and clarified the intent
"I agree with your proposal. The interviews I proposed were to use REAL ones, just to make them closer: the person appears on the
screen or in the studio." → The core feature is RE-STAGING REAL INTERVIEW MATERIAL: when a story carries a real person's actual words
(quotes / interview statements in the sources), the channel shows that person as a pixel character on the studio wall (remote link)
or in the guest chair, voicing ONLY those sourced words (verbatim or faithfully trimmed, never invented), with the presenter's
questions framed around them, labelled "RECREATION — WORDS FROM PUBLIC STATEMENTS" + source credit. Fictional channel analysts remain
available for commentary within the facts. Resemblance respectful (no mockery), never victims of tragedies.

## 23:05 — "Don't forget the EXPERTS. That brings the programme to life."
The channel's own recurring EXPERTS/ANALYSTS/CORRESPONDENTS are a FIRST-CLASS feature (not secondary): a roster with distinct
personalities, specialities (economy, tech, science/space, geopolitics, climate, culture...), looks and voices, who come into the studio
or appear on the wall to explain and analyse stories within the facts of the sources; recurring across days so viewers recognise them;
used regularly in the longer programmes (analysis chats, explainers, live "from our correspondent" links).

## 23:10 — PACE & POLISH team
"Launch a polish team that analyses what runs too fast in the programme and regulates it: transitions, cooldowns, etc. Let's get
entertaining, polished programmes of up to 10 minutes." → stream 'pace' (wf_32471717-2b0, port 8710): measure from full v2 recordings,
public/js/pace.js single pacing table per programme, transitions/cooldowns/gesture budget, programmes up to ~10 min with an editorial arc.

## 2026-10-03 06:40 (after watching showcase-world-now-long-r1b, 8:44) — notes only, teams paused
1. WALL PICTURES LOOK BAD: "en las pantallas detrás de los presentadores las imágenes se ven fatal, como si tuvieran el filtro mal puesto".
   Diagnosis: the studio-wall picture path (public/js/v2/canvas25d wall.js + set picture pipeline: per-style palette reduction,
   hue mapping, box filter, highlight cap) posterises/bands the photo; the same pictures look fine full-screen.
   Fix direction: wall picture = faithful downscale (area/Lanczos-like) at native wall size, NO palette quantisation (or ≥64-colour
   adaptive + light ordered dither), only a gentle screen treatment (slight glow/scanline ≤10%), same colours as the full-screen shot.
   Acceptance: side-by-side wall vs full-screen crop, ΔE small, no hue bands; owner eyeball.
2. PICTURES ARE DRAWN BY CLAUDE: owner noticed the aired pictures are made by us (offline fixtures "TEST ILLUSTRATION · OFFLINE DEMO").
   Reminder of the rule (22:40): ON AIR ONLY REAL PHOTOS found on the web. Needs (a) network access to news/image hosts
   (environment Network access → Custom allowlist, or run on the owner's machine), (b) the image-search tool (Wikimedia Commons
   default, optional Google CSE/Bing key), (c) a recorded demo with real photos as the proof.
3. AD BREAK BUMPER: "se necesita algo que anuncie 'volvemos en 1 minuto' y entonces salgan los anuncios; si no se puede confundir
   el anuncio con un programa". Add: presenter out-line ("We'll be back in a minute") + break-in card "BACK IN 60 SECONDS · ADVERTISING"
   with countdown/ring sized to the actual break length; persistent "ADVERTISING" corner tag during ads; break-out card "WE'RE BACK"
   / next-programme sting. Channel on-screen language stays English unless owner says otherwise. Test: every break starts with the bumper.

## 2026-10-03 07:40 (after canal-18min parts 1-4) — notes only, teams paused
1. WEATHER STORY PICTURE TOO SMALL: on NEWS IN 60 (Sam, WEATHER strap) the photo is smaller than the wall screen behind him.
   Wall pictures must FILL the wall screen (cover-crop with safe focus), not sit letterboxed inside it. Goes with 06:40 #1.
2. NEW PROGRAMME — WORLD WEATHER, "algo realmente trabajado" (like Spanish TV weather, but world-wide and more general):
   - longer slot (target 5-8 min); full world map, then zone by zone: temperature, rain, sun/cloud, wind, as icons + numbers;
   - the presenter WALKS around the set and the CAMERA TRACKS with him while he points at and explains each region
     (needs standing full-body rig, walk cycle, foot planting, camera dolly/follow, point-at-map gestures);
   - a SECOND PANEL for warnings: hurricanes/typhoons (track + cone), heatwaves, floods, storms;
   - data must be REAL: forecasts from a weather API (e.g. Open-Meteo, no key) and official warnings (NHC / JTWC / GDACS / national
     services) — never invented; needs network access to those hosts. Warnings labelled with the source.
   - Reuse the news-map style (owner likes it) for the weather map.
3. GESTURES: improved; now they must happen AT THE RIGHT MOMENT (on the stressed word / when the line calls for it).
   Nova (COSMOS, the human) does them well — use her timing as the reference. The SECOND episode uses gestures better than the FIRST
   → investigate why the first episode of a run under-uses / mistimes gestures (warm-up, episode memory, planner budget).
4. UNIT-8 VOICE: robotic is fine but it sounds odd and annoying → softer robot treatment (less ring-mod/bitcrush/harshness,
   keep warmth and intelligibility, subtle vocoder tint). Deliver 3 A/B samples for the owner to choose.
5. NEWS MAP (where stories happen): PERFECT — protect it, don't change it.

6. (07:45) "Desde COSMOS el programa mejora una barbaridad." From COSMOS on (COSMOS + the 2nd WORLD NOW in canal-18min) everything
   reads much better than the first WORLD NOW / TECH BYTES / NEWS IN 60. Since the 2nd WORLD NOW also improves, suspect a WARM-UP /
   STATE effect, not the format: first-run planner memory (gestures/looks), caches (set/wall/faces/voices), pace budgets, page start.
   Task: diff timelines of WORLD NOW #1 vs #2 (canal-largo-timeline.json) — gestures/min, shot lengths, look changes, voice gaps;
   make the channel start "already warm" (pre-warm + seeded episode memory) so the first programme is as good as COSMOS.
   Checked 07:50: canal-18min ran ONE code version end to end (v2 runtime imported at page start ~05:51, ES modules load once per page;
   server code fixed at start). So the COSMOS-onward improvement is NOT newer code → warm-up/state or format effect. Owner suspected new code.
