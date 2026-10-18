# Verbatim text: measurement, rule and lint (spec for the writer team)

Written 17 October 2026. The writer team owns `server/writer.js` and `server/providers/mock.js` and applies this. The compliance side delivers the measurement, the rule, the lint (`server/compliance/verbatim.js`) and the last net at publish time (`preflight`, rule `verbatim`).

## 1. Why

- **Facts are free; the outlet's wording is not.**
  - Eleven consecutive words can be protected expression ([CJEU C-5/08 Infopaq](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:62008CJ0005)).
  - Press publishers have a right over online use of their articles beyond "very short extracts" ([Directive (EU) 2019/790 Art. 15](https://eur-lex.europa.eu/eli/dir/2019/790/oj)).
  - The news-reporting and quotation exceptions cover what the informatory purpose justifies, with the source named ([Directive 2001/29 Art. 5(3)(c), (d)](https://eur-lex.europa.eu/eli/dir/2001/29/oj); [CDPA s.30](https://www.legislation.gov.uk/ukpga/1988/48/section/30)). They do not cover reading an article out.
- **YouTube will not pay for it.** Its monetisation policy refuses "content that exclusively features readings of other materials you did not originally create… like text from websites or news feeds" ([channel monetisation policies](https://support.google.com/youtube/answer/1311392)).

## 2. The measurement (real archive, 12-17 Oct 2026)

**Tool:** `tools/compliance/verbatim-audit.mjs --archive data/archive --cache <dir>`.

**Data.**

- 4,780 story tellings with a real article link, in 430 editions.
- Their articles fetched and extracted with the desk's own reader (`server/article.js`, to 20,000 characters): 1,247 of 1,326 read (94 %).
- **Aired text per story:** the presenter's reading (the archive keeps the first story segment) and the expert's answer when there was one.
- **Sources:** the title, the feed summary and the article.
- **Counting:** words in runs of 6 or more consecutive words found in a source. Words inside **attributed** quotations (a speaker's words in quotation marks with a verb of saying) are not counted, either way.

**Every edition in the archive was written by the fallback writer** (no AI key yet).

| | Copied share of aired words | Median longest run (words) | Stories with a run over 12 words | Stories breaking the rule (§3) |
| --- | --- | --- | --- | --- |
| All | **88.7 %** | 20 | 90.4 % | 99.4 % |
| WORLD NOW | 85.6 % | 19 | 88.9 % | 99.2 % |
| TECH BYTES | 92.0 % | 23 | 94.2 % | 100 % |
| COSMOS DESK | 91.0 % | 25 | 95.4 % | 99.7 % |
| MONEY MINUTE | 89.8 % | 23 | 96.9 % | 100 % |
| NEWS IN 60 | 90.1 % | 17 | 79.7 % | 98.8 % |

- **The run distribution.** The longest run is over 8 words in 98 % of stories, over 10 in 95 %, over 15 in 80 % and over 20 in 49 %. The worst single run is 80 words, a whole paragraph read out.
- **Where the copying comes from.** Counted against the feed summary alone, 42 % of aired words are copied. The article body accounts for the rest.
- **Editions.** The median edition is 89 % copied, and **all 430 editions break the rule**.

**What a rule would cost the fallback writer as it is.** It cannot rephrase, so a sentence that breaks the rule has to go.

| Rule | Aired words removed | Median edition loses |
| --- | --- | --- |
| no run over 12 words, at most 20 % copied (**proposed**) | 91.8 % | 92.9 % (208 s) |
| no run over 12, at most 35 % | 91.1 % | 92.7 % (205 s) |
| no run over 15, at most 35 % | 91.1 % | 92.7 % (205 s) |
| no run over 20, at most 50 % | 87.6 % | 89.4 % (195 s) |
| no run over 12, no share cap | 73.2 % | 73.8 % (168 s) |
| no run over 25, no share cap | 7.7 % | 6.3 % (13 s) |

**Conclusion.** Trimming cannot fix this. Any rule that protects the outlets' wording (even a 20-word cap) removes about 90 % of what the fallback writer says. Only the 25-word cap is cheap, and it protects almost nothing: Infopaq protects 11 words. **The fallback writer has to compose its own sentences**, not lift the outlets'.

## 3. The rule

1. **No run of more than 12 consecutive words copied from the story's sources**, outside an attributed quotation.
   - Exempt: a speaker's words in quotation marks with who said them, and a recreation's words.
   - Not exempt: a phrase the outlet put in quotation marks with no speaker.
2. **At most 20 % of a story's words** (outside attributed quotations) in runs of 6 or more words copied from its sources.

**Why these numbers.**

- **12 words** sits just above Infopaq's 11 and matches the brief. A 12-word span is about a clause: enough to keep a precise technical phrase, never enough to carry an outlet's sentence.
- **20 %** keeps unavoidable fixed phrases (names of bodies, titles of reports, "the Bank of England raised interest rates"). It refuses a story assembled from short lifts.

## 4. The lint (for the writer team)

**API** (`server/compliance/verbatim.js`):

- `storyReport(aired, sources)` returns `{ words, quoted, copied, share, longest, runs, violations }`.
- `lintEpisode(episode, { getStory })` returns `{ ok, stories, violations }`, per story, with the expert's and correspondent's pieces counted with the story. `getStory(id)` returns `{ title, summary, body }`, the desk's story with its article text.
- **Run it in the writer**, before the episode is accepted:
  - an AI writer gets the violating sentences back with "say this in your own words; keep only facts, names, numbers and attributed quotations";
  - the fallback writer must not emit them (§5).

**The last net.** `preflight` (publish time) refuses an episode whose lint fails (`verbatim`, default `block`). The
publishing desk gives it a clip's own stories' sources (`clipGetStory`, from `archiveGetStory`), so a clip is measured
on the words it carries, voice and captions, and not held for a story of its episode it does not show. On 17 Oct the
offline material broke the rule in most news stories, so most news clips are held until the writer complies (§5).

**Text posts.** `preflight` measures a text post (`kind: 'text'`) the same way when it carries `sourceTexts` (the
titles and summaries of the stories it tells, and their articles when cached): the post's words (its links, hashtags
and entities left out, `postWords`) against them, with `storyReport` at 12 words and 20 %. An attributed quotation is
exempt, so an outlet's headline cited beside its link ('BBC Science: “…”') passes and the same headline unquoted does
not. A post with no source texts gets a warning, and so does one checked against titles and summaries only. The
publishing desk's posts writer applies the same rule before a post is written (`server/publish/posts.js`,
`wording.js`).

**The article cache** (`server/articlecache.js`, round 5). The sources a clip, an upload or a post is measured against
are the archive's title and summary, plus the story's own words that the channel already read. These words are kept
beside the archive in `data/compliance/articles/<sha1(link)[:20]>.json` as `{ link, text, via, source, at }`, the
format this audit already uses:
- **article:** the article text the news desk read for the writer (`news.js` `readArticle`). It is the outlet's page,
  read under the desk's own rules, and only its first paragraphs (`article.js` caps it at 2,400 characters).
- **feed:** otherwise, the feed's own full text (`content:encoded`, or an Atom entry's content), when it says more than
  the summary (`news.js` `parseItem` `feedText`).

The cache fetches nothing, and no page is read that the channel did not already read. The archive writes the cache
as it records each story an episode tells (`Archive({ articles })`, when the episode is made), so only the stories
the channel tells are kept. It stores text only, at
most 6,000 characters, cut at a sentence. An article kept is never replaced by a feed's text, unless the outlet's
robots.txt now keeps the page from us (below). A story told again
refreshes its file. A file not written or refreshed for 14 days (the archive's own span) is removed, checked at most
once an hour. `archiveGetStory` reads the cache, so the factory, the upload, the publisher, its re-check and the posts
writer all measure against it. With it, a post can carry an aired line that the article proves is the channel's own
words (`posts.js` `newsLine`).

`ARTICLE_CACHE=off` keeps nothing, and a feed marked `"cache": false` in the feeds file is never kept. Since round 6
the news desk's reader obeys each outlet's robots.txt (`server/robots.js`, RFC 9309; `compliance.md` §6.1): a page the file keeps from us is never opened, the story keeps its feed's text and pictures
(`story.pageRefused = 'robots'`), and the cache keeps only the feed's text for it, replacing or removing an article
text kept for that link before. The audit below (`tools/compliance/verbatim-audit.mjs`) opens pages under the same
rules and drops a cached article text whose page robots.txt now keeps from us. The cache still adds no reading of its
own. Keeping the extracts is item 11 of the lawyer's list, the outlets' terms item 12 (`compliance.md` §9).

**The live stream's net: the launch report.** The stream has no publish step, so `launchReport()` (`node tools/compliance/cli.mjs launch`) measures what aired. `archiveSample()` reads the last 300 real stories of `data/archive` and checks each one's reading and analysis against its title and summary, and against its article when this audit has cached it in `data/compliance/articles`. Launch is blocked while more than 5 % of those stories break the rule. On 17 Oct 2026 the rate is 80.3 % against title and summary alone (241 of 300), and 99 % with the articles (297 of 300, 280 articles cached). It takes about a third of a second.

## 5. How the fallback writer can comply (proposal, for the writer team)

- **Compose from facts, not sentences.** Build each sentence from what the desk already extracts (`server/facts.js`: who, what, where, when, numbers, the attributed quote), in the channel's own templates. "Lisbon's council will close the harbour bridge to cars next spring." is a new sentence about the same facts. The lint then passes by construction.
- **Lean on attributed quotations.** They are exempt and they are the most vivid part of a story: "'We cannot ask people to drive over a bridge we no longer trust,' the mayor told reporters." This also feeds IN THEIR WORDS.
- **Keep short exact phrases** (names of reports, laws, products) under 12 words, attributed to the outlet.
- **Length.** A composed telling is shorter than a lifted one. The fallback-lengths work (deeper telling, more stories) still applies, now with composed sentences. Measure each change with `tools/compliance/verbatim-audit.mjs`. The target is 0 violating stories.
- **Expert and correspondent lines** follow the same rule. They never give advice (financial, medical, legal) and never interpret law. They report what the source says, attributed, because YouTube's monetisation policy refuses AI personas giving that advice.

## 6. Reproduce

```bash
NODE_USE_ENV_PROXY=1 node tools/compliance/verbatim-audit.mjs --archive data/archive \
  --cache data/compliance/articles --out data/compliance/verbatim-report.json
```

The report holds per-programme and per-edition figures, the cost grid and the 12 worst runs. The 17 October run's report is summarised above.

## 7. The AI writer in its own words (writer team, 17 Oct)

The AI writer path is what makes the channel comply. The fallback writer stays as it is (its own improvement loop is paused by the owner), and the publish gate holds what it writes.

**The prompt** (`server/writer.js` `OWN_WORDS`, in every programme's writer prompt). The writer composes every sentence from the facts and never reads out, stitches or lightly edits the outlet's sentences. It keeps the source's plain names for things, every figure with its unit and qualifier, who said what, and the source's certainty ("may", "plans to", "allegedly"). The outlet's words appear only as a quotation, exact, with its speaker in the same sentence. The standards editor's prompt checks the same paraphrase traps, and its corrections must be in the channel's own words too. No accuracy, attribution or tone rule was loosened.

**The check after the writer, and again after the editor** (`server/producer.js` `ownWords`, `server/ownwords.js`).

- **What is measured.** Each story's aired words (the reading, the correspondent's and the expert's pieces) are measured with `storyReport` against the story's title, summary, article and feed text. These are the texts the writer saw, and the ones the gate measures through the article cache.
- **Paraphrase traps.** The aired sentences are checked for the traps the writer's validator cannot see: a hedge dropped ("may close" told as "will close", "allegedly stole" as "stole", "may have been caused" as "was caused"), one person's words given to another (in reported speech or in a quotation), and a rise told as a fall. A figure, a name or a place the source does not state is still dropped by the validator (`writer.js` `groundedText`).
- **Rewrites.** A story that breaks the rule or has a trap goes back to the model (stage `rewrite`), at most twice. The request names its copied passages and its faults: "rewrite these in your own words". A rewrite that gives a figure another value or turns it around is refused, and so is one that adds a fault. The offline writer is never asked.
- **Cuts and drops.** A story still failing is cut to its compliant sentences (never losing its opening or more than half of them). Otherwise it is dropped from the episode, and it sinks in the desk's ranking. An episode left below its programme's floor is not made: the slot is skipped.
- **Logs.** Every rewrite, refusal, cut and drop is logged (`[own words] …`) and noted in the episode's pipeline (`write.own`, `review.own`). The pipeline also notes what the editor changed (`review.changes`).

**The offline writer.** When no AI writer answers (no key, the provider down or out of quota), the chain falls back to the fallback writer, as before. Its episodes air on the stream unchanged and are measured only (`write.own.offline`). The publish gate holds every item from them (`preflight` rule `offline-writer`), and the approval page says why in Spanish: «Escrito sin IA: copia demasiado de la fuente».

**On the owner's server.** `tools/writer/try.mjs` makes real episodes with the key and reports each story's copied share and longest run, the rewrites and drops, the editor's faults, tokens and time by stage, and the month of 24/7 air (`server-setup.md` §6).
