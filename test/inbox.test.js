import { describe, test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createInboxProvider } from '../server/providers/inbox.js';
import { ProviderChain, createProviders } from '../server/providers/index.js';
import { ROOT } from '../server/config.js';
import { extractJson } from '../server/writer.js';

// ---------------------------------------------------------------- helpers

const silent = { info() {}, warn() {}, error() {} };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const dirs = [];
function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inbox-test-'));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  while (dirs.length) fs.rmSync(dirs.pop(), { recursive: true, force: true });
});

/** A provider polling every 10 ms so the tests do not wait for the production 500 ms. */
function makeInbox(dir, { timeoutMs = 5000, ...options } = {}) {
  return createInboxProvider({ dir, timeoutMs }, { pollMs: 10, log: silent, ...options });
}

/** Waits until `fn()` is truthy (the agent side of the tests: it watches the folder). */
async function until(fn, ms = 3000) {
  const t0 = Date.now();
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error('until: timed out');
    await sleep(5);
  }
}

const open = (dir) => fs.readdirSync(dir).filter((n) => n.endsWith('.prompt.md')).sort();
const stemOf = (promptFile) => promptFile.replace(/\.prompt\.md$/, '');

const stories = [
  { id: 's1', title: 'Volcano erupts near Naples', summary: 'Ash covers the bay. Flights are diverted.', source: 'Pixelburg Post', category: 'world', image: 'https://img.test/volcano.jpg', outlets: 3 },
  { id: 's2', title: 'BREAKING: Tram strike called', summary: 'Drivers walk out at dawn.', source: 'Bitport Herald', category: 'world', image: null },
  { id: 's3', title: 'Live: markets open lower', summary: 'x'.repeat(3000), source: 'Ledger Line', category: 'business', image: '/local/fixtures/img/market.png', live: true },
];
const presenters = {
  A: { id: 'paco', name: 'Paco Reyes', role: 'anchor', personality: 'dry' },
  B: { id: 'lola', name: 'Lola Vega', role: 'co-anchor', personality: 'warm' },
};
const program = { id: 'world-now', title: 'WORLD NOW', tagline: 'The day, calmly', stories: 6, features: ['roundup', 'lighter'] };
const writeRequest = (extra = {}) => ({ stage: 'write', prompt: 'PROMPT\nwith "quotes" and {braces}\n', stories, channelName: 'GLOBIT 24', program, presenters, count: 6, ...extra });

// ---------------------------------------------------------------- request files

describe('inbox provider: the request', () => {
  test('writes the exact prompt and a request.json describing the stage, programme, presenters and stories', async () => {
    const dir = tempDir();
    const inbox = makeInbox(dir);
    const pending = inbox.generate(writeRequest());

    const promptFile = await until(() => open(dir)[0]);
    assert.equal(promptFile, '000001-write-world-now.prompt.md');
    assert.equal(fs.readFileSync(path.join(dir, promptFile), 'utf8'), 'PROMPT\nwith "quotes" and {braces}\n');

    const req = JSON.parse(fs.readFileSync(path.join(dir, '000001-write-world-now.request.json'), 'utf8'));
    assert.equal(req.id, '000001-write-world-now');
    assert.equal(req.seq, 1);
    assert.equal(req.stage, 'write');
    assert.equal(req.channel, 'GLOBIT 24');
    assert.equal(req.count, 6);
    assert.equal(req.timeoutMs, 5000);
    assert.equal(Date.parse(req.expiresAt) - Date.parse(req.createdAt), 5000);
    assert.deepEqual(req.program, { id: 'world-now', title: 'WORLD NOW', tagline: 'The day, calmly', stories: 6, features: ['roundup', 'lighter'] });
    assert.deepEqual(req.presenters.map((p) => [p.slot, p.id, p.name, p.role, p.personality]), [
      ['A', 'paco', 'Paco Reyes', 'anchor', 'dry'],
      ['B', 'lola', 'Lola Vega', 'co-anchor', 'warm'],
    ]);

    assert.equal(req.stories.length, 3);
    const [s1, s2, s3] = req.stories;
    assert.deepEqual(s1, {
      id: 's1',
      title: 'Volcano erupts near Naples',
      summary: 'Ash covers the bay. Flights are diverted.',
      source: 'Pixelburg Post',
      category: 'world',
      outlets: 3,
      hasImage: true,
      imageUrl: 'https://img.test/volcano.jpg',
    });
    assert.equal(s2.hasImage, false);
    assert.equal(s2.breaking, true);
    assert.equal('imageUrl' in s2, false);
    assert.equal(s3.hasImage, true);
    assert.equal('imageUrl' in s3, false, 'local paths are not published');
    assert.equal(s3.live, true);
    assert.ok(s3.summary.length <= 2000, 'very long summaries are capped');

    assert.deepEqual(req.files.respond, ['000001-write-world-now.response.txt', '000001-write-world-now.response.json']);
    assert.equal(req.files.doneMarker, '000001-write-world-now.done');

    fs.writeFileSync(path.join(dir, '000001-write-world-now.response.txt'), '{"ok":1}');
    await pending;
  });

  test('a README explaining the protocol is left in the folder', async () => {
    const dir = tempDir();
    const inbox = makeInbox(dir);
    const pending = inbox.generate(writeRequest());
    await until(() => open(dir)[0]);
    const readme = fs.readFileSync(path.join(dir, 'README.md'), 'utf8');
    assert.match(readme, /\.response\.txt/);
    assert.match(readme, /\.done/);
    fs.writeFileSync(path.join(dir, '000001-write-world-now.response.json'), '{}');
    await pending;
  });

  test('the review stage carries the script under review and the source stories', async () => {
    const dir = tempDir();
    const inbox = makeInbox(dir);
    const script = { title: 'Today', segments: [{ type: 'story', storyId: 's1', text: 'Ash.' }] };
    const pending = inbox.generate({ stage: 'review', prompt: 'CHECK', script, stories: [stories[0]], channelName: 'GLOBIT 24', program, presenters });
    const promptFile = await until(() => open(dir)[0]);
    assert.equal(promptFile, '000001-review-world-now.prompt.md');
    const req = JSON.parse(fs.readFileSync(path.join(dir, '000001-review-world-now.request.json'), 'utf8'));
    assert.deepEqual(req.script, script);
    assert.deepEqual(req.stories.map((s) => s.id), ['s1']);
    assert.equal(req.count, null);
    fs.writeFileSync(path.join(dir, '000001-review-world-now.response.txt'), '{"segments":[]}');
    await pending;
  });

  test('a sparse request (no programme, presenters or stories) still produces a valid, safe file name', async () => {
    const dir = tempDir();
    const inbox = makeInbox(dir);
    const pending = inbox.generate({ stage: 'Write It!/../x', prompt: 'p', program: { id: '../../Evil Show' } });
    const promptFile = await until(() => open(dir)[0]);
    assert.match(promptFile, /^000001-write-it-x-evil-show\.prompt\.md$/);
    const req = JSON.parse(fs.readFileSync(path.join(dir, stemOf(promptFile) + '.request.json'), 'utf8'));
    assert.deepEqual(req.stories, []);
    assert.deepEqual(req.presenters, []);
    fs.writeFileSync(path.join(dir, stemOf(promptFile) + '.response.txt'), '{}');
    await pending;
    // nothing escaped the inbox folder
    assert.deepEqual(fs.readdirSync(path.dirname(dir)).filter((n) => /evil/i.test(n)), []);
  });

  test('sequence numbers increase, also for concurrent requests, and continue after a restart', async () => {
    const dir = tempDir();
    const first = makeInbox(dir);
    const a = first.generate(writeRequest());
    const b = first.generate(writeRequest({ stage: 'review' }));
    await until(() => open(dir).length === 2);
    assert.deepEqual(open(dir), ['000001-write-world-now.prompt.md', '000002-review-world-now.prompt.md']);
    fs.writeFileSync(path.join(dir, '000002-review-world-now.response.txt'), '{"n":2}');
    fs.writeFileSync(path.join(dir, '000001-write-world-now.response.txt'), '{"n":1}');
    assert.equal(JSON.parse((await a).text).n, 1);
    assert.equal(JSON.parse((await b).text).n, 2);

    // a "restarted server": a new provider on the same folder never reuses a number, even though the open folder is empty
    assert.deepEqual(open(dir), []);
    const second = makeInbox(dir);
    const c = second.generate(writeRequest());
    const promptFile = await until(() => open(dir)[0]);
    assert.equal(promptFile, '000003-write-world-now.prompt.md');
    fs.writeFileSync(path.join(dir, stemOf(promptFile) + '.response.txt'), '{}');
    await c;
  });

  test('requests left open by an earlier run are moved to expired/ and never answered for nobody', async () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, '000007-write-money-minute.prompt.md'), 'old');
    fs.writeFileSync(path.join(dir, '000007-write-money-minute.request.json'), '{}');
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'not a request: left alone');
    const inbox = makeInbox(dir);
    const pending = inbox.generate(writeRequest());
    const promptFile = await until(() => open(dir)[0]);
    assert.equal(promptFile, '000008-write-world-now.prompt.md');
    assert.deepEqual(open(dir), ['000008-write-world-now.prompt.md']);
    assert.deepEqual(fs.readdirSync(path.join(dir, 'expired')).sort(), ['000007-write-money-minute.prompt.md', '000007-write-money-minute.request.json']);
    assert.ok(fs.existsSync(path.join(dir, 'notes.txt')));
    fs.writeFileSync(path.join(dir, stemOf(promptFile) + '.response.txt'), '{}');
    await pending;
  });
});

// ---------------------------------------------------------------- responses

describe('inbox provider: the response', () => {
  /** Posts a request, lets `agent(stem)` act on the folder, and resolves with the provider result. */
  async function ask(inbox, dir, agent, request = writeRequest()) {
    const pending = inbox.generate(request);
    const stem = stemOf(await until(() => open(dir)[0]));
    await agent(stem);
    return pending;
  }

  test('returns the text of .response.txt once the .done marker exists, with zero usage', async () => {
    const dir = tempDir();
    const result = await ask(makeInbox(dir), dir, (stem) => {
      fs.writeFileSync(path.join(dir, `${stem}.response.txt`), 'Here is the episode:\n{"title":"Calm day","segments":[]}\nThanks!');
      fs.writeFileSync(path.join(dir, `${stem}.done`), '');
    });
    assert.equal(result.text, 'Here is the episode:\n{"title":"Calm day","segments":[]}\nThanks!');
    assert.deepEqual(result.usage, { input: 0, output: 0, cached: 0 });
    assert.equal(extractJson(result.text).title, 'Calm day', 'the writer validators can read it');
  });

  test('accepts .response.json without a marker when it already parses', async () => {
    const dir = tempDir();
    const result = await ask(makeInbox(dir), dir, (stem) => fs.writeFileSync(path.join(dir, `${stem}.response.json`), '{"title":"T"}\n'));
    assert.equal(JSON.parse(result.text).title, 'T');
  });

  test('accepts a .response.txt that is plain JSON, a BOM, or a fenced JSON block, without a marker', async () => {
    for (const body of ['{"a":1}', '﻿{"a":1}', '```json\n{"a":1}\n```\n']) {
      const dir = tempDir();
      const result = await ask(makeInbox(dir), dir, (stem) => fs.writeFileSync(path.join(dir, `${stem}.response.txt`), body));
      assert.deepEqual(extractJson(result.text), { a: 1 }, JSON.stringify(body));
      assert.ok(!result.text.startsWith('﻿'));
    }
  });

  test('a partially written answer is not read: truncated JSON waits for the rest', async () => {
    const dir = tempDir();
    const inbox = makeInbox(dir);
    let settled = false;
    const pending = inbox.generate(writeRequest()).then((r) => {
      settled = true;
      return r;
    });
    const stem = stemOf(await until(() => open(dir)[0]));
    const response = path.join(dir, `${stem}.response.txt`);
    const full = JSON.stringify({ title: 'Long', segments: [{ type: 'story', text: 'one two three' }] });

    fs.writeFileSync(response, ''); // created, nothing in it yet
    await sleep(60);
    assert.equal(settled, false, 'empty file');
    fs.writeFileSync(response, full.slice(0, 25));
    await sleep(60);
    assert.equal(settled, false, 'truncated JSON');
    fs.writeFileSync(response, full.slice(0, full.length - 1)); // everything but the last brace
    await sleep(60);
    assert.equal(settled, false, 'missing closing brace');
    fs.writeFileSync(response, full);
    assert.equal((await pending).text, full);
  });

  test('prose that is not JSON waits for the .done marker', async () => {
    const dir = tempDir();
    const inbox = makeInbox(dir);
    let settled = false;
    const pending = inbox.generate(writeRequest()).then((r) => {
      settled = true;
      return r;
    });
    const stem = stemOf(await until(() => open(dir)[0]));
    fs.writeFileSync(path.join(dir, `${stem}.response.txt`), 'Sure! ```json\n{"a":1}\n``` plus a note');
    await sleep(60);
    assert.equal(settled, false);
    // a bare number is valid JSON but never a complete answer
    fs.writeFileSync(path.join(dir, `${stem}.response.txt`), '12');
    await sleep(60);
    assert.equal(settled, false);
    fs.writeFileSync(path.join(dir, `${stem}.response.txt`), 'Sure! ```json\n{"a":1}\n``` plus a note');
    fs.writeFileSync(path.join(dir, `${stem}.done`), '');
    assert.match((await pending).text, /"a":1/);
  });

  test('a .done marker without a response file keeps waiting until the response appears', async () => {
    const dir = tempDir();
    const inbox = makeInbox(dir);
    let settled = false;
    const pending = inbox.generate(writeRequest()).then((r) => {
      settled = true;
      return r;
    });
    const stem = stemOf(await until(() => open(dir)[0]));
    fs.writeFileSync(path.join(dir, `${stem}.done`), '');
    await sleep(60);
    assert.equal(settled, false);
    fs.writeFileSync(path.join(dir, `${stem}.response.txt`), 'text answer');
    assert.equal((await pending).text, 'text answer');
  });

  test('an empty response with the .done marker is an error, not an endless wait', async () => {
    const dir = tempDir();
    await assert.rejects(
      ask(makeInbox(dir), dir, (stem) => {
        fs.writeFileSync(path.join(dir, `${stem}.response.txt`), '  \n');
        fs.writeFileSync(path.join(dir, `${stem}.done`), '');
      }),
      /empty/
    );
  });

  test('an .error.txt from the agent fails the request at once with the reason', async () => {
    const dir = tempDir();
    const t0 = Date.now();
    await assert.rejects(
      ask(makeInbox(dir, { timeoutMs: 60_000 }), dir, (stem) => fs.writeFileSync(path.join(dir, `${stem}.error.txt`), 'cannot verify these stories\n')),
      /declined: cannot verify these stories/
    );
    assert.ok(Date.now() - t0 < 5000);
    assert.deepEqual(open(dir), [], 'the request is no longer open');
  });

  test('only the file of its own request is read: answers for other requests are ignored', async () => {
    const dir = tempDir();
    const inbox = makeInbox(dir);
    const a = inbox.generate(writeRequest());
    const b = inbox.generate(writeRequest({ stage: 'review' }));
    await until(() => open(dir).length === 2);
    fs.writeFileSync(path.join(dir, '000002-review-world-now.response.txt'), '{"who":"b"}');
    assert.equal(JSON.parse((await b).text).who, 'b');
    assert.deepEqual(open(dir), ['000001-write-world-now.prompt.md'], 'a is still waiting');
    fs.writeFileSync(path.join(dir, '000001-write-world-now.response.json'), '{"who":"a"}');
    assert.equal(JSON.parse((await a).text).who, 'a');
  });
});

// ---------------------------------------------------------------- timeout, folders, availability

describe('inbox provider: timeout, housekeeping, availability', () => {
  test('throws when nobody answers in time, and the request leaves the open list', async () => {
    const dir = tempDir();
    const inbox = makeInbox(dir, { timeoutMs: 120 });
    const t0 = Date.now();
    await assert.rejects(inbox.generate(writeRequest()), /no answer for 000001-write-world-now after \d+ s/);
    const took = Date.now() - t0;
    assert.ok(took >= 100 && took < 3000, `took ${took} ms`);
    assert.deepEqual(open(dir), []);
    assert.deepEqual(fs.readdirSync(path.join(dir, 'expired')).sort(), ['000001-write-world-now.prompt.md', '000001-write-world-now.request.json']);
  });

  test('the timeout message does not look like a quota problem (that would pause the provider for 30 minutes)', async () => {
    const dir = tempDir();
    const inbox = makeInbox(dir, { timeoutMs: 30 });
    const err = await inbox.generate(writeRequest()).catch((e) => e);
    assert.doesNotMatch(err.message, /quota|rate.?limit|usage limit|too many requests|\b429\b/i);
  });

  test('a late answer to an expired request is not mistaken for a new one', async () => {
    const dir = tempDir();
    const inbox = makeInbox(dir, { timeoutMs: 40 });
    await assert.rejects(inbox.generate(writeRequest()));
    fs.writeFileSync(path.join(dir, '000001-write-world-now.response.txt'), '{"late":true}');
    const slow = makeInbox(dir, { timeoutMs: 5000 });
    const pending = slow.generate(writeRequest());
    const promptFile = await until(() => open(dir)[0]);
    assert.equal(promptFile, '000002-write-world-now.prompt.md');
    await sleep(60);
    assert.deepEqual(open(dir), ['000002-write-world-now.prompt.md'], 'the new request did not take the late answer');
    fs.writeFileSync(path.join(dir, '000002-write-world-now.response.txt'), '{"late":false}');
    assert.equal(JSON.parse((await pending).text).late, false);
  });

  test('finished requests move to done/ and the archives keep only the newest stems', async () => {
    const dir = tempDir();
    const inbox = makeInbox(dir, { keep: 3 });
    for (let i = 1; i <= 5; i++) {
      const pending = inbox.generate(writeRequest());
      const promptFile = await until(() => open(dir)[0]);
      fs.writeFileSync(path.join(dir, stemOf(promptFile) + '.response.txt'), `{"i":${i}}`);
      await pending;
    }
    assert.deepEqual(open(dir), []);
    const archived = fs.readdirSync(path.join(dir, 'done'));
    const stems = [...new Set(archived.map((n) => n.split('.')[0].slice(0, 6)))].sort();
    assert.deepEqual(stems, ['000003', '000004', '000005']);
    assert.ok(archived.includes('000005-write-world-now.response.txt'), 'the answer itself is kept for inspection');
    assert.ok(archived.includes('000005-write-world-now.prompt.md'));
  });

  test('available() is true when the folder is writable (it is created on demand) and false when it cannot be', () => {
    const dir = tempDir();
    const nested = path.join(dir, 'a', 'b', 'inbox');
    assert.equal(makeInbox(nested).available(), true);
    assert.ok(fs.statSync(nested).isDirectory());
    // a folder below a plain file can never be created or written
    const blocker = path.join(dir, 'blocker');
    fs.writeFileSync(blocker, 'x');
    assert.equal(makeInbox(path.join(blocker, 'inbox')).available(), false);
  });

  test('generate() rejects (instead of hanging) when the folder cannot be written', async () => {
    const dir = tempDir();
    const blocker = path.join(dir, 'blocker');
    fs.writeFileSync(blocker, 'x');
    await assert.rejects(makeInbox(path.join(blocker, 'inbox')).generate(writeRequest()));
  });

  test('a missing or invalid timeout falls back to 30 minutes, and the provider is named "inbox" and may review', async () => {
    const dir = tempDir();
    for (const timeoutMs of [undefined, 0, -5, NaN]) {
      const inbox = createInboxProvider({ dir, timeoutMs }, { pollMs: 10, log: silent });
      assert.equal(inbox.name, 'inbox');
      assert.notEqual(inbox.reviews, false, 'an external agent can act as the standards editor');
      const pending = inbox.generate(writeRequest());
      const promptFile = await until(() => open(dir)[0]);
      const req = JSON.parse(fs.readFileSync(path.join(dir, stemOf(promptFile) + '.request.json'), 'utf8'));
      assert.equal(req.timeoutMs, 1_800_000);
      fs.writeFileSync(path.join(dir, stemOf(promptFile) + '.response.txt'), '{}');
      await pending;
    }
  });
});

// ---------------------------------------------------------------- integration with the chain and the config

describe('inbox provider in the chain', () => {
  const fakeUsage = () => ({ records: [], record(name, entry) { this.records.push({ name, ...entry }); } });

  test('the agent answers the first call (write); the validator gets its text', async () => {
    const dir = tempDir();
    const usage = fakeUsage();
    const chain = new ProviderChain([makeInbox(dir)], usage, { log: silent });
    const pending = chain.generate(writeRequest(), (text) => extractJson(text));
    const promptFile = await until(() => open(dir)[0]);
    fs.writeFileSync(path.join(dir, stemOf(promptFile) + '.response.txt'), '```json\n{"title":"Hello"}\n```');
    const { provider, value } = await pending;
    assert.equal(provider, 'inbox');
    assert.deepEqual(value, { title: 'Hello' });
    assert.equal(usage.records[0].ok, true);
  });

  test('on timeout the chain falls through to the next provider (the offline mock in production)', async () => {
    const dir = tempDir();
    const usage = fakeUsage();
    const next = { name: 'mock', available: () => true, async generate() { return { text: '{"from":"mock"}', usage: { input: 0, output: 0, cached: 0 } }; } };
    const chain = new ProviderChain([makeInbox(dir, { timeoutMs: 50 }), next], usage, { log: silent });
    const { provider, value } = await chain.generate(writeRequest(), (t) => JSON.parse(t));
    assert.equal(provider, 'mock');
    assert.deepEqual(value, { from: 'mock' });
    assert.equal(usage.records[0].name, 'inbox');
    assert.equal(usage.records[0].ok, false);
    assert.match(usage.records[0].error, /no answer/);
    assert.equal(chain.status()[0].configured, true);
    assert.ok(chain.status()[0].cooldownUntil, 'the inbox rests for a while after a miss');
  });

  test('an unwritable inbox is skipped by the chain', async () => {
    const dir = tempDir();
    const blocker = path.join(dir, 'blocker');
    fs.writeFileSync(blocker, 'x');
    const next = { name: 'mock', available: () => true, async generate() { return { text: '{}', usage: {} }; } };
    const chain = new ProviderChain([makeInbox(path.join(blocker, 'x')), next], fakeUsage(), { log: silent });
    assert.equal((await chain.generate(writeRequest(), (t) => JSON.parse(t))).provider, 'mock');
  });
});

describe('inbox provider registration and configuration', () => {
  test('createProviders knows "inbox", keeps the configured order, and passes the inbox settings', async (t) => {
    t.mock.method(console, 'info', () => {}); // the provider logs through the console when built by createProviders
    const dir = tempDir();
    const cfg = {
      providers: ['inbox', 'mock'],
      codex: { bin: 'codex', model: 'm', extraArgs: [], timeoutMs: 1000 },
      openai: { apiKey: '', model: 'gpt', baseUrl: 'https://api.openai.test/v1' },
      deepseek: { apiKey: '', model: 'ds', baseUrl: 'https://api.deepseek.test/v1' },
      inbox: { dir, timeoutMs: 80 },
    };
    const providers = createProviders(cfg);
    assert.deepEqual(providers.map((p) => p.name), ['inbox', 'mock']);
    assert.equal(providers[0].available(), true);
    await assert.rejects(providers[0].generate(writeRequest()), /no answer/);
    assert.deepEqual(open(dir), []);
    // without an inbox section it still builds (default folder, no side effects until used)
    assert.deepEqual(createProviders({ ...cfg, inbox: undefined, providers: ['inbox'] }).map((p) => p.name), ['inbox']);
  });

  let copies = 0;
  async function loadConfig(env) {
    const keys = ['AI_INBOX_DIR', 'AI_INBOX_TIMEOUT_MS'];
    const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
    for (const k of keys) process.env[k] = env[k] ?? '';
    try {
      return (await import(`../server/config.js?inbox=${++copies}`)).config;
    } finally {
      for (const k of keys) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
    }
  }

  test('config: data/ai-inbox under the repository and 30 minutes by default', async () => {
    const config = await loadConfig({});
    assert.equal(config.inbox.dir, path.join(ROOT, 'data', 'ai-inbox'));
    assert.equal(config.inbox.timeoutMs, 1_800_000);
  });

  test('config: AI_INBOX_DIR (relative to the repository or absolute) and AI_INBOX_TIMEOUT_MS come from the environment', async () => {
    const rel = await loadConfig({ AI_INBOX_DIR: 'tmp/inbox', AI_INBOX_TIMEOUT_MS: '90000' });
    assert.equal(rel.inbox.dir, path.join(ROOT, 'tmp', 'inbox'));
    assert.equal(rel.inbox.timeoutMs, 90000);
    const abs = await loadConfig({ AI_INBOX_DIR: '/var/tmp/globit-inbox', AI_INBOX_TIMEOUT_MS: 'soon' });
    assert.equal(abs.inbox.dir, '/var/tmp/globit-inbox');
    assert.equal(abs.inbox.timeoutMs, 1_800_000, 'not a number: default');
  });

  test('.env.example documents both variables with their defaults', () => {
    const example = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8');
    assert.match(example, /^AI_INBOX_DIR=data\/ai-inbox$/m);
    assert.match(example, /^AI_INBOX_TIMEOUT_MS=1800000$/m);
  });
});
