// CLOUDBRELLA — the umbrella that protects you from cloud computing.
// Brand colours: sky blue, white, sunshine yellow. "Stay dry. Stay offline."
import {
  P, W, H, R, A, rrect, panel, disc, oval, ring, poly, line, dither, bands, sparkle, twinkle, particles, shadow,
  sunburst, stroke, cached, text, bigText, bubble, finePrint, slogan, play, hero, faceCU, wordmark, drawMark, glint,
  glow, urlPill, prog, lerp, easeOut, easeIn, easeOutBack, wave, shake, clipRect, cloud, mulberry32, rep, tune,
} from './kit.js';

const COMMUTER = { S: P.tan, s: P.tanShade, H: P.black, h: P.slate, E: P.black, T: P.steel, t: P.slate, C: P.white, X: P.yellow, P: P.slate, p: P.ink, B: P.black };

// --- brand -------------------------------------------------------------------

const MARK = () => wordmark('CLOUDBRELLA', {
  h: 24, pen: 2, wide: 0.8, gap: 2,
  fill: [P.white, P.white, P.silver], hi: P.white,
  outline: [[P.blue, 2], [P.navy, 1]], depth: 2, depthColor: P.navy,
  wave: (i) => Math.round(Math.sin(i * 0.9) * 2),
});

// --- props -------------------------------------------------------------------

const KINDS = ['mail', 'popup', 'sync', 'cookie', 'badge', 'update'];

/** Notification icons (cached 18 x 14 each). */
function icon(ctx, kind, x, y) {
  const cv = cached(`cb-icon-${kind}`, 18, 14, (c) => {
    if (kind === 'mail') {
      R(c, 1, 2, 16, 11, P.black);
      R(c, 2, 3, 14, 9, P.white);
      line(c, 2, 3, 9, 8, P.black);
      line(c, 15, 3, 9, 8, P.black);
    } else if (kind === 'popup') {
      R(c, 0, 0, 18, 14, P.black);
      R(c, 1, 1, 16, 3, P.blue);
      R(c, 1, 4, 16, 9, P.white);
      R(c, 14, 1, 2, 2, P.red);
      R(c, 8, 5, 2, 4, P.red);
      R(c, 8, 10, 2, 2, P.red);
    } else if (kind === 'sync') {
      disc(c, 9, 7, 6, P.black);
      disc(c, 9, 7, 5, P.cyan);
      disc(c, 9, 7, 3, P.black);
      disc(c, 9, 7, 2, P.cyan);
      R(c, 3, 6, 4, 3, P.cyan);
      R(c, 11, 5, 4, 3, P.cyan);
    } else if (kind === 'cookie') {
      disc(c, 9, 7, 6, P.black);
      disc(c, 9, 7, 5, P.tan);
      for (const [dx, dy] of [[-2, -2], [2, -1], [-1, 2], [3, 3]]) R(c, 9 + dx, 7 + dy, 2, 1, P.brown);
    } else if (kind === 'badge') {
      disc(c, 9, 7, 6, P.black);
      disc(c, 9, 7, 5, P.red);
      text(c, '!', 9, 4, { color: P.white, align: 'center' });
    } else {
      R(c, 1, 1, 16, 12, P.black);
      R(c, 2, 2, 14, 10, P.green);
      R(c, 8, 3, 2, 5, P.white);
      R(c, 6, 7, 6, 1, P.white);
      R(c, 7, 8, 4, 1, P.white);
      R(c, 8, 9, 2, 1, P.white);
    }
  });
  ctx.drawImage(cv, Math.round(x) - 9, Math.round(y) - 7);
}

/** Open umbrella canopy; (cx, cy) = middle of the rim, apex at cy - ry. */
function canopy(ctx, cx, cy, rx, ry, colA = P.blue, colB = P.white, logo = true) {
  const n = 8;
  const tips = [];
  for (let i = 0; i <= n; i++) {
    const a = Math.PI + (i / n) * Math.PI;
    tips.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry * 0.18]);
  }
  const top = [cx, cy - ry];
  const outline = [];
  for (let i = 0; i <= 24; i++) {
    const a = Math.PI + (i / 24) * Math.PI;
    outline.push([cx + Math.cos(a) * rx, cy - ry * 0.18 + Math.sin(a) * ry * 0.82]);
  }
  // scalloped rim
  const rim = [];
  for (let i = n; i >= 1; i--) {
    const [x0, y0] = tips[i];
    const [x1, y1] = tips[i - 1];
    rim.push([x0, y0], [(x0 + x1) / 2, (y0 + y1) / 2 - ry * 0.12]);
  }
  rim.push(tips[0]);
  const shape = [...outline, ...rim];
  poly(ctx, shape.map(([x, y]) => [x + (x < cx ? -1 : 1), y + (y < cy - ry * 0.5 ? -1 : 1)]), P.black);
  poly(ctx, shape, colA);
  for (let i = 0; i < n; i += 2) {
    const [x0, y0] = tips[i];
    const [x1, y1] = tips[i + 1];
    poly(ctx, [top, [x0, y0], [(x0 + x1) / 2, (y0 + y1) / 2 - ry * 0.12], [x1, y1]], colB);
  }
  for (let i = 1; i < n; i++) line(ctx, top[0], top[1], tips[i][0], tips[i][1], P.navy);
  R(ctx, cx - 1, cy - ry - 4, 3, 5, P.black);
  if (logo && rx > 30) {
    const ly = Math.round(cy - ry * 0.45);
    cloud(ctx, cx, ly, Math.max(5, Math.round(rx / 7)), P.navy);
    line(ctx, cx - rx / 6, ly + rx / 9, cx + rx / 6, ly - rx / 9, P.red, 2);
  }
}

function handle(ctx, cx, y0, len) {
  R(ctx, cx - 1, y0, 3, len, P.black);
  R(ctx, cx, y0, 1, len, P.silver);
  stroke(ctx, [[cx, y0 + len], [cx, y0 + len + 6], [cx - 3, y0 + len + 9], [cx - 7, y0 + len + 7]], 2, P.brown, P.black);
}

const UMB_W = 110;
const UMB_H = 86;
const umbrellaArt = () =>
  cached('cb-umbrella', UMB_W, UMB_H, (c) => {
    canopy(c, 55, 44, 52, 40);
    handle(c, 55, 45, 30);
  });

function stormCloud(ctx, cx, cy, s, lt, mood = 'mean') {
  cloud(ctx, cx, cy, s, P.slate, P.ink);
  const u = s / 14;
  const ex = Math.round(8 * u);
  const ey = cy - Math.round(1 * u);
  for (const sd of [-1, 1]) {
    R(ctx, cx + sd * ex - 2, ey, 4, 3, P.white);
    R(ctx, cx + sd * ex - (sd < 0 ? 0 : 1), ey + 1, 2, 2, P.black);
    if (mood === 'angry') line(ctx, cx + sd * (ex + 3), ey - 3, cx + sd * (ex - 3), ey - 1, P.black, 2);
  }
  R(ctx, cx - 4, ey + 6, 8, 1, P.black);
  R(ctx, cx - 5, ey + 7, 1, 1, P.black);
  R(ctx, cx + 4, ey + 7, 1, 1, P.black);
  // wifi antenna-ish ears
  ring(ctx, cx, cy - Math.round(12 * u), 3, P.cyan);
}

/** Icons raining from x0..x0+w; returns nothing. Bouncing off a canopy if given. */
function iconRain(ctx, lt, { x0, w, y0, ground, n = 14, seed = 1, speed = 70, canopy: cp = null }) {
  const rand = mulberry32(seed);
  for (let i = 0; i < n; i++) {
    const x = x0 + rand() * w;
    const period = 1.4 + rand() * 1.2;
    const ph = rand() * period;
    const kind = KINDS[i % KINDS.length];
    const t = (lt + ph) % period;
    let y = y0 + t * speed * (1.2 + rand() * 0.4);
    let xx = x + Math.sin(t * 4 + i) * 2;
    if (cp && Math.abs(x - cp.cx) < cp.rx) {
      const hitY = cp.cy - cp.ry * Math.sqrt(Math.max(0, 1 - ((x - cp.cx) / cp.rx) ** 2)) * 0.9;
      const tHit = (hitY - y0) / (speed * 1.3);
      if (t > tHit) {
        const tt = t - tHit;
        xx = x + Math.sign(x - cp.cx || 1) * tt * 90;
        y = hitY - tt * 70 + tt * tt * 260;
        if (tt < 0.12) sparkle(ctx, x, hitY - 4, 2, P.white);
      }
    }
    if (y > ground) continue;
    icon(ctx, kind, xx, y);
  }
}

function street(ctx, lt, scroll, sunny) {
  bands(ctx, 0, 0, W, 150, sunny ? [P.blue, P.cyan, P.cream] : [P.ink, P.slate, P.steel]);
  const far = Math.round(scroll * 0.2);
  for (let k = -1; k < 12; k++) {
    const x = ((k * 40 - far) % 480 + 480) % 480 - 40;
    R(ctx, x, 60 - ((k * 37) % 30), 34, 100, sunny ? P.fog : P.slate);
  }
  const mid = Math.round(scroll * 0.5);
  for (let k = -1; k < 8; k++) {
    const x = ((k * 70 - mid) % 560 + 560) % 560 - 70;
    const top = 86 - ((k * 23) % 26);
    R(ctx, x, top, 62, 80, sunny ? P.steel : P.ink);
    for (let wy = top + 6; wy < 146; wy += 10) for (let wx = x + 6; wx < x + 56; wx += 12) R(ctx, wx, wy, 6, 5, sunny ? P.cyan : P.navy);
  }
  R(ctx, 0, 150, W, 18, P.silver);
  R(ctx, 0, 150, W, 1, P.white);
  for (let x = -(Math.round(scroll) % 32); x < W; x += 32) R(ctx, x, 150, 1, 18, P.fog);
  R(ctx, 0, 168, W, 48, P.slate);
  for (let x = -(Math.round(scroll * 1.2) % 60); x < W; x += 60) R(ctx, x, 190, 30, 3, P.yellow);
}

// --- shots -------------------------------------------------------------------

// 1. Establishing: a commuter in a downpour of notifications.
function shotDownpour(ctx, lt) {
  const scroll = lt * 40;
  street(ctx, lt, scroll, false);
  const x = 176;
  const pile = Math.min(7, Math.floor(lt * 1.8));
  iconRain(ctx, lt, { x0: x - 46, w: 92, y0: 58, ground: 160, n: 26, seed: 4, speed: 80 });
  const me = hero(ctx, x, 168, { pal: COMMUTER, eyes: 'sad', mouth: 'frown', legs: 'walk', step: Math.floor(lt * 5), armL: 'down', armR: 'down', sweat: lt });
  rrect(ctx, me.handR[0] - 2, me.handR[1], 16, 12, P.black, 1);
  rrect(ctx, me.handR[0] - 1, me.handR[1] + 1, 14, 10, P.brown, 1);
  // icons stuck on him
  for (let i = 0; i < pile; i++) icon(ctx, KINDS[(i + 2) % 6], x - 14 + ((i * 11) % 30), me.top + 26 + ((i * 7) % 16));
  stormCloud(ctx, x, 46 + wave(lt, 0.6, 2), 22, lt);
  for (let i = 0; i < 3; i++) R(ctx, (lt * 120 + i * 140) % W, 176 + i * 9, 18, 1, P.steel);
}

// 2. Close-up: popups stuck to his face.
function shotSticky(ctx, lt) {
  bands(ctx, 0, 0, W, H, [P.ink, P.slate]);
  clipRect(ctx, 0, 24, W, H);
  iconRain(ctx, lt, { x0: 0, w: W, y0: 10, ground: H, n: 22, seed: 7, speed: 90 });
  ctx.restore();
  faceCU(ctx, 192, 124, 44, { pal: COMMUTER, eyes: lt % 1.6 < 0.12 ? 'closed' : 'sad', mouth: 'wavy', iris: P.brown });
  // sticky popup on his forehead
  const sy = Math.round(easeOutBack(prog(lt, 0.2, 0.5), 2) * 10);
  panel(ctx, 128, 60 + sy, 72, 40, P.white, P.black, 1);
  R(ctx, 129, 61 + sy, 70, 8, P.blue);
  R(ctx, 191, 62 + sy, 6, 5, P.red);
  text(ctx, 'ACCEPT ALL?', 164, 72 + sy, { color: P.black, align: 'center' });
  panel(ctx, 140, 84 + sy, 22, 11, P.silver, P.black, 1);
  panel(ctx, 168, 84 + sy, 22, 11, P.silver, P.black, 1);
  text(ctx, 'YES', 151, 86 + sy, { color: P.black, align: 'center' });
  text(ctx, 'YES', 179, 86 + sy, { color: P.black, align: 'center' });
  if (lt > 0.8) {
    disc(ctx, 236, 146, 12, P.black);
    disc(ctx, 236, 146, 11, P.red);
    text(ctx, '99+', 236, 143, { color: P.white, align: 'center' });
  }
  if (lt > 1.3) icon(ctx, 'cookie', 150, 152);
}

// 3. Product hero: FWOMP.
function shotReveal(ctx, lt) {
  bands(ctx, 0, 0, W, H, [P.navy, P.blue, P.navy]);
  for (let i = 0; i < 3; i++) poly(ctx, [[192 - 20 - i * 10, 0], [192 + 20 + i * 10, 0], [192 + 70 + i * 16, 200], [192 - 70 - i * 16, 200]], A(P.cyan, 0.05));
  oval(ctx, 192, 196, 70, 8, A(P.black, 0.35));
  const open = prog(lt, 0.9, 1.4);
  const drop = easeOutBack(prog(lt, 0.0, 0.6), 1.6);
  const y = Math.round(lerp(-120, 96, drop));
  if (open <= 0) {
    // closed umbrella, a slim tapered shape
    poly(ctx, [[192, y - 64], [200, y - 6], [184, y - 6]], P.black);
    poly(ctx, [[192, y - 62], [198, y - 8], [186, y - 8]], P.blue);
    R(ctx, 189, y - 40, 2, 30, P.white);
    handle(ctx, 192, y - 8, 26);
  } else {
    const sx = 1 + Math.sin(Math.min(1, open) * Math.PI) * 0.25;
    const sy = 1 - Math.sin(Math.min(1, open) * Math.PI) * 0.3;
    const rx = Math.round(lerp(10, 78, easeOutBack(open, 2)) * (open < 1 ? sx : 1));
    const ry = Math.round(58 * (open < 1 ? sy : 1));
    canopy(ctx, 192, y + 4, rx, ry);
    handle(ctx, 192, y + 5, 40);
    if (open >= 1) {
      // glint along the canopy
      const g = prog(lt, 1.6, 2.3);
      if (g > 0 && g < 1) {
        clipRect(ctx, 114, y - 56, 156, 62);
        for (let yy = y - 56; yy < y + 6; yy += 2) R(ctx, 100 + g * 200 + (y + 6 - yy) * 0.6 - 40, yy, 8, 2, A(P.white, 0.55));
        ctx.restore();
      }
      for (let i = 0; i < 5; i++) sparkle(ctx, 120 + i * 36, y - 60 + ((i * 17) % 30), twinkle(lt, i * 0.2), P.white);
    }
  }
  if (lt > 0.95 && lt < 1.8) bigText(ctx, 'FWOMP!', 300, 54, { scale: 3, color: P.white, outline: P.navy, ow: 2, depth: 2, depthColor: P.blue, align: 'center' });
  if (lt > 2.0) {
    const p = easeOut(prog(lt, 2.0, 2.4));
    text(ctx, 'INTRODUCING THE', 192, Math.round(lerp(216, 186, p)), { color: P.cyan, align: 'center' });
  }
}

// 4. Demo: everything bounces off.
function shotDemo(ctx, lt) {
  const scroll = lt * 40;
  const sunny = lt > 3.6;
  street(ctx, lt, scroll, sunny);
  if (sunny) {
    const p = easeOut(prog(lt, 3.6, 4.6));
    glow(ctx, 340, Math.round(lerp(110, 46, p)), 40, P.yellow, 0.1);
    disc(ctx, 340, Math.round(lerp(110, 46, p)), 14, P.yellow);
  }
  const x = 176;
  const me = hero(ctx, x, 168, { pal: COMMUTER, eyes: 'happy', mouth: 'smile', legs: 'walk', step: Math.floor(lt * 5), armL: 'down', armR: [[-5, -6], [-6, -12]], blush: true });
  const cp = { cx: me.handR[0], cy: me.top - 6, rx: 52, ry: 36 };
  R(ctx, cp.cx - 1, cp.cy, 3, me.handR[1] - cp.cy, P.black);
  R(ctx, cp.cx, cp.cy, 1, me.handR[1] - cp.cy, P.silver);
  disc(ctx, me.handR[0], me.handR[1], 3, P.black);
  disc(ctx, me.handR[0], me.handR[1], 2, COMMUTER.S);
  canopy(ctx, cp.cx, cp.cy, cp.rx, cp.ry);
  iconRain(ctx, lt, { x0: x - 70, w: 150, y0: 30, ground: 160, n: 16, seed: 11, canopy: cp });
  const mood = lt > 1.2 ? 'angry' : 'mean';
  stormCloud(ctx, x - 6, 22 + wave(lt, 0.7, 2), 20, lt, mood);
  // terms & conditions scroll falls and bounces away
  if (lt > 2.0 && lt < 3.6) {
    const t = lt - 2.0;
    const hitT = 0.45;
    let sx = x - 4;
    let sy = 10 + t * 120;
    if (t > hitT) {
      const tt = t - hitT;
      sx = x - 4 + tt * 150;
      sy = 10 + hitT * 120 - tt * 90 + tt * tt * 220;
    }
    R(ctx, sx - 14, sy - 30, 28, 46, P.black);
    R(ctx, sx - 13, sy - 29, 26, 44, P.white);
    text(ctx, 'T&C', sx, sy - 27, { color: P.red, align: 'center' });
    for (let i = 0; i < 6; i++) R(ctx, sx - 10, sy - 16 + i * 5, 20, 1, P.fog);
    if (t > hitT && t < hitT + 0.5) bigText(ctx, 'BOING!', x + 70, 70, { scale: 2, color: P.yellow, outline: P.black, ow: 2 });
  }
  if (lt > 0.4) {
    panel(ctx, 262, 182, 116, 24, P.black, P.cyan, 2);
    text(ctx, 'BLOCKED: ' + Math.min(999, Math.floor(lt * 61)), 320, 186, { color: P.green, align: 'center' });
    text(ctx, 'NOTIFICATIONS', 320, 196, { color: P.white, align: 'center' });
  }
}

// 5. Reaction: blissfully offline under the canopy.
function shotBliss(ctx, lt) {
  bands(ctx, 0, 0, W, H, [P.blue, P.cyan, P.cream]);
  glow(ctx, 340, 40, 50, P.yellow, 0.1);
  disc(ctx, 340, 40, 16, P.yellow);
  faceCU(ctx, 192, 130, 42, { pal: COMMUTER, eyes: 'happy', mouth: 'grin', blush: true });
  // under the canopy: dark underside, ribs to the shaft, scalloped rim
  const tips = [];
  for (let i = 0; i <= 8; i++) tips.push([-40 + i * 58, 58 + Math.round(Math.sin((i / 8) * Math.PI) * 14)]);
  const rim = [];
  for (let i = 0; i < 8; i++) {
    rim.push(tips[i]);
    rim.push([(tips[i][0] + tips[i + 1][0]) / 2, (tips[i][1] + tips[i + 1][1]) / 2 - 8]);
  }
  rim.push(tips[8]);
  poly(ctx, [[-40, -2], [424, -2], ...rim.slice().reverse().map(([x, y]) => [x, y + 2])], P.black);
  poly(ctx, [[-40, -2], [424, -2], ...rim.slice().reverse()], P.navy);
  for (let i = 0; i < 8; i += 2) poly(ctx, [[256, -30], tips[i], [(tips[i][0] + tips[i + 1][0]) / 2, (tips[i][1] + tips[i + 1][1]) / 2 - 8], tips[i + 1]], P.blue);
  for (let i = 1; i < 8; i++) line(ctx, 256, -30, tips[i][0], tips[i][1], P.ink);
  for (let i = 0; i <= 8; i++) disc(ctx, tips[i][0], tips[i][1], 2, P.white);
  R(ctx, 254, 0, 4, 160, P.black);
  R(ctx, 255, 0, 2, 160, P.silver);
  disc(ctx, 256, 164, 7, P.black);
  disc(ctx, 256, 164, 6, COMMUTER.S);
  // notifications slide off the rim and drop away
  const edge = [1, 7, 0, 8, 2, 6];
  for (let i = 0; i < 6; i++) {
    const t = (lt * 0.9 + i / 6) % 1;
    const [tx, ty] = tips[edge[i]];
    const sd = tx < 192 ? -1 : 1;
    icon(ctx, KINDS[i], tx + sd * t * 50, ty + 6 + t * t * 170);
  }
  // a sad popup slides away
  const p = prog(lt, 0.6, 2.2);
  panel(ctx, Math.round(lerp(300, 330, p)), Math.round(lerp(120, 230, p)), 70, 24, P.white, P.black, 1);
  text(ctx, 'SYNC FAILED', Math.round(lerp(335, 365, p)), Math.round(lerp(124, 234, p)), { color: P.black, align: 'center' });
  text(ctx, ':(', Math.round(lerp(335, 365, p)), Math.round(lerp(134, 244, p)), { color: P.blue, align: 'center' });
}

// 6. End slate.
function shotSlate(ctx, lt) {
  bands(ctx, 0, 0, W, H, [P.blue, P.cyan, P.cream]);
  glow(ctx, 350, 40, 60, P.yellow, 0.08);
  disc(ctx, 350, 40, 18, P.yellow);
  disc(ctx, 350, 40, 14, P.white);
  for (let i = 0; i < 4; i++) cloud(ctx, ((i * 120 + lt * (6 + i * 2)) % (W + 80)) - 40, 150 + (i % 2) * 14, 12 + (i % 3) * 3, P.white, P.silver);
  const bob = wave(lt, 0.5, 2);
  const ux = 46;
  const uy = 40 + bob;
  ctx.drawImage(umbrellaArt(), ux, uy);
  glint(ctx, umbrellaArt(), ux, uy, ((lt + 0.6) % 3) / 0.8, { width: 8, alpha: 0.6 });
  for (let i = 0; i < 4; i++) sparkle(ctx, ux + 10 + i * 28, uy - 4 + ((i * 13) % 20), twinkle(lt, i * 0.25), P.white);
  const mk = MARK();
  const x0 = drawMark(ctx, mk, 262, 50, { reveal: prog(lt, 0.2, 1.0), drop: 30 });
  if (lt > 1.2) glint(ctx, mk.cv, x0 - mk.ox, 50 - mk.oy, ((lt - 1.2) % 3.2) / 0.7, { width: 6 });
  if (lt > 1.0) text(ctx, 'THE UMBRELLA FOR CLOUD COMPUTING', 262, 86, { color: P.navy, align: 'center' });
  if (lt > 1.5) slogan(ctx, 'STAY DRY. STAY OFFLINE.', 192, 140, lt - 1.5, { scale: 2, bg: P.yellow, edge: P.orange, color: P.navy });
  if (lt > 2.1) urlPill(ctx, 'CLOUDBRELLA.OFF', 192, 170, { bg: P.navy, border: P.white, color: P.white });
  finePrint(ctx, 'NOT EFFECTIVE AGAINST ACTUAL RAIN. DO NOT OPEN INDOORS, YOUR WI-FI WILL GET SAD.', { lt: lt - 2.3 });
}

const SCENES = [
  { at: 0, draw: shotDownpour },
  { at: 5.0, draw: shotSticky, wipe: 'iris', wd: 0.4, cx: 176, cy: 120 },
  { at: 7.5, draw: shotReveal, wipe: 'bars', wd: 0.45 },
  { at: 11.6, draw: shotDemo, wipe: 'push', wd: 0.5 },
  { at: 17.0, draw: shotBliss, wipe: 'iris', wd: 0.4, cx: 176, cy: 110 },
  { at: 19.7, draw: shotSlate, wipe: 'dissolve', wd: 0.5 },
];

export default {
  id: 'cloudbrella',
  brand: 'CLOUDBRELLA',
  duration: 25.3,
  voice: { gender: 'male', lang: 'en-GB', pitch: 1.0, rate: 1.03 },
  script: [
    { at: 0.6, text: 'Caught in another downpour of updates, syncs and pop-ups?' },
    { at: 7.7, text: 'Introducing the Cloudbrella. Total protection from cloud computing.' },
    { at: 11.9, text: 'It blocks ninety-nine percent of updates, notifications... and terms and conditions.' },
    { at: 20.1, text: 'Cloudbrella. Stay dry. Stay offline.' },
  ],
  // 128 bpm: gloomy drizzle, a rising FWOMP, a bouncy sunny theme, and the
  // CLOUD-BREL-LA sting resolving on G with the end slate at beat 42.
  tune: {
    bpm: 128,
    wave: 'square',
    notes: tune(
      rep('E4:1 E4:0.5 D4:0.5 E4:1 G4:1 F#4:2 D4:2', 2),
      'B4:0.5 D5:0.5 G5:0.5 B5:0.5 R:1 D6:3 R:2',
      'G5:0.5 G5:0.5 A5:0.5 B5:0.5 D6:1 B5:1 C6:0.5 B5:0.5 A5:0.5 G5:0.5 A5:2',
      'E5:0.5 E5:0.5 F#5:0.5 G5:0.5 B5:1 G5:1 A5:0.5 G5:0.5 F#5:0.5 E5:0.5 D5:2 D5:1 F#5:1',
      'D5:1 G5:1 B5:1 R:0.5 A5:0.5 B5:1 G5:3 R:4',
    ),
    bass: tune('E2:4 C3:4 E2:4 D2:4', 'G2:2 D3:2 G2:4', rep('G2:1 D3:1 G2:1 D3:1 C3:1 G2:1 D3:2', 2), 'D3:2', 'G2:2 C3:2 D3:2 G2:2 R:4'),
    bassWave: 'triangle',
    drums: tune(rep('H:0.5', 32), 'S:0.25 S:0.25 S:0.25 S:0.25 S:0.5 S:0.5 K:2 R:4', rep('K:1 H:0.5 H:0.5 S:1 H:1', 4), 'K:1 K:1', 'K:1 S:1 K:1 S:1 K:0.5 K:0.5 S:1 K:2 R:4'),
  },
  draw(ctx, t, dt, info) {
    play(ctx, dt, info, SCENES);
  },
};
