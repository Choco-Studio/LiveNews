# CHANNEL IDENTITY, BREAKS AND LEAD-INS: style bible

This file covers everything between programmes:

- the network transition rule;
- commercial breaks, including elastic filler;
- the per-programme lead-in (an ident film or a countdown);
- continuity cards and the continuity voice;
- the UP NEXT promo;
- the parody ads.

It builds on `docs/ART_DIRECTION.md` and the five programme files. Revision 2 (2026-10-02) replaces revision 1 completely. §8 maps each review finding to its fix.

## 0. How the sources were checked

- **Network this session.**
  - The WebSearch budget is used up (200 of 200).
  - WebFetch and curl are refused for every non-GitHub host I tried, including en.wikipedia.org, youtube.com, img.youtube.com, bbc.co.uk, dandad.org, journalistsresource.org, ofcom.org.uk and web.archive.org.
  - github.com and raw.githubusercontent.com work, and so does GitHub code search.
- **[read]** means I read the quoted sentence word for word in a copy hosted on GitHub. These copies are:
  - Wikipedia article text saved in public datasets;
  - a film subtitle file;
  - a scrape of Lucas Pope's devlog;
  - a reproduction of the Kentucky Route Zero developer wiki;
  - the European Parliament's 2006 directive text.

  Each link points to the copy at a fixed commit, so a reviewer can re-open it. A Wikipedia copy is a snapshot of unknown date, so its figures hold "as of that snapshot". I name the article each time.
- **No [snippet] claims remain.** Revision 1 drew several claims from search summaries. I could not re-read any of these, so they were **removed, not kept**:
  - the Circle "twelve seconds plus a living hold";
  - the David Lowe quotes about the bassline, drum hit and chords;
  - "the 90 s countdown starts at 87 s";
  - Channel 4 2004 "for just an instant", and the RCA "privileged viewing zone";
  - Glazer and Mica Levi "in a sinister lab";
  - MTV "never to look the same twice";
  - the Day Today / ITN quote, Look Around You, Guinness "Surfer" and Johnnie Walker;
  - the Manfrotto lighting claim and the ScreenWeaver 150/120 wpm figures;
  - Kentucky Route Zero's "Night Noise".

  Where a fact was corrected rather than removed, §2 says so.
- **"Our rule"** marks a design decision with no external source.
- **Still owed:** a timing pass in a session with YouTube egress. It should measure, from official uploads:
  - BBC One ident length and where the announcer speaks;
  - the BBC News countdown;
  - one ITV or Sky break bumper.

  Then replace the *our rule* timings in §4 and §5.

## 1. Identity

Between programmes, GLOBIT 24 should feel like a public-service channel at 3 a.m.: calm, beautifully lit and precise, and faintly amused that you are still up.

- **One network, five doors** *(our rule)*.
  - Breaks, cards and ads belong to the network.
  - Each programme is entered through its own lead-in (§4.4), the way BBC Two once used different idents for different genres (§2, ref. 7).
- **Ads carry the satire.** Each copies one real commercial genre exactly, selling an absurd product with total sincerity.
- **Cards speak deadpan.** They make jokes about the channel, the hour or the viewer, and never about the news.
- **The continuity voice stays plain.** It names the programme and nothing else.
- It is for grown-ups who leave the channel on in a corner. The joke is never that the channel is cute. The joke is that the craft is real.

## 2. Real references (all [read])

### A. How real channels link programmes

**1. Station identification with a continuity announcer.**
- In Europe, "a form of station identification clip is played between programmes, traditionally incorporating the channel's logo, and accompanied by a continuity announcer that introduces the next programme (and promotes other programmes)."
- Also: "In the present day, most broadcasters use a set of multiple identifiers built around a particular theme or branding element."
- Source: Wikipedia, "Station identification" ([copy](https://github.com/Averyyy/nlp_final_preprocess/blob/37ba22661f197410bc2ccf1a8882b006d06a7630/processed_data/D572.txt)).
- **Use:** an unseen continuity voice names the programme over our lead-in ident. The ident films form one themed set.

**2. A voice line as a logo.**
- BBC One's first globe ident (1963) "featured the continuity announcer speaking over a rotating globe", with the announcement "This is BBC Television" (Wikipedia, "History of BBC television idents", [copy](https://github.com/usamaahmedsh/synthetic-data-langchain-rag/blob/68687dbad64059c43cd4b7fb9950595a28d0974b/data/raw/moon_landing/pages/History_of_BBC_television_idents.txt)).
- James Earl Jones "voiced the CNN tagline, 'This is CNN', as a part of the network's tenth anniversary in 1990" (Wikipedia, "James Earl Jones", [copy](https://github.com/USTC-StarTeam/RaPID/blob/75de6add1a8d9eecba4fc3d442ef2ae771b47474/FreshWiki-2024/txt/James_Earl_Jones.txt)).
- **Use:** "This is GLOBIT 24." appears at most once per lead-in.

**3. The BBC News channel countdown is the link when there is no announcer.**
- From Wikipedia, "BBC News (TV channel)" ([copy](https://github.com/kirito-0512/data/blob/433692870f44bcac3c97d2dc93a2d6b3dc852ab8/dump/BBCNews%28TVchannel%29.txt)):
  - The top-of-the-hour countdown exists "since there is no presentation system with continuity announcers so the countdown provides a link to the beginning of the next hour."
  - The 2005 sequence's "full version ran for 60 seconds, though only around 30 seconds were usually shown on air."
  - In 2013 "the countdown was also extended to 87 seconds".
  - In April 2021 a "sombre" version had "no 'data streams' and slower shots", made for the programmes after the death of Prince Philip and used again after the death of Queen Elizabeth II.
- **Correction:** revision 1 said "a 90 s countdown starting at 87 s". The source says the countdown is 87 s long.
- **Use:** the countdown is the lead-in for the flagship. A sombre variant exists for grave moments.

**4. A countdown labelled with the programme, not the hour.**
- Channel 4's schools service used "a countdown sequence featuring, in 1993 a slide with the programme name". In 1996 it was "an extended ident with timer in top left corner". In 2004–05 the video was "overlaid with upcoming programming information".
- Source: Wikipedia, "Channel 4" ([copy](https://github.com/cabosanlucas/document_similarity_using_tfidf/blob/566d578638605d937cd1282dbf1975eb825896ef/data/Channel%204.txt)).
- **Use:** our countdown counts down to the programme and names it. It never names a clock time (§4.4).

**5. Do not claim a time you cannot know, and always have a serious ident.**
- BBC One's 2002 package was "the first new presentation package not to include a clock though one had been designed — it had become difficult to transmit the time accurately, given the delay introduced by satellites and digital transmission" (idents [copy](https://github.com/usamaahmedsh/synthetic-data-langchain-rag/blob/68687dbad64059c43cd4b7fb9950595a28d0974b/data/raw/moon_landing/pages/History_of_BBC_television_idents.txt)).
- "The abandonment of a station clock, and perceived lack of a 'serious ident', also put the BBC in an embarrassing situation just one day into the new look with the death of the Queen Mother" (Wikipedia, "BBC One", [copy](https://github.com/cabosanlucas/document_similarity_using_tfidf/blob/566d578638605d937cd1282dbf1975eb825896ef/data/BBC%20One.txt)).
- **Use:** no break or lead-in graphic shows a programme start time. Every lead-in and bumper has a sombre variant (§4.6).

**6. A programme endcap is not an ad.**
- ITV programme "frontcaps" were, "Beginning in 1988, ... largely replaced by endcaps" (Station identification [copy](https://github.com/Averyyy/nlp_final_preprocess/blob/37ba22661f197410bc2ccf1a8882b006d06a7630/processed_data/D572.txt)).
- **Use:** the terms in §3.1. The programme's **end card** is its endcap. An ad's **end slate** belongs to the ad.

### B. Idents: one device, many films

**7. Different idents for different programmes.**
- At BBC Two from 1991, "Previously the ident featured a single scene that would introduce all types of programmes. Having multiple idents (at one point, there were 40) allowed variation in how they were employed, as different idents could be used to introduce different genres of programme" (idents [copy](https://github.com/usamaahmedsh/synthetic-data-langchain-rag/blob/68687dbad64059c43cd4b7fb9950595a28d0974b/data/raw/moon_landing/pages/History_of_BBC_television_idents.txt)).
- **Use:** each programme gets its own lead-in variant and scene affinity (§4.4). This answers the owner's "not every programme has to have the same style".

**8. Idents generated at air time.**
- BBC Four's first idents (2002) "were dynamic and reacted to the frequencies of continuity announcers' voices or background music. As a result, no idents were ever the same" (same copy).
- **Use:** our idents are assembled at runtime from scene, daypart, accent and seed. This is the LIVE PRODUCTION RULE in broadcast form.

**9. Ordinary places, different times of day.**
- BBC One's "Circle" idents were "a set of eight ten-second films" (BBC One [copy](https://github.com/cabosanlucas/document_similarity_using_tfidf/blob/566d578638605d937cd1282dbf1975eb825896ef/data/BBC%20One.txt)).
  - **Correction:** revision 1 said twelve seconds.
- The 2022 "Lens" idents, by BBC Creative and ManvsMachine, each feature "a large community space ... with a lens 'revealing' the space being utilised for different activities, or at different times of day" (idents copy).
- **Use:** short films of everyday adult places, re-graded by London daypart (§5.2).

**10. The logo is found in the scene.**
- "On 31 December 2004, Channel 4 launched a new look and new idents in which the logo is disguised as different objects and the 4 can be seen in an angle."
- In 2015, "Four new idents were filmed by Jonathan Glazer, which featured the shapes in various real-world scenes depicting the 'discovery' and 'origins' of the shapes."
- Source: Channel 4 [copy](https://github.com/cabosanlucas/document_similarity_using_tfidf/blob/566d578638605d937cd1282dbf1975eb825896ef/data/Channel%204.txt).
- **Use:** the GLOBIT globe-and-bit mark forms from scene objects at one camera position. That needs a camera move, so the ident has its own exception (§5.3).

### C. Cards, deadpan and parody

**11. Adult Swim bumps.**
- From Wikipedia, "Adult Swim" ([copy](https://github.com/NikilMunireddy/Document-Indexing/blob/cdfbbd8c9d39d1a1938a9958305583d8fd7db8d8/Docs/Adult-Swim.txt)):
  - "The current bumps debuted on May 25, 2003 and feature black intertitle 'cards' in white Helvetica Neue Condensed Bold type."
  - "The cards discuss everything from programming news to personal staff opinions on unrelated subjects."
  - Tribute bumps have "no music or sound effects, but only a fade in, showing the person's name ... followed by a fade out."
- **Use:** silent white-on-black cards. A grave moment drops all music and wit.

**12. Happy Fun Ball** (Saturday Night Live, 1991).
- "Written by Jack Handey and voiced by Phil Hartman".
- The ad is "accompanied by a long series of bizarre disclaimers and increasingly ominous warnings".
- Source: Wikipedia ([copy](https://github.com/yomoginna/EmbedNewConcept-20260305/blob/20961b2f33aa20768d350a5c01835e98053bfef3/data/wiki_pages/Happy_Fun_Ball.json)).
- **Use:** warnings escalate in darkness, read on one level tone.

**13. RoboCop (1987).**
- The film's news slogan: "This is Media Break. You give us three minutes and we'll give you the world." (film subtitles, [copy](https://github.com/tiost100/Movie-Genre-Recognition/blob/1057712396fade0b830fab27a4095065497577f4/SCIFI/RoboCop%20%281987%29.txt)).
- **Use:** mock-corporate slogans keep the grammar of real ones.

### D. Rules that real broadcasters follow

**14. Ads must be visibly and audibly separate.**
- The European Parliament's 2006 text of the audiovisual directive: "television advertising, teleshopping and telepromotions shall be kept quite distinct from other parts of the programme service by optical and/or acoustic and/or spatial means" ([copy](https://github.com/Harshini1331/PS4-RAG/blob/a41ea426bcf4fc6f4f22273981256aab70acd61a/final_train/12738463__TA__P6-TA-2006-0559__EN_bc1203.txt)).
- Bulgaria's Radio and Television Act, Art. 85, transposes the same words ([copy](https://github.com/edekeulenaar/global-digital-regulations/blob/633e8261d64910a2dc8913a1cfd8faa7fe78314c/data/policies/3534.md)).
- **Use:** 0.3 s of black and silence at every ad boundary, plus the existing ADVERTISEMENT tag.

**15. Reading time for on-screen text.**
- The BBC Subtitle Guidelines say: "Based on the recommended rate of 160-180 words per minute, you should aim to leave a subtitle on screen for a minimum period of around 0.3 seconds per word."
- I read this quote in a [copy](https://github.com/krzysztofdudek/SkaldSkill/blob/2eb1aebc450ab9361bf622b54d122a8d30069e09/skills/skald/references/sources.md) that cites bbc.co.uk/accessibility. bbc.co.uk itself is blocked here.
- **Use:** card and legal hold times (§5.4) always exceed 0.3 s per word.

### E. Mature pixel-art games

**16. Papers, Please.**
- Lucas Pope: "I'm going to try limiting individual objects or backgrounds to ~3 shades. That's not a hard rule" (devlog scrape, [copy](https://github.com/fguillen/PapersPleaseDevlogScrap/blob/80b8bdf273d5167c2e06e013b89d0cc1b0f69f02/index.html)).
- **Use:** about three shades per object in ident scenes. It is a guideline, as it was for Pope.

**17. Kentucky Route Zero.**
- In the interlude "Un Pueblo de Nada" the player is "Emily, in her producer role at the public television station WEVP-TV". The scene "plays out in almost real time, like the recording of an actual television broadcast". "Outside, a storm rages." (essay, [copy](https://github.com/steinea/ca/blob/4c59a20eb969e0132f652e0158859704862c3d99/_posts/2021-03-12-its-more-like-a-tendency.md)).
- The developer wiki reproduction lists WEVP broadcasts and a "PSAs Outline" ([copy](https://github.com/dekuNukem/Kentucky_Route_Zero_Official_Developer_Wiki/blob/master/docs/WEVP-Broadcast-Schedule.md)).
- **Use:** our reading is that television can be melancholy and sincere material. It is *our reading*, not a claim about the game.

The BRIEF's tone list (VA-11 Hall-A, Coffee Talk, Hyper Light Drifter) comes from the owner and was not researched here.

## 3. Network contract: the rules that cross files

### 3.1 Terms

| Term | Owner | What it is |
| --- | --- | --- |
| **End card** | programme file | The programme's endcap after its sign-off: title plus GLOBIT 24. It names no next programme and shows no clock (§3.3). |
| **End slate** | each ad | The ad's last 3.5 s or more: wordmark, tagline, URL and legal line. |
| **Stinger** | network (`cards.js` `drawStinger`) | The 0.8 s slab wipe. |
| **Bumper** | this file | Opens a main break: a card set or a locked-off short ident. |
| **Holding slide** | this file | One card shown inside filler. "Holding slides" is BBC's own term (idents [copy](https://github.com/usamaahmedsh/synthetic-data-langchain-rag/blob/68687dbad64059c43cd4b7fb9950595a28d0974b/data/raw/moon_landing/pages/History_of_BBC_television_idents.txt), 1985). |
| **Promo** | this file | UP NEXT, shown at the end of a main break and only when `next.ready`. |
| **Lead-in** | this file | An ident film or countdown that opens **every** episode, its first episode and replays included (§4.4). |

### 3.2 The one rule at programme boundaries (our rule, from refs. 3 and 5)

`server/station.js` puts a break after **every** episode (`advance()`: `last.kind === 'episode'` returns `breakItem()`). Breaks never fall inside a programme, so a programme has exactly two boundaries.

| Boundary | Sequence | Stingers |
| --- | --- | --- |
| Programme to break | sign-off on the programme's own shot, then end card (2–3 s), then stinger, then bumper | exactly 1 |
| Inside a break | 0.3 s black and silence between every element | 0 |
| Break or filler to programme | the break's last element, a cut, the **lead-in**, then a **hard cut on the downbeat** to the programme's first frame (its cold open if it has one, otherwise its open) | 0 |
| Fallback (lead-in assets missing or failed) | stinger, then the programme's first frame (what `playEpisode` does today) | 1 |

- **No stinger into a programme after a lead-in.** The ident or countdown is already the network device, and two network transitions in a row would stutter.
- The programme tag and bug glint "after breaks" (ART_DIRECTION §4) therefore follow the open.

### 3.3 Lines in sibling files that conflict (for the orchestrator to apply)

| File:line (2026-10-02) | Says | Change to |
| --- | --- | --- |
| world-now.md:181 | wide shot, "More after this.", then stinger | A break never returns to the same programme, so drop "More after this.". Keep the sign-off, end card, stinger. |
| world-now.md:182, tech-bytes.md:154, cosmos.md:233 | "Out of a break: stinger, then the wide shot …" | "Out of a break: lead-in, then a hard cut to the open (or cold open), then the wide shot, bug glint and programme tag 8 s." |
| cosmos.md:229, money-minute.md:202 | "Into the show: stinger, (cold open,) open" | "Into the show: lead-in, then a hard cut to the cold open or open." |
| tech-bytes.md:153 | lock-up holds 2 s, then stinger | Fine if "lock-up" means the end card. |
| money-minute.md:89, :205 and news-60.md:90 | end card names the next programme, and news-60 adds HH:MM | The end card shows title plus GLOBIT 24 only. The next programme is unknown when the end card airs: `break.next` arrives with the break item, and `upNext()` can change if production skips a slot. The promo and lead-in name it instead. |
| news-60.md:142 | ticker "NEXT: PROGRAMME HH:MM" | Drop it: there is no data source for HH:MM. |
| news-60.md:157 | "Ident → open: hard cut on the downbeat" | Already matches this rule. |

## 4. Structure, mapped to what the server actually sends

### 4.1 Facts from `server/station.js` and `public/js/director.js` (read 2026-10-02)

- **Break item.** `breakItem()` returns `{ kind:'break', id, filler, ads, next:{ id, title, tagline, theme, presenters, ready } }`.
  - There is no start time.
  - `ads` is `adsPerBreak` (2), or 1 when `filler`.
- **`next.ready === true` means the queue had an episode.** Only `advance()` shifts the queue, so the item after this break **is** that episode.
- **`next.ready === false` means the next item is unknown.** It may be:
  - the episode, if production finishes during the break;
  - another filler break (at most `maxExtraAds` = 6 in a row);
  - a replay of the last episode (`replay: true`).
- **Cold start.** Before any episode has aired, `advance()` returns filler breaks, without limit, while the first episode is produced.
- **Today's `playBreak`.**
  - On a non-filler break it plays a stinger, the ident with the `jingle` cue and a 3.2 s hold.
  - It plays **a stinger before every ad**.
  - It plays a stinger and the promo for **every** item that has `next`, filler included.
  - So a 6-filler run shows 6 promos. This revision fixes all of that.

### 4.2 Main break (`filler: false`)

| # | Element | Condition | Length |
| --- | --- | --- | --- |
| 1 | Stinger, covering the cut from end card to bumper | only if this client aired the episode before; a client's first item skips it | 0.8 s |
| 2 | Bumper: a card set (1–3 cards plus a GLOBIT 24 signature card) or a locked-off short ident | alternates with the previous bumper (history, §4.7); grave mode gives the sombre short ident (§4.6) | cards ≤ 10 s; ident 5–6 s |
| 3 | Black and silence, then an ad, × `break.ads` | `pickAds(break.ads, recentAds, { rand })` | 0.3 s plus 20–30 s each |
| 4 | Black and silence | — | 0.3 s |
| 5a | UP NEXT promo | `next.ready` | 5–6 s |
| 5b | Holding slide, with **no programme name** (the next item is unknown) | `!next.ready` | 3 s |

The break then ends, and the client fetches the next item.

### 4.3 Filler break (`filler: true`)

- **Contents:** black and silence (0.3 s), then **one ad**.
- **Optional opening:** a holding slide (3–4 s) when this is the client's **3rd or later consecutive** filler item.
- **Client's first item:** if the client has aired nothing yet, it opens with the locked-off short ident (5–6 s, no voice) instead.
- **Never in filler:** stinger, bumper card set, promo, lead-in or voice.
- **Longest run:** main break (2 ads) plus 6 fillers is 8 ads, about 3.5 min, with holding slides from the 3rd filler on. Then the replay arrives with its lead-in.
- **Holding slide copy** (evergreen, `wit:false`, true by construction):
  - `THE NEXT PROGRAMME / IS STILL BEING WRITTEN.`
  - `GLOBIT 24. / MORE NEWS SHORTLY.`

### 4.4 Lead-in: the head of every episode, replays and the first episode included

The lead-in is played by the client at the start of `playEpisode`, before the programme's first frame. It replaces today's opening stinger.

| Programme | Lead-in | Accent | Ident scene affinity (seeded weights) |
| --- | --- | --- | --- |
| WORLD NOW | **countdown** (refs. 3, 4) | `P.red` rule | — (globe plate) |
| NEWS IN 60 | **countdown**, ticking | `P.yellow` rule | — (black plate) |
| TECH BYTES | **ident film** | `P.cyan` practical light | newsroom 3, launderette 2, others 1 |
| COSMOS DESK | **ident film** | `P.magenta` practical light | rooftop water tower 3, ferry deck 3, others 1 |
| MONEY MINUTE | **ident film** | `P.green` practical light | launderette 3, bus shelter 2, others 1 |

**Countdown** (our rule; 10 s, because our programmes come every few minutes, not hourly):
- The digits read `0:10` at t = 0 and show ceil(10 − t) until t = 10.
- `0:00` holds for 0.5 s, one beat at 120 BPM.
- At t = 10.5 s the lead-in **hard-cuts** to the programme's first frame.
- **Label:** `NEXT` (micro, `P.fog`) above the programme title (2x, `P.white`).
- **No clock time anywhere.** The countdown measures the client's own playback timeline, so it is always true.
- **Plate:**
  - WORLD NOW: the navy field and globe from its open, a still frame.
  - NEWS IN 60: `P.black`.
  - A 1 px accent rule under the title grows from 0 to 120 px in whole pixels, one step every 83 ms.

**Ident film:**
- **Move:** 3 bars of the ident tempo (about 7–8.6 s; §5.6). The camera moves only under the exception and method in §5.3.
- **Alignment:** at the start of bar 4 the mark aligns and the camera locks off.
- **Wordmark:** fades in at +0.4 s.
- **Voice:** starts at +0.6 s.
- **Hold:** ends at the first downbeat after the later of +2.0 s and (voice end + 0.6 s), capped at +5 s.
- **End:** a hard cut. Total 9–13 s.

**Voice:**
- The continuity voice speaks one line from a pre-rendered bank (§5.1) over the ident hold, or at 0.5–5 s of the countdown.
- If the line is missing, the lead-in runs without a voice and does not wait.

**Replay:** the same lead-in with the replay line ("Another look at World Now.").

### 4.5 First item for a client (cold start, or a client joining mid-stream)

| First item | What plays |
| --- | --- |
| Filler break | short ident (5–6 s, no voice), then black and silence, then the ad |
| Main break | from element 2 on (no stinger, since there is no end card to cover) |
| Episode | its lead-in, then the programme |

The wit gate treats "no previous episode" as grave (§4.6).

### 4.6 Grave mode (the wit gate, defined)

**`grave(prev)` is true** if any of these holds:
- the client has no previous episode (cold start or joined mid-stream);
- any segment of `prev` has `breaking: true`;
- the first `story` segment's `emotion` is `serious` or `sad`;
- the last `story` segment's `emotion` is `serious` or `sad`.

These are the same emotions `server/writer.js` treats as grave (`emotion === 'serious' || emotion === 'sad'`).

**Effects** (precedents: refs. 3, 5 and 11):
- The bumper becomes the **sombre short ident**:
  - locked off;
  - no ambient motion;
  - a pad only, no motif, no cards.
- Card sets used anywhere in the item must have `wit: false`.
- The lead-in uses the **sombre** voice line. A sombre countdown drops the ticks and keeps the pad.

**Producer side:** the validator rejects `wit: true` sets for an episode whose own lead story is grave or breaking, so cards never sit next to a grave programme on either side.

### 4.7 Seeding and history (deterministic, testable)

- **Seed:** `seed = fnv1a32(item.id)`, then `rand = mulberry32(seed)`.
- **Order:** one `rand` per item, drawn in a fixed order:
  1. bumper kind;
  2. card set;
  3. ads, by passing `{ rand }` to `pickAds`, whose `rand` is already injectable;
  4. ident scene;
  5. ambient choice.
- **Client history,** like the existing `recentAds`:
  - `recentScenes`: the last 3 scenes; never repeat one of them while the daypart allows another;
  - `lastBumperKind`;
  - `fillerRun`: consecutive filler items;
  - `prevEpisode`.
- **Determinism:** the same `(item.id, history, London hour)` gives the same choices. Tests inject the hour.
- **London time** comes from `util.js` `zoneTime(STUDIO_TZ)`, which keeps one cached `Intl` formatter and memoises per minute. It is read once when an item starts (daypart) and once when a card appears (`{time}` token), never per frame. It is never shown as a programme start time.

### 4.8 Requests to the pipeline (owners: server, voice)

1. **Writer.** Add an optional episode field, produced **with the episode**, in the same writer response (no extra model call):

   ```
   continuity: { v: 1, sets: [ { wit: boolean, cards: [ { lines: [string] } ] } ] }
   ```

   - 1–3 sets, each of 1–3 cards. The episode is produced a few minutes ahead (`QUEUE_SIZE`), so the cards arrive ready.
   - Validate with `normalizeContinuity()` using the §5.1 rules. Drop invalid sets.
   - If none survive, the field is absent and the client uses its evergreen sets.
2. **Station.** In `breakItem()`, when `next.ready`, copy `queue[0].continuity` into `next.continuity`. This is one line. `breakItem()` stays synchronous and calls no writer.
3. **Voice.** Add presets `continuity` and `ad-<id>` to `tools/voice/presets.json`. Add an offline build step that renders:
   - the continuity bank to `public/audio/continuity/<programId>.<variant>.{wav,json}`;
   - the ad voice-overs to `public/audio/ads/<adId>/<n>.{wav,json}`.

   Each JSON holds word times. A manifest stores a hash of programme titles and presenter names from `channel.json`; if the hash does not match, the client skips the line. This adds no Kokoro work at air time.

## 5. Our style

### 5.1 Delivery and writing

**Continuity voice** (our rule):
- An unseen announcer, Kokoro **`bf_alice`**. No presenter preset uses it: presenters use bm_george/bm_fable, af_heart/af_bella, am_puck/am_fenrir, bf_emma/bf_lily, af_nova, am_echo, bf_isabella and am_michael/am_onyx.
- It must pass a blind A/B check against Ada and Penny. If it fails, use `bm_lewis:0.75+bm_daniel:0.25` and give the en-GB ads other voices.
- Pace 150–160 wpm, below the anchors' 165–185 wpm in the sibling files. Those files cite Rodero's study via Journalist's Resource, which I could not re-open.

**Continuity bank:** 4 lines per programme, 20 in all. They are pre-rendered templates, not per-episode scripts.

| Variant | Example (WORLD NOW) |
| --- | --- |
| A | "This is GLOBIT 24. Now, World Now, with Paco Pixel and Lola Byte." |
| B | "Now on GLOBIT 24: World Now." |
| replay | "Another look at World Now." |
| sombre | "Now on GLOBIT 24, World Now." (read at about 145 wpm) |

- Spoken forms: "News in Sixty", "Cosmos Desk", "Unit Eight".
- No clock times ("at nine" is gone).
- "London time" is never spoken.

**Cards are silent** (ref. 11). They are text on black over the card loop (§5.6), and nothing synthesises them at air time.

- **Schema:** `{ wit: boolean, cards: [ { lines: [string] } ] }`. The client appends the GLOBIT 24 signature card itself.
- **Validator** (server `normalizeContinuity()`, plus a client test over the evergreen file):
  - 1–3 cards per set, each ≤ 8 words and ≤ 2 lines;
  - every line fits 312 px at 2x by `font.js` `measureText`, otherwise the whole card drops to 1x (≤ 2 lines);
  - upper-case ASCII letters, space and `.,'’:;-` only. No `!` and no `?`;
  - digits only inside `GLOBIT 24` or the `{time}` token, at most once per set. So no runtimes, counts or claims;
  - no word of 4 or more letters from any headline of this episode or the previous 3, and no presenter or real-person names, so cards stay off story subjects;
  - `wit: true` sets also reject the writer's grave-story lexicon (`isGrave`).
- **`{time}`:** the client replaces it with `zoneTime(STUDIO_TZ).label` when the card appears.
- **Topics:** the channel, the hour, the viewer. Never a story, place or person.
- **Wit:** at most one witty card per set, and the last written card is plain.
- **Evergreen file:** about 20 sets, `wit` labelled by hand. Examples:
  - `IT IS {time} IN LONDON. / YOU ARE STILL UP. / SO ARE WE.` (wit)
  - `THIS IS GLOBIT 24. / THE NEWS CONTINUES.` (plain)
  - `NOTHING HAS BEEN SIMPLIFIED. / IT IS JUST SMALLER.` (wit)

**Ad voice-over:**
- **Who:** genre voices (§5.5), never a presenter's or the continuity voice.
- **How:** pre-rendered offline (§4.8), with word timings written by the voice tool. They are played through `audio.speak(text, 'ad', { audio: { url, words } })`, which `CONTRACTS.md` "Recorded voices" already supports.
- **Fallback:** if a file is missing, the browser TTS reads with today's `ad.voice`.
- **Tone:** read sincerely, never winking.
- **Numbers:** absurd precision ("ninety-nine point nine recurring per cent").
- **Warnings:** Happy Fun Ball style (ref. 12). Three to five of them, each darker, read on one level tone.

### 5.2 Set and light: idents

**Dayparts (London):** night 22–06, morning 06–12, day 12–18, evening 18–22.

- Each scene is drawn once (hand-pixelled, about 3 shades per object; ref. 16).
- A **daypart grade** is a palette-index remap plus practical lights on or off, baked when the item starts. Nothing is regraded per frame.

| Scene | night | morning | day | evening |
| --- | --- | --- | --- | --- |
| Night-bus shelter (rain allowed at night) | ✓ | ✓ | ✓ | ✓ |
| Launderette | ✓ | ✓ | ✓ | ✓ |
| Rooftop water tower | ✓ | ✓ | ✓ | ✓ |
| Ferry deck | — | ✓ | ✓ | ✓ |
| Empty newsroom, one lamp | ✓ | — | — | ✓ |

| Grade | Key light (from upper left) | Sky / far plane | Practicals |
| --- | --- | --- | --- |
| night | `P.navy` / `P.slate` | `P.black` to `P.ink` | on |
| morning | `P.steel` | `P.slate` to `P.steel` | the accent one only |
| day | `P.fog` | `P.steel` to `P.fog` | the accent one only |
| evening | `P.slate` | `P.ink`, with a 2-row `P.maroon`/`P.rust` horizon | on |

- Every daypart allows at least 4 scenes, so `recentScenes` (last 3) can always avoid a repeat.
- **The mark** (ref. 10) is a round object plus a small warm square at its top right. They align into the globe-and-bit, as on the WORLD NOW open's globe in `shots/opens/v2_world-now/sheet.png`, and the alignment holds **≥ 1.2 s**.
- **Light, measurable:**
  - Outside the wordmark, the mark, one practical light (≤ 64 px area) and 1 px rims, **at most 2% of pixels have L\* > 70**. From `palette.js`, L\* > 70 means white 100, cream 85.7, cyan 84.4, silver 81.3, yellow 77.0, skin 72.9 and green 72.3.
  - The practical light takes `THEME_ACCENT[next.theme]` (`cast.js`).
- **Night vs day:** for the same scene, mean L\* at night is at least 8 below day.
- **Figures:** adult, 6–7 heads tall, often silhouettes.

### 5.3 Camera and directing

**Ident exception to ART_DIRECTION §3** ("Must stay still: … the camera"):
- **Scope:** only the lead-in ident film may move, because the mark must be *found* from one position (ref. 10). The studio camera rule stands. Bumper, holding and sombre idents are locked off.
- **Allowed moves:** a lateral truck or vertical crane only, as pure translation of parallax planes. No zoom or dolly-in, since that would scale pixels, and no orbit.
- **One scalar drives every layer.**
  - `u(t)` is the mid layer's offset in px.
  - It integrates `v(t) = max(v_min, v_cruise · s(t))`, where `s` is a sine ramp up over 1.0 s and down over the last 1.2 s.
  - Constants: `v_cruise` = 8 px/s, `v_min` = 6.7 px/s (≤ 150 ms between steps).
  - At the alignment offset the camera stops dead.
- **Layer positions** are `x = floor(k · u)`:
  - far plane `k = 0` (static);
  - mid `k = 1`;
  - near `k = 2`;
  - optional foreground silhouettes `k = 4`.

  Every mid step coincides with a near and a foreground step, so steps never beat against each other.
- **Travel caps:** a 7–8.6 s move gives mid travel of about 55–68 px. Caps are mid ≤ 72 px, near ≤ 144 px and foreground ≤ 288 px. Use the foreground only for sparse silhouettes that pass through frame.
- **Drawing:** layers are baked into offscreen canvases when the item starts. They are drawn at integer x with `imageSmoothingEnabled = false`. No sub-pixel drawing.
- **Hold:** at most two ambient motions (rain, a page, or a light changing one palette step) at integer positions.

**Ads:**
- One move per shot (push, pull, turntable or slow track), or none.
- No zoom punches.
- At most one whip pan, athlete ads only.
- Turntables run at 15–25°/s, under 180° per shot.
- After an absurd line, at least 0.8 s of stillness.
- Gestures show full arcs (anticipation, action, settle), at most one per shot.

**Cards:** no camera.

### 5.4 Graphics

**Tokens:**
- Fields are `P.black` / `P.ink`.
- Type runs `P.white` > `P.silver` > `P.fog`. `P.steel` is never used for text: 3.3:1 on black.
- Rules are `P.red`, 1–2 px.
- **`P.yellow` is allowed in exactly three places:**
  - the logo's bit;
  - the NEWS IN 60 accent (`THEME_ACCENT.flash`), in its promo and countdown rule;
  - warm practical lights.
- `THEME_ACCENT` appears only in the promo, the countdown rule and the ident practical.

**Cards:**
- `P.white` on `P.black` (18.0:1).
- 5x7 type at 2x, left-aligned at x = 40, centred near y = 100. A card that does not fit drops to 1x.
- Cards cut, with no motion.
- **Hold:** 1.2 s + 0.25 s per word, clamped to 1.8–3.2 s. That is always above BBC's 0.3 s per word (ref. 15); for example, 8 words get 3.2 s against a 2.4 s minimum.
- The signature card shows the GLOBIT 24 wordmark, centred, for 1.5 s.
- No other colour appears on cards.

**Ident wordmark:** appears 0.4 s after the alignment as a two-step palette fade, `P.steel` then `P.white`, over 0.3 s. No slide, no scale.

**Promo** (only when `next.ready`):
- The next open's lock-up frame, drawn by the open template at its lock-up time.
- Label `UP NEXT` in micro `P.fog`.
- The programme `tagline` from `channel.json` in `P.silver`. It is static, so nothing story-specific is ever promoted.
- Presenter names exactly as in `channel.json`.
- No clock text.

**Countdown:** see §4.4. The digits are 2x `P.white` in the right third.

**End slate (ads):**
- Wordmark at 2x with +1 px tracking.
- Tagline at 1x.
- URL in micro `P.fog`.
- **Legal** in micro `P.fog` (6.4:1 on black, 4.9:1 on ink) or `P.silver` (11:1), up to 2 lines. It stays visible for at least max(3 s, 0.3 s × words), because the jokes live there.
- The slate holds ≥ 3.5 s, with one glint as the only motion.

**Motion:**
- In over 0.3 s, ease-out quint. Out over 0.2 s, or cut.
- Travel ≤ 8 px.
- Never `easeOutBack`.

**Stinger re-grade, network-wide** (`cards.js` `STINGER_LAYERS`, used by programme-to-break, the breaking card and the fallback):
- The slabs become `P.slate`, `P.ink` and `P.black`. The top slab gets a 1 px `P.red` leading edge.
- The yellow and red slabs go.
- The logo glide stays, clipped to the top slab, in full colour.
- This changes the stinger in every programme file. It also means fewer large saturated-red wipes (ART_DIRECTION cites Ofcom on saturated red).

### 5.5 Ads: one exact genre each

| Ad (file, task) | Genre copied | State at this revision (grep 2026-10-02) | Light and cuts | VO (pre-rendered; preset base, our proposal) | Score |
| --- | --- | --- | --- | --- | --- |
| BitFizz Reserve (`bitfizz.js`, ads-1) | luxury spirits film | rebuilt, in progress; no sunburst left | `P.black` void, amber backlit rims, fill fades in over 1.5 s for the reveal; 3–5 s shots | whispered en-GB, 110–120 wpm, ≤ 25 words; `bm_daniel` | `pad` + low `tri`, 60–72 BPM; 1–2 s silence before the brand |
| The Grand Buffer (`grandbuffer.js`, ads-2) | old-money hotel heritage film | adult re-art in progress | night navy, brass and marble, gold serif; 3–5 s | plummy en-GB, 110–120 wpm; `bm_lewis` | string-quartet bed ending unresolved (existing) |
| Serene lunar retreats (new, ads-3) | luxury travel film | new | wide lunar vistas, one warm interior practical; 4–6 s | soft, 115–125 wpm; `af_nicole` | sparse `pad` + `bell` |
| Cloudbrella (`cloudbrella.js`, ads-1) | tech keynote product reveal | to rebuild: cut `FWOMP!`, `BOING!`, `UPDATES!`/`POP-UPS!`/`COOKIES!`/`T&CS!`, the moody cloud character, and the legal clause "DO NOT OPEN INDOORS, YOUR WI-FI WILL GET SAD."; keep "NOT EFFECTIVE AGAINST ACTUAL RAIN." | `P.ink` stage, turntable product, specs in `P.fog`; 3–4 s on bar lines | calm superlatives, 140–150 wpm; `am_eric` | `pluck` ostinato, 100–110 BPM |
| SafeSector (`safesector.js`, ads-3) | sombre insurance | rebuilt: earnest insurance, the disk is a prop with no face | warm kitchen, `P.cream` window key, adults; 2–3 s | warm, 145–150 wpm; legal tag 180–200 wpm; `af_sarah` | soft piano (`pluck` + `softtri`), 88–96 BPM |
| ScreechNet (`screechnet.js`, ads-3) | nostalgic telecom brand film | rebuilt: 1997 dusk short, 2.39:1 | dusk, one CRT practical; 3–5 s | narrator, 130–140 wpm; `af_river` | modem handshake scored as a serenade |
| Corners (`corners.js`, ads-3) | artisan snack macro film | to rebuild: cut the blocky kid, `BOINK!`/`POP!`/`CRUNCH!`/`NEW!`, `burstArt()` and the NEW! starburst, and the "!" VO lines | macro tabletop, warm `P.orange` key; 2–4 s | 115–125 wpm; `am_adam` | sparse `bell` |
| Hi-Res Gym (`hiresgym.js`, ads-2) | sportswear athlete film | adult re-art pending: cut `ONE MORE REP!`, `LEVEL UP!` | `P.black`/`P.steel`/`P.white`, hard side key; 0.8–2 s cuts, then a 4 s held breath | ≤ 15 words, low voice; `am_liam` | `timpani` heartbeat, silence drop |

- Eight ads, eight distinct genres, so checklist item 9 is countable.
- "Public information film" is dropped: it had no brand, and filler draws from the normal pool.
- **Luxury transitions:** hard cuts, or a 0.5 s dip through `P.black`.
  - An ordered **Bayer 4x4** dissolve (16 threshold steps, 50 ms each) is allowed only between two shots with **no text, logo or face close-up** in either.
  - It is the one exception to ART_DIRECTION's dither rule, because it is a transition, not a material.

### 5.6 Music and sound (motif from `audio/themes.js`)

- **Ident film:**
  - the motif once on `pulse12` with echo, over a `pad` and `tri` pedal;
  - 84–92 BPM at night, 96–104 by day;
  - the last motif note lands on the alignment, and the hold loops `pad` + `pluck`.
- **Countdown** (our rule):
  - a quiet `bell` tick every second and `tri` eighths at 120 BPM;
  - a `pad` that resolves minor to major at 0:00;
  - the sombre version drops the ticks.
- **Bumper cards:** an 80–88 BPM loop of `tri` bass and swung `pluck`. In grave mode, none.
- **Promo:** the existing `promo` cue (4.2 s).
- **Separation** (ref. 14): 0.3 s of true silence and black at every ad boundary. Luxury and athlete ads may hold silence for more than 1 s before the brand.
- **Mix** (our rule, using the house voice target in `tools/voice/dsp.py`, `target_lufs` −16):
  - ads, bumpers and lead-ins are −16 ± 1 LUFS integrated;
  - beds sit ≥ 18 dB under the voice.
- **Banned:** boings, slide whistles, cartoon pops, laugh tracks and bouncy pentatonic jingles.

### 5.7 Do and don't

**Do:**
- Copy the genre exactly.
- Light with one source plus an edge light, and keep real darkness.
- Put the jokes in copy and small print, then hold still.
- Use adult proportions and seeded variety.
- Keep the good premises and legal lines ("NOT EFFECTIVE AGAINST ACTUAL RAIN.").

**Don't** (childish or cheap; current offenders found by grep on 2026-10-02):
- Sunbursts: `corners.js` `burstArt()` and the NEW! starburst. `kit.js` still exports `sunburst()`, and no ad may call it.
- Objects with faces: Cloudbrella's cloud character with moods. SafeSector's old Flop is already gone.
- Onomatopoeia: FWOMP!, BOING! (cloudbrella.js), BOINK!, POP!, CRUNCH! (corners.js).
- Exclamation captions: UPDATES!, NEW!, ONE MORE REP!, LEVEL UP!
- Anthropomorphic legal gags: "YOUR WI-FI WILL GET SAD".
- Child protagonists: the Corners kid.
- Also: blush cheeks, full-frame saturated cyan or yellow, overshoot easing, stacked puns, a laughing voice-over.

### 5.8 Performance (BRIEF budget: 60 fps; no per-frame allocation)

- **Bake once per item:**
  - ident layers into offscreen canvases, from a pool sized at module init and reused across items;
  - the daypart remap;
  - card text into cached canvases;
  - countdown digits from cached glyphs.
- **Per frame:** at most 4 layer `drawImage` calls, plus ambient particles from a preallocated `Float32Array`.
- **Never per frame:**
  - new canvases, gradients or `ImageData`;
  - `Intl` (use `zoneTime`'s per-minute memo);
  - `JSON.stringify`.

## 6. Acceptance checklist

The tools named here exist except the planned lab page `public/lab/breaks.html`. That page will expose:
- `window.__lab.render(t, { item, element, history, hour })`;
- `window.__audio.render(opts)`.

1. **Faces, onomatopoeia, "!".**
   - **Grep:** every string literal drawn or spoken in `public/js/ads/*.js` (except `kit.js` comments), the evergreen card file and the continuity bank text has no `!`.
   - It also has no whole-word token from {BONK, BOINK, BOING, FWOMP, PSSHT, POP, POW, ZAP, BAM, WHOOSH, CRUNCH, SPLAT, KAPOW, WOW, YAY, WHEE, OOPS, DING}.
   - **Look:** on 3 stills per ad and 10 ident renders, no object has eyes or a mouth.
2. **No rays; little saturation.**
   - No call to `sunburst(` or `burstArt` outside `kit.js`.
   - "Saturated" means pixels whose nearest palette entry is red, darkRed, rust, orange, yellow, green, cyan, blue, pink or magenta.
   - Saturated pixels are ≤ 15% of ad frames outside end slates, ≤ 10% of ident and countdown frames (the WORLD NOW globe plate included), and 0% of cards.
3. **Ident motion.** Rendered at 60 fps in the lab:
   - every layer's per-frame Δx is in {0, 1} px;
   - no reversals;
   - while moving, mid steps are ≤ 150 ms apart and near steps ≤ 75 ms;
   - every mid-step frame is also a near-step frame;
   - the last step lands on the alignment;
   - the mark is aligned ≥ 1.2 s;
   - at most 2 things move in the hold;
   - bumper, holding and sombre idents have Δx = 0.
4. **Variety and dayparts.**
   - 20 seeded lead-ins per daypart (with history) show ≥ 4 scenes and no repeat within 3.
   - For each scene, night mean L\* ≤ day mean L\* − 8.
   - Pixels with L\* > 70 outside the allowed areas are ≤ 2%.
5. **Cards** (`node --test` over the validator and evergreen file):
   - every rule in §5.1;
   - `P.white` on `P.black` only;
   - each card holds 1.8–3.2 s;
   - `{time}` is substituted when the card appears.
6. **Voice pace** (offline, from the word-timing JSON):
   - each continuity line is 150–160 ± 8 wpm;
   - each ad script, legal tag excluded, is within ± 8 wpm of its §5.5 target;
   - luxury ads are ≤ 125 wpm.
7. **Separation.** In an offline render and frame capture of a full main break:
   - every ad boundary has 0.2–0.4 s of black and audio below −60 dBFS;
   - no music, VO or stinger crosses an ad boundary;
   - the break contains 0 stingers after element 1.
8. **Loudness.**
   - `node tools/render-audio.mjs --url …/lab/breaks.html --opts '{"ad":"<id>"}'` (and `{"leadin":"<programId>"}`, `{"bumper":…}`) reports −16 ± 1 LUFS integrated, measured by ffmpeg ebur128.
   - Bed-only and voice-only stem renders differ by ≥ 18 dB in integrated loudness.
   - VO files themselves are checked with `tools/voice/loudness.py`.
9. **Genre, blind.**
   - Two raters with no access to code or docs each see 3 stills per ad (at 25%, 50% and 85% of its duration) and the list of 8 genres.
   - Each rater labels each still.
   - An ad passes with ≥ 5 of 6 correct labels.
10. **End slates.**
    - They hold ≥ 3.5 s with a static wordmark.
    - Legal is `P.fog` or `P.silver` and visible ≥ max(3 s, 0.3 s × words).
11. **Promo.**
    - It appears only in main breaks with `next.ready`.
    - Its accent is `THEME_ACCENT[next.theme]`, and its names match `channel.json`.
    - It shows no clock text.
    - With `!next.ready`, a holding slide plays with no programme name.
12. **Transitions.**
    - Exactly 1 stinger at each programme-to-break boundary.
    - 0 stingers between lead-in and programme, except in the fallback.
    - `STINGER_LAYERS` has no `P.yellow` or `P.red` slab.
    - Lead-in to programme is a hard cut on the downbeat.
    - Countdown: the frame at t = 10.4 s reads `0:00`, and the frame at t = 10.5 s is the programme's first frame.
13. **Wit gate.** With fixture episodes:
    - a grave `prev` (any of the §4.6 conditions) gives the sombre bumper, `wit:false` cards only and the sombre lead-in line;
    - the producer validator rejects `wit:true` when the episode's own lead is grave.
14. **Filler.** A seeded run of main break, 6 fillers, then the replay gives:
    - fillers with exactly 1 ad each;
    - no promo, stinger, bumper cards or voice in filler;
    - holding slides on fillers 3–6;
    - a replay that opens with its lead-in and replay line.
15. **Cold start.**
    - A client whose first item is a filler gets the short ident, then the ad.
    - If the first item is a main break, there is no stinger.
    - The first episode gets its lead-in.
16. **No invented times.** No break, promo or lead-in graphic contains `HH:MM` text. The studio clock overlay is the only clock.
17. **Determinism.** The same `(item.id, history, hour)` gives identical choices, and `pickAds` receives the seeded `rand`.
18. **Performance.**
    - A 60 s lab run in headless Chromium has no frame over 20 ms after warm-up.
    - A grep of the break modules' per-frame draw functions finds no `createElement`, `OffscreenCanvas`, `createLinearGradient`, `getImageData`, `new ImageData`, `Intl.` or `JSON.stringify`.

## 7. Implementation notes (who touches what)

- **New client module** `public/js/breaks/`:
  - `continuity.js`: evergreen sets, the grave gate and pickers;
  - `ident.js`: scenes, grades and parallax;
  - `leadin.js`;
  - draw functions for cards, holding slide and countdown.
- **`director.js`** (surgical):
  - rewrite `playBreak` per §4.2–4.3;
  - start `playEpisode` with `await this.leadIn(episode)` in place of the opening stinger, falling back to the stinger on failure;
  - add the history fields of §4.7.
- **Server and voice:** the requests in §4.8.
- **Programme files:** the edits in §3.3.

## 8. Review log for revision 2

| Finding | Where fixed |
| --- | --- |
| Citations not spot-checked; quotes never read | §0 method. Every §2 claim was re-read in a GitHub copy, or removed. Corrected: 87 s countdown, ten-second Circle films. |
| 87 s arithmetic; ScreenWeaver wpm | §2 ref. 3 (the countdown is 87 s); ad wpm is *our rule*; continuity pace references the sibling files' source. |
| :00 countdown with no data source | §4.4: a client-timed, programme-labelled countdown inside the lead-in. §2 refs. 4–5. London time source in §4.7. Checklist 12 and 16. |
| Filler and elastic mechanism ignored | §4.1, §4.3, §4.5. Checklist 14 and 15. |
| Transitions contradict sibling files | §3.2 single rule; §3.3 line-by-line edits; §3.1 end card vs end slate. |
| Ident camera vs ART_DIRECTION | §5.3: exception, scalar method, caps. Checklist 3. |
| Number and token inconsistencies | 1.2 s everywhere; L\* rule restated as measurable (§5.2); `P.yellow` scope (§5.4); cards have no `P.fog` tag; Bayer-only dissolve (§5.5). |
| Cards and voice not wired to the pipeline | Cards are silent; `bf_alice` preset; producer-side `continuity` field plus station copy (§4.8); `{time}` token; schema and validator (§5.1). |
| Wit gate | §4.6 definition; `wit` flag in the schema; the NEWS IN 60 runtime card removed. |
| Seeding and variety | §4.7 (mulberry32 over fnv1a of the id, history lists); scene-by-daypart table (§5.2). |
| Ad table grounding, voices, timings | §5.5 states each ad's real state and task, adds Serene, drops the PIF; VO pre-rendered with word timings (§4.8, §5.1). |
| Factual slip about the ads | §5.7 re-checked by grep: corners.js `burstArt()`; WI-FI gag named as cut; BitFizz rebuilt. |
| Legal contrast | `P.fog` / `P.silver` only (§5.4); checklist 10. |
| Stinger scope | §5.4: network-wide re-grade, logo glide kept, programme files affected. |
| Checklist verifiability | §6: tools named; palette-defined saturation; per-set wpm with tolerance; blind protocol; filler, cold-start, countdown and performance checks; presenter proportions left to the studio file (ad figures covered in §5.2 and §5.7). |
| Thin newscast coverage | §2 A–D: station ID, BBC, CNN, BBC News, Channel 4, ITV endcaps, AVMSD, BBC subtitles. Unsourced rules are marked *our rule*. |
