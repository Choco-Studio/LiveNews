// The channel's experts on a video call (owner 8 Oct: "que no sea super pesado ... que parezca una llamada en
// directo al despacho o el hogar de la persona"; WAVE3.md §3.6, §6.1). How real newscasts do it: a down-the-line
// interview over a video link from the guest's study or office, introduced in one sentence, ONE question and one
// answer of 20-40 seconds, on a big story, now and then (never after every story). The expert adds context and what
// the news means; never the facts the presenter has just read, never an opinion on people or politics, never advice.
//
// The experts are the channel's own fictional contributors (channel.json presenters with an `expert` block), like
// its correspondents: their own look, room and voice, recurring, so viewers know them.
//
//   expertsOf(program, presenters)        the programme's experts: [{ id, name, first, title, from, room, ... }]
//   pickExpert(story, roster, taken?)     the expert whose specialities fit the story best, or null
//   groundCall(raw, source, grounded)     a writer's `call` checked: { ask, answer: [sentences] } | null
//   introLine(expert, seed) / thanksLine(expert, seed)   the presenter's fixed lines around the call
import { presenceClaim } from './correspondents.js';

// what an expert never says on air: an opinion of their own, advice, a verdict on someone, first-hand sourcing
export const OPINION = /\b(?:i think|i believe|i feel|in my (?:view|opinion)|personally|frankly|should|shouldn't|ought to|must|mustn't|need to|needs to|we have to|have to be|i (?:would|'d) (?:advise|recommend|urge)|my advice|people should|it'?s (?:clear|obvious) that|disgrace\w*|shameful|irresponsible|reckless|brave|heroic|wrong to|right to)\b/i;
const FIRST_HAND = /\b(?:i (?:saw|spoke|talked|heard|visited|was there|have seen|'ve seen)|told me|sources (?:tell|told) (?:me|us)|i'?m hearing|my sources)\b/i;

/** The programme's experts, in roster order: those whose `expert.programmes` lists it (or all, without a list). */
export function expertsOf(program, presenters = {}) {
  const want = Array.isArray(program?.experts) ? program.experts : null;
  const out = [];
  for (const [id, p] of Object.entries(presenters)) {
    const e = p?.expert;
    if (!e) continue;
    if (want ? !want.includes(id) : Array.isArray(e.programmes) && !e.programmes.includes(program?.id)) continue;
    const name = String(p.name || id);
    out.push({ id, name, first: name.replace(/^(?:Dr|Prof)\.?\s+/i, '').split(/\s+/)[0], last: name.split(/\s+/).at(-1), honorific: /^(?:Dr|Prof)\.?\s/i.exec(name)?.[0].trim() || null, title: e.title, from: e.from, room: e.room, categories: e.categories || [], keywords: e.keywords ? new RegExp(`\\b(?:${e.keywords.join('|')})`, 'i') : null });
  }
  return out;
}

/** The expert for a story: its section and its words against each expert's specialities; null when none fits. */
export function pickExpert(story, roster, taken = new Set()) {
  const text = `${story?.title || ''} ${story?.summary || ''}`;
  let best = null;
  for (const e of roster) {
    if (taken.has(e.id)) continue;
    let s = 0;
    if (e.categories.includes(story?.category)) s += 1;
    if (e.keywords) s += Math.min(3, (text.match(new RegExp(e.keywords.source, 'gi')) || []).length) * 1.5;
    if (s >= 1.5 && (!best || s > best.s)) best = { e, s };
  }
  return best?.e || null;
}

const split = (t) =>
  String(t || '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?])\s+(?=[A-Z"“‘'])/)
    .map((x) => x.trim())
    .filter(Boolean);

/**
 * A writer's call for one story, checked: the presenter's question short (≤ 14 words, no figure, no name: a topic
 * prompt the answer addresses), the answer 2 or 3 sentences, each grounded in the story's source (`grounded`: the
 * story check of the writer), none an opinion, advice, a claim to be there or first-hand sourcing. Null when fewer
 * than two answer sentences stand.
 */
export function groundCall(raw, source, grounded) {
  if (!raw || typeof raw !== 'object') return null;
  const ask = String(raw.ask || '').replace(/\s+/g, ' ').trim();
  const askWords = ask.split(/\s+/).filter(Boolean);
  if (!ask || askWords.length > 14 || !/\?$/.test(ask) || /\d/.test(ask)) return null;
  const answer = split(raw.answer)
    .filter((x) => !/\?/.test(x) && !presenceClaim(x) && !OPINION.test(x) && !FIRST_HAND.test(x) && !!grounded(x))
    .slice(0, 3);
  if (answer.length < 2) return null;
  // the question must be about what the answer says: at least one content word in common
  const content = (s) => new Set(String(s).toLowerCase().match(/[a-z]{4,}/g) || []);
  const a = content(answer.join(' '));
  if (![...content(ask)].some((w) => a.has(w) || a.has(w.replace(/s$/, '')))) return null;
  return { ask, answer };
}

const pick = (list, seed) => list[Math.abs([...String(seed)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)) % list.length];

/** The presenter introduces the call in one sentence (as broadcasters do), then asks. */
export function introLine(e, seed = '') {
  const who = `${e.name}, ${/^[aeiou]/i.test(e.title) ? 'an' : 'a'} ${e.title}`;
  return pick([`Joining us on a video call from ${e.from} is ${who}.`, `${e.name} is ${/^[aeiou]/i.test(e.title) ? 'an' : 'a'} ${e.title}, and joins us from ${e.from}.`, `With us from ${e.from} is ${who}.`], seed);
}

/** The thanks after the answer: short, with the name (no "for joining us" every time). */
export function thanksLine(e, seed = '') {
  const name = e.honorific ? `${e.honorific} ${e.last}` : e.first;
  return pick([`${name}, thank you.`, `Thank you, ${name}.`, `${name}, many thanks.`], seed);
}
