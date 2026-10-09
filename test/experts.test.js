import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { EXPERT_DESKS, expertsOf, expertFor, introLine, questionLine, followLine, thanksLine, expertKicker } from '../server/experts.js';
import { presenceClaim, rosterOf } from '../server/correspondents.js';
import { buildPrompt, collapseCrosses, normalizeBulletin } from '../server/writer.js';
import { loadChannel, validateChannel } from '../server/channel.js';

// The channel's experts (owner 23:05: "Don't forget the EXPERTS"; owner 9 Oct: "termina lo de los expertos"): eight
// recurring analysts of the channel's own, each with a desk, a look, a studio and a voice. A story of their field is
// put to them after the presenter reads it; they explain it from its source, never as a witness.

const CHANNEL = loadChannel();
const EXPERT_IDS = ['omar', 'clara', 'dev', 'tomas', 'june', 'amara', 'leo', 'ines'];
const WN = { id: 'world-now', ...CHANNEL.programs['world-now'] };
const WN_EXPERTS = expertsOf(WN, CHANNEL.presenters);
const DUO = { A: { id: 'paco', ...CHANNEL.presenters.paco }, B: { id: 'lola', ...CHANNEL.presenters.lola } };

describe('the roster', () => {
  test('eight experts, each with a known desk, a studio, a role and an English voice; every one airs somewhere', async () => {
    const { EXPERT_STUDIOS } = await import('../public/js/v2/canvas25d/studio/experts.js');
    for (const id of EXPERT_IDS) {
      const p = CHANNEL.presenters[id];
      assert.ok(p, `${id} is in config/channel.json`);
      assert.ok(EXPERT_DESKS[p.expert?.desk], `${id} has a known desk`);
      assert.ok(EXPERT_STUDIOS.includes(p.expert.backdrop), `${id}'s studio "${p.expert.backdrop}" is drawn`);
      assert.ok(p.role && p.name && /^en-/.test(p.voice.lang));
    }
    // one studio each, one desk each (the eight desks, the eight studios)
    assert.equal(new Set(EXPERT_IDS.map((id) => CHANNEL.presenters[id].expert.backdrop)).size, 8);
    assert.deepEqual(EXPERT_IDS.map((id) => CHANNEL.presenters[id].expert.desk).sort(), Object.keys(EXPERT_DESKS).sort());
    const onAir = new Set(Object.values(CHANNEL.programs).flatMap((p) => p.experts || []));
    for (const id of EXPERT_IDS) assert.ok(onAir.has(id), `${id} is on some programme`);
    // each programme's own speciality first (ties go to the order of experts)
    assert.equal(CHANNEL.programs['tech-bytes'].experts[0], 'june');
    assert.equal(CHANNEL.programs['cosmos'].experts[0], 'tomas');
    assert.equal(CHANNEL.programs['money-minute'].experts[0], 'omar');
  });

  test('the config is checked: an unknown expert, a presenter without a desk, analyses out of range', () => {
    const clone = () => structuredClone(CHANNEL);
    const bad = (mut, re) => {
      const ch = clone();
      mut(ch);
      assert.throws(() => validateChannel(ch), re);
    };
    bad((ch) => (ch.programs['world-now'].experts = ['nobody']), /unknown expert "nobody"/);
    bad((ch) => (ch.programs['world-now'].experts = ['paco']), /no known "expert.desk"/);
    bad((ch) => (ch.programs['world-now'].analyses = 3), /"analyses" outside 0..2/);
    bad((ch) => (ch.presenters.omar.expert = { desk: 'astrology', backdrop: 'markets' }), /no known "expert.desk"|"expert" without a known desk/);
    bad((ch) => (ch.presenters.omar.expert = { desk: 'economics' }), /"expert" without a known desk and a backdrop/);
  });

  test('expertsOf: the programme\'s experts with their first names (a title dropped) and studios', () => {
    assert.deepEqual(WN_EXPERTS.map((e) => e.id), CHANNEL.programs['world-now'].experts);
    const amara = WN_EXPERTS.find((e) => e.id === 'amara');
    assert.equal(amara.first, 'Amara', '"Dr" is not a first name');
    assert.equal(amara.backdrop, 'clinic');
    assert.deepEqual(expertsOf({ experts: ['paco', 'ghost'] }, CHANNEL.presenters), [], 'a presenter without a desk, or nobody, is no expert');
  });
});

describe('which expert takes a story', () => {
  const s = (title, summary, category = 'world') => ({ title, summary, category });
  test('a story goes to the desk with the most distinct words of its field, two at least', () => {
    const cases = [
      [s('Norway raises interest rates', 'The central bank lifted its interest rate as prices rise faster than wages.', 'business'), 'omar'],
      [s('Dublin hospitals under pressure', 'Hospitals say patients are waiting for beds as flu cases rise; doctors urge vaccines.'), 'amara'],
      [s('Coral recovers on the reef', 'Scientists say coral cover grew as ocean temperatures eased; the species most at risk recovered.', 'science'), 'dev'],
      [s('Court blocks the merger', 'The high court ruled the deal broke competition law; the regulator welcomed the judgment.'), 'ines'],
      [s('Talks resume on the ceasefire', 'Foreign ministers met at the summit to agree the next steps of the peace talks.'), 'clara'],
      [s('Museum reopens with a lost painting', 'The gallery shows the painting for the first time; the exhibition opens to the artist\'s fans.'), 'leo'],
    ];
    for (const [story, id] of cases) assert.equal(expertFor(story, WN_EXPERTS)?.expert.id, id, story.title);
  });

  test('one stray word is no field (a storm in a football report), and a word counts once with its plural', () => {
    assert.equal(expertFor(s('Cup final goes to penalties', 'A storm of goals in the second half.'), WN_EXPERTS), null);
    assert.equal(expertFor(s('Storms batter the coast', 'Storms and a storm surge hit the coast.'), WN_EXPERTS), null, '"storm", "Storms" are one word of the field');
    assert.equal(expertFor(null, WN_EXPERTS), null);
    assert.equal(expertFor(s('Prices rise', 'Prices and wages.'), []), null);
  });

  test('the presenter\'s lines: the role and full name to introduce, the first name to ask and thank', () => {
    const omar = WN_EXPERTS.find((e) => e.id === 'omar');
    for (let i = 0; i < 12; i++) {
      assert.match(introLine(omar, `k${i}`), /Omar Ledger/);
      assert.match(introLine(omar, `k${i}`), /Economics Editor/);
      assert.match(questionLine(omar, `k${i}`), /^Omar, [a-z].*\?$/);
      assert.match(thanksLine(omar, `k${i}`), /Omar/);
      assert.match(followLine(omar, `k${i}`, 'The bank will decide again next month.'), /next|watch/i);
      assert.doesNotMatch(followLine(omar, `k${i}`, 'Shares fell.'), /next/i);
    }
    assert.equal(questionLine(omar, 'k', 'why now?'), 'Omar, why now?');
    assert.equal(expertKicker(omar), 'ECONOMICS EDITOR');
  });
});

// a story deep enough for an analysis
const ARTICLE =
  'Norway\'s central bank has raised its main interest rate to 4.75 percent. Most economists had expected no change. ' +
  'The rise is the bank\'s first move in more than a year. The Norwegian krone strengthened after the announcement. ' +
  'Mortgage rates are expected to follow within weeks. The central bank said prices are rising faster than it expected.';
const story = (id, extra = {}) => ({ id, title: `Story ${id}`, summary: `Summary of story ${id}.`, source: 'Bitport Herald', category: 'world', image: null, ...extra });
const RATES = story('n1', { title: 'Norway raises interest rates', summary: ARTICLE.split('. ').slice(0, 2).join('. ') + '.', body: ARTICLE, category: 'business' });
const ratesSeg = (extra = {}) => ({
  type: 'story',
  storyId: 'n1',
  anchor: 'B',
  emotion: 'neutral',
  headline: 'Norway raises interest rates',
  text: "Norway's central bank has raised its main interest rate to 4.75 percent. Most economists had expected no change.",
  shot: 'wide',
  kicker: 'ECONOMY',
  analysis: {
    expert: 'omar',
    question: 'What is behind it?',
    answer: "The rise is the bank's first move in more than a year. The Norwegian krone strengthened after the announcement.",
    follow: 'What happens next?',
    answer2: 'Mortgage rates are expected to follow within weeks.',
  },
  ...extra,
});
const fillers = (n) => Array.from({ length: n }, (_, i) => story(`f${i}`, { title: `Filler story number ${i}`, summary: `Filler story number ${i} happened today.` }));
const fillerSegs = (n) => Array.from({ length: n }, (_, i) => ({ type: 'story', storyId: `f${i}`, anchor: i % 2 ? 'A' : 'B', emotion: 'neutral', headline: `Filler ${i}`, text: `Filler story number ${i} happened today.`, shot: 'wide' }));
const run = (segments, stories, extra = {}) =>
  normalizeBulletin({ title: 'T', segments: [{ type: 'intro', anchor: 'A', emotion: 'neutral', text: 'Good evening.' }, ...segments, { type: 'outro', anchor: 'A', emotion: 'neutral', text: "That's WORLD NOW." }] }, stories, {
    program: WN,
    presenters: DUO,
    correspondents: rosterOf(WN, CHANNEL.presenters),
    experts: WN_EXPERTS,
    maxStories: 14,
    maxChats: 6,
    ...extra,
  });

describe("a writer's analysis becomes the expert's exchange", () => {
  test('the story ends on the introduction and the first question; then the answer, the follow-up, the answer, the thanks', () => {
    const b = run([fillerSegs(1)[0], ratesSeg(), ...fillerSegs(4).slice(1)], [RATES, ...fillers(4)]);
    const segs = b.segments;
    const at = segs.findIndex((x) => x.storyId === 'n1');
    assert.equal(segs[at].link, 'R1');
    assert.match(segs[at].text, /Omar Ledger/);
    assert.match(segs[at].text, /Omar, what is behind it\?$/);
    assert.deepEqual(segs.slice(at + 1, at + 5).map((x) => `${x.part}:${x.anchor}`), ['piece:R1', 'ask:B', 'answer:R1', 'thanks:B']);
    for (const x of segs.slice(at + 1, at + 5)) {
      assert.equal(x.type, 'cross');
      assert.equal(x.kind, 'expert');
      assert.equal(x.reporter, 'omar');
      assert.equal(x.desk, 'ECONOMICS EDITOR');
      assert.equal(x.backdrop, 'markets');
      assert.equal(x.place, '', 'an expert is never at a place');
    }
    assert.match(segs[at + 1].text, /first move in more than a year/);
    assert.equal(segs[at + 2].text, 'Omar, what happens next?');
    assert.match(segs[at + 3].text, /Mortgage rates/);
    assert.match(segs[at + 4].text, /Omar/);
    assert.deepEqual(b.correspondents, { R1: 'omar' });
    assert.equal(b.storyIds.length, 5, 'an analysis adds no story');
  });

  test('every answer is grounded: a claim to have seen or spoken to anyone, or a fact not in the source, never airs', () => {
    const analysis = {
      expert: 'omar',
      question: 'What is behind it?',
      answer: "I've seen this coming for months. The rise is the bank's first move in more than a year. The bank will cut rates to zero by June. The Norwegian krone strengthened after the announcement.",
      follow: 'What happens next?',
      answer2: 'Officials told me more rises are coming. Savers should move their money now. Mortgage rates are expected to follow within weeks.',
    };
    const b = run([ratesSeg({ analysis }), ...fillerSegs(3)], [RATES, ...fillers(3)]);
    const told = b.segments.filter((x) => x.kind === 'expert' && /piece|answer/.test(x.part)).map((x) => x.text).join(' ');
    assert.match(told, /first move/);
    assert.doesNotMatch(told, /I've seen|zero|told me|should/);
    for (const x of b.segments.filter((y) => y.kind === 'expert')) assert.ok(!presenceClaim(x.text), x.text);
  });

  test('an analysis that cannot stand (fewer than two grounded answers), or a breaking or grave story, stays a story', () => {
    const thin = { expert: 'omar', question: 'Why?', answer: 'Rates will double next year. I was at the bank today.', follow: '', answer2: '' };
    assert.ok(!run([ratesSeg({ analysis: thin }), ...fillerSegs(3)], [RATES, ...fillers(3)]).segments.some((x) => x.kind === 'expert'));
    assert.ok(!run([ratesSeg({ emotion: 'sad' }), ...fillerSegs(3)], [RATES, ...fillers(3)]).segments.some((x) => x.kind === 'expert'));
    // a programme without analyses ignores them
    const off = run([ratesSeg(), ...fillerSegs(3)], [RATES, ...fillers(3)], { program: { ...WN, analyses: 0 } });
    assert.ok(!off.segments.some((x) => x.kind === 'expert'));
  });

  test('a question with a figure or too many words is replaced by the desk\'s own; a name the writer put in front goes', () => {
    const analysis = { ...ratesSeg().analysis, question: 'Omar, is 4.75 percent the highest rate in fifteen years?' };
    const b = run([ratesSeg({ analysis }), ...fillerSegs(3)], [RATES, ...fillers(3)]);
    const st = b.segments.find((x) => x.storyId === 'n1' && x.type === 'story');
    const q = st.text.split(/(?<=[.!?])\s+/).at(-1);
    assert.match(q, /^Omar, [a-z][^\d]*\?$/);
    assert.ok(EXPERT_DESKS.economics.ask.includes(q.replace(/^Omar, /, '')), q);
  });

  test('the review folds the exchange back into the story (and a second pass rebuilds it the same)', () => {
    const b = run([ratesSeg(), ...fillerSegs(3)], [RATES, ...fillers(3)]);
    const folded = collapseCrosses(b.segments);
    const st = folded.find((x) => x.storyId === 'n1');
    assert.ok(!folded.some((x) => x.type === 'cross'));
    assert.equal(st.analysis.expert, 'omar');
    assert.match(st.analysis.answer, /first move/);
    assert.doesNotMatch(st.text, /Omar/, 'the introduction and the question come off the story');
    const again = normalizeBulletin({ title: 'T', segments: folded }, [RATES, ...fillers(3)], { program: WN, presenters: DUO, correspondents: rosterOf(WN, CHANNEL.presenters), experts: WN_EXPERTS, maxStories: 14, maxChats: 6 });
    assert.deepEqual(again.segments.filter((x) => x.kind === 'expert').map((x) => x.text), b.segments.filter((x) => x.kind === 'expert').map((x) => x.text));
  });

  test('the prompt names the experts and their fields, and asks for the analysis in the schema', () => {
    const text = buildPrompt({ channelName: 'GLOBIT 24', program: WN, presenters: DUO, stories: [RATES], experts: WN_EXPERTS });
    assert.match(text, /"analysis"/);
    assert.match(text, /omar/);
    assert.match(text, /never at the scene/);
  });
});

describe('the offline writer', () => {
  test('a rotation of fixture news puts stories to experts, grounded, in their own voice slots and studios', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const { ROOT } = await import('../server/config.js');
    const { NewsDesk } = await import('../server/news.js');
    const { WeatherDesk } = await import('../server/weather.js');
    const { Producer } = await import('../server/producer.js');
    const { ProviderChain } = await import('../server/providers/index.js');
    const { createMockProvider } = await import('../server/providers/mock.js');
    const FEEDS = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'feeds.fixture.json'), 'utf8'));
    const log = { info() {}, warn() {}, error() {} };
    const desk = new NewsDesk({ log, fetchImpl: async () => { throw new Error('offline'); } });
    desk.loadFeeds = () => FEEDS;
    await desk.refresh();
    const chain = new ProviderChain([createMockProvider()], { record() {} }, { log });
    const producer = new Producer({ config: { candidatePool: 12, minNewStories: 3, reviewPass: true }, newsDesk: desk, chain, weather: new WeatherDesk({ source: 'fixture', log }), log });
    const seen = new Set();
    for (let r = 0; r < 2; r++) {
      for (const id of CHANNEL.rotation) {
        const ep = await producer.produce(CHANNEL, id);
        if (!ep) continue;
        const ex = ep.segments.filter((x) => x.kind === 'expert');
        if (!ex.length) continue;
        const program = CHANNEL.programs[id];
        const told = (sid) => {
          const s = desk.get(sid);
          return `${s.title}. ${s.summary} ${s.body || ''}`;
        };
        for (const x of ex) {
          seen.add(x.reporter);
          assert.ok(program.experts.includes(x.reporter), `${id}: ${x.reporter} is one of its experts`);
          assert.equal(ep.correspondents[x.anchor] ?? ep.correspondents[ep.segments.find((y) => y.link && y.storyId === x.storyId)?.link], x.reporter);
          assert.equal(x.backdrop, CHANNEL.presenters[x.reporter].expert.backdrop);
          assert.ok(!presenceClaim(x.text), x.text);
          if (x.part === 'piece' || x.part === 'answer') {
            // each sentence of the answer is the source's (a short frame like "The key detail is this:" aside)
            for (const t of x.text.split(/(?<=[.!?])\s+/)) {
              const bare = t.replace(/^[^:]{0,40}:\s*/, '');
              assert.ok(told(x.storyId).toLowerCase().includes(bare.toLowerCase().replace(/[.!?]$/, '')), `${id}: "${t}" is not in the source`);
            }
          }
        }
        // the parts in order, right after the story that asks the first question
        const at = ep.segments.findIndex((y) => y.kind === 'expert');
        const st = ep.segments[at - 1];
        assert.equal(st.type, 'story');
        assert.ok(st.link && /\?$/.test(st.text), `${id}: the story ends on the question`);
        assert.equal(ex[0].part, 'piece');
        assert.equal(ex.at(-1).part, 'thanks');
      }
    }
    assert.ok(seen.size >= 3, `several experts on air in two rotations (${[...seen].join(', ')})`);
  });
});

describe('on screen and on air', () => {
  test('each expert has a look of their own (registered), drawn in the channel palette, unlike every other face', async () => {
    const { lookFor, LOOKS, CORRESPONDENT_LOOKS, EXPERT_LOOKS } = await import('../public/js/v2/canvas25d/cast/index.js');
    const { frame, drawActors, actor } = await import('../public/js/v2/canvas25d/scene.js');
    const { C } = await import('../public/js/v2/canvas25d/pixbuf.js');
    const { REMOTE } = await import('../public/js/v2/canvas25d/studio/remote.js');
    const PALETTE = new Set(Object.values(C).map((c) => c >>> 0));
    assert.deepEqual(Object.keys(EXPERT_LOOKS).sort(), [...EXPERT_IDS].sort());
    const sigs = new Map();
    for (const id of [...EXPERT_IDS, ...Object.keys(LOOKS), ...Object.keys(CORRESPONDENT_LOOKS)]) {
      assert.equal(lookFor(id).id, id);
      frame.px.fill(C.ink);
      drawActors(1, [{ actor: actor(id, { side: 0 }), x: REMOTE.x, y: REMOTE.y, s: REMOTE.s, clip: false }]);
      const counts = new Map();
      for (const c of frame.px) {
        assert.ok(PALETTE.has(c >>> 0), `${id}: a colour off the palette`);
        if (c !== C.ink) counts.set(c, (counts.get(c) || 0) + 1);
      }
      const drawn = [...counts.values()].reduce((a, b) => a + b, 0);
      assert.ok(drawn > 6000, `${id} is drawn (${drawn} px)`);
      sigs.set(id, counts);
    }
    // a colour histogram apart from every other look's (no expert is a recoloured twin of anyone)
    const diff = (a, b) => {
      let d = 0, n = 0;
      for (const k of new Set([...a.keys(), ...b.keys()])) d += Math.abs((a.get(k) || 0) - (b.get(k) || 0));
      for (const v of a.values()) n += v;
      return d / n;
    };
    for (const e of EXPERT_IDS) for (const [o, h] of sigs) if (o !== e) assert.ok(diff(sigs.get(e), h) > 0.35, `${e} vs ${o}: ${diff(sigs.get(e), h).toFixed(2)}`);
  });

  test('each studio draws in the palette, keeps the space behind the head calm, and lives a little', async () => {
    const { drawExpertStudio, EXPERT_STUDIOS } = await import('../public/js/v2/canvas25d/studio/experts.js');
    const { C } = await import('../public/js/v2/canvas25d/pixbuf.js');
    const PALETTE = new Set(Object.values(C).map((c) => c >>> 0));
    const px = new Uint32Array(384 * 216);
    assert.equal(drawExpertStudio(px, 'nowhere', 0), false);
    for (const name of EXPERT_STUDIOS) {
      assert.equal(drawExpertStudio(px, name, 0), true);
      const a = new Uint32Array(px);
      for (const c of a) assert.ok(PALETTE.has(c >>> 0), `${name}: a colour off the palette`);
      // behind the head (the face's box): few colours, no white glare
      const behind = new Map();
      for (let y = 40; y < 110; y++) for (let x = 97; x < 151; x++) behind.set(a[y * 384 + x], 1 + (behind.get(a[y * 384 + x]) || 0));
      assert.ok((behind.get(C.white) || 0) < 40, `${name}: glare behind the head`);
      // something moves over 30 s, never much at once
      let moved = 0;
      for (let t = 0.5; t < 30; t += 0.7) {
        drawExpertStudio(px, name, t);
        let n = 0;
        for (let i = 0; i < px.length; i++) if (px[i] !== a[i]) n++;
        moved = Math.max(moved, n);
        assert.ok(n < 4000, `${name} at ${t}s: ${n} px changed`);
      }
      assert.ok(moved > 0, `${name} never moves`);
    }
  });

  test("the stage cuts to an expert's studio (never a place's footage) and the director tells it the studio", async () => {
    const { Stage } = await import('../public/js/v2/canvas25d/runtime/stage.js');
    const { frame } = await import('../public/js/v2/canvas25d/scene.js');
    const { drawExpertStudio } = await import('../public/js/v2/canvas25d/studio/experts.js');
    const audio = { speechFrame(ms, slot, o = {}) { return Object.assign(o, { slot, speaking: slot === 'R1', level: 0.5, viseme: 'AA', next: 'rest', mix: 0, wordIndex: -1, charIndex: -1, sentenceIndex: -1, accent: 0, pause: false }); } };
    const ep = { id: 'epX', program: { id: 'world-now', title: 'WORLD NOW' }, cast: { A: 'paco', B: 'lola' }, correspondents: { R1: 'amara' } };
    const st = new Stage({ audio, channel: { presenters: {} }, idle: null });
    const deck = { ready: () => true, frame: () => ({ px: new Uint32Array(192 * 108), w: 192, h: 108 }) };
    const scene = { episode: ep, program: ep.program, cast: ep.cast, anchors: {}, images: new Map(), wall: { mode: 'logo' }, segPlan: null, focus: 'A', shot: 'location', shotSince: 1, footageDeck: deck,
      remote: { slot: 'R1', id: 'amara', kind: 'expert', backdrop: 'clinic', footage: 'clip', lat: 0, lon: 0, grave: false } };
    for (let t = 1; t < 1.6; t += 0.1) st.frame({ putImageData() {} }, t, scene);
    assert.equal(st.backdrop.kind, 'studio');
    assert.equal(st.backdrop.studio, 'clinic');
    const ref = new Uint32Array(384 * 216);
    drawExpertStudio(ref, 'clinic', 1.5);
    // the top-right corner (no one stands there) is the clinic's
    let same = 0, n = 0;
    for (let y = 0; y < 60; y++) for (let x = 300; x < 384; x++, n++) if (frame.px[y * 384 + x] === ref[y * 384 + x]) same++;
    assert.ok(same / n > 0.95, `the clinic is behind her (${((same / n) * 100).toFixed(0)}%)`);
    const { Director } = await import('../public/js/director.js');
    const d = Object.create(Director.prototype);
    d.episode = { correspondents: { R2: 'leo' } };
    const r = d.remoteOf({ type: 'cross', part: 'piece', anchor: 'R2', reporter: 'leo', kind: 'expert', backdrop: 'gallery', desk: 'CULTURE CORRESPONDENT', place: '' });
    assert.equal(r.kind, 'expert');
    assert.equal(r.backdrop, 'gallery');
    assert.equal(r.slot, 'R2');
  });

  test('each expert speaks with a voice of their own: no presenter\'s lead voice, none of Paco\'s, no two alike', async () => {
    const casting = (await import('../server/voice/casting.json', { with: { type: 'json' } })).default;
    const lead = (spec) => spec.split('+')[0].split(':')[0];
    const anchors = ['paco', 'lola', 'max', 'ada', 'nova', 'unit8', 'penny', 'sam'].map((id) => lead(casting[id].voice));
    const voices = new Set();
    for (const id of EXPERT_IDS) {
      const c = casting[id];
      assert.ok(c?.voice, `${id} has a voice`);
      assert.ok(!anchors.includes(lead(c.voice)), `${id} leads with a voice of their own`);
      assert.ok(!/bm_george|bm_lewis|bm_daniel/.test(c.voice), `${id}: nobody may sound like Paco`);
      assert.equal(c.lang, CHANNEL.presenters[id].voice.lang.toLowerCase(), `${id} reads with the accent of the config`);
      assert.ok(!voices.has(c.voice), `${id}: another expert has this voice`);
      voices.add(c.voice);
    }
  });
});
