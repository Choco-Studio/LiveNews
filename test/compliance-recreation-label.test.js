// The RECREATION label cannot be switched off (owner, 18 Oct: the channel's AI plate goes, the recreation's label
// stays exactly as it is; docs/publishing/compliance.md §3.4, §5). IN THEIR WORDS re-stages a real public figure's words:
// the deep-fake case of the AI Act (Art. 50(4), first subparagraph), labelled in every frame of the piece, top right,
// with the yellow plate and its double-struck AI. Nothing a booking, a scene, an item or an option says can take it off,
// nothing else is drawn over it, and the publish check refuses a clip that loses it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

function fakeCtx() {
  return {
    depth: 0,
    fills: [],
    fillStyle: '#000',
    globalAlpha: 1,
    imageSmoothingEnabled: false,
    save() { this.depth++; },
    restore() { this.depth--; },
    beginPath() {},
    rect() {},
    clip() {},
    translate() {},
    putImageData() {},
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    fillRect(x, y, w, h) { this.fills.push({ x, y, w, h, c: this.fillStyle }); },
    drawImage() {},
  };
}
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => fakeCtx() }) };

const { P } = await import('../public/js/palette.js');
const D = await import('../public/js/graphics/disclosure.js');
const { recreationOf, recreationLayout, drawRecreation, RECREATION } = await import('../public/js/graphics/recreation.js');
const { Graphics } = await import('../public/js/graphics/index.js');
const { ClipGraphics } = await import('../public/js/clip/graphics.js');
const { disclosureFor } = await import('../server/compliance/disclosure.js');
const { checkClip, clipCards } = await import('../server/compliance/clips.js');
const { bookGuest, speakerProfile, provenanceLine } = await import('../server/guests/restage.js');
const { ComplianceRegister } = await import('../server/compliance/registry.js');

const LINE = 'RECREATION — WORDS FROM PUBLIC STATEMENTS';
const markPlate = (ctx) => ctx.fills.find((f) => f.c === P.yellow && f.y === RECREATION.y);

test('whatever the booking says, the label reads AI RECREATION — WORDS FROM PUBLIC STATEMENTS with a source', () => {
  const tries = [
    null,
    {},
    { label: false },
    { label: null },
    { label: { line: '', credit: '' } },
    { label: { line: 'NONE', credit: '' } },
    { label: { line: 'OFF' }, strap: { name: 'ANA SILVA' } },
    { label: { line: 'LIVE INTERVIEW', credit: 'SOURCE: HARBOUR HERALD' }, strap: { name: 'ANA SILVA', role: 'MAYOR OF LISBON' } },
    { show: false, recreation: false, labelled: false, strap: { name: 'ANA SILVA' } },
  ];
  for (const booking of tries) {
    const rec = recreationOf(booking, { quoteRef: { outlet: 'Harbour Herald' } });
    assert.equal(rec.line, LINE, JSON.stringify(booking));
    assert.match(rec.credit, /^SOURCE: /, JSON.stringify(booking));
    const L = recreationLayout(rec, { active: false, x: 0, w: 384 });
    const mark = L.plates.find((p) => p.role === 'mark');
    assert.ok(mark && mark.ai && mark.color === P.yellow && mark.text === 'RECREATION', 'the yellow plate with the double-struck AI');
    assert.ok(L.plates.some((p) => p.role === 'credit'), 'and its source');
  }
});

test('drawRecreation has no switch: no option, environment or flag can skip a plate', () => {
  // its only early exit is "no recreation at all"
  const src = fs.readFileSync(new URL('../public/js/graphics/recreation.js', import.meta.url), 'utf8');
  const body = src.slice(src.indexOf('export function drawRecreation'), src.indexOf('\n}\n', src.indexOf('export function drawRecreation')));
  assert.deepEqual(body.match(/return\b[^;]*;/g), ['return;'], 'one return: when there is no recreation');
  assert.ok(!/process\.env|localStorage|location|\.label\s*===\s*false|options|opts/.test(body), 'nothing reads a switch');
  const ctx = fakeCtx();
  drawRecreation(ctx, recreationOf({ strap: { name: 'ANA SILVA' } }), P.cyan, D.FRAME, { label: false, off: true });
  assert.ok(markPlate(ctx), 'an extra argument changes nothing');
});

test('on air and in a clip the label is drawn in every frame of the piece, and no notice with it', () => {
  D.setFrame(null);
  const rec = recreationOf({ strap: { name: 'ANA SILVA', role: 'MAYOR OF LISBON' }, label: { line: LINE, credit: 'SOURCE: HARBOUR HERALD' } });
  // the scene says everything it could to hide it: none of it is a switch the graphics read
  const scene = (k) => ({ shot: k < 0.2 ? 'open' : k < 15 ? 'wide' : 'location', ticker: [], program: { id: 'world-now', title: 'WORLD NOW', theme: 'world' }, recreation: rec, labels: false, recreationLabel: false, disclosure: 'off', subtitles: false });
  for (const make of [() => new Graphics({ now: () => 0 }), () => new ClipGraphics({ now: () => 0 })]) {
    const g = make();
    const drawn = D.NOTICE_DRAWS.n;
    for (let k = 0; k <= 30; k += 0.1) {
      g.update(k, scene(k));
      if (k < 0.3) continue;
      const ctx = fakeCtx();
      g.render(ctx, k, scene(k));
      assert.ok(markPlate(ctx), `${g.constructor.name}: the label at ${k.toFixed(1)} s`);
    }
    assert.equal(D.NOTICE_DRAWS.n, drawn, `${g.constructor.name}: no notice over the guest`);
  }
});

test('the server keeps the label and the platforms\' flags whatever an item asks; the publish check refuses a clip that loses it', () => {
  const name = 'Ana Silva';
  const outlet = 'Harbour Herald';
  const words = 'We will publish the full plan for the old town next week.';
  const booking = bookGuest(speakerProfile(name, `${name}, the mayor of Lisbon, opened the line. "${words}" she said.`), { outlet });
  const hand = provenanceLine(booking, outlet, 's1');
  const ep = {
    id: 'e1',
    program: { id: 'world-now', title: 'WORLD NOW' },
    storyIds: ['s1'],
    guests: { [booking.id]: booking },
    segments: [
      { type: 'story', storyId: 's1', headline: 'Tram line opens in Lisbon', text: `Lisbon has opened its new tram line. ${hand}`, linkKind: 'restage', link: 'R1', source: outlet },
      { type: 'cross', part: 'piece', kind: 'restage', anchor: 'R1', reporter: booking.id, recreation: true, text: words, quoteRef: { outlet, by: name }, storyId: 's1', source: outlet },
    ],
  };
  const d = disclosureFor({ kind: 'short', episode: ep, labels: { recreation: false }, recreationLabel: false, platforms: ['youtube', 'tiktok', 'instagram', 'facebook'] });
  assert.equal(d.labels.recreation, 'AI RECREATION — WORDS FROM PUBLIC STATEMENTS');
  assert.equal(d.platforms.youtube.required, true);
  assert.equal(d.platforms.tiktok.required, true);
  assert.equal(d.platforms.instagram.required, true);
  assert.equal(d.platforms.facebook.manualLabel, true);
  // a 9:16 crop of the 16:9 frame loses the top-right label: refused, whatever options the caller passes
  const reg = new ComplianceRegister({});
  reg.recordReview('e1', { by: 'owner', checks: { quoteAgainstSource: true }, verdict: 'approve' });
  const tl = [
    { start: 0, end: 4, text: 'Lisbon has opened its new tram line.', segIndex: 0, kind: 'speech', quote: false },
    { start: 4, end: 6, text: hand, segIndex: 0, kind: 'provenance', recreationId: booking.id, quote: false },
    { start: 6.5, end: 10, text: words, segIndex: 1, kind: 'recreation', recreationId: booking.id, quote: true },
  ];
  const clip = { id: 'c1', kind: 'short', cards: clipCards(), text: 'AI-produced news: presenters are AI characters.', episode: ep, range: { start: 4, end: 10.4 }, timeline: tl, platforms: ['youtube'], flags: { youtube: { containsSyntheticMedia: true, selfDeclaredMadeForKids: false } }, frame: { crop: { x: 132, y: 0, w: 121, h: 216 }, output: { w: 1080, h: 1920 }, window: null }, label: false, recreationLabel: false };
  for (const opts of [{}, { label: false }, { recreationLabel: false, skipLabel: true }, { requireReview: false }]) {
    const r = checkClip(clip, { now: Date.parse('2026-10-17T12:00:00Z'), calendar: { generatedAt: '2026-10-17T12:00:00Z', elections: [] }, register: reg, ...opts });
    assert.ok(r.violations.some((v) => v.rule === 'label-out-of-frame'), JSON.stringify(opts));
  }
});
