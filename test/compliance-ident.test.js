// The channel's ident is the AI disclosure on air (owner, 18 Oct: "vale, deja solo esta versión. Durante el programa no
// hace falta que salga" and "en los anuncios no lo pongas"; docs/publishing/compliance.md §2.10, §3.1): it airs before
// every programme, when the channel comes back from its break, and before a filler break long after the last one; the
// stream never runs 15 minutes without it on a real day's schedule; and no advert, break bumper, promo or countdown
// frame ever carries the notice.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/** A canvas world where every context records nothing and accepts everything (the ads cache art on their own canvases). */
function fakeWorld() {
  const makeCtx = (cv) =>
    new Proxy(
      { canvas: cv },
      {
        get(t, p) {
          if (p in t) return t[p];
          if (p === 'createImageData') return (a, b) => ({ width: typeof a === 'object' ? a.width : a, height: typeof a === 'object' ? a.height : b, data: new Uint8ClampedArray((typeof a === 'object' ? a.width * a.height : a * b) * 4) });
          if (p === 'getImageData') return (x, y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
          if (p === 'measureText') return () => ({ width: 10 });
          if (p === 'createPattern' || p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop() {} });
          return () => {};
        },
        set(t, p, v) {
          t[p] = v;
          return true;
        },
      },
    );
  const doc = {
    createElement() {
      const cv = { width: 300, height: 150 };
      let ctx = null;
      cv.getContext = () => (ctx ||= makeCtx(cv));
      return cv;
    },
  };
  return { doc, makeCtx };
}
const world = fakeWorld();
globalThis.document ??= world.doc;

const { CHANNEL, identBefore, IDENT_AIR } = await import('../public/js/pace.js');
const D = await import('../public/js/graphics/disclosure.js');
const { ADS, CONTINUITY, IDENT_VOICE, continuityLine } = await import('../public/js/ads/index.js');
const cards = await import('../public/js/scenes/cards.js');
const { Graphics } = await import('../public/js/graphics/index.js');
const { measureIdentGaps } = await import('../tools/compliance/ident-gaps.mjs');
const { IDENT_RULES } = await import('../server/compliance/clips.js');

test('the rule: the ident before every programme (a replay too), before a filler break only once its refresh has passed', () => {
  assert.equal(identBefore({ kind: 'episode' }), true);
  assert.equal(identBefore({ kind: 'episode', replay: true }, 10), true, 'every programme, however soon after the last');
  assert.equal(identBefore({ kind: 'break', ads: 2 }, 3600), false, 'an ordinary break never: the programme after it opens with one');
  assert.equal(identBefore({ kind: 'break', filler: true }, CHANNEL.ident.refresh - 1), false);
  assert.equal(identBefore({ kind: 'break', filler: true }, CHANNEL.ident.refresh), true);
  assert.equal(IDENT_AIR, CHANNEL.ident.hold + CHANNEL.stinger / 2);
  assert.ok(CHANNEL.ident.hold >= 4, 'long enough to read two rows');
});

test('a real day\'s schedule: never 15 minutes without the ident (weekday and Saturday, programmes at their longest, a long outage)', async () => {
  const MONDAY = Date.parse('2026-10-19T00:00:00+01:00');
  const SATURDAY = Date.parse('2026-10-24T00:00:00+01:00');
  for (const [label, run] of [
    ['weekday, typical lengths', { start: MONDAY, lengths: 'mid' }],
    ['weekday, longest', { start: MONDAY, lengths: 'max' }],
    ['Saturday, longest', { start: SATURDAY, lengths: 'max' }],
    ['weekday, no programme 03:00-07:00', { start: MONDAY, lengths: 'max', outage: { from: MONDAY + 3 * 3600_000, to: MONDAY + 7 * 3600_000 } }],
  ]) {
    const r = await measureIdentGaps({ ...run, hours: 24 });
    assert.ok(r.longest <= IDENT_RULES.maxGap, `${label}: ${Math.round(r.longest)} s without the ident`);
    const programmes = r.items.filter((x) => x.kind === 'episode');
    assert.ok(programmes.length > 100, `${label}: ${programmes.length} programmes`);
    assert.ok(programmes.every((x) => x.ident), `${label}: every programme opens with it`);
    assert.ok(r.items.filter((x) => x.kind === 'break' && !x.filler).every((x) => !x.ident), `${label}: never before an ordinary break`);
    if (run.outage) assert.ok(r.items.some((x) => x.filler && x.ident), `${label}: a long run of filler breaks gets it at a boundary`);
  }
});

test('no advert, break bumper, promo or countdown frame carries the notice; the ident does', () => {
  const prevDoc = globalThis.document;
  globalThis.document = world.doc;
  try {
    const before = D.NOTICE_DRAWS.n;
    for (const ad of ADS) {
      const ctx = world.makeCtx({ width: 384, height: 216 });
      for (let dt = 0; dt < ad.duration + 0.5; dt += 0.25) ad.draw(ctx, dt, dt, { line: -1, speaking: false, duration: ad.duration });
    }
    const ctx = world.makeCtx({ width: 384, height: 216 });
    for (let dt = 0; dt < 8; dt += 0.25) {
      cards.drawBreakBumper(ctx, dt, dt, { left: 60 - dt, total: 60, next: 'TECH BYTES' });
      cards.drawPromoCard(ctx, dt, dt, { next: { id: 'tech-bytes', title: 'TECH BYTES', tagline: 'THE FUTURE', presenters: [] }, label: 'UP NEXT', footer: 'AFTER THE BREAK' });
      cards.drawCountdownCard(ctx, dt, dt, { left: 30 - dt, next: { title: 'NEWS IN 60' }, at: 0 });
    }
    // the graphics over a break: the ADVERTISEMENT tag and its countdown, nothing else
    const g = new Graphics({ now: () => 0 });
    for (let k = 0; k < 60; k += 0.5) {
      const sc = { shot: k < 4 ? 'ident' : 'ad', card: k < 4 ? { kind: 'break' } : { ad: ADS[0] }, ticker: [], adBreak: { until: 60 } };
      g.update(k, sc);
      g.render(ctx, k, sc);
    }
    assert.equal(D.NOTICE_DRAWS.n, before, 'nothing inside the break draws the notice');
    for (let dt = 0; dt < 6; dt += 0.5) cards.drawIdentCard(ctx, dt, dt, { variant: 'dusk' });
    assert.ok(D.NOTICE_DRAWS.n > before, 'the ident draws it');
  } finally {
    globalThis.document = prevDoc;
  }
  // the continuity voice: the channel's name and when it is back at the bumper, the disclosure only over the ident
  for (const s of [20, 70, 130]) assert.doesNotMatch(continuityLine(s), /AI/);
  assert.equal(IDENT_VOICE, 'This is GLOBIT 24, AI-produced news.');
  assert.ok(CONTINUITY.script.some((l) => l.text === IDENT_VOICE));
});

test('the director opens every programme with the ident, before the programme\'s own titles', () => {
  const src = fs.readFileSync(new URL('../public/js/director.js', import.meta.url), 'utf8');
  const body = src.slice(src.indexOf('  async playEpisode('), src.indexOf('\n  }\n', src.indexOf('  async playEpisode(')));
  const ident = body.indexOf('this.playIdent()');
  const open = body.indexOf("this.setShot('open'");
  assert.ok(ident > 0 && open > ident, 'playIdent before the open');
  assert.match(body.slice(ident - 80, ident), /identBefore\(episode/);
});

test('the ident card: the channel\'s own shot, the ident sting, the continuity voice saying what the channel is', async () => {
  const { Director } = await import('../public/js/director.js');
  const spoken = [];
  const sfx = [];
  const audio = { setVoices() {}, sfx: (n) => sfx.push(n), playTune: () => ({ stop() {} }), async speak(text, role) { spoken.push({ text, role }); } };
  const director = new Director({ audio, channel: { name: 'GLOBIT 24', slogan: '', presenters: {} } });
  director.voices = { refreshAds() {}, prepareAd() {}, adLine: () => null };
  const shots = [];
  const setShot = director.setShot.bind(director);
  director.setShot = (shot, extra = {}) => {
    setShot(shot, extra);
    shots.push({ shot, card: extra.card ?? null, t: performance.now() / 1000 });
  };
  const t0 = performance.now() / 1000;
  await director.playIdent();
  const t1 = performance.now() / 1000;
  assert.deepEqual(shots.map((s) => [s.shot, s.card]), [['ident', null]], 'the ident, not the break bumper');
  assert.deepEqual(spoken, [{ text: IDENT_VOICE, role: 'ad' }]);
  assert.ok(sfx.includes('jingle'), 'the ident sting');
  assert.ok(t1 - t0 >= CHANNEL.ident.hold - 0.1, `held ${(t1 - t0).toFixed(2)} s`);
  assert.ok(director.sinceIdent() < CHANNEL.ident.hold + 1, 'counted from the ident\'s cut');
  // a filler break right after it: no second ident; an ordinary break: none
  shots.length = 0;
  director.playAd = async () => {};
  await director.playBreak({ kind: 'break', id: 'f1', filler: true, ads: 1, next: null });
  assert.deepEqual(shots.filter((s) => s.shot === 'ident').map((s) => s.card?.kind), ['break'], 'only the bumper');
  // a filler break long after the last ident: the ident first, at the boundary, then the bumper
  director.identAt -= CHANNEL.ident.refresh + 1;
  shots.length = 0;
  await director.playBreak({ kind: 'break', id: 'f2', filler: true, ads: 1, next: null });
  const idents = shots.filter((s) => s.shot === 'ident').map((s) => s.card?.kind || 'channel');
  assert.deepEqual(idents, ['channel', 'break'], 'the channel\'s ident before the break, never inside it');
});
