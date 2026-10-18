import { createAnthropicProvider } from './anthropic.js';
import { createCodexProvider } from './codexExec.js';
import { createOpenAICompatProvider } from './openaiCompat.js';
import { createMockProvider } from './mock.js';
import { createInboxProvider } from './inbox.js';

export function createProviders(config) {
  const factories = {
    anthropic: () => createAnthropicProvider(config.anthropic),
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
  constructor(providers, usage, { log = console, now = () => Date.now() } = {}) {
    this.providers = providers;
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
      // A provider that cannot check facts (the offline mock) never stands in for the editor, nor rewrites a story in
      // its own words (it copies: server/ownwords.js)
      if ((request.stage === 'review' || request.stage === 'rewrite') && p.reviews === false) {
        nonReviewers++;
        continue;
      }
      if ((this.cooldownUntil.get(p.name) || 0) > this.now()) continue;
      const started = this.now();
      let result = null;
      try {
        result = await p.generate(request);
        const value = validate(result.text);
        this.usage.record(p.name, { ok: true, ms: this.now() - started, ...result.usage });
        this.failures.set(p.name, 0);
        return { provider: p.name, value };
      } catch (err) {
        // what the failed call still cost (a reply that was not valid JSON, one the model declined or cut short)
        const spent = result?.usage || err.usage || {};
        this.usage.record(p.name, { ok: false, ms: this.now() - started, error: err.message, ...spent });
        errors.push(`${p.name}: ${err.message}`);
        // The fault is this one request's (the model declined it, or its reply ran out of room): the provider is
        // fine, so no pause and no failure counted against it; the next provider tries this request.
        if (err.requestOnly) {
          this.log.warn?.(`[ai] ${p.name} could not write this one (${err.message})`);
          continue;
        }
        const n = (this.failures.get(p.name) || 0) + 1;
        this.failures.set(p.name, n);
        // Rate limits / quota: long pause. Other errors: short, growing pause.
        const quota = err.status === 429 || /quota|rate.?limit|usage limit|too many requests|\b429\b/i.test(err.message);
        const pauseMs = quota ? 30 * 60_000 : Math.min(15 * 60_000, 30_000 * 2 ** (n - 1));
        this.cooldownUntil.set(p.name, this.now() + pauseMs);
        this.log.warn?.(`[ai] ${p.name} failed (${err.message}); pausing it for ${Math.round(pauseMs / 1000)} s`);
      }
    }
    if (!errors.length && nonReviewers && !this.providers.some((p) => p.reviews !== false && p.available())) {
      if (request.stage === 'rewrite') throw Object.assign(new Error('no AI writer configured to rewrite (the offline mock copies its sources)'), { code: 'NO_REWRITER' });
      throw Object.assign(new Error('no AI editor configured (the offline mock writes but cannot review)'), { code: 'NO_REVIEWER' });
    }
    throw new Error(`no AI provider available (${errors.join(' | ') || 'all paused'})`);
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
