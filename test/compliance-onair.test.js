// The AI disclosure on screen (docs/publishing/compliance.md §3): the yellow AI mark docked to the bug in every frame
// the top row is up, opening into the channel's words at the start, after breaks and every five minutes; the ident's
// statement; the recreation's AI RECREATION label, whole and inside a 9:16 or 1:1 clip's window; captions inside
// the window; and Open-Meteo's credit as its licence asks.
import { test } from 'node:test';
import assert from 'node:assert/strict';

function fakeCtx() {
  return {
    depth: 0,
    fills: [],
    texts: 0,
    clips: [],
    fillStyle: '#000',
    globalAlpha: 1,
    imageSmoothingEnabled: false,
    save() {
      this.depth++;
    },
    restore() {
      this.depth--;
    },
    beginPath() {},
    rect(x, y, w, h) {
      this.clips.push({ x, y, w, h });
    },
    clip() {},
    putImageData() {},
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    fillRect(x, y, w, h) {
      this.fills.push({ x, y, w, h, c: this.fillStyle });
    },
    drawImage() {
      this.texts++;
    },
  };
}
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => fakeCtx() }) };

const { P } = await import('../public/js/palette.js');
const { TOP, W, CAPTION } = await import('../public/js/graphics/layout.js');
const { drawTopRow, BUG_W } = await import('../public/js/graphics/bug.js');
const D = await import('../public/js/graphics/disclosure.js');
const { recreationOf, recreationLayout, drawRecreation, RECREATION } = await import('../public/js/graphics/recreation.js');
const { Graphics } = await import('../public/js/graphics/index.js');
const { measureText } = await import('../public/js/font.js');
const { weatherCredit } = await import('../public/js/scenes/weather/index.js');
const { CONTINUITY, continuityLine } = await import('../public/js/ads/index.js');
const { CHANNEL, programmeWording } = await import('../server/compliance/disclosure.js');
const rights = (await import('../server/compliance/credits.js')).loadRights();

const yellowAt = (ctx, x) => ctx.fills.filter((f) => f.c === P.yellow && f.y >= TOP.y && f.y < TOP.y + TOP.h && f.x <= x && f.x + f.w > x);
const topRow = (over = {}) => ({ onAt: 0, replay: false, program: null, programIn: null, programOut: null, clock: '12:00', markFrom: 0.4, noun: 'NEWS', ...over });

test('the AI mark: a yellow plate docked to the bug in every frame once the row is in, clean context', () => {
  D.setFrame(null);
  const markX = TOP.x + BUG_W + 1;
  for (let t = 0.5; t < 700; t += 7.3) {
    const ctx = fakeCtx();
    drawTopRow(ctx, t, topRow());
    assert.equal(ctx.depth, 0, `context restored at ${t}`);
    assert.ok(yellowAt(ctx, markX + 5).length, `the AI plate at x ${markX + 5}, t ${t.toFixed(1)}`);
  }
  // the plate is the EU icon's "AI" in our type: 3 px, the double-struck AI, 3 px; full height, corners knocked off
  const ctx = fakeCtx();
  drawTopRow(ctx, 30, topRow());
  const plate = ctx.fills.filter((f) => f.c === P.yellow);
  const x0 = Math.min(...plate.map((f) => f.x)), x1 = Math.max(...plate.map((f) => f.x + f.w));
  assert.equal(x0, markX);
  assert.equal(x1 - x0, D.markWidth(0));
  assert.equal(D.markWidth(0), 3 + D.AI_W + 3);
  assert.ok(plate.some((f) => f.h === TOP.h) && plate.some((f) => f.h === TOP.h - 2), 'a pill: full-height middle, shorter edge columns');
  // the LIVE tag moves along to make room
  assert.ok(ctx.fills.some((f) => f.c === P.red && f.x >= markX + D.markWidth(0)), 'LIVE after the mark');
});

test('the mark opens into the channel\'s words after the programme name, every five minutes, and after a break', () => {
  const at = (t, from = 10, onAt = 0) => D.markOpen(t, from, onAt);
  assert.equal(at(5), 0, 'closed while the programme name is up');
  assert.equal(at(10 + D.MARK_TIMING.open + 0.01), 1, 'open just after');
  assert.equal(at(10 + D.MARK_TIMING.hold - 0.1), 1, `held ${D.MARK_TIMING.hold} s`);
  assert.equal(at(10 + D.MARK_TIMING.hold + D.MARK_TIMING.close + 0.1), 0, 'closed again');
  assert.equal(at(150), 0);
  assert.equal(at(D.MARK_TIMING.every + 1), 1, 'open again five minutes in');
  assert.equal(at(D.MARK_TIMING.every + D.MARK_TIMING.again + D.MARK_TIMING.close + 0.1), 0);
  assert.equal(at(2 * D.MARK_TIMING.every + 2), 1, 'and every five minutes after');
  // a break: the graphics come on again (a new onAt and from), the mark opens with them
  assert.equal(D.markOpen(1002, 1000.4, 1000), 1);
  // open, the words plate follows the AI plate and the row is wider
  assert.ok(D.markWidth(1, 'NEWS') > D.markWidth(0) + 40);
  assert.ok(D.markWidth(1, 'FORECAST') > D.markWidth(1, 'NEWS'));
  // every opening is clear of the clock (the longest noun, with LIVE and the programme name)
  const row = TOP.x + BUG_W + 1 + D.markWidth(1, 'FORECAST') + 1 + 40 + 1 + measureText('WORLD WEATHER') + 8;
  assert.ok(row < W - TOP.x - 60, `row ends at ${row}`);
});

test('the graphics hand the mark its first opening after the programme name (NEWS IN 60: with it) and its noun', () => {
  D.setFrame(null);
  const g = new Graphics({ now: () => 0 });
  const scene = { shot: 'wide', ticker: [], program: { id: 'world-weather', title: 'WORLD WEATHER', theme: 'weather' }, programTagUntil: 60 };
  g.update(0, scene);
  g.render(fakeCtx(), 0, scene);
  const first = g.tagIn + g.pg.tagHold + 0.35;
  const ctxBefore = fakeCtx();
  for (let t = 0; t <= first - 0.5; t += 1 / 10) g.update(t, scene);
  g.render(ctxBefore, first - 0.5, scene);
  const ctxAfter = fakeCtx();
  for (let t = first - 0.5; t <= first + 2; t += 1 / 10) g.update(t, scene);
  g.render(ctxAfter, first + 2, scene);
  const wordsPlate = (ctx) => ctx.fills.some((f) => f.c === P.black && f.y === TOP.y && f.x === TOP.x + BUG_W + 1 + D.markWidth(0) - 1);
  assert.ok(!wordsPlate(ctxBefore), 'closed while WORLD WEATHER is named');
  assert.ok(wordsPlate(ctxAfter), 'open after');
  assert.equal(D.nounOf('world-weather'), 'FORECAST');
  // the server's per-programme wording says the same nouns
  for (const id of ['world-now', 'world-weather', 'full-time', 'pay-attention', 'cosmos']) assert.equal(programmeWording(id).noun, D.nounOf(id), id);
});

test('a clip frame (?frame=9x16): the bug and the mark inside the window, no LIVE, no clock, no ticker', () => {
  const f = D.setFrame('9x16');
  assert.deepEqual({ active: f.active, w: f.w, x: f.x }, { active: true, w: 121, x: 132 });
  assert.equal(D.setFrame('9x16@20').x, 20);
  assert.equal(D.setFrame('1x1').w, 216);
  D.setFrame('9x16');
  const ctx = fakeCtx();
  drawTopRow(ctx, 30, topRow({ markFrom: 0.4 }));
  const xs = ctx.fills.map((r) => [r.x, r.x + r.w]);
  assert.ok(xs.every(([a, b]) => a >= f.x && b <= f.x + f.w), 'everything inside the window');
  assert.ok(yellowAt(ctx, f.x + 4 + BUG_W + 1 + 3).length, 'the mark');
  assert.ok(!ctx.fills.some((r) => r.c === P.red && r.w === 3 && r.h === 3), 'no LIVE square');
  assert.equal(D.frameFromSearch('?autostart=1&frame=9x16@140'), '9x16@140');
  // the words open only where they fit whole: closed in a 9:16 window (the plate stays), open in a 1:1 one
  const wordsPlate = (c, x0) => c.fills.some((r) => r.c === P.black && r.x === x0 + BUG_W + 1 + D.markWidth(0) - 1);
  const narrow = fakeCtx();
  drawTopRow(narrow, 3, topRow({ markFrom: 0.4 }));
  assert.ok(!wordsPlate(narrow, f.x + 4), '9:16: the words stay closed');
  assert.ok(narrow.fills.every((r) => r.x + r.w <= f.x + f.w), 'nothing past the window');
  const sq = D.setFrame('1x1');
  const square = fakeCtx();
  drawTopRow(square, 3, topRow({ markFrom: 0.4 }));
  assert.ok(wordsPlate(square, sq.x + 4), '1:1: open');
  assert.ok(square.fills.every((r) => r.x >= sq.x && r.x + r.w <= sq.x + sq.w));
  D.setFrame(null);
});

test('the recreation label: AI RECREATION (the yellow plate holds the AI) and the source, inside action-safe', () => {
  D.setFrame(null);
  const rec = { name: 'MARA ADEYEMI', role: 'MAYOR OF LISBON', line: 'RECREATION — WORDS FROM PUBLIC STATEMENTS', credit: 'SOURCE: HARBOUR HERALD' };
  const L = recreationLayout(rec, D.FRAME);
  const mark = L.plates.find((p) => p.role === 'mark');
  assert.ok(mark.ai && mark.color === P.yellow);
  assert.equal(mark.w, 4 + D.AI_W + 4 + measureText('RECREATION') + 4);
  assert.ok(L.whole);
  assert.ok(L.label.x0 >= TOP.x && L.label.x1 <= RECREATION.right, 'inside action-safe');
  const ctx = fakeCtx();
  drawRecreation(ctx, rec, P.cyan);
  assert.ok(ctx.fills.some((f) => f.c === P.yellow && f.y === RECREATION.y && f.w === mark.w));
});

test('in a 9:16 window the label stacks, every word whole and inside, also for a long outlet and a long name', () => {
  for (const spec of ['9x16', '9x16@0', '9x16@263', '1x1', '4x5']) {
    const f = D.setFrame(spec);
    for (const outlet of ['BBC', 'ASSOCIATED PRESS', 'THE WALL STREET JOURNAL', 'AL JAZEERA ENGLISH']) {
      const rec = recreationOf({ strap: { name: 'VOLODYMYR ZELENSKYY', role: 'PRESIDENT OF UKRAINE' }, label: { line: 'RECREATION — WORDS FROM PUBLIC STATEMENTS', credit: `SOURCE: ${outlet}` } });
      const L = recreationLayout(rec, f);
      assert.ok(L.whole, `${spec} ${outlet}: ${L.lost.join(' / ')}`);
      for (const p of L.plates) assert.ok(p.x >= f.x && p.x + p.w <= f.x + f.w, `${spec} ${outlet}: ${p.role} "${p.text}" at ${p.x}..${p.x + p.w} outside ${f.x}..${f.x + f.w}`);
      const words = L.plates.filter((p) => p.role === 'line' || p.role === 'credit').map((p) => p.text).join(' ');
      assert.equal(words.replace(/\s+/g, ' '), `WORDS FROM PUBLIC STATEMENTS SOURCE: ${outlet}`, 'every word of the label, in order');
      const name = L.plates.find((p) => p.role === 'name');
      assert.equal(name.lines.join(' '), 'VOLODYMYR ZELENSKYY', 'the name whole');
    }
    // a long role wraps on the tag rather than ending on "OF" (seen on the first 9:16 render: "CHIEF EXECUTIVE OF")
    const ceo = recreationLayout(recreationOf({ strap: { name: 'HIRO MENSAH', role: 'CHIEF EXECUTIVE OF NIMBUS RAIL' }, label: { line: 'RECREATION — WORDS FROM PUBLIC STATEMENTS', credit: 'SOURCE: CIRCUIT WEEKLY' } }), f);
    const tag = ceo.plates.find((p) => p.role === 'role');
    assert.equal(tag.lines.join(' '), 'CHIEF EXECUTIVE OF NIMBUS RAIL', `${spec}: the role whole`);
    assert.ok(!/ (?:OF|THE|AND)$/.test(tag.lines.at(-1)), `${spec}: it never ends on a word that needs the next (${tag.lines.join(' / ')})`);
    assert.ok(tag.x + tag.w <= f.x + f.w && tag.y + tag.h <= ceo.plates.find((p) => p.role === 'name').y, `${spec}: the tag sits on the name bar, inside`);
  }
  D.setFrame(null);
});

test('captions follow the window: centred on it, never wider than it', async () => {
  const { CaptionState, drawCaptions } = await import('../public/js/graphics/captions.js');
  const f = D.setFrame('9x16');
  const s = new CaptionState();
  s.update(0, 'We will publish the full plan for the old town next week, and then we will listen.', 0, null, 2);
  const ctx = fakeCtx();
  drawCaptions(ctx, 1, s, { bottom: 160 });
  assert.ok(ctx.fills.length > 0);
  for (const r of ctx.fills) assert.ok(r.x >= f.x && r.x + r.w <= f.x + f.w, `caption box ${r.x}..${r.x + r.w}`);
  D.setFrame(null);
  const s2 = new CaptionState();
  s2.update(0, 'We will publish the full plan for the old town next week.', 0, null, 2);
  const c2 = fakeCtx();
  drawCaptions(c2, 1, s2, { bottom: 160 });
  const mid = c2.fills.map((r) => r.x + r.w / 2);
  assert.ok(mid.every((m) => Math.abs(m - W / 2) <= 2), 'the full frame: centred as before');
  assert.equal(CAPTION.maxW, 264);
});

test('the ident says what the channel is, under the wordmark, in the words the server uses', async () => {
  assert.equal(D.IDENT_LINE, CHANNEL.ident);
  assert.ok(D.IDENT_W <= W - 2 * 19, 'inside graphics-safe');
  const ctx = fakeCtx();
  D.drawIdentLine(ctx, W / 2, 124);
  const plate = ctx.fills.filter((f) => f.c === P.yellow);
  assert.ok(plate.length && plate.every((f) => f.y >= 124 && f.y + f.h <= 124 + TOP.h));
  const { drawIdentScene } = await import('../public/js/scenes/opens/ident.js');
  const c = fakeCtx();
  drawIdentScene(c, 2, { variant: 'dusk' });
  assert.ok(c.fills.some((f) => f.c === P.yellow && f.y === 124), 'drawn in the ident');
});

test('in a narrow window the captions sit above a recreation\'s taller name super, never on it', () => {
  const rec = recreationOf({ strap: { name: 'HIRO MENSAH', role: 'CHIEF EXECUTIVE OF NIMBUS RAIL' }, label: { line: 'RECREATION — WORDS FROM PUBLIC STATEMENTS', credit: 'SOURCE: CIRCUIT WEEKLY' } });
  const f = D.setFrame('9x16@64');
  const g = new Graphics({ now: () => 0 });
  const scene = { shot: 'location', ticker: [], recreation: rec, subtitle: 'We will publish the details of the plan next week.', subtitleSince: 0 };
  for (let t = 0; t <= 1.5; t += 0.1) g.update(t, scene);
  const place = g.captionPlace(1.5, scene);
  const tag = recreationLayout(rec, f).plates.find((p) => p.role === 'role');
  assert.ok(place.bottom <= tag.y - 6, `captions end at ${place.bottom}, the tag starts at ${tag.y}`);
  D.setFrame(null);
  assert.ok(g.captionPlace(1.5, scene).bottom <= 166 - 6, 'the full frame: above the strap line as before');
});

test('the continuity voice says it at every break; Open-Meteo is credited as its licence asks', () => {
  for (const l of CONTINUITY.script) assert.match(l.text, /^This is GLOBIT 24, AI-produced news\. /);
  assert.match(continuityLine(10), /AI-produced news/);
  assert.equal(weatherCredit('OPEN-METEO · GDACS'), 'DATA: OPEN-METEO.COM (CC BY 4.0) · GDACS');
  assert.ok(weatherCredit('OPEN-METEO').startsWith(rights.classes['open-meteo'].onAir));
});
