import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { ProviderChain, createProviders } from '../server/providers/index.js';
import { SYSTEM, createAnthropicProvider } from '../server/providers/anthropic.js';

const CFG = { apiKey: 'k', model: 'the-model', effort: null, maxTokens: 32000, timeoutMs: 5000, maxRetries: 0 };

const message = (over = {}) => ({
  id: 'msg_1',
  type: 'message',
  role: 'assistant',
  model: 'the-model',
  content: [{ type: 'text', text: '{"ok":true}' }],
  stop_reason: 'end_turn',
  usage: { input_tokens: 120, output_tokens: 45 },
  ...over,
});

/** A stand-in for the SDK client: records each streamed request and answers with `respond()`. */
function fakeClient(respond = () => message()) {
  const calls = [];
  return {
    calls,
    messages: {
      stream(body, options) {
        calls.push({ body, options });
        return { finalMessage: async () => respond(body) };
      },
    },
  };
}

const silent = { info() {}, warn() {}, error() {} };
const usageStub = () => ({ records: [], record(name, entry) { this.records.push({ name, ...entry }); } });

describe('Claude provider', () => {
  test('available only with both a key and a model', () => {
    assert.equal(createAnthropicProvider(CFG).available(), true);
    assert.equal(createAnthropicProvider({ ...CFG, apiKey: '' }).available(), false);
    assert.equal(createAnthropicProvider({ ...CFG, model: '' }).available(), false);
    assert.equal(createAnthropicProvider(CFG).name, 'anthropic');
  });

  test('streams one request: the model, room for the reply, the JSON system line, the prompt as the one user turn, a time limit', async () => {
    const client = fakeClient();
    await createAnthropicProvider(CFG, { client }).generate({ prompt: 'write the bulletin', stage: 'write' });
    assert.equal(client.calls.length, 1);
    const { body, options } = client.calls[0];
    assert.deepEqual(body, { model: 'the-model', max_tokens: 32000, system: SYSTEM, messages: [{ role: 'user', content: 'write the bulletin' }] });
    assert.match(SYSTEM, /single valid JSON object/);
    assert.ok(options.signal instanceof AbortSignal, 'the whole request has a time limit');
  });

  test('no sampling settings, no prefill, no thinking budget (the current models refuse them); effort only when set', async () => {
    const plain = fakeClient();
    await createAnthropicProvider(CFG, { client: plain }).generate({ prompt: 'p' });
    for (const key of ['temperature', 'top_p', 'top_k', 'thinking', 'output_config']) assert.ok(!(key in plain.calls[0].body), key);
    assert.equal(plain.calls[0].body.messages.at(-1).role, 'user');

    const low = fakeClient();
    await createAnthropicProvider({ ...CFG, effort: 'low' }, { client: low }).generate({ prompt: 'p' });
    assert.deepEqual(low.calls[0].body.output_config, { effort: 'low' });
  });

  test('the answer is the text blocks, read by type: thinking blocks before it are left out', async () => {
    const client = fakeClient(() => message({ content: [{ type: 'thinking', thinking: '', signature: 'sig' }, { type: 'text', text: '{"title":' }, { type: 'text', text: '"T"}' }] }));
    const { text } = await createAnthropicProvider(CFG, { client }).generate({ prompt: 'p' });
    assert.equal(text, '{"title":"T"}');
  });

  test('usage: the whole prompt as input (cache reads and writes included), the output, and what came from the cache', async () => {
    const client = fakeClient(() => message({ usage: { input_tokens: 100, cache_creation_input_tokens: 20, cache_read_input_tokens: 30, output_tokens: 45 } }));
    const { usage } = await createAnthropicProvider(CFG, { client }).generate({ prompt: 'p' });
    assert.deepEqual(usage, { input: 150, output: 45, cached: 30 });
    const bare = await createAnthropicProvider(CFG, { client: fakeClient(() => message({ usage: undefined, content: [] })) }).generate({ prompt: 'p' });
    assert.deepEqual(bare, { text: '', usage: { input: 0, output: 0, cached: 0 } });
  });

  test('a declined request is that request\'s fault: an error with its category and its cost, marked requestOnly', async () => {
    const client = fakeClient(() => message({ stop_reason: 'refusal', stop_details: { category: 'general_harms' }, content: [] }));
    await assert.rejects(createAnthropicProvider(CFG, { client }).generate({ prompt: 'p' }), (err) => {
      assert.equal(err.code, 'REFUSAL');
      assert.equal(err.requestOnly, true);
      assert.match(err.message, /declined.*general_harms/);
      assert.deepEqual(err.usage, { input: 120, output: 45, cached: 0 });
      return true;
    });
  });

  test('a reply cut at max_tokens is never taken as a script: an error naming the knobs, marked requestOnly', async () => {
    const client = fakeClient(() => message({ stop_reason: 'max_tokens', content: [{ type: 'text', text: '{"title":"cut' }] }));
    await assert.rejects(createAnthropicProvider(CFG, { client }).generate({ prompt: 'p' }), (err) => {
      assert.equal(err.code, 'MAX_TOKENS');
      assert.equal(err.requestOnly, true);
      assert.match(err.message, /ANTHROPIC_MAX_TOKENS/);
      return true;
    });
  });

  test('an API error keeps its HTTP status (a 429 is a rate limit for the chain)', async () => {
    const client = fakeClient(() => {
      throw Object.assign(new Error('429 rate_limit_error'), { status: 429 });
    });
    await assert.rejects(createAnthropicProvider(CFG, { client }).generate({ prompt: 'p' }), (err) => {
      assert.equal(err.status, 429);
      assert.match(err.message, /^anthropic HTTP 429/);
      assert.ok(!err.requestOnly);
      return true;
    });
  });
});

// The real SDK against a local stand-in for the API: the request it sends and the streamed reply it reads.
describe('Claude provider with the real SDK', () => {
  function serve(handler) {
    return new Promise((resolve) => {
      const seen = [];
      const server = http.createServer((req, res) => {
        let raw = '';
        req.on('data', (c) => (raw += c));
        req.on('end', () => {
          seen.push({ url: req.url, headers: req.headers, body: raw ? JSON.parse(raw) : null });
          handler(req, res);
        });
      });
      server.listen(0, '127.0.0.1', () => resolve({ server, seen, url: `http://127.0.0.1:${server.address().port}` }));
    });
  }

  const sse = (res, events) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    for (const e of events) res.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
    res.end();
  };

  const streamed = (text, stop = 'end_turn') => [
    { type: 'message_start', message: { id: 'msg_1', type: 'message', role: 'assistant', model: 'the-model', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 80, output_tokens: 1 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'sig' } },
    { type: 'content_block_stop', index: 0 },
    { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: text.slice(0, 5) } },
    { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: text.slice(5) } },
    { type: 'content_block_stop', index: 1 },
    { type: 'message_delta', delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 33 } },
    { type: 'message_stop' },
  ];

  async function withBaseUrl(url, fn) {
    const saved = process.env.ANTHROPIC_BASE_URL;
    process.env.ANTHROPIC_BASE_URL = url;
    try {
      return await fn();
    } finally {
      if (saved === undefined) delete process.env.ANTHROPIC_BASE_URL;
      else process.env.ANTHROPIC_BASE_URL = saved;
    }
  }

  test('sends the key and the streamed request to /v1/messages and reads the text after the thinking', async () => {
    const { server, seen, url } = await serve((req, res) => sse(res, streamed('{"title":"Hello"}')));
    try {
      const out = await withBaseUrl(url, () => createAnthropicProvider({ ...CFG, effort: 'medium' }).generate({ prompt: 'write it' }));
      assert.deepEqual(out, { text: '{"title":"Hello"}', usage: { input: 80, output: 33, cached: 0 } });
      assert.equal(seen.length, 1);
      assert.equal(seen[0].url, '/v1/messages');
      assert.equal(seen[0].headers['x-api-key'], 'k');
      assert.equal(seen[0].body.stream, true);
      assert.equal(seen[0].body.model, 'the-model');
      assert.deepEqual(seen[0].body.output_config, { effort: 'medium' });
      assert.deepEqual(seen[0].body.messages, [{ role: 'user', content: 'write it' }]);
    } finally {
      server.close();
    }
  });

  test('a 429 from the API reaches the chain as a 429 (its long pause), after the SDK\'s own retries', async () => {
    const { server, seen, url } = await serve((req, res) => {
      res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '0' });
      res.end(JSON.stringify({ type: 'error', error: { type: 'rate_limit_error', message: 'Number of requests has exceeded your rate limit' } }));
    });
    try {
      await withBaseUrl(url, async () => {
        const chain = new ProviderChain([createAnthropicProvider({ ...CFG, maxRetries: 1 })], usageStub(), { log: silent, now: () => 0 });
        await assert.rejects(chain.generate({ prompt: 'p' }, JSON.parse), /anthropic HTTP 429/);
        assert.equal(chain.status()[0].cooldownUntil, 30 * 60_000);
      });
      assert.equal(seen.length, 2, 'one try and one SDK retry');
    } finally {
      server.close();
    }
  });

  test('no reply in time: the request is cut and the error says so', async () => {
    const { server, url } = await serve(() => {}); // never answers
    try {
      await withBaseUrl(url, () =>
        assert.rejects(createAnthropicProvider({ ...CFG, timeoutMs: 200 }).generate({ prompt: 'p' }), /anthropic: no reply within/)
      );
    } finally {
      server.closeAllConnections();
      server.close();
    }
  });
});

describe('Claude in the provider chain', () => {
  test('createProviders builds it from config.anthropic and it is available once the key and model are set', () => {
    const config = { providers: ['anthropic', 'mock'], anthropic: CFG };
    const [claude, mock] = createProviders(config);
    assert.equal(claude.name, 'anthropic');
    assert.equal(claude.available(), true);
    assert.equal(mock.name, 'mock');
    assert.equal(createProviders({ providers: ['anthropic'], anthropic: { ...CFG, apiKey: '' } })[0].available(), false);
  });

  test('a declined request goes to the next provider without pausing Claude, and its cost is still counted', async () => {
    let n = 0;
    const client = fakeClient(() => (++n === 1 ? message({ stop_reason: 'refusal', content: [] }) : message()));
    const claude = createAnthropicProvider(CFG, { client });
    const backup = { name: 'backup', available: () => true, generate: async () => ({ text: '{"from":"backup"}', usage: {} }) };
    const usage = usageStub();
    const chain = new ProviderChain([claude, backup], usage, { log: silent, now: () => 1000 });

    assert.equal((await chain.generate({ prompt: 'p' }, JSON.parse)).provider, 'backup');
    assert.equal(chain.status()[0].cooldownUntil, null, 'no pause for the next story');
    assert.equal(chain.status()[0].failures, 0);
    assert.deepEqual(usage.records[0], { name: 'anthropic', ok: false, ms: 0, error: 'anthropic declined the request', input: 120, output: 45, cached: 0 });

    assert.equal((await chain.generate({ prompt: 'q' }, JSON.parse)).provider, 'anthropic', 'the next story goes to Claude again');
  });

  test('a reply that is not valid JSON pauses Claude as before, and what it cost is counted', async () => {
    const claude = createAnthropicProvider(CFG, { client: fakeClient(() => message({ content: [{ type: 'text', text: 'not json' }] })) });
    const usage = usageStub();
    const chain = new ProviderChain([claude], usage, { log: silent, now: () => 0 });
    await assert.rejects(chain.generate({ prompt: 'p' }, JSON.parse));
    assert.ok(chain.status()[0].cooldownUntil > 0);
    assert.equal(usage.records[0].input, 120);
    assert.equal(usage.records[0].output, 45);
  });
});
