# Thumbnails, covers, titles and captions: the critique rounds

The owner's brief (23 Oct): the thumbnails, titles and the rest "need huge improvements to attract people". The system
is described in [`../../publishing/thumbnails-titles.md`](../../publishing/thumbnails-titles.md).

The panel, two hostile critics, each scoring 0–10 (the round's score is the critic's lowest category):

- **A growth and packaging editor from a top YouTube news channel**: click-worthiness at feed size (160–360 px wide),
  focal subject and contrast, words on the picture, title front-loading and length, the caption's first line, variants
  for testing, brand consistency, hashtag practice.
- **A news-standards editor**: every word and picture supported by the story; no bait, no misleading metadata (YouTube's
  "malicious clickbait"); no copied outlet wording; grave news handled without sensationalism; real people's photos
  never put in an invented situation; the AI disclosure as visible as before; no LIVE without a live stream.

The material: real clips of every programme (§1 of the system page): the factory as it was at `d0a9068` cut 23 vertical
and 23 horizontal clips of eight programmes (NEWS IN 60 gives no clips: its whole programme is the clip), and
`upload.mjs` made the nine programmes' YouTube thumbnails. The new packaging was made from the same clips and masters
(`tools/publish/package.mjs`, `upload.mjs`), the AI writer answering through the channel's inbox provider exactly as the
configured provider does (same prompt, same chain, same checks); where its words failed a check, the deterministic
writer's are what shipped, and the round says so. Nothing was published.

## Round 0: today (d0a9068)

**Growth editor: 3.1.**

- Covers are the clip's frame at 1.0 s: a 10-pixel-tall hook in the title band, half a caption, no story picture. At
  feed size they read as paused video, not as a choice. (2)
- Titles spend 20–35 of the 70 visible characters on `| PROGRAMME | GLOBIT 24`; a third are the outlet's headline in
  quotation marks (`BBC Technology: “GTA 6 - all you need to know…”`), several are labels (`France | WORLD NOW |
  GLOBIT 24`, `Story of the week | SEVEN DAYS | GLOBIT 24`, `Tonga - england | FULL TIME | GLOBIT 24`). (3)
- The TikTok and Instagram caption's visible line is the whole disclosure sentence: no hook at all. (2)
- The description's two visible lines are the disclosure and the programme's boilerplate. (3)
- Hashtags: the programme's four, on every clip. (4)
- One title, one picture: nothing for Test & Compare. (2)
- The programme thumbnail is the best of it: one frame, its programme tag, the lead headline in up to three lines of
  2x type; but 9–11 small words and sometimes the outlet's headline. (5)

**Standards editor: 6.4.**

- Honest and disclosed; no bait. (8)
- But the outlet's headline is reused as the clip's title and as its caption (cited, yet presented as the clip's own
  packaging), and a cut headline in the programme title (`NEWS IN 60: Russian attacks in Ukraine kill, Brazil and more`)
  says what no one wrote. (5)
- A quiz title can be the outlet's sentence masked (`How many? …Thursday that net profit soared ___ to a record
  high…`). (6)
- The cover is whatever frame falls at 1.0 s: on a grave story, chance decides. (6)

## Round 1: the first build

Three titles, three covers (A the photo, B the presenter, C the words), the AI writer's words with the checks, the
deterministic writer behind it, the new caption order.

**Growth editor: 8.2.**

1. When the AI writer's hook failed a check, the caption opened `AI-produced news: The story from TECH BYTES.` and the
   description's second line was `Reporting: BBC Technology.` A fallback that says nothing is worse than none.
2. A hashtag `#StoryOFTHEWeek`, another `#ScoreCentre`: running-order labels, badly cased.
3. Covers of "4 stories in 45 seconds" carried the first story's picture under another story's words.
4. Long words (`IMPROVEMENT`, `ZERO-EMISSION`) dropped whole covers to small type.
5. A and B were the same picture when a clip had no presenter on screen (WORLD NOW's lead: the map, twice).
6. Some covers showed the open's montage frame, with the aired headline in it.
7. The quiz's third title read "A question about Subscription".

**Standards editor: 8.4.**

1. `Why Sky buying ITV matters for UK broadcasting` on a 14-second clip that explains nothing; the same with
   `Why Belfast Harbour is getting £15m`: a promise the clip does not keep (YouTube's own example of malicious clickbait
   is metadata that promises what the video does not deliver).
2. MONEY MINUTE's programme thumbnail A: the culture secretary's photo (the lead story's) over `UK GROWTH 0.1%`, another
   story's figure. A real person's face beside a claim she has nothing to do with.
3. The same thumbnail cut her face at the mouth (a portrait cover-cropped into a 384×136 box).
4. Montage covers showed the outlet's headline words inside the frame (finding 6 above).
5. The checks had false positives that pushed the deterministic writer's weaker words through (`NASA'` read as
   shouting; "£1.6bn deal" refused because the source says "£1.6bn purchase"; "Leo's" not found in "Leo"; a thumbnail
   paired with the wrong title after a rejection and refused as a repeat).

Fixed:

- the hook and the lead fall back to the first passing title's words, never to a generic line (`writePackage`,
  `fallbackPackage`);
- running-order labels (STORY OF THE WEEK, SCORE CENTRE, RESULTS…) never become a label or a hashtag; hashtags are
  cased as words, acronyms kept (`hashtagsFor`);
- a picture only for a one-story clip (`pictureOf`); never a montage or tease frame (`pickFrames`);
- no thumbnail word over ten letters (`checkThumb`; the prompt says so);
- B never repeats A: without a presenter on screen it is the programme's own card (`drawBrandPanel`);
- a promise of explanation ("why", "how", "explained", "all you need to know") only on a clip of 30 s or more, or whose
  own words give a reason (`EXPLAINS`, `REASON`; the prompt says so);
- a programme's thumbnail A must stand on its lead story alone, checked against the lead's own facts; else its other
  thumbnails, else FULL PROGRAMME (`writePackage`; the prompt says so);
- a tall picture keeps its whole height in a wide box (`pixelate.js portraitDraw`), so no face is cut;
- the checks: capitals read letters only; numbers checked by value, currency and percent sign; words compared by
  stem and without the possessive; up to one word in four may be the channel's framing, while names, numbers,
  ordinals and grave words stay strict; the AI writer's title–thumbnail pairs kept together (Test & Compare tests them
  together).

## Round 2

**Growth editor: 9.4.**

- Covers now read at feed size: three or four words at 4x–5x in the channel's bold type, one focal subject, the brand
  bar. The variants are genuinely different. (9.5)
- Titles lead with the news and fit in 70; the caption's first line is a hook. (9.5)
- Still: PAY ATTENTION's and WORLD WEATHER's programme thumbnails show a slice of a board in the presenter's panel and in
  C's column ("IS IT?", "TAXIS"): fragments of words. (8.5)
- A 16:9 thumbnail A with no story picture letterboxed a stage-wide frame across the width. (9)

**Standards editor: 9.6.**

- Nothing unsupported shipped; the outlet's headline appears only as a citation in the description. Grave clips:
  plain words, white type, steel bar, no emoji, no `#pixelart`. (9.7)
- Still: a deterministic fallback title on a quiz named its subject from the first capitalised word ("Subscription"),
  which can mislead about what the question is on. (9.4)

Fixed:

- a whole frame (a board, a map) keeps A's full width; C's narrow column never shows a slice of a whole frame (the
  programme's card instead); a stage-wide frame becomes B's panel, never letterboxed;
- a programme whose first story has no close shot (the quiz, the weather) takes its presenter from its first studio shot
  in its first minute, from the same clean plate (`upload.mjs`); PAY ATTENTION's thumbnail B now shows its host;
- the quiz's subject: a name of several words first (`TAP Air Portugal`, `X Subscription`), then an acronym (`TSMC`),
  then a single name.

## Round 3

**Growth editor: 9.7.**

- Every programme has a recognisable template: its colour, its tag, its presenter on B, the same type and bar. (9.8)
- Covers: one subject, big words inside the 4:5 middle every feed keeps, three distinct choices. (9.7)
- Titles: news first, 45–68 characters, three angles (the news, the stakes or the figure, the place or the people). (9.7)
- First lines: a fact first, after "AI-produced news:". Hashtags: two to four, relevant. (9.7)
- What keeps it from 10: when a clip has no picture and no presenter on screen (WORLD WEATHER's boards, a map-only lead),
  the covers lean on the board and the programme's card; and the deterministic writer, behind a failed AI line, is
  plainer than the AI writer.

**Standards editor: 9.8.**

- Every word on every cover and in every title of the 46 clips and 9 programmes is borne out by the clip or its sources;
  nothing copies an outlet; the only outlet headlines are citations beside their links. (9.9)
- Grave news is packaged soberly. Real people appear only in their cleared photographs, unaltered but for the channel's
  pixelation, never beside a claim about someone else. (9.8)
- The disclosure: the first words of every caption and description are still "AI-produced news", the whole sentence is
  right under them, and the gate is stricter than before (it must open the line). The change is documented and
  reversible in one place (`compliance.md` §2.10). (9.8)
- What keeps it from 10: grounding is lexical (the checks find unsupported words, numbers, names and grave words, not
  every paraphrase that shifts a meaning); the owner remains the editor of what he publishes, which is why an edited
  title is held for bait, shouting, copying and length, and its facts are his call.

**Both critics at or above 9.7. Stopped here.**

## What shipped in round 3 (the 46 clips and 9 programmes)

- Clips: 22 of 23 vertical packages with the AI writer's titles and hook; 1 (COSMOS DESK's headlines) took its hook
  from its first title, the AI writer's hook running five words of an outlet's headline. The other refusals were all
  right to refuse: two description leads that ran six or more of the source's words (replaced by the hook and the
  outlet's name) and one thumbnail that repeated its title (the pair's next thumbnail used).
- Programmes: 8 of 9 entirely the AI writer's, one with a line from the deterministic writer; TECH BYTES' thumbnail A
  replaced by the lead-only rule (its first words were about another story).
- The sheets for the owner, in Spanish, are in his folder `para-el-dueno/miniaturas-titulos/` (a summary and one before/after per programme).

## Round 4: the coordinator's review and the owner's verdict (23 Oct)

The coordinator did not accept 9.7: a cover photo finer than on air, empty or vague big words (NUMBER OF THE DAY
with no number, IMPROVING, BILLY THE KID, SERVICE HALTED), dense boards at phone size, no 16:9 thumbnails on the
sheet. Fixed in the words and the pipeline: the on-air pixelation and its test; labels, nicknames, teasers and vague
words refused; a number clip's words carry the number; a person's health named plainly, who and what (a hospital is
where, a presenter's name, a day or a title is not who); no quiz or score board as a cover's picture; a programme's
lead picture only beside its lead's words; 16:9 thumbnails for horizontal clips and whole programmes, readable at
168×94 and 246×138, clear of the time stamp; the TikTok/Instagram cover's first words stand alone.

Then the owner saw the sheet: "no gran cosa". His verdict overrides both critics, who were miscalibrated: they scored
the words and the rules, not whether a stranger would stop on the picture in a feed of twenty. The look (a flat card,
the picture above, the words below, empty dark bands, small subjects) reads as a slide, not a thumbnail. The visual
redesign is handed over and done separately; the words, the validators and the pipeline stay. Still open for it: a
face crop placed by the face reader (FACE_READER: the whole face and the eyes inside, with headroom) and the
juxtaposition rule (a money figure beside a person's face names the deal or the company: SKY–ITV: £1.6BN).
