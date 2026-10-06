// The correspondent's pictures (WORLD NOW links, owner 4 Oct: "cargar vídeos, pixelarlos con nuestro estilo y
// poner un reportero hablando sobre ello"; server/correspondents.js). Two shots, drawn by the v2 Stage:
//   LOCATION  the correspondent in a medium close-up on the left third, in front of the place: its footage in
//             the channel's pixel style (public/js/footage/), shown at 2x and graded down so the person stays
//             the brightest thing; on a grave story, or while no footage is ready, the DESK backdrop: a dark
//             field with the region's dotted map and a pin on the place, the light falling behind them
//   TWO-WAY   the presenter in the studio and the correspondent side by side in two 16:9 boxes
// The correspondent never stands "at the scene": the footage is FILE pictures of the place (the graphics say so)
// and the desk backdrop is a virtual set. Pure pixels into the Stage's frame; the labels are graphics.
//
//   drawBackdrop(px, bd, t)           the location's backdrop into a 384x216 u32 frame
//   REMOTE                            the location's framing of the correspondent (MCU, left third)
//   TWOWAY                            the two boxes' rects
//   cropInto(src, cx, cy, out, w, h)  a w x h crop of a frame centred on (cx, cy), clamped to the frame
//   composeTwoWay(px, left, right, accent, t)   the split screen from two box crops
import { C, bayer } from '../pixbuf.js';
import { isLand } from './wall.js';

const W = 384, H = 216;

/** The correspondent in a location shot: neck base on screen and scale (an MCU: hands below the frame). */
export const REMOTE = { x: 124, y: 122, s: 3.6, headX: 124 };
/** The two boxes of the two-way (16:9), and where a head sits inside one. */
export const TWOWAY = { w: 176, h: 99, y: 44, left: 12, right: 196, headX: 88, headY: 40 };

// ------------------------------------------------------------------------------------------------ backdrops

/**
 * The location's backdrop into px (u32, 384x216).
 * bd = { kind: 'footage', frame: { px, w, h } }   a pixel-style footage frame (192x108), shown at 2x
 *    | { kind: 'desk', lat, lon, accent }          the desk's virtual set: dotted map round the place
 */
export function drawBackdrop(px, bd, t = 0) {
  if (bd?.kind === 'footage' && bd.frame?.px) return drawFootage(px, bd.frame);
  drawDesk(px, bd || {}, t);
}

function drawFootage(px, f) {
  const sx = f.w / W, sy = f.h / H;
  for (let y = 0; y < H; y++) {
    const row = Math.min(f.h - 1, (y * sy) | 0) * f.w;
    const o = y * W;
    for (let x = 0; x < W; x++) px[o + x] = f.px[row + Math.min(f.w - 1, (x * sx) | 0)];
  }
}

// the desk: where the light pool sits (behind the correspondent's head) and the map's scale
const DESK = { lightX: 104, lightY: 34, lightRX: 215, lightRY: 175, mapX: 286, mapY: 92, pxPerDeg: 6.5, dot: 3 };

/**
 * The desk's virtual set: an ink field falling to black, a soft pool of light behind the correspondent, and a
 * dotted map of the region with the place on the right third (a steel dot field near it, a pulsing pin).
 * Flat bands and a 4x4 dither only: it must read as pixel art, never as a gradient.
 */
function drawDesk(px, { lat = 20, lon = 0, accent = C.red }, t) {
  for (let y = 0; y < H; y++) {
    const o = y * W;
    for (let x = 0; x < W; x++) {
      // a wide wash from above (a soft key on the backdrop, never a ring round the head), black at the floor
      const dx = (x - DESK.lightX) / DESK.lightRX, dy = (y - DESK.lightY) / DESK.lightRY;
      const v = 1 - Math.sqrt(dx * dx + dy * dy);
      // flat bands with a narrow dithered seam: a noisy field would hide the map's dot grid
      px[o + x] = v > 0.6 + bayer(x, y) * 0.1 ? C.slate : v > 0.14 + bayer(x, y) * 0.12 ? C.ink : C.black;
    }
  }
  // the dotted map: a dot every DESK.dot px where there is land, brighter near the place
  const k = DESK.pxPerDeg;
  const cl = Math.cos((lat * Math.PI) / 180) || 1;
  for (let y = 2; y < H - 2; y += DESK.dot) {
    const la = lat - (y - DESK.mapY) / k;
    if (la > 84 || la < -84) continue;
    for (let x = 2; x < W - 2; x += DESK.dot) {
      const lo = lon + (x - DESK.mapX) / (k * Math.max(0.35, cl));
      if (!isLand(la, ((lo + 540) % 360) - 180)) continue;
      const dd = Math.hypot(x - DESK.mapX, y - DESK.mapY);
      const c = dd < 44 ? C.fog : dd < 160 ? C.steel : C.slate;
      px[y * W + x] = c;
    }
  }
  // the pin: a 3x3 accent dot with a ring that opens every 2 s
  const cx = DESK.mapX, cy = DESK.mapY;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) px[(cy + j) * W + cx + i] = i === 0 && j === 0 ? C.white : accent;
  const ph = (t % 2) / 2;
  const r = 3 + ph * 10;
  if (ph < 0.8) {
    for (let a = 0; a < 48; a++) {
      const x = Math.round(cx + Math.cos((a / 48) * Math.PI * 2) * r), y = Math.round(cy + Math.sin((a / 48) * Math.PI * 2) * r);
      if (x >= 0 && x < W && y >= 0 && y < H && (a & 1) === 0) px[y * W + x] = ph < 0.4 ? accent : C.slate;
    }
  }
}

// ------------------------------------------------------------------------------------------------ two-way

/** A w x h crop of src (384x216) whose centre is (cx, cy), shifted to stay inside the frame, into out. */
export function cropInto(src, cx, cy, out, w, h) {
  const x0 = Math.max(0, Math.min(W - w, Math.round(cx - w / 2)));
  const y0 = Math.max(0, Math.min(H - h, Math.round(cy - h / 2)));
  for (let y = 0; y < h; y++) {
    const s = (y0 + y) * W + x0;
    out.set(src.subarray(s, s + w), y * w);
  }
  return out;
}

/**
 * The split screen into px: a black field with a quiet ink hatch, the two boxes framed in fog with a black
 * drop shadow and a rule of the programme's accent under them (the graphics label them: the studio's city and
 * the correspondent's place).
 */
export function composeTwoWay(px, left, right, accent = C.red) {
  for (let y = 0; y < H; y++) {
    const o = y * W;
    // a quiet ink hatch on black (the boxes carry the picture), a touch lighter in the band behind them
    const band = y >= TWOWAY.y - 10 && y < TWOWAY.y + TWOWAY.h + 14;
    for (let x = 0; x < W; x++) px[o + x] = (x + y) % (band ? 4 : 6) === 0 ? C.ink : C.black;
  }
  const { w, h, y } = TWOWAY;
  for (const [bx, src] of [[TWOWAY.left, left], [TWOWAY.right, right]]) {
    // shadow, frame, picture
    for (let j = 2; j < h + 3; j++) for (let i = 2; i < w + 3; i++) px[(y + j) * W + bx + i] = C.black;
    for (let j = -1; j <= h; j++) for (let i = -1; i <= w; i++) px[(y + j) * W + bx + i] = C.fog;
    for (let j = 0; j < h; j++) px.set(src.subarray(j * w, j * w + w), (y + j) * W + bx);
    // the accent rule under the box
    for (let i = 0; i < w; i++) px[(y + h + 3) * W + bx + i] = accent;
  }
}
