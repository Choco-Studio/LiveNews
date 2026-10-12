// SEVEN DAYS on air (owner 12 Oct: "Resumen semanal: sí, pero cúrratelo"): the weekly in the line-up at weekends, its
// own identity in the network's package (coral, the week's kickers, HOW THE WEEK UNFOLDED, its bed in the open's
// key), and the week in sixty seconds played the way the writer asks: each day over its own picture.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadChannel } from '../server/channel.js';
import { Station } from '../server/station.js';
import { P } from '../public/js/palette.js';
import { THEME_ACCENT } from '../public/js/cast.js';
import { strapContent } from '../public/js/graphics/strap.js';
import { STRAP } from '../public/js/graphics/layout.js';
import { measureText } from '../public/js/font.js';
import { boardTitle } from '../public/js/scenes/cards.js';
import { segmentContext } from '../public/js/v2/canvas25d/direction/context.js';
import { planShots } from '../public/js/v2/canvas25d/direction/shots.js';
import { resolveCue } from '../public/js/music/proposals/lofi/cuesheet.js';
import { PALETTES, PROGRAMMES } from '../public/js/music/proposals/lofi/palettes.js';
import { themeFor } from '../public/js/audio/themes.js';
import { parseTune } from '../public/js/audio/tune.js';

const channel = loadChannel();
const silent = { info() {}, warn() {}, error() {} };

test('SEVEN DAYS is in the line-up: the weekly, Paco and Lola, the rotation\'s last slot, on air at weekends only', () => {
  const p = channel.programs['seven-days'];
  assert.equal(p.kind, 'weekly');
  assert.equal(p.title, 'SEVEN DAYS');
  assert.deepEqual(p.presenters, ['paco', 'lola']);
  assert.equal(channel.rotation.at(-1), 'seven-days');
  assert.equal(THEME_ACCENT[p.theme], P.pink, 'its own accent: coral');
  let t = 0;
  const station = new Station({
    config: { queueSize: 1, clock: true, now: () => t },
    newsDesk: { stories: new Map(), uncovered: () => [], feedStatus: {}, lastRefresh: 0 },
    producer: { canProduce: () => true, produce: async () => null },
    chain: { status: () => [] },
    channel: () => channel,
    log: silent,
  });
  // Monday 12 Oct to Sunday 18 Oct 2026, mid-morning and late evening, London time
  for (let day = 12; day <= 18; day++) {
    for (const hour of ['10:12', '22:40']) {
      t = Date.parse(`2026-10-${day}T${hour}:00+01:00`);
      const weekend = day >= 17;
      assert.equal(station.rotationAllows(channel, 'seven-days'), weekend, `${day} Oct ${hour}: ${weekend ? 'on' : 'off'} air`);
    }
  }
});

test('the week\'s kickers: the day of each round-up item and the weekly\'s sections, whole on the strap, dark on coral', () => {
  const kickers = ['STORY OF THE WEEK', 'THE LATEST', 'THE WEEK IN NUMBERS', 'WORDS OF THE WEEK', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
  for (const kicker of kickers) {
    const c = strapContent({ kicker, category: 'world', headline: 'Canal reopens after a day-long closure', source: 'Ledger Line' }, { accent: P.pink });
    assert.equal(c.tag, kicker);
    assert.equal(c.tagColor, P.pink);
    assert.equal(c.tagStyle.color, P.black, `${kicker}: dark type on coral`);
    assert.ok(c.tagW <= (STRAP.right - STRAP.x) / 2, `${kicker}: the tag leaves the strap room for its source`);
    assert.equal(c.tagW, measureText(kicker) + 10, `${kicker}: never cut`);
  }
});

test('the boards keep the weekly\'s names: HOW THE WEEK UNFOLDED, THE WEEK IN NUMBERS', () => {
  assert.equal(boardTitle('timeline', { programId: 'seven-days' }), 'HOW THE WEEK UNFOLDED');
  assert.equal(boardTitle('timeline', { programId: 'world-now' }), 'HOW WE GOT HERE');
  assert.equal(boardTitle('numbers', { kicker: 'THE WEEK IN NUMBERS' }), 'THE WEEK IN NUMBERS');
  assert.equal(boardTitle('numbers', { kicker: 'STORY OF THE WEEK' }), 'BY THE NUMBERS');
  assert.equal(boardTitle('numbers', {}), 'BY THE NUMBERS');
});

/** An episode as the weekly writer makes it: the week in sixty seconds, one located day an item, with pictures. */
function weekly(programId = 'seven-days') {
  const day = (d, i, text, hasImage = true) => ({
    type: 'story', anchor: 'B', emotion: 'neutral', storyId: `s${i}`, headline: `Story ${i}`, source: 'Ledger Line', category: 'world', hasImage, cues: [],
    location: { place: 'TURIN, ITALY', lat: 45.07, lon: 7.69 }, feature: 'roundup', roundup: true, kicker: d, shot: 'full', text,
  });
  return {
    id: 'w1', program: { id: programId, title: 'SEVEN DAYS', theme: 'week' }, cast: { A: 'paco', B: 'lola' },
    segments: [
      { type: 'intro', anchor: 'A', text: 'Hello and welcome to SEVEN DAYS, the week on GLOBIT 24.' },
      day('MONDAY', 1, 'Now, the week in sixty seconds. Monday: a carmaker says it will close its plant near Turin by the end of next year.'),
      day('TUESDAY', 2, 'Tuesday: Tokyo\'s main stock index closed at a record high, driven by shares of chipmakers.'),
      day('WEDNESDAY', 3, 'Wednesday: a data centre powered by wind and geothermal energy has opened near Reykjavik.', false),
      { type: 'outro', anchor: 'A', text: 'That was the week. I\'m Paco Pixel.' },
    ],
  };
}

test('the week in sixty seconds: each day over its own picture from its first word (the reader only without one), never a run of maps', () => {
  const ep = weekly();
  for (const i of [1, 2]) {
    const plan = planShots(segmentContext(ep, i, {}));
    assert.equal(plan.length, 1, `day ${i}: one shot`);
    assert.equal(plan[0].shot, 'full', `day ${i}: its picture`);
    assert.equal(plan[0].at, 0);
  }
  const blind = planShots(segmentContext(ep, 3, {}));
  assert.equal(blind[0].shot, 'close', 'a day without a picture: its reader in vision');
  assert.ok(!blind.some((e) => e.shot === 'map'));
});

test('its bed is in its open\'s key, B-flat major with the 4th: under the headlines, the minute and And finally; story copy dry', () => {
  const tonic = parseTune(themeFor('seven-days')).tracks[0].events[1].midis[0] % 12;
  assert.equal(tonic, 10, 'B-flat');
  assert.equal(PROGRAMMES['seven-days'].tonic % 12, tonic);
  assert.equal(PALETTES['seven-days'].tonic % 12, tonic);
  const cue = (m, o = {}, c = {}) => resolveCue(m, { programId: 'seven-days', ...o }, c);
  assert.deepEqual([cue('headlines').song, cue('headlines').moment], ['seven-days', 'headlines']);
  assert.deepEqual([cue('roundup').song, cue('roundup').moment], ['seven-days', 'roundup']);
  assert.deepEqual([cue('finally').song, cue('finally').moment], ['seven-days', 'finally']);
  assert.equal(cue('outro').moment, 'signoff');
  assert.equal(cue('story').kind, 'silence', 'the story copy is dry (the bibles)');
  assert.equal(cue('story', {}, { bedUnderStories: 'soft' }).moment, 'story', 'the owner\'s soft switch');
  assert.equal(cue('story', { emotion: 'sad' }, { bedUnderStories: 'soft' }).kind, 'silence', 'never under grave news');
  assert.equal(cue('roundup', {}, { afterGrave: true }).kind, 'silence', 'nor the segment after it');
});
