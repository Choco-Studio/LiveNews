// YouTube's live chat for the moderator (tools/publish/chatmod.mjs; docs/publishing/chat-moderation.md): the OAuth
// token, the live broadcast's chat, the messages (streamed, or polled when the stream cannot be had), removing a message,
// timing out or banning its author, and one message of the channel's own. Read 25 Oct 2026: the Data API's discovery
// document (liveChat/messages, liveChat/bans) and "Streaming Live Chat" (liveChatMessages.streamList, gRPC only,
// stream_list.proto beside this file). Costs: COST in moderator.js.
//
//   new YouTubeChatApi({ env, fetchImpl, log })
//     .activeChat()                          -> { broadcastId, liveChatId, title } | null (the live broadcast, ours)
//     .stream(liveChatId, pageToken, onPage) -> { done: Promise<{ pageToken, ended, error }>, cancel() } (gRPC)
//     .poll(liveChatId, pageToken)           -> { items, nextPageToken, pollingIntervalMillis, offlineAt }
//     .remove(messageId)  .ban(liveChatId, channelId, seconds | null)  .say(liveChatId, text)
//   normalizeMessage(raw) -> { id, type, text, publishedAt, author: { channelId, name, owner, moderator, sponsor, verified } }
//
// Tests point it at local stand-ins: YOUTUBE_API_BASE, GOOGLE_OAUTH_URL, YOUTUBE_GRPC_TARGET with
// YOUTUBE_GRPC_INSECURE=1 (never on the server).
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PROTO = path.join(HERE, 'stream_list.proto');

const TYPES = {
  textMessageEvent: 'text', TEXT_MESSAGE_EVENT: 'text',
  superChatEvent: 'superchat', SUPER_CHAT_EVENT: 'superchat',
  superStickerEvent: 'sticker', SUPER_STICKER_EVENT: 'sticker',
  memberMilestoneChatEvent: 'milestone', MEMBER_MILESTONE_CHAT_EVENT: 'milestone',
  chatEndedEvent: 'ended', CHAT_ENDED_EVENT: 'ended',
  tombstone: 'tombstone', TOMBSTONE: 'tombstone',
};

/** One message, from the REST resource or the gRPC one (camelCase either way), in the moderator's shape. */
export function normalizeMessage(raw = {}) {
  const sn = raw.snippet || {};
  const au = raw.authorDetails || {};
  return {
    id: raw.id || null,
    type: TYPES[sn.type] || 'other',
    text: String(sn.textMessageDetails?.messageText || sn.superChatDetails?.userComment || sn.memberMilestoneChatDetails?.userComment || sn.displayMessage || ''),
    publishedAt: sn.publishedAt || null,
    author: {
      channelId: au.channelId || sn.authorChannelId || null,
      name: au.displayName || '',
      owner: !!au.isChatOwner,
      moderator: !!au.isChatModerator,
      sponsor: !!au.isChatSponsor,
      verified: !!au.isVerified,
    },
  };
}

export class YouTubeChatApi {
  constructor({ env = process.env, fetchImpl = globalThis.fetch, log = () => {} } = {}) {
    Object.assign(this, { env, fetchImpl, log });
    this.base = String(env.YOUTUBE_API_BASE || 'https://www.googleapis.com/youtube/v3').replace(/\/$/, '');
    this.oauth = env.GOOGLE_OAUTH_URL || 'https://oauth2.googleapis.com/token';
    this.grpcTarget = env.YOUTUBE_GRPC_TARGET || 'youtube.googleapis.com:443';
    this.grpcInsecure = env.YOUTUBE_GRPC_INSECURE === '1';
    this.tok = null;
    this.client = undefined;
  }
  async token() {
    if (this.tok && this.tok.until > Date.now()) return this.tok.value;
    const r = await this.fetchImpl(this.oauth, { method: 'POST', body: new URLSearchParams({ client_id: this.env.YOUTUBE_CLIENT_ID || '', client_secret: this.env.YOUTUBE_CLIENT_SECRET || '', refresh_token: this.env.YOUTUBE_REFRESH_TOKEN || '', grant_type: 'refresh_token' }) });
    const j = await r.json().catch(() => ({}));
    if (!j.access_token) throw new Error(`no access token (${j.error || r.status})`);
    this.tok = { value: j.access_token, until: Date.now() + Math.max(60, (j.expires_in || 3600) - 120) * 1000 };
    return this.tok.value;
  }
  async rest(method, url, body) {
    const r = await this.fetchImpl(`${this.base}/${url}`, { method, headers: { authorization: `Bearer ${await this.token()}`, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    if (r.status === 204) return {};
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) {
      const reason = j.error?.errors?.[0]?.reason || j.error?.status || '';
      const e = new Error(`${method} ${url.split('?')[0]}: ${j.error?.code || r.status} ${reason} ${j.error?.message || ''}`.trim());
      e.status = r.status;
      e.reason = reason;
      throw e;
    }
    return j;
  }
  /** The channel's live broadcast and its chat (one unit). With YouTube's dual format the two feeds share it. */
  async activeChat() {
    const j = await this.rest('GET', 'liveBroadcasts?part=id,snippet,status&broadcastStatus=active&broadcastType=all&maxResults=50');
    const live = (j.items || []).filter((b) => b.snippet?.liveChatId && b.status?.lifeCycleStatus !== 'complete');
    const b = live.find((x) => x.status?.lifeCycleStatus === 'live') || live[0];
    return b ? { broadcastId: b.id, liveChatId: b.snippet.liveChatId, title: b.snippet.title || '' } : null;
  }
  async poll(liveChatId, pageToken) {
    const q = new URLSearchParams({ liveChatId, part: 'id,snippet,authorDetails', maxResults: '2000', ...(pageToken ? { pageToken } : {}) });
    const j = await this.rest('GET', `liveChat/messages?${q}`);
    return { items: (j.items || []).map(normalizeMessage), nextPageToken: j.nextPageToken || null, pollingIntervalMillis: j.pollingIntervalMillis || 5000, offlineAt: j.offlineAt || null };
  }
  /** The gRPC client, made once; null when the packages are missing (then the process polls instead). */
  async grpcClient() {
    if (this.client !== undefined) return this.client;
    try {
      const grpc = await import('@grpc/grpc-js');
      const loader = await import('@grpc/proto-loader');
      const def = loader.loadSync(PROTO, { keepCase: false, longs: String, enums: String, defaults: false, oneofs: true });
      const Service = grpc.loadPackageDefinition(def).youtube.api.v3.V3DataLiveChatMessageService;
      const creds = this.grpcInsecure ? grpc.credentials.createInsecure() : grpc.credentials.createSsl();
      this.grpc = grpc;
      this.client = new Service(this.grpcTarget, creds, { 'grpc.keepalive_time_ms': 60_000 });
    } catch (err) {
      this.log(`gRPC unavailable (${err.message}): polling instead`);
      this.client = null;
    }
    return this.client;
  }
  /**
   * The chat's messages as they come (one call, held open: 5 units), each server response handed to `onPage` as
   * { items, nextPageToken, offlineAt }. `done` settles when the stream ends: { pageToken (to resume from), ended (the
   * chat is over), error }.
   */
  async stream(liveChatId, pageToken, onPage) {
    const client = await this.grpcClient();
    if (!client) throw new Error('no gRPC client');
    const meta = new this.grpc.Metadata();
    meta.add('authorization', `Bearer ${await this.token()}`);
    const call = client.StreamList({ liveChatId, part: ['id', 'snippet', 'authorDetails'], ...(pageToken ? { pageToken } : {}) }, meta);
    let last = pageToken || null;
    let ended = false;
    const done = new Promise((resolve) => {
      call.on('data', (res) => {
        if (res.nextPageToken) last = res.nextPageToken;
        const items = (res.items || []).map(normalizeMessage);
        if (res.offlineAt || items.some((m) => m.type === 'ended')) ended = true;
        try {
          onPage({ items, nextPageToken: res.nextPageToken || null, offlineAt: res.offlineAt || null });
        } catch (err) {
          this.log(`a page could not be handled: ${err.message}`);
        }
      });
      call.on('error', (err) => {
        const msg = String(err.details || err.message || err);
        resolve({ pageToken: last, ended: ended || /LIVE_CHAT_ENDED|liveChatEnded|NOT_FOUND|liveChatNotFound|LIVE_CHAT_DISABLED/i.test(msg), error: `${err.code ?? ''} ${msg}`.trim(), code: err.code });
      });
      call.on('end', () => resolve({ pageToken: last, ended, error: null }));
    });
    return { done, cancel: () => call.cancel() };
  }
  remove(messageId) {
    return this.rest('DELETE', `liveChat/messages?id=${encodeURIComponent(messageId)}`);
  }
  /** Out of the chat: for `seconds` (a timeout), or for good when `seconds` is null. */
  ban(liveChatId, channelId, seconds = null) {
    const snippet = { liveChatId, type: seconds ? 'temporary' : 'permanent', bannedUserDetails: { channelId }, ...(seconds ? { banDurationSeconds: seconds } : {}) };
    return this.rest('POST', 'liveChat/bans?part=snippet', { snippet });
  }
  say(liveChatId, text) {
    return this.rest('POST', 'liveChat/messages?part=snippet', { snippet: { liveChatId, type: 'textMessageEvent', textMessageDetails: { messageText: String(text).slice(0, 200) } } });
  }
}
