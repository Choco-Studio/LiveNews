// Video wall content for the 2.5D studio (owner: STUDIO SET stream).
//
// The wall is the only screen on set (docs/ART_DIRECTION.md): dimmed and
// cool, navy field easing to ink at the bottom, the world globe turning
// slowly, one flat red tag. drawWallContent() fills the screen rectangle (in
// screen pixels, at the camera's current scale) every frame; per-programme
// idles, story pictures, the mini locator map and figures belong here.
import { C } from '../pixbuf.js';
import { LAND } from '../../../scenes/worlddata.js';
import { SET } from './geometry.js';

/**
 * Fill the wall's screen rectangle [x0, y0, x1, y1) (screen px). k = px per world unit
 * at the wall's depth, soft = background out of focus.
 */
export function drawWallContent(fr, x0, y0, x1, y1, k, t, soft) {
  const S = SET.screen;
  // field: navy at the top easing to ink at the bottom (keeps the area behind heads dark)
  fr.dither(x0, y0, x1 - x0, y1 - y0, C.navy, C.ink, (x, y) => ((y - y0) / Math.max(1, y1 - y0)) * 1.25 - 0.15);
  // globe (slow spin) in the upper-middle of the screen
  const R = Math.max(6, ((S.y1 - S.y0) * 0.36) * k);
  const gcx = (x0 + x1) / 2, gcy = y0 + (y1 - y0) * 0.44;
  drawGlobe(fr, gcx, gcy, R, -0.35 + t * 0.06, soft, [x0, y0, x1, y1]);
  // a flat red tag at the screen's top-left: the only brand block on the wall
  const tw = Math.max(4, Math.round(16 * k)), th = Math.max(2, Math.round(4 * k));
  fr.span(x0 + Math.round(5 * k), y0 + Math.round(5 * k), x0 + Math.round(5 * k) + tw, y0 + Math.round(5 * k) + th, soft ? C.darkRed : C.red);
}

// ---------------------------------------------------------------------------
// The world globe on the video wall, rasterised per pixel at the exact size

let LANDMASK = null;
const LMW = 512, LMH = 256;
function landMask() {
  if (LANDMASK) return LANDMASK;
  const bin = atob(LAND.rle);
  const W = LAND.w, H = LAND.h;
  const sx = W / LMW, sy = H / LMH;
  const m = new Uint8Array(LMW * LMH);
  let p = 0;
  for (let j = 0; j < H; j++) {
    const keep = j % sy === sy >> 1;
    const row = (j / sy) | 0;
    let x = 0, cur = 0;
    while (x < W) {
      let run = 0, shift = 0, byte;
      do {
        byte = bin.charCodeAt(p++);
        run |= (byte & 127) << shift;
        shift += 7;
      } while (byte & 128);
      if (keep && cur) {
        for (let q = Math.ceil((x - (sx >> 1)) / sx); q * sx + (sx >> 1) < x + run; q++) if (q >= 0 && q < LMW) m[row * LMW + q] = 1;
      }
      x += run;
      cur ^= 1;
    }
  }
  LANDMASK = m;
  return m;
}

const GL = (() => {
  const l = Math.hypot(-0.5, -0.45, 0.74);
  return [-0.5 / l, -0.45 / l, 0.74 / l];
})();

function drawGlobe(fr, cx, cy, R, rot, soft, clip) {
  const mask = landMask();
  const tilt = 0.38;
  const ct = Math.cos(tilt), st = Math.sin(tilt);
  const px = fr.px;
  const ocean = soft ? [C.navy, C.navy, C.ink, C.ink] : [C.navy, C.navy, C.ink, C.black];
  const land = soft ? [C.steel, C.slate, C.slate, C.ink] : [C.fog, C.steel, C.slate, C.ink];
  const grid = soft ? C.navy : C.slate;
  const R2 = R * R;
  const x0 = Math.max(clip[0], Math.floor(cx - R - 1)), x1 = Math.min(clip[2], Math.ceil(cx + R + 1));
  const y0 = Math.max(clip[1], Math.floor(cy - R - 1)), y1 = Math.min(clip[3], Math.ceil(cy + R + 1));
  const step = Math.PI / 6;
  const lineW = 0.55 / R;
  const lonL = -0.0, latL = 51.5 * (Math.PI / 180);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 > R2) {
        // a thin atmosphere ring
        if (d2 <= (R + 1) * (R + 1) && !soft) px[y * fr.w + x] = dx < 0 && dy < R * 0.3 ? C.blue : C.navy;
        continue;
      }
      const nx = dx / R, ny = dy / R;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      // tilt the axis toward the viewer, then spin
      const wy = ny * ct - nz * st, wz = ny * st + nz * ct;
      const lat = -Math.asin(Math.max(-1, Math.min(1, wy)));
      let lon = Math.atan2(nx, wz) + rot;
      lon = ((lon + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
      const u = ((lon / (2 * Math.PI) + 0.5) * LMW) | 0;
      const v = ((0.5 - lat / Math.PI) * LMH) | 0;
      const isLand = mask[Math.min(LMH - 1, v) * LMW + Math.min(LMW - 1, u)];
      const l = nx * GL[0] + ny * GL[1] + nz * GL[2];
      const tone = l > 0.82 ? 0 : l > 0.35 ? 1 : l > 0.0 ? 2 : 3;
      let c = isLand ? land[tone] : ocean[tone];
      // graticule every 30 degrees (thin, only on the lit side)
      if (!isLand && tone <= 2) {
        const gl = Math.abs(((lat + step / 2) % step + step) % step - step / 2);
        const go = Math.abs(((lon + step / 2) % step + step) % step - step / 2) * Math.max(0.2, Math.cos(lat));
        if (nz > 0.35 && (gl < lineW / nz || go < lineW / nz)) c = grid;
      }
      // London: one red pixel (two at large sizes)
      if (Math.abs(lat - latL) < 1.2 / R && Math.abs(lon - lonL) * Math.cos(lat) < 1.2 / R && nz > 0.2) c = C.red;
      px[y * fr.w + x] = c;
    }
  }
}
