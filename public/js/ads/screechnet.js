// SCREECHNET — dial-up internet, shot as a nostalgic, cinematic short in a
// 2.39:1 letterbox. Dusk, 1997: a suburban street, one upstairs window lit by
// a CRT; a teenager clicks CONNECT; the modem's handshake is scored like a
// romantic serenade while he closes his eyes; a sunset photo arrives one line
// at a time; downstairs, his mother picks up the phone. NO CARRIER.
// "Some connections are worth the wait." Deadpan, never slapstick.
//
// Every frame is a pure function of the ad clock: sets are baked once with
// dithered light (cine.js), people and props use the crisp rasteriser.
import {
  P, W, H, clamp, lerp, prog, smooth, easeInOut, track, window01, hash, blinkAt, mix, bake, shader, shadeInto, ditherInto,
  pool, rect, line, begin, pt, fill, ellipse, capsule, film, vignette, letterbox, thin, tracked, text, smallPrint,
  figure, bust, arm, profile, standing,
} from './cine.js';

const { round, floor, sin, cos, abs, min, max, PI, sqrt } = Math;

// --- timing (75 bpm: 0.8 s a beat; cuts on the beat) ------------------------------------
const T_HOUSE = 3.2;
const T_ROOM = 6.4;
const T_MODEM = 9.6;
const T_FACE = 12.0;
const T_PHOTO = 15.2;
const T_HALL = 18.4;
const T_LOST = 19.6;
const T_SLATE = 20.4;
const DURATION = 24.8;
const LB = 24; // letterbox bars (2.39:1)

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
};

// --- S1a: the street at dusk ---------------------------------------------------------------
const S1W = 440;
const HORIZON = 146;
const streetSky = () =>
  bake('sn-sky', S1W, H, (c) => {
    shadeInto(c, 0, 0, S1W, HORIZON + 4, [C.sky0, C.sky1, C.sky2, C.sky3, C.sky4], (x, y) => clamp((y - 18) / (HORIZON - 18)) ** 1.25 + 0.04 * sin(x * 0.012));
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
  });

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

const streetSet = () =>
  bake('sn-street', S1W, H, (c) => {
    house(c, 10, 84, 30, [[14, 128, 'warm'], [58, 128, 'dark'], [14, 150, 'dark'], [58, 150, 'warm']]);
    house(c, 118, 76, 26, [[12, 128, 'dark'], [50, 128, 'dark'], [30, 150, 'warm']], false);
    house(c, 222, 92, 32, [[16, 126, 'crt'], [62, 126, 'dark'], [16, 150, 'dark'], [62, 150, 'warm']]);
    house(c, 340, 86, 28, [[14, 128, 'warm'], [58, 128, 'dark'], [36, 150, 'dark']]);
    // hedges and garden walls
    for (let x = 0; x < S1W; x += 4) rect(c, x, 168 - floor(hash(x * 0.7) * 3), 4, 12, mix(C.house, P.darkGreen, 0.15));
    // pavement and kerb
    shadeInto(c, 0, 178, S1W, 14, [P.black, mix(P.black, P.ink, 0.6), P.ink], (x, y) => 0.3 + (y - 178) * 0.02);
    rect(c, 0, 178, S1W, 1, mix(P.ink, P.slate, 0.4));
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
  });

/** Wires: catenary curves from the pole to the houses (the phone line). */
function wire(ctx, x0, y0, x1, y1, sag) {
  ctx.fillStyle = P.black;
  const n = max(2, floor(abs(x1 - x0) / 2));
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    ctx.fillRect(round(lerp(x0, x1, u)), round(lerp(y0, y1, u) + sag * 4 * u * (1 - u)), 1, 1);
  }
}

const lampPool = () => pool('sn-sodium', 40, 12, C.sodium, 5, 0.42);
const lampHalo = () => pool('sn-sodium-halo', 10, 10, C.sodium, 4, 0.55);

function shotStreet(ctx, lt) {
  const camX = track(lt, [[0, 0], [3.2 + 0.6, 30, 'smooth']]);
  ctx.drawImage(streetSky(), -round(camX * 0.3), 0);
  ctx.save();
  ctx.translate(-round(camX), 0);
  ctx.drawImage(streetSet(), 0, 0);
  wire(ctx, 0, 84, 196, 76, 10);
  wire(ctx, 0, 88, 196, 80, 12);
  wire(ctx, 216, 76, S1W, 82, 9);
  wire(ctx, 214, 80, 246, 112, 3); // the line into the hero house
  // sodium lamps warm up one after the other, with a little hesitation
  for (const [lx, on] of [[100, 1.2], [380, 1.7]]) {
    const k = lt - on;
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
  vignette(ctx, 0.6, 'sn1');
  letterbox(ctx, LB);
}

// --- S1b: the house, closer: one window glows blue -------------------------------------------
const houseSet = () =>
  bake('sn-house', 400, H, (c) => {
    shadeInto(c, 0, 0, 400, H, [C.sky0, C.sky1, C.sky2], (x, y) => clamp((y - 10) / 160) + 0.1 * (x / 400));
    // gable wall, siding boards
    begin();
    pt(40, H);
    pt(40, 60);
    pt(200, 2);
    pt(360, 60);
    pt(360, H);
    fill(c, C.house);
    for (let y = 62; y < H; y += 5) rect(c, 40, y, 320, 1, mix(C.house, P.black, 0.45));
    // roof edge and gutter
    line(c, 36, 62, 200, -2, mix(C.houseL, P.slate, 0.3));
    line(c, 200, -2, 364, 62, mix(C.houseL, P.slate, 0.3));
    // the window frame (glass painted per frame), sill
    rect(c, 146, 76, 108, 76, mix(C.house, P.black, 0.5));
    rect(c, 140, 152, 120, 4, mix(C.houseL, P.slate, 0.25));
    // porch light below
    rect(c, 180, 186, 40, 30, mix(C.house, P.black, 0.4));
    ellipse(c, 228, 182, 3, 4, C.warm);
  });
const porchGlow = () => pool('sn-porch', 30, 24, C.warm, 5, 0.35);

function shotHouse(ctx, lt) {
  const camY = track(lt, [[0, 0], [3.2 + 0.6, 12, 'smooth']]);
  const camX = track(lt, [[0, 0], [3.2 + 0.6, 10, 'smooth']]);
  ctx.save();
  ctx.translate(-round(camX), -round(camY) + 8);
  ctx.drawImage(houseSet(), 0, 0);
  ctx.globalAlpha = 0.8;
  ctx.drawImage(porchGlow(), 198, 158);
  ctx.globalAlpha = 1;
  // inside the window: a blue glow on the ceiling and a silhouette at the desk
  const flick = 0.85 + 0.15 * sin(lt * 11.3) * sin(lt * 2.7);
  rect(ctx, 150, 80, 100, 68, mix(C.crtD, P.black, 0.35));
  ctx.globalAlpha = flick;
  ctx.drawImage(windowGlow(), 150, 80);
  ctx.globalAlpha = 1;
  // the boy, seen through the glass from behind (backlit by the screen)
  ellipse(ctx, 214, 116, 9, 11, P.black);
  begin();
  pt(194, 148);
  pt(198, 130);
  pt(206, 126);
  pt(222, 126);
  pt(230, 130);
  pt(234, 148);
  fill(ctx, P.black);
  rect(ctx, 211, 104, 2, 2, P.black);
  rect(ctx, 217, 103, 2, 3, P.black);
  // curtains, glazing bars
  rect(ctx, 150, 80, 12, 68, mix(C.house, P.purple, 0.25));
  rect(ctx, 238, 80, 12, 68, mix(C.house, P.purple, 0.25));
  rect(ctx, 199, 80, 2, 68, mix(C.house, P.black, 0.5));
  rect(ctx, 150, 112, 100, 2, mix(C.house, P.black, 0.5));
  wire(ctx, -20, 30, 120, 70, 6);
  ctx.restore();
  vignette(ctx, 0.6, 'sn1b');
  letterbox(ctx, LB);
}
const windowGlow = () =>
  shader('sn-winglow', 100, 68, [mix(C.crtD, P.black, 0.35), C.crtD, mix(C.crtD, C.crt, 0.5), C.crt], (x, y) => {
    const d = sqrt(((x - 62) / 70) ** 2 + ((y - 50) / 50) ** 2);
    return clamp(1 - d) * 0.95 + (y < 10 ? 0.2 : 0);
  });

// --- S2: the bedroom, a CRT, CONNECT -------------------------------------------------------
const roomSet = () =>
  bake('sn-room', 400, H, (c) => {
    // dark wall lit by the screen (right of centre)
    shadeInto(c, 0, 0, 400, 150, [P.black, mix(P.black, P.ink, 0.6), P.ink, mix(P.ink, P.navy, 0.45), mix(P.navy, P.blue, 0.25)], (x, y) => {
      const d = sqrt(((x - 250) / 210) ** 2 + ((y - 96) / 110) ** 2);
      return clamp(1 - d) * 0.9 + 0.04;
    });
    // window with blinds at the left: dusk outside
    shadeInto(c, 26, 34, 64, 70, [C.sky1, C.sky2, C.sky3], (x, y) => (y - 34) / 70);
    for (let y = 36; y < 104; y += 4) rect(c, 26, y, 64, 2, mix(P.black, P.ink, 0.5));
    rect(c, 22, 30, 72, 4, P.black);
    rect(c, 22, 104, 72, 4, mix(P.black, P.ink, 0.4));
    // posters, dim in the blue spill (no real bands, no real films)
    rect(c, 300, 30, 40, 54, mix(P.ink, P.black, 0.2));
    shadeInto(c, 302, 32, 36, 50, [mix(P.ink, P.purple, 0.3), mix(P.navy, P.purple, 0.3), mix(P.slate, P.navy, 0.3)], (x, y) => clamp(1 - sqrt(((x - 320) / 16) ** 2 + ((y - 50) / 16) ** 2)));
    ellipse(c, 320, 52, 9, 9, mix(P.slate, P.navy, 0.35));
    rect(c, 304, 74, 32, 2, mix(P.fog, P.navy, 0.55));
    rect(c, 352, 40, 30, 42, mix(P.ink, P.black, 0.2));
    rect(c, 355, 43, 24, 22, mix(P.maroon, P.ink, 0.5));
    rect(c, 355, 70, 24, 2, mix(P.fog, P.ink, 0.6));
    // desk
    shadeInto(c, 0, 150, 400, H - 150, [P.black, mix(P.black, P.ink, 0.6), P.ink, mix(P.ink, P.navy, 0.4)], (x, y) => {
      const d = sqrt(((x - 250) / 170) ** 2 + ((y - 156) / 30) ** 2);
      return clamp(1 - d) * 0.9 + 0.08;
    });
    rect(c, 0, 150, 400, 1, mix(P.navy, P.steel, 0.4));
  });

/** The beige CRT monitor (screen drawn by the caller). */
const monitorArt = () =>
  bake('sn-monitor', 96, 84, (c) => {
    // body seen slightly from the left: front bezel + side depth
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
    // stand
    rect(c, 30, 76, 32, 4, C.beigeD);
    rect(c, 24, 80, 44, 4, C.beigeDD);
  });

/** Screen content: desktop, the dial-up dialog, its CONNECT button. */
function screenUI(ctx, x, y, w, h, lt) {
  shadeInto0(ctx, x, y, w, h);
  // dialog
  const dx = x + 8;
  const dy = y + 9;
  rect(ctx, dx, dy, w - 16, h - 16, mix(P.fog, P.silver, 0.4));
  rect(ctx, dx, dy, w - 16, 6, P.navy);
  text(ctx, 'DIAL-UP', dx + 2, dy + 1, { color: P.white, font: 'micro' });
  const dialling = lt > 1.55;
  text(ctx, dialling ? 'DIALLING...' : 'SCREECHNET', dx + 3, dy + 10, { color: P.ink, font: 'micro' });
  const pressed = lt > 1.45 && lt < 1.65;
  rect(ctx, dx + 10, dy + 20, 22, 7, pressed ? P.steel : mix(P.silver, P.white, 0.4));
  rect(ctx, dx + 10, dy + 26, 22, 1, P.ink);
  rect(ctx, dx + 31, dy + 20, 1, 7, P.ink);
  text(ctx, 'OK', dx + 18, dy + 21 + (pressed ? 1 : 0), { color: P.ink, font: 'micro' });
  // pointer glides to the button
  const px = track(lt, [[0.3, x + w - 6], [1.3, dx + 24, 'inOut']]);
  const py = track(lt, [[0.3, y + h - 6], [1.3, dy + 24, 'inOut']]);
  begin();
  pt(px, py);
  pt(px, py + 6);
  pt(px + 2, py + 4);
  pt(px + 4, py + 6);
  fill(ctx, P.white);
}
function shadeInto0(ctx, x, y, w, h) {
  ctx.drawImage(desktopArt(), x, y);
}
const desktopArt = () => shader('sn-desktop', 58, 50, [P.navy, mix(P.navy, P.blue, 0.5), mix(P.blue, P.cyan, 0.25)], (x, y) => clamp(1 - sqrt(((x - 29) / 40) ** 2 + ((y - 24) / 34) ** 2)));
const screenSpill = () => pool('sn-spill', 120, 70, C.crt, 6, 0.3);

const DANIEL = figure({
  hh: 30,
  hair: 'messy',
  garment: 'hoodie',
  back: true,
  shoulders: 0.95,
  pal: {
    skin: mix(P.tanShade, P.ink, 0.25),
    skinD: mix(P.brown, P.black, 0.45),
    hair: mix(P.black, P.maroon, 0.4),
    hairD: P.black,
    hairL: mix(P.maroon, C.crt, 0.35),
    top: mix(P.darkGreen, P.ink, 0.55),
    topD: P.black,
    topL: mix(P.darkGreen, C.crt, 0.35),
    shirt: mix(P.fog, P.ink, 0.5),
    rim: mix(C.crt, P.white, 0.2),
  },
});

function shotRoom(ctx, lt) {
  const camX = track(lt, [[0, 0], [3.2, 12, 'smooth']]);
  ctx.drawImage(roomSet(), round(camX * 0.5), 0, W, 150, 0, 0, W, 150);
  ctx.drawImage(roomSet(), round(camX), 150, W, H - 150, 0, 150, W, H - 150);
  ctx.save();
  ctx.translate(-round(camX), 0);
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(screenSpill(), 120, 60);
  ctx.globalCompositeOperation = 'source-over';
  // monitor and screen
  const mx = 214;
  const my = 70;
  ctx.drawImage(monitorArt(), mx, my);
  screenUI(ctx, mx + 16, my + 10, 58, 50, lt);
  // modem and phone on the desk
  rect(ctx, 300, 142, 50, 9, C.beige);
  rect(ctx, 300, 142, 50, 1, mix(C.beige, P.white, 0.4));
  rect(ctx, 300, 150, 50, 1, C.beigeDD);
  for (let i = 0; i < 6; i++) rect(ctx, 306 + i * 6, 147, 2, 1, i < 2 || (lt > 1.6 && (i === 3 || floor(lt * 8 + i) % 2 === 0)) ? C.led : C.ledOff);
  rect(ctx, 150, 146, 26, 6, C.beigeD);
  rect(ctx, 152, 142, 22, 4, C.beige);
  // Daniel, from behind, reaching for the mouse
  const d = DANIEL;
  d.x = 168;
  d.y = 72;
  d.nod = round(track(lt, [[1.2, 0], [1.6, 1], [2.4, 0]]));
  d.armR.a = 0.5;
  d.armR.e = track(lt, [[0, 0.9], [1.0, 1.15, 'inOut']]);
  d.armR.fore = 0.9;
  d.armR.hand = 'rest';
  d.armL.a = 0.15;
  d.armL.e = 1.2;
  d.armL.fore = 0.7;
  d.armL.hand = 'rest';
  bust(ctx, d, 216);
  arm(ctx, d, 1);
  // mouse under the hand
  ellipse(ctx, 214, 160, 5, 3, C.beige, { d: C.beigeD, f: 0.4, m: 1, side: 1 });
  ctx.restore();
  vignette(ctx, 0.62, 'sn2');
  letterbox(ctx, LB);
}

// --- S3: the modem sings (macro on the front panel) -----------------------------------------
const LEDS = ['HS', 'AA', 'CD', 'OH', 'RD', 'SD', 'TR', 'MR'];
const modemSet = () =>
  bake('sn-modem', 420, H, (c) => {
    shadeInto(c, 0, 0, 420, H, [P.black, mix(P.black, P.ink, 0.6), P.ink, mix(P.ink, P.navy, 0.5)], (x, y) => clamp(1 - sqrt(((x - 300) / 300) ** 2 + ((y + 20) / 200) ** 2)) * 0.9);
    // top surface (blue spill from the screen above) and front panel
    shadeInto(c, 20, 70, 390, 24, [C.beigeDD, mix(C.beigeD, C.crt, 0.25), mix(C.beige, C.crtL, 0.3)], (x, y) => 0.25 + ((x - 20) / 390) * 0.6 + (y - 70) * 0.01);
    for (let x = 40; x < 400; x += 8) rect(c, x, 76 + ((x >> 3) & 1), 5, 1, C.beigeDD);
    shadeInto(c, 20, 94, 390, 70, [mix(C.beigeDD, P.black, 0.3), C.beigeDD, C.beigeD, mix(C.beigeD, C.beige, 0.5)], (x, y) => 0.6 - (y - 94) * 0.006 + ((x - 20) / 390) * 0.25);
    rect(c, 20, 94, 390, 1, mix(C.beige, P.white, 0.3));
    rect(c, 20, 163, 390, 2, P.black);
    // LED window strip and labels
    rect(c, 150, 112, 230, 26, mix(P.black, P.maroon, 0.25));
    rect(c, 150, 137, 230, 1, mix(C.beigeD, C.beige, 0.5));
    LEDS.forEach((s, i) => text(c, s, 166 + i * 28, 142, { color: mix(P.ink, C.beigeDD, 0.3), font: 'micro', align: 'center' }));
    // brand plate
    thin(c, 'SCREECHNET', 40, 112, { color: mix(P.ink, C.beigeDD, 0.2), track: 1 });
    text(c, '56K DATA / FAX', 40, 126, { color: mix(P.ink, C.beigeDD, 0.35), font: 'micro' });
    // desk below
    shadeInto(c, 0, 165, 420, H - 165, [P.black, mix(P.black, P.ink, 0.6), P.ink], (x, y) => 0.5 - (y - 165) * 0.02 + (x / 420) * 0.3);
  });
const ledGlow = () => pool('sn-ledglow', 8, 6, C.led, 4, 0.5);

/** Which LEDs are lit at time lt of the handshake (deterministic). */
function ledOn(i, lt) {
  const s = LEDS[i];
  if (s === 'MR' || s === 'TR') return true;
  if (s === 'OH') return lt > 0.15;
  if (s === 'HS') return lt > 0.9;
  if (s === 'AA') return false;
  if (s === 'CD') return lt > 1.6;
  if (s === 'RD' || s === 'SD') return lt > 1.0 && floor(lt * (s === 'RD' ? 11 : 7) + i) % 2 === 0;
  return false;
}

function shotModem(ctx, lt) {
  const camX = track(lt, [[0, 0], [2.4, 22, 'smooth']]);
  ctx.drawImage(modemSet(), -round(camX), 0);
  for (let i = 0; i < LEDS.length; i++) {
    const x = 166 + i * 28 - round(camX);
    const on = ledOn(i, lt);
    rect(ctx, x - 2, 122, 4, 3, on ? C.led : C.ledOff);
    if (on) {
      rect(ctx, x - 1, 122, 2, 1, mix(C.led, P.white, 0.5));
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(ledGlow(), x - 8, 117);
      ctx.globalCompositeOperation = 'source-over';
    }
  }
  vignette(ctx, 0.6, 'sn3');
  letterbox(ctx, LB);
}

// --- S4: he closes his eyes and listens -----------------------------------------------------
const faceBg = () =>
  shader('sn-facebg', W, H, [P.black, mix(P.black, P.ink, 0.6), P.ink, mix(P.ink, P.navy, 0.5), mix(P.navy, C.crt, 0.3)], (x, y) => clamp(1 - sqrt(((x - 420) / 300) ** 2 + ((y - 90) / 150) ** 2)) * 0.95);

const FACE = {
  x: 150,
  y: 34,
  hh: 112,
  hair: 'messy',
  eye: 0,
  mouth: 0,
  smile: 0,
  light: mix(P.skin, C.crtL, 0.45),
  litF: 0.14,
  pal: {
    skin: mix(P.tanShade, P.ink, 0.45),
    skinD: mix(P.brown, P.black, 0.55),
    hair: mix(P.black, P.maroon, 0.35),
    hairD: P.black,
    hairL: mix(P.maroon, C.crt, 0.3),
    lip: mix(P.brown, P.black, 0.35),
    eye: P.black,
  },
};

function shotFace(ctx, lt) {
  ctx.drawImage(faceBg(), 0, 0);
  const f = FACE;
  f.x = 150 - round(track(lt, [[0, 0], [3.2, 8, 'smooth']]));
  f.y = 36 + round(sin(lt * 1.1) * 0.6);
  // eyes close slowly on the swell; the smallest smile
  f.eye = lt > 1.1 && lt < 3.0 ? 1 : blinkAt(lt, 5);
  f.smile = lt > 2.0 ? 1 : 0;
  profile(ctx, f);
  // the screen's light flickers faintly across the face
  ctx.globalAlpha = 0.06 + 0.04 * sin(lt * 17);
  rect(ctx, 0, LB, W, H - LB * 2, C.crt);
  ctx.globalAlpha = 1;
  vignette(ctx, 0.7, 'sn4');
  letterbox(ctx, LB);
}

// --- S5: a sunset arrives, one line at a time ----------------------------------------------
const photoArt = () =>
  shader('sn-photo', 150, 92, [mix(P.purple, P.ink, 0.4), P.purple, mix(P.maroon, P.purple, 0.4), P.rust, P.orange, P.yellow], (x, y) => {
    const sun = clamp(1 - sqrt(((x - 96) / 18) ** 2 + ((y - 52) / 18) ** 2)) * 1.2;
    if (y > 58) {
      // the sea: darker, with the sun's reflection broken into bands
      const ref = abs(x - 96) < 14 - (y - 58) * 0.2 && (y & 3) < 2 ? 0.75 : 0;
      return clamp(0.18 + (92 - y) * 0.004 + ref);
    }
    return clamp((y / 58) * 0.62 + sun);
  });
const crtFrame = () =>
  bake('sn-crtframe', W, H, (c) => {
    // bezel around a slightly curved screen
    rect(c, 0, 0, W, H, C.beigeD);
    shadeInto(c, 0, 0, W, H, [C.beigeDD, C.beigeD, C.beige], (x, y) => 0.4 + 0.3 * (1 - y / H) - 0.2 * (x / W));
    c.clearRect(40, 32, 304, 152);
    rect(c, 38, 30, 308, 2, P.black);
    rect(c, 38, 184, 308, 2, mix(C.beige, P.white, 0.3));
  });

function shotPhoto(ctx, lt) {
  // screen: desktop, a viewer window, the photo arriving line by line
  rect(ctx, 40, 32, 304, 152, P.navy);
  ctx.drawImage(desktopArt(), 0, 0, 58, 50, 40, 32, 304, 152);
  const wx = 98;
  const wy = 50;
  rect(ctx, wx, wy, 190, 126, mix(P.fog, P.silver, 0.4));
  rect(ctx, wx, wy, 190, 9, P.navy);
  text(ctx, 'SUNSET.JPG', wx + 4, wy + 2, { color: P.white, font: 'micro' });
  rect(ctx, wx + 20, wy + 14, 150, 92, P.black);
  const rows = floor(clamp(lt / 3.2) * 62);
  ctx.drawImage(photoArt(), 0, 0, 150, rows, wx + 20, wy + 14, 150, rows);
  if (rows < 92) rect(ctx, wx + 20, wy + 14 + rows, floor(hash(floor(lt * 12)) * 150), 1, mix(P.purple, P.rust, 0.5));
  const pct = round(clamp(lt / 3.2) * 67);
  const mins = 17 - floor(lt * 0.9);
  text(ctx, `RECEIVING  ${pct}%`, wx + 20, wy + 110, { color: P.ink, font: 'micro' });
  text(ctx, `2.1 KB/S   ${mins} MIN LEFT`, wx + 170, wy + 110, { color: P.ink, font: 'micro', align: 'right' });
  // his reflection on the glass, very faint
  ctx.globalAlpha = 0.1;
  ellipse(ctx, 256, 92, 26, 32, P.black);
  ellipse(ctx, 256, 170, 60, 34, P.black);
  ctx.globalAlpha = 0.07;
  for (let y = 33; y < 184; y += 2) rect(ctx, 40, y, 304, 1, P.black);
  ctx.globalAlpha = 1;
  ctx.drawImage(crtFrame(), 0, 0);
  vignette(ctx, 0.5, 'sn5');
  letterbox(ctx, LB);
}

// --- S6: downstairs, mum picks up the phone; then NO CARRIER ----------------------------------
const hallSet = () =>
  bake('sn-hall', W, H, (c) => {
    shadeInto(c, 0, 0, W, 180, [P.black, mix(P.black, P.maroon, 0.55), P.maroon, mix(P.maroon, P.brown, 0.55), mix(P.brown, P.tanShade, 0.5)], (x, y) => {
      const d = sqrt(((x - 150) / 190) ** 2 + ((y - 110) / 120) ** 2);
      return clamp(1 - d) * 0.92 + 0.03 * ((x >> 3) & 1);
    });
    // dado rail, skirting, floor
    rect(c, 0, 130, W, 2, mix(P.brown, P.black, 0.3));
    rect(c, 0, 130, W, 1, mix(P.tanShade, P.brown, 0.5));
    shadeInto(c, 0, 176, W, H - 176, [P.black, mix(P.black, P.maroon, 0.6), P.maroon], (x, y) => clamp(1 - sqrt(((x - 150) / 200) ** 2 + ((y - 180) / 40) ** 2)) * 0.8);
    rect(c, 0, 176, W, 1, mix(P.brown, P.tanShade, 0.4));
    // staircase banister on the right, in silhouette
    for (let i = 0; i < 9; i++) rect(c, 290 + i * 11, 60 + i * 13, 2, 120 - i * 13, P.black);
    line(c, 286, 58, 384, 168, P.black);
    line(c, 286, 57, 384, 167, P.black);
    // hall table, lamp, telephone base
    rect(c, 100, 146, 70, 4, mix(P.brown, P.black, 0.3));
    rect(c, 104, 150, 3, 28, mix(P.brown, P.black, 0.4));
    rect(c, 162, 150, 3, 28, mix(P.brown, P.black, 0.4));
    rect(c, 114, 116, 3, 30, mix(P.tanShade, P.yellow, 0.3));
    begin();
    pt(104, 116);
    pt(108, 100);
    pt(124, 100);
    pt(128, 116);
    fill(c, mix(P.cream, P.yellow, 0.3), { d: mix(P.tan, P.yellow, 0.2), f: 0.3, m: 1, side: 1 });
    rect(c, 140, 140, 18, 6, C.beigeD);
    rect(c, 142, 138, 14, 2, C.beige);
  });
const hallGlow = () => pool('sn-hallglow', 70, 60, P.yellow, 5, 0.2);

const MUM = {
  x: 196,
  gy: 182,
  hh: 15,
  hair: 'bob',
  coat: true,
  turn: 0,
  pal: {
    ...figure().pal,
    skin: mix(P.skin, P.tan, 0.3),
    skinD: P.skinShade,
    hair: mix(P.brown, P.maroon, 0.5),
    hairD: P.maroon,
    hairL: P.tanShade,
    top: mix(P.purple, P.slate, 0.4),
    topD: mix(P.purple, P.black, 0.5),
    topL: mix(P.purple, P.fog, 0.4),
    lip: P.skinShade,
  },
  armL: { a: 0.08, e: 0.1 },
  armR: { a: 0.08, e: 0.1 },
  belt: mix(P.purple, P.fog, 0.3),
};

function shotHall(ctx, lt) {
  ctx.drawImage(hallSet(), 0, 0);
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(hallGlow(), 46, 58);
  ctx.globalCompositeOperation = 'source-over';
  const m = MUM;
  // she lifts the receiver from the table to her ear
  const lift = track(lt, [[0.15, 0], [0.75, 1, 'inOut']]);
  m.armL.a = lerp(0.35, 0.5, lift);
  m.armL.e = lerp(0.6, 2.75, lift);
  m.headX = round(lerp(0, -1, lift));
  standing(ctx, m);
  // receiver in her hand, its curly cord back to the base on the table
  const hx = m.armL.wx;
  const hy = m.armL.wy;
  capsule(ctx, hx - 3, hy - 3, hx + 2, hy + 5, 2, 2, C.beige);
  ctx.fillStyle = mix(C.beigeD, P.black, 0.2);
  for (let i = 0; i <= 14; i++) {
    const u = i / 14;
    ctx.fillRect(round(lerp(hx, 150, u) + sin(u * 30) * 1), round(lerp(hy + 4, 142, u) + 6 * u * (1 - u) * 4), 1, 1);
  }
  vignette(ctx, 0.6, 'sn6');
  letterbox(ctx, LB);
}

function shotLost(ctx, lt) {
  rect(ctx, 0, 0, W, H, P.black);
  rect(ctx, 40, 32, 304, 152, mix(P.black, P.navy, 0.25));
  text(ctx, 'NO CARRIER', 56, 52, { color: P.silver });
  rect(ctx, 56, 64, 5, 7, P.silver);
  ctx.globalAlpha = 0.08;
  for (let y = 33; y < 184; y += 2) rect(ctx, 40, y, 304, 1, P.black);
  ctx.globalAlpha = 1;
  ctx.drawImage(crtFrame(), 0, 0);
  vignette(ctx, 0.55, 'sn5');
  letterbox(ctx, LB);
}

// --- S7: end slate -------------------------------------------------------------------------------
const slateBg = () =>
  shader('sn-slate', W, H, [P.black, mix(P.black, P.ink, 0.5), P.ink, mix(P.ink, P.navy, 0.35)], (x, y) => clamp(1 - sqrt(((x - 192) / 250) ** 2 + ((y - 96) / 140) ** 2)) * 0.9);

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

function shotSlate(ctx, lt) {
  ctx.drawImage(slateBg(), 0, 0);
  waveform(ctx, 192, 64, 120, smooth(lt / 1.2));
  ctx.globalAlpha = smooth((lt - 0.4) / 0.7);
  thin(ctx, 'SCREECHNET', 192, 80, { color: P.white, track: 2, scale: 2, align: 'center' });
  ctx.globalAlpha = smooth((lt - 0.9) / 0.6);
  tracked(ctx, 'DIAL-UP INTERNET  ·  56K', 192, 108, { color: P.fog, font: 'micro', track: 2, align: 'center' });
  ctx.globalAlpha = smooth((lt - 1.4) / 0.7);
  tracked(ctx, 'SOME CONNECTIONS ARE WORTH THE WAIT.', 192, 128, { color: P.silver, track: 1, align: 'center' });
  ctx.globalAlpha = 1;
  smallPrint(
    ctx,
    'CONNECTION ENDS WHEN ANYONE IN THE HOUSEHOLD PICKS UP THE TELEPHONE. SPEEDS UP TO 56 KBPS, DOWN TO EMOTIONAL. PLEASE DO NOT CALL US WHILE ONLINE.',
    170,
    { color: P.steel, a: smooth((lt - 2.0) / 0.8), maxW: 320 },
  );
  letterbox(ctx, LB);
}

const SHOTS = [
  { at: 0, draw: shotStreet, tr: 'black', td: 0.9 },
  { at: T_HOUSE, draw: shotHouse, tr: 'dissolve', td: 0.7 },
  { at: T_ROOM, draw: shotRoom },
  { at: T_MODEM, draw: shotModem },
  { at: T_FACE, draw: shotFace },
  { at: T_PHOTO, draw: shotPhoto, tr: 'dissolve', td: 0.5 },
  { at: T_HALL, draw: shotHall },
  { at: T_LOST, draw: shotLost },
  { at: T_SLATE, draw: shotSlate, tr: 'dip', td: 0.6 },
];

// A soft 90s ballad on chip voices (75 bpm, D major). The handshake is the
// serenade: an answer tone, the two-note "bong", a hiss of noise sweeps and a
// flutter of data, then the ballad swells; everything stops for NO CARRIER.
const LEAD = { wave: 'pulse25', a: 0.03, d: 0.5, s: 0.55, r: 0.35, vib: [12, 5, 0.25] };
const KEYS = { wave: 'tri', a: 0.004, d: 1.2, s: 0, r: 0.6, vib: false };
const PAD = { wave: 'sine', a: 0.5, d: 1, s: 0.8, r: 1.0, vib: [5, 4, 0.4] };

export default {
  id: 'screechnet',
  brand: 'SCREECHNET',
  duration: DURATION,
  voice: { gender: 'male', lang: 'en-GB', pitch: 0.9, rate: 0.95 },
  script: [
    { at: 0.5, text: 'Nineteen ninety-seven.' },
    { at: 2.8, text: 'Somewhere in the suburbs, a young man waits for the only voice that ever understood him.' },
    { at: 12.3, text: 'Some call it noise. He calls it connection.' },
    { at: 15.8, text: 'ScreechNet. Fifty-six kilobits of pure feeling.' },
    { at: 20.8, text: 'ScreechNet. Some connections are worth the wait.' },
  ],
  tune: {
    bpm: 75,
    room: 0.45,
    echo: { beats: 0.75, feedback: 0.25 },
    fadeOut: 1.2,
    tracks: [
      {
        kind: 'lead',
        inst: LEAD,
        gain: 0.85,
        notes: 'R:1 A4:1@0.45 F#4:0.5@0.4 E4:0.5@0.4 D4:1@0.45 R:0.5 B4:1@0.45 A4:0.5@0.4 F#4:1@0.4 D4:1@0.4 R:0.5 E4:0.5@0.4 F#4:0.5@0.4 G4:0.5@0.45 A4:1.5@0.5 R:0.5 A6:1@0.35 F#5:0.5@0.6 D5:0.5@0.55 D6:0.125@0.3 A5:0.125@0.3 F#5:0.125@0.3 A5:0.125@0.3 D6:0.125@0.3 A5:0.125@0.3 F#5:0.125@0.3 A5:0.125@0.3 F#5:1.5@0.7 E5:0.5@0.6 D5:1@0.65 A4:1@0.55 G4:0.5@0.55 B4:0.5@0.55 D5:1@0.6 C#5:0.5@0.55 E5:0.5@0.6 A4:1@0.55 F#5:1.5@0.6 R:1 R:0.5 A4:0.5@0.45 F#5:1@0.55 E5:0.5@0.5 D5:3@0.5',
      },
      {
        kind: 'harmony',
        inst: KEYS,
        gain: 0.7,
        notes: 'D3:0.5@0.5 A3:0.5@0.4 C#4:0.5@0.4 F#4:0.5@0.4 D3:0.5@0.45 A3:0.5@0.4 C#4:0.5@0.4 F#4:0.5@0.4 B2:0.5@0.45 F#3:0.5@0.4 A3:0.5@0.4 D4:0.5@0.4 G2:0.5@0.45 D3:0.5@0.4 F#3:0.5@0.4 B3:0.5@0.4 E3:0.5@0.45 B3:0.5@0.4 D4:0.5@0.4 G4:0.5@0.4 A2:0.5@0.45 E3:0.5@0.4 G3:0.5@0.4 D4:0.5@0.4 A2+E3+A3:3@0.35 D3:0.5@0.5 A3:0.5@0.45 D4:0.5@0.45 F#4:0.5@0.45 F#2:0.5@0.5 C#3:0.5@0.45 F#3:0.5@0.45 A3:0.5@0.45 G2:0.5@0.5 D3:0.5@0.45 G3:0.5@0.45 B3:0.5@0.45 A2:0.5@0.5 E3:0.5@0.45 A3:0.5@0.45 C#4:0.5@0.45 B2:0.5@0.45 F#3:0.5@0.4 D4:0.5@0.4 R:1 G2:0.5@0.45 D3:0.5@0.4 F#3:0.5@0.4 B3:0.5@0.4 D3:0.5@0.45 A3:0.5@0.4 F#4:0.5@0.4 D4:2@0.45',
      },
      {
        kind: 'harmony',
        inst: PAD,
        gain: 0.4,
        notes: 'D3+F#3+A3+C#4:4@0.4 B2+D3+F#3+A3:2@0.4 G2+B2+D3+F#3:2@0.4 E3+G3+B3+D4:2@0.4 A2+D3+E3+G3:2@0.4 A2+E3+A3:3@0.45 D3+F#3+A3:2@0.55 F#2+A2+C#3:2@0.55 G2+B2+D3:2@0.55 A2+C#3+E3:2@0.55 B2+D3+F#3:1.5@0.5 R:1 G2+B2+D3+F#3:2@0.45 D3+F#3+A3:3.5@0.45',
      },
      { kind: 'bass', inst: 'tri', gain: 0.6, notes: 'D2:4 B1:2 G1:2 E2:2 A1:2 A1:3 D2:2 F#1:2 G1:2 A1:2 B1:1.5 R:1 G1:2 D2:3.5' },
      { drums: 'R:12 W:1@0.3 W:1@0.4 X:0.25@0.25 X:0.25@0.25 X:0.25@0.25 X:0.25@0.25 K:1@0.3 H:1@0.18 K:1@0.3 H:1@0.18 K:1@0.3 H:1@0.18 K:1@0.3 H:1@0.18 R:1.5 R:1 R:5.5' },
    ],
  },
  draw(ctx, t, dt, info) {
    film(ctx, dt, info, SHOTS);
  },
};
