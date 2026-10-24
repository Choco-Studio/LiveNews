/**
 * Claude (the Anthropic API) through the official SDK.
 *
 *   ANTHROPIC_API_KEY   the key (kept on the server: /etc/globit24.env, never in the repository)
 *   ANTHROPIC_MODEL     the model id (no default here: the owner sets it with the key)
 *   ANTHROPIC_EFFORT    low | medium | high | xhigh | max, how much the model thinks before it writes; unset sends
 *                       none, so the model's own default applies
 *
 * The reply is streamed and read whole at the end (a long script with thinking can outlast a plain request's
 * time limit), and the request as a whole is cut at ANTHROPIC_TIMEOUT_MS. The SDK retries a rate limit, an overload
 * or a dropped connection on its own (ANTHROPIC_MAX_RETRIES); what still fails carries its HTTP status, so a 429
 * puts the provider on the chain's long pause.
 *
 * No prompt caching: every prompt opens with the hour it is written (server/writer.js buildPrompt), so no two
 * prompts share a prefix worth caching.
 *
 * A reply the model declines (stop_reason "refusal") or cuts at max_tokens is a fault of that one request, not of
 * the provider: the error says so (requestOnly) and the chain does not pause the provider for the next story.
 */
import Anthropic from '@anthropic-ai/sdk';

export const SYSTEM = 'You write scripts for a TV news channel. Always reply with a single valid JSON object and nothing else.';
export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];

const usageOf = (u = {}, model) => ({
  // the whole prompt, whether it was read from the cache, written to it, or neither
  input: (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0),
  output: u.output_tokens || 0,
  cached: u.cache_read_input_tokens || 0,
  // what the bill needs besides (tools/publish/budget-guard.mjs): the model and the cache writes
  cacheWrite: u.cache_creation_input_tokens || 0,
  model,
});

export function createAnthropicProvider(cfg, { client = null } = {}) {
  let sdk = client;
  const getClient = () => (sdk ||= new Anthropic({ apiKey: cfg.apiKey, maxRetries: cfg.maxRetries }));
  return {
    name: 'anthropic',
    available: () => !!(cfg.apiKey && cfg.model),
    async generate({ prompt }) {
      const body = {
        model: cfg.model,
        max_tokens: cfg.maxTokens,
        system: SYSTEM,
        messages: [{ role: 'user', content: prompt }],
        ...(cfg.effort ? { output_config: { effort: cfg.effort } } : {}),
      };
      let message;
      try {
        message = await getClient().messages.stream(body, { signal: AbortSignal.timeout(cfg.timeoutMs) }).finalMessage();
      } catch (err) {
        const status = typeof err?.status === 'number' ? err.status : undefined;
        const why = err?.name === 'TimeoutError' || err instanceof Anthropic.APIUserAbortError ? `no reply within ${Math.round(cfg.timeoutMs / 1000)} s` : err?.message || String(err);
        throw Object.assign(new Error(`anthropic${status ? ` HTTP ${status}` : ''}: ${why}`.slice(0, 300)), status ? { status } : {});
      }
      const usage = usageOf(message.usage, message.model || cfg.model);
      if (message.stop_reason === 'refusal') {
        const category = message.stop_details?.category;
        throw Object.assign(new Error(`anthropic declined the request${category ? ` (${category})` : ''}`), { code: 'REFUSAL', requestOnly: true, usage });
      }
      if (message.stop_reason === 'max_tokens') {
        throw Object.assign(new Error(`anthropic reply cut at max_tokens (${cfg.maxTokens}); raise ANTHROPIC_MAX_TOKENS or lower ANTHROPIC_EFFORT`), { code: 'MAX_TOKENS', requestOnly: true, usage });
      }
      // a reply can open with thinking blocks: the answer is the text blocks, read by type
      const text = (message.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
      return { text, usage };
    },
  };
}
