// Software pixel pipeline for the canvas25d prototype.
//
// Everything is drawn into one 384x216 Uint32 frame (an ImageData that is
// put on the canvas once per frame), so there is never any canvas smoothing,
// sub-pixel blending or anti-aliasing: every pixel is a palette colour.
//
// Characters are not sprites. Each body part is rasterised per frame from a
// shape (capsule, ellipse, polygon or implicit function) into a PartBuffer
// that stores, per pixel, a material, a light tone (0 highlight .. 3 deep),
// a line group and a draw depth. `resolve()` then turns that into pixel art:
//   - a 1 px selective outline (each material's own dark line colour) around
//     the silhouette,
//   - a 1 px inner line where a part overlaps a different part behind it
//     (arm over chest, hair over forehead, chin over neck),
//   - the art-direction rim light: 1 px silver on the screen-right edge and
//     on top of materials that ask for it,
//   - removal of isolated tone pixels so shading bands stay clean.
// Rotation and scale are therefore free: the part is re-rasterised at the
// new angle and size, the pixel grid stays crisp ("RotSprite" without
// sprites).
import { P } from '../../palette.js';

export const W = 384;
export const H = 216;

/** '#rrggbb' → little-endian 0xAABBGGRR for the Uint32 view of ImageData. */
export function u32(hex) {
  const n = parseInt(hex.slice(1), 16);
  return (0xff000000 | ((n & 0xff) << 16) | (n & 0xff00) | ((n >> 16) & 0xff)) >>> 0;
}

/** Mix two u32 colours (used only for glass / reflection washes the art doc allows). */
export function mix32(a, b, k) {
  const ar = a & 255, ag = (a >>> 8) & 255, ab = (a >>> 16) & 255;
  const br = b & 255, bg = (b >>> 8) & 255, bb = (b >>> 16) & 255;
  const r = (ar + (br - ar) * k) | 0, g = (ag + (bg - ag) * k) | 0, bl = (ab + (bb - ab) * k) | 0;
  return (0xff000000 | (bl << 16) | (g << 8) | r) >>> 0;
}

/** Palette as u32, built once. */
export const C = Object.fromEntries(Object.entries(P).map(([k, v]) => [k, u32(v)]));

// 4x4 Bayer matrix, the only dither the art direction allows.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const bayer = (x, y) => (BAYER[((y & 3) << 2) | (x & 3)] + 0.5) / 16;

// ---------------------------------------------------------------------------
// Frame: the final 384x216 picture

export class Frame {
  constructor(w = W, h = H) {
    this.w = w;
    this.h = h;
    this.image = new ImageData(w, h);
    this.px = new Uint32Array(this.image.data.buffer);
  }

  clear(c) {
    this.px.fill(c);
  }

  rect(x, y, w, h, c) {
    let x0 = Math.round(x), y0 = Math.round(y);
    let x1 = Math.round(x + w), y1 = Math.round(y + h);
    if (x0 < 0) x0 = 0;
    if (y0 < 0) y0 = 0;
    if (x1 > this.w) x1 = this.w;
    if (y1 > this.h) y1 = this.h;
    if (x1 <= x0 || y1 <= y0) return;
    for (let j = y0; j < y1; j++) this.px.fill(c, j * this.w + x0, j * this.w + x1);
  }

  /** Rect between integer edges (x0,y0)-(x1,y1), exclusive end: shared edges never gap or overlap. */
  span(x0, y0, x1, y1, c) {
    this.rect(x0, y0, x1 - x0, y1 - y0, c);
  }

  /** Ordered dither between two adjacent ramp colours; level(x, y) or a number = share of `b`. */
  dither(x, y, w, h, a, b, level) {
    const x0 = Math.max(0, Math.round(x)), y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(this.w, Math.round(x + w)), y1 = Math.min(this.h, Math.round(y + h));
    const fn = typeof level === 'function';
    for (let j = y0; j < y1; j++) {
      const row = j * this.w;
      for (let i = x0; i < x1; i++) {
        const l = fn ? level(i, j) : level;
        this.px[row + i] = l > bayer(i, j) ? b : a;
      }
    }
  }

  /** Alpha wash (glass, floor reflection). Keep alphas low: it leaves the palette. */
  wash(x, y, w, h, c, a) {
    const x0 = Math.max(0, Math.round(x)), y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(this.w, Math.round(x + w)), y1 = Math.min(this.h, Math.round(y + h));
    for (let j = y0; j < y1; j++) {
      const row = j * this.w;
      for (let i = x0; i < x1; i++) this.px[row + i] = mix32(this.px[row + i], c, a);
    }
  }

  set(x, y, c) {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.px[y * this.w + x] = c;
  }

  /** Even-odd scanline polygon fill, pixel-centre rule. pts = [x0, y0, x1, y1, ...]. */
  poly(pts, c, shade = null) {
    const n = pts.length >> 1;
    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < n; i++) {
      const y = pts[i * 2 + 1];
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const y0 = Math.max(0, Math.floor(minY)), y1 = Math.min(this.h - 1, Math.ceil(maxY));
    const xs = POLY_XS;
    for (let j = y0; j <= y1; j++) {
      const cy = j + 0.5;
      let k = 0;
      for (let i = 0, p = n - 1; i < n; p = i++) {
        const ay = pts[p * 2 + 1], by = pts[i * 2 + 1];
        if ((ay <= cy && by > cy) || (by <= cy && ay > cy)) {
          const ax = pts[p * 2], bx = pts[i * 2];
          xs[k++] = ax + ((cy - ay) / (by - ay)) * (bx - ax);
        }
      }
      sortSmall(xs, k);
      for (let q = 0; q + 1 < k; q += 2) {
        const a = Math.max(0, Math.ceil(xs[q] - 0.5)), b = Math.min(this.w, Math.ceil(xs[q + 1] - 0.5));
        if (shade) for (let i = a; i < b; i++) this.px[j * this.w + i] = shade(i, j);
        else if (b > a) this.px.fill(c, j * this.w + a, j * this.w + b);
      }
    }
  }

  present(ctx) {
    ctx.putImageData(this.image, 0, 0);
  }
}

const POLY_XS = new Float64Array(64);
function sortSmall(a, n) {
  for (let i = 1; i < n; i++) {
    const v = a[i];
    let j = i - 1;
    while (j >= 0 && a[j] > v) {
      a[j + 1] = a[j];
      j--;
    }
    a[j + 1] = v;
  }
}

// ---------------------------------------------------------------------------
// Materials: a 4-step ramp (highlight, base, shade, deep), a line colour and
// optional rim light. Thresholds map a Lambert term to the ramp.

const MAX_MATS = 256;
export const MAT = {
  ramp: new Uint32Array(MAX_MATS * 4),
  line: new Uint32Array(MAX_MATS),
  rim: new Uint32Array(MAX_MATS),
  flags: new Uint8Array(MAX_MATS),
  th: new Float32Array(MAX_MATS * 3),
  count: 1, // 0 = empty
  byKey: new Map(),
};
export const F_DECAL = 1; // painted feature: exact colour per tone, no inner lines
export const F_RIM_SIDE = 2; // silver rim on the screen-right silhouette edge
export const F_RIM_TOP = 4; // silver rim on the top silhouette edge
export const F_NO_LINE = 8; // never draws an inner line over what is behind it
export const F_NO_OUTLINE = 16; // no outer outline (soft edges such as cast shadows)

/**
 * Register (or reuse) a material.
 * @param spec { ramp: [hi, base, shade, deep] hex, line: hex, rim?: hex, rimSide?, rimTop?, decal?,
 *               th?: [hi, base, shade] Lambert thresholds, noLine?, noOutline? }
 */
export function material(key, spec) {
  if (MAT.byKey.has(key)) return MAT.byKey.get(key);
  const id = MAT.count++;
  const r = spec.ramp;
  for (let i = 0; i < 4; i++) MAT.ramp[id * 4 + i] = u32(r[Math.min(i, r.length - 1)]);
  MAT.line[id] = u32(spec.line || r[r.length - 1]);
  MAT.rim[id] = spec.rim ? u32(spec.rim) : 0;
  MAT.flags[id] =
    (spec.decal ? F_DECAL : 0) |
    (spec.rim && spec.rimSide !== false ? F_RIM_SIDE : 0) |
    (spec.rim && spec.rimTop ? F_RIM_TOP : 0) |
    (spec.noLine ? F_NO_LINE : 0) |
    (spec.noOutline ? F_NO_OUTLINE : 0);
  const th = spec.th || [0.82, 0.3, -0.25];
  MAT.th[id * 3] = th[0];
  MAT.th[id * 3 + 1] = th[1];
  MAT.th[id * 3 + 2] = th[2];
  MAT.byKey.set(key, id);
  return id;
}

// Key light: upper front, slightly camera-left (ART_DIRECTION "Lighting recipe").
const LL = Math.hypot(-0.42, -0.55, 0.72);
export const LIGHT = [-0.42 / LL, -0.55 / LL, 0.72 / LL];

function toneOf(m, l) {
  const o = m * 3;
  return l > MAT.th[o] ? 0 : l > MAT.th[o + 1] ? 1 : l > MAT.th[o + 2] ? 2 : 3;
}

/** Tone from a 2D surface normal (nx, ny in -1..1, nz derived). */
export function toneN(m, nx, ny) {
  const nz2 = 1 - nx * nx - ny * ny;
  const nz = nz2 > 0 ? Math.sqrt(nz2) : 0;
  return toneOf(m, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]);
}

// ---------------------------------------------------------------------------
// PartBuffer: screen-sized material buffer for characters

export class PartBuffer {
  constructor(w = W, h = H) {
    this.w = w;
    this.h = h;
    const n = w * h;
    this.mat = new Uint8Array(n);
    this.tone = new Uint8Array(n);
    this.grp = new Uint8Array(n);
    this.z = new Uint8Array(n);
    this.clipY = new Int16Array(w).fill(h); // per column: clipped parts stop above this row
    this.clipGroup = new Uint8Array(256); // groups that obey clipY
    this.noLines = new Uint8Array(256 * 256 / 8); // pairs of groups that never get inner lines
    this.bx0 = w;
    this.by0 = h;
    this.bx1 = 0;
    this.by1 = 0;
    this.g = 1;
    this.cz = 1;
    this.clip = false;
  }

  /** Forget everything drawn (only the touched rectangle is cleared). */
  clear() {
    if (this.bx1 > this.bx0) {
      for (let y = this.by0; y < this.by1; y++) {
        const a = y * this.w + this.bx0, b = y * this.w + this.bx1;
        this.mat.fill(0, a, b);
      }
    }
    this.bx0 = this.w;
    this.by0 = this.h;
    this.bx1 = 0;
    this.by1 = 0;
    this.clipY.fill(this.h);
    this.clipGroup.fill(0);
  }

  /** Select the group / depth for the next shapes. Groups with clip=true stop at clipY. */
  part(group, z, clip = false) {
    this.g = group;
    this.cz = z;
    this.clip = clip;
    if (clip) this.clipGroup[group] = 1;
  }

  /** Two groups that should never get an inner line between them (e.g. hair strands). */
  joinGroups(a, b) {
    const k1 = a * 256 + b, k2 = b * 256 + a;
    this.noLines[k1 >> 3] |= 1 << (k1 & 7);
    this.noLines[k2 >> 3] |= 1 << (k2 & 7);
  }

  _touch(x0, y0, x1, y1) {
    if (x0 < this.bx0) this.bx0 = x0;
    if (y0 < this.by0) this.by0 = y0;
    if (x1 > this.bx1) this.bx1 = x1;
    if (y1 > this.by1) this.by1 = y1;
  }

  _bounds(minX, minY, maxX, maxY) {
    const x0 = Math.max(1, Math.floor(minX)), y0 = Math.max(1, Math.floor(minY));
    const x1 = Math.min(this.w - 1, Math.ceil(maxX) + 1), y1 = Math.min(this.h - 1, Math.ceil(maxY) + 1);
    if (x1 > x0 && y1 > y0) this._touch(x0, y0, x1, y1);
    return [x0, y0, x1, y1];
  }

  plot(x, y, m, tone = 1) {
    if (x < 1 || y < 1 || x >= this.w - 1 || y >= this.h - 1) return;
    if (this.clip && y >= this.clipY[x]) return;
    const i = y * this.w + x;
    this.mat[i] = m;
    this.tone[i] = tone;
    this.grp[i] = this.g;
    this.z[i] = this.cz;
    this._touch(x, y, x + 1, y + 1);
  }

  /** Paint only where something of `onGroup` (or anything, if 0) is already drawn. */
  paint(x, y, m, tone = 1, onGroup = 0) {
    if (x < 1 || y < 1 || x >= this.w - 1 || y >= this.h - 1) return;
    const i = y * this.w + x;
    if (!this.mat[i] || (onGroup && this.grp[i] !== onGroup)) return;
    this.mat[i] = m;
    this.tone[i] = tone;
  }

  /** Filled tapered capsule from (ax,ay) radius ra to (bx,by) radius rb, shaded as a tube. */
  capsule(ax, ay, bx, by, ra, rb, m, toneBias = 0) {
    const [x0, y0, x1, y1] = this._bounds(Math.min(ax - ra, bx - rb), Math.min(ay - ra, by - rb), Math.max(ax + ra, bx + rb), Math.max(ay + ra, by + rb));
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy || 1e-6;
    const { w, mat, tone, grp, z, clipY } = this;
    for (let y = y0; y < y1; y++) {
      const cy = y + 0.5;
      for (let x = x0; x < x1; x++) {
        if (this.clip && y >= clipY[x]) continue;
        const cx = x + 0.5;
        let u = ((cx - ax) * dx + (cy - ay) * dy) / len2;
        u = u < 0 ? 0 : u > 1 ? 1 : u;
        const r = ra + (rb - ra) * u;
        const ex = cx - (ax + dx * u), ey = cy - (ay + dy * u);
        const d2 = ex * ex + ey * ey;
        if (d2 > r * r) continue;
        const i = y * w + x;
        mat[i] = m;
        tone[i] = Math.min(3, Math.max(0, toneN(m, ex / r, ey / r) + toneBias));
        grp[i] = this.g;
        z[i] = this.cz;
      }
    }
  }

  /** Filled ellipse (rotation `rot` radians), shaded as a dome. */
  ellipse(cx0, cy0, rx, ry, m, rot = 0, toneBias = 0) {
    const R = Math.max(rx, ry);
    const [x0, y0, x1, y1] = this._bounds(cx0 - R, cy0 - R, cx0 + R, cy0 + R);
    const c = Math.cos(rot), s = Math.sin(rot);
    const { w, mat, tone, grp, z, clipY } = this;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        if (this.clip && y >= clipY[x]) continue;
        const px = x + 0.5 - cx0, py = y + 0.5 - cy0;
        const lx = (px * c + py * s) / rx, ly = (-px * s + py * c) / ry;
        if (lx * lx + ly * ly > 1) continue;
        const i = y * w + x;
        mat[i] = m;
        // normal back in screen orientation
        const nx = lx * c - ly * s, ny = lx * s + ly * c;
        tone[i] = Math.min(3, Math.max(0, toneN(m, nx * 0.95, ny * 0.95) + toneBias));
        grp[i] = this.g;
        z[i] = this.cz;
      }
    }
  }

  /**
   * Polygon (even-odd) with a per-pixel tone function toneAt(x, y) → 0..3, or a constant tone.
   * pts = [x0, y0, x1, y1, ...] in screen pixels (floats).
   */
  poly(pts, m, toneAt = 1) {
    const n = pts.length >> 1;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < n; i++) {
      const x = pts[i * 2], y = pts[i * 2 + 1];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const [bx0, by0, bx1, by1] = this._bounds(minX, minY, maxX, maxY);
    const fn = typeof toneAt === 'function';
    const xs = POLY_XS;
    const { w, mat, tone, grp, z, clipY } = this;
    for (let y = by0; y < by1; y++) {
      const cy = y + 0.5;
      let k = 0;
      for (let i = 0, p = n - 1; i < n; p = i++) {
        const ay = pts[p * 2 + 1], by = pts[i * 2 + 1];
        if ((ay <= cy && by > cy) || (by <= cy && ay > cy)) {
          const ax = pts[p * 2], bx = pts[i * 2];
          xs[k++] = ax + ((cy - ay) / (by - ay)) * (bx - ax);
        }
      }
      sortSmall(xs, k);
      for (let q = 0; q + 1 < k; q += 2) {
        const a = Math.max(bx0, Math.ceil(xs[q] - 0.5)), b = Math.min(bx1, Math.ceil(xs[q + 1] - 0.5));
        for (let x = a; x < b; x++) {
          if (this.clip && y >= clipY[x]) continue;
          const i = y * w + x;
          const t = fn ? toneAt(x, y) : toneAt;
          if (t < 0) continue;
          mat[i] = m;
          tone[i] = t;
          grp[i] = this.g;
          z[i] = this.cz;
        }
      }
    }
  }

  /**
   * General implicit shape over a pixel box: fn(px, py) (pixel centres) returns a tone 0..3 to
   * fill, or -1 to skip. The workhorse for heads and hair.
   */
  shape(minX, minY, maxX, maxY, m, fn) {
    const [x0, y0, x1, y1] = this._bounds(minX, minY, maxX, maxY);
    const { w, mat, tone, grp, z, clipY } = this;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        if (this.clip && y >= clipY[x]) continue;
        const t = fn(x + 0.5, y + 0.5);
        if (t < 0) continue;
        const i = y * w + x;
        mat[i] = typeof t === 'number' && t >= 16 ? t >> 4 : m; // fn may return (mat << 4) | tone
        tone[i] = t & 15;
        grp[i] = this.g;
        z[i] = this.cz;
      }
    }
  }

  /** Is anything drawn at (x, y)? Optional group filter. */
  has(x, y, group = 0) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return false;
    const i = y * this.w + x;
    return this.mat[i] !== 0 && (!group || this.grp[i] === group);
  }

  /**
   * Turn the buffer into pixels on `frame` (only the touched rectangle).
   * @param opts { rim: bool } rim light on/off (off for flat insert shots)
   */
  resolve(frame) {
    if (this.bx1 <= this.bx0) return;
    const { w, h, mat, tone, grp, z, clipY, clipGroup, noLines } = this;
    const ramp = MAT.ramp, line = MAT.line, rim = MAT.rim, flags = MAT.flags;
    const x0 = Math.max(1, this.bx0 - 1), x1 = Math.min(w - 1, this.bx1 + 1);
    const y0 = Math.max(1, this.by0 - 1), y1 = Math.min(h - 1, this.by1 + 1);
    // clean speckles: a pixel whose tone differs from all four same-material neighbours takes
    // theirs (1 px lines survive because they have neighbours along the line)
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = y * w + x;
        const m = mat[i];
        if (!m || flags[m] & F_DECAL) continue;
        const t = tone[i];
        const l = i - 1, r = i + 1, u = i - w, d = i + w;
        if (mat[l] !== m || mat[r] !== m || mat[u] !== m || mat[d] !== m) continue;
        if (tone[l] === t || tone[r] === t || tone[u] === t || tone[d] === t) continue;
        if (tone[l] === tone[r]) tone[i] = tone[l];
        else if (tone[u] === tone[d]) tone[i] = tone[u];
      }
    }
    const px = frame.px;
    const fw = frame.w;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = y * w + x;
        const m = mat[i];
        const fi = y * fw + x;
        if (!m) {
          // outer outline: the frontmost neighbour decides the colour
          let best = -1, bz = -1;
          const below = y >= clipY[x];
          const nb0 = i - 1, nb1 = i + 1, nb2 = i - w, nb3 = i + w;
          for (let k = 0; k < 4; k++) {
            const n = k === 0 ? nb0 : k === 1 ? nb1 : k === 2 ? nb2 : nb3;
            const nm = mat[n];
            if (!nm || flags[nm] & F_NO_OUTLINE) continue;
            if (below && clipGroup[grp[n]]) continue; // no outline along the desk clip
            if (z[n] > bz) {
              bz = z[n];
              best = n;
            }
          }
          if (best >= 0) px[fi] = line[mat[best]];
          continue;
        }
        const f = flags[m];
        let c = ramp[m * 4 + tone[i]];
        if (!(f & (F_DECAL | F_NO_LINE))) {
          const g = grp[i], zi = z[i];
          for (let k = 0; k < 4; k++) {
            const n = k === 0 ? i - 1 : k === 1 ? i + 1 : k === 2 ? i - w : i + w;
            const nm = mat[n];
            if (!nm || grp[n] === g || z[n] >= zi) continue;
            const key = g * 256 + grp[n];
            if (noLines[key >> 3] & (1 << (key & 7))) continue;
            c = line[m];
            break;
          }
          if (c !== line[m]) {
            if (f & F_RIM_SIDE && !mat[i + 1]) c = rim[m];
            else if (f & F_RIM_TOP && !mat[i - w]) c = rim[m];
          }
        }
        px[fi] = c;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Small shared helpers (moved here from character.js / face.js so every part
// module can use them without importing another part module)

/** A decal material that paints one exact palette colour. */
export function decal(hex) {
  return material(`decal:${hex}`, { ramp: [hex], decal: true });
}

/** Integer Bresenham line between float endpoints. */
export function line(ax, ay, bx, by, fn) {
  let x0 = Math.round(ax), y0 = Math.round(ay);
  const x1 = Math.round(bx), y1 = Math.round(by);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (let n = 0; n < 512; n++) {
    fn(x0, y0);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}
