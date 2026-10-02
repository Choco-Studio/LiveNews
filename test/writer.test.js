import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { EMOTIONS, SHOTS, buildPrompt, buildReviewPrompt, extractJson, normalizeBulletin } from '../server/writer.js';
import { ACTIONS, EMOTIONS as CUE_EMOTIONS } from '../public/js/cues.js';

// ---------------------------------------------------------------- helpers

const makeStory = (id, extra = {}) => ({
  id,
  title: `Headline of story ${id}`,
  summary: 'Summary of the story. A second sentence of the summary.',
  source: 'BBC News',
  category: 'world',
  image: null,
  ...extra,
});

const STORIES = [makeStory('s1'), makeStory('s2', { image: 'https://img.test/s2.jpg', source: 'Al Jazeera', category: 'business' }), makeStory('s3')];

const PROGRAM = {
  id: 'world-now',
  title: 'WORLD NOW',
  tagline: 'THE STORIES SHAPING OUR WORLD',
  theme: 'world',
  presenters: ['paco', 'lola'],
  categories: ['world', 'business'],
  stories: 5,
  maxChats: 3,
  style: 'Flagship world news bulletin. Lead with the biggest global story.',
  storyLength: '2 to 4 sentences, max 450 characters',
};

const PACO = { name: 'Paco Pixel', personality: 'veteran anchor, calm and authoritative' };
const LOLA = { name: 'Lola Byte', personality: 'co-anchor, energetic and curious' };
const DUO = { A: PACO, B: LOLA };
const SOLO = { A: { name: 'Penny Sterling', personality: 'crisp markets correspondent' } };

const storySeg = (id, extra = {}) => ({
  type: 'story',
  storyId: id,
  anchor: 'A',
  emotion: 'neutral',
  headline: `Caption ${id}`,
  text: `Text of story ${id}.`,
  shot: 'wide',
  ...extra,
});

const otherSeg = (type, extra = {}) => ({ type, anchor: 'A', emotion: 'neutral', text: `Text of ${type}.`, ...extra });

const normalize = (segments, { stories = STORIES, raw = {}, opts } = {}) => normalizeBulletin({ title: 'Bulletin', ...raw, segments }, stories, opts);

/** The single story segment produced from one input story segment. */
const storyOf = (extra, opts) => normalize([storySeg('s1', extra)], { opts }).segments[1];

const types = (bulletin) => bulletin.segments.map((s) => s.type);

// ---------------------------------------------------------------- constants

describe('writer constants', () => {
  test('EMOTIONS and SHOTS match what the renderer understands', () => {
    assert.deepEqual(EMOTIONS, ['neutral', 'happy', 'serious', 'surprised', 'sad', 'thinking']);
    assert.deepEqual(SHOTS, ['wide', 'close', 'full', 'map']);
  });
});

// ---------------------------------------------------------------- extractJson

describe('extractJson', () => {
  const obj = { title: 'T', segments: [{ type: 'intro', text: 'Hello' }] };

  test('parses plain JSON', () => {
    assert.deepEqual(extractJson(JSON.stringify(obj)), obj);
  });

  test('parses JSON wrapped in ```json fences', () => {
    const raw = '```json\n' + JSON.stringify(obj, null, 2) + '\n```';
    assert.deepEqual(extractJson(raw), obj);
  });

  test('parses JSON wrapped in bare ``` fences', () => {
    assert.deepEqual(extractJson('```\n' + JSON.stringify(obj) + '\n```'), obj);
  });

  test('ignores text before and after the object', () => {
    const raw = `Sure, here is the script:\n\n${JSON.stringify(obj)}\n\nHope you like it. Best wishes!`;
    assert.deepEqual(extractJson(raw), obj);
  });

  test('handles braces inside string values', () => {
    const tricky = { text: 'a } b', other: 'x { y', nested: { k: '}}}' } };
    assert.deepEqual(extractJson(`prefix ${JSON.stringify(tricky)} suffix`), tricky);
    assert.deepEqual(extractJson('{"text": "a } b"}'), { text: 'a } b' });
  });

  test('handles escaped quotes and backslashes inside strings', () => {
    const tricky = { text: 'said "hello }" and a backslash \\', ok: true };
    assert.deepEqual(extractJson(JSON.stringify(tricky) + ' trailing }'), tricky);
  });

  test('handles nested objects and arrays', () => {
    const deep = { a: { b: { c: [1, { d: [] }] } }, e: [{ f: {} }] };
    assert.deepEqual(extractJson(JSON.stringify(deep)), deep);
  });

  test('returns only the first top-level object when there are several', () => {
    assert.deepEqual(extractJson('{"n":1} {"n":2}'), { n: 1 });
  });

  test('throws "reply contains no JSON" when there is no JSON object at all', () => {
    assert.throws(() => extractJson("I'm sorry, I cannot help with that."), /reply contains no JSON/);
    assert.throws(() => extractJson(''), /reply contains no JSON/);
    assert.throws(() => extractJson(undefined), /reply contains no JSON/);
  });

  test('throws "incomplete JSON in reply" on truncated JSON', () => {
    assert.throws(() => extractJson('{"title": "T", "segments": [{"type": "intro"'), /incomplete JSON in reply/);
    assert.throws(() => extractJson('{"a": {"b": 1}'), /incomplete JSON in reply/);
    assert.throws(() => extractJson('{"text": "never closed'), /incomplete JSON in reply/);
  });

  test('throws a SyntaxError when the braces balance but the content is not valid JSON', () => {
    assert.throws(() => extractJson('{this is not json}'), SyntaxError);
  });
});

// ---------------------------------------------------------------- normalizeBulletin: stories

describe('normalizeBulletin: story segments', () => {
  test('keeps valid story segments and decorates them with source, category, hasImage, location, fact and flags', () => {
    const b = normalize([storySeg('s1', { breaking: true }), storySeg('s2', { shot: 'close', emotion: 'serious', anchor: 'B' })]);
    const [, s1, s2] = b.segments;
    assert.equal(s1.storyId, 's1');
    assert.equal(s1.source, 'BBC News');
    assert.equal(s1.category, 'world');
    assert.equal(s1.hasImage, false);
    assert.equal(s1.breaking, true);
    assert.equal(s1.location, null);
    assert.equal(s1.fact, null);
    assert.equal(s2.source, 'Al Jazeera');
    assert.equal(s2.category, 'business');
    assert.equal(s2.hasImage, true);
    assert.equal(s2.breaking, false);
    assert.equal(s2.shot, 'close');
    assert.equal(s2.emotion, 'serious');
    assert.equal(s2.anchor, 'B');
  });

  test('the story segment has exactly the fields the renderer expects', () => {
    const [, s] = normalize([storySeg('s1')]).segments;
    assert.deepEqual(Object.keys(s).sort(), ['anchor', 'breaking', 'category', 'cues', 'emotion', 'fact', 'hasImage', 'headline', 'location', 'shot', 'source', 'storyId', 'text', 'type']);
  });

  test('drops segments with an unknown storyId', () => {
    const b = normalize([storySeg('s1'), storySeg('nope'), storySeg('s2')]);
    assert.deepEqual(b.storyIds, ['s1', 's2']);
    assert.equal(b.segments.filter((s) => s.type === 'story').length, 2);
  });

  test('drops duplicate story segments (the first one wins)', () => {
    const b = normalize([storySeg('s1', { text: 'First version.' }), storySeg('s1', { text: 'Second version.' }), storySeg('s2')]);
    const stories = b.segments.filter((s) => s.type === 'story');
    assert.deepEqual(stories.map((s) => s.storyId), ['s1', 's2']);
    assert.equal(stories[0].text, 'First version.');
  });

  test('throws "bulletin has no valid stories" when no valid story remains', () => {
    assert.throws(() => normalize([storySeg('nope'), otherSeg('intro'), otherSeg('outro')]), /bulletin has no valid stories/);
    assert.throws(() => normalize([otherSeg('intro'), otherSeg('chat'), otherSeg('outro')]), /bulletin has no valid stories/);
    assert.throws(() => normalize([]), /bulletin has no valid stories/);
    assert.throws(() => normalizeBulletin({}, STORIES), /bulletin has no valid stories/);
    assert.throws(() => normalizeBulletin(null, STORIES), /bulletin has no valid stories/);
    assert.throws(() => normalizeBulletin({ segments: 'text' }, STORIES), /bulletin has no valid stories/);
    assert.throws(() => normalize([storySeg('s1')], { stories: [] }), /bulletin has no valid stories/);
  });

  test('drops segments with an unknown type or no text', () => {
    const b = normalize([
      storySeg('s1'),
      { type: 'banner', text: 'this type does not exist' },
      null,
      'loose text',
      storySeg('s2', { text: '   ' }),
      storySeg('s3'),
    ]);
    assert.deepEqual(b.storyIds, ['s1', 's3']);
  });

  test('breaking is only true for a literal boolean true', () => {
    const b = normalize([storySeg('s1', { breaking: 'true' }), storySeg('s2', { breaking: 1 }), storySeg('s3', { breaking: true })]);
    assert.deepEqual(b.segments.filter((s) => s.type === 'story').map((s) => s.breaking), [false, false, true]);
  });

  test('maxStories keeps the first N valid, distinct stories and drops the rest', () => {
    const stories = ['s1', 's2', 's3', 's4'].map((id) => makeStory(id));
    const b = normalize([storySeg('s1'), storySeg('nope'), storySeg('s1'), storySeg('s2'), storySeg('s3'), storySeg('s4')], { stories, opts: { maxStories: 2 } });
    assert.deepEqual(b.storyIds, ['s1', 's2']);
    assert.deepEqual(b.rundown.map((r) => r.storyId), ['s1', 's2']);
    assert.equal(b.segments.filter((s) => s.type === 'story').length, 2);
  });

  test('without maxStories every valid story is kept', () => {
    const stories = Array.from({ length: 12 }, (_, i) => makeStory(`s${i}`));
    const b = normalize(stories.map((s) => storySeg(s.id)), { stories });
    assert.equal(b.storyIds.length, 12);
  });
});

// ---------------------------------------------------------------- normalizeBulletin: fields

describe('normalizeBulletin: field validation', () => {
  test('invalid emotion becomes "neutral"; valid ones are kept', () => {
    for (const emotion of EMOTIONS) {
      assert.equal(storyOf({ emotion }).emotion, emotion);
    }
    for (const emotion of ['furious', '', undefined, 42, 'HAPPY']) {
      assert.equal(storyOf({ emotion }).emotion, 'neutral', String(emotion));
    }
  });

  test('invalid shot becomes "wide"; valid ones are kept (map needs a location, see below)', () => {
    for (const shot of ['wide', 'close', 'full']) {
      assert.equal(storyOf({ shot }).shot, shot);
    }
    for (const shot of ['zoom', '', undefined, null]) {
      assert.equal(storyOf({ shot }).shot, 'wide', String(shot));
    }
  });

  test('any anchor other than "B" becomes "A"', () => {
    assert.equal(storyOf({ anchor: 'B' }).anchor, 'B');
    for (const anchor of ['A', 'C', 'b', '', undefined, 1]) {
      assert.equal(storyOf({ anchor }).anchor, 'A', String(anchor));
    }
  });

  test('validation also applies to intro, chat and outro segments', () => {
    const b = normalize([
      otherSeg('intro', { anchor: 'Z', emotion: 'ecstatic' }),
      storySeg('s1'),
      otherSeg('chat', { anchor: 'B', emotion: 'surprised' }),
      otherSeg('outro', { anchor: 'x', emotion: 'sad' }),
    ]);
    const [intro, , chat, outro] = b.segments;
    assert.deepEqual([intro.anchor, intro.emotion], ['A', 'neutral']);
    assert.deepEqual([chat.anchor, chat.emotion], ['B', 'surprised']);
    assert.deepEqual([outro.anchor, outro.emotion], ['A', 'sad']);
  });

  test('clamps the headline to 56 characters at a word boundary', () => {
    const headline = 'seven '.repeat(12).trim(); // 71 chars, words of 5 letters
    const s = storyOf({ headline });
    assert.ok(s.headline.length <= 56, `length ${s.headline.length}`);
    assert.equal(s.headline, 'seven '.repeat(9).trim());
    assert.ok(headline.startsWith(s.headline) && headline[s.headline.length] === ' ', 'cut must fall on a word boundary');
  });

  test('keeps a headline that is already short enough, including exactly 56 characters', () => {
    const exactly56 = 'word ' + 'x'.repeat(51);
    assert.equal(exactly56.length, 56);
    assert.equal(storyOf({ headline: exactly56 }).headline, exactly56);
    assert.equal(storyOf({ headline: 'Short' }).headline, 'Short');
  });

  test('strips trailing punctuation left over after clamping the headline', () => {
    const headline = 'x'.repeat(50) + ', ' + 'yyyyyyyy zzz';
    assert.equal(storyOf({ headline }).headline, 'x'.repeat(50));
  });

  test('a single very long word is still clamped to 56 characters', () => {
    assert.equal(storyOf({ headline: 'a'.repeat(100) }).headline, 'a'.repeat(56));
  });

  test('falls back to the (clamped) story title when the headline is empty or missing', () => {
    const stories = [makeStory('s1', { title: 'Original headline of the story' }), makeStory('s2', { title: 'word '.repeat(20) })];
    const b = normalize([storySeg('s1', { headline: '' }), storySeg('s2', { headline: undefined })], { stories });
    const [, a, c] = b.segments;
    assert.equal(a.headline, 'Original headline of the story');
    assert.ok(c.headline.length <= 56 && c.headline.startsWith('word word'));
  });

  test('clips long text to 520 characters, preferably at a sentence end', () => {
    const text = 'This is a filler sentence for the script. '.repeat(30).trim();
    const s = storyOf({ text });
    assert.ok(text.length > 520);
    assert.ok(s.text.length <= 520, `length ${s.text.length}`);
    assert.ok(s.text.endsWith('.'), s.text.slice(-20));
    assert.ok(text.startsWith(s.text));
  });

  test('clips long text without sentence stops at a word boundary and adds an ellipsis', () => {
    const s = storyOf({ text: 'word '.repeat(200) });
    assert.ok(s.text.length <= 520, `length ${s.text.length}`);
    assert.ok(s.text.endsWith('word…'), s.text.slice(-20));
  });

  test('leaves short text untouched', () => {
    assert.equal(storyOf({ text: 'Two sentences. Nothing more.' }).text, 'Two sentences. Nothing more.');
  });

  test('strips markdown characters (* _ # `) and collapses whitespace in text, headline and title', () => {
    const b = normalize([storySeg('s1', { text: '**Hello**   _world_\n# `code`', headline: '## **Headline** `one`' })], {
      raw: { title: '*Bulletin* #1' },
    });
    assert.equal(b.segments[1].text, 'Hello world code');
    assert.equal(b.segments[1].headline, 'Headline one');
    assert.equal(b.title, 'Bulletin 1');
  });

  test('title defaults to "News bulletin" and is capped at 80 characters', () => {
    assert.equal(normalize([storySeg('s1')], { raw: { title: undefined } }).title, 'News bulletin');
    assert.equal(normalize([storySeg('s1')], { raw: { title: '  ' } }).title, 'News bulletin');
    assert.equal(normalize([storySeg('s1')], { raw: { title: 'T'.repeat(200) } }).title.length, 80);
  });
});

// ---------------------------------------------------------------- normalizeBulletin: location, map shot, fact

describe('normalizeBulletin: location', () => {
  test('keeps a valid location, with lat/lon rounded to 2 decimals', () => {
    const s = storyOf({ location: { place: 'PARIS, FRANCE', lat: 48.8566, lon: 2.3522 } });
    assert.deepEqual(s.location, { place: 'PARIS, FRANCE', lat: 48.86, lon: 2.35 });
  });

  test('accepts negative coordinates and numeric strings', () => {
    assert.deepEqual(storyOf({ location: { place: 'SYDNEY, AUSTRALIA', lat: -33.8688, lon: 151.2093 } }).location, { place: 'SYDNEY, AUSTRALIA', lat: -33.87, lon: 151.21 });
    assert.deepEqual(storyOf({ location: { place: 'LIMA, PERU', lat: '-12.0464', lon: '-77.0428' } }).location, { place: 'LIMA, PERU', lat: -12.05, lon: -77.04 });
  });

  test('the poles and the date line are valid, one step beyond is not', () => {
    assert.deepEqual(storyOf({ location: { place: 'EDGE', lat: 90, lon: 180 } }).location, { place: 'EDGE', lat: 90, lon: 180 });
    assert.deepEqual(storyOf({ location: { place: 'EDGE', lat: -90, lon: -180 } }).location, { place: 'EDGE', lat: -90, lon: -180 });
    assert.equal(storyOf({ location: { place: 'EDGE', lat: 90.01, lon: 0 } }).location, null);
    assert.equal(storyOf({ location: { place: 'EDGE', lat: -90.5, lon: 0 } }).location, null);
    assert.equal(storyOf({ location: { place: 'EDGE', lat: 0, lon: 180.01 } }).location, null);
    assert.equal(storyOf({ location: { place: 'EDGE', lat: 0, lon: -181 } }).location, null);
  });

  test('an invalid location becomes null', () => {
    const bad = [
      undefined,
      null,
      'PARIS',
      42,
      {},
      { place: 'PARIS, FRANCE' },
      { lat: 48.85, lon: 2.35 },
      { place: '', lat: 48.85, lon: 2.35 },
      { place: '   ', lat: 48.85, lon: 2.35 },
      { place: 'PARIS', lat: 'north', lon: 2.35 },
      { place: 'PARIS', lat: 48.85, lon: 'east' },
      { place: 'PARIS', lat: NaN, lon: 2.35 },
      { place: 'PARIS', lat: Infinity, lon: 2.35 },
      { place: 'PARIS', lat: 48.85 },
    ];
    for (const location of bad) {
      assert.equal(storyOf({ location }).location, null, JSON.stringify(location));
    }
  });

  test('clamps the place name to 32 characters at a word boundary', () => {
    const s = storyOf({ location: { place: 'A VERY LONG PLACE NAME INDEED, WITH A COUNTRY NAME', lat: 1, lon: 2 } });
    assert.equal(s.location.place, 'A VERY LONG PLACE NAME INDEED');
    assert.ok(s.location.place.length <= 32);
  });

  test('strips markdown and extra whitespace from the place name', () => {
    assert.equal(storyOf({ location: { place: '**GAZA**   CITY', lat: 31.5, lon: 34.47 } }).location.place, 'GAZA CITY');
  });

  test('a "map" shot is kept when the story has a valid location', () => {
    const s = storyOf({ shot: 'map', location: { place: 'KYIV, UKRAINE', lat: 50.45, lon: 30.52 } });
    assert.equal(s.shot, 'map');
    assert.equal(s.location.place, 'KYIV, UKRAINE');
  });

  test('a "map" shot is downgraded to "close" when there is no valid location', () => {
    assert.equal(storyOf({ shot: 'map' }).shot, 'close');
    assert.equal(storyOf({ shot: 'map', location: null }).shot, 'close');
    assert.equal(storyOf({ shot: 'map', location: { place: 'KYIV', lat: 500, lon: 30 } }).shot, 'close');
  });

  test('other shots are untouched by a missing location', () => {
    for (const shot of ['wide', 'close', 'full']) assert.equal(storyOf({ shot }).shot, shot);
  });

  test('a location without a "map" shot is kept as is', () => {
    const s = storyOf({ shot: 'close', location: { place: 'KYIV, UKRAINE', lat: 50.45, lon: 30.52 } });
    assert.equal(s.shot, 'close');
    assert.deepEqual(s.location, { place: 'KYIV, UKRAINE', lat: 50.45, lon: 30.52 });
  });

  test(
    'null, empty or boolean coordinates are not valid and must not be read as 0',
    {
      todo:
        'BUG server/writer.js:165-166 - Number(null), Number("") and Number(false) are 0 and Number(true) is 1, so {place:"PARIS, FRANCE", lat:null, lon:null} is accepted as {lat:0, lon:0} (the Gulf of Guinea) instead of being rejected',
    },
    () => {
      assert.equal(storyOf({ location: { place: 'PARIS, FRANCE', lat: null, lon: null } }).location, null);
      assert.equal(storyOf({ location: { place: 'PARIS, FRANCE', lat: '', lon: '' } }).location, null);
      assert.equal(storyOf({ location: { place: 'PARIS, FRANCE', lat: true, lon: false } }).location, null);
    }
  );
});

describe('normalizeBulletin: fact', () => {
  test('keeps a short fact as is', () => {
    assert.equal(storyOf({ fact: '40,000 EVACUATED' }).fact, '40,000 EVACUATED');
    assert.equal(storyOf({ fact: '$2BN DEAL' }).fact, '$2BN DEAL');
  });

  test('is null when missing, empty or not text-like', () => {
    for (const fact of [undefined, null, '', '   ', '***']) {
      assert.equal(storyOf({ fact }).fact, null, String(fact));
    }
  });

  test('keeps a fact of exactly 48 characters, and cuts a longer one at a word boundary', () => {
    const exactly48 = 'word ' + 'x'.repeat(43);
    assert.equal(exactly48.length, 48);
    assert.equal(storyOf({ fact: exactly48 }).fact, exactly48);

    const long = 'MAGNITUDE SEVEN POINT ONE EARTHQUAKE STRIKES OFF THE COAST OF JAPAN';
    const cut = storyOf({ fact: long }).fact;
    assert.ok(cut.length <= 48, `length ${cut.length}`);
    assert.ok(long.startsWith(cut) && long[cut.length] === ' ', 'cut must fall on a word boundary');
    assert.equal(cut, 'MAGNITUDE SEVEN POINT ONE EARTHQUAKE STRIKES OFF');
  });

  test('strips markdown and whitespace', () => {
    assert.equal(storyOf({ fact: '**7.1**   MAGNITUDE' }).fact, '7.1 MAGNITUDE');
  });
});

// ---------------------------------------------------------------- normalizeBulletin: structure

describe('normalizeBulletin: structure', () => {
  test('keeps at most 3 chat segments by default', () => {
    const b = normalize([storySeg('s1'), ...Array.from({ length: 5 }, (_, i) => otherSeg('chat', { text: `Chat ${i}.` })), storySeg('s2')]);
    const chats = b.segments.filter((s) => s.type === 'chat');
    assert.deepEqual(chats.map((c) => c.text), ['Chat 0.', 'Chat 1.', 'Chat 2.']);
  });

  test('maxChats caps the chat segments; 0 removes them all', () => {
    const segments = [storySeg('s1'), otherSeg('chat', { text: 'Chat 0.' }), storySeg('s2'), otherSeg('chat', { text: 'Chat 1.' }), otherSeg('chat', { text: 'Chat 2.' }), storySeg('s3')];
    const chatsWith = (maxChats) => normalize(segments, { opts: { maxChats } }).segments.filter((s) => s.type === 'chat').map((c) => c.text);
    assert.deepEqual(chatsWith(1), ['Chat 0.']);
    assert.deepEqual(chatsWith(2), ['Chat 0.', 'Chat 1.']);
    assert.deepEqual(chatsWith(10), ['Chat 0.', 'Chat 1.', 'Chat 2.']);
    assert.deepEqual(chatsWith(0), []);
  });

  test('adds a default English intro and outro (using the channel name) when they are missing', () => {
    const b = normalize([storySeg('s1'), storySeg('s2')], { opts: { channelName: 'GLOBIT 24' } });
    assert.deepEqual(types(b), ['intro', 'story', 'story', 'outro']);
    assert.equal(b.segments[0].anchor, 'A');
    assert.equal(b.segments[0].emotion, 'happy');
    assert.equal(b.segments[0].text, 'Hello and welcome to GLOBIT 24. Here are the headlines.');
    assert.equal(b.segments.at(-1).anchor, 'B');
    assert.equal(b.segments.at(-1).emotion, 'happy');
    assert.equal(b.segments.at(-1).text, "That's all for now. Stay with us, GLOBIT 24 is live around the clock.");
  });

  test('the default intro and outro start with a wave', () => {
    const b = normalize([storySeg('s1')]);
    assert.deepEqual(b.segments[0].cues, [{ char: 0, slot: null, action: 'wave' }]);
    assert.deepEqual(b.segments.at(-1).cues, [{ char: 0, slot: null, action: 'wave' }]);
  });

  test('default channel name is LIVENEWS', () => {
    const b = normalize([storySeg('s1')]);
    assert.match(b.segments[0].text, /LIVENEWS/);
    assert.match(b.segments.at(-1).text, /LIVENEWS/);
  });

  test('uses the intro and outro written by the model instead of the defaults', () => {
    const b = normalize([otherSeg('intro', { text: 'My intro.' }), storySeg('s1'), otherSeg('outro', { text: 'My sign-off.' })]);
    assert.deepEqual(types(b), ['intro', 'story', 'outro']);
    assert.equal(b.segments[0].text, 'My intro.');
    assert.equal(b.segments[2].text, 'My sign-off.');
  });

  test('puts the intro first and the outro last even when the model misplaced them', () => {
    const b = normalize([
      storySeg('s1'),
      otherSeg('outro', { text: 'Goodbye.' }),
      otherSeg('intro', { text: 'Hello.' }),
      storySeg('s2'),
      otherSeg('chat', { text: 'Comment.' }),
    ]);
    assert.deepEqual(types(b), ['intro', 'story', 'story', 'chat', 'outro']);
    assert.equal(b.segments[0].text, 'Hello.');
    assert.equal(b.segments.at(-1).text, 'Goodbye.');
  });

  test('keeps only one intro and one outro', () => {
    const b = normalize([otherSeg('intro', { text: 'One.' }), otherSeg('intro', { text: 'Two.' }), storySeg('s1'), otherSeg('outro', { text: 'End A.' }), otherSeg('outro', { text: 'End B.' })]);
    assert.deepEqual(types(b), ['intro', 'story', 'outro']);
    assert.equal(b.segments[0].text, 'One.');
    assert.equal(b.segments[2].text, 'End A.');
  });

  test('removes leading chat segments before the first story, keeps later ones', () => {
    const b = normalize([otherSeg('chat', { text: 'First chat.' }), otherSeg('chat', { text: 'Second chat.' }), storySeg('s1'), otherSeg('chat', { text: 'Later chat.' }), storySeg('s2')]);
    assert.deepEqual(types(b), ['intro', 'story', 'chat', 'story', 'outro']);
    assert.equal(b.segments[2].text, 'Later chat.');
  });

  test('also removes leading chats that come right after the intro', () => {
    const b = normalize([otherSeg('intro'), otherSeg('chat', { text: 'Orphan chat.' }), storySeg('s1')]);
    assert.deepEqual(types(b), ['intro', 'story', 'outro']);
  });

  test('rundown lists the stories in running order with headline, source, category and hasImage; storyIds lists the used ids', () => {
    const b = normalize([storySeg('s3', { headline: 'Third' }), otherSeg('chat'), storySeg('s1', { headline: 'First' }), storySeg('unknown'), storySeg('s2', { headline: 'Second' })]);
    assert.deepEqual(b.rundown, [
      { storyId: 's3', headline: 'Third', source: 'BBC News', category: 'world', hasImage: false },
      { storyId: 's1', headline: 'First', source: 'BBC News', category: 'world', hasImage: false },
      { storyId: 's2', headline: 'Second', source: 'Al Jazeera', category: 'business', hasImage: true },
    ]);
    assert.deepEqual(b.storyIds, ['s3', 's1', 's2']);
    assert.deepEqual(
      b.segments.filter((s) => s.type === 'story').map((s) => s.storyId),
      b.rundown.map((r) => r.storyId)
    );
  });

  test('the bulletin has exactly title, segments, rundown and storyIds', () => {
    assert.deepEqual(Object.keys(normalize([storySeg('s1')])).sort(), ['rundown', 'segments', 'storyIds', 'title']);
  });

  test('does not mutate the raw input', () => {
    const raw = { title: 'T', segments: [storySeg('s1', { headline: '**x**', location: { place: 'PARIS', lat: 48.8566, lon: 2.3522 } })] };
    const copy = structuredClone(raw);
    normalizeBulletin(raw, STORIES);
    assert.deepEqual(raw, copy);
  });
});

// ---------------------------------------------------------------- normalizeBulletin: stage-direction cues

describe('normalizeBulletin: stage-direction cues', () => {
  const cuesOf = (text, extra = {}, opts) => storyOf({ text, ...extra }, opts).cues;
  const NO_UNDERSCORE = Object.keys(ACTIONS).filter((name) => !name.includes('_'));

  test('every segment has a cues list, empty when the text has none', () => {
    const b = normalize([otherSeg('intro'), storySeg('s1'), otherSeg('chat'), otherSeg('outro')]);
    for (const seg of b.segments) assert.deepEqual(seg.cues, [], seg.type);
  });

  test('a cue is taken out of the spoken text and recorded with its offset in the clean text', () => {
    const s = storyOf({ text: 'Good evening [wave] and welcome.' });
    assert.equal(s.text, 'Good evening and welcome.');
    assert.deepEqual(s.cues, [{ char: 12, slot: null, action: 'wave' }]);
  });

  test('several cues keep their order, and a cue at the very start or end is allowed', () => {
    const s = storyOf({ text: '[nod] Yes. Then [shrug] maybe. [wave]' });
    assert.equal(s.text, 'Yes. Then maybe.');
    assert.deepEqual(s.cues, [
      { char: 0, slot: null, action: 'nod' },
      { char: 9, slot: null, action: 'shrug' },
      { char: 16, slot: null, action: 'wave' },
    ]);
  });

  test('no stray spaces are left before punctuation where a cue was removed', () => {
    const s = storyOf({ text: 'Hello [nod], world [nod]!' });
    assert.equal(s.text, 'Hello, world!');
    assert.deepEqual(s.cues.map((c) => c.char), [5, 12]);
  });

  test('cue names are case-insensitive and may have spaces inside the brackets', () => {
    const s = storyOf({ text: 'Hello [WAVE] there [ B : Nod ] ok.' });
    assert.equal(s.text, 'Hello there ok.');
    assert.deepEqual(s.cues, [
      { char: 5, slot: null, action: 'wave' },
      { char: 11, slot: 'B', action: 'nod' },
    ]);
  });

  test('works on every segment type', () => {
    const b = normalize([otherSeg('intro', { text: 'Hi [wave] there' }), storySeg('s1'), otherSeg('chat', { anchor: 'B', text: '[wow] Really? [B:nod]' }), otherSeg('outro', { text: 'Bye. [wave]' })]);
    const [intro, , chat, outro] = b.segments;
    assert.deepEqual([intro.text, intro.cues], ['Hi there', [{ char: 2, slot: null, action: 'wave' }]]);
    assert.deepEqual([chat.text, chat.cues], ['Really?', [{ char: 0, slot: null, action: 'wow' }, { char: 7, slot: null, action: 'nod' }]]);
    assert.deepEqual([outro.text, outro.cues], ['Bye.', [{ char: 4, slot: null, action: 'wave' }]]);
  });

  test('the actions without an underscore in their name are all accepted', () => {
    for (const name of NO_UNDERSCORE) {
      assert.deepEqual(cuesOf(`Hello [${name}] there.`), [{ char: 5, slot: null, action: name }], name);
    }
  });

  test('every action of the shared vocabulary in public/js/cues.js reaches the bulletin', {
    todo:
      'BUG server/writer.js:195 - the text goes through clean() (which deletes "_", see line 148) before parseCues(), so "[point_screen]" becomes the unknown cue "[pointscreen]" and is dropped: raise_hand, point_screen, point_camera, point_partner, thumbs_up, fist_pump, shake_head, lean_in and look_partner (9 of the 20 actions, including most of those the mock provider writes) never reach the episode',
  }, () => {
    const dropped = Object.keys(ACTIONS).filter((name) => !cuesOf(`Hello [${name}] there.`).some((c) => c.action === name));
    assert.deepEqual(dropped, []);
  });

  test('emotion names in brackets become expression cues', () => {
    for (const emotion of CUE_EMOTIONS) {
      assert.deepEqual(cuesOf(`Well [${emotion}] that is odd.`), [{ char: 4, slot: null, emotion }], emotion);
    }
    assert.equal(storyOf({ text: 'Well [surprised] that is odd.' }).emotion, 'neutral', 'the segment emotion itself is not changed');
  });

  test('unknown cues are removed from the text and ignored', () => {
    const s = storyOf({ text: 'Hello [dance] there [world] again.' });
    assert.equal(s.text, 'Hello there again.');
    assert.deepEqual(s.cues, []);
  });

  test('a text that is only a cue has nothing to say, so the segment is dropped', () => {
    assert.throws(() => normalize([storySeg('s1', { text: '[wave]' })]), /bulletin has no valid stories/);
    const b = normalize([storySeg('s1'), otherSeg('chat', { text: '[nod]' })]);
    assert.ok(!types(b).includes('chat'));
  });

  test('keeps at most 4 cues per segment', () => {
    const s = storyOf({ text: '[nod] a [shrug] b [wave] c [wow] d [chin] e [glasses] f' });
    assert.equal(s.text, 'a b c d e f');
    assert.deepEqual(s.cues.map((c) => c.action), ['nod', 'shrug', 'wave', 'wow']);
  });

  test('"[B:action]" makes the other presenter react; "[A:action]" from presenter A is just A acting', () => {
    const s = storyOf({ anchor: 'A', text: 'a [nod] b [B:shrug] c [A:wave]' });
    assert.deepEqual(s.cues, [
      { char: 1, slot: null, action: 'nod' },
      { char: 3, slot: 'B', action: 'shrug' },
      { char: 5, slot: null, action: 'wave' },
    ]);
  });

  test('when presenter B speaks, "[A:action]" is the other presenter and "[B:action]" is the speaker', () => {
    const s = storyOf({ anchor: 'B', text: 'a [nod] b [B:shrug] c [A:wave]' });
    assert.deepEqual(s.cues, [
      { char: 1, slot: null, action: 'nod' },
      { char: 3, slot: null, action: 'shrug' },
      { char: 5, slot: 'A', action: 'wave' },
    ]);
  });

  test('a solo programme drops cues aimed at a presenter B who does not exist', () => {
    const s = storyOf({ anchor: 'B', text: 'a [nod] b [B:shrug] c [A:wave]' }, { solo: true });
    assert.equal(s.anchor, 'A');
    assert.deepEqual(s.cues, [
      { char: 1, slot: null, action: 'nod' },
      { char: 5, slot: null, action: 'wave' },
    ]);
  });

  test('grave stories (serious or sad) get no light gestures; other gestures stay', () => {
    const text = 'A [wow] [laugh] [facepalm] [wave] [nod] [shrug] b';
    for (const emotion of ['serious', 'sad']) {
      assert.deepEqual(cuesOf(text, { emotion }).map((c) => c.action), ['nod', 'shrug'], emotion);
    }
    assert.deepEqual(cuesOf(text, { emotion: 'neutral' }).map((c) => c.action), ['wow', 'laugh', 'facepalm', 'wave'], 'neutral allows them (4 cues at most)');
    assert.deepEqual(cuesOf('A [steeple] b [chin]', { emotion: 'serious' }).map((c) => c.action), ['steeple', 'chin']);
  });

  test('the "grave" rule follows the emotion after validation: an invalid emotion is neutral, so light gestures are allowed', () => {
    assert.deepEqual(cuesOf('A [wow] b', { emotion: 'devastated' }).map((c) => c.action), ['wow']);
  });

  test('cues that fall in text cut off by the 520-character limit are dropped', () => {
    const long = 'Sentence number one is here. '.repeat(30).trim();
    const s = storyOf({ text: `${long} [nod]` });
    assert.ok(s.text.length <= 520);
    assert.deepEqual(s.cues, []);
  });

  test('cues inside the kept text survive the clip, at their offsets', () => {
    const s = storyOf({ text: `[nod] ${'word '.repeat(150)}` });
    assert.ok(s.text.length <= 520);
    assert.deepEqual(s.cues, [{ char: 0, slot: null, action: 'nod' }]);
  });

  test('markdown around a cue is stripped as usual', () => {
    const s = storyOf({ text: '**Hello** [nod] _world_' });
    assert.equal(s.text, 'Hello world');
    assert.deepEqual(s.cues, [{ char: 5, slot: null, action: 'nod' }]);
  });
});

describe('normalizeBulletin: solo programmes', () => {
  const solo = { solo: true };

  test('every segment is read by anchor "A", whatever the model wrote', () => {
    const b = normalize(
      [
        otherSeg('intro', { anchor: 'B' }),
        storySeg('s1', { anchor: 'B' }),
        otherSeg('chat', { anchor: 'B', text: 'A chat.' }),
        storySeg('s2', { anchor: 'B' }),
        otherSeg('outro', { anchor: 'B' }),
      ],
      { opts: solo }
    );
    assert.deepEqual(types(b), ['intro', 'story', 'chat', 'story', 'outro']);
    assert.ok(b.segments.every((s) => s.anchor === 'A'), JSON.stringify(b.segments.map((s) => s.anchor)));
  });

  test('the default outro is also read by "A" (a duo programme closes with "B")', () => {
    const soloOutro = normalize([storySeg('s1')], { opts: solo }).segments.at(-1);
    const duoOutro = normalize([storySeg('s1')]).segments.at(-1);
    assert.equal(soloOutro.type, 'outro');
    assert.equal(soloOutro.anchor, 'A');
    assert.equal(duoOutro.anchor, 'B');
  });

  test('the default intro is read by "A" too', () => {
    assert.equal(normalize([storySeg('s1')], { opts: solo }).segments[0].anchor, 'A');
  });

  test('duo programmes keep anchor "B" where the model wrote it', () => {
    const b = normalize([storySeg('s1', { anchor: 'B' })]);
    assert.equal(b.segments[1].anchor, 'B');
  });

  test('solo does not change the other rules (maxStories, maxChats, location)', () => {
    const b = normalize(
      [storySeg('s1', { shot: 'map', location: { place: 'ROME, ITALY', lat: 41.9, lon: 12.5 } }), storySeg('s2'), otherSeg('chat'), storySeg('s3')],
      { opts: { solo: true, maxStories: 2, maxChats: 0 } }
    );
    assert.deepEqual(b.storyIds, ['s1', 's2']);
    assert.ok(!types(b).includes('chat'));
    assert.equal(b.segments[1].shot, 'map');
  });
});

// ---------------------------------------------------------------- buildPrompt

describe('buildPrompt', () => {
  const now = new Date('2026-10-15T10:30:00Z');
  const prompt = (extra = {}) => buildPrompt({ channelName: 'GLOBIT 24', program: PROGRAM, presenters: DUO, stories: STORIES, now, ...extra });
  const candidatesIn = (text) => JSON.parse(text.slice(text.indexOf('CANDIDATES\n') + 'CANDIDATES\n'.length));

  test('is written in English and names the channel, the programme, its tagline and its style', () => {
    const p = prompt();
    assert.match(p, /"GLOBIT 24", a 24-hour English-language news channel/);
    assert.match(p, /the programme "WORLD NOW" \(THE STORIES SHAPING OUR WORLD\)/);
    assert.ok(p.includes(`Programme style: ${PROGRAM.style}`));
    assert.match(p, /Write the script in English/);
    assert.match(p, /ACCURACY RULES/);
    assert.match(p, /Never invent numbers, names, quotes, dates, causes or consequences/);
  });

  test('lists every presenter with their slot, name and personality', () => {
    const p = prompt();
    assert.ok(p.includes('- A: Paco Pixel, veteran anchor, calm and authoritative.'));
    assert.ok(p.includes('- B: Lola Byte, co-anchor, energetic and curious.'));
    const soloPrompt = prompt({ presenters: SOLO });
    assert.ok(soloPrompt.includes('- A: Penny Sterling, crisp markets correspondent.'));
    assert.ok(!soloPrompt.includes('- B:'));
  });

  test('embeds every candidate as JSON with id, outlet, section, outletsCovering, headline and summary', () => {
    const list = candidatesIn(prompt({ stories: [makeStory('s1', { outlets: 3 }), makeStory('s2', { source: 'NPR', category: 'tech' })] }));
    assert.deepEqual(list, [
      { id: 's1', outlet: 'BBC News', section: 'world', outletsCovering: 3, headline: 'Headline of story s1', summary: 'Summary of the story. A second sentence of the summary.' },
      { id: 's2', outlet: 'NPR', section: 'tech', outletsCovering: 1, headline: 'Headline of story s2', summary: 'Summary of the story. A second sentence of the summary.' },
    ]);
  });

  test('mentions every story id and title, and asks the model to prefer widely covered stories', () => {
    const p = prompt();
    for (const s of STORIES) {
      assert.ok(p.includes(`"id": "${s.id}"`), `missing id ${s.id}`);
      assert.ok(p.includes(s.title), `missing title of ${s.id}`);
    }
    assert.ok(p.includes('Al Jazeera'));
    assert.match(p, /"outletsCovering" > 1/);
  });

  test('truncates long summaries to 700 characters', () => {
    const long = makeStory('big', { summary: 'word '.repeat(300) });
    const [parsed] = candidatesIn(prompt({ stories: [long] }));
    assert.equal(parsed.id, 'big');
    assert.equal(parsed.summary.length, 700);
  });

  test('asks for the number of stories in `count`, defaulting to the programme size', () => {
    assert.match(prompt(), /select the 5 stories of greatest interest/);
    assert.match(prompt({ count: 3 }), /select the 3 stories of greatest interest/);
  });

  test('includes the programme story length and the JSON output contract', () => {
    const p = prompt();
    assert.ok(p.includes(`Story "text": ${PROGRAM.storyLength}.`));
    assert.match(p, /Reply with ONLY a valid JSON object/);
    for (const e of EMOTIONS) assert.ok(p.includes(e), `emotion ${e}`);
    for (const s of SHOTS) assert.ok(p.includes(s), `shot ${s}`);
    assert.match(p, /"location"/);
    assert.match(p, /"fact"/);
    assert.match(p, /"breaking"/);
  });

  test('duo programmes alternate between presenters "A" and "B"', () => {
    const p = prompt();
    assert.ok(p.includes('"anchor": "A" | "B"'));
    assert.match(p, /Alternate presenters between stories/);
    assert.ok(!p.includes('single presenter'));
  });

  test('solo programmes use only anchor "A"', () => {
    const p = prompt({ presenters: SOLO });
    assert.ok(!p.includes('"A" | "B"'));
    assert.match(p, /There is a single presenter: always use "anchor": "A"/);
    assert.ok(!p.includes('Alternate presenters'));
  });

  test('limits the chat segments to the programme maxChats, or forbids them when it is 0', () => {
    assert.match(prompt({ program: { ...PROGRAM, maxChats: 3 } }), /At most 3 "chat" segments in total\./);
    assert.match(prompt({ program: { ...PROGRAM, maxChats: 1 } }), /At most 1 "chat" segments in total\./);
    const none = prompt({ program: { ...PROGRAM, maxChats: 0 }, presenters: SOLO });
    assert.match(none, /No "chat" segments\./);
    assert.ok(!none.includes('At most'));
  });

  test('gives the time in UTC, in English', () => {
    assert.match(prompt(), /Current time: Thursday,? 15 October,?( at)? 10:30 UTC\./);
  });

  test('has a STAGE DIRECTIONS section that lists every action of the shared vocabulary with its description', () => {
    const p = prompt();
    assert.match(p, /STAGE DIRECTIONS/);
    assert.match(p, /cues in square brackets/);
    for (const [name, action] of Object.entries(ACTIONS)) assert.ok(p.includes(`${name} (${action.desc})`), name);
    assert.match(p, /An emotion name in brackets \(e\.g\. "\[surprised\]"\)/);
    assert.ok(EMOTIONS.includes('surprised'));
  });

  test('tells the writer not to use the light gestures in grave stories, naming exactly the light actions', () => {
    const line = prompt().split('\n').find((l) => l.startsWith('- Never use'));
    assert.ok(line, 'the rule is there');
    const light = Object.entries(ACTIONS).filter(([, a]) => a.light).map(([name]) => name);
    for (const name of light) assert.ok(line.includes(name), `${name} is missing from: ${line}`);
    assert.match(line, /in grave stories/);
  });

  test('duo programmes may address either presenter and use hand-over gestures; solo programmes may not', () => {
    const duo = prompt();
    assert.match(duo, /"\[A:action\]" or "\[B:action\]"/);
    assert.match(duo, /look_partner or point_partner on hand-overs/);
    const solo = prompt({ presenters: SOLO });
    assert.ok(!solo.includes('[B:action]'));
    assert.ok(!solo.includes('look_partner or point_partner on hand-overs'));
    assert.match(solo, /"\[action\]" is performed by the presenter speaking\./);
  });

  test('never contains the string "undefined"', () => {
    assert.ok(!prompt().includes('undefined'));
    assert.ok(!prompt({ now: undefined }).includes('undefined'), 'also with the default "now"');
    assert.ok(!prompt({ stories: [makeStory('x', { summary: '' })] }).includes('undefined'));
    assert.ok(!prompt({ presenters: SOLO, program: { ...PROGRAM, maxChats: 0 } }).includes('undefined'));
  });
});

// ---------------------------------------------------------------- buildReviewPrompt

describe('buildReviewPrompt', () => {
  const script = { title: 'WORLD NOW', segments: [{ type: 'story', storyId: 's1', anchor: 'A', emotion: 'neutral', headline: 'Caption', text: 'Text.', shot: 'wide', breaking: false, location: null, fact: null }] };
  const review = (extra = {}) => buildReviewPrompt({ channelName: 'GLOBIT 24', program: PROGRAM, script, stories: STORIES, ...extra });

  test('is written in English and names the channel and the programme', () => {
    const p = review();
    assert.match(p, /standards editor of "GLOBIT 24"/);
    assert.match(p, /the programme "WORLD NOW"/);
    assert.match(p, /ACCURACY RULES/);
  });

  test('embeds the script as JSON', () => {
    const p = review();
    const json = p.slice(p.indexOf('SCRIPT\n') + 'SCRIPT\n'.length, p.indexOf('\n\nSOURCES\n'));
    assert.deepEqual(JSON.parse(json), script);
  });

  test('embeds the sources (id, outlet, headline, summary) and nothing else about them', () => {
    const p = review({ stories: [makeStory('s1', { image: 'https://img.test/x.jpg', link: 'https://example.test/s1' }), makeStory('s2', { summary: 'word '.repeat(300) })] });
    const sources = JSON.parse(p.slice(p.indexOf('SOURCES\n') + 'SOURCES\n'.length));
    assert.deepEqual(Object.keys(sources[0]), ['id', 'outlet', 'headline', 'summary']);
    assert.equal(sources[0].id, 's1');
    assert.equal(sources[0].outlet, 'BBC News');
    assert.equal(sources[0].headline, 'Headline of story s1');
    assert.equal(sources[1].summary.length, 700);
  });

  test('tells the editor to check facts, locations and tone, keep the structure and reply with JSON only', () => {
    const p = review();
    assert.match(p, /not supported by the source/);
    assert.match(p, /"fact" field/);
    assert.match(p, /"location" matches a place named in the source/);
    assert.match(p, /Do not add new stories/);
    assert.match(p, /Keep the same JSON structure/);
    assert.match(p, /Reply with ONLY the corrected JSON object/);
  });

  test('never contains the string "undefined"', () => {
    assert.ok(!review().includes('undefined'));
    assert.ok(!review({ stories: [makeStory('x', { summary: '' })] }).includes('undefined'));
  });
});
