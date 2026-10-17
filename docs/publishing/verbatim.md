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

**The last net.** `preflight` (publish time) refuses an episode whose lint fails (`verbatim`, default `block`). The live stream relies on the writer applying the rule.

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
