// Phrase-aware line and page breaking for on-screen text: caption pages (two
// lines), strap pages and ticker pages (one line each). Subtitlers and
// graphics editors break at clause boundaries and never leave an article, a
// preposition or a number cut off from its noun at the end of a line or page;
// a small dynamic programme over the words does the same here, and keeps the
// lines of a page balanced. Nothing ever scrolls: text that does not fit is
// shown as pages. Results are cached per text and width, and the graphics
// keep the result on their state, so this never runs per frame.
import { measureText } from '../font.js';

const GAP = measureText('A B') - 2 * measureText('A'); // pixels between two words (4)
export const ELLIPSIS = '...';
/** Width an ellipsis adds after the last letter of a line (letter gap + dots). */
export const ELLIPSIS_W = 1 + measureText(ELLIPSIS);

const words = (s) => new Set(s.split(' '));
// Never end a line on these: articles, prepositions, possessives, conjunctions, titles.
const WEAK_END = words('A AN THE OF TO IN ON AT BY FOR FROM WITH INTO ONTO OVER UNDER ABOUT AND OR BUT NOR ITS HIS HER THEIR OUR MY YOUR MR MRS MS DR ST PER THAN VIA AS');
// Avoid ending on these if a better break is close (auxiliaries, determiners, relatives).
const SOFT_END = words('IS ARE WAS WERE BE BEEN WILL WOULD CAN COULD SHOULD MAY MIGHT MUST HAS HAVE HAD NOT NO VERY MORE MOST LESS THIS THESE THOSE THAT WHICH WHO SOME ANY EACH EVERY');
// Good places to start a line: a new clause...
const CLAUSE_START = words('AND BUT OR NOR SO YET WHILE WHEREAS BECAUSE ALTHOUGH THOUGH SINCE UNLESS UNTIL WHEN WHERE WHICH WHO WHOSE THAT IF WITH WITHOUT AMID DESPITE AS');
// ...or a prepositional phrase.
const PHRASE_START = words('IN ON AT FOR FROM TO OF BY INTO OVER UNDER ABOUT ACROSS AGAINST AMONG AROUND BETWEEN DURING NEAR THROUGH TOWARDS TOWARD WITHIN AFTER BEFORE');
const UNIT = words('PER CENT PERCENT MILLION MILLIONS BILLION BILLIONS TRILLION THOUSAND THOUSANDS HUNDRED BN KM KG MPH %');
const NUMBER = /^[$£€]?\d[\d.,:]*(%|BN|M|K|KM|KG|S)?$/;
const DASH = words('- – —');

const sq = (x) => x * x;

// Cost weights: a page costs more than a line, a page break at a weak word costs
// more than a line break there, balance and fill keep text from looking ragged.
const COST = { page: 1, line: 0.25, fill: 0.6, widow: 0.8, balance: 1, lineBreak: 1, pageBreak: 1.6, overlong: 10 };

/** Word tokens of `text` with their character offsets and lookup forms. */
function tokenize(text) {
  const out = [];
  const re = /\S+/g;
  let m;
  while ((m = re.exec(text))) {
    const raw = m[0];
    const bare = raw.toUpperCase().replace(/^[("'“‘«¿¡]+/, '').replace(/[)"'”’»,.;:!?…]+$/, '').replace(/['’]S$/, '');
    out.push({ raw, bare, start: m.index, w: measureText(raw) });
  }
  return out;
}

/**
 * Cost of breaking between token a and the token b after it: 0 after a full
 * stop, small at a clause boundary, high after a weak word. Never negative, so
 * an extra line or page is never "bought" by a good break (a sentence that fits
 * on one line stays on one line).
 */
function boundary(a, b) {
  const last = a.raw[a.raw.length - 1];
  if (last === '.' || last === '!' || last === '?' || last === '…') return 0;
  if (last === ',' || last === ';' || last === ':' || DASH.has(a.raw) || DASH.has(b.raw)) return 0.4;
  if (last === ')' || b.raw[0] === '(') return 0.7;
  let c = 1.2;
  if (CLAUSE_START.has(b.bare)) c -= 0.4;
  else if (PHRASE_START.has(b.bare)) c -= 0.2;
  if (WEAK_END.has(a.bare)) c += 2;
  else if (SOFT_END.has(a.bare)) c += 0.6;
  if (NUMBER.test(a.bare)) c += UNIT.has(b.bare) ? 2.5 : 1.2;
  return c;
}

const memo = new Map();
const EMPTY = Object.freeze([]);

/**
 * Break `text` into pages of `perPage` lines (1 or 2), each line at most
 * `maxW` pixels in the body face (`firstMaxW` for the very first line, e.g.
 * when a source label sits before it). `more` pixels are reserved on the last
 * line of every page but the final one (room for an ellipsis). `pack` puts the
 * fewest pages first and phrasing second.
 * Returns frozen pages [{ lines: [string], start }] where `start` is the
 * character offset of the page's first word in `text`. Words are never split
 * or dropped: joining every line with spaces gives the words of `text`.
 */
export function layoutText(text, { maxW, firstMaxW = maxW, perPage = 1, more = 0, pack = false }) {
  const s = typeof text === 'string' ? text : String(text ?? '');
  const key = `${maxW}|${firstMaxW}|${perPage}|${more}|${pack ? 1 : 0}|${s}`;
  const hit = memo.get(key);
  if (hit) return hit;
  const tokens = tokenize(s);
  // subtitle rule: text that fits on one line stays on one line
  const fits = tokens.length && measureText(s.trim().replace(/\s+/g, ' ')) <= firstMaxW;
  const pages = fits
    ? Object.freeze([Object.freeze({ lines: Object.freeze([tokens.map((t) => t.raw).join(' ')]), start: tokens[0].start })])
    : tokens.length ? solve(tokens, maxW, firstMaxW, perPage === 2 ? 2 : 1, more, pack ? 6 : COST.page) : EMPTY;
  if (memo.size >= 400) memo.delete(memo.keys().next().value);
  memo.set(key, pages);
  return pages;
}

function solve(tokens, maxW, firstMaxW, perPage, more, pageCost) {
  const n = tokens.length;
  const pre = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + tokens[i].w;
  const width = (i, j) => pre[j] - pre[i] + GAP * (j - i - 1);
  const cut = new Float64Array(n + 1); // boundary cost before token i
  for (let i = 1; i < n; i++) cut[i] = boundary(tokens[i - 1], tokens[i]);

  // best[i]: cheapest layout of tokens i.. starting a fresh page at i
  const best = new Float64Array(n + 1).fill(Infinity);
  const endA = new Int32Array(n + 1); // end of the page's first line
  const endB = new Int32Array(n + 1); // end of the page (== endA for a one-line page)
  best[n] = 0;
  for (let i = n - 1; i >= 0; i--) {
    const cap1 = i === 0 ? firstMaxW : maxW;
    for (let j = i + 1; j <= n; j++) {
      const w1 = width(i, j);
      const single = j === i + 1;
      if (w1 > cap1 && !single) break;
      const over1 = w1 > cap1 ? COST.overlong : 0;
      // one-line page [i, j)
      const last = j === n;
      const lim = cap1 - (last ? 0 : more);
      if (w1 <= lim || single) {
        const fill = last ? (i === 0 ? 0 : COST.widow * sq((maxW - w1) / maxW)) : COST.fill * sq((lim - Math.min(w1, lim)) / lim);
        const cost = pageCost + COST.line + fill + over1 + (w1 > lim ? COST.overlong : 0) + (last ? 0 : COST.pageBreak * cut[j]) + best[j];
        if (cost < best[i]) {
          best[i] = cost;
          endA[i] = j;
          endB[i] = j;
        }
      }
      if (perPage < 2 || last) continue;
      // two-line page [i, j) + [j, m)
      // inside a page a good break may even beat a fuller line (the extra line is paid by COST.line)
      const lineCut = COST.lineBreak * (cut[j] - 0.8);
      for (let m = j + 1; m <= n; m++) {
        const w2 = width(j, m);
        const single2 = m === j + 1;
        if (w2 > maxW && !single2) break;
        const fin = m === n;
        const lim2 = maxW - (fin ? 0 : more);
        if (w2 > lim2 && !single2) continue;
        const over2 = w2 > lim2 ? COST.overlong : 0;
        const bal = COST.balance * sq((w1 - w2) / maxW);
        const fill = COST.fill * sq((maxW - Math.max(w1, w2)) / maxW);
        const cost = pageCost + 2 * COST.line + bal + fill + over1 + over2 + lineCut + (fin ? 0 : COST.pageBreak * cut[m]) + best[m];
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
 * At most `maxPages`; anything beyond is cut at a word with an ellipsis.
 * Returns a frozen array of strings.
 */
export function linePages(text, maxW, { firstMaxW = maxW, maxPages = 3 } = {}) {
  const s = String(text ?? '').trim();
  if (!s) return EMPTY;
  if (measureText(s) <= firstMaxW) return Object.freeze([s]);
  let pages = layoutText(s, { maxW, firstMaxW, perPage: 1, more: ELLIPSIS_W });
  // too many pages: pack them as tightly as the words allow before cutting
  if (pages.length > maxPages) pages = layoutText(s, { maxW, firstMaxW, perPage: 1, more: ELLIPSIS_W, pack: true });
  const out = [];
  const n = Math.min(pages.length, maxPages);
  for (let i = 0; i < n; i++) {
    const line = pages[i].lines[0];
    const cont = i < pages.length - 1;
    out.push(cont ? withEllipsis(line) : line);
  }
  return Object.freeze(out);
}

/** "SNAP ELECTION," -> "SNAP ELECTION..." (a sentence end keeps its full stop). */
export function withEllipsis(line) {
  if (/[.!?…]$/.test(line)) return line;
  return `${line.replace(/\s*[,;:\-–—]+$/, '')}${ELLIPSIS}`;
}
