// What a story is ABOUT, for the free-picture desk (docs/roadmap/FOTOS_LIBRES.md §3.1): the visual brief the writer
// gives when there is one, else the names its headline carries.
//
//   briefSubjects(brief) -> [subject]           the writer's brief, cleaned and capped (untrusted model output)
//   headlineSubjects(story) -> [subject]        no brief: the place the gazetteer finds + the headline's names
//   subject: { name, kind, role: 'main'|'place'|'other', hint, fromBrief }
//
// A headline name has no kind and no hint: the desk resolves it only when the story's own words confirm the
// Wikidata item (requireContext), so a wrong name costs one lookup, never a wrong picture.
import { locate, lookupPlace } from '../gazetteer.js';

export const KINDS = ['person', 'country', 'city', 'place', 'structure', 'organisation', 'product', 'phenomenon', 'species', 'artwork', 'event', 'other'];
const ROLES = ['main', 'place', 'other'];
const MAX_SUBJECTS = 4;

// capitalised words that open headlines or tag them, never a subject on their own
const NOT_A_NAME = new Set(
  (
    'The A An And Or But In On At To For Of With From By As After Before Over Why How What Who When Where Which This That These Those ' +
    'New First Last Big Small Top Live Breaking Exclusive Watch Analysis Opinion Review Explainer Update Goodbye Hello Inside Meet ' +
    'It Its I We You He She They Is Are Was Were Will Can Could Should May Might Here There Half Twice Drug Drugs Satellite Satellites ' +
    'Monday Tuesday Wednesday Thursday Friday Saturday Sunday January February March April May June July August September October ' +
    'November December Today Tomorrow Yesterday Tropical Storm Hurricane Typhoon Cyclone Humans People Scientists Researchers Study ' +
    'Police Government Officials Minister President Prime Report Reports Says Said ' +
    // titles and parties in front of a name ("Texas Republican Ken Paxton")
    'Republican Republicans Democrat Democrats Democratic Senator Governor Chancellor Judge General Former Ex Mr Mrs Ms Dr Sir Dame Lord'
  ).split(' '),
);
// a single word that is a people, not a subject: Israelis, Palestinians, Britons, Chinese, Iranian-backed
const DEMONYM = /^\p{Lu}\p{Ll}+(?:ians?|ans?|ese|is|ons|ish|ic|i)(?:-\p{Ll}+)?$/u;
const CONNECT = new Set(['of', 'de', 'del', 'da', 'di', 'van', 'von', 'der', 'la', 'le', 'al', 'bin', 'the', '&']);
const clean = (s, max = 80) =>
  String(s ?? '')
    .replace(/[\u0000-\u001f<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

/** The writer's visual brief → subjects (unknown kinds become 'other'; at most four; empty names dropped). */
export function briefSubjects(brief) {
  const list = Array.isArray(brief?.subjects) ? brief.subjects : [];
  const out = [];
  for (const s of list) {
    // a Wikipedia-style title carries its disambiguator in brackets ("Curiosity (rover)", "Gale (crater)"): no search
    // finds the brackets (round 7, 8 Oct), so the name is searched bare and the bracket joins the hint
    const raw = clean(s?.name);
    const bracket = /\s*\(([^)]*)\)\s*$/.exec(raw);
    const name = bracket ? raw.slice(0, bracket.index).trim() : raw;
    if (!name || name.length < 2) continue;
    const kind = KINDS.includes(s?.kind) ? s.kind : 'other';
    const role = ROLES.includes(s?.role) ? s.role : 'other';
    if (out.some((o) => o.name.toLowerCase() === name.toLowerCase())) continue;
    out.push({ name, kind, role, hint: clean([bracket?.[1], s?.hint].filter(Boolean).join(', '), 60), fromBrief: true });
    if (out.length >= MAX_SUBJECTS) break;
  }
  // the main subject first, then the place, then the rest
  return out.sort((a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role));
}

/**
 * Runs of capitalised words in a headline ("Ken Paxton", "Supreme Court", "Bank of England"), in order. The
 * headline's first word is capitalised anyway: alone, it is a name only when its shape says so ("NASA", "OpenAI")
 * or the summary also writes it with a capital after a lower-case word.
 */
export function headlineNames(title, summary = '') {
  const tokens = String(title ?? '')
    .replace(/[‘’]/g, "'")
    .split(/\s+/)
    .filter(Boolean)
    .map((raw) => ({ raw, w: raw.replace(/^[^\p{L}\d&]+|[^\p{L}\d&.]+$/gu, '').replace(/'s$/u, '').replace(/\.$/, '') }));
  const names = [];
  let run = [];
  let start = 0;
  const shaped = (w) => /^\p{Lu}{2,}$/u.test(w) || /\p{Lu}.*\p{Lu}/u.test(w.slice(1));
  // capitalised in the summary where no sentence starts ("…said Donald Trump", "…, Meta has")
  const inSummary = (w) => new RegExp(`[^\\s.!?"“'‘]\\s+${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'u').test(summary);
  const flush = () => {
    while (run.length && CONNECT.has(run[run.length - 1].toLowerCase())) run.pop();
    // titles, places and "Braid-creator"-style labels in front of the name itself
    while (run.length > 1 && (NOT_A_NAME.has(run[0]) || lookupPlace(run[0]) || /-\p{Ll}/u.test(run[0]))) {
      run.shift();
      start++;
    }
    while (run.length && NOT_A_NAME.has(run[0])) run.shift();
    const lone = run.length === 1 ? run[0] : null;
    const ok = run.length && !(lone && DEMONYM.test(lone)) && !(lone && start === 0 && !shaped(lone) && !inSummary(lone));
    if (ok) names.push(run.join(' '));
    run = [];
  };
  tokens.forEach(({ raw, w }, i) => {
    const cap = /^[\p{Lu}\d]/u.test(w) && /\p{L}/u.test(w);
    if (cap && !(NOT_A_NAME.has(w) && !run.length)) {
      if (!run.length) start = i;
      run.push(w);
    } else if (run.length && CONNECT.has(w.toLowerCase()) && i + 1 < tokens.length) run.push(w);
    else flush();
    // a run ends at punctuation that closes a phrase ("Merz, AfD") and at a possessive ("Germany's Merz")
    if (run.length && (/[,:;!?)"”]$/.test(raw) || /'s[^\p{L}]*$/u.test(raw))) flush();
  });
  flush();
  return [...new Set(names)].filter((n) => n.length >= 2 && !/^\d+$/.test(n));
}

/** No brief: the gazetteer's place, then the headline's other names (demonyms and places dropped from those). */
export function headlineSubjects(story) {
  const title = clean(story?.title, 300);
  const summary = clean(story?.summary, 700);
  const out = [];
  const loc = locate(title, summary);
  const placeName = loc?.entry && !loc.entry.broad ? loc.entry.name : null;
  for (const name of headlineNames(title, summary)) {
    const place = lookupPlace(name);
    if (place) continue; // the place comes from the gazetteer below, with its kind
    out.push({ name, kind: null, role: 'main', hint: '', fromBrief: false });
    if (out.length >= MAX_SUBJECTS - 1) break;
  }
  if (placeName) out.push({ name: placeName, kind: loc.entry.kind === 'country' ? 'country' : loc.entry.kind === 'city' ? 'city' : 'place', role: 'place', hint: loc.entry.country && loc.entry.country !== placeName ? loc.entry.country : '', fromBrief: false });
  return out;
}
