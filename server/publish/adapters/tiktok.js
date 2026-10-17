// TikTok Content Posting API (developers.tiktok.com, read 17 Oct 2026). Two routes:
//   direct  POST /v2/post/publish/video/init/ (scope video.publish): the post goes live. The app must pass TikTok's
//           audit first: until then every post is private (SELF_ONLY) to a private account. The guidelines ask for the
//           creator's own choices on every post (privacy picked by hand, no default; comments, duets and stitches;
//           the commercial content toggles) and their express consent: the approval page is where the owner gives
//           them, item by item (item.tiktok = { privacy, allowComment, allowDuet, allowStitch, consent }).
//   inbox   POST /v2/post/publish/inbox/video/init/ (scope video.upload): the video lands in the creator's TikTok inbox
//           and the owner finishes the post in the app (at most 5 pending a day). No audit needed: the launch route.
// Both: query the creator's info first (/v2/post/publish/creator_info/query/: the privacy options and the longest
// video allowed), then the file in one PUT to the upload URL (valid an hour), then the status. The AI label is
// post_info.is_aigc (the "Creator labeled as AI-generated" tag). 6 requests a minute per token; about 15 posts a day.
//
// Credentials: TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, TIKTOK_REFRESH_TOKEN (a year long; renew it yearly), and
// TIKTOK_MODE = inbox (default) | direct.
import fs from 'node:fs';
import { Adapter, PublishError } from './base.js';

const API = 'https://open.tiktokapis.com';

/** The caption: TikTok's title field (2200 UTF-16 units), hashtags included. */
export function tiktokCaption(item) {
  const tags = (item.hashtags || []).map((h) => `#${String(h).replace(/^#/, '')}`).join(' ');
  const text = [String(item.text || item.title || '').trim(), tags].filter(Boolean).join('\n\n');
  return text.length > 2200 ? text.slice(0, 2199) : text;
}

export class TikTokAdapter extends Adapter {
  static id = 'tiktok';
  static label = 'TikTok';
  static env = ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET', 'TIKTOK_REFRESH_TOKEN'];
  static limits = { perMinute: 6, perDay: 15 };

  mode() {
    return String(this.env.TIKTOK_MODE || 'inbox').toLowerCase() === 'direct' ? 'direct' : 'inbox';
  }

  aiFlags(item) {
    return { is_aigc: this.postInfo(item).is_aigc };
  }

  postInfo(item) {
    const t = item.tiktok || {};
    return {
      title: tiktokCaption(item),
      // chosen by the owner on the approval page (never a default: TikTok's guidelines)
      privacy_level: t.privacy || '<chosen by the owner on the approval page>',
      disable_comment: t.allowComment === false,
      disable_duet: t.allowDuet === false,
      disable_stitch: t.allowStitch === false,
      video_cover_timestamp_ms: Math.round((item.media?.coverAt ?? 1) * 1000),
      brand_content_toggle: false,
      brand_organic_toggle: false,
      is_aigc: item.disclosure?.tiktok?.is_aigc !== false,
    };
  }

  plan(item) {
    const v = this.fileInfo(item.media?.video);
    const direct = this.mode() === 'direct';
    const init = { source_info: { source: 'FILE_UPLOAD', video_size: v.bytes ?? 0, chunk_size: v.bytes ?? 0, total_chunk_count: 1 } };
    if (direct) init.post_info = this.postInfo(item);
    return [
      { step: 'token', method: 'POST', url: `${API}/v2/oauth/token/`, headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: { client_key: this.cred('TIKTOK_CLIENT_KEY'), client_secret: this.cred('TIKTOK_CLIENT_SECRET'), grant_type: 'refresh_token', refresh_token: this.cred('TIKTOK_REFRESH_TOKEN') } },
      { step: 'creator-info', method: 'POST', url: `${API}/v2/post/publish/creator_info/query/`, headers: { authorization: 'Bearer <access token>', 'content-type': 'application/json; charset=UTF-8' } },
      { step: direct ? 'init-direct' : 'init-inbox', method: 'POST', url: `${API}/v2/post/publish/${direct ? 'video' : 'inbox/video'}/init/`, headers: { authorization: 'Bearer <access token>', 'content-type': 'application/json; charset=UTF-8' }, body: init, note: direct ? 'goes live (private until the app passes TikTok\'s audit)' : 'lands in the TikTok inbox: the owner finishes the post in the app (caption below, AI-generated label on)', caption: direct ? undefined : this.postInfo(item).title },
      { step: 'upload', method: 'PUT', url: '<upload_url from init, valid one hour>', headers: { 'content-type': 'video/mp4', 'content-range': `bytes 0-${Math.max(0, (v.bytes ?? 1) - 1)}/${v.bytes ?? 0}` }, file: v.path },
      { step: 'status', method: 'POST', url: `${API}/v2/post/publish/status/fetch/`, headers: { authorization: 'Bearer <access token>', 'content-type': 'application/json; charset=UTF-8' }, body: { publish_id: '<publish_id from init>' } },
    ];
  }

  async live(item) {
    const tok = await this.request('POST', `${API}/v2/oauth/token/`, { headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_key: this.env.TIKTOK_CLIENT_KEY, client_secret: this.env.TIKTOK_CLIENT_SECRET, grant_type: 'refresh_token', refresh_token: this.env.TIKTOK_REFRESH_TOKEN }).toString() });
    const token = tok.body?.access_token;
    if (!token) throw new PublishError('no access token', { retryable: false });
    const auth = { authorization: `Bearer ${token}`, 'content-type': 'application/json; charset=UTF-8' };
    const direct = this.mode() === 'direct';
    const info = await this.request('POST', `${API}/v2/post/publish/creator_info/query/`, { headers: auth });
    const d = info.body?.data || {};
    if (direct) {
      const t = item.tiktok || {};
      if (!t.consent) throw new PublishError('TikTok: the owner has not given consent for this post on the approval page', { retryable: false });
      if (!t.privacy || !(d.privacy_level_options || []).includes(t.privacy)) throw new PublishError('TikTok: the privacy the owner chose is not offered for this account', { retryable: false });
      if (Number.isFinite(d.max_video_post_duration_sec) && item.media?.duration > d.max_video_post_duration_sec) throw new PublishError('TikTok: the video is longer than this account may post', { retryable: false });
    }
    const bytes = fs.readFileSync(item.media.video);
    const init = { source_info: { source: 'FILE_UPLOAD', video_size: bytes.length, chunk_size: bytes.length, total_chunk_count: 1 } };
    if (direct) init.post_info = this.postInfo(item);
    const r = await this.request('POST', `${API}/v2/post/publish/${direct ? 'video' : 'inbox/video'}/init/`, { headers: auth, body: JSON.stringify(init) });
    const { publish_id: publishId, upload_url: uploadUrl } = r.body?.data || {};
    if (!publishId || !uploadUrl) throw new PublishError('TikTok init gave no upload URL', { retryable: false, body: r.body });
    await this.request('PUT', uploadUrl, { headers: { 'content-type': 'video/mp4', 'content-range': `bytes 0-${bytes.length - 1}/${bytes.length}`, 'content-length': String(bytes.length) }, body: bytes });
    return { remoteId: publishId, url: null, note: direct ? 'posted' : 'in the TikTok inbox: finish it in the app' };
  }
}
