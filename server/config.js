import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Minimal .env loader: real environment variables take precedence.
function loadDotEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    const value = m[2].replace(/^(['"])(.*)\1$/, '$2');
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}
loadDotEnv();

const env = (key, fallback) => {
  const v = process.env[key];
  return v === undefined || v === '' ? fallback : v;
};
const num = (key, fallback) => {
  const n = Number(env(key, fallback));
  return Number.isFinite(n) ? n : fallback;
};

export const config = {
  host: env('HOST', '127.0.0.1'),
  port: num('PORT', 8080),
  providers: env('PROVIDERS', 'codex,openai,deepseek,mock')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
  codex: {
    bin: env('CODEX_BIN', 'codex'),
    model: env('CODEX_MODEL', 'gpt-6-luna'),
    extraArgs: env('CODEX_EXTRA_ARGS', '').split(/\s+/).filter(Boolean),
    timeoutMs: num('CODEX_TIMEOUT_MS', 240000),
  },
  openai: {
    apiKey: env('OPENAI_API_KEY', ''),
    model: env('OPENAI_MODEL', 'gpt-6-luna'),
    baseUrl: env('OPENAI_BASE_URL', 'https://api.openai.com/v1'),
  },
  deepseek: {
    apiKey: env('DEEPSEEK_API_KEY', ''),
    model: env('DEEPSEEK_MODEL', 'deepseek-chat'),
    baseUrl: env('DEEPSEEK_BASE_URL', 'https://api.deepseek.com/v1'),
  },
  // "inbox" provider: an external agent (or a person) answers the AI prompts through files in this folder
  inbox: {
    dir: path.resolve(ROOT, env('AI_INBOX_DIR', path.join('data', 'ai-inbox'))),
    timeoutMs: num('AI_INBOX_TIMEOUT_MS', 1800000),
  },
  // Episodes produced ahead of air
  queueSize: num('QUEUE_SIZE', 2),
  // Stories offered to the writer, who picks the best for each programme
  candidatePool: num('CANDIDATE_POOL', 12),
  // Second AI pass: a standards editor checks each script against its sources
  reviewPass: !/^(0|false|no|off)$/i.test(env('REVIEW_PASS', '1')),
  minNewStories: num('MIN_NEW_STORIES', 3),
  maxStoryAgeHours: num('MAX_STORY_AGE_HOURS', 36),
  feedRefreshMinutes: num('FEED_REFRESH_MINUTES', 10),
  // News sources; FEEDS_FILE points elsewhere (e.g. config/feeds.fixture.json for offline demos)
  feedsFile: path.resolve(ROOT, env('FEEDS_FILE', path.join('config', 'feeds.json'))),
  dataDir: path.join(ROOT, 'data'),
  // Presenter voices: 'kokoro' synthesises every segment ahead of air with local neural voices
  // (tools/voice, server/voice; .env.example turns it on); 'browser' (the default, or Kokoro missing)
  // leaves it to the viewer's speechSynthesis. Off by default so a bare checkout never loads a model.
  voice: {
    engine: env('VOICE_ENGINE', 'browser').trim().toLowerCase() === 'kokoro' ? 'kokoro' : 'browser',
    // Where kokoro-v1.0.onnx and voices-v1.0.bin live (empty: data/models, then ~/.cache/kokoro)
    kokoroDir: env('KOKORO_DIR', ''),
    // CPU threads for the voice model (0 = all), so OBS and the browser keep theirs
    threads: num('KOKORO_THREADS', 0),
    python: env('VOICE_PYTHON', 'python3'),
    // Seconds an episode waits for its voices before it is queued anyway (late clips still air when ready)
    budgetSeconds: num('VOICE_BUDGET_S', 90),
    cacheMb: num('VOICE_CACHE_MB', 300),
    dir: path.join(ROOT, 'data', 'voice'),
  },
};
