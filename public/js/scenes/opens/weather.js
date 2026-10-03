// WORLD WEATHER open: the forecast's own symbol made an object. A sun lit from the upper left (a cream highlight,
// the yellow body, an orange rim) with its rays turning slowly, and a cloud that drifts in from the right and
// settles in front of it, lit from the top (white, silver, a fog underside, an ink outline against the field).
// The same package and clock as every open: it builds at centre stage, glides to its slot beside the plate.
// Accent: blue (the weather centre's).
import { P } from '../../palette.js';
import { seg, easeOutQuint, easeInOut } from '../../gfx/index.js';
import { lazyBackdrop, playOpen, CENTRE, ZOOM } from './kit.js';

const R = 12; // the sun's radius at k = 1
const EXTENT = 26; // right half-width at k = 1 (the cloud's right edge)

function dot(ctx, x, y, c) {
  ctx.fillStyle = c;
  ctx.fillRect(x, y, 1, 1);
}

function sun(ctx, dt, cx, cy, k) {
  const r = R * k;
  const grow = easeOutQuint(seg(dt, 0.15, 0.6));
  if (grow <= 0) return;
  const rr = r * grow;
  const x0 = Math.floor(cx - rr - 1), x1 = Math.ceil(cx + rr + 1);
  const y0 = Math.floor(cy - rr - 1), y1 = Math.ceil(cy + rr + 1);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const d = Math.hypot(dx, dy);
      if (d > rr) continue;
      const lit = (-dx - dy) / (rr * 1.41);
      dot(ctx, x, y, d > rr - 1.2 ? P.orange : lit > 0.45 ? P.cream : P.yellow);
    }
  }
  // rays: twelve, long and short in turn, turning a twelfth of a circle over the open
  const rays = easeInOut(seg(dt, 0.45, 0.5));
  if (rays <= 0) return;
  const turn = (seg(dt, 0.45, 3.2) * Math.PI) / 6;
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6 + turn;
    const long = i % 2 === 0;
    const r0 = rr + 2.5 * k, r1 = rr + (long ? 7 : 4.5) * k * rays;
    for (let q = r0; q <= r1; q += 0.7) dot(ctx, Math.round(cx + Math.cos(a) * q - 0.5), Math.round(cy + Math.sin(a) * q - 0.5), long ? P.yellow : P.orange);
  }
}

// the cloud: three puffs and a flat base, in units of k from its anchor (left end of the base)
const PUFFS = [
  [6, -6, 6],
  [15, -10, 8.5],
  [24, -5.5, 5.5],
];
function cloud(ctx, dt, ax, ay, k) {
  const inside = (px, py) => {
    if (py > 0) return false;
    if (py > -4 && px > 1 && px < 29) return true;
    for (const [cx, cy, r] of PUFFS) if (Math.hypot(px - cx, py - cy) <= r) return true;
    return false;
  };
  const x0 = Math.floor(ax - 1), x1 = Math.ceil(ax + 31 * k);
  const y0 = Math.floor(ay - 20 * k), y1 = Math.ceil(ay + 1);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const px = (x + 0.5 - ax) / k, py = (y + 0.5 - ay) / k;
      if (inside(px, py)) {
        dot(ctx, x, y, py > -2.2 ? P.fog : py < -9 || (py < -5 && !inside(px, py - 2.4 / k)) ? P.white : P.silver);
      } else if (inside(px + 1 / k, py) || inside(px - 1 / k, py) || inside(px, py + 1 / k) || inside(px, py - 1 / k)) dot(ctx, x, y, P.ink);
    }
  }
}

function emblem(ctx, dt, x, y, k = 1) {
  sun(ctx, dt, x - 6 * k, y - 5 * k, k);
  // the cloud drifts in from the right and settles over the sun's lower right
  const p = easeOutQuint(seg(dt, 0.35, 1.0));
  if (p <= 0) return;
  const ax = Math.round(x - 7 * k + (1 - p) * 60 * k);
  cloud(ctx, dt, ax, Math.round(y + 12 * k), k);
}

const background = lazyBackdrop({ key: 'weather', colors: [P.black, P.ink], cx: CENTRE.x, cy: CENTRE.y, reach: 230 });

export const WEATHER_OPEN = {
  accent: P.blue,
  style: { accent: P.blue, plate: P.black, ink: 'light', bar: P.blue },
  background,
  emblem,
  extent: EXTENT,
  front: true,
  absorb: 0.2,
  shoulder: 18,
  popAt: 0.9,
  warmJobs: () => [],
};

export function drawWorldWeather(ctx, dt, info) {
  playOpen(ctx, dt, info, WEATHER_OPEN);
}

export const __test = { ZOOM };
