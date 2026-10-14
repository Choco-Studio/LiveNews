// PAY ATTENTION's question desk, part two: the five round kinds (docs/programmes/pay-attention.md §4.1), each built from
// eligible events (server/quiz/desk.js). The asked stories are chosen first; options come after, from the events no
// question of the edition uses, so no option shows a headline the edition asks about later. Every option is a real
// headline or a real place from an eligible event; nothing here writes a word.
import { DAY_WORDS, shareName } from './desk.js';
// the boards' own measure (public/js/scenes/quiz-fit.js, pay-attention.md §6): a text that would not fit its box on
// screen is never asked nor offered, since the boards never cut or shrink a headline
import { fitsTile, fitsLetters, fitsWhere, fitsSentence, fitsToday } from '../../public/js/scenes/quiz-fit.js';

export const ROUND_TITLES = Object.freeze({
  picture: 'PICTURE THIS',
  letters: 'LETTER BY LETTER',
  where: 'WHERE IN THE WORLD?',
  today: 'TODAY OR NOT TODAY?',
  howmany: 'HOW MANY?',
});
export const ROUND_TYPES = Object.freeze(Object.keys(ROUND_TITLES));
export const QUESTIONS = 3; // a round's questions (TODAY OR NOT TODAY: six headlines)
export const TODAY_ITEMS = 6;
export const PICTURE_STEPS = Object.freeze([8, 16, 32, 64]); // blocks across, per sharpening step
export const LETTERS_MAX = 60;
const LETTERS = /\p{L}/u;

/** A seeded random source (mulberry32 on a string's hash): the same edition always gets the same plan. */
export function seeded(seed) {
  let h = 1779033703 ^ String(seed).length;
  for (const c of String(seed)) {
    h = Math.imul(h ^ c.charCodeAt(0), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(list, rnd) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const aired = (ev, at = ev.last) => ({ programme: ev.latest?.programId || ev.programmes.at(-1) || null, at, source: ev.source });
const letter = (i) => 'ABC'[i];

/** The London midnight before `now` (ms). */
export function londonDayStart(now) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' }).formatToParts(new Date(now));
  const get = (k) => Number(parts.find((p) => p.type === k)?.value || 0);
  return now - ((get('hour') * 60 + get('minute')) * 60 + get('second')) * 1000 - (now % 1000);
}

/**
 * LETTER BY LETTER's reveal: every word's first letter, the digits and the punctuation show at once (`shown`); the other
 * letters come in `order`, a quarter, a half and three quarters of them at `stages`; by the second stage every word of
 * three letters or more shows at least one letter more than its first.
 */
export function letterReveal(words, rnd) {
  const chars = [...words];
  const shown = [];
  const rest = [];
  const wordOf = [];
  let w = -1;
  let start = true;
  chars.forEach((c, i) => {
    if (!LETTERS.test(c)) {
      if (/[\s-]/.test(c)) start = true; // "self-destruct": two words to the eye
      shown.push(i);
      return;
    }
    if (start) {
      w++;
      start = false;
      shown.push(i);
      return;
    }
    wordOf[i] = w;
    rest.push(i);
  });
  const byWord = new Map();
  for (const i of rest) byWord.set(wordOf[i], [...(byWord.get(wordOf[i]) || []), i]);
  const early = [];
  for (const idx of byWord.values()) if (idx.length >= 2) early.push(idx[Math.floor(rnd() * idx.length)]);
  const order = [...shuffle(early, rnd), ...shuffle(rest.filter((i) => !early.includes(i)), rnd)];
  const n = order.length;
  const second = Math.max(Math.ceil(n * 0.5), Math.min(n, early.length));
  return { shown, order, stages: [Math.min(Math.ceil(n * 0.25), second), second, Math.max(second, Math.ceil(n * 0.75))] };
}

const lettersOk = (ev) => ev.words.length <= LETTERS_MAX && ev.words.split(/\s+/).length >= 3 && ev.words.split(/\s+/).length <= 10 && (ev.words.match(/\p{L}/gu) || []).length >= 12 && fitsLetters(ev.words);
const todayOk = (ev) => !DAY_WORDS.test(ev.words) && fitsToday(ev.words);

/**
 * The stories a round asks about (not yet its options): `pool` is the pairing's eligible events not yet asked, in
 * preference order. Returns the chosen events or null when the round cannot be filled. TODAY OR NOT TODAY takes
 * `half` TODAY and `half` EARLIER headlines (`todayStart`: 06:00 London today; `earlierBefore`: the start of yesterday).
 */
export function pickAsked(type, pool, { n = QUESTIONS, todayStart, earlierBefore, now, desk = null } = {}) {
  const fit = pool.filter((ev) => !desk || ev.category === desk);
  const take = (list, k) => {
    const out = [];
    for (const ev of list) {
      if (out.length >= k) break;
      if (out.some((o) => shareName(o, ev))) continue; // two takes on one story are never two questions
      out.push(ev);
    }
    return out.length >= k ? out : null;
  };
  switch (type) {
    case 'picture':
      return take(fit.filter((ev) => ev.image && fitsTile(ev.words)), n);
    case 'letters':
      return take(fit.filter(lettersOk), n);
    case 'where': {
      const out = [];
      for (const ev of fit.filter((e) => e.place && fitsWhere({ words: e.words, masked: e.place.masked }))) {
        if (out.length >= n) break;
        if (out.some((o) => o.place.country === ev.place.country || shareName(o, ev))) continue;
        out.push(ev);
      }
      return out.length >= n ? out : null;
    }
    case 'howmany':
      return take(fit.filter((ev) => ev.figure && fitsSentence(ev.figure)), n);
    case 'today': {
      const half = Math.ceil(n / 2);
      const todays = take(fit.filter((ev) => todayOk(ev) && ev.first >= todayStart && ev.first <= now), half);
      const earlier = todays && take(fit.filter((ev) => todayOk(ev) && ev.last < earlierBefore && !todays.some((t) => shareName(t, ev))), n - half);
      return todays && earlier ? [...todays, ...earlier] : null;
    }
    default:
      return null;
  }
}

/**
 * Turn a round's asked events into its questions, with options drawn from `options` (events no question of the edition
 * uses). Returns the questions or null when the options cannot be found. `taken` collects the option events used.
 */
export function buildQuestions(type, asked, options, rnd, { todayStart, taken = new Set(), extraPlaces = [] } = {}) {
  switch (type) {
    case 'picture':
      return mapAll(asked, (ev) => {
        // three real headlines, at most two from one desk (13 Oct's pool was 20 tech, 13 science and 2 world stories: three
        // desks a question could not be found), none telling the same story as the answer or each other
        const picks = [];
        for (const o of shuffle(options.filter((x) => !taken.has(x.key)), rnd)) {
          if (picks.length >= 2) break;
          if (shareName(o, ev) || picks.some((p) => shareName(p, o)) || !fitsTile(o.words)) continue;
          if ([ev, ...picks, o].filter((x) => x.category === o.category).length > 2) continue;
          picks.push(o);
        }
        if (picks.length < 2) return null;
        picks.forEach((p) => taken.add(p.key));
        const tiles = shuffle([ev, ...picks], rnd);
        return {
          type, key: ev.key, image: ev.image, imageId: ev.imageId || ev.key, words: ev.words, steps: PICTURE_STEPS, aired: aired(ev),
          options: tiles.map((t, i) => ({ letter: letter(i), words: t.words, key: t.key, desk: t.category })),
          answer: letter(tiles.indexOf(ev)),
        };
      });
    case 'letters':
      return asked.map((ev) => ({ type, key: ev.key, words: ev.words, desk: ev.category, reveal: letterReveal(ev.words, rnd), aired: aired(ev) }));
    case 'where': {
      // three real countries in three regions: the week's story places first, then the neutral countries (desk.js); an
      // answer is never another question's wrong pin, and no wrong pin shows more than twice in the round
      const answers = new Set(asked.map((ev) => ev.place.country));
      const shown = new Map();
      const pool = [
        ...shuffle(options.filter((x) => x.optionPlace && !taken.has(x.key)), rnd).map((o) => ({ ...o.optionPlace, key: o.key })),
        ...shuffle(extraPlaces, rnd).map((p) => ({ ...p, key: null })),
      ];
      return mapAll(asked, (ev) => {
        const picks = [];
        const regions = new Set([ev.place.region]);
        for (const p of [...pool].sort((x, y) => (shown.get(x.country) || 0) - (shown.get(y.country) || 0))) {
          if (picks.length >= 2) break;
          if (answers.has(p.country) || regions.has(p.region) || picks.some((x) => x.country === p.country) || (shown.get(p.country) || 0) >= 2) continue;
          regions.add(p.region);
          picks.push(p);
        }
        if (picks.length < 2) return null;
        for (const p of picks) {
          if (p.key) taken.add(p.key);
          shown.set(p.country, (shown.get(p.country) || 0) + 1);
        }
        const answer = { ...ev.place, key: ev.key };
        const pins = shuffle([answer, ...picks], rnd);
        return {
          type, key: ev.key, words: ev.words, masked: ev.place.masked || null, desk: ev.category, aired: aired(ev),
          options: pins.map((p, i) => ({ letter: letter(i), label: p.label, country: p.country, lat: p.lat, lon: p.lon, region: p.region, key: p.key })),
          answer: letter(pins.indexOf(answer)),
        };
      });
    }
    case 'howmany':
      return asked.map((ev) => ({
        type, key: ev.key, words: ev.words, masked: ev.figure.masked, sentence: ev.figure.sentence, desk: ev.category,
        figure: { value: ev.figure.value, label: ev.figure.label, qualifier: ev.figure.qualifier, exact: ev.figure.exact },
        aired: aired(ev, ev.figureAt || ev.last),
      }));
    case 'today':
      return [{
        type,
        items: shuffle(asked, rnd).map((ev) => ({ key: ev.key, words: ev.words, desk: ev.category, answer: ev.first >= todayStart ? 'TODAY' : 'EARLIER', aired: aired(ev, ev.first) })),
      }];
    default:
      return null;
  }
}

function mapAll(list, fn) {
  const out = [];
  for (const x of list) {
    const q = fn(x);
    if (!q) return null;
    out.push(q);
  }
  return out;
}
