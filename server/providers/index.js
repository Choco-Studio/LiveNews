import fs from 'node:fs';
import path from 'node:path';
import { createCodexProvider } from './codexExec.js';
import { createOpenAICompatProvider } from './openaiCompat.js';
import { createMockProvider } from './mock.js';
import { createInboxProvider } from './inbox.js';

export function createProviders(config) {
  const factories = {
    codex: () => createCodexProvider(config.codex),
    openai: () => createOpenAICompatProvider('openai', config.openai),
    deepseek: () => createOpenAICompatProvider('deepseek', config.deepseek),
    inbox: () => createInboxProvider(config.inbox),
    mock: () => createMockProvider(),
  };
  return config.providers.filter((n) => factories[n]).map((n) => factories[n]());
}

/**
 * Tries providers in order. A provider that fails is put on cooldown so we
 * do not hammer an exhausted quota; the next one in the chain takes over.
 */
export class ProviderChain {
  constructor(providers, usage, { log = console, now = () => Date.now(), failDir = path.join(process.cwd(), 'data', 'ai-failures') } = {}) {
    this.providers = providers;
    this.failDir = failDir;
    this.usage = usage;
    this.log = log;
    this.now = now;
    this.cooldownUntil = new Map();
    this.failures = new Map();
  }

  async generate(request, validate) {
    const errors = [];
    let nonReviewers = 0;
    for (const p of this.providers) {
      if (!p.available()) continue;
      // A provider that cannot check facts (the offline mock) never stands in for the editor.
      if (request.stage === 'review' && p.reviews === false) {
        nonReviewers++;
        continue;
      }
      if ((this.cooldownUntil.get(p.name) || 0) > this.now()) continue;
      const started = this.now();
      try {
        let result = await p.generate(request);
        let value;
        try {
          value = validate(result.text);
        } catch (err) {
          // A reply that does not parse (a stray quote or comma in a long JSON) is a one-off, not an outage: keep the
          // raw reply for diagnosis and ask the same provider once more before pausing it and falling back.
          if (!(err instanceof SyntaxError) && !/JSON/i.test(err.message)) throw err;
          this.keepFailure(p.name, request, result.text, err);
          this.log.warn?.(`[ai] ${p.name} sent a reply that does not parse (${err.message}); asking again`);
          result = await p.generate(request);
          value = validate(result.text);
        }
        this.usage.record(p.name, { ok: true, ms: this.now() - started, ...result.usage });
        this.failures.set(p.name, 0);
        return { provider: p.name, value };
      } catch (err) {
        const n = (this.failures.get(p.name) || 0) + 1;
        this.failures.set(p.name, n);
        // Rate limits / quota: long pause. Other errors: short, growing pause.
        const quota = err.status === 429 || /quota|rate.?limit|usage limit|too many requests|\b429\b/i.test(err.message);
        const pauseMs = quota ? 30 * 60_000 : Math.min(15 * 60_000, 30_000 * 2 ** (n - 1));
        this.cooldownUntil.set(p.name, this.now() + pauseMs);
        this.usage.record(p.name, { ok: false, ms: this.now() - started, error: err.message });
        this.log.warn?.(`[ai] ${p.name} failed (${err.message}); pausing it for ${Math.round(pauseMs / 1000)} s`);
        errors.push(`${p.name}: ${err.message}`);
      }
    }
    if (!errors.length && nonReviewers && !this.providers.some((p) => p.reviews !== false && p.available())) {
      throw Object.assign(new Error('no AI editor configured (the offline mock writes but cannot review)'), { code: 'NO_REVIEWER' });
    }
    throw new Error(`no AI provider available (${errors.join(' | ') || 'all paused'})`);
  }

  /** Save a reply that failed to parse (data/ai-failures), so a bad answer can be read after the fact. */
  keepFailure(name, request, text, err) {
    try {
      const dir = this.failDir;
      if (!dir) return;
      fs.mkdirSync(dir, { recursive: true });
      const stamp = new Date(this.now()).toISOString().replace(/[:.]/g, '-');
      fs.writeFileSync(path.join(dir, `${stamp}-${name}-${request.stage || 'write'}.txt`), `${err.message}\n\n${text}`);
    } catch {
      // diagnosis only: never let it break the chain
    }
  }

  status() {
    return this.providers.map((p) => ({
      name: p.name,
      configured: p.available(),
      cooldownUntil: this.cooldownUntil.get(p.name) || null,
      failures: this.failures.get(p.name) || 0,
    }));
  }
}
