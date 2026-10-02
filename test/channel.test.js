import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { castOf, loadChannel, publicChannel, validateChannel } from '../server/channel.js';
import { ROOT } from '../server/config.js';

// ---------------------------------------------------------------- helpers

const REAL_CHANNEL_FILE = path.join(ROOT, 'config', 'channel.json');
const REAL_FEEDS_FILE = path.join(ROOT, 'config', 'feeds.json');

const voice = (gender = 'male') => ({ gender, lang: 'en-GB', pitch: 1, rate: 1 });

/** A small, valid channel: a duo programme, a solo programme and a rotation. */
const makeChannel = (overrides = {}) => ({
  name: 'TEST TV',
  slogan: 'ALL TEST, ALL DAY',
  presenters: {
    ann: { name: 'Ann Anchor', personality: 'SECRET-PERSONALITY-ANN', voice: voice('female') },
    bob: { name: 'Bob Banter', personality: 'SECRET-PERSONALITY-BOB', voice: voice('male') },
    cyd: { name: 'Cyd Solo', personality: 'SECRET-PERSONALITY-CYD', voice: voice('robot') },
  },
  programs: {
    duo: {
      title: 'THE DUO',
      tagline: 'TWO AT A TIME',
      theme: 'world',
      presenters: ['ann', 'bob'],
      categories: ['world'],
      stories: 5,
      maxChats: 3,
      style: 'SECRET-STYLE-DUO',
      storyLength: 'SECRET-LENGTH-DUO',
    },
    solo: {
      title: 'THE SOLO',
      tagline: 'JUST ONE',
      theme: 'flash',
      presenters: ['cyd'],
      categories: ['tech'],
      stories: 3,
      maxChats: 0,
      style: 'SECRET-STYLE-SOLO',
      storyLength: 'SECRET-LENGTH-SOLO',
    },
  },
  rotation: ['duo', 'solo', 'duo'],
  breaks: { adsPerBreak: 2, maxExtraAds: 6 },
  ...overrides,
});

const withProgram = (id, patch) => {
  const channel = makeChannel();
  channel.programs[id] = { ...channel.programs[id], ...patch };
  return channel;
};

/** Per-test temp directory with a channel file helper. */
function tempChannelFile(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'livenews-channel-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'channel.json');
  let clock = 1_700_000_000; // seconds; every write gets a distinct mtime so the cache sees the change
  return {
    file,
    write(content) {
      fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content));
      clock += 10;
      fs.utimesSync(file, clock, clock);
    },
    touch() {
      clock += 10;
      fs.utimesSync(file, clock, clock);
    },
  };
}

// ---------------------------------------------------------------- validateChannel

describe('validateChannel', () => {
  test('accepts a valid channel', () => {
    assert.doesNotThrow(() => validateChannel(makeChannel()));
  });

  test('accepts programmes that are not in the rotation, repeated rotation entries and a missing "breaks" section', () => {
    const channel = makeChannel({ rotation: ['solo', 'solo'] });
    delete channel.breaks;
    assert.doesNotThrow(() => validateChannel(channel));
  });

  test('rejects a channel without presenters, programs or a non-empty rotation', () => {
    const message = /channel\.json needs presenters, programs and a non-empty rotation/;
    assert.throws(() => validateChannel(null), message);
    assert.throws(() => validateChannel(undefined), message);
    assert.throws(() => validateChannel({}), message);
    assert.throws(() => validateChannel({ ...makeChannel(), presenters: undefined }), message);
    assert.throws(() => validateChannel({ ...makeChannel(), programs: undefined }), message);
    assert.throws(() => validateChannel({ ...makeChannel(), rotation: undefined }), message);
    assert.throws(() => validateChannel({ ...makeChannel(), rotation: 'duo' }), message);
    assert.throws(() => validateChannel({ ...makeChannel(), rotation: [] }), message);
  });

  test('rejects a rotation that references an unknown programme, naming it', () => {
    assert.throws(() => validateChannel(makeChannel({ rotation: ['duo', 'ghost'] })), /rotation references unknown programme "ghost"/);
  });

  test('rejects a programme that references an unknown presenter, naming both', () => {
    const channel = withProgram('duo', { presenters: ['ann', 'zed'] });
    assert.throws(() => validateChannel(channel), /programme "duo" references unknown presenter "zed"/);
  });

  test('rejects a programme with no presenters', () => {
    assert.throws(() => validateChannel(withProgram('duo', { presenters: [] })), /programme "duo" needs 1 or 2 presenters/);
  });

  test('rejects a programme with more than two presenters', () => {
    assert.throws(() => validateChannel(withProgram('duo', { presenters: ['ann', 'bob', 'cyd'] })), /programme "duo" needs 1 or 2 presenters/);
  });

  test('rejects a programme whose presenters are missing or not a list', () => {
    assert.throws(() => validateChannel(withProgram('solo', { presenters: undefined })), /programme "solo" needs 1 or 2 presenters/);
    assert.throws(() => validateChannel(withProgram('solo', { presenters: 'cyd' })), /programme "solo" needs 1 or 2 presenters/);
  });

  test(
    'rejects a programme that does not say how many stories it airs (a typo must not silently take it off air)',
    {
      todo:
        'VALIDATION GAP server/channel.js:31-38 - a programme without a numeric "stories" (e.g. a typo: "storys": 4) passes validateChannel(), but Producer.canProduce() then computes Math.min(undefined, n) = NaN, so it can never be produced and Station.fill() skips its slot forever with no error (a missing "style"/"storyLength"/"tagline" likewise puts the text "undefined" into the writer prompt)',
    },
    () => {
      for (const stories of [undefined, 0, -3, 'five', NaN]) {
        assert.throws(() => validateChannel(withProgram('duo', { stories })), /stories/, String(stories));
      }
    }
  );

  test('checks the rotation before the programmes', () => {
    const channel = withProgram('duo', { presenters: [] });
    channel.rotation = ['ghost'];
    assert.throws(() => validateChannel(channel), /unknown programme "ghost"/);
  });
});

// ---------------------------------------------------------------- castOf

describe('castOf', () => {
  test('maps the presenters of a duo programme to slots A and B', () => {
    assert.deepEqual(castOf(makeChannel(), 'duo'), { A: 'ann', B: 'bob' });
  });

  test('a solo programme only has slot A', () => {
    const cast = castOf(makeChannel(), 'solo');
    assert.deepEqual(cast, { A: 'cyd' });
    assert.equal('B' in cast, false);
  });

  test('follows the order of the presenters list', () => {
    const channel = withProgram('duo', { presenters: ['bob', 'ann'] });
    assert.deepEqual(castOf(channel, 'duo'), { A: 'bob', B: 'ann' });
  });
});

// ---------------------------------------------------------------- publicChannel

describe('publicChannel', () => {
  test('exposes the name, slogan, rotation, presenters (name + voice) and programmes (title, tagline, theme, presenters)', () => {
    const pub = publicChannel(makeChannel());
    assert.deepEqual(pub, {
      name: 'TEST TV',
      slogan: 'ALL TEST, ALL DAY',
      presenters: {
        ann: { name: 'Ann Anchor', voice: voice('female') },
        bob: { name: 'Bob Banter', voice: voice('male') },
        cyd: { name: 'Cyd Solo', voice: voice('robot') },
      },
      programs: {
        duo: { title: 'THE DUO', tagline: 'TWO AT A TIME', theme: 'world', presenters: ['ann', 'bob'] },
        solo: { title: 'THE SOLO', tagline: 'JUST ONE', theme: 'flash', presenters: ['cyd'] },
      },
      rotation: ['duo', 'solo', 'duo'],
    });
  });

  test('no prompt-only field leaks: personality, style, storyLength, categories, stories, maxChats, breaks', () => {
    const json = JSON.stringify(publicChannel(makeChannel()));
    assert.ok(!json.includes('SECRET'), json);
    for (const key of ['personality', 'style', 'storyLength', 'categories', 'maxChats', 'stories', 'breaks']) {
      assert.ok(!json.includes(`"${key}"`), `"${key}" leaked`);
    }
  });

  test('does not leak anything from the real channel either', () => {
    const real = JSON.parse(fs.readFileSync(REAL_CHANNEL_FILE, 'utf8'));
    const json = JSON.stringify(publicChannel(real));
    for (const p of Object.values(real.presenters)) assert.ok(!json.includes(p.personality), `personality of ${p.name} leaked`);
    for (const p of Object.values(real.programs)) {
      assert.ok(!json.includes(p.style), `style of ${p.title} leaked`);
      assert.ok(!json.includes(p.storyLength), `storyLength of ${p.title} leaked`);
    }
    assert.deepEqual(Object.keys(publicChannel(real)).sort(), ['name', 'presenters', 'programs', 'rotation', 'slogan']);
  });

  test('does not modify the channel it is given', () => {
    const channel = makeChannel();
    const copy = structuredClone(channel);
    publicChannel(channel);
    assert.deepEqual(channel, copy);
  });
});

// ---------------------------------------------------------------- loadChannel

describe('loadChannel', () => {
  test('loads and validates a channel file', (t) => {
    const f = tempChannelFile(t);
    f.write(makeChannel());
    assert.deepEqual(loadChannel(f.file), makeChannel());
  });

  test('returns the very same object while the file has not changed (cached by mtime)', (t) => {
    const f = tempChannelFile(t);
    f.write(makeChannel());
    const first = loadChannel(f.file);
    assert.equal(loadChannel(f.file), first);
    assert.equal(loadChannel(f.file), first);
  });

  test('keeps serving the cached channel while the mtime is unchanged, even if the content differs on disk', (t) => {
    const f = tempChannelFile(t);
    f.write(makeChannel());
    const first = loadChannel(f.file);
    const { mtime } = fs.statSync(f.file);
    fs.writeFileSync(f.file, JSON.stringify(makeChannel({ name: 'CHANGED' })));
    fs.utimesSync(f.file, mtime, mtime);
    assert.equal(loadChannel(f.file), first);
    assert.equal(loadChannel(f.file).name, 'TEST TV');
  });

  test('re-reads the file when its mtime changes, so the line-up can be edited live', (t) => {
    const f = tempChannelFile(t);
    f.write(makeChannel());
    const first = loadChannel(f.file);
    assert.equal(first.name, 'TEST TV');

    f.write(makeChannel({ name: 'EDITED TV', rotation: ['solo'] }));
    const second = loadChannel(f.file);

    assert.notEqual(second, first);
    assert.equal(second.name, 'EDITED TV');
    assert.deepEqual(second.rotation, ['solo']);
    assert.equal(loadChannel(f.file), second, 'and the new version is cached in turn');
  });

  test('a file that is only touched (same content, new mtime) is parsed again', (t) => {
    const f = tempChannelFile(t);
    f.write(makeChannel());
    const first = loadChannel(f.file);
    f.touch();
    const second = loadChannel(f.file);
    assert.notEqual(second, first);
    assert.deepEqual(second, first);
  });

  test('the cache is per file: switching between two files never mixes them up', (t) => {
    const a = tempChannelFile(t);
    const b = tempChannelFile(t);
    a.write(makeChannel({ name: 'CHANNEL A' }));
    b.write(makeChannel({ name: 'CHANNEL B' }));
    assert.equal(loadChannel(a.file).name, 'CHANNEL A');
    assert.equal(loadChannel(b.file).name, 'CHANNEL B');
    assert.equal(loadChannel(a.file).name, 'CHANNEL A');
  });

  test('throws the validation error for an invalid channel and does not cache it', (t) => {
    const f = tempChannelFile(t);
    f.write(makeChannel({ rotation: ['ghost'] }));
    assert.throws(() => loadChannel(f.file), /rotation references unknown programme "ghost"/);
    assert.throws(() => loadChannel(f.file), /rotation references unknown programme "ghost"/, 'still throws on the next call');

    f.write(makeChannel());
    assert.equal(loadChannel(f.file).name, 'TEST TV');
  });

  test('reports the problem when a programme has 0 or more than 2 presenters or an unknown one', (t) => {
    const f = tempChannelFile(t);
    f.write(withProgram('duo', { presenters: [] }));
    assert.throws(() => loadChannel(f.file), /needs 1 or 2 presenters/);
    f.write(withProgram('duo', { presenters: ['ann', 'bob', 'cyd'] }));
    assert.throws(() => loadChannel(f.file), /needs 1 or 2 presenters/);
    f.write(withProgram('duo', { presenters: ['ann', 'nobody'] }));
    assert.throws(() => loadChannel(f.file), /unknown presenter "nobody"/);
  });

  test('throws a SyntaxError for a file that is not JSON, and a stat error for a missing file', (t) => {
    const f = tempChannelFile(t);
    f.write('{ not json');
    assert.throws(() => loadChannel(f.file), SyntaxError);
    assert.throws(() => loadChannel(path.join(path.dirname(f.file), 'missing.json')), { code: 'ENOENT' });
  });

  test('with no argument it loads config/channel.json', () => {
    const real = JSON.parse(fs.readFileSync(REAL_CHANNEL_FILE, 'utf8'));
    assert.deepEqual(loadChannel(), real);
  });
});

// ---------------------------------------------------------------- the real config/channel.json

describe('config/channel.json', () => {
  const channel = loadChannel();
  const feedCategories = new Set(JSON.parse(fs.readFileSync(REAL_FEEDS_FILE, 'utf8')).map((f) => f.category));
  const programs = Object.entries(channel.programs);

  test('is a valid GLOBIT 24 channel line-up', () => {
    assert.doesNotThrow(() => validateChannel(channel));
    assert.equal(channel.name, 'GLOBIT 24');
    assert.equal(typeof channel.slogan, 'string');
    assert.ok(programs.length >= 2 && channel.rotation.length >= 2);
  });

  test('every programme can be cast, with 1 or 2 presenters that exist', () => {
    for (const [id, p] of programs) {
      const cast = castOf(channel, id);
      assert.ok(cast.A && channel.presenters[cast.A], `${id}: slot A`);
      if (p.presenters.length === 2) assert.ok(channel.presenters[cast.B], `${id}: slot B`);
      else assert.equal('B' in cast, false, `${id} is solo`);
    }
  });

  test('every programme has what the writer and the producer need', () => {
    for (const [id, p] of programs) {
      for (const key of ['title', 'tagline', 'theme', 'style', 'storyLength']) {
        assert.ok(typeof p[key] === 'string' && p[key].trim(), `${id}.${key}`);
      }
      assert.ok(Number.isInteger(p.stories) && p.stories >= 1 && p.stories <= 10, `${id}.stories = ${p.stories}`);
      assert.ok(Number.isInteger(p.maxChats) && p.maxChats >= 0, `${id}.maxChats = ${p.maxChats}`);
      assert.ok(Array.isArray(p.categories) && p.categories.length >= 1, `${id}.categories`);
    }
    assert.equal(new Set(programs.map(([, p]) => p.title)).size, programs.length, 'programme titles are unique');
  });

  test('solo programmes have no chat segments (there is nobody to chat with)', () => {
    for (const [id, p] of programs) {
      if (p.presenters.length === 1) assert.equal(p.maxChats, 0, id);
    }
  });

  test('every programme airs at least once in the rotation, and every presenter hosts something', () => {
    for (const [id] of programs) assert.ok(channel.rotation.includes(id), `${id} is never scheduled`);
    const hosts = new Set(programs.flatMap(([, p]) => p.presenters));
    for (const id of Object.keys(channel.presenters)) assert.ok(hosts.has(id), `${id} hosts nothing`);
  });

  test('programme categories exist in config/feeds.json, and every feed category is used by some programme', () => {
    const used = new Set();
    for (const [id, p] of programs) {
      for (const c of p.categories) {
        assert.ok(feedCategories.has(c), `${id} asks for category "${c}" that no feed provides`);
        used.add(c);
      }
    }
    for (const c of feedCategories) assert.ok(used.has(c), `no programme covers the "${c}" feeds`);
  });

  test('presenters have a name, a personality and an English voice the browser can use', () => {
    for (const [id, p] of Object.entries(channel.presenters)) {
      assert.ok(p.name && p.personality, id);
      assert.ok(['male', 'female', 'robot'].includes(p.voice.gender), `${id}: gender ${p.voice.gender}`);
      assert.match(p.voice.lang, /^en-[A-Z]{2}$/, id);
      assert.ok(p.voice.pitch >= 0.1 && p.voice.pitch <= 2, `${id}: pitch`);
      assert.ok(p.voice.rate >= 0.5 && p.voice.rate <= 2, `${id}: rate`);
    }
  });

  test('commercial breaks are configured', () => {
    assert.ok(Number.isInteger(channel.breaks.adsPerBreak) && channel.breaks.adsPerBreak >= 1);
    assert.ok(Number.isInteger(channel.breaks.maxExtraAds) && channel.breaks.maxExtraAds >= 0);
  });
});
