// Bluesky (the AT Protocol). A session from the account's app password (com.atproto.server.createSession), then the
// post as a record (com.atproto.repo.createRecord, collection app.bsky.feed.post): text of at most 300 graphemes
// (3000 bytes), each link a facet over its UTF-8 byte range (app.bsky.richtext.facet#link), the article as a link
// card (app.bsky.embed.external: uri, title, description). The official docs page on posts did not state the limits
// when read on 17 Oct 2026 (docs.bsky.app moved to bsky.network); the lexicon's numbers above are the ones every
// client enforces.
//   BLUESKY_HANDLE, BLUESKY_APP_PASSWORD (an app password: Settings > Privacy and security > App passwords)
import { Adapter, PublishError } from './base.js';

const SVC = 'https://bsky.social/xrpc';

/** The post's link facets: [{ index: { byteStart, byteEnd }, features: [{ $type, uri }] }] for every URL in the text. */
export function linkFacets(text) {
  const out = [];
  const s = String(text ?? '');
  for (const m of s.matchAll(/https?:\/\/[^\s)]+[^\s).,;:!?]/g)) {
    const byteStart = Buffer.byteLength(s.slice(0, m.index), 'utf8');
    const byteEnd = byteStart + Buffer.byteLength(m[0], 'utf8');
    out.push({ index: { byteStart, byteEnd }, features: [{ $type: 'app.bsky.richtext.facet#link', uri: m[0] }] });
  }
  return out;
}

export function blueskyRecord(item, now = Date.now()) {
  const link = item.links?.[0];
  const record = { $type: 'app.bsky.feed.post', text: item.text, createdAt: new Date(now).toISOString(), langs: ['en'] };
  const facets = linkFacets(item.text);
  if (facets.length) record.facets = facets;
  if (link?.url) record.embed = { $type: 'app.bsky.embed.external', external: { uri: link.url, title: String(link.title || item.title || '').slice(0, 300), description: String(link.description || '').slice(0, 300) } };
  return record;
}

export class BlueskyAdapter extends Adapter {
  static id = 'bluesky';
  static label = 'Bluesky';
  static env = ['BLUESKY_HANDLE', 'BLUESKY_APP_PASSWORD'];
  static limits = { perMinute: 20, perDay: 50 };

  plan(item) {
    return [
      { step: 'session', method: 'POST', url: `${SVC}/com.atproto.server.createSession`, body: { identifier: '<BLUESKY_HANDLE>', password: '<BLUESKY_APP_PASSWORD>' } },
      { step: 'post', method: 'POST', url: `${SVC}/com.atproto.repo.createRecord`, headers: { authorization: 'Bearer <session token>' }, body: { repo: '<did>', collection: 'app.bsky.feed.post', record: blueskyRecord(item, this.now()) } },
    ];
  }

  async live(item) {
    const s = await this.request('POST', `${SVC}/com.atproto.server.createSession`, { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: this.env.BLUESKY_HANDLE, password: this.env.BLUESKY_APP_PASSWORD }) });
    const jwt = s.body?.accessJwt;
    const did = s.body?.did;
    if (!jwt || !did) throw new PublishError('no Bluesky session', { retryable: false });
    const r = await this.request('POST', `${SVC}/com.atproto.repo.createRecord`, { headers: { authorization: `Bearer ${jwt}`, 'content-type': 'application/json' }, body: JSON.stringify({ repo: did, collection: 'app.bsky.feed.post', record: blueskyRecord(item, this.now()) }) });
    const uri = r.body?.uri || null;
    const rkey = uri ? uri.split('/').pop() : null;
    return { remoteId: uri, url: rkey ? `https://bsky.app/profile/${this.env.BLUESKY_HANDLE}/post/${rkey}` : null };
  }
}
