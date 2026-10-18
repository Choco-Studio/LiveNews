// The AI disclosure on screen (docs/publishing/compliance.md §3): the logo clean (owner, 18 Oct: no AI plate docked to
// the bug, nothing over a programme); the channel's ident before every programme says it under the wordmark, and a
// clip's end card in the same words; the recreation's AI RECREATION label, whole and inside a 9:16 or 1:1 clip's
// window; captions inside the window; and Open-Meteo's credit as its licence asks.
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
    translate() {},
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
const { recreationOf, recreationLayout, drawRecreation, evenLines, RECREATION } = await import('../public/js/graphics/recreation.js');
const { Graphics } = await import('../public/js/graphics/index.js');
const { measureText } = await import('../public/js/font.js');
const { weatherCredit } = await import('../public/js/scenes/weather/index.js');
const { CONTINUITY, continuityLine, IDENT_VOICE } = await import('../public/js/ads/index.js');
const { CHANNEL, programmeWording } = await import('../server/compliance/disclosure.js');
const rights = (await import('../server/compliance/credits.js')).loadRights();

const yellowIn = (ctx, y0, y1) => ctx.fills.filter((f) => f.c === P.yellow && f.y >= y0 && f.y < y1);
const topRow = (over = {}) => ({ onAt: 0, replay: false, program: null, programIn: null, programOut: null, clock: '12:00', ...over });
const scene = (over = {}) => ({ shot: 'wide', ticker: [], program: { id: 'world-now', title: 'WORLD NOW', theme: 'world' }, programTagUntil: 60, ...over });

test('the logo is clean: nothing docked to the bug in any frame, the LIVE tag right beside it', () => {
  D.setFrame(null);
  for (let t = 0.5; t < 700; t += 7.3) {
    const ctx = fakeCtx();
    drawTopRow(ctx, t, topRow());
    assert.equal(ctx.depth, 0, `context restored at ${t}`);
    assert.deepEqual(yellowIn(ctx, TOP.y, TOP.y + TOP.h), [], `no yellow AI plate in the top row at ${t.toFixed(1)}`);
  }
  const ctx = fakeCtx();
  drawTopRow(ctx, 30, topRow());
  assert.ok(ctx.fills.some((f) => f.c === P.black && f.x === TOP.x + BUG_W + 1 && f.y === TOP.y), 'the LIVE plate docks 1 px after the bug');
  // neither the old mark's API nor the on-programme notice's is left, so nothing can draw them again by mistake
  for (const name of ['drawMark', 'markWidth', 'markOpen', 'MARK_TIMING', 'noticeLayout', 'drawNotice', 'NOTICE_TIMING', 'drawClipNotice', 'clipNoticeLayout']) assert.equal(D[name], undefined, name);
});

test('the notice: AI-PRODUCED NEWS · PRESENTERS ARE AI CHARACTERS · FACTS FROM CREDITED SOURCES, in the server\'s words', () => {
  assert.equal(D.NOTICE_LINE, 'AI-PRODUCED NEWS · PRESENTERS ARE AI CHARACTERS · FACTS FROM CREDITED SOURCES');
  assert.equal(D.NOTICE_LINE, CHANNEL.notice);
  for (const id of ['world-now', 'world-weather', 'full-time', 'pay-attention', 'cosmos']) {
    assert.equal(programmeWording(id).noun, D.nounOf(id), id);
    assert.equal(programmeWording(id).notice, D.noticeParts(D.nounOf(id)).join(' · '), id);
  }
  assert.deepEqual([...D.IDENT_ROWS], ['AI-PRODUCED NEWS', 'PRESENTERS ARE AI CHARACTERS · FACTS FROM CREDITED SOURCES']);
});

test('nothing over a programme: a whole programme\'s graphics never draw the notice (owner: "durante el programa no hace falta")', () => {
  D.setFrame(null);
  const g = new Graphics({ now: () => 0 });
  const before = D.NOTICE_DRAWS.n;
  for (let k = 0; k <= 700; k += 0.5) {
    const sc = scene({ shot: k < 0.2 ? 'open' : k > 300 && k < 360 ? 'ad' : 'wide' });
    g.update(k, sc);
    if (k % 7 < 0.5) g.render(fakeCtx(), k, sc);
  }
  assert.equal(D.NOTICE_DRAWS.n, before, 'not at the start, not after a break, not every ten minutes');
  assert.equal(g.notice, undefined, 'no notice clock in the graphics package');
});

test('a clip frame (?frame=9x16): the bug inside the window, no LIVE, no clock', () => {
  const f = D.setFrame('9x16');
  assert.deepEqual({ active: f.active, w: f.w, x: f.x }, { active: true, w: 121, x: 132 });
  assert.equal(D.setFrame('9x16@20').x, 20);
  assert.equal(D.setFrame('1x1').w, 216);
  D.setFrame('9x16');
  const ctx = fakeCtx();
  drawTopRow(ctx, 30, topRow());
  const xs = ctx.fills.map((r) => [r.x, r.x + r.w]);
  assert.ok(xs.every(([a, b]) => a >= f.x && b <= f.x + f.w), 'everything inside the window');
  assert.deepEqual(yellowIn(ctx, 0, 216), [], 'no AI plate');
  assert.ok(!ctx.fills.some((r) => r.c === P.red && r.w === 3 && r.h === 3), 'no LIVE square');
  assert.equal(D.frameFromSearch('?autostart=1&frame=9x16@140'), '9x16@140');
  D.setFrame(null);
});

test('a clip\'s end card says it in the ident\'s words and type; there is no first-seconds notice card', async () => {
  const cards = await import('../public/js/clip/cards.js');
  assert.deepEqual([...cards.END_CARD_NOTICE], D.noticeParts('NEWS'));
  assert.equal(cards.drawNoticeCard, undefined, 'no notice over the clip\'s first seconds (owner, 18 Oct)');
  assert.equal(cards.NOTICE_SECONDS, undefined);
  for (const format of ['vertical', 'horizontal']) {
    const before = D.NOTICE_DRAWS.n;
    const c = fakeCtx();
    cards.drawEndCard(c, 2.5, { format, programme: 'WORLD NOW' });
    assert.equal(c.depth, 0, format);
    assert.equal(D.NOTICE_DRAWS.n, before + 1, `${format}: the end card draws the notice`);
    const early = fakeCtx();
    const n0 = D.NOTICE_DRAWS.n;
    cards.drawEndCard(early, 0.2, { format, programme: 'WORLD NOW' });
    assert.equal(D.NOTICE_DRAWS.n, n0, `${format}: not before its rows rise`);
  }
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

test('line breaks in a window fall where a subtitler would put them; a long role takes more lines, never loses a word', () => {
  // the 4:5 render showed "CHIEF EXECUTIVE OF NIMBUS / RAIL" and "WORDS FROM PUBLIC / STATEMENTS": lone words
  const f = D.setFrame('4x5@38');
  const ceo = recreationLayout(recreationOf({ strap: { name: 'HIRO MENSAH', role: 'CHIEF EXECUTIVE OF NIMBUS RAIL' }, label: { line: 'RECREATION — WORDS FROM PUBLIC STATEMENTS', credit: 'SOURCE: CIRCUIT WEEKLY' } }), f);
  assert.deepEqual(ceo.plates.find((p) => p.role === 'role').lines, ['CHIEF EXECUTIVE', 'OF NIMBUS RAIL']);
  assert.deepEqual(ceo.plates.filter((p) => p.role === 'line').map((p) => p.text), ['WORDS FROM', 'PUBLIC STATEMENTS']);
  // the outlet's name stays whole after "SOURCE:" when the source takes two lines
  assert.deepEqual(evenLines('SOURCE: THE WALL STREET JOURNAL', 100, 'micro'), ['SOURCE:', 'THE WALL STREET JOURNAL']);
  // never a line ending on a word that binds to the next, in any window, for long real roles
  const TIGHT = /\b(?:OF|THE|A|AN|AND|TO)$/;
  const roles = ['SECRETARY-GENERAL OF THE UNITED NATIONS', 'UNITED STATES SECRETARY OF STATE', 'DIRECTOR-GENERAL OF THE WORLD HEALTH ORGANIZATION', 'PRESIDENT OF THE EUROPEAN COMMISSION', 'GOVERNOR OF THE BANK OF ENGLAND'];
  for (const spec of ['9x16', '9x16@0', '1x1', '4x5', '3x4']) {
    const fr = D.setFrame(spec);
    for (const role of roles) {
      const L = recreationLayout(recreationOf({ strap: { name: 'TEDROS ADHANOM GHEBREYESUS', role }, label: { line: 'RECREATION — WORDS FROM PUBLIC STATEMENTS', credit: 'SOURCE: AGENCE FRANCE-PRESSE' } }), fr);
      const tag = L.plates.find((p) => p.role === 'role');
      const name = L.plates.find((p) => p.role === 'name');
      assert.ok(L.whole, `${spec} ${role}: ${L.lost.join(' / ')}`);
      assert.equal(tag.lines.join(' '), role, `${spec}: every word of the role`);
      assert.equal(name.lines.join(' '), 'TEDROS ADHANOM GHEBREYESUS', `${spec}: every word of the name`);
      for (const ln of [...tag.lines.slice(0, -1), ...name.lines.slice(0, -1)]) assert.ok(!TIGHT.test(ln), `${spec}: "${ln}" ends on a word that needs the next (${tag.lines.join(' / ')})`);
      assert.ok(tag.x + tag.w <= fr.x + fr.w && tag.y > L.label.y1, `${spec} ${role}: the tag inside the window, below the label`);
    }
  }
  // a role no window can hold is reported, and the publish check refuses the window (label-out-of-frame)
  D.setFrame('9x16');
  const huge = recreationLayout(recreationOf({ strap: { name: 'ANA SILVA', role: 'DEPUTY DIRECTOR-GENERAL FOR INTERNATIONAL COOPERATION AND DEVELOPMENT OF THE EUROPEAN COMMISSION' }, label: { line: 'RECREATION — WORDS FROM PUBLIC STATEMENTS', credit: 'SOURCE: BBC' } }));
  assert.equal(huge.whole, false);
  assert.ok(huge.lost.join(' ').length > 0);
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

test('the ident says what the channel is, under the wordmark, in the words the server uses: no yellow box', async () => {
  assert.equal(D.IDENT_LINE, CHANNEL.ident);
  assert.equal(D.IDENT_LINE, D.NOTICE_LINE, 'the same notice');
  assert.ok(D.IDENT_W <= W - 2 * 19, 'inside graphics-safe');
  const ctx = fakeCtx();
  const before = D.NOTICE_DRAWS.n;
  D.drawIdentLine(ctx, W / 2, 124);
  assert.equal(D.NOTICE_DRAWS.n, before + 1);
  assert.ok(ctx.texts >= 2, 'two rows of type');
  assert.deepEqual(ctx.fills.filter((f) => f.c === P.yellow), [], 'no plate');
  const { drawIdentScene } = await import('../public/js/scenes/opens/ident.js');
  const c = fakeCtx();
  drawIdentScene(c, 2, { variant: 'dusk' });
  assert.equal(D.NOTICE_DRAWS.n, before + 2, 'drawn in the ident');
  assert.deepEqual(c.fills.filter((f) => f.c === P.yellow && f.y >= 124 && f.y < 124 + D.IDENT_H), [], 'no yellow under the wordmark');
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

test('the continuity voice says it over the ident, never over the break bumper; Open-Meteo is credited as its licence asks', () => {
  assert.equal(IDENT_VOICE, 'This is GLOBIT 24, AI-produced news.');
  assert.ok(CONTINUITY.script.some((l) => l.text === IDENT_VOICE), 'a line the server voices');
  for (const s of [10, 70, 130]) assert.doesNotMatch(continuityLine(s), /AI/, 'the bumper says the channel\'s name and when it is back, nothing more');
  assert.equal(weatherCredit('OPEN-METEO · GDACS'), 'DATA: OPEN-METEO.COM (CC BY 4.0) · GDACS');
  assert.ok(weatherCredit('OPEN-METEO').startsWith(rights.classes['open-meteo'].onAir));
});
