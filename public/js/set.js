// The studio set: back wall, lighting rig, city windows, the big video wall
// and the anchor desk. Presenters are drawn by anchors.js between drawSet()
// and drawDesk().
import { P } from './palette.js';
import { drawText, measureText, wrapText } from './font.js';
import { r, mulberry32, zoneTime } from './util.js';

export const W = 384;
export const H = 216;
export const DESK_Y = 118;
export const ANCHOR_X = { A: 118, B: 266 };
export const ANCHOR_Y = 80;
export const WALL = { x: 140, y: 18, w: 104, h: 62 };

// Pre-generated skyline so it is stable between frames
const SKYLINE = (() => {
  const rand = mulberry32(42);
  const buildings = [];
  let x = 0;
  while (x < 96) {
    const w = 6 + Math.floor(rand() * 9);
    buildings.push({ x, w, h: 14 + Math.floor(rand() * 34), shade: rand() < 0.5 ? 0 : 1, seed: Math.floor(rand() * 1e6) });
    x += w + (rand() < 0.3 ? 1 : 0);
  }
  return buildings;
})();

const STARS = (() => {
  const rand = mulberry32(7);
  return Array.from({ length: 22 }, () => [Math.floor(rand() * 88), Math.floor(rand() * 30), rand()]);
})();

function skyColors(hour) {
  if (hour >= 8 && hour < 18) return { top: P.blue, bottom: P.cyan, night: false, b: [P.steel, P.slate] };
  if ((hour >= 18 && hour < 21) || (hour >= 6 && hour < 8)) return { top: P.purple, bottom: P.orange, night: false, b: [P.ink, P.maroon] };
  return { top: P.black, bottom: P.navy, night: true, b: [P.ink, P.black] };
}

/** A window onto the city behind the set. */
function drawCityWindow(ctx, x, y, w, h, t, flip) {
  const { h: hour } = zoneTime();
  const sky = skyColors(hour);
  r(ctx, x, y, w, h, sky.top);
  for (let i = 0; i < 4; i++) {
    const bandH = Math.ceil(h / 8);
    r(ctx, x, y + h - bandH * (4 - i), w, bandH, i < 2 ? sky.top : sky.bottom);
  }
  if (sky.night) {
    for (const [sx, sy, p] of STARS) {
      if (sx < w && (Math.sin(t * 2 + p * 20) > -0.6)) r(ctx, x + sx, y + 2 + sy, 1, 1, P.silver);
    }
  } else {
    // a slow cloud
    const cx = x + ((t * 3 + (flip ? 40 : 0)) % (w + 30)) - 20;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    r(ctx, cx, y + 8, 14, 3, P.white);
    r(ctx, cx + 3, y + 6, 7, 2, P.white);
    ctx.restore();
  }
  for (const b of SKYLINE) {
    const bx = flip ? x + w - b.x - b.w : x + b.x;
    if (bx >= x + w || bx + b.w <= x) continue;
    const bw = Math.min(b.w, x + w - bx);
    const by = y + h - b.h;
    r(ctx, bx, by, bw, b.h, sky.b[b.shade]);
    const rand = mulberry32(b.seed + Math.floor(t / 6));
    for (let wy = by + 3; wy < y + h - 2; wy += 4) {
      for (let wx = bx + 2; wx < bx + bw - 1; wx += 3) {
        if (rand() < (sky.night ? 0.45 : 0.15)) r(ctx, wx, wy, 1, 2, sky.night ? P.yellow : P.silver);
      }
    }
  }
  // frame + mullions
  r(ctx, x - 2, y - 2, w + 4, 2, P.steel);
  r(ctx, x - 2, y + h, w + 4, 2, P.steel);
  r(ctx, x - 2, y, 2, h, P.steel);
  r(ctx, x + w, y, 2, h, P.steel);
  r(ctx, x + Math.floor(w / 2), y, 1, h, P.steel);
}

/** Spinning pixel globe. */
export function drawGlobe(ctx, cx, cy, R, t) {
  for (let dy = -R; dy <= R; dy++) {
    const lat = Math.asin(dy / R);
    const cosl = Math.cos(lat);
    const half = Math.floor(Math.sqrt(R * R - dy * dy));
    for (let dx = -half; dx <= half; dx++) {
      const lon = Math.asin(Math.max(-1, Math.min(1, dx / (R * cosl + 0.0001)))) + t * 0.4;
      const n = Math.sin(lon * 3) + Math.sin(lat * 4 + lon * 2) * 0.8 + Math.sin(lon * 7 + lat * 3) * 0.4;
      const land = n > 0.55;
      const edge = dx / R > 0.55 || dy / R > 0.7;
      const c = land ? (edge ? P.darkGreen : P.green) : edge ? P.navy : P.blue;
      r(ctx, cx + dx, cy + dy, 1, 1, c);
    }
  }
  // latitude highlight + polar glint
  r(ctx, cx - Math.floor(R * 0.5), cy - Math.floor(R * 0.6), 2, 2, P.white);
}

export function drawStripes(ctx, x, y, w, h, t, a = P.navy, b = P.ink) {
  r(ctx, x, y, w, h, a);
  ctx.fillStyle = b;
  const off = Math.floor(t * 12) % 16;
  for (let yy = 0; yy < h; yy++) {
    for (let xx = -16 + ((off + yy) % 16); xx < w; xx += 16) {
      const sx = Math.max(0, xx);
      const ex = Math.min(w, xx + 8);
      if (ex > sx) ctx.fillRect(x + sx, y + yy, ex - sx, 1);
    }
  }
}

const CATEGORY_COLORS = {
  world: [P.navy, P.blue],
  tech: [P.purple, P.magenta],
  science: [P.darkGreen, P.green],
  business: [P.maroon, P.rust],
  general: [P.ink, P.slate],
};

function drawWallContent(ctx, wall, scene, t) {
  const { x, y, w, h } = WALL;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  const img = wall.storyId && scene.images.get(wall.storyId);
  if (wall.mode === 'image' && img?.small) {
    ctx.drawImage(img.small, x, y);
  } else if (wall.mode === 'rundown' && scene.rundown?.length) {
    drawStripes(ctx, x, y, w, h, t);
    drawText(ctx, 'TODAY ON', x + w / 2, y + 5, { color: P.yellow, align: 'center' });
    drawText(ctx, scene.channel, x + w / 2, y + 15, { color: P.white, align: 'center', shadow: P.black });
    const idx = Math.floor(t / 2.2) % scene.rundown.length;
    const lines = wrapText(scene.rundown[idx].headline, w - 10).slice(0, 3);
    lines.forEach((line, i) => drawText(ctx, line, x + w / 2, y + 30 + i * 10, { color: P.white, align: 'center', shadow: P.black }));
  } else if (wall.mode === 'source') {
    const [a, b] = CATEGORY_COLORS[wall.category] || CATEGORY_COLORS.general;
    drawStripes(ctx, x, y, w, h, t, a, b);
    drawGlobe(ctx, x + 18, y + h / 2, 12, t);
    const lines = wrapText(wall.source || '', w - 40, 1).slice(0, 2);
    lines.forEach((line, i) => drawText(ctx, line, x + 36, y + 22 + i * 11, { color: P.white, shadow: P.black }));
    drawText(ctx, (wall.category || 'news').toUpperCase(), x + 36, y + 46, { color: P.yellow });
  } else {
    drawStripes(ctx, x, y, w, h, t);
    drawGlobe(ctx, x + 22, y + h / 2, 16, t);
    drawText(ctx, scene.channel, x + 44, y + 24, { color: P.white, shadow: P.black });
    drawText(ctx, 'LIVE', x + 44, y + 36, { color: Math.floor(t * 2) % 2 ? P.red : P.pink });
  }
  // scanlines
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  for (let yy = y + 1; yy < y + h; yy += 2) ctx.fillRect(x, yy, w, 1);
  ctx.restore();
  // bezel
  r(ctx, x - 3, y - 3, w + 6, 3, P.black);
  r(ctx, x - 3, y + h, w + 6, 3, P.black);
  r(ctx, x - 3, y, 3, h, P.black);
  r(ctx, x + w, y, 3, h, P.black);
  r(ctx, x - 3, y - 3, w + 6, 1, P.steel);
}

export function drawSet(ctx, t, scene) {
  // back wall
  r(ctx, 0, 0, W, H, P.ink);
  for (let x = 0; x < W; x += 32) r(ctx, x, 8, 1, DESK_Y, P.slate);
  r(ctx, 0, 92, W, 1, P.slate);
  // lighting truss
  r(ctx, 0, 0, W, 6, P.black);
  for (let x = 12; x < W; x += 24) {
    r(ctx, x, 4, 6, 4, P.steel);
    r(ctx, x + 1, 8, 4, 1, (Math.floor(t * 0.5 + x) % 7) ? P.yellow : P.cream);
  }
  drawCityWindow(ctx, 14, 22, 92, 56, t, false);
  drawCityWindow(ctx, W - 106, 22, 92, 56, t, true);
  drawWallContent(ctx, scene.wall, scene, t);
  // floor
  r(ctx, 0, DESK_Y + 20, W, H - DESK_Y - 20, P.slate);
  for (let x = (Math.floor(t * 4) % 24) - 24; x < W; x += 24) r(ctx, x, DESK_Y + 30, 12, 1, P.steel);
}

export function drawDesk(ctx, t, channel, withLogo = true) {
  // top
  r(ctx, 36, DESK_Y, W - 72, 4, P.silver);
  r(ctx, 36, DESK_Y + 4, W - 72, 1, P.fog);
  // front panel (slightly trapezoidal)
  for (let i = 0; i < 34; i++) {
    const inset = Math.floor(i / 6);
    r(ctx, 40 + inset, DESK_Y + 5 + i, W - 80 - inset * 2, 1, i < 2 ? P.navy : P.navy);
  }
  r(ctx, 48, DESK_Y + 14, W - 96, 1, P.cyan);
  r(ctx, 52, DESK_Y + 30, W - 104, 1, P.blue);
  if (!withLogo) return;
  // logo plate
  const w = measureText(channel, 2) + 16;
  const lx = Math.floor((W - w) / 2);
  r(ctx, lx, DESK_Y + 9, w, 20, P.red);
  r(ctx, lx, DESK_Y + 27, w, 2, P.darkRed);
  drawText(ctx, channel, W / 2, DESK_Y + 15, { color: P.white, scale: 2, align: 'center', shadow: P.darkRed });
  // chase lights
  const n = Math.floor(t * 8);
  for (let i = 0; i < 12; i++) {
    const on = (i + n) % 6 === 0;
    r(ctx, 60 + i * 6, DESK_Y + 22, 2, 2, on ? P.cyan : P.blue);
    r(ctx, W - 62 - i * 6, DESK_Y + 22, 2, 2, on ? P.cyan : P.blue);
  }
}
