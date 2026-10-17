// The networks' adapters behind one interface (base.js): makeAdapter(id, opts) and the list of what each needs.
import { YouTubeAdapter } from './youtube.js';
import { TikTokAdapter } from './tiktok.js';
import { InstagramAdapter, FacebookAdapter, ThreadsAdapter } from './meta.js';
import { XAdapter } from './x.js';
import { BlueskyAdapter } from './bluesky.js';
import { TelegramAdapter } from './telegram.js';

export const ADAPTERS = Object.freeze({
  youtube: YouTubeAdapter,
  tiktok: TikTokAdapter,
  instagram: InstagramAdapter,
  facebook: FacebookAdapter,
  x: XAdapter,
  threads: ThreadsAdapter,
  bluesky: BlueskyAdapter,
  telegram: TelegramAdapter,
});

export function makeAdapter(id, opts = {}) {
  const A = ADAPTERS[id];
  if (!A) throw new Error(`no adapter for ${id}`);
  return new A(opts);
}

/** Each network's credentials, configured or not (names only: values are never read out). */
export function credentialStatus(env = process.env) {
  return Object.fromEntries(Object.entries(ADAPTERS).map(([id, A]) => [id, { label: A.label, needs: A.env, missing: A.env.filter((k) => !String(env[k] || '').trim()) }]));
}

export { YouTubeAdapter, TikTokAdapter, InstagramAdapter, FacebookAdapter, ThreadsAdapter, XAdapter, BlueskyAdapter, TelegramAdapter };
