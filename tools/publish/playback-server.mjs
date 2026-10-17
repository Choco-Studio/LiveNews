#!/usr/bin/env node
// A local playback server for recordings (server/publish/playback.js): the channel's page, one saved episode and its
// recorded voices, nothing else (no feeds, no producer, no network).
//
//   node tools/publish/playback-server.mjs --port 8797 --item episode.json [--voices data/voice] [--pictures dir]
//   node tools/record.mjs --url "http://127.0.0.1:8797/?autostart=1&voice=tts" --seconds 60 --out clip.mp4
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPlaybackServer } from '../../server/publish/playback.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const opt = (name, def = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : def;
};
const items = [];
for (let i = 0; i < args.length; i++) if (args[i] === '--item') items.push(JSON.parse(fs.readFileSync(args[i + 1], 'utf8')));
const pb = createPlaybackServer({
  root,
  items,
  voiceDir: path.resolve(opt('voices', path.join(root, 'data', 'voice'))),
  pictureDir: opt('pictures') ? path.resolve(opt('pictures')) : null,
  log: (m) => console.log(m),
});
const port = await pb.listen(Number(opt('port', 8797)));
console.log(`[playback] http://127.0.0.1:${port} (${items.length} item${items.length === 1 ? '' : 's'})`);
process.on('SIGINT', () => pb.close().then(() => process.exit(0)));
process.on('SIGTERM', () => pb.close().then(() => process.exit(0)));
