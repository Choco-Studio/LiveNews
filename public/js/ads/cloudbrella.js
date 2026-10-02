// CLOUDBRELLA — the umbrella that protects you from cloud computing. A commuter
// is pelted by updates, pop-ups, cookies and terms & conditions until the
// Cloudbrella opens with a FWOMP. Brand colours: sky blue, white, sunshine
// yellow. Tagline: "Stay dry. Stay offline."
//
// Storyboard (120 bpm, a beat is 0.5 s):
//  1  0.0 DOWNPOUR  a storm cloud rains notifications on a hunched commuter.  VO "Is the cloud... raining on your parade?"
//  2  4.0 BARRAGE   close-up; one hit per word, each with its own gag.         VO "Updates. Pop-ups. Cookies. Terms and conditions!"
//  3  8.0 REVEAL    whip pan to the studio: the umbrella rises, FWOMP, sweep.   VO "Introducing... Cloudbrella!"
//  4 11.0 DEMO      a jaunty walk; everything bounces off; the cloud drops the  VO "It blocks ninety-nine percent of notifications..."
//                   giant T&C scroll and it BOINGs away.                       VO "...and one hundred percent of terms and conditions."
//  5 16.0 BLISS     under the canopy, offline at last.
//  6 19.5 SLATE     logo, tagline, url, legal; then real rain falls straight    VO "Cloudbrella. Stay dry. Stay offline."
//                   through the canopy (the legal line explains).
import {
  P, W, H, R, A, rrect, panel, disc, oval, ring, poly, line, dither, bands, sparkle, twinkle, shadow, stroke, cached,
  text, bigText, kinetic, words, micro, play, hero, faceCU, wordmark, drawMark, cloud, mulberry32, prog, lerp, easeOut,
  easeIn, easeOutBack, easeOutElastic, spring, wobble, tween, key, poseAt, blink, breath, kick, clipRect, clipCircle,
  spotlight, endSlate, lazy, frame, rep, tune,
} from './kit.js';

const COMMUTER = { S: P.tan, s: P.tanShade, H: P.black, h: P.slate, E: P.black, T: P.steel, t: P.slate, L: P.steel, C: P.white, X: P.yellow, P: P.slate, p: P.ink, B: P.black, b: P.ink, Y: P.silver };

// --- brand -------------------------------------------------------------------

const MARK = lazy(() => wordmark('CLOUDBRELLA', {
  h: 24, pen: 2, wide: 0.8, gap: 2,
  fill: [P.white, P.white, P.silver], hi: P.white,
  outline: [[P.blue, 2], [P.navy, 1]], depth: 2, depthColor: P.navy,
  wave: (i) => Math.round(Math.sin(i * 0.9) * 2),
}));

// --- props -------------------------------------------------------------------

const KINDS = ['mail', 'popup', 'sync', 'cookie', 'badge', 'update'];

/** Notification icons (cached 18 x 14 each), centred on (x, y). */
function icon(ctx, kind, x, y) {
  const cv = cached(`cb-icon-${kind}`, 18, 14, (c) => {
    if (kind === 'mail') {
      R(c, 1, 2, 16, 11, P.black);
      R(c, 2, 3, 14, 9, P.white);
      line(c, 2, 3, 9, 8, P.black);
      line(c, 15, 3, 9, 8, P.black);
      disc(c, 15, 3, 3, P.red);
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

/**
 * Open umbrella seen from the side, 2.5D: its 8 panels are meridians of a dome,
 * so `turn` (revolutions) twirls it. (cx, rimY) = middle of the rim; apex at rimY - ry.
 */
function canopy(ctx, cx, rimY, rx, ry, turn = 0, { colA = P.blue, colB = P.white, logo = true, tilt = 0.16 } = {}) {
  const n = 8;
  const seams = [];
  for (let i = 0; i <= n * 2; i++) {
    const th = (i / n) * Math.PI + turn * 2 * Math.PI;
    seams.push(th);
  }
  const apex = [cx, rimY - ry];
  const tipOf = (th) => [cx + Math.cos(th) * rx, rimY + Math.sin(th) * ry * tilt];
  // silhouette: dome + rim, outlined
  const outline = [];
  for (let k = 0; k <= 20; k++) {
    const a = Math.PI + (k / 20) * Math.PI;
    outline.push([cx + Math.cos(a) * (rx + 1), rimY - 1 + Math.sin(a) * (ry + 1)]);
  }
  outline.push([cx + rx + 1, rimY + 2], [cx, rimY + ry * tilt + 3], [cx - rx - 1, rimY + 2]);
  poly(ctx, outline, P.black);
  // front-facing panels between consecutive seams (sin > 0 means towards us)
  const curve = (th, steps = 6) => {
    const pts = [];
    for (let k = 0; k <= steps; k++) {
      const ph = (k / steps) * (Math.PI / 2);
      pts.push([cx + Math.cos(th) * rx * Math.sin(ph), rimY - ry * Math.cos(ph) + Math.sin(th) * ry * tilt * Math.sin(ph)]);
    }
    return pts;
  };
  const wrap = (v) => ((v % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  for (let i = 0; i < n * 2; i++) {
    const a = wrap(seams[i]);
    for (const off of [0, -2 * Math.PI]) {
      const lo = Math.max(a + off, 0);
      const hi = Math.min(a + off + Math.PI / n, Math.PI);
      if (hi <= lo) continue;
      const ca = curve(lo);
      const cb = curve(hi).reverse();
      const ta = tipOf(lo);
      const tb = tipOf(hi);
      const scallop = [(ta[0] + tb[0]) / 2, (ta[1] + tb[1]) / 2 - ry * 0.07];
      const side = Math.cos((lo + hi) / 2);
      const base = i % 2 ? colB : colA;
      const col = side > 0.45 ? (base === colB ? P.silver : P.navy) : base;
      poly(ctx, [...ca, scallop, ...cb], col);
      if (side < -0.35 && base === colB) poly(ctx, [...ca.slice(1, 4), [ca[3][0] + 2, ca[3][1]], [ca[1][0] + 1, ca[1][1]]], P.white);
    }
  }
  // seams
  for (let i = 0; i < n * 2; i++) {
    const th = ((seams[i] % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    if (th <= 0.05 || th >= Math.PI - 0.05) continue;
    const c = curve(th, 5);
    for (let k = 0; k + 1 < c.length; k++) line(ctx, c[k][0], c[k][1], c[k + 1][0], c[k + 1][1], P.navy);
    const tp = tipOf(th);
    disc(ctx, tp[0], tp[1], 1, P.white);
  }
  // highlight on the lit shoulder
  for (let k = 3; k <= 7; k++) {
    const a = Math.PI + (k / 20) * Math.PI;
    R(ctx, cx + Math.cos(a) * (rx - 3), rimY - 1 + Math.sin(a) * (ry - 3), 2, 1, A(P.white, 0.6));
  }
  R(ctx, cx - 1, rimY - ry - 5, 3, 6, P.black);
  R(ctx, cx, rimY - ry - 4, 1, 4, P.silver);
  // the brand mark on the front panel: a cloud with a red slash
  if (logo && rx > 30) {
    const lx = cx + Math.round(Math.sin(turn * 2 * Math.PI) * rx * 0.12);
    const ly = Math.round(rimY - ry * 0.45);
    cloud(ctx, lx, ly, Math.max(5, Math.round(rx / 7)), P.navy);
    line(ctx, lx - rx / 6, ly + rx / 9, lx + rx / 6, ly - rx / 9, P.red, 2);
  }
}

function handle(ctx, cx, y0, len) {
  R(ctx, cx - 1, y0, 3, len, P.black);
  R(ctx, cx, y0, 1, len, P.silver);
  stroke(ctx, [[cx, y0 + len], [cx, y0 + len + 6], [cx - 3, y0 + len + 9], [cx - 7, y0 + len + 7]], 2, P.brown, P.black);
}

/** Closed umbrella: a slim furled cone with a strap. (cx, tipY) = the top of the ferrule. */
function furled(ctx, cx, tipY, h, squash = 0) {
  const hh = Math.round(h * (1 - squash));
  const w = Math.round(7 * (1 + squash * 1.5));
  poly(ctx, [[cx, tipY], [cx + w + 1, tipY + hh], [cx - w - 1, tipY + hh]], P.black);
  poly(ctx, [[cx, tipY + 2], [cx + w, tipY + hh - 1], [cx - w, tipY + hh - 1]], P.blue);
  poly(ctx, [[cx, tipY + 4], [cx - 1, tipY + hh - 2], [cx - w + 1, tipY + hh - 2]], P.white);
  R(ctx, cx - w, tipY + Math.round(hh * 0.6), w * 2, 3, P.navy);
  R(ctx, cx - 1, tipY - 5, 3, 6, P.black);
  handle(ctx, cx, tipY + hh - 1, 26);
}

/** The storm cloud: a grumpy cloud-computing icon with sync arrows on its belly. */
function stormCloud(ctx, cx, cy, s, lt, mood = 'mean') {
  const puff = mood === 'windup' ? 1 + Math.sin(lt * 40) * 0.04 + 0.12 : mood === 'sulk' ? 0.8 : 1;
  const ss = Math.round(s * puff);
  cloud(ctx, cx, cy, ss, mood === 'windup' ? P.slate : P.steel, P.ink);
  const u = ss / 14;
  const ex = Math.round(8 * u);
  const ey = cy - Math.round(1 * u);
  for (const sd of [-1, 1]) {
    R(ctx, cx + sd * ex - 2, ey, 5, 4, P.white);
    R(ctx, cx + sd * ex - (sd < 0 ? 0 : 1), ey + (mood === 'sulk' ? 2 : 1), 2, 2, mood === 'windup' ? P.red : P.black);
    if (mood === 'angry' || mood === 'windup') line(ctx, cx + sd * (ex + 4), ey - 3, cx + sd * (ex - 3), ey - 1, P.black, 2);
    if (mood === 'sulk') line(ctx, cx + sd * (ex + 3), ey - 1, cx + sd * (ex - 3), ey - 3, P.black, 1);
  }
  if (mood === 'sulk') {
    R(ctx, cx - 3, ey + 8, 6, 1, P.black);
    R(ctx, cx - 4, ey + 9, 1, 1, P.black);
    R(ctx, cx + 3, ey + 9, 1, 1, P.black);
  } else {
    R(ctx, cx - 4, ey + 7, 8, 1, P.black);
    R(ctx, cx - 5, ey + 8, 1, 1, P.black);
    R(ctx, cx + 4, ey + 8, 1, 1, P.black);
  }
  // sync arrows on its belly
  const by = cy + Math.round(5 * u);
  for (const sd of [-1, 1]) {
    const ax = cx + sd * Math.round(16 * u);
    R(ctx, ax - 1, by - 2, 2, 5, P.cyan);
    if (sd < 0) R(ctx, ax - 2, by - 2, 4, 1, P.cyan);
    else R(ctx, ax - 2, by + 2, 4, 1, P.cyan);
  }
}

/** Icons raining down; they bounce off a canopy { cx, cy (rim), rx, ry } if given. */
function iconRain(ctx, lt, { x0, w, y0, ground, n = 14, seed = 1, speed = 70, canopy: cp = null, onHit = null }) {
  const rand = mulberry32(seed);
  for (let i = 0; i < n; i++) {
    const x = x0 + rand() * w;
    const period = 1.4 + rand() * 1.2;
    const ph = rand() * period;
    const vk = 1.2 + rand() * 0.4;
    const kind = KINDS[i % KINDS.length];
    const t = (lt + ph) % period;
    let y = y0 + t * speed * vk;
    let xx = x + Math.sin(t * 4 + i) * 2;
    if (cp && Math.abs(x - cp.cx) < cp.rx) {
      const hitY = cp.cy - cp.ry * Math.sqrt(Math.max(0, 1 - ((x - cp.cx) / cp.rx) ** 2)) - 4;
      const tHit = (hitY - y0) / (speed * vk);
      if (t > tHit) {
        const tt = t - tHit;
        xx = x + Math.sign(x - cp.cx || 1) * tt * 90;
        y = hitY - tt * 80 + tt * tt * 300;
        if (tt < 0.1) {
          sparkle(ctx, x, hitY - 2, 2, P.white);
          onHit?.(x, hitY);
        }
      }
    }
    if (y > ground || y < -10) continue;
    icon(ctx, kind, xx, y);
  }
}

// --- the street --------------------------------------------------------------

const STRIP = 480; // tiled backdrop width
function paintFar(c, sunny) {
  const rand = mulberry32(8);
  for (let x = 0; x < STRIP; x += 26 + Math.floor(rand() * 14)) {
    const h = 50 + Math.floor(rand() * 50);
    R(c, x, 150 - h, 30, h, sunny ? P.fog : P.slate);
    if (sunny) R(c, x, 150 - h, 30, 1, P.silver);
  }
}
function paintNear(c, sunny) {
  const rand = mulberry32(21);
  for (let x = 0; x < STRIP; x += 74 + Math.floor(rand() * 20)) {
    const top = 70 + Math.floor(rand() * 30);
    R(c, x, top, 64, 150 - top, sunny ? P.steel : P.ink);
    R(c, x, top, 64, 2, sunny ? P.fog : P.slate);
    for (let wy = top + 7; wy < 140; wy += 11) {
      for (let wx = x + 6; wx < x + 58; wx += 13) {
        R(c, wx, wy, 7, 6, sunny ? P.cyan : P.navy);
        if (!sunny && rand() < 0.25) R(c, wx, wy, 7, 6, P.yellow);
        R(c, wx, wy + 6, 7, 1, sunny ? P.fog : P.slate);
      }
    }
  }
}
function paintStreet(c, sunny) {
  R(c, 0, 150, STRIP, 20, sunny ? P.silver : P.steel);
  R(c, 0, 150, STRIP, 1, sunny ? P.white : P.fog);
  for (let x = 0; x < STRIP; x += 32) R(c, x, 150, 1, 20, sunny ? P.fog : P.slate);
  R(c, 0, 170, STRIP, 3, P.black);
  R(c, 0, 173, STRIP, 43, P.slate);
  for (let x = 0; x < STRIP; x += 60) R(c, x, 192, 30, 3, P.yellow);
  // a lamp post and a bus-stop sign
  for (const lx of [40, 280]) {
    R(c, lx - 2, 76, 4, 75, P.black);
    R(c, lx - 1, 76, 2, 75, sunny ? P.fog : P.slate);
    R(c, lx - 8, 70, 18, 7, P.black);
    R(c, lx - 7, 71, 16, 4, sunny ? P.white : P.yellow);
  }
  R(c, 168, 112, 2, 39, P.black);
  rrect(c, 160, 100, 18, 14, P.black, 2);
  rrect(c, 161, 101, 16, 12, P.green, 2);
  text(c, 'B', 166, 104, { color: P.white });
}
const far = (s) => cached(`cb-far-${s}`, STRIP, 160, (c) => paintFar(c, s));
const near = (s) => cached(`cb-near-${s}`, STRIP, 160, (c) => paintNear(c, s));
const pavement = (s) => cached(`cb-street-${s}`, STRIP, H, (c) => paintStreet(c, s));

function tile(ctx, cv, offset) {
  const x = -(((Math.round(offset) % STRIP) + STRIP) % STRIP);
  ctx.drawImage(cv, x, 0);
  ctx.drawImage(cv, x + STRIP, 0);
}
function street(ctx, scroll, sunny) {
  bands(ctx, 0, 0, W, 152, sunny ? [P.blue, P.cyan, P.cream] : [P.ink, P.slate, P.steel]);
  tile(ctx, far(sunny), scroll * 0.2);
  tile(ctx, near(sunny), scroll * 0.5);
  tile(ctx, pavement(sunny), scroll);
}

/** The commuter walking on the pavement (ground y 168). */
function commuter(ctx, x, lt, { happy = false, umbrella = false, hunch = 0 } = {}) {
  const step = Math.floor(lt * (happy ? 6 : 4.5));
  const bounce = happy ? -Math.round(Math.abs(Math.sin(lt * 6 * Math.PI / 2)) * 2) : hunch;
  const eyes = blink(lt, 4) ? 'closed' : happy ? 'happy' : 'sad';
  const armR = umbrella ? [[-5, -6], [-6, -12]] : [[-1, 9], [1, 15]];
  const me = hero(ctx, x, 168, {
    pal: COMMUTER, eyes, mouth: happy ? 'smile' : 'frown', brows: happy ? 'flat' : 'sad', legs: 'walk', step, bob: bounce,
    armL: poseAt(lt * (happy ? 3 : 2.25) % 2, [[0, [[-2, 7], [-4, 13]]], [1, [[0, 7], [3, 13]], 'inOut'], [2, [[-2, 7], [-4, 13]], 'inOut']]),
    armR, blush: happy, sweat: happy ? 0 : lt,
  });
  if (!umbrella) {
    // briefcase
    const [hx, hy] = me.handR;
    rrect(ctx, hx - 7, hy + 1, 16, 12, P.black, 1);
    rrect(ctx, hx - 6, hy + 2, 14, 10, P.brown, 1);
    R(ctx, hx - 6, hy + 5, 14, 1, P.tanShade);
  }
  return me;
}

// --- shots -------------------------------------------------------------------

// 1. DOWNPOUR: the street in a storm of notifications.
function shotDownpour(ctx, lt) {
  const scroll = lt * 34;
  street(ctx, scroll, false);
  const x = 170;
  iconRain(ctx, lt, { x0: x - 60, w: 120, y0: 52, ground: 166, n: 22, seed: 4, speed: 78 });
  const me = commuter(ctx, x, lt, { hunch: 2 });
  // icons stuck to his suit, more and more
  const pile = Math.min(6, Math.floor(lt * 1.7));
  for (let i = 0; i < pile; i++) icon(ctx, KINDS[(i + 2) % 6], x - 12 + ((i * 11) % 26), me.top + 26 + ((i * 7) % 14));
  // the ones that missed pile up on the pavement behind him
  for (let i = 0; i < 9; i++) icon(ctx, KINDS[i % 6], ((i * 47 - scroll) % 420 + 420) % 420 - 20, 164 - (i % 3) * 3);
  stormCloud(ctx, x + Math.round(Math.sin(lt * 0.8) * 6), 42 + Math.round(Math.sin(lt * 1.7) * 2), 22, lt);
  if (lt > 1.4) {
    const p = spring(lt - 1.4);
    panel(ctx, 262, 18, 108, 20, P.white, P.black, 2);
    R(ctx, 263, 19, 106, 5, P.blue);
    micro(ctx, `${Math.min(999, Math.floor((lt - 1.4) * 140))} NEW NOTIFICATIONS`, 316, 28, { color: P.black, align: 'center' });
    if (p < 0.9) R(ctx, 262, 18, 108, 20, A(P.white, 0.5));
  }
}

// 2. BARRAGE: close-up; one hit per word of the voice-over.
const HITS = [0.5, 1.25, 2.0, 2.75];
function shotBarrage(ctx, lt) {
  bands(ctx, 0, 0, W, H, [P.ink, P.slate, P.steel]);
  clipRect(ctx, 0, 0, W, H);
  iconRain(ctx, lt, { x0: 0, w: W, y0: -10, ground: H, n: 16, seed: 7, speed: 90 });
  ctx.restore();
  let dx = 0;
  let dy = 0;
  for (const h of HITS) {
    const [kx, ky] = kick(lt, h, 0.22, 3, Math.round(h * 10));
    dx += kx;
    dy += ky;
  }
  const hitNow = HITS.some((h) => lt >= h && lt < h + 0.18);
  const cx = 192 + dx;
  const cy = 132 + dy;
  const s = 44;
  const covered = prog(lt, 2.75, 3.3);
  faceCU(ctx, cx, cy, s, { pal: COMMUTER, eyes: hitNow ? 'closed' : covered > 0.6 ? 'wide' : blink(lt, 2) ? 'closed' : 'sad', mouth: hitNow ? 'wavy' : 'frown', iris: P.brown, look: lt > 1.6 && lt < 2.0 ? 1 : 0 });
  // 1 UPDATE NOW drops onto his head and stays there
  if (lt > 0.2) {
    const land = prog(lt, 0.2, 0.5);
    const y = Math.round(lerp(-40, cy - s - 30, easeIn(land)));
    const sq = wobble(lt, 0.5, 0.25, 4, 7);
    const w = Math.round(64 * (1 + sq));
    const h2 = Math.round(30 * (1 - sq));
    const bx = cx - 6 - Math.round(w / 2);
    const by = y + (30 - h2);
    panel(ctx, bx, by, w, h2, P.white, P.black, 2);
    R(ctx, bx + 1, by + 1, w - 2, 6, P.green);
    micro(ctx, 'UPDATE NOW?', bx + w / 2, by + 11, { color: P.black, align: 'center' });
    if (h2 > 24) {
      panel(ctx, bx + 6, by + h2 - 11, 22, 9, P.green, P.black, 1);
      panel(ctx, bx + w - 28, by + h2 - 11, 22, 9, P.green, P.black, 1);
      micro(ctx, 'NOW', bx + 17, by + h2 - 9, { color: P.white, align: 'center' });
      micro(ctx, 'NOW', bx + w - 17, by + h2 - 9, { color: P.white, align: 'center' });
    }
  }
  // 2 a pop-up slaps onto his cheek
  if (lt > 1.0) {
    const p = easeOutBack(prog(lt, 1.0, 1.25), 1.5);
    const px = Math.round(lerp(-90, cx - s - 28, p));
    panel(ctx, px, cy + 2, 62, 34, P.white, P.black, 2);
    R(ctx, px + 1, cy + 3, 60, 6, P.blue);
    R(ctx, px + 54, cy + 4, 4, 3, P.red);
    micro(ctx, 'ACCEPT ALL?', px + 31, cy + 13, { color: P.black, align: 'center' });
    panel(ctx, px + 8, cy + 22, 46, 10, P.yellow, P.black, 1);
    micro(ctx, 'YES', px + 31, cy + 24, { color: P.black, align: 'center' });
  }
  // 3 a cookie boinks off his nose and leaves crumbs
  if (lt > 1.75 && lt < 2.9) {
    const t = lt - 1.75;
    const hit = 0.25;
    const nx = cx + 2;
    const ny = cy + 12;
    let x;
    let y;
    if (t < hit) {
      x = lerp(W + 20, nx + 8, t / hit);
      y = lerp(ny - 30, ny, t / hit);
    } else {
      const u = t - hit;
      x = nx + 8 + u * 140;
      y = ny - u * 120 + u * u * 340;
    }
    disc(ctx, x, y, 8, P.black);
    disc(ctx, x, y, 7, P.tan);
    for (const [ox, oy] of [[-3, -2], [2, -3], [-1, 3], [3, 2]]) R(ctx, x + ox, y + oy, 2, 1, P.brown);
    if (t > hit) for (let i = 0; i < 5; i++) R(ctx, nx - 6 + i * 3, ny + 2 + ((t - hit) * 60 + i * 7) % 30, 1, 1, P.tan);
  }
  // 4 the terms and conditions unroll over everything
  if (lt > 2.6) {
    const p = easeOut(prog(lt, 2.6, 3.2));
    const top = 18;
    const len = Math.round(p * 190);
    R(ctx, 112, top, 160, len, P.black);
    R(ctx, 113, top, 158, len, P.cream);
    for (let yy = top + 16; yy < top + len - 4; yy += 6) R(ctx, 120, yy, 120 + ((yy * 7) % 24), 1, P.fog);
    micro(ctx, 'TERMS & CONDITIONS', 192, top + 6, { color: P.navy, align: 'center' });
    micro(ctx, 'PAGE 1 OF 4,096', 192, top + 12, { color: P.steel, align: 'center' });
    rrect(ctx, 106, top + len - 4, 172, 10, P.black, 3);
    rrect(ctx, 107, top + len - 3, 170, 8, P.silver, 3);
    // his eyes peek over the top edge while it is still unrolling
    if (len < 60) {
      R(ctx, cx - 18, top - 2, 36, 1, P.black);
    }
  }
  // the four words pile up around him
  const labels = [['UPDATES!', 74, 42], ['POP-UPS!', 66, 168], ['COOKIES!', 318, 132], ['T&CS!', 320, 46]];
  labels.forEach(([wd, x, y], i) => {
    if (lt > HITS[i]) kinetic(ctx, wd, x, y, lt - HITS[i], { style: 'stamp', scale: 2, color: P.yellow, outline: P.black, ow: 2, depth: 2, depthColor: P.rust });
  });
}

// 3. REVEAL: the studio, the umbrella rises, FWOMP, a light sweep.
function shotReveal(ctx, lt) {
  bands(ctx, 0, 0, W, 168, [P.navy, P.blue]);
  R(ctx, 0, 168, W, 48, P.navy);
  R(ctx, 0, 168, W, 1, P.cyan);
  spotlight(ctx, 192, 176, { top: -4, w0: 18, w1: 74, a: 0.06, color: P.white, pool: P.ink, poolRx: 80 });
  const fwomp = 1.25;
  const rise = easeOutBack(prog(lt, 0, 0.6), 1.4);
  const y = Math.round(lerp(260, 74, rise));
  if (lt < fwomp) {
    // anticipation: it sinks and squashes a little before it opens
    const sq = prog(lt, 0.9, fwomp) * 0.12;
    furled(ctx, 192, y + Math.round(sq * 40), 64, sq);
    if (lt > 0.4) kinetic(ctx, 'INTRODUCING', 192, 26, lt - 0.4, { style: 'type', scale: 1, color: P.cyan, outline: null, cps: 26 });
  } else {
    const t = lt - fwomp;
    const open = easeOutElastic(prog(t, 0, 0.7), 0.35);
    const rx = Math.round(lerp(8, 84, open));
    const ry = Math.round(lerp(60, 56, open) * (1 - wobble(lt, fwomp, 0.18, 3, 6)));
    // shockwave
    if (t < 0.5) {
      ring(ctx, 192, y + 10, Math.round(30 + t * 300), P.white);
      ring(ctx, 192, y + 10, Math.round(26 + t * 260), P.cyan);
    }
    const turn = 0.03 + t * 0.06;
    canopy(ctx, 192, y + 12, rx, ry, turn);
    handle(ctx, 192, y + 12, 40);
    // the light sweep across the canopy
    const g = prog(t, 0.6, 1.2);
    if (g > 0 && g < 1) {
      clipRect(ctx, 192 - rx, y + 12 - ry, rx * 2, ry + 6);
      for (let yy = 0; yy < ry + 6; yy += 2) R(ctx, 192 - rx - 30 + Math.round(g * (rx * 2 + 60)) + Math.round((ry - yy) * 0.5) - 20, y + 12 - ry + yy, 8, 2, A(P.white, 0.55));
      ctx.restore();
    }
    for (let i = 0; i < 5; i++) sparkle(ctx, 120 + i * 36, y - 50 + ((i * 17) % 30), twinkle(lt, i * 0.2), P.white);
    if (t < 0.9) kinetic(ctx, 'FWOMP!', 316, 44, t, { style: 'stamp', scale: 3, color: P.white, outline: P.navy, ow: 2, depth: 2, depthColor: P.blue });
    const mk = MARK();
    if (t > 0.3) drawMark(ctx, mk, 192, 180, { reveal: prog(t, 0.3, 0.9), drop: 24 });
  }
}

// 4. DEMO: a jaunty walk under the canopy; the cloud's big T&C scroll BOINGs off.
function shotDemo(ctx, lt) {
  const scroll = 200 + lt * 44;
  const sunny = lt > 4.2;
  street(ctx, scroll, sunny);
  if (sunny) {
    const p = easeOut(prog(lt, 4.2, 5));
    disc(ctx, 344, Math.round(lerp(110, 44, p)), 18, A(P.yellow, 0.3));
    disc(ctx, 344, Math.round(lerp(110, 44, p)), 14, P.yellow);
  }
  const x = 168;
  const me = commuter(ctx, x, lt, { happy: true, umbrella: true });
  const boing = 3.7;
  const squash = Math.max(0, wobble(lt, boing, 0.22, 4, 6));
  const cp = { cx: me.handR[0], cy: me.top - 8 + Math.round(squash * 10), rx: Math.round(54 * (1 + squash * 0.3)), ry: Math.round(36 * (1 - squash)) };
  R(ctx, cp.cx - 1, cp.cy, 3, me.handR[1] - cp.cy, P.black);
  R(ctx, cp.cx, cp.cy, 1, me.handR[1] - cp.cy, P.silver);
  disc(ctx, me.handR[0], me.handR[1], 3, P.black);
  disc(ctx, me.handR[0], me.handR[1], 2, COMMUTER.S);
  canopy(ctx, cp.cx, cp.cy, cp.rx, cp.ry, lt * 0.25);
  let blocked = 0;
  iconRain(ctx, lt, { x0: x - 80, w: 160, y0: 28, ground: 166, n: 18, seed: 11, canopy: cp, onHit: () => blocked++ });
  const mood = lt > 4.2 ? 'sulk' : lt > 3.0 && lt < boing ? 'windup' : lt > 1.2 ? 'angry' : 'mean';
  stormCloud(ctx, x - 6 + Math.round(Math.sin(lt * 0.9) * 4), 22 + Math.round(Math.sin(lt * 1.4) * 2) - (mood === 'sulk' ? Math.round(prog(lt, 4.2, 5) * 30) : 0), 20, lt, mood);
  // the giant T&C scroll: dropped, BOING, and away it spins
  if (lt > 3.3 && lt < 5) {
    const t = lt - 3.3;
    const hitT = boing - 3.3;
    let sx = x - 4;
    let sy = 20 + t * t * 900;
    let flip = false;
    if (t > hitT) {
      const u = t - hitT;
      sx = x - 4 + u * 210;
      sy = cp.cy - cp.ry - 34 - u * 150 + u * u * 260;
      flip = Math.floor(u * 10) % 2 === 1;
    } else sy = Math.min(sy, cp.cy - cp.ry - 34);
    const w = flip ? 52 : 34;
    const h = flip ? 34 : 52;
    R(ctx, sx - w / 2 - 1, sy - h / 2 - 1, w + 2, h + 2, P.black);
    R(ctx, sx - w / 2, sy - h / 2, w, h, P.cream);
    micro(ctx, 'T&C', sx, sy - h / 2 + 3, { color: P.red, align: 'center' });
    for (let i = 0; i < 5; i++) R(ctx, sx - w / 2 + 4, sy - h / 2 + 11 + i * 6, w - 8, 1, P.fog);
    R(ctx, sx - w / 2 - 3, sy - h / 2 - 3, w + 6, 4, P.silver);
    R(ctx, sx - w / 2 - 3, sy + h / 2 - 1, w + 6, 4, P.silver);
    if (t > hitT) kinetic(ctx, 'BOING!', x + 92, 64, t - hitT, { style: 'stamp', scale: 3, color: P.yellow, outline: P.black, ow: 2, depth: 2, depthColor: P.rust });
  }
  // blocked counter
  if (lt > 0.4) {
    panel(ctx, 258, 180, 118, 26, P.black, P.cyan, 2);
    const pct = Math.min(99, Math.floor(prog(lt, 0.4, 2.6) * 99));
    micro(ctx, 'NOTIFICATIONS BLOCKED', 317, 184, { color: P.white, align: 'center' });
    text(ctx, `${pct}%`, 317, 194, { color: P.green, align: 'center' });
    if (lt > boing) {
      micro(ctx, 'T&CS', 274, 196, { color: P.white, align: 'center' });
      micro(ctx, '100%', 360, 196, { color: P.yellow, align: 'center' });
    }
  }
}

// 5. BLISS: offline at last, under the canopy.
function shotBliss(ctx, lt) {
  bands(ctx, 0, 0, W, H, [P.blue, P.cyan, P.cream]);
  disc(ctx, 330, 52, 26, A(P.yellow, 0.3));
  disc(ctx, 330, 52, 18, P.yellow);
  // two birds crossing, with little notes
  for (let i = 0; i < 2; i++) {
    const bx = Math.round(-30 + lt * 70 + i * 26);
    const by = 96 + i * 10 + Math.round(Math.sin(lt * 6 + i) * 3);
    const up = frame(lt + i * 0.2, 6, 2) === 0;
    R(ctx, bx - 3, by, 7, 3, P.navy);
    R(ctx, bx + 3, by - 1, 2, 2, P.navy);
    R(ctx, bx + 5, by, 1, 1, P.orange);
    if (up) {
      R(ctx, bx - 4, by - 3, 3, 3, P.navy);
      R(ctx, bx, by - 3, 3, 3, P.navy);
    } else {
      R(ctx, bx - 4, by + 3, 3, 2, P.navy);
      R(ctx, bx, by + 3, 3, 2, P.navy);
    }
    if (frame(lt, 2, 3) === i) {
      R(ctx, bx + 8, by - 10, 1, 6, P.navy);
      R(ctx, bx + 6, by - 5, 3, 2, P.navy);
      R(ctx, bx + 9, by - 10, 3, 1, P.navy);
    }
  }
  const content = lt > 2.2 && !blink(lt, 6);
  faceCU(ctx, 184, 138 + breath(lt, 3, 1), 44, { pal: COMMUTER, eyes: content ? 'happy' : 'closed', mouth: 'smile', blush: true, iris: P.brown });
  // the canopy overhead seen from underneath
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
  R(ctx, 254, 0, 4, 168, P.black);
  R(ctx, 255, 0, 2, 168, P.silver);
  disc(ctx, 256, 170, 7, P.black);
  disc(ctx, 256, 170, 6, COMMUTER.S);
  // notifications slide off the rim and drop away
  const edge = [1, 7, 0, 8, 2, 6];
  for (let i = 0; i < 6; i++) {
    const t = (lt * 0.8 + i / 6) % 1;
    const [tx, ty] = tips[edge[i]];
    const sd = tx < 192 ? -1 : 1;
    icon(ctx, KINDS[i], tx + sd * t * 50, ty + 6 + t * t * 170);
  }
  if (lt > 0.6) words(ctx, 'OFFLINE. AT LAST.', 192, 196, lt - 0.6, { per: 0.3, scale: 2, color: P.white, outline: P.navy, ow: 2 });
}

// 6. END SLATE, with the button: real rain falls straight through the canopy.
function slateBg(ctx, lt) {
  bands(ctx, 0, 0, W, H, [P.blue, P.cyan, P.cream]);
  disc(ctx, 350, 34, 22, A(P.yellow, 0.3));
  disc(ctx, 350, 34, 16, P.yellow);
  disc(ctx, 346, 30, 7, P.white);
  for (let i = 0; i < 4; i++) cloud(ctx, ((i * 120 + lt * (6 + i * 2)) % (W + 80)) - 40, 150 + (i % 2) * 14, 12 + (i % 3) * 3, P.white, P.silver);
}
function slateProduct(ctx, lt) {
  const bob = Math.round(Math.sin(lt * 2) * 2);
  const ux = 96;
  const rim = 82 + bob;
  shadow(ctx, ux, 168, 30, 0.3);
  canopy(ctx, ux, rim, 56, 40, 0.05 + lt * 0.05);
  handle(ctx, ux, rim, 46);
  for (let i = 0; i < 3; i++) sparkle(ctx, ux - 40 + i * 40, rim - 48 + ((i * 13) % 16), twinkle(lt, i * 0.3), P.white);
  // the button gag: a plain raincloud drifts over and rains on it, for real
  const rainAt = 3.4;
  if (lt > rainAt - 0.8) {
    const cx = Math.round(lerp(-40, ux, easeOut(prog(lt, rainAt - 0.8, rainAt))));
    cloud(ctx, cx, 20, 16, P.fog, P.steel);
    if (lt > rainAt) {
      const rand = mulberry32(2);
      for (let i = 0; i < 16; i++) {
        const x = cx - 22 + rand() * 44;
        const ph = rand();
        const yy = 30 + (((lt - rainAt) * 160 + ph * 150) % 150);
        R(ctx, x, yy, 1, 4, P.blue);
        if (yy > 166) R(ctx, x - 2, 168, 5, 1, P.blue);
      }
      if (lt > rainAt + 0.6) {
        const p = spring(lt - rainAt - 0.6);
        bigText(ctx, '?', ux + 44, Math.round(64 - p * 6), { scale: 2, color: P.white, outline: P.navy, ow: 2 });
      }
    }
  }
}
function shotSlate(ctx, lt) {
  endSlate(ctx, lt, {
    bg: slateBg, product: slateProduct, mark: MARK, markX: 262, markY: 40,
    line: 'THE UMBRELLA FOR CLOUD COMPUTING', lineColor: P.navy,
    tagline: 'STAY DRY. STAY OFFLINE.', tag: { bg: P.yellow, edge: P.orange, color: P.navy }, tagX: 250, tagY: 118,
    url: 'CLOUDBRELLA.OFF', pill: { bg: P.navy, border: P.white, color: P.white }, urlY: 150,
    legal: 'NOT EFFECTIVE AGAINST ACTUAL RAIN. DO NOT OPEN INDOORS, YOUR WI-FI WILL GET SAD.',
    legalColor: P.silver, legalBg: P.navy,
  });
}

const SHOTS = [
  { at: 0, draw: shotDownpour },
  { at: 4.0, draw: shotBarrage },
  { at: 8.0, draw: shotReveal, wipe: 'whip', wd: 0.4, dir: -1 },
  { at: 11.0, draw: shotDemo, wipe: 'iris', wd: 0.5, cx: 192, cy: 90 },
  { at: 16.0, draw: shotBliss, wipe: 'slide', wd: 0.4, dir: 1 },
  { at: 19.5, draw: shotSlate, wipe: 'match', wd: 0.45, cx: 120, cy: 60 },
];

// Jingle, 120 bpm, 51 beats: a minor drizzle, four stabs for the four hits, the
// rising FWOMP, a bouncy G-major "CLOUD-BREL-LA" theme, a dreamy bridge and the
// sting on the slate, ending on two raindrop plinks for the button.
export default {
  id: 'cloudbrella',
  brand: 'CLOUDBRELLA',
  duration: 25.3,
  voice: { gender: 'male', lang: 'en-GB', pitch: 1.0, rate: 1.03 },
  script: [
    { at: 0.6, text: 'Is the cloud... raining on your parade?' },
    { at: 4.2, text: 'Updates. Pop-ups. Cookies. Terms and conditions!' },
    { at: 8.5, text: 'Introducing... Cloudbrella!' },
    { at: 11.3, text: 'It blocks ninety-nine percent of notifications...' },
    { at: 14.4, text: '...and one hundred percent of terms and conditions.' },
    { at: 19.8, text: 'Cloudbrella. Stay dry. Stay offline.' },
  ],
  tune: {
    bpm: 120,
    wave: 'square',
    notes: tune(
      'E4:1 G4:0.5 F#4:0.5 E4:1 B3:1 E4:1 G4:0.5 A4:0.5 G4:1 F#4:1',
      'R:1 E5:0.5 R:1 F5:0.5 R:1 F#5:0.5 R:1 G5:0.5 R:0.5 B4:0.5 C5:0.5 D#5:0.5',
      'B4:0.5 D5:0.5 G5:0.5 R:1 D6:2 B5:0.5 D6:1',
      'G5:0.5 G5:0.5 B5:1 A5:0.5 G5:0.5 E5:1 D5:0.5 E5:0.5 G5:1 A5:0.5 B5:0.5 A5:1 B5:0.5 A5:0.5 G5:1',
      'D6:1 B5:1 G5:2 A5:1 F#5:1 D5:1',
      'G5:0.5 G5:0.5 B5:1 D6:2 R:1 B5:0.5 A5:0.5 G5:3 R:1 E6:0.25 R:0.75 E6:0.25 R:0.75',
    ),
    bass: tune(
      'E2:2 C3:2 E2:2 B2:2',
      'E2:1.5 E2:1.5 F2:1.5 F#2:1.5 G2:2',
      'G2:2.5 G2:2 D3:1.5',
      'G2:1 D3:1 G2:1 D3:1 C3:1 G2:1 C3:1 D3:1 G2:2',
      'G2:2 C3:2 D3:3',
      'G2:2 E2:2 C3:2 D3:2 G2:2 R:2',
    ),
    bassWave: 'triangle',
    drums: tune(
      rep('H:0.5', 16),
      'R:1 K:0.5 R:1 K:0.5 R:1 K:0.5 R:1 K:0.5 S:0.25 S:0.25 S:0.25 S:0.25 S:0.5 S:0.5',
      'R:2.5 K:1 S:0.5 S:0.5 K:1 S:0.5',
      rep('K:0.5 H:0.5 S:0.5 H:0.5', 5),
      rep('H:1', 7),
      'K:1 S:1 K:1 S:1 K:2 R:6',
    ),
  },
  draw(ctx, t, dt, info) {
    play(ctx, dt, info, SHOTS);
  },
};
