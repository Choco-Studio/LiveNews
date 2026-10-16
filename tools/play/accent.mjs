// PRESS START's accent (docs/programmes/press-start.md §8): how far each candidate colour of the channel's palette family
// (ENDESGA 32) sits from every programme's accent (CIEDE2000), and its contrast with dark and white type (WCAG 2).
//
//   node tools/play/accent.mjs
import { P } from '../../public/js/palette.js';

// every programme's accent (public/js/cast.js THEME_ACCENT), by programme
export const ACCENTS = { 'WORLD NOW': P.red, 'TECH BYTES': P.cyan, COSMOS: P.magenta, 'MONEY MINUTE': P.green, 'NEWS IN 60': P.yellow, 'WORLD WEATHER': P.blue, 'SEVEN DAYS': P.pink, 'FULL TIME': P.orange, 'PAY ATTENTION': P.purple };
// ENDESGA 32's colours the channel's palette does not use as an accent yet, and a few it holds
export const CANDIDATES = { lemon: '#fee761', crimson: '#ff0044', 'mid green (FULL TIME pitch)': '#3e8948', navy: P.navy, 'dark green': P.darkGreen, 'burnt orange': '#d77643', rust: P.rust, peach: '#e8b796', cream: P.cream, white: P.white };

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lin = (c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
/** CIE L*a*b* (D65) of a hex colour. */
export function lab(h) {
  const [r, g, b] = hex(h).map(lin);
  const xyz = [(0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, 0.2126 * r + 0.7152 * g + 0.0722 * b, (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883];
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const [fx, fy, fz] = xyz.map(f);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
/** CIEDE2000 colour difference of two hex colours. */
export function deltaE2000(h1, h2) {
  const [L1, a1, b1] = lab(h1);
  const [L2, a2, b2] = lab(h2);
  const rad = Math.PI / 180;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cb = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const h = (a, b) => (a === 0 && b === 0 ? 0 : (Math.atan2(b, a) / rad + 360) % 360);
  const h1p = h(a1p, b1);
  const h2p = h(a2p, b2);
  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) dhp = Math.abs(h2p - h1p) <= 180 ? h2p - h1p : h2p - h1p > 180 ? h2p - h1p - 360 : h2p - h1p + 360;
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * rad);
  const Lbp = (L1 + L2) / 2;
  const Cbp = (C1p + C2p) / 2;
  let hbp = h1p + h2p;
  if (C1p * C2p !== 0) hbp = Math.abs(h1p - h2p) <= 180 ? (h1p + h2p) / 2 : h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2;
  const T = 1 - 0.17 * Math.cos((hbp - 30) * rad) + 0.24 * Math.cos(2 * hbp * rad) + 0.32 * Math.cos((3 * hbp + 6) * rad) - 0.2 * Math.cos((4 * hbp - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hbp - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lbp - 50) ** 2) / Math.sqrt(20 + (Lbp - 50) ** 2);
  const Sc = 1 + 0.045 * Cbp;
  const Sh = 1 + 0.015 * Cbp * T;
  const Rt = -Math.sin(2 * dTheta * rad) * Rc;
  return Math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh));
}
/** WCAG 2 contrast ratio of two hex colours. */
export function contrast(h1, h2) {
  const Y = (h) => {
    const [r, g, b] = hex(h).map(lin);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [a, b] = [Y(h1), Y(h2)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const rows = Object.entries(CANDIDATES).map(([name, h]) => {
    const d = Object.entries(ACCENTS).map(([p, a]) => [p, deltaE2000(h, a)]).sort((x, y) => x[1] - y[1]);
    return { name, h, nearest: d[0], second: d[1], onBlack: contrast(h, P.black), onInk: contrast(h, P.ink), white: contrast(h, P.white) };
  }).sort((a, b) => b.nearest[1] - a.nearest[1]);
  console.log('| Candidate | Hex | Nearest accent (ΔE2000) | Next | Against P.black | Against P.ink | White type on it |');
  console.log('|---|---|---|---|---|---|---|');
  for (const r of rows) console.log(`| ${r.name} | ${r.h} | ${r.nearest[0]} ${r.nearest[1].toFixed(1)} | ${r.second[0]} ${r.second[1].toFixed(1)} | ${r.onBlack.toFixed(1)}:1 | ${r.onInk.toFixed(1)}:1 | ${r.white.toFixed(1)}:1 |`);
  console.log('\nThe accents among themselves (nearest pair for each):');
  for (const [p, a] of Object.entries(ACCENTS)) {
    const d = Object.entries(ACCENTS).filter(([q]) => q !== p).map(([q, b]) => [q, deltaE2000(a, b)]).sort((x, y) => x[1] - y[1]);
    console.log(`  ${p} ${a}: nearest ${d[0][0]} ${d[0][1].toFixed(1)}`);
  }
}
