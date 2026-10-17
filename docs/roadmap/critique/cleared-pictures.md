# Cleared pictures — the rights-aware picture desk (17 Oct)

The owner: "hazlo bien pero sin que nos quite nada de calidad del canal... Quiero soluciones buenas, no apaños", and
"El pixelado de las fotos no lo quites". The channel publishes on YouTube, TikTok, Instagram, Facebook and X: every
picture on air must be one the channel may publish, pixelated, with **no sanction risk and no loss of quality**.
**Gate: above 9.7 on a hostile critique; nothing counts as done below it.** The design is in
`docs/pictures/RIGHTS.md`; this is its critique.

The panel: a **picture editor** (is it the right picture for this story, would I run it), a **media lawyer** (may we
publish it, pixelated, monetised, on five platforms), a **senior broadcast director** (how it plays across the
programmes, tone on grave stories, consistency), a **pixel artist** (does it survive 416×234 and 24 colours, does a
portrait keep its face), and a **first-time viewer** (does anything look wrong, cheap or misleading).

Six categories, each 0–10; **the round's score is the lowest category**:

- **legal clearance**: every aired picture cleared under terms read from the source, credited as its licence asks,
  pixelation allowed; outlet photos never aired by default; what is uncertain said;
- **relevance**: judged by hand on the cleared picks: right subject, right person, not misleading, the right tone;
- **coverage**: stories with a picture, cleared now against outlet photos before;
- **visual quality**: resolution and look after pixelation, rendered at 4× on the real boards;
- **robustness**: a source down, Wikimedia's 429s, restarts, budgets;
- **tests**.

**How it was measured.** `tools/pictures/measure.mjs` runs the real desk (`server/picturedesk.js`, through
`server/wikimedia.js` to Wikipedia, Wikidata, Commons and NASA, live) over a stratified sample of the real archive of
12–17 Oct: 440 unique aired stories from real feeds (WORLD NOW 180, TECH BYTES 90, COSMOS 70, NEWS IN 60 60, MONEY
MINUTE 40; seed 17), each against the outlet photo it aired with. Answers are kept, so later rounds re-decide the same
stories with the new rules (`--redecide`). `tools/pictures/report.mjs` gives the numbers and the hand-check lists;
`tools/pictures/sheet.mjs` renders before/after contact sheets with the channel's own client code
(`public/lab/pictures.html`: the headline board, `pixelate.js`, the credit overlay). Relevance was judged by hand, by
reading each pick's story, subject, file and, on the sheets, the picture. Wikimedia answered 429 on about one request in
four from this machine (shared address); the tool waited the pauses out.

## Round 1 — the first desk

Sources in order: Wikidata P18 of the headline's exact subjects (person, thing, place), NASA's library for space, the
Commons FILE search of the place (`imagesearch.js` as it was), else the map. Rights: Commons' licence per file; NC/ND
refused; every credit `FILE · AUTHOR · LICENCE · PIXELATED`.

| | before (outlet photos) | round 1 (cleared) |
| --- | --- | --- |
| stories with a picture | 428 / 440 (97.3 %) | 178 / 440 (40.5 %) |
| WORLD NOW / TECH BYTES / COSMOS / NEWS IN 60 / MONEY MINUTE | 96.7 / 95.6 / 98.6 / 98.3 / 100 % | 43.9 / 35.6 / 24.3 / 46.7 / 55.0 % |
| grave stories (128) | — | 6 (4.7 %) |
| picks: places / subjects / portraits | — | 123 / 35 / 20 |

Findings, each from the hand check of all 178 picks:

1. **The free-text Commons search was the worst source on the channel** (picture editor, first-time viewer): 48 of its
   picks (27 % of all picks) showed the wrong place or no place at all. "US" searched as "Us" gave **Usa City Hall, a
   Japanese town hall, under sixteen US stories**; "Sweden" gave **Sweden, Maine**; "Kenya" gave **Arusha, Tanzania,
   in 1964**; "Florida station" (a Space Station story) gave **a Buenos Aires metro station**; "Japan" gave **a
   Japanese consul's portrait** under a Mars lander story; "New Delhi" protests got **geese at Delhi zoo**; Norway got
   a US general; Italy a sheet of medals. The old search's own name check passed all of these.
2. **Postcards under conflict** (broadcast director): nine place pictures aired under strikes, clashes or a war ("Kyiv
   hit by Russian ballistic missiles" over an aerial postcard of Kyiv). The grave test missed them: "missiles",
   "forces", "clashes" are not words of harm.
3. **Places met only in the summary** (picture editor): Westminster under "Is your boss watching you?", a Hampi temple
   under "These workers help train robots", San Francisco under a TechCrunch ticket offer. A place in the summary is
   rarely what the story is about.
4. **Satellite images as a country's picture** (pixel artist, viewer): Jamaica, Australia and Qatar aired as satellite
   views: real, but read as maps on air.
5. **Coverage holes with an obvious cleared picture** (picture editor): Google, Netflix and Facebook had pictures on
   Wikidata but were classed as "online services" and dropped; Microsoft, Bumble, Replit had none and nothing else was
   tried; 73 candidate pictures were refused for their shape though a 16:9 crop of them was fine; NASA's headquarters
   was refused because a category said "Buildings with flags"; COSMOS's plain-word subjects (beavers, a little tern,
   monarch butterflies) were never looked for.
6. **Portraits were right** (20 of 20, every one the right person in the right role: Carney, Lula, Obama, Pope Leo XIV,
   Zelenskyy, Mamdani, Warsh, Nandy, Jenrick, Rooney, Gibney, Raye...), but few: 26 subjects refused as "not the
   headline's subject", 14 "not named in full" (by design), 9 for another role.
7. **Legal** (lawyer): no NC/ND picture can be picked (Commons hosts none; the rule removed 0 Commons candidates), but
   the old `FREE_LICENCE` pattern in `imagesearch.js` and `footage.js` read "CC BY-NC 2.0" and "CC BY-ND 4.0" as free
   on their "CC BY" prefix: a real leak for the Google and Bing providers and for clips. Seven Free Art License files
   (A. Savin's Delhi photographs among them) and two European Parliament files were refused as unknown.

| category | score | why |
| --- | --- | --- |
| legal clearance | 8.0 | every pick cleared under its licence, credits complete; the NC/ND leak in the old search and footage; FAL unread |
| relevance | 4.0 | 27 % of picks from a search that showed the wrong place; postcards under conflict; summary places |
| coverage | 3.0 | 40.5 % against 97.3 % |
| visual quality | 6.5 | satellite views, interiors, a 1964 photo; portraits fine |
| robustness | 8.0 | pauses obeyed, answers kept; nothing failed |
| tests | 8.0 | the record, the desk, the producer, the archive, the client credit |
| **round 1** | **3.0** | coverage |

## Round 2 — strict search, conflict, headline places, topics, company buildings

Changes (each answering a finding above):

- **The Commons search is now for a city the headline names only** (never a country or a region: their own Wikidata
  picture is curated), the file's title naming the city in full and saying it is a view of it (skyline, aerial,
  harbour, square, street...) or naming the structure, **its country in its description or categories**, no people
  in the title (a consul, a general, "visits"), no photograph older than 1990, no interior, animal or leisure scene
  under news (findings 1, 4).
- **Armed conflict** (`CONFLICT`: missiles, airstrikes, troops, forces entering or repelling, clashes, rebels,
  occupation...) counts as harm whatever the words of grief: no place, no thing, only an official in their role
  (finding 2). A grave story with nobody harmed ("crisis", "war" in a political story) may show its place, soberly.
- **Only a place the headline names** (finding 3); never a place for a sports story (a match is not a city).
- **Not a photograph** now reads a category by its head ("Maps of Lisbon", "Satellite images of Jamaica", "Medals"),
  never "Buildings with flags"; satellite views are refused for places (finding 4).
- **Coverage**: a company is a company even when also "an online service" (Google, Netflix); a company or product
  with no usable Wikidata picture gets a Commons photo of its headquarters or of itself, named so in the file's title;
  a plain-word topic that is a living thing or a body in space ("beavers", "little tern", "monarch butterflies") is
  looked up by its Wikipedia title and kept only if Wikidata says so; the shape rule became "keeps at least 35 % in
  the 16:9 crop and enough pixels"; a name that redirects to an article about something else is refused ("Ramp" →
  "Inclined plane"); the quoted speaker late in the headline ("..., says PSG's Luis Enrique") may get a portrait;
  NASA's and US federal agencies' own article pictures are cleared when their own figure credit names them (read from
  the live feed's markup) (finding 5).
- **Legal**: the old search and the footage desk use the rights desk's licences (no NC, no ND, no versionless
  licence); the Free Art License 1.3 read (artlibre.org: modify, commercial, same licence; incorporation into a larger
  work allowed) and cleared, with BY-SA's caveat (finding 7).

| | round 1 | round 2 |
| --- | --- | --- |
| stories with a picture | 178 (40.5 %) | 153 (34.8 %) |
| WORLD NOW / TECH BYTES / COSMOS / NEWS IN 60 / MONEY MINUTE | 43.9 / 35.6 / 24.3 / 46.7 / 55.0 % | 28.3 / 42.2 / 42.9 / 35.0 / 32.5 % |
| picks: places / subjects / portraits / NASA | 123 / 35 / 20 / 0 | 38 / 94 / 20 / 1 |

Findings (hand check of all 153 picks; the search's wrong places are gone, every place now is the one the headline
names):

1. **Conflict read too widely** (broadcast director, picture editor): reading `CONFLICT` in the summary as well made
   102 stories "harm", among them "Ukraine says its Starshield access is back" and political stories that mention a
   war in passing: WORLD NOW fell to 28 %. A story is a conflict story when its headline says so.
2. **The Pope lost his portrait** (picture editor): "Pope Leo" was not expanded to "Pope Leo XIV" (the summary gives
   the number), and the crowd and event filters read a portrait's description ("greeting the crowd at a general
   audience") as a crowd scene.
3. **Countries with no photograph** (viewer): Jamaica, Australia, the US, Qatar: their own Wikidata picture is a map or a
   satellite view, now refused, so the country got nothing.
4. **Commons moved its thumbnails** (robustness): renditions now come from `thumb.wikimedia.org` with tracking
   parameters, and originals on `upload.wikimedia.org` answered 429 with Retry-After 600: pictures the desk had
   chosen would not have downloaded.

| category | score | why |
| --- | --- | --- |
| legal clearance | 9.0 | the NC/ND leak fixed; FAL 1.3 read and cleared; BY-SA in video still open |
| relevance | 7.0 | no wrong place left; still no tone problem found; the conflict rule too blunt |
| coverage | 2.5 | 34.8 % |
| visual quality | 7.5 | no satellite view or interior left; renditions at risk (finding 4) |
| robustness | 7.5 | finding 4 |
| tests | 8.5 | |
| **round 2** | **2.5** | coverage |

## Round 3 — conflict by the headline, portraits, capitals, renditions

Changes: conflict only as the headline says it; a portrait is never refused for a crowd in its description (its title
only counts for an event); a name and its regnal number ("Pope Leo" → "Pope Leo XIV"); a country whose own picture is
a map takes its capital's picture (Wikidata P36); a natural landmark named early (Mont Blanc) by its own article; the
desk serves Commons' standard renditions (960 or 500 px wide, from `thumb.wikimedia.org`) and refreshes the licence of
every kept file record.

| | round 3 |
| --- | --- |
| stories with a picture | 191 (43.4 %) |
| WORLD NOW / TECH BYTES / COSMOS / NEWS IN 60 / MONEY MINUTE | 40.6 / 44.4 / 50.0 / 38.3 / 50.0 % |
| picks: places / subjects / portraits / NASA | 64 / 100 / 26 / 1 |
| grave stories with a picture | 22 of 128 (8 portraits of officials) |

Findings (hand check of all 191 picks):

1. **A wrong person** (picture editor, lawyer): **King Charles III's portrait under "Cult venue Prince Charles cinema
   'saved' after lease renewal signed"**. "Prince Charles" redirects to Charles III on Wikipedia, the role check found
   "prince" in both, and the cinema named after him was read as him. The rate must be 0: this one is disqualifying.
2. **The wrong sense of a word** (viewer): Amazon's headquarters under "Brazil's Amazon deforestation hits lowest
   level"; COSMOS topics from ordinary words: a rose under "US inflation rose", "Plant", "Owl", "Fungus", "Dinosaur"
   as broad groups, a grey squirrel under "Red squirrel project".
3. **A postcard under a disaster** (broadcast director): a view of the city under "Fire ravages oldest covered food
   market in …": the fire is not in the picture, the postcard's calm misleads.

| category | score | why |
| --- | --- | --- |
| legal clearance | 9.0 | as round 2 |
| relevance | 3.0 | a wrong person (finding 1) |
| coverage | 4.0 | 43.4 % |
| visual quality | 8.0 | renditions at 960 px; 99.5 % at twice the full shot |
| robustness | 8.5 | renditions and licences refreshed |
| tests | 8.5 | |
| **round 3** | **3.0** | relevance |

## Round 4 — no wrong person, no wrong sense, no postcard under a disaster

Changes: **every word of the name as written must be in the person's article title** ("Prince Charles" is not
"Charles III"; "Zelensky" is in "Volodymyr Zelenskyy"), and a name followed by "cinema", "hall", "bridge", "award",
"foundation"... is a thing named after a person, never the person; an everyday word stands for a company only where
the story speaks of a company (the Amazon is also a forest); a plain-word topic only in a science or nature story,
never a broad group (plant, bird, owl, fungus), never the head word alone after a two-word name ("Red squirrel", never
"Squirrel"); no place under a disaster in the headline.

| | round 4 |
| --- | --- |
| stories with a picture | 174 (39.5 %) |
| WORLD NOW / TECH BYTES / COSMOS / NEWS IN 60 / MONEY MINUTE | 36.7 / 43.3 / 41.4 / 36.7 / 45.0 % |
| picks: places / subjects / portraits / NASA | 61 / 86 / 26 / 1 |

Findings (hand check of all 174 picks; all 26 portraits the right person in the right role):

1. **Seven picks wrong or misleading** (picture editor): the White House aerial under "US archbishop says Catholics in
   army should not participate in firing squad", "WindBorne wins a hefty US Air Force contract" and "No, this oil tanker
   didn't carry Russian diesel to the United States" (a seat of government says the government did it); a NATO
   defence ministers' meeting under a NATO fraud probe (another occasion: "Ministers Meet" passed the people filter,
   which knew only singulars); **a grey squirrel under the red squirrel story again** ("red" ends in "-ed" and was
   dropped as a verb); Rio de Janeiro's skyline twice under Amazon deforestation stories.
2. **About thirty weak picks** (picture editor, broadcast director): a place met at the end of the headline is not
   what the story is about: the Great Wall under "Scimplify raises $25M to challenge China's grip…", Dubai under "Smart
   ring maker Ultrahuman to roll out… across UAE", the Maidan under "Burnham says he wants to 'repair bridges' between
   Ukraine and US", the Kremlin under "Trump faces backlash over plans to import diesel from Russia", Cairns' esplanade
   under a navy ship story, San Francisco under a ticket offer; Westminster and the White House under economy stories;
   Nairobi's skyline under an Ebola case.
3. **Credits that do not credit** (lawyer, viewer): `THE ORIGINAL UPLOADER WAS`, `COOLCAESAR AT ENGLISH`,
   `PRESS SERVICE OF THE` (cut at 60 characters), `PALÁCIO DO PLANALTO FROM`, `©HOUSE OF COMMONS` (the © has no glyph),
   `PRIME MINISTER ' S OFFICE`, a file name as the author (`VW_WERK_ALTES_HEIZKRAFTWER`); and **names the screen's
   type cannot draw**: `ВИКТОР ПИНЧУК`, `ΚΑ ΚΙΤ`, `瑞丽江的河水` would air as blank space. A credit nobody can read is
   not an attribution.
4. **A worse pick kept for twelve hours** (robustness): when Wikipedia paused the desk mid-decision, the story kept
   what it had found (NASA's headquarters under "NASA's Hubble Spies Spiral's Edge", Hubble itself never asked) as if
   decided.

| category | score | why |
| --- | --- | --- |
| legal clearance | 8.5 | finding 3: unreadable and garbled credits |
| relevance | 6.5 | finding 1 (4 % wrong or misleading), finding 2 |
| coverage | 4.0 | 39.5 % |
| visual quality | 8.0 | |
| robustness | 8.0 | finding 4 |
| tests | 9.0 | |
| **round 4** | **4.0** | coverage |

## Round 5 — the place the headline opens on, seats of government, legible credits, partial decisions

Changes:

- **A place only when the headline opens on it** (its first four words, after a kicker: "Jamaica accepts…", "Crowds
  throng New Delhi"); never a city's postcard under a story about nature (deforestation, a species, the climate);
  outbreaks (Ebola, cholera, measles) count as disasters (finding 2).
- **A seat of government** (White House, Kremlin, Westminster, a parliament, a presidential palace) is a country's
  picture only under a story about government: a minister, an election, sanctions, an embassy, or the state acting
  at the head of the headline ("Russia arrests…", "France seizes…"); otherwise the country's next picture (London's
  skyline for the UK) or the map (finding 1).
- **People in a picture of a thing**: plurals and meetings ("Ministers Meet") (finding 1); "-ed/-ing/-ly" only drops
  words of five letters or more ("red", "bed", "reed" stay) (finding 1).
- **Credits** (finding 3): the author as a name (the uploader, not "The original uploader was"; no "at English
  Wikipedia"; no Flickr account's town; both authors of a derivative work; no ©); a credit longer than one line runs on
  two (the author, then the licence and PIXELATED), so `PRESS SERVICE OF THE PRESIDENT OF UKRAINE` airs whole;
  Cyrillic and Greek names are written in Latin letters on screen (`VIKTOR PINCHUK`, `KA KIT`), the original in the
  description; a picture whose licence asks for an author the screen cannot write at all is **not cleared** (CC0 and
  public domain pictures air without the name).
- **A decision made while a source was paused** is kept twenty minutes, then decided again asking only what is
  missing; until then its picture stands (finding 4).

| | round 5 |
| --- | --- |
| stories with a picture | 140 (31.8 %) |
| WORLD NOW / TECH BYTES / COSMOS / NEWS IN 60 / MONEY MINUTE | 28.9 / 37.8 / 38.6 / 26.7 / 27.5 % |
| picks: places / subjects / portraits / NASA | 27 / 86 / 26 / 1 |
| what the new rules removed | 7 seats of government; places 61 → 27 (named late in the headline, under nature stories, under outbreaks); 1 picture whose author the screen cannot write |

Findings (hand check of all 140 picks): no wrong person (26 of 26 portraits right), **none misleading**; ten weak but
true (a country's picture for a national story: the Great Wall under China's exports; a secondary subject: VMware
under "Topgolf saved $11.3M after leaving VMware", Google under "SpaceX and Google both said no…"; a company's
picture that is not its best: SK Hynix's chip packaging, Blue Origin's engine under a New Glenn story). Hubble now
shows Hubble. But coverage fell to 31.8 %: relevance was bought with pictures.

| category | score | why |
| --- | --- | --- |
| legal clearance | 9.0 | every credit legible and complete; BY-SA and FAL in video still a lawyer's question |
| relevance | 9.0 | no wrong person, nothing misleading; 7 % weak |
| coverage | 3.0 | 31.8 % |
| visual quality | 8.5 | |
| robustness | 9.0 | |
| tests | 9.0 | |
| **round 5** | **3.0** | coverage |

## Round 6 — coverage without giving relevance back, tone, framing, a second sample

Changes for coverage:

- **A sportsperson in a sports story** (the sport in the headline: "sent off", "yellows", "refereeing", "year-end
  ranking"), known in 15+ languages, by the exact article: Michael Olise, Zizou Bergs, Álvaro Arbeloa. A surname alone
  is still never enough: "Latest poll shows Bolsonaro maintaining edge over Lula in Brazil run-off" is about Flávio
  Bolsonaro in October 2026, while "Bolsonaro" leads to his father on Wikipedia.
- **The Amazon of a deforestation story is the forest** ("Amazon rainforest", its own photograph); a natural region the
  gazetteer also knows (the Amazon, the Sahara) is shown by its own article, also under a story about nature.
- **A country's capital** offers its aerial view and two pictures (not one); a country never stands for a place within
  it named in the headline ("Fuel crisis hits Indonesia's Bali": Jakarta from the air was the first try, refused).
- **A living thing whose Wikidata picture is a drawing or a collage** (hake, orangutans): a Commons photograph whose
  title names it, alive (the first try picked a museum's stuffed orangutan: specimens, skeletons, fossils refused).

What the contact sheets and the hand check found in this round, each fixed in it:

1. **Tone** (broadcast director): Zohran Mamdani's usual portrait is a broad grin, and it aired under "Mamdani says ICE
   agents who shot man in New York looked like 'mass shooters'"; the Pope smiled under five lung-cancer stories. The
   desk cannot see an expression, so **under a grave story there is no portrait at all** (an institution's building or
   the map instead), and a person's illness or operation in the headline counts as grave. A golden-hour Paris under
   "France braces for nationwide protests" (grave: "authorities fear the rallies could turn violent"): **no place at all
   under a grave story**, and **unrest in the headline** (protests, riots, clashes, a march, a curfew) refuses the
   place's postcard as a disaster does.
2. **Framing** (pixel artist): a tall portrait cover-cropped to 16:9 under the headline board showed Donald Trump's hair
   and nothing else, and the tightest headshots (Carney, Musk, Gibney) from the eyes to the mouth. **A person's picture
   now airs framed as a portrait** (`pixelate.js` `fit: 'portrait'`): the whole head and shoulders, the height of the
   frame, centred over the same picture blurred and darkened; any other picture is cover-cropped as before.
3. **A wrong subject in the second sample** (picture editor): the European Space Agency's headquarters under "ESA
   targets Anbernic emulation handhelds as 'superfake' piracy enablers" (the Entertainment Software Association).
   Acronyms that name other bodies too (ESA, ICC, ECB) now stand for the body only where the story speaks of it
   (space, a court, a central bank), and are not asked as written otherwise; the story shows Anbernic's handheld.
4. **Pictures the desk took for bigger than they are** (pixel artist, robustness): four picks would not download for
   the sheets: their records pointed at the original on `upload.wikimedia.org` (rate-limited for robots) and carried
   the width asked, not the original's. Jamaica's Port of Kingston, a pick since round 2, is a **442 px original** that
   would have aired upscaled three times. Every original is now judged by its own width and served as Commons'
   standard rendition (960 or 500 px), never narrower than the 416 px full shot. **The resolution figures of rounds 1–5
   were overstated by this** (99.5 % "at twice the full shot" in round 3).
5. **Credits**: the capital's extra pictures brought `WashMonument_WhiteHouse.jpg` back under "US archbishop says…"
   (the seat-of-government check now reads a file name as words); "User:Steindy derivative work: Mario Zamic" and
   "This image or media was taken or created by Matt H. Wade . To see his entire portfolio…" as credits (now
   `STEINDY/MARIO ZAMIC`, `MATT H. WADE`); a record label filed under "Nipper in logos" for HMV (a logo by its category).

**A second, disjoint sample** (150 other aired stories, seed 18: WORLD NOW 60, TECH BYTES 30, COSMOS 25, NEWS IN 60
20, MONEY MINUTE 15) was run through the final desk so that the hand check covers more than 150 picks of the final
rules, not of earlier rounds.

| | before (outlet photos) | round 6, sample 1 (440) | sample 2 (150 others) |
| --- | --- | --- | --- |
| stories with a picture | 428 (97.3 %) / 143 (95.3 %) | **132 (30.0 %)** | **42 (28.0 %)** |
| WORLD NOW / TECH BYTES / COSMOS / NEWS IN 60 / MONEY MINUTE | 96.7 / 95.6 / 98.6 / 98.3 / 100 % | 23.9 / 37.8 / 40.0 / 28.3 / 25.0 % | 16.7 / 50.0 / 16.0 / 35.0 / 40.0 % |
| among stories that are not grave | | 40.5 % (126 of 311) | 42.0 % (42 of 100) |
| grave stories | | 129, 6 with a picture (institutions; no portrait) | 50, none |
| picks: subjects / places / portraits / NASA's own | | 88 / 24 / 19 / 1 | 30 / 5 / 6 / 1 |
| licences of the picks | | BY-SA 70 (incl. FAL 1) · PD and CC0 31 · BY 28 · OGL 2 · NASA 1 | BY-SA 26 · PD and CC0 9 · BY 4 · OGL 2 · NASA 1 |
| 16:9 crop width of the served picture | | min 500, median 1280 px; 88.5 % at least twice the 416 px full shot; none upscaled | |
| portraits | | 19, framed whole (`fit: 'portrait'`) | 6 |

**The hand check: all 174 cleared picks of the final desk** (132 + 42), by reading each story, its subject and file,
and the picture on the sheets (`hand-check-final.txt` lists every verdict):

| verdict | picks | |
| --- | --- | --- |
| right subject, right picture | 149 (85.6 %) | among them company and agency buildings for company stories (NASA's headquarters under 13 NASA programme stories in the two samples: correct, generic) |
| weak but true | 25 (14.4 %) | a country's postcard for a national story (the Great Wall under China's exports and China's sanctions, London from the air under UK grocery prices and the power grid, Rio under Brazil's Congress, the Acropolis under the US ambassador to Greece, the Maidan under a Zelensky statement, Tehran under a Hormuz story); a secondary subject (VMware under Topgolf, Google under "SpaceX and Google both said no", Atlético where the headline opens on Arsenal, Burnham where a business chief speaks); a company's picture that is not its best (SK Hynix's memory packaging, Blue Origin's engine under New Glenn, MSCI's tower, a Citroën dealership's sign twice, SpaceX's headquarters under a launch's trail); a crop that reads badly (a beaver's fur, a flag over Atlético's stadium); the genus not the species (a Sumatran orangutan under a Borneo story); Mars under a lander bound for Phobos; the White House under inflation "ahead of midterm elections"; a Plymouth Brethren hall for the Exclusive Brethren |
| misleading | **0** | (the ESA headquarters under the games industry's ESA was misleading: found in the second sample, fixed, re-run) |
| wrong person | **0 of 25 portraits** | Olise, Glucksmann (2), Musk, Carney (2), Gibney, Rooney, Obama, Lula, Koch, Jenrick, Burnham (3), Bergs, Zelenskyy, Trump (2), Arbeloa, Nandy, Warsh, Raye, Norris, Wahlberg |

**Where the other 308 stories of sample 1 stand** (each story in one class): 101 are grave stories of harm, violence
or armed conflict (the map, by the tone rule); 32 have a subject the relevance rules refuse (an accused, a death, a
grave story's portrait, another role, a surname alone); 138 name nothing a free photograph can show (a party, a
movement, a crowd, an event, a place met late in the headline or under unrest, ordinary words); 14 name nothing at
all; 12 have a subject whose every picture was refused (a map, a flag, a seat of government out of place); 9 have a
subject with no free photograph (Replit, Bumble, Vinted); 2 are sports fixtures. The outlets' photos covered most of
these with **event** pictures from the wires; a free licence can almost never give the event itself.

## Round 7 — the no-picture boards, sober portraits, FILE pictures of the same actor, Openverse, a third sample

The coordinator's review of round 6: coverage at 30 % "with an empty blue board for the other 70 % is the quality
loss the owner forbade". The brief: a designed board for every story without a picture, held to a photo's bar;
Openverse as a new source with safeguards against laundering; sober portraits under grave stories, read by an
expression model; FILE pictures of the same named actor doing the same kind of thing, with the year; **a relevant
cleared real picture on at least 75 % of stories, 0 wrong people, 0 misleading**, measured on a fresh sample too; a
quote request for the wires.

**1. The boards.** The flat blue rectangles of round 6's `none-NN.png` were the sheet tool's fault (the lab page drew
the map before its data had loaded, and the 6 ms budget returned the sea), but the real montage was not much better:
an unlabelled animated map, or for a story with no place the montage's plain field. Now:

- **the locator board** (`public/js/graphics/locator.js`), for a story with a place: the country drawn from the
  channel's own map and lit (fog, silver edge) against its dimmed neighbours, framed to fill the upper right clear of
  the tag and the headline; a city's accent dot with a ring that pops once; the place's name on an ink plate with the
  accent bar. Prepared by the director before the montage, a frame at a time; drawn by the montage and STILL TO COME
  exactly as the sheets show it (`public/lab/pictures.html` calls the same functions);
- **the topic board** (`public/js/graphics/topicboard.js`), for a story with neither a picture nor a place (half of
  them: a startup's funding, a study, a scam): its topic as one of fourteen 16×16 pixel glyphs at 4× (a chip for AI, a
  rocket for space, a flask for science, a chart for the economy, a bolt for energy, a car for transport…), two rings,
  a dot grid and the topic's name on the same plate. Under a grave story or a story of crime, no glyph (a cartoon under
  a death or a charge is never sober): the rings and the section's name.

**2. Sober portraits under grave stories** (`server/faces.js`, `tools/pictures/faces.mjs`). A face detector and an
expression model (UltraFace RFB-320 and FER+, ONNX, Apache-2.0) run by onnxruntime-web in headless Chromium beside the
station; the desk queues the pictures, reads the verdicts and waits for them (a picture never read never airs under a
grave story). Candidates: the Wikidata picture, the person's Commons category, their photographs on Commons by name
and by their category's name, an institution's Flickr picture; one person in the title. Allowed only for the public
figure the story is about in their role (they speak, they lead the response) and for obituaries; never the accused,
a private person or a victim. **Models fetched from new hosts: huggingface.co (redirecting to us.aws.cdn.hf.co) and
cdn.jsdelivr.net.**

**3. FILE pictures of the same actor** (`server/fileevents.js`): a movement, a union, a party, a legislature, a bloc or
a company protesting, striking, sitting or meeting, the file naming the actor and the action, dated before the story,
labelled `FILE 2023`; never under a death or a disaster toll, never a violent scene, never an armed group; under a
grave story only with no face in the foreground. **And the seat of government** for a story whose state is its actor.

**4. Openverse** (`server/openverse.js`): anonymous, paced under its announced limits (20 a minute, 200 a day), only
institutions' own Flickr accounts (13 checked by hand), licence as indexed, no agency credit, indexed before the story,
the source page kept. **Flickr's robots.txt refuses every robot it does not name**, so the desk never reads flickr.com:
the second trust tier (a long-standing account) needs Flickr's API and stays off.

**5. A curated list of surnames** (`SURNAMES`, 59 public figures named that way, each article checked): "Trump faces
growing backlash…" now shows Donald Trump; never where someone else of that surname is named, never an ambiguous one
(Bolsonaro, Albanese, Medvedev).

**What the sheets and the hand check found in this round, each fixed in it and re-run:**

1. **10 Downing Street under "Leeds vs Manchester United: Premier League – teams, prediction, lineups"** (misleading):
   "Premier" in "Premier League" made the story one about government, and the seat rule took the UK's government.
   Fixed twice over: no seat under a sports story, and "Premier League" is no longer a word of government.
2. **The White House under "Duel in the desert: US marine veteran aims to win back working-class voters"** and
   Parliament House under "Australian industry reliant on gas" (a person or a thing of that country, not its state):
   the seat now needs the state to be the headline's actor (the word after the country is its government or its act:
   "US Senate votes", "France imposes", a politics kicker).
3. **State House, Nairobi, under "Kenya's health ministry confirms second Ebola case"**: never a seat or a FILE event
   under an outbreak.
4. **AB Volvo's powertrain plant under "Volvo makes a bigger bet on Nvidia for hands-free automated driving"** (the
   wrong company: Volvo Cars is another): "Volvo" stands for Volvo Cars unless the story speaks of trucks or buses, and
   an ambiguous name is asked only by its alias. (The story now shows Nvidia's headquarters: weak, the partner.)
5. **The White House under "US lawmakers unveil bill…"** (the executive for the legislature): a story about government
   now shows its seat before the country's capital (the Capitol).
6. **"Talks on Ukraine continue in Geneva as ministers meet"** would have shown Kyiv's presidential office: the seat's
   country must open the headline.
7. **The Pope smiles in every Commons photograph read** (32 of his pictures, the reader refused all, rightly): his
   seven illness stories keep the topic board. Reading more candidates (the category's own name, "Leo XIV", 30 a
   person) found no sober one.
8. **Openverse found nothing usable on these samples**: the index is sparse and dated for Flickr (the European
   Parliament: 240 of its 14,000 pictures indexed, the newest from June 2025; the President of Ukraine's under a
   generic title), and its search timed out at 10 s (now 25 s). It is wired with its safeguards for when an
   institution's pictures are indexed; it is not where coverage comes from.

**Three samples** of the archive's real aired stories, all decided by the final desk (the third fresh: 138 other
stories, seed 19, the same programme mix as the second; its programmes had fewer stories left to draw):

| | before (outlet photos) | sample 1 (440) | sample 2 (150 others) | sample 3 (138 others, fresh) |
| --- | --- | --- | --- | --- |
| round 6 | 97.3 % / 95.3 % | 30.0 % | 28.0 % | — |
| **round 7: stories with a cleared picture** | | **157 (35.7 %)** | **49 (32.7 %)** | **41 (29.7 %)** |
| not grave / grave | | 47.8 % of 301 / 13 of 139 | 44.0 % of 100 / 5 of 50 | 37.9 % of 87 / 8 of 51 |
| picks: subjects / places / portraits / seats / FILE events / NASA | | 88 / 20 / 36 / 10 / 2 / 1 | 29 / 3 / 13 / 3 / 0 / 1 | 15 / 10 / 14 / 2 / 0 / 0 |
| grave portraits (sober, read) | | 7 | 4 | 8 |
| licences | | BY-SA 84 · PD and CC0 39 · BY 29 · OGL 5 | BY-SA 27 · PD 14 · BY 6 · OGL 2 | BY-SA 15 · PD 12 · BY 13 · OGL 1 |
| no picture: locator board / topic board (no glyph) | | 139 / 144 (47) | 59 / 42 (9) | 53 / 44 (10) |

All three: **247 of 728 stories (33.9 %)**. **The 75 % target is not met.**

**The hand check: all 247 cleared picks** (`hand-check-r7.txt`; every grave portrait and every FILE picture also seen
full size):

| verdict | picks | |
| --- | --- | --- |
| right subject, right picture | 204 (82.6 %) | sober portraits of the official who speaks (Zelenskyy under the strikes on Kyiv, Mamdani speaking into a microphone under the ICE shooting, Trump's official portrait), seats of government under the state's own act (the Berlaymont under EU sanctions, the Capitol under a bill, the Kremlin under an arrest), company buildings |
| weak but true | 43 (17.4 %) | a country's postcard for a national story (London from the air ×5, Tehran ×2, the Acropolis ×3, Pretoria); a secondary subject (Trump where Zelenskyy targets him, Trump under the FTC's probe of AI firms, Nvidia under Volvo, 10 Downing Street under a PM adviser's wife); the yellow vests' FILE 2018 (the right actor and action, a muddled scene); a 2007 portrait of Kabila, relaxed rather than grave; a 2016 title celebration under a struggling club's sale; and round 6's weak picks that still stand |
| misleading | **0** | (five found in the round, above, fixed and re-run) |
| wrong person | **0 of 63 portraits** | 19 of them under grave stories: Trump (8), Zelenskyy (6), Kabila (2), Chalmers, Mamdani, Musk, Netanyahu |

**Why 75 % is out of reach under the round's own rules.** Of the 481 stories left without a picture in the three
samples, 61 have a death, a toll or a disaster in the headline, 105 are armed conflict or violence, 26 an accusation
or a trial, 46 other grave stories (an illness, harm) with no sober portrait of a public figure, and 243 are not grave
and name nothing a free photograph can show (a startup, a study, a party met as "Labor", a crowd). The brief itself
forbids a FILE picture under a death or a disaster toll and a portrait of the accused, a victim or a private person,
and the earlier rounds forbade a place's postcard under grave news. **Even a picture on every story that is not grave
would give 67 %** (sample 1: 296 of 440; sample 2: 101 of 150; sample 3: 93 of 138); the remaining third of the
channel's news is war, death, disaster and crime, which only the wires' event pictures (or a sober official) can show.

**The boards, on their own visual score**: the locator board **8.0** (designed and legible at 4×, the country lit on
the channel's own map, the place's name on the channel's plate; not higher: a large country is shown from far out
(Russia fills Eurasia), and the place it shows is the news desk's: 4 of the 135 boards whose headline names a place
show another (Jamaica's deportation flights on the USA, "Ukraine says its Starshield access is back" on Russia), a
finding for `server/news.js`); the topic board **7.0** (a deliberate pixel board, never empty; not higher: fourteen
glyphs repeat, the grave board is only rings and the section's name, and that name repeats the headline's chip).

## Final table

| category | r1 | r2 | r3 | r4 | r5 | r6 | **round 7** | why, in round 7 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| legal clearance | 8.0 | 9.0 | 9.0 | 8.5 | 9.0 | 9.0 | **8.5** | every aired picture still cleared under terms read from its source and recorded; Openverse used only for institutions' accounts, Flickr's robots.txt respected (its pages never read), the source page kept. Lower than round 6: three new open questions for the lawyer (the face reader under the EU AI Act and the GDPR; identifiable people in FILE pictures of events; Openverse's "made with Openverse" notice and fee clause), on top of ShareAlike (51 % of the picks) |
| relevance | 4.0 | 7.0 | 3.0 | 6.5 | 9.0 | 8.5 | **8.5** | 0 wrong person in 63 portraits (19 under grave stories, each read sober and looked at), 0 misleading in 247 picks of three samples after five fixes in the round; 43 weak (17 %): more than round 6, from seats and surnames that are true but generic, and secondary subjects |
| coverage | 3.0 | 2.5 | 4.0 | 4.0 | 3.0 | 3.0 | **3.5** | 35.7 %, 32.7 % and 29.7 % (fresh) against a 75 % target; at most 67 % with a picture on every story that is not grave; the other stories now air on a designed board instead of a flat field |
| visual quality | 6.5 | 7.5 | 8.0 | 8.0 | 8.5 | 8.5 | **8.0** | the picks as round 6 (whole portraits, none upscaled, credits with the FILE year); the floor is designed now (locator 8.0, topic 7.0) but it is a board, not a picture, for two stories in three; Trump's one official portrait airs under 20 stories of the three samples |
| robustness | 8.0 | 7.5 | 8.5 | 8.0 | 9.0 | 9.0 | **8.5** | every new source fails safe (an unread face is never aired; Openverse paced, budgeted and paused on 429; a restart keeps the day's count), but the face reader runs beside the station and must be scheduled: until it reads, grave stories stay on their boards |
| tests | 8.0 | 8.5 | 8.5 | 9.0 | 9.0 | 9.0 | **9.0** | the face verdicts and the store, Openverse (results, trust, pacing, 429), FILE events and seats (every finding of the round), the year in the credit on server, producer and screen, the topic and locator boards, the desk end to end with the face reader and Openverse faked |
| **round score** | **3.0** | **2.5** | **3.0** | **4.0** | **3.0** | **3.0** | **3.5** | coverage |

**The gate is not met: 3.5, not 9.7, and the coverage target is not met: 33.9 % against 75 %.** The round moved
coverage by four to six points without a wrong person or a misleading picture, and replaced the flat field behind the
other two thirds of the stories with designed boards; it did not, and under its own rules could not, reach 75 %: a
third of the news is war, death, disaster and crime, where the brief forbids a FILE picture under a toll, a portrait of
the accused or a victim, and a place's postcard; most of the rest names nothing a free photograph can show. A wire
licence is still the only route to the event itself.

What would close the gap, without giving any of this back:

1. **A wire licence with written permission for the pixel treatment**: the quote request is drafted
   (`docs/pictures/AGENCY_REQUEST.md`: Reuters, AP, AFP; ~1,200 stills a month; seven clauses to change, from the
   pixel treatment to "broadcast once" and the watermark). This is the only route to the event itself, and to a
   picture under the grave third of the news.
2. **The lawyer's answers** (RIGHTS.md §8): ShareAlike (51 % of the picks), the face reader, identifiable people in
   FILE pictures.
3. **The face reader on a schedule** beside the station (every 20 minutes, after the desk's decisions), so a grave
   story's sober portrait airs in the same hour.
4. **Flickr's API with a commercial key** (owner action): the second Openverse tier (long-standing accounts) and the
   date taken; and **a registered Openverse key** for more than 200 requests a day.
5. **The news desk's place** (`server/news.js`, another agent's file): the board shows the place the news desk gives;
   in 4 of 135 checked it is not the place the headline names.

## What the owner's licence rules removed (17 Oct)

`tools/pictures/licences.mjs`, over every Commons file the desk looked at in all rounds (674: Wikidata pictures and
search results) and the outlet photos the 440 stories aired with:

| rule | removed |
| --- | --- |
| NonCommercial out (the channel will be monetised) | 0 Commons files (Commons accepts no NC); the old `FREE_LICENCE` pattern would have let NC through from the Google and Bing providers and for clips: fixed |
| NoDerivatives out (every picture is pixelated) | 0 Commons files (Commons accepts no ND); same leak, fixed |
| terms that forbid alteration out (outlets, agencies, UN Photo, press kits) | all 428 outlet photos the stories aired with; UN Photo and company newsrooms never looked for |
| ShareAlike kept, a question for the lawyer | kept: 326 of 674 files looked at (48 %), 70 of 132 picks of sample 1 (53 %) |
| GFDL only, unknown or versionless terms ("Attribution", "Copyrighted free use", "European Parliament", "Licence Ouverte") | 13 files |
| no author to credit; an author the screen cannot write | 3 and 1 candidate pictures in the final round |

## The contact sheets

Rendered by `tools/pictures/sheet.mjs` with the channel's own client code (`public/lab/pictures.html`: the headline
board as the montage airs it, `pixelate.js` at 416×234 and 24 colours with the desk's focus, the credit overlay, the
locator and topic boards), into the measuring session's scratch directory (`…/scratchpad/pictures/sheets-r7/`), round
6's sheets deleted:
`s1-board-01.png` and `s1-board-big-01.png` (the locator board: before, the outlet photo; after, the board),
`s1-topic-01.png` and `s1-topic-big-01.png` (the topic board, with and without its glyph), `s1-grave-portraits-01.png`
and `s2-grave-portraits-and-seats-01.png` (every sober portrait under a grave story, and the seats),
`s1-file-and-seats-01.png` (the FILE pictures of the same actor and the seats), `s3-all-picks-01..04.png` (every pick of
the fresh sample), and `hand-check-r7.txt` (every verdict, three samples). Not kept in the repository (outlet photos
are not ours to copy).

## What a lawyer should still confirm

See `docs/pictures/RIGHTS.md` §8: ShareAlike inside a video (the largest open question: 53 % of the picks are BY-SA or
FAL), CC 2.0/3.0 attribution in video, personality rights and data protection for portraits, photographers' moral
rights against pixelation, freedom of panorama, the no-portrait rule for the accused (and for a search of someone's
home), NASA's terms for a monetised channel, ESA's standard terms, platform policies, the takedown policy for a Commons
file whose licence proves wrong, the Free Art Licence's copyleft (as ShareAlike), whether a credit giving a
transliterated user name, or running on two lines, is attribution "in any reasonable manner based on the medium"; and,
new in round 7, the face reader under the EU AI Act and the GDPR, identifiable people in FILE pictures of events,
Openverse's terms (its notice, its fee clause, anonymous use by a monetised channel) and Flickr pictures known only
through Openverse's index. This critique is not legal advice.
