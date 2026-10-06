// Phrase-aware line and page breaking for on-screen text: caption pages (two
// lines), strap pages and ticker pages (one line each). Subtitlers and
// graphics editors break at clause boundaries and never leave an article, a
// preposition or a number cut off from its noun at the end of a line or page;
// a small dynamic programme over the words does the same here, and keeps the
// lines of a page balanced. Nothing ever scrolls: text that does not fit is
// shown as pages. Results are cached per text and width, and the graphics
// keep the result on their state, so this never runs per frame.
import { abbreviationDot } from '../audio/sentences.js';
import { measureText } from '../font.js';

const GAP = measureText('A B') - 2 * measureText('A'); // pixels between two words (4)
export const ELLIPSIS = '...';
/** Width an ellipsis adds after the last letter of a line (letter gap + dots). */
export const ELLIPSIS_W = 1 + measureText(ELLIPSIS);
/** Width a leading ellipsis adds before the first letter of a line. */
const LEAD_W = measureText(ELLIPSIS) + 1;

const words = (s) => new Set(s.split(' '));
// Never end a line on these: articles, prepositions, possessives, conjunctions, titles.
const WEAK_END = words(
  'A AN THE OF TO IN ON AT BY FOR FROM WITH INTO ONTO OVER UNDER ABOUT AND OR BUT NOR ITS HIS HER THEIR OUR MY YOUR ' +
    'MR MRS MS DR ST PER THAN VIA AS AFTER BEFORE DURING SINCE UNTIL THROUGH THROUGHOUT ACROSS AGAINST BETWEEN AMONG ' +
    'AMONGST AROUND NEAR WITHOUT WITHIN DESPITE AMID TOWARDS TOWARD BEHIND BEYOND BELOW ABOVE ALONG LIKE UNLIKE OFF UPON EVEN'
);
// Avoid ending on these if a better break is close (auxiliaries, determiners, relatives).
const SOFT_END = words('IS ARE WAS WERE BE BEEN WILL WOULD CAN COULD SHOULD MAY MIGHT MUST HAS HAVE HAD NOT NO VERY MORE MOST LESS THIS THESE THOSE THAT WHICH WHO SOME ANY EACH EVERY');
// A line that starts on an auxiliary cuts the subject off its verb ("and lava / has reached").
const AUX = words('IS ARE WAS WERE HAS HAVE HAD WILL WOULD CAN COULD SHOULD MAY MIGHT MUST');
// "northern / Chile": a compass word belongs to the name after it.
const COMPASS = words('NORTH SOUTH EAST WEST NORTHERN SOUTHERN EASTERN WESTERN CENTRAL NORTHEAST NORTHWEST SOUTHEAST SOUTHWEST NORTHEASTERN NORTHWESTERN SOUTHEASTERN SOUTHWESTERN UPPER LOWER GREATER');
// Words ending in -EST are mostly superlatives ("the highest / rate"), except these nouns and verbs.
const NOT_SUPERLATIVE = words('INTEREST PROTEST PROTESTS HARVEST REQUEST CONTEST FOREST ARREST SUGGEST INVEST DIGEST MANIFEST CONQUEST INQUEST BEHEST TEMPEST UNREST');
// Good places to start a line: a new clause...
const CLAUSE_START = words('BUT NOR SO YET WHILE WHEREAS BECAUSE ALTHOUGH THOUGH SINCE UNLESS UNTIL WHEN WHERE WHICH WHO WHOSE THAT IF WITH WITHOUT AMID DESPITE AS');
// ...("and"/"or" also join two nouns: "Canada and Mexico", so they count as a phrase start)...
// ...or a prepositional phrase.
const PHRASE_START = words('AND OR IN ON AT FOR FROM TO OF BY INTO OVER UNDER ABOUT ACROSS AGAINST AMONG AROUND BETWEEN DURING NEAR THROUGH TOWARDS TOWARD WITHIN AFTER BEFORE');
const UNIT = words('PER CENT PERCENT MILLION MILLIONS BILLION BILLIONS TRILLION THOUSAND THOUSANDS HUNDRED BN KM KG MPH %');
const NUMBER = /^[$£€]?\d[\d.,:]*(%|BN|M|K|KM|KG|S)?$/;
const DASH = words('- – —');

const sq = (x) => x * x;

// Cost profiles. A page costs more than a line, a page break at a weak word
// costs more than a line break there, balance and fill keep text from looking
// ragged. 'line' (strap, ticker): a one-line page is read as a unit, so it
// should carry most of the text ("fill1"), and a page with only a word or two
// on it is never right. 'caption': subtitles are ragged by nature, so an extra
// page is cheap next to a line or page that cuts a phrase ("the highest /
// rate", "the Great / Barrier Reef"). A one-line page under `scrapPage` of its
// width is a scrap (ramped, no cliff); a closing page may be shorter (`scrapLast`).
const STYLES = {
  line: { page: 1, line: 0.25, fill: 0.6, fill1: 1, widow: 0.8, scrap: 2.5, balance: 2.5, lineBreak: 1, pageBreak: 1.6, pageBad: 0.6, overlong: 10, scrapPage: 0.35, scrapLast: 0.22, scrapLine: 0.3, words: 0 },
  caption: { page: 0.4, line: 0.25, fill: 0.3, fill1: 0.2, widow: 0.3, scrap: 2.5, balance: 1.2, lineBreak: 2, pageBreak: 1.2, pageBad: 1, overlong: 10, scrapPage: 0.2, scrapLast: 0.12, scrapLine: 0.25, words: 0 },
};

/** Word tokens of `text` with their character offsets, lookup forms and capitalisation. */
function tokenize(text) {
  const out = [];
  const re = /\S+/g;
  // proper names only show in mixed-case text: in a CAPS headline every word is capitalised
  const mixed = /\p{Ll}/u.test(text);
  let initial = true;
  let m;
  while ((m = re.exec(text))) {
    const raw = m[0];
    const bare = raw.toUpperCase().replace(/^[("'“‘«¿¡]+/, '').replace(/[)"'”’»,.;:!?…]+$/, '').replace(/['’]S$/, '');
    const first = raw.replace(/^[("'“‘«¿¡]+/, '');
    const cap = mixed && /^\p{Lu}/u.test(first);
    out.push({ raw, bare, start: m.index, w: measureText(raw), cap, initial });
    initial = /[.!?:…]$/.test(raw);
  }
  return out;
}

/**
 * Cost of breaking between token a and the token b after it: 0 after a full
 * stop, small at a clause boundary, high after a weak word or inside a name.
 * Never negative, so an extra line or page is never "bought" by a good break
 * (a sentence that fits on one line stays on one line).
 */
function boundary(a, b) {
  const last = a.raw[a.raw.length - 1];
  // an abbreviation's dot ends nothing: "The now-former Lt. / governor" once paged a caption on "LT." (TECH BYTES 5 Oct)
  const abbr = last === '.' && abbreviationDot(a.raw);
  if (!abbr && (last === '.' || last === '!' || last === '?' || last === '…')) return 0;
  if (last === ',' || last === ';' || last === ':' || DASH.has(a.raw) || DASH.has(b.raw)) return 0.4;
  if (last === ')' || b.raw[0] === '(') return 0.7;
  let c = 1.2;
  // between two content words ("water | vapour", "historic | centre") is the
  // worst ordinary break: compounds and adjective + noun pairs live there
  if (CLAUSE_START.has(b.bare)) c -= 0.6;
  else if (PHRASE_START.has(b.bare)) c -= 0.5;
  if (abbr || WEAK_END.has(a.bare)) c += 2;
  else if (SOFT_END.has(a.bare)) c += 0.6;
  if (AUX.has(b.bare)) c += 0.5;
  // a line that starts on a past-tense verb cuts the subject off it ("after fog / closed it")
  else if (b.bare.length >= 5 && b.bare.endsWith('ED') && !a.cap) c += 0.4;
  if (a.bare.length >= 6 && a.bare.endsWith('EST') && !NOT_SUPERLATIVE.has(a.bare)) c += 1;
  // a hyphenated word is mostly a compound modifier: "four-day / school week", "3,000-year-old / temple"
  if (a.bare.length > 2 && a.bare.includes('-') && !CLAUSE_START.has(b.bare) && !PHRASE_START.has(b.bare)) c += 1;
  if (NUMBER.test(a.bare)) c += UNIT.has(b.bare) ? 2.5 : 1.2;
  // two capitalised words inside a sentence are one name: "Great Barrier Reef", "New Zealand"
  if (a.cap && b.cap && !a.initial) c += 2.5;
  else if (b.cap && COMPASS.has(a.bare)) c += 2;
  // a name mid-sentence binds to the word after it: "the Pacific / coast", "Chile / spots"
  else if (a.cap && !a.initial && !b.cap && !CLAUSE_START.has(b.bare) && !PHRASE_START.has(b.bare)) c += 0.8;
  return c;
}

const memo = new Map();
const EMPTY = Object.freeze([]);

/**
 * Break `text` into pages of `perPage` lines (1 or 2), each line at most
 * `maxW` pixels in the body face (`firstMaxW` for the very first line, e.g.
 * when a source label sits before it). `more` pixels are reserved on the last
 * line of every page but the final one (room for an ellipsis), `lead` pixels
 * at the start of every page but the first (a leading ellipsis). `style` picks
 * the cost profile ('line' for straps and the ticker, 'caption' for
 * subtitles); `minShare` raises the scrap floor of one-line pages and
 * `minWords` asks every page of a split text for at least that many words.
 * Returns frozen pages [{ lines: [string], start }] where `start` is the
 * character offset of the page's first word in `text`. Words are never split
 * or dropped: joining every line with spaces gives the words of `text`.
 */
export function layoutText(text, { maxW, firstMaxW = maxW, perPage = 1, more = 0, lead = 0, style = 'line', minShare = 0, minWords = 0 }) {
  const s = typeof text === 'string' ? text : String(text ?? '');
  const key = `${maxW}|${firstMaxW}|${perPage}|${more}|${lead}|${style}|${minShare}|${minWords}|${s}`;
  const hit = memo.get(key);
  if (hit) return hit;
  const tokens = tokenize(s);
  // subtitle rule: text that fits on one line stays on one line
  const fits = tokens.length && measureText(s.trim().replace(/\s+/g, ' ')) <= firstMaxW;
  let cost = STYLES[style] || STYLES.line;
  if (minShare || minWords) cost = { ...cost, scrapPage: Math.max(cost.scrapPage, minShare), scrapLast: Math.max(cost.scrapLast, minShare), words: minWords };
  const pages = fits
    ? Object.freeze([Object.freeze({ lines: Object.freeze([tokens.map((t) => t.raw).join(' ')]), start: tokens[0].start })])
    : tokens.length ? solve(tokens, maxW, firstMaxW, perPage === 2 ? 2 : 1, more, lead, cost) : EMPTY;
  if (memo.size >= 600) memo.delete(memo.keys().next().value);
  memo.set(key, pages);
  return pages;
}

function solve(tokens, maxW, firstMaxW, perPage, more, lead, C) {
  const n = tokens.length;
  const pre = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + tokens[i].w;
  const width = (i, j) => pre[j] - pre[i] + GAP * (j - i - 1);
  const cut = new Float64Array(n + 1); // boundary cost before token i
  for (let i = 1; i < n; i++) cut[i] = boundary(tokens[i - 1], tokens[i]);
  // a page of a split text with fewer than C.words words is a scrap too ("...AT 3.5 PERCENT")
  const few = (count) => (C.words && count < C.words ? 1.5 * C.scrap * ((C.words - count) / C.words) : 0);
  // a clean break earns a small bonus inside a page; a bad one costs C.lineBreak per unit
  const lineCost = (c) => (c <= 0.8 ? c - 0.8 : C.lineBreak * (c - 0.8));
  const pageCost = (c) => C.pageBreak * c + C.pageBad * Math.max(0, c - 0.8);

  // best[i]: cheapest layout of tokens i.. starting a fresh page at i
  const best = new Float64Array(n + 1).fill(Infinity);
  const endA = new Int32Array(n + 1); // end of the page's first line
  const endB = new Int32Array(n + 1); // end of the page (== endA for a one-line page)
  best[n] = 0;
  for (let i = n - 1; i >= 0; i--) {
    const cap1 = i === 0 ? firstMaxW : maxW - lead;
    for (let j = i + 1; j <= n; j++) {
      const w1 = width(i, j);
      const single = j === i + 1;
      if (w1 > cap1 && !single) break;
      const over1 = w1 > cap1 ? C.overlong : 0;
      // one-line page [i, j)
      const last = j === n;
      const lim = cap1 - (last ? 0 : more);
      if (w1 <= lim || single) {
        const share = w1 / (last ? maxW : lim);
        const floor = last ? C.scrapLast : C.scrapPage;
        const whole = i === 0 && last;
        const scrap = whole ? 0 : C.scrap * Math.max(0, (floor - share) / floor) + few(j - i);
        const fill = scrap + (last ? (i === 0 ? 0 : C.widow * sq(1 - share)) : C.fill1 * sq(1 - Math.min(1, share)));
        const cost = C.page + C.line + fill + over1 + (w1 > lim ? C.overlong : 0) + (last ? 0 : pageCost(cut[j])) + best[j];
        if (cost < best[i]) {
          best[i] = cost;
          endA[i] = j;
          endB[i] = j;
        }
      }
      if (perPage < 2 || last) continue;
      // two-line page [i, j) + [j, m)
      // inside a page a good break may even beat a fuller line (the extra line is paid by C.line)
      const lineCut = lineCost(cut[j]);
      for (let m = j + 1; m <= n; m++) {
        const w2 = width(j, m);
        const single2 = m === j + 1;
        if (w2 > maxW && !single2) break;
        const fin = m === n;
        const lim2 = maxW - (fin ? 0 : more);
        if (w2 > lim2 && !single2) continue;
        const over2 = w2 > lim2 ? C.overlong : 0;
        // two lines of a caption read as one block: keep them close in length, never a lone word on top
        const bal = C.balance * sq((w1 - w2) / maxW) + C.scrap * Math.max(0, (C.scrapLine - Math.min(w1, w2) / maxW) / C.scrapLine);
        const fill = C.fill * sq((maxW - Math.max(w1, w2)) / maxW) + (i === 0 && fin ? 0 : few(m - i));
        const cost = C.page + 2 * C.line + bal + fill + over1 + over2 + lineCut + (fin ? 0 : pageCost(cut[m])) + best[m];
        if (cost < best[i]) {
          best[i] = cost;
          endA[i] = j;
          endB[i] = m;
        }
      }
    }
  }

  const join = (a, b) => {
    let line = tokens[a].raw;
    for (let k = a + 1; k < b; k++) line += ` ${tokens[k].raw}`;
    return line;
  };
  const pages = [];
  for (let i = 0; i < n; ) {
    const a = endA[i];
    const b = endB[i];
    const lines = a === b ? [join(i, a)] : [join(i, a), join(a, b)];
    pages.push(Object.freeze({ lines: Object.freeze(lines), start: tokens[i].start }));
    i = b;
  }
  return Object.freeze(pages);
}

/**
 * One-line pages for a strap or ticker: the whole text when it fits, else
 * phrase-aware pages where every page but the last ends with an ellipsis.
 * With `lead` every page but the first also starts with one, so a page on its
 * own still reads as a continuation ("...ON A DISTANT PLANET"). `minShare` and
 * `minWords` keep scraps off air (see layoutText). At most `maxPages`;
 * anything beyond is cut at a word with an ellipsis. Returns a frozen array of strings.
 */
export function linePages(text, maxW, { firstMaxW = maxW, maxPages = 3, lead = false, minShare = 0, minWords = 0 } = {}) {
  const s = String(text ?? '').trim();
  if (!s) return EMPTY;
  if (measureText(s) <= firstMaxW) return Object.freeze([s]);
  // past maxPages the tail is cut rather than packing every page into weak breaks
  // ("...THE COAST OF..."): a strap or ticker page must read as a phrase
  const pages = layoutText(s, { maxW, firstMaxW, perPage: 1, more: ELLIPSIS_W, lead: lead ? LEAD_W : 0, minShare, minWords });
  const out = [];
  const n = Math.min(pages.length, maxPages);
  for (let i = 0; i < n; i++) {
    const line = pages[i].lines[0];
    const cont = i < pages.length - 1;
    const body = cont ? withEllipsis(line) : line;
    out.push(lead && i > 0 ? `${ELLIPSIS}${body}` : body);
  }
  return Object.freeze(out);
}

/** "SNAP ELECTION," -> "SNAP ELECTION..." (a sentence end keeps its full stop). */
export function withEllipsis(line) {
  if (/[.!?…]$/.test(line)) return line;
  return `${line.replace(/\s*[,;:\-–—]+$/, '')}${ELLIPSIS}`;
}
