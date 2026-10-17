// Text posts (docs/publishing/plan.md §4): for the day's important stories, a short factual post in English with the
// headline, one line of what is new, and the credit to the outlet with the link to its own article (credit and
// traffic go to the source), and our clip or programme on it when there is one. Only what aired: the headline is the
// outlet's own (the archive's title, what the channel told), the line is a sentence the channel said (the archive's
// aired text), never rewritten, never an opinion, nothing added. Every post opens "AI-generated:" (the compliance
// desk's rule for text). No emoji in a text post, ever; a grave story's post waits for the owner whatever the mode.
//
//   dayStories(entries, { day, timeZone, limit }) -> the day's stories, most told first
//   newsLine(story) -> the line of what is new (a whole aired sentence) or ''
//   postsFor(story, { clip, programme }) -> { x, threads, bluesky, facebook, telegram }: { text, links, title }
import { severity } from '../facts.js';
import { splitSentences } from './text.js';
import { xLength, graphemes, PLATFORMS } from './platforms.js';
import { textPost } from './compliance.js';

const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const STOP = new Set('a an the of to in on at by for from with and or but is are was were be has have had it its this that as says said after over into than'.split(' '));
const words = (s) => norm(s).toLowerCase().replace(/[^\p{L}\p{N}' ]+/gu, ' ').split(/\s+/).filter((w) => w && !STOP.has(w));
const localDay = (ms, timeZone) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));

/** Do two headlines tell the same event (more than half the shorter one's words in common)? */
export function sameEvent(a, b) {
  const A = new Set(words(a));
  const B = new Set(words(b));
  if (A.size < 2 || B.size < 2) return false;
  let shared = 0;
  for (const w of A) if (B.has(w)) shared++;
  return shared >= 2 && shared >= 0.5 * Math.min(A.size, B.size);
}

/**
 * The day's stories from the archive's airings: grouped by story (and by event across outlets), scored by how much the
 * channel told them (each airing, each lead twice, each programme, a breaking story), most told first. Only stories
 * with a link to the outlet's article (the credit needs it).
 */
export function dayStories(entries, { day = null, timeZone = 'Europe/London', limit = 8 } = {}) {
  const groups = [];
  for (const e of entries) {
    if (!e?.id || !/^https?:\/\//.test(String(e.link || ''))) continue;
    if (day && localDay(e.at, timeZone) !== day) continue;
    let g = groups.find((x) => x.ids.has(e.id)) || groups.find((x) => sameEvent(x.title, e.title));
    if (!g) groups.push((g = { ids: new Set(), entries: [], title: e.title }));
    g.ids.add(e.id);
    g.entries.push(e);
  }
  return groups
    .map((g) => {
      const best = [...g.entries].sort((a, b) => String(b.text || '').length - String(a.text || '').length)[0];
      const first = g.entries.reduce((m, e) => Math.min(m, e.at), Infinity);
      const programmes = new Set(g.entries.map((e) => e.programId));
      const leads = g.entries.filter((e) => e.rank === 0).length;
      // grave: the channel's own call when it made one (a cure for a cancer is not grave news); harm to people always;
      // the words alone only for a story the channel never classed
      const sev = severity(`${best.title}. ${best.summary || ''}`);
      const classed = g.entries.some((e) => typeof e.grave === 'boolean');
      const grave = g.entries.some((e) => e.grave === true) || sev >= 3 || (!classed && sev >= 2);
      return {
        id: best.id,
        ids: [...g.ids],
        title: norm(best.title),
        headline: norm(best.headline),
        text: norm(best.text),
        source: String(best.source || '').split(' / ')[0].trim(),
        link: best.link,
        category: best.category,
        programmes: [...programmes],
        airings: g.entries.length,
        firstAt: first,
        grave,
        score: g.entries.length + 2 * leads + 1.5 * programmes.size + (g.entries.some((e) => e.breaking) ? 3 : 0),
      };
    })
    .sort((a, b) => b.score - a.score || a.firstAt - b.firstAt)
    .slice(0, limit);
}

// an attribution at a sentence's end: the post credits the outlet itself
const ATTRIBUTION = /,?\s*(?:according to [^,.]+|[A-Z][\w'’.& -]{1,40} (?:reports?|reported|says|said))\.?$/;
const OPINION = /\b(?:jaw-dropping|incredible|stunning|amazing|astonishing|brilliant|terrible|awful|horrible|shocking|outrageous|disgraceful|best|worst|must-see|unmissable|gorgeous|beautiful|ugly|hilarious|ridiculous|absurd|i think|we think|in my view|frankly)\b/i;
const ATTRIBUTION_ONLY =/^(?:[A-Z][\w'’.& -]{1,40} (?:reports?|reported)|according to [^.]+)\.$/;

/**
 * The line of what is new: the first sentence the channel said about the story that is neither the headline again,
 * nor only an attribution, nor leaning on another sentence; whole, at most 200 characters, its trailing attribution
 * taken off (the post credits the outlet). '' when there is none.
 */
/** Whole sentences (the speech splitter cuts a long one at a comma for the voice: those pieces are joined again). */
export function wholeSentences(text) {
  const out = [];
  let cur = '';
  for (const piece of splitSentences(text || '')) {
    cur = cur ? `${cur} ${piece}` : piece;
    if (/[.!?…]["'’”)]?$/.test(cur)) {
      out.push(cur);
      cur = '';
    }
  }
  return out; // (a trailing piece without its stop is the archive's 700-character cut: never used)
}

export function newsLine(story) {
  // of the aired sentences that stand alone, the one most about the headline's subject without repeating it (a
  // detail about a side character tells less of what is new); the earliest on a tie
  const head = new Set(words(story.title).map(stem));
  let best = null;
  for (const line of lineCandidates(story)) {
    const w = words(line).map(stem);
    const on = w.length ? w.filter((x) => head.has(x)).length / w.length : 0;
    const score = on > 0 ? 1 + on : 0;
    if (!best || score > best.score) best = { line, score };
  }
  // nothing about the subject (a side detail): the headline and the credit say it better alone
  return best && best.score > 0 ? best.line : '';
}

// a crude stem, enough to see "Kenya has confirmed third Ebola case" is the headline "Kenya confirms third Ebola case"
const stem = (w) => w.replace(/(?:ing|ed|es|s)$/, '');

function* lineCandidates(story) {
  const head = new Set(words(story.title).map(stem));
  for (const raw of wholeSentences(story.text || '')) {
    const s = norm(raw);
    if (!s || ATTRIBUTION_ONLY.test(s)) continue;
    if (/^(?:it|they|this|that|these|those|he|she|his|her|their|also|but|and|meanwhile|however|thanks|now|still to come)\b/i.test(s)) continue;
    // a clause that needs another ("When the pandemic devastated his business, as it did…"), a person not named
    // before their pronoun, or the outlet's own verdict ("jaw-dropping"): never the line of a news post
    if (/^(?:when|while|as|although|though|if|because|since|after|before|once|until|unless|whether|taken|having|being)\b/i.test(s)) continue;
    // a time that points back ("At the time, it provided…"), or "it" before anything is named: it needs the article
    if (/^(?:at the time|at that time|back then|by then|then|later|earlier|previously|since then|until then)\b/i.test(s)) continue;
    const it = /\bit\b/i.exec(s);
    if (it && it.index < 40 && !/\s\p{Lu}[\p{L}'’-]+/u.test(s.slice(1, it.index))) continue;
    const pron = /\b(?:he|she|his|her|him|they|their|them)\b/i.exec(s);
    if (pron && !/\s\p{Lu}[\p{L}'’-]+/u.test(s.slice(0, pron.index))) continue;
    if (OPINION.test(s)) continue;
    // a line that sets up a quote the post will not carry ("here is how she put it", "…said:")
    if (/\b(?:here(?:'s|’s| is) (?:how|what|why)|put it|in (?:his|her|their) words)\b|:\s*$/i.test(s)) continue;
    let line = s.replace(ATTRIBUTION, '').trim().replace(/[,;:]$/, '');
    // the headline again (its words, the attribution aside, inflections aside): nothing new to say
    const w = words(line).map(stem);
    const shared = w.filter((x) => head.has(x)).length;
    if (w.length && shared / w.length >= 0.7) continue;
    if (!/[.!?]["'’”]?$/.test(line)) line = `${line}.`;
    if (line.length < 30 || line.length > 200) continue;
    if (/["“”]/.test(line) && ((line.match(/["“”]/g) || []).length % 2)) continue; // a quote left open
    yield line;
  }
}

const end = (s) => (/[.!?]["'’”]?$/.test(s) ? s : `${s}.`);

/** Every network's post for one story. `clip` / `programme` = { url, title } when the channel has one on it. */
export function postsFor(story, { clip = null, programme = null } = {}) {
  const title = end(norm(story.title));
  const line = newsLine(story);
  const credit = story.source ? `via ${story.source}` : '';
  const watch = clip?.url || programme?.url || null;
  const links = [{ label: story.source || 'Source', url: story.link, title: story.title, description: line }];
  if (watch) links.push({ label: clip ? 'Our clip' : 'The programme', url: watch });
  const out = {};

  // X: 280 (a URL weighs 23); the article's link; our clip only when it fits too
  const x = (withLine, withWatch) => {
    const body = [title, withLine && line ? line : '', credit ? `${credit}:` : ''].filter(Boolean).join(' ');
    return `AI-generated: ${body} ${story.link}${withWatch && watch ? ` Watch: ${watch}` : ''}`;
  };
  let xt = x(true, true);
  if (xLength(xt) > PLATFORMS.x.text.post) xt = x(true, false);
  if (xLength(xt) > PLATFORMS.x.text.post) xt = x(false, false);
  out.x = { text: xt, links: links.slice(0, 1), title: story.title };

  // Threads: 500 characters, the article as the link card
  const th = [`AI-generated: ${title}`, line, `Source: ${story.source} — ${story.link}`, watch ? `Watch: ${watch}` : ''].filter(Boolean).join('\n\n');
  out.threads = { text: th.length <= PLATFORMS.threads.text.post ? th : [`AI-generated: ${title}`, `Source: ${story.source} — ${story.link}`].join('\n\n'), links, title: story.title };

  // Bluesky: 300 graphemes; the article as an external card (its URL need not be in the text)
  let bs = `AI-generated: ${title}${line ? ` ${line}` : ''} (${credit || 'source linked'})`;
  if (graphemes(bs) > PLATFORMS.bluesky.text.post) bs = `AI-generated: ${title} (${credit || 'source linked'})`;
  out.bluesky = { text: bs, links, title: story.title };

  // Facebook: room for the whole of it
  out.facebook = { text: [`AI-generated: ${title}`, line, `Source: ${story.source} — ${story.link}`, watch ? `Watch our ${clip ? 'clip' : 'programme'}: ${watch}` : ''].filter(Boolean).join('\n\n'), links, title: story.title };

  // Telegram: HTML (the adapter sets the headline bold and the links)
  out.telegram = { text: `AI-generated: ${line || title}`, links, title: story.title };

  for (const p of Object.values(out)) {
    p.grave = !!story.grave;
    p.storyIds = story.ids || [story.id];
  }
  return out;
}

/** The compliance desk's own text post (when its module is installed it may phrase the prefix its way). */
export function compliancePost(story, max = 280) {
  return textPost({ text: `${end(norm(story.title))} ${newsLine(story)}`.trim(), source: story.source, link: story.link }, { max });
}
