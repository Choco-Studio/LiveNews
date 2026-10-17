// The networks the publishing desk knows, as their own documentation describes them (read live on 17 Oct 2026; the
// sources and the account each needs are in docs/publishing/platforms.md). Everything the queue, the scheduler, the
// text writer and the adapters need to respect a network lives here: lengths, aspect, text limits, link rules, the AI
// label field, the daily caps, the spacing between posts and the hours a post may go out (the audience's time zone).
//
//   PLATFORMS[id]  { id, name, kind, formats, video: { min, max, ideal }, text: { max, unit }, links, caps, spacing, hours, aiLabel }
//   fitsPlatform(clip, id) -> { ok, why }
//   lengthFor(id, duration) -> 'ok' | 'short' | 'long'

const H = 3600_000;

export const PLATFORMS = Object.freeze({
  youtube: Object.freeze({
    id: 'youtube',
    name: 'YouTube',
    kind: 'video',
    // a vertical or square upload up to 3 minutes is a Short (support.google.com/youtube/answer/15424877, from 15 Oct 2024)
    formats: ['vertical', 'horizontal'],
    video: { min: 10, max: 180, ideal: [25, 59], shortsMax: 180 },
    text: { title: 100, description: 5000, descriptionUnit: 'bytes', tags: 500 },
    links: 'description',
    // videos.insert: its own bucket of 100 calls a day; videos.update 50 units, thumbnails.set 50, captions.insert 400,
    // liveBroadcasts.update 1, of the 10,000-unit daily pool (developers.google.com/youtube/v3/determine_quota_cost)
    caps: { uploadsPerDay: 100, unitsPerDay: 10_000, cost: { update: 50, thumbnail: 50, caption: 400, liveUpdate: 1 } },
    spacing: 2 * H,
    hours: [8, 22],
    aiLabel: 'status.containsSyntheticMedia',
    clip: 'shorts',
  }),
  tiktok: Object.freeze({
    id: 'tiktok',
    name: 'TikTok',
    kind: 'video',
    formats: ['vertical'],
    // the Creator Rewards Program pays for videos over one minute: a TikTok cut is made 61-180 s where the material allows
    video: { min: 10, max: 600, ideal: [61, 150] },
    text: { title: 2200, titleUnit: 'utf16' },
    links: 'none', // a caption's URL is not a link: the profile carries it
    // 6 requests a minute per user token; about 15 Direct Posts a day per creator, shared by every app; unaudited clients
    // post SELF_ONLY to a private account; the inbox (draft) route: at most 5 pending a day (developers.tiktok.com)
    caps: { postsPerDay: 15, requestsPerMinute: 6, inboxPendingPerDay: 5 },
    spacing: 3 * H,
    hours: [9, 22],
    aiLabel: 'post_info.is_aigc',
    clip: 'tiktok',
  }),
  instagram: Object.freeze({
    id: 'instagram',
    name: 'Instagram Reels',
    kind: 'video',
    formats: ['vertical'],
    video: { min: 5, max: 90, ideal: [20, 60] },
    text: { caption: 2200, hashtags: 30 },
    links: 'none',
    // 100 API-published posts in a 24-hour moving window (carousels: 50); video_url must be public when asked
    caps: { postsPerDay: 100 },
    spacing: 4 * H,
    hours: [9, 21],
    aiLabel: 'is_ai_generated',
    clip: 'reels',
  }),
  facebook: Object.freeze({
    id: 'facebook',
    name: 'Facebook Page',
    kind: 'video',
    formats: ['vertical', 'horizontal'],
    // Reels: 3-90 s, 9:16; 30 API-published Reels per Page in 24 h (developers.facebook.com/docs/video-api/guides/reels-publishing)
    video: { min: 3, max: 90, ideal: [20, 60] },
    text: { message: 63206 },
    links: 'inline',
    caps: { reelsPerDay: 30 },
    spacing: 4 * H,
    hours: [8, 22],
    aiLabel: null, // no API field: the description carries the disclosure
    clip: 'reels',
  }),
  x: Object.freeze({
    id: 'x',
    name: 'X',
    kind: 'text',
    formats: ['horizontal', 'vertical'],
    video: { min: 3, max: 140, ideal: [20, 60] },
    text: { post: 280, urlWeight: 23 },
    links: 'inline',
    // pay per use (docs.x.com pricing): a post $0.015, a post WITH a URL $0.20 — links are budgeted
    caps: { postsPerDay: 8, costPerPost: 0.015, costPerPostWithUrl: 0.2 },
    spacing: 1.5 * H,
    hours: [7, 23],
    aiLabel: null,
  }),
  threads: Object.freeze({
    id: 'threads',
    name: 'Threads',
    kind: 'text',
    formats: ['vertical'],
    video: { min: 3, max: 300, ideal: [20, 60] },
    text: { post: 500, unit: 'utf8-emoji' },
    links: 'attachment', // link_attachment on TEXT posts; at most 5 unique links a post
    caps: { postsPerDay: 250 },
    spacing: 1.5 * H,
    hours: [7, 23],
    aiLabel: null,
  }),
  bluesky: Object.freeze({
    id: 'bluesky',
    name: 'Bluesky',
    kind: 'text',
    formats: ['horizontal'],
    video: { min: 3, max: 180, ideal: [20, 60] },
    text: { post: 300, unit: 'graphemes', bytes: 3000 },
    links: 'facet', // a link is a facet over its UTF-8 byte range, plus an external embed (card)
    caps: { postsPerDay: 50 },
    spacing: 1.5 * H,
    hours: [7, 23],
    aiLabel: null,
  }),
  telegram: Object.freeze({
    id: 'telegram',
    name: 'Telegram channel',
    kind: 'text',
    formats: ['horizontal', 'vertical'],
    video: { min: 1, max: 600, ideal: [20, 120], maxBytes: 50 * 1024 * 1024 },
    text: { message: 4096, caption: 1024 },
    links: 'inline',
    caps: { postsPerDay: 40 },
    spacing: 1 * H,
    hours: [7, 23],
    aiLabel: null,
  }),
});

/** Phase 1's networks (docs/publishing/plan.md): YouTube (live and Shorts), TikTok, Instagram Reels. */
export const PHASE_PLATFORMS = Object.freeze({
  1: ['youtube', 'tiktok', 'instagram'],
  2: ['youtube', 'tiktok', 'instagram', 'facebook', 'x'],
  3: ['youtube', 'tiktok', 'instagram', 'facebook', 'x', 'threads', 'bluesky', 'telegram'],
});

/** Daily targets per network and phase (plan.md §3): clips a day, text posts a day. */
export const DAILY = Object.freeze({
  1: { youtube: { clips: [3, 5] }, tiktok: { clips: [3, 5] }, instagram: { clips: [2, 3] } },
  2: { youtube: { clips: [3, 5], uploads: [1, 2] }, tiktok: { clips: [3, 5] }, instagram: { clips: [2, 3] }, facebook: { clips: [1, 2], posts: [2, 4] }, x: { posts: [3, 6] } },
  3: { youtube: { clips: [4, 6], uploads: [1, 3] }, tiktok: { clips: [4, 6] }, instagram: { clips: [3, 4] }, facebook: { clips: [2, 3], posts: [3, 5] }, x: { posts: [4, 8] }, threads: { posts: [4, 8] }, bluesky: { posts: [4, 8] }, telegram: { posts: [6, 12] } },
});

/** Is a clip of `duration` seconds within, under or over a network's video lengths? */
export function lengthFor(id, duration) {
  const p = PLATFORMS[id];
  if (!p) return 'long';
  if (duration < p.video.min) return 'short';
  if (duration > p.video.max) return 'long';
  return 'ok';
}

/** May this clip go to this network: { ok, why }. */
export function fitsPlatform(clip, id) {
  const p = PLATFORMS[id];
  if (!p) return { ok: false, why: 'unknown network' };
  if (!p.formats.includes(clip.format)) return { ok: false, why: `${p.name} takes ${p.formats.join(' or ')}` };
  const l = lengthFor(id, clip.duration);
  if (l !== 'ok') return { ok: false, why: `${clip.duration.toFixed(0)} s is ${l === 'short' ? 'under' : 'over'} ${p.name}'s ${p.video.min}-${p.video.max} s` };
  return { ok: true, why: null };
}

/** UTF-16 length (TikTok counts runes), Unicode graphemes (Bluesky), X's weighted length (a URL counts 23). */
export const utf16Length = (s) => String(s ?? '').length;
export function graphemes(s) {
  const str = String(s ?? '');
  if (typeof Intl !== 'undefined' && Intl.Segmenter) return [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(str)].length;
  return [...str].length;
}
export function xLength(s) {
  const str = String(s ?? '');
  const urls = str.match(/https?:\/\/\S+/g) || [];
  let n = graphemes(str.replace(/https?:\/\/\S+/g, ''));
  n += urls.length * PLATFORMS.x.text.urlWeight;
  return n;
}
export const byteLength = (s) => Buffer.byteLength(String(s ?? ''), 'utf8');
