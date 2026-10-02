// Speech text: turns news copy into what a newsreader actually says, and plans
// how it is phrased. TTS engines read exactly what they are given, so "$2bn"
// comes out as "dollar two b n", "King Charles III" as "King Charles roman
// three" and "IMF" as a word. This module rewrites copy for the ear:
//
//   normalizeForSpeech('The IMF lent $2bn on 2 October.', { lang: 'en-GB' })
//     -> { spoken: 'The I-M-F lent two billion dollars on the second of October.', map }
//
// `map[i]` is the offset in the ORIGINAL text of spoken character i (plus one
// final entry = original length), so word timings from the voice engine can
// be mapped back to the text the captions show and the cues point into.
//
//   planProsody(text, { persona: 'nova', emotion: 'happy', segmentType: 'story' })
//     -> [{ text, spoken, start, end, pauseAfter, speedFactor, emphasis, ... }]
//
// splits copy into phrases at clause boundaries with natural pauses and pace
// per presenter and mood (seeded, so the same line always sounds the same).
//
// Plain ES module with no DOM: the server (Kokoro voice worker) and the browser
// (speechSynthesis fallback, lip-sync timeline) share it. Unit tested in
// test/speechtext.test.js. The spoken forms were checked against espeak-ng,
// the phonemiser Kokoro uses (acronyms hyphen-spelled, the letter "A" written
// "eigh" inside them, respellings in LEXICON).

import { ACTIONS, EMOTIONS } from '../cues.js';

// ================================================================ mapped text

// A working string plus, for every character, its offset in the original.
function mapped(text) {
  const m = new Array(text.length + 1);
  for (let i = 0; i <= text.length; i++) m[i] = i;
  return { s: text, m };
}

// Replace every match of the global regex `re`. `fn(match, s)` returns the new
// text (all of it maps to the start of the match), an array of
// [text, offsetInMatch] pieces for a finer map, or null/undefined to keep it.
function sub(st, re, fn) {
  const { s, m } = st;
  let out = '';
  const map = [];
  let last = 0;
  let changed = false;
  for (const mt of s.matchAll(re)) {
    const r = fn(mt, s);
    if (r == null || r === mt[0]) continue;
    const a = mt.index;
    const b = a + mt[0].length;
    out += s.slice(last, a);
    for (let i = last; i < a; i++) map.push(m[i]);
    if (typeof r === 'string') {
      out += r;
      for (let k = 0; k < r.length; k++) map.push(m[a]);
    } else {
      for (const [t, rel] of r) {
        out += t;
        const src = m[Math.min(a + (rel || 0), b)];
        for (let k = 0; k < t.length; k++) map.push(src);
      }
    }
    last = b;
    changed = true;
  }
  if (!changed) return st;
  out += s.slice(last);
  for (let i = last; i <= s.length; i++) map.push(m[i]);
  return { s: out, m: map };
}

/** Original offset of spoken character `i` (clamped). */
export function toOriginal(map, i) {
  if (!map || !map.length) return 0;
  return map[Math.max(0, Math.min(map.length - 1, i | 0))];
}

/** First spoken offset whose original offset is >= `j` (inverse of toOriginal). */
export function toSpoken(map, j) {
  let lo = 0;
  let hi = map.length - 1;
  if (j <= map[0]) return 0;
  if (j > map[hi]) return hi;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (map[mid] >= j) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/** Move cues ({char} offsets into the original text) onto the spoken text. */
export function remapCues(cues, map) {
  return (cues || []).map((c) => ({ ...c, char: toSpoken(map, c.char) }));
}

// ================================================================ languages

function langInfo(lang) {
  const l = String(lang || 'en').toLowerCase();
  const es = l.startsWith('es');
  return { es, gb: !es && /^en[-_](gb|uk|ie|au|nz|za|in)/.test(l), us: !es && !/^en[-_](gb|uk|ie|au|nz|za|in)/.test(l) };
}

// ---------------------------------------------------------------- English numbers
const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const SCALES = ['', 'thousand', 'million', 'billion', 'trillion'];

function tensEn(n) {
  if (n < 20) return ONES[n];
  const o = n % 10;
  return o ? `${TENS[Math.floor(n / 10)]}-${ONES[o]}` : TENS[Math.floor(n / 10)];
}

function hundredsEn(n, gb) {
  const h = Math.floor(n / 100);
  const r = n % 100;
  if (!h) return tensEn(r);
  return r ? `${ONES[h]} hundred ${gb ? 'and ' : ''}${tensEn(r)}` : `${ONES[h]} hundred`;
}

function cardinalEn(n, gb) {
  if (n === 0) return 'zero';
  if (n < 0) return `minus ${cardinalEn(-n, gb)}`;
  if (!Number.isSafeInteger(n) || n >= 1e15) return digitsEn(String(n));
  const groups = [];
  for (let x = n; x > 0; x = Math.floor(x / 1000)) groups.push(x % 1000);
  const parts = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i];
    if (!g) continue;
    // British "and" before a final group under 100: "two thousand and five".
    if (i === 0 && gb && g < 100 && parts.length) parts.push('and');
    parts.push(hundredsEn(g, gb) + (SCALES[i] ? ` ${SCALES[i]}` : ''));
  }
  return parts.join(' ');
}

function digitsEn(str, gb = false) {
  return [...String(str)].filter((d) => /\d/.test(d)).map((d) => (d === '0' && gb ? 'oh' : ONES[+d])).join(' ');
}

const ORD_IRREG = { one: 'first', two: 'second', three: 'third', five: 'fifth', eight: 'eighth', nine: 'ninth', twelve: 'twelfth' };
function ordinalOfWords(words) {
  const m = /([a-z]+)$/.exec(words);
  if (!m) return words;
  const last = m[1];
  const o = ORD_IRREG[last] || (last.endsWith('y') ? `${last.slice(0, -1)}ieth` : `${last}th`);
  return words.slice(0, m.index) + o;
}

function yearEn(n, gb) {
  if (n % 1000 === 0 || (n >= 2000 && n <= 2009) || n < 1000 || n > 2099) return cardinalEn(n, gb);
  const hi = Math.floor(n / 100);
  const lo = n % 100;
  if (lo === 0) return `${tensEn(hi)} hundred`;
  if (lo < 10) return `${tensEn(hi)} oh ${ONES[lo]}`;
  return `${tensEn(hi)} ${tensEn(lo)}`;
}

// ---------------------------------------------------------------- Spanish numbers
const ES_ONES = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce',
  'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidós',
  'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
const ES_TENS = ['', '', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const ES_HUNDREDS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos',
  'ochocientos', 'novecientos'];

function esUnder1000(n) {
  if (n === 100) return 'cien';
  const h = Math.floor(n / 100);
  const r = n % 100;
  let t = '';
  if (r) t = r < 30 ? ES_ONES[r] : ES_TENS[Math.floor(r / 10)] + (r % 10 ? ` y ${ES_ONES[r % 10]}` : '');
  return [h ? ES_HUNDREDS[h] : '', t].filter(Boolean).join(' ');
}

// `apocope`: "uno" -> "un" before a noun ("un millón", "veintiún mil").
function cardinalEs(n, apocope = false) {
  if (n === 0) return 'cero';
  if (n < 0) return `menos ${cardinalEs(-n, apocope)}`;
  if (!Number.isSafeInteger(n) || n >= 1e15) return [...String(n)].map((d) => ES_ONES[+d]).join(' ');
  const parts = [];
  const billions = Math.floor(n / 1e12);
  const millions = Math.floor(n / 1e6) % 1e6;
  const thousands = Math.floor(n / 1000) % 1000;
  const rest = n % 1000;
  if (billions) parts.push(billions === 1 ? 'un billón' : `${cardinalEs(billions, true)} billones`);
  if (millions) parts.push(millions === 1 ? 'un millón' : `${cardinalEs(millions, true)} millones`);
  if (thousands) parts.push(thousands === 1 ? 'mil' : `${cardinalEs(thousands, true)} mil`);
  if (rest) parts.push(esUnder1000(rest));
  let out = parts.join(' ');
  if (apocope) out = out.replace(/veintiuno$/, 'veintiún').replace(/uno$/, 'un');
  return out;
}

// ---------------------------------------------------------------- number parsing

// One numeric token, as written in the copy.
const NUM_EN = String.raw`\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?`;
const NUM_ES = String.raw`\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d{1,3}(?:,\d{3})+(?![,\d])|\d+(?:[.,]\d+)?`;

// Split "1,234.5" (or Spanish "1.234,5") into integer and fraction digits.
function parseNum(str, L) {
  let s = String(str);
  let sep = '.';
  if (L.es) {
    if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '');
    else if (/^\d{1,3}(,\d{3})+$/.test(s)) s = s.replace(/,/g, '');
    if (s.includes(',')) sep = ',';
  } else s = s.replace(/,/g, '');
  const [int, frac] = s.split(sep);
  return { int: int || '0', frac: frac === undefined ? null : frac, sep };
}

function numValue(str, L) {
  const p = parseNum(str, L);
  return Number(`${p.int}${p.frac !== null ? `.${p.frac}` : ''}`);
}

function isOne(str, L) {
  const p = parseNum(str, L);
  return p.int === '1' && (p.frac === null || /^0*$/.test(p.frac));
}

// Words for a plain number token: cardinal, decimal or a digit string.
function numberWords(str, L, { apocope = false } = {}) {
  const p = parseNum(str, L);
  if (L.es) {
    let w = cardinalEs(Number(p.int), apocope && p.frac === null);
    if (p.frac !== null) {
      const fracWords = p.frac.length <= 2 && !p.frac.startsWith('0') ? cardinalEs(Number(p.frac)) : [...p.frac].map((d) => ES_ONES[+d]).join(' ');
      w += ` ${p.sep === ',' ? 'coma' : 'punto'} ${fracWords}`;
    }
    return w;
  }
  if (p.int.length > 1 && p.int.startsWith('0') && p.frac === null) return digitsEn(p.int, L.gb);
  let w = p.int === '0' && p.frac !== null ? (L.gb ? 'nought' : 'zero') : cardinalEn(Number(p.int), L.gb);
  if (p.frac !== null) w += ` point ${[...p.frac].map((d) => ONES[+d]).join(' ')}`;
  return w;
}

function ordinalWords(n, L, fem = false) {
  if (L.es) {
    const ES_ORD = ['', 'primero', 'segundo', 'tercero', 'cuarto', 'quinto', 'sexto', 'séptimo', 'octavo', 'noveno', 'décimo'];
    const w = n <= 10 ? ES_ORD[n] : cardinalEs(n);
    return fem && n <= 10 ? w.replace(/o$/, 'a') : w;
  }
  return ordinalOfWords(cardinalEn(n, L.gb));
}

function yearWords(n, L) {
  return L.es ? cardinalEs(n) : yearEn(n, L.gb);
}

// "1990s" -> "nineteen nineties", "80s" -> "eighties".
function pluralWords(words) {
  return words.replace(/([a-z]+)$/, (w) => (w.endsWith('y') ? `${w.slice(0, -1)}ies` : w.endsWith('x') ? `${w}es` : `${w}s`));
}

// ================================================================ word tables

const W = {
  en: {
    to: 'to', and: 'and', point: 'point', minus: 'minus', plus: 'plus', percent: 'percent', times: 'times', by: 'by',
    per: 'per', number: 'number', degrees: ['degree', 'degrees'], about: 'about',
  },
  es: {
    to: 'a', and: 'y', point: 'punto', minus: 'menos', plus: 'más', percent: 'por ciento', times: 'veces', by: 'por',
    per: 'por', number: 'número', degrees: ['grado', 'grados'], about: 'unos',
  },
};

// Currency: [singular, plural, sub-unit singular, sub-unit plural] (en, es).
const CURRENCIES = {
  $: { en: ['dollar', 'dollars', 'cent', 'cents'], es: ['dólar', 'dólares', 'centavo', 'centavos'] },
  US$: { en: ['US dollar', 'US dollars', 'cent', 'cents'], es: ['dólar estadounidense', 'dólares estadounidenses', 'centavo', 'centavos'] },
  A$: { en: ['Australian dollar', 'Australian dollars', 'cent', 'cents'], es: ['dólar australiano', 'dólares australianos'] },
  C$: { en: ['Canadian dollar', 'Canadian dollars', 'cent', 'cents'], es: ['dólar canadiense', 'dólares canadienses'] },
  NZ$: { en: ['New Zealand dollar', 'New Zealand dollars', 'cent', 'cents'], es: ['dólar neozelandés', 'dólares neozelandeses'] },
  HK$: { en: ['Hong Kong dollar', 'Hong Kong dollars', 'cent', 'cents'], es: ['dólar de Hong Kong', 'dólares de Hong Kong'] },
  S$: { en: ['Singapore dollar', 'Singapore dollars', 'cent', 'cents'], es: ['dólar de Singapur', 'dólares de Singapur'] },
  R$: { en: ['real', 'reais'], es: ['real', 'reales'] },
  '€': { en: ['euro', 'euros', 'cent', 'cents'], es: ['euro', 'euros', 'céntimo', 'céntimos'] },
  '£': { en: ['pound', 'pounds', 'penny', 'pence'], es: ['libra', 'libras', 'penique', 'peniques'] },
  '¥': { en: ['yen', 'yen'], es: ['yen', 'yenes'] },
  '₹': { en: ['rupee', 'rupees'], es: ['rupia', 'rupias'] },
  '₩': { en: ['won', 'won'], es: ['won', 'wones'] },
  '₽': { en: ['rouble', 'roubles'], es: ['rublo', 'rublos'] },
  '₺': { en: ['lira', 'lira'], es: ['lira', 'liras'] },
  '₦': { en: ['naira', 'naira'], es: ['naira', 'nairas'] },
  CHF: { en: ['Swiss franc', 'Swiss francs'], es: ['franco suizo', 'francos suizos'] },
  USD: { en: ['US dollar', 'US dollars', 'cent', 'cents'], es: ['dólar', 'dólares', 'centavo', 'centavos'] },
  EUR: { en: ['euro', 'euros', 'cent', 'cents'], es: ['euro', 'euros', 'céntimo', 'céntimos'] },
  GBP: { en: ['pound', 'pounds', 'penny', 'pence'], es: ['libra', 'libras'] },
  JPY: { en: ['yen', 'yen'], es: ['yen', 'yenes'] },
  CNY: { en: ['yuan', 'yuan'], es: ['yuan', 'yuanes'] },
  RMB: { en: ['yuan', 'yuan'], es: ['yuan', 'yuanes'] },
  INR: { en: ['rupee', 'rupees'], es: ['rupia', 'rupias'] },
  AUD: { en: ['Australian dollar', 'Australian dollars'], es: ['dólar australiano', 'dólares australianos'] },
  CAD: { en: ['Canadian dollar', 'Canadian dollars'], es: ['dólar canadiense', 'dólares canadienses'] },
};
CURRENCIES.AU$ = CURRENCIES.A$;
CURRENCIES.CA$ = CURRENCIES.C$;
const CUR_SYM = String.raw`US\$|AU?\$|CA?\$|NZ\$|HK\$|S\$|R\$|\$|€|£|¥|₹|₩|₽|₺|₦`;
const CUR_CODE = 'USD|EUR|GBP|JPY|CNY|RMB|INR|AUD|CAD|CHF';

// Scale suffixes: "bn", "m", "k"... (en word, es word). Single capitals only
// count after a currency sign ("$5B"), where they cannot be a model name.
const SCALE_WORDS = {
  k: ['thousand', 'mil'], thousand: ['thousand', 'mil'],
  m: ['million', 'millones'], mn: ['million', 'millones'], mln: ['million', 'millones'], million: ['million', 'millones'],
  bn: ['billion', 'mil millones'], b: ['billion', 'mil millones'], billion: ['billion', 'mil millones'],
  tn: ['trillion', 'billones'], trn: ['trillion', 'billones'], t: ['trillion', 'billones'], trillion: ['trillion', 'billones'],
  millones: [null, 'millones'], millón: [null, 'millón'], mil: [null, 'mil'], billones: [null, 'billones'],
};
const SCALE_RE = String.raw`(?:\s?(?:bn|billion|tn|trn|trillion|mn|mln|million|thousand|millones|millón|billones|m|k|B|M|K|T)(?![\p{L}\p{N}]))`;

function scaleWord(raw, L) {
  if (!raw) return '';
  const key = raw.trim();
  const e = SCALE_WORDS[key] || SCALE_WORDS[key.toLowerCase()];
  if (!e) return '';
  return (L.es ? e[1] : e[0]) || '';
}

// Units after a number: case-sensitive abbreviation -> [singular, plural] (en, es).
// US spelling of metre/litre is pronounced the same, so one spelling is enough.
const UNITS = {
  'km/h': [['kilometre per hour', 'kilometres per hour'], ['kilómetro por hora', 'kilómetros por hora']],
  kph: [['kilometre per hour', 'kilometres per hour'], ['kilómetro por hora', 'kilómetros por hora']],
  kmh: [['kilometre per hour', 'kilometres per hour'], ['kilómetro por hora', 'kilómetros por hora']],
  mph: [['mile per hour', 'miles per hour'], ['milla por hora', 'millas por hora']],
  'm/s': [['metre per second', 'metres per second'], ['metro por segundo', 'metros por segundo']],
  'km/s': [['kilometre per second', 'kilometres per second'], ['kilómetro por segundo', 'kilómetros por segundo']],
  'km²': [['square kilometre', 'square kilometres'], ['kilómetro cuadrado', 'kilómetros cuadrados']],
  km2: [['square kilometre', 'square kilometres'], ['kilómetro cuadrado', 'kilómetros cuadrados']],
  'sq km': [['square kilometre', 'square kilometres'], ['kilómetro cuadrado', 'kilómetros cuadrados']],
  'm²': [['square metre', 'square metres'], ['metro cuadrado', 'metros cuadrados']],
  'sq m': [['square metre', 'square metres'], ['metro cuadrado', 'metros cuadrados']],
  'sq ft': [['square foot', 'square feet'], ['pie cuadrado', 'pies cuadrados']],
  'sq mi': [['square mile', 'square miles'], ['milla cuadrada', 'millas cuadradas']],
  km: [['kilometre', 'kilometres'], ['kilómetro', 'kilómetros']],
  cm: [['centimetre', 'centimetres'], ['centímetro', 'centímetros']],
  mm: [['millimetre', 'millimetres'], ['milímetro', 'milímetros']],
  mi: [['mile', 'miles'], ['milla', 'millas']],
  ft: [['foot', 'feet'], ['pie', 'pies']],
  ha: [['hectare', 'hectares'], ['hectárea', 'hectáreas']],
  kg: [['kilogram', 'kilograms'], ['kilo', 'kilos']],
  mg: [['milligram', 'milligrams'], ['miligramo', 'miligramos']],
  g: [['gram', 'grams'], ['gramo', 'gramos']],
  lb: [['pound', 'pounds'], ['libra', 'libras']],
  lbs: [['pound', 'pounds'], ['libra', 'libras']],
  oz: [['ounce', 'ounces'], ['onza', 'onzas']],
  ml: [['millilitre', 'millilitres'], ['mililitro', 'mililitros']],
  '°C': [['degree Celsius', 'degrees Celsius'], ['grado', 'grados']],
  'ºC': [['degree Celsius', 'degrees Celsius'], ['grado', 'grados']],
  '° C': [['degree Celsius', 'degrees Celsius'], ['grado', 'grados']],
  '°F': [['degree Fahrenheit', 'degrees Fahrenheit'], ['grado Fahrenheit', 'grados Fahrenheit']],
  'ºF': [['degree Fahrenheit', 'degrees Fahrenheit'], ['grado Fahrenheit', 'grados Fahrenheit']],
  '°': [['degree', 'degrees'], ['grado', 'grados']],
  'º': [['degree', 'degrees'], ['grado', 'grados']],
  kW: [['kilowatt', 'kilowatts'], ['kilovatio', 'kilovatios']],
  MW: [['megawatt', 'megawatts'], ['megavatio', 'megavatios']],
  GW: [['gigawatt', 'gigawatts'], ['gigavatio', 'gigavatios']],
  TW: [['terawatt', 'terawatts'], ['teravatio', 'teravatios']],
  kWh: [['kilowatt hour', 'kilowatt hours'], ['kilovatio hora', 'kilovatios hora']],
  MWh: [['megawatt hour', 'megawatt hours'], ['megavatio hora', 'megavatios hora']],
  GWh: [['gigawatt hour', 'gigawatt hours'], ['gigavatio hora', 'gigavatios hora']],
  TWh: [['terawatt hour', 'terawatt hours'], ['teravatio hora', 'teravatios hora']],
  W: [['watt', 'watts'], ['vatio', 'vatios']],
  KB: [['kilobyte', 'kilobytes'], ['kilobyte', 'kilobytes']],
  MB: [['megabyte', 'megabytes'], ['megabyte', 'megabytes']],
  GB: [['gigabyte', 'gigabytes'], ['gigabyte', 'gigabytes']],
  TB: [['terabyte', 'terabytes'], ['terabyte', 'terabytes']],
  PB: [['petabyte', 'petabytes'], ['petabyte', 'petabytes']],
  Kbps: [['kilobit per second', 'kilobits per second'], ['kilobit por segundo', 'kilobits por segundo']],
  Mbps: [['megabit per second', 'megabits per second'], ['megabit por segundo', 'megabits por segundo']],
  Gbps: [['gigabit per second', 'gigabits per second'], ['gigabit por segundo', 'gigabits por segundo']],
  GHz: [['gigahertz', 'gigahertz'], ['gigahercio', 'gigahercios']],
  MHz: [['megahertz', 'megahertz'], ['megahercio', 'megahercios']],
  kHz: [['kilohertz', 'kilohertz'], ['kilohercio', 'kilohercios']],
  Hz: [['hertz', 'hertz'], ['hercio', 'hercios']],
  mAh: [['milliamp hour', 'milliamp hours'], ['miliamperio hora', 'miliamperios hora']],
  fps: [['frame per second', 'frames per second'], ['fotograma por segundo', 'fotogramas por segundo']],
  bpd: [['barrel a day', 'barrels a day'], ['barril al día', 'barriles al día']],
  mpg: [['mile per gallon', 'miles per gallon'], ['milla por galón', 'millas por galón']],
  yrs: [['year', 'years'], ['año', 'años']],
  yr: [['year', 'years'], ['año', 'años']],
  hrs: [['hour', 'hours'], ['hora', 'horas']],
  hr: [['hour', 'hours'], ['hora', 'horas']],
  h: [['hour', 'hours'], ['hora', 'horas']],
  mins: [['minute', 'minutes'], ['minuto', 'minutos']],
  min: [['minute', 'minutes'], ['minuto', 'minutos']],
  secs: [['second', 'seconds'], ['segundo', 'segundos']],
  sec: [['second', 'seconds'], ['segundo', 'segundos']],
  ms: [['millisecond', 'milliseconds'], ['milisegundo', 'milisegundos']],
  bps: [['basis point', 'basis points'], ['punto básico', 'puntos básicos']],
  bp: [['basis point', 'basis points'], ['punto básico', 'puntos básicos']],
  pp: [['percentage point', 'percentage points'], ['punto porcentual', 'puntos porcentuales']],
  ppt: [['percentage point', 'percentage points'], ['punto porcentual', 'puntos porcentuales']],
  ppts: [['percentage point', 'percentage points'], ['punto porcentual', 'puntos porcentuales']],
};
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const UNIT_RE = Object.keys(UNITS).sort((a, b) => b.length - a.length).map(escRe).join('|');

function unitWord(key, plural, L) {
  const u = UNITS[key];
  return u[L.es ? 1 : 0][plural ? 1 : 0];
}

const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_ABBR = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Sept: 8, Oct: 9, Nov: 10, Dec: 11 };
const MONTH_RE = `(?:${MONTHS_EN.join('|')}|(?:${Object.keys(MONTH_ABBR).join('|')})\\.?)`;
const MONTHS_ES = 'enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre';
const DAYS_ABBR = { Mon: 'Monday', Tue: 'Tuesday', Tues: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Thur: 'Thursday', Thurs: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday' };

function monthName(raw) {
  const k = raw.replace('.', '');
  return k in MONTH_ABBR ? MONTHS_EN[MONTH_ABBR[k]] : k;
}

// Words that start sentences: after "U.S." or a single initial they mean the
// full stop really ends a sentence ("talks with the U.S. The meeting...").
const SENTENCE_STARTERS = new Set(('The A An It He She They We I You This That These Those There Here But And So Yet Or ' +
  'In On At After Before When While As If Meanwhile However Officials Police Its His Her Their Our Now Today Yesterday ' +
  'Tomorrow Later Earlier Some Many Most Both Neither Nobody Everyone One Two Three Who What Why How Where').split(' '));

// Count nouns that follow a quantity, not a year ("2000 people", "1500 staff").
const COUNT_NOUNS = new Set(('people staff police children women men personnel cattle sheep fish deer aircraft feet ' +
  'crew youth livestock poultry offspring').split(' '));
const NOT_PLURAL = new Set('was has is its this us as his hers ours yours always perhaps across plus thus less unless'.split(' '));
const YEAR_BEFORE = new Set(('in since by until till from of during before after early late mid the circa year years summer ' +
  'winter spring autumn fall between through throughout around season class vintage election elections budget ' +
  'january february march april may june july august september october november december').split(' '));
const QTY_BEFORE = new Set('about some nearly almost over than least fewer roughly approximately just only up exactly total'.split(' '));

const wordBefore = (s, i) => {
  const m = /([\p{L}']+)[^\p{L}\p{N}]*$/u.exec(s.slice(Math.max(0, i - 48), i));
  return m ? m[1] : '';
};
const wordAfter = (s, i) => {
  const m = /^[ \t]+([\p{L}][\p{L}']*)/u.exec(s.slice(i, i + 48));
  return m ? m[1] : '';
};
const isCountNoun = (w) => !!w && w === w.toLowerCase() && (COUNT_NOUNS.has(w) || (/[^s]s$/.test(w) && !NOT_PLURAL.has(w) && w.length > 2));

// ================================================================ lexicon

// Respellings for names espeak (Kokoro's phonemiser) and browser voices get
// wrong. Each respelling was checked against espeak-ng's phonemes; keep them
// plain words (no digits, no runs of capitals) so later rules leave them alone.
export const LEXICON = {
  // places
  Reykjavik: 'Rake-yavik', Niger: 'Neezhair', Lviv: 'Luh-veev', Kyiv: 'Keev', Tbilisi: 'Tbih-leesee',
  Wroclaw: 'Vrotswaf', 'Wrocław': 'Vrotswaf', Lodz: 'Wooj', 'Łódź': 'Wooj', Bydgoszcz: 'Bidgosh', Szczecin: 'Shetcheen',
  Xinjiang: 'Shinjyang', Xiamen: 'Shyahmen', Chongqing: 'Chong-ching', Qingdao: 'Ching-dow', Tianjin: 'Tee-en-jin',
  Urumqi: 'Ooroomchee', Chisinau: 'Keeshee-now', 'Chișinău': 'Keeshee-now', Tigray: 'Teegray', Sanaa: 'Sah-nah',
  "Sana'a": 'Sah-nah', Mykolaiv: 'Mikolah-yiv', Bakhmut: 'Bahkmoot', Phuket: 'Pooket', 'Ho Chi Minh': 'Hoe Chee Min',
  Niamey: 'Nee-ahmay', "N'Djamena": 'Enjahmayna', Taoiseach: 'Teeshock', 'Dáil': 'Doyle',
  // people
  'Xi Jinping': 'Shee Jinping', Guterres: 'Goo-terresh', Mbappe: 'Embappay', 'Mbappé': 'Embappay', Milei: 'Mee-lay',
  Erdogan: 'Erdowan', 'Erdoğan': 'Erdowan', Zelenskyy: 'Zelensky', Maduro: 'Mah-doo-roh', Merz: 'Mairts',
  Scholz: 'Sholts', 'Sánchez': 'Sanchez', Kagame: 'Ka-gahmay', Orban: 'Orbahn', 'Orbán': 'Orbahn',
  Lagarde: 'Luh-gard', 'von der Leyen': 'fon der Lyen', Putin: 'Pootin', Navalny: 'Nuh-valnee',
  'Kim Jong Un': 'Kim Jong Oon', Houthi: 'Hoothee', Houthis: 'Hootheez', Uyghur: 'Weeger', Uyghurs: 'Weegers',
  Uighur: 'Weeger', Uighurs: 'Weegers', Bundestag: 'Boondestahk',
  // organisations, brands and tech words
  UNRWA: 'Unrah', NOAA: 'Noah', ECOWAS: 'Ekohwas', UEFA: 'Yoo-wayfa', FTSE: 'Footsie',
  'S&P': 'S and P', 'AT&T': 'A-T and T', 'A&E': 'eigh and E', 'M&S': 'M and S', 'P&O': 'P and O',
  iOS: 'eye O-S', macOS: 'mac O-S', mRNA: 'M-R-N-eigh', PhD: 'P-H-D', 'Ph.D.': 'P-H-D', AfD: 'eigh-F-D',
  xAI: 'ex eigh-I', Huawei: 'Wahway', Xiaomi: 'Shau-mee', Porsche: 'Porsha', Nvidia: 'Envidia', NVIDIA: 'Envidia',
  plc: 'P-L-C', Ltd: 'Limited',
  // our own channel
  'GLOBIT 24': 'Globit twenty-four', 'UNIT-8': 'Unit Eight', Reyes: 'Rayess',
};

const lexiconCache = new WeakMap();
const userLexicon = {};
let baseLexicon = null; // LEXICON + addPronunciations, rebuilt when that changes
const mergedCache = new WeakMap(); // per-call lexicon object -> merged table

/** Add or override respellings for every later call (e.g. from config). */
export function addPronunciations(entries) {
  for (const [k, v] of Object.entries(entries || {})) if (k && typeof v === 'string') userLexicon[k] = v;
  baseLexicon = null;
}

// The merged table for a call; compiled matchers are cached per table object.
function lexiconFor(extra) {
  if (!baseLexicon) baseLexicon = { ...LEXICON, ...userLexicon };
  if (!extra) return baseLexicon;
  let hit = mergedCache.get(extra);
  if (!hit || hit.base !== baseLexicon) {
    hit = { base: baseLexicon, table: { ...baseLexicon, ...extra } };
    mergedCache.set(extra, hit);
  }
  return hit.table;
}

function lexiconMatcher(lex) {
  let hit = lexiconCache.get(lex);
  if (hit) return hit;
  const table = new Map();
  for (const [k, v] of Object.entries(lex)) {
    table.set(k, v);
    if (/[a-z]/.test(k) && !table.has(k.toUpperCase())) table.set(k.toUpperCase(), v);
  }
  const keys = [...table.keys()].sort((a, b) => b.length - a.length).map(escRe);
  const re = keys.length ? new RegExp(`(?<![\\p{L}\\p{N}&-])(?:${keys.join('|')})(?![\\p{L}\\p{N}&]|-\\p{L})`, 'gu') : null;
  hit = { re, table };
  lexiconCache.set(lex, hit);
  return hit;
}

function applyLexicon(st, lex) {
  const { re, table } = lexiconMatcher(lex);
  return re ? sub(st, re, (mt) => table.get(mt[0])) : st;
}

// ================================================================ acronyms

// Read as words, with the spoken form ("NATO" -> "Nato", not "N-A-T-O").
const WORD_ACRONYMS_ES = { ONU: 'Onu', OTAN: 'Otan', OPEP: 'Opep', PSOE: 'Pesoe', OVNI: 'ovni', SIDA: 'sida', UNICEF: 'Unicef', UNESCO: 'Unesco', COVID: 'Covid', FIFA: 'Fifa', UEFA: 'Uefa', NASA: 'Nasa', BRICS: 'Brics', OCDE: 'Ocde', ERE: 'ere', IVA: 'iva', DANA: 'dana', RENFE: 'Renfe', AENA: 'Aena', IBEX: 'Ibex' };
const WORD_ACRONYMS = {
  NASA: 'Nasa', NATO: 'Nato', UNICEF: 'Unicef', UNESCO: 'Unesco', COVID: 'Covid', OPEC: 'Opec', FIFA: 'Fifa',
  ASEAN: 'Asean', BRICS: 'Brics', CERN: 'Cern', NAFTA: 'Nafta', OFCOM: 'Ofcom', OFSTED: 'Ofsted', OFGEM: 'Ofgem',
  SARS: 'Sars', MERS: 'Mers', AIDS: 'Aids', ISIS: 'Isis', DAESH: 'Daesh', MERCOSUR: 'Mercosur', FRONTEX: 'Frontex',
  EUROPOL: 'Europol', INTERPOL: 'Interpol', EUROSTAT: 'Eurostat', NIMBY: 'Nimby', SWAT: 'Swat', LASER: 'laser',
  RADAR: 'radar', SONAR: 'sonar', SCUBA: 'scuba', CAPTCHA: 'captcha', COBRA: 'Cobra', SAGE: 'Sage', FEMA: 'Fema',
  OSHA: 'Osha', DARPA: 'Darpa', BAFTA: 'Bafta', NASCAR: 'Nascar', COP: 'Cop', UNGA: 'Unga', ACAS: 'Acas',
  UCAS: 'Yoocas', HAMAS: 'Hamas', FARC: 'Farc', AUKUS: 'Awkus', LEGO: 'Lego', PIN: 'pin', SIM: 'sim', LAN: 'lan',
  RAM: 'ram', ROM: 'rom', OK: 'okay', ESA: 'Eesa', IRA: 'I-R-eigh', UNIFIL: 'Unifil', COVAX: 'Covax',
};

// Spelled out even though they look pronounceable, or used to resolve shouting.
const LETTER_ACRONYMS = new Set(('UK US USA EU UN BBC IMF WHO WTO AI NHS FBI CIA NSA GDP CEO CFO CTO MP MPS PM ECB IAEA ' +
  'ICC ICJ IOC UAE DRC OECD CDC FDA EPA SEC FTC DOJ DHS IRS GOP DNC RNC TUC DUP SNP ANC PLO IDF IRGC RSF UNHCR UNDP ' +
  'WFP ILO IPCC ISS IPO ETF CPI VAT GPS USB PC TV BMW VW HSBC IBM AMD TSMC LG HP BP BYD CNN ABC NBC CBS AP AFP NPR ' +
  'PBS ITV RTE DW NFL NBA MLB NHL UFC HIV DNA RNA UV ICU GP NYC LA DC MBA LLM GPU CPU API VPN PR HR QR ID EV ATM SUV ' +
  'CCTV MRI IVF AGM SMS NGO UNSC FAQ RAF MOD FIA UCL PSG AC FC UAW AFL CIO GMT BST UTC EST EDT PST PDT CET CEST JST ' +
  'IST AEST AM PSOE CDU SPD FDP LDP ANC EFF RN SNCF TGV CEO OPCW UNDP UNEP UNFPA WWF RSPCA NSPCC USAID').split(' '));

// Kept unhyphenated: espeak and browser voices already spell these well with
// the natural stress on the last letter ("the BBC" -> bee-bee-SEE).
const NATIVE_ACRONYMS = new Set('UK US USA EU UN BBC NHS FBI CIA NSA NBA GDP CEO AI MP PM OECD CDC DRC SNP CNN NFL DNA HIV TV'.split(' '));

// Short real words that are shouting, not acronyms, when written in capitals.
const SHOUT_WORDS = new Set(('NO SO GO DO TO OF IN ON AT BY UP MY BE WE HE ME OR AN AS IS IF OH ' +
  'NEW NOW WAR BIG TOP HOT WIN WON OUT OFF YES NOT ALL ANY FOR AND THE BUT ONE TWO SIX TEN OLD BAD SAD MAD RED END ' +
  'MAN DAY WAY WOW HOW WHY GET GOT LET SAY SEE SET RUN CUT HIT PAY TAX OIL GAS SUN SEA AIR ART CAR BUS JOB LAW KEY ' +
  'BID AGE ACT ADD AID ARM BAN BOX BOY CUP DOG CAT EYE FAN FLY FUN GUN ICE LOW MAP MIX NET PET POP RAW ROW SKY TOY ' +
  'TRY USE VOW WEB ZOO HER HIS ITS OUR YOU ARE WAS HAS HAD CAN MAY DIE DEAD LIVE ALSO').split(' '));

// Consonant pairs that may open an English syllable; letters otherwise ("TSMC").
const ONSETS = new Set(('bl br ch cl cr dr dw fl fr gl gn gr kn kr ph pl pr ps qu sc sch scr sh shr sk sl sm sn sp spl spr ' +
  'st str sw th thr tr tw wh wr').split(' '));
const CODAS = new Set(('st nd nt rt rd rk rn rm rs lk ld lt lm mp nk ng sk sp ft ct pt ch sh th ck ll ss ff zz ns ts ds ks ls ' +
  'ms ps gs bs ws ys rp rb lf lp nch rch tch rst cs x gh ght ht gn mb wn wl rl rth nth lth pth xt').split(' '));

function pronounceable(word) {
  const w = word.toLowerCase();
  if (!/[aeiouy]/.test(w)) return false;
  if (/[aeiou]{3,}/.test(w) || /[^aeiouy]{4,}/.test(w)) return false;
  const onset = /^[^aeiouy]+/.exec(w);
  if (onset && onset[0].length >= 2 && !ONSETS.has(onset[0])) return false;
  const coda = /[^aeiouy]+$/.exec(w);
  if (coda && coda[0].length >= 2 && !CODAS.has(coda[0]) && !CODAS.has(coda[0].slice(-2))) return false;
  return true;
}

/**
 * Letters of an acronym as a TTS reads them: "IMF" -> "I-M-F". Inside a word
 * espeak reads a capital "A" as the article, so it is written "eigh".
 */
export function spellLetters(letters) {
  return [...String(letters).toUpperCase().replace(/[^A-Z]/g, '')].map((c, i) => (c === 'A' && i > 0 ? 'eigh' : c)).join('-');
}

// ================================================================ the passes

const QUOTE_CHARS = '"“”„«»\'‘’';
const CUE_NAMES = new Set([...Object.keys(ACTIONS), ...EMOTIONS]);
const TITLES = {
  Dr: 'Doctor', Mr: 'Mister', Mrs: 'Missus', Ms: 'Miz', Mx: 'Mix', Prof: 'Professor', Gen: 'General', Lt: 'Lieutenant',
  Col: 'Colonel', Capt: 'Captain', Sgt: 'Sergeant', Cpl: 'Corporal', Adm: 'Admiral', Gov: 'Governor', Sen: 'Senator',
  Rep: 'Representative', Rev: 'Reverend', Fr: 'Father', Hon: 'Honourable', Pres: 'President', Supt: 'Superintendent',
  Insp: 'Inspector', Det: 'Detective', Cllr: 'Councillor',
};
const TITLES_ES = { Sr: 'señor', Sra: 'señora', Srta: 'señorita', Dr: 'doctor', Dra: 'doctora', Lic: 'licenciado', Ing: 'ingeniero', Prof: 'profesor', Profa: 'profesora' };
const ABBR_EN = [
  [/\be\.g\.(?=[\s,]|$)/g, 'for example'], [/\bi\.e\.(?=[\s,]|$)/g, 'that is'], [/\ba\.k\.a\.?(?=[\s,]|$)/gi, 'also known as'],
  [/\baka\b/g, 'also known as'], [/\betc\.?(?=[\s,;:)!?]|$)/g, 'et cetera'], [/\bvs\.?(?=\s)/gi, 'versus'],
  [/(?<=[A-Z][\p{L}]*\s)v\.?(?=\s+[A-Z])/gu, 'versus'], [/\bapprox\.(?=\s)/g, 'approximately'], [/\best\.(?=[\s,;:)]|$)/g, 'estimated'],
  [/\bincl\.(?=\s)/g, 'including'], [/\bexcl\.(?=\s)/g, 'excluding'], [/\b(?:Jr\.?|Jnr)(?![\p{L}])/gu, 'Junior'],
  [/\b(?:Sr\.|Snr)(?![\p{L}])/gu, 'Senior'], [/\bInc\./g, 'Inc'], [/\bLtd\.?(?![\p{L}])/gu, 'Limited'], [/\bCorp\./g, 'Corporation'],
  [/\bCo\.(?=\s|$)/g, 'Company'], [/\bBros\.(?=\s|$)/g, 'Brothers'], [/\bDept\.?(?=\s)/g, 'Department'],
  [/\bUniv\.(?=\s)/g, 'University'], [/\bAve\.?(?=\s|$|[,.])/g, 'Avenue'], [/\bBlvd\.?(?=\s|$|[,.])/g, 'Boulevard'],
  [/\b(?:Mt|Mt\.)(?=\s+[A-Z])/g, 'Mount'], [/\bFt\.(?=\s+[A-Z])/g, 'Fort'], [/\bgov(?:'|’)?t\b/gi, 'government'],
  [/\bint(?:'|’)l\b/gi, 'international'], [/\bw\/o(?=\s)/g, 'without'], [/(?<=\s|^)w\/(?=\s)/g, 'with'],
  [/\bNos\.\s?(?=\d)/g, 'numbers '], [/\bNo\.\s?(?=\d)/g, 'number '], [/\bno\.\s?(?=\d)/g, 'number '],
  [/\bpl\.(?=\s)/g, 'please'], [/\bArt\.\s?(?=\d)/g, 'Article '], [/\bSec\.\s?(?=\d)/g, 'Section '],
  [/\b[yY]\/[yY]\b|\bYoY\b/g, 'year on year'], [/\b[mM]\/[mM]\b|\bMoM\b/g, 'month on month'],
  [/\b[qQ]\/[qQ]\b|\bQoQ\b/g, 'quarter on quarter'],
];
const ABBR_ES = [
  [/\bEE\.\s?UU\.?/g, 'Estados Unidos'], [/\bEEUU\b/g, 'Estados Unidos'], [/\bp\.\s?ej\./g, 'por ejemplo'],
  [/\betc\.?(?=[\s,;:)!?]|$)/g, 'etcétera'], [/\bvs\.?(?=\s)/gi, 'contra'], [/\bnúm\.\s?(?=\d)/gi, 'número '],
  [/\bNo\.\s?(?=\d)/g, 'número '], [/\bn\.º\s?(?=\d)/g, 'número '], [/\bUd\./g, 'usted'], [/\bUds\./g, 'ustedes'],
  [/\bS\.A\.(?=\s|$|[,.])/g, 'ese a'],
];

// Did the full stop at `i` (right after an abbreviation) also end a sentence?
function endsSentence(s, i) {
  const rest = s.slice(i);
  if (/^\s*$/.test(rest)) return true;
  const m = /^\s+([A-Z][\p{L}']*)/u.exec(rest);
  return !!m && SENTENCE_STARTERS.has(m[1]);
}

function cleanup(st) {
  st = sub(st, /&(?:amp|nbsp|quot|apos|lt|gt|mdash|ndash|hellip|rsquo|lsquo|ldquo|rdquo|#\d{1,5}|#x[0-9a-f]{1,4});/gi, (mt) => {
    const e = mt[0].toLowerCase();
    const named = { '&amp;': '&', '&nbsp;': ' ', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>', '&mdash;': '—', '&ndash;': '–', '&hellip;': '…', '&rsquo;': "'", '&lsquo;': "'", '&ldquo;': '"', '&rdquo;': '"' };
    if (named[e]) return named[e];
    const code = e.startsWith('&#x') ? parseInt(e.slice(3), 16) : parseInt(e.slice(2), 10);
    return Number.isFinite(code) && code > 31 ? String.fromCodePoint(code) : ' ';
  });
  st = sub(st, /<\/?[a-z][^<>]{0,200}>/gi, () => ' ');
  st = sub(st, /[  -   　\t]/g, () => ' ');
  st = sub(st, /[​‌‎‏⁠﻿­]/g, () => '');
  st = sub(st, /[‘’‚‛′]/g, () => "'");
  st = sub(st, /[“”„‟″«»]/g, () => '"');
  st = sub(st, /[‐‑‒−﹣－]/g, () => '-');
  st = sub(st, /―/g, () => '—');
  st = sub(st, /\.{3,}/g, () => '…');
  // Stage directions are performed, not read.
  st = sub(st, /\[\s*(?:[AB]\s*:\s*)?([a-z_]+)\s*\]/gi, (mt) => (CUE_NAMES.has(mt[1].toLowerCase()) ? ' ' : null));
  st = sub(st, /[*`]+/g, () => '');
  return st;
}

function webJunk(st) {
  st = sub(st, /(?:\s(?:at|on|via|visit)\s+)?\b(?:https?:\/\/|www\.)[^\s]*[^\s.,;:!?)\]'"]/gi, () => ' ');
  st = sub(st, /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g, () => '');
  st = sub(st, /(?:\s(?:via|follow|from|by)\s+)?(?<![\w@])@\w{1,30}\b/g, () => ' ');
  st = sub(st, /\b([A-Za-z][\w-]*)((?:\.(?:co|com|org|net|gov|ac))?\.(?:com|org|net|io|ai|tv|uk|gov|edu|news|es|de|fr))\b(?![\w-])/g, (mt) =>
    [mt[1], ...mt[2].slice(1).split('.')].map((p, k) => (k ? 'dot ' : '') + (/^[^aeiouy]{2,4}$/i.test(p) ? spellLetters(p) : p)).join(' '));
  // Hashtags are read as their words: "#ClimateWeek" -> "Climate Week".
  st = sub(st, /(?<![\w#&])#([A-Za-z][A-Za-z0-9_]*)/g, (mt) => mt[1].replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2'));
  st = sub(st, /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\u{FE0E}\u{FE0F}\u{20E3}\u{200D}\u{E0020}-\u{E007F}]/gu, () => '');
  st = sub(st, /\s*[→⟶➝➔]\s*/g, () => ' to ');
  return st;
}

function abbreviations(st, L) {
  const table = L.es ? ABBR_ES : ABBR_EN;
  for (const [re, out] of table) st = sub(st, re, (mt, s) => (mt[0].endsWith('.') && endsSentence(s, mt.index + mt[0].length) ? `${out}.` : out));
  // Titles before a name: "Dr Smith", "Gen. Ivanov" (but not "Gen Z").
  const titles = L.es ? TITLES_ES : TITLES;
  const tre = new RegExp(`\\b(${Object.keys(titles).filter((k) => titles[k]).join('|')})(\\.?)(?=\\s+[A-ZÁÉÍÓÚÑ][\\p{Ll}'])`, 'gu');
  st = sub(st, tre, (mt) => titles[mt[1]]);
  if (!L.es) {
    // "St": Saint before a name, Street after one ("St Petersburg", "Downing St").
    st = sub(st, /\bSt\b\.?/g, (mt, s) => {
      const prev = wordBefore(s, mt.index);
      const next = /^\.?\s+[A-Z]/.test(s.slice(mt.index + 2));
      const prevCap = /^[A-Z]/.test(prev) && !SENTENCE_STARTERS.has(prev) && !/^(?:Near|Of|From|To)$/.test(prev);
      if (prevCap && /\s$/.test(s.slice(Math.max(0, mt.index - 1), mt.index))) {
        return mt[0].endsWith('.') && endsSentence(s, mt.index + mt[0].length) ? 'Street.' : 'Street';
      }
      if (next) return 'Saint';
      return null;
    });
    // Months and weekdays: "Oct. 2", "Sept 2026", "Mon-Fri".
    st = sub(st, new RegExp(`\\b(${Object.keys(MONTH_ABBR).join('|')})(\\.?)(?=\\s+\\d)`, 'g'), (mt) => MONTHS_EN[MONTH_ABBR[mt[1]]]);
    st = sub(st, new RegExp(`\\b(${Object.keys(DAYS_ABBR).join('|')})(?:\\.|(?=\\s?[-–]\\s?(?:${Object.keys(DAYS_ABBR).join('|')})\\b)|(?<=[-–]\\s?\\w+)(?=\\b))`, 'g'),
      (mt, s) => {
        const before = s.slice(Math.max(0, mt.index - 2), mt.index);
        if (!mt[0].endsWith('.') && !/[-–]\s?$/.test(before) && !/^\s?[-–]/.test(s.slice(mt.index + mt[0].length))) return null;
        return DAYS_ABBR[mt[1]];
      });
  }
  if (!L.es) {
    const DAY = 'Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday';
    st = sub(st, new RegExp(`\\b(${DAY})\\s?[-–]\\s?(?=(?:${DAY})\\b)`, 'g'), (mt) => [[mt[1], 0], [' to ', mt[1].length]]);
  }
  // Dotted acronyms: "U.S." -> "US" (the acronym rules spell it later).
  st = sub(st, /(?<![\p{L}.])((?:[A-Za-z]\.){2,})(?=[\s,;:!?)"']|$)/gu, (mt, s) => {
    const letters = mt[1].replace(/\./g, '').toUpperCase();
    return endsSentence(s, mt.index + mt[0].length) ? `${letters}.` : letters;
  });
  // Middle initials: "John F. Kennedy" -> "John F Kennedy" (no full stop pause).
  st = sub(st, /(?<=(?:^|[\s(])[A-Z])\.(?=\s+[A-Z][\p{Ll}])/gu, (mt, s) => (endsSentence(s, mt.index + 1) ? null : ''));
  return st;
}

function datesAndTimes(st, L) {
  if (L.es) {
    st = sub(st, new RegExp(`\\b(\\d{1,2})(?=\\s+de\\s+(?:${MONTHS_ES})\\b)`, 'gi'), (mt) => cardinalEs(+mt[1]));
    st = sub(st, /\b([01]?\d|2[0-4])[:.h]([0-5]\d)\b(?:\s?h\b)?/g, (mt) => {
      const h = +mt[1];
      const m = +mt[2];
      return m ? `${cardinalEs(h)} ${m < 10 ? `cero ${cardinalEs(m)}` : cardinalEs(m)}` : `${cardinalEs(h)} en punto`;
    });
    return st;
  }
  const day = (d) => ordinalWords(+d, L);
  const yr = (y) => (y ? `, ${yearWords(+y, L)}` : '');
  // "2 October 2026", "2nd of October"
  st = sub(st, new RegExp(`\\b([12]?\\d|3[01])(?:st|nd|rd|th)?(\\s+of)?\\s+(${MONTH_RE})(?:,?\\s+(1\\d{3}|20\\d\\d)\\b(?![,.]?\\d))?`, 'g'), (mt) => {
    const month = monthName(mt[3]);
    if (!+mt[1]) return null;
    return L.gb ? `the ${day(mt[1])} of ${month}${yr(mt[4])}` : `${month} ${day(mt[1])}${yr(mt[4])}`;
  });
  // "October 2", "Oct. 2nd, 2026"
  st = sub(st, new RegExp(`\\b(${MONTH_RE})\\s+([12]?\\d|3[01])(?:st|nd|rd|th)?\\b(?![:.,]?\\d)(?:,?\\s+(1\\d{3}|20\\d\\d)\\b(?![,.]?\\d))?`, 'g'), (mt) => {
    if (!+mt[2]) return null;
    const month = monthName(mt[1]);
    return L.gb ? `${month} the ${day(mt[2])}${yr(mt[3])}` : `${month} ${day(mt[2])}${yr(mt[3])}`;
  });
  // "October 2026"
  st = sub(st, new RegExp(`\\b(${MONTH_RE})\\s+(1\\d{3}|20\\d\\d)\\b(?![,.]?\\d)`, 'g'), (mt) => `${monthName(mt[1])} ${yearWords(+mt[2], L)}`);
  // "2/10/2026": day first in British English, month first in American.
  st = sub(st, /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g, (mt) => {
    let [d, m] = L.gb ? [+mt[1], +mt[2]] : [+mt[2], +mt[1]];
    if (m > 12 && d <= 12) [d, m] = [m, d];
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    return L.gb ? `the ${day(d)} of ${MONTHS_EN[m - 1]}, ${yearWords(+mt[3], L)}` : `${MONTHS_EN[m - 1]} ${day(d)}, ${yearWords(+mt[3], L)}`;
  });
  // Times: "14:30", "9.30pm", "9am", "10:00 GMT".
  const ampm = (x) => (x ? ` ${/^p/i.test(x) ? 'P-M' : 'A-M'}` : '');
  const clock = (h, m, x) => {
    if (!m) {
      if (x) return `${cardinalEn(h, L.gb)}${ampm(x)}`;
      if (h === 0 || h === 24) return 'midnight';
      return h > 12 ? `${cardinalEn(h, L.gb)} hundred` : `${cardinalEn(h, L.gb)} o'clock`;
    }
    const hh = h === 0 ? (x ? 'twelve' : 'zero') : cardinalEn(h, L.gb);
    return `${hh} ${m < 10 ? `oh ${ONES[m]}` : tensEn(m)}${ampm(x)}`;
  };
  st = sub(st, /\b([01]?\d|2[0-4]):([0-5]\d)(?:\s?([ap])\.?m\b\.?)?/gi, (mt, s) => {
    const out = clock(+mt[1], +mt[2], mt[3]);
    return mt[0].endsWith('.') && endsSentence(s, mt.index + mt[0].length) ? `${out}.` : out;
  });
  // Four-digit clock times: "0600 GMT", "at 1430 hrs".
  st = sub(st, /\b([01]\d|2[0-3])([0-5]\d)(?=\s?(?:GMT|UTC|BST|CET|CEST|EST|EDT|PST|PDT|hrs|hours|local time)\b)/g, (mt) => {
    const h = +mt[1];
    const m = +mt[2];
    const hh = mt[1].startsWith('0') ? `${L.gb ? 'oh' : 'zero'} ${ONES[h]}` : cardinalEn(h, L.gb);
    return `${hh} ${m ? (m < 10 ? `oh ${ONES[m]}` : tensEn(m)) : 'hundred'}`;
  });
  st = sub(st, /\b(1[0-2]|0?\d)(?:\.([0-5]\d))?\s?([ap])\.?m\b\.?/gi, (mt, s) => {
    const out = clock(+mt[1], mt[2] ? +mt[2] : 0, mt[3]);
    return mt[0].endsWith('.') && endsSentence(s, mt.index + mt[0].length) ? `${out}.` : out;
  });
  return st;
}

function moneyWords(curKey, a, b, scale1, scale2, L) {
  const cur = CURRENCIES[curKey] || CURRENCIES.$;
  const [sg, pl, subSg, subPl] = cur[L.es ? 'es' : 'en'];
  const sw1 = scaleWord(scale1, L);
  const sw2 = scaleWord(scale2, L);
  const de = L.es && (sw2 || sw1) && /^(millones|millón|mil millones|billones|billón)$/.test(sw2 || sw1) ? ' de' : '';
  if (b != null) {
    const first = numberWords(a, L) + (sw1 && sw1 !== sw2 ? ` ${sw1}` : '');
    const second = numberWords(b, L, { apocope: L.es }) + (sw2 ? ` ${sw2}` : sw1 ? ` ${sw1}` : '');
    return `${first} ${W[L.es ? 'es' : 'en'].to} ${second}${de} ${pl}`;
  }
  if (sw1) return `${numberWords(a, L, { apocope: L.es })} ${sw1}${de} ${pl}`;
  const p = parseNum(a, L);
  if (p.frac !== null && p.frac.length === 2 && subPl) {
    const whole = Number(p.int);
    const cents = Number(p.frac);
    const centsWords = L.es ? cardinalEs(cents) : cardinalEn(cents, L.gb);
    if (!whole) return `${centsWords} ${cents === 1 ? subSg : subPl}`;
    const head = `${L.es ? cardinalEs(whole, true) : cardinalEn(whole, L.gb)} ${whole === 1 ? sg : pl}`;
    if (!cents) return head;
    return L.es ? `${head} con ${centsWords}` : `${head} ${centsWords}`;
  }
  return `${numberWords(a, L, { apocope: L.es })} ${isOne(a, L) ? sg : pl}`;
}

function money(st, L) {
  const NUM = L.es ? NUM_ES : NUM_EN;
  const range = `(?:\\s?(?:-|–|to|a)\\s?(?:${CUR_SYM})?(${NUM})(${SCALE_RE})?)?`;
  const w = W[L.es ? 'es' : 'en'];
  // Stock tickers: "$AAPL" -> the letters.
  st = sub(st, /(?<![\p{L}\p{N}])\$([A-Z]{1,5})(?![\p{L}\p{N}])/gu, (mt) => mt[1]);
  // Prefix: "$2bn", "US$5", "€1.5-2m", "£3.50", "CHF 5", "+$7.05".
  st = sub(st, new RegExp(`(?<![\\p{L}\\p{N}$])([-+]?)(${CUR_SYM}|(?:${CUR_CODE})\\s?)(${NUM})(${SCALE_RE})?${range}`, 'gu'), (mt) =>
    (mt[1] === '-' ? `${w.minus} ` : mt[1] === '+' ? `${w.plus} ` : '') + moneyWords(mt[2].trim(), mt[3], mt[5] ?? null, mt[4], mt[6], L));
  // Postfix: "5 USD", "20bn euros" is already words; "5 €" (Spanish style).
  st = sub(st, new RegExp(`(?<![\\p{L}\\p{N}.,])(${NUM})(${SCALE_RE})?\\s?(${CUR_CODE}|€|\\$|£)(?![\\p{L}\\p{N}])`, 'gu'), (mt) =>
    moneyWords(mt[3], mt[1], null, mt[2], null, L));
  // Pence and cents: "50p", "99c".
  if (!L.es) {
    st = sub(st, /(?<![\w.,])(\d{1,2})([pc])\b/g, (mt) => {
      const n = +mt[1];
      return `${cardinalEn(n, L.gb)} ${mt[2] === 'p' ? (n === 1 ? 'penny' : 'pence') : n === 1 ? 'cent' : 'cents'}`;
    });
  }
  // Currency pairs and lone signs: "the ¥/$ rate", "the $ fell".
  const curName = (c) => (CURRENCIES[c] || CURRENCIES.$)[L.es ? 'es' : 'en'][0];
  st = sub(st, new RegExp(`(${CUR_SYM})\\s?\\/\\s?(${CUR_SYM})`, 'gu'), (mt) => `${curName(mt[1])} ${curName(mt[2])}`);
  st = sub(st, /(?<![\p{L}\p{N}])[€£¥₹₩₽₺₦$](?![\p{N}])/gu, (mt) => curName(mt[0]));
  // Scale words after plain numbers: "1.5bn", "2.5 million" -> number words.
  st = sub(st, new RegExp(`(?<![\\p{L}\\p{N}.,])(${NUM})\\s?(bn|tn|trn|mn|mln)(?![\\p{L}\\p{N}])`, 'gu'), (mt) =>
    `${numberWords(mt[1], L)} ${scaleWord(mt[2], L)}`);
  return st;
}

function percentAndUnits(st, L) {
  const NUM = L.es ? NUM_ES : NUM_EN;
  const w = W[L.es ? 'es' : 'en'];
  const sign = (x) => (x === '-' || x === '−' ? `${w.minus} ` : x === '+' ? `${w.plus} ` : '');
  // Spanish ordinals "1º", "2ª" look like degrees.
  if (L.es) st = sub(st, /\b(\d{1,3})\.?([ºª])(?=[\s,.;:!?)]|$)/g, (mt) => ordinalWords(+mt[1], L, mt[2] === 'ª'));
  // Percent: "50%", "-0.3%", "10-15%", "5pc".
  st = sub(st, new RegExp(`(?<![\\p{L}\\p{N}.,%])([-+]?)(${NUM})(?:%?\\s?(?:-|–|to)\\s?(${NUM}))?(?:\\s?%|pc\\b|pct\\b)`, 'gu'), (mt) =>
    `${sign(mt[1])}${numberWords(mt[2], L)}${mt[3] ? ` ${w.to} ${numberWords(mt[3], L)}` : ''} ${w.percent}`);
  // Units: "100 km/h", "30°C", "a 10-km race", "128GB".
  st = sub(st, new RegExp(`(?<![\\p{L}\\p{N}.,])([-+]?)(${NUM})(?:\\s?(?:-|–|to)\\s?(${NUM}))?(-|\\s?)(${UNIT_RE})(?![\\p{L}\\p{N}])`, 'gu'), (mt) => {
    const unit = mt[5];
    // "5 h" or "6 g" alone are too ambiguous ("Plan B"-style labels); need a tight join.
    if ((unit === 'h' || unit === 'g' || unit === 'W') && mt[4] === ' ') return null;
    if (unit === 'ms' && mt[4] === ' ') return null;
    const adjectival = mt[4] === '-';
    const plural = !adjectival && (mt[3] != null || !isOne(mt[2], L));
    const nums = `${sign(mt[1])}${numberWords(mt[2], L)}${mt[3] ? ` ${w.to} ${numberWords(mt[3], L)}` : ''}`;
    if (adjectival) return `${nums}-${unitWord(unit, false, L).replace(/ /g, '-')}`;
    return `${nums} ${unitWord(unit, plural, L)}`;
  });
  // "61/km²", "people per sq km": a slash before a unit means per.
  st = sub(st, new RegExp(`\\s?\\/\\s?(${UNIT_RE})(?![\\p{L}\\p{N}])`, 'gu'), (mt) => ` ${w.per} ${unitWord(mt[1], false, L)}`);
  // Metres vs million for a bare "m": "100m sprint" vs "5m people".
  st = sub(st, new RegExp(`(?<![\\p{L}\\p{N}.,$€£¥])(${NUM})(\\s?)m(?![\\p{L}\\p{N}²])(-?)`, 'gu'), (mt, s) => {
    const after = s.slice(mt.index + mt[0].length);
    const metres = mt[2] === ' ' || mt[3] === '-' ||
      /^\s?(?:long|high|tall|deep|wide|away|below|above|sprint|race|hurdles|freestyle|backstroke|breaststroke|butterfly|relay|final|of|in|from|metres|under|up|down|into|across)\b/.test(after);
    if (metres) {
      const word = L.es ? (isOne(mt[1], L) ? 'metro' : 'metros') : isOne(mt[1], L) && !mt[3] ? 'metre' : 'metres';
      return mt[3] ? `${numberWords(mt[1], L)}-${L.es ? 'metros' : 'metre'}-` : `${numberWords(mt[1], L)} ${word}`;
    }
    return `${numberWords(mt[1], L, { apocope: L.es })} ${L.es ? 'millones' : 'million'}${mt[3]}`;
  });
  // "10k" -> "ten thousand" (but "a 10k run" stays a race distance).
  st = sub(st, new RegExp(`(?<![\\p{L}\\p{N}.,])(${NUM})k(?![\\p{L}\\p{N}])`, 'gu'), (mt, s) => {
    if (/^\s+(?:run|race|runs|races)\b/.test(s.slice(mt.index + mt[0].length))) return `${numberWords(mt[1], L)} K`;
    return `${numberWords(mt[1], L)} ${L.es ? 'mil' : 'thousand'}`;
  });
  // Multipliers and dimensions: "3x faster", "4x4".
  st = sub(st, new RegExp(`(?<![\\p{L}\\p{N}.,])(${NUM})\\s?[x×]\\s?(\\d+)?(?![\\p{L}\\p{N}])`, 'gu'), (mt) =>
    (mt[2] ? `${numberWords(mt[1], L)} ${w.by} ${numberWords(mt[2], L)}` : `${numberWords(mt[1], L)} ${w.times}`));
  return st;
}

const ROMAN = { I: 1, V: 5, X: 10, L: 50 };
function romanValue(s) {
  let v = 0;
  for (let i = 0; i < s.length; i++) {
    const a = ROMAN[s[i]];
    const b = ROMAN[s[i + 1]] || 0;
    v += a < b ? -a : a;
  }
  return v;
}
function toRoman(n) {
  const T = [[50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  for (const [v, r] of T) while (n >= v) { out += r; n -= v; }
  return out;
}
// Numbered things read as cardinals ("World War Two", "Artemis Three"); names
// of people take "the" + ordinal ("Charles the Third").
const ROMAN_CARDINAL = new Set(('War Bowl Chapter Part Volume Vol Act Phase Title Type Grade Level Stage Class Category Apollo ' +
  'Artemis Gemini Voyager Pioneer Mariner Soyuz Saturn Vatican Episode Book Article Section Schedule Tier Mark Mk Mission ' +
  'Rocky Halo Fantasy Wars Season Series').split(' '));
const MONARCH = /^(?:King|Queen|Pope|Emperor|Empress|Tsar|Czar|Pharaoh|Sultan|Prince|Princess|Duke|Duchess|Rey|Reina|Papa)$/;

function otherNumbers(st, L) {
  const NUM = L.es ? NUM_ES : NUM_EN;
  const w = W[L.es ? 'es' : 'en'];
  // Year ranges: "2020-2024", "2023-24" (unless a quantity follows).
  st = sub(st, /(?<![\w.,$€£¥])(1[1-9]\d\d|20\d\d)\s?[-–]\s?(1[1-9]\d\d|20\d\d|\d\d)\b(?![,.]\d)/g, (mt, s) => {
    if (isCountNoun(wordAfter(s, mt.index + mt[0].length))) return null;
    const y2 = mt[2].length === 2 ? (L.es ? cardinalEs(+mt[2]) : tensEn(+mt[2])) : yearWords(+mt[2], L);
    return [[yearWords(+mt[1], L), 0], [` ${w.to} `, mt[1].length], [y2, mt[0].length - mt[2].length]];
  });
  // Seasons: "the 2026/27 season" -> "twenty twenty-six twenty-seven".
  st = sub(st, /(?<![\w.,$€£¥/])(20\d\d|19\d\d)\/(\d\d)\b(?![\/.,]\d)/g, (mt) =>
    [[yearWords(+mt[1], L), 0], [` ${L.es ? cardinalEs(+mt[2]) : tensEn(+mt[2])}`, mt[1].length + 1]]);
  // Decades: "1990s", "the '80s", "in her 30s".
  st = sub(st, /(?<![\w.,])'?(1[0-9]\d0|20[0-9]0|[1-9]0)s\b/g, (mt) => {
    const n = +mt[1];
    if (L.es) return `los ${n < 100 ? cardinalEs(n) : cardinalEs(n)}`;
    if (n < 100) return pluralWords(tensEn(n));
    return pluralWords(yearEn(n, L.gb));
  });
  // Ordinals: "21st", "3rd" (Spanish "1º" is read before the units).
  if (!L.es) st = sub(st, /\b(\d{1,3}(?:,\d{3})+|\d+)(st|nd|rd|th)\b/gi, (mt) => ordinalWords(+mt[1].replace(/,/g, ''), L));
  // Scores: "won 3-1", "a 2-0 win", "drew 1-1".
  st = sub(st, /(?<![\w.,])(\d{1,2})\s?[-–]\s?(\d{1,2})\b(?![,.]?\d|\s?%)/g, (mt, s) => {
    const before = s.slice(Math.max(0, mt.index - 40), mt.index);
    const after = s.slice(mt.index + mt[0].length, mt.index + mt[0].length + 24);
    const scoreCtx = /\b(?:won|win|wins|beat|beats|beating|lost|lose|loses|losing|drew|draw|draws|drawn|victory|defeat|defeated|thrashed|edged|trail|trailed|trailing|led|lead|leads|leading|score|scored)\b(?:\s+[\p{L}']+){0,3}\s*$/iu.test(before) ||
      /^\s+(?:win|victory|defeat|loss|draw|lead|thrashing|scoreline|result|home win|away win)\b/i.test(after) ||
      (/\b[A-Z][\p{L}]+\s$/u.test(before) && /^\s[A-Z]/.test(after)) || /\bscore[s]?:?\s*(?:[A-Z][\p{L}]+\s+){0,3}$/iu.test(before);
    if (!scoreCtx || L.es) return null;
    const say = (n) => (n === 0 ? (L.gb ? 'nil' : 'nothing') : cardinalEn(n, L.gb));
    const a = +mt[1];
    const b = +mt[2];
    return a === b ? `${say(a)} all` : `${say(a)} ${say(b)}`;
  });
  // Fractions: "½", "2 1/2", "3/4", "24/7".
  const VULGAR = { '½': [1, 2], '⅓': [1, 3], '⅔': [2, 3], '¼': [1, 4], '¾': [3, 4], '⅕': [1, 5], '⅛': [1, 8], '⅜': [3, 8], '⅝': [5, 8], '⅞': [7, 8] };
  const fraction = (n, d) => {
    if (L.es) return `${cardinalEs(n)} ${d === 2 ? (n === 1 ? 'medio' : 'medios') : d === 3 ? (n === 1 ? 'tercio' : 'tercios') : d === 4 ? (n === 1 ? 'cuarto' : 'cuartos') : `entre ${cardinalEs(d)}`}`;
    const den = d === 2 ? 'half' : d === 4 ? 'quarter' : ordinalOfWords(cardinalEn(d, false));
    const plural = n === 1 ? den : d === 2 ? 'halves' : `${den}s`;
    return `${cardinalEn(n, L.gb)} ${plural}`;
  };
  st = sub(st, /(?:(\d+)\s?)?([½⅓⅔¼¾⅕⅛⅜⅝⅞])/g, (mt) => {
    const [n, d] = VULGAR[mt[2]];
    if (mt[1]) return `${numberWords(mt[1], L)} ${w.and} ${n === 1 ? (L.es ? (d === 2 ? 'medio' : fraction(n, d)) : `a ${fraction(1, d).split(' ')[1]}`) : fraction(n, d)}`;
    return fraction(n, d);
  });
  st = sub(st, /(?<![\w.,/])(\d+)\s(\d)\/(\d{1,2})\b(?!\/)/g, (mt) => {
    const n = +mt[2];
    const d = +mt[3];
    if (!d || n >= d) return null;
    return `${numberWords(mt[1], L)} ${w.and} ${n === 1 && !L.es ? `a ${fraction(1, d).split(' ')[1]}` : fraction(n, d)}`;
  });
  st = sub(st, /(?<![\w.,/])(\d{1,2}\.\d)\/(\d{1,3})\b(?!\/)/g, (mt) => `${numberWords(mt[1], L)} ${L.es ? 'de' : 'out of'} ${numberWords(mt[2], L)}`);
  st = sub(st, /(?<![\w.,/])(\d{1,3})\/(\d{1,3})\b(?!\/)/g, (mt) => {
    const n = +mt[1];
    const d = +mt[2];
    const special = { '24/7': L.es ? 'veinticuatro siete' : 'twenty-four seven', '9/11': L.es ? 'once de septiembre' : 'nine eleven', '50/50': L.es ? 'cincuenta cincuenta' : 'fifty-fifty', '7/7': 'seven seven' };
    if (special[mt[0]]) return special[mt[0]];
    if (!d) return null;
    if (n < d && d <= 12 && d !== 10) return fraction(n, d);
    return `${numberWords(mt[1], L)} ${L.es ? 'de' : 'out of'} ${numberWords(mt[2], L)}`;
  });
  // Ratios: "3:1" (times with two-digit minutes were read already).
  st = sub(st, /(?<![\w.,:])(\d{1,2}):(\d)(?![\d:])/g, (mt) => `${numberWords(mt[1], L)} ${w.to} ${numberWords(mt[2], L)}`);
  // Codes: "G7", "COP29", "F-35", "A320", "Covid-19", "MH370"; "5G", "4K", "1080p".
  st = sub(st, /\b([A-Z][A-Za-z]{0,7})-?(\d{1,4})\b(?![.,]\d)/g, (mt) => {
    const n = mt[2];
    const letters = mt[1];
    if (letters in MONTH_ABBR || /^(?:No|Nos|Vol|Ch|Pt)$/.test(letters)) return null;
    if (L.es) return [[letters, 0], [` ${cardinalEs(+n)}`, letters.length]];
    let words;
    if (n.length <= 2 || n.startsWith('0')) words = n.startsWith('0') && n.length > 1 ? digitsEn(n, true) : cardinalEn(+n, L.gb);
    else if (n.length === 3) words = n[1] === '0' && n[2] === '0' ? cardinalEn(+n, L.gb) : n[1] === '0' ? `${ONES[+n[0]]} oh ${ONES[+n[2]]}` : `${ONES[+n[0]]} ${tensEn(+n.slice(1))}`;
    else words = n.slice(2) === '00' ? `${tensEn(+n.slice(0, 2))} hundred` : `${tensEn(+n.slice(0, 2))} ${+n[2] ? tensEn(+n.slice(2)) : `oh ${ONES[+n[3]]}`}`;
    return [[letters, 0], [` ${words}`, letters.length]];
  });
  // Phone numbers: digit by digit, a short pause between groups.
  st = sub(st, /(?<![\w.,])(?:\+\d{1,3}[ -]?)?0\d{2,4}(?:[ -]\d{3,4}){1,3}\b/g, (mt) =>
    mt[0].replace(/^\+/, '').split(/[ -]+/).map((g) => (L.es ? [...g].map((d) => ES_ONES[+d]).join(' ') : digitsEn(g, L.gb))).join(', '));
  // Anything else mixing letters and digits: "H5N1", "Pixel 9a", "R0".
  st = sub(st, /\b(?=[A-Za-z]*\d)(?=\d*[A-Za-z])[A-Za-z\d]{2,10}\b/g, (mt) => {
    if (/^\d+(?:st|nd|rd|th|s|k|m|bn|tn|p|c|x|h|G|K|D|GB|MB|TB)$/i.test(mt[0])) return null;
    const out = [];
    for (const run of mt[0].matchAll(/\d+|[A-Za-z]+/g)) {
      const t = run[0];
      let say = t;
      if (/\d/.test(t)) say = L.es ? cardinalEs(+t) : t.length > 1 && t.startsWith('0') ? digitsEn(t, L.gb) : cardinalEn(+t, L.gb);
      else if (t.length === 1) say = t.toLowerCase() === 'a' ? 'eigh' : t.toUpperCase();
      out.push([(out.length ? ' ' : '') + say, run.index]);
    }
    return out;
  });
  st = sub(st, /\b(\d{1,2})([GKD])\b/g, (mt) => `${numberWords(mt[1], L)} ${mt[2]}`);
  st = sub(st, /\b(\d{3,4})p\b/g, (mt) => `${mt[1].length === 4 ? yearEn(+mt[1], false) : `${ONES[+mt[1][0]]} ${tensEn(+mt[1].slice(1))}`} P`);
  // Roman numerals in names: "King Charles III", "World War II", "Pope Leo XIV".
  st = sub(st, /\b([A-Z][\p{Ll}]+)\s([IVXL]{1,7})(?![\p{L}\p{N}-])/gu, (mt, s) => {
    const r = mt[2];
    const v = romanValue(r);
    if (toRoman(v) !== r || v < 1 || v > 89 || r === 'XL') return null;
    const prev = mt[1];
    const two = wordBefore(s, mt.index);
    if (ROMAN_CARDINAL.has(prev)) return [[prev, 0], [` ${L.es ? cardinalEs(v) : cardinalEn(v, L.gb)}`, prev.length]];
    if (SENTENCE_STARTERS.has(prev)) return null;
    if (r.length < 2 && !MONARCH.test(two) && !MONARCH.test(prev)) return null;
    const ord = L.es ? (v <= 10 ? ordinalWords(v, L) : cardinalEs(v)) : `the ${ordinalWords(v, L)}`;
    return [[prev, 0], [` ${ord}`, prev.length]];
  });
  // Years: "in 1999", "2026 election" (but "2000 people" is a quantity).
  st = sub(st, /(?<![\w.,$€£¥#])(1[1-9]\d\d|20\d\d)(?![\w]|[.,]\d|\s?%)/g, (mt, s) => {
    const before = wordBefore(s, mt.index).toLowerCase();
    const after = wordAfter(s, mt.index + mt[0].length);
    const tight = s.slice(Math.max(0, mt.index - 1), mt.index);
    if (YEAR_BEFORE.has(before) || tight === '-') return yearWords(+mt[1], L);
    if (QTY_BEFORE.has(before) || isCountNoun(after)) return null;
    if (before === 'to' && !/\b(1[1-9]|20)\d\d\b/.test(s.slice(Math.max(0, mt.index - 30), mt.index))) return null;
    return yearWords(+mt[1], L);
  });
  return st;
}

function plainNumbers(st, L) {
  const NUM = L.es ? NUM_ES : NUM_EN;
  const w = W[L.es ? 'es' : 'en'];
  // Ranges, signs and bare numbers: "3-4", "-5", "+2.1", "40,000", "007".
  st = sub(st, new RegExp(`(?<![\\p{L}\\p{N}.,])([-+]?)(${NUM})(?:(\\s?[-–]\\s?|\\s(?:to|a)\\s)([-]?)(${NUM}))?(?![\\p{L}\\p{N}])`, 'gu'), (mt, s) => {
    const prevCh = s[mt.index - 1];
    let signWord = '';
    if (mt[1] === '-') {
      // A hyphen glued to a word is a range/compound, not a minus sign.
      if (prevCh && /[\p{L}\p{N}]/u.test(prevCh)) return null;
      signWord = `${w.minus} `;
    } else if (mt[1] === '+') signWord = `${w.plus} `;
    const after = wordAfter(s, mt.index + mt[0].length);
    // Spanish agrees with the noun: "un millón", "veintiún heridos", "quinientas personas".
    const noun = L.es && after && after === after.toLowerCase() && !/^(?:de|del|y|o|a|en|por|para|con|que|es|son|fue)$/.test(after);
    const apocope = noun || (L.es && /^(?:millones|millón|mil)$/.test(after));
    const fem = noun && /as?$/.test(after) && !/^(?:millones|millón|mil|problemas?|días?|mapas?|sistemas?|programas?|temas?|idiomas?|planetas?)$/.test(after);
    const agree = (words) => (fem ? words.replace(/ientos\b/g, 'ientas').replace(/(?:uno|ún|un)$/, 'una') : words);
    const first = signWord + agree(numberWords(mt[2], L, { apocope: apocope && !mt[5] }));
    if (!mt[5]) return first;
    const second = (mt[4] ? `${w.minus} ` : '') + agree(numberWords(mt[5], L, { apocope }));
    const at2 = mt[0].length - mt[5].length - mt[4].length;
    return [[first, 0], [` ${w.to} `, mt[1].length + mt[2].length], [second, at2]];
  });
  // Plus after a number or name: "50+", "Disney+".
  st = sub(st, /(?<=[\p{L}\p{N}])\+/gu, () => ` ${w.plus} `);
  return st;
}

function symbols(st, L) {
  const w = W[L.es ? 'es' : 'en'];
  st = sub(st, /\s*&\s*/g, () => ` ${w.and} `);
  st = sub(st, /#\s?(?=\p{N}|[a-z]+\b)/gu, () => `${w.number} `);
  st = sub(st, /\s*=\s*/g, () => (L.es ? ' igual a ' : ' equals '));
  st = sub(st, /[~≈]\s?(?=[\p{L}\p{N}])/gu, () => `${w.about} `);
  st = sub(st, /\s*±\s*/g, () => (L.es ? ' más o menos ' : ' plus or minus '));
  st = sub(st, /\s+[<]\s+/g, () => (L.es ? ' menos que ' : ' less than '));
  st = sub(st, /\s+[>]\s+/g, () => (L.es ? ' más que ' : ' more than '));
  st = sub(st, /\s*×\s*/g, () => ` ${w.times} `);
  st = sub(st, /§\s?/g, () => (L.es ? 'sección ' : 'section '));
  st = sub(st, /(?<=\p{N})\s?°(?![CF])/gu, () => ` ${w.degrees[1]}`);
  st = sub(st, /\s*%/g, () => ` ${w.percent}`);
  // Slashes: "and/or", "$5/month" (per), "Israel/Gaza" (or).
  st = sub(st, /\band\/or\b/gi, (mt) => (L.es ? 'y o' : mt[0][0] === 'A' ? 'And or' : 'and or'));
  st = sub(st, /\/(?=(?:month|year|day|week|hour|night|person|head|year|barrel|tonne|ton|litre|liter|gallon|kilo|kg|unit|share)\b)/g, () => (L.es ? ' por ' : ' a '));
  st = sub(st, /(?<=\p{L})\/(?=\p{L})/gu, () => (L.es ? ' o ' : ' or '));
  st = sub(st, /\s+\/\s+/g, () => ', ');
  st = sub(st, /@/g, () => (L.es ? ' arroba ' : ' at '));
  return st;
}

function acronyms(st, L) {
  // Sentences mostly in capitals are shouting ("BREAKING: QUAKE HITS..."):
  // their words are read as words, and only known acronyms are spelled.
  const shouty = [];
  for (const m of st.s.matchAll(/[^.!?…\n]+[.!?…\n]*/g)) {
    const words = m[0].match(/\b[\p{L}]{2,}\b/gu) || [];
    const caps = words.filter((x) => x === x.toUpperCase() && /[A-Z]/.test(x));
    if ((caps.length >= 3 && caps.length / words.length >= 0.6) || (caps.length >= 2 && caps.length === words.length)) shouty.push([m.index, m.index + m[0].length]);
  }
  const inShouty = (i) => shouty.some(([a, b]) => i >= a && i < b);
  const sentenceStart = (s, i) => /(?:^|[.!?…:]\s*|\n\s*)$/.test(s.slice(Math.max(0, i - 3), i)) || i === 0;
  const lowerWord = (word, s, i) => (sentenceStart(s, i) ? word[0] + word.slice(1).toLowerCase() : word.toLowerCase());
  const letters = (tok, suffix) => {
    if (NATIVE_ACRONYMS.has(tok) && suffix !== 's') return tok + suffix;
    return spellLetters(tok) + (suffix ? "'s" : '');
  };
  // CamelCase with a capital tail: "ChatGPT" -> "Chat G-P-T", "OpenAI" -> "Open A-I".
  st = sub(st, /\b([A-Z]?[a-z]{2,})([A-Z]{2,})\b/g, (mt) => [[mt[1], 0], [` ${spellLetters(mt[2])}`, mt[1].length]]);
  // Leftover roman numerals ("Phase II/III" handled above; "trial II" here).
  st = sub(st, /\b(II|III)\b/g, (mt) => (inShouty(mt.index) ? null : cardinalEn(mt[1].length, L.gb)));
  st = sub(st, /(?<![\p{L}\p{N}'’])([A-Z][A-Z]*[A-Z])(s(?![\p{L}])|['’]s)?(?![\p{L}\p{N}]|['’][a-rt-z])/gu, (mt, s) => {
    const tok = mt[1];
    const suffix = mt[2] ? (mt[2] === 's' ? 's' : "'s") : '';
    const i = mt.index;
    const words = L.es ? WORD_ACRONYMS_ES : WORD_ACRONYMS;
    if (tok in words) {
      const word = words[tok];
      return (sentenceStart(s, i) ? word[0].toUpperCase() + word.slice(1) : word) + suffix;
    }
    const shout = inShouty(i);
    if (tok === 'WHO') {
      if (shout && !/\bthe\s+$/i.test(s.slice(Math.max(0, i - 4), i)) && !suffix) return lowerWord(tok, s, i);
      return letters(tok, suffix);
    }
    if (tok === 'US' && shout) {
      const prev = wordBefore(s, i).toUpperCase();
      if (/^(?:JOIN|TELL|LET|HELP|WITH|FOR|GIVE|SHOW|SEND|CALL|FOLLOW|ABOUT|TO|OF|AMONG|BEHIND|BEFORE)$/.test(prev)) return lowerWord(tok, s, i);
      return letters(tok, suffix);
    }
    if ((tok === 'IT' || tok === 'AM') && shout) return lowerWord(tok, s, i);
    if (SHOUT_WORDS.has(tok) && !suffix) return lowerWord(tok, s, i);
    if (shout) {
      // Real words dominate shouted copy: spell only known acronyms, vowel-less
      // clusters and short unknown tokens.
      if (LETTER_ACRONYMS.has(tok) || !/[AEIOUY]/.test(tok) || tok.length <= 3) return letters(tok, suffix);
      return lowerWord(tok, s, i) + suffix;
    }
    if (tok.length <= 3 || LETTER_ACRONYMS.has(tok) || !pronounceable(tok)) return letters(tok, suffix);
    return tok[0] + tok.slice(1).toLowerCase() + suffix;
  });
  return st;
}

function pauses(st) {
  // Brackets become pauses: "the IMF (International Monetary Fund) said".
  st = sub(st, /\s*[([{]\s*/g, () => ', ');
  st = sub(st, /\s*[)\]}]/g, () => ',');
  // Dashes used as punctuation become pauses; hyphens inside words stay.
  st = sub(st, /\s*[—–]\s*|\s+-+\s+|(?<=\p{L})--(?=\p{L})/gu, () => ', ');
  // Quotes: drop the marks; a quoted sentence after a word gets a lead-in pause.
  st = sub(st, /(?<=\p{L}) "(?=[A-Z][^"]*\s[^"]*\s[^"]*")/gu, () => ', ');
  st = sub(st, /"/g, () => ' ');
  // Single quotes at word edges are quote marks (a plural possessive like
  // "workers'" sounds the same without its apostrophe).
  st = sub(st, /(?<=^|[\s,;:—–(])'(?=\S)|(?<=[\p{L}\p{N}.,!?])'(?=[\s.,;:!?)—–]|$)/gu, () => '');
  st = sub(st, /([!?])[!?]+/g, (mt) => (mt[0].includes('?') ? '?' : '!'));
  st = sub(st, /[|^\\_<>~]+/g, () => ' ');
  return st;
}

function tidy(st, srcText, { terminal = true } = {}) {
  // Symbols no voice should try to read (stars, arrows, leftover maths).
  st = sub(st, /[\p{So}\p{Sk}\p{Sm}\p{Sc}\p{Co}]+/gu, () => ' ');
  st = sub(st, /\s*\n[\s\n]*/g, (mt, s) => (/[\p{L}\p{N}]/u.test(s[mt.index - 1] || '') ? '. ' : ' '));
  st = sub(st, / {2,}/g, () => ' ');
  st = sub(st, / +(?=[,.;:!?…])/g, () => '');
  st = sub(st, /([,;:])(?:\s*[,;:])+/g, (mt) => mt[1]);
  st = sub(st, /[,;:]+(?=\s*[.!?…])/g, () => '');
  st = sub(st, /(?<=[.!?…])\s*[,;:]+/g, () => '');
  st = sub(st, /([,;:.!?…])(?=[\p{L}\p{N}])/gu, (mt, s) => {
    // "3.5" never survives to here, but keep "U.S."-like leftovers glued.
    if (mt[1] === '.' && /\p{L}\.$/u.test(s.slice(mt.index - 1, mt.index + 1)) && /^\p{Ll}/u.test(s[mt.index + 1])) return null;
    return `${mt[1]} `;
  });
  st = sub(st, /^[\s,;:.!?…]+/g, () => '');
  st = sub(st, /[\s,;:]+$/g, () => '');
  st = sub(st, / {2,}/g, () => ' ');
  // A sentence that started with a figure starts with a capital word now.
  st = sub(st, /(?<=^|[.!?…]\s)\p{Ll}/gu, (mt, s) => (/\p{Ll}/u.test(srcText[st.m[mt.index]] || '') ? null : mt[0].toUpperCase()));
  if (terminal && st.s && !/[.!?…]$/.test(st.s)) {
    st = { s: `${st.s}.`, m: [...st.m.slice(0, -1), st.m[st.m.length - 1], st.m[st.m.length - 1]] };
  }
  return st;
}

/**
 * Rewrite news copy for the ear. Returns `{ spoken, map }` where `map[i]` is
 * the offset in `text` of spoken character i (`map.length === spoken.length + 1`,
 * monotonic). Options: `lang` ('en-GB', 'en-US', 'es'...), `lexicon` (extra
 * word -> respelling), `terminal` (end with a full stop, default true).
 */
export function normalizeForSpeech(text, { lang = 'en-US', lexicon = null, terminal = true } = {}) {
  const L = langInfo(lang);
  let st = mapped(String(text ?? ''));
  st = cleanup(st);
  st = webJunk(st);
  st = applyLexicon(st, lexiconFor(lexicon));
  st = abbreviations(st, L);
  st = datesAndTimes(st, L);
  st = money(st, L);
  st = percentAndUnits(st, L);
  st = otherNumbers(st, L);
  st = plainNumbers(st, L);
  st = symbols(st, L);
  st = acronyms(st, L);
  st = pauses(st);
  st = tidy(st, String(text ?? ''), { terminal });
  return { spoken: st.s, map: st.m };
}

/** Just the spoken string. */
export function speakable(text, opts) {
  return normalizeForSpeech(text, opts).spoken;
}

// ================================================================ prosody

// Presenter pacing. `speed` multiplies the voice's natural rate, `pause` scales
// every planned silence, `variation` scales the seeded humanising jitter.
export const PERSONAS = {
  paco: { id: 'paco', speed: 0.98, pause: 1.12, variation: 0.55, desc: 'measured veteran, weighty full stops' },
  lola: { id: 'lola', speed: 1.05, pause: 0.95, variation: 1.15, desc: 'energetic and warm' },
  max: { id: 'max', speed: 1.08, pause: 0.86, variation: 1.3, desc: 'excitable, quick on the exclamations' },
  ada: { id: 'ada', speed: 1.03, pause: 1.0, variation: 0.8, desc: 'crisp and clear' },
  nova: { id: 'nova', speed: 1.0, pause: 1.1, variation: 0.9, wonder: true, desc: 'warm, with a breath of wonder before big reveals' },
  unit8: { id: 'unit8', speed: 1.0, pause: 1.0, variation: 0, even: true, quantize: 0.1, desc: 'even and precise' },
  penny: { id: 'penny', speed: 1.03, pause: 1.0, variation: 0.7, numbers: 0.95, desc: 'numbers first, figures read with care' },
  sam: { id: 'sam', speed: 1.1, pause: 0.84, variation: 1.0, desc: 'fast and friendly rolling news' },
  default: { id: 'default', speed: 1, pause: 1, variation: 0.8 },
};

const EMOTION_PROSODY = {
  neutral: { speed: 1, pause: 1, variation: 1 },
  happy: { speed: 1.03, pause: 0.92, variation: 1.2 },
  serious: { speed: 0.955, pause: 1.15, variation: 0.6 },
  sad: { speed: 0.935, pause: 1.22, variation: 0.5 },
  surprised: { speed: 1.04, pause: 0.9, variation: 1.2 },
  thinking: { speed: 0.965, pause: 1.2, variation: 1 },
};

const SEGMENT_PROSODY = {
  story: { speed: 1, pause: 1, end: 0.6, lead: 0.06 },
  intro: { speed: 1.0, pause: 1, end: 0.5, lead: 0.1 },
  chat: { speed: 1.03, pause: 0.9, end: 0.35, lead: 0 },
  outro: { speed: 0.97, pause: 1.05, end: 0.9, lead: 0.05 },
  headline: { speed: 1.02, pause: 0.95, end: 0.5, lead: 0 },
  roundup: { speed: 1.03, pause: 0.9, end: 0.55, lead: 0 },
  breaking: { speed: 0.97, pause: 1.1, end: 0.65, lead: 0.1 },
  number: { speed: 0.97, pause: 1.05, end: 0.6, lead: 0.08 },
  lighter: { speed: 1.02, pause: 1, end: 0.6, lead: 0.04 },
  ad: { speed: 1.04, pause: 0.85, end: 0.3, lead: 0 },
  default: { speed: 1, pause: 1, end: 0.55, lead: 0.04 },
};

// Silence after each kind of boundary, in seconds, before scaling.
export const PAUSES = {
  comma: 0.18, list: 0.12, intro: 0.15, semicolon: 0.26, colon: 0.28, dash: 0.24, paren: 0.16, quote: 0.14,
  stop: 0.42, question: 0.46, exclaim: 0.38, ellipsis: 0.55, paragraph: 0.7, breath: 0.08, wonder: 0.24,
};
const CLAUSE_KINDS = new Set(['comma', 'list', 'intro', 'semicolon', 'colon', 'dash', 'paren', 'quote', 'breath', 'wonder']);

const DISCOURSE = /^(?:yes|no|well|okay|oh|look|however|meanwhile|today|tonight|yesterday|now|still|instead|indeed|finally|and finally|first|second|so|well|but|also|in fact|of course|for now|elsewhere|overall|in short|sadly|happily|thanks|good evening|good morning|hello)$/i;
const EMPHASIS_WORDS = /^(?:record|highest|lowest|biggest|largest|smallest|first|last|worst|best|most|least|never|ever|only|all-time|historic|unprecedented|twice|double|half|triple|every|none|nobody|nothing|no|not|cannot|can't|won't|isn't|didn't|doesn't|huge|massive|tiny|extremely|very)$/i;
const BREATH_WORDS = /^(?:and|but|which|who|because|while|after|before|as|when|where|with|following|amid|despite|including|although|since|until|so)$/i;
const WONDER_RE = /\b(?:light[- ]years?|billion|million|galaxy|galaxies|universe|twice|times (?:bigger|larger|more|the size)|largest|oldest|farthest|furthest|first ever|ever seen|never seen|deepest|hottest|coldest|brightest)\b/i;

function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function resolvePersona(p) {
  if (!p) return PERSONAS.default;
  if (typeof p === 'string') return PERSONAS[p.toLowerCase()] || PERSONAS.default;
  if (p.id && PERSONAS[p.id] && Object.keys(p).length === 1) return PERSONAS[p.id];
  const base = (p.id && PERSONAS[p.id]) || (p.voice?.gender === 'robot' ? PERSONAS.unit8 : PERSONAS.default);
  return { ...base, ...p };
}

const round3 = (x) => Math.round(x * 1000) / 1000;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

function classify(spokenCh, origCh, origBetween) {
  if (/\n/.test(origBetween)) return 'paragraph';
  if (spokenCh === ',' || spokenCh === ';') {
    if (/[()[\]{}]/.test(origBetween)) return 'paren';
    if (/[—–]|\s-+\s/.test(origBetween)) return 'dash';
    if (/^[^\p{L}\p{N}]*$/u.test(origBetween) && [...origBetween].some((c) => QUOTE_CHARS.includes(c))) return 'quote';
  }
  if (origCh === '(' || origCh === ')' || origCh === '[' || origCh === ']') return 'paren';
  if (origCh === '—' || origCh === '–') return 'dash';
  return { ',': 'comma', ';': 'semicolon', ':': 'colon', '.': 'stop', '!': 'exclaim', '?': 'question', '…': 'ellipsis' }[spokenCh] || 'comma';
}

const wordCount = (s) => (s.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || []).length;

/**
 * Plan how `text` is spoken: normalise it, split it into phrases at clause
 * boundaries and give each a pause after it and a speed factor. Returns
 * `{ spoken, map, phrases, duration }`; see planProsody for the phrase shape.
 *
 * Options: persona (id, presenter config or {speed,pause,variation,...}),
 * emotion (cues.js EMOTIONS), segmentType ('story','intro','chat','outro',
 * 'headline','roundup','breaking','number','lighter','ad'), grave (bool),
 * lang, lexicon, seed, cues (parseCues output: emotion cues change the mood
 * from their char), final (pause after the last phrase, default by segment).
 */
export function planSpeech(text, opts = {}) {
  const src = String(text ?? '');
  const { spoken, map } = normalizeForSpeech(src, opts);
  const persona = resolvePersona(opts.persona);
  const seg = SEGMENT_PROSODY[opts.segmentType] || SEGMENT_PROSODY.default;
  const baseEmotion = opts.grave && (!opts.emotion || opts.emotion === 'neutral') ? 'serious' : opts.emotion || 'neutral';
  const rand = rng(hashString(`${src}|${persona.id}|${opts.seed ?? ''}`));
  const emotionCues = (opts.cues || []).filter((c) => c.emotion && EMOTION_PROSODY[c.emotion]).sort((a, b) => a.char - b.char);
  const emotionAt = (orig) => {
    let e = baseEmotion;
    for (const c of emotionCues) if (c.char <= orig && !c.slot) e = c.emotion;
    return EMOTION_PROSODY[e] ? e : 'neutral';
  };

  // 1. Cut the spoken text at punctuation into raw pieces.
  const raw = [];
  let start = 0;
  const re = /[,;:.!?…](?=\s|$)/g;
  for (const m of spoken.matchAll(re)) {
    const end = m.index + 1;
    if (spoken.slice(start, end).trim()) raw.push({ ss: start, se: end, mark: m[0] });
    start = end;
  }
  if (spoken.slice(start).trim()) raw.push({ ss: start, se: spoken.length, mark: '' });

  // 2. Long stretches without punctuation get a breath at a conjunction.
  const pieces = [];
  for (const p of raw) {
    const chunk = spoken.slice(p.ss, p.se);
    const words = [...chunk.matchAll(/\S+/g)];
    if (words.length > 16) {
      let best = -1;
      let bestScore = Infinity;
      words.forEach((w, k) => {
        if (k < 5 || words.length - k < 5 || !BREATH_WORDS.test(w[0])) return;
        const score = Math.abs(k - words.length / 2);
        if (score < bestScore) { bestScore = score; best = k; }
      });
      if (best > 0) {
        const cut = p.ss + words[best].index;
        pieces.push({ ss: p.ss, se: cut, mark: '', breath: true });
        pieces.push({ ss: cut, se: p.se, mark: p.mark });
        continue;
      }
    }
    pieces.push(p);
  }

  // 3. Nova's wonder pause: a breath before the big reveal in a sentence.
  if (persona.wonder && !/^(?:ad|headline|roundup)$/.test(opts.segmentType || '')) {
    const wondered = new Set();
    const sentenceOf = (k) => pieces.slice(0, k).filter((q) => /[.!?…]/.test(q.mark)).length;
    for (let k = 0; k < pieces.length; k++) {
      const p = pieces[k];
      const chunk = spoken.slice(p.ss, p.se);
      const m = WONDER_RE.exec(chunk);
      // At most one wonder pause every other sentence, or it turns into a mannerism.
      if (!m || wondered.has(sentenceOf(k)) || wondered.has(sentenceOf(k) - 1)) continue;
      // Step back to the start of the noun phrase: "about twice the size", "a planet one hundred light years".
      const before = chunk.slice(0, m.index);
      const lead = /(?:\b(?:about|nearly|almost|some|more than|roughly|over|around|just|the|a|an)\s+)?(?:[\p{L}-]+\s+){0,4}$/u.exec(before);
      let cutRel = lead ? lead.index : m.index;
      const numStart = /\b(?:about|nearly|almost|some|roughly|more than|over|around|twice|one|two|three|four|five|six|seven|eight|nine|ten|hundred|a hundred)\b/i.exec(before.slice(cutRel));
      if (numStart) cutRel += numStart.index;
      if (wordCount(chunk.slice(0, cutRel)) < 3 || wordCount(chunk.slice(cutRel)) < 2) continue;
      if (rand() > 0.85) continue;
      wondered.add(sentenceOf(k));
      const cut = p.ss + cutRel;
      pieces.splice(k, 1, { ss: p.ss, se: cut, mark: '', wonder: true }, { ss: cut, se: p.se, mark: p.mark, revealed: true });
      k++;
    }
  }

  // 4. Classify boundaries, then pause and pace per phrase.
  const phrases = [];
  let sentence = 0;
  let sentenceJitter = 1 + (rand() * 2 - 1) * 0.02;
  const pcount = pieces.length;
  // Original slices partition the text: a phrase runs up to where the next
  // one starts, so a dash or bracket between them stays with the first.
  const lead = (p) => p.ss + (spoken.slice(p.ss, p.se).length - spoken.slice(p.ss, p.se).trimStart().length);
  const starts = pieces.map((p, k) => (k ? toOriginal(map, lead(p)) : 0));
  for (let k = 0; k < pcount; k++) {
    const p = pieces[k];
    const next = pieces[k + 1];
    let os = starts[k];
    let oe = next ? starts[k + 1] : src.length;
    while (oe > os && /\s/.test(src[oe - 1])) oe--;
    while (os < oe && /\s/.test(src[os])) os++;
    const markOrig = p.mark ? src[toOriginal(map, p.se - 1)] : '';
    const between = next ? src.slice(toOriginal(map, p.se - 1), starts[k + 1]) : '';
    let kind = p.wonder ? 'wonder' : p.breath ? 'breath' : p.mark ? classify(p.mark, markOrig, between) : 'stop';
    // '"Yes!" he replied.' - a quoted line running into its attribution.
    if ((kind === 'exclaim' || kind === 'question') && next && /^\s*\p{Ll}/u.test(spoken.slice(next.ss, next.se))) kind = 'quote';
    const spokenText = spoken.slice(p.ss, p.se).trim();
    const words = wordCount(spokenText);
    if (kind === 'comma') {
      const firstOfSentence = !phrases.length || /^(?:stop|exclaim|question|ellipsis|paragraph)$/.test(phrases[phrases.length - 1].boundary);
      if (firstOfSentence && DISCOURSE.test(spokenText.replace(/[,;:]$/, ''))) kind = 'intro';
      else if (words <= 3 && next && !/^(?:and|or|but|in|on|at|for|so|then|with|from)\b/i.test(spokenText)) {
        // "apples, pears, plums and figs": short items followed by another item.
        const nextText = spoken.slice(next.ss, next.se).trim();
        if ((wordCount(nextText) <= 3 && /,$/.test(nextText)) || /^(?:[\p{L}'-]+\s+){0,2}(?:and|or)\s/iu.test(nextText)) kind = 'list';
      }
    }
    const emotion = emotionAt(os);
    const E = EMOTION_PROSODY[emotion];
    const variation = persona.variation * E.variation;
    const last = k === pcount - 1;

    // Pause after the phrase.
    let pause;
    if (last) pause = (opts.final ?? seg.end) * persona.pause;
    else {
      pause = PAUSES[kind] * persona.pause * E.pause * seg.pause;
      if (kind === 'stop' && sentence === 0) pause += seg.lead;
      if (kind === 'exclaim' && persona.id === 'max') pause *= 0.85;
      if (emotion === 'thinking' && CLAUSE_KINDS.has(kind)) pause *= 1.1;
      pause *= 1 + (rand() * 2 - 1) * 0.12 * variation;
    }
    if (persona.even && !last) pause = CLAUSE_KINDS.has(kind) ? (kind === 'breath' ? 0.1 : 0.2) : kind === 'paragraph' ? 0.7 : 0.4;
    if (persona.quantize) pause = Math.max(persona.quantize, Math.round(pause / persona.quantize) * persona.quantize);

    // Pace: persona x mood x segment, a slower read for dense figures.
    const origSlice = src.slice(os, oe);
    let speed = persona.speed * seg.speed * (persona.even ? 1 + (E.speed - 1) * 0.25 : E.speed);
    if (/\d/.test(origSlice)) speed *= persona.numbers || 0.975;
    if (kind === 'paren' && markOrig === ')') speed *= 1.03;
    if (p.revealed) speed *= 0.95;
    if (!persona.even) speed *= sentenceJitter * (1 + (rand() * 2 - 1) * 0.008 * variation);

    // Words worth leaning on (for the face: brows, nods; for engines with stress control).
    const emphasis = [];
    for (const m of origSlice.matchAll(/[\p{L}\p{N}$€£¥%.,'-]+/gu)) {
      const wd = m[0].replace(/^[.,'-]+|[.,'-]+$/g, '');
      if (!wd) continue;
      let strength = 0;
      if (/\d/.test(wd)) strength = 0.8;
      else if (EMPHASIS_WORDS.test(wd)) strength = /^(?:not|no|never|cannot)$/i.test(wd) ? 0.6 : 0.7;
      else if (wd.length >= 4 && wd === wd.toUpperCase() && /[A-Z]/.test(wd) && !(wd in WORD_ACRONYMS) && !LETTER_ACRONYMS.has(wd) && !persona.even) strength = 0.9;
      if (!strength) continue;
      const at = os + m.index + m[0].indexOf(wd);
      emphasis.push({ word: wd, start: at, end: at + wd.length, strength });
    }
    emphasis.sort((a, b) => b.strength - a.strength || a.start - b.start);
    emphasis.length = Math.min(emphasis.length, persona.even ? 1 : 2);
    emphasis.sort((a, b) => a.start - b.start);

    phrases.push({
      text: src.slice(os, oe),
      spoken: spokenText,
      start: os,
      end: oe,
      spokenStart: lead(p),
      spokenEnd: p.ss + spoken.slice(p.ss, p.se).trimEnd().length,
      pauseAfter: round3(clamp(pause, 0, 2.5)),
      speedFactor: round3(clamp(speed, 0.8, 1.2)),
      emphasis,
      boundary: last ? 'end' : kind,
      sentence,
      emotion,
    });
    if (/^(?:stop|exclaim|question|ellipsis|paragraph)$/.test(kind)) {
      sentence++;
      sentenceJitter = 1 + (rand() * 2 - 1) * 0.02 * Math.max(0.5, variation);
    }
  }
  return { spoken, map, phrases, duration: estimateDuration(phrases) };
}

/**
 * Phrases for `text`: [{ text (original slice, as captions show it), spoken
 * (what to synthesise), start, end (offsets in text), spokenStart, spokenEnd,
 * pauseAfter (s), speedFactor (x the voice's natural rate), emphasis
 * [{word,start,end,strength}], boundary, sentence, emotion }].
 */
export function planProsody(text, opts = {}) {
  return planSpeech(text, opts).phrases;
}

/** Rough spoken length in seconds (about 14.5 spoken characters per second at speed 1). */
export function estimateDuration(phrases) {
  let t = 0;
  for (const p of phrases) t += p.spoken.length / (14.5 * (p.speedFactor || 1)) + (p.pauseAfter || 0);
  return round3(t);
}
