// A Telegram channel through the Bot API: the bot is an administrator of the channel and posts with sendMessage (text
// up to 4096 characters, HTML, a link preview of the article) or sendVideo (a caption up to 1024 characters; bots
// upload files up to 50 MB). No review, no app: the simplest network to run. (core.telegram.org answered 502 through
// the proxy on 17 Oct 2026: these limits are Telegram's long-standing ones, to check again before launch.)
//   TELEGRAM_BOT_TOKEN (from @BotFather; it sits in the request's PATH, so every log redacts the whole /bot<token>)
//   TELEGRAM_CHAT_ID (@channelname or its numeric id)
import fs from 'node:fs';
import { Adapter, PublishError } from './base.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The message in Telegram's HTML: the headline bold, the words, the links. */
export function telegramHtml(item) {
  // the disclosure first, then the headline in bold, then the line of what is new (unless it is the headline again)
  const PREFIX = /^AI-generated:\s*/;
  const text = String(item.text || '').trim();
  const disclosed = PREFIX.test(text);
  const body = text.replace(PREFIX, '').trim();
  const title = String(item.title || '').trim();
  const bare = (s) => s.replace(/[.!?]+$/, '').trim().toLowerCase();
  const lines = [`${disclosed ? 'AI-generated: ' : ''}${title ? `<b>${esc(title)}</b>` : esc(body)}`];
  if (title && body && bare(body) !== bare(title)) lines.push(esc(body));
  const links = (item.links || []).filter((l) => l?.url).map((l) => `<a href="${esc(l.url)}">${esc(l.label || l.url)}</a>`).join(' · ');
  return `${lines.join('\n')}${links ? `\n\n${links}` : ''}`.slice(0, 4096);
}

export class TelegramAdapter extends Adapter {
  static id = 'telegram';
  static label = 'Telegram';
  static env = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'];
  static limits = { perMinute: 20, perDay: 40 };

  plan(item) {
    if (item.media?.video) {
      const v = this.fileInfo(item.media.video);
      return [{ step: 'video', method: 'POST', url: 'https://api.telegram.org/bot<token>/sendVideo', body: { chat_id: '<TELEGRAM_CHAT_ID>', caption: telegramHtml(item).slice(0, 1024), parse_mode: 'HTML', supports_streaming: true }, file: v.path, note: v.bytes > 50 * 1024 * 1024 ? 'over 50 MB: too big for a bot' : undefined }];
    }
    const link = item.links?.[0]?.url;
    return [{ step: 'message', method: 'POST', url: 'https://api.telegram.org/bot<token>/sendMessage', body: { chat_id: '<TELEGRAM_CHAT_ID>', text: telegramHtml(item), parse_mode: 'HTML', ...(link ? { link_preview_options: { url: link, prefer_large_media: true } } : {}) } }];
  }

  async live(item) {
    const base = `https://api.telegram.org/bot${this.env.TELEGRAM_BOT_TOKEN}`;
    if (item.media?.video) {
      const bytes = fs.readFileSync(item.media.video);
      if (bytes.length > 50 * 1024 * 1024) throw new PublishError('the video is over the 50 MB a bot may upload', { retryable: false });
      const fd = new FormData();
      fd.append('chat_id', this.env.TELEGRAM_CHAT_ID);
      fd.append('caption', telegramHtml(item).slice(0, 1024));
      fd.append('parse_mode', 'HTML');
      fd.append('supports_streaming', 'true');
      fd.append('video', new Blob([bytes], { type: 'video/mp4' }), 'clip.mp4');
      const r = await this.request('POST', `${base}/sendVideo`, { body: fd });
      return { remoteId: r.body?.result?.message_id ?? null, url: null };
    }
    const link = item.links?.[0]?.url;
    const r = await this.request('POST', `${base}/sendMessage`, { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: this.env.TELEGRAM_CHAT_ID, text: telegramHtml(item), parse_mode: 'HTML', ...(link ? { link_preview_options: { url: link, prefer_large_media: true } } : {}) }) });
    return { remoteId: r.body?.result?.message_id ?? null, url: null };
  }
}
