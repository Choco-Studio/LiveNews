// Sentence splitting for speech and captions. DOM-free (node tests and the
// v2 planners import it without loading the AudioEngine); audio.js re-exports it.

const MAX_CHUNK = 180;
const MIN_CHUNK = 12;

// Abbreviations whose dot does not end a sentence ("Dr. Smith", "EE. UU.").
// Single letters ("U.S.", "e.g.", "J. K.") are handled separately.
const ABBREV = new Set([
  // English
  'mr', 'mrs', 'ms', 'dr', 'prof', 'st', 'jr', 'sr', 'inc', 'ltd', 'co', 'corp', 'bros', 'gen', 'gov',
  'sen', 'rep', 'lt', 'col', 'sgt', 'capt', 'cmdr', 'mt', 'ft', 'vs', 'dept', 'govt', 'approx',
  // Spanish
  'sra', 'srta', 'dra', 'ud', 'uds', 'vd', 'vds', 'sta', 'sto', 'ing', 'lic', 'gral', 'av', 'avda',
  'pág', 'págs', 'núm', 'aprox', 'ee', 'cc', 'ej', 'tel', 'excmo', 'excma', 'ilmo', 'ilma', 'mons',
]);
// Only abbreviations when a number follows: "No. 5", "Oct. 12" (but "No. He left." splits).
const NUM_ABBREV = new Set([
  'no', 'nos', 'fig', 'vol', 'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec',
]);

/** Is this word's final dot an abbreviation's ("Lt.", "Dr.", "U.S.", "J."), not a sentence end? */
export function abbreviationDot(raw) {
  const w = String(raw ?? '').replace(/^[("'“‘«¿¡]+/, '');
  if (!w.endsWith('.')) return false;
  const bare = w.slice(0, -1);
  return /^\p{L}$/u.test(bare) || /^(?:\p{L}\.)+\p{L}$/u.test(bare) || ABBREV.has(bare.toLowerCase());
}

function isBoundary(src, from, to, run) {
  // `to` is the index of the whitespace after the terminator run.
  const next = src[to + 1];
  if (next && /\p{Ll}/u.test(next)) return false; // "U.S. officials", "bueno… vamos", '"Stop." he said'
  if (run === '.') {
    const word = /(\p{L}+)$/u.exec(src.slice(Math.max(0, from - 12), from))?.[1];
    if (word) {
      const w = word.toLowerCase();
      if (word.length === 1 || ABBREV.has(w)) return false; // initials and dotted acronyms too
      if (NUM_ABBREV.has(w) && /\d/.test(next ?? '')) return false;
    }
  }
  return true;
}

function cutLong(text) {
  const out = [];
  let rest = text;
  while (rest.length > MAX_CHUNK) {
    // The window leaves at least MIN_CHUNK chars for the tail so it is not a stub.
    const win = rest.slice(0, Math.min(MAX_CHUNK + 1, rest.length - MIN_CHUNK));
    let cut = Math.max(win.lastIndexOf(', '), win.lastIndexOf('; '), win.lastIndexOf(': ')) + 1;
    if (cut < MAX_CHUNK * 0.4) cut = win.lastIndexOf(' ');
    if (cut <= 0) cut = Math.min(MAX_CHUNK, win.length); // unbroken text: hard cut
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

// Splits English and Spanish text on . ! ? … (keeping the punctuation) without
// breaking numbers ("6.1", "$1.2bn"), abbreviations ("Dr.", "U.S.", "EE. UU.") or
// lower-case continuations; glues fragments shorter than 12 chars to their
// neighbour and cuts anything over ~180 chars at a comma or space.
export function splitSentences(text) {
  const src = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!src) return [];
  const parts = [];
  const re = /[.!?…]+["'’”»)\]]*(?=\s|$)/g;
  let start = 0;
  let m;
  while ((m = re.exec(src))) {
    const end = m.index + m[0].length;
    if (end >= src.length) break;
    if (!isBoundary(src, m.index, end, m[0])) continue;
    parts.push(src.slice(start, end).trim());
    start = end;
  }
  const tail = src.slice(start).trim();
  if (tail) parts.push(tail);

  const merged = [];
  for (const p of parts) {
    const prev = merged[merged.length - 1];
    if (prev && p.length < MIN_CHUNK && prev.length + 1 + p.length <= MAX_CHUNK) {
      merged[merged.length - 1] = `${prev} ${p}`;
    } else {
      merged.push(p);
    }
  }
  if (merged.length > 1 && merged[0].length < MIN_CHUNK && merged[0].length + 1 + merged[1].length <= MAX_CHUNK) {
    merged.splice(0, 2, `${merged[0]} ${merged[1]}`);
  }
  return merged.flatMap((p) => (p.length > MAX_CHUNK ? cutLong(p) : [p]));
}
