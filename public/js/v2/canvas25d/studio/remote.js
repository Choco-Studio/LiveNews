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
/** An expert on a video call: centred and a little closer, as a laptop camera frames whoever sits at it. */
// (first air check, 8 Oct: at y 130 the head sat mid-frame; a webcam guest's eyes sit near the upper third)
export const CALL = { x: 196, y: 116, s: 3.8, headX: 196 };
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
  // an expert's room on a video call (drawRoom)
  if (bd?.kind === 'room') return drawRoom(px, bd);
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

// ------------------------------------------------------------------------------------------------ the call's room

/**
 * An expert's room on a video call (server/experts.js; owner 8 Oct: "una llamada en directo al despacho o el hogar
 * de la persona"): drawn at half resolution and doubled, as a laptop camera's softer picture (the person, drawn at
 * full resolution, stands out of it as a webcam's subject does). The window shows the hour of the expert's own
 * city (bd.night). Rooms: 'study' (a bookcase), 'office' (blinds, a framed print, binders), 'lab' (shelves of
 * glassware, a whiteboard), 'home' (a warm wall, a lamp, a plant, curtains).
 *   bd = { kind: 'room', room, night, seed }
 */
const RW = W / 2, RH = H / 2;
const room = new Uint32Array(RW * RH);
function rect(x0, y0, w, h, c) {
  for (let y = Math.max(0, y0); y < Math.min(RH, y0 + h); y++) for (let x = Math.max(0, x0); x < Math.min(RW, x0 + w); x++) room[y * RW + x] = c;
}
const rnd = (seed) => {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
};
const SPINES = ['red', 'navy', 'darkGreen', 'rust', 'cream', 'maroon', 'blue', 'tan', 'steel', 'darkRed', 'green', 'fog'];

function windowAt(x0, y0, w, h, night, r, blinds = false, curtains = false) {
  rect(x0 - 1, y0 - 1, w + 2, h + 2, C.fog); // the frame
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = y / h;
      room[(y0 + y) * RW + x0 + x] = night ? (v > 0.75 ? C.ink : C.navy) : v < 0.45 ? C.cyan : v < 0.8 ? C.blue : C.fog;
    }
  }
  // night: lit windows of the buildings opposite; day: a cloud
  if (night) for (let k = 0; k < 9; k++) rect(x0 + 1 + Math.floor(r() * (w - 3)), y0 + Math.floor(h * 0.45 + r() * h * 0.45), 1, 1, r() < 0.5 ? C.yellow : C.cream);
  else rect(x0 + 3, y0 + 4, Math.min(8, w - 5), 2, C.white);
  rect(x0 + Math.floor(w / 2), y0, 1, h, C.fog); // the mullion
  if (blinds) for (let y = y0 + 1; y < y0 + h; y += 3) rect(x0, y, w, 1, night ? C.slate : C.silver);
  if (curtains) {
    rect(x0 - 4, y0 - 2, 5, h + 6, C.maroon);
    rect(x0 + w - 1, y0 - 2, 5, h + 6, C.maroon);
  }
}

function drawRoom(px, { room: kind = 'study', night = false, seed = 7 } = {}) {
  const r = rnd(seed);
  const wall = { study: C.slate, office: C.steel, lab: C.silver, home: C.tan }[kind] || C.slate;
  const shade = { study: C.ink, office: C.slate, lab: C.fog, home: C.tanShade }[kind] || C.ink;
  // the wall: lit from the window side, a step darker away from it (two flat bands and a dithered seam)
  for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) room[y * RW + x] = x > 70 + bayer(x, y) * 14 ? wall : shade;
  if (kind === 'study') {
    // a bookcase on the left: dark wood, four shelves of spines
    rect(2, 4, 50, RH - 4, C.maroon);
    for (let s = 0; s < 4; s++) {
      const y = 8 + s * 24;
      rect(4, y + 17, 46, 2, C.brown);
      for (let x = 5; x < 48; ) {
        const w = 2 + Math.floor(r() * 3), h = 10 + Math.floor(r() * 6);
        rect(x, y + 17 - h, w, h, C[SPINES[Math.floor(r() * SPINES.length)]]);
        x += w + (r() < 0.15 ? 2 : 0);
      }
    }
    windowAt(150, 12, 30, 40, night, r);
    if (night) rect(130, 50, 8, 10, C.yellow); // a desk lamp's shade, lit
  } else if (kind === 'office') {
    windowAt(140, 8, 40, 46, night, r, true);
    rect(14, 18, 30, 22, C.ink); // a framed print
    rect(16, 20, 26, 18, C.blue);
    rect(16, 30, 26, 8, C.darkGreen);
    rect(6, 70, 52, 3, C.slate); // a shelf of binders
    for (let x = 8; x < 54; x += 5) rect(x, 56, 4, 14, [C.navy, C.red, C.white, C.ink][Math.floor(r() * 4)]);
  } else if (kind === 'lab') {
    for (let s = 0; s < 3; s++) {
      const y = 22 + s * 22;
      rect(4, y, 54, 2, C.steel);
      for (let x = 6; x < 54; x += 7) {
        const h = 6 + Math.floor(r() * 6);
        rect(x, y - h, 4, h, r() < 0.5 ? C.cyan : C.green);
        rect(x + 1, y - h - 2, 2, 2, C.white);
      }
    }
    rect(132, 14, 52, 34, C.white); // a whiteboard with a plotted curve and two lines of writing (no words)
    for (let x = 0; x < 40; x++) rect(138 + x, 40 - Math.round(Math.sin(x / 7) * 6 + x / 8), 1, 1, C.blue);
    rect(138, 20, 22, 1, C.slate);
    rect(138, 24, 16, 1, C.slate);
  } else {
    windowAt(146, 10, 30, 40, night, r, false, true);
    rect(14, 20, 24, 18, C.cream); // a framed photo
    rect(16, 22, 20, 14, C.green);
    rect(16, 30, 20, 6, C.darkGreen);
    rect(26, 46, 2, 60, C.ink); // a floor lamp
    rect(20, 40, 14, 8, night ? C.yellow : C.cream);
    // a plant by the window
    rect(122, 86, 10, 22, C.rust);
    for (let k = 0; k < 14; k++) rect(118 + Math.floor(r() * 18), 62 + Math.floor(r() * 24), 3, 2, r() < 0.5 ? C.green : C.darkGreen);
  }
  // a laptop camera's fall-off: the corners a step darker
  for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) {
    const dx = (x - RW / 2) / (RW / 2), dy = (y - RH / 2) / (RH / 2);
    if (dx * dx + dy * dy > 1.15 + bayer(x, y) * 0.25) room[y * RW + x] = C.ink;
  }
  // doubled into the frame
  for (let y = 0; y < H; y++) {
    const row = (y >> 1) * RW;
    const o = y * W;
    for (let x = 0; x < W; x++) px[o + x] = room[row + (x >> 1)];
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
