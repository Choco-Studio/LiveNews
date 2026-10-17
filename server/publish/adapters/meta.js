// Meta's networks through their Graph APIs (developers.facebook.com, read 17 Oct 2026).
//
// Instagram Reels (Instagram API with Instagram Login; a professional account, Business or Creator; the permissions
// instagram_business_basic and instagram_business_content_publish, Advanced Access through app review): a container
// (POST /<IG_ID>/media, media_type REELS, video_url: the file must be on a PUBLIC server when the request is made,
// caption, is_ai_generated true: the AI self-disclosure), its processing polled (status_code), then
// POST /<IG_ID>/media_publish. 100 API-published posts in a moving 24 hours (GET content_publishing_limit tells).
//   INSTAGRAM_USER_ID, INSTAGRAM_ACCESS_TOKEN (60 days: renew it), PUBLIC_MEDIA_BASE_URL (where the clips are served)
//
// Facebook Page (pages_show_list, pages_read_engagement, pages_manage_posts; a Page token of a user with the
// CREATE_CONTENT task): Reels by POST /{page-id}/video_reels upload_phase=start, the file to rupload.facebook.com,
// then upload_phase=finish with video_state PUBLISHED (3-90 s, 9:16; 30 a day); a horizontal video by
// POST /{page-id}/videos; a text post by POST /{page-id}/feed (message, link). No API field for an AI label: the
// description carries the disclosure (the compliance desk may ask for the label by hand).
//   FACEBOOK_PAGE_ID, FACEBOOK_PAGE_TOKEN
//
// Threads: POST /{threads-user-id}/threads (media_type TEXT, text <= 500, link_attachment), then threads_publish
// (250 posts a day; at most 5 unique links a post).
//   THREADS_USER_ID, THREADS_ACCESS_TOKEN (60 days: renew it)
import fs from 'node:fs';
import { Adapter, PublishError } from './base.js';

const GV = (env, k, d) => String(env[k] || d);

/** The public URL of a clip (Instagram and Facebook fetch it themselves): PUBLIC_MEDIA_BASE_URL + its file name. */
export function publicUrl(env, file) {
  const base = String(env.PUBLIC_MEDIA_BASE_URL || '').replace(/\/+$/, '');
  const name = String(file || '').split('/').pop();
  return base ? `${base}/${encodeURIComponent(name)}` : `<PUBLIC_MEDIA_BASE_URL>/${name}`;
}

export function metaCaption(item, max = 2200) {
  const tags = (item.hashtags || []).slice(0, 30).map((h) => `#${String(h).replace(/^#/, '')}`).join(' ');
  const text = [String(item.text || item.title || '').trim(), tags].filter(Boolean).join('\n\n');
  return text.length > max ? text.slice(0, max - 1) : text;
}

export class InstagramAdapter extends Adapter {
  static id = 'instagram';
  static label = 'Instagram';
  static env = ['INSTAGRAM_USER_ID', 'INSTAGRAM_ACCESS_TOKEN', 'PUBLIC_MEDIA_BASE_URL'];
  static limits = { perMinute: 20, perDay: 100 };

  base() {
    return `https://graph.instagram.com/${GV(this.env, 'INSTAGRAM_GRAPH_VERSION', 'v23.0')}`;
  }

  aiFlags() {
    return { is_ai_generated: true };
  }

  plan(item) {
    const user = this.env.INSTAGRAM_USER_ID ? '<INSTAGRAM_USER_ID>' : '<INSTAGRAM_USER_ID>';
    return [
      { step: 'limit', method: 'GET', url: `${this.base()}/${user}/content_publishing_limit?fields=quota_usage,config&access_token=<token>` },
      { step: 'container', method: 'POST', url: `${this.base()}/${user}/media`, body: { media_type: 'REELS', video_url: publicUrl(this.env, item.media?.video), caption: metaCaption(item), share_to_feed: true, is_ai_generated: item.disclosure?.instagram?.is_ai_generated !== false, access_token: '<token>' } },
      { step: 'poll', method: 'GET', url: `${this.base()}/<container id>?fields=status_code&access_token=<token>`, note: 'once a minute, five minutes at most, until FINISHED' },
      { step: 'publish', method: 'POST', url: `${this.base()}/${user}/media_publish`, body: { creation_id: '<container id>', access_token: '<token>' } },
    ];
  }

  async live(item) {
    const b = this.base();
    const user = this.env.INSTAGRAM_USER_ID;
    const token = this.env.INSTAGRAM_ACCESS_TOKEN;
    const form = (o) => new URLSearchParams(Object.entries(o).map(([k, v]) => [k, String(v)])).toString();
    const c = await this.request('POST', `${b}/${user}/media`, { headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form({ media_type: 'REELS', video_url: publicUrl(this.env, item.media.video), caption: metaCaption(item), share_to_feed: true, is_ai_generated: true, access_token: token }) });
    const id = c.body?.id;
    if (!id) throw new PublishError('no container', { retryable: false, body: c.body });
    for (let i = 0; i < 10; i++) {
      const s = await this.request('GET', `${b}/${id}?fields=status_code&access_token=${encodeURIComponent(token)}`);
      if (s.body?.status_code === 'FINISHED') break;
      if (s.body?.status_code === 'ERROR') throw new PublishError('Instagram could not process the video', { retryable: false, body: s.body });
      await this.sleep(30_000);
    }
    const p = await this.request('POST', `${b}/${user}/media_publish`, { headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form({ creation_id: id, access_token: token }) });
    return { remoteId: p.body?.id || null, url: null };
  }
}

export class FacebookAdapter extends Adapter {
  static id = 'facebook';
  static label = 'Facebook';
  static env = ['FACEBOOK_PAGE_ID', 'FACEBOOK_PAGE_TOKEN'];
  static limits = { perMinute: 20, perDay: 30 };

  base() {
    return `https://graph.facebook.com/${GV(this.env, 'FACEBOOK_GRAPH_VERSION', 'v23.0')}`;
  }

  plan(item) {
    const page = '<FACEBOOK_PAGE_ID>';
    if (item.kind === 'text') return [{ step: 'feed', method: 'POST', url: `${this.base()}/${page}/feed`, body: { message: item.text, ...(item.links?.[0]?.url ? { link: item.links[0].url } : {}), access_token: '<token>' } }];
    const v = this.fileInfo(item.media?.video);
    if (item.format === 'vertical' && (item.media?.duration ?? 0) <= 90) {
      return [
        { step: 'reel-start', method: 'POST', url: `${this.base()}/${page}/video_reels`, body: { upload_phase: 'start', access_token: '<token>' } },
        { step: 'reel-upload', method: 'POST', url: `https://rupload.facebook.com/video-upload/${GV(this.env, 'FACEBOOK_GRAPH_VERSION', 'v23.0')}/<video_id>`, headers: { authorization: 'OAuth <token>', offset: '0', file_size: String(v.bytes ?? 0) }, file: v.path },
        { step: 'reel-finish', method: 'POST', url: `${this.base()}/${page}/video_reels`, body: { upload_phase: 'finish', video_id: '<video_id>', video_state: 'PUBLISHED', description: metaCaption(item, 2200), access_token: '<token>' } },
      ];
    }
    return [{ step: 'video', method: 'POST', url: `https://graph-video.facebook.com/${GV(this.env, 'FACEBOOK_GRAPH_VERSION', 'v23.0')}/${page}/videos`, body: { title: item.title, description: item.description || item.text, access_token: '<token>' }, file: v.path }];
  }

  async live(item) {
    const b = this.base();
    const page = this.env.FACEBOOK_PAGE_ID;
    const token = this.env.FACEBOOK_PAGE_TOKEN;
    const form = (o) => new URLSearchParams(Object.entries(o).map(([k, v]) => [k, String(v)])).toString();
    const H = { 'content-type': 'application/x-www-form-urlencoded' };
    if (item.kind === 'text') {
      const r = await this.request('POST', `${b}/${page}/feed`, { headers: H, body: form({ message: item.text, ...(item.links?.[0]?.url ? { link: item.links[0].url } : {}), access_token: token }) });
      return { remoteId: r.body?.id || null, url: r.body?.id ? `https://www.facebook.com/${r.body.id}` : null };
    }
    if (item.format !== 'vertical' || (item.media?.duration ?? 0) > 90) throw new PublishError('horizontal Page videos: upload by hand for now (the multipart /videos route is not wired)', { retryable: false });
    const start = await this.request('POST', `${b}/${page}/video_reels`, { headers: H, body: form({ upload_phase: 'start', access_token: token }) });
    const vid = start.body?.video_id;
    if (!vid) throw new PublishError('no video id', { retryable: false, body: start.body });
    const bytes = fs.readFileSync(item.media.video);
    await this.request('POST', `https://rupload.facebook.com/video-upload/${GV(this.env, 'FACEBOOK_GRAPH_VERSION', 'v23.0')}/${vid}`, { headers: { authorization: `OAuth ${token}`, offset: '0', file_size: String(bytes.length) }, body: bytes });
    await this.request('POST', `${b}/${page}/video_reels`, { headers: H, body: form({ upload_phase: 'finish', video_id: vid, video_state: 'PUBLISHED', description: metaCaption(item, 2200), access_token: token }) });
    return { remoteId: vid, url: `https://www.facebook.com/reel/${vid}` };
  }
}

export class ThreadsAdapter extends Adapter {
  static id = 'threads';
  static label = 'Threads';
  static env = ['THREADS_USER_ID', 'THREADS_ACCESS_TOKEN'];
  static limits = { perMinute: 20, perDay: 250 };

  plan(item) {
    const link = item.links?.[0]?.url;
    return [
      { step: 'container', method: 'POST', url: 'https://graph.threads.net/v1.0/<THREADS_USER_ID>/threads', body: { media_type: 'TEXT', text: item.text, ...(link ? { link_attachment: link } : {}), access_token: '<token>' } },
      { step: 'publish', method: 'POST', url: 'https://graph.threads.net/v1.0/<THREADS_USER_ID>/threads_publish', body: { creation_id: '<container id>', access_token: '<token>' }, note: 'about 30 s after the container' },
    ];
  }

  async live(item) {
    const user = this.env.THREADS_USER_ID;
    const token = this.env.THREADS_ACCESS_TOKEN;
    const form = (o) => new URLSearchParams(Object.entries(o).map(([k, v]) => [k, String(v)])).toString();
    const H = { 'content-type': 'application/x-www-form-urlencoded' };
    const link = item.links?.[0]?.url;
    const c = await this.request('POST', `https://graph.threads.net/v1.0/${user}/threads`, { headers: H, body: form({ media_type: 'TEXT', text: item.text, ...(link ? { link_attachment: link } : {}), access_token: token }) });
    if (!c.body?.id) throw new PublishError('no container', { retryable: false, body: c.body });
    await this.sleep(30_000);
    const p = await this.request('POST', `https://graph.threads.net/v1.0/${user}/threads_publish`, { headers: H, body: form({ creation_id: c.body.id, access_token: token }) });
    return { remoteId: p.body?.id || null, url: null };
  }
}
