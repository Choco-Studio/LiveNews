// The locator board (public/js/graphics/locator.js): what a story with no cleared picture shows behind its headline.
// Its country lit on the channel's own map against dimmed neighbours, framed in the upper right clear of the TOP
// STORIES tag and the headline block, a city's dot, the place's name on an accent-barred plate; never a flat sea.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';

function fakeCanvas() {
  const ops = [];
  const cv = { width: 300, height: 150, ops };
  const ctx = {
    canvas: cv,
    fillStyle: '#000',
    imageSmoothingEnabled: false,
    createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    putImageData(img) {
      cv.img = img;
    },
    drawImage(src) {
      ops.push({ op: 'image', src });
    },
    fillRect(x, y, w, h) {
      ops.push({ op: 'fill', x, y, w, h, c: this.fillStyle });
    },
    save() {},
    restore() {},
    beginPath() {},
    rect() {},
    clip() {},
    measureText: () => ({ width: 0 }),
  };
  cv.getContext = () => ctx;
  return cv;
}

let mod;
let P;
before(async () => {
  globalThis.document = { createElement: fakeCanvas };
  const wm = await import('../public/js/scenes/worldmap.js');
  wm.warmMapData();
  mod = await import('../public/js/graphics/locator.js');
  ({ P } = await import('../public/js/palette.js'));
});
after(() => {
  delete globalThis.document;
});

const hex = (c) => `#${[c & 255, (c >> 8) & 255, (c >> 16) & 255].map((v) => v.toString(16).padStart(2, '0')).join('')}`;

describe('the lit country', () => {
  test('a country is lit (fog, its edge silver) against dimmed neighbours, framed in the upper right', () => {
    const plan = mod.locatorPlan({ place: 'FRANCE', lat: 46.6, lon: 2.4, scope: 'country' });
    assert.ok(plan.region, 'France found on the map');
    const r = plan.region;
    assert.ok(r.x0 > 0 && r.y0 > 0 && r.x1 < 383 && r.y1 < 215, 'the whole country on the board');
    assert.ok((r.x1 - r.x0) / 384 <= 0.45 && (r.y1 - r.y0) / 216 <= 0.42, JSON.stringify(r));
    assert.ok(plan.pin.x > 180 && plan.pin.y < 100, 'the place in the upper right, clear of the headline block');
    // its pixel is lit; a pixel far from it on land is dimmed
    const lit = hex(plan.pixels[plan.pin.y * 384 + plan.pin.x]);
    assert.ok([P.fog, P.silver].includes(lit), lit);
    const colours = new Set(Array.from(plan.pixels, hex));
    assert.ok(colours.has(P.slate), 'neighbours dimmed');
    assert.ok(colours.has(P.navy) || colours.has(P.ink), "the map's own sea");
  });
  test('a small island is found by zooming in; a micro-state the land mask cannot tell apart gets the dot and the name only', () => {
    const jamaica = mod.locatorPlan({ place: 'JAMAICA', lat: 18.1, lon: -77.3, scope: 'country' });
    assert.ok(jamaica.region && jamaica.zoom > 8, JSON.stringify({ zoom: jamaica.zoom, region: jamaica.region }));
    const singapore = mod.locatorPlan({ place: 'SINGAPORE', lat: 1.35, lon: 103.8, scope: 'country' });
    assert.equal(singapore.region, null, 'never Johor lit as Singapore');
  });
  test('a city lights its country and keeps its own dot', () => {
    const kyiv = mod.locatorPlan({ place: 'KYIV', lat: 50.45, lon: 30.52, scope: 'city' });
    assert.ok(kyiv.region);
    assert.ok(kyiv.region.x0 <= kyiv.pin.x && kyiv.pin.x <= kyiv.region.x1);
  });
  test('no place, no board (the montage keeps its own field)', () => {
    assert.equal(mod.locatorPlan({ place: 'X' }), null);
    assert.equal(mod.prepareLocator(null), null);
  });
});

describe('the name and the dot', () => {
  test("a city's name beside its dot, a country's over its middle, never over the TOP STORIES tag or down into the headline", () => {
    const measure = (t) => t.length * 6;
    const city = mod.placeLayout({ w: 384, h: 216, pin: { x: 250, y: 74 }, region: null }, { place: 'Kyiv', scope: 'city', country: 'Ukraine' }, measure);
    assert.equal(city.title, 'KYIV');
    assert.equal(city.sub, 'UKRAINE');
    assert.ok(city.x > 250, 'to the right of the dot');
    const country = mod.placeLayout({ w: 384, h: 216, pin: { x: 250, y: 74 }, region: { x0: 200, y0: 40, x1: 300, y1: 110 } }, { place: 'Côte d’Ivoire', scope: 'country' }, measure);
    assert.equal(country.title, 'COTE D’IVOIRE');
    assert.ok(Math.abs(country.x + country.bw / 2 - 250) <= 1);
    for (const L of [city, country]) {
      assert.ok(L.y >= 40, 'below the TOP STORIES row');
      assert.ok(L.y + L.bh <= Math.round(216 * 0.46), 'above the headline block');
      assert.ok(L.x >= 13 && L.x + L.bw <= 384 - 13, 'inside action-safe');
    }
  });
  test('drawn: the lit map first, then the dot (accent square in black) and the plate with its accent bar', () => {
    const board = mod.prepareLocator({ place: 'KYIV', lat: 50.45, lon: 30.52, scope: 'city' });
    assert.ok(board?.canvas);
    const target = fakeCanvas();
    const ctx = target.getContext();
    mod.drawLocator(ctx, board, { place: 'KYIV', scope: 'city' }, { accent: P.red, dt: 2 });
    assert.equal(target.ops[0].op, 'image');
    assert.equal(target.ops[0].src, board.canvas);
    const fills = target.ops.filter((o) => o.op === 'fill');
    assert.ok(fills.some((f) => f.c === P.red && f.w === 5 && f.h === 5), 'the dot');
    assert.ok(fills.some((f) => f.c === P.ink && f.h === 13), 'the plate');
    assert.ok(fills.some((f) => f.c === P.red && f.w === 2 && f.h === 13), 'its accent bar');
    // before 0.2 s the name has not wiped in yet
    const early = fakeCanvas();
    mod.drawLocator(early.getContext(), board, { place: 'KYIV', scope: 'city' }, { accent: P.red, dt: 0.1 });
    assert.ok(!early.ops.some((o) => o.op === 'fill' && o.c === P.ink));
  });
});
