#!/usr/bin/env node
// Paints the original illustrations used by the offline fixture stories
// (config/fixtures/img/*.png). Everything is procedural and deterministic: no
// photographs, no third-party artwork. Run it again after changing a scene:
//
//   node config/fixtures/make-images.mjs [scene ...]
//
// Scenes are composed like news photographs (one clear subject, a horizon,
// light from one side) with flat, bold shapes, so they read well after the
// channel pixelates them to 104x62 (video wall) and 416x234 (full screen).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Canvas, encodePng, hex, mix, noise1, rng } from './raster.mjs';

const W = 1280;
const H = 720;
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'img');

const shadeV = (y0, y1, top, bottom) => {
  const a = hex(top);
  const b = hex(bottom);
  return (x, y) => mix(a, b, Math.min(1, Math.max(0, (y - y0) / (y1 - y0))));
};

function stars(c, r, n, maxY, bright = 1) {
  for (let i = 0; i < n; i++) {
    const x = r() * W;
    const y = r() * maxY;
    const s = r();
    c.circle(x, y, s < 0.92 ? 1.6 : 3, '#ffffff', (0.35 + s * 0.65) * bright);
  }
}

function cloud(c, x, y, s, color, a = 1) {
  const blobs = [
    [0, 0, 1],
    [-0.9, 0.25, 0.7],
    [0.9, 0.2, 0.75],
    [-0.4, -0.35, 0.75],
    [0.45, -0.3, 0.7],
  ];
  for (const [dx, dy, k] of blobs) c.ellipse(x + dx * s, y + dy * s * 0.6, s * k, s * k * 0.62, color, a);
}

// ---------------------------------------------------------------- scenes

export const SCENES = {
  /** A tram on a riverside street at dusk, lit windows on the hill behind (Lisbon). */
  tram(c, r) {
    c.gradient(0, H * 0.62, [
      [0, '#141c34'],
      [0.5, '#34405e'],
      [0.85, '#a8705a'],
      [1, '#d89a6a'],
    ]);
    c.glow(W * 0.8, H * 0.6, 520, '#e09060', 0.35);
    // the hill: layered, darker houses with warm lit windows
    const hill = c.ridge(H * 0.4, 60, 0.0022, '#2e2a38', 11, { bottom: H * 0.66, octaves: 2 });
    const yAt = (x) => (hill.find(([px]) => px >= x) || hill.at(-2))[1];
    const walls = ['#8a7a6a', '#9a8670', '#6e6a70', '#a08c72', '#7a6a62', '#8e8a84'];
    for (let row = 0; row < 3; row++) {
      for (let x = -30 + row * 40; x < W; x += 80 + r() * 30) {
        const top = yAt(Math.max(0, x)) + row * 60 + r() * 10;
        if (top > H * 0.6) continue;
        const w = 72 + r() * 40;
        const h = 60 + r() * 30;
        const dim = 0.55 + row * 0.15;
        const wall = walls[Math.floor(r() * walls.length)];
        c.rect(x, top, w, h, wall);
        c.rect(x, top, w, h, '#141828', 1 - dim);
        c.rect(x + w - 14, top, 14, h, '#000000', 0.25);
        c.poly([[x - 5, top], [x + w / 2, top - 18 - r() * 6], [x + w + 5, top]], '#6a3a30');
        for (let wx = x + 12; wx < x + w - 16; wx += 26) {
          const lit = r() < 0.45;
          c.rect(wx, top + 18, 11, 16, lit ? '#f0b866' : '#232434', lit ? 0.95 : 0.8);
        }
      }
    }
    c.gradient(H * 0.6, H * 0.64, [[0, '#262230'], [1, '#1a1822']]);
    // street, then the river with long reflections
    c.rect(0, H * 0.64, W, H * 0.12, '#3c3a42');
    c.rect(0, H * 0.64, W, 4, '#6a6670');
    c.gradient(H * 0.76, H, [[0, '#6a5a64'], [0.25, '#2e3450'], [1, '#121628']]);
    for (let i = 0; i < 80; i++) c.rect(W * 0.55 + r() * W * 0.45, H * 0.78 + r() * H * 0.22, 30 + r() * 90, 3, '#e8a868', 0.15 + r() * 0.25);
    for (let i = 0; i < 40; i++) c.rect(r() * W, H * 0.78 + r() * H * 0.22, 20 + r() * 50, 2, '#f0b866', 0.12);
    // overhead wire and the tram, lit from inside
    c.line(0, H * 0.4, W, H * 0.38, 3, '#0e0e14');
    const tx = W * 0.18;
    const ty = H * 0.47;
    const tw = 540;
    const th = 150;
    c.line(tx + 230, ty, tx + 300, H * 0.39, 5, '#0e0e14');
    c.line(tx + 300, H * 0.39, tx + 350, ty, 5, '#0e0e14');
    c.rect(tx + 10, ty + th - 6, tw - 20, 22, '#141218');
    c.poly([[tx, ty + 14], [tx + 14, ty], [tx + tw - 14, ty], [tx + tw, ty + 14], [tx + tw, ty + th], [tx, ty + th]], '#d8a42a', 1, shadeV(ty, ty + th, '#e8b43a', '#9a7020'));
    c.rect(tx, ty + th - 40, tw, 24, '#8a2e2a');
    c.rect(tx, ty + 6, tw, 6, '#f2d070', 0.8);
    for (let k = 0; k < 6; k++) c.rect(tx + 24 + k * 84, ty + 30, 64, 56, '#f6d8a0');
    for (let k = 0; k < 6; k++) c.rect(tx + 24 + k * 84, ty + 66, 64, 20, '#c89a60', 0.7);
    c.rect(tx + tw - 40, ty + 26, 26, 92, '#3a3440');
    c.circle(tx + 90, ty + th + 12, 16, '#0e0c10');
    c.circle(tx + tw - 90, ty + th + 12, 16, '#0e0c10');
    c.glow(tx + tw - 4, ty + th - 50, 90, '#fff0c0', 0.9);
    c.glow(tx + tw / 2, ty + 60, 300, '#f0b060', 0.12);
  },

  /** Solar panels on the savanna in late-afternoon light, an acacia against the sky (Kenya). */
  solar(c, r) {
    c.gradient(0, H * 0.56, [[0, '#2a4a78'], [0.6, '#8aa6c0'], [1, '#e8c89a']]);
    c.glow(W * 0.86, H * 0.42, 460, '#ffd8a0', 0.45);
    c.circle(W * 0.86, H * 0.42, 34, '#fff2d8');
    cloud(c, W * 0.3, H * 0.14, 70, '#c8ccd8', 0.6);
    c.ridge(H * 0.53, 22, 0.003, '#5a6878', 3, { octaves: 2 });
    c.ridge(H * 0.565, 10, 0.006, '#6a6a50', 4, { octaves: 2 });
    c.gradient(H * 0.56, H, [[0, '#b08a4a'], [1, '#5a4224']]);
    for (let i = 0; i < 500; i++) {
      const x = r() * W;
      const y = H * 0.58 + r() * H * 0.42;
      c.line(x, y, x + (r() - 0.5) * 6, y - 8 - r() * 10, 2, r() < 0.5 ? '#c8a060' : '#6a5028', 0.5);
    }
    for (let row = 0; row < 7; row++) {
      const t = row / 6;
      const y = H * 0.6 + t * t * H * 0.36;
      const ph = 16 + t * 70;
      const x0 = W * (0.36 - t * 0.36);
      const x1 = W * (1.0 + t * 0.1);
      const tilt = ph * 0.9;
      c.poly([[x0, y + tilt], [x1, y + tilt], [x1 - ph * 0.4, y], [x0 + ph * 0.4, y]], '#1d3050', 1, shadeV(y, y + tilt, '#5a78a0', '#141e34'));
      for (let k = 1; k < 3; k++) c.line(x0 + ph * 0.4 * (1 - k / 3), y + (tilt * k) / 3, x1 - ph * 0.4 * (1 - k / 3), y + (tilt * k) / 3, 1 + t, '#7a90b0', 0.45);
      for (let x = x0 + 60; x < x1; x += 40 + t * 80) c.line(x, y + tilt, x + ph * 0.25, y, 1 + t, '#7a90b0', 0.4);
      c.rect(x0, y + tilt, x1 - x0, 3 + t * 8, '#2a2016', 0.85);
      c.rect(x1 - W * 0.3, y + tilt * 0.2, W * 0.3, 2, '#ffe0b0', 0.25 * t);
    }
    c.line(W * 0.14, H * 0.62, W * 0.15, H * 0.38, 16, '#1e1610');
    c.line(W * 0.145, H * 0.45, W * 0.1, H * 0.34, 9, '#1e1610');
    c.line(W * 0.15, H * 0.44, W * 0.2, H * 0.33, 9, '#1e1610');
    c.ellipse(W * 0.15, H * 0.32, 190, 34, '#262a18');
    c.ellipse(W * 0.13, H * 0.3, 120, 22, '#343a20');
  },

  /** A fissure eruption at night: a curtain of lava along the crack, lit smoke above (Iceland). */
  volcano(c, r) {
    c.gradient(0, H * 0.6, [[0, '#080a18'], [0.6, '#1c1428'], [1, '#4a2228']]);
    stars(c, r, 160, H * 0.4, 0.6);
    for (let i = 0; i < 30; i++) {
      const t = i / 29;
      const x = W * (0.48 + (r() - 0.5) * 0.14) + t * 200;
      const y = H * 0.52 - t * H * 0.46;
      c.circle(x, y, 60 + t * 120, mix(hex('#b0502e'), hex('#2a2430'), Math.min(1, t * 1.3)), 0.3);
    }
    c.ridge(H * 0.55, 60, 0.0016, '#140f18', 21, { octaves: 3, sharp: true });
    c.glow(W * 0.5, H * 0.64, 640, '#e8661e', 0.6, 1.6);
    c.ridge(H * 0.66, 16, 0.004, '#100c12', 22, { octaves: 2 });
    const n = noise1(5);
    const crack = [];
    for (let x = W * 0.1; x <= W * 0.9; x += 6) crack.push([x, H * 0.665 + n(x * 0.01) * 12 - (x - W * 0.5) * 0.03]);
    // the lava curtain: overlapping soft spurts of varying height along the crack
    const hN = noise1(9);
    for (const [x, y] of crack) {
      const h = Math.max(6, (hN(x * 0.012) * 0.5 + 0.5) ** 2 * 170 * (1 - Math.abs(x / W - 0.5) * 1.2));
      c.ellipse(x, y - h * 0.5, 8, h * 0.5, '#e8541c', 0.35);
      c.ellipse(x, y - h * 0.35, 4, h * 0.35, '#ffb040', 0.45);
    }
    for (let k = 0; k + 1 < crack.length; k++) c.line(crack[k][0], crack[k][1], crack[k + 1][0], crack[k + 1][1], 8, '#ffcf5a');
    for (let k = 0; k + 1 < crack.length; k++) c.line(crack[k][0], crack[k][1] - 1, crack[k + 1][0], crack[k + 1][1] - 1, 3, '#fff0c0');
    for (let i = 0; i < 120; i++) {
      const [x, y] = crack[Math.floor(r() * crack.length)];
      c.circle(x + (r() - 0.5) * 60, y - r() * 150, 2 + r() * 3, '#ffc050', 0.6);
    }
    c.gradient(H * 0.7, H, [[0, '#24161a'], [1, '#0a080c']]);
    for (let i = 0; i < 160; i++) {
      const x = r() * W;
      const y = H * 0.72 + r() * H * 0.28;
      c.ellipse(x, y, 20 + r() * 50, 6 + r() * 10, '#b4501e', 0.1 + 0.22 * (1 - (y - H * 0.7) / (H * 0.3)));
    }
  },

  /** A flooded street of concrete houses under monsoon rain (Kerala). */
  flood(c, r) {
    c.gradient(0, H * 0.55, [[0, '#3a4048'], [1, '#7a8288']]);
    for (let i = 0; i < 9; i++) cloud(c, r() * W, H * (0.05 + r() * 0.2), 80 + r() * 60, '#4a5058', 0.55);
    c.ridge(H * 0.48, 16, 0.004, '#3a4a40', 41, { octaves: 2 });
    // palms behind the houses
    for (const px of [W * 0.06, W * 0.47, W * 0.93]) {
      const top = H * (0.16 + r() * 0.06);
      for (let k = 0; k < 24; k++) {
        const t = k / 24;
        c.circle(px + Math.sin(t * 1.6) * 24, H * 0.6 - t * (H * 0.6 - top), 7, '#2e261e');
      }
      const cx = px + Math.sin(1.6) * 24;
      for (let f = 0; f < 11; f++) {
        const a = Math.PI + (f / 10) * Math.PI + (r() - 0.5) * 0.2;
        const len = 150 + r() * 40;
        const ex = cx + Math.cos(a) * len;
        const ey = top + len * 0.5 * (1 - Math.abs(Math.sin(a))) + 20;
        const mx = cx + Math.cos(a) * len * 0.5;
        const my = top - 26 * Math.abs(Math.sin(a));
        c.poly([[cx, top - 4], [mx, my - 10], [ex, ey], [mx, my + 10], [cx, top + 6]], f % 2 ? '#24382a' : '#2e4632');
      }
    }
    // flat-roofed concrete houses, shutters and a balcony, windows off-centre
    const walls = ['#a8a090', '#8e9a94', '#b09a80', '#9a948c', '#a4987e'];
    let x = -30;
    while (x < W) {
      const w = 180 + r() * 120;
      const h = 150 + r() * 90;
      const base = H * 0.7;
      const wall = walls[Math.floor(r() * walls.length)];
      c.rect(x, base - h, w, h, wall);
      c.rect(x, base - h, w, 10, '#000000', 0.25);
      c.rect(x + w - 16, base - h, 16, h, '#000000', 0.2);
      c.rect(x + 18, base - h * 0.78, w * 0.26, h * 0.22, '#2a3036');
      c.rect(x + 18, base - h * 0.78, w * 0.26, 6, '#5a6a60');
      c.rect(x + w * 0.5, base - h * 0.78, w * 0.32, h * 0.22, '#2a3036');
      c.rect(x + w * 0.46, base - h * 0.52, w * 0.42, 5, '#3a3a3a');
      for (let bx = x + w * 0.46; bx < x + w * 0.88; bx += 12) c.rect(bx, base - h * 0.52, 2, 22, '#3a3a3a');
      c.rect(x + w * 0.12, base - h * 0.4, w * 0.18, h * 0.4, '#3a2a22');
      x += w + 16 + r() * 30;
    }
    // brown water with reflections and ripples
    c.gradient(H * 0.62, H, [[0, '#6a6450'], [1, '#2e2e28']]);
    for (let i = 0; i < 140; i++) c.rect(r() * W, H * 0.64 + r() * H * 0.36, 40 + r() * 120, 3, '#a8a690', 0.22);
    for (let i = 0; i < 30; i++) c.ellipse(r() * W, H * 0.7 + r() * H * 0.3, 30 + r() * 30, 5, '#c0bea8', 0.22);
    for (let i = 0; i < 900; i++) {
      const rx = r() * W;
      const ry = r() * H;
      c.line(rx, ry, rx - 10, ry + 34, 1.6, '#c8d0d4', 0.3);
    }
  },

  /** Dry-stone walls and a trapezoidal doorway of a ruined temple, peaks in the mist (Peru). */
  temple(c, r) {
    c.gradient(0, H * 0.5, [[0, '#566a84'], [1, '#c4ccd0']]);
    const peaks = c.ridge(H * 0.32, 130, 0.0016, '#6a7488', 61, { octaves: 3, sharp: true });
    for (const [px, py] of peaks) if (py < H * 0.2) c.rect(px, py, 5, H * 0.2 - py, '#e4e8ec', 0.9);
    for (let i = 0; i < 8; i++) c.ellipse(r() * W, H * (0.3 + r() * 0.1), 260, 30, '#d8dce0', 0.35);
    c.ridge(H * 0.44, 90, 0.002, '#3e4c44', 62, { octaves: 3, sharp: true });
    for (let k = 0; k < 5; k++) {
      const y = H * 0.48 + k * 24;
      c.ridge(y, 8, 0.004, k % 2 ? '#4e5a36' : '#5a6640', 70 + k, { octaves: 1 });
      c.ridge(y + 3, 8, 0.004, '#2e3424', 70 + k, { octaves: 1, bottom: y + 8 });
    }
    // the wall: big irregular granite blocks, fitted
    const top = H * 0.42;
    const bottom = H * 0.88;
    const stone = ['#8a8478', '#9a9486', '#7c776c', '#a49e90', '#888274'];
    for (let y = top; y < bottom; ) {
      const bh = 34 + r() * 26;
      for (let x = 0; x < W; ) {
        const bw = 60 + r() * 90;
        c.rect(x + 2, y + 2, bw - 4, bh - 4, stone[Math.floor(r() * stone.length)]);
        c.rect(x + 2, y + 2, bw - 4, 4, '#c4beb0', 0.5);
        c.rect(x + 2, y + bh - 8, bw - 4, 6, '#000000', 0.18);
        x += bw;
      }
      y += bh;
    }
    c.rect(0, top - 4, W, 6, '#4a463e');
    // trapezoidal doorway with the light beyond, and a niche either side
    const door = (cx, w, h, depth) => {
      c.poly([[cx - w / 2, bottom], [cx - w * 0.36, bottom - h], [cx + w * 0.36, bottom - h], [cx + w / 2, bottom]], '#5c574e');
      c.poly([[cx - w / 2 + depth, bottom], [cx - w * 0.36 + depth * 0.8, bottom - h + depth], [cx + w * 0.36 - depth * 0.8, bottom - h + depth], [cx + w / 2 - depth, bottom]], '#1a1a1c');
    };
    door(W * 0.5, 200, 270, 18);
    c.poly([[W * 0.5 - 70, bottom], [W * 0.5 - 52, bottom - 240], [W * 0.5 + 52, bottom - 240], [W * 0.5 + 70, bottom]], '#b8c4c0', 0.5);
    for (const nx of [W * 0.2, W * 0.8]) {
      c.poly([[nx - 40, H * 0.72], [nx - 30, H * 0.56], [nx + 30, H * 0.56], [nx + 40, H * 0.72]], '#2a2826');
    }
    c.gradient(bottom, H, [[0, '#4e5636'], [1, '#2a301e']]);
    for (let i = 0; i < 300; i++) {
      const gx = r() * W;
      const gy = bottom + r() * (H - bottom);
      c.line(gx, gy, gx + (r() - 0.5) * 8, gy - 10 - r() * 12, 2, r() < 0.5 ? '#6e7444' : '#3a4026', 0.7);
    }
  },

  /** A white high-speed train crossing a viaduct below a snowy peak (Japan). */
  train(c, r) {
    c.gradient(0, H * 0.6, [[0, '#2e4468'], [0.7, '#a89aa0'], [1, '#e0b890']]);
    c.poly([[W * 0.42, H * 0.6], [W * 0.62, H * 0.16], [W * 0.66, H * 0.15], [W * 0.88, H * 0.6]], '#4e5670');
    c.poly([[W * 0.565, H * 0.28], [W * 0.62, H * 0.16], [W * 0.66, H * 0.15], [W * 0.72, H * 0.29], [W * 0.68, H * 0.27], [W * 0.65, H * 0.31], [W * 0.61, H * 0.27]], '#f4f8fc');
    c.ridge(H * 0.6, 26, 0.003, '#2e3e34', 81, { octaves: 2 });
    c.gradient(H * 0.62, H, [[0, '#4a5a3a'], [1, '#222a1c']]);
    for (let i = 0; i < 40; i++) c.circle(r() * W, H * 0.66 + r() * H * 0.3, 20 + r() * 30, r() < 0.5 ? '#2e3a26' : '#3a4830', 0.8);
    // viaduct
    const dy = H * 0.58;
    c.rect(0, dy, W, 24, '#8a8c92');
    c.rect(0, dy + 24, W, 8, '#4a4e56');
    for (let x = 40; x < W; x += 160) c.rect(x, dy + 30, 30, H - dy, '#5e626a');
    // the train: a long nose to the right
    const ty = dy - 64;
    c.poly([[-10, ty], [W * 0.7, ty], [W * 0.84, ty + 30], [W * 0.88, ty + 60], [-10, ty + 60]], '#e8e6e4', 1, shadeV(ty, ty + 60, '#f4e8dc', '#9aa0aa'));
    c.rect(-10, ty + 36, W * 0.84, 10, '#1f5fb4');
    c.poly([[W * 0.7, ty + 4], [W * 0.8, ty + 24], [W * 0.7, ty + 24]], '#24304a');
    for (let x = 20; x < W * 0.66; x += 44) c.rect(x, ty + 12, 26, 14, '#f0d8a8');
    for (let x = 180; x < W * 0.7; x += 210) c.rect(x, ty + 4, 4, 52, '#b8c0c8');
    // speed lines
    for (let i = 0; i < 18; i++) c.rect(-20 + r() * W * 0.5, ty + r() * 60, 80 + r() * 160, 2, '#ffffff', 0.5);
  },

  /** A boulevard of stone facades in low evening sun, young plane trees casting long shadows (Paris). */
  trees(c, r) {
    c.gradient(0, H * 0.4, [[0, '#3e5a80'], [1, '#c8b49a']]);
    const fy = H * 0.12;
    for (let x = -40; x < W; x += 230) {
      // sunlit stone on the left of each block, shade on the right
      c.rect(x, fy + 40, 226, H * 0.6, '#d8c4a0', 1, null);
      c.rect(x + 150, fy + 40, 76, H * 0.6, '#8a7a66');
      c.poly([[x - 4, fy + 44], [x + 20, fy], [x + 206, fy], [x + 230, fy + 44]], '#5a6270');
      for (let k = 0; k < 3; k++) c.rect(x + 40 + k * 60, fy + 8, 22, 26, '#2e3440');
      for (let row = 0; row < 5; row++) {
        for (let k = 0; k < 4; k++) {
          const wx = x + 18 + k * 52;
          const wy = fy + 64 + row * 70;
          c.rect(wx, wy, 26, 44, '#2a303c');
          c.rect(wx, wy, 26, 8, '#e8c890', k < 2 && r() < 0.5 ? 0.7 : 0.15);
        }
        c.rect(x + 8, fy + 110 + row * 70, 210, 4, '#1e1e24', 0.85);
      }
      c.rect(x + 222, fy + 40, 4, H * 0.6, '#6a5e50');
    }
    c.glow(-60, H * 0.3, 700, '#ffc890', 0.25);
    c.rect(0, H * 0.74, W, H * 0.06, '#8a8278');
    c.gradient(H * 0.8, H, [[0, '#3e3e44'], [1, '#26262c']]);
    for (let x = 30; x < W; x += 160) c.rect(x, H * 0.9, 80, 8, '#bdbab0');
    // long shadows to the right, then the trees: dark irregular crowns, warm rim on the sunny side
    for (let x = 60; x < W; x += 200) c.poly([[x - 10, H * 0.76], [x + 10, H * 0.76], [x + 230, H * 0.8], [x + 160, H * 0.8]], '#000000', 0.3);
    for (let x = 60; x < W; x += 200) {
      c.rect(x - 7, H * 0.5, 14, H * 0.26, '#2e2620');
      for (let k = 0; k < 9; k++) c.circle(x + (r() - 0.5) * 120, H * (0.3 + r() * 0.18), 30 + r() * 30, k % 2 ? '#2e4228' : '#38502e');
      for (let k = 0; k < 5; k++) c.circle(x - 40 + (r() - 0.5) * 40, H * (0.3 + r() * 0.14), 16 + r() * 12, '#7a8a48', 0.6);
    }
  },

  /** A ferry pitching in a storm, dark clouds and white crests (Greek islands). */
  ferry(c, r) {
    c.gradient(0, H * 0.55, [[0, '#2a3038'], [1, '#6a747c']]);
    for (let i = 0; i < 14; i++) cloud(c, r() * W, H * (0.04 + r() * 0.3), 70 + r() * 80, r() < 0.5 ? '#3a4048' : '#4a525a', 0.75);
    c.ridge(H * 0.5, 24, 0.003, '#323a36', 91, { octaves: 2, bottom: H * 0.56 });
    // a lighthouse on the headland, its lamp lit
    c.poly([[W * 0.12, H * 0.48], [W * 0.13, H * 0.36], [W * 0.14, H * 0.36], [W * 0.15, H * 0.48]], '#c8c4bc');
    c.rect(W * 0.125, H * 0.4, W * 0.02, 8, '#8a3a32');
    c.rect(W * 0.128, H * 0.33, W * 0.014, H * 0.03, '#ffe8b0');
    c.glow(W * 0.135, H * 0.345, 90, '#ffe0a0', 0.5);
    c.gradient(H * 0.54, H, [[0, '#3a5a64'], [1, '#14262e']]);
    // the ferry, slightly tilted
    const fx = W * 0.32;
    const fy = H * 0.5;
    const tilt = 0.06;
    const P = (x, y) => [fx + x, fy + y + x * tilt];
    c.poly([P(0, 40), P(520, 40), P(560, 0), P(-30, 0)].map(([x, y]) => [x, y]), '#c8d2dc');
    c.poly([P(-30, 0), P(560, 0), P(520, 40), P(0, 40)], '#c8ccd0');
    c.poly([P(-20, 40), P(530, 40), P(500, 86), P(10, 86)], '#1f3f7a');
    c.poly([P(60, 0), P(420, 0), P(400, -50), P(90, -50)], '#d4d6d8');
    c.poly([P(120, -50), P(360, -50), P(340, -88), P(150, -88)], '#c4c8cc');
    for (let k = 0; k < 9; k++) c.poly([P(100 + k * 34, -38), P(122 + k * 34, -38), P(122 + k * 34, -24), P(100 + k * 34, -24)], '#3a4a5e');
    c.poly([P(240, -88), P(272, -88), P(276, -130), P(244, -130)], '#c8463a');
    // waves in front
    for (let row = 0; row < 7; row++) {
      const y = H * 0.62 + row * 46;
      c.ridge(y, 18 + row * 4, 0.006, row % 2 ? '#24424c' : '#2c4c56', 100 + row, { octaves: 2, sharp: true, bottom: y + 60 });
      const n = noise1(100 + row);
      for (let x = 0; x < W; x += 8) if (n(x * 0.006) > 0.25) c.rect(x, y - n(x * 0.006) * (18 + row * 4) - 4, 10, 4, '#e8f0f2', 0.8);
    }
    for (let i = 0; i < 400; i++) {
      const rx = r() * W;
      const ry = r() * H;
      c.line(rx, ry, rx - 18, ry + 30, 1.4, '#c8d0d6', 0.3);
    }
  },

  /** A river winding through dense rainforest canopy, seen from above (Amazon). */
  forest(c, r) {
    c.fill('#18301c');
    for (let i = 0; i < 1400; i++) {
      const x = r() * W;
      const y = r() * H;
      const s = 18 + r() * 34;
      const g = ['#1c3a20', '#244626', '#2c522c', '#355c30', '#22401f'][Math.floor(r() * 5)];
      c.circle(x, y, s, g);
      c.circle(x - s * 0.25, y - s * 0.25, s * 0.5, '#5a7a3e', 0.45);
    }
    // the river
    const pts = [];
    for (let y = -20; y <= H + 20; y += 10) pts.push([W * 0.5 + Math.sin(y * 0.008) * 260 + Math.sin(y * 0.021) * 60, y]);
    const left = pts.map(([x, y]) => [x - 46, y]);
    const right = pts.map(([x, y]) => [x + 46, y]).reverse();
    c.poly([...left, ...right], '#5a4a34');
    c.poly([...pts.map(([x, y]) => [x - 30, y]), ...pts.map(([x, y]) => [x + 30, y]).reverse()], '#7a6444');
    for (const [x, y] of pts) if (r() < 0.3) c.rect(x - 20, y, 30, 3, '#d0b080', 0.5);
    // morning mist
    for (let i = 0; i < 12; i++) c.ellipse(r() * W, r() * H, 200 + r() * 200, 40 + r() * 40, '#e8f0e8', 0.12);
  },

  /** A processor die on a circuit board with golden traces (technology). */
  chip(c, r) {
    c.gradient(0, H, [[0, '#0e2a24'], [1, '#081814']]);
    // traces
    for (let i = 0; i < 90; i++) {
      let x = r() < 0.5 ? (r() < 0.5 ? 0 : W) : r() * W;
      let y = r() < 0.5 ? r() * H : r() < 0.5 ? 0 : H;
      const tx = W / 2 + (r() - 0.5) * 360;
      const ty = H / 2 + (r() - 0.5) * 360;
      const midX = r() < 0.5 ? tx : x;
      c.line(x, y, midX, y, 4, '#b08a3a', 0.8);
      c.line(midX, y, midX, ty, 4, '#b08a3a', 0.8);
      c.circle(x, y, 7, '#d8b060');
      x = midX;
      y = ty;
    }
    for (let i = 0; i < 40; i++) c.circle(r() * W, r() * H, 6, '#d8b060', 0.9);
    // the chip with its pins
    const s = 300;
    const cx = W / 2 - s / 2;
    const cy = H / 2 - s / 2;
    for (let k = 0; k < 14; k++) {
      const o = 22 + k * 19;
      c.rect(cx + o, cy - 26, 8, 26, '#e0c070');
      c.rect(cx + o, cy + s, 8, 26, '#e0c070');
      c.rect(cx - 26, cy + o, 26, 8, '#e0c070');
      c.rect(cx + s, cy + o, 26, 8, '#e0c070');
    }
    c.rect(cx, cy, s, s, '#1a1c22', 1);
    c.poly([[cx, cy], [cx + s, cy], [cx + s - 20, cy + 20], [cx + 20, cy + 20]], '#2e323c');
    c.rect(cx + 70, cy + 70, s - 140, s - 140, '#3a8fb0', 1, null);
    c.rect(cx + 80, cy + 80, s - 160, s - 160, '#2c6e8a');
    for (let k = 0; k < 6; k++) c.rect(cx + 90 + k * 20, cy + 90, 10, s - 180, '#4ab0d0', 0.5);
    c.glow(W / 2, H / 2, 260, '#2ce8f5', 0.25);
  },

  /** A rocket climbing from its launch pad at dawn on a column of fire (spaceflight). */
  rocket(c, r) {
    c.gradient(0, H, [[0, '#1a2250'], [0.55, '#c86a6a'], [0.8, '#f4b26a'], [1, '#f8d8a0']]);
    stars(c, r, 80, H * 0.3, 0.6);
    c.ridge(H * 0.8, 10, 0.004, '#3a2a3a', 111, { octaves: 2 });
    c.rect(0, H * 0.82, W, H * 0.18, '#2a2030');
    // launch tower
    const tx = W * 0.38;
    c.rect(tx, H * 0.32, 26, H * 0.5, '#5a4a5a');
    for (let y = H * 0.34; y < H * 0.8; y += 30) c.line(tx, y, tx + 26, y + 30, 3, '#7a6a7a');
    // exhaust cloud at the base
    for (let i = 0; i < 40; i++) c.circle(W * 0.5 + (r() - 0.5) * 520, H * 0.82 - r() * 70, 40 + r() * 50, mix(hex('#f8e8d8'), hex('#c8a8a0'), r()), 0.85);
    // flame and rocket
    const rx = W * 0.5;
    const ry = H * 0.3;
    c.glow(rx, ry + 230, 300, '#ffb050', 0.7);
    c.poly([[rx - 26, ry + 150], [rx + 26, ry + 150], [rx + 8, ry + 380], [rx - 8, ry + 380]], '#ffd27a');
    c.poly([[rx - 14, ry + 150], [rx + 14, ry + 150], [rx, ry + 300]], '#fff6d8');
    c.rect(rx - 30, ry - 60, 60, 210, '#f2f2f4');
    c.rect(rx + 6, ry - 60, 24, 210, '#c8c8d0');
    c.poly([[rx - 30, ry - 60], [rx, ry - 140], [rx + 30, ry - 60]], '#e8e8ec');
    c.poly([[rx - 30, ry + 110], [rx - 60, ry + 160], [rx - 30, ry + 150]], '#c8463a');
    c.poly([[rx + 30, ry + 110], [rx + 60, ry + 160], [rx + 30, ry + 150]], '#a83a30');
    c.rect(rx - 30, ry + 20, 60, 10, '#2a2a3a');
  },

  /** An observatory dome on a mountain under the Milky Way (astronomy). */
  observatory(c, r) {
    c.gradient(0, H, [[0, '#070a1c'], [0.7, '#1a1e40'], [1, '#2a2648']]);
    // the Milky Way: a diagonal band of soft light and dense stars
    const n = noise1(121);
    for (let k = 0; k < 40; k++) {
      const t = k / 39;
      c.glow(t * W, H * 0.85 - t * H * 0.8, 260, '#6a5ab0', 0.1);
      c.glow(t * W, H * 0.85 - t * H * 0.8 + n(t * 6) * 40, 140, '#d8c8f0', 0.08);
    }
    for (let i = 0; i < 2200; i++) {
      const t = r();
      const spread = (r() + r() + r() - 1.5) * 260;
      c.circle(t * W + spread * 0.4, H * 0.85 - t * H * 0.8 + spread, r() < 0.97 ? 1.4 : 2.8, '#ffffff', 0.2 + r() * 0.5);
    }

    stars(c, r, 300, H * 0.8, 0.9);
    // mountain and dome
    c.ridge(H * 0.74, 90, 0.0018, '#0e0e18', 131, { octaves: 3 });
    const dx = W * 0.64;
    const dy = H * 0.58;
    c.ellipse(dx, dy, 150, 140, '#e2e6ee', 1, (x) => (x > dx + 40 ? hex('#a8aec0') : x > dx - 20 ? hex('#c8cede') : hex('#e6eaf2')));
    c.rect(dx - 160, dy, 320, 110, '#c8ccd8');
    c.rect(dx + 60, dy, 100, 110, '#9aa0b0');
    c.poly([[dx - 18, dy - 138], [dx + 18, dy - 138], [dx + 22, dy], [dx - 22, dy]], '#1a1e30');
    c.rect(dx - 160, dy, 320, 8, '#8a90a0');
    c.rect(dx - 70, dy + 50, 30, 60, '#3a3e50');
    c.glow(dx - 55, dy + 80, 50, '#ffd890', 0.7);
  },

  /** A trading screen with rising candles and a glowing line (markets). */
  markets(c, r) {
    c.gradient(0, H, [[0, '#0c1424'], [1, '#141e34']]);
    for (let x = 0; x < W; x += 80) c.rect(x, 0, 2, H, '#24324c', 0.8);
    for (let y = 40; y < H; y += 80) c.rect(0, y, W, 2, '#24324c', 0.8);
    let v = H * 0.68;
    const line = [];
    for (let k = 0; k < 34; k++) {
      const x = 40 + k * 36;
      const open = v;
      v += (r() - 0.62) * 60;
      v = Math.max(H * 0.15, Math.min(H * 0.85, v));
      const up = v < open;
      const top = Math.min(open, v);
      const h = Math.max(6, Math.abs(open - v));
      c.rect(x + 9, top - 14 - r() * 20, 4, h + 28 + r() * 20, up ? '#63c74d' : '#e43b44', 0.9);
      c.rect(x, top, 22, h, up ? '#63c74d' : '#e43b44');
      line.push([x + 11, v]);
    }
    for (let k = 0; k + 1 < line.length; k++) c.line(line[k][0], line[k][1] - 40, line[k + 1][0], line[k + 1][1] - 40, 4, '#feae34');
    for (const [x, y] of line) c.glow(x, y - 40, 40, '#feae34', 0.12);
    c.rect(0, H - 60, W, 60, '#0a101c');
    for (let x = 30; x < W; x += 140) c.rect(x, H - 38, 90, 14, x % 280 < 140 ? '#63c74d' : '#e43b44', 0.7);
  },

  /** Offshore wind turbines on a calm sea at sunrise (energy). */
  wind(c, r) {
    c.gradient(0, H * 0.62, [[0, '#4a6aa8'], [0.6, '#e8a8a0'], [1, '#f8d8a8']]);
    c.glow(W * 0.3, H * 0.6, 360, '#ffd8a0', 0.6);
    c.circle(W * 0.3, H * 0.6, 50, '#fff0d0');
    c.gradient(H * 0.62, H, [[0, '#9a8ca0'], [1, '#2a3a5a']]);
    for (let i = 0; i < 90; i++) c.rect(W * 0.3 - 200 + r() * 400, H * 0.63 + r() * H * 0.37, 30 + r() * 80, 3, '#ffe0b0', 0.35);
    const turbine = (x, base, s, angle) => {
      c.poly([[x - 4 * s, base], [x + 4 * s, base], [x + 2 * s, base - 200 * s], [x - 2 * s, base - 200 * s]], '#f2f2f4');
      c.rect(x - 8 * s, base - 206 * s, 22 * s, 10 * s, '#e0e0e6');
      for (let b = 0; b < 3; b++) {
        const a = angle + (b * Math.PI * 2) / 3;
        const ex = x + Math.cos(a) * 110 * s;
        const ey = base - 200 * s + Math.sin(a) * 110 * s;
        const px = Math.cos(a + Math.PI / 2) * 6 * s;
        const py = Math.sin(a + Math.PI / 2) * 6 * s;
        c.poly([[x + px, base - 200 * s + py], [ex, ey], [x - px, base - 200 * s - py]], '#fafafc');
      }
      c.circle(x, base - 200 * s, 6 * s, '#d0d0d8');
      c.rect(x - 10 * s, base - 4 * s, 20 * s, 8 * s, '#e8c040');
    };
    turbine(W * 0.86, H * 0.66, 0.5, 0.2);
    turbine(W * 0.72, H * 0.67, 0.75, 1.1);
    turbine(W * 0.55, H * 0.7, 1.05, 2.0);
    turbine(W * 0.36, H * 0.77, 1.5, 0.6);
  },

  /** Container stacks and gantry cranes at a busy port (trade). */
  port(c, r) {
    c.gradient(0, H * 0.6, [[0, '#3a5272'], [1, '#c8c4bc']]);
    cloud(c, W * 0.2, H * 0.14, 60, '#d0d4d8', 0.6);
    c.gradient(H * 0.66, H, [[0, '#3a6a8a'], [1, '#1a3a5a']]);
    // ship hull
    c.poly([[W * 0.05, H * 0.6], [W * 0.95, H * 0.6], [W * 0.9, H * 0.74], [W * 0.1, H * 0.74]], '#2a3a4a');
    c.rect(W * 0.05, H * 0.6, W * 0.9, 10, '#c8463a');
    // containers
    const colors = ['#8a3a32', '#2a4a70', '#a8823a', '#3a5a46', '#5a4a5e', '#9a9a96', '#9a5a32'];
    for (let row = 0; row < 5; row++) {
      for (let x = W * 0.08; x < W * 0.86; x += 70) {
        if (r() < 0.12 * row) continue;
        const y = H * 0.6 - (row + 1) * 34;
        const col = colors[Math.floor(r() * colors.length)];
        c.rect(x, y, 66, 32, col);
        for (let k = 6; k < 66; k += 8) c.rect(x + k, y + 3, 2, 26, '#000000', 0.15);
      }
    }
    // gantry cranes
    for (const gx of [W * 0.2, W * 0.58]) {
      c.rect(gx, H * 0.12, 18, H * 0.6, '#e06a2a');
      c.rect(gx + 200, H * 0.12, 18, H * 0.6, '#e06a2a');
      c.rect(gx - 120, H * 0.12, 460, 22, '#e06a2a');
      c.line(gx, H * 0.4, gx + 218, H * 0.13, 6, '#c85a20');
      c.rect(gx + 90, H * 0.14, 50, 30, '#f2f2f2');
      c.line(gx + 115, H * 0.17, gx + 115, H * 0.3, 2, '#2a2a2a');
      c.rect(gx + 85, H * 0.3, 60, 30, colors[Math.floor(r() * colors.length)]);
    }
    for (let i = 0; i < 60; i++) c.rect(r() * W, H * 0.76 + r() * H * 0.24, 40 + r() * 80, 3, '#a8c8e0', 0.3);
  },
};

// Per-scene grades: night and storm scenes keep their own mood, daylight scenes are calmed down most.
const GRADES = {
  volcano: { saturation: 0.85, tint: 0.12 },
  observatory: { saturation: 0.8, tint: 0.1 },
  markets: { saturation: 0.8, tint: 0.1, vignette: 0.3 },
  chip: { saturation: 0.75, tint: 0.12 },
  ferry: { saturation: 0.7, tint: 0.18 },
  rocket: { saturation: 0.75 },
};

/** Paint one scene at full size, graded, before downsampling. */
export function paintCanvas(name, seed = 1) {
  const scene = SCENES[name];
  if (!scene) throw new Error(`unknown scene "${name}"`);
  const c = new Canvas(W, H);
  scene(c, rng(seed * 7919 + name.length * 104729));
  return c.grade(GRADES[name]);
}

/** Paint one scene; returns the PNG bytes (640x360). */
export function paint(name, seed = 1) {
  return encodePng(paintCanvas(name, seed).downsample(2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SCENES);
  fs.mkdirSync(OUT, { recursive: true });
  for (const name of names) {
    const png = paint(name);
    fs.writeFileSync(path.join(OUT, `${name}.png`), png);
    console.log(`${name}.png  ${(png.length / 1024).toFixed(0)} KB`);
  }
}
