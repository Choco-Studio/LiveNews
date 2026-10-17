// Text posts (docs/publishing/plan.md §4): for the day's important stories, a short factual post in English in the
// channel's own words, the outlet credited beside the link to its own article (credit and traffic go to the source),
// and our clip or programme on it when there is one. Every post opens "AI-generated:" (the compliance desk's rule for
// text). No emoji in a text post, ever; a grave story's post waits for the owner whatever the mode.
//
// The verbatim rule (the compliance desk's, docs/publishing/verbatim.md) holds every word (wording.js):
//   - the post's own headline is the channel's aired headline when it passes the rule, else the channel's label of
//     the story (its kicker and place: "Wildfire · California, USA");
//   - the outlet's headline appears only as an attributed citation beside the link ('BBC Science: “…”');
//   - the line of what is new is an aired sentence only when it is checked against the article itself and passes:
//     the aired text is largely the outlet's (the compliance desk measured it), so without the article no sentence
//     of it is used.
//
//   dayStories(entries, { day, timeZone, limit }) -> the day's stories, most told first (with their source texts)
//   newsLine(story, { requireArticle }) -> the line of what is new (a whole aired sentence) or ''
//   postHead(story) -> { own, lead, cite }: the post's own words and the outlet's headline cited
//   postsFor(story, { clip, programme }) -> { x, threads, bluesky, facebook, telegram }: { text, links, title }
import { severity } from '../facts.js';
import { splitSentences } from './text.js';
import { xLength, graphemes, PLATFORMS } from './platforms.js';
import { textPost } from './compliance.js';
import { ownWords, citation, storyLabel, cleanLink } from './wording.js';

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
      // grave: read sad on air (the archive's `grave`, which means only that: server/archive.js, and the quiz's
      // grave-day rule is calibrated on it), or grave words in the story (facts.js severity 2 or more: deaths, harm,
      // illness, in their grave sense), a named person's illness, or a death named in other words ("deadly"). The
      // archive's `grave: false` is NOT the channel judging a story light:
      // a story read "serious" (every hard story is) archives as grave false, the Pope's cancer among them.
      const sev = severity(`${best.title}. ${best.summary || ''}`);
      const grave = g.entries.some((e) => e.grave === true) || sev >= 2 || personsIllness(`${best.title}. ${best.summary || ''}`) || DEADLY.test(`${best.title}. ${best.summary || ''}`);
      return {
        id: best.id,
        ids: [...g.ids],
        title: norm(best.title),
        headline: norm(best.headline),
        text: norm(best.text),
        source: String(best.source || '').split(' / ')[0].trim(),
        link: cleanLink(best.link),
        category: best.category,
        kicker: best.kicker || '',
        place: best.location?.place || '',
        // what the story's words are measured against: every grouped outlet's title and summary (the article, when
        // the article cache holds it, server/articlecache.js, is added by the caller: articles)
        sourceTexts: [...new Set(g.entries.flatMap((e) => [e.title, e.summary]).map(norm).filter(Boolean))],
        articles: [],
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

// a death the story's words name without the channel's grave words ("Russian man linked to deadly London hospitals
// hack arrested", BBC 16 Oct): the post waits for the owner
const DEADLY = /\b(?:deadly|fatal(?:ly|ity|ities)?|lethal)\b(?!\s+(?:serious|accurate|dull|quiet|boring))/i;

// a named person's illness: a health word and a person (a title, or a first and last name)
const HEALTH = /\b(?:cancer|tumou?r|surgery|operation|diagnos\w*|hospitali[sz]ed|in hospital|illness|stroke|heart attack|dementia|chemotherapy|treatment for)\b/i;
const PERSON = /\b(?:Pope|King|Queen|Prince|Princess|President|Prime Minister|Chancellor|Senator|Governor|Mayor|Sir|Dame|Dr)\b|\b\p{Lu}\p{Ll}+ \p{Lu}\p{Ll}+\b/u;
export const personsIllness = (text) => HEALTH.test(String(text || '')) && PERSON.test(String(text || ''));

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

export function newsLine(story, { requireArticle = true } = {}) {
  // an aired sentence only when it can be checked against the article itself (the title and summary alone would let
  // the article's own sentences through); and only one that passes the verbatim rule
  const articles = (story.articles || []).filter(Boolean);
  if (requireArticle && !articles.length) return '';
  const sources = [...(story.sourceTexts || [story.title, story.summary]), ...articles].filter(Boolean);
  // of the aired sentences that stand alone, the one most about the headline's subject without repeating it (a
  // detail about a side character tells less of what is new); the earliest on a tie
  const head = new Set(words(story.title).map(stem));
  let best = null;
  for (const line of lineCandidates(story)) {
    if (sources.length && !ownWords(line, sources)) continue; // the outlet's words, not the channel's
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
    if (!saysSomethingNew(line, story)) continue;
    yield line;
  }
}

/**
 * Does a line tell something of the story (a figure, a time, a name the headline does not have, an event reported),
 * or only background ("Mark Wahlberg has started companies of his own and backed plenty of others")?
 */
const REPORTED = /\b(?:said|says|told|announced|confirmed|reported|warned|ordered|arrested|charged|found|discovered|launched|approved|rejected|voted|killed|died|injured|issued|signed|agreed|filed|ruled|fined|banned|recalled|released|published|revealed|raised|cut|fell|rose|won|lost|opened|closed|plans|will)\b/i;
const WHEN = /\b(?:today|tonight|yesterday|tomorrow|this (?:week|month|year|morning|evening)|last (?:week|month|year|night)|next (?:week|month|year)|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|june|july|august|september|october|november|december)\b/i;
function saysSomethingNew(line, story) {
  if (/\d/.test(line) || WHEN.test(line) || REPORTED.test(line)) return true;
  const head = new Set(words(story.title || '').map(stem));
  // a capitalised word past the first that the headline does not have (a place, a body, a person)
  const names = line.split(/\s+/).slice(1).filter((w) => /^\p{Lu}/u.test(w)).map((w) => stem(w.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')));
  return names.some((n) => n && !head.has(n));
}

const end = (s) => (/[.!?]["'’”]?$/.test(s) ? s : `${s}.`);

/**
 * The post's own words: the channel's aired headline when it passes the rule against the story's sources, else the
 * channel's label of the story. `cite` is the outlet's headline as an attributed citation, used only when the
 * channel's headline is not its own words.
 */
export function postHead(story) {
  const sources = [...(story.sourceTexts || [story.title, story.summary]), ...(story.articles || [])].filter(Boolean);
  const own = story.headline && ownWords(story.headline, sources) ? end(norm(story.headline)) : '';
  const label = own ? '' : storyLabel(story, [story.title, story.summary, ...(story.sourceTexts || []), ...(story.articles || [])].filter(Boolean));
  return { own, lead: own || (label ? end(label) : ''), cite: own ? '' : citation(story.source, story.title) };
}

/** Every network's post for one story. `clip` / `programme` = { url, title } when the channel has one on it. */
export function postsFor(story, { clip = null, programme = null } = {}) {
  const { own, lead, cite } = postHead(story);
  const line = newsLine(story);
  const link = cleanLink(story.link);
  const source = story.source || 'the source';
  // beside the link: "via Outlet" when the post's headline is the channel's own, else the outlet's headline, cited
  const credit = own ? `via ${source}:` : cite;
  const watch = clip?.url || programme?.url || null;
  const links = [{ label: own ? story.source || 'Source' : cite, url: link, title: story.title, description: line || lead }];
  if (watch) links.push({ label: clip ? 'Our clip' : 'The programme', url: watch });
  const title = own || cite; // what the approval page shows as the post's title
  const join = (...parts) => parts.filter(Boolean).join(' ');
  const out = {};

  // X: 280 (a URL weighs 23); the article's link; our clip only when it fits; a long citation gives way to "via"
  const x = (withLine, withWatch, withCite = true) => `AI-generated: ${join(lead, withLine ? line : '', withCite ? credit : `via ${source}:`)} ${link}${withWatch && watch ? ` Watch: ${watch}` : ''}`;
  let xt = x(true, true);
  for (const args of [[true, false], [false, false], [false, false, false]]) if (xLength(xt) > PLATFORMS.x.text.post) xt = x(...args);
  out.x = { text: xt, links: links.slice(0, 1), title };

  // Threads: 500 characters, the article as the link card
  const sourceLine = own ? `Source: ${source} — ${link}` : `${cite}\n${link}`;
  const th = [`AI-generated: ${lead || cite}`, line, lead ? sourceLine : link, watch ? `Watch: ${watch}` : ''].filter(Boolean).join('\n\n');
  out.threads = { text: th.length <= PLATFORMS.threads.text.post ? th : [`AI-generated: ${lead || cite}`, lead ? sourceLine : link].join('\n\n'), links, title };

  // Bluesky: 300 graphemes; the article as an external card (its URL and headline are on the card)
  let bs = lead || line ? `AI-generated: ${join(lead, line)} (via ${source})` : `AI-generated: reported by ${source}.`;
  if (graphemes(bs) > PLATFORMS.bluesky.text.post) bs = `AI-generated: ${lead || `reported by ${source}.`} (via ${source})`;
  out.bluesky = { text: bs, links, title };

  // Facebook: room for the whole of it
  out.facebook = { text: [`AI-generated: ${lead || cite}`, line, lead ? sourceLine : link, watch ? `Watch our ${clip ? 'clip' : 'programme'}: ${watch}` : ''].filter(Boolean).join('\n\n'), links, title };

  // Telegram: HTML (the adapter sets the post's own headline bold, and the links with their labels: the citation)
  out.telegram = { text: `AI-generated: ${line || lead || `reported by ${source}.`}`, links, title: line ? own : '' };

  for (const p of Object.values(out)) {
    p.grave = !!story.grave;
    p.storyIds = story.ids || [story.id];
    p.sourceTexts = [...(story.sourceTexts || []), ...(story.articles || [])];
  }
  return out;
}

/** The compliance desk's own text post (when its module is installed it may phrase the prefix its way). */
export function compliancePost(story, max = 280) {
  const { lead, cite } = postHead(story);
  return textPost({ text: [lead, newsLine(story), cite].filter(Boolean).join(' '), source: story.source, link: cleanLink(story.link) }, { max });
}
