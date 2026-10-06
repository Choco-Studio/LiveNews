import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { castOf, loadChannel, publicChannel, validateChannel } from '../server/channel.js';
import { ROOT } from '../server/config.js';
import { Station } from '../server/station.js';

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

  test('(editorial-2 fix r2) "breaks" values are checked: whole ad counts, a cadence in seconds', () => {
    assert.doesNotThrow(() => validateChannel({ ...makeChannel(), breaks: { adsPerBreak: 2, maxExtraAds: 6, minProgrammeBetween: 420 } }));
    assert.throws(() => validateChannel({ ...makeChannel(), breaks: { adsPerBreak: 0 } }), /adsPerBreak/);
    assert.throws(() => validateChannel({ ...makeChannel(), breaks: { maxExtraAds: 2.5 } }), /maxExtraAds/);
    assert.throws(() => validateChannel({ ...makeChannel(), breaks: { minProgrammeBetween: -1 } }), /minProgrammeBetween/);
    assert.throws(() => validateChannel({ ...makeChannel(), breaks: [] }), /breaks/);
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

  test('rejects a programme whose "title", "tagline", "style" or "storyLength" is missing, empty or not text', () => {
    for (const key of ['title', 'tagline', 'style', 'storyLength']) {
      for (const value of [undefined, null, '', '   ', 42, ['text'], {}]) {
        assert.throws(() => validateChannel(withProgram('duo', { [key]: value })), new RegExp(`programme "duo" needs a "${key}" text`), `${key} = ${JSON.stringify(value)}`);
      }
    }
  });

  test('rejects a programme that does not say how many stories it airs (a typo must not silently take it off air)', () => {
    for (const stories of [undefined, null, 0, -3, 2.5, 'five', '3', NaN, Infinity, [3]]) {
      assert.throws(() => validateChannel(withProgram('duo', { stories })), /programme "duo" needs "stories" \(a whole number ≥ 1\)/, String(stories));
    }
    const typo = makeChannel();
    delete typo.programs.duo.stories;
    typo.programs.duo.storys = 5;
    assert.throws(() => validateChannel(typo), /needs "stories"/);
  });

  test('accepts any whole number of stories from 1 up', () => {
    for (const stories of [1, 2, 10, 25]) assert.doesNotThrow(() => validateChannel(withProgram('duo', { stories })), String(stories));
    for (const targetSeconds of [[480, 600], [60, 60]]) assert.doesNotThrow(() => validateChannel(withProgram('duo', { targetSeconds })), String(targetSeconds));
    for (const targetSeconds of [600, [600], [600, 480], [0, 60], ['1', '2']]) {
      assert.throws(() => validateChannel(withProgram('duo', { targetSeconds })), /targetSeconds/, JSON.stringify(targetSeconds));
    }
  });

  test('rejects a programme without a non-empty list of "categories"', () => {
    for (const categories of [undefined, null, [], 'world', {}, 7]) {
      assert.throws(() => validateChannel(withProgram('duo', { categories })), /programme "duo" needs a list of "categories"/, JSON.stringify(categories));
    }
    assert.doesNotThrow(() => validateChannel(withProgram('duo', { categories: ['world', 'business'] })));
  });

  test('"features" is optional; when present it is a list of known features (round-up, number of the day, and finally)', () => {
    const ok = makeChannel();
    ok.programs.duo.features = ['roundup', 'number', 'lighter'];
    ok.programs.solo.features = [];
    assert.doesNotThrow(() => validateChannel(ok));
    const unknown = makeChannel();
    unknown.programs.duo.features = ['roundup', 'weather'];
    assert.throws(() => validateChannel(unknown), /programme "duo" has an unknown feature "weather"/);
    const notList = makeChannel();
    notList.programs.duo.features = 'roundup';
    assert.throws(() => validateChannel(notList), /programme "duo" has "features" that are not a list/);
  });

  test('"chemistry" is optional text for the writer', () => {
    const ok = makeChannel();
    ok.programs.duo.chemistry = 'Ann is dry; Bob is warm.';
    assert.doesNotThrow(() => validateChannel(ok));
    const bad = makeChannel();
    bad.programs.duo.chemistry = ['Ann', 'Bob'];
    assert.throws(() => validateChannel(bad), /programme "duo" has a "chemistry" that is not text/);
  });

  test('"theme" and "maxChats" stay optional', () => {
    const channel = makeChannel();
    delete channel.programs.solo.theme;
    delete channel.programs.solo.maxChats;
    assert.doesNotThrow(() => validateChannel(channel));
  });

  test('names the programme that is wrong, whichever it is', () => {
    assert.throws(() => validateChannel(withProgram('solo', { title: '' })), /programme "solo" needs a "title" text/);
    assert.throws(() => validateChannel(withProgram('solo', { stories: 0 })), /programme "solo" needs "stories"/);
  });

  test('checks the texts, then the story count, then the categories, then the presenters', () => {
    const everythingWrong = { title: '', stories: 0, categories: [], presenters: [] };
    assert.throws(() => validateChannel(withProgram('duo', everythingWrong)), /needs a "title" text/);
    assert.throws(() => validateChannel(withProgram('duo', { ...everythingWrong, title: 'OK' })), /needs a "tagline"|needs a "style"|needs "stories"/);
    assert.throws(() => validateChannel(withProgram('duo', { stories: 0, categories: [], presenters: [] })), /needs "stories"/);
    assert.throws(() => validateChannel(withProgram('duo', { categories: [], presenters: [] })), /needs a list of "categories"/);
    assert.throws(() => validateChannel(withProgram('duo', { presenters: [] })), /needs 1 or 2 presenters/);
  });

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

  test('the writer-only "chemistry" and "features" of a programme do not leak either', () => {
    const ch = makeChannel();
    ch.programs.duo.chemistry = 'SECRET-CHEMISTRY';
    ch.programs.duo.features = ['roundup'];
    const json = JSON.stringify(publicChannel(ch));
    assert.ok(!json.includes('SECRET') && !json.includes('"features"'), json);
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

  describe('a broken edit keeps the last good line-up', () => {
    let errors;
    const quiet = (t) => {
      errors = [];
      t.mock.method(console, 'error', (...args) => errors.push(args.join(' ')));
    };

    test('invalid JSON after a good load: the previous channel is returned and the problem is logged', (t) => {
      quiet(t);
      const f = tempChannelFile(t);
      f.write(makeChannel());
      const good = loadChannel(f.file);

      f.write('{ "name": "half-typed');
      const during = loadChannel(f.file);

      assert.equal(during, good, 'the very same object stays on air');
      assert.equal(errors.length, 1);
      assert.match(errors[0], /^\[channel\] channel\.json is invalid, keeping the previous version: /);
    });

    test('a file that parses but fails validation is handled the same way, naming the reason', (t) => {
      quiet(t);
      const f = tempChannelFile(t);
      f.write(makeChannel());
      const good = loadChannel(f.file);

      f.write(makeChannel({ rotation: ['ghost'] }));
      assert.equal(loadChannel(f.file), good);
      assert.match(errors[0], /rotation references unknown programme "ghost"/);

      f.write(withProgram('duo', { stories: 0 }));
      assert.equal(loadChannel(f.file), good);
      assert.match(errors[1], /programme "duo" needs "stories"/);
    });

    test('the broken file is not parsed (or logged) again until it changes', (t) => {
      quiet(t);
      const f = tempChannelFile(t);
      f.write(makeChannel());
      const good = loadChannel(f.file);
      f.write('nope');

      for (let i = 0; i < 5; i++) assert.equal(loadChannel(f.file), good);
      assert.equal(errors.length, 1, 'logged once, not on every call');

      f.write('still nope');
      assert.equal(loadChannel(f.file), good);
      assert.equal(errors.length, 2, 'a new edit is looked at again');
    });

    test('once the file is fixed the new line-up goes on air', (t) => {
      quiet(t);
      const f = tempChannelFile(t);
      f.write(makeChannel());
      const good = loadChannel(f.file);
      f.write('{ broken');
      assert.equal(loadChannel(f.file), good);

      f.write(makeChannel({ name: 'FIXED TV', rotation: ['solo'] }));
      const fixed = loadChannel(f.file);

      assert.notEqual(fixed, good);
      assert.equal(fixed.name, 'FIXED TV');
      assert.deepEqual(fixed.rotation, ['solo']);
      assert.equal(loadChannel(f.file), fixed);
      assert.equal(errors.length, 1);
    });

    test('several broken edits in a row all fall back to the same last good version', (t) => {
      quiet(t);
      const f = tempChannelFile(t);
      f.write(makeChannel({ name: 'GOOD TV' }));
      const good = loadChannel(f.file);
      for (const bad of ['', '[]', 'null', '{}', '{"presenters":{}}']) {
        f.write(bad);
        assert.equal(loadChannel(f.file), good, JSON.stringify(bad));
      }
      assert.equal(errors.length, 5);
    });

    test('a good edit after a bad one replaces the fallback too', (t) => {
      quiet(t);
      const f = tempChannelFile(t);
      f.write(makeChannel({ name: 'ONE' }));
      loadChannel(f.file);
      f.write(makeChannel({ name: 'TWO' }));
      const two = loadChannel(f.file);
      f.write('broken');
      assert.equal(loadChannel(f.file), two, 'falls back to TWO, not to ONE');
    });

    test('there is nothing to fall back to for a file that has never loaded: the error is thrown, every time', (t) => {
      quiet(t);
      const f = tempChannelFile(t);
      f.write('{ not json');
      assert.throws(() => loadChannel(f.file), SyntaxError);
      assert.throws(() => loadChannel(f.file), SyntaxError, 'and not cached as if it were fine');
      assert.deepEqual(errors, []);
    });

    test('the fallback belongs to one file: another broken file does not borrow it', (t) => {
      quiet(t);
      const a = tempChannelFile(t);
      const b = tempChannelFile(t);
      a.write(makeChannel({ name: 'CHANNEL A' }));
      loadChannel(a.file);
      b.write('{ broken');
      assert.throws(() => loadChannel(b.file), SyntaxError);
    });

    test('a running Station keeps broadcasting the old line-up through a broken edit', async (t) => {
      quiet(t);
      const f = tempChannelFile(t);
      f.write(makeChannel());
      const station = new Station({
        config: { queueSize: 1 },
        newsDesk: { stories: new Map(), uncovered: () => [], feedStatus: {}, lastRefresh: 0 },
        producer: {
          canProduce: () => true,
          produce: async (channel, id) => ({ kind: 'episode', id: `e-${id}`, program: { id, title: channel.programs[id].title }, cast: {} }),
        },
        chain: { status: () => [] },
        channel: () => loadChannel(f.file),
        log: { info() {}, warn() {}, error() {} },
      });

      assert.equal(station.publicChannel().name, 'TEST TV'); // on air with the good line-up
      f.write('{ half-typed');
      await station.fill();
      assert.deepEqual(station.queue.map((e) => e.program.id), ['duo']);
      assert.equal(station.publicChannel().name, 'TEST TV');
      assert.equal(station.schedule().upcoming.length, 4, 'one ready episode plus the three slots of the rotation');

      f.write(makeChannel({ name: 'FIXED TV', rotation: ['solo'] }));
      assert.equal(station.publicChannel().name, 'FIXED TV');
    });
  });

  test('a missing file is still a stat error, even after a good load of a different file', (t) => {
    const f = tempChannelFile(t);
    f.write(makeChannel());
    loadChannel(f.file);
    assert.throws(() => loadChannel(path.join(path.dirname(f.file), 'missing.json')), { code: 'ENOENT' });
  });

  test('throws the validation error for an invalid channel that never loaded, and does not cache it', (t) => {
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
  // news programmes (a weather programme is written from the weather data: test/weather.test.js)
  const news = programs.filter(([, p]) => p.kind !== 'weather');

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
    for (const [id, p] of programs.filter(([, q]) => q.kind === 'weather')) {
      for (const key of ['title', 'tagline', 'theme', 'style']) assert.ok(typeof p[key] === 'string' && p[key].trim(), `${id}.${key}`);
    }
    for (const [id, p] of news) {
      for (const key of ['title', 'tagline', 'theme', 'style', 'storyLength']) {
        assert.ok(typeof p[key] === 'string' && p[key].trim(), `${id}.${key}`);
      }
      assert.ok(Number.isInteger(p.stories) && p.stories >= 1 && p.stories <= 18, `${id}.stories = ${p.stories}`);
      assert.ok(Number.isInteger(p.maxChats) && p.maxChats >= 0, `${id}.maxChats = ${p.maxChats}`);
      assert.ok(Array.isArray(p.categories) && p.categories.length >= 1, `${id}.categories`);
    }
    assert.equal(new Set(programs.map(([, p]) => p.title)).size, programs.length, 'programme titles are unique');
  });

  test('solo programmes have no chat segments (there is nobody to chat with)', () => {
    for (const [id, p] of news) {
      if (p.presenters.length === 1) assert.equal(p.maxChats, 0, id);
    }
  });

  test('every programme airs at least once in the rotation, and every presenter hosts something', () => {
    for (const [id] of programs) assert.ok(channel.rotation.includes(id), `${id} is never scheduled`);
    // a correspondent "hosts" the links of the programmes that hand stories to them (server/correspondents.js)
    const hosts = new Set(programs.flatMap(([, p]) => [...p.presenters, ...(p.correspondents || [])]));
    for (const id of Object.keys(channel.presenters)) assert.ok(hosts.has(id), `${id} hosts nothing`);
  });

  test('programme categories exist in config/feeds.json, and every feed category is used by some programme', () => {
    const used = new Set();
    for (const [id, p] of news) {
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

  test('the programmes use the recurring features where they fit, and every duo has a chemistry note', () => {
    assert.deepEqual([...channel.programs['world-now'].features].sort(), ['lighter', 'number', 'roundup']);
    assert.ok(channel.programs['news-60'].features.includes('roundup'));
    for (const [id, p] of programs) {
      if (p.presenters.length === 2) assert.ok(typeof p.chemistry === 'string' && p.chemistry.length > 40, `${id}.chemistry`);
    }
  });

  test('presenter personalities read as grown-up broadcasters (the owner: "not a children\'s programme")', () => {
    for (const [id, p] of Object.entries(channel.presenters)) assert.doesNotMatch(p.personality, /\bpuns?\b|excitable|wacky|\bcute\b|bubbly/i, id);
  });

  test('commercial breaks are configured', () => {
    assert.ok(Number.isInteger(channel.breaks.adsPerBreak) && channel.breaks.adsPerBreak >= 1);
    assert.ok(Number.isInteger(channel.breaks.maxExtraAds) && channel.breaks.maxExtraAds >= 0);
  });
});

describe('validateChannel: optional editorial keys (style bibles)', () => {
  const withProgram = (extra) => {
    const ch = makeChannel();
    Object.assign(ch.programs.duo, extra);
    return ch;
  };
  test('accepts the keys the real channel uses', () => {
    assert.doesNotThrow(() => validateChannel(JSON.parse(fs.readFileSync(REAL_CHANNEL_FILE, 'utf8'))));
    assert.doesNotThrow(() =>
      validateChannel(withProgram({ headlineMax: 45, intro: 'headlines', numberSlot: 'main', toss: '{name}.', noQuestions: true, thanksMax: 1, happyOnly: ['lighter'], roundup: { opener: 'Around the world.', min: 2, max: 3 }, chats: { after: ['lighter'] }, timing: { target: 60, wpm: 170 }, gestures: { allow: { ann: ['nod'] }, grave: ['nod'] } }))
    );
  });

  test('rejects wrong types and unknown values with a clear message', () => {
    for (const [extra, re] of [
      [{ headlineMax: 5 }, /headlineMax/],
      [{ intro: 'montage' }, /intro/],
      [{ numberSlot: 'first' }, /numberSlot/],
      [{ toss: 'Over to you.' }, /toss/],
      [{ chats: { after: ['anywhere'] } }, /chats/],
      [{ roundup: { max: 9 } }, /round-up "max"/],
      [{ timing: { target: 60 } }, /timing/],
      [{ gestures: { allow: 'nod' } }, /gestures "allow"/],
    ]) assert.throws(() => validateChannel(withProgram(extra)), re, JSON.stringify(extra));
  });

  test('a typo in any rule is refused (hot reload keeps the last good file) instead of being silently ignored', () => {
    for (const [extra, re] of [
      [{ chats: { after: ['lead'], max: { lead: 'two' } } }, /chats "max"/],
      [{ chats: { max: { anywhere: 1 } } }, /chats "max"/],
      [{ gestures: { perSegment: 'two' } }, /perSegment/],
      [{ gestures: { only: { lean_in: 'everywhere' } } }, /gestures "only"/],
      [{ gestures: { map: { wave: 'nodd' } } }, /gestures "map"/],
      [{ gestures: { perEpisode: -1 } }, /perEpisode/],
      [{ gestures: { defaults: { intro: 'wavee' } } }, /defaults/],
      [{ gestures: { allow: ['nod', 'jazz_hands'] } }, /unknown action \(jazz_hands\)/],
      [{ gestures: { grave: ['nod', 'smirk'] } }, /unknown action/],
      [{ roundup: { words: 'lots' } }, /round-up "words"/],
      [{ roundup: { reader: 'C' } }, /round-up "reader"/],
      [{ roundup: { min: 4, max: 3 } }, /"min" above/],
      [{ timing: { target: 60, wpm: 170, accept: [65, 55] } }, /accept/],
      [{ timing: { target: 60, wpm: 170, minStories: 0 } }, /minStories/],
      [{ happyOnly: ['lighter', 'always'] }, /happyOnly/],
      [{ maxChats: 'some' }, /maxChats/],
    ]) assert.throws(() => validateChannel(withProgram(extra)), re, JSON.stringify(extra));
  });

  test('a presenter role reaches the public channel (for the strap: "NAME • ROLE")', () => {
    const ch = makeChannel();
    ch.presenters.ann.role = 'Anchor';
    assert.equal(publicChannel(ch).presenters.ann.role, 'Anchor');
    assert.ok(!('role' in publicChannel(ch).presenters.bob));
    ch.presenters.bob.role = 7;
    assert.throws(() => validateChannel(ch), /role/);
  });
});
