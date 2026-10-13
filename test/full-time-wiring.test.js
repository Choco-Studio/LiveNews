import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import { pickBoard, storyBoards, storyBoard, factText, scoreBoard, chalkBoard, shareBoard, nextBoard, whoBoard, paceFor, shotMax, plainFact } from '../public/js/pace.js';
import { Director } from '../public/js/director.js';
import { planSegment } from '../public/js/v2/canvas25d/direction/index.js';

// FULL TIME's boards on air (docs/programmes/full-time.md §4-§6, build step 4) and the story boards IN PROPORTION,
// WHAT HAPPENS NEXT and WHO'S WHO on every programme that asks for them: pace picks a story's strongest board and never
// the type shown last when it has another; the cards draw each; SCORE CENTRE and COMING UP are board segments whose
// rows and leaves come in as the voice reaches them.

const SCORE = { a: 'Coventry', b: 'Newcastle', sa: 4, sb: 1, winner: 'Coventry', draw: false, sport: 'football' };
const WHO = [{ name: 'Frank Lampard', role: 'Coventry manager' }, { name: 'Eddie Howe', role: 'Newcastle manager' }];
const SHARE = { value: 'ONE IN FOUR', fraction: 0.25, lead: '', label: 'of the squad is injured' };
const NEXT = { when: 'SATURDAY', date: '2026-10-17', what: 'Coventry host Leeds' };
const KNOWN = ['Coventry are top', 'Newcastle are 14th'];

describe('FULL TIME: the boards in pace', () => {
  test('the strongest board first: the scoreline, the chalkboard, WHO\'S WHO, IN PROPORTION, WHAT HAPPENS NEXT, WHAT WE KNOW', () => {
    const seg = { score: SCORE, who: WHO, share: SHARE, next: NEXT, known: KNOWN };
    assert.deepEqual(storyBoards(seg, 'full-time').map((b) => b.kind), ['score', 'who', 'share', 'next', 'known']);
    assert.equal(storyBoard(seg, 'full-time'), SCORE);
    assert.equal(pickBoard({ who: WHO, known: KNOWN }, 'full-time').kind, 'who');
    assert.equal(pickBoard({ chalk: { yards: 30, sport: 'football' }, known: KNOWN }, 'full-time').kind, 'chalk');
  });

  test('never the same board type twice in a row when the story has another; its only board still shows', () => {
    const seg = { score: SCORE, who: WHO };
    assert.equal(pickBoard(seg, 'full-time', 'score').kind, 'who');
    assert.equal(pickBoard(seg, 'full-time', 'who').kind, 'score');
    assert.equal(pickBoard({ score: SCORE }, 'full-time', 'score').kind, 'score', 'a result is worth a repeat');
    assert.equal(pickBoard({}, 'full-time', 'score'), null);
  });

  test('each board only on its own data, only where its programme asks for it', () => {
    assert.equal(scoreBoard({ score: { ...SCORE, sb: undefined } }, 'full-time'), null);
    assert.equal(scoreBoard({ score: SCORE }, 'world-now'), null, 'a scoreline is FULL TIME\'s');
    assert.equal(chalkBoard({ chalk: { yards: 75, sport: 'football' } }, 'full-time'), null, 'past the board\'s 70');
    assert.equal(chalkBoard({ chalk: { yards: 30, sport: 'golf' } }, 'full-time'), null, 'a ground it does not draw');
    assert.equal(shareBoard({ share: { ...SHARE, fraction: 1.2 } }, 'world-now'), null);
    assert.equal(nextBoard({ next: { when: 'SATURDAY' } }, 'world-now'), null);
    assert.equal(whoBoard({ who: WHO.slice(0, 1) }, 'world-now'), null, 'two people or none');
    // the four programmes whose writers make IN PROPORTION, WHAT HAPPENS NEXT and WHO'S WHO now show them
    for (const id of ['world-now', 'tech-bytes', 'cosmos', 'money-minute', 'full-time']) {
      assert.ok(shareBoard({ share: SHARE }, id) && nextBoard({ next: NEXT }, id) && whoBoard({ who: WHO }, id), id);
    }
    assert.equal(whoBoard({ who: WHO }, 'news-60'), null, 'NEWS IN 60 has no boards of the kind');
    assert.equal(paceFor('full-time').shots.numbers, undefined, 'FULL TIME: THE NUMBER is its own segment, no BY THE NUMBERS');
  });

  test('no plain KEY FACT card in FULL TIME: a story without one of its boards stands on its picture; THE NUMBER keeps its card', () => {
    assert.equal(plainFact({ fact: '6-4 6-3' }, 'full-time'), null);
    assert.equal(plainFact({ fact: '6,000', feature: 'number' }, 'full-time'), '6,000');
    assert.equal(plainFact({ fact: '1.2 MILLION' }, 'world-now'), '1.2 MILLION', 'the other programmes keep theirs');
    const d = new Director({ audio: { mode: 'mute', setVoices() {}, stop() {}, playTune: () => ({ stop() {} }), sfx() {}, speak: () => Promise.resolve() }, channel: { name: 'GLOBIT 24', slogan: '', presenters: {} } });
    d.scene.program = { id: 'full-time', theme: 'sport' };
    d.scene.cast = { A: 'kai', B: 'rosa' };
    assert.ok(!d.storyBeats({ type: 'story', anchor: 'A', storyId: 's', text: 'Ana Vela won. She beat Lia Moreau.', fact: '6-4 6-3' }, true).includes('fact'));
    assert.ok(d.storyBeats({ type: 'story', anchor: 'A', storyId: 's', text: 'Coventry won. They beat Newcastle.', fact: '4-1', score: SCORE }, true).includes('fact'));
  });

  test('a board\'s hold reads its own words; SCORE CENTRE may hold its whole segment', () => {
    assert.match(factText({ score: SCORE }, 'full-time'), /Coventry 4 Newcastle 1/);
    assert.match(factText({ who: WHO }, 'world-now'), /Frank Lampard Coventry manager/);
    assert.match(factText({ score: SCORE, who: WHO }, 'full-time', 'score'), /Frank Lampard/, 'the rotation\'s board');
    assert.equal(shotMax('full-time', 'scores'), 40);
  });
});

/** A canvas whose context records fills and images (font.js draws text into its own offscreen canvases). */
function fakeCanvas(width = 384, height = 216) {
  const cv = { width, height };
  const ctx = {
    canvas: cv,
    fills: [],
    images: [],
    fillStyle: '#000',
    globalAlpha: 1,
    imageSmoothingEnabled: false,
    save() {},
    restore() {},
    fillRect(x, y, w, h) { this.fills.push({ c: this.fillStyle, x, y, w, h }); },
    drawImage(img, x = 0, y = 0) { this.images.push({ x, y, w: img?.width || 0, h: img?.height || 0 }); },
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
    putImageData() {},
    createImageData(w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
    getImageData(x, y, w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
    createPattern() { return {}; },
    measureText() { return { width: 0 }; },
  };
  for (const m of ['beginPath', 'rect', 'clip', 'moveTo', 'lineTo', 'arc', 'fill', 'stroke', 'closePath', 'setTransform', 'translate', 'scale', 'fillText', 'clearRect']) ctx[m] = () => {};
  cv.getContext = () => ctx;
  return cv;
}

describe('FULL TIME: the boards on the cards', () => {
  let cards;
  let P;
  before(async () => {
    globalThis.document = { createElement: () => fakeCanvas(300, 150) };
    cards = await import('../public/js/scenes/cards.js');
    ({ P } = await import('../public/js/palette.js'));
  });
  const draw = (o) => {
    const ctx = fakeCanvas().getContext('2d');
    cards.drawFactCard(ctx, 10, 3, { programId: 'full-time', accent: P.orange, source: 'Sky Sports', ...o });
    return ctx;
  };

  test('the scoreline in FULL TIME\'s orange (FT beside it), the chalkboard, the calendar, WHO\'S WHO, IN PROPORTION, WHAT HAPPENS NEXT', () => {
    assert.ok(draw({ score: SCORE }).fills.some((f) => f.c === P.orange && f.w === 26 && f.h === 12), 'the FT block in the accent');
    assert.ok(draw({ chalk: { yards: 30, sport: 'football' } }).fills.some((f) => f.c === P.darkGreen), 'the chalkboard');
    const cal = draw({ fixtures: [{ event: 'WALES V ALBANIA', date: '2026-10-14' }, { event: 'THE ASHES', date: '2026-11-21' }], title: 'COMING UP', leafTimes: [0, 0] });
    assert.equal(cal.fills.filter((f) => f.c === P.silver && f.w === 40 && f.h === 42).length, 2, 'two leaves');
    for (const o of [{ who: WHO }, { share: SHARE }, { next: NEXT }]) {
      const ctx = draw(o);
      assert.ok(ctx.fills.some((f) => f.c === P.black && f.x === 40 && f.w === 304), `${Object.keys(o)[0]}: the board's panel`);
    }
  });

  test('COMING UP: a leaf only once its date is read (leafTimes)', () => {
    const cal = draw({ fixtures: [{ event: 'WALES V ALBANIA', date: '2026-10-14' }, { event: 'THE ASHES', date: '2026-11-21' }], leafTimes: [0, Infinity] });
    assert.equal(cal.fills.filter((f) => f.c === P.silver && f.w === 40 && f.h === 42).length, 1);
  });
});

describe('FULL TIME: SCORE CENTRE and COMING UP as board segments', () => {
  const speakingDirector = () => {
    const spoken = [];
    const d = new Director({
      audio: {
        mode: 'mute',
        setVoices() {},
        stop() {},
        playTune: () => ({ stop() {} }),
        sfx() {},
        // the voice reaches each mark in turn, 20 ms apart
        speak: async (text, anchor, o) => {
          spoken.push(text);
          const marks = o.marks || [];
          for (let i = 0; i < marks.length; i++) {
            await new Promise((r) => setTimeout(r, 20));
            o.onMark(i);
          }
        },
      },
      channel: { name: 'GLOBIT 24', slogan: '', presenters: {} },
    });
    d.scene.program = { id: 'full-time', theme: 'sport' };
    d.scene.cast = { A: 'kai', B: 'rosa' };
    return { d, spoken };
  };

  test('SCORE CENTRE fills the frame and flips each row in as its line is read; no picture borrowed', async () => {
    const { d } = speakingDirector();
    const text = "Let's go through the scores. Northgate County beat Saltmarsh 3-2. Millbrook beat Ashcombe 2-1. Elsewhere, Bitport Comets beat Harbourside Herons 98-91.";
    const seg = { type: 'story', feature: 'scores', anchor: 'A', storyId: 'x1', hasImage: false, text, source: 'Pixelburg Sport', scoresTitle: "TODAY'S RESULTS", cues: [], scores: [
      { a: 'Northgate County', b: 'Saltmarsh', sa: 3, sb: 2, char: text.indexOf('Northgate') },
      { a: 'Millbrook', b: 'Ashcombe', sa: 2, sb: 1, char: text.indexOf('Millbrook') },
      { a: 'Bitport Comets', b: 'Harbourside Herons', sa: 98, sb: 91, char: text.indexOf('Elsewhere') },
    ] };
    d.scene.shotSince = -100;
    assert.equal(await d.playBoardSegment(seg, 0), true);
    assert.equal(d.scene.shot, 'scores');
    assert.equal(d.scene.storyId, null, 'the candidate\'s picture is not the board\'s');
    const t = d.scene.card.rowTimes;
    assert.equal(t.length, 3);
    assert.ok(t.every(Number.isFinite) && t[0] < t[1] && t[1] < t[2], `rows in order of reading: ${t}`);
    assert.equal(d.scene.card.title, "TODAY'S RESULTS");
    assert.equal(d.lastBoard, 'scores');
  });

  test('COMING UP: the calendar card, a leaf as each date is read; fewer than two dates is a story', async () => {
    const { d } = speakingDirector();
    const text = "Coming up in sport. On Wednesday, it's Starfield City against Glimmerford. On Thursday, Bitport Comets against Lanternhill Lynx.";
    const seg = { type: 'story', feature: 'fixtures', anchor: 'A', storyId: 'x1', hasImage: false, kicker: 'COMING UP', text, source: 'Pixelburg Sport', cues: [], fixtures: [
      { event: 'STARFIELD CITY V GLIMMERFORD', date: '2026-10-14', when: 'WEDNESDAY', sport: 'football', char: text.indexOf('On Wednesday') },
      { event: 'BITPORT COMETS V LANTERNHILL LYNX', date: '2026-10-15', when: 'THURSDAY', sport: 'basketball', char: text.indexOf('On Thursday') },
    ] };
    d.scene.shotSince = -100;
    assert.equal(await d.playBoardSegment(seg, 0), true);
    assert.equal(d.scene.shot, 'fact');
    assert.equal(d.scene.card.title, 'COMING UP');
    const t = d.scene.card.leafTimes;
    assert.ok(t.every(Number.isFinite) && t[0] < t[1], `${t}`);
    assert.equal(await d.playBoardSegment({ ...seg, fixtures: seg.fixtures.slice(0, 1) }, 0), false);
  });

  test('the v2 plan knows the board segment holds its whole length (its neighbours plan around it)', () => {
    const scores = [{ a: 'A', b: 'B', sa: 1, sb: 0 }, { a: 'C', b: 'D', sa: 2, sb: 2 }, { a: 'E', b: 'F', sa: 3, sb: 1 }];
    const ep = {
      program: { id: 'full-time', theme: 'sport' },
      presenters: { A: { id: 'kai' }, B: { id: 'rosa' } },
      segments: [
        { type: 'intro', anchor: 'A', text: 'Good evening, this is FULL TIME.' },
        { type: 'story', anchor: 'A', feature: 'scores', storyId: 'x', scores, text: "Let's go through the scores. A beat B 1-0. C drew 2-2 with D. E beat F 3-1." },
        { type: 'outro', anchor: 'A', text: "That's FULL TIME." },
      ],
    };
    const shots = planSegment(ep, 1, {}).events.filter((e) => e.kind === 'shot');
    assert.deepEqual(shots.map((e) => e.shot), ['scores']);
  });
});
