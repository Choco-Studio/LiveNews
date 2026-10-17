# The picture desk and picture rights

GLOBIT 24 publishes on YouTube, TikTok, Instagram, Facebook and X. Until 17 Oct most stories aired with the news
outlet's own photo (the feed's media or the article's og:image, found by `server/pictures.js`). Publishing those is a
copyright risk: the UK's fair dealing for reporting current events excludes photographs (CDPA s.30(2)), US fair use is
decided case by case, and the agencies behind most news photos (AP, Reuters, Getty, AFP) enforce. The owner's rules:
"no sanction risk and no loss of quality", "on air only REAL photos, never drawn ones" (22:40) and, on 17 Oct, "El
pixelado de las fotos no lo quites": every picture is pixelated, always.

So the channel now airs only **pictures it has the right to publish, pixelated**, each with a **rights record**. This
page is the reference: what the record holds, which sources are cleared and on what terms (each read on 17 Oct 2026
from this machine), the relevance rules, how the desk copes with rate limits, the settings, what a publisher gets, and
**what a lawyer should still confirm**. It is not legal advice.

Code: `server/rights.js` (licences, the record, credits, the gate), `server/picturedesk.js` (the desk),
`server/wikimedia.js` (the polite Wikimedia client and the kept answers), `server/imagesearch.js` (the Commons search),
`server/footage.js` (clips get records too), the producer's picture stage, `server/archive.js` (the gate on old
entries), `server/index.js` (`/api/img` serves only airable pictures), `public/js/graphics/picture.js` (the on-screen
credit). Measurement: `tools/pictures/measure.mjs`, `report.mjs`, `sheet.mjs`, `public/lab/pictures.html`. Critique:
`docs/roadmap/critique/cleared-pictures.md`.

## 1. The rights record

Every picture the desk proposes carries one (`rightsRecord()`); the episode, the archive and the client carry its
compact form (`compactRights()`).

| field | what it holds |
| --- | --- |
| `source` | `wikimedia-commons`, `nasa`, `operator` (a local feed's own files), `outlet` (never cleared) |
| `via` | how it was found: `wikidata:P18`, `commons:search`, `commons:footage`, `nasa:images`, `nasa:article`, `outlet:…` |
| `subject` | what it shows: `{ kind: person / thing:org / thing:structure / … / place, qid, label }` |
| `licence` | `{ id, name, url }`: an SPDX id where one exists (`CC-BY-SA-4.0`, `CC0-1.0`), else named terms (`NASA-MUG`, `OGL-UK-3.0`, `PD-USGov`, `OUTLET`) |
| `author` | the author or source as the licence asks it to be credited (markup, "Own work", URLs removed) |
| `title`, `page`, `url` | the file's title, its original page (Commons file page, NASA library page), the rendition served |
| `uses` | `{ editorial, commercial, derivative, pixelation }`: what the terms allow |
| `restrictions` | non-copyright warnings the source gives (`personality`, `trademarked`, `insignia`) |
| `label` | `FILE` unless the picture is of the event itself (`EVENT`: only a NASA photograph of the mission named in the story, taken in the two days before it) |
| `checkedAt` | when the terms were read for this picture |
| `cleared`, `why` | cleared only with editorial **and** commercial **and** derivative use, a known licence, an author to credit where the licence asks one, an https picture, and no generator behind it; otherwise `why` says which |
| `credit`, `attribution` | the on-screen credit and the full attribution (below) |

**Cleared** is decided by the licence's terms, not by the source's reputation: the channel will be monetised (no
NonCommercial), pixelates everything (no NoDerivatives, no terms that forbid alteration) and broadcasts news.

## 2. Licences and what each asks on screen

`server/rights.js` `LICENCES`. Commons' own machine code (`License`: `cc-by-sa-4.0`) is read first, its short name
second (`CC BY-SA 3.0 de` is the 3.0 licence; a CC licence with no version is refused: it cannot be quoted).

| licence | cleared | on screen (while the picture is visible) | in the description |
| --- | --- | --- | --- |
| CC0 1.0 | yes | `FILE · AUTHOR · CC0` (author when known) | title, author, page, licence link, "Pixelated (modified) by GLOBIT 24" |
| Public domain, PD-USGov | yes | `FILE · AUTHOR · PD` | as above |
| CC BY 1.0–4.0, CC BY 3.0 IGO | yes | `FILE · AUTHOR · CC BY 4.0 · PIXELATED` | title, author, page, licence and its link, the modification (CC 4.0 §3(a)(1)(B); CC 2.0–3.0 ask a credit identifying the use in an adaptation) |
| CC BY-SA 1.0–4.0, CC BY-SA 3.0 IGO (ESA) | yes, **lawyer to confirm** | `FILE · AUTHOR · CC BY-SA 4.0 · PIXELATED` | as above plus "The pixelated picture is offered under CC BY-SA 4.0 (link)" (§3(b)) |
| OGL v1–v3 (UK) | yes | `FILE · SOURCE · OGL v3` | the provider's statement, else "Contains public sector information licensed under the Open Government Licence v3.0." |
| NASA media usage guidelines | yes | `FILE · NASA/PHOTOGRAPHER` (NASA always named) | "Courtesy of NASA; no endorsement by NASA is implied." |
| CC BY-NC, CC BY-NC-SA | **no** | — | NonCommercial: the channel will be monetised |
| CC BY-ND, CC BY-NC-ND | **no** | — | NoDerivatives: every picture is pixelated |
| Free Art Licence 1.3 (FAL) | yes, **lawyer to confirm** (like ShareAlike) | `FILE · AUTHOR · FAL 1.3 · PIXELATED` | as above plus "The pixelated picture is offered under FAL 1.3 (link)": FAL allows modification and commercial use, asks the author named, the change indicated and the modified work offered under FAL |
| GFDL only | **no** | — | the whole licence text must travel with the picture |
| "Attribution" (no version), "Copyrighted free use", unknown, versionless CC | **no** | — | not reviewed or not quotable |
| ESA standard terms | **no** | — | "shall not be used for a commercial purpose" |
| UN Photo | **no** | — | "cannot be altered … or used to create derivative works" |
| an outlet's or agency's photo | **no** | — | no licence; private preview only |

The on-screen credit fits one line of the channel's micro type (60 characters); a longer one runs on two lines, the
author on the first and the licence and `PIXELATED` on the second (`onAirCredit`, `creditLines`): the licence and
`PIXELATED` are never dropped, and an author longer than a line is shortened at a word (never ending on "of", "the",
"from"). The author is written as a name: Commons' "The original uploader was X at English Wikipedia" becomes `X`, a
Flickr account's town goes ("Pierre Blaché from Paris, France" → `PIERRE BLACHÉ`), a derivative work names both
authors (`RICHARD BARTZ/DILIFF`). The screen's type writes A–Z, digits and the common accents: a name in Cyrillic or
Greek is written in Latin letters on screen (`ВИКТОР ПИНЧУК` → `VIKTOR PINCHUK`; the original spelling stays in the
description), and a picture whose licence asks for an author the screen cannot write at all (Chinese, Arabic, Hebrew
user names) is **not cleared** (`why`: "the author's name cannot be written in the on-screen credit"); a CC0 or public
domain picture airs without the name. The client draws it under the clock whenever the picture is on screen: full frame, behind a board, on
the studio wall, in the close-up's box, in a headline frame, in a STILL TO COME tile (`public/js/graphics/picture.js`).
A correspondent link's footage keeps its own FILE credit (now also with its licence version and `PIXELATED`).

**What a description must carry.** CC licences allow attribution "in any reasonable manner based on the medium": on
screen the author, the licence and the modification; in the video's description (or a linked credits page) one
`attribution` line per picture (`episode.pictureRights[].attribution`), with the links. The publishing system should
paste that list; it is the full TASL (title, author, source, licence) the CC best practice asks.

### What the owner's rules remove (measured, 17 Oct)

`tools/pictures/licences.mjs` counts every Commons file the desk looked at while deciding the 440 measured stories, in
all rounds (Wikidata pictures and search results alike), and the outlets' photos those stories aired with:

| candidates | count | the rule | removed |
| --- | --- | --- | --- |
| Commons files looked at, all rounds | 674 | NonCommercial out | **0** |
| | | NoDerivatives out | **0** |
| | | GFDL only, unknown or versionless terms ("Attribution", "Copyrighted free use", "European Parliament", "Licence Ouverte") | 13 |
| | | ShareAlike (CC BY-SA, FAL) **kept**, a question for the lawyer | kept: 326 (48 %); 70 of the 132 final picks (53 %) |
| | | CC BY 165, public domain and CC0 168, OGL 2 | cleared |
| the final round's candidates | | no author to credit; an author the screen cannot write | 3; 1 |
| outlet photos the 440 stories aired with | 428 | terms that forbid reuse and alteration (outlets, agencies) | **428 (all)** |

So the NonCommercial and NoDerivatives rules remove **no** Commons candidate (Commons accepts neither: its licensing
policy requires commercial use and derivatives); they matter for the other providers the old search could use (Google,
Bing) and for footage, where the old pattern let "CC BY-NC" and "CC BY-ND" through on their "CC BY" prefix (fixed: one
licence table for pictures, searches and clips). "Terms that forbid alteration" remove **every outlet and agency photo**
the stories aired with, and the UN's and the company newsrooms' pictures (never looked for). Keeping ShareAlike keeps
about half of everything: dropping it on a guess would cut coverage roughly in half, which is why it is a question for
the lawyer (§8), not a rule.

## 3. Sources, in the desk's order (each verified live, 17 Oct 2026)

| # | source | reached from here | terms read (17 Oct 2026) | modification (pixelation) | commercial | credit | used |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | **Wikidata** (the item of the exact subject, its P18 picture) via the **English Wikipedia title** the story names | WDQS `query.wikidata.org` 200; Wikipedia API 200 with 429s (shared address) | Wikidata's data is CC0; only facts are used (QID, P31, P18, birth/death, offices, occupations, country, coordinates) | n/a | n/a | n/a | yes: resolution |
| 1 | **Wikimedia Commons** (the P18 file and its metadata) | 200, then **429 at a handful of requests a minute** from the shared address | per file: the licence on its page ("Commons:Reusing content outside Wikimedia": verify each file; "other restrictions may apply: trademarks, personality rights…") | per licence (CC0, PD, CC BY, CC BY-SA, OGL allow it; Commons hosts no NC/ND) | per licence | per licence | yes |
| 2 | **NASA Image and Video Library** (`images-api.nasa.gov`) and NASA's own article picture | 200 | NASA Images and Media Usage Guidelines (nasa.gov/nasa-brand-center/images-and-media): "generally are not subject to copyright in the United States"; "News outlets … may use NASA content without needing explicit permission"; "NASA should be acknowledged as the source"; no implied endorsement; third-party material "will be marked … with the name of the copyright holder"; identifiable persons: permission for commercial (advertising) use | not restricted (public domain in the US) | editorial use in published works that are not promotional | "NASA" | yes: only NASA's own credits (a SpaceX, ESA or Getty credit is refused); no posters, graphics, illustrations, artist's concepts, renders; NASA's own article picture only when its own credit names NASA |
| 2 | **ESA** (`esa.int`) | 200 | "Terms and conditions of use of images and videos": editorial use "news programmes, informational or educational videos for VOD services or social media" free with "©ESA"; **"shall not be used for a commercial purpose, such as … entertainment, advertisement"**; "Some images … are licensed under CC BY-SA 3.0 IGO" | standard terms: not stated (adaptations mentioned); IGO: allowed | standard: no; IGO: yes | ©ESA (+ author) | only the CC BY-SA 3.0 IGO pictures, through Commons (tagged so) |
| 2 | **NOAA** and other **US federal** works | `noaa.gov` answered **403 from NOAA's own CloudFront** (not the proxy) | US federal works are public domain (17 U.S.C. §105); Commons tags them PD-USGov-* | yes | yes | courtesy line | through Commons only (PD-USGov tags) |
| 2 | **UK government** (OGL) | `nationalarchives.gov.uk` 200 | OGL v3: "copy, publish, distribute … adapt … exploit commercially"; acknowledge with the provider's statement or the standard one; **"does not cover: personal data in the Information"**, logos, third-party rights | yes | yes | statement | through Commons only (files tagged OGL); gov.uk pages state no per-picture licence and carry agency photos |
| 2 | **European Commission Audiovisual Service** (`audiovisual.ec.europa.eu/en/conditions-of-use`) | 200 | "Unless otherwise indicated … licensed under CC BY 4.0. … reuse is allowed provided appropriate credit is given and changes made are clearly indicated. Any reuse must not distort the original meaning"; personality rights and third-party works not covered; notice "© European Union, 202X, licensed under CC BY 4.0" | yes, indicated | yes | © European Union | through Commons (EC photos tagged CC BY 4.0); the portal has no public API |
| — | **UN Photo** (`media.un.org/photo/en/guidelines`) | 200 | "UN photos cannot be altered, sold, redistributed or used to create derivative works"; prior written permission; "US $70.00 per photo" for film/video | **no** | — | UN Photo/… | **not used** |
| — | **Company newsrooms** (Apple Newsroom, NVIDIA Newsroom multimedia, Airbus media library, SpaceX media) | 200 | no per-picture licence on the pages; site terms reserve all rights; press kits usually forbid alteration | unclear | unclear | — | **not used** (the brief: unclear terms, leave out) |
| 3 | **Commons FILE photos of the city or structure** (free-text search, `server/imagesearch.js`) | as Commons | per file | per licence | per licence | per licence | yes, strictly (§4) |
| 4 | nothing cleared fits | — | — | — | — | — | the place's map and the channel's boards (LISTA item 4); never a drawn picture |

Pictures from heads of state and governments that publish under open licences (kremlin.ru and president.gov.ua CC BY
4.0, the European Parliament CC BY 4.0, the White House as a federal work) reach the desk the same way: through their
Commons file, with the licence tagged there.

## 4. Relevance rules (as strict as before, or stricter)

The desk (`server/picturedesk.js`) never shows a picture that is not of the story's own subject:

- **The exact subject.** A name in the headline is resolved by its **exact English Wikipedia title** (redirects
  allowed for people when the name differs only in spelling; never a disambiguation page, never a redirect to a
  section, never a redirect to an article about something else: "Ramp" → "Inclined plane" is refused), then its
  Wikidata item: `person`, `place`, `thing:org` (an organisation: its headquarters), `thing:structure`,
  `thing:craft`, `thing:mission`, `thing:product`, `thing:sky`, `thing:taxon` (a living thing, only as a plain-word
  topic). Never an event (a war, an election, a disaster: their pictures show another occasion), a concept, a
  political party, an armed group, a force or a police.
- **A person's portrait** only when: the item is a human in Wikipedia's living people, with a birth date, adult, not
  deceased; named **in full** in the story; starting within the first six words of the headline (the story is about
  them); **in the role the story gives** (`roleAgreement`: a family of roles agrees, and either the very role word
  with their country named in the story or a person known in 15+ languages, or the country with 5+; in a sports story,
  a sportsperson known in 15+ languages); every word of the name as written in the article's title ("Prince Charles"
  is not "Charles III"), never a thing named after them ("Prince Charles cinema"); never on a story of their death,
  never on a story of an accusation, an arrest, a search of their home or a raid, a trial or a conviction; **never on
  a grave story** (harm, violence, conflict, a death, a person's illness or operation): the desk cannot see a face's
  expression, and a person's usual picture is often a smile (Mamdani grinning under a shooting, the hand check of 17
  Oct); an institution's building or the map tells those soberly. A portrait airs **framed whole** (head and
  shoulders, the height of the frame, over the same picture blurred and darkened: `pixelate.js` `fit: 'portrait'`),
  never cropped to the eyes or the hair.
  **A surname alone is never enough**, however famous: "Bolsonaro maintaining edge over Lula in Brazil run-off" (October
  2026) is about Flávio Bolsonaro, while "Bolsonaro" leads to his father on Wikipedia.
- **A thing** within the first eight words of the headline; its item must fit the story (its description shares a
  word with it, or its kind fits the section); on a story of violence or conflict, no thing at all; where people were
  harmed, only an institution.
- An acronym that names several bodies (ESA, ICC, ECB) stands for the space agency, the court or the central bank only
  where the story speaks of space, a court or a central bank ("ESA targets Anbernic emulation handhelds" is the games
  industry's ESA), and is not asked as written otherwise.
- **A place** only one the headline **opens on** (named in its first four words, after a kicker: "Jamaica accepts…",
  "Crowds throng New Delhi"; never a place met at the end, "…across UAE", "…in Brazil run-off"), confirmed by its
  item's coordinates against the gazetteer's (a city within ~60 km, a country's middle within ~1500 km); never on a
  story of harm, violence or armed conflict, nor under any grave story (a postcard under a strike misleads, and a
  postcard is never sober: the map tells it); never on a disaster or an outbreak (fire, flood, storm, Ebola, cholera),
  nor under unrest (protests, riots, clashes, a march, a curfew); never on a sports story (a match is not a city); never a
  city's postcard on a story about nature (deforestation, a species, the climate).
- **A country's picture is its capital's**, so never when the story is about a place within it ("Fuel crisis hits
  Indonesia's Bali": Jakarta is not Bali). **A natural place** the headline opens on (Mont Blanc, the Amazon of a
  deforestation story) is shown by its own article's picture, also under a story about nature.
- **A seat of government** (the White House, the Kremlin, Westminster, a parliament, a presidential palace) is a
  country's or a capital's picture only under a story about government: a minister, an election, sanctions, an
  embassy, or the state acting at the head of the headline ("Russia arrests…", "France seizes…"). The White House
  under "US archbishop says…" or "US inflation rose…" would say the government did it: the map instead.
- **The Commons search** only for a city the headline opens on (never a country or a region), the file's title naming
  the city in full and saying it is a view of it (or naming the structure), its country in its description or
  categories, no people, no old photograph, no interior, no animal, no leisure scene under news.
- **A living thing** the story is about in plain words (a science or nature story: beavers, a little tern, hake): its
  Wikidata picture, or when that is a drawing or a collage, a Commons photograph whose title names it (alive: never a
  museum's specimen, a skeleton or a fossil).
- **Every picture:** a photograph (no map, flag, logo, coat of arms, diagram, drawing, painting, render, artist's
  impression, CGI, screenshot, poster, satellite image, medal, collage, generated image: title, object name, the
  head of each category, plain giveaways in the description); **never an event** (flood, fire, storm, protest, crash,
  war, ruins, victims, refugees, police, soldiers…); under a grave story never a crowd or a leisure scene; big
  enough for the full shot (an original of 640 px, a portrait 400 px, served as Commons' standard 960 or 500 px
  rendition and never narrower than the 416 px full shot: nothing is upscaled) and keeping at least 35 % of itself in the 16:9 crop (a
  portrait keeps the head: `focusOf`, the client's `pixelate(..., { focusY })`).
- **Labelled FILE** whenever it is not of the event itself (all but NASA's same-mission photographs of the day).

## 5. Rate limits and robustness

Wikimedia's limits (mediawiki.org "Wikimedia APIs/Rate limits", read 17 Oct 2026) are per client across all its sites:
**10 requests a minute without an identifying User-Agent, 200 with a compliant one** (a name and contact information),
3 at once at most, Retry-After obeyed. `server/wikimedia.js`:

- one queue for all Wikimedia hosts, one request at a time, 1.1 s apart; a compliant User-Agent with the operator's
  contact (`WIKIMEDIA_CONTACT`); pictures from `upload.`/`thumb.wikimedia.org` are fetched with the same agent (the
  generic one is refused: "Your request does not comply with our robot policy");
- a 429 or 503 pauses the whole queue for what Retry-After asks (5 s at least, 15 min at most); while paused, every
  request fails at once (never waits): the episode airs with what is known, the rest is asked next time;
- batches: 50 titles a Wikipedia request, 40 items a Wikidata query, 50 files a Commons request; every answer kept on
  disk (`data/pictures/answers.json`: titles, items and files 7 days, searches and NASA a day, decisions 12 h, "nothing"
  3 h) and written at most every 30 s; a decision missing an answer is never kept as "nothing", and one that found a
  picture while a source was paused is kept only 20 minutes and decided again (asking only what is missing): the
  subject it missed may be the better one (Hubble over NASA's headquarters);
- the producer gives the desk the picture budget (6 s) for the candidates, then keeps deciding the rest of the news
  desk in the background, 12 stories at a time (so the next episodes find theirs ready);
- NASA has its own gentle queue; a source that is down costs its pictures, never the episode; a picture that will not
  download gives way to the story's next cleared picture (`PictureDesk.failed`).

Measured from this machine, whose address is shared with other agents: Wikimedia answered 429 on about one request in
four with Retry-After 10–56 s. The measurement tool waits pauses out; the station never does.

## 6. Settings

| variable | default | what it does |
| --- | --- | --- |
| `PICTURE_RIGHTS` | `cleared` | `preview` lets the outlets' own photos stand in where nothing cleared fits, **for a private preview only**: such a picture shows `PREVIEW · NOT CLEARED` under its credit for as long as it is on screen, the episode carries `picturePreview: true` and `picturesCleared: false`, the server warns at start |
| `PICTURE_DESK` | `1` | `0`: no cleared pictures are looked for (maps and boards) |
| `WIKIMEDIA_CONTACT` | the project URL | the operator's email or URL in the User-Agent (without one Wikimedia allows 10 requests a minute) |

Outlet photos are not looked for at all by default (their article pages are not read for pictures), never served by
`/api/img` (404 "no image"), and old archive entries keep theirs aside (`outletImage`): SEVEN DAYS and PAY ATTENTION
never show them again unless in a preview.

## 7. For the publishing system

Every news episode carries:

- `pictureRights`: one entry per picture on air (and per footage clip): `{ storyId, source, licence, author, page,
  url, credit, attribution, label, cleared, checkedAt, restrictions? }`;
- `picturesCleared`: true when every picture on air is cleared; **false means the episode must never be published**
  (only possible with `PICTURE_RIGHTS=preview`), and `picturePreview: true` says so plainly;
- on each segment and rundown item with a picture: `imageCredit`, `imageLabel`, `imageLicence`, `imageFocus`,
  `imageUncleared` (preview only).

A publisher should refuse an episode with `picturesCleared !== true`, and paste the `attribution` lines into the
video's description (or a credits page it links).

## 8. What a lawyer should still confirm

This is engineering, not legal advice. Before monetised publication, a media lawyer should confirm:

1. **ShareAlike inside a video.** Pixelation makes an adaptation of a CC BY-SA picture (CC BY-SA 4.0 §1(a); the
   "technical modifications" of §2(a)(4) do not cover a stylistic change). §3(b) then asks the **adapted picture** to
   be offered under BY-SA (the description says so for each). Whether the **whole programme** becomes Adapted Material
   (and must be BY-SA), or the picture is one element of a collection, is the open question (CC's own FAQ leans to
   "only the adaptation"); also whether the platforms' terms (no downloading) are "additional terms" or "Effective
   Technological Measures" restricting the adapted picture (§3(b)(3)). BY-SA pictures are 53 % of the picks
   (70 of 132 in the final measurement): if the lawyer says no, set them aside (one line in `LICENCES`) and re-measure;
   coverage would fall from 30 % to about 14 %.
2. **CC 2.0/3.0 attribution in video**: whether the on-screen credit plus the description list satisfies "credit
   identifying the use of the Work in the Adaptation" and the URI requirement "to the extent reasonably practicable".
3. **Personality and publicity rights** of people in portraits (Commons' `personality` warning, recorded in
   `restrictions`): editorial news use is the channel's use; confirm for each platform's monetisation (YouTube ads
   next to a portrait are not an endorsement, but confirm), and the EU/UK data protection position for portraits
   (OGL expressly does not license personal data; the GDPR journalism exemption).
4. **Moral rights** (integrity) of photographers in the UK, France and the EU: pixelation is a deliberate style; CC
   4.0 waives moral rights only "to the extent necessary"; CC 2.0/3.0 keep them.
5. **Freedom of panorama**: photographs of recent buildings and artworks in countries without it (France for
   commercial use, Italy…): Commons deletes most violations, not all.
6. **The accused**: the desk shows no portrait on any story of an arrest, an accusation or a trial (UK privacy before
   charge, ZXC v Bloomberg [2022] UKSC 5); a lawyer may allow portraits of public office holders after charge.
7. **NASA**: that "news outlets … may use NASA content" covers a monetised channel's videos on all five platforms, and
   the identifiable-person rule (astronauts in pictures) for monetised video.
8. **ESA's standard terms** ("news programmes … VOD services or social media" allowed, "commercial purpose" not):
   whether a monetised news channel is a commercial purpose; until then only CC BY-SA 3.0 IGO pictures air.
9. **Platform policies** (YouTube reused content, Meta, TikTok, X): whether credited open-licence stills in an
   AI-assisted channel meet each platform's originality and AI-disclosure rules (not copyright, but sanctions).
10. **Commons accuracy**: Commons does not warrant its licence tags; the record keeps the page checked and when, so a
    takedown can be answered, but a lawyer should set the response policy (remove at once, keep the record).
11. **Free Art Licence 1.3**: like BY-SA, FAL asks a modified work to be offered under FAL; the same question as (1)
    for the few FAL pictures (1 of the 132 final picks).
12. **Names on screen**: that a credit giving the author's user name in Latin letters (a Cyrillic or Greek name
    transliterated; the original spelling in the description) and, for a long organisational author, on two lines, is
    attribution "in any reasonable manner based on the medium".

## 9. Paid wire photos (a later upgrade)

See `docs/pictures/WIRE_LICENSING.md`: what AP, Reuters, Getty and AFP offer for broadcast and online video, rough
costs, and their terms on alteration and AI.
