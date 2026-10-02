#!/usr/bin/env node
// Paints the original illustrations used by the offline fixture stories
// (config/fixtures/img/*.png). Everything is procedural and deterministic: no
// photographs, no third-party artwork. Run it again after changing a scene:
//
//   node config/fixtures/make-images.mjs [scene ...]
//
// Scenes are composed like news photographs: one clear subject, a horizon, one
// motivated key light. Forms are hand-shaped rather than geometric: noisy
// silhouettes, rounded volumes lit from one side through 3-4 tone hue-shifted
// ramps, textured surfaces, varied repeats (no two houses, trees or windows
// alike) and atmospheric perspective, so they still read as pictures after the
// channel pixelates them to 104x62 (video wall) and 416x234 (full screen).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Canvas, blob, encodePng, hex, mix, noise1, noise2, ramp, rng } from './raster.mjs';
import { H, W, clamp01, clouds, groundShadow, haze, pickOf, reflect, smooth, sparkle, tree } from './kit.mjs';
import { NEWS_GRADES, NEWS_SCENES } from './scenes-news.mjs';
import { MORE_GRADES, MORE_SCENES } from './scenes-more.mjs';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'img');

// ---------------------------------------------------------------- scenes

export const SCENES = {
  /** A yellow tram climbs a riverside street at dusk; houses of every colour stacked up the hill behind (Lisbon). */
  tram(c, r) {
    c.gradient(0, H * 0.6, [[0, '#1a2240'], [0.5, '#46496a'], [0.8, '#a8706a'], [1, '#e6a46e']]);
    clouds(c, 11, { y0: 0, y1: H * 0.3, scale: 0.0024, cover: 0.12, lit: '#eaa888', shade: '#3a3c5a', alpha: 0.75, stretch: 3 });
    c.glow(W * 0.85, H * 0.5, 600, '#f0a060', 0.28);
    // the hill, four rows of houses from the top down; far rows bluer and dimmer
    const hill = noise1(4);
    const rowY = (x, row) => H * (0.16 + row * 0.1) + (x / W) * H * 0.06 + hill(x * 0.004 + row * 9) * 20;
    const walls = ['#d8b070', '#ecd2a8', '#cc8670', '#a8b8c8', '#f2e8d8', '#dca06c', '#c4ae90', '#dcc26e', '#a4b49c', '#e0b4a4'];
    const roofTone = ramp([[0, '#2e1814'], [0.45, '#7a3c28'], [0.8, '#b8603e'], [1, '#d8865a']]);
    const tiles = noise2(12);
    for (let row = 0; row < 4; row++) {
      const dim = [0.5, 0.34, 0.18, 0.05][row];
      const air = hex('#3a3e60');
      let x = -60 - r() * 60;
      while (x < W + 60) {
        const w = 64 + r() * 96;
        const floors = 2 + Math.floor(r() * 3);
        const h = floors * 34 + 16;
        const top = rowY(x + w / 2, row) - r() * 18;
        const wall = hex(pickOf(r, walls));
        const shade = (k) => mix(mix(wall, hex('#1a1c34'), k), air, dim);
        // wall: lit from the low sun on the right, a soft band of shadow under the eaves
        c.paintBox(x, top, x + w, top + h + 140, (px, py) => [shade(0.12 + (px - x) / w * -0.08 + smooth(top, top + 14, py) * -0.1 + 0.1 + tiles(px * 0.08, py * 0.08) * 0.03), 1]);
        c.rect(x, top + h, w, 140, '#000000', 0.18);
        // hipped tile roof: two planes, the sunward one warm
        const eave = 7 + r() * 4;
        const ridge = top - 18 - r() * 10;
        const peak = x + w * (0.35 + r() * 0.3);
        c.poly([[x - eave, top + 3], [peak - w * 0.18, ridge], [peak + w * 0.18, ridge], [x + w + eave, top + 3]], '#000', 1, (px, py) => mix(roofTone(0.3 + (px > peak ? 0.45 : 0.1) + tiles(px * 0.05, py * 0.35) * 0.12), air, dim));
        c.rect(x - eave, top + 1, w + eave * 2, 4, mix(hex('#1a1014'), air, dim));
        if (r() < 0.4) c.rect(peak + w * 0.12, ridge - 16, 9, 16, mix(hex('#8a6a5a'), air, dim));
        // tall windows with shutters, some lit; a small iron balcony on the first floor now and then
        const cols = Math.max(1, Math.round(w / 40));
        const shutter = hex(pickOf(r, ['#3a5a3a', '#5a3a2a', '#2a3a5a', '#6a6a6a']));
        for (let f = 0; f < floors; f++) {
          for (let i = 0; i < cols; i++) {
            const wx = x + ((i + 0.5) / cols) * w - 6;
            const wy = top + 14 + f * 34;
            const on = r() < 0.32;
            c.rect(wx - 5, wy - 1, 4, 22, mix(shutter, air, dim));
            c.rect(wx + 13, wy - 1, 4, 22, mix(shutter, air, dim));
            c.rect(wx, wy, 12, 20, on ? '#f7c472' : mix(hex('#141828'), air, dim * 0.6));
            if (on) c.glow(wx + 6, wy + 10, 26, '#f0a050', 0.14 * (1 - dim));
            if (f === 0 && r() < 0.3) c.rect(wx - 6, wy + 18, 24, 2, '#14141c');
          }
        }
        x += w - 6 + r() * 8;
      }
    }
    // the church on the hilltop: a bell tower with a cupola, catching the last light
    const bx = W * 0.62;
    const by = rowY(bx, 0) - 150;
    const towerTone = ramp([[0, '#4a4252'], [0.6, '#b8a894'], [1, '#f0d8b8']]);
    c.litPoly([[bx, by + 200], [bx, by], [bx + 54, by], [bx + 54, by + 200]], bx + 27, by + 100, 40, 160, towerTone, { lx: 0.8, ly: -0.3, lz: 0.4, ambient: 0.25 });
    c.litPoly(blob(bx + 27, by, 32, 30, 7, 0.04).filter(([, py]) => py <= by + 1), bx + 27, by, 32, 30, towerTone, { lx: 0.8, ly: -0.5, lz: 0.4 });
    c.rect(bx + 17, by + 26, 20, 32, '#1a1820');
    c.rect(bx - 4, by + 64, 62, 5, '#e0ccb0');
    // the street: cobbles, two rails, the overhead wire
    const st = noise2(31);
    c.paintBox(0, H * 0.66, W, H * 0.86, (x, y) => [mix(hex('#2c2830'), hex('#5a5258'), clamp01(0.3 + st(x * 0.06, y * 0.14) * 0.4 + (y - H * 0.66) / H)), 1]);
    for (const ry of [H * 0.76, H * 0.8]) c.line(0, ry + 6, W, ry - 6, 3, '#a89c94');
    c.line(0, H * 0.33, W, H * 0.3, 2, '#0e0e16');
    // the river below the quay wall, mirroring the sky and the lights
    c.rect(0, H * 0.86, W, 8, '#7a7068');
    c.gradient(H * 0.87, H, [[0, '#6a5060'], [1, '#14182c']]);
    reflect(c, H * 0.87, H, '#1a1e34', 0.55, 13, { ripple: 10 });
    // the tram: a yellow body with a cream roof band, warm-lit windows, trolley pole on the wire
    const tx = W * 0.14;
    const ty = H * 0.5;
    const tw = 560;
    const th = 170;
    const yellow = ramp([[0, '#5a3a0e'], [0.45, '#c08a1c'], [0.8, '#eebc3a'], [1, '#fff0a0']]);
    const shape = [[tx + 30, ty], [tx + tw - 30, ty], [tx + tw - 4, ty + 14], [tx + tw + 8, ty + 46], [tx + tw + 10, ty + th - 14], [tx + tw - 4, ty + th], [tx + 4, ty + th], [tx - 10, ty + th - 14], [tx - 8, ty + 46], [tx + 4, ty + 14]];
    groundShadow(c, tx + tw / 2, ty + th + 10, tw * 0.6, 14, 0.7);
    c.litPoly(shape, tx + tw * 0.4, ty + th * 0.35, tw * 0.65, th, yellow, { lx: 0.75, ly: -0.25, lz: 0.6, ambient: 0.32 });
    c.poly([[tx + 30, ty], [tx + tw - 30, ty], [tx + tw - 4, ty + 14], [tx + 4, ty + 14]], '#efe6cc');
    c.rect(tx - 6, ty + 108, tw + 14, 5, '#7a4a14', 0.7);
    c.rect(tx - 8, ty + th - 22, tw + 16, 9, '#2a1c10', 0.6);
    const pane = (wx, wy, ww, wh) => [[wx + 4, wy], [wx + ww - 4, wy], [wx + ww, wy + 4], [wx + ww, wy + wh], [wx, wy + wh], [wx, wy + 4]];
    for (let k = 0; k < 7; k++) {
      const wx = tx + 22 + k * 74;
      c.poly(pane(wx - 3, ty + 31, 62, 64), '#3a2810');
      c.poly(pane(wx, ty + 34, 56, 58), '#000', 1, (px, py) => mix(hex('#ffe4a8'), hex('#c8884a'), (py - ty - 34) / 58));
      c.rect(wx, ty + 62, 56, 2, '#5a3a1a', 0.6);
      if (r() < 0.6) c.litPoly(blob(wx + 14 + r() * 26, ty + 80, 9, 13, k, 0.1), wx + 28, ty + 80, 10, 14, ramp([[0, '#3a2414'], [1, '#7a4a2a']]), { ambient: 0.4 });
    }
    c.rect(tx + tw - 50, ty + 34, 30, 120, '#2a2028', 0.85);
    c.rect(tx + 220, ty + 4, 70, 18, '#1e1a1e');
    c.rect(tx + 226, ty + 7, 58, 12, '#f0d890', 0.9);
    c.line(tx + 300, ty, tx + 380, H * 0.315, 4, '#141218');
    for (const wx of [tx + 80, tx + tw - 90]) {
      c.ellipse(wx, ty + th + 6, 34, 13, '#120e12');
      c.ellipse(wx - 8, ty + th + 3, 12, 5, '#6a5a58');
    }
    c.glow(tx + tw + 8, ty + th - 50, 120, '#fff2c8', 0.9);
    c.glow(tx + tw * 0.5, ty + 60, 340, '#f0b060', 0.1);
    // its warm light on the wet cobbles
    c.paintBox(tx - 30, ty + th + 12, tx + tw + 140, H * 0.86, (x, y) => [hex('#f0b858'), 0.3 * (1 - (y - ty - th - 12) / (H * 0.86 - ty - th - 12)) * clamp01(0.5 + st(x * 0.05, y * 0.35))]);
  },
  /** A fissure eruption at night: a low curtain of lava along the crack, spatter arcs, a lit plume of gas (Iceland). */
  volcano(c, r) {
    c.gradient(0, H * 0.6, [[0, '#07080f'], [0.55, '#151220'], [1, '#2e1a1e']]);
    sparkle(c, r, 220, 0, 0, W, H * 0.3, '#c8c8e0', 0.5, [1, 1, 2]);
    // the plume: a heavy column leaning downwind, lit orange underneath and dark violet at the top
    const sm = noise2(41);
    const smokeTone = ramp([[0, '#1e1620'], [0.35, '#4a2a2c'], [0.7, '#b8522a'], [1, '#f8a050']]);
    c.paintBox(0, 0, W, H * 0.64, (x, y) => {
      const lift = (H * 0.62 - y) / (H * 0.62);
      const cx = W * 0.48 + lift * lift * 330 + sm(y * 0.003, 3) * 90;
      const spread = 170 + lift * 330;
      const d = Math.abs(x - cx) / spread;
      const v = sm.fbm(x * 0.0035, y * 0.005, 5) * 0.7 + (1 - d) * 0.9 - lift * 0.1;
      if (v < 0.4) return null;
      const above = sm.fbm(x * 0.0035, (y - 18) * 0.005, 5);
      const rim = clamp01(0.5 + (sm.fbm(x * 0.0035, y * 0.005, 5) - above) * 5);
      const heat = clamp01(1 - lift * 1.6) * clamp01(1.2 - d);
      return [smokeTone(clamp01(heat * 0.9 + rim * 0.3)), smooth(0.4, 0.75, v) * 0.95];
    });
    // the far ridge, rimmed by the glow
    const ridgeTop = c.ridge(H * 0.585, 46, 0.0022, '#120c10', 6, { octaves: 4, shade: (x, y) => mix(hex('#160e12'), hex('#4a2018'), smooth(H * 0.6, H * 0.52, y) * (1 - Math.abs(x - W * 0.5) / W)) });
    for (let k = 1; k < ridgeTop.length - 2; k++) c.line(ridgeTop[k][0], ridgeTop[k][1], ridgeTop[k + 1][0], ridgeTop[k + 1][1], 2, '#8a3a1e', 0.5 * (1 - Math.abs(ridgeTop[k][0] - W * 0.5) / (W * 0.6)));
    // the lava field: dark crust with a network of glowing cracks near the fissure
    const rock = noise2(42);
    const crust = ramp([[0, '#0a080c'], [0.5, '#1e1618'], [1, '#3a2420']]);
    const lavaTone = ramp([[0, '#4a0c06'], [0.35, '#b02a10'], [0.7, '#f07a1e'], [0.9, '#ffc860'], [1, '#fff6d0']]);
    const fy = (x) => H * 0.62 + Math.sin(x * 0.006) * 8 + (x / W) * 14;
    c.paintBox(0, H * 0.6, W, H, (x, y) => {
      const near = Math.max(0, 1 - Math.abs(y - fy(x)) / (H * 0.2)) * (1 - Math.abs(x - W * 0.5) / (W * 0.62));
      const cracks = rock.ridged(x * 0.01, y * 0.028, 4);
      const flow = smooth(0.15, 0.6, rock.fbm(x * 0.003, y * 0.012, 3) + near * 0.8 - 0.35);
      const glow = smooth(0.5, 0.62, cracks) * flow;
      const base = crust(clamp01(0.35 + rock.fbm(x * 0.02, y * 0.05, 3) * 0.4 + near * 0.3));
      return [glow > 0.02 ? mix(base, lavaTone(0.45 + glow * 0.5), glow) : base, 1];
    });
    // the curtain of fire: a ragged, low wall of lava along the crack with taller fountains in places
    const lv = noise2(43);
    const fountains = [0.24, 0.38, 0.47, 0.6, 0.73].map((t) => ({ x: W * t + (r() - 0.5) * 40, h: 50 + r() * 110, w: 30 + r() * 40 }));
    const heightAt = (x) => {
      let h = 14 + lv.fbm(x * 0.02, 1, 4) * 16;
      for (const f of fountains) h += f.h * Math.exp(-(((x - f.x) / f.w) ** 2));
      return h * smooth(W * 0.12, W * 0.2, x) * smooth(W * 0.88, W * 0.8, x);
    };
    c.paintBox(W * 0.1, H * 0.3, W * 0.9, H * 0.66, (x, y) => {
      const base = fy(x);
      const top = base - heightAt(x) * (0.85 + lv(x * 0.05, y * 0.03) * 0.3);
      if (y > base + 3 || y < top - 6) return null;
      const u = clamp01((base - y) / Math.max(8, base - top));
      const ragged = lv.fbm(x * 0.03, y * 0.04, 3);
      const a = smooth(1.02, 0.8, u + ragged * 0.25);
      return a > 0 ? [lavaTone(clamp01(1 - u * 0.75 + ragged * 0.15)), a] : null;
    });
    for (const f of fountains) c.glow(f.x, fy(f.x) - f.h * 0.35, f.h * 2.2 + 120, '#ff6a20', 0.32);
    // spatter: clots thrown in arcs from the fountains, cooling as they fall
    for (const f of fountains) {
      for (let i = 0; i < 70; i++) {
        const vx = (r() - 0.5) * 9;
        const vy = -(4 + r() * f.h * 0.07);
        const t = r() * 26;
        const x = f.x + vx * t;
        const y = fy(f.x) - f.h * 0.3 + vy * t + 0.32 * t * t;
        if (y > fy(x) + 4) continue;
        c.glow(x, y, 3 + r() * 3, lavaTone(0.95 - t / 40), 0.9, 1);
      }
    }
    c.glow(W * 0.5, H * 0.62, 760, '#ff4a1a', 0.2);
    // foreground boulders, rim-lit from the fissure behind them
    for (let i = 0; i < 6; i++) {
      const bx = r() * W;
      const by = H * (0.86 + r() * 0.14);
      const bw = 80 + r() * 160;
      c.litPoly(blob(bx, by, bw, bw * 0.45, Math.floor(r() * 1e6), 0.3), bx, by, bw, bw * 0.45, ramp([[0, '#050406'], [0.7, '#1a1214'], [1, '#c8582a']]), { lx: (W * 0.5 - bx) / W, ly: -1, lz: -0.2, ambient: 0, jitter: (x, y) => rock(x * 0.05, y * 0.05) * 0.1 });
    }
  },
  /** Rows of solar panels on the savanna in late light; a flat-topped acacia against the sky (Kenya). */
  solar(c, r) {
    c.gradient(0, H * 0.58, [[0, '#2a4670'], [0.55, '#86a2bc'], [1, '#f0cc9a']]);
    clouds(c, 51, { y0: 0, y1: H * 0.36, scale: 0.0026, cover: 0.2, lit: '#fff0dc', shade: '#8a96ae', alpha: 0.8, stretch: 3.4 });
    c.glow(W * 0.88, H * 0.46, 520, '#ffd8a0', 0.45);
    c.glow(W * 0.88, H * 0.46, 40, '#fff6e0', 1.2, 1);
    // far blue hills, then a nearer brown ridge (atmospheric perspective)
    c.ridge(H * 0.535, 36, 0.0025, '#6c7e98', 3, { octaves: 4 });
    c.ridge(H * 0.565, 18, 0.005, '#7a6e58', 4, { octaves: 3 });
    const grass = noise2(52);
    const grassTone = ramp([[0, '#4a3418'], [0.4, '#8a6a34'], [0.75, '#c8a058'], [1, '#e8cc88']]);
    c.paintBox(0, H * 0.57, W, H, (x, y) => [grassTone(0.35 + grass.fbm(x * 0.02, y * 0.08, 4) * 0.5 + (1 - (y - H * 0.57) / (H * 0.43)) * 0.25), 1]);
    for (let i = 0; i < 900; i++) {
      const x = r() * W;
      const y = H * 0.6 + r() ** 0.7 * H * 0.4;
      const len = 4 + (y - H * 0.6) * 0.06 * (0.5 + r());
      c.line(x, y, x + (r() - 0.5) * len * 0.6, y - len, 1 + (y - H * 0.6) / 200, grassTone(0.55 + r() * 0.45), 0.55);
    }
    // panel rows in perspective, each reflecting the sky
    const panelTone = ramp([[0, '#0e1a30'], [0.5, '#2c4a72'], [0.85, '#7e98b8'], [1, '#f0d0a8']]);
    for (let row = 0; row < 7; row++) {
      const t = row / 6;
      const y = H * 0.6 + t * t * H * 0.33;
      const ph = 14 + t * 74;
      const x0 = W * (0.42 - t * 0.44);
      const x1 = W * (1.02 + t * 0.06);
      const tilt = ph * 0.85;
      groundShadow(c, (x0 + x1) / 2 + ph, y + tilt + 4 + t * 10, (x1 - x0) / 2, 6 + t * 14, 0.5);
      c.poly([[x0, y + tilt], [x1, y + tilt], [x1 - ph * 0.4, y], [x0 + ph * 0.4, y]], '#000', 1, (px, py) => panelTone(0.25 + (1 - (py - y) / tilt) * 0.55 + smooth(W * 0.5, W, px) * 0.3 * (1 - (py - y) / tilt)));
      for (let k = 1; k < 3; k++) c.line(x0 + ph * 0.4 * (1 - k / 3), y + (tilt * k) / 3, x1 - ph * 0.4 * (1 - k / 3), y + (tilt * k) / 3, 1 + t, '#0a1220', 0.5);
      for (let x = x0 + 30; x < x1; x += 22 + t * 46) c.line(x, y + tilt, x + ph * 0.32, y, 1 + t * 1.5, '#0a1220', 0.5);
      c.line(x0 + ph * 0.4, y, x1 - ph * 0.4, y, 1.5 + t * 2, '#c8d4e0', 0.7);
      c.rect(x0, y + tilt, x1 - x0, 2 + t * 6, '#1a140e', 0.9);
      for (let x = x0 + 20; x < x1; x += 90 + t * 120) c.rect(x, y + tilt, 3 + t * 4, 6 + t * 16, '#2a2018');
    }
    // the acacia: a trunk that forks low into spreading limbs, under a wide, flat, layered crown lit from the right
    const ax = W * 0.17;
    const ag = H * 0.66;
    const crownY = H * 0.27;
    const bark = ramp([[0, '#140e0a'], [0.6, '#3a2c20'], [1, '#6a5038']]);
    const limb = (x0, y0, x1, y1, w0, w1) => {
      const nx = -(y1 - y0);
      const ny = x1 - x0;
      const len = Math.hypot(nx, ny);
      const ox = (nx / len) * 0.5;
      const oy = (ny / len) * 0.5;
      const pts = [[x0 + ox * w0, y0 + oy * w0], [x1 + ox * w1, y1 + oy * w1], [x1 - ox * w1, y1 - oy * w1], [x0 - ox * w0, y0 - oy * w0]];
      c.litPoly(pts, (x0 + x1) / 2, (y0 + y1) / 2, Math.abs(x1 - x0) / 2 + w0, Math.abs(y1 - y0) / 2 + w0, bark, { lx: 0.8, ly: -0.2, lz: 0.4, ambient: 0.15 });
    };
    groundShadow(c, ax + 90, ag + 8, 260, 18, 0.45);
    limb(ax, ag, ax + 8, H * 0.5, 26, 18);
    limb(ax + 8, H * 0.5, ax - 110, H * 0.31, 14, 6);
    limb(ax + 8, H * 0.5, ax + 140, H * 0.3, 14, 6);
    limb(ax + 4, H * 0.52, ax + 24, H * 0.29, 10, 5);
    limb(ax - 50, H * 0.4, ax - 190, H * 0.31, 7, 3);
    limb(ax + 70, H * 0.4, ax + 210, H * 0.3, 7, 3);
    const crown = ramp([[0, '#10140a'], [0.4, '#262e14'], [0.75, '#4e5824'], [0.92, '#8a9440'], [1, '#c8c070']]);
    const foliage = noise2(53);
    const layers = [[-90, 6, 150, 30], [110, 4, 140, 28], [10, -8, 230, 34], [-200, 14, 80, 18], [230, 12, 70, 16], [-40, -26, 150, 22], [70, -30, 110, 18]];
    for (const [dx, dy, rw, rh] of layers) {
      const cx = ax + dx;
      const cy = crownY + dy;
      c.litPoly(blob(cx, cy, rw, rh, Math.floor(r() * 1e6), 0.3, 90), cx, cy, rw, rh * 1.4, crown, { lx: 0.5, ly: -0.85, lz: 0.35, ambient: 0.06, jitter: (x, y) => foliage(x * 0.05, y * 0.14) * 0.28 });
    }
  },

  /** A white high-speed train along the rice fields below a snow-capped volcano in morning light (Japan). */
  train(c, r) {
    c.gradient(0, H * 0.6, [[0, '#3e6290'], [0.6, '#9ab4c8'], [1, '#ecdcc4']]);
    clouds(c, 61, { y0: 0, y1: H * 0.28, scale: 0.0022, cover: 0.25, lit: '#fbf4ea', shade: '#9aaabe', alpha: 0.75, stretch: 4 });
    // the mountain: concave flanks; gullies run downslope, lit on their sunward (left) side; snow fills the upper gullies
    const peakX = W * 0.6;
    const peakY = H * 0.12;
    const baseY = H * 0.6;
    const half = W * 0.47;
    const m = noise2(62);
    const profile = new Float32Array(W);
    for (let x = 0; x < W; x++) {
      const u = Math.min(1, Math.abs(x - peakX) / half);
      profile[x] = peakY + 6 * Math.min(1, Math.abs(x - peakX) / 30) + (baseY - peakY) * u ** 0.64 + m.fbm(x * 0.012, 0.5, 3) * 7 * u;
    }
    const rockTone = ramp([[0, '#2a3044'], [0.45, '#525a70'], [0.8, '#8e8890'], [1, '#d8bca4']]);
    const snowTone = ramp([[0, '#7a8cac'], [0.5, '#c4cede'], [0.85, '#f4f2ee'], [1, '#fff8ee']]);
    c.paintBox(0, peakY - 10, W, baseY + 4, (x, y) => {
      if (y < profile[x]) return null;
      const alt = (baseY - y) / (baseY - peakY);
      const dx = (x - peakX) / half;
      // gullies: ridged noise stretched downslope (along the fall line)
      const along = (x - peakX) * 0.9 / (1 + alt);
      const g = m.ridged(along * 0.03, y * 0.004, 4);
      const gl = m.ridged((along - 3) * 0.03, y * 0.004, 4);
      // gullies are crisp up high and soften down the lower flanks
      const facing = clamp01(0.55 - dx * 1.2 + (g - gl) * (1.5 + alt * 4));
      const snowLine = 0.7 + (0.45 - g) * 0.55 + m(x * 0.008, 3) * 0.06;
      const isSnow = alt > snowLine;
      let colour = isSnow ? snowTone(clamp01(facing * 0.85 + 0.15)) : rockTone(clamp01(facing * 0.75 + alt * 0.2));
      // the lower flanks are wooded: darker and greener toward the foothills
      if (!isSnow) colour = mix(colour, hex('#2a3a34'), smooth(0.35, 0.05, alt) * 0.7);
      return [mix(colour, hex('#aebdd0'), 0.2 + (1 - alt) * 0.22), 1];
    });
    // forested foothills, two layers, nearer = darker and greener
    const hillTone = ramp([[0, '#1a2a22'], [0.6, '#34503a'], [1, '#6a845a']]);
    for (const [base, amp, seed, air] of [[H * 0.6, 26, 63, 0.42], [H * 0.665, 34, 64, 0.12]]) {
      const hn = noise2(seed);
      const top = new Float32Array(W);
      for (let x = 0; x < W; x++) top[x] = base - (hn.fbm(x * 0.004, seed, 4) * 0.5 + 0.5) * amp - Math.abs(hn(x * 0.07, 1)) * 9;
      c.paintBox(0, base - amp - 12, W, H * 0.74, (x, y) => (y < top[x] ? null : [mix(hillTone(0.3 + hn.fbm(x * 0.035, y * 0.06, 3) * 0.6 + (x < W * 0.5 ? 0.1 : -0.05)), hex('#a8b8c4'), air), 1]));
    }
    // rice fields: green rows running into the distance, water between them catching the sky
    const field = noise2(65);
    c.paintBox(0, H * 0.78, W, H, (x, y) => {
      const k = (y - H * 0.78) / (H * 0.22);
      const vx = (x - W * 0.35) / (0.7 + k * 0.6) + field(x * 0.002, y * 0.01) * 30;
      const row = Math.sin(vx * 0.06) * 0.5 + 0.5;
      const water = smooth(0.86, 0.95, row) * 0.8;
      const green = mix(hex('#3a5a26'), hex('#8aa048'), clamp01(0.35 + field.fbm(x * 0.01, y * 0.05, 3) * 0.6 + k * 0.2));
      return [mix(green, mix(hex('#b8c8d4'), hex('#5a7a8a'), k), water), 1];
    });
    // the embankment and the train: a long nose, a blue stripe, the sky on its roof
    c.gradient(H * 0.715, H * 0.78, [[0, '#5a5448'], [1, '#2a2622']]);
    c.rect(0, H * 0.712, W, 6, '#8a8478');
    const ty = H * 0.6;
    const nose = [];
    for (let i = 0; i <= 30; i++) {
      const t = i / 30;
      nose.push([W * 0.05 + t * 240, ty + 64 - Math.sqrt(t) * 52]);
    }
    const shape = [...nose, [W * 1.02, ty + 12], [W * 1.02, H * 0.712], [W * 0.05 - 12, H * 0.712]];
    const white = ramp([[0, '#6a7486'], [0.5, '#c4cad4'], [0.85, '#eef0f2'], [1, '#ffffff']]);
    c.poly(shape, '#000', 1, (x, y) => white(0.5 + (1 - (y - ty) / (H * 0.712 - ty)) * 0.5 - smooth(ty + 50, H * 0.712, y) * 0.35));
    c.rect(W * 0.11, ty + 50, W, 9, '#1e4a8e');
    c.rect(W * 0.11, ty + 60, W, 3, '#c8a050', 0.8);
    for (let x = W * 0.24; x < W; x += 34) {
      c.rect(x, ty + 25, 22, 14, '#283246', 0.92);
      c.rect(x + 2, ty + 26, 8, 3, '#d8e4f0', 0.55);
    }
    c.poly([[W * 0.1, ty + 42], [W * 0.165, ty + 22], [W * 0.205, ty + 22], [W * 0.195, ty + 42]], '#18202e');
    for (let x = W * 0.3; x < W; x += 300) c.rect(x, ty + 14, 3, 54, '#9aa2ae', 0.6);
    c.line(0, ty - 18, W, ty - 22, 2, '#3a3e48', 0.8);
    for (let x = 60; x < W; x += 260) {
      c.line(x, ty - 34, x, H * 0.712, 5, '#4a4c54');
      c.line(x - 14, ty - 26, x + 14, ty - 26, 3, '#4a4c54');
    }
  },
  /** A Paris boulevard in low evening sun: stone facades with iron balconies and slate roofs, plane trees along the pavement. */
  trees(c, r) {
    c.gradient(0, H * 0.3, [[0, '#6a8aac'], [1, '#d8c8b0']]);
    const stone = ramp([[0, '#5a5048'], [0.4, '#a08a70'], [0.75, '#d8c4a2'], [1, '#f2e2c4']]);
    const slate = ramp([[0, '#2a3040'], [0.6, '#4a5468'], [1, '#7a8698']]);
    const dapple = noise2(71);
    let x = -30;
    while (x < W) {
      const w = 190 + r() * 110;
      const roofY = H * (0.17 + r() * 0.06);
      const top = roofY + 46;
      const tint = (r() - 0.5) * 0.12;
      // mansard roof with dormers and chimneys
      c.poly([[x, top], [x + 18, roofY], [x + w - 18, roofY], [x + w, top]], '#000', 1, (px, py) => slate(0.35 + (top - py) / 60 * 0.5));
      for (let dx = x + 26; dx < x + w - 40; dx += 44 + r() * 10) {
        c.poly(blob(dx + 10, roofY + 20, 11, 14, Math.floor(r() * 1e6), 0.02).map(([px, py]) => [px, Math.max(py, roofY + 8)]), '#c8b496');
        c.rect(dx + 4, roofY + 18, 12, 16, '#2a2c38');
      }
      for (let k = 0; k < 2 + Math.floor(r() * 3); k++) {
        const cx = x + 20 + r() * (w - 50);
        c.rect(cx, roofY - 26 - r() * 12, 18 + r() * 14, 34, '#8a6e5a');
        c.rect(cx, roofY - 30, 22, 5, '#5a4a40');
      }
      // the facade: sun from the left, so stone is warm at the top and cooler low down
      c.paintBox(x, top, x + w, H * 0.78, (px, py) => {
        const t = 0.62 + tint - (py - top) / (H * 0.78 - top) * 0.3 + dapple.fbm(px * 0.004, py * 0.01, 3) * 0.08;
        return [stone(t), 1];
      });
      c.rect(x + w - 10, top, 10, H * 0.78 - top, '#000000', 0.2);
      // floors: tall French windows, balconies on the 2nd and 5th floor, carved cornices
      const floors = 5;
      const fh = (H * 0.66 - top) / floors;
      const cols = Math.max(3, Math.round(w / 52));
      for (let f = 0; f < floors; f++) {
        const fy = top + 10 + f * fh;
        c.rect(x, fy - 4, w, 4, stone(0.95), 0.8);
        c.rect(x, fy, w, 3, stone(0.3), 0.5);
        for (let i = 0; i < cols; i++) {
          const wx = x + ((i + 0.5) / cols) * w - 11;
          const ww = 22;
          const wh = fh * 0.62;
          const glass = r() < 0.15 ? '#e8b878' : r() < 0.5 ? '#3a4458' : '#4a5468';
          c.rect(wx - 3, fy + 8, ww + 6, wh + 6, stone(0.85));
          c.rect(wx, fy + 11, ww, wh, glass);
          c.rect(wx + ww / 2 - 1, fy + 11, 2, wh, stone(0.7), 0.7);
          c.rect(wx, fy + 11, ww, 4, '#000000', 0.25);
          if (f === 1 || f === 4) {
            c.rect(x + 4, fy + 11 + wh - 10, w - 8, 3, '#1e1e24');
            for (let bx = x + 6; bx < x + w - 6; bx += 6) c.rect(bx, fy + 11 + wh - 10, 1.5, 12, '#1e1e24', 0.9);
            c.rect(x + 4, fy + 11 + wh + 2, w - 8, 5, '#000000', 0.25);
          } else {
            c.rect(wx - 2, fy + 11 + wh - 9, ww + 4, 2, '#1e1e24');
            for (let bx = wx; bx < wx + ww; bx += 4) c.rect(bx, fy + 11 + wh - 9, 1, 9, '#1e1e24', 0.8);
          }
        }
      }
      // shopfronts at street level, each with its own awning colour
      const sy = H * 0.66;
      c.rect(x, sy, w, H * 0.78 - sy, stone(0.4));
      for (let sx = x + 8; sx < x + w - 30; sx += 70 + r() * 20) {
        c.rect(sx, sy + 22, 54, H * 0.78 - sy - 22, r() < 0.5 ? '#2a2e3a' : '#3a2e28');
        c.rect(sx + 4, sy + 26, 46, 30, '#e8c890', 0.35);
        c.poly([[sx - 4, sy + 6], [sx + 58, sy + 6], [sx + 64, sy + 24], [sx - 10, sy + 24]], pickOf(r, ['#6a2a2a', '#2a4a3a', '#2a3a5a', '#7a5a2a']));
      }
      x += w;
    }
    // pavement and road with long tree shadows reaching right
    c.gradient(H * 0.78, H * 0.86, [[0, '#a89880'], [1, '#8a7a66']]);
    c.gradient(H * 0.86, H, [[0, '#4a4644'], [1, '#2a2826']]);
    c.rect(0, H * 0.858, W, 4, '#c8bca8');
    const trunks = [];
    for (let k = 0; k < 5; k++) trunks.push(W * (0.06 + k * 0.23) + (r() - 0.5) * 40);
    for (const tx of trunks) groundShadow(c, tx + 140, H * 0.84, 210, 18, 0.45);
    // plane trees: pale mottled bark, irregular canopies, sun from the upper left
    const leaves = ramp([[0, '#121a10'], [0.4, '#2a3a1e'], [0.75, '#5a7030'], [1, '#a8b65a']]);
    const barkTone = ramp([[0, '#3a3428'], [0.6, '#8a8268'], [1, '#c8c0a0']]);
    for (const tx of trunks) tree(c, r, tx, H * 0.83, 260 + r() * 70, { tone: leaves, bark: barkTone, crownW: 0.9, lobes: 13, mottled: true });
    // low sun: warm wash from the left, deeper blue in the shade at the right
    c.glow(-100, H * 0.3, 900, '#ffb060', 0.18);
  },

  /** A ferry pitching through a grey sea under storm cloud; a white village and a lighthouse on the headland (Greek islands). */
  ferry(c, r) {
    c.gradient(0, H * 0.55, [[0, '#1e2430'], [0.6, '#4a5260'], [1, '#7a8088']]);
    clouds(c, 81, { y0: 0, y1: H * 0.5, scale: 0.0022, cover: -0.1, soft: 0.5, lit: '#8a8e98', shade: '#1a1e28', alpha: 0.95, stretch: 2.2 });
    // the headland with a village of white cubes and a lighthouse
    const head = noise2(82);
    const top = new Float32Array(W);
    for (let x = 0; x < W; x++) top[x] = H * 0.53 - Math.max(0, (W * 0.42 - x) / (W * 0.42)) * 110 - head.fbm(x * 0.006, 2, 4) * 18;
    const landTone = ramp([[0, '#1e2420'], [0.6, '#3a443a'], [1, '#5a6252']]);
    c.paintBox(0, H * 0.3, W * 0.5, H * 0.56, (x, y) => (y < top[x] || x > W * 0.46 ? null : [mix(landTone(0.4 + head.fbm(x * 0.02, y * 0.03, 3) * 0.5), hex('#6a7078'), 0.35), 1]));
    for (let i = 0; i < 26; i++) {
      const hx = 20 + r() * W * 0.36;
      const hy = top[Math.floor(hx)] + 6 + r() * 30;
      const hw = 12 + r() * 16;
      const hh = 10 + r() * 12;
      c.rect(hx, hy, hw, hh, mix(hex('#e8e8e2'), hex('#6a7078'), 0.3));
      c.rect(hx + hw * 0.65, hy, hw * 0.35, hh, '#8a9098', 0.8);
      if (r() < 0.4) c.rect(hx + 3, hy + 3, 3, 4, '#2a3a5a');
    }
    const lx = W * 0.05;
    const ly = top[Math.floor(lx)] - 44;
    c.rect(lx, ly, 12, 50, '#e8e4dc');
    c.rect(lx + 7, ly, 5, 50, '#8a8a90');
    c.rect(lx - 2, ly - 8, 16, 8, '#2a2a30');
    c.glow(lx + 6, ly - 4, 90, '#fff2c0', 0.7);
    // the sea: fractal swell, whitecaps where the waves break
    const sea = noise2(83);
    const seaTone = ramp([[0, '#0e1a24'], [0.5, '#2a3e4a'], [0.85, '#5a6e78'], [1, '#c8d4d8']]);
    c.paintBox(0, H * 0.52, W, H, (x, y) => {
      const k = (y - H * 0.52) / (H * 0.48);
      const v = sea.fbm(x * 0.006 / (0.3 + k), y * 0.03 / (0.3 + k), 5);
      // crests are thin streaks along the swell, foam trails behind them
      const streak = sea.ridged(x * 0.004 / (0.3 + k), y * 0.09 / (0.3 + k), 3);
      const crest = smooth(0.62, 0.72, streak) * smooth(0.0, 0.25, v);
      const foam = smooth(0.5, 0.62, streak) * 0.25 * smooth(0.05, 0.3, v);
      return [mix(seaTone(0.35 + v * 0.5 - k * 0.15), hex('#e4ecee'), clamp01(crest * 0.9 + foam)), 1];
    });
    // the ferry, heeling slightly: dark hull, white decks, a funnel, spray at the bow
    const fx = W * 0.5;
    const fy = H * 0.6;
    const tilt = -0.05;
    const P = (dx, dy) => [fx + dx, fy + dy + dx * tilt];
    const hullTone = ramp([[0, '#0e1420'], [1, '#3a4a66']]);
    c.poly([P(-260, 0), P(250, 0), P(300, -36), P(-240, -40)], '#000', 1, (x, y) => hullTone(0.3 + (fy - y) / 80));
    c.poly([P(-240, -40), P(300, -36), P(296, -50), P(-238, -54)], '#d8dcdc');
    const white = ramp([[0, '#7a828c'], [0.6, '#d8dce0'], [1, '#f8f8f6']]);
    for (const [x0, x1, h0, h1] of [[-200, 230, 54, 92], [-150, 170, 92, 124], [-90, 90, 124, 150]]) {
      c.poly([P(x0, -h0), P(x1, -h0), P(x1 - 10, -h1), P(x0 + 6, -h1)], '#000', 1, (x, y) => white(0.5 + (x - fx) / 900 + 0.3));
      for (let wx = x0 + 14; wx < x1 - 20; wx += 22) c.poly([P(wx, -h0 - 12), P(wx + 12, -h0 - 12), P(wx + 12, -h0 - 22), P(wx, -h0 - 22)], '#2a3446');
    }
    c.poly([P(10, -150), P(56, -150), P(52, -196), P(18, -196)], '#2a5a8a');
    c.poly([P(14, -190), P(52, -190), P(52, -198), P(16, -198)], '#1a1e26');
    const spray = noise2(84);
    c.paintBox(fx + 230, fy - 120, fx + 380, fy + 30, (x, y) => {
      const v = spray.fbm(x * 0.03, y * 0.03, 4) + 0.6 - Math.hypot(x - fx - 300, (y - fy + 30) * 1.4) / 90;
      return v > 0.3 ? [hex('#eef2f2'), smooth(0.3, 0.7, v) * 0.85] : null;
    });
    // rain, slanting in the wind
    for (let i = 0; i < 900; i++) {
      const x = r() * W * 1.2;
      const y = r() * H;
      c.line(x, y, x - 10, y + 26, 1.2, '#c8d0d8', 0.12 + r() * 0.12);
    }
  },

  /** The Amazon from the air: a brown river winding through a dense canopy, morning mist in the hollows (Brazil). */
  forest(c, r) {
    c.fill('#0e1a10');
    const river = (y) => W * 0.55 + Math.sin(y * 0.008) * 170 + Math.sin(y * 0.021 + 1) * 60;
    // crowns: hundreds of irregular lit volumes in several greens, a few flowering trees
    const species = [
      ramp([[0, '#0a160c'], [0.5, '#1e3a1c'], [0.85, '#3e6a2a'], [1, '#7a9a44']]),
      ramp([[0, '#0e180a'], [0.5, '#2a4218'], [0.85, '#5a7a28'], [1, '#a8b450']]),
      ramp([[0, '#08140e'], [0.5, '#163424'], [0.85, '#2e5a3a'], [1, '#5a8a5a']]),
      ramp([[0, '#14160a'], [0.5, '#3a4018'], [0.85, '#6a6a28'], [1, '#b0a850']]),
    ];
    const flower = ramp([[0, '#2a1a10'], [0.5, '#8a5a1e'], [0.85, '#d8a030'], [1, '#f8e070']]);
    const leaf = noise2(91);
    const crowns = [];
    for (let i = 0; i < 1400; i++) {
      const x = r() * (W + 80) - 40;
      const y = r() * (H + 80) - 40;
      if (Math.abs(x - river(y)) < 70) continue;
      crowns.push({ x, y, s: 18 + r() * 34, tone: r() < 0.03 ? flower : pickOf(r, species), seed: Math.floor(r() * 1e6) });
    }
    crowns.sort((a, b) => a.s - b.s);
    for (const k of crowns) {
      c.litPoly(blob(k.x, k.y, k.s, k.s * 0.92, k.seed, 0.3, 28), k.x, k.y, k.s, k.s, k.tone, { lx: -0.6, ly: -0.7, lz: 0.5, ambient: 0.12, jitter: (x, y) => leaf(x * 0.12, y * 0.12) * 0.2 });
    }
    // the river: muddy water with the sky's light along it, darker under the banks
    const water = noise2(92);
    const waterTone = ramp([[0, '#24180e'], [0.45, '#5a3e22'], [0.8, '#8a6a44'], [1, '#c8c0a8']]);
    c.paintBox(0, 0, W, H, (x, y) => {
      const d = x - river(y);
      const half = 62 + Math.sin(y * 0.013) * 12;
      if (Math.abs(d) > half + 8) return null;
      if (Math.abs(d) > half) return [hex('#06100a'), 0.6]; // the banks' shadow on the water's edge
      const edge = smooth(half, half - 6, Math.abs(d));
      // the sky's light lies along the far side of the bends, broken by ripples
      const sheen = smooth(0.2, 0.9, d / half) * (0.5 + water.fbm(x * 0.02, y * 0.08, 3));
      return [waterTone(clamp01(0.35 + water.fbm(x * 0.01, y * 0.03, 3) * 0.2 + sheen * 0.5)), edge];
    });
    // mist lying in bands
    const mist = noise2(93);
    c.paintBox(0, 0, W, H, (x, y) => {
      const v = mist.fbm(x * 0.003, y * 0.008, 4);
      return v > 0.15 ? [hex('#e0e8e0'), smooth(0.15, 0.55, v) * 0.55] : null;
    });
  },

  /** A processor on a circuit board, seen at an angle with a shallow depth of field (technology). */
  chip(c, r) {
    // the board recedes: sharp in the middle, softer and darker at the edges
    const board = ramp([[0, '#050c0a'], [0.5, '#0e2a22'], [1, '#1e4a3a']]);
    c.paintBox(0, 0, W, H, (x, y) => [board(0.35 + (y / H) * 0.4 - Math.abs(x - W * 0.55) / W * 0.3), 1]);
    // traces routed at 45 degrees, in perspective (they converge toward the top)
    const P = (u, v) => {
      const s = 0.55 + v * 0.65;
      return [W * 0.55 + (u - 0.5) * W * 1.4 * s, H * (0.04 + v * 0.98)];
    };
    const gold = ramp([[0, '#4a3410'], [0.6, '#a8822e'], [1, '#f2d27a']]);
    for (let i = 0; i < 70; i++) {
      let u = r();
      let v = r();
      const pts = [P(u, v)];
      for (let s = 0; s < 4; s++) {
        const dir = Math.floor(r() * 3) - 1;
        const len = 0.04 + r() * 0.12;
        u += dir * len * 0.7;
        v += len;
        pts.push(P(u, v));
      }
      for (let s = 1; s < pts.length; s++) c.line(pts[s - 1][0], pts[s - 1][1], pts[s][0], pts[s][1], 2 + v * 3, gold(0.35 + r() * 0.4), 0.85);
      c.circle(pts.at(-1)[0], pts.at(-1)[1], 4 + v * 4, gold(0.7));
    }
    // small components scattered on the board, each with a shadow and a lit edge
    for (let i = 0; i < 60; i++) {
      const [x, y] = P(r(), r());
      const w = 10 + r() * 20;
      const h = 6 + r() * 10;
      groundShadow(c, x + 6, y + h, w * 0.8, 6, 0.6, '#000000');
      c.rect(x, y, w, h, pickOf(r, ['#1a1a1e', '#3a2a1e', '#c8c0b0']));
      c.rect(x, y, w, 2, '#f0e8d8', 0.4);
    }
    // the package, off-centre and in perspective, with the die catching a cool reflection
    const q = [P(0.36, 0.3), P(0.7, 0.3), P(0.74, 0.7), P(0.32, 0.7)];
    groundShadow(c, W * 0.6, H * 0.76, 300, 30, 0.7, '#000000');
    const pkg = ramp([[0, '#0a0a0e'], [0.7, '#24262e'], [1, '#4a4e5a']]);
    c.poly(q, '#000', 1, (x, y) => pkg(0.3 + (1 - (y - q[0][1]) / (q[2][1] - q[0][1])) * 0.5));
    // gold pins along the edges
    for (let k = 0; k <= 30; k++) {
      const t = k / 30;
      const a = [q[0][0] + (q[1][0] - q[0][0]) * t, q[0][1]];
      const b = [q[3][0] + (q[2][0] - q[3][0]) * t, q[3][1]];
      c.line(a[0], a[1] - 2, a[0], a[1] - 12, 3, gold(0.8));
      c.line(b[0], b[1] + 2, b[0], b[1] + 16, 4, gold(0.75));
    }
    const die = [P(0.46, 0.4), P(0.6, 0.4), P(0.615, 0.6), P(0.445, 0.6)];
    const dieTone = ramp([[0, '#1a2a4a'], [0.5, '#3a6aa0'], [0.85, '#8ac0e0'], [1, '#e8f4ff']]);
    const ir = noise2(101);
    c.poly(die, '#000', 1, (x, y) => dieTone(0.3 + ((x - die[0][0]) / 300 + (die[2][1] - y) / 260) * 0.5 + ir(x * 0.02, y * 0.02) * 0.1));
    c.glow(die[1][0] - 40, die[1][1] + 30, 160, '#c8e8ff', 0.25);
    // depth of field: the near and far board dissolve into soft highlights
    for (let i = 0; i < 26; i++) {
      const x = r() * W;
      const y = r() < 0.5 ? r() * H * 0.18 : H * (0.86 + r() * 0.14);
      c.glow(x, y, 20 + r() * 40, pickOf(r, ['#f2c86a', '#4ab0a0']), 0.15);
    }
    c.paintBox(0, 0, W, H, (x, y) => [hex('#000000'), 0.55 * (smooth(H * 0.25, 0, y) + smooth(H * 0.82, H, y))]);
  },

  /** A rocket climbing from its pad at dawn on a column of fire, billowing exhaust lit from below (spaceflight). */
  rocket(c, r) {
    c.gradient(0, H * 0.8, [[0, '#141a34'], [0.5, '#4a3a5a'], [0.82, '#c8705a'], [1, '#f0a868']]);
    c.glow(W * 0.5, H * 0.9, 700, '#ff9040', 0.3);
    // the launch tower: a lattice, lit on one side by the fire
    const tx = W * 0.3;
    for (const x of [tx, tx + 48]) c.rect(x, H * 0.22, 6, H * 0.62, '#1a1418');
    for (let y = H * 0.22; y < H * 0.84; y += 36) {
      c.line(tx, y, tx + 54, y + 36, 3, '#2a2024');
      c.line(tx + 54, y, tx, y + 36, 3, '#2a2024');
      c.rect(tx, y, 54, 3, '#3a2a26');
    }
    c.rect(tx + 54, H * 0.3, 120, 6, '#1a1418');
    // the rocket: a cylinder lit by dawn from the left and fire from below
    const rx = W * 0.52;
    const body = ramp([[0, '#4a4650'], [0.5, '#b8b2b4'], [0.85, '#ece6e0'], [1, '#ffffff']]);
    const shape = [[rx - 26, H * 0.62], [rx - 26, H * 0.22], [rx - 20, H * 0.16], [rx, H * 0.1], [rx + 20, H * 0.16], [rx + 26, H * 0.22], [rx + 26, H * 0.62]];
    c.litPoly(shape, rx, H * 0.4, 30, H * 0.6, body, { lx: -0.8, ly: 0, lz: 0.5, ambient: 0.2 });
    c.rect(rx - 26, H * 0.3, 52, 8, '#1a1a22');
    c.rect(rx - 26, H * 0.52, 52, 5, '#3a3a44');
    for (const s of [-1, 1]) c.poly([[rx + s * 26, H * 0.56], [rx + s * 50, H * 0.64], [rx + s * 26, H * 0.62]], '#2a2a32');
    // the flame: white core, gold, orange edges
    const flame = noise2(111);
    const fireTone = ramp([[0, '#a02a10'], [0.5, '#f07a20'], [0.8, '#ffd070'], [1, '#fffbe8']]);
    c.paintBox(rx - 80, H * 0.62, rx + 80, H * 0.88, (x, y) => {
      const u = (y - H * 0.62) / (H * 0.26);
      const half = 18 + u * 50;
      const d = Math.abs(x - rx + flame(y * 0.03, 1) * 6) / half;
      const v = 1 - d + flame.fbm(x * 0.05, y * 0.04, 3) * 0.3 - u * 0.3;
      return v > 0 ? [fireTone(clamp01(v * 1.3)), clamp01(v * 2.5)] : null;
    });
    c.glow(rx, H * 0.66, 160, '#fff0c0', 0.9);
    // exhaust billows: lit warm from below, cool from the sky
    const smoke = ramp([[0, '#4a3a48'], [0.45, '#9a8088'], [0.75, '#e8b896'], [1, '#fff4e4']]);
    for (let i = 0; i < 46; i++) {
      const side = r() < 0.5 ? -1 : 1;
      const d = r() ** 0.7;
      const x = rx + side * d * W * 0.48;
      const y = H * (0.84 - d * 0.06) + r() * 50;
      const s = 50 + r() * 90 - d * 20;
      c.litPoly(blob(x, y, s, s * 0.8, Math.floor(r() * 1e6), 0.28), x, y, s, s, smoke, { lx: -side * 0.8, ly: 0.4, lz: 0.5, ambient: 0.3, jitter: (px, py) => flame(px * 0.02, py * 0.02) * 0.15 - d * 0.35 });
    }
    // their tops catch the cool dawn sky
    c.glow(rx, H * 0.86, 320, '#ffb070', 0.35);
    c.gradient(H * 0.92, H, [[0, '#1a1214'], [1, '#0a0808']]);
  },

  /** Observatory domes on a desert ridge under the Milky Way (astronomy, Chile). */
  observatory(c, r) {
    c.gradient(0, H, [[0, '#04060e'], [0.6, '#0e1426'], [1, '#1a1e30']]);
    // the Milky Way: a diagonal band of fractal light with dark dust lanes
    const mw = noise2(121);
    const band = ramp([[0, '#1a1e3a'], [0.5, '#5a5a7a'], [0.85, '#b8aac0'], [1, '#f2e8f0']]);
    c.paintBox(0, 0, W, H * 0.8, (x, y) => {
      const d = Math.abs((y - H * 0.95) + (x - W * 0.1) * 0.62) / 160;
      const v = 1 - d + mw.fbm(x * 0.004, y * 0.004, 5) * 0.6;
      const dust = smooth(0.15, 0.35, mw.ridged(x * 0.006, y * 0.01, 3) - 0.35) * smooth(0, 1, 1 - d);
      return v > 0.2 ? [band(clamp01(v - dust * 0.6)), smooth(0.2, 1, v) * 0.85] : null;
    });
    sparkle(c, r, 1600, 0, 0, W, H * 0.72, '#ffffff', 0.9, [1, 1, 1, 2]);
    sparkle(c, r, 40, 0, 0, W, H * 0.6, '#ffe8c8', 1.2, [2, 3]);
    // the ridge, faintly rimmed by starlight
    const ridgeTop = c.ridge(H * 0.72, 60, 0.0018, '#080a10', 122, { octaves: 4 });
    for (let k = 1; k < ridgeTop.length - 2; k++) c.line(ridgeTop[k][0], ridgeTop[k][1], ridgeTop[k + 1][0], ridgeTop[k + 1][1], 2, '#3a4058', 0.6);
    const ground = (x) => (ridgeTop.find(([px]) => px >= x) || ridgeTop.at(-2))[1];
    // two domes: spherical volumes lit by the sky from the upper left, a slit open with red light inside
    const domeTone = ramp([[0, '#1a1e2a'], [0.5, '#5a6276'], [0.85, '#a8b0c0'], [1, '#e0e6f0']]);
    for (const [dx, s] of [[W * 0.58, 1], [W * 0.78, 0.55]]) {
      const gy = ground(dx) + 6;
      const R = 90 * s;
      c.rect(dx - R * 0.95, gy - R * 0.55, R * 1.9, R * 0.6, '#2a2e3a');
      c.rect(dx + R * 0.5, gy - R * 0.55, R * 0.45, R * 0.6, '#14161e');
      const dome = [];
      for (let i = 0; i <= 40; i++) {
        const a = Math.PI + (i / 40) * Math.PI;
        dome.push([dx + Math.cos(a) * R, gy - R * 0.55 + Math.sin(a) * R * 0.95]);
      }
      c.litPoly(dome, dx, gy - R * 0.55, R, R * 0.95, domeTone, { lx: -0.6, ly: -0.6, lz: 0.6, ambient: 0.1 });
      c.poly([[dx - 8 * s, gy - R * 1.48], [dx + 10 * s, gy - R * 1.48], [dx + 14 * s, gy - R * 0.6], [dx - 12 * s, gy - R * 0.6]], '#2a0a0e');
      c.glow(dx, gy - R, 40 * s, '#c02a20', 0.4);
    }
  },

  /** Offshore wind turbines receding into a warm haze over a calm sea at sunset (energy). */
  wind(c, r) {
    c.gradient(0, H * 0.62, [[0, '#2a3a5a'], [0.55, '#a07a7a'], [0.85, '#f0b07a'], [1, '#ffd8a0']]);
    clouds(c, 131, { y0: H * 0.05, y1: H * 0.45, scale: 0.0022, cover: 0.2, lit: '#ffd0a0', shade: '#6a5a72', alpha: 0.8, stretch: 5, lightUp: false });
    c.glow(W * 0.4, H * 0.6, 600, '#ffc080', 0.45);
    c.glow(W * 0.4, H * 0.6, 50, '#fff4dc', 1.2, 1);
    // the sea: long swell with a glitter path under the sun
    const sea = noise2(132);
    const seaTone = ramp([[0, '#1a2234'], [0.5, '#3a4a64'], [0.85, '#8a7a84'], [1, '#f0c890']]);
    c.paintBox(0, H * 0.62, W, H, (x, y) => {
      const k = (y - H * 0.62) / (H * 0.38);
      const v = sea.fbm(x * 0.004 / (0.2 + k), y * 0.05 / (0.2 + k), 4);
      const path = Math.exp(-(((x - W * 0.4) / (80 + k * 300)) ** 2));
      return [seaTone(clamp01(0.35 + v * 0.3 + path * (0.4 + v * 0.8) - k * 0.1)), 1];
    });
    sparkle(c, r, 500, W * 0.3, H * 0.62, W * 0.5, H, '#fff0c8', 0.6);
    // turbines: near ones large and crisp, far ones small and lost in the haze
    const turbines = [
      [W * 0.78, 1, 0.3],
      [W * 0.6, 0.62, 1.4],
      [W * 0.18, 0.45, 0.7],
      [W * 0.32, 0.33, 2.1],
      [W * 0.9, 0.28, 2.8],
      [W * 0.05, 0.22, 1.9],
      [W * 0.5, 0.18, 0.4],
    ];
    for (const [x, s, rot] of turbines.sort((a, b) => a[1] - b[1])) {
      const base = H * 0.62 + s * 30;
      const hub = base - 380 * s;
      const air = 0.75 - s * 0.7;
      const tone = ramp([[0, mix(hex('#3a3c4a'), hex('#c8a090'), air)], [1, mix(hex('#f0ece8'), hex('#f0c8a0'), air)]]);
      c.poly([[x - 7 * s, base], [x + 7 * s, base], [x + 3 * s, hub], [x - 3 * s, hub]], '#000', 1, (px) => tone(0.3 + (px < x ? 0.1 : 0.55)));
      c.rect(x - 9 * s, base - 14 * s, 18 * s, 14 * s, mix(hex('#e8c040'), hex('#c8a090'), air));
      for (let k = 0; k < 3; k++) {
        const a = rot + (k * Math.PI * 2) / 3;
        const L = 220 * s;
        const ex = x + Math.cos(a) * L;
        const ey = hub + Math.sin(a) * L;
        const nx = -Math.sin(a) * 7 * s;
        const ny = Math.cos(a) * 7 * s;
        c.poly([[x + nx, hub + ny], [ex, ey], [x - nx * 0.4, hub - ny * 0.4]], tone(0.6 + Math.sin(a) * 0.3));
      }
      c.ellipse(x, hub, 14 * s, 10 * s, tone(0.8));
      c.poly([[x, hub - 8 * s], [x + 36 * s, hub - 6 * s], [x + 36 * s, hub + 6 * s], [x, hub + 8 * s]], tone(0.5));
    }
  },

  /** Gantry cranes over container stacks and a ship at the quay in morning haze (trade). */
  port(c, r) {
    c.gradient(0, H * 0.6, [[0, '#7a8aa0'], [0.7, '#c8c4bc'], [1, '#e8d8c0']]);
    c.glow(W * 0.15, H * 0.35, 500, '#fff0d8', 0.35);
    // the far quay: hazy stacks
    for (let x = 0; x < W; x += 30 + r() * 30) {
      const h = 20 + r() * 50;
      c.rect(x, H * 0.58 - h, 28 + r() * 30, h, mix(hex(pickOf(r, ['#8a5a4a', '#4a6a8a', '#7a7a6a', '#9a8a5a'])), hex('#c8c4bc'), 0.65));
    }
    // the ship: a long dark hull; containers stacked on deck, every box its own colour with ribs and a lit top
    const hull = ramp([[0, '#14181e'], [1, '#3a3e48']]);
    c.poly([[W * 0.06, H * 0.62], [W * 0.98, H * 0.62], [W * 0.95, H * 0.8], [W * 0.1, H * 0.8]], '#000', 1, (x, y) => hull(0.6 - (y - H * 0.62) / (H * 0.18) * 0.5));
    c.rect(W * 0.1, H * 0.77, W * 0.85, 8, '#7a2a24');
    const colours = ['#9a3a2a', '#2a5a7a', '#c88a2a', '#4a6a4a', '#7a7a7a', '#2a3a6a', '#a85a3a', '#5a4a6a', '#d8d0c0'];
    for (let bay = 0; bay < 22; bay++) {
      const bx = W * 0.12 + bay * 46;
      const tiers = 2 + Math.floor(r() * 5);
      for (let t = 0; t < tiers; t++) {
        const by = H * 0.62 - (t + 1) * 30;
        const base = hex(pickOf(r, colours));
        c.rect(bx, by, 44, 29, mix(base, hex('#000000'), 0.2));
        for (let k = 3; k < 44; k += 5) c.rect(bx + k, by + 2, 1.5, 25, mix(base, hex('#000000'), 0.4), 0.7);
        c.rect(bx, by, 44, 3, mix(base, hex('#ffffff'), 0.35));
        c.rect(bx + 34, by, 10, 29, '#000000', 0.15);
      }
    }
    c.rect(W * 0.86, H * 0.42, 70, 90, '#d8d4cc');
    c.rect(W * 0.86 + 50, H * 0.42, 20, 90, '#8a8a90');
    for (let k = 0; k < 4; k++) c.rect(W * 0.86 + 6, H * 0.44 + k * 20, 58, 6, '#2a3446');
    // two gantry cranes: braced legs, a long boom, cables, lit on their sunward side
    const steel = ramp([[0, '#5a2a14'], [0.6, '#c8622a'], [1, '#f0a060']]);
    for (const gx of [W * 0.3, W * 0.62]) {
      for (const lx of [gx, gx + 150]) {
        c.poly([[lx, H * 0.8], [lx + 14, H * 0.8], [lx + 12, H * 0.16], [lx + 2, H * 0.16]], '#000', 1, (px) => steel(px < lx + 6 ? 0.85 : 0.45));
      }
      for (let y = H * 0.2; y < H * 0.76; y += 70) {
        c.line(gx + 7, y, gx + 157, y + 70, 4, steel(0.5));
        c.line(gx + 157, y, gx + 7, y + 70, 4, steel(0.4));
      }
      c.poly([[gx - 160, H * 0.15], [gx + 330, H * 0.15], [gx + 330, H * 0.18], [gx - 160, H * 0.18]], steel(0.7));
      for (let k = gx - 150; k < gx + 320; k += 22) c.line(k, H * 0.15, k + 11, H * 0.18, 2, steel(0.4));
      c.line(gx + 7, H * 0.16, gx + 80, H * 0.06, 4, steel(0.6));
      c.line(gx + 80, H * 0.06, gx + 320, H * 0.15, 2, '#3a2a24');
      c.line(gx + 80, H * 0.06, gx - 150, H * 0.15, 2, '#3a2a24');
      const sx = gx + 40 + r() * 140;
      c.rect(sx, H * 0.18, 40, 18, '#e8e4dc');
      c.line(sx + 20, H * 0.21, sx + 20, H * 0.36, 2, '#1e1e22');
      c.rect(sx - 2, H * 0.36, 44, 26, mix(hex(pickOf(r, colours)), hex('#000000'), 0.1));
    }
    haze(c, 0, H * 0.8, '#e0d8cc', 0.18, 0.02);
    // the water: soft, broken reflections of the hull and the cranes
    reflect(c, H * 0.8, H, '#3a4656', 0.45, 141, { ripple: 8 });
  },
};

// Per-scene grades: night and fire scenes keep their colour, daylight scenes are calmed down most.
const GRADES = {
  volcano: { saturation: 0.9, tint: 0.1 },
  observatory: { saturation: 0.8, tint: 0.1 },
  chip: { saturation: 0.8, tint: 0.12 },
  ferry: { saturation: 0.7, tint: 0.18 },
  rocket: { saturation: 0.8 },
  forest: { saturation: 0.75, tint: 0.14 },
  tram: { saturation: 0.8, tint: 0.14 },
};

Object.assign(SCENES, NEWS_SCENES, MORE_SCENES);
Object.assign(GRADES, NEWS_GRADES, MORE_GRADES);

// Smaller renditions some fixture feeds offer next to (or instead of) the full picture, the way real feeds
// list a thumbnail in media:group or media:thumbnail: the picture desk must find and prefer the large one.
export const THUMBS = ['wildfire', 'factory', 'hurricane', 'temple'];

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
  fs.mkdirSync(path.join(OUT, 'thumbs'), { recursive: true });
  for (const name of names) {
    const canvas = paintCanvas(name);
    const png = encodePng(canvas.downsample(2));
    fs.writeFileSync(path.join(OUT, `${name}.png`), png);
    console.log(`${name}.png  ${(png.length / 1024).toFixed(0)} KB`);
    if (THUMBS.includes(name)) fs.writeFileSync(path.join(OUT, 'thumbs', `${name}-320.png`), encodePng(canvas.downsample(4)));
  }
}
