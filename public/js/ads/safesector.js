// SAFESECTOR — insurance for floppy disks. Brand colours: navy, silver, cyan.
// "Because every kilobyte counts."
import {
  P, W, H, R, A, rrect, panel, disc, oval, ring, poly, line, dither, bands, sparkle, twinkle, particles, shadow,
  sunburst, stroke, cached, text, bigText, bubble, finePrint, slogan, play, hero, faceCU, wordmark, drawMark, glint,
  glow, urlPill, prog, lerp, easeOut, easeIn, easeOutBack, easeOutBounce, wave, shake, clipRect, starPts, cloud,
  talking, mulberry32, rep, tune,
} from './kit.js';

const AGENT = { S: P.tan, s: P.tanShade, H: P.maroon, h: P.brown, E: P.black, T: P.navy, t: P.ink, C: P.white, X: P.cyan, P: P.ink, p: P.black };

// --- brand -------------------------------------------------------------------

const MARK = () => wordmark('SAFESECTOR', {
  h: 22, pen: 2, square: true, wide: 0.78, gap: 3,
  fill: [P.white, P.white, P.silver, P.fog], outline: [[P.navy, 2], [P.black, 1]], depth: 2, depthColor: P.ink,
});

const shieldPts = (cx, cy, w, h) => [[cx - w / 2, cy - h / 2], [cx + w / 2, cy - h / 2], [cx + w / 2, cy + h * 0.1], [cx + w * 0.3, cy + h * 0.36], [cx, cy + h / 2], [cx - w * 0.3, cy + h * 0.36], [cx - w / 2, cy + h * 0.1]];

/** Shield emblem with a floppy inside (cached art, 76 x 86). */
const emblem = () =>
  cached('ss-emblem', 76, 86, (c) => {
    poly(c, shieldPts(38, 43, 74, 84), P.black);
    poly(c, shieldPts(38, 43, 70, 80), P.silver);
    poly(c, shieldPts(38, 43, 62, 72), P.navy);
    poly(c, shieldPts(38, 43, 58, 68), P.blue);
    poly(c, [[9, 9], [38, 9], [38, 76], [24, 66], [9, 50]], A(P.white, 0.12));
    flopBody(c, 38, 40, 15, { eyes: 'happy', mouth: 'smile', label: P.white });
    for (const [x, y] of [[18, 20], [58, 22], [56, 58]]) {
      c.fillStyle = P.cyan;
      c.fillRect(x, y - 1, 1, 3);
      c.fillRect(x - 1, y, 3, 1);
    }
  });

// --- Flop, the floppy disk ---------------------------------------------------

/**
 * Floppy body centred at (cx, cy), half-size s. o: { sq (+ squash, - stretch),
 * eyes, mouth, label, stain, name }.
 */
function flopBody(ctx, cx, cy, s, o = {}) {
  const sq = o.sq || 0;
  const w = Math.round(2 * s * (1 + sq * 0.7));
  const h = Math.round(2 * s * 1.04 * (1 - sq));
  const x = Math.round(cx - w / 2);
  const y = Math.round(cy - h / 2);
  const u = Math.max(1, Math.round(s / 16));
  rrect(ctx, x - 1, y - 1, w + 2, h + 2, P.black, 2);
  rrect(ctx, x, y, w, h, o.body || P.blue, 2);
  R(ctx, x + w - 3 * u, y + 2, 2 * u, h - 4, P.navy);
  R(ctx, x + 2, y + 2, u, h - 4, P.cyan);
  // notch + write-protect tab
  poly(ctx, [[x + w - 5 * u, y - 1], [x + w + 1, y - 1], [x + w + 1, y + 5 * u]], P.black);
  R(ctx, x + 2 * u, y + h - 6 * u, 3 * u, 3 * u, P.black);
  // metal shutter
  const sw = Math.round(w * 0.52);
  const sh = Math.round(h * 0.36);
  const sx = Math.round(cx - sw / 2 + w * 0.04);
  R(ctx, sx - 1, y - 1, sw + 2, sh + 2, P.black);
  R(ctx, sx, y, sw, sh, P.silver);
  R(ctx, sx + Math.round(sw * 0.58), y + 2 * u, Math.max(2, Math.round(sw * 0.2)), sh - 4 * u, P.steel);
  R(ctx, sx + u, y + u, u, sh - 2 * u, P.white);
  // label with face
  const lw = Math.round(w * 0.8);
  const lh = Math.round(h * 0.5);
  const lx = Math.round(cx - lw / 2);
  const ly = y + h - lh - Math.round(h * 0.05);
  R(ctx, lx - 1, ly - 1, lw + 2, lh + 2, P.black);
  R(ctx, lx, ly, lw, lh, o.label || P.white);
  R(ctx, lx, ly, lw, Math.max(1, u), o.label === P.cream ? P.yellow : P.red);
  if (o.stain) {
    disc(ctx, lx + lw * 0.25, ly + lh * 0.7, Math.round(s * 0.18), A(P.brown, 0.7));
    disc(ctx, x + w * 0.7, y + h * 0.25, Math.round(s * 0.14), A(P.brown, 0.7));
  }
  if (o.name && s >= 30) text(ctx, o.name, cx, ly + 3 * u, { color: P.navy, align: 'center' });
  // face
  const fy = ly + Math.round(lh * (o.name && s >= 30 ? 0.52 : 0.38));
  const ex = Math.round(lw * 0.2);
  const ew = Math.max(2, Math.round(s * 0.13));
  const eh = Math.round(ew * 1.35);
  const eyes = o.eyes || 'open';
  for (const sd of [-1, 1]) {
    const exx = cx + sd * ex - Math.floor(ew / 2);
    if (eyes === 'open' || eyes === 'wide') {
      const ww = eyes === 'wide' ? ew + 2 * u : ew;
      const hh = eyes === 'wide' ? eh + 2 * u : eh;
      if (eyes === 'wide') {
        rrect(ctx, exx - u, fy - u, ww, hh, P.black, 1);
        rrect(ctx, exx, fy, ww - 2 * u, hh - 2 * u, P.white, 1);
        R(ctx, exx + Math.floor((ww - 2 * u) / 2) - u, fy + Math.floor((hh - 2 * u) / 2) - u, 2 * u, 2 * u, P.black);
      } else {
        rrect(ctx, exx, fy, ww, hh, P.black, ew > 3 ? 1 : 0);
        R(ctx, exx + Math.max(0, u - 1) + (ew > 3 ? 1 : 0), fy + 1, u, u, P.white);
      }
    } else if (eyes === 'happy') {
      R(ctx, exx - u, fy + 2 * u, u, u, P.black);
      R(ctx, exx, fy + u, ew, u, P.black);
      R(ctx, exx + ew, fy + 2 * u, u, u, P.black);
    } else if (eyes === 'closed') {
      R(ctx, exx - u, fy + 2 * u, ew + 2 * u, u, P.black);
    } else if (eyes === 'x') {
      line(ctx, exx - u, fy, exx + ew, fy + eh, P.black, u);
      line(ctx, exx + ew, fy, exx - u, fy + eh, P.black, u);
    }
  }
  if (o.tears) {
    const ty = (Math.floor(o.tears * 8) % 4) * u;
    R(ctx, cx - ex - u, fy + eh + ty, u, 2 * u, P.cyan);
    R(ctx, cx + ex, fy + eh + ty, u, 2 * u, P.cyan);
  }
  const my = fy + eh + 2 * u;
  const m = o.mouth || 'smile';
  if (m === 'smile') {
    R(ctx, cx - 2 * u, my + u, 4 * u, u, P.black);
    R(ctx, cx - 3 * u, my, u, u, P.black);
    R(ctx, cx + 2 * u, my, u, u, P.black);
  } else if (m === 'grin') {
    R(ctx, cx - 3 * u, my, 6 * u, 3 * u, P.black);
    R(ctx, cx - 2 * u, my, 4 * u, u, P.white);
    R(ctx, cx - u, my + 2 * u, 2 * u, u, P.pink);
  } else if (m === 'O') {
    R(ctx, cx - u - 1, my - 1, 2 * u + 2, 3 * u + 2, P.black);
    R(ctx, cx - u, my, 2 * u, 3 * u, P.maroon);
  } else if (m === 'wavy') {
    for (let i = 0; i < 6; i++) R(ctx, cx - 3 * u + i * u, my + (i % 2) * u, u, u, P.black);
  } else if (m === 'frown') {
    R(ctx, cx - 2 * u, my, 4 * u, u, P.black);
    R(ctx, cx - 3 * u, my + u, u, u, P.black);
    R(ctx, cx + 2 * u, my + u, u, u, P.black);
  }
  return { x, y, w, h };
}

/**
 * Full Flop with arms and legs, feet on gy. o adds: step, armL, armR
 * ('down' | 'up' | 'out' | 'thumb'), legs (false to hide).
 */
function flop(ctx, cx, gy, s, o = {}) {
  const sq = o.sq || 0;
  const legH = o.legs === false ? 0 : Math.round(s * 0.42 * (1 - sq * 0.5));
  const h = Math.round(2 * s * 1.04 * (1 - sq));
  const cy = gy - legH - Math.round(h / 2);
  const w = Math.round(2 * s * (1 + sq * 0.7));
  const u = Math.max(1, Math.round(s / 16));
  const f = (o.step || 0) % 4;
  if (legH > 0) {
    for (const sd of [-1, 1]) {
      const lift = (f === 1 && sd < 0) || (f === 3 && sd > 0) ? 2 * u : 0;
      const lx = cx + sd * Math.round(s * 0.36);
      stroke(ctx, [[lx, cy + h / 2 - 1], [lx, gy - 3 * u - lift]], u + 1, P.black, null);
      rrect(ctx, lx - 3 * u - (sd < 0 ? u : 0), gy - 4 * u - lift, 6 * u + u, 4 * u, P.black, 1);
      rrect(ctx, lx - 3 * u - (sd < 0 ? u : 0) + 1, gy - 4 * u - lift + 1, 6 * u - 1, 4 * u - 2, P.red, 1);
    }
  }
  const arm = (sd, pose) => {
    const sx = cx + sd * Math.round(w / 2);
    const sy = cy + Math.round(h * 0.08);
    const k = s * 0.55;
    const end = {
      down: [sx + sd * k * 0.4, sy + k * 0.9],
      up: [sx + sd * k * 0.6, sy - k * 1.1],
      out: [sx + sd * k * 1.1, sy - k * 0.1],
      thumb: [sx + sd * k * 0.8, sy - k * 0.5],
    }[pose || 'down'];
    stroke(ctx, [[sx, sy], end], u + 1, P.black, null);
    disc(ctx, end[0], end[1], 2 * u + 1, P.black);
    disc(ctx, end[0], end[1], 2 * u, P.white);
    if (pose === 'thumb') {
      R(ctx, end[0] - u, end[1] - 4 * u - 1, 2 * u + 2, 3 * u + 1, P.black);
      R(ctx, end[0], end[1] - 4 * u, 2 * u, 3 * u, P.white);
    }
  };
  arm(-1, o.armL);
  arm(1, o.armR);
  return flopBody(ctx, cx, cy, s, o);
}

// --- props -------------------------------------------------------------------

function magnet(ctx, cx, y) {
  const pts = [[cx - 18, y + 4]];
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI + (i / 10) * Math.PI;
    pts.push([cx + Math.cos(a) * 18, y - 22 + Math.sin(a) * 18]);
  }
  pts.push([cx + 18, y + 4]);
  const full = [[cx - 18, y - 22], ...pts.slice(1, -1), [cx + 18, y - 22]];
  stroke(ctx, [[cx - 18, y + 4], [cx - 18, y - 22]], 11, P.red, P.black);
  stroke(ctx, [[cx + 18, y + 4], [cx + 18, y - 22]], 11, P.red, P.black);
  stroke(ctx, full, 11, P.red, P.black);
  stroke(ctx, full.slice(2, -2).map(([x, yy]) => [x - 1, yy - 1]), 3, P.pink, null);
  for (const sd of [-1, 1]) {
    R(ctx, cx + sd * 18 - 7, y + 2, 13, 9, P.black);
    R(ctx, cx + sd * 18 - 6, y + 3, 11, 7, P.silver);
    R(ctx, cx + sd * 18 - 6, y + 3, 11, 2, P.white);
  }
}

/** A mug rotated by angle a around its base centre (bx, by). */
function mug(ctx, bx, by, a, body = P.white, coffee = false) {
  const rot = (x, y) => [bx + x * Math.cos(a) - y * Math.sin(a), by + x * Math.sin(a) + y * Math.cos(a)];
  const quad = (x0, y0, x1, y1) => [rot(x0, y0), rot(x1, y0), rot(x1, y1), rot(x0, y1)];
  poly(ctx, quad(-15, -36, 15, 1), P.black);
  poly(ctx, quad(-14, -35, 14, 0), body);
  poly(ctx, quad(6, -33, 12, -2), P.silver);
  poly(ctx, quad(14, -28, 24, -8), P.black);
  poly(ctx, quad(15, -26, 22, -10), body);
  poly(ctx, quad(15, -22, 18, -14), P.black);
  poly(ctx, quad(-9, -24, 7, -14), P.red);
  if (coffee) poly(ctx, quad(-13, -35, 13, -32), P.brown);
}

function caption(ctx, s, lt) {
  const p = easeOutBack(prog(lt, 0, 0.25), 2);
  const x = Math.round(lerp(-160, 236, p));
  R(ctx, x - 4, 172, 152, 28, P.black);
  for (let i = 0; i < 152; i += 12) poly(ctx, [[x - 4 + i, 172], [x + 2 + i, 172], [x - 4 + i + 12, 200], [x - 10 + i + 12, 200]], P.yellow);
  R(ctx, x, 176, 144, 20, P.black);
  bigText(ctx, s, x + 72, 179, { scale: 2, color: P.yellow, outline: null, align: 'center' });
}

function deskSet(ctx, cam, lt) {
  // wall + window (far), desk (mid), foreground pencils (near)
  bands(ctx, 0, 0, W, 150, [P.cream, P.cream, P.tan]);
  const far = Math.round(cam * 0.3);
  R(ctx, 40 + far, 24, 120, 84, P.black);
  R(ctx, 42 + far, 26, 116, 80, P.white);
  bands(ctx, 46 + far, 30, 108, 72, [P.blue, P.cyan]);
  disc(ctx, 70 + far, 50, 8, P.yellow);
  cloud(ctx, 120 + far + Math.round((lt * 5) % 40), 52, 9, P.white);
  oval(ctx, 100 + far, 106, 60, 14, P.green);
  R(ctx, 98 + far, 30, 4, 72, P.white);
  R(ctx, 280 + far, 30, 48, 60, P.black);
  R(ctx, 282 + far, 32, 44, 56, P.white);
  text(ctx, 'TO DO:', 288 + far, 38, { color: P.navy });
  text(ctx, 'BACK UP', 288 + far, 50, { color: P.red });
  text(ctx, 'EVERYTHING', 288 + far, 60, { color: P.red });
  const mid = Math.round(cam * 0.7);
  R(ctx, 0, 150, W, 66, P.brown);
  R(ctx, 0, 150, W, 3, P.tan);
  dither(ctx, 0, 153, W, 63, P.tanShade, 'hlines');
  // pencil cup
  R(ctx, 300 + mid, 112, 26, 38, P.black);
  R(ctx, 301 + mid, 113, 24, 36, P.purple);
  R(ctx, 301 + mid, 113, 4, 36, P.magenta);
  for (const [dx, h, c] of [[5, 22, P.yellow], [11, 30, P.red], [17, 18, P.green]]) {
    R(ctx, 300 + mid + dx, 112 - h, 5, h, P.black);
    R(ctx, 301 + mid + dx, 113 - h, 3, h, c);
  }
}

// --- shots -------------------------------------------------------------------

// 1. Establishing: Flop strolls across a sunny desk.
function shotStroll(ctx, lt) {
  const cam = -lt * 6;
  deskSet(ctx, cam, lt);
  const x = Math.round(70 + lt * 30);
  shadow(ctx, x, 151, 20);
  flop(ctx, x, 151, 22, { step: Math.floor(lt * 6), eyes: 'happy', mouth: 'smile', armL: 'down', armR: 'down', sq: Math.abs(Math.sin(lt * Math.PI * 3)) * 0.05 });
  // whistled music notes
  for (let i = 0; i < 2; i++) {
    const nx = x + 24 + i * 10;
    const ny = Math.round(92 - ((lt * 14 + i * 9) % 18));
    R(ctx, nx + 2, ny, 1, 6, P.navy);
    R(ctx, nx + 2, ny, 3, 1, P.navy);
    R(ctx, nx, ny + 5, 3, 2, P.navy);
  }
  // foreground
  const near = Math.round(cam * 1.6);
  R(ctx, 360 + near, 180, 90, 40, P.black);
  R(ctx, 361 + near, 181, 88, 38, P.yellow);
  R(ctx, 361 + near, 181, 88, 4, P.orange);
}

// 2. Danger montage: magnet, coffee, coaster.
function shotDanger(ctx, lt) {
  const k = lt < 1.7 ? 0 : lt < 3.4 ? 1 : 2;
  const st = lt - k * 1.7;
  const [sx, sy] = shake(lt, st < 0.3 ? 2 : 0);
  ctx.save();
  ctx.translate(sx, sy);
  bands(ctx, -4, -4, W + 8, 154, k === 0 ? [P.purple, P.magenta] : k === 1 ? [P.maroon, P.darkRed] : [P.ink, P.slate]);
  dither(ctx, -4, -4, W + 8, 154, A(P.black, 0.25), 'diag');
  R(ctx, -4, 150, W + 8, 70, P.brown);
  R(ctx, -4, 150, W + 8, 3, P.tan);
  const cx = 150;
  if (k === 0) {
    const my = Math.round(lerp(-30, 60, easeOut(prog(st, 0, 0.5))));
    for (let i = 0; i < 4; i++) {
      const yy = my + 16 + ((st * 50 + i * 10) % 40);
      R(ctx, cx - 18, yy, 2, 4, P.cyan);
      R(ctx, cx + 17, yy, 2, 4, P.cyan);
    }
    flop(ctx, cx, 151, 22, { sq: -0.18, eyes: 'wide', mouth: 'O', armL: 'up', armR: 'up' });
    // data bits flying up to the magnet
    for (let i = 0; i < 10; i++) {
      const p = ((st * 1.4 + i / 10) % 1);
      if (st < 0.4) continue;
      text(ctx, i % 2 ? '1' : '0', cx - 12 + ((i * 7) % 24) + Math.sin(p * 6 + i) * 4, 110 - p * 40, { color: P.yellow });
    }
    magnet(ctx, cx, my);
    caption(ctx, 'MAGNETS', st);
  } else if (k === 1) {
    const tip = easeOutBack(prog(st, 0, 0.5), 1.2) * 1.9;
    mug(ctx, cx + 50, 100, -tip, P.white, true);
    if (st > 0.35) {
      const pour = prog(st, 0.35, 0.7);
      poly(ctx, [[cx + 24, 64], [cx + 34, 64], [cx + 8, 64 + pour * 70], [cx - 2, 64 + pour * 70]], P.brown);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI - Math.PI;
        const d = prog(st, 0.6, 1.2) * 30;
        if (d > 0) disc(ctx, cx + Math.cos(a) * d * 1.4, 128 + Math.sin(a) * d * 0.8, 2, P.brown);
      }
    }
    flop(ctx, cx, 151, 22, { sq: st > 0.6 ? 0.08 : 0, eyes: st > 0.6 ? 'x' : 'wide', mouth: 'wavy', stain: st > 0.6, armL: 'up', armR: 'up' });
    if (st > 0.6) R(ctx, cx - 30, 148, 60, 4, P.brown);
    caption(ctx, 'SPILLS', st);
  } else {
    const drop = easeIn(prog(st, 0.1, 0.4));
    const land = st > 0.4;
    const sq = land ? 0.45 - easeOutBounce(prog(st, 0.4, 1.2)) * 0.15 : 0;
    const top = 151 - Math.round(2 * 22 * 1.04 * (1 - sq)) - Math.round(22 * 0.42 * (1 - sq * 0.5));
    mug(ctx, cx, land ? top : Math.round(lerp(-10, top, drop)), 0, P.yellow, false);
    flop(ctx, cx, 151, 22, { sq, eyes: land ? 'closed' : 'open', mouth: land ? 'frown' : 'O', armL: 'out', armR: 'out' });
    if (land && st < 1.0) bigText(ctx, 'BONK!', cx + 64, 70, { scale: 2, color: P.white, outline: P.black, ow: 2 });
    caption(ctx, 'COASTERS', st);
  }
  ctx.restore();
}

// 3. The agent: a talking-head shot, SafeSector to the rescue.
function shotAgent(ctx, lt, info, dt) {
  bands(ctx, 0, 0, W, 176, [P.slate, P.steel]);
  dither(ctx, 0, 0, W, 176, P.fog, 'dots');
  // wall: window, branding
  R(ctx, 196, 30, 70, 64, P.black);
  bands(ctx, 198, 32, 66, 60, [P.blue, P.cyan]);
  for (let i = 0; i < 5; i++) R(ctx, 200 + i * 13, 62 - ((i * 7) % 15), 10, 30, P.navy);
  R(ctx, 230, 32, 2, 60, P.black);
  ctx.drawImage(emblem(), 290, 18);
  text(ctx, 'SAFESECTOR', 328, 108, { color: P.white, align: 'center' });
  const talk = talking(info, dt, [1, 2]);
  faceCU(ctx, 112, 100, 36, { pal: AGENT, hair: 'bob', eyes: lt % 3.1 < 0.12 ? 'closed' : 'open', mouth: talk ? 'open' : 'smile', iris: P.brown, look: lt > 2.2 && lt < 3.4 ? 1 : 0 });
  // desk
  R(ctx, 0, 176, W, 40, P.black);
  R(ctx, 0, 177, W, 5, P.fog);
  R(ctx, 0, 177, W, 1, P.white);
  R(ctx, 0, 182, W, 34, P.navy);
  // nervous Flop wrapped in a blanket on the desk
  const [sx] = shake(lt, lt < 2.4 ? 1 : 0, 3);
  const calm = lt > 2.8;
  const fb = flop(ctx, 262 + sx, 177, 20, { eyes: calm ? 'happy' : 'wide', mouth: calm ? 'smile' : 'wavy', legs: false, armL: 'down', armR: 'down' });
  const by = fb.y + fb.h - 8;
  poly(ctx, [[fb.x - 4, by], [fb.x + fb.w + 4, by], [fb.x + fb.w + 7, 177], [fb.x - 7, 177]], P.black);
  poly(ctx, [[fb.x - 3, by + 1], [fb.x + fb.w + 3, by + 1], [fb.x + fb.w + 6, 176], [fb.x - 6, 176]], P.red);
  for (let i = 0; i < 5; i++) R(ctx, fb.x - 1 + i * 10, by + 2, 4, 176 - by - 2, P.pink);
  if (calm) {
    sparkle(ctx, 290, 130, twinkle(lt, 0), P.white);
    heartBubble(ctx, 284, 112, lt);
  }
  // lower third
  if (lt > 0.4) {
    const p = easeOut(prog(lt, 0.4, 0.8));
    const x = Math.round(lerp(-160, 8, p));
    R(ctx, x, 186, 156, 24, P.black);
    R(ctx, x + 1, 187, 154, 11, P.white);
    R(ctx, x + 1, 198, 154, 11, P.cyan);
    text(ctx, 'BRENDA BYTE', x + 6, 189, { color: P.navy });
    text(ctx, 'SENIOR DISK ADVISOR', x + 6, 200, { color: P.navy });
  }
}

function heartBubble(ctx, x, y, lt) {
  const yy = y - Math.round((lt * 8) % 10);
  R(ctx, x + 1, yy, 2, 1, P.red);
  R(ctx, x + 4, yy, 2, 1, P.red);
  R(ctx, x, yy + 1, 7, 2, P.red);
  R(ctx, x + 1, yy + 3, 5, 1, P.red);
  R(ctx, x + 2, yy + 4, 3, 1, P.red);
  R(ctx, x + 3, yy + 5, 1, 1, P.red);
}

// 4. Demo: the shield says no.
function shotCovered(ctx, lt) {
  bands(ctx, 0, 0, W, 150, [P.navy, P.blue]);
  sunburst(ctx, 150, 120, lt * 0.03, 16, P.navy, P.blue);
  R(ctx, 0, 150, W, 66, P.brown);
  R(ctx, 0, 150, W, 3, P.tan);
  const cx = 150;
  const events = [0.3, 1.5, 2.9];
  const ev = events.filter((e) => lt >= e).length - 1;
  const st = ev >= 0 ? lt - events[ev] : lt;
  // attackers bounce off
  if (ev === 0) {
    const my = Math.round(lerp(-20, 40, easeOut(prog(st, 0, 0.3))) - Math.max(0, st - 0.5) * 120);
    magnet(ctx, cx, my);
  } else if (ev === 1) {
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI * 0.2 - (i / 10) * Math.PI * 0.6;
      const d = st * 120;
      disc(ctx, cx + Math.cos(a) * d, 70 + Math.sin(a) * d * 0.6 + st * st * 80, 3, P.brown);
    }
  } else if (ev === 2) {
    const y = st < 0.3 ? lerp(-20, 62, st / 0.3) : 62 - Math.sin(Math.min(1, (st - 0.3) / 0.8) * Math.PI) * 50;
    mug(ctx, cx + Math.max(0, st - 0.3) * 160, Math.round(y), Math.max(0, st - 0.3) * 4, P.yellow);
  }
  // shield bubble
  const pulse = ev >= 0 && st < 0.25;
  disc(ctx, cx, 112, 46, A(P.cyan, pulse ? 0.35 : 0.15));
  ring(ctx, cx, 112, 46, pulse ? P.white : P.cyan);
  ring(ctx, cx, 112, 45, P.cyan);
  sparkle(ctx, cx - 28, 82, twinkle(lt, 0.3), P.white);
  sparkle(ctx, cx + 34, 96, twinkle(lt, 0.7), P.white);
  flop(ctx, cx, 151, 22, { eyes: 'happy', mouth: 'grin', armL: ev >= 1 ? 'thumb' : 'down', armR: 'down' });
  // COVERED stamps stack up on the right
  for (let i = 0; i <= ev; i++) {
    const sp = prog(lt - events[i], 0.15, 0.35);
    if (sp <= 0) continue;
    const yy = 40 + i * 44;
    const drop = Math.round((1 - easeOutBounce(sp)) * -30);
    const squash = sp < 1 ? 0 : 0;
    R(ctx, 236, yy + drop + squash, 132, 34, P.red);
    R(ctx, 239, yy + 3 + drop, 126, 28, P.navy);
    R(ctx, 241, yy + 5 + drop, 122, 24, P.red);
    R(ctx, 243, yy + 7 + drop, 118, 20, P.navy);
    bigText(ctx, 'COVERED!', 302, yy + 11 + drop, { scale: 2, color: P.white, outline: null, align: 'center' });
    text(ctx, ['MAGNETS', 'COFFEE', 'COASTERS'][i], 302, yy - 9 + drop, { color: P.white, align: 'center' });
  }
}

// 5. Reaction: Flop, close up, with a shiny new label.
function shotHappy(ctx, lt) {
  sunburst(ctx, 192, 120, lt * 0.05, 12, P.cyan, P.blue);
  glow(ctx, 192, 120, 90, P.white, 0.08);
  const bob = wave(lt, 1.2, 2);
  const fb = flop(ctx, 192, 216 + bob, 58, { eyes: 'happy', mouth: 'grin', label: P.cream, name: 'FLOP', armL: 'thumb', armR: 'up', tears: lt });
  // gold sticker
  poly(ctx, starPts(fb.x + fb.w - 18, fb.y + fb.h - 30, 10, 15, 11, lt), P.black);
  poly(ctx, starPts(fb.x + fb.w - 18, fb.y + fb.h - 30, 10, 13, 9, lt), P.yellow);
  text(ctx, 'OK', fb.x + fb.w - 18, fb.y + fb.h - 33, { color: P.navy, align: 'center' });
  const sweep = prog(lt, 0.4, 1.2);
  if (sweep > 0 && sweep < 1) {
    clipRect(ctx, fb.x, fb.y, fb.w, fb.h);
    for (let yy = fb.y; yy < fb.y + fb.h; yy += 2) R(ctx, fb.x - 30 + sweep * (fb.w + 60) + (fb.y + fb.h - yy) * 0.6 - 30, yy, 8, 2, A(P.white, 0.6));
    ctx.restore();
  }
  for (let i = 0; i < 6; i++) sparkle(ctx, 60 + i * 52, 40 + ((i * 37) % 60), twinkle(lt, i * 0.17), P.white);
  bigText(ctx, 'INSURED!', 192, 26, { scale: 3, color: P.yellow, outline: P.black, ow: 2, depth: 2, depthColor: P.orange, align: 'center' });
}

// 6. End slate.
function shotSlate(ctx, lt) {
  sunburst(ctx, 96, 92, lt * 0.02, 18, P.navy, P.ink);
  for (let r = 30; r < 300; r += 22) ring(ctx, 96, 92, r, P.navy);
  glow(ctx, 96, 92, 60, P.cyan, 0.06);
  const ep = easeOutBack(prog(lt, 0.1, 0.5), 1.8);
  const ey = Math.round(lerp(-90, 50, ep));
  ctx.drawImage(emblem(), 58, ey);
  glint(ctx, emblem(), 58, ey, ((lt - 0.6) % 3) / 0.8, { width: 7 });
  const mk = MARK();
  const x0 = drawMark(ctx, mk, 262, 50, { reveal: prog(lt, 0.3, 1.1), drop: 30 });
  if (lt > 1.3) glint(ctx, mk.cv, x0 - mk.ox, 50 - mk.oy, ((lt - 1.3) % 3.4) / 0.7, { width: 6 });
  if (lt > 1.0) {
    R(ctx, 182, 82, 160, 1, P.cyan);
    text(ctx, 'FLOPPY DISK INSURANCE', 262, 88, { color: P.cyan, align: 'center' });
    text(ctx, 'EST. 1.44 MB AGO', 262, 100, { color: P.fog, align: 'center' });
  }
  if (lt > 1.4) slogan(ctx, 'BECAUSE EVERY KILOBYTE COUNTS.', 192, 146, lt - 1.4, { scale: 2, bg: P.white, edge: P.silver, color: P.navy });
  if (lt > 2.1) urlPill(ctx, 'SAFESECTOR.DSK', 192, 176, { bg: P.navy, border: P.cyan, color: P.white });
  finePrint(ctx, "POLICY VOID IF DISK IS ONLY EVER USED AS A SAVE ICON. DOES NOT COVER DISKS LABELLED 'MISC'.", { lt: lt - 2.3 });
}

const SCENES = [
  { at: 0, draw: shotStroll },
  { at: 4.4, draw: shotDanger, wipe: 'flash', wd: 0.25 },
  { at: 9.6, draw: shotAgent, wipe: 'diag', wd: 0.5 },
  { at: 14.6, draw: shotCovered, wipe: 'blocks', wd: 0.45 },
  { at: 19.6, draw: shotHappy, wipe: 'iris', wd: 0.45, cx: 150, cy: 120 },
  { at: 22.5, draw: shotSlate, wipe: 'dissolve', wd: 0.5 },
];

export default {
  id: 'safesector',
  brand: 'SAFESECTOR',
  duration: 27.5,
  voice: { gender: 'female', lang: 'en-GB', pitch: 1.0, rate: 0.98 },
  script: [
    { at: 0.6, text: 'Life is full of dangers... when you are a floppy disk.' },
    { at: 9.8, text: "That's why there's SafeSector. Insurance for every one point four four megabytes." },
    { at: 14.8, text: 'Magnets? Covered. Coffee? Covered. Being used as a coaster? ...Covered.' },
    { at: 23.0, text: 'SafeSector. Because every kilobyte counts.' },
  ],
  // 96 bpm, F major: carefree stroll, minor danger stabs, warm reassurance,
  // a stab per "covered", and the SAFE-SEC-TOR sting resolving on F at beat 36.
  tune: {
    bpm: 96,
    wave: 'triangle',
    notes: tune(
      'F4:1 A4:1 C5:2 A4:1 C5:1 F5:2',
      'D4:0.5 R:0.5 D4:0.5 R:0.5 C#4:0.5 R:0.5 C#4:0.5 R:0.5 C4:1 R:1 B3:2',
      'C5:1 A4:1 F4:2 G4:1 A4:1 C5:2 D5:1 C5:1 A4:1 G4:1',
      'F5:1 R:0.5 F5:0.5 F5:1 R:1 G5:1 R:0.5 G5:0.5 A5:2',
      'C5:1 F5:1 A5:2 G5:1 E5:1 F5:2',
    ),
    bass: tune('F2:4 C3:4', 'D2:2 C#2:2 C2:2 B1:2', 'F2:4 C3:4 Bb2:2 C3:2', 'F2:2 F2:2 C3:2 F2:2', 'F2:2 C3:2 F2:4'),
    bassWave: 'sine',
    drums: tune(rep('K:2 H:2', 2), rep('K:0.5 R:0.5', 8), rep('K:1 H:1 S:1 H:1', 3), rep('K:1 S:1', 4), 'K:1 H:1 S:1 H:1 K:2 R:2'),
  },
  draw(ctx, t, dt, info) {
    play(ctx, dt, info, SCENES);
  },
};
