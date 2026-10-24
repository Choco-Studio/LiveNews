// Where the playout streams (tools/playout/air.mjs; docs/publishing/playout.md §13.6): one encode, any number of
// destinations, each its own relay (a stream copy, its own connection, its own reconnects), so a platform that drops
// or refuses a key never takes the others off air.
//
// The destinations by name (--to youtube,tiktok): the server is the platform's (or its variable, when the platform
// gives each account its own), the key always from an environment variable, never from the command line, a log or a
// commit (the owner types it into /etc/globit24.env on their own screen).
//
//   youtube           the horizontal stream: YOUTUBE_STREAM_KEY on YouTube's RTMPS ingest
//   youtube-vertical  the vertical stream of YouTube's dual format (horizontal and vertical in one broadcast, one
//                     chat: Live Control Room > Stream > Dual stream > Encoder, the second key):
//                     YOUTUBE_VERTICAL_STREAM_KEY on the same ingest
//   tiktok            TikTok LIVE (portrait): the server URL and the key TikTok LIVE Center shows the account,
//                     TIKTOK_RTMP_URL and TIKTOK_STREAM_KEY (TikTok's keys can be temporary: a new one is loaded
//                     without stopping the others, SIGHUP to air.mjs)
// and one by hand: --rtmp <server> --key-env <VAR> (the platform read from the server's host).
//
//   parseDestinations(args, env)  -> { list: [destination], errors: [string] }
//   destination: { name, platform, server, keyEnv, url, shown, portrait }   (url carries the key: never print it;
//                portrait true/false for a named destination, null for one by hand)
//   orientationProblems(list, size)  the named destinations whose picture's shape the stream does not have
//   relayArgs(dest)               the relay's ffmpeg arguments (MPEG-TS on stdin, FLV to the destination)
//   redact(text, list)            the text with every destination's key replaced by <key>
//   envFile(path)                 the variables of a KEY=value file (for a reload)

export const YOUTUBE_INGEST = 'rtmps://a.rtmps.youtube.com:443/live2';

export const PRESETS = Object.freeze({
  youtube: Object.freeze({ platform: 'youtube', server: YOUTUBE_INGEST, serverEnv: 'YOUTUBE_RTMP_URL', keyEnv: 'YOUTUBE_STREAM_KEY', portrait: false }),
  'youtube-vertical': Object.freeze({ platform: 'youtube', server: YOUTUBE_INGEST, serverEnv: 'YOUTUBE_RTMP_URL', keyEnv: 'YOUTUBE_VERTICAL_STREAM_KEY', portrait: true }),
  tiktok: Object.freeze({ platform: 'tiktok', server: null, serverEnv: 'TIKTOK_RTMP_URL', keyEnv: 'TIKTOK_STREAM_KEY', portrait: true }),
});

/** The platform a server belongs to, from its host (youtube, tiktok, else other). */
export function platformOf(server) {
  const s = String(server || '').toLowerCase();
  if (/youtube\.com|youtube-nocookie|\.googlevideo\./.test(s)) return 'youtube';
  if (/tiktok/.test(s)) return 'tiktok';
  return 'other';
}

const SCHEMES = /^(rtmps?|srt):\/\//i;

/** The destination's full address: the server, then the key as its last path part (RTMP's own convention). */
const join = (server, key) => `${String(server).replace(/\/+$/, '')}/${key}`;

/**
 * The destinations asked for on the command line (`--to a,b` by name, and/or one `--rtmp <server> --key-env <VAR>`),
 * their servers and keys from `env`. Every problem is named (a missing key, a missing server, an unknown name, a server
 * that is not RTMP, RTMPS or SRT) and nothing is half set up. `allowFiles` (tests only) takes a plain path for a server.
 */
export function parseDestinations(args = [], env = process.env, { allowFiles = false } = {}) {
  const list = [];
  const errors = [];
  const opt = (name) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 && args[i + 1] !== undefined && !String(args[i + 1]).startsWith('--') ? String(args[i + 1]) : null;
  };
  const okServer = (server) => SCHEMES.test(server) || (allowFiles && /^\//.test(server));
  for (const name of String(opt('to') || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)) {
    const p = PRESETS[name];
    if (!p) {
      errors.push(`unknown destination "${name}" (known: ${Object.keys(PRESETS).join(', ')}; or --rtmp <server> --key-env <VAR>)`);
      continue;
    }
    if (list.some((d) => d.name === name)) continue;
    const server = (p.serverEnv && env[p.serverEnv]) || p.server;
    const key = env[p.keyEnv];
    if (!server) errors.push(`${name}: the server is read from ${p.serverEnv} (the server URL ${p.platform === 'tiktok' ? 'TikTok LIVE Center shows' : 'the platform gives'}), and it is not set`);
    else if (!okServer(server)) errors.push(`${name}: ${p.serverEnv} is not an rtmp://, rtmps:// or srt:// address`);
    if (!key) errors.push(`${name}: the stream key is read from ${p.keyEnv}, and it is not set`);
    if (!server || !key || !okServer(server)) continue;
    list.push({ name, platform: p.platform, server, keyEnv: p.keyEnv, url: join(server, key), shown: `${name} (${join(server, '<key>')})`, portrait: p.portrait });
  }
  const rtmp = opt('rtmp');
  if (rtmp) {
    const keyEnv = opt('key-env') || 'YOUTUBE_STREAM_KEY';
    const key = env[keyEnv];
    if (!okServer(rtmp)) errors.push(`--rtmp ${rtmp}: not an rtmp://, rtmps:// or srt:// address`);
    else if (!key) errors.push(`the stream key is read from an environment variable: --key-env <VAR> and ${keyEnv} set`);
    else {
      const platform = platformOf(rtmp);
      // (by hand: its picture's shape is the operator's to know, never checked)
      list.push({ name: platform === 'other' ? 'rtmp' : platform, platform, server: rtmp, keyEnv, url: join(rtmp, key), shown: `${platform} (${join(rtmp, '<key>')})`, portrait: null });
    }
  }
  return { list, errors };
}

/**
 * The relay's ffmpeg: the playout's MPEG-TS on stdin (H.264 with its headers before every keyframe, AAC in ADTS), copied
 * untouched into FLV for the destination (RTMP's container); SRT takes the TS as it is.
 */
export function relayArgs(dest) {
  const srt = /^srt:\/\//i.test(dest.server);
  return [
    '-hide_banner', '-loglevel', 'warning', '-nostdin', '-y',
    // (it joins at a keyframe with the tables in front: a second of the stream is enough to know it, not five)
    '-probesize', '1000000', '-analyzeduration', '1000000',
    '-f', 'mpegts', '-i', 'pipe:0',
    '-map', '0:v', '-map', '0:a', '-c', 'copy',
    ...(srt ? ['-f', 'mpegts'] : ['-bsf:a', 'aac_adtstoasc', '-f', 'flv', '-flvflags', 'no_duration_filesize']),
    dest.url,
  ];
}

/** `text` with every destination's key (and its full address) replaced by <key>. */
export function redact(text, list = []) {
  let s = String(text ?? '');
  for (const d of list) {
    const key = d.url.slice(d.url.lastIndexOf('/') + 1);
    if (key.length >= 4) s = s.split(key).join('<key>');
  }
  return s;
}

/** The KEY=value lines of a file (a comment or a blank line skipped; quotes round a value taken off). */
export function envFile(text) {
  const out = {};
  for (const line of String(text || '').split('\n')) {
    const m = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m || line.trim().startsWith('#')) continue;
    out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

/**
 * The named destinations that want the other shape of picture than `size` (WIDTHxHEIGHT) has: TikTok and YouTube's
 * vertical feed want a portrait stream, YouTube's main feed a landscape one. Empty when the size is unknown.
 */
export function orientationProblems(list = [], size = null) {
  const m = /^(\d+)x(\d+)$/.exec(String(size || ''));
  if (!m) return [];
  const portrait = Number(m[2]) > Number(m[1]);
  return list.filter((d) => d.portrait !== null && d.portrait !== undefined && d.portrait !== portrait).map((d) => `${d.name} wants a ${d.portrait ? 'portrait (vertical)' : 'landscape (horizontal)'} picture and this playout airs ${size}`);
}
