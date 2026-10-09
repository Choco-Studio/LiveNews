// GLOBIT 24 for YouTube: the channel avatar (800x800, shown cropped to a circle, down to 48 px) and the channel
// banner (2560x1440; the mobile-safe band is the centre 1546x423, desktop shows the centre 2560x423, TVs the
// whole picture). Both are pixel art drawn at a low grid and enlarged by whole pixels, from the brand of
// public/js/logo.js (the red pixel globe with its seams of light and the yellow "bit", the chrome wordmark, the
// red digital "24", "THE WORLD, PIXEL BY PIXEL") and the channel palette (public/js/palette.js, ENDESGA 32).
//
//   window.brand.avatar()  -> canvas 100x100 (x8 = 800)
//   await window.brand.banner()  -> canvas 640x360 (x4 = 2560x1440)
//   window.brand.scaled(c, k) -> the canvas enlarged k times, nearest neighbour
import { P } from '/js/palette.js';
import { drawLogo, measureLogo } from '/js/logo.js';
import { isLand } from '/js/v2/canvas25d/studio/wall.js';

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x, y) => (BAYER[((y & 3) << 2) | (x & 3)] + 0.5) / 16;
const DEG = Math.PI / 180;
// a seeded generator (the stars sit where they sat last time)
const rnd = (seed) => {
  let s = seed >>> 0 || 1;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
};

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  return [c, g];
}
function px(g, x, y, col) {
  g.fillStyle = col;
  g.fillRect(x, y, 1, 1);
}
function rect(g, x, y, w, h, col) {
  g.fillStyle = col;
  g.fillRect(x, y, w, h);
}

/**
 * The brand globe with the real world on it: an orthographic globe of radius r centred at (cx, cy), tilted, the
 * oceans in the brand red, the land a light red, lit from the upper left in three tones (no gradient: tones and a
 * 4x4 dither on the terminator only), a graticule of 1 px seams of light (the logo's equator and meridians), a
 * black outline. lon0: the meridian facing the viewer.
 */
function globe(g, cx, cy, r, { lon0 = 10, tilt = 18, grid = 30, light = [-0.38, -0.42, 0.82], outline: drawOutline = true, dither = 0.07 } = {}) {
  const ct = Math.cos(tilt * DEG), st = Math.sin(tilt * DEG);
  // the key from the upper left and mostly frontal: the shadow is a curved crescent at the lower right (review
  // r3: a grazing key cut the disc with a straight diagonal); the banner lights it from the right
  const L = (() => {
    const n = Math.hypot(...light);
    return light.map((a) => a / n);
  })();
  const inside = (x, y) => (x - cx + 0.5) ** 2 + (y - cy + 0.5) ** 2 <= r * r;
  // where the land is, pixel by pixel (a first pass): the sea next to it takes a coastline (review r5: light red
  // land on a red sea melted together at 48 px)
  const geo = (x, y) => {
    const nx = (x - cx + 0.5) / r, ny = (y - cy + 0.5) / r;
    const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    const y2 = ny * ct - nz * st, z2 = ny * st + nz * ct;
    const lat = -Math.asin(Math.max(-1, Math.min(1, y2))) / DEG;
    const lon = lon0 + Math.atan2(nx, z2) / DEG;
    return { lat, lon, land: isLand(lat, ((lon + 540) % 360) - 180) };
  };
  const rawAt = new Map();
  const raw = (x, y) => {
    const k = y * 4096 + x;
    if (!rawAt.has(k)) rawAt.set(k, inside(x, y) && geo(x, y).land);
    return rawAt.get(k);
  };
  // no orphan pixels (review r6): a lone sea pixel inside land is land (a lake 1 px wide), a lone land pixel in the
  // sea is sea (an island 1 px wide)
  const landAt = new Map();
  const isLandPx = (x, y) => {
    const k = y * 4096 + x;
    if (!landAt.has(k)) {
      const n = Number(raw(x + 1, y)) + Number(raw(x - 1, y)) + Number(raw(x, y + 1)) + Number(raw(x, y - 1));
      landAt.set(k, inside(x, y) && (raw(x, y) ? n >= 1 : n >= 3));
    }
    return landAt.get(k);
  };
  for (let y = Math.floor(cy - r) - 1; y <= cy + r + 1; y++) {
    for (let x = Math.floor(cx - r) - 1; x <= cx + r + 1; x++) {
      if (!inside(x, y)) {
        // the 1 px black outline round the disc
        if (drawOutline && (inside(x + 1, y) || inside(x - 1, y) || inside(x, y + 1) || inside(x, y - 1))) px(g, x, y, P.black);
        continue;
      }
      const nx = (x - cx + 0.5) / r, ny = (y - cy + 0.5) / r;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      // un-tilt (rotation about the screen x axis: the north tipped towards the viewer, the centre at +tilt
      // latitude), then latitude/longitude
      const y2 = ny * ct - nz * st, z2 = ny * st + nz * ct;
      const lat = -Math.asin(Math.max(-1, Math.min(1, y2))) / DEG;
      const lon = lon0 + Math.atan2(nx, z2) / DEG;
      const land = isLandPx(x, y);
      const lit = nx * L[0] + ny * L[1] + nz * L[2];
      // a narrow dither on each tone's edge only (review r2: a wide one, enlarged 8x, read as hatching)
      const d = bayer(x, y) * dither - dither / 2;
      // three tones each for sea and land, as the logo's globe (R, D; maroon only in the deepest shadow)
      // (review r10: a red sea under light red land lost the continents at 48 px) the sea dark red, red only where
      // the key hits it full, maroon in the deep shadow
      const sea = lit + d > 0.8 ? P.red : lit + d > -0.05 ? P.darkRed : P.maroon;
      // the land a light red (review r4: cream everywhere turned the brand's red globe beige), cream only where
      // the key hits it full
      // (review r8: the cream band was a slab with a checkered diagonal edge; r9: a small cream cap read as a spike
      // on the coast) the land in two tones, as the logo's globe is lit: pink in the light, red in the shadow
      const ground = lit > 0.12 ? P.pink : P.red;
      let col = land ? ground : sea;
      // the coastline: a sea pixel touching land, one tone darker (on the lit side; in the shadow the sea is dark)
      if (!land && lit > 0.12 && (isLandPx(x + 1, y) || isLandPx(x - 1, y) || isLandPx(x, y + 1) || isLandPx(x, y - 1))) col = P.darkRed;
      // the graticule: seams of light (the logo's equator and meridians), drawn as contours (review r7: thresholds
      // gave jagged lines, doubled in places and broken in others): a pixel is on a line when its right or lower
      // neighbour lies across it, so every line is one continuous pixel wide. The equator bright, the parallels
      // at 30 degrees and the meridians every `grid` degrees quieter, the meridians stopping short of the poles,
      // none on the shadow side.
      const cell = (gx, gy) => {
        if (!inside(gx, gy)) return null;
        const q = geo(gx, gy);
        return { b: Math.floor(q.lat / 30), e: q.lat >= 0, m: Math.floor((q.lon + 720) / grid), lat: q.lat };
      };
      const here = cell(x, y);
      const across = [cell(x + 1, y), cell(x, y + 1)].filter(Boolean);
      // the equator, the brand's seam (logo.js GLOBE_L), two pixels: across it on either side
      const eq = [...across, cell(x - 1, y), cell(x, y - 1)].filter(Boolean).some((o) => o.e !== here.e);
      const onLat = !eq && Math.abs(lat) < 65 && across.some((o) => o.b !== here.b);
      const onLon = Math.abs(lat) < 55 && across.some((o) => o.m !== here.m);
      // (review r12: as logo.js GLOBE_L, the seam is white in the light and silver in the shadow)
      if (eq) col = lit > 0.05 ? P.white : P.silver;
      // (review r10: white on land and pink on sea changed tone at every coast; r11: cream made a cage of the
      // globe) one quiet tone for every seam but the equator: red, a line on the land and on the sea alike
      else if ((onLat || onLon) && lit > 0.05) col = P.red;
      px(g, x, y, col);
    }
  }
}

/** The yellow "bit" (logo.js buildMark): a lit square with its shade on two sides and a black outline. */
function bit(g, x, y, s) {
  rect(g, x - 1, y - 1, s + 2, s + 2, P.black);
  rect(g, x, y, s, s, P.yellow);
  rect(g, x, y + s - 1, s, 1, P.orange);
  rect(g, x + s - 1, y, 1, s, P.orange);
  rect(g, x, y, Math.max(1, s >> 2), Math.max(1, s >> 2), P.cream);
}

// the digital "24" of logo.js (9 rows), drawn k pixels per cell
const D24 = {
  2: ['######', '######', '....##', '######', '######', '##....', '##....', '######', '######'],
  4: ['##..##', '##..##', '##..##', '######', '######', '....##', '....##', '....##', '....##'],
};
/** The red "24" badge: white digits on red, a dark red bevel, a black outline. Returns its size. */
function badge24(g, x, y, k = 1, pad = 2 * k) {
  const dw = 6 * k, gap = 2 * k;
  const w = dw * 2 + gap + pad * 2, h = 9 * k + pad * 2;
  rect(g, x - 1, y - 1, w + 2, h + 2, P.black);
  rect(g, x, y, w, h, P.red);
  // lit from the upper left as the globe and the bit are (review r12: a bevel on two sides only read flat)
  rect(g, x, y, w - k, 1, P.pink);
  rect(g, x, y, 1, h - k, P.pink);
  rect(g, x, y + h - k, w, k, P.darkRed);
  rect(g, x + w - k, y, k, h, P.darkRed);
  [2, 4].forEach((d, i) =>
    D24[d].forEach((row, j) => [...row].forEach((ch, c) => ch === '#' && rect(g, x + pad + i * (dw + gap) + c * k, y + pad + j * k, k, k, P.white))),
  );
  return { w, h };
}

/** The avatar: 100x100, everything that matters inside the inscribed circle (YouTube crops to it). */
export function avatar() {
  const [c, g] = canvas(100, 100);
  // the field: the channel's ink, flat, with the studio wall's light as one lighter disc behind the globe (two
  // tones and a dithered seam: no rings, no glow)
  // review r2: everything inside the circle YouTube crops to (radius 50 round the centre; nothing past ~46),
  // the globe and the badge balanced on the centre
  const GX = 45, GY = 44, R = 29;
  for (let y = 0; y < 100; y++) {
    for (let x = 0; x < 100; x++) {
      // (review r3: a flat disc of the wall's light, no dithered ring: an icon, not a glow)
      const d = Math.hypot(x - GX + 0.5, y - GY + 0.5) / R;
      px(g, x, y, d < 1.28 ? P.slate : P.ink);
    }
  }
  globe(g, GX, GY, R, { lon0: 15, tilt: 20, grid: 45 });
  // the bit pops out of the globe's top-right edge (logo.js buildMark): its lower-left corner overlaps the outline
  const ex = GX + R * Math.SQRT1_2, ey = GY - R * Math.SQRT1_2;
  bit(g, Math.round(ex - 2), Math.round(ey - 9 + 2), 9);
  badge24(g, 53, 59, 2, 2);
  return c;
}

const BANNER = { W: 640, H: 360, safe: { x: 127, y: 127, w: 386, h: 106 } };

/**
 * The banner (owner 8 Oct: "un globo mundi a la izquierda con un degradado"): 640x360 (x4). TVs see it all,
 * desktops the band y 127-233, phones the centre of that band (x 127-513). A large globe on the left, lit from the
 * right (towards the name), its brand equator inside the desktop band; behind it a gradient from the deep blue of
 * its atmosphere to the black of space; the wordmark and the slogan on the right, inside the phone's crop.
 */
export async function banner() {
  const { W, H, safe } = BANNER;
  const [c, g] = canvas(W, H);
  const G = { x: 150, y: 168, r: 128 };

  // (review n2: a dithered gradient between the palette's few dark blues read as a dotted texture at 4x) the
  // gradient is drawn smooth at full size under this layer (bannerFull); this layer is the pixel art on top
  // a few stars in the dark half, never near the name
  const r = rnd(24);
  for (let k = 0; k < 70; k++) {
    const x = Math.floor(r() * W), y = Math.floor(r() * H);
    if (Math.hypot(x - G.x, y - G.y) < G.r + 40) continue;
    if (x > 280 && x < 600 && y > safe.y - 6 && y < safe.y + safe.h + 34) continue;
    px(g, x, y, r() < 0.25 ? P.white : r() < 0.6 ? P.silver : P.steel);
  }
  // the atmosphere: a rim round the disc, brighter on the lit side, as rings of whole pixels (review n1: points
  // stepped round the circle left gaps in the line)
  for (let y = G.y - G.r - 6; y <= G.y + G.r + 6; y++) {
    for (let x = G.x - G.r - 6; x <= G.x + G.r + 6; x++) {
      const d = Math.hypot(x - G.x + 0.5, y - G.y + 0.5) - G.r;
      if (d < 0 || d >= 4) continue;
      const lit = Math.cos(Math.atan2(y - G.y, x - G.x) + 0.45);
      if (d < 2) px(g, x, y, lit > 0.15 ? P.cyan : P.blue);
      else if (lit > 0.45 && bayer(x, y) < 0.5) px(g, x, y, P.blue);
    }
  }
  // the globe, lit from the upper right; Africa and Europe facing the name, the equator in the desktop band
  globe(g, G.x, G.y, G.r, { lon0: 20, tilt: 16, grid: 30, light: [0.55, -0.4, 0.73], outline: false, dither: 0 }); // (review n3: no speckle on the coasts at 4x)
  // (owner 8 Oct: no yellow bit on the banner; the avatar keeps it)

  // the wordmark and its "24" (logo.js 'full' at 2x, without its small globe: the big one is the mark here)
  const S = 2;
  const full = measureLogo({ variant: 'full', slogan: false, scale: S });
  const [lc, lg] = canvas(full.w, full.h);
  drawLogo(lg, 0, 0, { variant: 'full', slogan: false, scale: S });
  const WX = 30 * S, WY = 6 * S, WW = full.w - WX, WH = 18 * S; // the wordmark's and the badge's rows (logo.js buildFull)
  // (review n1) the letters' chrome split (logo.js: row 15 of the full logo, the globe's equator) on the line where
  // the big globe's equator meets its edge (y = G.y at the limb): the name continues the equator, as on air
  const SPLIT = 15 * S - WY;
  const tx = Math.round(safe.x + safe.w - 14 - WW), ty = G.y - SPLIT;
  g.drawImage(lc, WX, WY, WW, WH, tx, ty, WW, WH);
  // the slogan, tracked out in silver under the name, as wide as it
  const { drawText, measureText } = await import('/js/font.js');
  const slogan = 'THE WORLD, PIXEL BY PIXEL';
  const plain = measureText(slogan, 1, 'body');
  const gaps = slogan.length - 1;
  const track = Math.max(0, Math.floor((WW - plain) / gaps));
  let sx = tx + Math.floor((WW - (plain + track * gaps)) / 2);
  const sy = ty + WH + 6;
  for (const ch of slogan) {
    drawText(g, ch, sx, sy, { color: P.silver, font: 'body' });
    sx += measureText(ch, 1, 'body') + track;
  }
  // a red rule between the name and the slogan, the brand's line
  rect(g, tx, ty + WH + 2, WW, 1, P.red);
  // TVs see more: the channel airs live around the clock (under the band, right)
  const live = 'LIVE 24/7';
  const lw = measureText(live, 1, 'body') + 8;
  const ly = safe.y + safe.h + 16;
  rect(g, tx - 1, ly - 4, lw + 2, 15, P.black);
  rect(g, tx, ly - 3, lw, 13, P.red);
  drawText(g, live, tx + 4, ly - 1, { color: P.white, font: 'body' });
  drawText(g, 'NEWS · TECH · SPACE · MONEY · WEATHER', tx + lw + 8, ly - 1, { color: P.fog, font: 'body' });
  return c;
}

/**
 * The banner at its real size (2560x1440): a smooth gradient, from the blue of the globe's atmosphere through the
 * channel's navy and ink to the black of space on the right, under the pixel art (banner()) enlarged 4x.
 */
export async function bannerFull() {
  const K = 4, { W, H } = BANNER, G = { x: 150 * K, y: 168 * K, r: 128 * K };
  const [c, g] = canvas(W * K, H * K);
  // the base: ink on the left fading to black on the right
  const lin = g.createLinearGradient(0, 0, W * K, 0);
  lin.addColorStop(0, P.ink);
  lin.addColorStop(0.55, '#1d1c33');
  lin.addColorStop(1, P.black);
  g.fillStyle = lin;
  g.fillRect(0, 0, W * K, H * K);
  // the glow of the atmosphere round the globe: blue at its edge, navy, then nothing
  const rad = g.createRadialGradient(G.x, G.y, G.r, G.x, G.y, G.r + 260 * K);
  rad.addColorStop(0, 'rgba(0,153,219,0.95)');
  rad.addColorStop(0.12, 'rgba(18,78,137,0.85)');
  rad.addColorStop(0.45, 'rgba(38,43,68,0.45)');
  rad.addColorStop(1, 'rgba(24,20,37,0)');
  g.fillStyle = rad;
  g.fillRect(0, 0, W * K, H * K);
  g.imageSmoothingEnabled = false;
  g.drawImage(await banner(), 0, 0, W * K, H * K);
  return c;
}

export function scaled(src, k) {
  const [c, g] = canvas(src.width * k, src.height * k);
  g.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

/** Review sheets (the critique looks at these): the avatar as YouTube shows it, the banner with its crops. */
function preview(which) {
  document.body.innerHTML = '';
  const box = (src, size, circle, smooth = false) => {
    const [c, g] = canvas(size, size);
    g.imageSmoothingEnabled = smooth;
    g.imageSmoothingQuality = 'high';
    if (circle) {
      g.beginPath();
      g.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
      g.clip();
    }
    g.drawImage(src, 0, 0, size, size);
    return c;
  };
  if (which === 'avatar') {
    const a = scaled(avatar(), 8);
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:10px;align-items:center;padding:8px;background:#fff;width:784px';
    row.append(box(a, 300, false), box(a, 300, true));
    const light = document.createElement('div');
    light.style.cssText = 'display:flex;flex-direction:column;gap:8px;align-items:center';
    [88, 48, 32].forEach((s) => light.append(box(a, s, true, true)));
    const dark = document.createElement('div');
    dark.style.cssText = 'display:flex;flex-direction:column;gap:8px;align-items:center;background:#0f0f0f;padding:6px';
    [88, 48, 32].forEach((s) => dark.append(box(a, s, true, true)));
    row.append(light, dark);
    document.body.append(row);
  } else {
    const b = scaled(banner(), 4); // 2560x1440
    const k = 780 / 2560;
    const [c, g] = canvas(780, Math.round(1440 * k));
    g.imageSmoothingEnabled = true;
    g.drawImage(b, 0, 0, c.width, c.height);
    const zone = (w, h, col) => {
      g.strokeStyle = col;
      g.lineWidth = 1;
      g.strokeRect((2560 - w) / 2 * k + 0.5, (1440 - h) / 2 * k + 0.5, w * k, h * k);
    };
    zone(2560, 423, '#2ce8f5'); // desktop
    zone(1546, 423, '#feae34'); // mobile (the safe area)
    document.body.append(c);
    // the mobile crop at its own size, as a phone shows it
    const [m, mg] = canvas(780, Math.round((423 / 1546) * 780));
    mg.imageSmoothingEnabled = true;
    mg.drawImage(b, (2560 - 1546) / 2, (1440 - 423) / 2, 1546, 423, 0, 0, m.width, m.height);
    m.style.marginTop = '6px';
    document.body.append(m);
  }
}

window.brand = { avatar, banner, bannerFull, scaled, preview };
