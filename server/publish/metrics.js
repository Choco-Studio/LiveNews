// The published clips' numbers (docs/publishing/shorts-v2.md B2 and §4): what each network says of every clip the
// ledger says went out, joined to what the clip was (its programme, its kind, its experiment arm) and summed by kind and
// by arm, so that a change is kept or dropped on numbers. Read only: nothing here changes a post. A network that will
// not answer (no credentials, a scope the owner has not granted) is a note in the report, never an error.
//
//   publishedRows({ ledger, items })                  the ledger's real clips joined to their queue items -> [row]
//   youtubeIdOf(url) / tiktokIdOf(url) / instagramCodeOf(url)
//   googleToken(env, fetch) / tiktokToken(env, fetch) an access token from the refresh token the uploads use
//   youtubeVideos(ids, { token, fetch })              views, likes, comments (the Data API: the uploads' own scope)
//   youtubeUploads({ token, fetch, pages })           the channel's uploads (a clip published by hand, by its title)
//   youtubeAnalytics(ids, { token, fetch, start, end })  average viewed, its minutes, shares (yt-analytics.readonly)
//   instagramMedia({ token, fetch, base }) / instagramInsights(id, { token, fetch, base })   (instagram_business_manage_insights)
//   tiktokVideos(ids, { token, fetch })               views, likes, comments, shares (the scope video.list)
//   matchByTitle(rows, uploads)                       a hand-published clip found by its title among the uploads
//   summarize(rows)                                   by network, kind and arm: n and medians; each experiment's verdict
import { EXPERIMENTS } from './experiments.js';

const YT = 'https://www.googleapis.com/youtube/v3';
const YTA = 'https://youtubeanalytics.googleapis.com/v2/reports';
const GTOKEN = 'https://oauth2.googleapis.com/token';
const TT = 'https://open.tiktokapis.com/v2';

// ------------------------------------------------------------------ what went out

/** A YouTube video's id from its address (youtu.be/ID, /shorts/ID, watch?v=ID), or null. */
export function youtubeIdOf(url) {
  const m = /(?:youtu\.be\/|\/shorts\/|[?&]v=|\/live\/)([A-Za-z0-9_-]{11})/.exec(String(url || ''));
  return m ? m[1] : null;
}
/** A TikTok video's id from its address (/video/ID), or null. */
export const tiktokIdOf = (url) => /\/video\/(\d{8,})/.exec(String(url || ''))?.[1] || null;
/** An Instagram post's short code from its address (/reel/CODE, /p/CODE), or null. */
export const instagramCodeOf = (url) => /instagram\.com\/(?:[^/]+\/)?(?:reels?|p)\/([A-Za-z0-9_-]+)/.exec(String(url || ''))?.[1] || null;

/**
 * The real clips of the ledger (not a dry run), one row each, joined to their queue items: { platform, itemId,
 * momentId, kind (the moment's: quiz-question, story…), programId, at, duration, title, titles, remoteId, url,
 * experiment, arm }. A clip published by hand without its address has no id: it may be found by its title.
 */
export function publishedRows({ ledger = [], items = new Map() } = {}) {
  const rows = [];
  for (const e of ledger) {
    if (!e || e.dryRun || e.kind !== 'clip') continue;
    const item = items.get?.(e.id) || {};
    const momentId = e.momentId || item.source?.momentId || null;
    rows.push({
      platform: e.platform,
      itemId: e.id,
      momentId,
      kind: String(momentId || '').split(':')[1] || null,
      programId: item.source?.programId || null,
      at: e.at || null,
      duration: Number(item.media?.duration) || null,
      title: item.title || null,
      titles: [...new Set([item.title, ...(item.package?.titles || [])].filter(Boolean))],
      remoteId: e.remoteId || null,
      url: e.url || null,
      experiment: item.experiment?.id || e.experiment?.id || null,
      arm: item.experiment?.arm || e.experiment?.arm || null,
    });
  }
  return rows;
}

const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

/** Each YouTube row without an id given one by its title among the channel's uploads (the title the owner pasted). */
export function matchByTitle(rows, uploads = []) {
  const byTitle = new Map();
  for (const u of uploads) if (!byTitle.has(norm(u.title))) byTitle.set(norm(u.title), u);
  for (const r of rows) {
    if (r.platform !== 'youtube' || r.videoId) continue;
    const hit = r.titles.map((t) => byTitle.get(norm(t))).find(Boolean);
    if (hit) {
      r.videoId = hit.id;
      r.matched = 'title';
    }
  }
  return rows;
}

// ------------------------------------------------------------------ the networks

async function getJson(fetchImpl, url, opts = {}) {
  let res;
  try {
    res = await fetchImpl(url, opts);
  } catch (err) {
    return { ok: false, status: 0, error: `network: ${err?.message || err}` };
  }
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { ok: res.ok, status: res.status, body };
}

/** What a refused call needs, in the owner's terms: a scope to grant, credentials to set, or the error itself. */
function refusal(r, scope) {
  const msg = JSON.stringify(r.body || r.error || '').slice(0, 300);
  if (r.status === 401 || r.status === 403 || /insufficient|scope|permission|OAuthException/i.test(msg)) return { ok: false, need: scope, error: msg };
  return { ok: false, error: msg || `HTTP ${r.status}` };
}

/** A Google access token from the uploads' refresh token (YOUTUBE_CLIENT_ID, _SECRET, _REFRESH_TOKEN), or a refusal. */
export async function googleToken(env = {}, fetchImpl = fetch) {
  if (!env.YOUTUBE_CLIENT_ID || !env.YOUTUBE_CLIENT_SECRET || !env.YOUTUBE_REFRESH_TOKEN) return { ok: false, need: 'credentials: YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN' };
  const body = new URLSearchParams({ client_id: env.YOUTUBE_CLIENT_ID, client_secret: env.YOUTUBE_CLIENT_SECRET, refresh_token: env.YOUTUBE_REFRESH_TOKEN, grant_type: 'refresh_token' }).toString();
  const r = await getJson(fetchImpl, GTOKEN, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
  return r.ok && r.body?.access_token ? { ok: true, token: r.body.access_token, scope: r.body.scope || '' } : refusal(r, 'a new YOUTUBE_REFRESH_TOKEN');
}

/** YouTube's public counts for up to 50 ids a call (1 unit each): { [id]: { views, likes, comments, title, publishedAt } }. */
export async function youtubeVideos(ids, { token, fetch: fetchImpl = fetch } = {}) {
  const out = {};
  const list = [...new Set(ids.filter(Boolean))];
  for (let i = 0; i < list.length; i += 50) {
    const url = `${YT}/videos?part=statistics,snippet&id=${list.slice(i, i + 50).join(',')}`;
    const r = await getJson(fetchImpl, url, { headers: { authorization: `Bearer ${token}` } });
    if (!r.ok) return refusal(r, 'the YouTube scope youtube.readonly or youtube');
    for (const v of r.body?.items || []) {
      const s = v.statistics || {};
      out[v.id] = { views: Number(s.viewCount) || 0, likes: Number(s.likeCount) || 0, comments: Number(s.commentCount) || 0, title: v.snippet?.title || null, publishedAt: v.snippet?.publishedAt || null };
    }
  }
  return { ok: true, data: out };
}

/** The channel's uploads, newest first (its uploads playlist, 50 a page, 1 unit a page): [{ id, title, publishedAt }]. */
export async function youtubeUploads({ token, fetch: fetchImpl = fetch, pages = 4 } = {}) {
  const ch = await getJson(fetchImpl, `${YT}/channels?part=contentDetails&mine=true`, { headers: { authorization: `Bearer ${token}` } });
  if (!ch.ok) return refusal(ch, 'the YouTube scope youtube.readonly or youtube');
  const playlist = ch.body?.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!playlist) return { ok: true, data: [] };
  const out = [];
  let page = '';
  for (let n = 0; n < pages; n++) {
    const r = await getJson(fetchImpl, `${YT}/playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=${playlist}${page ? `&pageToken=${page}` : ''}`, { headers: { authorization: `Bearer ${token}` } });
    if (!r.ok) return refusal(r, 'the YouTube scope youtube.readonly or youtube');
    for (const it of r.body?.items || []) out.push({ id: it.contentDetails?.videoId || it.snippet?.resourceId?.videoId, title: it.snippet?.title || '', publishedAt: it.contentDetails?.videoPublishedAt || it.snippet?.publishedAt || null });
    page = r.body?.nextPageToken || '';
    if (!page) break;
  }
  return { ok: true, data: out.filter((u) => u.id) };
}

// (the metrics the Analytics API documents for a video; the share that stayed to watch rather than swiped away is in
// YouTube Studio alone: the owner copies it, §4)
export const YTA_METRICS = Object.freeze(['views', 'estimatedMinutesWatched', 'averageViewDuration', 'averageViewPercentage', 'likes', 'comments', 'shares', 'subscribersGained']);

/** YouTube Analytics by video, 200 ids a call: { [id]: { views, averageViewPercentage, … } } (yt-analytics.readonly). */
export async function youtubeAnalytics(ids, { token, fetch: fetchImpl = fetch, start, end } = {}) {
  const out = {};
  const list = [...new Set(ids.filter(Boolean))];
  for (let i = 0; i < list.length; i += 200) {
    const q = new URLSearchParams({ ids: 'channel==MINE', startDate: start, endDate: end, metrics: YTA_METRICS.join(','), dimensions: 'video', filters: `video==${list.slice(i, i + 200).join(',')}`, maxResults: '200' });
    const r = await getJson(fetchImpl, `${YTA}?${q}`, { headers: { authorization: `Bearer ${token}` } });
    if (!r.ok) return refusal(r, 'the YouTube scope yt-analytics.readonly (a new YOUTUBE_REFRESH_TOKEN with it)');
    const cols = (r.body?.columnHeaders || []).map((c) => c.name);
    for (const row of r.body?.rows || []) {
      const o = Object.fromEntries(cols.map((c, k) => [c, row[k]]));
      out[o.video] = Object.fromEntries(YTA_METRICS.map((m) => [m, Number(o[m]) || 0]));
    }
  }
  return { ok: true, data: out };
}

/** The Instagram account's posts (newest first): [{ id, code, caption, timestamp, type }]. */
export async function instagramMedia({ token, fetch: fetchImpl = fetch, base, pages = 3 } = {}) {
  const out = [];
  let url = `${base}/me/media?fields=id,caption,permalink,timestamp,media_product_type&limit=50&access_token=${encodeURIComponent(token)}`;
  for (let n = 0; n < pages && url; n++) {
    const r = await getJson(fetchImpl, url);
    if (!r.ok) return refusal(r, 'the Instagram permission instagram_business_basic');
    for (const m of r.body?.data || []) out.push({ id: m.id, code: instagramCodeOf(m.permalink), caption: m.caption || '', timestamp: m.timestamp || null, type: m.media_product_type || null });
    url = r.body?.paging?.next || '';
  }
  return { ok: true, data: out };
}

// (Reels' metrics as the Instagram API with Instagram Login documents them; plays gave way to views in 2025)
export const IG_METRICS = Object.freeze(['views', 'reach', 'likes', 'comments', 'shares', 'saved', 'total_interactions', 'ig_reels_avg_watch_time', 'ig_reels_video_view_total_time']);

/** One Reel's insights: { views, reach, …, ig_reels_avg_watch_time (ms) } (instagram_business_manage_insights). */
export async function instagramInsights(id, { token, fetch: fetchImpl = fetch, base } = {}) {
  const r = await getJson(fetchImpl, `${base}/${id}/insights?metric=${IG_METRICS.join(',')}&access_token=${encodeURIComponent(token)}`);
  if (!r.ok) return refusal(r, 'the Instagram permission instagram_business_manage_insights');
  const out = {};
  for (const m of r.body?.data || []) out[m.name] = Number(m.values?.[0]?.value ?? m.total_value?.value) || 0;
  return { ok: true, data: out };
}

/** A TikTok access token from TIKTOK_CLIENT_KEY, _SECRET and _REFRESH_TOKEN (its scopes are what the owner granted). */
export async function tiktokToken(env = {}, fetchImpl = fetch) {
  if (!env.TIKTOK_CLIENT_KEY || !env.TIKTOK_CLIENT_SECRET || !env.TIKTOK_REFRESH_TOKEN) return { ok: false, need: 'credentials: TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, TIKTOK_REFRESH_TOKEN' };
  const body = new URLSearchParams({ client_key: env.TIKTOK_CLIENT_KEY, client_secret: env.TIKTOK_CLIENT_SECRET, refresh_token: env.TIKTOK_REFRESH_TOKEN, grant_type: 'refresh_token' }).toString();
  const r = await getJson(fetchImpl, `${TT}/oauth/token/`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
  return r.ok && r.body?.access_token ? { ok: true, token: r.body.access_token, scope: r.body.scope || '' } : refusal(r, 'a new TIKTOK_REFRESH_TOKEN');
}

/** TikTok's counts for up to 20 video ids a call: { [id]: { views, likes, comments, shares } } (the scope video.list). */
export async function tiktokVideos(ids, { token, fetch: fetchImpl = fetch } = {}) {
  const out = {};
  const list = [...new Set(ids.filter(Boolean))];
  for (let i = 0; i < list.length; i += 20) {
    const r = await getJson(fetchImpl, `${TT}/video/query/?fields=id,title,view_count,like_count,comment_count,share_count,duration`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ filters: { video_ids: list.slice(i, i + 20) } }) });
    if (!r.ok || (r.body?.error?.code && r.body.error.code !== 'ok')) return refusal(r.ok ? { status: 403, body: r.body } : r, 'the TikTok scope video.list');
    for (const v of r.body?.data?.videos || []) out[v.id] = { views: Number(v.view_count) || 0, likes: Number(v.like_count) || 0, comments: Number(v.comment_count) || 0, shares: Number(v.share_count) || 0 };
  }
  return { ok: true, data: out };
}

// ------------------------------------------------------------------ the sums

const median = (xs) => {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const h = v.length >> 1;
  return v.length % 2 ? v[h] : (v[h - 1] + v[h]) / 2;
};
const per1k = (a, views) => (views > 0 && Number.isFinite(a) ? (a / views) * 1000 : null);
const round = (x, d = 1) => (x === null ? null : Math.round(x * 10 ** d) / 10 ** d);

/** One group's medians: views, average viewed (%), watch time (s), likes, shares and sends a thousand views. */
function stats(rows) {
  const n = rows.length;
  return {
    n,
    views: round(median(rows.map((r) => r.numbers?.views))),
    viewedPct: round(median(rows.map((r) => r.numbers?.averageViewPercentage ?? null))),
    watchSec: round(median(rows.map((r) => (r.numbers?.ig_reels_avg_watch_time != null ? r.numbers.ig_reels_avg_watch_time / 1000 : r.numbers?.averageViewDuration ?? null)))),
    likesPer1k: round(median(rows.map((r) => per1k(r.numbers?.likes, r.numbers?.views)))),
    sharesPer1k: round(median(rows.map((r) => per1k(r.numbers?.shares, r.numbers?.views)))),
  };
}

/** The rule of §4: 20 clips an arm at least; the change stays when average viewed is no lower and sends no fewer. */
export const MIN_PER_ARM = 20;
function verdict(byArm, experiment) {
  const [control, change] = experiment.arms.map((a) => byArm[a] || { n: 0 });
  const short = experiment.arms.filter((a) => (byArm[a]?.n || 0) < MIN_PER_ARM);
  if (short.length) return { state: 'collecting', need: Object.fromEntries(experiment.arms.map((a) => [a, Math.max(0, MIN_PER_ARM - (byArm[a]?.n || 0))])) };
  const worse = [];
  if (control.viewedPct !== null && change.viewedPct !== null && change.viewedPct < control.viewedPct) worse.push('average viewed');
  if (control.sharesPer1k !== null && change.sharesPer1k !== null && change.sharesPer1k < control.sharesPer1k) worse.push('sends');
  return { state: worse.length ? 'drop' : 'check-studio', worse, note: worse.length ? `the change does worse on ${worse.join(' and ')}` : 'no guard metric fell: keep it if YouTube Studio\'s share that stayed to watch (or Instagram\'s skip rate) is 5 points better' };
}

/**
 * The report's sums: by network and moment kind, by network and experiment arm, with each running experiment's
 * verdict per network. Rows without numbers are counted apart (`unread`).
 */
export function summarize(rows, { experiments = EXPERIMENTS } = {}) {
  const read = rows.filter((r) => r.numbers);
  const group = (key) => {
    const out = {};
    for (const r of read) {
      const k = key(r);
      if (!k) continue;
      (out[k] ||= []).push(r);
    }
    return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, stats(v)]));
  };
  const byKind = group((r) => `${r.platform} · ${r.kind || '?'}`);
  const byArm = group((r) => (r.experiment ? `${r.platform} · ${r.experiment} · ${r.arm}` : null));
  const verdicts = {};
  for (const e of experiments) {
    for (const p of [...new Set(read.filter((r) => r.experiment === e.id).map((r) => r.platform))]) {
      const arms = Object.fromEntries(e.arms.map((a) => [a, byArm[`${p} · ${e.id} · ${a}`] || { n: 0 }]));
      verdicts[`${p} · ${e.id}`] = { arms, ...verdict(arms, e) };
    }
  }
  return { clips: rows.length, read: read.length, unread: rows.length - read.length, byKind, byArm, verdicts };
}
