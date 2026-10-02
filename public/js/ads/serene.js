// SERENE — lunar retreats, sold like a luxury travel brand: hushed voice-over,
// ethereal score, slow camera. A woman on a city balcony looks up at the full
// moon; match cut to the lunar horizon with the Earth rising; a modernist
// residence glowing on the Sea of Serenity; inside, an evening dress, a glass,
// the Earth in the window; she raises a toast to everything she left behind.
// "No traffic. No neighbours. No air." Small print does the rest.
//
// Pure function of the ad clock. Moon, Earth and sets are baked once with
// dithered light (cine.js); the figures use the crisp rasteriser.
import {
  P, W, H, clamp, lerp, prog, smooth, track, window01, hash, blinkAt, mix, bake, prewarm, shader, shadeSteps, pool, rect, line,
  begin, pt, fill, ellipse, capsule, film, vignette, vignetteArt, thin, tracked, text, smallPrint, figure, bust, arm, wrist,
  standing, superTitle, bayer, rgb,
} from './cine.js';

const { round, floor, sin, cos, abs, min, max, PI, sqrt } = Math;

// --- timing (60 bpm: one beat a second, chords change on the cuts) -------------------------
const T_LUNA = 5.0;
const T_HOUSE = 7.5;
const T_LOUNGE = 12.0;
const T_TOAST = 16.5;
const T_SLATE = 20.5;
const DURATION = 24.5;

// --- palette -------------------------------------------------------------------------------
const GOLD = mix(P.cream, P.yellow, 0.3);
const GOLD_D = mix(P.yellow, P.tanShade, 0.5);
const REG = [P.black, mix(P.black, P.slate, 0.5), P.slate, mix(P.slate, P.steel, 0.5), P.steel, mix(P.steel, P.fog, 0.5), P.fog];
const EARTH_SEA = [mix(P.black, P.navy, 0.4), P.navy, mix(P.navy, P.steel, 0.4), mix(P.navy, P.fog, 0.45)];
const EARTH_LAND = [mix(P.black, P.darkGreen, 0.4), mix(P.darkGreen, P.tanShade, 0.45), mix(P.tan, P.steel, 0.4)];
const CLOUD = [mix(P.slate, P.fog, 0.4), P.fog, P.silver, P.white];

// --- value noise for planets --------------------------------------------------------------------
function vnoise(x, y, seed) {
  const xi = floor(x);
  const yi = floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const h = (a, b) => hash(a * 157.31 + b * 311.7 + seed * 71.3);
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  return lerp(lerp(h(xi, yi), h(xi + 1, yi), u), lerp(h(xi, yi + 1), h(xi + 1, yi + 1), u), v);
}
const fbm = (x, y, seed) => vnoise(x, y, seed) * 0.55 + vnoise(x * 2.1, y * 2.1, seed + 1) * 0.3 + vnoise(x * 4.3, y * 4.3, seed + 2) * 0.15;

/** The Earth, lit from the left: oceans, land, cloud bands, a thin atmosphere rim. */
const EARTH_KEYS = new Map();
const MOON_KEYS = new Map();
const keyOf = (m, prefix, r) => m.get(r) || (m.set(r, `${prefix}${r}`), m.get(r));
function earthArt(r) {
  return bake(keyOf(EARTH_KEYS, 'se-earth-', r), r * 2 + 4, r * 2 + 4, function* paint(c) {
    const w = r * 2 + 4;
    const img = c.createImageData(w, w);
    const d = img.data;
    const put = (x, y, hex) => {
      const [R, G, B] = rgb(hex);
      const o = (y * w + x) * 4;
      d[o] = R;
      d[o + 1] = G;
      d[o + 2] = B;
      d[o + 3] = 255;
    };
    const pick = (ramp, v, x, y) => {
      const u = clamp(v) * (ramp.length - 1);
      let i = floor(u);
      if (i < ramp.length - 1 && u - i > bayer(x, y)) i++;
      return ramp[i];
    };
    for (let y = 0; y < w; y++) {
      for (let x = 0; x < w; x++) {
        const nx = (x + 0.5 - w / 2) / r;
        const ny = (y + 0.5 - w / 2) / r;
        const q = nx * nx + ny * ny;
        if (q > 1) {
          if (q < 1.12 && nx < 0.2) put(x, y, mix(P.navy, P.fog, 0.5)); // atmosphere on the lit limb
          continue;
        }
        const nz = sqrt(1 - q);
        const lit = clamp((-nx * 0.8 - ny * 0.25 + nz * 0.45) * 1.6 + 0.15);
        const sx = nx / (nz + 0.6);
        const sy = ny / (nz + 0.6);
        const land = fbm(sx * 2.2 + 3, sy * 2.2 + 1, 4);
        const cloud = fbm(sx * 3.4 + 9, sy * 6 + 2, 9);
        let hex;
        if (cloud > 0.62) hex = pick(CLOUD, lit * (0.6 + (cloud - 0.62) * 2), x, y);
        else if (land > 0.56) hex = pick(EARTH_LAND, lit * 1.1, x, y);
        else hex = pick(EARTH_SEA, lit * (0.85 + nz * 0.25), x, y);
        if (lit < 0.08) hex = (x + y) & 1 && lit > 0.03 ? mix(P.black, P.navy, 0.35) : P.black;
        put(x, y, hex);
      }
      if ((y & 3) === 3) yield;
    }
    c.putImageData(img, 0, 0);
  });
}

/** The full moon seen from Earth: silver with darker maria and a soft limb. */
function moonArt(r) {
  return bake(keyOf(MOON_KEYS, 'se-moon-', r), r * 2 + 2, r * 2 + 2, function* paint(c) {
    const w = r * 2 + 2;
    const img = c.createImageData(w, w);
    const d = img.data;
    const ramp = [P.steel, mix(P.steel, P.fog, 0.5), P.fog, mix(P.fog, P.silver, 0.5), P.silver, mix(P.silver, P.white, 0.4)];
    for (let y = 0; y < w; y++) {
      for (let x = 0; x < w; x++) {
        const nx = (x + 0.5 - w / 2) / r;
        const ny = (y + 0.5 - w / 2) / r;
        const q = nx * nx + ny * ny;
        if (q > 1) continue;
        const mare = fbm(nx * 2.4 + 5, ny * 2.4 + 7, 2);
        const v = clamp(0.95 - q * 0.35 - (mare > 0.55 ? 0.35 : 0) - (mare > 0.66 ? 0.12 : 0));
        const u = v * (ramp.length - 1);
        let i = floor(u);
        if (i < ramp.length - 1 && u - i > bayer(x, y)) i++;
        const [R, G, B] = rgb(ramp[i]);
        const o = (y * w + x) * 4;
        d[o] = R;
        d[o + 1] = G;
        d[o + 2] = B;
        d[o + 3] = 255;
      }
      if ((y & 3) === 3) yield;
    }
    c.putImageData(img, 0, 0);
  });
}

const STARS = Array.from({ length: 40 }, (_, i) => [floor(hash(i * 3.7) * W), floor(hash(i * 9.1) * 150), hash(i * 5.3)]);
function stars(ctx, ox = 0, oy = 0, a = 1, maxY = 216) {
  for (const [x, y, b] of STARS) {
    const sx = ((x - ox) % W + W) % W;
    const sy = y - oy;
    if (sy < 0 || sy > maxY) continue;
    ctx.globalAlpha = a * (0.35 + b * 0.5);
    rect(ctx, sx, sy, 1, 1, b > 0.85 ? P.white : P.fog);
  }
  ctx.globalAlpha = 1;
}

// --- S1: a city balcony, the full moon -------------------------------------------------------
const citySet = () =>
  bake('se-city', 420, 260, function* paint(c) {
    yield* shadeSteps(c, 0, 0, 420, 260, [P.black, mix(P.black, P.navy, 0.45), mix(P.navy, P.ink, 0.5), mix(P.navy, P.slate, 0.4)], (x, y) => clamp((y - 20) / 230) * 0.9 + clamp(1 - sqrt(((x - 330) / 160) ** 2 + ((y - 60) / 120) ** 2)) * 0.25);
    // towers, far to near; sparse warm windows (static)
    const layers = [
      { base: 196, h: [40, 70], col: mix(P.ink, P.navy, 0.5), win: 0.08 },
      { base: 214, h: [56, 104], col: mix(P.black, P.ink, 0.6), win: 0.12 },
    ];
    layers.forEach((L, li) => {
      let x = -4;
      let k = li * 100;
      while (x < 420) {
        const w = 18 + floor(hash(k) * 26);
        const h = L.h[0] + floor(hash(k + 1) * (L.h[1] - L.h[0]));
        const top = L.base - h + 40;
        rect(c, x, top, w - 2, 260 - top, L.col);
        if (hash(k + 2) > 0.6) rect(c, x + floor(w / 2) - 1, top - 8, 1, 8, L.col);
        for (let wy = top + 4; wy < 250; wy += 5) {
          for (let wx = x + 3; wx < x + w - 5; wx += 4) {
            if (hash(wx * 7.1 + wy * 3.3) < L.win) rect(c, wx, wy, 2, 2, mix(P.yellow, li ? P.orange : P.navy, 0.45));
          }
        }
        x += w;
        k += 3;
      }
    });
  });
const moonGlow = () => pool('se-moonglow', 64, 64, P.silver, 6, 0.16);

const LADY_FAR = figure({
  hh: 40,
  hair: 'bun',
  garment: 'dress',
  back: true,
  shoulders: 0.7,
  pal: {
    skin: mix(P.ink, P.tanShade, 0.35),
    skinD: P.black,
    hair: P.black,
    hairD: P.black,
    hairL: mix(P.black, P.slate, 0.5),
    top: mix(P.black, P.darkGreen, 0.35),
    topD: P.black,
    topL: mix(P.black, P.slate, 0.5),
    rim: mix(P.silver, P.fog, 0.4),
  },
});

function shotCity(ctx, lt) {
  const camY = track(lt, [[0, 30], [5.4, 0, 'smooth']]);
  const camX = track(lt, [[0, 0], [5.4, 14, 'smooth']]);
  ctx.drawImage(citySet(), -round(camX * 0.4), -round(camY * 0.5));
  // the moon rises over the towers
  const my = 70 + track(lt, [[0, 20], [5.4, 0, 'smooth']]) - camY * 0.3;
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(moonGlow(), 296 - 64 - round(camX * 0.2), round(my) - 64);
  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(moonArt(22), 296 - 23 - round(camX * 0.2), round(my) - 23);
  // she stands at the balcony rail, a silhouette rimmed by moonlight
  ctx.save();
  ctx.translate(-round(camX), -round(camY));
  // balcony beyond her: glass panel with a steel handrail; she stands in front
  ctx.globalAlpha = 0.18;
  rect(ctx, 0, 196, 420, 70, P.fog);
  ctx.globalAlpha = 1;
  rect(ctx, 0, 194, 420, 2, P.steel);
  rect(ctx, 0, 194, 420, 1, P.silver);
  const f = LADY_FAR;
  f.x = 118;
  f.y = 128;
  f.tiltX = round(track(lt, [[0.5, 0], [3.0, 1, 'inOut']]));
  bust(ctx, f, 270);
  bareBack(ctx, f);
  ctx.restore();
  vignette(ctx, 0.6);
}

/** Bare shoulders and upper back above a low dress line, thin straps (back views). */
function bareBack(ctx, f) {
  const hh = f.hh;
  const x = f.x;
  const neckB = f.y + hh * 1.22;
  const shY = neckB + hh * 0.06;
  const sw = hh * f.shoulders;
  const dress = shY + hh * 0.72;
  begin();
  pt(x - hh * 0.2, neckB - hh * 0.06);
  pt(x - sw * 0.72, shY);
  pt(x - sw * 0.95, shY + hh * 0.14);
  pt(x - sw * 0.97, shY + hh * 0.42);
  pt(x - sw * 0.55, dress);
  pt(x + sw * 0.55, dress);
  pt(x + sw * 0.97, shY + hh * 0.42);
  pt(x + sw * 0.95, shY + hh * 0.14);
  pt(x + sw * 0.72, shY);
  pt(x + hh * 0.2, neckB - hh * 0.06);
  fill(ctx, f.pal.skin, { d: f.pal.skinD, f: 0.3, m: 1, side: 1, ...(f.pal.rim ? { r: f.pal.rim } : {}) });
  // shoulder blades and spine, softly
  ctx.fillStyle = mix(f.pal.skin, f.pal.skinD, 0.5);
  ctx.fillRect(round(x), round(shY + hh * 0.12), 1, round(hh * 0.55));
  ctx.fillRect(round(x - sw * 0.45), round(shY + hh * 0.3), round(sw * 0.22), 1);
  ctx.fillRect(round(x + sw * 0.25), round(shY + hh * 0.3), round(sw * 0.22), 1);
  // straps
  line(ctx, x - sw * 0.5, shY + hh * 0.02, x - sw * 0.42, dress, f.pal.top);
  line(ctx, x + sw * 0.5, shY + hh * 0.02, x + sw * 0.42, dress, f.pal.top);
}

// --- S2: the lunar horizon, the Earth rising ---------------------------------------------------
const horizonSet = () =>
  bake('se-horizon', W, H, function* paint(c) {
    yield* shadeSteps(c, 0, 140, W, H - 140, REG, (x, y) => {
      const hill = 140 + 6 * sin(x * 0.012 + 1) + 3 * sin(x * 0.05);
      if (y < hill) return -1;
      const crater = clamp(1 - sqrt(((x - 110) / 60) ** 2 + ((y - 196) / 12) ** 2));
      return clamp(0.75 - (y - hill) * 0.006 - crater * 0.3 + (crater > 0 && crater < 0.25 ? 0.25 : 0) + 0.05 * fbm(x * 0.08, y * 0.2, 3));
    });
  });

function shotLuna(ctx, lt) {
  rect(ctx, 0, 0, W, H, P.black);
  stars(ctx, 0, 0, 0.8, 150);
  const ey = track(lt, [[0, 168], [2.5 + 0.4, 112, 'smooth']]);
  ctx.drawImage(earthArt(26), 230 - 28, round(ey) - 28);
  ctx.drawImage(horizonSet(), 0, 0);
  vignette(ctx, 0.5);
}

// --- S3: the residence on the Sea of Serenity ----------------------------------------------
const plainSet = () =>
  bake('se-plain', 430, H, function* paint(c) {
    rect(c, 0, 0, 430, H, P.black);
    yield* shadeSteps(c, 0, 120, 430, H - 120, REG, (x, y) => {
      const hill = 128 + 10 * sin(x * 0.01) + 4 * sin(x * 0.037 + 2);
      if (y < hill) return -1;
      const glow = clamp(1 - sqrt(((x - 250) / 120) ** 2 + ((y - 156) / 24) ** 2));
      return clamp(0.42 + (y - hill) * 0.004 + 0.06 * fbm(x * 0.06, y * 0.25, 5) + glow * 0.3);
    });
    // footprints from the left to the door
    for (let i = 0; i < 26; i++) {
      const x = 60 + i * 7;
      const y = 186 - i * 1.0 + (i & 1 ? 2 : 0);
      rect(c, x, round(y), 2, 1, mix(P.slate, P.black, 0.4));
    }
    // the rover, parked
    rect(c, 46, 168, 34, 3, P.fog);
    rect(c, 46, 168, 34, 1, P.silver);
    rect(c, 52, 160, 2, 8, P.steel);
    rect(c, 50, 158, 10, 2, P.steel);
    ellipse(c, 50, 174, 5, 5, P.black);
    ellipse(c, 76, 174, 5, 5, P.black);
    ellipse(c, 50, 174, 3, 3, P.slate);
    ellipse(c, 76, 174, 3, 3, P.slate);
    line(c, 74, 168, 82, 152, P.steel);
    ellipse(c, 83, 151, 3, 2, P.fog);
  });
const housePool = () => pool('se-housepool', 110, 22, P.yellow, 6, 0.22);
const residenceArt = () =>
  bake('se-residence', 190, 60, function* paint(c) {
    // flat roof slab, glass front glowing warm, slender columns
    rect(c, 0, 4, 190, 6, P.fog);
    rect(c, 0, 4, 190, 1, P.silver);
    rect(c, 0, 9, 190, 1, P.steel);
    yield* shadeSteps(c, 8, 10, 174, 40, [mix(P.tanShade, P.brown, 0.4), P.tanShade, mix(P.tan, P.yellow, 0.3), mix(P.cream, P.yellow, 0.3)], (x, y) => 0.45 + 0.4 * sin(((x - 8) / 174) * PI) - (y - 10) * 0.004);
    // interior silhouettes: a floor lamp, a sofa, a table, a standing figure
    rect(c, 40, 22, 1, 28, mix(P.brown, P.black, 0.3));
    ellipse(c, 40, 22, 4, 2, P.cream);
    rect(c, 56, 40, 34, 10, mix(P.brown, P.black, 0.35));
    rect(c, 56, 36, 6, 6, mix(P.brown, P.black, 0.35));
    rect(c, 112, 42, 20, 2, mix(P.brown, P.black, 0.4));
    rect(c, 121, 44, 2, 6, mix(P.brown, P.black, 0.4));
    ellipse(c, 150, 25, 2, 2, mix(P.brown, P.black, 0.4));
    rect(c, 148, 27, 4, 14, mix(P.brown, P.black, 0.4));
    rect(c, 147, 41, 6, 9, mix(P.brown, P.black, 0.4));
    for (const x of [8, 66, 124, 181]) rect(c, x, 10, 2, 40, P.steel);
    // plinth / terrace
    rect(c, 0, 50, 190, 4, P.steel);
    rect(c, 0, 50, 190, 1, P.fog);
    rect(c, 0, 54, 190, 3, P.slate);
  });

function shotHouse(ctx, lt) {
  const camX = track(lt, [[0, 0], [4.5, 30, 'smooth']]);
  ctx.drawImage(plainSet(), -round(camX), 0);
  stars(ctx, camX * 0.2, 0, 0.7, 128);
  ctx.drawImage(earthArt(16), 88 - round(camX * 0.15), 30);
  ctx.save();
  ctx.translate(-round(camX), 0);
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(housePool(), 250 - 110, 140);
  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(residenceArt(), 158, 104);
  ctx.restore();
  superTitle(ctx, 'MARE SERENITATIS', 24, 192, lt - 0.8, { color: P.fog, rule: GOLD_D, track: 2 });
  vignette(ctx, 0.5);
}

// --- S4: inside: an evening dress, a glass, the Earth in the window --------------------------
const loungeSet = () =>
  bake('se-lounge', 410, H, function* paint(c) {
    // warm wall at the left, the great window on the right two thirds
    yield* shadeSteps(c, 0, 0, 410, 170, [P.black, mix(P.black, P.maroon, 0.5), P.maroon, mix(P.maroon, P.brown, 0.5), P.brown], (x, y) => clamp(1 - sqrt(((x - 40) / 180) ** 2 + ((y - 100) / 140) ** 2)) * 0.9);
    rect(c, 120, 0, 290, 170, P.black);
    // lunar horizon through the glass
    yield* shadeSteps(c, 120, 128, 290, 42, REG, (x, y) => {
      const hill = 140 + 5 * sin(x * 0.02);
      return y < hill ? -1 : clamp(0.5 - (y - hill) * 0.01 + 0.05 * fbm(x * 0.07, y * 0.3, 7));
    });
    // mullions and frame
    for (const x of [120, 216, 312, 408]) rect(c, x, 0, 3, 170, mix(P.black, P.slate, 0.4));
    rect(c, 120, 0, 290, 3, mix(P.black, P.slate, 0.4));
    // floor: dark timber with the lamp's warmth and the window's cool sheen
    yield* shadeSteps(c, 0, 170, 410, H - 170, [P.black, mix(P.black, P.maroon, 0.6), P.maroon, mix(P.maroon, P.brown, 0.5), mix(P.steel, P.maroon, 0.5)], (x, y) => {
      const warm = clamp(1 - sqrt(((x - 40) / 150) ** 2 + ((y - 176) / 40) ** 2));
      const cool = 0.25 * clamp(1 - abs(x - 260) / 140) * clamp(1 - (y - 170) / 30);
      return clamp(0.18 + warm * 0.6 + cool + 0.03 * sin(y * 1.7));
    });
    rect(c, 0, 170, 410, 1, mix(P.brown, P.tanShade, 0.4));
    // a floor lamp and a low sofa at the left
    rect(c, 44, 70, 2, 100, mix(P.tanShade, P.yellow, 0.3));
    begin();
    pt(32, 70);
    pt(36, 56);
    pt(54, 56);
    pt(58, 70);
    fill(c, mix(P.cream, P.yellow, 0.25), { d: mix(P.tan, P.yellow, 0.2), f: 0.3, m: 1, side: 1 });
    yield* shadeSteps(c, 60, 146, 56, 24, [mix(P.tan, P.brown, 0.4), P.tan, mix(P.cream, P.tan, 0.4)], (x, y) => clamp(0.9 - (x - 60) / 70 - (y - 146) * 0.01));
    rect(c, 60, 146, 56, 1, mix(P.cream, P.tan, 0.3));
  });
const lampPool = () => pool('se-lamppool', 90, 80, P.yellow, 6, 0.16);

const LADY = {
  x: 238,
  gy: 206,
  hh: 22,
  hair: 'bun',
  dress: true,
  turn: 0.55,
  shoulders: 0.74,
  pal: {
    ...figure().pal,
    skin: mix(P.skin, P.tan, 0.25),
    skinD: mix(P.skinShade, P.tanShade, 0.5),
    hair: mix(P.black, P.maroon, 0.5),
    hairD: P.black,
    hairL: mix(P.maroon, P.tanShade, 0.5),
    top: mix(P.darkGreen, P.black, 0.45),
    topD: P.black,
    topL: mix(P.darkGreen, P.steel, 0.4),
    lip: mix(P.skinShade, P.darkRed, 0.4),
  },
  bareArms: true,
  armL: { a: 0.1, e: 0.15 },
  armR: { a: 0.12, e: 2.35 },
};

function flute(ctx, x, y, a = 1) {
  ctx.globalAlpha = a;
  rect(ctx, x - 1, y - 7, 3, 6, mix(GOLD, P.fog, 0.3));
  rect(ctx, x - 1, y - 7, 1, 6, P.white);
  rect(ctx, x, y - 1, 1, 4, P.fog);
  rect(ctx, x - 1, y + 3, 3, 1, P.fog);
  ctx.globalAlpha = 1;
}

function shotLounge(ctx, lt) {
  const camX = track(lt, [[0, 0], [4.5, 22, 'smooth']]);
  ctx.drawImage(loungeSet(), round(camX * 0.6), 0, W, H, 0, 0, W, H);
  // the Earth, framed by the window
  stars(ctx, camX * 0.3, 0, 0.6, 126);
  ctx.drawImage(earthArt(30), 330 - 32 - round(camX * 0.3), 40);
  for (const x of [216, 312]) rect(ctx, x - round(camX * 0.6), 0, 3, 170, mix(P.black, P.slate, 0.4));
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(lampPool(), -46 - round(camX * 0.6), 40);
  ctx.globalCompositeOperation = 'source-over';
  ctx.save();
  ctx.translate(-round(camX), 0);
  // she turns her head from the view to us and back; the glass rests at her chest
  LADY.turn = track(lt, [[0, 0.6], [1.8, 0.6], [2.4, 0.15], [3.6, 0.15], [4.2, 0.6]]);
  LADY.armR.e = 2.35 + sin(lt * 0.8) * 0.04;
  standing(ctx, LADY);
  flute(ctx, LADY.armR.wx + 1, LADY.armR.wy - 2);
  ctx.restore();
  vignette(ctx, 0.5);
}

// --- S5: over her shoulder, a toast to the Earth ----------------------------------------------
const VIEW = { x: 0, y: 0 };
const LADY_OTS = figure({
  hh: 54,
  hair: 'bun',
  garment: 'dress',
  back: true,
  shoulders: 0.7,
  pal: {
    skin: mix(P.tanShade, P.ink, 0.4),
    skinD: mix(P.maroon, P.black, 0.55),
    hair: mix(P.black, P.maroon, 0.4),
    hairD: P.black,
    hairL: mix(P.maroon, P.fog, 0.3),
    top: mix(P.darkGreen, P.black, 0.55),
    topD: P.black,
    topL: mix(P.darkGreen, P.fog, 0.3),
    rim: mix(P.fog, P.navy, 0.25),
  },
});

const toastSet = () =>
  bake('se-toast', W, H, function* paint(c) {
    rect(c, 0, 0, W, H, P.black);
    yield* shadeSteps(c, 0, 150, W, 66, REG, (x, y) => {
      const hill = 158 + 4 * sin(x * 0.018 + 0.5);
      return y < hill ? -1 : clamp(0.55 - (y - hill) * 0.008 + 0.05 * fbm(x * 0.07, y * 0.3, 8));
    });
    rect(c, W - 3, 0, 3, H, mix(P.black, P.slate, 0.4));
  });

function shotToast(ctx, lt) {
  ctx.drawImage(toastSet(), 0, 0);
  stars(ctx, 40, 0, 0.6, 150);
  ctx.drawImage(earthArt(44), 270 - 46, 30);
  const m = LADY_OTS;
  m.x = 112;
  m.y = 96;
  m.tiltX = round(track(lt, [[0, 0], [2.0, 2, 'inOut']]));
  // her arm rises slowly, glass held out towards the Earth
  const raise = track(lt, [[0.5, 0], [2.6, 1, 'inOut']]);
  VIEW.x = lerp(m.x + 40, 196, raise);
  VIEW.y = lerp(226, 112, raise);
  m.armR.to = VIEW;
  m.armR.len = 0.95;
  m.armR.fore = 0.95;
  m.armR.hand = 'hold';
  bust(ctx, m, 230);
  bareBack(ctx, m);
  arm(ctx, m, 1, { bare: true });
  const w = wrist(m, 1);
  flute(ctx, round(w.wx), round(w.wy) - 5);
  vignette(ctx, 0.55);
}

// --- S6: end slate ------------------------------------------------------------------------------
const slateBg = () => shader('se-slatebg', W, H, [P.black, mix(P.black, P.navy, 0.35), mix(P.black, P.navy, 0.6)], (x, y) => clamp(1 - sqrt(((x - 192) / 240) ** 2 + ((y - 80) / 150) ** 2)) * 0.8);

function crescent(ctx, cx, cy, r, a) {
  ctx.globalAlpha = a;
  for (let i = 0; i < 64; i++) {
    const t = -PI / 2 + (i / 63) * PI;
    rect(ctx, round(cx + cos(t) * r), round(cy + sin(t) * r), 1, 1, GOLD);
    if (i % 2 === 0) rect(ctx, round(cx + cos(t) * r * 0.55 + r * 0.2), round(cy + sin(t) * r * 0.98), 1, 1, GOLD_D);
  }
  ctx.globalAlpha = 1;
}

function shotSlate(ctx, lt) {
  ctx.drawImage(slateBg(), 0, 0);
  crescent(ctx, 186, 54, 10, smooth(lt / 1.0));
  ctx.globalAlpha = smooth((lt - 0.3) / 0.9);
  thin(ctx, 'SERENE', 192, 78, { color: GOLD, style: 'didone', track: 8, scale: 2, align: 'center' });
  ctx.globalAlpha = 1;
  const rw = round(50 * smooth((lt - 0.9) / 0.8));
  if (rw > 0) rect(ctx, 192 - rw, 104, rw * 2, 1, GOLD_D);
  ctx.globalAlpha = smooth((lt - 1.1) / 0.7);
  tracked(ctx, 'LUNAR RETREATS  ·  MARE SERENITATIS', 192, 110, { color: P.fog, font: 'micro', track: 2, align: 'center' });
  ctx.globalAlpha = smooth((lt - 1.6) / 0.7);
  tracked(ctx, 'BY APPOINTMENT ONLY', 192, 130, { color: mix(GOLD, P.fog, 0.4), font: 'micro', track: 3, align: 'center' });
  ctx.globalAlpha = 1;
  smallPrint(
    ctx,
    'ATMOSPHERE NOT INCLUDED. OXYGEN SOLD SEPARATELY. RETURN JOURNEYS SUBJECT TO AVAILABILITY. THE EARTH IS VISIBLE FROM ALL PRINCIPAL ROOMS, AND THERE IS NOTHING YOU CAN DO ABOUT IT.',
    190,
    { color: P.steel, a: smooth((lt - 2.0) / 0.8) },
  );
}

const SHOTS = [
  { at: 0, draw: shotCity, tr: 'black', td: 1.2 },
  { at: T_LUNA, draw: shotLuna },
  { at: T_HOUSE, draw: shotHouse, tr: 'dissolve', td: 0.8 },
  { at: T_LOUNGE, draw: shotLounge, tr: 'dissolve', td: 0.7 },
  { at: T_TOAST, draw: shotToast, tr: 'dissolve', td: 0.7 },
  { at: T_SLATE, draw: shotSlate, tr: 'dip', td: 1.0 },
];

// Ethereal: celesta (decaying pulse), harp arpeggios, a sine pad, low sine bass.
// F lydian colours (Fmaj7#11), 60 bpm: chords change on the cuts.
const CELESTA = { wave: 'sine', a: 0.002, d: 1.4, s: 0, r: 0.9, vib: false };
const HARP = { wave: 'triangle', a: 0.003, d: 1.1, s: 0, r: 0.7, vib: false };
const PAD = { wave: 'sine', a: 0.6, d: 1.2, s: 0.85, r: 1.6, vib: [6, 4, 0.5], legato: 1 };

// Everything this spot bakes, in shot order: prewarmed in idle-time slices so
// no cut ever waits for a bake (see cine.js prewarm).
const WARM = [citySet, moonGlow, horizonSet, plainSet, housePool, residenceArt, loungeSet, lampPool, toastSet, slateBg, () => moonArt(22), () => earthArt(26), () => earthArt(16), () => earthArt(30), () => earthArt(44), () => vignetteArt(0.6), () => vignetteArt(0.5), () => vignetteArt(0.55)];
prewarm(WARM, 9000);

export default {
  id: 'serene',
  brand: 'SERENE',
  duration: DURATION,
  voice: { gender: 'female', lang: 'en-GB', pitch: 1.0, rate: 0.86 },
  script: [
    { at: 0.6, text: 'Some people dream of getting away from it all.' },
    { at: 5.3, text: 'We took it literally.' },
    { at: 7.8, text: 'Private residences on the Sea of Serenity.' },
    { at: 12.3, text: 'No traffic. No neighbours. No air.' },
    { at: 16.7, text: 'Just you, and a view of everything you left behind.' },
    { at: 21.8, text: 'Serene. Lunar retreats.' },
  ],
  tune: {
    bpm: 60,
    room: 0.7,
    echo: { beats: 0.75, feedback: 0.3 },
    fadeOut: 2,
    tracks: [
      { kind: 'lead', inst: CELESTA, gain: 0.8, notes: 'R:1 E6:1@0.4 C6:1@0.35 A5:2@0.4 B5:1@0.4 G5:1.5@0.35 A5:1@0.4 F5:1@0.35 E5:0.5@0.3 D5:2@0.35 F5:1@0.35 D5:1@0.3 C5:2.5@0.35 A5:1@0.4 C6:1@0.4 B5:1@0.4 G5:1@0.35 A5:1@0.4 E6:3@0.45 R:2' },
      { kind: 'harmony', inst: HARP, gain: 0.6, notes: 'F2:0.5@0.4 C3:0.5@0.35 E3:0.5@0.35 A3:0.5@0.35 B3:0.5@0.35 A3:0.5@0.3 E3:0.5@0.3 C3:0.5@0.3 E3:0.5@0.3 A3:0.5@0.3 A2:0.5@0.4 E3:0.5@0.35 G3:0.5@0.35 B3:0.5@0.35 C4:0.5@0.35 D3:0.5@0.4 A3:0.5@0.35 C4:0.5@0.35 E4:0.5@0.35 F4:0.5@0.35 G2:0.5@0.4 D3:0.5@0.35 F3:0.5@0.35 B3:0.5@0.35 Bb2:0.5@0.4 F3:0.5@0.35 A3:0.5@0.35 D4:0.5@0.35 F4:0.5@0.35 E2:0.5@0.4 C3:0.5@0.35 G3:0.5@0.35 C4:0.5@0.35 A2:0.5@0.4 C3:0.5@0.35 F3:0.5@0.35 E4:0.5@0.35 G2:0.5@0.4 Bb2:0.5@0.35 D3:0.5@0.35 F3:0.5@0.35 F2:0.5@0.4 C3:0.5@0.35 G3:0.5@0.35 A3:0.5@0.35 E4:2@0.35 R:2' },
      { kind: 'harmony', inst: PAD, gain: 0.3, notes: 'F3+A3+C4+E4:5@0.4 A2+C3+E3+G3:2.5@0.4 D3+F3+A3+C4:2.5@0.4 G2+B2+D3+F3:2@0.4 Bb2+D3+F3+A3:2.5@0.4 C3+E3+G3:2@0.4 F3+A3+C4:2@0.4 G2+Bb2+D3+F3:2@0.4 F3+A3+C4+G4:4@0.45 R:2' },
      { kind: 'bass', inst: 'sine', gain: 0.6, notes: 'F1:5 A1:2.5 D2:2.5 G1:2 Bb1:2.5 E2:2 A1:2 G1:2 F1:4 R:2' },
    ],
  },
  draw(ctx, t, dt, info) {
    prewarm(WARM);
    film(ctx, dt, info, SHOTS);
  },
};
