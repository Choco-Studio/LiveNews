import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT } from '../server/config.js';

// server/config.js reads process.env when it is imported, so each case imports
// a fresh copy of the module (a different query string) with its own environment.

const KEYS = [
  'HOST',
  'FEEDS_FILE',
  'PICTURE_BUDGET_MS',
  'PICTURE_VERIFY_MS',
  'PORT',
  'RECENT_LINES_HOURS',
  'RECYCLE_AFTER_HOURS',
  'RECYCLE_GAP',
  'RECYCLE_STORIES',
  'PROVIDERS',
  'CODEX_BIN',
  'CODEX_MODEL',
  'CODEX_EXTRA_ARGS',
  'CODEX_TIMEOUT_MS',
  'OPENAI_API_KEY',
  'OPENAI_MODEL',
  'OPENAI_BASE_URL',
  'DEEPSEEK_API_KEY',
  'DEEPSEEK_MODEL',
  'DEEPSEEK_BASE_URL',
  'AI_INBOX_DIR',
  'AI_INBOX_TIMEOUT_MS',
  'QUEUE_SIZE',
  'CANDIDATE_POOL',
  'REVIEW_PASS',
  'MIN_NEW_STORIES',
  'MAX_STORY_AGE_HOURS',
  'FEED_REFRESH_MINUTES',
  'VOICE_ENGINE',
  'KOKORO_DIR',
  'KOKORO_THREADS',
  'VOICE_PYTHON',
  'VOICE_WORKERS',
  'VOICE_BUDGET_S',
  'VOICE_CACHE_MB',
];

let copies = 0;
/** Imports server/config.js with exactly `env` set; every other key counts as unset (an empty value is "unset" for it). */
async function loadConfig(env = {}) {
  const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) process.env[k] = env[k] ?? '';
  try {
    return (await import(`../server/config.js?case=${++copies}`)).config;
  } finally {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('config defaults', () => {
  test('production line-up: codex, then the paid APIs, then the offline mock', async () => {
    const config = await loadConfig();
    assert.deepEqual(config.providers, ['codex', 'openai', 'deepseek', 'mock']);
  });

  test('episode production defaults: 2 episodes ahead, 12 candidates, review pass on, 3 new stories, 36 h, 10 min', async () => {
    const config = await loadConfig();
    assert.equal(config.queueSize, 2);
    assert.equal(config.candidatePool, 12);
    assert.equal(config.reviewPass, true);
    assert.equal(config.minNewStories, 3);
    assert.equal(config.maxStoryAgeHours, 36);
    assert.equal(config.feedRefreshMinutes, 10);
  });

  test('server and codex defaults', async () => {
    const config = await loadConfig();
    assert.equal(config.host, '127.0.0.1');
    assert.equal(config.port, 8080);
    assert.equal(config.codex.bin, 'codex');
    assert.deepEqual(config.codex.extraArgs, []);
    assert.equal(config.codex.timeoutMs, 240000);
  });

  test('the OpenAI-compatible providers have no API key by default, so they are not available', async () => {
    const config = await loadConfig();
    assert.equal(config.openai.apiKey, '');
    assert.equal(config.deepseek.apiKey, '');
    assert.match(config.openai.baseUrl, /^https:\/\//);
    assert.match(config.deepseek.baseUrl, /^https:\/\//);
  });

  test('ROOT is the repository root, and the feeds file and data directory live under it', async () => {
    const config = await loadConfig();
    assert.equal(ROOT, REPO);
    assert.equal(config.feedsFile, path.join(REPO, 'config', 'feeds.json'));
    assert.equal(config.dataDir, path.join(REPO, 'data'));
    assert.ok(fs.existsSync(config.feedsFile));
    assert.ok(fs.existsSync(path.join(REPO, 'config', 'channel.json')));
  });
});

describe('config from the environment', () => {
  test('numbers and strings are read from the environment', async () => {
    const config = await loadConfig({
      HOST: '0.0.0.0',
      PORT: '3000',
      QUEUE_SIZE: '4',
      CANDIDATE_POOL: '20',
      MIN_NEW_STORIES: '2',
      MAX_STORY_AGE_HOURS: '12.5',
      FEED_REFRESH_MINUTES: '5',
      CODEX_BIN: '/opt/codex/bin/codex',
      CODEX_MODEL: 'some-model',
      CODEX_TIMEOUT_MS: '60000',
      OPENAI_API_KEY: 'sk-test',
      OPENAI_MODEL: 'gpt-x',
      OPENAI_BASE_URL: 'https://proxy.test/v1',
      DEEPSEEK_API_KEY: 'ds-test',
    });
    assert.equal(config.host, '0.0.0.0');
    assert.equal(config.port, 3000);
    assert.equal(config.queueSize, 4);
    assert.equal(config.candidatePool, 20);
    assert.equal(config.minNewStories, 2);
    assert.equal(config.maxStoryAgeHours, 12.5);
    assert.equal(config.feedRefreshMinutes, 5);
    assert.deepEqual(config.codex, { bin: '/opt/codex/bin/codex', model: 'some-model', extraArgs: [], timeoutMs: 60000 });
    assert.deepEqual(config.openai, { apiKey: 'sk-test', model: 'gpt-x', baseUrl: 'https://proxy.test/v1' });
    assert.equal(config.deepseek.apiKey, 'ds-test');
  });

  test('a value that is not a number falls back to the default', async () => {
    const config = await loadConfig({ PORT: 'eighty', QUEUE_SIZE: 'lots', CANDIDATE_POOL: '12 items', MIN_NEW_STORIES: 'NaN', CODEX_TIMEOUT_MS: 'Infinity' });
    assert.equal(config.port, 8080);
    assert.equal(config.queueSize, 2);
    assert.equal(config.candidatePool, 12);
    assert.equal(config.minNewStories, 3);
    assert.equal(config.codex.timeoutMs, 240000);
  });

  test('PROVIDERS is split on commas, trimmed, lower-cased, and empty entries are ignored', async () => {
    assert.deepEqual((await loadConfig({ PROVIDERS: ' Mock , OPENAI,, deepseek ' })).providers, ['mock', 'openai', 'deepseek']);
    assert.deepEqual((await loadConfig({ PROVIDERS: 'mock' })).providers, ['mock']);
  });

  test('REVIEW_PASS is off for 0, false, no and off (any case) and on for everything else', async () => {
    for (const value of ['0', 'false', 'no', 'off', 'FALSE', 'Off', 'No']) {
      assert.equal((await loadConfig({ REVIEW_PASS: value })).reviewPass, false, value);
    }
    for (const value of ['1', 'true', 'yes', 'on', 'anything', '']) {
      assert.equal((await loadConfig({ REVIEW_PASS: value })).reviewPass, true, JSON.stringify(value));
    }
  });

  test('voices: browser by default, Kokoro only when asked, with the cache under data/voice', async () => {
    const config = await loadConfig();
    assert.deepEqual(config.voice, {
      engine: 'browser',
      kokoroDir: '',
      threads: 0,
      python: 'python3',
      workers: 1,
      budgetSeconds: 90,
      cacheMb: 300,
      dir: path.join(REPO, 'data', 'voice'),
    });
    assert.equal((await loadConfig({ VOICE_ENGINE: ' Kokoro ' })).voice.engine, 'kokoro');
    for (const value of ['browser', 'tts', 'off', 'none']) assert.equal((await loadConfig({ VOICE_ENGINE: value })).voice.engine, 'browser', value);
    const tuned = (await loadConfig({ KOKORO_DIR: '/models', KOKORO_THREADS: '2', VOICE_BUDGET_S: '30', VOICE_CACHE_MB: 'lots' })).voice;
    assert.deepEqual([tuned.kokoroDir, tuned.threads, tuned.budgetSeconds, tuned.cacheMb], ['/models', 2, 30, 300]);
  });

  test('CODEX_EXTRA_ARGS is split on whitespace', async () => {
    const config = await loadConfig({ CODEX_EXTRA_ARGS: '-c model_reasoning_effort=low   --flag ' });
    assert.deepEqual(config.codex.extraArgs, ['-c', 'model_reasoning_effort=low', '--flag']);
  });

  test('the environment of the test process is left as it was', async () => {
    const before = KEYS.map((k) => process.env[k]);
    await loadConfig({ PORT: '1234', REVIEW_PASS: '0' });
    assert.deepEqual(KEYS.map((k) => process.env[k]), before);
  });
});

describe('.env.example', () => {
  const example = Object.fromEntries(
    fs
      .readFileSync(path.join(REPO, '.env.example'), 'utf8')
      .split(/\r?\n/)
      .map((line) => line.match(/^([A-Z0-9_]+)=(.*)$/))
      .filter(Boolean)
      .map((m) => [m[1], m[2]])
  );

  test('(fix r2) numbers outside their range fall back to the default with a warning', async () => {
    const c = await loadConfig({ RECYCLE_GAP: '-5', PICTURE_BUDGET_MS: '-1', RECYCLE_AFTER_HOURS: '-3', RECENT_LINES_HOURS: '1000' });
    assert.equal(c.recycleGap, 6);
    assert.equal(c.pictureBudgetMs, 6000);
    assert.equal(c.recycleAfterHours, 4);
    assert.equal(c.recentLinesHours, 6);
    const ok = await loadConfig({ RECYCLE_GAP: '8', PICTURE_BUDGET_MS: '2500' });
    assert.equal(ok.recycleGap, 8);
    assert.equal(ok.pictureBudgetMs, 2500);
  });

  test('documents every environment variable that server/config.js reads', () => {
    const source = fs.readFileSync(path.join(REPO, 'server', 'config.js'), 'utf8');
    const used = [...source.matchAll(/\b(?:env|num|bounded)\('([A-Z0-9_]+)'/g)].map((m) => m[1]);
    assert.deepEqual([...used].sort(), [...KEYS].sort(), 'the list of variables in this test is out of date');
    for (const key of used) assert.ok(key in example, `${key} is missing from .env.example`);
  });

  test('the example values for the tuning knobs are the defaults', async () => {
    const defaults = await loadConfig();
    const fromExample = await loadConfig(
      Object.fromEntries(['HOST', 'PORT', 'PROVIDERS', 'QUEUE_SIZE', 'CANDIDATE_POOL', 'REVIEW_PASS', 'MIN_NEW_STORIES', 'MAX_STORY_AGE_HOURS', 'FEED_REFRESH_MINUTES', 'CODEX_TIMEOUT_MS', 'VOICE_ENGINE', 'KOKORO_DIR', 'KOKORO_THREADS', 'VOICE_PYTHON', 'VOICE_WORKERS', 'VOICE_BUDGET_S', 'VOICE_CACHE_MB'].map((k) => [k, example[k]]))
    );
    // A .env made from the example turns the neural voices on; everything else about them is the default.
    assert.deepEqual(fromExample.voice, { ...defaults.voice, engine: 'kokoro' });
    for (const key of ['host', 'port', 'providers', 'queueSize', 'candidatePool', 'reviewPass', 'minNewStories', 'maxStoryAgeHours', 'feedRefreshMinutes']) {
      assert.deepEqual(fromExample[key], defaults[key], key);
    }
    assert.equal(fromExample.codex.timeoutMs, defaults.codex.timeoutMs);
  });
});
