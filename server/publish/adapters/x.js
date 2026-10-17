// X API v2 (docs.x.com, read 17 Oct 2026). POST /2/tweets (text, and media.media_ids for a clip uploaded through
// /2/media/upload/initialize, /{id}/append, /{id}/finalize, then STATUS until it has processed; media_category
// tweet_video). Pay per use: a post is $0.015 and a post WITH a link $0.20, so links are budgeted (plan.md §3).
// Signed with OAuth 1.0a user context (HMAC-SHA1: the four credentials never expire, so nothing needs storing
// between runs, and nothing is ever written to a file).
//   X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET (the account's own, from the developer portal)
import crypto from 'node:crypto';
import fs from 'node:fs';
import { Adapter, PublishError } from './base.js';

const API = 'https://api.x.com';
const pct = (s) => encodeURIComponent(String(s)).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/** The OAuth 1.0a Authorization header for a request (query parameters signed, a JSON or multipart body not). */
export function oauth1Header({ method, url, key, secret, token, tokenSecret, nonce = crypto.randomBytes(16).toString('hex'), timestamp = Math.floor(Date.now() / 1000) }) {
  const u = new URL(url);
  const oauth = { oauth_consumer_key: key, oauth_nonce: nonce, oauth_signature_method: 'HMAC-SHA1', oauth_timestamp: String(timestamp), oauth_token: token, oauth_version: '1.0' };
  const params = [...Object.entries(oauth), ...[...u.searchParams.entries()]].map(([k, v]) => [pct(k), pct(v)]).sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1));
  const base = [method.toUpperCase(), pct(`${u.origin}${u.pathname}`), pct(params.map(([k, v]) => `${k}=${v}`).join('&'))].join('&');
  const signature = crypto.createHmac('sha1', `${pct(secret)}&${pct(tokenSecret)}`).update(base).digest('base64');
  return `OAuth ${Object.entries({ ...oauth, oauth_signature: signature }).map(([k, v]) => `${pct(k)}="${pct(v)}"`).join(', ')}`;
}

export class XAdapter extends Adapter {
  static id = 'x';
  static label = 'X';
  static env = ['X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_SECRET'];
  static limits = { perMinute: 10, perDay: 8 };

  plan(item) {
    const steps = [];
    if (item.media?.video) {
      const v = this.fileInfo(item.media.video);
      steps.push(
        { step: 'media-init', method: 'POST', url: `${API}/2/media/upload/initialize`, headers: { authorization: 'OAuth <signed>' }, body: { media_type: 'video/mp4', total_bytes: v.bytes ?? 0, media_category: 'tweet_video' } },
        { step: 'media-append', method: 'POST', url: `${API}/2/media/upload/<media id>/append`, headers: { authorization: 'OAuth <signed>' }, body: { segment_index: '0..n (5 MB chunks)' }, file: v.path },
        { step: 'media-finalize', method: 'POST', url: `${API}/2/media/upload/<media id>/finalize`, headers: { authorization: 'OAuth <signed>' } },
        { step: 'media-status', method: 'GET', url: `${API}/2/media/upload?command=STATUS&media_id=<media id>`, note: 'until succeeded' },
      );
    }
    const hasUrl = /https?:\/\//.test(item.text || '');
    steps.push({ step: 'post', method: 'POST', url: `${API}/2/tweets`, headers: { authorization: 'OAuth <signed>', 'content-type': 'application/json' }, body: { text: item.text, ...(item.media?.video ? { media: { media_ids: ['<media id>'] } } : {}) }, cost: hasUrl ? '$0.200 (a post with a URL)' : '$0.015' });
    return steps;
  }

  auth(method, url) {
    return oauth1Header({ method, url, key: this.env.X_API_KEY, secret: this.env.X_API_SECRET, token: this.env.X_ACCESS_TOKEN, tokenSecret: this.env.X_ACCESS_SECRET });
  }

  async live(item) {
    let mediaId = null;
    if (item.media?.video) {
      const bytes = fs.readFileSync(item.media.video);
      const initUrl = `${API}/2/media/upload/initialize`;
      const init = await this.request('POST', initUrl, { headers: { authorization: this.auth('POST', initUrl), 'content-type': 'application/json' }, body: JSON.stringify({ media_type: 'video/mp4', total_bytes: bytes.length, media_category: 'tweet_video' }) });
      mediaId = init.body?.data?.id || init.body?.id;
      if (!mediaId) throw new PublishError('no media id', { retryable: false, body: init.body });
      const CH = 5 * 1024 * 1024;
      for (let i = 0, k = 0; i < bytes.length; i += CH, k++) {
        const url = `${API}/2/media/upload/${mediaId}/append`;
        const fd = new FormData();
        fd.append('segment_index', String(k));
        fd.append('media', new Blob([bytes.subarray(i, i + CH)]), 'chunk');
        await this.request('POST', url, { headers: { authorization: this.auth('POST', url) }, body: fd });
      }
      const finUrl = `${API}/2/media/upload/${mediaId}/finalize`;
      let fin = await this.request('POST', finUrl, { headers: { authorization: this.auth('POST', finUrl) } });
      for (let n = 0; n < 20 && fin.body?.data?.processing_info && !['succeeded', 'failed'].includes(fin.body.data.processing_info.state); n++) {
        await this.sleep((fin.body.data.processing_info.check_after_secs || 5) * 1000);
        const st = `${API}/2/media/upload?command=STATUS&media_id=${mediaId}`;
        fin = await this.request('GET', st, { headers: { authorization: this.auth('GET', st) } });
      }
      if (fin.body?.data?.processing_info?.state === 'failed') throw new PublishError('X could not process the video', { retryable: false, body: fin.body });
    }
    const url = `${API}/2/tweets`;
    const r = await this.request('POST', url, { headers: { authorization: this.auth('POST', url), 'content-type': 'application/json' }, body: JSON.stringify({ text: item.text, ...(mediaId ? { media: { media_ids: [mediaId] } } : {}) }) });
    const id = r.body?.data?.id;
    return { remoteId: id || null, url: id ? `https://x.com/i/web/status/${id}` : null };
  }
}
