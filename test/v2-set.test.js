import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { C, Frame } from '../public/js/v2/canvas25d/pixbuf.js';
import { styleFor, setStyle, STYLE_IDS, currentStyle } from '../public/js/v2/canvas25d/studio/styles.js';
import { drawBackground, drawDesk, setCacheEnabled, invalidateSet, wallRect, wallFromScene } from '../public/js/v2/canvas25d/studio/set.js';
import { resetWall, wallShown, planetAzimuth, plateRectFor } from '../public/js/v2/canvas25d/studio/wall.js';
import { LSTAR, lstarRGB, nameOf, isPalette, census, share, SATURATED } from '../public/js/v2/canvas25d/studio/color.js';
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
    assert.ok(share(cs, ['purple']) > 0 && share(cs, ['purple']) <= 0.12);
    assert.equal(share(cs, ['pink', 'cyan']), 0);
    // every magenta pixel is on the desk's 1 px LED row (one per column at most)
    const cols = new Map();
    for (let i = 0; i < px.length; i++) if (px[i] === C.magenta) cols.set(i % W, (cols.get(i % W) || 0) + 1);
    assert.ok(cols.size > 300 && [...cols.values()].every((n) => n === 1));
  });
  test('MONEY MINUTE: saturated ≤ 10 % of set pixels, cream tint ≤ 8 %, darkGreen desk line', () => {
    const { cs } = setCensus('money-minute');
    assert.ok(share(cs, [...SATURATED]) <= 0.1, `saturated ${share(cs, [...SATURATED])}`);
    const tint = share(cs, styleFor('money-minute').tintNames);
    assert.ok(tint > 0 && tint <= 0.08, `tint ${tint}`);
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
    assert.equal(rule, 16);
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
    assert.equal(wallFromScene({ ...base, program: { id: 'cosmos' }, wall: { mode: 'source', source: 'NASA' }, storyId: 's3', ...seg({ storyId: 's3', location: { lat: 1, lon: 2 } }) }).mode, 'plate');
    const money = wallFromScene({ program: { id: 'money-minute' }, cast: { A: 'penny' }, framing: 'mcu-r', wall: { mode: 'source', source: 'FT' }, storyId: 's4', segPlan: { ctx: { seg: { type: 'story', storyId: 's4', numbers: [{ value: '$82', label: 'OIL' }], kicker: 'OIL' }, shots: [] } } });
    assert.equal(money.mode, 'figure');
    assert.equal(money.solo, true);
    const outro = wallFromScene({ program: { id: 'news-60' }, cast: { A: 'sam' }, wall: { mode: 'logo' }, segPlan: { ctx: { seg: { type: 'outro' } } } });
    assert.deepEqual([outro.mode, outro.phase], ['idle', 'outro']);
    const sc = { ...base, program: { id: 'world-now' }, wall: { mode: 'logo' } };
    assert.ok(wallFromScene(sc) === wallFromScene(sc), 'memoised for a static scene');
  });
});

describe('round 3: wall plates inside their free area, clean tint clusters', () => {
  test('a plate (kicker + source) stays inside the visible wall, clear of the graphics rows and every head', () => {
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
  test('solo programmes: the wall\'s bottom 16 px (wide scale) stay dark in every framing and wall mode', () => {
    const modes = [{ wall: 'idle' }, { wall: 'picture', image: 'port' }, { wall: 'plate' }, { wall: 'figure' }, { wall: 'map' }];
    for (const programme of ['news-60', 'money-minute']) {
      for (const framing of ['wide', 'single-a', 'mcu-l', 'mcu-r']) {
        const r = wallRect(lab.cameraFor(framing, programme));
        const band = Math.round((16 / (1000 / SET.wallZ)) * r.k);
        for (const m of modes) {
          const px = shot({ programme, framing, ...m });
          for (let y = Math.max(0, r.y1 - band); y < Math.min(H, r.y1); y++) {
            for (let x = Math.max(0, r.x0); x < Math.min(W, r.x1); x++) {
              const c = px[y * W + x];
              assert.ok(c === C.ink || c === C.black, `${programme} ${framing} ${m.wall}: ${nameOf(c)} at ${x},${y} (band ${band})`);
            }
          }
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
  test('a full tint is a flat cluster (no Bayer dot grid): COSMOS purple beams, MONEY MINUTE warm sconce cores', () => {
    assert.ok(blockOf(shot({ programme: 'cosmos', framing: 'wide' }), 'purple', 4), 'a 4x4 purple block in the COSMOS beams');
    assert.ok(blockOf(shot({ programme: 'money-minute', framing: 'wide' }), 'brown', 3), 'a 3x3 brown block at a MONEY MINUTE sconce');
  });
  test('COSMOS: the purple lives in the two flank beams only (never in the head zones or behind the wall)', () => {
    for (const framing of ['wide', 'two']) {
      const px = shot({ programme: 'cosmos', framing });
      let inner = 0, outer = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (px[y * W + x] !== C.purple) continue;
        if (framing === 'wide' && x > 92 && x < 292) inner++;
        else outer++;
      }
      assert.equal(inner, 0, `${framing}: purple between the beams`);
      if (framing === 'wide') assert.ok(outer > 200, `wide: beams ${outer} px`);
    }
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
