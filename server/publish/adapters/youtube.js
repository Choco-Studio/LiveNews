// YouTube Data API v3 (developers.google.com/youtube/v3, read 17 Oct 2026): a resumable upload (videos.insert, its own
// bucket of 100 calls a day), the video's own fields (snippet: title <= 100 characters, description <= 5000 bytes,
// tags <= 500 characters, categoryId; status: privacyStatus, publishAt (private only), selfDeclaredMadeForKids,
// containsSyntheticMedia: the altered or synthetic content disclosure), then for a full programme its thumbnail
// (thumbnails.set, 50 units). A vertical upload up to three minutes is a Short by itself (no API field).
// The live stream's title and description: videos.update on the broadcast's video (50 units), rate-limited by the
// supervisor (server/publish/live.js).
//
// Credentials (OAuth 2.0, a Desktop or Web client of a Google Cloud project with the YouTube Data API enabled, and a
// refresh token for the channel's account with the youtube.upload and youtube scopes):
//   YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN
import fs from 'node:fs';
import { Adapter, PublishError } from './base.js';

const UPLOAD = 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status';
const THUMBS = 'https://www.googleapis.com/upload/youtube/v3/thumbnails/set';
const VIDEOS = 'https://www.googleapis.com/youtube/v3/videos';
const TOKEN = 'https://oauth2.googleapis.com/token';
// YouTube's categories: 25 News & Politics, 28 Science & Technology, 17 Sports, 24 Entertainment
const CATEGORY = { 'world-now': '25', 'news-60': '25', 'money-minute': '25', 'seven-days': '25', 'tech-bytes': '28', cosmos: '28', 'world-weather': '25', 'full-time': '17', 'pay-attention': '24', 'press-start': '20' };

/** The video resource for an item (snippet + status), within YouTube's limits. */
export function videoResource(item) {
  const title = String(item.title || '').replace(/[<>]/g, '').slice(0, 100);
  let description = String(item.description || item.text || '').replace(/[<>]/g, '');
  while (Buffer.byteLength(description, 'utf8') > 5000) description = description.slice(0, -10);
  const tags = [];
  let len = 0;
  for (const t of item.tags || []) {
    const s = String(t).replace(/[<>,]/g, '').trim();
    if (!s) continue;
    const add = s.length + (s.includes(' ') ? 2 : 0) + (tags.length ? 1 : 0);
    if (len + add > 500) break;
    tags.push(s);
    len += add;
  }
  const status = {
    // the desk uploads at the item's own scheduled time, public; a publishAt (YouTube's own schedule) only when asked
    privacyStatus: item.youtube?.privacy || (item.youtube?.publishAt ? 'private' : 'public'),
    selfDeclaredMadeForKids: false,
    containsSyntheticMedia: item.disclosure?.youtube?.containsSyntheticMedia !== false,
    embeddable: true,
    license: 'youtube',
  };
  if (status.privacyStatus === 'private' && item.youtube?.publishAt) status.publishAt = new Date(item.youtube.publishAt).toISOString();
  return {
    snippet: { title, description, tags, categoryId: CATEGORY[item.source?.programId] || '25', defaultLanguage: 'en', defaultAudioLanguage: 'en' },
    status,
  };
}

export class YouTubeAdapter extends Adapter {
  static id = 'youtube';
  static label = 'YouTube';
  static env = ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET', 'YOUTUBE_REFRESH_TOKEN'];
  // videos.insert: 100 a day (its own bucket); the 10,000-unit pool covers thumbnails (50) and updates (50)
  static limits = { perMinute: 30, perDay: 100 };

  aiFlags(item) {
    // both fields the upload really sends: the synthetic-content flag and the audience (the compliance desk's gate
    // checks the two on one line: news for a general audience is never "made for kids")
    const { containsSyntheticMedia, selfDeclaredMadeForKids } = videoResource(item).status;
    return { containsSyntheticMedia, selfDeclaredMadeForKids };
  }

  plan(item) {
    const v = this.fileInfo(item.media?.video);
    const steps = [
      { step: 'token', method: 'POST', url: TOKEN, headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: { client_id: this.cred('YOUTUBE_CLIENT_ID'), client_secret: this.cred('YOUTUBE_CLIENT_SECRET'), refresh_token: this.cred('YOUTUBE_REFRESH_TOKEN'), grant_type: 'refresh_token' } },
      { step: 'upload-session', method: 'POST', url: UPLOAD, headers: { authorization: 'Bearer <access token>', 'content-type': 'application/json; charset=UTF-8', 'x-upload-content-length': String(v.bytes ?? 0), 'x-upload-content-type': 'video/mp4' }, body: videoResource(item) },
      { step: 'upload', method: 'PUT', url: '<the session URL from the Location header>', headers: { 'content-type': 'video/mp4', 'content-length': String(v.bytes ?? 0) }, file: v.path },
    ];
    if (item.kind === 'episode' && item.media?.thumb) steps.push({ step: 'thumbnail', method: 'POST', url: `${THUMBS}?videoId=<new video id>`, headers: { 'content-type': item.media.thumb.endsWith('.png') ? 'image/png' : 'image/jpeg' }, file: item.media.thumb });
    return steps;
  }

  async token() {
    const body = new URLSearchParams({ client_id: this.env.YOUTUBE_CLIENT_ID, client_secret: this.env.YOUTUBE_CLIENT_SECRET, refresh_token: this.env.YOUTUBE_REFRESH_TOKEN, grant_type: 'refresh_token' });
    const r = await this.request('POST', TOKEN, { headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: body.toString() });
    if (!r.body?.access_token) throw new PublishError('no access token', { retryable: false });
    return r.body.access_token;
  }

  async live(item) {
    const token = await this.token();
    const bytes = fs.readFileSync(item.media.video);
    const init = await this.request('POST', UPLOAD, { headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json; charset=UTF-8', 'x-upload-content-length': String(bytes.length), 'x-upload-content-type': 'video/mp4' }, body: JSON.stringify(videoResource(item)) });
    const session = init.headers?.get?.('location');
    if (!session) throw new PublishError('no upload session', { retryable: true });
    const up = await this.request('PUT', session, { headers: { 'content-type': 'video/mp4', 'content-length': String(bytes.length) }, body: bytes });
    const id = up.body?.id;
    if (!id) throw new PublishError('upload gave no video id', { retryable: false });
    if (item.kind === 'episode' && item.media?.thumb && fs.existsSync(item.media.thumb)) {
      await this.request('POST', `${THUMBS}?videoId=${encodeURIComponent(id)}`, { headers: { authorization: `Bearer ${token}`, 'content-type': item.media.thumb.endsWith('.png') ? 'image/png' : 'image/jpeg' }, body: fs.readFileSync(item.media.thumb) }).catch((err) => this.log(`[youtube] thumbnail: ${err.message}`));
    }
    return { remoteId: id, url: item.format === 'vertical' ? `https://www.youtube.com/shorts/${id}` : `https://www.youtube.com/watch?v=${id}` };
  }

  /** The live broadcast's title and description (videos.update on its video id, 50 units). */
  planLiveUpdate(videoId, { title, description }) {
    return [{ step: 'live-update', method: 'PUT', url: `${VIDEOS}?part=snippet`, headers: { authorization: 'Bearer <access token>', 'content-type': 'application/json' }, body: { id: videoId || '<YOUTUBE_LIVE_VIDEO_ID>', snippet: { title: String(title).slice(0, 100), description: String(description).slice(0, 4900), categoryId: '25' } } }];
  }

  async liveUpdate(videoId, meta) {
    const token = await this.token();
    return this.request('PUT', `${VIDEOS}?part=snippet`, { headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(this.planLiveUpdate(videoId, meta)[0].body) });
  }
}
