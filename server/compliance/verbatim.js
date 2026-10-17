// Verbatim text: how much of what we say on air is the outlet's own wording (docs/publishing/verbatim.md).
// Facts are free; expression is not (CJEU C-5/08 Infopaq: eleven consecutive words can be protected; the EU press
// publishers' right, Directive 2019/790 Art. 15, leaves only "very short extracts" free; YouTube's monetisation
// policy refuses "readings of other materials… like text from websites or news feeds").
//
// The rule (spec in docs/publishing/verbatim.md, the writer team applies it; this is the lint):
//   1. No run of more than MAX_RUN (12) consecutive words copied from the story's sources, outside an attributed
//      quotation (a speaker's words in quotation marks with who said them, or a recreation).
//   2. At most MAX_SHARE (20 %) of a story's words, outside attributed quotations, in runs of PHRASE (6) words or
//      more copied from its sources.
//
//   tokens(text)                             the words with their character spans (lowercased, punctuation folded)
//   quotedSpans(text)                        the [start, end) character spans of attributed quotations
//   verbatimRuns(aired, sources, { min })    every maximal run of >= min words of `aired` found in a source
//   storyReport(aired, sources, opts)        -> { words, quoted, copied, share, longest, runs, violations }
//   lintEpisode(episode, { getStory })       -> { ok, stories: [...], violations }  (the writer team's lint)
//   archiveSample({ dataDir, limit })        -> { stories, violating, rate, withArticle }  (the launch check, on what aired)
//   archiveGetStory({ dataDir })             -> getStory(id) from the archive and the audit's article cache

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const MAX_RUN = 12;
export const MAX_SHARE = 0.2;
export const PHRASE = 6;

const WORD = /[\p{L}\p{N}]+(?:[’'][\p{L}]+)?/gu;
const foldWord = (w) => w.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, '');

/** The words of a text: [{ w, start, end }] (w folded: lowercase, no accents or apostrophes). */
export function tokens(text) {
  const out = [];
  for (const m of String(text ?? '').matchAll(WORD)) out.push({ w: foldWord(m[0]), start: m.index, end: m.index + m[0].length });
  return out;
}

// who said it: a verb of saying near the quotation, or a colon introducing it after a name
const ATTRIB = /\b(?:said|says|say|told|tells|added|adds|wrote|writes|according to|stated|states|noted|notes|argued|argues|warned|warns|insisted|insists|explained|explains|asked|asks|replied|replies|declared|declares|announced|announces|claimed|claims|described|describes|recalled|recalls|posted|tweeted|put it|in a statement)\b/i;

/**
 * The spans of attributed quotations in a text: text inside “…” or "…" (three words at least) whose sentence says
 * who said it. Unattributed quotation marks (a phrase the outlet put in quotes) are not exempt.
 */
export function quotedSpans(text) {
  const s = String(text ?? '');
  const spans = [];
  const re = /“([^”]{3,}?)”|"([^"]{3,}?)"/g;
  for (const m of s.matchAll(re)) {
    const inner = m[1] ?? m[2];
    if ((inner.match(WORD) || []).length < 3) continue;
    // the sentence around it: back to the previous full stop, on to the next one after the quote
    const from = Math.max(0, s.lastIndexOf('.', m.index - 1) + 1);
    const nextStop = s.slice(m.index + m[0].length).search(/[.!?](?:\s|$)/);
    const to = nextStop < 0 ? s.length : m.index + m[0].length + nextStop + 1;
    const around = s.slice(from, m.index) + s.slice(m.index + m[0].length, to);
    if (ATTRIB.test(around) || /:\s*$/.test(s.slice(from, m.index))) spans.push([m.index, m.index + m[0].length]);
  }
  return spans;
}

/**
 * Every maximal run of at least `min` consecutive words of `aired` that also appears, in the same order, in one of
 * `sources`. -> [{ from, to, length, text }] (from/to: token indexes in aired, to exclusive)
 */
export function verbatimRuns(aired, sources, { min = PHRASE } = {}) {
  const a = tokens(aired);
  const srcs = (Array.isArray(sources) ? sources : [sources]).map((s) => tokens(s).map((t) => t.w));
  // index of every min-gram of the sources -> [source, position]
  const index = new Map();
  srcs.forEach((src, si) => {
    for (let i = 0; i + min <= src.length; i++) {
      const key = src.slice(i, i + min).join(' ');
      let list = index.get(key);
      if (!list) index.set(key, (list = []));
      if (list.length < 64) list.push([si, i]);
    }
  });
  const runs = [];
  let i = 0;
  while (i + min <= a.length) {
    const key = a.slice(i, i + min).map((t) => t.w).join(' ');
    const hits = index.get(key);
    if (!hits) {
      i++;
      continue;
    }
    // extend each hit as far as it goes; keep the longest
    let best = min;
    for (const [si, p] of hits) {
      const src = srcs[si];
      let k = min;
      while (i + k < a.length && p + k < src.length && a[i + k].w === src[p + k]) k++;
      if (k > best) best = k;
    }
    const text = String(aired).slice(a[i].start, a[i + best - 1].end);
    runs.push({ from: i, to: i + best, length: best, text });
    i += best;
  }
  return runs;
}

/**
 * One story's measure. `aired` = what we said (the presenter's reading and any expert or correspondent piece),
 * `sources` = the outlet's title, summary and article text, `exempt` = extra exempt text (a recreation's words).
 * Words inside attributed quotations are not counted (neither as copied nor in the total).
 */
export function storyReport(aired, sources, { maxRun = MAX_RUN, maxShare = MAX_SHARE, phrase = PHRASE } = {}) {
  const text = String(aired ?? '');
  const toks = tokens(text);
  const spans = quotedSpans(text);
  const inQuote = (t) => spans.some(([s, e]) => t.start >= s && t.end <= e);
  const quotedIdx = new Set(toks.map((t, k) => (inQuote(t) ? k : -1)).filter((k) => k >= 0));
  const words = toks.length - quotedIdx.size;
  const runs = verbatimRuns(text, sources, { min: phrase })
    .map((r) => {
      // a run's words outside quotations, and the longest stretch of them that is unbroken by a quotation
      let outside = 0;
      let streak = 0;
      let longest = 0;
      for (let k = r.from; k < r.to; k++) {
        if (quotedIdx.has(k)) {
          streak = 0;
          continue;
        }
        outside++;
        streak++;
        longest = Math.max(longest, streak);
      }
      return { ...r, outside, longest };
    })
    .filter((r) => r.outside >= phrase);
  const copied = runs.reduce((n, r) => n + r.outside, 0);
  const longest = runs.reduce((n, r) => Math.max(n, r.longest), 0);
  const share = words ? copied / words : 0;
  const violations = [];
  for (const r of runs) if (r.longest > maxRun) violations.push({ rule: 'run', length: r.longest, text: r.text });
  if (share > maxShare) violations.push({ rule: 'share', share: Math.round(share * 1000) / 1000 });
  return { words, quoted: quotedIdx.size, copied, share, longest, runs, violations };
}

/** The aired words of a story in an episode: its reading, and the expert's, correspondent's or analyst's pieces on it. */
export function airedText(episode, storyId) {
  return (episode?.segments || [])
    .filter((s) => s.storyId === storyId && !s.recreation && s.kind !== 'restage' && (s.type === 'story' || (s.type === 'cross' && s.part !== 'ask')))
    .map((s) => String(s.text || ''))
    .join(' ');
}

/**
 * The lint of a whole episode: each story's aired words against its sources. `getStory(id)` -> { title, summary,
 * body } (the news desk's story; its article text in `body`). A story whose sources are missing is reported
 * `unverified` (and counts as a violation when `strict`).
 */
export function lintEpisode(episode, { getStory = () => null, strict = false, ...opts } = {}) {
  const stories = [];
  const violations = [];
  for (const id of new Set((episode?.segments || []).filter((s) => s.storyId && s.type === 'story').map((s) => s.storyId))) {
    const s = getStory(id) || {};
    const sources = [s.title, s.summary, s.body].filter(Boolean);
    const aired = airedText(episode, id);
    if (!sources.length) {
      stories.push({ storyId: id, unverified: true });
      if (strict) violations.push({ storyId: id, rule: 'unverified', message: 'the story\'s sources are not at hand: its words cannot be checked' });
      continue;
    }
    const r = storyReport(aired, sources, opts);
    stories.push({ storyId: id, ...r, unverified: !s.body });
    for (const v of r.violations) violations.push({ storyId: id, ...v });
  }
  return { ok: violations.length === 0, stories, violations };
}

// ---------------------------------------------------------------------------------------------- the archive

/** The key of an article in the audit's cache (tools/compliance/verbatim-audit.mjs writes it). */
export const articleKey = (link) => crypto.createHash('sha1').update(String(link)).digest('hex').slice(0, 20);

/** The archive's story tellings (`<dataDir>/archive/YYYY-MM-DD.jsonl`, one line per story told), newest first. */
function archiveEntries(dataDir, { limit = Infinity, real = false } = {}) {
  const dir = dataDir ? path.join(dataDir, 'archive') : null;
  const entries = [];
  if (!dir || !fs.existsSync(dir)) return entries;
  const files = fs.readdirSync(dir).filter((n) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(n)).sort().reverse();
  for (const f of files) {
    const lines = fs.readFileSync(path.join(dir, f), 'utf8').split('\n');
    for (let i = lines.length - 1; i >= 0 && entries.length < limit; i--) {
      if (!lines[i].trim()) continue;
      try {
        const e = JSON.parse(lines[i]);
        // fixture stories (links on .invalid) are not what the channel airs
        if (e && e.text && (!real || !/\.invalid\//.test(e.link || ''))) entries.push(e);
      } catch { /* a torn line */ }
    }
    if (entries.length >= limit) break;
  }
  return entries;
}

function cachedArticle(cacheDir, link) {
  if (!cacheDir || !link) return null;
  try {
    return JSON.parse(fs.readFileSync(path.join(cacheDir, `${articleKey(link)}.json`), 'utf8')).text || null;
  } catch {
    return null; // not cached
  }
}

const cacheOf = (dataDir, cacheDir) => cacheDir || (dataDir ? path.join(dataDir, 'compliance', 'articles') : null);

/**
 * The stories' sources as the archive keeps them, for the lint and the publish check when the news desk is not at
 * hand (the operator's command line): getStory(id) -> { title, summary, body } (body: the cached article, or null).
 */
export function archiveGetStory({ dataDir = null, cacheDir = null } = {}) {
  const cache = cacheOf(dataDir, cacheDir);
  const byId = new Map();
  for (const e of archiveEntries(dataDir)) if (e.id && !byId.has(e.id)) byId.set(e.id, e);
  return (id) => {
    const e = byId.get(id);
    return e ? { title: e.title || '', summary: e.summary || '', body: cachedArticle(cache, e.link) } : null;
  };
}

/**
 * The launch check's measure of what aired (compliance.md §9): the last `limit` real stories of the archive, each
 * one's reading and analysis against its title and feed summary, and against its article too when the audit's cache
 * holds it (`cacheDir`, by default `<dataDir>/compliance/articles`). Without the article the measure is a floor: it
 * can only find less.
 * -> { stories, violating, rate, withArticle, examples: [{ id, at, programId, longest, share }] }
 */
export function archiveSample({ dataDir = null, cacheDir = null, limit = 300, ...opts } = {}) {
  const out = { stories: 0, violating: 0, rate: 0, withArticle: 0, examples: [] };
  const cache = cacheOf(dataDir, cacheDir);
  for (const e of archiveEntries(dataDir, { limit, real: true })) {
    const body = cachedArticle(cache, e.link);
    const r = storyReport([e.text, e.analysis?.text].filter(Boolean).join(' '), [e.title, e.summary, body].filter(Boolean), opts);
    out.stories++;
    if (body) out.withArticle++;
    if (r.violations.length) {
      out.violating++;
      if (out.examples.length < 3) out.examples.push({ id: e.id, at: e.at, programId: e.programId, longest: r.longest, share: Math.round(r.share * 1000) / 1000 });
    }
  }
  out.rate = out.stories ? out.violating / out.stories : 0;
  return out;
}
