// The packaging (docs/publishing/thumbnails-titles.md; server/publish/packaging.js, public/js/clip/cover.js,
// tools/publish/packager.mjs): three titles, three cover texts, the hook, the lead and a few hashtags, written by the AI
// writer from the story's facts and checked field by field (lengths, bait, shouting, LIVE, grave news, the verbatim
// rule, what the story supports), the deterministic writer behind it, never the outlet's headline; the caption's AI
// disclosure first; the covers on the channel's grid, their words where every feed keeps them.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { packFacts, fallbackPackage, checkTitle, checkThumb, checkHook, checkPackage, writePackage, packagePrompt, parsePackage, nearCopy, sharedRun, hashtagsFor, episodeFacts, LIMITS } from '../server/publish/packaging.js';
import { clipTexts, CLIP_DISCLOSURE_PREFIX, CLIP_DISCLOSURE_DETAIL } from '../server/publish/clipmeta.js';
import { ProviderChain } from '../server/providers/index.js';
import { createMockProvider } from '../server/providers/mock.js';
import { checkClip, clipCards } from '../server/publish/compliance.js';
import { manualTexts, prepareManual, packageFaults } from '../server/publish/manual.js';
import { PublishQueue } from '../server/publish/queue.js';
import { pickFrames, pictureOf, coverCast } from '../tools/publish/packager.mjs';

const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
const EMOJI = /\p{Extended_Pictographic}/u;

// a real story of 17 Oct (NEWS IN 60), as the AI writer aired it and as its outlet wrote it
const OUTLET = 'Kenya confirms third Ebola case as health officials trace contacts in Nairobi';
const story = { title: OUTLET, summary: 'Kenya has confirmed a third case of Ebola. Health officials say they are tracing more than 40 contacts of the patients in Nairobi.', source: 'BBC Africa', link: 'https://www.bbc.co.uk/news/k1?at_medium=RSS' };
const stories = new Map([['k1', story]]);
const ep = { id: 'n60', program: { id: 'news-60', title: 'NEWS IN 60', presenters: ['sam'] }, segments: [{ type: 'story', storyId: 'k1', headline: 'Kenya reports a third Ebola case', kicker: 'EBOLA', location: { place: 'KENYA' }, text: 'Kenya now has three confirmed Ebola cases. Officials in Nairobi are tracing more than 40 people who met the patients.', source: 'BBC Africa' }], rundown: [{ storyId: 'k1' }] };
const moment = { id: 'n60:story:0-0', kind: 'story', from: 0, to: 0, duration: 21.4, text: ep.segments[0].text, headline: ep.segments[0].headline, hook: ['KENYA REPORTS A', 'THIRD EBOLA CASE'], storyIds: ['k1'], sources: ['BBC Africa'], credits: [], programme: 'NEWS IN 60', programId: 'news-60', grave: true, light: false };
const facts = () => packFacts(moment, ep, { stories, airedAt: Date.parse('2026-10-17T07:30:00Z') });

describe('the checks', () => {
  test('a title: 15 to 70 characters, no bait, no shouting, no "!", no emoji, no LIVE without a live stream', () => {
    const f = { ...facts(), grave: false };
    assert.deepEqual(checkTitle('Kenya reports a third Ebola case', f), []);
    for (const [t, why] of [
      ['Ebola', /too short/],
      ['Kenya reports a third Ebola case, and officials in Nairobi are now tracing more than 40 people', /too long/],
      ['SHOCKING: Kenya reports a third Ebola case', /bait/],
      ['You won\'t believe what Kenya reports about Ebola', /bait/],
      ['Kenya reports a third Ebola case!', /exclamation/],
      ['KENYA REPORTS A THIRD EBOLA CASE', /capitals/],
      ['Kenya reports a third Ebola case 😷', /emoji/],
      ['LIVE: Kenya reports a third Ebola case', /live/],
      ['BREAKING: Kenya reports a third Ebola case', /bait/],
    ]) assert.ok(checkTitle(t, f).some((x) => why.test(x)), `${t}: ${checkTitle(t, f).join('; ')}`);
    // LIVE is fine only where there is a live stream
    assert.ok(!checkTitle('Kenya reports a third Ebola case, watch live', { ...f, live: true }).some((x) => /live stream/.test(x)));
  });

  test('supported: a number, a name or words the story does not give are refused', () => {
    const f = { ...facts(), grave: false };
    assert.ok(checkTitle('Kenya reports a fourth Ebola case', f).some((x) => /words the story|number/.test(x)), 'a fourth case');
    assert.ok(checkTitle('Kenya traces 400 contacts of Ebola patients', f).some((x) => /number/.test(x)));
    assert.ok(checkTitle('Uganda reports a third Ebola case', f).some((x) => /names the story does not|words the story/.test(x)));
    assert.ok(checkTitle('Kenya reports a third Ebola case in Uganda', f).some((x) => /names the story does not/.test(x)));
    assert.deepEqual(checkTitle('Nairobi traces more than 40 contacts of Ebola patients', f), [], 'facts are free, in the channel\'s words');
  });

  test("never the outlet's headline, nor five of its words in a row; the verbatim rule on the rest", () => {
    const f = { ...facts(), grave: false };
    assert.equal(sharedRun('Kenya confirms third Ebola case as officials act', OUTLET), 6);
    assert.ok(nearCopy('Kenya confirms third Ebola case as health officials trace contacts', [OUTLET]));
    assert.ok(nearCopy('Kenya confirms third Ebola case', [OUTLET]), 'the outlet\'s headline cut short is still the outlet\'s');
    assert.ok(checkTitle(OUTLET.slice(0, 60), f).some((x) => /outlet's headline/.test(x)));
    assert.ok(!nearCopy('Kenya reports a third Ebola case', [OUTLET]));
  });

  test('grave news: no question, no dramatic word; thumbnail words add to the title, never repeat it', () => {
    const f = facts();
    assert.equal(f.grave, true);
    assert.ok(checkTitle('Is Kenya ready for a third Ebola case?', f).some((x) => /question on grave/.test(x)));
    assert.ok(checkTitle('Horror in Kenya as a third Ebola case is confirmed', f).some((x) => /sensational/.test(x)));
    assert.ok(checkThumb('THIRD EBOLA CASE', f, { title: 'Kenya reports a third Ebola case' }).some((x) => /repeats the title/.test(x)));
    assert.deepEqual(checkThumb('40 CONTACTS TRACED', f, { title: 'Kenya reports a third Ebola case' }), []);
    assert.ok(checkThumb('FIVE WORDS ARE TOO MANY', f, {}).some((x) => /5 words/.test(x)));
    assert.ok(checkHook('Kenya reports a third Ebola case and officials trace more than 40 people who met the patients in Nairobi today', f).some((x) => /too long/.test(x)));
  });
});

describe('the deterministic writer', () => {
  test('a decent package from the facts alone, every field passing its own checks, never the outlet\'s headline', () => {
    const f = facts();
    const p = fallbackPackage(f);
    assert.equal(p.writer, 'fallback');
    assert.ok(p.titles.length >= 1 && p.titles.length <= 3);
    assert.equal(p.titles[0], 'Kenya reports a third Ebola case', 'the channel\'s own aired headline leads');
    assert.ok(p.thumbs.length === 3, p.thumbs.join(' / '));
    assert.deepEqual(checkPackage(p, f).faults, []);
    for (const t of [...p.titles, p.hook, p.lead]) assert.ok(!nearCopy(t, [OUTLET]), t);
    assert.ok(!EMOJI.test(JSON.stringify(p)), 'no emoji on grave news');
    assert.ok(!p.hashtags.includes('pixelart'), 'no playful hashtag on grave news');
    assert.ok(p.hashtags.length <= LIMITS.hashtags.max);
  });

  test('an aired headline that copies its outlet is never used: the story\'s label, its facts', () => {
    const copied = { ...ep, segments: [{ ...ep.segments[0], headline: 'Kenya confirms third Ebola case as health officials trace contacts', text: OUTLET + '.' }] };
    const f = packFacts({ ...moment, headline: copied.segments[0].headline, text: copied.segments[0].text }, copied, { stories });
    assert.equal(f.headlineOwn, false);
    const p = fallbackPackage(f);
    for (const t of [...p.titles, p.hook, p.lead, ...p.thumbs]) assert.ok(!nearCopy(t, [OUTLET]), t);
    assert.match(p.titles[0], /^Ebola in Kenya/, p.titles[0]);
  });

  test('a quiz question: play along, never the answer; hashtags few and relevant', () => {
    const q = { ...moment, kind: 'quiz-question', grave: false, light: true, headline: 'Lufthansa to buy 44.9% of TAP Air Portugal in €1.2B deal', storyIds: [], quiz: { type: 'howmany', title: '', tease: 'Lufthansa is buying a 44.9% stake in TAP Air Portugal in a deal valued at ___ dollars.', players: ['unit8', 'penny'] }, programme: 'PAY ATTENTION', programId: 'pay-attention' };
    const p = fallbackPackage(packFacts(q, { program: { id: 'pay-attention', title: 'PAY ATTENTION' }, segments: [] }, { presenters: { unit8: { name: 'UNIT-8' }, penny: { name: 'Penny Sterling' } } }));
    const all = JSON.stringify(p);
    assert.ok(!/1\.2B/.test(all), all);
    // (shorts-v2.md A4) the topic first in every title; with no cover for its question (TAP AIR PORTUGAL: HOW MANY? is
    // over 22 characters) the question's title first, beside the challenge's cover, then the challenge
    assert.equal(p.titles[0], 'TAP Air Portugal: how many? Guess before the answer');
    assert.equal(p.titles[1], 'TAP Air Portugal: can you beat UNIT-8 and Penny?');
    assert.equal(p.thumbs[0], 'BEAT UNIT-8?');
    assert.match(p.hook, /^TAP Air Portugal: how many\? UNIT-8 and Penny guess; can you beat them\?$/);
    assert.deepEqual(p.hashtags, ['TAPAirPortugal', 'newsquiz', 'quiz', 'news'], 'the topic, then the quiz\'s own');
    assert.deepEqual(checkPackage(p, packFacts(q, { program: { id: 'pay-attention', title: 'PAY ATTENTION' }, segments: [] }, { presenters: { unit8: { name: 'UNIT-8' }, penny: { name: 'Penny Sterling' } } })).faults, []);
    // a question the board asks from its figure (moments.js quizWords): the question itself on the first cover, and in
    // the second title and the hook; never its answer
    const ponies = { ...q, headline: null, quiz: { type: 'howmany', title: 'How many ponies? Tippbarlake Exmoor Pony Herd has about ___ ponies, which are being gathered in Brendon Barton on Sunday, BBC Science reports.', tease: 'Tippbarlake Exmoor Pony Herd has about ___ ponies, which are being gathered in Brendon Barton on Sunday, BBC Science reports.', ask: 'How many ponies?', players: ['paco', 'penny'] } };
    const pf = packFacts(ponies, { program: { id: 'pay-attention', title: 'PAY ATTENTION' }, segments: [] }, { presenters: { paco: { name: 'Paco Pixel' }, penny: { name: 'Penny Sterling' } } });
    const pp = fallbackPackage(pf);
    // the question on the first cover, the challenge in the title beside it (each adds to the other)
    assert.equal(pp.titles[0], 'Exmoor Pony Herd: can you beat Paco and Penny?');
    assert.equal(pp.titles[1], 'Exmoor Pony Herd: how many ponies? Guess before the answer');
    assert.deepEqual(pp.thumbs, ['HOW MANY PONIES?', 'BEAT PACO?', 'EXMOOR PONY HERD?'], 'a grid shows the cover alone: the question itself');
    assert.equal(pp.hook, 'Exmoor Pony Herd: how many ponies? Paco and Penny guess; can you beat them?');
    assert.deepEqual(pp.hashtags, ['ExmoorPonyHerd', 'newsquiz', 'quiz', 'news']);
    assert.deepEqual(checkPackage(pp, pf).faults, []);
    assert.ok(!/100/.test(JSON.stringify(pp)), 'never the answer');
    // the AI writer is asked the same
    assert.match(packagePrompt(pf), /name the question's topic first.*\(here: How many ponies\?\)/s);
    // a question too long for a cover (LIGHT-YEARS: ten letters) takes its topic with the round's own question
    const webb = { ...ponies, quiz: { type: 'howmany', title: 'How many light-years? NASA’s Webb has revealed the wild weather of a mysterious world ___ light-years away.', tease: 'NASA’s Webb has revealed the wild weather of a mysterious world ___ light-years away.', ask: 'How many light-years?', players: ['paco', 'penny'] } };
    const wf = packFacts(webb, { program: { id: 'pay-attention', title: 'PAY ATTENTION' }, segments: [] }, { presenters: { paco: { name: 'Paco Pixel' }, penny: { name: 'Penny Sterling' } } });
    const wp = fallbackPackage(wf);
    assert.equal(wp.thumbs[0], 'NASA’S WEBB: HOW MANY?');
    assert.equal(wp.titles[0], 'NASA’s Webb: can you beat Paco and Penny?');
    assert.equal(wp.hook, 'NASA’s Webb: how many light-years? Paco and Penny guess; can you beat them?');
    assert.equal(wp.hashtags[0], 'NASA', 'a possessive\'s owner as the topic\'s hashtag');
    assert.deepEqual(checkPackage(wp, wf).faults, []);
    // a cover is the board's question or its topic with it, nothing looser: a made-up question is checked as words
    assert.deepEqual(checkThumb('NASA’S WEBB: HOW MANY?', wf), []);
    assert.ok(checkThumb('HOW FAR AWAY?', wf).length > 0);
    // a whole round: how many questions it plays on its cover, beside the challenge's title (moments.js gives the count)
    const round = { ...ponies, kind: 'quiz-round', quiz: { type: 'howmany', round: 'HOW MANY?', players: ['paco', 'penny'], questions: 3, title: "3 questions from this week's news", tease: null, ask: null } };
    const rf = packFacts(round, { program: { id: 'pay-attention', title: 'PAY ATTENTION' }, segments: [] }, { presenters: { paco: { name: 'Paco Pixel' }, penny: { name: 'Penny Sterling' } } });
    const rp = fallbackPackage(rf);
    assert.deepEqual(rp.thumbs, ['3 QUESTIONS', 'BEAT PACO?', 'BEAT PENNY?']);
    assert.equal(rp.titles[0], "Can you beat Paco and Penny? This week's news quiz");
    assert.equal(rp.hook, "3 questions from this week's news: Paco and Penny guess; can you beat them?");
    assert.deepEqual(checkPackage(rp, rf).faults, []);
  });

  test('every package the deterministic writer makes passes the gate\'s own checks, as a whole (each thumbnail beside its title)', () => {
    for (const type of ['letters', 'howmany', 'where', 'today', 'which', 'picture']) {
      const q = { ...moment, kind: 'quiz-question', grave: false, light: true, storyIds: [], quiz: { type, title: type === 'letters' ? 'Name the headline: M. R. M. S. O. A. N.' : '', tease: 'Taiwanese chip giant TSMC said net profit soared ___ to a record high.', players: ['unit8', 'penny'] }, programme: 'PAY ATTENTION', programId: 'pay-attention' };
      const f = packFacts(q, { program: { id: 'pay-attention', title: 'PAY ATTENTION' }, segments: [] }, { presenters: { unit8: { name: 'UNIT-8' }, penny: { name: 'Penny Sterling' } } });
      assert.deepEqual(checkPackage(fallbackPackage(f), f).faults, [], type);
    }
    for (const kind of ['story', 'montage', 'number', 'stories']) assert.deepEqual(checkPackage(fallbackPackage({ ...facts(), kind }), { ...facts(), kind }).faults, [], kind);
  });

  test('hashtags: the place and the subject the facts name, the programme\'s, never a person on grave news', () => {
    assert.deepEqual(hashtagsFor({ ...facts(), grave: true, subject: 'William Ruto' }), ['Kenya', 'news']);
    const light = hashtagsFor({ ...facts(), grave: false, kicker: 'EBOLA', label: 'Ebola · Kenya' });
    assert.deepEqual(light, ['Ebola', 'Kenya', 'news', 'pixelart']);
  });

  test('a whole programme: its upload title first, its date; its thumbnails\' words concrete, never a label', () => {
    const f = episodeFacts(ep, { stories, airedAt: Date.parse('2026-10-17T07:30:00Z'), duration: 64, title: 'NEWS IN 60: Kenya reports a third Ebola case · 17 Oct' });
    const p = fallbackPackage(f);
    assert.equal(p.titles[0], 'NEWS IN 60: Kenya reports a third Ebola case · 17 Oct');
    assert.ok(p.thumbs.length >= 2 && !p.thumbs.includes('FULL PROGRAMME'), p.thumbs.join(' / '));
    assert.deepEqual(checkPackage(p, f).faults, []);
  });
});

describe('the AI writer', () => {
  const fakeChain = (reply) => ({ generate: async (req, validate) => ({ provider: 'fake', value: validate(typeof reply === 'function' ? reply(req) : reply) }) });

  test('its words where they pass, the deterministic writer\'s where they do not, and why', async () => {
    let prompt = '';
    const reply = (req) => {
      prompt = req.prompt;
      return JSON.stringify({ titles: ['Kenya now has three confirmed Ebola cases', 'SHOCKING Ebola news from Kenya!', OUTLET], thumbs: ['40 CONTACTS', 'NAIROBI', 'THIRD EBOLA CASE'], hook: 'Officials in Nairobi are tracing more than 40 people who met the patients.', lead: 'Kenya now has three confirmed Ebola cases; officials are tracing more than 40 contacts.' });
    };
    const p = await writePackage(facts(), { chain: fakeChain(reply) });
    assert.equal(req(prompt), true);
    assert.equal(p.titles[0], 'Kenya now has three confirmed Ebola cases');
    assert.ok(!p.titles.some((t) => /SHOCKING/.test(t) || nearCopy(t, [OUTLET])), p.titles.join(' / '));
    assert.equal(p.titles.length, 3, 'filled up to three by the deterministic writer');
    assert.equal(p.writer, 'ai+fallback');
    assert.ok(p.rejected.some((r) => /SHOCKING/.test(r.text) && r.faults.some((x) => /bait/.test(x))));
    assert.ok(p.rejected.some((r) => r.text === OUTLET));
    assert.deepEqual(p.thumbs.slice(0, 2), ['40 CONTACTS', 'NAIROBI']);
    assert.equal(p.hook, 'Officials in Nairobi are tracing more than 40 people who met the patients.');
    assert.deepEqual(checkPackage(p, facts()).faults, [], 'what ships passes the gate as a whole');
    function req(pr) {
      // the prompt: the facts, the rules, the outlet's headline marked as not to be reused; no model named
      assert.match(pr, /GRAVE NEWS/);
      assert.match(pr, /DO NOT reuse its wording/);
      assert.match(pr, /Reply with JSON only/);
      return true;
    }
  });

  test('no AI writer, or one that fails: the deterministic writer; the offline mock never writes packaging', async () => {
    const chain = new ProviderChain([createMockProvider()], { record() {} }, { log: { warn() {} } });
    await assert.rejects(() => chain.generate({ stage: 'package', prompt: packagePrompt(facts()) }, parsePackage), (e) => e.code === 'NO_PACKAGER');
    const p = await writePackage(facts(), { chain, log: { warn() {} } });
    assert.equal(p.writer, 'fallback');
    const broken = await writePackage(facts(), { chain: { generate: async () => { throw new Error('quota'); } }, log: { warn() {} } });
    assert.equal(broken.writer, 'fallback');
    assert.throws(() => parsePackage('not json'));
  });
});

describe('the texts and the disclosure', () => {
  const pack = { titles: ['Kenya now has three confirmed Ebola cases', 'Nairobi traces more than 40 Ebola contacts', 'Kenya reports a third Ebola case'], thumbs: ['40 CONTACTS', 'NAIROBI', 'WHAT WE KNOW'], hook: 'Officials in Nairobi are tracing more than 40 people who met the patients.', lead: 'Kenya now has three confirmed Ebola cases; officials are tracing more than 40 contacts.', hashtags: ['Kenya', 'news'], writer: 'ai' };

  test('the caption opens "AI-produced news: <hook>", the disclosure\'s sentence right under it; the description\'s second line is the lead', () => {
    for (const platform of ['tiktok', 'instagram', 'facebook']) {
      const t = clipTexts(moment, ep, { platform, stories, pack });
      const paras = t.text.split('\n\n');
      assert.equal(paras[0], `${CLIP_DISCLOSURE_PREFIX} ${pack.hook}`, platform);
      assert.equal(paras[1], CLIP_DISCLOSURE_DETAIL, platform);
      assert.ok(!EMOJI.test(t.text), 'grave: no emoji');
    }
    const yt = clipTexts(moment, ep, { platform: 'youtube', stories, pack });
    assert.equal(yt.title, pack.titles[0]);
    const lines = yt.description.split('\n');
    assert.match(lines[0], /^AI-produced news: /);
    assert.equal(lines[1], pack.lead);
    assert.match(yt.description, /Reporting: BBC Africa: “Kenya confirms third Ebola case/, 'the outlet\'s headline only cited, beside its link');
    assert.ok(!/at_medium/.test(yt.description));
  });

  test('the gate: the disclosure\'s words open the first line; a hooked caption without the sentence under it is held', () => {
    const base = { id: 'c', kind: 'short', cards: clipCards(), episode: ep, range: { start: 0, end: 20 }, storyIds: [], platforms: ['tiktok'], flags: { tiktok: { is_aigc: true } } };
    const rules = (text) => (checkClip({ ...base, text }).violations || []).map((v) => v.rule);
    const good = clipTexts(moment, ep, { platform: 'tiktok', stories, pack }).text;
    assert.ok(!rules(good).includes('text-disclosure-missing'), good);
    assert.ok(rules(`${CLIP_DISCLOSURE_PREFIX} ${pack.hook}\n\nSource: BBC Africa`).includes('text-disclosure-missing'), 'the sentence is missing');
    assert.ok(rules(`${pack.hook} AI-produced news.\n\n${CLIP_DISCLOSURE_DETAIL}`).includes('text-disclosure-missing'), 'the disclosure must open the line');
  });
});

describe('the approval page and the publish checks', () => {
  test('YouTube: the three titles to copy (Test & Compare for a whole programme, other choices for a Short)', () => {
    const it = { kind: 'episode', platform: 'youtube', title: 'A title', description: 'AI-produced news: x', package: { titles: ['A title', 'B title', 'C title'] } };
    const f = manualTexts(it, { env: {} }).fields;
    assert.deepEqual(f.map((x) => x.id).slice(0, 3), ['title', 'title2', 'title3']);
    assert.match(f[1].label, /Probar y comparar/);
    const short = manualTexts({ ...it, kind: 'clip', format: 'vertical', text: 'AI-produced news: x' }, { env: {} }).fields;
    assert.match(short[1].label, /otra opción/);
  });

  test('prepare: every cover signed, and a title the owner turned into bait is held ("packaging")', async () => {
    const dir = tmp('pack-q-');
    const media = {};
    for (const k of ['v.mp4', 'a.png', 'b.png', 'c.png']) fs.writeFileSync((media[k] = path.join(dir, k)), 'x');
    const q = new PublishQueue({ dir });
    const f = facts();
    const it = q.enqueue({ kind: 'clip', platform: 'youtube', format: 'vertical', title: 'Kenya now has three confirmed Ebola cases', text: 'AI-produced news: x', description: 'AI-produced news: x', media: { video: media['v.mp4'], thumb: media['a.png'], thumbs: [media['a.png'], media['b.png'], media['c.png']], duration: 21 }, source: { storyIds: ['k1'], programId: 'news-60' }, package: { titles: ['Kenya now has three confirmed Ebola cases', 'Nairobi traces more than 40 contacts of Ebola patients'], thumbs: ['40 CONTACTS', 'THIRD CASE'], hook: 'Officials in Nairobi are tracing more than 40 people who met the patients.', facts: { ...f, sources: [] } }, compliance: { ok: true } });
    q.approve(it.id, 'owner');
    const signed = [];
    const mark = async (src, manifest, { output }) => (signed.push(path.basename(src)), fs.copyFileSync(src, output), { ok: true, path: output, devCert: true });
    const gate = () => ({ ok: true, violations: [], warnings: [] });
    const getStory = (id) => stories.get(id) || null;
    const r = await prepareManual(q, it.id, { dataDir: dir, gate, mark, getStory, register: null, env: {} });
    assert.equal(r.ok, true, JSON.stringify(r.violations));
    assert.deepEqual(signed.sort(), ['a.png', 'b.png', 'c.png', 'v.mp4']);
    assert.ok(r.item.manual.files.cover2 && r.item.manual.files.cover3);
    assert.deepEqual(packageFaults(q.get(it.id), getStory), []);
    q.edit(it.id, { title: 'SHOCKING: Kenya Ebola news you won\'t believe!' }, 'owner');
    const held = await prepareManual(q, it.id, { dataDir: dir, gate, mark, getStory, register: null, env: {} });
    assert.equal(held.ok, false);
    assert.ok(held.violations.some((v) => v.rule === 'packaging' && /bait/.test(v.message)), JSON.stringify(held.violations));
  });
});

describe('the covers', () => {
  let C;
  const fakeCanvas = (width, height) => {
    const ctx = { fills: [], images: [], fillStyle: '#000', imageSmoothingEnabled: false, fillRect(x, y, w, h) { this.fills.push({ c: this.fillStyle, x, y, w, h }); }, drawImage(img, ...a) { const r = a.length === 8 ? { x: a[4], y: a[5], w: a[6], h: a[7] } : { x: a[0], y: a[1], w: img?.width || 0, h: img?.height || 0 }; this.images.push(r); }, getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {}, createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) };
    for (const m of ['save', 'restore', 'beginPath', 'rect', 'clip', 'translate', 'scale', 'setTransform', 'moveTo', 'lineTo', 'fill', 'stroke', 'arc', 'closePath', 'clearRect']) ctx[m] = () => {};
    ctx.createLinearGradient = () => ({ addColorStop() {} });
    ctx.measureText = () => ({ width: 0 });
    return { width, height, getContext: () => ctx };
  };
  before(async () => {
    globalThis.document = { createElement: () => fakeCanvas(300, 150) };
    C = await import('../public/js/clip/cover.js');
  });

  test('the words: the biggest scale that fits, whole words, at most the lines allowed', () => {
    const f = C.coverWords('40 CONTACTS TRACED', 192, 100, { scales: [5, 4, 3, 2], maxLines: 3 });
    assert.ok(f.scale >= 3, JSON.stringify(f));
    for (const l of f.lines) assert.ok(C.boldWidth(l, f.scale) <= 192, l);
    assert.equal(C.coverWords('', 192, 100), null);
    assert.equal(C.coverWords('SUPERCALIFRAGILISTICEXPIALIDOCIOUS', 60, 20, { scales: [3] }), null);
  });

  test('a cover\'s words stay inside the 4:5 middle every feed keeps; a thumbnail\'s clear of YouTube\'s time stamp', () => {
    for (const variant of C.VARIANTS) {
      const ctx = fakeCanvas(216, 384).getContext('2d');
      const r = C.drawCover(ctx, { variant, programme: 'NEWS IN 60', words: 'NAIROBI TRACES 40 CONTACTS', photo: { width: 216, height: 176 }, frame: { width: 216, height: 384 }, frameRect: { x: 0, y: 72, w: 216, h: 176 }, kicker: 'NEWS IN 60 · 17 OCT' });
      assert.ok(r.fit, variant);
      const words = ctx.fills.filter((f) => f.c === '#ffffff' || f.c === '#feae34');
      assert.ok(words.length > 20, variant);
      const ys = words.map((f) => f.y);
      assert.ok(Math.min(...ys) >= C.COVER_SAFE.top && Math.max(...words.map((f) => f.y + f.h)) <= C.COVER_SAFE.bottom, `${variant}: ${Math.min(...ys)}-${Math.max(...ys)}`);
      // (below the mast: the bug draws the on-air top row clipped to itself, which this fake canvas does not clip)
      for (const im of ctx.images.filter((x) => x.y >= 40)) assert.ok(im.x >= 0 && im.y >= 0 && im.x + im.w <= 216 && im.y + im.h <= 384, `${variant}: ${JSON.stringify(im)}`);
    }
    for (const variant of C.VARIANTS) {
      const ctx = fakeCanvas(384, 216).getContext('2d');
      C.drawThumb16(ctx, { variant, programme: 'NEWS IN 60', words: 'NAIROBI TRACES 40 CONTACTS', photo: { width: 384, height: 136 }, frame: { width: 216, height: 384 }, frameRect: { x: 0, y: 72, w: 216, h: 176 } });
      const words = ctx.fills.filter((f) => f.c === '#ffffff' || f.c === '#feae34');
      assert.ok(!words.some((f) => f.x + f.w > C.THUMB_STAMP.x && f.y + f.h > C.THUMB_STAMP.y), `${variant}: a word under the time stamp`);
    }
  });

  test('every layout sets 22 characters of nine-letter words at 3x at least: readable at YouTube\'s 168×94 and 246×138', () => {
    const words = 'RECORDED FRONTLINE ABC';
    for (const variant of C.VARIANTS) {
      for (const [format, w, h] of [['vertical', 216, 384], ['horizontal', 384, 216]]) {
        const ctx = fakeCanvas(w, h).getContext('2d');
        const r = format === 'vertical' ? C.drawCover(ctx, { variant, programme: 'TECH BYTES', words, photo: { width: 416, height: 234 }, frame: { width: 216, height: 384 }, frameRect: { x: 0, y: 72, w: 216, h: 176 } }) : C.drawThumb16(ctx, { variant, programme: 'TECH BYTES', words, photo: { width: 416, height: 234 }, frame: { width: 216, height: 384 }, frameRect: { x: 0, y: 72, w: 216, h: 176 } });
        assert.ok(r.fit && r.fit.scale >= 3, `${format} ${variant}: scale ${r.fit?.scale}`);
        if (format === 'horizontal') for (const yt of [168, 246]) assert.ok((7 * r.fit.scale * yt) / 384 >= 9, `${variant} at ${yt} px wide: letters ${((7 * r.fit.scale * yt) / 384).toFixed(1)} px tall`);
      }
    }
  });

  test('a story\'s picture is pixelated exactly as on air, shown at 1x: never finer than the channel\'s own pixel', async () => {
    const { readFileSync } = await import('node:fs');
    const director = readFileSync(new URL('../public/js/director.js', import.meta.url), 'utf8');
    const full = /const FULL = \{ w: (\d+), h: (\d+) \}/.exec(director);
    assert.deepEqual([C.ON_AIR_PICTURE.w, C.ON_AIR_PICTURE.h], [Number(full[1]), Number(full[2])], 'the on-air full-screen rendition');
    const lab = readFileSync(new URL('../public/lab/thumb.html', import.meta.url), 'utf8');
    assert.match(lab, /pixelate\(await load\(spec\.photo\), ON_AIR_PICTURE\.w, ON_AIR_PICTURE\.h, \{ colors: ON_AIR_PICTURE\.colors/, 'the lab pixelates at the on-air size, nothing finer');
    // and a cover draws it unscaled: every source pixel is one canvas pixel (5x on the published file, as on air)
    for (const [draw, w, h] of [[C.drawCover, 216, 384], [C.drawThumb16, 384, 216]]) {
      for (const variant of ['photo', 'words']) {
        const ctx = fakeCanvas(w, h).getContext('2d');
        const photo = { width: 416, height: 234 };
        const calls = [];
        const orig = ctx.drawImage;
        ctx.drawImage = function (img, ...a) { if (img === photo) calls.push(a); return orig.call(this, img, ...a); };
        draw(ctx, { variant, programme: 'COSMOS DESK', words: '£15M', photo, photoRect: { x: 0, y: 0, w: 416, h: 234 } });
        assert.ok(calls.length, `${variant}: the photo is drawn`);
        for (const a of calls) assert.ok(a.length === 8 && a[2] === a[6] && a[3] === a[7], `${variant}: drawn at 1x (${a.join(',')})`);
      }
    }
  });

  test('the presenter stands as a cut-out, and the words keep 200 pixels beside them on a thumbnail', () => {
    const ctx = fakeCanvas(384, 216).getContext('2d');
    // a wide figure that would crowd the words: the thumbnail moves it right (the edge may cut a shoulder, never the face)
    const sprite = { canvas: { getContext: () => ({ getImageData: () => ({ data: new Uint8ClampedArray(240 * 200 * 4) }) }) }, w: 240, h: 200, head: { x: 120, y: 50 } };
    const r = C.drawThumb16(ctx, { variant: 'presenter', programme: 'MONEY MINUTE', accent: '#63c74d', words: 'SKY-ITV DEAL UNDER REVIEW', sprite });
    assert.ok(r.fit, 'the words are set');
    assert.ok(r.box.x >= 222, `the figure starts at ${r.box.x}`);
    assert.ok(r.box.x + 120 + 30 <= 384, 'the face stays inside the frame');
    const words = ctx.fills.filter((f) => f.c === '#ffffff');
    assert.ok(words.length > 20 && Math.max(...words.map((f) => f.x + f.w)) <= r.box.x, 'no word under the figure');
  });

  test('who stands on a clip\'s covers: the anchor of its first segment, with the segment\'s emotion; serious on grave news', () => {
    const episode = { program: { id: 'world-now' }, cast: { A: 'paco', B: 'lola' }, segments: [{ anchor: 'A', emotion: 'neutral' }, { anchor: 'B', emotion: 'happy' }, { anchor: 'A', emotion: 'sad' }] };
    assert.deepEqual(coverCast(episode, { from: 1 }), { presenter: 'lola', partner: 'paco', emotion: 'happy' });
    assert.deepEqual(coverCast(episode, { from: 2 }), { presenter: 'paco', partner: 'lola', emotion: 'serious' }, 'sad reads as serious on a cover');
    assert.deepEqual(coverCast(episode, { from: 1, grave: true }), { presenter: 'lola', partner: 'paco', emotion: 'serious' }, 'never a smile on grave news');
    const feat = { cast: { A: 'max' }, segments: [{ anchor: 'A', emotion: 'neutral', feature: 'number' }, { anchor: 'A', emotion: 'neutral', feature: 'lighter' }] };
    assert.equal(coverCast(feat, { from: 0 }).emotion, 'surprised', 'a striking figure');
    assert.equal(coverCast(feat, { from: 1 }).emotion, 'happy', 'a lighter story');
    assert.equal(coverCast(feat, { from: 0, grave: true }).emotion, 'serious');
    assert.deepEqual(coverCast({ program: { id: 'pay-attention' }, segments: [] }), { presenter: 'qm', partner: null, emotion: 'neutral' }, 'the programme\'s presenter from the channel file');
  });

  test('grave news: no plate and no accent colour in the words, the bar in the set\'s steel', () => {
    for (const variant of C.VARIANTS) {
      const ctx = fakeCanvas(384, 216).getContext('2d');
      C.drawThumb16(ctx, { variant, programme: 'NEWS IN 60', accent: '#feae34', words: 'KYIV POWER PLANT HIT', grave: true });
      assert.ok(!ctx.fills.some((f) => f.c === '#feae34' && f.h > 6 && f.y > 30), `${variant}: no plate in the programme's colour (its tag in the brand row aside)`);
    }
  });

  test('grave news: no accent colour in the words, the bar in the set\'s steel', () => {
    const ctx = fakeCanvas(216, 384).getContext('2d');
    C.drawCover(ctx, { variant: 'words', programme: 'WORLD NOW', accent: '#e43b44', words: 'TWO LINES HERE', grave: true });
    assert.ok(!ctx.fills.some((f) => f.c === '#feae34' || f.c === '#e43b44' && f.w === 216 && f.h === 4), 'no yellow word, no red bar');
  });
});

test('the clip\'s frames for a cover: the presenter just before a sentence, a board a second in (a quiz\'s question, not its answer)', () => {
  const report = { events: [{ type: 'shot', shot: 'close', v: 10 }, { type: 'sentence', v: 10.1 }, { type: 'sentence', v: 12.5 }, { type: 'shot', shot: 'quiz', v: 14 }, { type: 'shot', shot: 'close', v: 16 }, { type: 'shot', shot: 'close', v: 20 }] };
  const f = pickFrames(report, { start: 9.5, end: 19 });
  assert.equal(f.presenter, 12.38);
  assert.equal(f.presenter2, 16.5, 'the second person on screen');
  assert.equal(f.board, null, 'never a dense board (a quiz board\'s lines of type are unreadable at phone size)');
  assert.deepEqual(pickFrames({ events: [] }, { start: 0, end: 10 }), { presenter: null, presenter2: null, board: null });
  // a weather board with no one on screen: the presenter from the nearest studio shot, a face for the cover
  const wx = pickFrames({ events: [{ type: 'shot', shot: 'close', v: 2 }, { type: 'shot', shot: 'weather', v: 8 }, { type: 'shot', shot: 'close', v: 40 }] }, { start: 9, end: 20 });
  assert.equal(wx.presenter, 2.8);
  // never the open's montage or a tease: their frames carry the headlines as aired
  assert.equal(pickFrames({ events: [{ type: 'shot', shot: 'montage', v: 0 }, { type: 'shot', shot: 'map', v: 5 }] }, { start: 0, end: 9 }).board, 6);
});

describe('the big words tell a stranger what happened (the coordinator\'s round)', () => {
  const f = () => ({ ...facts(), grave: true });
  test('never a label, never a nickname or a quotation out of context, never a teaser', () => {
    for (const t of ['NUMBER OF THE DAY', 'STORY OF THE WEEK', 'SCORE CENTRE', 'ROUND THREE', 'THE HEADLINES', 'FULL PROGRAMME', 'PLAY ALONG', 'WHAT WE KNOW']) assert.ok(checkThumb(t, f(), {}).some((x) => /a label/.test(x)), t);
    assert.ok(checkThumb('SERVICE HALTED', f(), {}).some((x) => /too vague/.test(x)));
    assert.ok(checkThumb('IMPROVING', f(), {}).some((x) => /too vague/.test(x)));
    const nick = { ...f(), aired: `${f().aired} Loughnane, nicknamed 'Billy the Kid', won.` };
    assert.ok(checkThumb('BILLY THE KID', nick, {}).some((x) => /out of its context/.test(x)));
    for (const t of ['19 INJURED', 'KENYA', 'NAIROBI CONTACTS', 'MORE THAN 40 TRACED']) assert.deepEqual(checkThumb(t, { ...f(), aired: `${f().aired} 19 injured.` }, {}), [], t);
  });

  test('the deterministic writer never sets a fragment big: a number inside a name is no figure, a date alone no news', () => {
    const f = { ...facts(), grave: false, aired: 'GTA 6 - all you need to know about the new trailer from Rockstar.', subject: 'Jr' };
    const pack = fallbackPackage(f);
    assert.ok(!pack.thumbs.some((t) => /^6 ALL|^JR$/.test(t)), pack.thumbs.join(' / '));
    assert.ok(checkThumb('17 OCT', facts(), {}).some((x) => /a date/.test(x)));
  });

  test('a title leads with its topic: never a filler first (the first two words are what a scanning eye reads)', () => {
    const f = { ...facts(), grave: false };
    for (const t of ["Here's what NASA plans for its low flights over Texas", 'There is a new GTA 6 trailer from Rockstar today', 'So, Tesla says its Roadster can now fly']) assert.ok(checkTitle(t, f).some((x) => /filler/.test(x)), t);
  });

  test('a number clip shows its number; a person\'s health is told plainly, with who', () => {
    const num = { ...facts(), grave: false, kind: 'number', aired: 'Our number of the day: £15m for zero-emission tests at Belfast Harbour.' };
    assert.ok(checkThumb('BELFAST HARBOUR', num, {}).some((x) => /without its number/.test(x)));
    assert.ok(checkThumb('£15M', num, {}).some((x) => /a figure alone/.test(x)), 'a figure alone says nothing of what it is (and beside a face reads as theirs)');
    assert.deepEqual(checkThumb('£15M FOR BELFAST', num, {}), []);
    assert.ok(checkThumb('£15M FOR TESTS', num, {}).some((x) => /a sum without whose/.test(x)), 'a sum beside a picture names whose it is');
    const health = { ...facts(), grave: false, headline: 'Pope Leo is improving after surgery', aired: 'Pope Leo is showing steady improvement after his surgery at Rome\'s Gemelli Hospital.' };
    assert.ok(checkThumb('BACK SOON?', health, {}).length);
    assert.ok(checkTitle('Will Pope Leo be back on Sunday after his surgery?', health).some((x) => /health/.test(x)));
    assert.deepEqual(checkThumb('POPE LEO AFTER SURGERY', health, {}), []);
    assert.ok(checkThumb('GEMELLI HOSPITAL', health, {}).some((x) => /health without who/.test(x)), 'a hospital is where, not who');
    assert.ok(checkThumb('POPE LEO', health, {}).some((x) => /a name alone/.test(x)), 'who, and what');
    const sunday = { ...health, aired: `${health.aired} He may lead Sunday prayers.`, presenters: ['Amara'], castNames: ['Dr Amara Pulse'] };
    assert.ok(checkThumb('SUNDAY PRAYERS', sunday, {}).length, 'a day is when, not who');
    assert.ok(checkThumb('DR AMARA PULSE', sunday, {}).length, 'the channel\'s presenter is not the story');
  });
});

describe('what the critics found (docs/roadmap/critique/thumbnails-titles.md)', () => {
  test('no promise of an explanation a short clip does not give; no word too long to set big', () => {
    const f = { ...facts(), grave: false, duration: 14, aired: 'Kenya has three Ebola cases.' };
    assert.ok(checkTitle('Why Kenya has a third Ebola case', f).some((x) => /explanation/.test(x)));
    assert.ok(!checkTitle('Why Kenya has a third Ebola case', { ...f, duration: 45 }).some((x) => /explanation/.test(x)), 'half a minute explains');
    assert.ok(!checkTitle('How many? A question about Kenya and Ebola', f).some((x) => /explanation/.test(x)), 'a quiz\'s question is no promise');
    assert.ok(checkThumb('STEADY IMPROVEMENT', f, {}).some((x) => /too long to read big/.test(x)));
  });

  test('a running-order label is never a hashtag, and a hashtag is capitalised as words', () => {
    const tags = hashtagsFor({ ...facts(), grave: false, kicker: '', label: '', place: 'NEW YORK', subject: '' });
    assert.ok(tags.includes('NewYork'), tags.join(' '));
    const f = packFacts({ ...moment, grave: false }, { ...ep, segments: [{ ...ep.segments[0], kicker: 'STORY OF THE WEEK', location: null }] }, { stories });
    assert.ok(!hashtagsFor(f).some((t) => /story/i.test(t)), hashtagsFor(f).join(' '));
  });

  test('one story\'s picture for one story\'s clip: a clip of several stories shows its own frames', () => {
    const dir = tmp('pack-pic-');
    fs.writeFileSync(path.join(dir, 'k1.jpg'), 'x');
    const e = { rundown: [{ storyId: 'k1', hasImage: true, imageCredit: 'FILE · A · CC BY 4.0 · PIXELATED', imageRights: { cleared: true } }] };
    assert.equal(pictureOf(e, ['k1'], dir).url, '/api/img/k1');
    assert.equal(pictureOf(e, ['k1', 'k2'], dir), null);
    assert.equal(pictureOf({ rundown: [{ ...e.rundown[0], imageRights: { cleared: false } }] }, ['k1'], dir), null, 'never an uncleared picture');
  });

  test('a whole programme\'s thumbnail A is about its lead story, whose picture it stands on', async () => {
    const two = { ...ep, segments: [...ep.segments, { type: 'story', storyId: 'g1', headline: 'UK economy grew 0.1% in August', text: 'The UK economy grew by 0.1% in August.', source: 'BBC Business' }] };
    const f = episodeFacts(two, { stories, duration: 120, title: 'NEWS IN 60: Kenya reports a third Ebola case · 17 Oct' });
    const reply = JSON.stringify({ titles: ['NEWS IN 60: Ebola in Kenya, the UK economy and more'], thumbs: ['UK GROWTH 0.1%', '40 CONTACTS', 'FULL PROGRAMME'], hook: 'Kenya reports a third Ebola case, and the UK economy grew 0.1% in August.', lead: 'NEWS IN 60 of 17 Oct.' });
    const p = await writePackage(f, { chain: { generate: async (req, validate) => ({ value: validate(reply) }) } });
    assert.equal(p.thumbs[0], '40 CONTACTS', p.thumbs.join(' / '));
  });
});
