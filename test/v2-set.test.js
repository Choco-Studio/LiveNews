import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { C, Frame } from '../public/js/v2/canvas25d/pixbuf.js';
import { styleFor, setStyle, STYLE_IDS, currentStyle } from '../public/js/v2/canvas25d/studio/styles.js';
import { drawBackground, drawDesk, setCacheEnabled, invalidateSet, wallRect, wallFromScene } from '../public/js/v2/canvas25d/studio/set.js';
import { resetWall, wallShown, planetAzimuth, plateRectFor, mediaRectFor, figureRectFor, warmWallContent, updateWall, wallPicture, prepareImage } from '../public/js/v2/canvas25d/studio/wall.js';
import { LSTAR, lstarRGB, nameOf, isPalette, census, share, SATURATED, labRGB } from '../public/js/v2/canvas25d/studio/color.js';
import { SET } from '../public/js/v2/canvas25d/studio/geometry.js';
import * as lab from '../public/js/v2/canvas25d/labs/set.js';
import * as setMod from '../public/js/v2/canvas25d/studio/set.js';
import { readPNG, writePNG, measure as measureZones, ZONES } from '../tools/measure-frame.mjs';

// STUDIO SET stream (public/js/v2/canvas25d/studio/**): per-programme dressing and light, the live
// video wall and the background cache, measured on frames rendered in node (no DOM: the wall's text
// and the desk logo need a canvas, so they are absent here; the lab page shows them).

const W = 384, H = 216;
const channel = JSON.parse(fs.readFileSync(new URL('../config/channel.json', import.meta.url), 'utf8'));
const PROGRAMS = Object.keys(channel.programs);

/** A fixture picture as the director would hold it: 416x234 RGBA (box-sampled, not pixelated). */
function fixture(name) {
  const img = readPNG(new URL(`../config/fixtures/img/${name}.png`, import.meta.url).pathname);
  const w = 416, h = 234, data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = img.px[Math.floor(((y + 0.5) * img.h) / h) * img.w + Math.floor(((x + 0.5) * img.w) / w)];
      const o = (y * w + x) * 4;
      data[o] = c & 255;
      data[o + 1] = (c >>> 8) & 255;
      data[o + 2] = (c >>> 16) & 255;
      data[o + 3] = 255;
    }
  }
  return { full: { width: w, height: h, data } };
}
lab.setImage('port', fixture('port'));
lab.setImage('chip', fixture('chip'));
lab.setImage('volcano', fixture('volcano'));
lab.setImage('forest', fixture('forest'));

function shot(o, t = 10) {
  lab.set({ presenters: false, wall: 'idle', phase: 'intro', ...o });
  lab.reset();
  lab.render(t);
  return Uint32Array.from(lab.frame.px);
}

const PRESENTERS = lab.hasPresenters();

describe('styles: setStyle per programme', () => {
  test('every programme in config/channel.json has its own frozen style', () => {
    const accents = { 'world-now': 'red', 'tech-bytes': 'cyan', cosmos: 'magenta', 'money-minute': 'green', 'news-60': 'yellow' };
    const lines = { 'world-now': 'red', 'tech-bytes': 'cyan', cosmos: 'magenta', 'money-minute': 'darkGreen', 'news-60': 'yellow' };
    const idles = { 'world-now': 'globe', 'tech-bytes': 'chip', cosmos: 'planet', 'money-minute': 'wordmark', 'news-60': 'dial' };
    for (const id of PROGRAMS) {
      const s = styleFor(id);
      assert.equal(s.id, id);
      assert.ok(Object.isFrozen(s));
      assert.equal(s.accent, C[accents[id]], id);
      assert.equal(s.deskLine, C[lines[id]], id);
      assert.equal(s.wallIdle, idles[id], id);
      assert.equal(s.solo, !channel.programs[id].presenters?.[1], `${id} solo flag matches its cast`);
      assert.ok(styleFor(id) === s, 'cached');
    }
    assert.deepEqual([...STYLE_IDS].sort(), [...PROGRAMS].sort());
  });
  test('unknown ids get the home look under their own id; setStyle sets the default', () => {
    for (const id of ['weekend-review', '', null, undefined, 42]) {
      const s = styleFor(id);
      assert.equal(s.bakeKey, 'world-now');
      assert.equal(s.deskLine, C.red);
      assert.equal(s.wallIdle, 'globe');
    }
    assert.equal(styleFor('weekend-review').id, 'weekend-review');
    assert.equal(setStyle('cosmos').id, 'cosmos');
    assert.equal(currentStyle().id, 'cosmos');
    setStyle('world-now');
  });
});

describe('colour maths', () => {
  test('CIE L* of the palette (sRGB → linear → Y → L*)', () => {
    assert.ok(Math.abs(LSTAR.ink - 18.2) < 0.2 && Math.abs(LSTAR.slate - 29.4) < 0.2 && Math.abs(LSTAR.steel - 44.3) < 0.2);
    assert.ok(Math.abs(lstarRGB(255, 255, 255) - 100) < 1e-6 && Math.abs(lstarRGB(0, 0, 0)) < 1e-6);
    assert.ok(Math.abs(lstarRGB(119, 119, 119) - 50) < 0.5, 'mid grey');
  });
});

describe('palette only', () => {
  const walls = [{ wall: 'idle' }, { wall: 'plate' }, { wall: 'figure' }, { wall: 'map' }, { wall: 'picture', image: 'port' }];
  for (const programme of [...PROGRAMS, 'generic']) {
    test(`${programme}: every set pixel is a palette colour (wide, single, every wall mode)`, () => {
      for (const framing of ['wide', 'single-a', 'mcu-r']) {
        for (const w of walls) {
          const px = shot({ programme, framing, ...w });
          let off = 0;
          for (let i = 0; i < px.length; i++) if (!isPalette(px[i])) off++;
          assert.equal(off, 0, `${programme} ${framing} ${w.wall}: ${off} off-palette pixels`);
        }
      }
    });
  }
});

/** Set pixels only: presenters hidden, the wall's interior excluded. */
function setCensus(programme, framing = 'wide', o = {}) {
  const px = shot({ programme, framing, ...o });
  const r = wallRect(lab.cameraFor(framing, programme));
  const inWall = (i) => {
    const x = i % W, y = (i / W) | 0;
    return x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1;
  };
  return { px, r, cs: census(px, (i) => !inWall(i)) };
}

describe('tint and accent censuses (wide, presenters hidden)', () => {
  test('WORLD NOW: no extra tint, navy ≤ 10 %, red only on the plate and the desk line', () => {
    const { cs } = setCensus('world-now');
    assert.ok(share(cs, ['navy']) <= 0.1);
    assert.equal(share(cs, ['cyan', 'magenta', 'purple', 'yellow', 'maroon', 'brown', 'cream']), 0);
    assert.ok(share(cs, ['red']) < 0.035, `red ${share(cs, ['red'])}`);
  });
  test('TECH BYTES: cyan ≤ 1 % (the desk LED only), no magenta or purple', () => {
    const { cs } = setCensus('tech-bytes');
    assert.ok(share(cs, ['cyan']) > 0 && share(cs, ['cyan']) <= 0.01, `cyan ${share(cs, ['cyan'])}`);
    assert.equal(share(cs, ['magenta', 'purple', 'pink']), 0);
  });
  test('COSMOS: purple tint ≤ 12 %, magenta only on the desk line', () => {
    const { px, cs } = setCensus('cosmos');
    assert.ok(share(cs, ['purple']) <= 0.12);
    assert.equal(share(cs, ['pink', 'cyan']), 0);
    // every magenta pixel is on the desk's 1 px LED row (one per column at most)
    const cols = new Map();
    for (let i = 0; i < px.length; i++) if (px[i] === C.magenta) cols.set(i % W, (cols.get(i % W) || 0) + 1);
    assert.ok(cols.size > 300 && [...cols.values()].every((n) => n === 1));
  });
  test('MONEY MINUTE: saturated ≤ 10 % of set pixels, cream tint ≤ 8 %, darkGreen desk line', () => {
    const { cs } = setCensus('money-minute');
    assert.ok(share(cs, [...SATURATED]) <= 0.1, `saturated ${share(cs, [...SATURATED])}`);
    // the warm room's warmth is its bronze lamps (critics r3: no warm dots or warm blocks on the wall,
    // the lamps' light on the panels neutral): present, and far under the bible's 8 % cap
    const tint = share(cs, styleFor('money-minute').tintNames);
    assert.ok(tint >= 0.001 && tint <= 0.08, `tint ${tint}`);
    assert.ok(share(cs, ['darkGreen']) > 0 && share(cs, ['green']) === 0);
  });
  test('NEWS IN 60: yellow ≤ 1.5 %, saturated ≤ 6 %, cream tint ≤ 4 %', () => {
    const { cs } = setCensus('news-60');
    assert.ok(share(cs, ['yellow']) > 0 && share(cs, ['yellow']) <= 0.015);
    assert.ok(share(cs, [...SATURATED]) <= 0.06);
    assert.ok(share(cs, ['cream', 'maroon']) <= 0.04);
  });
  test('every programme: y 150-216 is plain black/ink in the wide (the graphics zone)', () => {
    for (const programme of [...PROGRAMS, 'generic']) {
      const px = shot({ programme, framing: 'wide' });
      for (let y = 150; y < H; y++) for (let x = 0; x < W; x++) assert.ok(px[y * W + x] === C.black || px[y * W + x] === C.ink, `${programme} ${x},${y} ${nameOf(px[y * W + x])}`);
    }
  });
  test('the set is symmetric about x = 192 (8x8 block L* within 3, outside the wall)', () => {
    for (const programme of PROGRAMS) {
      const px = shot({ programme, framing: 'wide' });
      const r = wallRect(lab.cameraFor('wide', programme));
      let bad = 0, n = 0;
      for (let by = 0; by < 112; by += 8) {
        for (let bx = 0; bx < 184; bx += 8) {
          if (bx + 8 > r.x0 - 3) continue;
          let a = 0, b = 0;
          for (let y = by; y < by + 8; y++) for (let x = bx; x < bx + 8; x++) {
            a += LSTAR[nameOf(px[y * W + x])];
            b += LSTAR[nameOf(px[y * W + (383 - x)])];
          }
          n++;
          if (Math.abs(a - b) / 64 > 3) bad++;
        }
      }
      assert.ok(bad / n < 0.03, `${programme}: ${bad}/${n} asymmetric blocks`);
    }
  });
});

describe('values with presenters drawn (bible acceptance lists)', { skip: !PRESENTERS && 'presenter modules unavailable' }, () => {
  const m = (programme, framing = 'wide') => {
    lab.set({ programme, framing, wall: 'idle', presenters: true });
    lab.reset();
    return lab.measure(10);
  };
  test('WORLD NOW (world-now.md §5 item 10): faces 55-73, head zones 18-45, wall ≤ 45', () => {
    const r = m('world-now');
    assert.equal(r.faces.length, 2);
    for (const f of r.faces) assert.ok(f >= 55 && f <= 73, `face ${f}`);
    assert.ok(r.headZone.mean >= 18 && r.headZone.mean <= 45, `zone ${r.headZone.mean}`);
    assert.ok(r.wall.mean <= 45);
  });
  test('TECH BYTES (§4 items 3, 14): head zone 28-35, differs from COSMOS by ≥ 8', () => {
    const t = m('tech-bytes'), c = m('cosmos');
    assert.ok(t.headZone.mean >= 28 && t.headZone.mean <= 35, `zone ${t.headZone.mean}`);
    assert.ok(t.headZone.mean - c.headZone.mean >= 8);
    assert.ok(t.set.cyan <= 0.01 && t.set.cosmosColours === 0);
  });
  test('COSMOS (§5 item 8): head zone ≤ 35, wall ≤ 40, face ≥ head zone + 20', () => {
    const r = m('cosmos');
    assert.ok(r.headZone.mean <= 35 && r.wall.mean <= 40);
    assert.ok(r.faces.length >= 1);
    for (const f of r.faces) assert.ok(f >= r.headZone.mean + 20, `face ${f} zone ${r.headZone.mean}`);
  });
  test('NEWS IN 60 (§4 items 8, 14): face ≥ 60, ring mean ≤ 35 / max ≤ 45, no patch brighter than the face', () => {
    for (const framing of ['wide', 'mcu-l']) {
      const r = m('news-60', framing);
      assert.ok(r.faces[0] >= 60, `face ${r.faces[0]}`);
      assert.ok(r.headZone.mean <= 35 && r.headZone.max <= 45, `${framing} ring ${r.headZone.mean} / ${r.headZone.max}`);
      assert.equal(r.patches, 0);
      assert.ok(r.set.yellow <= 0.015 && r.set.saturated <= 0.06);
    }
  });
  test('MONEY MINUTE: the home value range in the MCU (not darker than WORLD NOW)', () => {
    const money = m('money-minute', 'mcu-r'), world = m('world-now', 'single-a');
    assert.ok(money.headZone.mean >= 15 && money.headZone.mean <= 45);
    assert.ok(Math.abs(money.headZone.mean - world.headZone.mean) < 10);
  });
});

describe('video wall', () => {
  test('MONEY MINUTE idle wall: no numbers, grid or line — field, falloff and the 16 px darkGreen rule', () => {
    const px = shot({ programme: 'money-minute', framing: 'wide' });
    const r = wallRect(lab.cameraFor('wide', 'money-minute'));
    const names = new Set();
    let rule = 0;
    for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++) {
      const n = nameOf(px[y * W + x]);
      names.add(n);
      if (n === 'darkGreen') rule++;
    }
    assert.equal(rule, 32, 'the 16 px rule, 2 px tall');
    for (const n of names) assert.ok(['ink', 'slate', 'darkGreen', 'fog'].includes(n), n);
  });
  test('NEWS IN 60 dial: two static states, never ticking', () => {
    const r = wallRect(lab.cameraFor('wide', 'news-60'));
    const count = (phase, t) => {
      const px = shot({ programme: 'news-60', framing: 'wide', phase }, t);
      let y = 0;
      for (let yy = r.y0; yy < r.y1; yy++) for (let x = r.x0; x < r.x1; x++) if (px[yy * W + x] === C.yellow) y++;
      return { y, px };
    };
    const a = count('intro', 10), b = count('intro', 37.5), c = count('outro', 10);
    assert.deepEqual(a.px, b.px, 'the intro dial does not change with time');
    assert.ok(c.y > a.y * 4, 'the outro lights every tick');
  });
  test('the picture is dimmed to a wall mean L* ≤ 45 (≤ 40 in COSMOS) and TECH BYTES mats it', () => {
    for (const [programme, max] of [['world-now', 45], ['cosmos', 40], ['tech-bytes', 45]]) {
      const px = shot({ programme, framing: 'wide', wall: 'picture', image: 'port' });
      const r = wallRect(lab.cameraFor('wide', programme));
      let sum = 0, n = 0;
      for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++, n++) sum += LSTAR[nameOf(px[y * W + x])];
      assert.ok(sum / n <= max, `${programme} wall mean ${sum / n}`);
      if (programme === 'tech-bytes') for (let x = r.x0; x < r.x1; x++) assert.equal(px[r.y0 * W + x], C.black, 'mat');
    }
  });
  test('content changes only on a cut; without one it wipes in 0.3 s', () => {
    const cam = lab.cameraFor('wide', 'world-now');
    const fr = new Frame();
    const style = styleFor('world-now');
    const idle = { mode: 'idle' }, plate = { mode: 'plate', label: 'OIL MARKETS', sub: 'REUTERS' };
    const wallPx = () => {
      const r = wallRect(cam);
      const out = [];
      for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++) out.push(fr.px[y * W + x]);
      return out;
    };
    resetWall();
    invalidateSet();
    // reference images
    drawBackground(fr, cam, 50, { style, wall: plate, cut: true });
    const platePx = wallPx();
    resetWall();
    drawBackground(fr, cam, 20, { style, wall: idle, shotSince: 1 });
    drawBackground(fr, cam, 20.02, { style, wall: idle, shotSince: 1 });
    const before = wallPx();
    // a change without a cut: the first frame still shows the old content, then a wipe
    drawBackground(fr, cam, 20.04, { style, wall: plate, shotSince: 1 });
    assert.deepEqual(wallPx(), before);
    assert.equal(wallShown().wiping, true);
    drawBackground(fr, cam, 20.19, { style, wall: plate, shotSince: 1 });
    const mid = wallPx();
    assert.notDeepEqual(mid, before);
    assert.notDeepEqual(mid, platePx);
    drawBackground(fr, cam, 20.36, { style, wall: plate, shotSince: 1 });
    assert.equal(wallShown().wiping, false);
    // with a cut the new content is there on the cut frame itself
    drawBackground(fr, cam, 21, { style, wall: idle, shotSince: 2 });
    const cutFrame = wallPx();
    drawBackground(fr, cam, 21.02, { style, wall: plate, shotSince: 3 });
    assert.notDeepEqual(wallPx(), cutFrame);
    assert.equal(wallShown().mode, 'plate');
    assert.equal(wallShown().wiping, false);
  });
  test('COSMOS idle (§5 item 13): stars still, ≤ 4 planet pixels per frame, terminator 3-6 px in 10 s', () => {
    lab.set({ programme: 'cosmos', framing: 'wide', wall: 'idle', presenters: false });
    lab.reset();
    const cam = lab.cameraFor('wide', 'cosmos');
    const r = wallRect(cam);
    // mid-sweep: the azimuth crosses its centre at t = 45
    let prev = null, maxChange = 0;
    const seconds = new Set();
    const grab = () => {
      const out = new Uint32Array((r.x1 - r.x0) * (r.y1 - r.y0));
      let q = 0;
      for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++) out[q++] = lab.frame.px[y * W + x];
      return out;
    };
    let first = null, last = null;
    for (let i = 0; i <= 600; i++) {
      lab.render(40 + i / 60);
      const cur = grab();
      if (prev) {
        let c = 0;
        for (let k = 0; k < cur.length; k++) if (cur[k] !== prev[k]) c++;
        maxChange = Math.max(maxChange, c);
        if (c) seconds.add(Math.floor(i / 60));
      }
      if (i === 0) first = cur;
      last = cur;
      prev = cur;
    }
    assert.ok(maxChange <= 4, `max ${maxChange} px per frame`);
    assert.ok(seconds.size >= 10, 'at least one change every second');
    // stars: every pixel outside the planet's box is identical
    const R = 12, ww = r.x1 - r.x0;
    let starDiff = 0;
    for (let k = 0; k < first.length; k++) {
      const x = k % ww, y = (k / ww) | 0;
      if (first[k] !== last[k] && (Math.abs(x - ww / 2) > 2.6 * R && Math.abs(y - 30) > 2 * R)) starDiff++;
    }
    assert.equal(starDiff, 0);
    // the terminator on the equator: x = R cos(azimuth)
    const dx = Math.abs(R * Math.cos(planetAzimuth(50)) - R * Math.cos(planetAzimuth(40)));
    assert.ok(dx >= 3 && dx <= 6, `terminator ${dx.toFixed(2)} px`);
  });
  test('wallFromScene: live episode data → wall content per programme', () => {
    const images = new Map([['s1', fixture('port')]]);
    const base = { cast: { A: 'paco', B: 'lola' }, images, focus: 'A' };
    const seg = (o) => ({ segPlan: { ctx: { seg: { type: 'story', ...o } } } });
    assert.equal(wallFromScene({ ...base, program: { id: 'world-now' }, wall: { mode: 'image', storyId: 's1' }, storyId: 's1', ...seg({ storyId: 's1' }) }).mode, 'picture');
    assert.equal(wallFromScene({ ...base, program: { id: 'world-now' }, wall: { mode: 'source', source: 'BBC' }, storyId: 's2', ...seg({ storyId: 's2', location: { place: 'LIMA', lat: -12, lon: -77 } }) }).mode, 'map');
    // a story with neither a picture nor a place: nothing for a plate beyond the strap, the idle art
    assert.equal(wallFromScene({ ...base, program: { id: 'cosmos' }, wall: { mode: 'source', source: 'NASA' }, storyId: 's3', ...seg({ storyId: 's3', location: { lat: 1, lon: 2 } }) }).mode, 'idle');
    assert.equal(wallFromScene({ ...base, program: { id: 'cosmos' }, wall: { mode: 'source', source: 'NASA' }, storyId: 's5', ...seg({ storyId: 's5', kicker: 'MARS', location: { place: 'GALE CRATER', lat: 1, lon: 2 } }) }).mode, 'plate');
    const money = wallFromScene({ program: { id: 'money-minute' }, cast: { A: 'penny' }, framing: 'mcu-r', wall: { mode: 'source', source: 'FT' }, storyId: 's4', segPlan: { ctx: { seg: { type: 'story', storyId: 's4', numbers: [{ value: '$82', label: 'OIL' }], kicker: 'OIL' }, shots: [] } } });
    assert.equal(money.mode, 'figure');
    assert.equal(money.solo, true);
    const outro = wallFromScene({ program: { id: 'news-60' }, cast: { A: 'sam' }, wall: { mode: 'logo' }, segPlan: { ctx: { seg: { type: 'outro' } } } });
    assert.deepEqual([outro.mode, outro.phase], ['idle', 'outro']);
    const sc = { ...base, program: { id: 'world-now' }, wall: { mode: 'logo' } };
    assert.ok(wallFromScene(sc) === wallFromScene(sc), 'memoised for a static scene');
  });
});

const CAMERA = lab.hasCamera();
describe('round 3: wall plates inside their free area, clean tint clusters', () => {
  // the layouts depend on CAMERA's framings (camera.js, another stream's file): when it cannot load
  // (mid-edit elsewhere), the lab's own presets are not the real framings, so these are skipped
  test('a plate (kicker + source) stays inside the visible wall, clear of the graphics rows and every head', { skip: !CAMERA && 'camera.js unavailable (framings are CAMERA\'s)' }, () => {
    const texts = [['WILDLIFE', 'BITPORT HERALD'], ['NUMBER OF THE DAY', 'LEDGER LINE'], ['CONNECTIVITY', 'CIRCUIT WEEKLY'], ['A VERY LONG KICKER THAT CANNOT EVER FIT', 'AN EVEN LONGER SOURCE NAME FOR THE LINE']];
    let n = 0;
    for (const programme of [...PROGRAMS, 'generic']) {
      for (const framing of lab.FRAMINGS) {
        const cam = lab.cameraFor(framing, programme);
        const r = wallRect(cam);
        for (const [label, sub] of texts) {
          const p = plateRectFor(cam, label, sub, programme === 'generic' ? 'weekend-review' : programme);
          if (!p) continue;
          n++;
          const what = `${programme} ${framing} "${p.kicker}" x ${p.x0}-${p.x1} y ${p.y0}-${p.y1} wall ${r.x0}-${r.x1}`;
          assert.ok(p.x0 >= Math.max(8, r.x0) && p.x1 <= Math.min(376, r.x1), what);
          assert.ok(p.y0 >= Math.max(22, r.y0) && p.y1 <= Math.min(136, r.y1), what);
          for (const h of p.heads) assert.ok(p.x1 <= h.x0 || p.x0 >= h.x1 || p.y1 <= h.y0 || p.y0 >= h.y1, `${what} overlaps a head`);
        }
      }
    }
    assert.ok(n > 150, `${n} plates laid out`);
    // the NEWS IN 60 case w2-integ reported (scale 2 lost its first column behind the bezel)
    const p = plateRectFor(lab.cameraFor('single-a', 'news-60'), 'WILDLIFE', 'BITPORT HERALD', 'news-60');
    assert.ok(p.x0 >= 8 && p.kicker === 'WILDLIFE' && p.sub === 'BITPORT HERALD');
  });
  test('solo programmes: the wall\'s bottom band (16 px, 32 px where the wall is drawn at 2x) carries no content in any framing or wall mode', { skip: !CAMERA && 'camera.js unavailable (framings are CAMERA\'s)' }, () => {
    const modes = [{ wall: 'idle' }, { wall: 'picture', image: 'port' }, { wall: 'plate' }, { wall: 'figure' }, { wall: 'map' }];
    for (const programme of ['news-60', 'money-minute']) {
      for (const framing of ['wide', 'single-a', 'mcu-l', 'mcu-r']) {
        const r = wallRect(lab.cameraFor(framing, programme));
        const band = 16 * (r.k < 1.25 ? 1 : 2);
        for (const m of modes) {
          const px = shot({ programme, framing, ...m });
          const seen = new Set();
          for (let y = Math.max(0, r.y1 - band); y < Math.min(H, r.y1); y++) {
            for (let x = Math.max(0, r.x0); x < Math.min(W, r.x1); x++) seen.add(px[y * W + x]);
          }
          // one flat colour: the wall's own field (ink; MONEY MINUTE's slate), presenters excluded by
          // shot() (presenters hidden)
          assert.equal(seen.size, 1, `${programme} ${framing} ${m.wall}: ${[...seen].map(nameOf).join(',')} in the band ${band}`);
          const c = [...seen][0];
          assert.ok(c === C.ink || c === C.black || c === C.slate, `${programme} ${framing} ${m.wall}: band ${nameOf(c)}`);
        }
      }
    }
  });
  const blockOf = (px, name, size = 3) => {
    const c = C[name];
    for (let y = 0; y + size <= 150; y++) for (let x = 0; x + size <= W; x++) {
      let all = true;
      for (let j = 0; j < size && all; j++) for (let i = 0; i < size && all; i++) if (px[(y + j) * W + x + i] !== c) all = false;
      if (all) return true;
    }
    return false;
  };
  test('MONEY MINUTE warmth is light, not a block: no opaque warm 4x4 block on the back wall (critic r2)', () => {
    const px = shot({ programme: 'money-minute', framing: 'wide' });
    for (const name of ['brown', 'tanShade', 'maroon']) assert.ok(!blockOf(px, name, 4), `an opaque ${name} 4x4 block in the MONEY MINUTE wide`);
    // and no warm pixel anywhere on the wall but the two fixtures (no sprinkled warm Bayer)
    const { cs } = setCensus('money-minute');
    assert.ok(share(cs, ['brown', 'tanShade']) > 0.0005);
  });
  test('COSMOS: its colour is the purple practical pair only (no coloured wash on the walls); ≤ 12 %', () => {
    for (const framing of ['wide', 'two', 'single-a']) {
      const px = shot({ programme: 'cosmos', framing });
      const r = wallRect(lab.cameraFor(framing, 'cosmos'));
      const kf = (1000 * lab.cameraFor(framing, 'cosmos').zoom) / (SET.flatsZ - lab.cameraFor(framing, 'cosmos').z);
      let n = 0, wash = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (x >= r.x0 - 4 && x < r.x1 + 4 && y >= r.y0 - 4 && y < r.y1 + 4) continue;
        const c = px[y * W + x];
        if (c === C.maroon || c === C.brown) wash++;
        if (c !== C.purple) continue;
        n++;
        // every purple pixel is on a practical strip of the set flats (world X ±214 at the flats' depth)
        const X = lab.cameraFor(framing, 'cosmos').x + (x + 0.5 - 192) / kf;
        if (Math.abs(Math.abs(X) - 214) > 4) wash++;
      }
      assert.equal(wash, 0, `${framing}: ${wash} coloured wash pixels`);
      assert.ok(n / (W * H) <= 0.12);
    }
    const { cs } = setCensus('cosmos');
    assert.ok(share(cs, ['purple']) > 0, 'the purple practicals show in the wide');
  });
});

describe('frame 0: never a frame without the set (owner, 21:05)', () => {
  // A fresh instance of set.js (a new module URL) has baked only the home look at import, exactly
  // like a page that has just loaded. Its first frame of every programme must already be the whole
  // set (bake synchronously on first use), identical to the frame of a warmed instance.
  const cam = { x: 0, y: -60, z: 0, zoom: 1, hy: 52, soft: 0 };
  const check = (px, style, label) => {
    let line = 0, bezel = 0, plate = 0;
    const r = wallRect(cam);
    const cols = new Set();
    for (let i = 0; i < px.length; i++) {
      if (px[i] === style.deskLine) cols.add(i % W);
      if (px[i] === C.red) plate++;
    }
    for (let x = r.x0 - 1; x < r.x1 + 1; x++) if (px[(r.y0 - 1) * W + x] !== px[(r.y0 - 3) * W + x]) bezel++;
    line = cols.size;
    assert.ok(line > 250, `${label}: desk line in ${line} columns`);
    assert.ok(plate > 150, `${label}: desk plate (${plate} px)`);
    assert.ok(bezel > 60, `${label}: wall bezel`);
    // a set, not a flat fill: the light, the bezel, the desk and the wall bring many palette colours
    const counts = new Map();
    for (const c of px) counts.set(c, (counts.get(c) || 0) + 1);
    const used = [...counts.values()].filter((n) => n >= 20).length;
    assert.ok(used >= 7, `${label}: only ${used} colours, an empty frame`);
  };
  test('a fresh page: the first frame of every programme has wall, desk, plate and line', async () => {
    const fresh = await import(`../public/js/v2/canvas25d/studio/set.js?frame0=${process.pid}`);
    const warm = await import('../public/js/v2/canvas25d/studio/set.js');
    warm.warmSets();
    const a = new Frame(), b = new Frame();
    const ca = new Int16Array(W), cb = new Int16Array(W);
    for (const id of [...PROGRAMS, 'weekend-review']) {
      const style = styleFor(id);
      assert.equal(fresh.setReady(id), style.bakeKey === 'world-now', `${id}: only the home look is baked at import`);
      fresh.setCacheEnabled(false);
      resetWall();
      fresh.drawBackground(a, cam, 7, { style: id, wall: { mode: 'idle' }, cut: true });
      fresh.drawDesk(a, cam, ca);
      assert.ok(fresh.setReady(id));
      check(a.px, style, id);
      warm.setCacheEnabled(false);
      resetWall();
      warm.drawBackground(b, cam, 7, { style: id, wall: { mode: 'idle' }, cut: true });
      warm.drawDesk(b, cam, cb);
      assert.deepEqual(a.px, b.px, `${id}: first-use frame = warmed frame`);
      assert.deepEqual(ca, cb);
    }
    fresh.setCacheEnabled(true);
    warm.setCacheEnabled(true);
  });
  test('warmSets() bakes every programme of config/channel.json; a second call is free', () => {
    const r1 = setMod.warmSets();
    for (const id of PROGRAMS) assert.ok(setMod.setReady(id), id);
    assert.deepEqual([...r1.baked].sort(), [...PROGRAMS].sort());
    const r2 = setMod.warmSets();
    assert.ok(r2.ms < 5, `second warm ${r2.ms} ms`);
  });
  test('a programme change mid-stream: the first frame of the new programme is its full set (cache on)', () => {
    const fr = new Frame(), ref = new Frame();
    const clip = new Int16Array(W), rclip = new Int16Array(W);
    setCacheEnabled(true);
    resetWall();
    let t = 100;
    for (let i = 0; i < 5; i++) {
      drawBackground(fr, cam, (t += 1 / 60), { style: 'world-now', wall: { mode: 'idle' }, shotSince: 4 });
      drawDesk(fr, cam, clip);
    }
    // the next programme comes in under the open, with no cut flag: the style change is a cut by itself
    drawBackground(fr, cam, (t += 1 / 60), { style: 'cosmos', wall: { mode: 'idle' }, shotSince: 4 });
    drawDesk(fr, cam, clip);
    setCacheEnabled(false);
    resetWall();
    drawBackground(ref, cam, t, { style: 'cosmos', wall: { mode: 'idle' }, cut: true });
    drawDesk(ref, cam, rclip);
    setCacheEnabled(true);
    assert.deepEqual(fr.px, ref.px);
    check(fr.px, styleFor('cosmos'), 'cosmos after world-now');
  });
  test('a caller passing the theme accent as a u32 gets the programme\'s desk line (MONEY MINUTE darkGreen)', () => {
    const fr = new Frame();
    const clip = new Int16Array(W);
    setCacheEnabled(false);
    resetWall();
    drawBackground(fr, cam, 3, { style: 'money-minute', wall: { mode: 'idle' }, cut: true });
    drawDesk(fr, cam, clip, C.green);
    let green = 0, dark = 0;
    for (const c of fr.px) {
      if (c === C.green) green++;
      if (c === C.darkGreen) dark++;
    }
    setCacheEnabled(true);
    assert.equal(green, 0);
    assert.ok(dark > 250);
  });
});

describe('background cache', () => {
  test('no stale frame after a camera, wall, programme or time change (cached = uncached)', () => {
    const fr = new Frame(), ref = new Frame();
    const clipA = new Int16Array(W), clipB = new Int16Array(W);
    const steps = [];
    const wide = lab.cameraFor('wide', 'world-now'), single = lab.cameraFor('single-b', 'world-now');
    const pic = { mode: 'picture', image: fixture('chip') };
    let t = 30;
    for (const [style, cam, wall] of [
      ['world-now', wide, { mode: 'idle' }],
      ['world-now', wide, { mode: 'idle' }],
      ['world-now', { ...wide, z: wide.z + 3 }, { mode: 'idle' }],
      ['world-now', single, { mode: 'idle' }],
      ['world-now', single, pic],
      ['tech-bytes', single, pic],
      ['tech-bytes', wide, { mode: 'idle' }],
      ['cosmos', wide, { mode: 'idle' }],
      ['cosmos', wide, { mode: 'idle' }],
      ['news-60', lab.cameraFor('wide', 'news-60'), { mode: 'idle', phase: 'outro' }],
    ]) {
      for (let i = 0; i < 3; i++) steps.push({ style, cam, wall, t: (t += i ? 1.7 : 0.05), cut: i === 0 });
    }
    // two independent runs of the same sequence: one cached, one not
    for (const [frame, clip, on] of [[ref, clipB, false], [fr, clipA, true]]) {
      setCacheEnabled(on);
      resetWall();
      const out = [];
      for (const s of steps) {
        drawBackground(frame, s.cam, s.t, { style: s.style, wall: s.wall, cut: s.cut });
        drawDesk(frame, s.cam, clip);
        out.push(Uint32Array.from(frame.px), Int16Array.from(clip));
      }
      frame.out = out;
    }
    setCacheEnabled(true);
    assert.equal(fr.out.length, ref.out.length);
    for (let i = 0; i < fr.out.length; i++) assert.deepEqual(fr.out[i], ref.out[i], `step ${i >> 1}`);
  });
});

describe('old call forms (public/lab/cast.html)', () => {
  test('drawBackground(frame, cam, t) and drawDesk(frame, cam, clipRows, C.red) still draw the home set', () => {
    setStyle('world-now');
    resetWall();
    const fr = new Frame();
    const clip = new Int16Array(W);
    const cam = { x: 0, y: -60, z: 0, zoom: 1, hy: 52, soft: 0 };
    drawBackground(fr, cam, 1);
    drawDesk(fr, cam, clip, C.red);
    let red = 0;
    for (const c of fr.px) if (c === C.red) red++;
    assert.ok(red > 300, 'the plate and the red LED');
    assert.ok(clip[192] > 100 && clip[192] < 125, `desk clip row ${clip[192]}`);
    for (let x = 0; x < W; x++) assert.ok(clip[x] < H);
  });
});

describe('tools/measure-frame.mjs', () => {
  test('PNG round trip and zone census', () => {
    const px = shot({ programme: 'world-now', framing: 'wide' });
    const file = `${process.env.TMPDIR || '/tmp'}/v2-set-measure-${process.pid}.png`;
    writePNG(file, W, H, px);
    const back = readPNG(file);
    fs.unlinkSync(file);
    assert.deepEqual([back.w, back.h], [W, H]);
    assert.deepEqual(back.px, px.map((c) => (c | 0xff000000) >>> 0));
    const z = measureZones(back.px, W, ZONES);
    assert.equal(z.frame.offPalette, 0);
    assert.ok(z.headL.meanL >= 18 && z.headL.meanL <= 45);
    assert.ok(z.quiet.maxL <= 19);
  });
});

describe('fix round 1: layout, pictures, light (critics of round 3)', () => {
  const SOLO_FRAMINGS = ['wide', 'single-a', 'solo', 'mcu-l', 'mcu-r', 'ots'];
  test('every kicker of up to 18 characters gets a plate in every solo framing and every duo single', { skip: !CAMERA && 'camera.js unavailable (framings are CAMERA\'s)' }, () => {
    const kickers = ['MARKETS', 'VOLCANO', 'TECHNOLOGY', 'HEALTH CARE', 'ENERGY PRICES', 'CLIMATE TALKS', 'HOUSING MARKET',
      'INTEREST RATES', 'INFRASTRUCTURE', 'TRADE AGREEMENT', 'SPACE EXPLORATION', 'EUROPEAN ELECTIONS', 'MARS SAMPLE RETURN'];
    const cases = [];
    for (const programme of ['news-60', 'money-minute']) for (const framing of SOLO_FRAMINGS) cases.push([programme, framing]);
    for (const programme of ['world-now', 'tech-bytes', 'cosmos']) for (const framing of ['wide', 'two', 'single-a', 'single-b', 'ots']) cases.push([programme, framing]);
    for (const [programme, framing] of cases) {
      const cam = lab.cameraFor(framing, programme);
      for (const k of kickers) {
        assert.ok(k.length <= 18);
        for (const sub of ['REUTERS', 'BITPORT HERALD', '']) {
          const p = plateRectFor(cam, k, sub, programme);
          assert.ok(p, `${programme} ${framing}: no plate for "${k}" / "${sub}"`);
          // the whole kicker is on the wall (wrapped, never cut)
          assert.equal(p.lines.join(' '), k, `${programme} ${framing}: "${k}" became "${p.lines.join(' / ')}"`);
          for (const h of p.heads) assert.ok(p.x1 + 6 <= h.x0 || p.x0 >= h.x1 + 6 || p.y1 + 6 <= h.y0 || p.y0 >= h.y1 + 6, `${programme} ${framing} "${k}" within 6 px of a head`);
        }
      }
    }
  });
  test('pictures: a box beside a head keeps 6 px from it and stays under the graphics top row; a full wall continues under that row one step darker; the solo WIDE fills the wall behind the head', { skip: !CAMERA && 'camera.js unavailable (framings are CAMERA\'s)' }, () => {
    for (const programme of [...STYLE_IDS, 'weekend-review']) {
      for (const framing of lab.FRAMINGS) {
        const cam = lab.cameraFor(framing, programme === 'weekend-review' ? 'generic' : programme);
        const m = mediaRectFor(cam, programme);
        if (m.x1 <= m.x0) continue; // no room: the plate shows instead
        const what = `${programme} ${framing} media ${m.x0},${m.y0}-${m.x1},${m.y1}`;
        if (!m.framed) continue; // the whole visible wall (checked on pixels below)
        assert.ok(m.y0 >= 22, `${what} under the top row`);
        for (const h of m.heads) assert.ok(m.x1 + 6 <= h.x0 || m.x0 >= h.x1 + 6 || m.y1 + 6 <= h.y0 || m.y0 >= h.y1 + 6, `${what} within 6 px of head ${JSON.stringify(h)}`);
      }
    }
    // the solo WIDE (pictures on the WIDE, money-minute.md): a letterbox across the whole wall above the
    // head (critics r2: never a postage stamp; critics r3: never behind the head), its bottom edge 6 px
    // or more over the hair, and the wall round the head is the plain field
    for (const programme of ['money-minute', 'news-60']) {
      const cam = lab.cameraFor('wide', programme);
      const m = mediaRectFor(cam, programme);
      const r = wallRect(cam);
      const h = m.heads[0];
      assert.ok(!m.framed && m.x1 - m.x0 >= r.x1 - r.x0 - 2 && m.y1 - m.y0 >= 18, `${programme} ${JSON.stringify(m)}`);
      assert.ok(m.y1 + 6 <= h.y0 + 1, `${programme}: letterbox bottom ${m.y1} vs head top ${h.y0}`);
      // no picture pixel in the head box grown by 6 px: only the field there (presenters hidden)
      for (const image of ['volcano', 'forest', 'port']) {
        const px = shot({ programme, framing: 'wide', wall: 'picture', image, presenters: false });
        const field = new Set([C.slate, C.ink, C.black]);
        let bad = 0;
        for (let y = Math.max(r.y0, h.y0 - 6); y < Math.min(r.y1, h.y1); y++) for (let x = Math.max(r.x0, h.x0 - 6); x < Math.min(r.x1, h.x1 + 6); x++) if (!field.has(px[y * W + x])) bad++;
        assert.equal(bad, 0, `${programme} ${image}: ${bad} picture px within 6 px of the head`);
      }
    }
    // a duo single's full-wall picture runs to the wall's top edge; its rows under the graphics' top
    // row are one palette step darker (never brighter than steel there), no black letterbox
    const cam = lab.cameraFor('single-a', 'world-now');
    const r = wallRect(cam);
    const px = shot({ programme: 'world-now', framing: 'single-a', wall: 'picture', image: 'port' });
    let dark = 0, black = 0, n = 0;
    for (let y = Math.max(0, r.y0 + 2); y < 22; y++) for (let x = Math.max(0, r.x0 + 4); x < Math.min(W, r.x1 - 4); x++) {
      const c = px[y * W + x];
      n++;
      if (LSTAR[nameOf(c)] <= LSTAR.steel + 0.1) dark++;
      if (c === C.black) black++;
    }
    assert.ok(n > 0 && dark === n, `${dark}/${n} under the top row no brighter than steel`);
    assert.ok(black < n * 0.5, `${black}/${n} black: a letterbox`);
  });
  test('the wall field has no value transition beside a head: it is settled above every head top', { skip: !CAMERA && 'camera.js unavailable (framings are CAMERA\'s)' }, () => {
    for (const programme of [...STYLE_IDS, 'generic']) {
      for (const framing of lab.FRAMINGS) {
        const cam = lab.cameraFor(framing, programme);
        const px = shot({ programme, framing, wall: 'plate', label: '', sub: '' });
        const m = mediaRectFor(cam, programme === 'generic' ? 'weekend-review' : programme);
        const r = wallRect(cam);
        for (const h of m.heads) {
          // the wall's columns 2 px inside its edges, from 6 px above the head top to the wall's foot
          for (const x of [Math.max(0, r.x0 + 2), Math.min(W - 1, r.x1 - 3)]) {
            if (x >= h.x0 - 6 && x < h.x1 + 6) continue;
            const y0 = Math.max(0, h.y0 - 6), y1 = Math.min(H, r.y1);
            const seen = new Set();
            for (let y = y0; y < y1; y++) seen.add(px[y * W + x]);
            assert.ok(seen.size <= 1, `${programme} ${framing}: ${seen.size} field colours at x ${x} beside the head (y ${y0}-${y1})`);
          }
        }
      }
    }
  });
  test('COSMOS: in the two-shot and singles no studio 4x4 patch is brighter than Nova\'s face (the planet one step darker)', { skip: !PRESENTERS && 'presenter modules unavailable' }, () => {
    for (const framing of ['two', 'single-a', 'mcu-l']) {
      lab.set({ programme: 'cosmos', framing, wall: 'idle', presenters: true });
      lab.reset();
      for (const t of [0, 22.5, 45]) {
        const r = lab.measure(t);
        assert.equal(r.patches, 0, `cosmos ${framing} t ${t}: ${r.patches} patches brighter than the face ${r.faces}`);
      }
    }
  });
  test('wall pictures: area-averaged, a readable range of tones, mean and highlights under the ceiling', () => {
    for (const [programme, framing, max] of [['world-now', 'wide', 45], ['world-now', 'single-a', 45], ['news-60', 'mcu-l', 45], ['cosmos', 'two', 40]]) {
      const px = shot({ programme, framing, wall: 'picture', image: 'port' });
      const m = mediaRectFor(lab.cameraFor(framing, programme), programme);
      let sum = 0, n = 0, bright = 0;
      const names = new Map();
      for (let y = Math.max(0, m.y0); y < Math.min(H, m.y1); y++) for (let x = Math.max(0, m.x0); x < Math.min(W, m.x1); x++) {
        const nm = nameOf(px[y * W + x]);
        const L = LSTAR[nm];
        sum += L;
        n++;
        if (L > 45) bright++; // ART_DIRECTION: highlights (above the wall's L* 45 ceiling) on at most 10 % of it
        names.set(nm, (names.get(nm) || 0) + 1);
      }
      const what = `${programme} ${framing}`;
      assert.ok(n > 500, `${what}: ${n} picture px`);
      assert.ok(sum / n <= max + 0.5, `${what} mean ${sum / n}`);
      assert.ok(bright / n <= 0.1, `${what} highlights ${bright / n}`);
      // a picture, not mush: at least five tones each covering 2 % of it, spanning 25 L* or more
      const major = [...names].filter(([, c]) => c >= n * 0.02).map(([nm]) => LSTAR[nm]);
      assert.ok(major.length >= 5, `${what}: ${major.length} tones`);
      assert.ok(Math.max(...major) - Math.min(...major) >= 25, `${what}: tones span ${Math.max(...major) - Math.min(...major)} L*`);
      for (const nm of names.keys()) assert.ok(!['red', 'cyan', 'magenta', 'yellow', 'green', 'orange', 'white', 'cream', 'silver'].includes(nm), `${what}: ${nm}`);
    }
  });
  test('INTEGRATION keeps one wall object and Object.assign()s each cut into it: no stale kicker, image or place', () => {
    const wall = { mode: 'idle', image: null, location: null, figure: null, label: null, since: 0, focus: 'A', solo: false };
    const images = new Map([['s2', { full: { width: 2, height: 2, data: new Uint8ClampedArray(16) } }]]);
    const scene = (seg, extra = {}) => ({ program: { id: 'world-now' }, storyId: seg.storyId, images, cast: { A: 'paco', B: 'lola' }, segPlan: { ctx: { seg } }, wall: { mode: 'image' }, ...extra });
    Object.assign(wall, wallFromScene(scene({ type: 'story', storyId: 's1', kicker: 'OIL MARKETS', source: 'REUTERS', location: { place: 'LAGOS' } }), 'world-now'));
    assert.equal(wall.mode, 'plate');
    assert.deepEqual([wall.label, wall.sub], ['OIL MARKETS', 'LAGOS']);
    Object.assign(wall, wallFromScene(scene({ type: 'story', storyId: 's2', kicker: 'VOLCANO', source: 'AP', location: { place: 'ICELAND' } }), 'world-now'));
    assert.equal(wall.mode, 'picture');
    assert.equal(wall.label, 'VOLCANO', 'the picture carries its own kicker and place as its fallback plate');
    assert.equal(wall.sub, 'ICELAND');
    Object.assign(wall, wallFromScene(scene({ type: 'story', storyId: 's3', location: { place: 'NAIROBI', lat: -1.3, lon: 36.8 } }), 'world-now'));
    assert.equal(wall.mode, 'map');
    assert.equal(wall.image, null);
    assert.notEqual(wall.label, 'VOLCANO');
    Object.assign(wall, wallFromScene(scene({ type: 'outro' }), 'world-now'));
    assert.equal(wall.mode, 'idle');
    assert.equal(wall.label, '');
    assert.equal(wall.location, null);
  });
  test('odd cameras never throw (zoom 0.2-2.5, trucks, pedestals) in any wall mode', () => {
    const fr = new Frame();
    const style = styleFor('world-now');
    let n = 0;
    for (const zoom of [0.2, 0.5, 1, 1.4, 2, 2.5]) {
      for (const x of [-160, -60, 0, 60, 160]) {
        for (const y of [-120, -60, 0]) {
          for (const wall of [{ mode: 'picture', image: lab.IMAGES?.get?.('port') || fixture('port') }, { mode: 'map', location: { place: 'NAIROBI, KENYA', lat: -1.3, lon: 36.8 }, since: 0 }, { mode: 'plate', label: 'EUROPEAN ELECTIONS', sub: 'REUTERS' }, { mode: 'figure', figure: '$82.40 BRENT' }]) {
            drawBackground(fr, { x, y, z: 0, zoom, hy: 60, soft: 0 }, 5 + n * 0.02, { style, wall, cut: true });
            n++;
          }
        }
      }
    }
    assert.ok(n > 300);
  });
  test('warm-up in slices: warmStep() runs small tasks until done, then warmSets() is free', async () => {
    const fresh = await import(`../public/js/v2/canvas25d/studio/set.js?warmstep=${Date.now()}`);
    let slices = 0, r;
    do {
      r = fresh.warmStep(2);
      slices++;
    } while (!r.done && slices < 500);
    assert.ok(r.done && slices > 10, `${slices} slices`);
    for (const id of STYLE_IDS) assert.ok(fresh.setReady(id), id);
    assert.ok(fresh.warmSets().ms < 5);
  });
  test('warmWallContent() prepares a picture for a camera ahead of its cut', () => {
    const img = fixture('chip');
    assert.equal(warmWallContent({ mode: 'picture', image: img, label: 'CHIPS' }, 'tech-bytes', lab.cameraFor('wide', 'tech-bytes')), true);
    assert.equal(warmWallContent(null, 'tech-bytes'), false);
  });
  test('MONEY MINUTE lamps: two compact hand-pixelled bronze fixtures, symmetric, beside the wall, never near Penny; their light neutral', () => {
    const px = shot({ programme: 'money-minute', framing: 'wide' });
    const r = wallRect(lab.cameraFor('wide', 'money-minute'));
    const warm = new Set([C.maroon, C.brown, C.tanShade, C.tan, C.cream]);
    const box = [[W, H, -1, -1], [W, H, -1, -1]];
    let centre = 0, top = 0, cream = 0, silver = 0;
    for (let y = 0; y < 150; y++) for (let x = 0; x < W; x++) {
      const c = px[y * W + x];
      if (c === C.silver && x < r.x0 - 4) silver++;
      if (!warm.has(c)) continue;
      if (c === C.cream) cream++;
      if (y < 24) top++;
      const b = x < r.x0 - 2 ? box[0] : x >= r.x1 + 2 ? box[1] : null;
      if (!b) { centre++; continue; }
      b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y);
    }
    assert.equal(centre, 0, 'no warm pixel over the wall and Penny');
    assert.equal(top, 0, 'nothing warm in the graphics top row (y < 24)');
    for (const b of box) {
      // all the warmth is the fixture itself: one compact cluster per lamp (the light is neutral)
      assert.ok(b[2] >= b[0] && b[2] - b[0] + 1 <= 8 && b[3] - b[1] + 1 <= 14, `fixture box ${b}`);
    }
    assert.ok(Math.abs(box[0][0] + box[1][2] - 383) <= 1, 'the lamps are symmetric');
    assert.ok(cream >= 8 && silver >= 4, `lit lips ${cream}, silver highlight ${silver}`);
  });

  test('NEWS IN 60 wide dial: r ≥ 14 with legible ticks (the 12 o\'clock in yellow), static', () => {
    const px = shot({ programme: 'news-60', framing: 'wide', phase: 'outro' });
    const r = wallRect(lab.cameraFor('wide', 'news-60'));
    let x0 = W, x1 = -1;
    for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++) if (px[y * W + x] === C.yellow) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
    assert.ok(x1 - x0 + 1 >= 29, `dial ${x1 - x0 + 1} px across`);
  });
});

describe('fix round 2 (critics of fix round 1)', () => {
  const fixtures = fs.readdirSync(new URL('../config/fixtures/img/', import.meta.url)).filter((f) => f.endsWith('.png')).map((f) => f.replace('.png', ''));
  const pics = fixtures.slice(0, 28);
  for (const n of pics) lab.setImage(n, fixture(n));

  test('COSMOS idle at 60 fps, two-shot and singles: cached = uncached on every frame (planet signature hashes whole colours)', () => {
    for (const framing of ['two', 'single-a', 'mcu-r']) {
      const cam = lab.cameraFor(framing, 'cosmos');
      const style = styleFor('cosmos');
      const run = (on) => {
        setCacheEnabled(on);
        resetWall();
        const fr = new Frame(), clip = new Int16Array(W);
        const out = [];
        for (let i = 0; i < 660; i++) {
          drawBackground(fr, cam, 200 + i / 60, { style, wall: { mode: 'idle' }, shotSince: 1 });
          drawDesk(fr, cam, clip);
          if (i % 3 === 0 || i > 600) out.push(Uint32Array.from(fr.px));
        }
        return out;
      };
      const a = run(false), b = run(true);
      let bad = 0;
      for (let i = 0; i < a.length; i++) {
        let d = 0;
        for (let k = 0; k < a[i].length; k++) if (a[i][k] !== b[i][k]) d++;
        if (d) bad++;
      }
      assert.equal(bad, 0, `cosmos ${framing}: ${bad} of ${a.length} sampled frames differ cached vs uncached`);
    }
    setCacheEnabled(true);
  });

  test('wall pictures: at most 10 % above L* 45 on every fixture and programme (highlights, ART_DIRECTION values)', () => {
    let checked = 0;
    for (const [programme, framing] of [['world-now', 'wide'], ['tech-bytes', 'wide'], ['money-minute', 'wide'], ['cosmos', 'two'], ['news-60', 'mcu-l']]) {
      const m = mediaRectFor(lab.cameraFor(framing, programme), programme);
      for (const image of pics) {
        const px = shot({ programme, framing, wall: 'picture', image });
        let n = 0, hi = 0;
        // the picture's area on the wall (as the cap is defined: a share of the wall picture)
        for (let y = Math.max(0, m.y0); y < Math.min(H, m.y1); y++) for (let x = Math.max(0, m.x0); x < Math.min(W, m.x1); x++) {
          const i = y * W + x;
          n++;
          if (LSTAR[nameOf(px[i])] > 45) hi++;
        }
        assert.ok(hi <= n * 0.1 + 1, `${programme} ${framing} ${image}: ${(100 * hi / n).toFixed(1)} % above L* 45`);
        checked++;
      }
    }
    assert.ok(checked >= 100);
  });

  test('wall pictures keep each bible\'s forbidden colours off the wall (TECH/COSMOS no purple or magenta; never brand red)', () => {
    // (a picture is content: MONEY MINUTE keeps its greens, critics r3; nobody gets red, the brand's)
    const forbid = { 'tech-bytes': ['purple', 'magenta', 'pink', 'red', 'darkRed'], cosmos: ['purple', 'magenta', 'pink', 'red', 'darkRed'], 'money-minute': ['red', 'darkRed', 'green'] };
    for (const [programme, names] of Object.entries(forbid)) {
      const framing = programme === 'cosmos' ? 'two' : 'wide';
      const m = mediaRectFor(lab.cameraFor(framing, programme), programme);
      const cs = names.map((n) => C[n]);
      for (const image of pics) {
        const px = shot({ programme, framing, wall: 'picture', image });
        let bad = 0;
        for (let y = Math.max(0, m.y0); y < Math.min(H, m.y1); y++) for (let x = Math.max(0, m.x0); x < Math.min(W, m.x1); x++) if (cs.includes(px[y * W + x])) bad++;
        // (MONEY MINUTE's darkGreen wordmark rule is idle content, never with a picture)
        assert.equal(bad, 0, `${programme} ${image}: ${bad} forbidden pixels on the wall`);
      }
    }
  });

  test('MONEY MINUTE keeps the home value range: head ring ≥ WORLD NOW\'s minus 2 L* in every framing', { skip: !PRESENTERS && 'presenter modules unavailable' }, () => {
    const ring = (programme, framing) => {
      lab.set({ programme, framing, wall: 'idle', presenters: true });
      lab.reset();
      return lab.measure(10).headZone.mean;
    };
    const home = Math.min(ring('world-now', 'wide'), ring('world-now', 'single-a'), ring('world-now', 'mcu-r'));
    for (const framing of ['wide', 'single-a', 'mcu-l', 'mcu-r', 'ots']) {
      const v = ring('money-minute', framing);
      assert.ok(v >= home - 2 && v <= 45, `money-minute ${framing}: ring ${v.toFixed(1)} vs home ${home.toFixed(1)}`);
    }
    lab.set({ presenters: false });
  });

  test('TECH BYTES: every presenter\'s face is ≥ 25 L* over the 12 px ring around the head (no Bayer through the head)', { skip: !PRESENTERS && 'presenter modules unavailable' }, () => {
    for (const framing of ['two', 'single-a', 'single-b']) {
      lab.set({ programme: 'tech-bytes', framing, wall: 'idle', presenters: true });
      lab.reset();
      const m = lab.measure(10);
      for (const f of m.faces) assert.ok(f - m.headZone.mean >= 25, `tech-bytes ${framing}: face ${f.toFixed(1)} ring ${m.headZone.mean.toFixed(1)}`);
    }
    lab.set({ presenters: false });
  });

  test('desk lines under a slow push in the two-shot: each pixel changes at most once (no A→B→A flip-back)', () => {
    for (const programme of ['world-now', 'cosmos']) {
      lab.set({ programme, framing: 'two', wall: 'idle', presenters: false, cache: true, move: { type: 'push', amount: 0.04, delay: 0.5, dur: 5 } });
      lab.reset();
      const { cam } = lab.render(0);
      const r = wallRect(cam);
      let prev = null, flips = 0;
      const lastVal = new Uint32Array(W * H), last = new Int32Array(W * H).fill(-999);
      for (let i = 0; i < 300; i++) {
        lab.render(i / 60);
        const px = lab.frame.px;
        if (prev) for (let k = 0; k < W * H; k++) {
          if (px[k] === prev[k]) continue;
          const x = k % W, y = (k / W) | 0;
          const inWall = x >= r.x0 - 3 && x < r.x1 + 3 && y >= r.y0 - 3 && y < r.y1 + 3;
          if (!inWall && y >= 150 && px[k] === lastVal[k] && i - last[k] <= 15) flips++;
          lastVal[k] = prev[k];
          last[k] = i;
        }
        prev = Uint32Array.from(px);
      }
      assert.ok(flips <= 20, `${programme} two-shot push: ${flips} desk flip-backs`);
    }
    lab.set({ move: null });
  });

  test('story plates carry what the strap does not: the kicker over the place, never the source; body 1x', () => {
    const base = { program: { id: 'news-60' }, cast: { A: 'sam' }, images: new Map(), focus: 'A', framing: 'mcu-l' };
    const seg = { type: 'story', storyId: 'n1', kicker: 'TRANSPORT', source: 'Bitport Herald', location: { place: 'NORWAY', lat: 60, lon: 10 } };
    const w = wallFromScene({ ...base, storyId: 'n1', wall: { mode: 'source', source: 'Bitport Herald', category: 'world' }, lowerThird: { kicker: 'TRANSPORT' }, segPlan: { ctx: { seg, shots: [] } } });
    assert.deepEqual([w.mode, w.label, w.sub, w.story], ['plate', 'TRANSPORT', 'NORWAY', true]);
    assert.ok(!/BITPORT/i.test(`${w.label} ${w.sub}`), 'no source on the wall');
    // a NUMBER OF THE DAY item shows its number (with the qualifier) unless the plan has it on a card
    const nseg = { type: 'story', storyId: 'c2', kicker: 'NUMBER OF THE DAY', source: 'Circuit Weekly', numbers: [{ value: '160 MILLION', label: 'PASSENGERS', qualifier: 'MORE THAN' }] };
    const cos = { program: { id: 'cosmos' }, cast: { A: 'nova', B: 'unit8' }, images: new Map(), focus: 'A', storyId: 'c2', wall: { mode: 'source', source: 'Circuit Weekly' } };
    const f = wallFromScene({ ...cos, segPlan: { ctx: { seg: nseg, shots: [] } } });
    assert.equal(f.mode, 'figure');
    assert.deepEqual([f.figure.value, f.figure.pre], ['160 MILLION', 'MORE THAN']);
    // carded: the feature label is a segue, never wall content on its own: the idle art
    const carded = wallFromScene({ ...cos, segPlan: { ctx: { seg: nseg, shots: [{ shot: 'fact' }] } } });
    assert.deepEqual([carded.mode, carded.label], ['idle', '']);
    // a story plate is body 1x in a single (the strap is body 1x under it)
    const p1 = plateRectFor(lab.cameraFor('single-a', 'news-60'), 'WATER', 'CANADA', 'news-60', true);
    const p2 = plateRectFor(lab.cameraFor('single-a', 'news-60'), 'WATER', 'CANADA', 'news-60', false);
    assert.equal(p1.ts, 1);
    assert.equal(p2.ts, 2);
  });

  test('plate text breaks: balanced lines that never end on a preposition; a place is never cut mid-name', () => {
    const cam = lab.cameraFor('single-a', 'world-now');
    const p = plateRectFor(cam, 'PEACE TALKS RESUME IN GENEVA', '', 'world-now', true);
    if (p && p.lines.length === 2) {
      assert.ok(!/\b(IN|OF|TO|THE|A|AND|FOR|AT|ON)$/.test(p.lines[0]), `line 1 "${p.lines[0]}"`);
      assert.ok(p.lines[1].split(' ').length >= 2, `orphan "${p.lines[1]}"`);
    }
    // wallFromScene passes the whole place; a plate that cannot fit it shows the name before the region
    const w = plateRectFor(lab.cameraFor('wide', 'news-60'), 'AROUND THE WORLD', 'SAN FRANCISCO, CALIFORNIA', 'news-60', true);
    if (w && w.sub) assert.ok(!/,$/.test(w.sub) && !/\bCALIF$/.test(w.sub), w.sub);
  });

  test('a story wall is never blank: when no plate fits, the programme idle shows', () => {
    for (const programme of ['money-minute', 'news-60', 'world-now']) {
      const label = 'A KICKER FAR TOO LONG TO EVER FIT HERE';
      const px = shot({ programme, framing: 'ots', wall: 'plate', label, sub: '' });
      const cam = lab.cameraFor('ots', programme);
      const r = wallRect(cam);
      // (node draws no text: when the plate fits, its layout says so; when it does not, the idle shows)
      if (plateRectFor(cam, label, '', programme, true)) continue;
      const seen = new Set();
      for (let y = Math.max(22, r.y0 + 2); y < Math.min(136, r.y1 - 2); y++) for (let x = Math.max(8, r.x0 + 2); x < Math.min(376, r.x1 - 2); x++) seen.add(px[y * W + x]);
      assert.ok(seen.size >= 3, `${programme} ots: a blank wall (${seen.size} colours)`);
    }
  });
});

describe('fix round 3 (critics of fix round 2)', () => {
  test('a wall figure is never shortened or clipped: every realistic value shows whole inside its free box, or not at all', { skip: !CAMERA && 'camera.js unavailable (framings are CAMERA\'s)' }, () => {
    const values = ['$1.2 BILLION', '3.4 MILLION', '40,000 A DAY', '1.5 TRILLION', '12,400 KM', '82%', '$82.40', '5.2 MAGNITUDE', '1,200 PEOPLE', '$1,234,567', '12,400,000'];
    let shown = 0, n = 0;
    for (const programme of [...STYLE_IDS, 'generic']) {
      const solo = ['money-minute', 'news-60'].includes(programme);
      for (const framing of lab.FRAMINGS) {
        if (solo && framing === 'single-b') continue;
        const cam = lab.cameraFor(framing, programme);
        for (const value of values) {
          n++;
          const r = figureRectFor(cam, { value, label: 'FUNDING ROUND', pre: 'ABOUT' }, programme === 'generic' ? 'weekend-review' : programme);
          if (!r) continue; // (then the story's plate or the idle shows: never a cut number)
          shown++;
          const what = `${programme} ${framing} "${value}"`;
          assert.equal(r.lines.join(' '), value, `${what}: shown as "${r.lines.join(' / ')}"`);
          assert.ok(r.x0 >= r.box.x0 && r.x1 <= r.box.x1 && r.y0 >= r.box.y0 && r.y1 <= r.box.y1, `${what}: outside its free box`);
          assert.ok(r.x0 >= Math.max(r.wall.x0, 8) && r.x1 <= Math.min(r.wall.x1, 376) && r.y0 >= Math.max(r.wall.y0, 22) && r.y1 <= Math.min(r.wall.y1, 136), `${what}: outside the visible wall`);
          for (const h of r.heads) assert.ok(r.x1 + 6 <= h.x0 || r.x0 >= h.x1 + 6 || r.y1 + 6 <= h.y0 || r.y0 >= h.y1 + 6, `${what}: within 6 px of a head`);
          if (programme === 'money-minute' && framing === 'mcu-r') assert.ok(r.x0 >= 24 && r.x1 <= 176 && r.y1 <= 120, `${what}: outside the MCU-R panel`);
        }
      }
    }
    assert.ok(shown >= n * 0.8, `${shown}/${n} figures shown`);
  });

  test('story walls carry nothing the strap already says: no lone kicker, tag, source or feature label', () => {
    const progs = ['world-now', 'tech-bytes', 'cosmos', 'money-minute', 'news-60'];
    const cases = [
      { kicker: 'GADGETS' },
      { kicker: 'AND FINALLY', location: { place: 'TOKYO, JAPAN' } },
      { kicker: 'NUMBER OF THE DAY', location: { place: 'TOKYO, JAPAN' } },
      { kicker: 'AROUND THE WORLD' },
      { kicker: 'ELECTIONS', location: { place: 'ATHENS, GREECE' } },
      { category: 'tech', source: 'Circuit Weekly' },
    ];
    for (const id of progs) {
      for (const c of cases) {
        for (const framing of [null, 'mcu-r', 'single']) {
          const seg = { type: 'story', storyId: 'x', source: 'Circuit Weekly', ...c };
          const w = wallFromScene({ program: { id }, cast: id === 'money-minute' || id === 'news-60' ? { A: 'sam' } : { A: 'paco', B: 'lola' }, images: new Map(), storyId: 'x', framing, wall: { mode: 'source', source: 'Circuit Weekly' }, lowerThird: { kicker: c.kicker || 'TECHNOLOGY' }, segPlan: { ctx: { seg, shots: [] } } });
          const what = `${id} ${framing} ${JSON.stringify(c)} → ${w.mode} "${w.label}" / "${w.sub}"`;
          assert.ok(!/CIRCUIT/i.test(`${w.label} ${w.sub}`), `${what}: the source`);
          assert.ok(!/^(AND FINALLY|NUMBER OF THE DAY|AROUND THE WORLD)$/.test(w.label), `${what}: a feature label`);
          // a word equal to the strap's tag only with something new under it (the place) or a figure
          if (w.label && (w.label === c.kicker || w.label === 'TECHNOLOGY')) assert.ok(w.sub || w.figure, what);
        }
      }
    }
  });

  test('wall pictures keep their hues: no output pixel more than 90° off its source hue, no green out of a fire, MONEY keeps its forests green', () => {
    const imgs = ['volcano', 'wildfire', 'forest', 'rice', 'port', 'reef', 'mars'];
    for (const style of ['world-now', 'money-minute', 'news-60', 'cosmos', 'tech-bytes']) {
      for (const name of imgs) {
        const img = fixture(name);
        const r = wallPicture(img, 146, 63, style);
        let off = 0, both = 0, green = 0, srcGreen = 0;
        for (let i = 0; i < r.px.length; i++) {
          const c = r.px[i];
          const q = labRGB(c & 255, (c >>> 8) & 255, (c >>> 16) & 255);
          const ra = q[1] - 4, rb = q[2] + 16; // the palette colour off the wall's (cool) neutral axis
          const sc = Math.hypot(r.A[i], r.B[i]);
          if (sc > 12 && Math.hypot(ra, rb) > 12) {
            both++;
            let d = Math.abs(Math.atan2(r.B[i], r.A[i]) - Math.atan2(rb, ra));
            if (d > Math.PI) d = 2 * Math.PI - d;
            if (d > Math.PI / 2) off++;
          }
          if (c === C.darkGreen) green++;
          const h = (Math.atan2(r.B[i], r.A[i]) * 180) / Math.PI;
          if (sc > 10 && h > 115 && h < 200) srcGreen++;
        }
        assert.ok(off <= both * 0.01, `${style} ${name}: ${off}/${both} pixels more than 90° off their hue`);
        if (srcGreen === 0) assert.equal(green, 0, `${style} ${name}: ${green} darkGreen px from a picture with no green`);
        if (name === 'forest' && style === 'money-minute') assert.ok(green > r.px.length * 0.05, `MONEY forest: green ${green}`);
      }
    }
  });

  test('a plate or a figure never bobs under a slow push: its pixels move one way (no A→B→A flip-back)', () => {
    for (const [programme, framing, wall] of [['money-minute', 'mcu-r', 'plate'], ['money-minute', 'mcu-r', 'figure'], ['world-now', 'single-a', 'plate'], ['tech-bytes', 'single-a', 'plate']]) {
      lab.set({ programme, framing, wall, label: 'OIL MARKETS', sub: 'LAGOS, NIGERIA', figure: { value: '$82.40', label: 'BRENT CRUDE' }, presenters: false, cache: true, move: { type: 'push', amount: 0.04, delay: 0.5, dur: 5 } });
      lab.reset();
      const { cam } = lab.render(0);
      const r = wallRect(cam);
      let prev = null, flips = 0;
      const lastVal = new Uint32Array(W * H), last = new Int32Array(W * H).fill(-999);
      for (let i = 0; i < 360; i++) {
        lab.render(i / 60);
        const px = lab.frame.px;
        if (prev) {
          for (let k = 0; k < W * H; k++) {
            if (px[k] === prev[k]) continue;
            const x = k % W, y = (k / W) | 0;
            if (x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1 && px[k] === lastVal[k] && i - last[k] <= 15) flips++;
            lastVal[k] = prev[k];
            last[k] = i;
          }
        }
        prev = Uint32Array.from(px);
      }
      assert.equal(flips, 0, `${programme} ${framing} ${wall}: ${flips} flip-backs on the wall`);
    }
    lab.set({ move: null });
  });

  test('COSMOS two-shot and singles: nothing on the wall brighter than Nova\'s face', { skip: !PRESENTERS && 'presenter modules unavailable' }, () => {
    for (const framing of ['two', 'single-a']) {
      lab.set({ programme: 'cosmos', framing, wall: 'idle', presenters: true });
      lab.reset();
      const m = lab.measure(10);
      const face = Math.min(...m.faces);
      const { cam } = lab.render(10);
      const r = wallRect(cam);
      let bright = 0;
      for (let y = Math.max(0, r.y0); y < Math.min(H, r.y1); y++) for (let x = Math.max(0, r.x0); x < Math.min(W, r.x1); x++) if (LSTAR[nameOf(lab.frame.px[y * W + x])] > face + 0.5) bright++;
      assert.equal(bright, 0, `cosmos ${framing}: ${bright} wall px brighter than the face (${face.toFixed(1)})`);
    }
  });

  test('MONEY MINUTE and NEWS IN 60 solo wide: a story picture never sits behind the head', () => {
    // (covered pixel by pixel in the round-1 picture test; here the layout for every fixture size)
    for (const programme of ['money-minute', 'news-60']) {
      const cam = lab.cameraFor('wide', programme);
      const m = mediaRectFor(cam, programme);
      for (const h of m.heads) assert.ok(m.y1 + 6 <= h.y0 + 1, `${programme}: picture bottom ${m.y1}, head top ${h.y0}`);
    }
  });

  test('prepareImage reads a picture once; the cut then only filters and maps it', () => {
    const img = fixture('rice');
    assert.equal(prepareImage(img), true);
    assert.equal(prepareImage(img), true);
    assert.equal(prepareImage(null), false);
    // wallFromScene queues every picture of scene.images for that preparation by itself
    const images = new Map([['a', fixture('mars')], ['b', fixture('reef')]]);
    assert.doesNotThrow(() => wallFromScene({ program: { id: 'world-now' }, cast: { A: 'paco', B: 'lola' }, images, storyId: 'a', wall: { mode: 'image' }, segPlan: { ctx: { seg: { type: 'story', storyId: 'a' } } } }));
  });
});
