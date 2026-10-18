// The writer trial (tools/writer/try.mjs, tools/writer/lib.mjs): the measures the owner's server reports with a real key,
// checked here on a fake model's episodes (no key, no network): every AI call recorded by stage with its tokens and
// time, the per-story verbatim measure as aired, the rewrites, cuts and drops, the editor's changes, the month of 24/7
// air on the channel's clock, and the cost as a formula of the provider's prices. And the tool itself, run dry on the
// offline fixture feeds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Producer } from '../server/producer.js';
import { ProviderChain } from '../server/providers/index.js';
import { createMockProvider } from '../server/providers/mock.js';
import { loadChannel } from '../server/channel.js';
import { recordCalls, episodeRow, scheduleModel, monthlyVolume, costFormula, summarize, formatReport } from '../tools/writer/lib.mjs';
import { createFakeModel, STORIES, GOOD, COPIED, seg, script } from './fixtures/fake-model.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const channel = {
  name: 'TEST TV',
  presenters: { ann: { name: 'Ann Anchor', personality: 'calm' }, bob: { name: 'Bob Banter', personality: 'dry' } },
  programs: { duo: { title: 'THE DUO', tagline: 'TWO', theme: 'world', presenters: ['ann', 'bob'], categories: ['world'], stories: 3, maxChats: 0, style: 'A bulletin.', storyLength: '2 to 4 sentences' } },
  rotation: ['duo'],
  breaks: { adsPerBreak: 2, minProgrammeBetween: 420 },
};

async function trial({ write, rewrite = null, fail = {} }) {
  const stories = STORIES.map((s) => ({ ...s }));
  const desk = { stories: new Map(stories.map((s) => [s.id, s])), candidates: (n) => stories.slice(0, n), markCovered() {}, markOffered() {}, resolveImage: async () => null, get: (id) => desk.stories.get(id) };
  const calls = [];
  const providers = recordCalls([createFakeModel({ write, rewrite, fail }), createMockProvider()], calls);
  const chain = new ProviderChain(providers, { record() {} }, { log: { warn() {} } });
  const producer = new Producer({ config: { candidatePool: 12, minNewStories: 3, reviewPass: true }, newsDesk: desk, chain, log: { info() {}, warn() {}, error() {} } });
  const ep = await producer.produce(channel, 'duo');
  return { ep, calls, row: episodeRow(ep, { programme: 'duo', getStory: (id) => desk.get(id), calls }) };
}

test('every AI call is recorded by stage with its tokens and time; a failure too', async () => {
  const { calls, row } = await trial({
    write: script([seg('lis', COPIED.lis), seg('sev', GOOD.sev), seg('osl', GOOD.osl)]),
    rewrite: JSON.stringify({ stories: [{ storyId: 'lis', text: GOOD.lis }] }),
  });
  assert.deepEqual(calls.map((c) => [c.provider, c.stage, c.ok]), [['fakeai', 'write', true], ['fakeai', 'rewrite', true], ['fakeai', 'review', true]]);
  assert.ok(calls.every((c) => c.input > 0 && c.output > 0 && Number.isInteger(c.ms)));
  assert.deepEqual(Object.keys(row.stages), ['write', 'rewrite', 'review']);
  assert.equal(row.stages.rewrite.calls, 1);
  assert.deepEqual(row.rewritten, ['lis']);
  assert.equal(row.violating, 0);
  assert.ok(row.stories.every((s) => s.ok && s.share <= 0.2 && s.longest <= 12), JSON.stringify(row.stories));
  assert.ok(row.pipelineMs.write >= 0 && row.pipelineMs.review >= 0);
  const failing = [];
  const [p] = recordCalls([createFakeModel({ fail: { write: new Error('HTTP 429: quota') } })], failing);
  await assert.rejects(p.generate({ stage: 'write', prompt: 'x', program: { id: 'duo' } }));
  assert.deepEqual(failing.map((c) => [c.stage, c.ok, c.programme, c.error]), [['write', false, 'duo', 'HTTP 429: quota']]);
});

test('an episode the offline writer made is reported as such (never published), its copies counted apart', async () => {
  const { row } = await trial({ write: null, fail: { write: Object.assign(new Error('down'), { status: 503 }) } });
  assert.equal(row.writtenBy, 'mock');
  assert.equal(row.offline, true);
  const s = summarize([row], [], { channel });
  assert.deepEqual([s.byAI, s.offline, s.stories], [0, 1, 0]);
  assert.ok(formatReport(s, [row]).some((l) => /OFFLINE: never published/.test(l)));
});

test('the clock: NEWS IN 60 on both marks of every hour, MONEY MINUTE off at night and at weekends, SEVEN DAYS at weekends only', () => {
  const real = loadChannel();
  const m = scheduleModel(real);
  assert.equal(m.perDay['news-60'], 48);
  assert.equal(m.perMonth['news-60'], 1440);
  assert.ok(m.perDay['world-now'] > m.perDay['tech-bytes'], 'twice in the rotation');
  assert.ok(m.perDay['money-minute'] > 0 && m.perDay['money-minute'] < m.perDay['tech-bytes'] / 2);
  assert.ok(m.perDay['seven-days'] > 0 && m.perDay['seven-days'] <= 24 / 3);
  // a measured air time moves the estimate: longer programmes, fewer of them
  const longer = scheduleModel(real, { air: { 'world-now': 900 } });
  assert.ok(longer.perDay['world-now'] < m.perDay['world-now']);
  assert.ok(m.assumptions.length >= 3);
});

test('a month of tokens and its cost as a formula of the provider\'s prices', () => {
  const model = { perMonth: { 'news-60': 1440, 'world-now': 1000, 'world-weather': 800 } };
  const v = monthlyVolume(model, { 'news-60': { input: 5000, output: 1000, cached: 2000 }, 'world-now': { input: 20000, output: 4000, cached: 0 } });
  assert.deepEqual([v.input, v.output, v.cached], [1440 * 5000 + 1000 * 20000, 1440 * 1000 + 1000 * 4000, 1440 * 2000]);
  assert.equal(v.byProgramme['world-weather'], undefined, 'not written by the AI: no tokens');
  const c = costFormula(v);
  assert.equal(c.formula, 'cost a month = 24.32 × P_in + 2.88 × P_cached + 5.44 × P_out');
  assert.match(c.simple, /27\.2 × P_in \+ 5\.44 × P_out/);
  assert.match(c.legend, /price per million/);
});

test('an attempt the own-words check skipped costs tokens too: they count against the episodes that air', async () => {
  const made = await trial({ write: script([seg('lis', GOOD.lis), seg('sev', GOOD.sev), seg('osl', GOOD.osl)]) });
  const skipped = await trial({ write: script([seg('lis', COPIED.lis), seg('sev', COPIED.sev), seg('osl', GOOD.osl)]), rewrite: '{"stories": []}' });
  assert.equal(skipped.ep, null);
  assert.ok(skipped.row.stages.write.input > 0 && skipped.row.stages.rewrite.calls === 2);
  const s = summarize([made.row, skipped.row], [...made.calls, ...skipped.calls], { channel });
  const all = [made.row, skipped.row].flatMap((r) => Object.values(r.stages)).reduce((n, st) => n + st.input, 0);
  assert.equal(s.perEpisode.duo.input, all, 'two attempts, one episode on air: both attempts\' tokens');
  assert.deepEqual([s.byAI, s.notMade], [1, 1]);
});

test('the summary adds the trial up: copies as aired, rewrites, the editor\'s changes, tokens by stage, the month', async () => {
  const a = await trial({ write: script([seg('lis', COPIED.lis), seg('sev', GOOD.sev), seg('osl', GOOD.osl)]), rewrite: JSON.stringify({ stories: [{ storyId: 'lis', text: GOOD.lis }] }) });
  const b = await trial({ write: script([seg('lis', GOOD.lis), seg('sev', GOOD.sev), seg('osl', GOOD.osl)]) });
  const s = summarize([a.row, b.row], [...a.calls, ...b.calls], { channel });
  assert.deepEqual([s.episodes, s.byAI, s.stories, s.violating, s.rewritten], [2, 2, 6, 0, 1]);
  assert.equal(s.stages.write.calls, 2);
  assert.equal(s.stages.rewrite.calls, 1);
  assert.equal(s.stages.review.calls, 2);
  assert.ok(s.perEpisode.duo.input > 0 && s.perEpisode.duo.output > 0);
  assert.ok(s.volume.input > 0 && s.cost.inputM >= 0);
  const text = formatReport(s, [a.row, b.row]).join('\n');
  assert.match(text, /breaking the verbatim rule as aired: 0 \(must be 0\)/);
  assert.match(text, /1 stories rewritten/);
  assert.match(text, /cost a month = [\d.]+ × P_in \+ [\d.]+ × P_cached \+ [\d.]+ × P_out/);
  assert.match(text, /rewrite +1 calls/);
});

test('the tool runs dry on the offline fixture feeds: files only, every episode the offline writer\'s', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'writer-trial-'));
  try {
    const stdout = execFileSync(process.execPath, [path.join(ROOT, 'tools', 'writer', 'try.mjs'), '--episodes', '1', '--programmes', 'news-60', '--out', out], {
      cwd: ROOT,
      env: { ...process.env, PROVIDERS: 'mock', FEEDS_FILE: 'config/feeds.fixture.json', ANTHROPIC_API_KEY: '', OPENAI_API_KEY: '', DEEPSEEK_API_KEY: '', NODE_NO_WARNINGS: '1' },
      encoding: 'utf8',
      timeout: 120_000,
    });
    assert.match(stdout, /AI: NONE configured/);
    assert.match(stdout, /A MONTH OF 24\/7 AIR/);
    const report = JSON.parse(fs.readFileSync(path.join(out, 'report.json'), 'utf8'));
    assert.equal(report.rows.length, 1);
    assert.equal(report.rows[0].programme, 'news-60');
    assert.ok(report.rows[0].writtenBy === 'mock' || report.rows[0].writtenBy === null);
    assert.ok(fs.existsSync(path.join(out, 'report.txt')) && fs.existsSync(path.join(out, 'log.txt')));
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});
