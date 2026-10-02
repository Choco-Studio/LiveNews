// Speech timeline: turns the text of one sentence into a schedule of mouth
// shapes ("visemes") with natural durations, so the presenters' lips follow
// what they say instead of a random flap. Pure and DOM-free (unit tested in
// test/visemes.test.js); the AudioEngine drives it from TTS boundary events,
// the blip schedule or the wall clock (mute).
//
//   const tl = buildTimeline('Good evening, I am Paco.', { lang: 'en', rate: 1 });
//   sampleTimeline(tl, 420) -> { viseme, next, mix, level, charIndex, wordIndex, accent, pause }
//
// The letters -> sound rules are deliberately small (English spelling is not
// phonetic): what matters on a 384x216 face is the rhythm of open and closed
// mouths, the lip closures on m/b/p, the lip-teeth contact on f/v and the
// rounding on o/u/w. Numbers, acronyms and symbols are expanded to the words a
// TTS engine would say, because they change how long a sentence lasts.

export const VISEMES = Object.freeze(['rest', 'MBP', 'FV', 'TH', 'L', 'EE', 'AH', 'OH', 'OO', 'WQ', 'S']);

// How firmly a shape must be reached (lips closing for m/b/p cannot be skipped;
// tongue shapes barely show). Used for how long a shape holds before blending.
const DOMINANCE = { rest: 0.4, MBP: 1, FV: 0.9, TH: 0.5, L: 0.3, EE: 0.5, AH: 0.6, OH: 0.65, OO: 0.75, WQ: 0.7, S: 0.45 };

// Base durations in ms at rate 1, from typical English phone lengths; the whole
// set is scaled by TEMPO so ordinary news copy runs at ~15 characters per second.
const TEMPO = 1.12;
const D = { MBP: 70, FV: 82, TH: 76, T: 54, N: 60, L: 64, S: 92, SH: 100, W: 58, R: 54, K: 58, H: 46, Y: 44, VS: 80, VL: 112, G: 52 };
const PAUSE = { ',': 170, ';': 230, ':': 230, '—': 200, '–': 190, '-': 150, '…': 320, '(': 90, ')': 90, '"': 40, quote: 40, end: 0 };
const WORD_GAP = 12; // a breath of co-articulation between words, not a pause

const FUNCTION_WORDS = new Set([
  // English
  'a', 'an', 'the', 'of', 'to', 'in', 'on', 'at', 'by', 'for', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be',
  'been', 'as', 'it', 'its', "it's", 'this', 'that', 'with', 'from', 'has', 'have', 'had', 'will', 'would', 'can',
  'could', 'he', 'she', 'we', 'they', 'you', 'i', 'not', 'his', 'her', 'their', 'our', 'your', 'my', 'so', 'if',
  'than', 'then', 'do', 'does', 'did', 'up', 'out', 'into', 'over', 'about', 'there', 'here', 'what', 'who',
  // Spanish
  'el', 'la', 'los', 'las', 'un', 'una', 'de', 'del', 'al', 'y', 'e', 'o', 'u', 'en', 'con', 'por', 'para', 'que',
  'se', 'su', 'sus', 'lo', 'le', 'les', 'es', 'no', 'mas', 'más', 'muy', 'ya',
]);
// Unstressed prefixes: stress falls on the next vowel ("report", "about", "control").
const PREFIX_RE = /^(?:be|re|de|con|com|pro|pre|ex|un|dis|mis|a(?=[bcglprstw]))/;

// ------------------------------------------------------------------- phones

// A phone is { v: viseme, o: openness 0..1, d: ms, k: kind } with kind
// 'v' vowel nucleus, 'g' glide (second half of a diphthong), 'c' consonant,
// 'x' transparent consonant (k, g, h: the lips just take the next vowel's shape).
const V = (v, o, long = false) => ({ v, o, d: long ? D.VL : D.VS, k: 'v' });
const G = (v, o) => ({ v, o, d: D.G, k: 'g' });
const C = (v, d, o) => ({ v, o: o ?? CONS_OPEN[v] ?? 0.2, d, k: 'c' });
const X = (d = D.K) => ({ v: 'rest', o: 0.5, d, k: 'x' });
const CONS_OPEN = { MBP: 0, FV: 0.1, TH: 0.22, L: 0.28, S: 0.14, WQ: 0.22, EE: 0.24 };

const isV = (c) => c !== undefined && 'aeiouy'.includes(c);
const isCons = (c) => c !== undefined && /[bcdfghjklmnpqrstvwxz]/.test(c);

// Irregular English words that matter on air; spelled with the rule alphabet below.
const EN_WORDS = {
  the: [C('TH', D.TH), V('AH', 0.34)],
  a: [V('AH', 0.38)],
  of: [V('AH', 0.42), C('FV', D.FV)],
  to: [C('L', D.T), V('OO', 0.32)],
  do: [C('L', D.T), V('OO', 0.34)],
  who: [X(D.H), V('OO', 0.34, true)],
  you: [C('EE', D.Y), V('OO', 0.34, true)],
  your: [C('EE', D.Y), V('OH', 0.5, true)],
  are: [V('AH', 0.72, true)],
  was: [C('WQ', D.W), V('AH', 0.55), C('S', D.S)],
  one: [C('WQ', D.W), V('AH', 0.6), C('L', D.N)],
  once: [C('WQ', D.W), V('AH', 0.6), C('L', D.N), C('S', D.S)],
  two: [C('L', D.T), V('OO', 0.34, true)],
  i: [V('AH', 0.66), G('EE', 0.36)],
  "i'm": [V('AH', 0.66), G('EE', 0.36), C('MBP', D.MBP)],
  said: [C('S', D.S), V('EE', 0.5), C('L', D.T)],
  says: [C('S', D.S), V('EE', 0.5), C('S', D.S)],
  does: [C('L', D.T), V('AH', 0.5), C('S', D.S)],
  have: [X(D.H), V('AH', 0.72), C('FV', D.FV)],
  give: [X(), V('EE', 0.4), C('FV', D.FV)],
  live: [C('L', D.L), V('EE', 0.4), C('FV', D.FV)],
  people: [C('MBP', D.MBP), V('EE', 0.36, true), C('MBP', D.MBP), C('L', D.L)],
  there: [C('TH', D.TH), V('EE', 0.55, true), G('WQ', 0.28)],
  where: [C('WQ', D.W), V('EE', 0.55, true), G('WQ', 0.28)],
  their: [C('TH', D.TH), V('EE', 0.55, true), G('WQ', 0.28)],
  through: [C('TH', D.TH), C('WQ', D.R), V('OO', 0.34, true)],
  group: [X(), C('WQ', D.R), V('OO', 0.34, true), C('MBP', D.MBP)],
  news: [C('L', D.N), V('OO', 0.36, true), C('S', D.S)],
  new: [C('L', D.N), V('OO', 0.36, true)],
  now: [C('L', D.N), V('AH', 0.72), G('OO', 0.34)],
  how: [X(D.H), V('AH', 0.72), G('OO', 0.34)],
  down: [C('L', D.T), V('AH', 0.72), G('OO', 0.34), C('L', D.N)],
  world: [C('WQ', D.W), V('WQ', 0.36, true), C('L', D.L), C('L', D.T)],
  good: [X(), V('OO', 0.4), C('L', D.T)],
  could: [X(), V('OO', 0.4), C('L', D.T)],
  would: [C('WQ', D.W), V('OO', 0.4), C('L', D.T)],
  should: [C('S', D.SH), V('OO', 0.4), C('L', D.T)],
};

// English letters -> phones. Longest patterns first, with a little context.
function englishPhones(s) {
  if (EN_WORDS[s]) return EN_WORDS[s].map((p) => ({ ...p, i: 0 }));
  const out = [];
  const n = s.length;
  const vowelBefore = (i) => /[aeiouy]/.test(s.slice(0, i));
  // "make", "time", "home", "use" (+ "s"/"d"): the silent e makes the vowel long.
  const magicE = (i) => isCons(s[i + 1]) && s[i + 1] !== 'w' && s[i + 1] !== 'x' && s[i + 2] === 'e' && (i + 3 === n || (i + 4 === n && /[sd]/.test(s[i + 3])));
  const push = (i, ...ps) => ps.forEach((p) => out.push({ ...p, i }));
  for (let i = 0; i < n;) {
    const c = s[i];
    const two = s.slice(i, i + 2);
    const three = s.slice(i, i + 3);
    const next = s[i + 1];
    const end = i + 1 === n;
    // --- longer clusters
    if (s.startsWith('tion', i) || s.startsWith('sion', i)) { push(i, C('S', D.SH), V('AH', 0.36), C('L', D.N)); i += 4; continue; }
    if (s.startsWith('ture', i)) { push(i, C('S', D.SH), V('WQ', 0.32)); i += 4; continue; }
    if (s.startsWith('ough', i)) { push(i, V('OH', 0.55, true)); i += 4; continue; }
    if (s.startsWith('augh', i) || s.startsWith('eigh', i)) { push(i, c === 'a' ? V('OH', 0.6, true) : V('EE', 0.5, true)); i += 4; continue; }
    if (three === 'tch') { push(i, C('S', D.SH)); i += 3; continue; }
    if (three === 'igh') { push(i, V('AH', 0.68), G('EE', 0.36)); i += 3; continue; }
    if (three === 'eau') { push(i, V('OH', 0.58, true)); i += 3; continue; }
    // --- consonant digraphs
    if (two === 'th') { push(i, C('TH', D.TH)); i += 2; continue; }
    if (two === 'sh' || two === 'ch') { push(i, C('S', D.SH)); i += 2; continue; }
    if (two === 'ph') { push(i, C('FV', D.FV)); i += 2; continue; }
    if (two === 'wh' || two === 'wr') { push(i, C('WQ', D.W)); i += 2; continue; }
    if (two === 'kn' && i === 0) { push(i, C('L', D.N)); i += 2; continue; }
    if (two === 'gn' && i + 2 === n) { push(i, C('L', D.N)); i += 2; continue; }
    if (two === 'gh') { if (i === 0) push(i, X()); i += 2; continue; }
    if (two === 'ck') { push(i, X()); i += 2; continue; }
    if (two === 'ng') { push(i, X(D.N)); i += 2; continue; }
    if (two === 'nk') { push(i, X(D.N), X()); i += 2; continue; }
    if (two === 'qu') { push(i, X(), C('WQ', D.W * 0.8)); i += 2; continue; }
    if ((two === 'mb' || two === 'mn') && i + 2 === n) { push(i, C('MBP', D.MBP)); i += 2; continue; }
    if (isCons(c) && next === c && c !== 'c') { const ps = englishPhones(c); push(i, ...ps.map((p) => ({ ...p, d: p.d * 1.1 }))); i += 2; continue; }
    // --- vowel digraphs
    if (two === 'ee' || two === 'ea') { push(i, V('EE', two === 'ee' ? 0.34 : 0.4, true)); i += 2; continue; }
    if (two === 'ie') { push(i, n <= 3 ? V('AH', 0.66) : V('EE', 0.38, true), ...(n <= 3 ? [G('EE', 0.36)] : [])); i += 2; continue; }
    if (two === 'ei' || two === 'ey') { push(i, V('EE', 0.46, true)); i += 2; continue; }
    if (two === 'ai' || two === 'ay') { push(i, V('EE', 0.54, true)); i += 2; continue; }
    if (two === 'oo') { push(i, V('OO', 0.34, true)); i += 2; continue; }
    if (two === 'ou') { push(i, V('AH', 0.62), G('OO', 0.34)); i += 2; continue; }
    if (two === 'ow') { push(i, V('OH', 0.6), G('OO', 0.34)); i += 2; continue; }
    if (two === 'oi' || two === 'oy') { push(i, V('OH', 0.6), G('EE', 0.38)); i += 2; continue; }
    if (two === 'au' || two === 'aw') { push(i, V('OH', 0.64, true)); i += 2; continue; }
    if (two === 'oa' || (two === 'oe' && i + 2 === n)) { push(i, V('OH', 0.58, true)); i += 2; continue; }
    if (two === 'ue' || two === 'ui' || two === 'ew' || two === 'eu') { push(i, V('OO', 0.34, true)); i += 2; continue; }
    if ((two === 'er' || two === 'ir' || two === 'ur' || two === 'yr') && !isV(s[i + 2])) { push(i, V('WQ', 0.34)); i += 2; continue; }
    if (two === 'ar' && !isV(s[i + 2])) { push(i, V('AH', 0.78, true)); i += 2; continue; }
    if (two === 'or' && !isV(s[i + 2])) { push(i, V('OH', 0.6, true)); i += 2; continue; }
    // --- single letters
    switch (c) {
      case 'a':
        if (magicE(i)) push(i, V('EE', 0.54, true));
        else if (s.startsWith('ll', i + 1)) push(i, V('OH', 0.62));
        else if (end && n > 1) push(i, V('AH', 0.44));
        else push(i, V('AH', 0.78));
        break;
      case 'e':
        if (end && n > 2 && vowelBefore(i)) break; // silent final e
        if (i + 2 === n && /[sd]/.test(next) && vowelBefore(i) && isCons(s[i - 1])) {
          const sounded = (next === 'd' && /[td]/.test(s[i - 1])) || (next === 's' && /[szxhgc]/.test(s[i - 1]));
          if (!sounded) break; // "makes", "named"
        }
        if (magicE(i)) push(i, V('EE', 0.36, true));
        else push(i, V('EE', 0.5));
        break;
      case 'i':
        if (magicE(i) || /^(?:nd|ld)$/.test(s.slice(i + 1, i + 3))) push(i, V('AH', 0.68), G('EE', 0.36));
        else push(i, V('EE', 0.38));
        break;
      case 'o':
        if (magicE(i) || s.slice(i + 1, i + 3) === 'ld') push(i, V('OH', 0.58, true), G('OO', 0.32));
        else push(i, V('OH', 0.64));
        break;
      case 'u':
        if (magicE(i)) push(i, V('OO', 0.34, true));
        else push(i, V('AH', 0.52));
        break;
      case 'y':
        if (i === 0 || isV(next)) push(i, C('EE', D.Y));
        else if (!/[aeiou]/.test(s) && n <= 4) push(i, V('AH', 0.68), G('EE', 0.36));
        else push(i, V('EE', 0.38));
        break;
      case 'w': if (isV(next) || i === 0) push(i, C('WQ', D.W)); break;
      case 'r': push(i, C('WQ', isV(next) ? D.R : D.R * 0.8)); break;
      case 'c': push(i, /[eiy]/.test(next ?? '') ? C('S', D.S) : X()); break;
      case 'g': push(i, /[eiy]/.test(next ?? '') && !/^(?:get|give|girl|gift|begin|target)/.test(s) ? C('S', D.S) : X()); break;
      case 'j': push(i, C('S', D.S)); break;
      case 'x': if (i === 0) push(i, C('S', D.S)); else push(i, X(), C('S', D.S)); break;
      case 'h': push(i, X(D.H)); break;
      case 'k': case 'q': push(i, X()); break;
      case 'm': push(i, C('MBP', D.MBP + 4)); break;
      case 'b': case 'p': push(i, C('MBP', D.MBP)); break;
      case 'f': case 'v': push(i, C('FV', D.FV)); break;
      case 's': case 'z': push(i, C('S', D.S)); break;
      case 't': case 'd': push(i, C('L', D.T)); break;
      case 'n': push(i, C('L', D.N)); break;
      case 'l': push(i, C('L', D.L)); break;
      default: break; // apostrophes, digits that slipped through
    }
    i += 1;
  }
  return out;
}

// Spanish spelling is nearly phonetic: one pass, a handful of digraphs.
function spanishPhones(s, region = 'es') {
  const out = [];
  const push = (i, ...ps) => ps.forEach((p) => out.push({ ...p, i }));
  const VOW = { a: ['AH', 0.8], á: ['AH', 0.82], e: ['EE', 0.52], é: ['EE', 0.54], i: ['EE', 0.34], í: ['EE', 0.36], o: ['OH', 0.62], ó: ['OH', 0.64], u: ['OO', 0.38], ú: ['OO', 0.4], ü: ['OO', 0.38] };
  const ceceo = region === 'es';
  for (let i = 0; i < s.length;) {
    const c = s[i];
    const next = s[i + 1];
    const two = s.slice(i, i + 2);
    if (two === 'ch') { push(i, C('S', D.SH)); i += 2; continue; }
    if (two === 'll') { push(i, C('EE', D.Y + 10)); i += 2; continue; }
    if (two === 'rr') { push(i, C('L', D.R * 1.6)); i += 2; continue; }
    if (two === 'qu' || (two === 'gu' && /[eéií]/.test(s[i + 2] ?? ''))) { push(i, X()); i += 2; continue; }
    const vow = VOW[c];
    if (vow) { push(i, V(vow[0], vow[1])); i += 1; continue; }
    switch (c) {
      case 'y': push(i, i + 1 === s.length ? V('EE', 0.34) : C('EE', D.Y)); break;
      case 'h': break; // silent
      case 'c': push(i, /[eéií]/.test(next ?? '') ? C(ceceo ? 'TH' : 'S', D.S) : X()); break;
      case 'z': push(i, C(ceceo ? 'TH' : 'S', D.S)); break;
      case 'g': case 'j': case 'k': case 'q': push(i, X()); break;
      case 'x': push(i, X(), C('S', D.S)); break;
      case 'm': case 'b': case 'p': case 'v': push(i, C('MBP', D.MBP)); break;
      case 'f': push(i, C('FV', D.FV)); break;
      case 's': push(i, C('S', D.S)); break;
      case 't': case 'd': push(i, C('L', D.T)); break;
      case 'n': case 'ñ': push(i, C('L', D.N)); break;
      case 'l': case 'r': push(i, C('L', D.L)); break;
      case 'w': push(i, C('WQ', D.W)); break;
      default: break;
    }
    i += 1;
  }
  return out;
}

// ------------------------------------------------------------------ numbers

const EN_ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const EN_TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const EN_SCALES = [[1e12, 'trillion'], [1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand']];

function enUnder100(n) {
  if (n < 20) return [EN_ONES[n]];
  return n % 10 ? [EN_TENS[Math.floor(n / 10)], EN_ONES[n % 10]] : [EN_TENS[n / 10]];
}
function enUnder1000(n) {
  const out = [];
  if (n >= 100) {
    out.push(EN_ONES[Math.floor(n / 100)], 'hundred');
    if (n % 100) out.push('and');
  }
  if (n % 100 || n === 0) out.push(...enUnder100(n % 100));
  return out;
}
function enInt(n) {
  if (!Number.isFinite(n) || n >= 1e15) return ['a', 'lot'];
  if (n < 1000) return enUnder1000(n);
  const out = [];
  let rest = n;
  for (const [size, name] of EN_SCALES) {
    if (rest >= size) {
      out.push(...enUnder1000(Math.floor(rest / size)), name);
      rest %= size;
    }
  }
  if (rest) out.push(...enUnder1000(rest));
  return out;
}
function enYear(n) {
  if (n >= 2000 && n < 2010) return n === 2000 ? ['two', 'thousand'] : ['two', 'thousand', 'and', EN_ONES[n - 2000]];
  const hi = Math.floor(n / 100);
  const lo = n % 100;
  return [...enUnder100(hi), ...(lo === 0 ? ['hundred'] : lo < 10 ? ['oh', EN_ONES[lo]] : enUnder100(lo))];
}

const ES_ONES = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece',
  'catorce', 'quince', 'dieciseis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidos', 'veintitres',
  'veinticuatro', 'veinticinco', 'veintiseis', 'veintisiete', 'veintiocho', 'veintinueve'];
const ES_TENS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const ES_HUNDREDS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];
function esUnder1000(n) {
  if (n === 100) return ['cien'];
  const out = [];
  if (n >= 100) out.push(ES_HUNDREDS[Math.floor(n / 100)]);
  const r = n % 100;
  if (r < 30 && (r || n === 0)) out.push(ES_ONES[r]);
  else if (r >= 30) out.push(ES_TENS[Math.floor(r / 10)], ...(r % 10 ? ['y', ES_ONES[r % 10]] : []));
  return out;
}
function esInt(n) {
  if (!Number.isFinite(n) || n >= 1e15) return ['muchos'];
  if (n < 1000) return esUnder1000(n);
  const out = [];
  let rest = n;
  if (rest >= 1e6) {
    const m = Math.floor(rest / 1e6);
    out.push(...(m === 1 ? ['un', 'millon'] : [...esInt(m), 'millones']));
    rest %= 1e6;
  }
  if (rest >= 1000) {
    const k = Math.floor(rest / 1000);
    out.push(...(k === 1 ? [] : esUnder1000(k)), 'mil');
    rest %= 1000;
  }
  if (rest) out.push(...esUnder1000(rest));
  return out;
}

const CURRENCY = { $: ['dollars', 'dolares'], '£': ['pounds', 'libras'], '€': ['euros', 'euros'], '¥': ['yen', 'yenes'] };
const SUFFIX = {
  bn: ['billion', 'mil millones'], b: ['billion', 'mil millones'], m: ['million', 'millones'], mn: ['million', 'millones'],
  k: ['thousand', 'mil'], tn: ['trillion', 'billones'], '%': ['percent', 'por ciento'], km: ['kilometres', 'kilometros'],
  kg: ['kilos', 'kilos'], st: [], nd: [], rd: [], th: [], s: [], º: [], ª: [], 'ºc': ['degrees', 'grados'], '°c': ['degrees', 'grados'],
};
const NUM_RE = /^([$£€¥]?)(\d[\d.,]*\d|\d)([a-z%º°ª]*)$/i;

// Spoken words for a number token ("$1.2bn", "2026", "6.1", "45%", "1.500"
// in Spanish), or null when it is not a number we know how to read.
function numberWords(token, lang) {
  const m = NUM_RE.exec(token);
  if (!m) return null;
  const es = lang === 'es';
  const [, cur, raw, sufRaw] = m;
  const suf = sufRaw.toLowerCase();
  if (suf && !(suf in SUFFIX)) return null;
  // English groups thousands with "," and uses "." for decimals; Spanish the other way round.
  const [sep, point] = es ? ['.', ','] : [',', '.'];
  const grouped = new RegExp(`^\\d{1,3}(\\${sep}\\d{3})+(\\${point}\\d+)?$`).test(raw);
  const body = grouped ? raw.split(sep).join('') : raw;
  let [intPart, decPart] = body.split(point);
  if (decPart === undefined && es && /^\d+\.\d+$/.test(body)) [intPart, decPart] = body.split('.');
  if (!/^\d+$/.test(intPart) || (decPart !== undefined && !/^\d+$/.test(decPart))) return null;
  const int = Number(intPart);
  const words = [];
  const isYear = !cur && decPart === undefined && !suf && !grouped && intPart.length === 4 && int >= 1100 && int <= 2099;
  if (isYear && !es) words.push(...enYear(int));
  else words.push(...(es ? esInt(int) : enInt(int)));
  if (decPart) words.push(es ? 'coma' : 'point', ...[...decPart.slice(0, 4)].map((d) => (es ? ES_ONES : EN_ONES)[Number(d)]));
  const sw = SUFFIX[suf]?.[es ? 1 : 0];
  if (sw) words.push(...String(sw).split(' '));
  if (['st', 'nd', 'rd', 'th'].includes(suf)) words.push('th'); // close enough for timing
  if (cur) words.push(CURRENCY[cur][es ? 1 : 0]);
  return words;
}

const EN_LETTERS = { a: 'ay', b: 'bee', c: 'see', d: 'dee', e: 'ee', f: 'ef', g: 'jee', h: 'aych', i: 'eye', j: 'jay', k: 'kay',
  l: 'el', m: 'em', n: 'en', o: 'oh', p: 'pee', q: 'kyoo', r: 'ar', s: 'es', t: 'tee', u: 'yoo', v: 'vee', w: 'dubbelyoo',
  x: 'eks', y: 'wye', z: 'zed' };
const ES_LETTERS = { a: 'a', b: 'be', c: 'ce', d: 'de', e: 'e', f: 'efe', g: 'ge', h: 'ache', i: 'i', j: 'jota', k: 'ka', l: 'ele',
  m: 'eme', n: 'ene', ñ: 'eñe', o: 'o', p: 'pe', q: 'cu', r: 'erre', s: 'ese', t: 'te', u: 'u', v: 'uve', w: 'uvedoble',
  x: 'equis', y: 'ye', z: 'zeta' };
const SYMBOLS = { '&': ['and', 'y'], '+': ['plus', 'mas'], '%': ['percent', 'por ciento'], '@': ['at', 'arroba'], '#': ['number', 'numero'], '=': ['equals', 'igual'] };

// Acronyms are spelled out ("BBC", "U.S.", "EU"); pronounceable ones ("NASA") are read.
function spelledOut(core) {
  const letters = core.replace(/\./g, '');
  if (!/^\p{Lu}{2,6}$/u.test(letters)) return false;
  if (core.includes('.')) return true;
  return letters.length <= 3 || !/[AEIOU]/.test(letters.slice(1)) || /^[^AEIOU]{2}/.test(letters);
}

// ------------------------------------------------------------------- tokens

// Whitespace-separated chunks of the sentence -> spoken words with source
// positions. Each chunk is one "word" for TTS boundary events.
export function speechTokens(text, lang = 'en') {
  const es = String(lang).toLowerCase().startsWith('es');
  const src = String(text ?? '');
  const out = [];
  const re = /\S+/g;
  let m;
  let w = 0;
  while ((m = re.exec(src))) {
    const chunk = m[0];
    const lead = /^[^\p{L}\p{N}$£€¥&+%@#=]*/u.exec(chunk)[0].length;
    const tailM = /[^\p{L}\p{N}%º°ª]*$/u.exec(chunk.slice(lead));
    const core = chunk.slice(lead, chunk.length - tailM[0].length);
    const tail = tailM[0];
    const pos = m.index + lead;
    let words = null;
    let spelled = false;
    if (!core) {
      const sym = SYMBOLS[chunk];
      if (sym) words = String(sym[es ? 1 : 0]).split(' ');
      else if (/^[—–-]+$/.test(chunk)) {
        if (out.length) out[out.length - 1].pause = Math.max(out[out.length - 1].pause, PAUSE['—']);
        continue;
      } else continue;
    } else if (/\d/.test(core)) {
      words = numberWords(core, es ? 'es' : 'en');
      if (!words) words = core.split(/[^\p{L}\p{N}]+/u).filter(Boolean).flatMap((p) => (/^\d+$/.test(p) ? (es ? esInt(Number(p)) : enInt(Number(p))) : [p.toLowerCase()]));
    } else if (spelledOut(core)) {
      spelled = true;
      words = [...core.replace(/\./g, '').toLowerCase()].map((ch) => (es ? ES_LETTERS : EN_LETTERS)[ch] ?? ch);
    } else {
      words = core.toLowerCase().split(/[-–—/]+/).filter(Boolean);
    }
    let pause = 0;
    for (const ch of tail) {
      const p = /[.!?]/.test(ch) ? PAUSE.end : PAUSE[ch] ?? (/["'’”»)\]]/.test(ch) ? PAUSE.quote : 0);
      pause = Math.max(pause, p);
    }
    if (/\.\.\.|…/.test(tail)) pause = PAUSE['…'];
    // splitSentences already cut at real sentence ends, so a dot inside the
    // sentence belongs to an abbreviation ("Dr.", "U.S.") and is no phrase end.
    const final = /[!?…]/.test(tail);
    out.push({ index: w, src: pos, end: pos + core.length, words, spelled, pause, final, raw: core });
    w++;
  }
  if (out.length) out[out.length - 1].final = true;
  return out;
}

// --------------------------------------------------------------- timeline

const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

/**
 * Build the mouth timeline of one sentence.
 * @returns {{ text, total, segs: Array<{t0,t1,v,o,ci,wi,k,stress}>, words: Array<{ci,end,t0,t1}>, cps }}
 */
export function buildTimeline(text, { lang = 'en', rate = 1 } = {}) {
  const es = String(lang).toLowerCase().startsWith('es');
  const region = String(lang).toLowerCase().split(/[-_]/)[1] ?? 'es';
  const r = Math.min(2.5, Math.max(0.4, Number(rate) || 1));
  const tokens = speechTokens(text, lang);
  const phones = [];
  const words = [];
  tokens.forEach((tok, ti) => {
    const start = phones.length;
    const fn = tok.words.length === 1 && FUNCTION_WORDS.has(tok.words[0]);
    const lower = tok.raw.toLowerCase();
    const literal = !tok.spelled && !/\d/.test(tok.raw);
    let from = 0;
    tok.words.forEach((word, k) => {
      // Where this spoken word sits in the source text (for charIndex).
      const at = literal ? lower.indexOf(word, from) : -1;
      const base = at >= 0 ? at : from;
      if (at >= 0) from = at + word.length;
      const ps = es ? spanishPhones(word, region) : englishPhones(word.replace(/[’‘]/g, "'").replace(/[^a-z']/g, ''));
      const nuclei = ps.filter((p) => p.k === 'v');
      // Stress: first nucleus, or the one after an unstressed prefix; Spanish
      // stress usually sits on the second-to-last syllable.
      let stressAt = 0;
      if (es) stressAt = Math.max(0, nuclei.length - (/[nsaeiouáéíóú]$/.test(word) ? 2 : 1));
      else if (nuclei.length > 1 && word.length > 5 && PREFIX_RE.test(word)) stressAt = 1;
      let nucleus = 0;
      for (const p of ps) {
        const ci = literal ? tok.src + Math.min(base + p.i, tok.raw.length - 1) : tok.src;
        const ph = { ...p, ci, wi: tok.index, stress: false };
        if (p.k === 'v') {
          const stressed = !fn && nucleus === stressAt && !(tok.spelled && k < tok.words.length - 1);
          ph.stress = stressed;
          if (fn) { ph.d *= 0.62; ph.o *= 0.72; }
          else if (stressed) { ph.d *= 1.22; ph.o = Math.min(1, ph.o * 1.1); }
          else if (nuclei.length > 1) { ph.d *= 0.78; ph.o *= 0.82; }
          nucleus++;
        } else if (fn) ph.d *= 0.8;
        phones.push(ph);
      }
      if (k < tok.words.length - 1) phones.push({ v: 'rest', o: 0.2, d: WORD_GAP, k: 'gap', ci: tok.src, wi: tok.index, stress: false });
    });
    // Phrase-final lengthening on the last vowel before a pause or the end.
    if (tok.pause || tok.final || ti === tokens.length - 1) {
      for (let j = phones.length - 1; j >= start; j--) {
        if (phones[j].k === 'v') { phones[j].d *= 1.3; break; }
      }
    }
    if (phones.length > start) {
      const pause = tok.pause ? tok.pause / Math.sqrt(r) * TEMPO : 0;
      words.push({ ci: tok.src, end: tok.end, wi: tok.index });
      if (pause) phones.push({ v: 'rest', o: 0.04, d: pause, k: 'pause', ci: tok.end, wi: tok.index, stress: false, fixed: true });
      else if (ti < tokens.length - 1) phones.push({ v: 'rest', o: 0.3, d: WORD_GAP, k: 'gap', ci: tok.end, wi: tok.index, stress: false });
    }
  });
  // Transparent consonants (k, g, h) take the lip shape of the next vowel in
  // the word (anticipation), or the previous one, at half the openness.
  for (let i = 0; i < phones.length; i++) {
    const p = phones[i];
    if (p.k !== 'x') continue;
    let src = null;
    for (let j = i + 1; j < phones.length && phones[j].wi === p.wi; j++) if (phones[j].k === 'v') { src = phones[j]; break; }
    if (!src) for (let j = i - 1; j >= 0 && phones[j].wi === p.wi; j--) if (phones[j].k === 'v' || phones[j].k === 'g') { src = phones[j]; break; }
    p.v = src ? src.v : 'EE';
    p.o = (src ? src.o : 0.4) * 0.5;
    p.k = 'c';
  }
  // Word gaps take the shape around them (no mouth closing between words).
  for (let i = 0; i < phones.length; i++) {
    const p = phones[i];
    if (p.k !== 'gap') continue;
    const prev = phones[i - 1];
    const next = phones[i + 1];
    p.v = next?.v === 'MBP' ? (prev?.v ?? 'rest') : next?.v ?? prev?.v ?? 'rest';
    p.o = Math.min(prev?.o ?? 0.2, next?.o ?? 0.2, 0.3);
  }
  // Timing, and merge neighbours with the same shape and similar openness
  // (double letters, "nd"): fewer, longer shapes read as calm speech.
  const segs = [];
  let t = 0;
  for (const p of phones) {
    const d = p.fixed ? p.d : (p.d * TEMPO) / r;
    const last = segs[segs.length - 1];
    if (last && last.v === p.v && Math.abs(last.o - p.o) < 0.12 && last.k !== 'pause' && p.k !== 'pause' && last.k !== 'v' && p.k !== 'v') {
      last.o = (last.o * (last.t1 - last.t0) + p.o * d) / (last.t1 - last.t0 + d);
      last.t1 = t + d;
    } else {
      segs.push({ t0: t, t1: t + d, v: p.v, o: p.o, ci: p.ci, wi: p.wi, k: p.k === 'g' ? 'v' : p.k, stress: p.stress, glide: p.k === 'g' });
    }
    t += d;
  }
  // A trailing pause belongs to the gap between sentences, not to this one.
  while (segs.length && segs[segs.length - 1].k === 'pause') t = segs.pop().t0;
  // Word times from the phones that belong to each word (pauses excluded).
  const byIndex = new Map(words.map((wd) => [wd.wi, wd]));
  for (const sg of segs) {
    const wd = byIndex.get(sg.wi);
    if (!wd || sg.k === 'pause') continue;
    if (wd.t0 === undefined) wd.t0 = sg.t0;
    wd.t1 = sg.t1;
  }
  for (const wd of words) {
    if (wd.t0 === undefined) wd.t0 = wd.t1 = 0;
  }
  const total = t;
  const centers = segs.map((s) => (s.t0 + s.t1) / 2);
  const len = String(text ?? '').length;
  return { text: String(text ?? ''), lang: es ? 'es' : 'en', rate: r, total, segs, centers, words, cps: total ? (len / total) * 1000 : 0 };
}

// Index of the word whose text contains `charIndex` (TTS boundary events).
export function wordAtChar(tl, charIndex) {
  let best = 0;
  for (let i = 0; i < tl.words.length; i++) {
    if (tl.words[i].ci <= charIndex) best = i;
    else break;
  }
  return best;
}

const REST_PAD = 70; // ms the mouth takes to open before the first sound / close after the last

function segAt(tl, t) {
  const segs = tl.segs;
  let lo = 0;
  let hi = segs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (segs[mid].t0 <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * The mouth at `t` ms into the sentence. Shapes hold around each sound's
 * centre (longer for dominant ones like lip closures) and blend with a
 * smoothstep in between; the jaw (level) moves continuously from centre to
 * centre with a cosine, so there is one smooth opening per syllable.
 */
export function sampleTimeline(tl, t, out = {}) {
  const segs = tl?.segs ?? [];
  out.viseme = 'rest';
  out.next = 'rest';
  out.mix = 0;
  out.level = 0;
  out.charIndex = -1;
  out.wordIndex = -1;
  out.accent = 0;
  out.pause = false;
  out.speaking = false;
  if (!segs.length || !(t > -REST_PAD) || t > tl.total + REST_PAD) return out;
  const c = tl.centers;
  const n = segs.length;
  // Keyframe pair around t: -1 is the closed mouth before, n the one after.
  let i;
  if (t < c[0]) i = -1;
  else if (t >= c[n - 1]) i = n - 1;
  else {
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (c[mid] <= t) lo = mid;
      else hi = mid - 1;
    }
    i = lo;
  }
  const a = i < 0 ? null : segs[i];
  const b = i + 1 < n ? segs[i + 1] : null;
  const ca = a ? c[i] : -REST_PAD;
  const cb = b ? c[i + 1] : tl.total + REST_PAD;
  const span = Math.max(1, cb - ca);
  const va = a ? a.v : 'rest';
  const vb = b ? b.v : 'rest';
  const ha = a ? (a.t1 - a.t0) * (0.06 + 0.16 * DOMINANCE[va]) : 0;
  const hb = b ? (b.t1 - b.t0) * (0.06 + 0.16 * DOMINANCE[vb]) : 0;
  const blend = Math.max(1, span - ha - hb);
  out.viseme = va;
  out.next = vb;
  out.mix = va === vb ? 0 : smooth((t - ca - ha) / blend);
  const u = (t - ca) / span;
  const k = 0.5 - 0.5 * Math.cos(Math.PI * (u < 0 ? 0 : u > 1 ? 1 : u));
  const oa = a ? a.o : 0;
  const ob = b ? b.o : 0;
  // Gentle declination: sentences start a little more open than they end.
  const decl = 1 - 0.12 * Math.min(1, Math.max(0, t / Math.max(1, tl.total)));
  out.level = Math.max(0, Math.min(1, (oa + (ob - oa) * k) * decl));
  if (t >= 0 && t <= tl.total) {
    const s = segs[segAt(tl, t)];
    out.charIndex = s.ci;
    out.wordIndex = s.wi;
    out.pause = s.k === 'pause';
    out.speaking = true;
    if (s.stress) out.accent = Math.sin(Math.PI * Math.min(1, Math.max(0, (t - s.t0) / Math.max(1, s.t1 - s.t0))));
  }
  return out;
}

// ------------------------------------------------------------------- blips

const BLIP_PITCH = { AH: 1, OH: 0.94, OO: 0.86, WQ: 0.9, EE: 1.2, L: 1.05, S: 1.1, TH: 1.05, FV: 1, MBP: 1, rest: 1 };

/**
 * "Animal Crossing" beeps from the same timeline, one per vowel, so the beeps
 * and the lips can never disagree. Times in ms from the sentence start.
 * @returns {Array<{at, dur, peak, ratio}>}
 */
export function blipPlan(tl, { question = /\?\s*["'’”»)\]]*\s*$/.test(tl?.text ?? '') } = {}) {
  const beeps = [];
  for (const s of tl?.segs ?? []) {
    if (s.k !== 'v' || s.glide) continue;
    const dur = Math.min(150, Math.max(40, (s.t1 - s.t0) * 0.82));
    const along = s.t0 / Math.max(1, tl.total);
    beeps.push({
      at: s.t0,
      dur,
      peak: 0.55 + 0.45 * Math.min(1, s.o / 0.8),
      ratio: BLIP_PITCH[s.v] * (1 - 0.08 * along) * (s.stress ? 1.05 : 1),
    });
  }
  if (question) beeps.slice(-4).forEach((b, i) => { b.ratio *= 1 + 0.05 * (i + 1); });
  return beeps;
}

// -------------------------------------------------------------------- clock

/**
 * Maps the wall clock onto timeline time for one sentence. It free-runs at
 * the estimated speed, re-anchors on every TTS word boundary (learning the
 * engine's real speaking rate as it goes) and eases corrections in over
 * 80-200 ms so the mouth never jumps. Without boundary events it never quite
 * reaches the end before the engine says the utterance has ended.
 */
export class SpeechClock {
  constructor(tl, { speed = 1, soft = true } = {}) {
    this.tl = tl;
    this.speed = Math.min(2, Math.max(0.5, speed)); // timeline ms per wall ms
    this.soft = soft; // free-running: slow down near the end instead of running out
    this.startR = null;
    this.anchorT = 0;
    this.anchorR = 0;
    this.err = 0;
    this.last = -Infinity;
    this.lastWord = -1;
    this.lastWordR = 0;
    this.lastWordT = 0;
    this.boundaries = 0;
    this.ended = null;
  }

  get started() {
    return this.startR !== null;
  }

  start(now) {
    if (this.startR !== null) return;
    this.startR = now;
    this.anchorR = now;
    this.anchorT = 0;
    this.err = 0;
  }

  // A TTS 'boundary' event at the start of word `wi` (index into tl.words).
  anchorWord(wi, now) {
    const w = this.tl.words[wi];
    if (!w) return;
    if (!this.started) this.start(now);
    if (wi <= this.lastWord) return; // repeated or out-of-order events
    // Learn the rate from the distance between two boundaries.
    if (this.lastWord >= 0 && now - this.lastWordR > 40) {
      const observed = (w.t0 - this.lastWordT) / (now - this.lastWordR);
      if (observed > 0.3 && observed < 3) this.speed = Math.min(2, Math.max(0.5, this.speed + (observed - this.speed) * 0.5));
    }
    const current = this.timeAt(now);
    this.anchorT = w.t0;
    this.anchorR = now;
    this.err = w.t0 - current; // eased away below instead of jumping
    this.lastWord = wi;
    this.lastWordR = now;
    this.lastWordT = w.t0;
    this.boundaries++;
  }

  anchorChar(charIndex, now) {
    this.anchorWord(wordAtChar(this.tl, charIndex), now);
  }

  end(now) {
    if (this.ended === null) this.ended = now;
  }

  // Timeline ms at wall time `now` (monotonic), or null before the start.
  timeAt(now) {
    if (this.startR === null || now < this.startR) return null;
    if (this.ended !== null) return this.last; // the engine closes the mouth from here
    const total = this.tl.total;
    // Corrections ease in; big ones (a late first boundary) a little slower.
    let t = this.anchorT + (now - this.anchorR) * this.speed - this.err * Math.exp(-(now - this.anchorR) / (80 + 0.12 * Math.abs(this.err)));
    if (this.boundaries >= 2) {
      // The engine reports words reliably: hold at the end of the current word
      // until it reaches the next one (unless it has gone quiet for too long).
      const nextW = this.tl.words[this.lastWord + 1];
      const due = nextW ? this.lastWordR + (nextW.t0 - this.lastWordT) / this.speed : 0;
      if (nextW && now < due + 600 && t > nextW.t0 - 10) t = nextW.t0 - 10 + 30 * (1 - Math.exp(-(t - nextW.t0 + 10) / 30));
    }
    if (this.soft && t > total * 0.9) {
      const room = total * 0.08;
      t = total * 0.9 + room * (1 - Math.exp(-(t - total * 0.9) / Math.max(1, room)));
    }
    if (t < this.last) t = this.last;
    this.last = t;
    return t;
  }
}
