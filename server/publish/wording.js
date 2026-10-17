// The words a post, a clip's texts or an upload's description may carry (docs/publishing/plan.md §4, and the
// compliance desk's verbatim rule, docs/publishing/verbatim.md). Facts are free; an outlet's expression is not. So:
//   - the channel's own words, when they pass the rule against the story's sources (no run of more than 12 words,
//     at most 20 % of the words copied in runs of 6 or more);
//   - else a label the channel makes itself from the story's facts (its kicker and its place: "Wildfire · California,
//     USA"), never a sentence of the outlet's;
//   - the outlet's headline only as an attributed citation beside its link ('BBC Science: “…”');
//   - links without their trackers.
//
//   ownWords(text, sources)   true when `text` passes the rule against `sources` (false when there are none to check)
//   citation(outlet, headline) 'Outlet: “Headline”' (its own double quotes made single: one quotation, whole)
//   storyLabel({ kicker, place, category }, words) the channel's label of a story, or '' (with `words`, the story's own
//                             title and summary: only a kicker and a place those words bear out)
//   cleanLink(url)            the URL without its tracking parameters (utm_*, at_*, fbclid, gclid…), all else kept
import { storyReport } from './compliance.js';

const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

export function ownWords(text, sources) {
  const t = norm(text);
  const src = (Array.isArray(sources) ? sources : [sources]).filter((x) => typeof x === 'string' && x.trim());
  if (!t || !src.length) return false;
  return storyReport(t, src).violations.length === 0;
}

export function citation(outlet, headline) {
  const h = norm(headline).replace(/“/g, '‘').replace(/”/g, '’').replace(/"/g, "'").replace(/[.]+$/, '');
  if (!h) return outlet || '';
  return outlet ? `${outlet}: “${h}”` : `“${h}”`;
}

// labels of the running order, not of the story (they say nothing of what it is about)
const FEATURE = /^(?:AND FINALLY|NUMBER OF THE DAY|STILL TO COME|COMING UP|LATER|ALSO|IN BRIEF|THE LEAD|BREAKING|NEWS|GENERAL)$/i;
const CATEGORY = { world: 'World', tech: 'Technology', science: 'Science', business: 'Business', sport: 'Sport', health: 'Health', politics: 'Politics', culture: 'Culture', climate: 'Climate', entertainment: 'Entertainment' };
const sentenceCase = (s) => {
  const t = norm(s).toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
};
// a place as people write it: "CALIFORNIA, USA" -> "California, USA" (short all-capital names stay: USA, UK, UAE, DR)
const placeCase = (s) =>
  norm(s)
    .split(/(\s+|,|-)/)
    .map((w) => (/^[A-Z]{2,3}$/.test(w) ? w : /^[A-Z]/.test(w) ? w.charAt(0) + w.slice(1).toLowerCase() : w))
    .join('');

// what the story's own words bear out: a kicker word's stem ("WILDFIRE": a wildfire), a place's own name as a word
// ("CALIFORNIA, USA": California). On 17 Oct the channel's kicker and map said VOLCANO for black-hole "eruptions",
// JUSTICE · USA for a trial in Mexico of the killers of US surfers, EDUCATION for a school shooting: a label the story
// does not bear out says something false, so it is left out.
const wordsOf = (text) => new Set(String(text || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/).filter(Boolean));
const kickerBorneOut = (kicker, ws) => norm(kicker).toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 4).some((w) => {
  const stem = w.slice(0, Math.min(w.length, 5));
  for (const x of ws) if (x.startsWith(stem)) return true;
  return false;
});
const placeBorneOut = (place, ws) => norm(place).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z]+/).filter((w) => w.length >= 3).some((w) => ws.has(w));

export function storyLabel(story = {}, words = null) {
  const ws = words === null || words === undefined ? null : wordsOf(Array.isArray(words) ? words.join(' ') : words);
  let k = norm(story.kicker);
  let place = norm(story.place || story.location?.place || '');
  if (ws) {
    if (k && !kickerBorneOut(k, ws)) k = '';
    if (place && !placeBorneOut(place, ws)) place = '';
  }
  // the kicker; the category only beside a place ("Technology" alone says nothing a reader can use), and only when
  // there are no words to check it by (a category is the feed's desk, not the story's)
  // (a kicker that only names a desk, TECHNOLOGY, CULTURE, is a category too)
  const desk = new Set(Object.values(CATEGORY).map((c) => c.toLowerCase()));
  const kicker = k && !FEATURE.test(k) && !desk.has(k.toLowerCase()) ? sentenceCase(k) : place && !ws ? CATEGORY[String(story.category || '').toLowerCase()] || (k && !FEATURE.test(k) ? sentenceCase(k) : '') : '';
  return [kicker, place ? placeCase(place) : ''].filter(Boolean).join(' · ');
}

// trackers: what a newsletter, a feed or an ad network adds to know where a click came from; nothing a page needs
const TRACKER_PREFIX = /^(?:utm_|at_|pk_|mtm_|hsa_|ns_|_hs|oly_|vero_)/i;
const TRACKER = new Set(['fbclid', 'gclid', 'dclid', 'gbraid', 'wbraid', 'msclkid', 'yclid', 'twclid', 'ttclid', 'li_fat_id', 'mc_cid', 'mc_eid', 'igshid', 'igsh', 'mkt_tok', 'traffic_source', 'ref_src', 'ref_url', 'smid', 'smtyp', 'cmpid', 'ocid', 'sr_share', 'spm', 'guccounter', 'guce_referrer', 'guce_referrer_sig']);

export function cleanLink(url) {
  const raw = String(url ?? '').trim();
  let u;
  try {
    u = new URL(raw);
  } catch {
    return raw;
  }
  if (!/^https?:$/.test(u.protocol)) return raw;
  const keep = [...u.searchParams.entries()].filter(([k]) => !TRACKER_PREFIX.test(k) && !TRACKER.has(k.toLowerCase()));
  if (keep.length === [...u.searchParams.keys()].length) return raw; // nothing to take out: the link exactly as given
  u.search = keep.length ? `?${new URLSearchParams(keep).toString()}` : '';
  return u.toString();
}
