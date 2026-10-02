// SERENE — lunar retreats, sold like a luxury travel brand: hushed voice-over,
// ethereal score, slow camera. A woman on a city balcony, a silhouette rimmed
// by the full moon; match cut to the lunar horizon as the Earth rises over
// craters in a low, raking sun; a modernist residence glowing on the Sea of
// Serenity; inside, the same woman by the great window, a glass in her hand;
// a close insert of the glass raised to the Earth. The end slate sets the
// wordmark in the black sky above the lunar horizon.
// "No traffic. No neighbours. No air." Small print does the rest.
//
// Pure function of the ad clock. Moon, Earth and sets are baked once with
// dithered light (cine.js); the people are baked rim-lit silhouettes (the
// light sits exactly on their edges) with only the moving arm drawn per frame.
import {
  P, W, H, clamp, lerp, prog, smooth, track, window01, hash, mix, bake, prewarm, lazy, lazyBy, shader, shadeSteps, soften, pool, rect, line,
  begin, pt, fill, ellipse, capsule, film, vignette, vignetteArt, thin, tracked, text, smallPrint, superTitle, bayer, rgb, rimArt,
} from './cine.js';

const { round, floor, sin, cos, abs, min, max, PI, sqrt } = Math;

// --- timing (60 bpm: one beat a second, chords change on the cuts) -------------------------
const T_LUNA = 4.4;
const T_HOUSE = 8.4;
const T_LOUNGE = 12.6;
const T_TOAST = 16.6;
const T_SLATE = 20.4;
const DURATION = 25.0;

// --- palette -------------------------------------------------------------------------------
const GOLD = mix(P.cream, P.yellow, 0.3);
const GOLD_D = mix(P.yellow, P.tanShade, 0.5);
const REG = [P.black, mix(P.black, P.slate, 0.5), P.slate, mix(P.slate, P.steel, 0.5), P.steel, mix(P.steel, P.fog, 0.5), P.fog];
const EARTH_SEA = [mix(P.black, P.navy, 0.4), P.navy, mix(P.navy, P.steel, 0.4), mix(P.navy, P.fog, 0.45)];
const EARTH_LAND = [mix(P.black, P.darkGreen, 0.4), mix(P.darkGreen, P.tanShade, 0.45), mix(P.tan, P.steel, 0.4)];
const CLOUD = [mix(P.slate, P.fog, 0.4), P.fog, P.silver, P.white];
const MOONLIT = mix(P.silver, P.fog, 0.35);
const EARTHLIT = mix(P.fog, P.navy, 0.25);
const LAMPLIT = mix(P.tanShade, P.yellow, 0.35);

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
const earthArt = lazyBy((r) => {
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
});

/** The full moon seen from Earth: silver with darker maria and a soft limb. */
const moonArt = lazyBy((r) => {
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
});

// stars as flat typed arrays (no per-frame destructuring)
const NSTAR = 44;
const SX = new Int16Array(NSTAR);
const SY = new Int16Array(NSTAR);
const SB = new Float32Array(NSTAR);
for (let i = 0; i < NSTAR; i++) {
  SX[i] = floor(hash(i * 3.7) * W);
  SY[i] = floor(hash(i * 9.1) * 150);
  SB[i] = hash(i * 5.3);
}
function stars(ctx, ox = 0, oy = 0, a = 1, maxY = 216) {
  for (let i = 0; i < NSTAR; i++) {
    const sx = (((SX[i] - ox) % W) + W) % W;
    const sy = SY[i] - oy;
    if (sy < 0 || sy > maxY) continue;
    ctx.globalAlpha = a * (0.35 + SB[i] * 0.5);
    rect(ctx, sx, sy, 1, 1, SB[i] > 0.85 ? P.white : P.fog);
  }
  ctx.globalAlpha = 1;
}

// --- S1: a city balcony, the full moon -------------------------------------------------------
const citySet = lazy(() =>
  bake('se-city', 420, 260, function* paint(c) {
    yield* shadeSteps(c, 0, 0, 420, 260, [P.black, mix(P.black, P.navy, 0.45), mix(P.navy, P.ink, 0.5), mix(P.navy, P.slate, 0.4)], (x, y) => clamp((y - 20) / 230) * 0.9 + clamp(1 - sqrt(((x - 330) / 160) ** 2 + ((y - 60) / 120) ** 2)) * 0.25);
    // towers, far to near; sparse warm windows (static)
    const layers = [
      { base: 196, h: [40, 70], col: mix(P.ink, P.navy, 0.5), win: 0.08 },
      { base: 214, h: [56, 104], col: mix(P.black, P.ink, 0.6), win: 0.12 },
    ];
    for (let li = 0; li < layers.length; li++) {
      const L = layers[li];
      let x = -4;
      let k = li * 100;
      while (x < 420) {
        const w = 18 + floor(hash(k) * 26);
        const h = L.h[0] + floor(hash(k + 1) * (L.h[1] - L.h[0]));
        const top = L.base - h + 40;
        rect(c, x, top, w - 2, 260 - top, L.col);
        rect(c, x + w - 3, top, 1, 260 - top, mix(L.col, P.steel, 0.25)); // moonlit edge
        if (hash(k + 2) > 0.6) rect(c, x + floor(w / 2) - 1, top - 8, 1, 8, L.col);
        for (let wy = top + 4; wy < 250; wy += 5) {
          for (let wx = x + 3; wx < x + w - 5; wx += 4) {
            if (hash(wx * 7.1 + wy * 3.3) < L.win) rect(c, wx, wy, 2, 2, mix(P.yellow, li ? P.orange : P.navy, 0.45));
          }
        }
        x += w;
        k += 3;
      }
      yield;
    }
  }));
const moonGlow = lazy(() => pool('se-moonglow', 64, 64, P.silver, 6, 0.16));

// Her back at the rail: the head lifted a little to the moon, a low chignon,
// bare shoulders and a low-backed dress. Moonlight from the upper right rims
// the silhouette exactly on its edge.
const BACK_W = 160;
const BACK_H = 150;
const SKIN_N = mix(P.ink, P.tanShade, 0.24);
const DRESS_N = mix(P.black, P.darkGreen, 0.2);
const ladyBack = lazy(() =>
  rimArt(
    'se-lady-back',
    BACK_W,
    BACK_H,
    (c) => {
      const hx = 80;
      // sloping shoulders and the bare back, shoulder blades as soft darker planes
      begin();
      pt(hx - 9, 56);
      pt(hx - 22, 66);
      pt(hx - 40, 74);
      pt(hx - 50, 86);
      pt(hx - 54, 104);
      pt(hx - 55, BACK_H);
      pt(hx + 55, BACK_H);
      pt(hx + 54, 104);
      pt(hx + 50, 86);
      pt(hx + 40, 74);
      pt(hx + 22, 66);
      pt(hx + 9, 56);
      fill(c, SKIN_N);
      ellipse(c, hx - 22, 104, 11, 15, mix(SKIN_N, P.black, 0.3));
      ellipse(c, hx + 22, 104, 11, 15, mix(SKIN_N, P.black, 0.3));
      rect(c, hx, 80, 1, 44, mix(SKIN_N, P.black, 0.35)); // the spine
      // the dress: a low back, two thin straps
      begin();
      pt(hx - 54, 122);
      pt(hx - 26, 128);
      pt(hx, 134);
      pt(hx + 26, 128);
      pt(hx + 54, 122);
      pt(hx + 55, BACK_H);
      pt(hx - 55, BACK_H);
      fill(c, DRESS_N);
      line(c, hx - 28, 70, hx - 33, 124, DRESS_N);
      line(c, hx + 28, 70, hx + 33, 124, DRESS_N);
      // a slim neck
      begin();
      pt(hx - 8, 36);
      pt(hx + 8, 36);
      pt(hx + 10, 60);
      pt(hx - 10, 60);
      fill(c, SKIN_N);
      // the hair: swept up from the nape into a full chignon (it breaks the
      // skull's outline at the back, so the rim draws it), a few loose wisps
      begin();
      for (let i = 0; i <= 28; i++) {
        const a2 = (i / 28) * PI * 2;
        pt(hx + cos(a2) * 17, 22 + sin(a2) * 20);
      }
      fill(c, P.black);
      ellipse(c, hx + 1, 40, 14, 10, P.black);
      ellipse(c, hx - 4, 36, 9, 7, mix(P.black, P.maroon, 0.25));
      line(c, hx - 7, 46, hx - 10, 58, P.black);
      line(c, hx - 10, 58, hx - 9, 61, P.black);
      line(c, hx + 8, 46, hx + 11, 56, P.black);
      // the comb's soft sheen across the crown
      for (let i = 0; i < 4; i++) line(c, hx - 10 + i * 5, 10 + i, hx - 4 + i * 4, 30, mix(P.black, P.slate, 0.3));
    },
    { rim: MOONLIT, rim2: mix(P.slate, P.steel, 0.4), dirs: [[1, 0], [0, -1], [1, -1]] },
  ));

function shotCity(ctx, lt) {
  const camY = track(lt, [[0, 30], [4.8, 0, 'smooth']]);
  const camX = track(lt, [[0, 0], [4.8, 14, 'smooth']]);
  ctx.drawImage(citySet(), -round(camX * 0.4), -round(camY * 0.5));
  // the moon rises over the towers
  const my = 70 + track(lt, [[0, 20], [4.8, 0, 'smooth']]) - camY * 0.3;
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(moonGlow(), 296 - 64 - round(camX * 0.2), round(my) - 64);
  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(moonArt(22), 296 - 23 - round(camX * 0.2), round(my) - 23);
  ctx.save();
  ctx.translate(-round(camX), -round(camY));
  // her silhouette; she lifts her head a pixel towards the moon
  const lift = round(track(lt, [[0.6, 0], [3.0, 1, 'inOut']]));
  ctx.drawImage(ladyBack(), 38, 128 - lift);
  rect(ctx, 38 + 97, 128 - lift + 36, 1, 3, P.silver); // a drop earring catching the moon
  // the balcony: a glass panel (a faint wash) and a steel handrail across her
  ctx.globalAlpha = 0.16;
  rect(ctx, 0, 222, 430, 70, P.fog);
  ctx.globalAlpha = 1;
  rect(ctx, 0, 220, 430, 2, P.steel);
  rect(ctx, 0, 220, 430, 1, P.silver);
  ctx.restore();
  vignette(ctx, 0.6);
}

// --- S2: the lunar horizon, the Earth rising over craters ---------------------------------------
// Craters (x, y, r) on a foreshortened plain, lit by a low sun from the left: the
// inner wall facing the sun is in shadow, the far wall bright, the rim catches
// the light and throws a long shadow to the right.
const CRATERS = [[70, 196, 48], [214, 176, 22], [300, 200, 34], [150, 162, 12], [356, 168, 14], [26, 170, 9], [262, 158, 8], [118, 206, 10]];
const BOULDERS = [[180, 188, 3], [192, 192, 2], [240, 204, 4], [96, 176, 2], [330, 182, 3], [12, 206, 3], [276, 172, 2]];
function plainV(x, y, hill, seed) {
  let v = 0.66 - (y - hill) * 0.004 + 0.07 * fbm(x * 0.09, y * 0.3, seed) + 0.05 * (hash(x * 13.1 + y * 7.7) - 0.5);
  for (let i = 0; i < CRATERS.length; i++) {
    const [cx, cy, r] = CRATERS[i];
    const k = 0.28;
    const dx = (x - cx) / r;
    const dy = (y - cy) / (r * k);
    const d = sqrt(dx * dx + dy * dy);
    if (d < 1) v += -0.32 + 0.5 * dx * (1 - abs(dy) * 0.3) - 0.08 * (1 - d);
    else if (d < 1.22) v += 0.12 - 0.22 * dx;
    else if (dx > 0.9 && abs(dy) < 1 && dx < 3.4) v -= 0.3 * (1 - (dx - 0.9) / 2.5) * (1 - abs(dy));
  }
  for (let i = 0; i < BOULDERS.length; i++) {
    const [bx, by, r] = BOULDERS[i];
    const dx = (x - bx) / r;
    const dy = (y - by) / r;
    const d = dx * dx + dy * dy;
    if (d < 1) v += 0.3 - 0.6 * (dx + 1) * 0.5;
    else if (dx > 0.6 && abs(dy) < 0.7 && dx < 5) v -= 0.25 * (1 - dx / 5);
  }
  return clamp(v);
}
const horizonSet = lazy(() =>
  bake('se-horizon', W, H, function* paint(c) {
    yield* shadeSteps(c, 0, 132, W, H - 132, REG, (x, y) => {
      const hill = 140 + 6 * sin(x * 0.012 + 1) + 3 * sin(x * 0.05) + 2 * fbm(x * 0.05, 0, 9);
      if (y < hill) return -1;
      return plainV(x, y, hill, 3);
    });
  }));

function shotLuna(ctx, lt) {
  rect(ctx, 0, 0, W, H, P.black);
  stars(ctx, 0, 0, 0.8, 140);
  // the Earth rises at the moon's place in the frame (the match cut)
  const ey = track(lt, [[0, 168], [3.6, 98, 'smooth']]);
  ctx.drawImage(earthArt(26), 296 - 28, round(ey) - 28);
  ctx.drawImage(horizonSet(), 0, 0);
  vignette(ctx, 0.5);
}

// --- S3: the residence on the Sea of Serenity ----------------------------------------------
const plainSet = lazy(() =>
  bake('se-plain', 430, H, function* paint(c) {
    rect(c, 0, 0, 430, H, P.black);
    yield* shadeSteps(c, 0, 120, 430, H - 120, REG, (x, y) => {
      const hill = 128 + 10 * sin(x * 0.01) + 4 * sin(x * 0.037 + 2);
      if (y < hill) return -1;
      const glow = clamp(1 - sqrt(((x - 250) / 120) ** 2 + ((y - 156) / 24) ** 2));
      return clamp(plainV((x * 0.9 + 30) % 384, y, hill, 5) * 0.75 + glow * 0.3 - 0.08);
    });
    // footprints from the left to the door
    for (let i = 0; i < 26; i++) {
      const x = 60 + i * 7;
      const y = 186 - i * 1.0 + (i & 1 ? 2 : 0);
      rect(c, x, round(y), 2, 1, mix(P.slate, P.black, 0.4));
    }
    // the rover, parked, with its long shadow
    c.globalAlpha = 0.5;
    rect(c, 80, 176, 40, 2, P.black);
    c.globalAlpha = 1;
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
  }));
const housePool = lazy(() => pool('se-housepool', 110, 22, P.yellow, 6, 0.22));
const residenceArt = lazy(() =>
  bake('se-residence', 190, 60, function* paint(c) {
    // flat roof slab, glass front glowing warm, slender columns
    rect(c, 0, 4, 190, 6, P.fog);
    rect(c, 0, 4, 190, 1, P.silver);
    rect(c, 0, 9, 190, 1, P.steel);
    yield* shadeSteps(c, 8, 10, 174, 40, [mix(P.tanShade, P.brown, 0.4), P.tanShade, mix(P.tan, P.yellow, 0.3), mix(P.cream, P.yellow, 0.3)], (x, y) => 0.45 + 0.4 * sin(((x - 8) / 174) * PI) - (y - 10) * 0.004);
    // interior silhouettes: a floor lamp, a lounger, a table, a standing figure
    rect(c, 40, 22, 1, 28, mix(P.brown, P.black, 0.3));
    ellipse(c, 40, 22, 4, 2, P.cream);
    begin();
    pt(56, 50);
    pt(58, 42);
    pt(78, 44);
    pt(90, 36);
    pt(92, 40);
    pt(82, 50);
    fill(c, mix(P.brown, P.black, 0.35));
    rect(c, 112, 42, 20, 2, mix(P.brown, P.black, 0.4));
    rect(c, 121, 44, 2, 6, mix(P.brown, P.black, 0.4));
    ellipse(c, 150, 25, 2, 2, mix(P.brown, P.black, 0.4));
    begin();
    pt(148, 27);
    pt(152, 27);
    pt(154, 40);
    pt(156, 50);
    pt(145, 50);
    pt(147, 40);
    fill(c, mix(P.brown, P.black, 0.4));
    for (const x of [8, 66, 124, 181]) rect(c, x, 10, 2, 40, P.steel);
    // plinth / terrace
    rect(c, 0, 50, 190, 4, P.steel);
    rect(c, 0, 50, 190, 1, P.fog);
    rect(c, 0, 54, 190, 3, P.slate);
  }));

function shotHouse(ctx, lt) {
  const camX = track(lt, [[0, 0], [4.2, 30, 'smooth']]);
  ctx.drawImage(plainSet(), -round(camX), 0);
  stars(ctx, camX * 0.2, 0, 0.7, 120);
  ctx.drawImage(earthArt(16), 88 - round(camX * 0.15), 30);
  ctx.save();
  ctx.translate(-round(camX), 0);
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(housePool(), 250 - 110, 140);
  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(residenceArt(), 158, 104);
  ctx.restore();
  superTitle(ctx, 'MARE SERENITATIS', 24, 192, lt - 0.8, { color: P.silver, rule: GOLD_D, track: 2 });
  vignette(ctx, 0.5);
}

// --- S4: inside: by the great window, a glass in her hand ------------------------------------
const loungeSet = lazy(() =>
  bake('se-lounge', 410, H, function* paint(c) {
    // warm wall at the left, the great window on the right two thirds
    yield* shadeSteps(c, 0, 0, 410, 170, [P.black, mix(P.black, P.maroon, 0.5), P.maroon, mix(P.maroon, P.brown, 0.5), P.brown], (x, y) => clamp(1 - sqrt(((x - 40) / 180) ** 2 + ((y - 100) / 140) ** 2)) * 0.9);
    rect(c, 120, 0, 290, 170, P.black);
    // the lunar plain through the glass, raking light, a crater or two
    yield* shadeSteps(c, 120, 128, 290, 42, REG, (x, y) => {
      const hill = 140 + 5 * sin(x * 0.02);
      return y < hill ? -1 : clamp(plainV(x - 60, y + 30, hill + 30, 7) * 0.8);
    });
    // the room's lamp reflected faintly in the glass
    c.globalAlpha = 0.18;
    rect(c, 150, 40, 2, 70, LAMPLIT);
    ellipse(c, 151, 38, 8, 4, mix(P.cream, P.yellow, 0.3));
    c.globalAlpha = 1;
    // mullions and frame
    for (const x of [120, 216, 312, 408]) rect(c, x, 0, 3, 170, mix(P.black, P.slate, 0.4));
    rect(c, 120, 0, 290, 3, mix(P.black, P.slate, 0.4));
    // floor: dark timber with the lamp's warmth and the window's cool sheen, a rug
    yield* shadeSteps(c, 0, 170, 410, H - 170, [P.black, mix(P.black, P.maroon, 0.6), P.maroon, mix(P.maroon, P.brown, 0.5), mix(P.steel, P.maroon, 0.5)], (x, y) => {
      const warm = clamp(1 - sqrt(((x - 40) / 150) ** 2 + ((y - 176) / 40) ** 2));
      const cool = 0.25 * clamp(1 - abs(x - 260) / 140) * clamp(1 - (y - 170) / 30);
      return clamp(0.18 + warm * 0.6 + cool + 0.03 * sin(y * 1.7));
    });
    rect(c, 0, 170, 410, 1, mix(P.brown, P.tanShade, 0.4));
    begin();
    pt(70, 186);
    pt(330, 184);
    pt(360, 210);
    pt(40, 212);
    fill(c, mix(P.slate, P.maroon, 0.55), { d: mix(P.ink, P.maroon, 0.5), f: 0.15, m: 1, l: mix(P.steel, P.maroon, 0.4), lf: 0.1, side: 1 });
    // a floor lamp at the left
    rect(c, 44, 70, 2, 100, mix(P.tanShade, P.yellow, 0.3));
    begin();
    pt(32, 70);
    pt(36, 56);
    pt(54, 56);
    pt(58, 70);
    fill(c, mix(P.cream, P.yellow, 0.25), { d: mix(P.tan, P.yellow, 0.2), f: 0.3, m: 1, side: 1 });
    // a low chaise in front of the window: dark against the plain, warm rim from the lamp
    begin();
    pt(132, 172);
    pt(136, 156);
    pt(176, 160);
    pt(204, 146);
    pt(212, 148);
    pt(196, 166);
    pt(198, 176);
    fill(c, mix(P.black, P.maroon, 0.3), { d: P.black, f: 0.5, m: 1, l: LAMPLIT, lf: 0, lm: 1, side: 1 });
    rect(c, 140, 176, 2, 6, P.black);
    rect(c, 192, 176, 2, 6, P.black);
    // a side table with a bottle in an ice bucket
    rect(c, 92, 150, 22, 2, mix(P.brown, P.black, 0.2));
    rect(c, 102, 152, 2, 22, mix(P.brown, P.black, 0.3));
    rect(c, 96, 140, 12, 10, mix(P.steel, P.slate, 0.4));
    rect(c, 96, 140, 2, 10, P.fog);
    rect(c, 100, 126, 4, 14, mix(P.darkGreen, P.black, 0.4));
    rect(c, 101, 122, 2, 4, GOLD_D);
  }));
const lampPool = lazy(() => pool('se-lamppool', 90, 80, P.yellow, 6, 0.16));

// Her, in profile facing the window: a long evening dress, the chignon, the
// earthlight rimming her front, the lamp a warmer rim on her back.
const PRO_W = 70;
const PRO_H = 160;
const ladyProfile = lazy(() =>
  rimArt(
    'se-lady-profile',
    PRO_W,
    PRO_H,
    (c) => {
      const cx = 30;
      // the dress from the bust to the floor, flaring a little at the hem
      begin();
      pt(cx - 7, 34);
      pt(cx + 8, 34);
      pt(cx + 12, 44);
      pt(cx + 11, 54);
      pt(cx + 7, 64);
      pt(cx + 8, 82);
      pt(cx + 13, 120);
      pt(cx + 22, PRO_H);
      pt(cx - 16, PRO_H);
      pt(cx - 11, 120);
      pt(cx - 9, 82);
      pt(cx - 11, 62);
      pt(cx - 12, 44);
      fill(c, DRESS_N);
      // bare shoulder and upper arm (the far arm is behind her)
      begin();
      pt(cx - 7, 31);
      pt(cx + 5, 29);
      pt(cx + 7, 36);
      pt(cx + 4, 58);
      pt(cx - 2, 60);
      pt(cx - 5, 38);
      fill(c, SKIN_N);
      // the neck
      begin();
      pt(cx - 4, 18);
      pt(cx + 3, 18);
      pt(cx + 4, 32);
      pt(cx - 5, 32);
      fill(c, SKIN_N);
      // the head in profile, facing right: brow, nose, lips, chin (22 px)
      begin();
      pt(cx - 8, 4);
      pt(cx - 3, 0);
      pt(cx + 4, 0);
      pt(cx + 8, 3);
      pt(cx + 9, 8);
      pt(cx + 12, 11);
      pt(cx + 10, 13);
      pt(cx + 11, 15);
      pt(cx + 10, 17);
      pt(cx + 9, 19);
      pt(cx + 6, 22);
      pt(cx + 1, 22);
      pt(cx - 4, 18);
      pt(cx - 8, 12);
      fill(c, SKIN_N);
      // the hair swept back over the crown into a chignon behind
      begin();
      pt(cx - 9, 13);
      pt(cx - 9, 4);
      pt(cx - 4, -0.5);
      pt(cx + 4, -0.5);
      pt(cx + 8, 3);
      pt(cx + 3, 3);
      pt(cx - 2, 8);
      pt(cx - 4, 14);
      fill(c, P.black);
      ellipse(c, cx - 11, 10, 5, 5, P.black);
    },
    { rim: EARTHLIT, rim2: mix(P.slate, P.navy, 0.3), dirs: [[1, 0], [1, -1]], rimB: mix(LAMPLIT, P.maroon, 0.3), dirsB: [[-1, 0]] },
  ));
const SH_ARM = { d: mix(SKIN_N, P.black, 0.3), f: 0.4, m: 1, r: EARTHLIT, side: 1 };
const K_SIP = [[0, 0], [1.4, 0], [2.2, 1, 'inOut'], [3.0, 1], [3.7, 0, 'inOut']];

function flute(ctx, x, y, a = 1, k = 1) {
  ctx.globalAlpha = a;
  rect(ctx, x - 1, y - 7 * k, 3 * k, 6 * k, mix(GOLD, P.fog, 0.3));
  rect(ctx, x - 1, y - 7 * k, 1, 6 * k, P.white);
  rect(ctx, x, y - 1, 1, 4 * k, P.fog);
  rect(ctx, x - 1, y + 3 * k, 3 * k, 1, P.fog);
  ctx.globalAlpha = 1;
}

function shotLounge(ctx, lt) {
  const camX = track(lt, [[0, 0], [4.0, 18, 'smooth']]);
  ctx.drawImage(loungeSet(), round(camX * 0.6), 0, W, H, 0, 0, W, H);
  // the Earth, framed by the window
  stars(ctx, camX * 0.3, 0, 0.6, 120);
  ctx.drawImage(earthArt(30), 334 - 32 - round(camX * 0.3), 38);
  for (const x of [216, 312]) rect(ctx, x - round(camX * 0.6), 0, 3, 170, mix(P.black, P.slate, 0.4));
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(lampPool(), -46 - round(camX * 0.6), 40);
  ctx.globalCompositeOperation = 'source-over';
  // her, at the window; the near arm lifts the glass to her lips and lowers it
  const ox = 238 - round(camX);
  const oy = 44;
  const sip = track(lt, K_SIP);
  ctx.drawImage(ladyProfile(), ox, oy);
  const ex = ox + 31;
  const ey = oy + 58;
  const hx = lerp(ex + 13, ex + 12, sip);
  const hy = lerp(ey + 10, oy + 26, sip);
  capsule(ctx, ex, ey, hx, hy, 2.6, 2, SKIN_N, SH_ARM);
  flute(ctx, round(hx + 1), round(hy - 3));
  vignette(ctx, 0.5);
}

// --- S5: the glass, raised to the Earth ---------------------------------------------------------
const toastSet = lazy(() =>
  bake('se-toast', W, H, function* paint(c) {
    rect(c, 0, 0, W, H, P.black);
    yield* shadeSteps(c, 0, 150, W, 66, REG, (x, y) => {
      const hill = 158 + 4 * sin(x * 0.018 + 0.5);
      return y < hill ? -1 : clamp(plainV(x * 0.7, y + 10, hill + 10, 8) * 0.85);
    });
    // the window frame, and her shoulder and chignon out of focus in the foreground
    rect(c, W - 3, 0, 3, H, mix(P.black, P.slate, 0.4));
    begin();
    pt(0, 40);
    pt(30, 46);
    pt(52, 70);
    pt(60, 110);
    pt(84, 150);
    pt(110, 216);
    pt(0, 216);
    fill(c, mix(P.black, P.maroon, 0.2));
    ellipse(c, 22, 52, 22, 18, P.black);
    yield* soften(c, 140, H, 4, { passes: 2 });
  }));
const STEM = { d: mix(P.fog, P.slate, 0.4), f: 0.4, m: 1, side: 1 };
const SKIN_W = { base: mix(P.skin, P.tan, 0.35), d: mix(P.skinShade, P.tanShade, 0.5), dd: mix(P.tanShade, P.brown, 0.5), l: mix(P.skin, P.cream, 0.4) };
const SH_SKIN_W = { d: SKIN_W.d, f: 0.3, m: 1, dd: SKIN_W.dd, df: 0.1, l: SKIN_W.l, lf: 0.12, lm: 1, r: EARTHLIT, side: 1 };
const SH_FING_W = { d: SKIN_W.d, f: 0.35, m: 1, r: EARTHLIT, side: 1 };
const K_RAISE = [[0.3, 0], [2.4, 1, 'inOut']];
const K_CLINK = [[2.6, 0], [3.0, 1, 'out'], [3.5, 0.6, 'inOut']];

/** A hand holding a champagne flute by its stem (close insert): base of the stem at (x, y). */
function toastHand(ctx, x, y, lt) {
  // the forearm rising from the bottom left, tapering to the wrist (lamp-warm on
  // its left, the earthlight rimming its right edge)
  begin();
  pt(x - 66, y + 96);
  pt(x - 40, y + 8);
  pt(x - 30, y - 6);
  pt(x - 20, y + 4);
  pt(x - 28, y + 22);
  pt(x - 36, y + 96);
  fill(ctx, SKIN_W.base, SH_SKIN_W);
  line(ctx, x - 37, y + 30, x - 44, y + 60, SKIN_W.d); // the forearm's soft muscle plane
  // the back of the hand, from the wrist to the knuckles
  begin();
  pt(x - 34, y - 2);
  pt(x - 26, y - 16);
  pt(x - 16, y - 19);
  pt(x - 13, y - 4);
  pt(x - 15, y + 6);
  pt(x - 24, y + 10);
  fill(ctx, SKIN_W.base, SH_SKIN_W);
  line(ctx, x - 25, y - 12, x - 17, y - 14, SKIN_W.l); // knuckle ridge catching the lamp
  // the flute: a slim bowl of champagne, the stem, the foot
  const bowlTop = y - 60;
  const bowlBot = y - 20;
  begin();
  pt(x - 6, bowlTop);
  pt(x + 6, bowlTop);
  pt(x + 5, bowlBot - 6);
  pt(x + 2, bowlBot);
  pt(x - 2, bowlBot);
  pt(x - 5, bowlBot - 6);
  fill(ctx, mix(P.black, P.navy, 0.35));
  begin();
  pt(x - 5, bowlTop + 9);
  pt(x + 5, bowlTop + 9);
  pt(x + 4.5, bowlBot - 6);
  pt(x + 1.5, bowlBot - 1);
  pt(x - 1.5, bowlBot - 1);
  pt(x - 4.5, bowlBot - 6);
  fill(ctx, mix(GOLD, P.tanShade, 0.35), { d: mix(GOLD_D, P.brown, 0.3), f: 0.3, m: 1, l: GOLD, lf: 0.2, lm: 1, side: 1 });
  rect(ctx, x - 5, bowlTop + 9, 10, 1, mix(GOLD, P.white, 0.4));
  // bubbles rising in two fine lines from the bottom of the bowl
  for (let i = 0; i < 6; i++) {
    const q = (lt * (0.45 + (i % 3) * 0.12) + hash(i * 3.3)) % 1;
    const by = lerp(bowlBot - 3, bowlTop + 10, q);
    const bx = x - 2 + (i % 2) * 3 + round(sin(q * 9 + i) * 0.5);
    rect(ctx, bx, round(by), 1, 1, mix(P.cream, P.white, 0.5));
  }
  // the glass: edges catching the earthlight, a tall highlight, the Earth's tiny reflection
  line(ctx, x - 6, bowlTop, x - 5, bowlBot - 6, mix(P.fog, P.silver, 0.4));
  line(ctx, x + 6, bowlTop, x + 5, bowlBot - 6, EARTHLIT);
  rect(ctx, x + 3, bowlTop + 2, 1, 15, P.white);
  rect(ctx, x - 7, bowlTop, 14, 1, P.silver);
  rect(ctx, x + 1, bowlTop + 13, 2, 2, mix(P.navy, P.fog, 0.4));
  capsule(ctx, x, bowlBot, x, y, 1, 1, P.fog, STEM);
  ellipse(ctx, x, y + 1, 7, 1.6, P.fog, STEM);
  // the thumb presses the stem from behind, the three fingers wrap in front of
  // it, the little finger tucks beneath the foot; each finger outlined so it reads
  capsule(ctx, x - 16, y - 16, x - 3, y - 25, 3.2, 2.4, SKIN_W.dd);
  capsule(ctx, x - 16, y - 16, x - 3, y - 25, 2.6, 1.9, SKIN_W.base, SH_FING_W);
  rect(ctx, x - 4, y - 26, 1, 1, SKIN_W.l);
  for (let i = 0; i < 3; i++) {
    const fy = y - 13 + i * 5;
    capsule(ctx, x - 16, fy, x + 3, fy + 1, 3.1, 2.7, SKIN_W.dd);
    capsule(ctx, x - 16, fy, x + 3, fy + 1, 2.5, 2.1, SKIN_W.base, SH_FING_W);
    rect(ctx, x - 13, fy - 1, 1, 1, SKIN_W.l); // knuckle
    rect(ctx, x + 2, fy, 1, 1, mix(SKIN_W.l, P.white, 0.3)); // nail
  }
  capsule(ctx, x - 14, y + 3, x - 3, y + 5, 2.6, 2.1, SKIN_W.dd);
  capsule(ctx, x - 14, y + 3, x - 3, y + 5, 2, 1.6, SKIN_W.base, SH_FING_W);
  // a fine bracelet at the wrist
  line(ctx, x - 38, y + 6, x - 26, y + 14, mix(GOLD, P.white, 0.2));
  line(ctx, x - 38, y + 7, x - 27, y + 15, GOLD_D);
}

function shotToast(ctx, lt) {
  ctx.drawImage(toastSet(), 0, 0);
  stars(ctx, 40, 0, 0.6, 150);
  ctx.drawImage(earthArt(44), 270 - 46, 30);
  // the glass rises into the earthlight, then a small lift: a toast
  const r = track(lt, K_RAISE);
  const c = track(lt, K_CLINK);
  const x = round(lerp(178, 196, r));
  const y = round(lerp(300, 150, r) - c * 4);
  toastHand(ctx, x, y, lt);
  vignette(ctx, 0.55);
}

// --- S6: end slate: the wordmark in the black sky over the lunar horizon -------------------------
const slateSet = lazy(() =>
  bake('se-slate', W, H, function* paint(c) {
    rect(c, 0, 0, W, H, P.black);
    yield* shadeSteps(c, 0, 150, W, 66, REG, (x, y) => {
      const hill = 166 + 4 * sin(x * 0.015 + 2) + 2 * sin(x * 0.06);
      return y < hill ? -1 : clamp(plainV(x, y + 20, hill + 20, 11) * 0.7);
    });
    // the residence, tiny and warm, on the horizon at the right
    rect(c, 300, 160, 26, 1, P.fog);
    rect(c, 301, 161, 24, 4, mix(P.tan, P.yellow, 0.4));
    rect(c, 300, 165, 26, 1, P.steel);
  }));

const LEGAL = 'Atmosphere not included. The Earth is visible from every room, and nothing can be done.';

function shotSlate(ctx, lt) {
  ctx.drawImage(slateSet(), 0, 0);
  stars(ctx, 10, 0, 0.5, 150);
  ctx.drawImage(earthArt(16), 74 - 18, 120);
  const cx = 212;
  ctx.globalAlpha = smooth((lt - 0.2) / 0.9);
  thin(ctx, 'SERENE', cx, 50, { color: GOLD, style: 'didone', track: 8, scale: 2, align: 'center' });
  ctx.globalAlpha = 1;
  const rw = round(50 * smooth((lt - 0.7) / 0.8));
  if (rw > 0) rect(ctx, cx - rw, 76, rw * 2, 1, GOLD_D);
  ctx.globalAlpha = smooth((lt - 0.9) / 0.7);
  tracked(ctx, 'LUNAR RETREATS  ·  MARE SERENITATIS', cx, 82, { color: P.silver, font: 'micro', track: 2, align: 'center' });
  ctx.globalAlpha = smooth((lt - 1.3) / 0.7);
  tracked(ctx, 'BY APPOINTMENT ONLY', cx, 100, { color: mix(GOLD, P.fog, 0.4), font: 'micro', track: 3, align: 'center' });
  ctx.globalAlpha = 1;
  // one glint crosses the residence's glass (the slate's only motion)
  const g = prog(lt, 1.6, 2.6);
  if (g > 0 && g < 1) {
    ctx.globalAlpha = sin(g * PI) * 0.8;
    rect(ctx, 301 + round(g * 22), 161, 2, 4, P.white);
    ctx.globalAlpha = 1;
  }
  smallPrint(ctx, LEGAL, 196, { color: P.fog, a: smooth((lt - 0.4) / 0.5) });
}

const SHOTS = [
  { at: 0, draw: shotCity, tr: 'black', td: 1.2 },
  { at: T_LUNA, draw: shotLuna },
  { at: T_HOUSE, draw: shotHouse, tr: 'dissolve', td: 0.8 },
  { at: T_LOUNGE, draw: shotLounge, tr: 'dip', td: 0.5 },
  { at: T_TOAST, draw: shotToast },
  { at: T_SLATE, draw: shotSlate, tr: 'dip', td: 1.0 },
];

// Ethereal: celesta (decaying pulse), harp arpeggios, a sine pad, low sine bass.
// F lydian colours (Fmaj7#11), 60 bpm: chords change on the cuts.
const CELESTA = { wave: 'sine', a: 0.002, d: 1.4, s: 0, r: 0.9, vib: false };
const HARP = { wave: 'triangle', a: 0.003, d: 1.1, s: 0, r: 0.7, vib: false };
const PAD = { wave: 'sine', a: 0.6, d: 1.2, s: 0.85, r: 1.6, vib: [6, 4, 0.5], legato: 1 };

// Everything this spot bakes, in shot order: prewarmed in idle-time slices so
// no cut ever waits for a bake (see cine.js prewarm).
const WARM = [citySet, moonGlow, ladyBack, horizonSet, plainSet, housePool, residenceArt, loungeSet, lampPool, ladyProfile, toastSet, slateSet, () => moonArt(22), () => earthArt(26), () => earthArt(16), () => earthArt(30), () => earthArt(44), () => vignetteArt(0.6), () => vignetteArt(0.5), () => vignetteArt(0.55)];
prewarm(WARM, 9000);

export default {
  id: 'serene',
  brand: 'SERENE',
  duration: DURATION,
  voice: { gender: 'male', lang: 'en-GB', pitch: 0.85, rate: 0.86 },
  script: [
    { at: 0.6, text: 'Some people dream of getting away from it all.' },
    { at: 5.2, text: 'We took it literally.' },
    { at: 8.7, text: 'Private residences on the Sea of Serenity.' },
    { at: 13.0, text: 'No traffic. No neighbours. No air.' },
    { at: 16.9, text: 'Just you, and a view of everything you left behind.' },
    { at: 22.0, text: 'Serene. Lunar retreats.' },
  ],
  // F lydian, one chord per shot; every track is 27 beats (longer than the spot) and ends in rest
  tune: {
    bpm: 60,
    room: 0.7,
    echo: { beats: 0.75, feedback: 0.3 },
    fadeOut: 2,
    tracks: [
      { kind: 'lead', inst: CELESTA, gain: 0.95, notes: 'R:1 E6:1@0.4 C6:1@0.35 A5:1.4@0.4 B5:1@0.4 G5:1.5@0.35 A5:1@0.4 F5:0.5@0.35 E5:0.5@0.3 D5:1.2@0.35 F5:1@0.35 D5:1@0.3 C5:2.2@0.35 A5:1@0.4 C6:1@0.4 B5:1@0.4 G5:0.8@0.35 A5:1.2@0.4 E6:3@0.45 R:4.7' },
      { kind: 'harmony', inst: HARP, gain: 0.72, notes: 'F2:0.5@0.4 C3:0.5@0.35 E3:0.5@0.35 A3:0.5@0.35 B3:0.5@0.35 A3:0.5@0.3 E3:0.5@0.3 C3:0.5@0.3 E3:0.4@0.3 A2:0.5@0.4 E3:0.5@0.35 G3:0.5@0.35 B3:0.5@0.35 C4:0.5@0.35 E4:0.5@0.35 G3:0.5@0.35 B3:0.5@0.35 D3:0.5@0.4 A3:0.5@0.35 C4:0.5@0.35 E4:0.5@0.35 F4:0.5@0.35 A3:0.5@0.35 C4:0.5@0.35 E4:0.7@0.35 Bb2:0.5@0.4 F3:0.5@0.35 A3:0.5@0.35 D4:0.5@0.35 F4:0.5@0.35 A3:0.5@0.35 D4:0.5@0.35 F4:0.5@0.35 G2:0.5@0.4 D3:0.5@0.35 F3:0.5@0.35 B3:0.5@0.35 D4:0.5@0.35 F3:0.5@0.35 B3:0.5@0.35 D4:0.3@0.35 F2:0.5@0.4 C3:0.5@0.35 G3:0.5@0.35 A3:0.5@0.35 E4:2@0.35 R:2.6' },
      { kind: 'harmony', inst: PAD, gain: 0.34, notes: 'F3+A3+C4+E4:4.4@0.4 A2+C3+E3+G3:4@0.4 D3+F3+A3+C4:4.2@0.4 Bb2+D3+F3+A3:4@0.4 G2+Bb2+D3+F3:3.8@0.4 F3+A3+C4+G4:4@0.45 R:2.6' },
      { kind: 'bass', inst: 'sine', gain: 0.7, notes: 'F1:4.4 A1:4 D2:4.2 Bb1:4 G1:3.8 F1:4 R:2.6' },
    ],
  },
  draw(ctx, t, dt, info) {
    prewarm(WARM);
    film(ctx, dt, info, SHOTS);
  },
};
