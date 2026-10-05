# TECH BYTES: programme style bible

The late-evening technology magazine with Max Circuit, who gets interested first, and Ada Volt, who asks the hard question. It builds on `docs/ART_DIRECTION.md` and does not repeat it. Anything not covered here follows that file, except the overrides listed in §3.1.

**Source status (revised 2026-10-02).** None of the outside claims here was checked against a live page.
- **First draft:** claims came from search-engine summaries of the linked pages.
- **This revision:** WebSearch was out of budget (200 of 200 calls used). WebFetch returned EGRESS_BLOCKED for journalistsresource.org and en.wikipedia.org. A curl probe of 30 hosts reached only api.github.com, registry.npmjs.org and pypi.org. Nothing was newly verified.
- **What changed:** claims that a reviewer showed were risky, unsupported or off-brief have been removed. They are listed at the end of §2. The claims that remain are search-summary claims.

**How to read the tags.** Every rule in §3 carries one of these tags:
- a **link:** a search-summary claim (page not opened; a quote may be in the summary's words);
- **via ART_DIRECTION:** a source that the ART_DIRECTION researcher opened or viewed;
- a **repo path:** a fact in our code or in another bible, checked on 2026-10-02;
- ***(owner, time)*:** an entry in `$SP/v2/OWNER_FEEDBACK.md`;
- ***(our rule)*:** a design decision with no outside source.

## 1. Identity

TECH BYTES is the channel's technology magazine for adults who use technology every day and are tired of hype.

**The room** is a product studio after hours:
- a seamless charcoal cove;
- two soft pools of light from above;
- one thin cyan line;
- two colleagues at a desk.

**The presenters:** Max leans in, and Ada raises an eyebrow.

**Each story** says what it changes for the viewer, but only when the summary says so, and then asks the question the press release avoided.

**Against the other shows:** more conversational than WORLD NOW, lighter in tone and value than COSMOS DESK's near-black observatory, and never a kids' gadget show.

## 2. Real references (search summaries, not verified)

**BBC Click, now BBC Tech Now (TV, 30 min)**
- **History:** Click ended in 2025 ([Wikipedia](https://en.wikipedia.org/wiki/Click_(TV_programme))).
- **Format:** Tech Now is "more global, reporter-led" ([tech-ish](https://tech-ish.com/2025/03/26/bbc-tech-now-show/)). Its first episode went from Bitcoin in Zambia to SXSW ([TechBuzz](https://techbuzzireland.com/2025/03/24/bbc-launches-flagship-technology-programme-tech-now/)).
- **Presenter:** Spencer Kelly's agency bio says he made complex subjects "engaging, entertaining, and accessible" ([bio](https://performingartistes.co.uk/artistes/spencer-kelly)).
- **Titles and theme:** titles by Made in Colour ([site](https://madeincolour.com/click)). The theme is electronic, by Bella Saer and Yoad Nevo ([SoundCloud](https://soundcloud.com/bella-saer/bbc-click-title-theme)).
- **What we take:** wit beside the journalism, never instead of it.
- **Not inspected:** no frame, set or staging of Click or Tech Now. Nothing in §3 copies their look.

**Bloomberg Technology (TV, daily, 1 h)**
- **Format:** "analysis, commentary, interviews and interactive graphics" ([Wikipedia](https://en.wikipedia.org/wiki/Bloomberg_Technology)), co-hosted from New York and San Francisco ([Bloomberg](https://www.bloomberg.com/btv/series/bloomberg-technology)).
- **Show colours:** the 2015 package gave each show one colour and one typographic symbol, matched by accent lights on set. The tech show, then called Bloomberg West, had a green "+" ([NCS](https://www.newscaststudio.com/2015/10/06/bloomberg-mixes-color-coding-symbols-in-new-graphics-package/)).
- **Graphics since 2021:** "chart and data visuals in a nod to the Bloomberg Terminal" ([NCS](https://www.newscaststudio.com/2021/05/07/bloomberg-redesign/)). Mark Porter's case study presents the redesign as a reduction of on-screen clutter ([Porter](https://markporter.com/work/bloomberg-television)).
- **Music:** more than 50 themes are built on one two-note sonic logo ([PR Newswire](https://www.prnewswire.com/news-releases/reelworld--reel2media-create-new-sonic-brand-for-bloomberg-television-and-radio-301376292.html)). David Lowe's earlier brief was "pacy, contemporary, positive, technological, classy" ([NCS](https://www.newscaststudio.com/2015/10/05/bloomberg-moves-to-beat-of-new-theme-music/)).
- **What we take:** one programme colour, repeated on set as a single accent; calm data graphics; one motif under every cue.
- **Not inspected:** no frame or set detail.

**Two-presenter staging**
- No real two-presenter tech or business desk was inspected for this file, because no frame could be opened.
- The chat staging in §3.5 comes from the owner's listener note *(owner, 17:47)* and from ART_DIRECTION §5, whose bulletin frames were viewed. Everything else there is tagged *(our rule)*.

**Light and materials (via ART_DIRECTION)**
- **CNN London:** soft, "relatively flat" light at about 5000 K, with coloured light used only as "pools" on the architecture ([TM Broadcast](https://tmbroadcast.com/cnn-london-lighting-workflow/)).
- **BBC Studio B:** a set that is "real, that you could touch" ([TVBEurope](https://www.tvbeurope.com/live-production/we-wanted-a-studio-that-was-physical-not-virtual-behind-the-design-and-technology-of-bbc-news-studio-b)).
- **Devlin:** many sets look alike because they are "either completely virtual or just covered in LED monitors" ([SVG](https://www.sportsvideo.org/2026/05/19/inside-studio-design-trends-and-how-to-make-the-right-moves-with-devlin-design-group/)).
- **What we take:** matte, physical surfaces lit in pools, not screens.

**Outside TV, used for writing only**
- **Hard Fork (NYT podcast):** a two-host tech show with recurring named segments such as "HatGPT" and "Hot Mess Express" ([Apple Podcasts](https://podcasts.apple.com/mt/podcast/hard-fork/id1528594034)). The theme is by Dan Powell ([Spotify](https://open.spotify.com/episode/432Ox9zz4cxWuYJlvVfNkz)).
- **What we take:** fixed named slots give a live show its skeleton *(our reading)*. Its banter-driven segments are not copied.

**Pace**
- In Rodero's 2015 study, as summarised by Journalist's Resource, 150 words per minute (wpm) felt slow and 170–190 felt normal. The best rate for dense news was 170 wpm ([Journalist's Resource](https://journalistsresource.org/media/radio-news-pace-words/)). This is the same reading as `money-minute.md`.
- British radio works at about 3 words per second ([Broadcast Journalism](https://www.oreilly.com/library/view/broadcast-journalism-6th/9780240810249/xhtml/ch17.xhtml)).

**Removed in this revision**
- "Recall peaks at 190 wpm for light news": not supported by the reading of the same page in `money-minute.md`.
- "Hard Fork, 2022–26": the only support was a host's post about leaving the Times, which does not end the show.
- "Newton came from improv": the cited post's title points to a different subject.
- Porter's quotation "Clutter is a major problem": the wording could not be checked. A paraphrase replaces it.
- MKBHD, WIRED Tech Support, The Verge and CNET: web brands with no set or camera, so off-brief for "real newscasts". MKBHD's look rested on a thumbnail-marketing page, and the Verge colour `#5200ff` on a third-party aggregator.
- The cursor symbol after "TECH BYTES", borrowed from Bloomberg's per-show symbols: dropped. The built open has none.

**What depends on a search-summary claim**
- **Story pace (§3.2):** if the 170 wpm finding is wrong, the targets still stand as our rule and are measured.
- **One accent line on set (§3.4):** it is also an ART_DIRECTION rule, so it stands either way.

## 3. Our style

### 3.1 Overrides of ART_DIRECTION

1. **Scenery tint.** ART_DIRECTION's re-dressing table gives TECH BYTES "blue `#0099db` ≤ 10%". Here the scenery has no added tint: it is the palette's own `P.slate`, `P.ink` and `P.black`. Neutral grey is what separates it from WORLD NOW's navy and COSMOS DESK's purple *(our rule)*.
2. **Camera.** ART_DIRECTION §3 ("must stay still: … the camera") and §6 ("Move the camera on the set") are relaxed for exactly one push-in per episode, in THE CATCH (§3.5). It is rendered by the canvas25d 2.5D camera. `world-now.md` makes the same exception for its own moves.
3. **Listener.** ART_DIRECTION §5 rule 6 ("the listener looking at the speaker") is read as the owner's glance rule: a brief look, never a sustained one *(owner, 17:47)*.

Everything else follows ART_DIRECTION unchanged. That includes the three static non-screen accents (one accent line, one practical pair, the logo plate), the wall limits, the type sizes and the graphics timings.

### 3.2 Delivery and writing (writer prompt and prosody)

**Pace** (measured from the voice's word timings; see §4 item 9)

| Who, what | Target | Mechanism |
| --- | --- | --- |
| Max, stories and intro | 170–178 wpm, aim 175 | `tools/voice/presets.json` `speed`, calibrated with `python3 tools/voice/measure.py rates` (`TARGET_WPM` max = 175, unchanged) |
| Ada, stories | 162–170 wpm, aim 166 | Same tool; `TARGET_WPM` ada = 166, unchanged |
| Chats, both | story pace × 1.03 (Max about 180, Ada about 171) | `speed` × 1.03 in the voice request, the value `SEGMENT_PROSODY.chat` already uses in `public/js/voice/speechtext.js` |
| Grave stories | about 4–6% slower | `EMOTION_PROSODY.serious` 0.955 and `sad` 0.935 in `speechtext.js` |

- **Basis:** stories sit around 170 wpm, the rate the Rodero summary links to dense news. Chats are a little lighter *(our rule)*.
- **Max vs Ada:** Max is about 9 wpm faster than Ada. His enthusiasm shows in tempo and pitch range, never in volume or exclamations.
- **Fix needed:** `PERSONAS.max.desc` in `speechtext.js` reads "excitable, quick on the exclamations", which is off-tone (see §5).

**Sentences** *(our rule; close to world-now's 11–14 average)*
- 10–15 words on average, 22 at most. One idea and at most one figure per sentence.
- The lead story is 3–5 sentences and the other stories 2–4 (see the `storyLength` request in §3.3).
- A story ends on a "what it means for you" line only when the summary says what follows. This is the writer's existing ACCURACY rule (`server/writer.js` `buildPrompt`).

**Register** *(our rule, from the BRIEF's tone correction)*
- Plain and adult.
- Banned: "game-changer", "revolutionary", "mind-blowing", "wow", exclamation marks and puns.
- Jargon that the summary quotes may be quoted once. Ada then translates it flatly.

**Humour** *(our rule)*
- Only in chats, with at most one dry line per exchange.
- Aim it at hype, jargon and the industry, never at the viewer or at real people.
- No chat after a grave story: harmful breaches, layoffs, deaths.

**Banter and hand-overs**
- **The exchange:** Ada asks, Max answers. Who gets the last word alternates, seeded per episode *(our rule)*.
- **Grounding:** Ada's question must be answerable from the summary, or left plainly open. Never claim what a company "hasn't said", or what "the small print" contains, unless the summary says so (`server/writer.js` ACCURACY rules).
- **Tosses:** a first-name toss comes only before a question, and "Thanks, Max" or "Thanks, Ada" at most once per episode. No hand-over phrase may be used twice in one episode *(our rule)*.
- **Examples of register only, never to be used verbatim:** "A 'reimagined experience'. A new menu." / "So what does it cost?" / "Which brings us to the bill." The writer must vary the wording, and §4 item 7 flags these strings if they appear.

**Spoken forms**
- Units in full ("gigabytes", "999 dollars").
- AI, GPU and USB-C as letters. Expand other acronyms the first time.
- Versions as words ("iOS nineteen").
- The full product name first, the short name after.
- City first; the country only when the city is not world-famous.
- The normaliser in `speechtext.js` (`normalizeForSpeech`) expands units and currencies itself.

**Prosody** *(our rule)*
- Pauses: 250 ms after an attribution, 400 ms before Ada's question, and a 600–800 ms beat after a dry line.
- Only yes/no questions rise.

### 3.3 Structure (built live from feeds)

**Superseded in part.** This section and its table describe the first, four-story format. Since the format round (owner 4–5 Oct) the programme carries up to 15 stories, QUICK BYTES, IN PLAIN ENGLISH and the boards: §3.10 is the running order now, and its numbers win where the two disagree.

**What the code already fixes (first format)**
- **Story and chat counts:** `config/channel.json` set `stories: 4` and `maxChats: 4` (now 15 and 8, §3.10). The producer waits for at least 3 fresh candidates (`min(stories, MIN_NEW_STORIES = 3)`, `server/producer.js`, `server/config.js`). `normalizeBulletin` keeps at most 4 stories and 4 chats.
- **Features:** `number` and `lighter` are features of a story, not extra segments (`server/writer.js` `FEATURES`, `applyFeatures`). So NUMBER OF THE DAY is one of the 4 stories, and AND FINALLY is always the last story.
- **No chat before the first story:** a chat placed there is deleted (`server/writer.js` line 423). So the cold open cannot hold a second voice.
- **Opening order:** the director plays the open template, then the intro over the headline montage (2.6 s per headline), then cuts to the wide (`public/js/director.js` `playIntro`).

| # | Segment | Built from | Words | Expected length |
| --- | --- | --- | --- | --- |
| 1 | Open | template | — | 4 s |
| 2 | Cold open: Max's hook, a greeting naming both, one teaser | `intro`, anchor = Max, at most 3 sentences | 22–39 | 9–15 s |
| 3 | Lead story, read by Max | story 1 | 45–75 (12–24 s if `storyLength` is unchanged) | 17–29 s |
| 4 | THE CATCH: Ada asks, Max answers | 2 chats, 1–2 sentences each | 6–20 each | 6–16 s, usually 8–12 |
| 5 | Story 2 (Ada), or NUMBER OF THE DAY | story 2 | 25–50 | 10–20 s; 11–22 s as the number |
| 6 | Optional one-line exchange | 1 chat | 6–20 | 4–9 s |
| 7 | Story 3 (Max), or NUMBER OF THE DAY if story 2 was not | story 3 | 25–50 | 10–20 s |
| 8 | AND FINALLY, then a one-line button | story 4 (`lighter`) + 1 chat | 25–50, then 6–20 | 15–30 s |
| 9 | Sign-off | `outro`, one voice; the partner glances | 8–16 | 4–7 s |

**Durations come from the words, not from this table.**
- **Formula:** seconds = words × 60 ÷ wpm, plus pauses, plus holds.
- **Pauses:** 0.35 s per sentence end, 0.25 s after an attribution, and the segment-end pause from `SEGMENT_PROSODY` (story 0.6, chat 0.35, outro 0.9). Add the director's 0.3 s gap after every segment.
- **Holds:** 0.4 s before Ada's question, 1.2 s after a dry line, 1.5 s on the number card, and 0.8 s before "And finally".
- **Precedence:** the table shows what the writing rules produce. When the two disagree, the formula wins.
- **Total:** with four stories, an episode runs about 1:15–2:35 before the end card *(our rule)*.

**Request (editorial stream, owner of `config/channel.json`).** Set TECH BYTES `storyLength` to: "lead story 3 to 5 sentences, max 520 characters; other stories 2 to 4 sentences, max 450 characters; sentences average 10 to 15 words, never more than 22". 520 is the validator's hard cap (`LIMITS.text`). Until this lands, the lead is 2–4 sentences (12–24 s) and the rest of the table holds.

**Slot rules**
- **NUMBER OF THE DAY** goes on story 2 or 3. It is never the lead and never grave (from `cosmos.md`'s ordering rule). If the writer puts `feature: 'number'` on story 1, the director plays it as an ordinary story with a fact card and no sting.
- **AND FINALLY** is the last story, only when a light story exists. It never directly follows a grave story: in that case the feature is dropped and the story plays as an ordinary one (from `world-now.md`).
- **With 3 grounded stories:** the lead; then NUMBER OF THE DAY if a non-grave story states a striking figure, otherwise an ordinary story; then AND FINALLY if a light story exists, otherwise an ordinary story.
- **With 2:** the lead plus AND FINALLY; otherwise the lead plus NUMBER; otherwise the lead plus an ordinary story.
- **With 1:** the lead and THE CATCH only.

**Chat budget** (`maxChats` 4), in priority order *(our rule)*
1. **THE CATCH:** 2 chats after the lead. If the lead is grave, THE CATCH follows the first non-grave story among stories 2–3, or is dropped.
2. **The AND FINALLY button:** 1 chat after the last story.
3. **One optional one-line exchange:** 1 chat after story 2 or 3.

That is 4 chats at most. When grave stories or thin material force a cut, drop 3 first, then 2, then 1. Never put a chat right after a grave story.

**Enforcement**
- The rule goes into the writer prompt through the programme's `style`.
- The validator keeps the first 4 chats in script order (`server/writer.js` line 397). A script with too many chats would therefore lose the AND FINALLY button first.
- The no-chat-after-grave rule is prompt-only today.
- Both need the editorial request in §5.

**Not used:** `quickfire` is deferred. It is not in `FEATURES`, and WORLD NOW's round-up and NEWS IN 60 already carry quick items. `roundup` stays off for this programme.

### 3.4 Set and light: "product studio after hours"

**The structural difference** from COSMOS DESK and WORLD NOW: a lighter, neutral cove lit in pools, instead of near-black architecture.
- COSMOS is "black, ink and slate", one step darker than home (`cosmos.md`).
- WORLD NOW is ink and black, with a slate pool behind each head (`world-now.md`).
- In palette terms, ink is L\* 18, slate 29 and steel 44 (computed from `public/js/palette.js`).

**Cove** *(our rule)*
- The back wall is one seamless curved sweep, with no flats and no seams in the head zones.
- The head zones (x 80–140 and 244–304, y 40–110) are `P.slate`, grading up through a Bayer 4x4 slate↔ink band to `P.ink` by about y 30, and to `P.black` above y 10. The sides fall to black, as ART_DIRECTION requires.
- The background in the head zones averages L\* 28–35. That is inside ART_DIRECTION's 18–45 range, at its upper end.

**Light pools**
- There is one soft pool from above behind each head, which ART_DIRECTION allows in the head zones. The centre of each pool is at most `P.steel` (L\* 44).
- Faces (L\* 55–73) stay the brightest, warmest pixels.
- Sources: CNN London's coloured "pools" on the architecture (via ART_DIRECTION) and the BRIEF's "product beauty shots lit like real ads".

**Desk as plinth** *(our rule)*
- A matte `P.steel` top face, with ART_DIRECTION's 1 px `P.silver` highlight at y 118.
- The front is `P.slate`, falling to `P.ink`.
- A 1 px `P.cyan` LED runs along the front edge. It is the set's one accent line.
- The zone at y 150–216 stays the darkest in the frame.

**Fixed elements**
- **Practicals:** one mirrored, static `P.steel` softbox edge per side (x ≈ 40 and 344, y 20–110). This is ART_DIRECTION's "one symmetric pair of practical lights".
- **Logo plate:** the channel desk plate, as in ART_DIRECTION.
- **Bezel:** the wall bezel is `P.slate`, not cyan.
- **Ambient effects:** none. ART_DIRECTION allows one; TECH BYTES uses none *(our rule)*.

**Cyan on set:** outside wall content, the only cyan is the desk LED, at most 1% of set pixels.

**Video wall** (the only screen)
- **Idle:** the open's chip emblem, static, in two tones (`P.steel` and `P.slate` on `P.ink`), with its cells in `P.cyan`. Cyan here is wall content, so it is outside the set count. The emblem sits in the wall's upper half, and the bottom 16 px stay dark. Sources: ART_DIRECTION's "static two-tone chip/grid" and the built open.
- **In a story:** the picture sits on a 2 px `P.black` mat inside the bezel, dimmed so the wall averages L\* 45 or less (ART_DIRECTION).
- **The mat applies to every TECH BYTES wall picture.** The episode carries no `product` flag: a story has category, shot, hasImage, fact, numbers, quote, kicker, map and location (`server/writer.js` `normalizeBulletin`). So nothing is decided per story.
- **No processing on photos:** no Bayer, vignette or sweep. ART_DIRECTION limits Bayer to walls, glow and floors.

**Key and rim:** as ART_DIRECTION. Faces are never tinted cyan, and the rim stays `P.silver`.

### 3.5 Camera and directing (runtime rules from episode data, seeded per episode)

The shots are the writer's `SHOTS` (wide, close, full, map; `server/writer.js` line 12) plus the director's cards. No new shot names.

**Cold open:** as the director plays it for every programme: open, then intro over the montage, then the wide (`director.js` `playIntro`).

**Story links** (from ART_DIRECTION §5, rules 3–4)
- A `close` single, to the lens. The lower third enters 1 s after the cut; `director.js` already sets `since: now() + 1`.
- With a picture: `close` for the first sentence, `full` for 4–8 s, then back to `close` for the last sentence.

**Chats** stay on the `wide`, which is what `director.js` line 288 does today.
- **Speaker:** may open the reply with one brief `look_partner`. In canvas25d that gesture lasts 1.9 s: about 0.4 s to turn, 0.7 s held, then 0.7 s back to the lens (`public/js/v2/canvas25d/gestures.js`) *(our rule)*.
- **Listener:** glances at the speaker in the first 1 s of the turn and at hand-overs, then returns to the lens or notes. At most one nod per turn, placed on one of the speaker's stressed words (`speechFrame().accent`) *(owner, 17:47)*.
- **Ada's deflating last line** goes to the lens. Max glances at her as it starts and is back on the lens or his notes before it ends *(owner, 17:47)*.
- **Dry lines:** never cut on one; hold 1.2 s after its last word *(our rule)*.
- **Presenter-stream fix:** canvas25d's listen mode nods on a fixed 5.2 s cycle (`rig.js`, `perf.listen`, `(t + seed) % 5.2`). That is the mechanical repetition the owner ruled out, and it needs the motivated nod above (§5).

**THE CATCH**
- Ada's question plays on her `close`, cut on her first word. Max's answer returns to the `wide` *(our rule)*.
- **The push-in** is the episode's only camera move *(our rule)*:
  - it starts 0.3 s after the cut;
  - it advances by 0.5% of scale per second, with eased ends;
  - it stops 0.5 s before the shot ends and holds still from then on;
  - it never exceeds 3%;
  - a shot under 2 s gets no push.
  - A 4 s question gives about 1.6%, or 6 px across 384.
- **Rendering:** the canvas25d studio camera re-projects every layer each frame at its own scale, snaps layer edges to whole pixels and quantises the head scale to whole pixels (`public/js/v2/canvas25d/studio25d.js`: header, `kAt` and the draw helpers). So there is no sprite scaling and no sub-pixel shimmer. Never scale a baked bitmap.
- **Fallback:** without the 2.5D camera (old renderer, late asset), hard-cut to Ada's `close` with no push. If the close is unavailable too, stay on the wide.

**Shot length:** 3–12 s. Full pictures pan at up to 4 px/s or push 3% at most. Studio shots are otherwise locked off (ART_DIRECTION §3, §5).

**Sign-off**
- One `outro` segment in one voice; the anchor alternates, seeded per episode.
- On the wide: the partner glances at the start and nods once at most.
- Then the end card (`director.js`, `case 'outro'`).

**Gestures**

| Who | Allowed | Cap |
| --- | --- | --- |
| Max (speaking) | `lean_in`, `raise_hand`, `point_screen` (only when the next beat is a picture), `count` | 2 per segment |
| Ada (speaking) | `steeple`, `chin`, `glasses` (before her question), a slow `shake_head`, `shrug` | 1 per segment |
| Listener (`[A:…]`/`[B:…]`) | `nod`, `look_partner` | 1 of each per segment |

*(our rule; the roles come from the presenters' `personality` in `config/channel.json`)*

- **Everything else is dropped,** including `wave`, `wow`, `fist_pump`, `thumbs_up`, `facepalm`, `point_camera`, `point_partner`, `papers` and `laugh`.
- **`laugh` is banned:** `public/js/scenes/portraits.js` (`laugh`, line 2136) animates it as alternating open-mouth shapes with a body bounce, which the BRIEF forbids.
- **A closed smile,** for AND FINALLY, is the emotion cue `happy` on the listener. canvas25d renders `happy` as a face preset (smile 0.62, squint 0.35, crossfaded over 0.45 s; `rig.js` emotion presets), and a silent listener's mouth stays at rest. No new gesture is needed.
- **Timing:** start 0.2–0.3 s before the stressed word, hold the apex through it, and release over at least 0.4 s *(our rule)*.
- **What the rig can perform:** canvas25d implements `raise_hand`, `wave`, `point_screen`, `nod`, `look_partner`, `shrug` and `count` (`gestures.js` `GESTURES`). `lean_in`, `steeple`, `chin`, `glasses` and `shake_head` come with the wave-2 gesture work. Until then those cues are dropped, never substituted.
- **Director defaults:** the director adds `wave` to the intro and outro when the writer gives no cues (`director.js` `defaultCues`). For TECH BYTES the default is `nod`.
- **Where it is enforced:** a `gestures` block for tech-bytes in `config/channel.json` (request in §5):

```json
"gestures": {
  "allow": { "max": ["lean_in", "raise_hand", "point_screen", "count"],
             "ada": ["steeple", "chin", "glasses", "shake_head", "shrug"] },
  "listener": ["nod", "look_partner"],
  "perSegment": { "max": 2, "ada": 1 },
  "defaults": { "intro": "nod", "outro": "nod" }
}
```

- **How it is applied:**
  1. The producer maps presenter ids to slots A and B and passes the block to `normalizeBulletin`.
  2. `normalizeBulletin` filters `parsed.cues` after `parseCues`. A stripped cue is dropped silently, and emotion cues are untouched.
  3. The writer prompt lists only this programme's allowed actions.
  4. The director applies the same filter to its defaults.

### 3.6 Graphics

**Accent** (ART_DIRECTION §4)
- `P.cyan` is used for 1 px rules and the strap's tag row, which carries black text via `inkOn` (`public/js/graphics/layout.js`).
- On set it appears only as the desk LED. No coloured text.

**Signature: the spec-sheet row** *(our rule)*

This is TECH BYTES' own device, as the red rule is WORLD NOW's and the centred "NASA-manual" figure is COSMOS DESK's.

- **NUMBER OF THE DAY card:** one ledger row on the card field (`P.black` to `P.ink`).
  - The label is left-aligned at x 19, in micro 3x5 `P.fog`: `numbers[0].label`, or the fact's words.
  - A 1 px `P.slate` leader rule runs from the label to the figure.
  - The figure is right-aligned at x 365, in display type (5x7 at 2x, `P.white`).
  - **Timing:** a 1 px `P.cyan` rule under the whole row draws left to right in 0.3 s. The figure cuts in 0.1 s after it finishes, then everything holds.
  - **Position:** the row is centred near y 80, inside y 26–136 (graphics contract in `$SP/v2/CONTRACTS.md`).
  - **No count-up:** the in-between values were never stated.
- **BY THE NUMBERS:** the same rows stacked, up to 3 from `numbers[]`, 18 px apart, with `P.slate` rules between them.
  - Each row appears on its spoken figure (word timings), at least 0.3 s apart.
  - The cyan rule sits only under the row being spoken.
- **Quote card:** a 1 px cyan bar on the left, with the attribution in micro `P.fog`.
- **No charts:** `numbers` are labelled figures, not series, so a chart would invent a scale *(our rule)*.
- **Cards-stream request:** `drawFactCard` in `public/js/scenes/cards.js` has no programme variant today. The ledger variant is in §5.

**Lower third** (ART_DIRECTION §4)
- **Kicker:** in the tag row (AI, CHIPS, PRIVACY). Feature stories get `FEATURE_KICKERS` (`server/writer.js` line 17).
- **Headline:** white on `P.ink`, 45 characters at most.
  - Today the writer schema asks for 48 characters and the validator clips at 56 (`LIMITS.headline`).
  - The 45-character clip is an editorial request (§5). Until it lands, the strap shows what arrives.
- **Name supers:** once per presenter; the director already tracks `introduced`.
  - The intended text is "MAX CIRCUIT • TECHNOLOGY CORRESPONDENT" and "ADA VOLT • TECH ANALYST".
  - Presenters have no `role` field, and the strap renders only `anchorName` (`public/js/graphics/strap.js`). The role comes from a requested `role` field (§5).
  - Without a role, the super shows the name only. Never hard-code the strings in graphics.

**Open and end card** (owned by the opens stream; observed at `$SP/shots/opens/final_open_tech-bytes/sheet.png`)
- **The built open:** circuit traces converge on a chip, then "TECH BYTES" settles with a cyan underline and holds. It has no cursor and needs none.
- **One caution:** the traces fill the frame edge to edge for about 0.8 s (t 0.5–1.3 s) before they resolve. That is its single motion idea, and it settles, so it passes. Nothing on set or on the wall may echo full-frame circuitry.

**Motion:** in over 0.35 s (ease-out), out over 0.25 s (ease-in). Whole pixels only, no bounce (ART_DIRECTION §4).

### 3.7 Music and sound

**This spec supersedes the current TECH entries in both music proposals.** The music stream changes whichever one is adopted.
- **Broadcast proposal:** `public/js/music/proposals/broadcast/packages.js` `TECH`, "Bitstream": A minor, 122 BPM, syncopated kick, side-chain pump, described in the file as "Playful, bright".
- **Lofi proposal:** `public/js/music/proposals/lofi/palettes.js` `'tech-bytes'`: 88 BPM, swing 0.55, "playful geek: chip plucks, bouncy sine bass".

**Theme:** the network motif with the TECH colour note, the ♭7 in A dorian (`public/js/audio/themes.js`). The precedent for one motif in every cue is Bloomberg's 50+ themes on one sonic logo (§2).

**Beds** *(our rule; "technological, classy" from Lowe's Bloomberg brief, §2)*
- 100–108 BPM, with a half-time feel.
- `tri` bass on the roots.
- A `pulse12` arpeggio at velocity 0.4 or less, low-passed at 1.8 kHz or lower, with a dotted-eighth echo.
- A `pad` on Am9 and D9 (the dorian IV).
- A closed hat (tune.js drum `H`, or the proposal's `kit` shaker) on light beds only.
- No kick, snare, side-chain pump or swing under speech.

**Under speech**
- The broadcast conductor already ducks the bed 9 dB, 120 ms before the first syllable, and cuts 6 dB at 2.5 kHz while anyone speaks (`public/js/music/proposals/broadcast/conductor.js`, header). No extra hook is needed.
- If the lofi proposal wins, it must do the same.
- Beds measure at least 18 dB under the voice with `tools/render-audio.mjs`.

**Where beds play**
- Under the cold-open montage, chats, the NUMBER OF THE DAY card, AND FINALLY and the sign-off.
- Story links have no bed.
- Grave stories get silence, and the next bed waits one segment (from `world-now.md`).

**Stings** *(our rule)*
- **NUMBER OF THE DAY:** the motif's head (low 5 → 1) on `pluck`, dry, 0.8 s, landing on the card's figure. Not `bell`, which COSMOS DESK uses.
- **End of a feature:** a two-note `pluck` button resolving to A, 0.6 s.

**Banned:** swooshes, glitches, modem sounds, typing, beeps, boings, saw leads and four-on-the-floor.

### 3.8 Transitions

- **Between shots and stories:** cuts throughout (ART_DIRECTION).
- **Wall picture changes:** a 1 px `P.silver` edge wipe, left to right, over 0.4 s (ease-in-out). It runs on the wall only *(our rule)*.
- **NUMBER OF THE DAY:** the strap tag flips to the feature kicker in 0.3 s (ART_DIRECTION strap flip).
- **No break inside an episode:** it ends with the wide, the sign-off and the end card (`director.js`, `case 'outro'`). `channel-and-breaks.md` governs what follows.

### 3.9 Do / Don't

**Do:**
- light a matte cove in pools;
- keep one cyan line on set;
- show figures as spec-sheet rows, exactly as stated;
- let Ada ask what viewers are thinking;
- hold the deadpan on the wide;
- glance, never stare.

**Don't**
- **Glitch titles, RGB split or magenta.** `public/js/set.js` still has the magenta tech palette and the RGB-split glitch title (confirmed by review, 2026-10-02). Both go.
- **Busy tech decoration:** matrix rain, binary code, HUD rings, wall-to-wall circuitry, neon gradients, candy-coloured tiles.
- **Cute objects:** robots or objects with faces, emoji.
- **Cheap comedy:** bouncy gestures, `laugh`, captions with exclamation marks, sound effects, sitcom zooms.
- **Canned lines** repeated across episodes.

### 3.10 Format round (owner 4–5 Oct): longer, never presenter after presenter

The owner's brief: longer programmes that are more than one presenter reading one story after another. TECH BYTES now runs up to 15 stories (as many as the desk has that are news) in seven kinds of segment. Every line is still the source's, except IN PLAIN ENGLISH, whose definitions are a fixed list of ours (below).

**The running order** (fallback writer; the LLM writer is asked for the same in `style` and the feature rules)

| # | Segment | What it is |
| --- | --- | --- |
| 1 | Cold open | the lead's line over the montage, "Also coming up", "Later" (never "Still to come", which belongs to the signpost) |
| 2 | Lead (Max) | 3–5 sentences, the article read for depth |
| 3 | THE CATCH | Ada asks, Max answers from the story (the episode's one push-in) |
| 4 | Main stories | 2–4 sentences each, alternating readers, with a board when the story has one |
| 5 | NUMBER OF THE DAY | a main story opening on its ledger card |
| 6 | IN PLAIN ENGLISH | Ada translates a story's jargon, card on screen (at most two) |
| 7 | STILL TO COME | the mid-programme signpost over the story it names |
| 8 | A second CATCH | another question type on a later main story |
| 9 | QUICK BYTES | three or four one-sentence items over their own pictures, read by whoever's turn it is |
| 10 | AND FINALLY + button | the other presenter reads, the first one's dry line |
| 11 | Sign-off | Max on the wide |

**THE CATCH.** Ada's question is chosen by what the story can answer, never the same type twice in one episode: the price, the timetable, what happens next (a plan, a deadline, an appeal: "So what comes next?" / "The task force will reportedly have 120 days to create a report..."), who it affects, where the law stands, how it works, and last "the catch" itself (a "but"). Max's answer is one source sentence of the programme's length that stands on its own after the story (`answerable` in `server/providers/mock.js`):
- it may lean on the story just told ("The first laptops using it go on sale in the spring");
- never on a sentence the viewer did not hear ("So it...", "This means...", "He then...");
- never names a product or a person the story never introduced ("The Air costs $99.99 and the Watch...", after a story about the Fitbit Edge);
- quotes nobody without saying who.

No catch sentence is kept back before a grave story (no chat follows a story there, so it would be lost).

**IN PLAIN ENGLISH** (`server/glossary.js`, producer stage `terms`, programme `"terms": { "explainer": "ada" }`). The bible's flat translation of jargon, now a segment:
- **The words are ours, fixed.** About 35 terms ("bug bounty", "open source", "AI slop", "Fourth Amendment", "altimeter"...), each a noun phrase a line can carry after "is" and a card can show. They are general knowledge, never a claim about the story, so the model never writes them.
- **Where.** Right after a main story whose spoken text uses the term, when the next segment is a story: never after a grave story, the number, And finally or a round-up item, never where a chat already follows. Each term once, at most two per programme, within the chat budget. A definition heard in the hours of recent lines is not repeated.
- **How it airs.** Ada's line in one of four phrasings (never the same twice in a programme): "AI slop, for the record: low-quality material churned out by AI." The director (pace `shots.terms`) cuts to the card for the whole line: IN PLAIN ENGLISH in micro type, the term at 2x with the cyan rule wiping under it, the plain words rising at 1x.

**QUICK BYTES** (programme `roundup.kind: "pictures"`, kicker QUICK BYTES). The tech round-up: smaller stories that have a picture of their own, one sentence each, read over the picture from the first word by whoever's turn it is (a fixed reader once gave Ada seven segments in a row, with her definition and And finally) ("Now, some quick bytes." runs under the first item; a 1.5 s cut to the reader would break the 4 s floor).
- No place needed and none named, unlike WORLD NOW's AROUND THE WORLD, which keeps its maps and one country per item.
- Never a grave story, and hard news (a court ruling, a security flaw) keeps its full telling and its board.
- An item is the news in our words: never a quotation leading it, never a name the item cannot introduce ("“This is a type of indiscriminate mass surveillance,” Hill wrote."). A story with no such sentence stays a main story.

**The boards, STILL TO COME, IN THEIR WORDS.** The format-round graphics of WORLD NOW now air here too (pace `shots`): BY THE NUMBERS in the ledger style on two or three spoken figures, WHAT WE KNOW on hard news (`"boards": ["known"]`; on this programme every story is "light" by topic, so a security flaw or a court ruling gets its board), STILL TO COME over the story it names, and the quote card on a sourced quote. The v2 planner puts a board after the story's opening single; a lone figure stays in the words (no single fact card on this show).

**New topics.** SECURITY (hacks, breaches, bug bounties, vulnerabilities) and PRIVACY (surveillance, facial recognition, licence-plate readers) come before AI in the topic list, and both count as hard news.

**The first run on real news** (4–5 Oct, the fallback writer on the live tech feeds). These would have aired, and are fixed for every programme and writer:
- **Not news on the desk.** Prime Day deals, a review in the first person, a list ("All the AI agents..."), a column ("...let's talk about the hard part"), a newsletter ("TechCrunch Mobility:"), and questions (a podcast, an analysis) no longer reach the candidates (`notNews`). A trade deal, "a great deal of" and a quoted first person stay news.
- **A harassment case as the And finally**, with a joke after it. Harassment, abuse, assault, trafficking, suicide and the like are grave.
- **Pages that are not the article.** A podcast transcript ("Sean O’Kane: How much time do you have?"), an author's bio card ("Anthony Ha is TechCrunch’s weekend editor. Previously..."), an event promo ("Get 50% off a second pass"), the feed's "[…]", a host's "We were talking about this last week" and an editor's "[Trump has]". Every candidate's article is now read, not the first eight.
- **Straps cut into scraps.** "...program due", "Can ‘super intelligence’ and non-binding safety pact", "...calls Flock ‘indiscriminate mass", "...just delivered", "...startup has come". The strap holds two lines (about 60 characters each): a headline is cut cleanly or goes up whole, never inside a quotation (single marks counted), never on a verb without its object, an auxiliary or "due", never a label that lost its verb. "Milt Windler, NASA flight director who helped save Apollo 13, dies at 94" becomes "NASA flight director Milt Windler dies at 94".
- **Sentences cut wrongly.** A cut keeps the names the headline is about ("...rights [when using Flock to search...]" is refused), lists (Oxford comma too) and pairs ("wetting and drying"), never strands a subject without its predicate, and takes an aside's dash with it. A list's last item after ", and" is no sentence of its own.
- **Headline-ese read aloud.** When a story must open on its headline (its summary leans on it, or speaks in the outlet's voice), the headline is told as a sentence (`spokenTitle`): its present-tense verb becomes the present perfect and a common-noun subject takes the outlet's own article ("The new Fitbit Edge leaks" -> "...has leaked", "..., dies at 94" -> "..., has died at 94", "Federal judge calls..." -> "A federal judge has called..."). Only a plain shape is turned: one known headline verb, no second verb after a comma, never a plural subject; otherwise the headline stays as written.
- **Our voice, not the outlet's.** "We don't know a ton about..." (The Verge's "we"), a sentence that follows on from one not said ("He then served...", "So it resorted...", "Realizing this, ..."), a rhetorical question and a bracket read aloud are left out.
- **Tone.** "AI slop overwhelms bug bounty programmes" was read smiling because AI is a "light" topic: bad news for someone is said straight. After an AI cheating at StarCraft, Max said "I want to take it apart": AI, apps and games get software buttons, not gadget ones.
- **A story made grave by its article.** A task force story was judged grave because its article mentioned the "Undersecretary of War", and the CATCH before it was cut. Gravity is judged on the headline, the summary and what airs.

**Length.** On real news (5 Oct, 13 stories) the programme carried about 750 words: 4 min 52 s of speech with the neural voices, 5 min 16 s from the open to the end card, recorded with `tools/record.mjs`. With 15 stories the desk adds what it has that is news (an OpenAI resignation that day): about 840 words, near 5 min 45 s. That is under the 6–8 minutes the LLM writer is asked for, and within the owner's ceiling of ten. The fallback writes no more than the reporting supports: no padding.

## 4. Acceptance checklist (each with how it is checked)

**Tools**
- Frames from `tools/shoot.mjs`, from a deterministic lab page or the offline channel.
- **Requested:** `tools/measure-frame.mjs`, which counts palette pixels and gives the mean L\* in named zones of a PNG, with presenter silhouettes masked or hidden.
- **Requested:** `tools/check-episode.mjs`, which runs over the episodes from `GET /api/queue` and their voice word timings.
- Unit tests in `test/writer.test.js`.

1. **Cyan:** in set shots, cyan is at most 1% of set pixels (wall content and graphics excluded) and never on a face. *Check:* measure-frame on wide and close frames.
2. **No COSMOS colours:** no `P.magenta` or `P.purple` pixel (presenters' clothing excluded), glitch or RGB split in any TECH BYTES frame. *Check:* palette census of a whole-episode shoot.
3. **Values:** the head-zone background averages L\* 28–35, and faces are the brightest warm pixels. *Check:* measure-frame on background pixels only.
4. **Chat staging:** chats are on the wide, except Ada's question in THE CATCH.
   - The listener's look at the speaker starts within the first 1 s of the turn and is back on the lens or notes within 3 s.
   - At most one nod per turn.
   - No cut within 1.2 s after a dry line.
   - *Check:* the director's shot log plus shoot frames every 0.25 s.
5. **Camera:** studio shots last 3–12 s. At most one push-in, in THE CATCH: 3% or less, ending on a still hold of at least 0.5 s. In consecutive frames, no layer edge moves backwards or by more than 1 px. *Check:* a deterministic shoot at `--every 0.0167` across the push.
6. **Gestures:** no unlisted cue reaches the client, and the caps hold (Max 2, Ada 1, listener 1 nod). *Check:* a test in `test/writer.test.js` feeding banned and excess cues to `normalizeBulletin` with the tech-bytes `gestures` block.
7. **Script:**
   - no "!" and no banned word (regex);
   - humour only in chats, and no chat directly after a grave story;
   - no hand-over phrase twice, and none of §3.2's example lines verbatim;
   - no pun, and at most one dry line per exchange.
   - *Check:* the regex parts in check-episode. The puns and dry lines need an LLM judge asked "Mark every sentence that is a joke, pun or dry aside". Pass: 0 marks in stories, at most 1 per exchange, 0 puns.
8. **Figures:** every on-screen and spoken figure matches the source summary, and nothing counts up. *Check:* the validator already drops ungrounded figures (`server/writer.js`), and check-episode re-checks `fact` and `numbers` against the source.
9. **Pace:** Max 170–178 wpm and Ada 162–170 wpm on stories; chats about 3% faster. *Check:* check-episode computes wpm per segment from the voice stream's `words: [{ t, char }]` as (words − 1) × 60 ÷ (t_last − t_first). `tools/voice/measure.py rates` calibrates the presets.
10. **Music:** no bed under story links or grave stories, beds at least 18 dB under the voice, and stings only at features. *Check:* `tools/render-audio.mjs`.
11. **Lower third:** one name super per presenter. Headlines are 45 characters or fewer once the editorial clip lands (48 or fewer before), with the kicker in the cyan tag. *Check:* check-episode plus a strap frame.
12. **Number card:** the rule draws first, the figure follows 0.1 s after the rule finishes, and the card holds. The ledger stays inside y 26–136, and the sting is `pluck`, not `bell`. *Check:* a shoot every 0.05 s over the card, plus render-audio.
13. **Grown-up test (protocol):**
    - **Frames:** three, at 1x and 5x: the wide during a chat, a close with the strap, and the number card.
    - **Reviewer:** a fresh agent that has not read this file.
    - **Question:** "What kind of programme is this, and who is it for? Pick one: grown-up tech news / business news / children's gadget show / video-game menu. Then list anything that looks childish."
    - **Pass:** "grown-up tech news" or "business news", with no item from the BRIEF's AVOID list.
    - **Blocker:** "children's" as the answer, or any AVOID item.
14. **Distinct from COSMOS:** shown side by side, the TECH BYTES and COSMOS DESK wides differ by at least 8 in head-zone mean L\*. A reviewer can also tell them apart in greyscale. *Check:* measure-frame plus the item 13 reviewer.

## 5. Requests to other streams

| To | Request |
| --- | --- |
| Editorial (`config/channel.json`, `server/writer.js`, `server/producer.js`) | Set the TECH BYTES `storyLength` given in §3.3. |
| Editorial | Add the `gestures` block (§3.5) and filter cues with it in `normalizeBulletin`. |
| Editorial | Trim chats by the §3.3 priority, not by script order, and drop a chat whose preceding story is grave. |
| Editorial | Clip TECH BYTES headlines at 45 characters, either as a per-programme `headlineMax` or as 45 channel-wide, which is what ART_DIRECTION asks for. |
| Editorial | Add `role` to the presenters ("Technology correspondent", "Tech analyst"). |
| Editorial | Write `tools/check-episode.mjs`. |
| Director | Build `anchorName` as "NAME • ROLE" when a role exists. |
| Director | Use `nod` as the TECH BYTES default cue for intro and outro, and apply the gesture filter to defaults. |
| Director | Play a `number` feature on story 1 as an ordinary story. |
| Director | Stage THE CATCH and its push-in, with the no-camera fallback. |
| Presenter stream (canvas25d) | Replace the fixed 5.2 s listening nod with motivated glances and nods (§3.5). |
| Presenter stream (canvas25d) | Add `lean_in`, `steeple`, `chin`, `glasses` and `shake_head`. |
| Studio / set stream (wave 2) | Build the cove, light pools, plinth desk, cyan desk LED, slate bezel and wall mat (§3.4). |
| Studio / set stream (wave 2) | Remove the magenta palette and glitch title from `set.js`. |
| Studio / set stream (wave 2) | Write `tools/measure-frame.mjs`. |
| Cards (opens stream) | Add a `ledger` variant to `drawFactCard` taking `rows: numbers[]`, used when `program.id === 'tech-bytes'`. |
| Music stream | Replace the TECH package in the adopted proposal with §3.7. |
| Music stream | Move the NUMBER OF THE DAY sting to `pluck`. |
| Speech text (`speechtext.js`) | Reword `PERSONAS.max.desc` without "exclamations". |
| Speech text (`speechtext.js`) | Keep `SEGMENT_PROSODY.chat.speed` at 1.03 or more. |
