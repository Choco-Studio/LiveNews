// The AI disclosure on screen (docs/publishing/compliance.md §3): the logo clean (owner, 18 Oct: no AI plate docked to
// the bug); the notice under it at a programme's start, after every break and every ten minutes, never over a
// re-staged guest; a clip's own notice and end card; the ident's statement; the recreation's AI RECREATION label, whole
// and inside a 9:16 or 1:1 clip's window; captions inside the window; and Open-Meteo's credit as its licence asks.
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
const { CONTINUITY, continuityLine } = await import('../public/js/ads/index.js');
const { CHANNEL, programmeWording } = await import('../server/compliance/disclosure.js');
const rights = (await import('../server/compliance/credits.js')).loadRights();

const yellowIn = (ctx, y0, y1) => ctx.fills.filter((f) => f.c === P.yellow && f.y >= y0 && f.y < y1);
const topRow = (over = {}) => ({ onAt: 0, replay: false, program: null, programIn: null, programOut: null, clock: '12:00', ...over });
const scene = (over = {}) => ({ shot: 'wide', ticker: [], program: { id: 'world-now', title: 'WORLD NOW', theme: 'world' }, programTagUntil: 60, ...over });
/** Run a Graphics from 0 to t at 10 Hz with `sceneAt(t)`; returns the package and a fresh context drawn at t. */
function runTo(t, sceneAt, g = new Graphics({ now: () => 0 }), from = 0) {
  for (let k = from; k <= t + 1e-9; k += 0.1) g.update(k, sceneAt(k));
  const ctx = fakeCtx();
  g.render(ctx, t, sceneAt(t));
  return { g, ctx };
}
const noticeDrawn = (ctx, L = D.noticeLayout(D.FRAME)) => ctx.fills.some((f) => f.c === P.black && f.x === L.x && f.y === L.y && f.w === L.w && f.h === L.h);

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
  // the old mark's API is gone, so nothing can draw it again by mistake
  for (const name of ['drawMark', 'markWidth', 'markOpen', 'MARK_TIMING']) assert.equal(D[name], undefined, name);
});

test('the notice: AI-PRODUCED NEWS · PRESENTERS ARE AI CHARACTERS · FACTS FROM CREDITED SOURCES, in the server\'s words', () => {
  assert.equal(D.NOTICE_LINE, 'AI-PRODUCED NEWS · PRESENTERS ARE AI CHARACTERS · FACTS FROM CREDITED SOURCES');
  assert.equal(D.NOTICE_LINE, CHANNEL.notice);
  for (const id of ['world-now', 'world-weather', 'full-time', 'pay-attention', 'cosmos']) {
    assert.equal(programmeWording(id).noun, D.nounOf(id), id);
    assert.equal(programmeWording(id).notice, D.noticeParts(D.nounOf(id)).join(' · '), id);
  }
  assert.equal(D.noticeParts('FORECAST')[0], 'AI-PRODUCED FORECAST');
  // one line under the top row in the full frame, inside action-safe and clear of the clock's column
  const L = D.noticeLayout({ active: false });
  assert.equal(L.rows.length, 1);
  assert.equal(L.x, TOP.x);
  assert.equal(L.y, TOP.y + TOP.h + 1, '1 px under the bug');
  assert.ok(L.x + L.w <= W - TOP.x, `inside action-safe: ends at ${L.x + L.w}`);
  assert.ok(L.cap * 5 >= 16, 'the micro face: 25 px capitals on 1080');
  // drawn: a black plate (no yellow box), white then silver type, the programme's accent between the parts
  const ctx = fakeCtx();
  D.drawNotice(ctx, L, 1, P.red);
  assert.equal(ctx.depth, 0);
  assert.ok(noticeDrawn(ctx, L));
  assert.deepEqual(yellowIn(ctx, 0, 216), [], 'no yellow');
  // half wiped in: clipped to its left half
  const half = fakeCtx();
  D.drawNotice(half, L, 0.5);
  assert.ok(half.clips.some((c) => c.w === Math.round(L.w / 2)));
  assert.equal(D.drawNotice(fakeCtx(), L, 0), 0, 'nothing at 0');
});

test('the notice comes under the programme\'s name as the programme starts, holds, and leaves; it comes back every ten minutes', () => {
  D.setFrame(null);
  const T = D.NOTICE_TIMING;
  const open = (k) => scene({ shot: k < 0.2 ? 'open' : 'wide' });
  // before it is due: nothing; just after the graphics come on, under the programme's name
  assert.ok(!noticeDrawn(runTo(0.2 + T.delay - 0.15, open).ctx), 'not before it is due');
  const at2 = runTo(2, open);
  assert.ok(noticeDrawn(at2.ctx), 'on at 2 s, while WORLD NOW is named');
  assert.ok(at2.g.tagIn !== null && at2.g.tagIn <= 2, 'the programme name is up too');
  assert.ok(!noticeDrawn(runTo(0.2 + T.delay + T.hold + T.wipeOut + 0.3, open).ctx), `gone after ${T.hold} s`);
  assert.ok(!noticeDrawn(runTo(300, open).ctx), 'not in between');
  // regular intervals: every ten minutes after its last showing, for `again` s
  const again = runTo(0.2 + T.delay + T.every + 2, open);
  assert.ok(noticeDrawn(again.ctx), 'back ten minutes in');
  assert.equal(again.g.notice.shown, 2);
  assert.ok(!noticeDrawn(runTo(0.2 + T.delay + T.every + T.again + T.wipeOut + 0.5, open).ctx), `for ${T.again} s`);
  assert.equal(T.every, 600);
});

test('after a break the notice comes back with the graphics; it never stands over a re-staged guest or a picture', () => {
  D.setFrame(null);
  const T = D.NOTICE_TIMING;
  // a break at 100-160 s: the graphics come on again at 160, the notice with them
  const withBreak = (k) => scene({ shot: k >= 100 && k < 160 ? 'ad' : 'wide' });
  assert.ok(noticeDrawn(runTo(160 + T.delay + 1, withBreak).ctx), 'after the interruption');
  // a recreation on screen when it falls due: it waits, the RECREATION label keeps the top right to itself
  const rec = { name: 'ANA SILVA', role: 'MAYOR OF LISBON', line: 'RECREATION — WORDS FROM PUBLIC STATEMENTS', credit: 'SOURCE: HARBOUR HERALD' };
  const guest = (k) => scene({ shot: k < 0.2 ? 'open' : 'location', recreation: k < 20 ? rec : null });
  const during = runTo(5, guest);
  assert.ok(!noticeDrawn(during.ctx), 'not over the guest');
  assert.ok(during.ctx.fills.some((f) => f.c === P.yellow && f.y === RECREATION.y), 'the RECREATION label is there');
  assert.equal(during.g.notice.shown, 0);
  // a notice on screen when the guest arrives ends at once
  const arrives = (k) => scene({ shot: 'wide', recreation: k >= 3 ? rec : null });
  assert.ok(noticeDrawn(runTo(2.5, arrives).ctx));
  assert.ok(!noticeDrawn(runTo(3.2, arrives).ctx), 'gone the frame the guest is on');
  // cut short before it was up NOTICE_TIMING.least s: back in full once the guest has gone
  const visit = (k) => scene({ shot: 'wide', recreation: k >= 3 && k < 10 ? rec : null });
  const back = runTo(11, visit);
  assert.ok(noticeDrawn(back.ctx), 'back after the guest');
  assert.equal(back.g.notice.hold, T.hold, 'at full length');
  // a picture (its credit under the clock), the headline frame: it waits for a shot it can stand on
  const pictures = (k) => scene({ shot: k < 0.2 ? 'open' : k < 30 ? 'full' : 'wide' });
  assert.ok(!noticeDrawn(runTo(10, pictures).ctx), 'not over a picture, even late');
  assert.ok(noticeDrawn(runTo(31, pictures).ctx), 'on the first studio shot');
  // the studio wall showing a credited picture (its credit under the clock): it waits for the wall to change
  const credited = { storyId: 's1', imageCredit: 'PHOTO: HARBOUR HERALD', imageLabel: 'EVENT' };
  const wall = (k) => scene({ shot: 'wide', wall: k < 20 ? { mode: 'image', storyId: 's1' } : { mode: 'logo' }, images: new Map([['s1', { small: {} }]]), rundown: [credited] });
  assert.ok(!noticeDrawn(runTo(10, wall).ctx), 'not beside a picture credit');
  assert.ok(noticeDrawn(runTo(21, wall).ctx), 'once the wall has no picture');
  // a board (its title sits just under the top row): never; the weather centre's forecaster: yes
  const boards = (k) => scene({ shot: k < 0.2 ? 'open' : k < 40 ? 'fact' : 'close' });
  assert.ok(!noticeDrawn(runTo(30, boards).ctx), 'not over a board, however long');
  assert.ok(noticeDrawn(runTo(41, boards).ctx), 'on the presenter\'s close-up after it');
  const weather = (k) => scene({ shot: k < 0.2 ? 'open' : 'weather', program: { id: 'world-weather', title: 'WORLD WEATHER', theme: 'weather' } });
  assert.ok(noticeDrawn(runTo(3, weather).ctx, D.noticeLayout(D.FRAME, 'FORECAST')), 'in the weather centre, at once');
  assert.deepEqual([...D.NOTICE_SHOTS].sort(), ['close', 'weather', 'wide']);
});

test('the notice reports each showing to the recorder (the publish gate reads the recording); the vertical picture never', async () => {
  const events = [];
  globalThis.__rec = { ev: (e) => events.push(e) };
  try {
    runTo(12, (k) => scene({ shot: k < 0.2 ? 'open' : 'wide' }));
    assert.deepEqual(events.map((e) => e.on), [true, false]);
    assert.equal(events[0].text, D.NOTICE_LINE);
    assert.equal(events[0].type, 'notice');
    events.length = 0;
    const { ClipGraphics, VerticalGraphics } = await import('../public/js/clip/graphics.js');
    // the horizontal clip master draws it as on air (a whole programme is uploaded from it), and says so
    const clip = runTo(5, (k) => scene({ shot: k < 0.2 ? 'open' : 'wide' }), new ClipGraphics({ now: () => 0 }));
    assert.ok(noticeDrawn(clip.ctx, D.clipNoticeLayout('horizontal')));
    assert.deepEqual(events.map((e) => e.on), [true]);
    events.length = 0;
    // the vertical master draws no notice of its own: a vertical clip carries its notice card
    runTo(12, (k) => scene({ shot: k < 0.2 ? 'open' : 'wide' }), new VerticalGraphics({ now: () => 0 }));
    assert.deepEqual(events, [], 'a vertical clip carries its own notice card');
  } finally {
    delete globalThis.__rec;
  }
});

test('a clip frame (?frame=9x16): the bug inside the window, no LIVE, no clock; the notice stacks inside it', () => {
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
  const L = D.noticeLayout(f);
  assert.equal(L.rows.length, 3, 'three rows, each part whole');
  assert.ok(L.x >= f.x && L.x + L.w <= f.x + f.w, `inside the window: ${L.x}..${L.x + L.w}`);
  D.setFrame(null);
});

test('a clip\'s own notice: under the bug (horizontal), a super over the stage\'s foot (vertical); the end card says it', async () => {
  const { drawNoticeCard, drawEndCard, END_CARD_NOTICE, NOTICE_SECONDS } = await import('../public/js/clip/cards.js');
  const { SAFE, V } = await import('../public/js/clip/layout.js');
  assert.deepEqual([...END_CARD_NOTICE], D.noticeParts('NEWS'));
  assert.equal(NOTICE_SECONDS, D.NOTICE_TIMING.clip);
  const h = fakeCtx();
  drawNoticeCard(h, { format: 'horizontal' });
  assert.ok(noticeDrawn(h, D.clipNoticeLayout('horizontal')));
  const v = fakeCtx();
  drawNoticeCard(v, { format: 'vertical', accent: P.red });
  const L = D.clipNoticeLayout('vertical');
  assert.ok(v.fills.some((f) => f.c === P.ink && f.y === L.y && f.h === L.h), 'the super\'s ink plate');
  assert.ok(v.fills.some((f) => f.c === P.red && f.x === SAFE.x && f.w === 2), 'the accent bar at its left');
  assert.ok(v.fills.every((f) => f.x >= SAFE.x && f.x + f.w <= SAFE.right && f.y >= V.stage.y && f.y + f.h <= V.stage.y + V.stage.h), 'inside the safe column, over the stage');
  // the quiz's one-line hook holds the top row's right end: the notice goes 5 px lower
  assert.equal(D.clipNoticeLayout('horizontal', { profile: 'tall' }).y, D.clipNoticeLayout('horizontal').y + 5);
  // the end card draws without error in both formats at its last frame
  for (const format of ['vertical', 'horizontal']) {
    const c = fakeCtx();
    drawEndCard(c, 2.5, { format, programme: 'WORLD NOW' });
    assert.equal(c.depth, 0, format);
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
  D.drawIdentLine(ctx, W / 2, 124);
  assert.ok(ctx.texts >= 2, 'two rows of type');
  assert.deepEqual(ctx.fills.filter((f) => f.c === P.yellow), [], 'no plate');
  const { drawIdentScene } = await import('../public/js/scenes/opens/ident.js');
  const c = fakeCtx();
  drawIdentScene(c, 2, { variant: 'dusk' });
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

test('the continuity voice says it at every break; Open-Meteo is credited as its licence asks', () => {
  for (const l of CONTINUITY.script) assert.match(l.text, /^This is GLOBIT 24, AI-produced news\. /);
  assert.match(continuityLine(10), /AI-produced news/);
  assert.equal(weatherCredit('OPEN-METEO · GDACS'), 'DATA: OPEN-METEO.COM (CC BY 4.0) · GDACS');
  assert.ok(weatherCredit('OPEN-METEO').startsWith(rights.classes['open-meteo'].onAir));
});
