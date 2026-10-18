// The locator board: what a story with no cleared picture shows behind its headline (the montage's frame, STILL TO
// COME's single story). Owner, 17 Oct: "no loss of quality", and the coordinator's review of the rights desk: the
// no-picture board "is the floor for every story we cannot picture, so it has to look designed, not missing".
//
//   The story's country, drawn from the channel's own world map (scenes/worldmap.js viewMapPixels: Natural Earth land
//   and borders, exact palette colours), framed to fit and lit (fog) against its dimmed neighbours (slate) on the
//   map's own sea; a city story adds its dot (the programme's accent square, a black outline, a white ring) and the
//   place's name on an ink plate with the accent bar, as every chip on the channel. The whole board sits in the upper
//   right of the frame, clear of the TOP STORIES tag and of the headline block below.
//
//   prepareLocator(loc, { w, h }) -> { canvas (the lit map), plan }, or null while the map data is still loading (the
//   caller then keeps the animated map shot as before). Cached per place. The director prepares one per story without
//   a picture before the montage, a frame at a time (director.js prepareImages): never inside a frame.
//   drawLocator(ctx, board, loc, { accent, dt }) -> draws it: the map, the dot (its ring pops once) and the name
//   (wiped in), in the programme's accent.
//   locatorPlan(loc, { w, h }) -> the board without drawing: { pixels (Uint32 0xAABBGGRR), w, h, pin, region, zoom }
// Any size: a clip's vertical frame prepares its own (clip/vertical.js), with `anchor` (where the place sits, as shares
// of the board) and `frame` (the box the name's plate keeps to: the platforms' safe column), and draws it at its
// stage's corner (`x`, `y`).
//
// The country is found on the rendered map itself: every plain land pixel (the map's tint pass), then a 4-connected
// fill from the place's pixel that stops at borders and coasts (they are drawn 1 px wide and 8-connected, so a
// 4-connected fill never crosses them). The view is chosen so that the lit country fills the board's area.
import { P } from '../palette.js';
import { drawText, measureText } from '../font.js';
import { viewMapPixels } from '../scenes/worldmap.js';

const pack = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return (0xff000000 | ((n & 255) << 16) | (n & 0xff00) | ((n >> 16) & 255)) >>> 0;
};
const LIT = pack(P.fog);
const LIT_EDGE = pack(P.silver);
const DIM = pack(P.slate);
// where the place sits: the upper right, clear of the TOP STORIES tag (13..~110, 25..36) and of the headline block
// (the chip from about y 105 down to the ticker)
export const ANCHOR = { x: 0.64, y: 0.34 };
// the area the lit country should fill (a share of the board)
const FIT = { minW: 0.16, maxW: 0.42, maxH: 0.38 };
// (beyond this the 4096 px land mask shows its steps on the coast)
const MAX_ZOOM = 24;
// countries too small, or too close to a neighbour, for the land mask to tell apart (Singapore merges with Johor):
// the dot and the name tell them, no lit region
const TOO_SMALL = new Set(['SINGAPORE', 'BAHRAIN', 'LUXEMBOURG', 'ANDORRA', 'MONACO', 'LIECHTENSTEIN', 'SAN MARINO', 'VATICAN', 'VATICAN CITY', 'MALTA', 'MALDIVES', 'BARBADOS', 'GRENADA', 'SAINT LUCIA', 'TUVALU', 'NAURU', 'PALAU', 'SEYCHELLES', 'MAURITIUS', 'COMOROS', 'DOMINICA', 'TONGA', 'SAMOA', 'KIRIBATI', 'ANTIGUA AND BARBUDA', 'SAINT KITTS AND NEVIS']);

/** The zoom a place starts from (1 = the whole globe across the width). */
function startZoom(loc) {
  return loc?.scope === 'country' ? 3 : 8;
}

function project(view, lat, lon) {
  let d = lon - view.clon;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return { x: view.w / 2 + d * view.s * view.kx, y: view.h / 2 + (view.clat - lat) * view.s };
}

/** The lit region on one rendered view: the 4-connected plain land around the place's pixel. */
function regionAt(mask, w, h, px, py) {
  // the place's pixel, or the nearest plain land pixel within 2 px (a coastal city sits on the coast line; further
  // would light the neighbour across a strait)
  let sx = -1;
  let sy = -1;
  for (let r = 0; r <= 2 && sx < 0; r++) {
    for (let dy = -r; dy <= r && sx < 0; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = Math.round(px) + dx;
        const y = Math.round(py) + dy;
        if (x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x]) {
          sx = x;
          sy = y;
          break;
        }
      }
    }
  }
  if (sx < 0) return null;
  const inRegion = new Uint8Array(w * h);
  const stack = [sy * w + sx];
  inRegion[sy * w + sx] = 1;
  let n = 0;
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  let edge = false;
  while (stack.length) {
    const i = stack.pop();
    const x = i % w;
    const y = (i - x) / w;
    n++;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) edge = true;
    if (x > 0 && mask[i - 1] && !inRegion[i - 1]) (inRegion[i - 1] = 1), stack.push(i - 1);
    if (x < w - 1 && mask[i + 1] && !inRegion[i + 1]) (inRegion[i + 1] = 1), stack.push(i + 1);
    if (y > 0 && mask[i - w] && !inRegion[i - w]) (inRegion[i - w] = 1), stack.push(i - w);
    if (y < h - 1 && mask[i + w] && !inRegion[i + w]) (inRegion[i + w] = 1), stack.push(i + w);
  }
  return { inRegion, n, x0, y0, x1, y1, edge, start: { x: sx, y: sy } };
}

/** The view that puts (lat, lon) at the board's anchor, at this zoom. */
function viewFor(lat, lon, zoom, w, h, anchor = ANCHOR) {
  const s = (w / 360) * zoom;
  const kx = Math.min(1, Math.max(0.5, Math.cos((lat * Math.PI) / 180)));
  return { lat: lat + (anchor.y * h - h / 2) / s, lon: lon - (anchor.x * w - w / 2) / (s * kx), zoom };
}

/** The box a board's name keeps to: the channel's margins, under the TOP STORIES tag, over the headline block. */
const frameOf = (w, h) => ({ x0: 13, x1: w - 13, y0: 40, y1: Math.round(h * 0.46) });

/**
 * The board without drawing: the map's pixels with the country lit and its neighbours dimmed, the place's pixel and
 * the lit region. null while the map data is loading or without a place.
 */
export function locatorPlan(loc, { w = 384, h = 216, anchor = ANCHOR, frame = null } = {}) {
  const lat = Number(loc?.lat);
  const lon = Number(loc?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const small = TOO_SMALL.has(name(loc?.place));
  let zoom = small ? 14 : startZoom(loc);
  let found = null;
  for (let pass = 0; pass < 6; pass++) {
    const v = viewFor(lat, lon, zoom, w, h, anchor);
    const mask = new Uint8Array(w * h);
    const first = viewMapPixels(w, h, v, (la, lo, x, y) => ((mask[y * w + x] = 1), 0), `locator-mask|${lat}|${lon}|${zoom}`);
    if (!first) return null;
    const view = { ...first.view };
    const pin = project(view, lat, lon);
    const region = small ? null : regionAt(mask, w, h, pin.x, pin.y);
    found = { v, view, pin, region, zoom };
    if (small) break;
    // an island too small for the land mask at this zoom: closer (at the closest, the dot alone tells it)
    if (!region) {
      if (zoom >= MAX_ZOOM) break;
      zoom = Math.min(MAX_ZOOM, zoom * 3);
      continue;
    }
    const rw = (region.x1 - region.x0 + 1) / w;
    const rh = (region.y1 - region.y0 + 1) / h;
    // too big (or running off the board): zoom out; too small: zoom in
    if ((region.edge || rw > FIT.maxW || rh > FIT.maxH) && zoom > 1.2) zoom = Math.max(1, zoom / (region.edge ? 2 : Math.max(rw / FIT.maxW, rh / FIT.maxH, 1.25)));
    else if (rw < FIT.minW && rh < FIT.minW && zoom < MAX_ZOOM) zoom = Math.min(MAX_ZOOM, zoom * Math.min(4, FIT.maxW / 1.6 / Math.max(rw, 0.01)));
    else break;
  }
  const { v, view, pin, region } = found;
  // the lit country (its own edge one step lighter, so it reads at a glance) against dimmed neighbours
  const R = region?.inRegion;
  const lit = (la, lo, x, y) => {
    if (!R) return DIM;
    const i = y * w + x;
    if (!R[i]) return DIM;
    const edge = (x > 0 && !R[i - 1]) || (x < w - 1 && !R[i + 1]) || (y > 0 && !R[i - w]) || (y < h - 1 && !R[i + w]);
    return edge ? LIT_EDGE : LIT;
  };
  const out = viewMapPixels(w, h, v, lit, `locator-lit|${lat}|${lon}|${found.zoom}`);
  if (!out) return null;
  return { pixels: new Uint32Array(out.u32), w, h, pin: { x: Math.round(pin.x), y: Math.round(pin.y) }, region: region ? { x0: region.x0, y0: region.y0, x1: region.x1, y1: region.y1, n: region.n } : null, zoom: found.zoom, view, frame: frame || frameOf(w, h) };
}

const cache = new Map();
/** The lit map of a place, prepared once (cached): { canvas, plan }, or null while the map data loads. */
export function prepareLocator(loc, { w = 384, h = 216, anchor = ANCHOR, frame = null } = {}) {
  if (!loc || !Number.isFinite(Number(loc.lat)) || !Number.isFinite(Number(loc.lon))) return null;
  const key = `${loc.lat}|${loc.lon}|${loc.scope || ''}|${loc.place || ''}|${w}x${h}|${anchor.x},${anchor.y}|${frame ? Object.values(frame).join(',') : ''}`;
  if (cache.has(key)) return cache.get(key);
  const plan = locatorPlan(loc, { w, h, anchor, frame });
  if (!plan) return null;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(w, h);
  new Uint32Array(img.data.buffer).set(plan.pixels);
  ctx.putImageData(img, 0, 0);
  // (the plan's pixels are on the canvas now: kept twice they would double each board's 0.33 MB; the director keeps
  // the boards of the programmes it needs, this cache only spares a place drawn again soon)
  const board = { canvas, plan: { ...plan, pixels: null } };
  if (cache.size >= 24) cache.delete(cache.keys().next().value);
  cache.set(key, board);
  return board;
}

/** Draw a prepared board: the lit map, the dot (its ring pops once, 0.25-0.6 s) and the name (wiped in from 0.2 s). */
export function drawLocator(ctx, board, loc, { accent = P.red, dt = 9, x = 0, y = 0 } = {}) {
  ctx.drawImage(board.canvas, x, y);
  drawPlace(ctx, board.plan, loc, accent, dt, x, y);
}

const name = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .trim();

/** The dot and the name: a city's dot and its name beside it; a country's name over its middle. */
export function placeLayout(plan, loc, measure = (t, font) => measureText(t, 1, font)) {
  const F = plan.frame || frameOf(plan.w, plan.h);
  const city = loc?.scope !== 'country';
  const title = name(loc?.place);
  const sub = city && loc?.country && name(loc.country) !== title ? name(loc.country) : '';
  const tw = Math.max(measure(title, 'body'), sub ? measure(sub, 'micro') : 0);
  const bw = tw + 12;
  const bh = sub ? 21 : 13;
  let x;
  let y;
  if (city) {
    // beside the dot, on the side with room (never over the TOP STORIES tag, never down into the headline block)
    const right = plan.pin.x + 9 + bw <= F.x1;
    const left = plan.pin.x - 9 - bw >= F.x0;
    x = right ? plan.pin.x + 9 : plan.pin.x - 9 - bw;
    y = plan.pin.y - Math.round(bh / 2);
    // (a narrow board, the vertical frame's: no room on either side, the name goes under the dot, never over it)
    if (!right && !left) {
      x = plan.pin.x - Math.round(bw / 2);
      y = plan.pin.y + 10;
    }
  } else {
    const r = plan.region;
    const cx = r ? Math.round((r.x0 + r.x1) / 2) : plan.pin.x;
    const cy = r ? Math.round((r.y0 + r.y1) / 2) : plan.pin.y;
    x = cx - Math.round(bw / 2);
    y = cy - Math.round(bh / 2);
  }
  x = Math.max(F.x0, Math.min(F.x1 - bw, x));
  y = Math.max(F.y0, Math.min(F.y1 - bh, y));
  return { city, title, sub, x, y, bw, bh };
}

function drawPlace(ctx, plan, loc, accent, dt = 9, ox = 0, oy = 0) {
  const L0 = placeLayout(plan, loc);
  const L = { ...L0, x: L0.x + ox, y: L0.y + oy };
  if (L.city) {
    const x = plan.pin.x + ox;
    const y = plan.pin.y + oy;
    // the ring grows once from the dot (r 3 to 9 by 0.6 s) and settles at 6; then the accent square in its outline
    const k = Math.max(0, Math.min(1, (dt - 0.25) / 0.35));
    const r = dt < 0.25 ? 0 : dt < 0.6 ? Math.round(3 + 6 * k) : 6;
    if (r) {
      ctx.fillStyle = P.white;
      const n = Math.max(16, r * 6);
      for (let a = 0; a < n; a++) {
        const t = (a / n) * Math.PI * 2;
        ctx.fillRect(Math.round(x + Math.cos(t) * r), Math.round(y + Math.sin(t) * r), 1, 1);
      }
    }
    ctx.fillStyle = P.black;
    ctx.fillRect(x - 3, y - 3, 7, 7);
    ctx.fillStyle = accent;
    ctx.fillRect(x - 2, y - 2, 5, 5);
  }
  if (!L.title) return;
  // the name's plate wipes in from its accent bar (0.2 s to 0.5 s), as every chip on the channel
  const p = Math.max(0, Math.min(1, (dt - 0.2) / 0.3));
  const eased = 1 - (1 - p) ** 3;
  const wv = Math.round(L.bw * eased);
  if (wv <= 0) return;
  ctx.save();
  try {
    ctx.beginPath();
    ctx.rect(L.x, L.y, wv, L.bh);
    ctx.clip();
    ctx.fillStyle = P.ink;
    ctx.fillRect(L.x, L.y, L.bw, L.bh);
    ctx.fillStyle = accent;
    ctx.fillRect(L.x, L.y, 2, L.bh);
    drawText(ctx, L.title, L.x + 7, L.y + 3, { color: P.white, font: 'body' });
    if (L.sub) drawText(ctx, L.sub, L.x + 7, L.y + 13, { color: P.fog, font: 'micro' });
  } finally {
    ctx.restore();
  }
}
