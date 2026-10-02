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
  /** A yellow tram on a riverside street below a hill of pastel houses (Lisbon). */
  tram(c, r) {
    c.gradient(0, H * 0.62, [
      [0, '#3b4b8a'],
      [0.45, '#d9718a'],
      [0.8, '#f4b07a'],
      [1, '#f7d49a'],
    ]);
    c.glow(W * 0.78, H * 0.5, 420, '#ffb36b', 0.45);
    c.circle(W * 0.78, H * 0.5, 46, '#ffe7b0');
    // the hill and its houses
    const hill = c.ridge(H * 0.42, 70, 0.0022, '#7a5a6a', 11, { bottom: H * 0.66, octaves: 2 });
    const yAt = (x) => {
      const p = hill.find(([px]) => px >= x) || hill.at(-2);
      return p[1];
    };
    const roofs = ['#c4553e', '#b84a3a', '#d06a4a'];
    const walls = ['#f2d4a6', '#e9b7a0', '#f5e6c8', '#d9c2e0', '#f0c987', '#bcd6e8'];
    for (let row = 0; row < 3; row++) {
      for (let x = -30 + row * 40; x < W; x += 76 + r() * 30) {
        const top = yAt(Math.max(0, x)) + row * 62 + r() * 12;
        if (top > H * 0.6) continue;
        const w = 70 + r() * 40;
        const h = 60 + r() * 30;
        c.rect(x, top, w, h, walls[Math.floor(r() * walls.length)]);
        c.rect(x + w - 10, top, 10, h, '#000000', 0.12);
        c.poly([[x - 5, top], [x + w / 2, top - 22 - r() * 8], [x + w + 5, top]], roofs[Math.floor(r() * roofs.length)]);
        for (let wx = x + 10; wx < x + w - 14; wx += 24) c.rect(wx, top + 16, 12, 18, '#5a4660', 0.75);
      }
    }
    c.gradient(H * 0.6, H * 0.64, [[0, '#6c5560'], [1, '#4d3b48']]);
    // the street, then the river
    c.rect(0, H * 0.64, W, H * 0.12, '#8c7d7a');
    c.rect(0, H * 0.64, W, 6, '#b8a99e');
    c.gradient(H * 0.76, H, [[0, '#e7a07c'], [0.3, '#7a6aa0'], [1, '#2f3f78']]);
    for (let i = 0; i < 70; i++) c.rect(r() * W, H * 0.78 + r() * H * 0.22, 30 + r() * 90, 3, '#ffd9a8', 0.25 + r() * 0.3);
    // overhead wire and the tram
    c.line(0, H * 0.4, W, H * 0.38, 3, '#2a2230');
    const tx = W * 0.2;
    const ty = H * 0.47;
    const tw = 520;
    const th = 150;
    c.line(tx + 230, ty, tx + 300, H * 0.39, 5, '#2a2230');
    c.line(tx + 300, H * 0.39, tx + 350, ty, 5, '#2a2230');
    c.rect(tx + 10, ty + th - 6, tw - 20, 22, '#2b2230');
    c.poly([[tx, ty + 14], [tx + 14, ty], [tx + tw - 14, ty], [tx + tw, ty + 14], [tx + tw, ty + th], [tx, ty + th]], '#f2c230');
    c.rect(tx, ty + th - 40, tw, 26, '#c8463a');
    c.rect(tx, ty + 6, tw, 8, '#fde58a');
    for (let k = 0; k < 6; k++) c.rect(tx + 24 + k * 82, ty + 30, 62, 56, '#3a4a6e');
    for (let k = 0; k < 6; k++) c.rect(tx + 24 + k * 82, ty + 30, 62, 14, '#7b8fb8', 0.6);
    c.rect(tx + tw - 40, ty + 26, 26, 92, '#3a4a6e');
    c.circle(tx + 90, ty + th + 12, 16, '#1d1820');
    c.circle(tx + tw - 90, ty + th + 12, 16, '#1d1820');
    c.glow(tx + tw - 8, ty + th - 50, 60, '#fff2b0', 0.8);
  },

  /** Rows of solar panels on a savanna with an acacia tree (Kenya). */
  solar(c, r) {
    c.gradient(0, H * 0.55, [[0, '#2f6fbf'], [0.7, '#8cc6ec'], [1, '#d8eef2']]);
    c.glow(W * 0.82, H * 0.12, 380, '#fff4c8', 0.6);
    c.circle(W * 0.82, H * 0.12, 40, '#fffbe8');
    cloud(c, W * 0.25, H * 0.16, 70, '#ffffff', 0.85);
    cloud(c, W * 0.55, H * 0.24, 46, '#ffffff', 0.7);
    c.ridge(H * 0.52, 22, 0.003, '#6f8fa0', 3, { octaves: 2 });
    c.ridge(H * 0.56, 12, 0.006, '#8a9a6a', 4, { octaves: 2 });
    c.gradient(H * 0.56, H, [[0, '#c9a45a'], [1, '#9a7434']]);
    for (let i = 0; i < 260; i++) c.line(r() * W, H * 0.6 + r() * H * 0.4, 0, 0, 0, '#000', 0);
    for (let i = 0; i < 500; i++) {
      const x = r() * W;
      const y = H * 0.58 + r() * H * 0.42;
      c.line(x, y, x + (r() - 0.5) * 6, y - 8 - r() * 10, 2, r() < 0.5 ? '#e0c070' : '#8a6a30', 0.6);
    }
    // panel rows, receding to the horizon
    for (let row = 0; row < 7; row++) {
      const t = row / 6;
      const y = H * 0.6 + t * t * H * 0.36;
      const ph = 16 + t * 70;
      const x0 = W * (0.36 - t * 0.36);
      const x1 = W * (1.0 + t * 0.1);
      const tilt = ph * 0.9;
      c.poly([[x0, y + tilt], [x1, y + tilt], [x1 - ph * 0.4, y], [x0 + ph * 0.4, y]], '#1d3f7a', 1, shadeV(y, y + tilt, '#3f74c4', '#16336a'));
      for (let k = 1; k < 3; k++) c.line(x0 + ph * 0.4 * (1 - k / 3), y + (tilt * k) / 3, x1 - ph * 0.4 * (1 - k / 3), y + (tilt * k) / 3, 1 + t, '#8fb6e8', 0.6);
      for (let x = x0 + 60; x < x1; x += 40 + t * 80) c.line(x, y + tilt, x + ph * 0.25, y, 1 + t, '#8fb6e8', 0.5);
      c.rect(x0, y + tilt, x1 - x0, 3 + t * 6, '#5b4a3a', 0.8);
    }
    // acacia
    c.line(W * 0.14, H * 0.62, W * 0.15, H * 0.38, 16, '#3b2a1e');
    c.line(W * 0.145, H * 0.45, W * 0.1, H * 0.34, 9, '#3b2a1e');
    c.line(W * 0.15, H * 0.44, W * 0.2, H * 0.33, 9, '#3b2a1e');
    c.ellipse(W * 0.15, H * 0.32, 190, 34, '#3f5a2a');
    c.ellipse(W * 0.12, H * 0.3, 120, 24, '#567a34');
  },

  /** A glowing fissure eruption at night on a dark lava field (Iceland). */
  volcano(c, r) {
    c.gradient(0, H * 0.6, [[0, '#0b0f24'], [0.6, '#24183a'], [1, '#5a2a30']]);
    stars(c, r, 220, H * 0.45, 0.8);
    // plume lit from below
    for (let i = 0; i < 26; i++) {
      const t = i / 25;
      const x = W * (0.5 + (r() - 0.5) * 0.12) + t * 160;
      const y = H * 0.5 - t * H * 0.42;
      c.circle(x, y, 60 + t * 110, mix(hex('#c8603a'), hex('#3a3040'), Math.min(1, t * 1.4)), 0.35);
    }
    c.ridge(H * 0.55, 60, 0.0016, '#1a1420', 21, { octaves: 3, sharp: true });
    c.glow(W * 0.5, H * 0.62, 620, '#ff7a2a', 0.65, 1.6);
    c.ridge(H * 0.66, 18, 0.004, '#140f16', 22, { octaves: 2 });
    // the fissure and its lava fountains
    const n = noise1(5);
    const crack = [];
    for (let x = W * 0.12; x <= W * 0.9; x += 8) crack.push([x, H * 0.66 + n(x * 0.01) * 14 - (x - W * 0.5) * 0.04]);
    for (let k = 0; k + 1 < crack.length; k++) c.line(crack[k][0], crack[k][1], crack[k + 1][0], crack[k + 1][1], 9, '#ffcf5a');
    for (let k = 0; k + 1 < crack.length; k++) c.line(crack[k][0], crack[k][1] - 2, crack[k + 1][0], crack[k + 1][1] - 2, 3, '#fff3b8');
    for (let i = 0; i < 6; i++) {
      const [x, y] = crack[Math.floor((0.1 + i * 0.15 + r() * 0.08) * crack.length)];
      const h = 70 + r() * 130;
      const w = h * 0.55;
      c.poly([[x - 10, y], [x - w, y - h * 0.75], [x - w * 0.6, y - h], [x, y - h * 1.05], [x + w * 0.6, y - h], [x + w, y - h * 0.75], [x + 10, y]], '#e8541c', 0.85);
      c.poly([[x - 8, y], [x - w * 0.5, y - h * 0.7], [x, y - h * 0.9], [x + w * 0.5, y - h * 0.7], [x + 8, y]], '#ff9a2a', 0.95);
      c.poly([[x - 5, y], [x - w * 0.2, y - h * 0.55], [x + w * 0.2, y - h * 0.55], [x + 5, y]], '#ffe8a0');
      for (let k = 0; k < 14; k++) c.circle(x + (r() - 0.5) * w * 2, y - h * (0.7 + r() * 0.5), 4 + r() * 5, '#ffb040', 0.9);
      c.glow(x, y - h * 0.5, 180, '#ff8a3a', 0.35);
    }
    // lava field in front, catching the light
    c.gradient(H * 0.7, H, [[0, '#2a1a1c'], [1, '#0e0a0e']]);
    for (let i = 0; i < 160; i++) {
      const x = r() * W;
      const y = H * 0.72 + r() * H * 0.28;
      c.ellipse(x, y, 20 + r() * 50, 6 + r() * 10, '#c45a2a', 0.12 + 0.25 * (1 - (y - H * 0.7) / (H * 0.3)));
    }
  },

  /** Flooded street of a coastal town under monsoon rain, with palms (Kerala). */
  flood(c, r) {
    c.gradient(0, H * 0.55, [[0, '#5a6470'], [1, '#a9b0b4']]);
    for (let i = 0; i < 9; i++) cloud(c, r() * W, H * (0.05 + r() * 0.2), 80 + r() * 60, '#6e7680', 0.6);
    c.ridge(H * 0.5, 16, 0.004, '#5f7466', 41, { octaves: 2 });
    // houses
    const walls = ['#e8d27a', '#9ad0c2', '#e9a68a', '#f2efe4', '#b9a6d8'];
    let x = -30;
    while (x < W) {
      const w = 150 + r() * 120;
      const h = 120 + r() * 80;
      const base = H * 0.66;
      c.rect(x, base - h, w, h, walls[Math.floor(r() * walls.length)]);
      c.poly([[x - 12, base - h], [x + w / 2, base - h - 50], [x + w + 12, base - h]], '#8a3a2e');
      c.rect(x + w * 0.2, base - h * 0.62, w * 0.22, h * 0.3, '#3b4650');
      c.rect(x + w * 0.58, base - h * 0.62, w * 0.22, h * 0.3, '#3b4650');
      c.rect(x + w * 0.42, base - h * 0.35, w * 0.16, h * 0.35, '#5a3a2a');
      x += w + 20 + r() * 40;
    }
    // palms
    for (const px of [W * 0.08, W * 0.63, W * 0.9]) {
      const top = H * (0.12 + r() * 0.08);
      for (let k = 0; k < 20; k++) {
        const t = k / 20;
        c.circle(px + Math.sin(t * 2.2) * 30, H * 0.66 - t * (H * 0.66 - top), 9, '#5a4632');
      }
      const cx = px + Math.sin(2.2) * 30;
      for (let f = 0; f < 11; f++) {
        const a = Math.PI + (f / 10) * Math.PI + (r() - 0.5) * 0.2; // fronds fan out and droop
        const len = 170 + r() * 50;
        const ex = cx + Math.cos(a) * len;
        const ey = top + Math.abs(Math.sin(a)) * -40 + len * 0.45 * (1 - Math.abs(Math.sin(a)));
        const mx = cx + Math.cos(a) * len * 0.5;
        const my = top - 30 * Math.abs(Math.sin(a));
        c.poly([[cx, top - 6], [mx, my - 14], [ex, ey], [mx, my + 14], [cx, top + 8]], f % 2 ? '#2f6a3a' : '#3f8a46');
      }
      c.circle(cx, top, 16, '#6a4a2a');
    }
    // the water
    c.gradient(H * 0.62, H, [[0, '#8a8670'], [1, '#4a4e44']]);
    for (let i = 0; i < 120; i++) c.rect(r() * W, H * 0.64 + r() * H * 0.36, 40 + r() * 120, 3, '#c9c8b4', 0.25);
    for (let i = 0; i < 30; i++) c.ellipse(r() * W, H * 0.7 + r() * H * 0.3, 30 + r() * 30, 6, '#d8d6c4', 0.3);
    // rain
    for (let i = 0; i < 900; i++) {
      const rx = r() * W;
      const ry = r() * H;
      c.line(rx, ry, rx - 10, ry + 34, 1.6, '#dfe6ea', 0.35);
    }
  },

  /** Stone stairway and temple ruins in the high Andes (Peru). */
  temple(c, r) {
    c.gradient(0, H * 0.5, [[0, '#5d8fd0'], [1, '#d8e6ee']]);
    cloud(c, W * 0.8, H * 0.1, 56, '#ffffff', 0.85);
    const peaks = c.ridge(H * 0.34, 130, 0.0016, '#7c8fb0', 61, { octaves: 3, sharp: true });
    for (const [px, py] of peaks) if (py < H * 0.22) c.rect(px, py, 5, H * 0.22 - py, '#f2f6fa', 0.95);
    c.ridge(H * 0.44, 80, 0.0022, '#4f6a5a', 62, { octaves: 3, sharp: true });
    // terraces on the slopes either side
    for (let k = 0; k < 6; k++) {
      const y = H * 0.46 + k * 26;
      c.ridge(y, 8, 0.004, k % 2 ? '#5f8a3e' : '#76a24e', 70 + k, { octaves: 1 });
      c.ridge(y + 3, 8, 0.004, '#3f5e2c', 70 + k, { octaves: 1, bottom: y + 9 });
    }
    // the temple: a stepped platform of fitted stones
    const stone = ['#a89a84', '#b8aa92', '#988a76', '#c4b69c'];
    const tiers = [
      [W * 0.16, H * 0.62, W * 0.68, 70],
      [W * 0.24, H * 0.52, W * 0.52, 66],
      [W * 0.32, H * 0.42, W * 0.36, 62],
    ];
    for (const [tx, ty, tw, th] of tiers) {
      for (let y = ty; y < ty + th; y += 20) {
        for (let x = tx + (Math.floor(y / 20) % 2) * 22; x < tx + tw - 10; x += 44 + r() * 14) {
          c.rect(x, y, Math.min(42 + r() * 12, tx + tw - x), 18, stone[Math.floor(r() * stone.length)]);
        }
      }
      c.rect(tx, ty, tw, 6, '#d6c8ae');
      c.rect(tx + tw - 18, ty, 18, th, '#000000', 0.15);
    }
    // painted walls of the shrine on top
    c.rect(W * 0.4, H * 0.32, W * 0.2, H * 0.1, '#bcae96');
    c.rect(W * 0.4, H * 0.34, W * 0.2, 12, '#b4483a');
    c.rect(W * 0.4, H * 0.36, W * 0.2, 5, '#e0b040');
    c.rect(W * 0.485, H * 0.37, W * 0.03, H * 0.05, '#3a3028');
    // the ceremonial stairway, straight up the middle
    for (let st = 0; st < 16; st++) {
      const y = H * 0.42 + st * 21;
      const half = 34 + st * 7;
      c.rect(W / 2 - half, y, half * 2, 21, st % 2 ? '#c8baa0' : '#d8caae');
      c.rect(W / 2 - half, y + 16, half * 2, 5, '#7a6e5e');
    }
    c.gradient(H * 0.84, H, [[0, '#5f8a3e'], [1, '#3f6a2c']]);
  },

  /** A white high-speed train crossing a viaduct below a snowy peak (Japan). */
  train(c, r) {
    c.gradient(0, H * 0.6, [[0, '#4a86d4'], [1, '#cfe4f2']]);
    c.poly([[W * 0.42, H * 0.6], [W * 0.62, H * 0.16], [W * 0.66, H * 0.15], [W * 0.88, H * 0.6]], '#6e7fa8');
    c.poly([[W * 0.565, H * 0.28], [W * 0.62, H * 0.16], [W * 0.66, H * 0.15], [W * 0.72, H * 0.29], [W * 0.68, H * 0.27], [W * 0.65, H * 0.31], [W * 0.61, H * 0.27]], '#f4f8fc');
    c.ridge(H * 0.6, 26, 0.003, '#4f7a5a', 81, { octaves: 2 });
    c.gradient(H * 0.62, H, [[0, '#6e9a5a'], [1, '#3e6a3a']]);
    for (let i = 0; i < 40; i++) c.circle(r() * W, H * 0.66 + r() * H * 0.3, 20 + r() * 30, r() < 0.5 ? '#4f7f44' : '#5f9050', 0.8);
    // viaduct
    const dy = H * 0.58;
    c.rect(0, dy, W, 24, '#c8ccd2');
    c.rect(0, dy + 24, W, 8, '#8a9098');
    for (let x = 40; x < W; x += 160) c.rect(x, dy + 30, 30, H - dy, '#a8aeb6');
    // the train: a long nose to the right
    const ty = dy - 64;
    c.poly([[-10, ty], [W * 0.7, ty], [W * 0.84, ty + 30], [W * 0.88, ty + 60], [-10, ty + 60]], '#f6f8fa', 1, shadeV(ty, ty + 60, '#ffffff', '#c8d0d8'));
    c.rect(-10, ty + 36, W * 0.84, 10, '#1f5fb4');
    c.poly([[W * 0.7, ty + 4], [W * 0.8, ty + 24], [W * 0.7, ty + 24]], '#24304a');
    for (let x = 20; x < W * 0.66; x += 44) c.rect(x, ty + 12, 26, 14, '#2e3a56');
    for (let x = 180; x < W * 0.7; x += 210) c.rect(x, ty + 4, 4, 52, '#b8c0c8');
    // speed lines
    for (let i = 0; i < 18; i++) c.rect(-20 + r() * W * 0.5, ty + r() * 60, 80 + r() * 160, 2, '#ffffff', 0.5);
  },

  /** A boulevard of cream stone facades behind a row of young trees (Paris). */
  trees(c, r) {
    c.gradient(0, H * 0.4, [[0, '#6aa8e0'], [1, '#d6ecf6']]);
    // facades
    const fy = H * 0.12;
    for (let x = -40; x < W; x += 230) {
      c.rect(x, fy + 40, 226, H * 0.6, '#efe2c4');
      c.poly([[x - 4, fy + 44], [x + 20, fy], [x + 206, fy], [x + 230, fy + 44]], '#7d8a9a');
      for (let k = 0; k < 3; k++) c.rect(x + 40 + k * 60, fy + 8, 22, 26, '#5a6878');
      for (let row = 0; row < 5; row++) {
        for (let k = 0; k < 4; k++) {
          const wx = x + 18 + k * 52;
          const wy = fy + 64 + row * 70;
          c.rect(wx, wy, 26, 44, '#4a5868');
          c.rect(wx, wy, 26, 10, '#9fb4c8', 0.6);
        }
        c.rect(x + 8, fy + 110 + row * 70, 210, 4, '#3a3a40', 0.8);
      }
      c.rect(x + 222, fy + 40, 4, H * 0.6, '#d0c2a4');
    }
    // pavement and road
    c.rect(0, H * 0.74, W, H * 0.06, '#b8b2a8');
    c.gradient(H * 0.8, H, [[0, '#6a6a70'], [1, '#4a4a52']]);
    for (let x = 30; x < W; x += 160) c.rect(x, H * 0.9, 80, 8, '#e8e8e0');
    // trees: trunk, then layered round crowns
    for (let x = 60; x < W; x += 200) {
      c.rect(x - 7, H * 0.5, 14, H * 0.26, '#5a4636');
      c.circle(x, H * 0.44, 92, '#3f7a3a');
      c.circle(x - 34, H * 0.4, 58, '#4f8f44');
      c.circle(x + 30, H * 0.36, 52, '#5fa04e');
      c.circle(x - 10, H * 0.32, 40, '#72b45a');
      c.ellipse(x, H * 0.76, 70, 8, '#3a3a36', 0.35);
    }
  },

  /** A ferry pitching in a storm, dark clouds and white crests (Greek islands). */
  ferry(c, r) {
    c.gradient(0, H * 0.55, [[0, '#2a3038'], [1, '#6a747c']]);
    for (let i = 0; i < 14; i++) cloud(c, r() * W, H * (0.04 + r() * 0.3), 70 + r() * 80, r() < 0.5 ? '#3a4048' : '#4a525a', 0.75);
    c.ridge(H * 0.5, 24, 0.003, '#4a5248', 91, { octaves: 2, bottom: H * 0.56 });
    c.rect(W * 0.12, H * 0.44, 30, 40, '#e8e4dc');
    c.gradient(H * 0.54, H, [[0, '#3a5a64'], [1, '#14262e']]);
    // the ferry, slightly tilted
    const fx = W * 0.32;
    const fy = H * 0.5;
    const tilt = 0.06;
    const P = (x, y) => [fx + x, fy + y + x * tilt];
    c.poly([P(0, 40), P(520, 40), P(560, 0), P(-30, 0)].map(([x, y]) => [x, y]), '#c8d2dc');
    c.poly([P(-30, 0), P(560, 0), P(520, 40), P(0, 40)], '#e8eef4');
    c.poly([P(-20, 40), P(530, 40), P(500, 86), P(10, 86)], '#1f3f7a');
    c.poly([P(60, 0), P(420, 0), P(400, -50), P(90, -50)], '#f2f4f6');
    c.poly([P(120, -50), P(360, -50), P(340, -88), P(150, -88)], '#e6eaee');
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
    c.fill('#1f4a26');
    for (let i = 0; i < 1400; i++) {
      const x = r() * W;
      const y = r() * H;
      const s = 18 + r() * 34;
      const g = ['#1f5a2a', '#2a6a30', '#357a36', '#3f8a3e', '#2a5a2e'][Math.floor(r() * 5)];
      c.circle(x, y, s, g);
      c.circle(x - s * 0.25, y - s * 0.25, s * 0.5, '#5aa04a', 0.5);
    }
    // the river
    const pts = [];
    for (let y = -20; y <= H + 20; y += 10) pts.push([W * 0.5 + Math.sin(y * 0.008) * 260 + Math.sin(y * 0.021) * 60, y]);
    const left = pts.map(([x, y]) => [x - 46, y]);
    const right = pts.map(([x, y]) => [x + 46, y]).reverse();
    c.poly([...left, ...right], '#8a6a42');
    c.poly([...pts.map(([x, y]) => [x - 30, y]), ...pts.map(([x, y]) => [x + 30, y]).reverse()], '#a07a4a');
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
    for (let i = 0; i < 18; i++) {
      const t = 0.1 + r() * 0.8;
      c.ellipse(t * W + (r() - 0.5) * 80, H * 0.85 - t * H * 0.8 + (r() - 0.5) * 60, 40 + r() * 60, 14 + r() * 16, '#0a0c20', 0.5);
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
    c.gradient(0, H * 0.6, [[0, '#5a8ac8'], [1, '#d8e4ec']]);
    cloud(c, W * 0.2, H * 0.14, 60, '#ffffff', 0.8);
    c.gradient(H * 0.66, H, [[0, '#3a6a8a'], [1, '#1a3a5a']]);
    // ship hull
    c.poly([[W * 0.05, H * 0.6], [W * 0.95, H * 0.6], [W * 0.9, H * 0.74], [W * 0.1, H * 0.74]], '#2a3a4a');
    c.rect(W * 0.05, H * 0.6, W * 0.9, 10, '#c8463a');
    // containers
    const colors = ['#c8463a', '#2a6ab0', '#e8a830', '#3a8a5a', '#8a4a9a', '#d8d8d8', '#e46a2a'];
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
