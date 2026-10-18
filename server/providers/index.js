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
  // dailyTokens: a paid provider's tokens a day (in + out, the usage tracker's count; 0: no limit). Spent, it rests
  // until the next day and the chain goes on without it (the offline mock's episodes are never published)
  constructor(providers, usage, { log = console, now = () => Date.now(), dailyTokens = 0 } = {}) {
    this.providers = providers;
    this.usage = usage;
    this.dailyTokens = dailyTokens;
    this.overBudget = new Set();
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
      if (this.spent(p)) {
        errors.push(`${p.name}: the daily limit of ${this.dailyTokens} tokens is spent`);
        continue;
      }
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

  /** Whether a paid provider has used its tokens for today (said once a day in the log). */
  spent(p) {
    if (!(this.dailyTokens > 0) || p.reviews === false || p.name === 'inbox' || typeof this.usage?.tokensToday !== 'function') return false;
    const day = new Date(this.now()).toISOString().slice(0, 10);
    const over = this.usage.tokensToday(p.name) >= this.dailyTokens;
    const key = `${p.name} ${day}`;
    if (over && !this.overBudget.has(key)) {
      this.overBudget.add(key);
      this.log.warn?.(`[ai] ${p.name}: today's limit of ${this.dailyTokens} tokens is spent (AI_DAILY_TOKENS); it rests until tomorrow`);
    }
    return over;
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
