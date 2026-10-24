# Thumbnails, covers, titles and captions

What makes a viewer choose a GLOBIT 24 clip or programme, and nothing it does not deliver. The owner's brief (23 Oct):
the thumbnails, titles and the rest "need huge improvements to attract people". This page is the audit, the research,
the system that replaced what we had, and how it is checked. The critique rounds are in
[`../roadmap/critique/thumbnails-titles.md`](../roadmap/critique/thumbnails-titles.md).

Code: `server/publish/packaging.js` (the words, their checks, the deterministic writer, the AI writer's prompt),
`public/js/clip/cover.js` (the pictures), `public/lab/thumb.html` (the page that draws them),
`tools/publish/packager.mjs` (frames, covers, the chain), `tools/publish/factory.mjs` and `tools/publish/upload.mjs`
(wired in), `tools/publish/package.mjs` (package again a folder the factory made), `server/publish/clipmeta.js` (the
texts each network gets), `server/publish/manual.js` and `server/publish/approval.js` (the approval page and the
publish checks). Tests: `test/packaging.test.js`.

## 1. The audit (23 Oct, before)

Nine real programmes, one aired episode each (WORLD NOW, TECH BYTES, COSMOS DESK, MONEY MINUTE and NEWS IN 60 of 16–17
Oct with the cleared pictures the pictures desk gave their stories; WORLD WEATHER, SEVEN DAYS, FULL TIME and PAY
ATTENTION of 17 Oct), cut by the factory as it stood at `d0a9068`: 23 vertical and 23 horizontal clips of eight
programmes (NEWS IN 60 gives no clips: the whole programme is the clip) and the nine programmes' own thumbnails. The before/after sheets are in the owner's folder (`para-el-dueno/miniaturas-titulos/`).

What a viewer got:

| | Today (d0a9068) | Verdict |
|---|---|---|
| Clip cover (Shorts, TikTok, Reels) | The clip's frame at 1.0 s: the hook in 2x type in the title band, the stage, half a caption, the bug | Unreadable at feed size (the words are 10 px tall on a 1080 px cover); no story picture; the words often the outlet's headline in capitals; looks like a paused video, not a choice |
| Programme thumbnail (YouTube) | A frame dimmed by a dither, the programme's tag, the lead headline in up to three lines of 2x–3x type | The best of what we had, but 9–11 words of small type, the headline sometimes the outlet's, one variant only |
| YouTube title | `<hook> \| <PROGRAMME> \| GLOBIT 24`, or the outlet's headline in quotation marks (`BBC Technology: “GTA 6 - all you need to know…” \| GLOBIT 24`), or a label (`France \| WORLD NOW \| GLOBIT 24`, `Story of the week \| SEVEN DAYS \| GLOBIT 24`) | 20–35 of 70 visible characters spent on branding; citations as titles make the clip look like a repost; labels say nothing |
| Description, first two lines | The AI disclosure, then the programme's boilerplate ("WORLD NOW: the stories shaping our world, presented by…") | The two lines YouTube shows say nothing about the story |
| TikTok / Instagram caption, first line | The whole disclosure sentence (107 characters) | Everything the feed shows before "more" is the disclosure: no hook at all |
| Hashtags | `#tech #technology #news #pixelart`, `#news` | Generic, the same on every clip of a programme, nothing about the story |
| Variants | One title, one picture | Nothing for YouTube's Test & Compare |

Scores (the two critics of the critique rounds, before any change): packaging **3.1 / 10**, standards **6.4 / 10**
(honest and disclosed, but outlet headlines reused as titles and captions, a grave story's cover chosen by chance).
After three rounds the critics gave **9.7** and **9.8**; the owner's verdict on the pictures, 23 Oct, was "no gran
cosa", and it overrides them (docs/roadmap/critique/thumbnails-titles.md, round 4): the words, the checks and the
pipeline stand, the covers' and thumbnails' look is being redesigned separately.

## 2. What works, briefly (sources)

- **YouTube thumbnails**: 16:9, at least 640 px wide (1280×720 recommended long ago; 3840×2160 now), JPG or PNG, 2 MB
  on mobile uploads ([YouTube Help: Add video thumbnails](https://support.google.com/youtube/answer/72431)). Shorts
  thumbnails are 9:16, uploaded in YouTube Studio on a computer, from a verified account (same page).
- **Test & Compare**: up to three titles and/or thumbnails; long-form videos only (not Shorts, not made for kids, not
  private); desktop YouTube Studio; the winner is the one with the most **watch time**, not clicks
  ([YouTube Help: Test & compare thumbnails and titles](https://support.google.com/youtube/answer/13861714)). So a
  variant that wins clicks and loses viewers loses: honest packaging is also the one that wins.
- **Misleading metadata**: titles, thumbnails and descriptions that trick users into watching something other than what
  they promise are "malicious clickbait" under YouTube's spam and deceptive practices policy, and thumbnails are
  covered ([YouTube Help: Spam, deceptive practices & scams](https://support.google.com/youtube/answer/2801973)).
- **Readability at small size**: the thumbnail is seen at 160–360 px wide; three or four big words, one focal subject,
  a face where there is one, high contrast and the same brand frame every time are the common practice of news
  channels and the platforms' own creator advice; titles are cut at about 60–70 characters in lists and search, so the
  words that matter go first ([YouTube creator guidance as republished, techzim](https://techzim.co.zw/2018/09/content-creators-youtube-titles-with-all-caps-are-a-very-bad-idea); [TunePocket, title practice](https://www.tunepocket.com/?p=41855)). Third-party practice, not policy.
- **Reels covers and the grid**: upload at 1080×1920; Instagram's profile grid shows a Reel at 3:4 (1080×1440, since
  19 Jan 2025), cutting 240 px top and bottom; only a centred ~1080×1350 (4:5) block is visible in every crop
  ([Hopper HQ, Reel size and safe zones](https://www.hopperhq.com/blog/instagram-reel-size/); [Hopper HQ, the vertical grid](https://help.hopperhq.com/en/articles/10907941-instagram-s-vertical-grid)). Third-party guidance.
- **Hashtags**: Instagram has moved to at most five hashtags a post, saying fewer, targeted tags work better than many
  generic ones ([Social Media Today](https://www.socialmediatoday.com/news/instagram-implements-new-limits-on-hashtag-use/808309/)).
  TikTok publishes no number; industry guidance is a few relevant tags, with the caption's own words doing the search
  work ([Sked Social](https://skedsocial.com/blog/social-search-how-to-optimize-for-discoverability-on-tiktok-and-instagram-2025)). Third-party guidance.
- **Captions' first line**: TikTok and Instagram show the first line or two before "more"; that line is the hook.
  YouTube shows a description's first lines before "more".

## 3. The system

### 3.1 Three variants per clip and per programme

Every clip and every programme gets three titles and three pictures, paired A/B/C:

The look (redesigned 24 Oct after the owner judged the first build "no gran cosa": a slide, not a thumbnail): every
variant is a full frame. The picture fills it, the words stand on it in heavy type (the bold face inside a whole-pixel
black outline, with a hard shadow), the line that carries the point sits on a plate in the programme's colour, and the
presenter stands in front of the picture as a cut-out, ringed in black and the programme's colour.

| Variant | Picture | Words on it |
|---|---|---|
| **A · the photo** | The story's cleared picture full-bleed (the pictures desk's, `PICTURE_RIGHTS=cleared`, pixelated exactly as on air by `pixelate.js`, shown at 1x, its credit top right), shaded toward the words by an ordered dither of the set's black | The first thumbnail text, at most two lines along the bottom (a picture's subject, a face, stays clear above) |
| **B · the presenter** | The picture full-bleed and pushed back (shaded), the programme's presenter as a cut-out on the right third (`clip/sprite.js`: the cast's own drawing by the on-air rig, alone on a transparent frame; the expression the segment's own, serious on grave news). On a cover: the words at the top of the middle, the presenter big below them | The second, on the left, with 200 px at least (the figure moves right for them: the edge may cut a shoulder, never the face) |
| **C · the words** | The programme's colour (a dithered backdrop with a burst), the words giant, the story's picture as a panel down the right third (a framed print on a cover), else the presenter's cut-out | The third |

A variant with nothing of its own shows what the clip has: A without a cleared picture shows the clip's board or map
(never the open's montage or a tease, whose frames carry the aired headlines), B without the presenter on screen shows
the programme's own card (its colour and name: never A's picture twice). A clip of several stories (the headlines,
"4 stories in 45 seconds") never shows one story's picture under words about another: only its own frames. A tall
picture keeps its whole height in a wide box (the on-air portrait treatment), so a face is never cut. The pictures are
never generated, never drawn, never altered beyond the channel's own pixelation and a crop; no real
person's face is put in a situation or an expression it did not have (no arrows, no speech bubbles, no cut-out of a real
person). Only the channel's own presenters are cut out: the owner's approved characters, drawn by the same rig and
renderer as on air with one of their six expressions; nothing new is drawn. A presenter the cast cannot draw alone
falls back to the clip's own frame of them.

On YouTube the owner pastes title A and uploads cover A; for a **whole programme** he can put all three titles and all
three thumbnails into **Test & Compare**. A **Short** has no Test & Compare: the other two are his other choices (its
cover is uploaded in YouTube Studio on a computer). TikTok and Instagram take one cover (Instagram from the camera roll);
cover A unless he prefers another.

### 3.2 Per programme: one template, recognisable at a glance

The brand frame is the same everywhere: the channel's bug and the programme's own tag top left on a black plate, a 3 px
bar in the programme's colour along the bottom (clear of YouTube's time stamp), the words in the channel's 5x7 face
made bold and heavy (outline and shadow), white, with the line that carries the point on a plate in the programme's
colour (yellow where the colour is too dark for black type: PAY ATTENTION's purple, WORLD NOW's red, WORLD WEATHER's
blue), the presenter's cut-out ringed in the same colour.

| Programme | Accent | Presenter on B | Typical A | Notes |
|---|---|---|---|---|
| WORLD NOW | red (words' accent yellow) | Paco Pixel, Lola Byte | the lead story's picture | grave most days: see §3.5 |
| TECH BYTES | cyan | Max Circuit, Ada Volt | the company's or product's picture | |
| COSMOS DESK | magenta | Dr Nova Reyes, UNIT-8 | the mission, the place | |
| MONEY MINUTE | green | Penny Sterling | the company, the building | a figure makes a strong C |
| NEWS IN 60 | yellow | Sam Night | the first story's picture | |
| WORLD WEATHER | blue | Sam Night at the map wall | the weather board or map (no photos) | |
| SEVEN DAYS | coral | Paco Pixel, Lola Byte | the story of the week's picture | |
| FULL TIME | orange | Kai Sprite, Rosa Rally | the result board | |
| PAY ATTENTION | purple | the players (UNIT-8, Penny…) | the question board (never its answer) | "PLAY ALONG", "BEAT UNIT-8?" |

### 3.3 Per platform: sizes and safe areas

All pictures are drawn on the channel's own grid and scaled by a whole number (5x, nearest neighbour), so they are
exactly as crisp as the channel:

| Where | File | Drawn at | Words kept inside |
|---|---|---|---|
| YouTube Shorts thumbnail, TikTok cover, Reels cover | 1080×1920 PNG | 216×384 | the 4:5 middle, y 57–327 of 384 (every feed's crop, Instagram's 3:4 grid included) |
| YouTube thumbnail (whole programme; a horizontal clip's) | 1920×1080 PNG (JPG if over 2 MB) | 384×216 | clear of the time stamp YouTube lays over the bottom right |

A horizontal clip's thumbnails take their frames from the vertical master's stage (the horizontal picture carries the
captions and the strap); a whole programme's from its clean plate (`?clip=clean`).

### 3.4 The words

- **Titles** (YouTube; the first is the one pasted): 15–70 characters (YouTube allows 100, lists show ~70), the news
  first, sentence case, in the channel's own words. No brand tail on a Short (the channel's name is under it anyway); a
  programme's upload title keeps its programme and date. Never the outlet's headline, cited or not: it goes in the
  description, as a citation beside its link. A question only where the clip answers it, never on grave news.
- **Thumbnail text**: one to four words, at most 22 characters and no word over ten letters (so it sets at 4x–5x),
  capitals: what the title does not say (a figure, the place, the stakes, "PLAY ALONG"), never the title again. A whole
  programme's thumbnail A stands on its lead story's picture, so its words must be about the lead alone (checked
  against the lead's own facts).
- **YouTube description**: line 1 the AI disclosure (as before); **line 2 the clip's lead** (one sentence, what it is
  about); then the programme line, the citation and the source links, the credits, who answers for the channel.
- **TikTok and Instagram caption**: line 1 **`AI-produced news: <hook>`**, the hook a fact first in at most 90
  characters; right under it the disclosure's whole sentence (`Presenters are AI characters with synthetic voices;
  every fact is from a credited source.`); then the lead and the source. One emoji at the end of the first line on a
  light clip of a light programme; never on grave news. (Why the disclosure moved: §4.)
- **Hashtags**: at most four, relevant: the story's subject and place as the facts name them, the programme's own
  (`#technews`, `#sciencenews`, `#newsquiz`…), `#pixelart` for the brand on light clips. On grave news: the place and
  the programme's only, never a person, never `#pixelart`.

### 3.5 Grave news

`packFacts` marks a clip grave when the moment is (moments.js) or its words are (`facts.js isGrave`). Then: no
question, no dramatic word ("horror", "tragic", "heartbreaking", "chaos"…), no emoji, no `#pixelart`; the words white
(no plate, no colour) and the bar and the presenter's ring in the set's steel; the presenter's cut-out is serious, never
a reaction picked for effect; the picture is shaded deeper. Phase 1 publishes nothing grave anyway; the packaging is
ready for when it does.

### 3.6 Who writes them, and the checks

The **AI writer** is the channel's: the provider chain (`server/providers`, the configured AI provider), stage
`package`, one call per clip moment (both formats share it). Its prompt (`packagePrompt`) gives the facts as the clip
aired them (the channel's aired words and headline, the label, the outlet's summary for facts, the outlet's headline
marked "do not reuse"), the rules above and the JSON to return. The offline mock never writes packaging (it copies).

Every field is checked before it is used, whoever wrote it (`checkTitle`, `checkThumb`, `checkHook`, `checkPackage`):

- lengths (above); at most three variants; at most four hashtags;
- **bait** refused (`BAIT`: shocking, you won't believe, insane, epic, breaking, urgent, secret…), no `!`, no emoji in
  titles, no ALL CAPS shouting outside a thumbnail's own text (acronyms are fine), no **LIVE** where there is no live
  stream (`CHANNEL_LIVE_URL`);
- **supported**: every number (`numbersGrounded`, the counted thing included), every name, every ordinal ("a fourth
  case") and every grave word ("dead", "attack") must be in the clip's aired words or its sources; at most one word in
  four may be the channel's own framing;
- **the verbatim rule** (`compliance/verbatim.js`: no run over 12 words, at most 20 % in runs of 6) and, closer for
  packaging, never the outlet's headline nor five of its words in a row (`nearCopy`);
- no promise of an explanation ("why", "how", "explained", "all you need to know") on a clip under 30 s whose own
  words give no reason (YouTube's malicious-clickbait example is metadata promising what the video does not deliver);
- grave news (§3.5).

What fails is dropped and the **deterministic writer** (`fallbackPackage`) fills the place: the channel's aired
headline when it passes the verbatim rule, else an aired sentence of its own (whole, never cut mid-clause), else the
clip's own hook ("£15m investment"), else the story's label ("Wildfire in California, USA: the facts"); a quiz's
question as the board asks it, or "How many? A question about TSMC from this week's news", "Can you beat UNIT-8 and
Penny?"; the weather's own boards. Without an AI writer the whole package is the deterministic writer's, and the
approval page says so.

### 3.7 Where it runs, and the publish checks

- **The factory** (`tools/publish/factory.mjs`): after the clips are cut, the package (once per moment), the three
  covers or thumbnails (`renderCovers`, the page `lab/thumb.html` drawing `clip/cover.js`), the texts per network
  (`clipTexts` with the package). The queue item carries `package` (titles, thumbs, hook, lead, hashtags, writer and the
  facts it was written from) and `media.thumbs` (the three pictures; `media.thumb` is A).
- **The programme uploads** (`tools/publish/upload.mjs`): the same for a whole programme, three 16:9 thumbnails for Test
  & Compare, the upload title first (`episodeFacts`).
- **Package again** (`tools/publish/package.mjs`): a folder the factory made (with its masters kept), the words and
  pictures made again; nothing recorded, queued or published.
- **The approval page**: each card shows the three covers and the three titles ("Usar" puts one in the title box), who
  wrote them; once prepared, "Portada A/B/C" downloads (each signed with its C2PA manifest) and a Copy button for each
  title (Test & Compare for a programme, other choices for a Short).
- **The publish checks** (`prepareManual`): the package is checked again as it will go out (`packageFaults`), with the
  stories' sources as they are now; a title the owner edited himself is held only for what no title may do (bait,
  shouting, copying, length), its facts are his call. A fault holds the item with the rule `packaging`.

## 4. The AI disclosure on a caption (proposed and built: compliance.md §2.10)

Before: the caption's first line was the disclosure's whole sentence. After: the first line opens with the
disclosure's words and the hook follows them (`AI-produced news: Kenya reports a third Ebola case.`), and the whole
sentence stands right under it. The words a viewer reads first are still "AI-produced news"; the platform's own AI
label (required) and the end card are unchanged. The gate was tightened, not loosened: the first line must now *open*
with the disclosure (before, it only had to contain it), and a caption in the new form must carry the sentence in its
next lines (`checkClip`, `text-disclosure-missing`). The reasoning is in `compliance.md` §2.10.

## 5. The owner's part

In Spanish, in [`beta.md`](beta.md) ("Portadas y títulos"). In short: look at the three covers, choose (or keep A),
paste the title chosen; for a whole programme on YouTube, put all three into Test & Compare.
