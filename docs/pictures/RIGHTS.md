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
`server/fileevents.js` (FILE pictures of the same actor, the seat of government), `server/openverse.js` (institutions'
Flickr pictures through Openverse), `server/faces.js` and `tools/pictures/faces.mjs` (the face reader),
`server/facereader.js` (the station runs the face reader and starts it again), `server/pictureahead.js` (the desk
decides ahead of air, in the background),
`public/js/graphics/locator.js`, `public/js/boardspec.js` and `topicboard.js` (the boards when nothing is cleared),
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
| `source` | `wikimedia-commons`, `nasa`, `flickr` (an institution's own Flickr picture, found through Openverse), `operator` (a local feed's own files), `outlet` (never cleared) |
| `via` | how it was found: `wikidata:P18`, `commons:search`, `commons:file-protest` / `-strike` / `-session` / `-summit` (a FILE picture of the same actor), `openverse:flickr`, `openverse:file-…`, `commons:footage`, `nasa:images`, `nasa:article`, `outlet:…` |
| `subject` | what it shows: `{ kind: person / thing:org / thing:structure / … / place, qid, label }` |
| `licence` | `{ id, name, url }`: an SPDX id where one exists (`CC-BY-SA-4.0`, `CC0-1.0`), else named terms (`NASA-MUG`, `OGL-UK-3.0`, `PD-USGov`, `OUTLET`) |
| `author` | the author or source as the licence asks it to be credited (markup, "Own work", URLs removed) |
| `title`, `page`, `url` | the file's title, its original page (Commons file page, NASA library page, the Flickr photo page Openverse indexed), the rendition served |
| `uses` | `{ editorial, commercial, derivative, pixelation }`: what the terms allow |
| `restrictions` | non-copyright warnings the source gives (`personality`, `trademarked`, `insignia`) |
| `label` | `FILE` unless the picture is of the event itself (`EVENT`: only a NASA photograph of the mission named in the story, taken in the two days before it) |
| `year` | a FILE picture of an earlier event: the year it was taken (its EXIF date, else a date in the file); the tag then says `FILE 2023` |
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

A FILE picture of an earlier event of the same actor says the year it was taken in its tag: `FILE 2023 · AUTHOR ·
CC BY-SA 4.0 · PIXELATED` (the producer's source plate keeps it too: `File 2023: AUTHOR`). An institution's Flickr
picture credits the account as the licence asks (`FILE · EUROPEAN PARLIAMENT · CC BY 2.0 · PIXELATED`).

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
| 3 | **Commons FILE pictures of the same named actor doing the same kind of thing** (`server/fileevents.js`) | as Commons | per file | per licence | per licence | per licence, with the year | yes, strictly (§4) |
| 3 | **Openverse** (`api.openverse.org/v1/images/`), for **institutions' own Flickr accounts** only (`server/openverse.js`) | 200 anonymously; **timeouts at 10 s** (now 25 s); the index is sparse and dated for Flickr (the European Parliament's account: 240 pictures indexed of its 14,000, the newest indexed June 2025) | Openverse Terms of Service (docs.openverse.org/terms_of_service.html, effective 5 May 2022): "adhere to all rate limits"; "must not scrape the content in the Openverse catalog"; "must not use multiple machines to circumvent rate limits"; "respect and comply with the terms and conditions applicable to the content … including by providing proper attribution to CC-licensed works and respecting the terms and conditions of platforms hosting CC-licensed works"; Openverse "does not verify its licensing status"; a product made with the API "must prominently indicate that it was made using Openverse but is not endorsed or certified by Openverse"; it "reserves the right to charge fees for commercial uses". Limits announced in its headers: **20 requests a minute, 200 a day** anonymously | per licence (only CC BY, CC BY-SA, CC0 and US government works pass; Openverse's own filter `license_type=commercial,modification` is asked too) | per licence | the account's name, the licence, PIXELATED; the Flickr page in the description | yes: tier 1 accounts only (below), sober portraits and FILE events; 120–150 requests a day at most |
| — | **Flickr's own pages** (`www.flickr.com`) | 200 | **robots.txt: "User-agent: * / Disallow: /"** for every robot it does not name (read live 17 Oct) | — | — | — | **never read by the desk**: the licence, the account and the date come from Openverse's index; the picture itself from `live.staticflickr.com` (its robots.txt refuses nothing), with the desk's User-Agent. Flickr's API would give the account's age and size and the date taken, but needs a key, and commercial use needs Flickr's permission: owner action |
| 3 | **the seat of government** of the country a story about government opens on (the White House, the Palace of Westminster, the Berlaymont: `SEATS`, each title checked 17 Oct) | as Wikidata and Commons | per file | per licence | per licence | per licence | yes (§4) |
| 3 | **Commons FILE photos of the city or structure** (free-text search, `server/imagesearch.js`) | as Commons | per file | per licence | per licence | per licence | yes, strictly (§4) |
| 4 | nothing cleared fits | — | — | — | — | — | **the locator board** (`public/js/graphics/locator.js`): the country drawn and lit on the channel's map, the city dot with its ring, the place's name on a plate, as the montage airs it; the place is the one the headline names (its first country or city, "off <country>" its coast, the speaking state of "<country> says"), and the news desk's more precise place only where the story names it; no place: **the topic board** (`public/js/boardspec.js` decides, `public/js/graphics/topicboard.js` draws): the story's own strongest element, in this order: its key figure big ("139" MIGRANTS, "$1.3BN" ACQUISITION, with its qualifier, "AT LEAST"), a short quote card attributed ("IT WAS FAKE" - INDIAN VILLAGERS; a quote is never cut), the named actor as a wordmark plate with what it is (REPLIT, COMPANY AND ONLINE CODING ENVIRONMENT; the desk's own subject, never a name it refused, never a logo), the topic in the headline's words beside one of the channel's 25 line glyphs on a tile (AI SURVEILLANCE, HEATING OIL), the headline's key phrase; never a bare section word; under a grave story, or a topic of harm or the courts, silver and fog only, no glyph; never a picture of the event drawn |

Pictures from heads of state and governments that publish under open licences (kremlin.ru and president.gov.ua CC BY
4.0, the European Parliament CC BY 4.0, the White House as a federal work) reach the desk the same way: through their
Commons file, with the licence tagged there.

**Openverse's safeguards against laundering** (Flickr licences are set by the uploader and reviewed by no one):

1. **Trust tiers.** Tier 1: an institution's own account, by its Flickr address in the creator link Openverse indexed
   (`INSTITUTIONS`, 13 accounts checked by hand on 17 Oct: the Office of the President of Ukraine, the European
   Parliament, No 10, the White House, the US State Department, the UK Foreign Office and Home Office, DFID, Brazil's
   Senate and Planalto, Chatham House, the Estonian EU presidency, South Africa's GCIS). Tier 2 (an account five years
   old or more with 500 photos of its own) needs the account's age and size, which only Flickr's pages (refused to
   robots) or its API (a key) give: **off**. Everything else is refused.
2. **No other agency's picture.** A title or tag naming Reuters, AP, AFP, Getty, EPA, Anadolu, Xinhua, TASS, DPA, PA,
   Shutterstock, Alamy, "all rights reserved", "courtesy of"… is refused (`AGENCY_CREDIT`). A watermark in the pixels
   is not read by the desk: every Openverse pick is in the hand check, looked at on its contact sheet.
3. **The date.** Indexed before the story; a year in its title after the story is refused; a FILE event says the year
   its title gives (and is refused without one).
4. **The record keeps the source page** (the Flickr photo page) and the licence as indexed, with when it was read.

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
  is not "Charles III"), never a thing named after them ("Prince Charles cinema"); never on a story of their death (but see
  obituaries below), never on a story of an accusation, an arrest, a search of their home or a raid, a trial or a
  conviction (ZXC v Bloomberg). A portrait airs **framed whole** (head and shoulders, the height of the frame, over the
  same picture blurred and darkened: `pixelate.js` `fit: 'portrait'`), never cropped to the eyes or the hair.
- **A grave story** (harm, violence, conflict, a person's illness or operation) shows a portrait only of the **public
  figure it is about in their role** (an official of government, a monarch, a religious leader, a company's head, a
  judge, a commander, or anyone known in 25+ languages: they speak about it, they lead the response), and only a
  **sober** one: the face reader (below) must have read the picture as one face, big enough, calm, **no smile**. The
  candidates are the person's Wikidata picture, then the files of their Commons category and their photographs on
  Commons by name whose title speaks of no one else (no "with", "meets", "crowd", "family"), then an institution's own
  Flickr picture of them (Openverse). A picture not read yet never airs: the decision waits for the reader. Never a
  private person, never a victim, never the accused (as above).
- **An obituary** of a public figure (their death is the headline's story, they open it, Wikidata records the death in
  the last 400 days or the story says they died, known in 10+ languages, nothing violent): their sober portrait, read
  by the face reader. A victim of violence never gets one.
- **A surname alone** is enough only for the public figures the news names that way (`SURNAMES`: Trump, Putin,
  Zelensky, Macron, Burnham, Xi, Modi, Lula, Musk, Pope Leo… 59 people, each article checked on Wikipedia on 17 Oct),
  and only where no one else of that surname is named in the story ("Melania Trump"). Never an ambiguous one:
  "Bolsonaro maintaining edge over Lula in Brazil run-off" (October 2026) is about Flávio Bolsonaro, while "Bolsonaro"
  leads to his father; "Albanese" is also the UN's Francesca Albanese; "Medvedev" also a tennis player.
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
- **A FILE picture of the same named actor doing the same kind of thing** (`server/fileevents.js`): the headline's
  actor (within its first seven words) is a movement, a union, a party, a legislature, a bloc or a company (never an
  armed group, a police force or a person), and the headline says it protests, strikes (workers: never an air strike or
  "strikes a deal"), sits or votes (a legislature), or meets at a summit (a bloc). The Commons file must name the actor
  (its Wikidata labels in eight languages, its aliases or its Commons category) and the action (in the languages its
  photographers caption in), show no violent scene (no riot, tear gas, clashes, injured, arrests, fire), and say when it
  was taken: before the story (never the story's own day), within ten years. It airs as `FILE 2023`. **Never under a
  death or a disaster toll** (a death in the headline, a natural disaster or an outbreak, people harmed in the story);
  **under a grave story never with a private person's face in the foreground**: the face reader must find no face of
  9 % of the picture's height or more.
- **The seat of government** of the country a story about government opens on (or its kicker or its demonym names:
  "US Senate votes…", "Australia politics live: …", "Irish justice minister says…"), or the EU acting at the head of
  the headline: its legislature for a vote, a bill, MPs, its government otherwise (`SEATS`, 38 countries and the EU,
  each title checked on 17 Oct: a body's article, whose picture is its logo, is left out). Never under violence, a
  death, a toll or an outbreak; never for a country met later in the headline ("Talks on Ukraine continue in Geneva").
- **The face reader** (`tools/pictures/faces.mjs`, beside the station: the station runs no model). A face detector
  (UltraFace RFB-320) and an expression model (FER+, emotion-ferplus-8), both ONNX under Apache-2.0, run by
  onnxruntime-web 1.18.0 (MIT) in headless Chromium. Fetched once into `data/models` from **huggingface.co** (which
  redirects to its CDN **us.aws.cdn.hf.co**) and **cdn.jsdelivr.net**: new hosts for this project. The desk queues
  the pictures it needs read (`data/pictures/faces-queue.json`) and reads the verdicts (`faces.json`); a picture that
  would not download stays queued, never taken for "no face". A verdict is sober with one face of 12 %+ of the
  picture's height (a second face of 70 % its size or more is "two people"), detection score 0.85+, happiness 0.2 or
  less, surprise 0.4 or less, neutral plus sadness 0.45 or more. Checked on 23 portraits by eye before use, and every
  grave portrait of the measurement is in the hand check.
- **A public figure's portraits rotate** (round 8: one portrait of Trump aired under 20 stories of the samples). Beside
  the first portrait (their Wikidata picture), up to five more: files of their own Commons category and their
  photographs on Commons found by name, each with their **full name in its title** (a middle initial may stand
  between: "Donald J. Trump"; "Melania Trump" is never Donald Trump; a one-word name is never searched for it), no one
  else named in it in any language ("and", "e", "y", "et", "und", "entre", "with", "+"), no sign, banner, poster,
  sculpture, cartoon or match in its title, **dated in the last five years** by the file, not another crop of a picture
  already kept, cleared, and read by the face reader as **a portrait of one person** (one sure face, a fifth of the
  height or more, no other face at all); under a grave story each must be read sober, as the first. The search asks
  their name, and their name with this year and last year (the most relevant files of a famous name are old ones). A story keeps the portrait it was given for as long as
  its decision lives (what airs, and what `/api/img` serves, never changes under it); a story new to the air is given
  that person's portrait aired longest ago today, and **never one file that another story of the episode shows**: the
  producer takes off any picture a second story of the episode would show, which then shows its board.

## 5. Rate limits and robustness

Wikimedia's limits (mediawiki.org "Wikimedia APIs/Rate limits", read 17 Oct 2026) are per client across all its sites:
**10 requests a minute without an identifying User-Agent, 200 with a compliant one** (a name and contact information),
3 at once at most, Retry-After obeyed. `server/wikimedia.js`:

- **one queue for every Wikimedia request of the station** (round 10): the picture desk, the footage desk (its Commons
  searches), the guests' identity desk (Wikidata) and the election calendar (the Query Service) all ask through it, one
  request at a time, 1.1 s apart, with one compliant User-Agent carrying the operator's contact (`WIKIMEDIA_CONTACT`);
  pictures from `upload.`/`thumb.wikimedia.org` are fetched with the same agent (the generic one is refused: "Your
  request does not comply with our robot policy");
- the queue takes the most urgent request first: 0, the episode being made (its footage, its speakers, its undecided
  pictures); 1, the next programmes' pictures; 2, the rest of the news desk; 3, background work (the archive's
  pictures, the election calendar); then in the order asked;
- a 429 or 503 pauses the whole queue, every desk, for what Retry-After asks (5 s at least, 15 min at most); while
  paused, a request of the episode being made is refused at once (the episode airs with what is known), and background
  work waits the pause out in the queue; a media file (a footage clip) has a pause of its own, as
  `upload.wikimedia.org` limits media apart from the API;
- every request is counted by host and by desk (`/api/wikimedia`, operator; also in `/api/pictures/ahead`): who
  spends the allowance, who was refused during a pause;
- batches: 50 titles a Wikipedia request, 40 items a Wikidata query, 50 files a Commons request; every answer kept on
  disk (`data/pictures/answers.json`: titles, items and files 7 days, searches and NASA a day, decisions 12 h, "nothing"
  3 h) and written at most every 30 s; a decision missing an answer is never kept as "nothing", and one that found a
  picture while a source was paused is kept only 20 minutes and decided again (asking only what is missing): the
  subject it missed may be the better one (Hubble over NASA's headquarters);
- **the desk decides ahead of air** (`server/pictureahead.js`, round 9), never inside an episode's production: see
  below;
- NASA has its own gentle queue; a source that is down costs its pictures, never the episode; a picture that will not
  download gives way to the story's next cleared picture (`PictureDesk.failed`).

Measured from this machine, whose address is shared with other agents: Wikimedia answered 429 on about one request in
four with Retry-After 10–56 s (17 Oct, afternoon); that evening Wikipedia's API answered 429 to every request from
this address, one a minute, whatever the User-Agent (Commons and the Query Service still answered). The station waits
pauses out in the background; production never waits for Wikimedia.

**Deciding ahead of air** (round 9). On 17 Oct the live station aired 59 stories in an hour without a single picture:
the desk decided inside the producer's 6 s picture budget, Wikimedia asked for a 51 s pause, and nothing was ever
decided in time. Now:

- stories are decided as they come in, in the background, through the same paced Wikimedia queue; each decision is
  kept with its lifetime in `data/pictures/answers.json` (12 h with a picture, 3 h without, 20 minutes when a source
  did not answer), keyed by the story and its headline, so a restart finds them all;
- the order is what airs next: the stories of the episode in production (urgent), the candidates of the next
  programmes (the rotation's next three and the clock's pinned NEWS IN 60, as `select()` would choose them now), the
  stories of the last three hours (the newest first), the rest of the news desk, and last the week's archived stories
  without a cleared picture, the most told first, four at a time in a batch of their own (an urgent
  story waits behind one such batch at most);
- production reads only what is ready: the picture stage and the assets stage apply the kept decisions and put the
  undecided stories at the front of the queue; the assets stage waits for a batch already in flight that holds one of
  its stories, within the picture budget, and never asks Wikimedia itself;
- a 429 is waited out to its end, then the batch it cut is asked again at once; a story that failed otherwise is asked
  again after 1, 2, 4… minutes (30 at most). After a 429 from Wikipedia, the stories that need nothing from Wikipedia
  (their exact titles already kept) go first once the pause is over, and Wikipedia is asked again when nothing else is
  waiting: never sooner than its Retry-After, and less often than before;
- fewer requests a story: a person's Commons category and a country's capitals come in the Wikidata query that brings
  their facts (two queries a batch fewer); a public figure's rotation (their category and up to three searches, most
  of a decision's cost) is looked for only once they recur, aired in the last day or twice in a batch, and their
  Wikidata portrait airs meanwhile (unless it will not do: then their category and searches at the next try); every
  entity, file and search answer is shared by all the stories that need it;
- a decision made for a story that already aired without a picture is put on its archive entries (`archive.
  amendPicture`, kept beside the days' files in `data/archive/pictures.json`), so SEVEN DAYS and PICTURE THIS can show
  it; the station's own archive entries carry `imageRights` and `imageSubject` as they air;
- a story keeps the picture it airs with (`PictureDesk.pin`): a decision made again later never changes the picture
  under an episode's credit; a story whose file an earlier story of its episode shows takes its own next cleared
  picture (`spread`), and with none left it shows its board;
- `/api/pictures/ahead` (operator) and a log line every 15 minutes: decided, with a picture, Wikimedia requests a
  story, the pause, a fresh story's wait, what is left by tier. `PICTURES_AHEAD=off` goes back to deciding within the
  budget (the round-8 way).

Measured live on 17 Oct (`PORT=8733`, real feeds, 90 minutes, 13 news programmes, 166 stories aired): 28.9 % aired
with a cleared picture (the live station: 0 %), against 31.0 % for the desk's own decisions on the same stories; 164 of
166 had their decision ready when their episode was made; a story new to the news desk waited 3 s for its decision
(median), 99 s (90 %); 401 Wikimedia requests, 79 answered 429 and waited out (the queue paused half the run). The
details: `docs/roadmap/critique/cleared-pictures.md`, round 9.

**The station's own event loop** (round 9): SEVEN DAYS's readiness grouped the whole week with the news desk's
`sameStory` at every `/api/next`; on 5,600 airings that held the event loop 60 % of the time (every programme "ready
in" 70–120 s, Wikimedia's answers arriving after their 8 s timeout). It now counts the week's stories and days first
and groups only a small week (`Producer.weeklyReady`); the Query Service has 30 s (it answered a two-line query in 10 s
through the proxy).

**SEVEN DAYS's grouping** (round 10) held the station 88–212 s each time it was made. It now runs in a thread of its own
(`server/weekgrouper.js`, `server/weekworker.js`) that keeps the week's airings and its answers from one edition to the
next, and gives the same groups in the same order (`server/weekgroups.js`: each answer of sameStory asked once for each
pair of word sets in each reading state, and given again to every other telling with the same words;
`test/week-grouping.test.js` and `tools/pictures/weekdiff.mjs` compare it with the old grouping). On the 5,881
airings of 18 Oct: 460,049 calls of sameStory instead of 1,099,151, and 5,268 for the next edition; the station's thread
held at most a few tens of milliseconds. Should the thread fail, the week is grouped on the station's thread in slices
of 20 ms. `/api/wikimedia` gives the event loop's longest hold since the start (and its own processor time then: on a
machine shared with other work the thread also waits for the processor).

**The face reader** is run by the station itself (`server/facereader.js`): a child process, `tools/pictures/faces.mjs
--dir data/pictures --watch 60`, which reads the queue the desk writes, again every minute, and never writes over it.
When it stops, for any reason, it is started again after 5 s, then 10 s, 20 s… while it keeps failing at once (at most
30 minutes apart), and after 5 s again once it has run ten minutes; its lines go to the station's log; it is stopped
with the station (on exit, SIGINT and SIGTERM). It serves its page on a free port of its own, never the station's. A
portrait the reader has not read never airs where its expression or its being a portrait matters: the first portrait
airs meanwhile, and a decision waiting on the rotation's portraits is made again within the hour.

**Openverse** (`server/openverse.js`): its own queue, one request at a time, 3.2 s apart (under 20 a minute), at most
`OPENVERSE_DAILY` a day (150 by default, under the 200 announced), the day's count kept with the desk's answers so a
restart does not reset it; a 429 pauses it for what Retry-After asks (a minute at least), until the next UTC day when
the day's allowance is spent (`x-ratelimit-available-anon_sustained: 0`); answers kept a week; the same identifying
User-Agent as Wikimedia's (the project's URL, never a personal address). Openverse is asked only for a grave story's
public figure whose Commons pictures were all read and none is sober, and for a FILE event's actor.

## 6. Settings

| variable | default | what it does |
| --- | --- | --- |
| `PICTURE_RIGHTS` | `cleared` | `preview` lets the outlets' own photos stand in where nothing cleared fits, **for a private preview only**: such a picture shows `PREVIEW · NOT CLEARED` under its credit for as long as it is on screen, the episode carries `picturePreview: true` and `picturesCleared: false`, the server warns at start |
| `PICTURE_DESK` | `1` | `0`: no cleared pictures are looked for (maps and boards) |
| `WIKIMEDIA_CONTACT` | the project URL | the operator's email or URL in the User-Agent (without one Wikimedia allows 10 requests a minute) |
| `OPENVERSE` | `1` | `0`: Openverse is not asked |
| `OPENVERSE_DAILY` | `150` | Openverse requests a day at most (0–190; the anonymous allowance is 200) |
| `FACE_READER` | `1` | `0`: the station does not run the face reader (a grave story's portrait then never airs, and portraits do not rotate) |
| `PICTURES_AHEAD` | `1` | `0`: no background desk; each episode decides within its picture budget (`PICTURE_BUDGET_MS`), which a rate limit leaves with no picture at all |
| `PICTURES_ARCHIVE` | `1` | `0`: the week's archived stories are not given cleared pictures in the background (PICTURE THIS then has only the pictures stories aired with) |

After a measurement the face reader is run by hand: `NODE_USE_ENV_PROXY=1 node tools/pictures/faces.mjs --dir <its
out>` (once over the queue; `--watch <s>` keeps it running).

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

PAY ATTENTION's PICTURE THIS shows a picture only with its cleared record (or the operator's own file), and draws the
record's credit ("FILE · AUTHOR · CC BY 4.0 · PIXELATED") under the board for as long as the picture is on, as the
montage draws it (`public/js/quizplay.js` `quizPictureCredit`, `scenes/cards-quiz.js`); in a private preview an
outlet's photo says `PREVIEW · NOT CLEARED` there.

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
13. **The face reader** reads the expression of faces in public figures' portraits (and looks for faces in FILE
    pictures of events) to keep smiles off grave stories. Whether that is an "emotion recognition system" under the EU
    AI Act (Art. 3(39); recital 18 excludes "the mere detection of readily apparent expressions … such as a frown or a
    smile" unless used to infer emotions; Annex III lists emotion recognition as high-risk) and processing of personal
    data under the GDPR (no identification is made, nothing is kept but the verdict; the journalism exemption): to
    confirm before it runs in production. It must never read an agency's picture (AGENCY_REQUEST.md).
14. **Identifiable people in FILE pictures of events** (protesters, strikers) outside grave stories: the pixel style
    blurs faces, the picture is labelled FILE with its year, and it shows the same actor doing the same kind of thing;
    confirm the privacy and defamation position (a person shown at an earlier protest under a new story about it).
15. **Openverse's terms**: the "made with Openverse, not endorsed by it" notice (the channel's About page and video
    descriptions), its right to charge for commercial use, and whether anonymous use by a monetised channel is
    acceptable or a registered key is needed (owner action).
16. **Flickr pictures**: Openverse's index is the record of the licence (the desk never reads flickr.com: its robots.txt
    refuses robots); CC licences are irrevocable for a copy obtained under them, but a lawyer should confirm the index
    and its date are enough evidence, and that fetching the file from `live.staticflickr.com` respects Flickr's terms.
17. **The seat of government under a story about government** and **a curated surname list** (`SURNAMES`) are
    editorial rules, not legal ones: listed here so the lawyer sees every way a person's picture can reach the screen.
18. **The topic board's words** (round 8): a named actor's wordmark shows a few words of Wikipedia's short description
    ("HEAD OF THE CATHOLIC CHURCH"): a statement of fact, too short to be a work, though Wikipedia's text is CC BY-SA;
    a quote card quotes the story's own quote, attributed, never cut; and the rotation airs a public figure's portrait
    of an event (a speech, a meeting) as a FILE portrait under other stories.

## 9. Paid wire photos (a later upgrade)

See `docs/pictures/WIRE_LICENSING.md`: what AP, Reuters, Getty and AFP offer for broadcast and online video, rough
costs, and their terms on alteration and AI.
