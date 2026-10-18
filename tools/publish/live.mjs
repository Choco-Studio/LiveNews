#!/usr/bin/env node
// The live supervisor (server/publish/live.js): tools/stream.mjs kept up, restarted when it ends or stalls, and the
// live video's title kept saying what is on (a dry run unless every live switch is on).
//
// Test (a file per run, nothing leaves the machine):
//   node tools/publish/live.mjs --url "http://127.0.0.1:8080/?autostart=1&voice=tts" --out /tmp/live-{n}.flv \
//        [--seconds 120] [--for 300] [--channel http://127.0.0.1:8080] [--status data/publish/live-status.json]
// On air (the owner's guide, docs/publishing/setup.md §8; refused unless PUBLISH_LIVE=1):
//   PUBLISH_LIVE=1 node tools/publish/live.mjs --url ... --rtmp rtmp://a.rtmp.youtube.com/live2 --key-env YOUTUBE_STREAM_KEY
//
// --seconds: each streamer run's length (a test); --for: the supervisor's own length (a test), then it stops.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LiveSupervisor } from '../../server/publish/live.js';
import { YouTubeAdapter } from '../../server/publish/adapters/youtube.js';
import { PublishQueue } from '../../server/publish/queue.js';
import { usingStub } from '../../server/publish/compliance.js';
import { isManual } from '../../server/publish/mode.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const opt = (name, def = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined && !args[i + 1].startsWith('--') ? args[i + 1] : def;
};
const url = opt('url');
const out = opt('out');
const rtmp = opt('rtmp');
if (!url || (!out && !rtmp)) {
  console.error('usage: node tools/publish/live.mjs --url <channel page> (--out <file-{n}.flv> | --rtmp <server> --key-env <VAR>) [--for s]');
  process.exit(1);
}
// the beta (PUBLISH_MODE=manual) has no live stream: the supervisor never streams to a server (a test into files only)
if (rtmp && isManual()) {
  console.error('refused: PUBLISH_MODE=manual (the beta, published by hand) has no live stream (docs/publishing/beta.md). A test into files (--out) is allowed.');
  process.exit(1);
}
if (rtmp && process.env.PUBLISH_LIVE !== '1') {
  console.error('refused: streaming to a server needs PUBLISH_LIVE=1 (docs/publishing/setup.md §8). Test with --out first.');
  process.exit(1);
}
const queue = new PublishQueue({ dir: path.join(root, 'data', 'publish') });
const s = queue.settings();
const live = !!rtmp && !isManual() && process.env.PUBLISH_LIVE === '1' && s.dryRun === false && !!s.live?.youtube && !usingStub;
const youtube = new YouTubeAdapter({ env: process.env, dryRun: !live });
const streamArgs = [path.join(root, 'tools', 'stream.mjs'), '--url', url];
if (out) streamArgs.push('--out', path.resolve(out));
else streamArgs.push('--rtmp', rtmp, '--key-env', opt('key-env', 'YOUTUBE_STREAM_KEY'));
if (opt('seconds')) streamArgs.push('--seconds', opt('seconds'));
const channelUrl = opt('channel', new URL(url).origin);
const sup = new LiveSupervisor({
  streamArgs,
  channelUrl,
  statusFile: path.resolve(opt('status', path.join(root, 'data', 'publish', 'live-status.json'))),
  outFile: out ? path.resolve(out) : null,
  youtube,
  live,
  videoId: process.env.YOUTUBE_LIVE_VIDEO_ID || null,
  outbox: path.join(path.dirname(path.resolve(opt('status', path.join(root, 'data', 'publish', 'live-status.json')))), 'outbox-live.jsonl'),
  cwd: root,
  log: (m) => console.log(new Date().toISOString().slice(11, 19), m),
});
await sup.start();
const stop = async () => {
  await sup.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
if (Number(opt('for')) > 0) setTimeout(stop, Number(opt('for')) * 1000);
