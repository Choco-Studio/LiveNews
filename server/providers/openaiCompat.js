/**
 * Chat Completions client for any OpenAI-compatible API (OpenAI, DeepSeek...).
 */
export function createOpenAICompatProvider(name, cfg, fetchImpl = fetch) {
  return {
    name,
    available: () => !!cfg.apiKey,
    async generate({ prompt }) {
      const res = await fetchImpl(`${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify({
          model: cfg.model,
          messages: [
            { role: 'system', content: 'You write scripts for a TV news channel. Always reply with a single valid JSON object.' },
            { role: 'user', content: prompt },
          ],
          response_format: { type: 'json_object' },
        }),
        signal: AbortSignal.timeout(120000),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        const err = new Error(`${name} HTTP ${res.status}: ${body.slice(0, 200)}`);
        err.status = res.status;
        throw err;
      }
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content || '';
      const u = data.usage || {};
      return {
        text,
        usage: {
          input: u.prompt_tokens || 0,
          output: u.completion_tokens || 0,
          cached: u.prompt_tokens_details?.cached_tokens || u.prompt_cache_hit_tokens || 0,
        },
      };
    },
  };
}
