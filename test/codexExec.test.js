import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createCodexProvider } from '../server/providers/codexExec.js';
import { ProviderChain } from '../server/providers/index.js';
import { createMockProvider } from '../server/providers/mock.js';

// The real Codex CLI is never needed: `bin` points at a small fake executable
// (a Node script in a temp dir) that behaves like `codex exec --json`:
// it reads the prompt from stdin, prints JSONL events and writes the -o file.

const CODEX_PROVIDER_FILE = fileURLToPath(new URL('../server/providers/codexExec.js', import.meta.url));
const REAL_TMP = os.tmpdir();
const silentLogger = { info() {}, warn() {}, error() {} };

const PREAMBLE = 'Do not run commands or read files: everything you need is in this message. Your final answer must be only the requested JSON.\n\n';

const FAKE_CODEX_SOURCE = String.raw`
const fs = require('node:fs');
const path = require('node:path');
const dir = __dirname;
const callsFile = path.join(dir, 'calls.jsonl');
const args = process.argv.slice(2);
const outFile = args[args.indexOf('-o') + 1];
const log = (entry) => fs.appendFileSync(callsFile, JSON.stringify({ ...entry, t: Date.now() }) + '\n');
const behaviors = JSON.parse(fs.readFileSync(path.join(dir, 'behaviors.json'), 'utf8'));
const n = fs.existsSync(callsFile) ? fs.readFileSync(callsFile, 'utf8').split('\n').filter((l) => l.includes('"event":"start"')).length : 0;
const b = behaviors[Math.min(n, behaviors.length - 1)];
log({ event: 'start', n, pid: process.pid, args, cwd: process.cwd(), entries: fs.readdirSync(process.cwd()) });
if (b.exitImmediately) process.exit(b.exit === undefined ? 1 : b.exit);
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => (input += d));
process.stdin.on('end', async () => {
  log({ event: 'input', input });
  if (b.sleepMs) await new Promise((r) => setTimeout(r, b.sleepMs));
  for (const line of b.stdout || []) process.stdout.write((typeof line === 'string' ? line : JSON.stringify(line)) + '\n');
  if (b.stderr) process.stderr.write(b.stderr);
  if (b.outputFile !== undefined) fs.writeFileSync(outFile, b.outputFile);
  log({ event: 'end' });
  process.exitCode = b.exit === undefined ? 0 : b.exit;
});
`;

/** JSONL events as `codex exec --json` prints them. */
const ev = {
  threadStarted: { type: 'thread.started', thread_id: 'thread-1' },
  message: (text) => ({ type: 'item.completed', item: { id: 'item-1', type: 'agent_message', text } }),
  completed: (usage) => ({ type: 'turn.completed', usage }),
  failed: (message) => ({ type: 'turn.failed', error: { message } }),
  error: (message) => ({ type: 'error', message }),
};

const ANSWER = '{"title":"T","segments":[]}';

/** A normal successful run: events on stdout and the final message in the -o file. */
const success = (text = ANSWER, usage = { input_tokens: 100, cached_input_tokens: 40, output_tokens: 20 }) => ({
  stdout: [ev.threadStarted, ev.message(text), ev.completed(usage)],
  outputFile: text,
});

/**
 * Creates the fake CLI. `behaviors` is a list, one entry per call (the last
 * one repeats): { stdout, stderr, outputFile, exit, sleepMs, exitImmediately }.
 */
function makeFake(t, behaviors) {
  const dir = fs.mkdtempSync(path.join(REAL_TMP, 'livenews-fake-codex-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const bin = path.join(dir, 'codex');
  const node = /\s/.test(process.execPath) ? '#!/usr/bin/env node' : `#!${process.execPath}`;
  fs.writeFileSync(bin, `${node}\n${FAKE_CODEX_SOURCE}`);
  fs.chmodSync(bin, 0o755);
  fs.writeFileSync(path.join(dir, 'behaviors.json'), JSON.stringify(Array.isArray(behaviors) ? behaviors : [behaviors]));
  const callsFile = path.join(dir, 'calls.jsonl');
  return {
    dir,
    bin,
    /** Everything the fake logged, in order. */
    log: () => (fs.existsSync(callsFile) ? fs.readFileSync(callsFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []),
    starts() {
      return this.log().filter((e) => e.event === 'start');
    },
    inputs() {
      return this.log().filter((e) => e.event === 'input').map((e) => e.input);
    },
  };
}

const makeProvider = (bin, extra = {}) => createCodexProvider({ bin, model: 'test-model', extraArgs: [], timeoutMs: 15_000, ...extra });

describe('codex exec provider (fake CLI)', () => {
  // Codex gets a fresh temp dir per call. Pointing TMPDIR at a private folder lets us check that none is left behind.
  let scratch;
  let savedTmpdir;
  before(() => {
    savedTmpdir = process.env.TMPDIR;
    scratch = fs.mkdtempSync(path.join(REAL_TMP, 'livenews-codex-scratch-'));
    process.env.TMPDIR = scratch;
  });
  after(() => {
    if (savedTmpdir === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = savedTmpdir;
    fs.rmSync(scratch, { recursive: true, force: true });
  });
  const leftovers = () => fs.readdirSync(scratch);

  test('is named "codex" and always reports itself as available (a missing CLI shows up when it runs)', () => {
    const provider = makeProvider('/nonexistent/codex');
    assert.equal(provider.name, 'codex');
    assert.equal(provider.available(), true);
  });

  // -------------------------------------------------------------- the happy path

  test('returns the final message and the token usage', async (t) => {
    const fake = makeFake(t, success());
    const result = await makeProvider(fake.bin).generate({ prompt: 'write the bulletin' });
    assert.deepEqual(result, { text: ANSWER, usage: { input: 100, cached: 40, output: 20 } });
  });

  test('calls `codex exec --json --skip-git-repo-check --ephemeral --sandbox read-only -m <model> -o <file> -`', async (t) => {
    const fake = makeFake(t, success());
    await makeProvider(fake.bin, { model: 'gpt-test' }).generate({ prompt: 'p' });

    const [start] = fake.starts();
    const outFile = start.args[start.args.indexOf('-o') + 1];
    assert.match(path.basename(outFile), /^last-message\.txt$/);
    assert.deepEqual(start.args, ['exec', '--json', '--skip-git-repo-check', '--ephemeral', '--sandbox', 'read-only', '-m', 'gpt-test', '-o', outFile, '-']);
  });

  test('extra arguments go before the final "-" (stdin marker)', async (t) => {
    const fake = makeFake(t, success());
    await makeProvider(fake.bin, { extraArgs: ['-c', 'model_reasoning_effort=low'] }).generate({ prompt: 'p' });

    const [start] = fake.starts();
    const outFile = start.args[start.args.indexOf('-o') + 1];
    assert.deepEqual(start.args.slice(-5), ['-o', outFile, '-c', 'model_reasoning_effort=low', '-']);
    assert.equal(start.args.at(-1), '-');
  });

  test('the prompt arrives on stdin, after the English preamble that forbids running commands', async (t) => {
    const fake = makeFake(t, success());
    await makeProvider(fake.bin).generate({ prompt: 'Write the script.\nLine two with “quotes”, an ñ and an em dash —.' });
    assert.deepEqual(fake.inputs(), [`${PREAMBLE}Write the script.\nLine two with “quotes”, an ñ and an em dash —.`]);
  });

  test('a large prompt is delivered completely', async (t) => {
    const fake = makeFake(t, success());
    const prompt = 'candidate headline and summary text. '.repeat(8000); // ~300 KB
    await makeProvider(fake.bin).generate({ prompt });
    assert.equal(fake.inputs()[0], PREAMBLE + prompt);
  });

  test('runs in an empty read-only scratch directory that is deleted afterwards', async (t) => {
    const fake = makeFake(t, success());
    await makeProvider(fake.bin).generate({ prompt: 'p' });

    const [start] = fake.starts();
    const outFile = start.args[start.args.indexOf('-o') + 1];
    assert.equal(path.basename(start.cwd), path.basename(path.dirname(outFile)), 'the -o file lives in the working directory');
    assert.equal(path.dirname(start.cwd), fs.realpathSync(scratch), 'a fresh directory inside the temp dir');
    assert.match(path.basename(start.cwd), /^livenews-codex-/);
    assert.deepEqual(start.entries, [], 'the agent starts with nothing to touch');
    assert.deepEqual(leftovers(), []);
    assert.equal(fs.existsSync(outFile), false);
  });

  // -------------------------------------------------------------- reading the output

  test('sums the usage of every turn.completed event and defaults missing counters to 0', async (t) => {
    const fake = makeFake(t, {
      stdout: [ev.threadStarted, ev.message(ANSWER), ev.completed({ input_tokens: 10, output_tokens: 2 }), ev.completed({ input_tokens: 5, cached_input_tokens: 3, output_tokens: 1 }), { type: 'turn.completed' }],
    });
    const { usage } = await makeProvider(fake.bin).generate({ prompt: 'p' });
    assert.deepEqual(usage, { input: 15, cached: 3, output: 3 });
  });

  test('usage is all zeros when the CLI reports none', async (t) => {
    const fake = makeFake(t, { stdout: [ev.message(ANSWER)] });
    assert.deepEqual((await makeProvider(fake.bin).generate({ prompt: 'p' })).usage, { input: 0, cached: 0, output: 0 });
  });

  test('the -o file wins over the agent_message events', async (t) => {
    const fake = makeFake(t, { stdout: [ev.message('from the event stream')], outputFile: '{"from":"file"}' });
    assert.equal((await makeProvider(fake.bin).generate({ prompt: 'p' })).text, '{"from":"file"}');
  });

  test('an empty -o file falls back to the last agent_message', async (t) => {
    const fake = makeFake(t, { stdout: [ev.message('first'), ev.message('{"from":"event"}')], outputFile: '' });
    assert.equal((await makeProvider(fake.bin).generate({ prompt: 'p' })).text, '{"from":"event"}');
  });

  test('without a -o file the last agent_message is the answer', async (t) => {
    const fake = makeFake(t, { stdout: [ev.message('first draft'), ev.message('final answer')] });
    assert.equal((await makeProvider(fake.bin).generate({ prompt: 'p' })).text, 'final answer');
  });

  test('ignores progress noise: non-JSON lines, malformed JSON, other event and item types', async (t) => {
    const fake = makeFake(t, {
      stdout: [
        'Reading prompt from stdin...',
        '2026-10-02T10:00:00Z WARN something harmless',
        '{ this is not valid json',
        ev.threadStarted,
        { type: 'item.completed', item: { type: 'reasoning', text: 'thinking about it' } },
        { type: 'item.completed', item: { type: 'command_execution', command: 'ls' } },
        { type: 'turn.started' },
        ev.message(ANSWER),
        ev.completed({ input_tokens: 1, cached_input_tokens: 0, output_tokens: 1 }),
      ],
    });
    assert.deepEqual(await makeProvider(fake.bin).generate({ prompt: 'p' }), { text: ANSWER, usage: { input: 1, cached: 0, output: 1 } });
  });

  test('a non-fatal "error" event (e.g. a reconnect notice) does not fail a run that produced an answer', async (t) => {
    const fake = makeFake(t, { stdout: [ev.error('Reconnecting... 1/5'), ev.message(ANSWER), ev.completed({ input_tokens: 1 })], outputFile: ANSWER });
    assert.equal((await makeProvider(fake.bin).generate({ prompt: 'p' })).text, ANSWER);
  });

  test('a non-zero exit code is ignored when the -o file holds the answer', async (t) => {
    const fake = makeFake(t, { ...success(), exit: 1 });
    assert.equal((await makeProvider(fake.bin).generate({ prompt: 'p' })).text, ANSWER);
  });

  // -------------------------------------------------------------- failures

  test('turn.failed rejects with the CLI message, even if an agent_message was emitted and the -o file exists', async (t) => {
    const fake = makeFake(t, {
      stdout: [ev.threadStarted, ev.message(ANSWER), ev.failed('Model overloaded, try later')],
      outputFile: ANSWER,
    });
    await assert.rejects(makeProvider(fake.bin).generate({ prompt: 'p' }), { message: 'codex exec returned no answer: Model overloaded, try later' });
  });

  test('turn.failed without a message says "turn failed"', async (t) => {
    const fake = makeFake(t, { stdout: [ev.message(ANSWER), { type: 'turn.failed' }] });
    await assert.rejects(makeProvider(fake.bin).generate({ prompt: 'p' }), /codex exec returned no answer: turn failed/);
  });

  test('turn.failed wins over an earlier error notice', async (t) => {
    const fake = makeFake(t, { stdout: [ev.error('Reconnecting... 2/5'), ev.failed('stream disconnected')] });
    await assert.rejects(makeProvider(fake.bin).generate({ prompt: 'p' }), { message: 'codex exec returned no answer: stream disconnected' });
  });

  test('an "error" event explains a run that ended without an answer', async (t) => {
    const fake = makeFake(t, { stdout: [ev.error('You have hit your usage limit')], exit: 1 });
    await assert.rejects(makeProvider(fake.bin).generate({ prompt: 'p' }), { message: 'codex exec returned no answer: You have hit your usage limit' });
  });

  test('a non-zero exit without an output file rejects, quoting the last lines of stderr', async (t) => {
    const fake = makeFake(t, { stderr: 'line one\nline two\nline three\nlast problem: not logged in\n', exit: 3 });
    await assert.rejects(makeProvider(fake.bin).generate({ prompt: 'p' }), { message: 'codex exec returned no answer: line two line three last problem: not logged in' });
  });

  test('a non-zero exit with no output at all reports the exit code', async (t) => {
    const fake = makeFake(t, { exit: 3 });
    await assert.rejects(makeProvider(fake.bin).generate({ prompt: 'p' }), { message: 'codex exec returned no answer: exit code 3' });
  });

  test('a non-zero exit rejects even when an agent_message was printed but no -o file was written', async (t) => {
    const fake = makeFake(t, { stdout: [ev.message(ANSWER)], exit: 2 });
    await assert.rejects(makeProvider(fake.bin).generate({ prompt: 'p' }), /codex exec returned no answer: exit code 2/);
  });

  test('a clean exit with no answer at all rejects too', async (t) => {
    const fake = makeFake(t, { stdout: [ev.threadStarted, ev.completed({ input_tokens: 1 })] });
    await assert.rejects(makeProvider(fake.bin).generate({ prompt: 'p' }), { message: 'codex exec returned no answer: exit code 0' });
  });

  test('a missing binary rejects with an error that says it was not found', async () => {
    const provider = makeProvider('/nonexistent/dir/codex');
    await assert.rejects(provider.generate({ prompt: 'p' }), (err) => {
      assert.match(err.message, /not found/);
      assert.match(err.message, /"\/nonexistent\/dir\/codex"/);
      assert.match(err.message, /install the Codex CLI/);
      return true;
    });
    assert.deepEqual(leftovers(), []);
  });

  test('a binary that exists but cannot be executed rejects with the system error', async (t) => {
    const fake = makeFake(t, success());
    fs.chmodSync(fake.bin, 0o644);
    await assert.rejects(makeProvider(fake.bin).generate({ prompt: 'p' }), { code: 'EACCES' });
  });

  test('a run that takes longer than timeoutMs rejects with a timeout error and kills the process', async (t) => {
    const fake = makeFake(t, { ...success(), sleepMs: 10_000 });
    const started = Date.now();

    // 2 s, not a few hundred ms: on a loaded machine the fake CLI (a node process) can take longer than that
    // just to start, and then it has never written its "start" record. The fake sleeps 10 s, so the margin is cheap.
    await assert.rejects(makeProvider(fake.bin, { timeoutMs: 2000 }).generate({ prompt: 'p' }), /codex exec timed out after 2000 ms/);

    assert.ok(Date.now() - started < 8000, 'rejected at the timeout, not when the process finished');
    for (let i = 0; i < 40 && !fake.starts().length; i++) await new Promise((resolve) => setTimeout(resolve, 50));
    const [{ pid }] = fake.starts();
    const alive = () => {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    };
    for (let i = 0; i < 40 && alive(); i++) await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(alive(), false, 'the CLI process was terminated, not left running');
    assert.equal(fake.log().some((e) => e.event === 'end'), false, 'and it never finished');
  });

  test('scratch directories are removed after successes and after every kind of failure', async (t) => {
    const ok = makeFake(t, success());
    const failing = makeFake(t, { stdout: [ev.failed('nope')] });
    const slow = makeFake(t, { sleepMs: 10_000 });
    await makeProvider(ok.bin).generate({ prompt: 'p' });
    await assert.rejects(makeProvider(failing.bin).generate({ prompt: 'p' }));
    await assert.rejects(makeProvider(slow.bin, { timeoutMs: 2000 }).generate({ prompt: 'p' }), /timed out/);
    await assert.rejects(makeProvider('/nonexistent/codex').generate({ prompt: 'p' }));
    assert.deepEqual(leftovers(), []);
  });

  // -------------------------------------------------------------- serialization

  test('concurrent generate() calls are serialized: they never overlap and run in the order they were made', async (t) => {
    const fake = makeFake(t, [
      { ...success('{"call":1}'), sleepMs: 200 },
      { ...success('{"call":2}'), sleepMs: 200 },
      { ...success('{"call":3}'), sleepMs: 200 },
    ]);
    const provider = makeProvider(fake.bin);

    const results = await Promise.all([provider.generate({ prompt: 'one' }), provider.generate({ prompt: 'two' }), provider.generate({ prompt: 'three' })]);

    assert.deepEqual(results.map((r) => r.text), ['{"call":1}', '{"call":2}', '{"call":3}']);
    const events = fake.log().filter((e) => e.event === 'start' || e.event === 'end');
    assert.deepEqual(events.map((e) => e.event), ['start', 'end', 'start', 'end', 'start', 'end'], 'a new process never starts before the previous one has finished');
    for (let i = 2; i < events.length; i += 2) assert.ok(events[i].t >= events[i - 1].t, 'timestamps agree');
    assert.deepEqual(fake.inputs(), [`${PREAMBLE}one`, `${PREAMBLE}two`, `${PREAMBLE}three`]);
  });

  test('a failed call does not block the ones queued behind it', async (t) => {
    const fake = makeFake(t, [{ stdout: [ev.failed('boom')], sleepMs: 100 }, success('{"call":2}')]);
    const provider = makeProvider(fake.bin);

    const first = provider.generate({ prompt: 'one' });
    const second = provider.generate({ prompt: 'two' });
    const [a, b] = await Promise.allSettled([first, second]);

    assert.equal(a.status, 'rejected');
    assert.match(a.reason.message, /boom/);
    assert.equal(b.status, 'fulfilled');
    assert.equal(b.value.text, '{"call":2}');
    assert.deepEqual(fake.log().filter((e) => e.event === 'start' || e.event === 'end').map((e) => e.event), ['start', 'end', 'start', 'end']);
  });

  test('a timed-out call does not block the next one either', async (t) => {
    const fake = makeFake(t, [{ sleepMs: 10_000 }, success('{"call":2}')]);
    const provider = makeProvider(fake.bin, { timeoutMs: 2000 });

    const [a, b] = await Promise.allSettled([provider.generate({ prompt: 'one' }), provider.generate({ prompt: 'two' })]);

    assert.equal(a.status, 'rejected');
    assert.match(a.reason.message, /timed out/);
    assert.equal(b.status, 'fulfilled');
    assert.equal(b.value.text, '{"call":2}');
  });

  test('separate providers do not share a queue', async (t) => {
    // Judged from the fakes' own start/end records (not the wall clock), so a loaded machine cannot fail it.
    const fakeA = makeFake(t, { ...success('{"who":"a"}'), sleepMs: 1500 });
    const fakeB = makeFake(t, { ...success('{"who":"b"}'), sleepMs: 1500 });
    const results = await Promise.all([makeProvider(fakeA.bin).generate({ prompt: 'p' }), makeProvider(fakeB.bin).generate({ prompt: 'p' })]);
    assert.deepEqual(results.map((r) => r.text), ['{"who":"a"}', '{"who":"b"}']);
    const span = (fake) => [fake.log().find((e) => e.event === 'start').t, fake.log().find((e) => e.event === 'end').t];
    const [a0, a1] = span(fakeA);
    const [b0, b1] = span(fakeB);
    assert.ok(a0 < b1 && b0 < a1, 'they ran in parallel (their runs overlap)');
  });

  // -------------------------------------------------------------- inside the provider chain

  test('plugs into a ProviderChain, and the CLI "usage limit" message earns the long (30 min) cooldown', async (t) => {
    const fake = makeFake(t, { stdout: [ev.failed("You've hit your usage limit. Try again at 5:00 PM.")] });
    let now = 1_700_000_000_000;
    const chain = new ProviderChain([makeProvider(fake.bin), createMockProvider()], { record() {} }, { log: silentLogger, now: () => now });

    const out = await chain.generate({ stage: 'write', prompt: 'p', stories: [{ id: 's1', title: 'T', summary: 'S.', source: 'X', category: 'world', image: null }], channelName: 'TEST', count: 1 }, (text) => JSON.parse(text));

    assert.equal(out.provider, 'mock', 'fell through to the next provider');
    assert.equal(chain.status()[0].cooldownUntil - now, 30 * 60_000);
    assert.equal(fake.starts().length, 1);

    now += 10 * 60_000;
    await chain.generate({ stage: 'write', prompt: 'p', stories: [{ id: 's1', title: 'T', summary: 'S.', source: 'X', category: 'world', image: null }], channelName: 'TEST', count: 1 }, (text) => JSON.parse(text));
    assert.equal(fake.starts().length, 1, 'codex is not called again while it is paused');
  });

  test('inside a ProviderChain, a successful run records its tokens', async (t) => {
    const fake = makeFake(t, success('{"ok":true}', { input_tokens: 7, cached_input_tokens: 2, output_tokens: 3 }));
    const records = [];
    const chain = new ProviderChain([makeProvider(fake.bin)], { record: (name, entry) => records.push({ name, ...entry }) }, { log: silentLogger });

    const out = await chain.generate({ prompt: 'p' }, (text) => JSON.parse(text));

    assert.deepEqual(out, { provider: 'codex', value: { ok: true } });
    assert.equal(records.length, 1);
    assert.deepEqual({ ...records[0], ms: 0 }, { name: 'codex', ok: true, ms: 0, input: 7, output: 3, cached: 2 });
  });

  // -------------------------------------------------------------- robustness

  test(
    'a CLI that exits without reading a very large prompt rejects the call instead of crashing the process',
    (t) => {
      const fake = makeFake(t, { exitImmediately: true, exit: 1 });
      const script = `
        import { createCodexProvider } from ${JSON.stringify(pathToFileURL(CODEX_PROVIDER_FILE).href)};
        const provider = createCodexProvider({ bin: ${JSON.stringify(fake.bin)}, model: 'm', extraArgs: [], timeoutMs: 20000 });
        try { await provider.generate({ prompt: 'x'.repeat(2_000_000) }); } catch (err) { console.log('REJECTED ' + err.message); }
      `;
      // Run in a child process so the crash this documents cannot take the test runner down with it.
      const run = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', timeout: 30_000 });
      assert.equal(run.status, 0, `the process died: ${run.stderr.split('\n').find((l) => /EPIPE|Error/.test(l)) || run.stderr}`);
      assert.match(run.stdout, /REJECTED codex exec returned no answer/);
    }
  );

  test('a CLI that exits early while the prompt is small rejects cleanly', async (t) => {
    const fake = makeFake(t, { exitImmediately: true, exit: 1 });
    await assert.rejects(makeProvider(fake.bin).generate({ prompt: 'short prompt' }), /codex exec returned no answer: exit code 1/);
  });
});
