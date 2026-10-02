// SCREECHNET — dial-up internet, shot as a nostalgic, cinematic short in a
// 2.39:1 letterbox. Dusk, 1997: a suburban street with one upstairs window lit
// by a CRT; over a teenager's shoulder, CONNECT; the modem's handshake scored
// like a romantic serenade on a low beauty shot of its LEDs; his profile, eyes
// closed, in the screen's light; downstairs his mother lifts the receiver and
// listens, deadpan. NO CARRIER, held in silence; the end slate is the dial-up
// dialog itself. "Some connections are worth the wait." Never slapstick.
//
// Every frame is a pure function of the ad clock: sets are baked once with
// dithered light (cine.js); the teenager is a baked rim-lit silhouette; the
// mother is drawn by the channel's presenter rig (cine.js castDraw) with a
// cine.js figure as the fallback.
import {
  P, W, H, clamp, lerp, prog, smooth, track, window01, hash, blinkAt, mix, bake, prewarm, lazy, shader, shadeSteps, soften, pool,
  rect, line, begin, pt, fill, ellipse, capsule, film, vignette, vignetteArt, letterbox, thin, tracked, text, smallPrint, figure, bust,
  profile, rimArt, castInit, castDraw, canvas,
} from './cine.js';

const { round, floor, sin, cos, abs, min, max, PI, sqrt } = Math;

// --- timing (75 bpm: 0.8 s a beat) ------------------------------------------------------
const T_ROOM = 4.0;
const T_MODEM = 8.0;
const T_FACE = 11.6;
const T_HALL = 15.2;
const T_END = 19.4;
const LOST_HOLD = 2.2; // NO CARRIER, in silence, before the dialog slate
const DURATION = 25.0;
const LB = 24; // letterbox bars (2.39:1)
const SH_BEIGE = { d: mix(P.tan, P.fog, 0.5), f: 0.4, m: 1, side: 1 };

// --- palette -----------------------------------------------------------------------------
const C = {
  sky0: mix(P.black, P.purple, 0.35),
  sky1: mix(P.purple, P.ink, 0.45),
  sky2: mix(P.purple, P.maroon, 0.45),
  sky3: mix(P.maroon, P.rust, 0.5),
  sky4: mix(P.rust, P.orange, 0.35),
  house: mix(P.black, P.purple, 0.18),
  houseL: mix(P.black, P.purple, 0.32),
  warm: mix(P.yellow, P.orange, 0.45),
  warmD: mix(P.orange, P.maroon, 0.35),
  crt: mix(P.blue, P.cyan, 0.35),
  crtD: mix(P.navy, P.blue, 0.4),
  crtL: mix(P.cyan, P.white, 0.45),
  beige: mix(P.cream, P.fog, 0.35),
  beigeD: mix(P.tan, P.fog, 0.5),
  beigeDD: mix(P.tanShade, P.slate, 0.5),
  led: mix(P.red, P.orange, 0.25),
  ledOff: mix(P.maroon, P.black, 0.3),
  amber: mix(P.yellow, P.orange, 0.3),
  sodium: mix(P.orange, P.yellow, 0.35),
  desk: mix(P.navy, P.black, 0.55),
};

// --- S1: the street at dusk ---------------------------------------------------------------
const S1W = 440;
const HORIZON = 146;
const streetSky = lazy(() =>
  bake('sn-sky', S1W, H, function* paint(c) {
    yield* shadeSteps(c, 0, 0, S1W, HORIZON + 4, [C.sky0, C.sky1, C.sky2, C.sky3, C.sky4], (x, y) => clamp((y - 18) / (HORIZON - 18)) ** 1.25 + 0.04 * sin(x * 0.012));
    // a thin crescent moon
    ellipse(c, 330, 46, 5, 5, mix(P.cream, P.fog, 0.3));
    ellipse(c, 332, 45, 5, 5, C.sky1);
    for (const [sx, sy] of [[60, 34], [140, 50], [250, 30], [400, 40]]) rect(c, sx, sy, 1, 1, mix(P.fog, C.sky1, 0.4));
    // far rooftops and trees on the horizon
    begin();
    pt(0, HORIZON + 4);
    for (let x = 0; x <= S1W; x += 8) pt(x, HORIZON - 6 - 6 * hash(x * 0.37) - (hash(x * 0.11) > 0.8 ? 8 : 0));
    pt(S1W, HORIZON + 4);
    fill(c, mix(C.house, C.sky2, 0.3));
    // the ground between the houses: front gardens fading into the dusk
    yield* shadeSteps(c, 0, HORIZON + 4, S1W, H - HORIZON - 4, [P.black, mix(P.black, C.house, 0.6), C.house], (x, y) => clamp(0.6 - (y - HORIZON) * 0.02));
  }));

/** One house silhouette: walls, gabled roof, chimney, aerial, windows. */
function house(c, x, w, roof, wins, aerial = true) {
  const wallTop = 118;
  begin();
  pt(x, 176);
  pt(x, wallTop);
  pt(x + w / 2, wallTop - roof);
  pt(x + w, wallTop);
  pt(x + w, 176);
  fill(c, C.house, { d: mix(C.house, P.black, 0.5), f: 0.3, m: 1, side: 1 });
  rect(c, x + w * 0.7, wallTop - roof * 0.75, 6, 14, C.house);
  if (aerial) {
    const ax = x + w * 0.3;
    line(c, ax, wallTop - roof * 0.6, ax, wallTop - roof - 12, P.black);
    line(c, ax - 7, wallTop - roof - 9, ax + 7, wallTop - roof - 9, P.black);
    line(c, ax - 5, wallTop - roof - 5, ax + 5, wallTop - roof - 5, P.black);
  }
  for (const [wx, wy, kind] of wins) {
    const col = kind === 'warm' ? mix(C.warm, C.warmD, 0.4) : kind === 'crt' ? C.crt : mix(C.house, P.ink, 0.6);
    rect(c, x + wx, wy, 12, 10, col);
    rect(c, x + wx + 5, wy, 2, 10, C.house);
    if (kind === 'warm') rect(c, x + wx, wy + 8, 12, 2, C.warmD);
  }
}

const streetSet = lazy(() =>
  bake('sn-street', S1W, H, function* paint(c) {
    house(c, 10, 84, 30, [[14, 128, 'warm'], [58, 128, 'dark'], [14, 150, 'dark'], [58, 150, 'warm']]);
    house(c, 118, 76, 26, [[12, 128, 'dark'], [50, 128, 'dark'], [30, 150, 'warm']], false);
    house(c, 222, 92, 32, [[16, 126, 'crt'], [62, 126, 'dark'], [16, 150, 'dark'], [62, 150, 'warm']]);
    house(c, 340, 86, 28, [[14, 128, 'warm'], [58, 128, 'dark'], [36, 150, 'dark']]);
    // hedges and garden walls
    for (let x = 0; x < S1W; x += 4) rect(c, x, 168 - floor(hash(x * 0.7) * 3), 4, 12, mix(C.house, P.darkGreen, 0.15));
    // pavement and kerb, the road
    yield* shadeSteps(c, 0, 178, S1W, H - 178, [P.black, mix(P.black, P.ink, 0.6), P.ink], (x, y) => clamp(0.3 + (y - 178) * 0.02));
    rect(c, 0, 178, S1W, 1, mix(P.ink, P.slate, 0.4));
    rect(c, 0, 190, S1W, 1, mix(P.ink, P.slate, 0.3));
    // telephone pole and street lamps
    rect(c, 204, 70, 3, 110, P.black);
    rect(c, 194, 76, 23, 2, P.black);
    rect(c, 196, 74, 1, 2, P.black);
    rect(c, 214, 74, 1, 2, P.black);
    for (const lx of [100, 380]) {
      rect(c, lx, 104, 2, 76, P.black);
      rect(c, lx - 6, 102, 8, 2, P.black);
      rect(c, lx - 8, 104, 5, 2, mix(C.sodium, P.black, 0.6));
    }
  }));

/** Wires: catenary curves from the pole to the houses (the phone line). */
function wire(ctx, x0, y0, x1, y1, sag) {
  ctx.fillStyle = P.black;
  const n = max(2, floor(abs(x1 - x0) / 2));
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    ctx.fillRect(round(lerp(x0, x1, u)), round(lerp(y0, y1, u) + sag * 4 * u * (1 - u)), 1, 1);
  }
}

const lampPool = lazy(() => pool('sn-sodium', 40, 12, C.sodium, 5, 0.42));
const lampHalo = lazy(() => pool('sn-sodium-halo', 10, 10, C.sodium, 4, 0.55));
const K_STREET = [[0, 0], [4.6, 34, 'smooth']];
const LAMPS = [[100, 1.0], [380, 1.5]];

function shotStreet(ctx, lt) {
  const camX = track(lt, K_STREET);
  ctx.drawImage(streetSky(), -round(camX * 0.3), 0);
  ctx.save();
  ctx.translate(-round(camX), 0);
  ctx.drawImage(streetSet(), 0, 0);
  wire(ctx, 0, 84, 196, 76, 10);
  wire(ctx, 0, 88, 196, 80, 12);
  wire(ctx, 216, 76, S1W, 82, 9);
  wire(ctx, 214, 80, 246, 112, 3); // the line into the hero house
  // sodium lamps warm up one after the other, with a little hesitation
  for (let i = 0; i < LAMPS.length; i++) {
    const lx = LAMPS[i][0];
    const k = lt - LAMPS[i][1];
    const level = k < 0 ? 0 : k < 0.12 ? 0.6 : k < 0.2 ? 0.1 : smooth((k - 0.2) / 0.8);
    if (level <= 0) continue;
    ctx.globalAlpha = level;
    ctx.drawImage(lampHalo(), lx - 15, 95);
    ctx.drawImage(lampPool(), lx - 46, 172);
    ctx.globalAlpha = 1;
  }
  // the CRT window breathes faintly
  ctx.globalAlpha = 0.25 + 0.15 * sin(lt * 9.1) * sin(lt * 3.3);
  rect(ctx, 238, 126, 12, 10, C.crtL);
  ctx.globalAlpha = 1;
  ctx.restore();
  vignette(ctx, 0.6);
  letterbox(ctx, LB);
}

// --- S2: the bedroom, over his shoulder, CONNECT ---------------------------------------------
const MON = { x: 204, y: 62 };
const roomSet = lazy(() =>
  bake('sn-room', 400, H, function* paint(c) {
    // dark wall lit by the screen (right of centre)
    yield* shadeSteps(c, 0, 0, 400, 150, [P.black, mix(P.black, P.ink, 0.6), P.ink, mix(P.ink, P.navy, 0.45), mix(P.navy, P.blue, 0.25)], (x, y) => {
      const d = sqrt(((x - 250) / 210) ** 2 + ((y - 96) / 110) ** 2);
      return clamp(1 - d) * 0.9 + 0.04;
    });
    // window with blinds at the left: dusk outside
    yield* shadeSteps(c, 26, 34, 64, 70, [C.sky1, C.sky2, C.sky3], (x, y) => (y - 34) / 70);
    for (let y = 36; y < 104; y += 4) rect(c, 26, y, 64, 2, mix(P.black, P.ink, 0.5));
    rect(c, 22, 30, 72, 4, P.black);
    rect(c, 22, 104, 72, 4, mix(P.black, P.ink, 0.4));
    line(c, 86, 34, 86, 120, mix(P.ink, P.slate, 0.4)); // the blind's cord
    // a poster (an abstract print, no real band) above the desk, catching the blue
    rect(c, 112, 22, 46, 60, mix(P.ink, P.black, 0.25));
    yield* shadeSteps(c, 114, 24, 42, 56, [mix(P.ink, P.purple, 0.35), mix(P.navy, P.purple, 0.35), mix(P.slate, P.navy, 0.3), mix(P.steel, P.navy, 0.35)], (x, y) => clamp(1 - sqrt(((x - 135) / 18) ** 2 + ((y - 46) / 18) ** 2)) * 0.9 + (y > 68 ? 0.1 : 0));
    rect(c, 118, 70, 34, 2, mix(P.fog, P.navy, 0.55));
    rect(c, 118, 74, 20, 1, mix(P.fog, P.navy, 0.6));
    // a shelf on the right: books, cassettes, a small speaker
    rect(c, 318, 92, 82, 3, mix(P.slate, P.black, 0.35));
    rect(c, 318, 92, 82, 1, mix(P.steel, P.navy, 0.4));
    let bx = 322;
    let k = 0;
    while (bx < 396) {
      const bw = 3 + floor(hash(k * 3.3) * 4);
      const bh = 16 + floor(hash(k * 5.1) * 12);
      rect(c, bx, 92 - bh, bw, bh, [mix(P.ink, P.navy, 0.4), mix(P.slate, P.black, 0.3), mix(P.maroon, P.ink, 0.5), mix(P.darkGreen, P.ink, 0.6)][k % 4]);
      rect(c, bx, 92 - bh, 1, bh, mix(P.steel, P.navy, 0.35));
      bx += bw + 1;
      k++;
    }
    rect(c, 360, 64, 18, 28, mix(P.black, P.ink, 0.4));
    ellipse(c, 369, 74, 5, 5, mix(P.ink, P.slate, 0.4));
    ellipse(c, 369, 85, 3, 3, mix(P.ink, P.slate, 0.4));
    // a second poster high on the right
    rect(c, 330, 18, 40, 38, mix(P.ink, P.black, 0.2));
    rect(c, 333, 21, 34, 22, mix(P.maroon, P.ink, 0.5));
    rect(c, 333, 46, 34, 2, mix(P.fog, P.ink, 0.6));
    // desk: a scuffed laminate top catching the screen's light, its front edge
    yield* shadeSteps(c, 0, 150, 400, H - 150, [P.black, mix(P.black, P.ink, 0.6), P.ink, mix(P.ink, P.navy, 0.4), mix(P.navy, P.steel, 0.35)], (x, y) => {
      const d = sqrt(((x - 250) / 170) ** 2 + ((y - 154) / 26) ** 2);
      return clamp(clamp(1 - d) * 0.95 + 0.08 - (y > 186 ? 0.35 : 0));
    });
    rect(c, 0, 150, 400, 1, mix(P.navy, P.steel, 0.4));
    rect(c, 0, 186, 400, 1, mix(P.navy, P.steel, 0.25));
    // a CD tower beside the monitor: spines in the blue light
    rect(c, 304, 96, 14, 54, mix(P.black, P.ink, 0.4));
    for (let y = 98; y < 148; y += 2) rect(c, 306, y, 10, 1, (y >> 1) % 3 === 0 ? mix(P.steel, C.crt, 0.3) : mix(P.slate, P.ink, 0.4));
    rect(c, 304, 96, 1, 54, mix(P.steel, C.crt, 0.3));
    // desk clutter: a mug, a stack of floppy disks, a magazine
    rect(c, 176, 140, 9, 10, mix(P.slate, P.ink, 0.3));
    rect(c, 176, 140, 2, 10, mix(P.steel, C.crt, 0.25));
    rect(c, 185, 143, 2, 4, mix(P.slate, P.ink, 0.3));
    for (let i = 0; i < 4; i++) rect(c, 340 + (i & 1), 146 - i * 2, 16, 2, i % 2 ? P.black : mix(P.ink, P.slate, 0.4));
    begin();
    pt(150, 152);
    pt(186, 151);
    pt(190, 160);
    pt(148, 162);
    fill(c, mix(P.slate, P.navy, 0.35), { d: mix(P.ink, P.navy, 0.4), f: 0.1, m: 1, side: 1 });
    // cables tumbling from the back of the desk
    for (let i = 0; i < 4; i++) {
      for (let y = 150; y < 186; y++) rect(c, 292 + i * 3 + round(sin(y * 0.15 + i * 1.7) * 2), y, 1, 1, P.black);
    }
  }));

/** The beige CRT monitor (screen drawn by the caller). */
const monitorArt = lazy(() =>
  bake('sn-monitor', 96, 84, (c) => {
    begin();
    pt(8, 4);
    pt(80, 2);
    pt(92, 8);
    pt(92, 70);
    pt(80, 76);
    pt(8, 74);
    fill(c, C.beige, { d: C.beigeD, f: 0.16, m: 1, dd: C.beigeDD, df: 0.06, side: 1 });
    rect(c, 8, 4, 72, 1, mix(C.beige, P.white, 0.4));
    rect(c, 16, 10, 58, 50, P.black); // screen recess
    rect(c, 16, 10, 58, 1, C.beigeDD);
    rect(c, 64, 64, 6, 2, C.beigeDD);
    rect(c, 70, 64, 2, 2, mix(P.green, P.darkGreen, 0.5));
    rect(c, 30, 76, 32, 4, C.beigeD);
    rect(c, 24, 80, 44, 4, C.beigeDD);
  }));
const desktopArt = lazy(() => shader('sn-desktop', 58, 50, [P.navy, mix(P.navy, P.blue, 0.5), mix(P.blue, P.cyan, 0.25)], (x, y) => clamp(1 - sqrt(((x - 29) / 40) ** 2 + ((y - 24) / 34) ** 2))));
const screenSpill = lazy(() => pool('sn-spill', 120, 70, C.crt, 6, 0.3));
const CLICK = 1.8; // shot time of the click on CONNECT
const K_PX = [[0.3, 0], [1.4, 1, 'inOut']];

/** Screen content: desktop, the dial-up dialog, its CONNECT button. */
function screenUI(ctx, x, y, w, h, lt) {
  ctx.drawImage(desktopArt(), x, y);
  const dx = x + 8;
  const dy = y + 9;
  rect(ctx, dx, dy, w - 16, h - 16, mix(P.fog, P.silver, 0.4));
  rect(ctx, dx, dy, w - 16, 6, P.navy);
  text(ctx, 'DIAL-UP', dx + 2, dy + 1, { color: P.white, font: 'micro' });
  const dialling = lt > CLICK + 0.1;
  text(ctx, dialling ? 'DIALLING...' : 'SCREECHNET', dx + 3, dy + 10, { color: P.ink, font: 'micro' });
  const pressed = lt > CLICK && lt < CLICK + 0.2;
  rect(ctx, dx + 10, dy + 20, 22, 7, pressed ? P.steel : mix(P.silver, P.white, 0.4));
  rect(ctx, dx + 10, dy + 26, 22, 1, P.ink);
  rect(ctx, dx + 31, dy + 20, 1, 7, P.ink);
  text(ctx, 'OK', dx + 18, dy + 21 + (pressed ? 1 : 0), { color: P.ink, font: 'micro' });
  // the pointer glides to the button
  const q = track(lt, K_PX);
  const px = lerp(x + w - 6, dx + 24, q);
  const py = lerp(y + h - 6, dy + 24, q);
  begin();
  pt(px, py);
  pt(px, py + 6);
  pt(px + 2, py + 4);
  pt(px + 4, py + 6);
  fill(ctx, P.white);
}

// The teenager from behind: a baked silhouette (hood down, tousled hair, the
// arm reaching to the mouse), rim-lit in the screen's blue exactly on its edge.
const TEEN_W = 220;
const TEEN_H = 140;
const TEEN_BODY = mix(P.black, P.ink, 0.25);
const teenArt = lazy(() =>
  rimArt(
    'sn-teen',
    TEEN_W,
    TEEN_H,
    (c) => {
      const hx = 70;
      const hy = 26;
      // shoulders and back of the hoodie, the hood bunched behind the neck
      begin();
      pt(0, TEEN_H);
      pt(4, 86);
      pt(18, 66);
      pt(44, 56);
      pt(60, 54);
      pt(84, 54);
      pt(104, 58);
      pt(126, 70);
      pt(140, 84);
      pt(150, TEEN_H);
      fill(c, TEEN_BODY);
      ellipse(c, hx + 2, 58, 30, 12, mix(TEEN_BODY, P.ink, 0.25));
      // neck
      rect(c, hx - 9, 44, 20, 14, P.black);
      // head: a skull outline with irregular tufts (many small ones, never two big "ears")
      begin();
      for (let i = 0; i <= 28; i++) {
        const a = PI + (i / 28) * PI;
        const tuft = 1.6 * sin(i * 2.7) + 1.2 * sin(i * 5.3 + 1) + (hash(i * 3.7) > 0.7 ? 1.4 : 0);
        const r = 21 + max(0, tuft) * (a > PI * 1.15 && a < PI * 1.85 ? 1 : 0.4);
        pt(hx + cos(a) * r * 0.92, hy + 4 + sin(a) * r);
      }
      pt(hx + 19, hy + 18);
      pt(hx + 15, hy + 30);
      pt(hx - 15, hy + 30);
      pt(hx - 19, hy + 18);
      fill(c, P.black);
      // the right ear, a little lighter (it lets the screen through)
      ellipse(c, hx + 19, hy + 17, 3, 5, mix(P.black, P.maroon, 0.4));
      // the right arm: upper arm down from the shoulder, forearm out to the mouse
      capsule(c, 124, 74, 156, 112, 12, 10, TEEN_BODY);
      capsule(c, 156, 112, 210, 124, 10, 7, TEEN_BODY);
      // hoodie seams and the hood's fold, faintly
      line(c, 46, 70, 64, 92, mix(TEEN_BODY, P.slate, 0.25));
      line(c, 96, 70, 82, 96, mix(TEEN_BODY, P.slate, 0.2));
    },
    { rim: mix(C.crt, C.crtL, 0.35), rim2: mix(C.crtD, P.ink, 0.35), dirs: [[1, 0], [0, -1], [1, -1]] },
  ));
const TEEN_X = 52;
const TEEN_Y = 76;

function shotRoom(ctx, lt) {
  const camX = track(lt, [[0, 0], [4.0, 12, 'smooth']]);
  ctx.drawImage(roomSet(), round(camX * 0.5), 0, W, 150, 0, 0, W, 150);
  ctx.drawImage(roomSet(), round(camX * 0.8), 150, W, H - 150, 0, 150, W, H - 150);
  ctx.save();
  ctx.translate(-round(camX * 0.8), 0);
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(screenSpill(), 130, 56);
  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(monitorArt(), MON.x, MON.y);
  screenUI(ctx, MON.x + 16, MON.y + 10, 58, 50, lt);
  // modem and phone on the desk: the modem's LEDs wake after the click
  rect(ctx, 236, 152, 50, 9, C.beige);
  rect(ctx, 236, 152, 50, 1, mix(C.beige, P.white, 0.4));
  rect(ctx, 236, 160, 50, 1, C.beigeDD);
  for (let i = 0; i < 6; i++) rect(ctx, 242 + i * 6, 156, 2, 1, i < 2 || (lt > CLICK && (i === 3 || floor(lt * 8 + i) % 2 === 0)) ? C.led : C.ledOff);
  // keyboard below the screen, catching its light
  rect(ctx, 196, 162, 66, 6, C.beigeD);
  rect(ctx, 196, 162, 66, 1, mix(C.beige, C.crtL, 0.3));
  for (let r = 0; r < 2; r++) for (let k = 0; k < 15; k++) rect(ctx, 199 + k * 4 + r, 164 + r * 2, 2, 1, C.beigeDD);
  // the mouse, under his hand
  ellipse(ctx, 280, 172, 7, 4, C.beige, SH_BEIGE);
  ctx.restore();
  // him, in the foreground (moves a little faster: nearer the camera)
  ctx.save();
  ctx.translate(-round(camX * 1.3), 0);
  const nod = round(track(lt, [[1.2, 0], [1.6, 1], [2.4, 0]]));
  ctx.drawImage(teenArt(), TEEN_X, TEEN_Y + nod);
  // his fingers on the mouse: the index finger presses at the click
  const press = lt > CLICK && lt < CLICK + 0.18 ? 1 : 0;
  ellipse(ctx, TEEN_X + 213, TEEN_Y + 123 + press, 5, 3, mix(P.brown, P.black, 0.5));
  rect(ctx, TEEN_X + 211, TEEN_Y + 120 + press, 5, 1, mix(C.crt, C.crtL, 0.3));
  ctx.restore();
  vignette(ctx, 0.62);
  letterbox(ctx, LB);
}

// --- S3: the modem sings (macro on the front panel) -------------------------------------------
const LEDS = ['HS', 'AA', 'CD', 'OH', 'RD', 'SD', 'TR', 'MR'];
// The modem's front panel in perspective: near end at the left, receding right.
const PNL = { x0: -10, x1: 430, t0: 66, b0: 176, t1: 108, b1: 140 };
const pnlTop = (x) => lerp(PNL.t0, PNL.t1, clamp((x - PNL.x0) / (PNL.x1 - PNL.x0)) ** 0.85);
const pnlBot = (x) => lerp(PNL.b0, PNL.b1, clamp((x - PNL.x0) / (PNL.x1 - PNL.x0)) ** 0.85);
const ledX = (i) => lerp(150, 392, (i / 7) ** 0.82);
const ledY = (i) => lerp(pnlTop(ledX(i)), pnlBot(ledX(i)), 0.5);
/** The brand plate, flat (warped onto the panel in perspective at bake time). */
const plateArt = lazy(() =>
  bake('sn-plate', 104, 56, (c) => {
    thin(c, 'SCREECHNET', 0, 2, { color: mix(P.ink, C.beigeDD, 0.15), track: 2 });
    thin(c, '56K', 0, 18, { color: mix(P.ink, C.beigeDD, 0.1), track: 1, scale: 2 });
    text(c, 'DATA / FAX / VOICE', 0, 46, { color: mix(P.ink, C.beigeDD, 0.35), font: 'micro' });
  }));
const modemSet = lazy(() =>
  bake('sn-modem', 430, H, function* paint(c) {
    // darkness, a cool wash from the screen above-right
    yield* shadeSteps(c, 0, 0, 430, H, [P.black, mix(P.black, P.ink, 0.6), P.ink, mix(P.ink, P.navy, 0.5)], (x, y) => clamp(1 - sqrt(((x - 300) / 300) ** 2 + ((y + 30) / 190) ** 2)) * 0.85);
    // the room far behind, out of focus: the monitor's glow and a shelf's edge
    yield* shadeSteps(c, 230, 0, 200, 60, [mix(P.ink, P.navy, 0.5), mix(P.navy, P.blue, 0.4), mix(P.blue, C.crtL, 0.3)], (x, y) => {
      const d = sqrt(((x - 330) / 70) ** 2 + ((y - 20) / 30) ** 2);
      return d < 1 ? clamp(1 - d) * 0.9 : -1;
    });
    // top surface (catching the blue light), with vent slots receding
    yield* shadeSteps(c, 0, 0, 430, H, [C.beigeDD, mix(C.beigeD, C.crt, 0.25), mix(C.beige, C.crtL, 0.3)], (x, y) => {
      const top = pnlTop(x);
      const back = top - lerp(30, 12, clamp(x / 430));
      if (y < back || y >= top) return -1;
      return clamp(0.3 + ((y - back) / (top - back)) * 0.5 - x * 0.0006);
    });
    for (let i = 0; i < 26; i++) {
      const x = 30 + i * 15 * (1 - i * 0.012);
      const top = pnlTop(x);
      const back = top - lerp(30, 12, clamp(x / 430));
      line(c, x, back + (top - back) * 0.3, x + 6 * (1 - i / 30), back + (top - back) * 0.3, C.beigeDD);
    }
    // front panel: beige, lit from the top edge, falling into shadow to the right
    yield* shadeSteps(c, 0, 0, 430, H, [mix(C.beigeDD, P.black, 0.45), mix(C.beigeDD, P.black, 0.15), C.beigeDD, mix(C.beigeDD, C.beigeD, 0.5), C.beigeD], (x, y) => {
      const t = pnlTop(x);
      const b = pnlBot(x);
      if (y < t || y >= b) return -1;
      const v = (y - t) / (b - t);
      return clamp(0.95 - v * 0.2 - clamp((x - 140) / 280) * 0.75);
    });
    line(c, 0, pnlTop(0), 430, pnlTop(430), mix(C.beige, P.white, 0.35));
    // LED window strip (recessed), perspective
    yield* shadeSteps(c, 0, 0, 430, H, [mix(P.black, P.maroon, 0.35), mix(P.black, P.maroon, 0.15)], (x, y) => {
      if (x < 136 || x > 404) return -1;
      const mid = lerp(pnlTop(x), pnlBot(x), 0.5);
      const hh = (pnlBot(x) - pnlTop(x)) * 0.17;
      return y >= mid - hh && y < mid + hh ? 0.5 : -1;
    });
    LEDS.forEach((s2, i) => {
      const x = ledX(i);
      const y = lerp(pnlTop(x), pnlBot(x), 0.72);
      if (i < 6) text(c, s2, x, y, { color: mix(P.ink, C.beigeDD, 0.25), font: 'micro', align: 'center' });
    });
    // the brand plate on the near end, warped column by column to the panel's perspective
    const plate = plateArt();
    for (let px = 0; px < 104; px++) {
      const x = 22 + px;
      const t = pnlTop(x);
      const b = pnlBot(x);
      const y0 = t + (b - t) * 0.2;
      const y1 = t + (b - t) * 0.74;
      c.drawImage(plate, px, 0, 1, 56, x, round(y0), 1, round(y1 - y0));
    }
    // the desk: dark, glossy enough to hold the LEDs' reflections
    yield* shadeSteps(c, 0, 0, 430, H, [P.black, mix(P.black, P.ink, 0.6), P.ink], (x, y) => (y < pnlBot(x) ? -1 : clamp(0.55 - (y - pnlBot(x)) * 0.015 + (x / 430) * 0.2)));
  }));
const ledGlow = lazy(() => pool('sn-ledglow', 10, 8, C.led, 4, 0.55));

/** Which LEDs are lit at time lt of the handshake (deterministic). */
function ledOn(i, lt) {
  const s2 = LEDS[i];
  if (s2 === 'MR' || s2 === 'TR') return true;
  if (s2 === 'OH') return lt > 0.15;
  if (s2 === 'HS') return lt > 1.2;
  if (s2 === 'AA') return false;
  if (s2 === 'CD') return lt > 2.4;
  if (s2 === 'RD' || s2 === 'SD') return lt > 1.4 && floor(lt * (s2 === 'RD' ? 11 : 7) + i) % 2 === 0;
  return false;
}

function shotModem(ctx, lt) {
  const camX = track(lt, [[0, 0], [3.6, 26, 'smooth']]);
  ctx.drawImage(modemSet(), -round(camX), 0);
  for (let i = 0; i < LEDS.length; i++) {
    const x = ledX(i) - camX;
    const y = ledY(i);
    const sz = lerp(4, 2, i / 7);
    const on = ledOn(i, lt);
    rect(ctx, x - sz / 2, y - 1, sz, 2 + (i < 4 ? 1 : 0), on ? C.led : C.ledOff);
    if (on) {
      rect(ctx, x - sz / 2, y - 1, max(1, sz - 1), 1, mix(C.led, P.white, 0.5));
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(ledGlow(), round(x - 10), round(y - 8));
      ctx.globalCompositeOperation = 'source-over';
      // reflection in the desk below the panel
      ctx.globalAlpha = 0.35;
      rect(ctx, x - sz / 2, pnlBot(x + camX) + 4 + (7 - i) * 0.6, sz, 1, C.led);
      ctx.globalAlpha = 1;
    }
  }
  vignette(ctx, 0.6);
  letterbox(ctx, LB);
}

// --- S4: he closes his eyes and listens ----------------------------------------------------
// the room behind him, from the side, far out of focus: the blinds' dusk, a poster, a shelf
const faceBg = lazy(() =>
  bake('sn-facebg', W, H, function* paint(c) {
    yield* shadeSteps(c, 0, 0, W, H, [P.black, mix(P.black, P.ink, 0.6), P.ink, mix(P.ink, P.navy, 0.5), mix(P.navy, C.crt, 0.3)], (x, y) => clamp(1 - sqrt(((x - 430) / 300) ** 2 + ((y - 90) / 150) ** 2)) * 0.95);
    yield* shadeSteps(c, 18, 40, 92, 96, [C.sky1, C.sky2, C.sky3, C.sky4], (x, y) => clamp((y - 40) / 110));
    for (let y = 42; y < 136; y += 6) rect(c, 18, y, 92, 3, mix(P.black, P.ink, 0.45));
    rect(c, 14, 36, 100, 4, P.black);
    rect(c, 252, 30, 44, 58, mix(P.maroon, P.ink, 0.45));
    rect(c, 256, 34, 36, 30, mix(P.purple, P.ink, 0.5));
    rect(c, 300, 120, 84, 3, mix(P.slate, P.black, 0.3));
    for (let i = 0; i < 12; i++) rect(c, 304 + i * 6, 96 + (i % 3) * 3, 5, 24 - (i % 3) * 3, [mix(P.ink, P.navy, 0.4), mix(P.maroon, P.ink, 0.5), mix(P.slate, P.black, 0.3)][i % 3]);
    rect(c, 0, 176, W, H - 176, mix(P.black, P.ink, 0.4));
    yield* soften(c, W, H, 5, { passes: 2 });
  }));

const FACE = {
  x: 160,
  y: 46,
  hh: 92,
  hair: 'messy',
  eye: 0,
  mouth: 0,
  smile: 0,
  light: mix(P.skin, P.silver, 0.45),
  rimPx: 2,
  pal: {
    skin: mix(P.brown, P.tanShade, 0.35),
    skinD: mix(P.maroon, P.black, 0.45),
    hair: mix(P.black, P.maroon, 0.35),
    hairD: P.black,
    hairL: mix(P.maroon, C.crt, 0.3),
    lip: mix(P.brown, P.black, 0.35),
    eye: P.black,
  },
};
const SH_HOOD = { d: P.black, f: 0.6, m: 1, side: -1 };
const SH_HOODIE = { d: P.black, f: 0.55, m: 1, side: -1, l: mix(P.darkGreen, P.silver, 0.25), lf: 0, lm: 1 };
const crtBand = lazy(() => pool('sn-crtband', 60, 18, C.crtL, 5, 0.16));

function shotFace(ctx, lt) {
  ctx.drawImage(faceBg(), -round(lt * 2), 0);
  const f = FACE;
  f.x = 160 - round(track(lt, [[0, 0], [3.6, 8, 'smooth']]));
  f.y = 46 + round(sin(lt * 1.1) * 0.6);
  // eyes close slowly on the swell; the smallest smile
  f.eye = lt > 1.0 && lt < 3.2 ? 1 : blinkAt(lt, 5);
  f.smile = lt > 1.8 ? 1 : 0;
  profile(ctx, f);
  // hoodie: hood bunched behind the neck, shoulders falling out of frame
  const hx = f.x;
  const hy = f.y + f.hh * 1.12;
  const hood = mix(P.darkGreen, P.black, 0.72);
  ellipse(ctx, hx - f.hh * 0.32, hy - f.hh * 0.08, f.hh * 0.34, f.hh * 0.24, hood, SH_HOOD);
  begin();
  pt(hx - f.hh * 1.1, 216);
  pt(hx - f.hh * 0.7, hy + f.hh * 0.05);
  pt(hx - f.hh * 0.1, hy - f.hh * 0.02);
  pt(hx + f.hh * 0.3, hy + f.hh * 0.06);
  pt(hx + f.hh * 0.62, hy + f.hh * 0.28);
  pt(hx + f.hh * 0.8, 216);
  fill(ctx, hood, SH_HOODIE);
  line(ctx, hx + f.hh * 0.06, hy + f.hh * 0.06, hx + f.hh * 0.1, hy + f.hh * 0.42, mix(P.fog, P.ink, 0.5));
  // the screen's light moves across his face as the picture on it changes
  ctx.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 2; k++) {
    const by = 40 + ((lt * 14 + k * 70) % 140);
    ctx.drawImage(crtBand(), f.x + 6, round(by));
  }
  ctx.globalCompositeOperation = 'source-over';
  vignette(ctx, 0.7);
  letterbox(ctx, LB);
}

// --- S5: downstairs, his mother lifts the receiver -----------------------------------------------
const hallSet = lazy(() =>
  bake('sn-hall', W, H, function* paint(c) {
    yield* shadeSteps(c, 0, 0, W, 180, [P.black, mix(P.black, P.maroon, 0.55), P.maroon, mix(P.maroon, P.brown, 0.55), mix(P.brown, P.tanShade, 0.5)], (x, y) => {
      const d = sqrt(((x - 110) / 190) ** 2 + ((y - 110) / 120) ** 2);
      return clamp(1 - d) * 0.92 + 0.03 * ((x >> 3) & 1);
    });
    // a framed photo, a coat hook with a coat, the dado rail
    rect(c, 40, 50, 30, 38, mix(P.brown, P.black, 0.3));
    rect(c, 43, 53, 24, 32, mix(P.tan, P.maroon, 0.45));
    rect(c, 312, 40, 3, 6, P.black);
    begin();
    pt(300, 46);
    pt(326, 46);
    pt(334, 140);
    pt(292, 140);
    fill(c, mix(P.darkGreen, P.black, 0.5));
    rect(c, 0, 130, W, 2, mix(P.brown, P.black, 0.3));
    rect(c, 0, 130, W, 1, mix(P.tanShade, P.brown, 0.5));
    yield* shadeSteps(c, 0, 176, W, H - 176, [P.black, mix(P.black, P.maroon, 0.6), P.maroon], (x, y) => clamp(1 - sqrt(((x - 150) / 200) ** 2 + ((y - 180) / 40) ** 2)) * 0.8);
    rect(c, 0, 176, W, 1, mix(P.brown, P.tanShade, 0.4));
    // the staircase banister on the right
    for (let i = 0; i < 6; i++) rect(c, 340 + i * 11, 60 + i * 13, 2, 120 - i * 13, P.black);
    line(c, 336, 58, 400, 130, P.black);
    // hall table, lamp, the telephone's base
    rect(c, 60, 146, 70, 4, mix(P.brown, P.black, 0.3));
    rect(c, 64, 150, 3, 28, mix(P.brown, P.black, 0.4));
    rect(c, 122, 150, 3, 28, mix(P.brown, P.black, 0.4));
    rect(c, 74, 116, 3, 30, mix(P.tanShade, P.yellow, 0.3));
    begin();
    pt(64, 116);
    pt(68, 100);
    pt(84, 100);
    pt(88, 116);
    fill(c, mix(P.cream, P.yellow, 0.3), { d: mix(P.tan, P.yellow, 0.2), f: 0.3, m: 1, side: 1 });
    rect(c, 98, 140, 18, 6, C.beigeD);
    yield* soften(c, W, H, 3, { passes: 2 });
  }));
const hallGlow = lazy(() => pool('sn-hallglow', 80, 64, P.yellow, 5, 0.18));

// The mother on the presenter rig: a look made from the Penny rig (a soft
// brown chignon, a plum cardigan over a cream top), close, no speech; she
// hears the screech (surprise, briefly) and settles into a deadpan stare.
const MUM = { actor: null, look: null };
castInit((R) => {
  const base = R.cast.LOOKS.penny;
  const look = R.base.deriveLook(base, {
    id: 'sn-mum',
    name: 'Mum',
    skin: R.base.SKIN_LIGHT,
    hair: { style: 'chignon', ramp: [P.tan, P.tanShade, P.brown, P.maroon], line: P.maroon },
    eyes: { ...base.eyes, iris: [P.brown, P.maroon] },
    brows: { ...base.brows, color: P.brown },
    outfit: 'cardigan',
    jacket: { ramp: [mix(P.purple, P.fog, 0.45), mix(P.purple, P.slate, 0.4), mix(P.purple, P.black, 0.45), P.black], line: P.black },
    shirt: { ramp: [P.cream, P.tan, P.tanShade, P.brown], line: P.brown },
    pin: null,
    pearls: null,
    cuff: mix(P.purple, P.slate, 0.4),
    props: [],
    persona: { sway: 0.4, headMotion: 0.5, blinkMin: 2.4, blinkMax: 4.8, energy: 0.5, smile: 0.08 },
  });
  MUM.look = look;
  MUM.actor = {
    id: look.id,
    look,
    perf: {
      side: 0,
      seed: 3,
      gestures: [],
      emotions: [{ t0: 0, name: 'neutral' }, { t0: 1.5, name: 'surprised' }, { t0: 2.3, name: 'serious' }],
      look: [],
      speech: null,
    },
  };
});

// fallback figure (cine.js) if the rig is unavailable
const MUM_FB = figure({
  hh: 46,
  hair: 'bun',
  garment: 'cardigan',
  shoulders: 0.84,
  pal: {
    skin: mix(P.skin, P.tan, 0.3),
    skinD: mix(P.skinShade, P.tanShade, 0.5),
    hair: mix(P.brown, P.maroon, 0.4),
    hairD: P.maroon,
    hairL: mix(P.tanShade, P.brown, 0.4),
    top: mix(P.purple, P.slate, 0.45),
    topD: mix(P.purple, P.black, 0.6),
    topL: mix(P.purple, P.fog, 0.35),
    shirt: mix(P.cream, P.tan, 0.3),
    shirtD: P.tan,
    lip: mix(P.skinShade, P.darkRed, 0.3),
  },
});

const HS = { body: C.beige, d: C.beigeD, l: mix(C.beige, P.white, 0.4) };
const SH_HS = { d: C.beigeD, f: 0.35, m: 1, dd: C.beigeDD, df: 0.1, l: HS.l, lf: 0.15, lm: 1, side: 1 };
const SH_SLEEVE = { d: mix(P.purple, P.black, 0.45), f: 0.4, m: 1, l: mix(P.purple, P.fog, 0.45), lf: 0.15, lm: 1, side: 1 };
const SKIN = { base: P.skin, d: P.skinShade, dd: mix(P.skinShade, P.brown, 0.5), l: mix(P.skin, P.cream, 0.45) };
const SH_FING = { d: SKIN.d, f: 0.35, m: 1, side: 1 };
const HP = new Float64Array(2);
function hp(ox, oy, ca, sa, lx, ly) {
  HP[0] = ox + lx * ca - ly * sa;
  HP[1] = oy + lx * sa + ly * ca;
  return HP;
}

/**
 * A 1990s handset held in a hand, the sleeve running down out of frame:
 * earpiece at (ox, oy), the handset's axis rotated by `a` (0 = straight down
 * the jaw towards the mouth), k = scale (px per handset unit, ~1.1 at 4 px/u).
 */
function handset(ctx, ox, oy, a, k) {
  const ca = cos(a);
  const sa = sin(a);
  // sleeve: from below the frame up to the wrist under the handset's middle
  hp(ox, oy, ca, sa, -10 * k, 30 * k);
  const wx = HP[0];
  const wy = HP[1];
  begin();
  pt(wx - 12 * k, wy + 6 * k);
  pt(wx + 6 * k, wy + 2 * k);
  pt(wx + 26 * k, 240);
  pt(wx - 22 * k, 240);
  fill(ctx, mix(P.purple, P.slate, 0.4), SH_SLEEVE);
  // the handset: earpiece cup, a slim neck, the mouthpiece cup
  begin();
  for (const [lx, ly] of [[-6, -5], [6, -5], [8, 4], [4, 10], [4, 34], [8, 40], [6, 48], [-6, 48], [-8, 40], [-4, 34], [-4, 10], [-8, 4]]) {
    hp(ox, oy, ca, sa, lx * k, ly * k);
    pt(HP[0], HP[1]);
  }
  fill(ctx, HS.body, SH_HS);
  hp(ox, oy, ca, sa, -4 * k, -2 * k);
  rect(ctx, HP[0], HP[1], max(2, round(6 * k)), 1, C.beigeDD); // the earpiece grille
  // fingers wrapped round the neck (seen on the outer side), thumb along it
  for (let i = 0; i < 4; i++) {
    hp(ox, oy, ca, sa, -6 * k, (14 + i * 4.6) * k);
    const x0 = HP[0];
    const y0 = HP[1];
    hp(ox, oy, ca, sa, 3 * k, (15 + i * 4.6) * k);
    capsule(ctx, x0, y0, HP[0], HP[1], 2.4 * k + 0.6, 2.2 * k + 0.6, SKIN.dd);
    capsule(ctx, x0, y0, HP[0], HP[1], 2.4 * k, 2.2 * k, SKIN.base, SH_FING);
    rect(ctx, x0 - 1, y0 - 1, 1, 1, SKIN.l);
  }
  // the back of the hand, behind the fingers, meeting the sleeve
  hp(ox, oy, ca, sa, -9 * k, 24 * k);
  ellipse(ctx, HP[0], HP[1], 6 * k, 8 * k, SKIN.base, { d: SKIN.d, f: 0.35, m: 1, dd: SKIN.dd, df: 0.1, side: -1 });
  // the curly cord from the mouthpiece, out of frame
  hp(ox, oy, ca, sa, 0, 48 * k);
  const cx0 = HP[0];
  const cy0 = HP[1];
  ctx.fillStyle = C.beigeD;
  for (let i = 0; i < 40; i++) {
    const u = i / 40;
    ctx.fillRect(round(cx0 + u * 30 + sin(u * 50) * 2), round(cy0 + u * 60 + cos(u * 50) * 1.5), 1, 1);
  }
}

const K_LIFT = [[0.2, 0], [1.4, 1, 'inOut']];
const NECK_X = 214;
const NECK_Y = 132;
const MUM_S = 4.0;

function shotHall(ctx, lt) {
  ctx.drawImage(hallSet(), -round(lt * 1.5), 0);
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(hallGlow(), 30 - round(lt * 1.5), 52);
  ctx.globalCompositeOperation = 'source-over';
  const lift = track(lt, K_LIFT);
  const head = castDraw(ctx, MUM.actor, lt, NECK_X, NECK_Y, MUM_S, -1);
  let ex;
  let ey;
  if (head) {
    // the ear on the screen-left side, from the rig's head frame
    const L = MUM.look;
    ex = head.cx + (-(L.head.cheekHW || 6.5) - 0.6) * MUM_S;
    ey = head.cy + (L.ears.y || 0) * MUM_S;
  } else {
    const m = MUM_FB;
    m.x = NECK_X;
    m.y = 40;
    m.blink = blinkAt(lt, 2);
    m.brow = lt > 1.5 && lt < 2.3 ? 1 : 0;
    bust(ctx, m, 216);
    ex = m.x - m.hh * 0.42;
    ey = m.y + m.hh * 0.5;
  }
  // the receiver rises from below the frame to her ear on an arc, turning upright
  const ox = lerp(ex - 34, ex - 2, lift);
  const oy = lerp(250, ey - 4, smooth(lift));
  handset(ctx, ox, oy, lerp(-0.9, -0.28, lift), 1.15);
  vignette(ctx, 0.55);
  letterbox(ctx, LB);
}

// --- S6: NO CARRIER, held in silence; then the dial-up dialog is the slate ---------------------
const crtFrame = lazy(() =>
  bake('sn-crtframe', W, H, function* paint(c) {
    rect(c, 0, 0, W, H, C.beigeD);
    yield* shadeSteps(c, 0, 0, W, H, [C.beigeD, mix(C.beigeD, C.beige, 0.5)], (x, y) => 0.2 + 0.6 * (1 - y / H) - 0.3 * (x / W));
    c.clearRect(40, 32, 304, 152);
    rect(c, 38, 30, 308, 2, P.black);
    rect(c, 38, 184, 308, 2, mix(C.beige, P.white, 0.3));
  }));
const glassArt = lazy(() =>
  bake('sn-glass', 304, 152, (c) => {
    // scanlines and a soft curved highlight on the glass (drawn over the screen)
    c.fillStyle = P.black;
    c.globalAlpha = 0.08;
    for (let y = 1; y < 152; y += 2) c.fillRect(0, y, 304, 1);
    c.globalAlpha = 0.07;
    c.fillStyle = P.white;
    for (let y = 6; y < 40; y++) c.fillRect(20 + (40 - y), y, 120 - (40 - y) * 2, 1);
    c.globalAlpha = 1;
  }));

/** The handshake as a hairline: a quiet carrier, a burst, a carrier again. */
function waveform(ctx, cx, y, w, p) {
  const n = round(w * p);
  ctx.fillStyle = C.amber;
  for (let i = 0; i < n; i++) {
    const u = i / w;
    const burst = Math.exp(-(((u - 0.5) / 0.12) ** 2));
    const v = sin(i * 0.9) * (1 + burst * 4) * (0.6 + 0.4 * sin(i * 0.31));
    ctx.fillRect(round(cx - w / 2 + i), round(y + v), 1, 1);
  }
}

const LEGAL = 'Ends when anyone picks up the phone. Speeds up to 56K, down to emotional.';
const DLG = { x: 74, y: 46, w: 236, h: 124 };

function shotEnd(ctx, lt) {
  // the screen: NO CARRIER on black, then the desktop and the dialog
  const d = lt - LOST_HOLD;
  if (d < 0.3) {
    rect(ctx, 40, 32, 304, 152, mix(P.black, P.navy, 0.25));
    text(ctx, 'NO CARRIER', 56, 52, { color: P.silver });
    rect(ctx, 56, 64, 5, 7, P.silver);
    if (d > 0) {
      ctx.globalAlpha = smooth(d / 0.3);
      rect(ctx, 40, 32, 304, 152, P.black);
      ctx.globalAlpha = 1;
    }
  } else {
    rect(ctx, 40, 32, 304, 152, mix(P.navy, P.darkGreen, 0.3));
    const a = smooth((d - 0.3) / 0.4);
    ctx.globalAlpha = a;
    // the dialog window: title bar, wordmark, tagline, the URL, a CONNECT button
    rect(ctx, DLG.x + 3, DLG.y + 3, DLG.w, DLG.h, P.black);
    rect(ctx, DLG.x, DLG.y, DLG.w, DLG.h, mix(P.silver, P.fog, 0.35));
    rect(ctx, DLG.x, DLG.y, DLG.w, 1, P.white);
    rect(ctx, DLG.x, DLG.y, 1, DLG.h, P.white);
    rect(ctx, DLG.x + DLG.w - 1, DLG.y, 1, DLG.h, P.steel);
    rect(ctx, DLG.x, DLG.y + DLG.h - 1, DLG.w, 1, P.steel);
    rect(ctx, DLG.x + 2, DLG.y + 2, DLG.w - 4, 9, P.navy);
    text(ctx, 'SCREECHNET 56K', DLG.x + 5, DLG.y + 4, { color: P.white, font: 'micro' });
    waveform(ctx, DLG.x + DLG.w / 2, DLG.y + 24, 96, smooth((d - 0.5) / 1.0));
    thin(ctx, 'SCREECHNET', DLG.x + DLG.w / 2, DLG.y + 34, { color: P.ink, track: 2, scale: 2, align: 'center' });
    tracked(ctx, 'SOME CONNECTIONS ARE WORTH THE WAIT.', DLG.x + DLG.w / 2, DLG.y + 66, { color: P.ink, track: 1, align: 'center' });
    tracked(ctx, 'DIAL-UP INTERNET  ·  SCREECHNET.NET', DLG.x + DLG.w / 2, DLG.y + 82, { color: P.slate, font: 'micro', track: 1, align: 'center' });
    const bx = DLG.x + DLG.w / 2 - 26;
    const by = DLG.y + 96;
    rect(ctx, bx, by, 52, 13, mix(P.silver, P.white, 0.4));
    rect(ctx, bx, by + 12, 52, 1, P.ink);
    rect(ctx, bx + 51, by, 1, 13, P.ink);
    rect(ctx, bx + 2, by + 2, 48, 9, mix(P.silver, P.white, 0.6));
    tracked(ctx, 'CONNECT', bx + 26, by + 3, { color: P.ink, font: 'micro', track: 1, align: 'center' });
    ctx.globalAlpha = 1;
  }
  ctx.drawImage(glassArt(), 40, 32);
  ctx.drawImage(crtFrame(), 0, 0);
  vignette(ctx, 0.55);
  letterbox(ctx, LB);
  // the legal on the bottom bar from the first frame of the shot
  smallPrint(ctx, LEGAL, H - LB + 8, { color: P.fog, a: smooth(lt / 0.5), maxW: 330 });
}

const SHOTS = [
  { at: 0, draw: shotStreet, tr: 'black', td: 0.9 },
  { at: T_ROOM, draw: shotRoom },
  { at: T_MODEM, draw: shotModem },
  { at: T_FACE, draw: shotFace },
  { at: T_HALL, draw: shotHall },
  { at: T_END, draw: shotEnd },
];

// A soft 90s ballad on chip voices (75 bpm, D major). The handshake is the
// serenade: an answer tone, the two-note "bong", a hiss of noise sweeps and a
// flutter of data, then the ballad swells; a chord hangs while she listens; the
// line drops at NO CARRIER (silence), and one soft cadence plays under the slate.
const LEAD = { wave: 'pulse25', a: 0.03, d: 0.5, s: 0.55, r: 0.35, vib: [12, 5, 0.25] };
const KEYS = { wave: 'triangle', a: 0.004, d: 1.2, s: 0, r: 0.6, vib: false };
const PAD = { wave: 'sine', a: 0.4, d: 1, s: 0.8, r: 1.0, vib: [5, 4, 0.4], legato: 1 };

// Everything this spot bakes, in shot order: prewarmed in idle-time slices so
// no cut ever waits for a bake (see cine.js prewarm).
const WARM = [streetSky, streetSet, lampPool, lampHalo, roomSet, monitorArt, desktopArt, screenSpill, teenArt, plateArt, modemSet, ledGlow, faceBg, crtBand, hallSet, hallGlow, crtFrame, glassArt, () => vignetteArt(0.6), () => vignetteArt(0.62), () => vignetteArt(0.7), () => vignetteArt(0.55)];
prewarm(WARM, 7000);

export default {
  id: 'screechnet',
  brand: 'SCREECHNET',
  duration: DURATION,
  voice: { gender: 'male', lang: 'en-GB', pitch: 0.9, rate: 0.95 },
  script: [
    { at: 0.5, text: 'Nineteen ninety-seven.' },
    { at: 2.6, text: 'Somewhere in the suburbs, a young man waits for the only voice that ever understood him.' },
    { at: 10.0, text: 'Some call it noise. He calls it connection.' },
    { at: 13.8, text: 'Fifty-six kilobits of pure feeling.' },
    { at: 21.7, text: 'ScreechNet. Some connections are worth the wait.' },
  ],
  // every track is 33 beats at 75 bpm (26.4 s, longer than the spot) and ends in rest
  tune: {
    bpm: 75,
    room: 0.45,
    echo: { beats: 0.75, feedback: 0.25 },
    fadeOut: 1.2,
    tracks: [
      {
        kind: 'lead',
        inst: LEAD,
        gain: 0.95,
        notes: 'R:1 A4:1@0.45 F#4:0.5@0.4 E4:0.5@0.4 D4:1@0.45 R:0.5 B4:1@0.45 A4:0.5@0.4 F#4:1@0.4 D4:1@0.4 R:0.5 E4:0.5@0.4 F#4:0.5@0.4 G4:0.5@0.45 A4:1.5@0.5 R:0.5 A6:1@0.35 F#5:0.5@0.6 D5:0.5@0.55 D6:0.125@0.3 A5:0.125@0.3 F#5:0.125@0.3 A5:0.125@0.3 D6:0.125@0.3 A5:0.125@0.3 F#5:0.125@0.3 A5:0.125@0.3 F#5:1.5@0.7 E5:0.5@0.6 D5:1@0.65 A4:1@0.55 G4:0.5@0.55 B4:0.5@0.55 D5:1@0.6 A4:3@0.3 R:0.25 R:2.75 A4:0.5@0.4 F#5:1@0.5 E5:0.5@0.45 D5:2@0.45 R:2',
      },
      {
        kind: 'harmony',
        inst: KEYS,
        gain: 0.78,
        notes: 'D3:0.5@0.5 A3:0.5@0.4 C#4:0.5@0.4 F#4:0.5@0.4 D3:0.5@0.45 A3:0.5@0.4 C#4:0.5@0.4 F#4:0.5@0.4 B2:0.5@0.45 F#3:0.5@0.4 A3:0.5@0.4 D4:0.5@0.4 G2:0.5@0.45 D3:0.5@0.4 F#3:0.5@0.4 B3:0.5@0.4 E3:0.5@0.45 B3:0.5@0.4 D4:0.5@0.4 G4:0.5@0.4 A2:0.5@0.45 E3:0.5@0.4 G3:0.5@0.4 D4:0.5@0.4 A2+E3+A3:3@0.35 D3:0.5@0.5 A3:0.5@0.45 D4:0.5@0.45 F#4:0.5@0.45 F#2:0.5@0.5 C#3:0.5@0.45 F#3:0.5@0.45 A3:0.5@0.45 G2:0.5@0.5 D3:0.5@0.45 G3:0.5@0.45 B3:0.5@0.45 A2+E3+A3:3@0.3 R:0.25 R:2.75 G2:0.5@0.45 D3:0.5@0.4 F#3:0.5@0.4 B3:0.5@0.4 D3+F#3+A3+D4:2@0.45 R:2',
      },
      {
        kind: 'harmony',
        inst: PAD,
        gain: 0.34,
        notes: 'D3+F#3+A3+C#4:4@0.4 B2+D3+F#3+A3:2@0.4 G2+B2+D3+F#3:2@0.4 E3+G3+B3+D4:2@0.4 A2+D3+E3+G3:2@0.4 A2+E3+A3:3@0.45 D3+F#3+A3:2@0.55 F#2+A2+C#3:2@0.55 G2+B2+D3:2@0.55 A2+C#3+E3:3@0.4 R:0.25 R:2.75 G2+B2+D3+F#3:1@0.4 D3+F#3+A3:3@0.45 R:2',
      },
      { kind: 'bass', inst: 'tri', gain: 0.68, notes: 'D2:4 B1:2 G1:2 E2:2 A1:2 A1:3 D2:2 F#1:2 G1:2 A1:3 R:0.25 R:2.75 G1:1 D2:3 R:2' },
      { drums: 'R:12 W:1@0.3 W:1@0.4 X:0.25@0.25 X:0.25@0.25 X:0.25@0.25 X:0.25@0.25 K:1@0.3 H:1@0.18 K:1@0.3 H:1@0.18 K:1@0.3 H:1@0.18 W:1@0.32 R:2.25 R:2.75 R:6' },
    ],
  },
  draw(ctx, t, dt, info) {
    prewarm(WARM);
    film(ctx, dt, info, SHOTS);
  },
};
