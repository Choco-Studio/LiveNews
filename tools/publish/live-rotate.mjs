#!/usr/bin/env node
// The live stream in blocks (owner, 23 Oct: YouTube archives a live broadcast only up to 12 hours, so the 24/7 stream
// is cut into three blocks a day, each kept as a video in the channel's Live tab). The same stream key throughout;
// only the YouTube broadcast bound to it changes.
//
//   node tools/publish/live-rotate.mjs --rotate   start the next block now (waits up to 15 min for a break first)
//   node tools/publish/live-rotate.mjs --ensure   if the stream is up with no live broadcast (a reboot, an auto-stop),
//                                                 start one; if the live block is over 11 h old, rotate it
//   node tools/publish/live-rotate.mjs --clean-probes  delete unlisted test broadcasts titled "rotation probe"
//   node tools/publish/live-rotate.mjs --status   the stream and its broadcasts
//
// Needs YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN (scope youtube) and YOUTUBE_STREAM_KEY (to find
// the stream; never printed). Refused unless PUBLISH_LIVE=1 (or --live). YouTube takes one live broadcast per stream
// at a time, and a new one bound to a stream that stays connected is refused too (403 "Invalid transition", tried
// 24 Oct): it starts (auto start) only after the encoder has been off for about a minute. So: the next block made
// and bound, the old one ended, the playout told to let go of the RTMP connection for 75 s (SIGUSR2 to air.mjs), and
// the new block goes live when it reconnects: about 1.5 minutes off air, at a break. Quota: about 300 of the 10,000
// daily units a rotation.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const API = 'https://www.googleapis.com/youtube/v3';
const env = process.env;
// the settings file, for a run by hand (systemd passes it already); what is set already wins
try {
  for (const line of fs.readFileSync('/etc/globit24.env', 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && env[m[1]] === undefined) env[m[1]] = m[2];
  }
} catch {
  /* not readable: the environment as given */
}
if (process.argv.includes('--live')) env.PUBLISH_LIVE = '1';
const mode = ['--rotate', '--ensure', '--status', '--clean-probes'].find((m) => process.argv.includes(m));
const TZ = 'Europe/London';
const MAX_AGE_H = 11;
const BREAK_WAIT_MS = 15 * 60_000;
const say = (m) => console.log(`[live-rotate ${new Date().toISOString().slice(11, 19)}] ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!mode) {
  console.error('usage: node tools/publish/live-rotate.mjs --rotate | --ensure | --status | --clean-probes');
  process.exit(1);
}
if (mode !== '--status' && env.PUBLISH_LIVE !== '1') {
  console.error('refused: changing the live broadcast needs PUBLISH_LIVE=1 (or --live)');
  process.exit(1);
}

let token = null;
async function auth() {
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({ client_id: env.YOUTUBE_CLIENT_ID, client_secret: env.YOUTUBE_CLIENT_SECRET, refresh_token: env.YOUTUBE_REFRESH_TOKEN, grant_type: 'refresh_token' }) });
  const j = await r.json();
  if (!j.access_token) throw new Error(`no access token (${j.error || r.status})`);
  token = j.access_token;
}
async function yt(method, url, body) {
  const r = await fetch(`${API}/${url}`, { method, headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  if (r.status === 204) return {};
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(`${method} ${url.split('?')[0]}: ${j.error?.code || r.status} ${j.error?.message || ''}`.trim());
  return j;
}

async function ourStream() {
  const s = await yt('GET', 'liveStreams?part=id,snippet,cdn,status&mine=true&maxResults=50');
  const it = (s.items || []).find((x) => x.cdn?.ingestionInfo?.streamName === env.YOUTUBE_STREAM_KEY);
  if (!it) throw new Error('no stream on the channel has YOUTUBE_STREAM_KEY');
  return it;
}
async function broadcasts(status, streamId) {
  const b = await yt('GET', `liveBroadcasts?part=id,snippet,status,contentDetails&broadcastStatus=${status}&broadcastType=all&maxResults=50`);
  return (b.items || []).filter((x) => x.contentDetails?.boundStreamId === streamId);
}
const ukTime = (d) => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
const ukDate = (d) => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' }).format(d);
const SLOTS = ['00:00', '08:00', '16:00'];
/** The block's title: from now (or from the slot it began at, if the timer's rotation waited for a break) to the next
 * 00:00, 08:00 or 16:00 UK; stepped hour by hour, so a clock change (a 7 or 9 hour block) still ends on a slot. */
function blockTitle(start = new Date()) {
  const hour = Math.floor(start.getTime() / 3600_000) * 3600_000;
  const from = SLOTS.includes(ukTime(new Date(hour))) && start.getTime() - hour < 20 * 60_000 ? new Date(hour) : start;
  let end = hour + 3600_000;
  while (!SLOTS.includes(ukTime(new Date(end)))) end += 3600_000;
  return `GLOBIT 24 · AI pixel-art news 24/7 · ${ukDate(from)}, ${ukTime(from)}–${ukTime(new Date(end))} UK`;
}

/** A new broadcast like `like` (its description, privacy, settings), bound to the stream, not yet live. */
async function prepareBlock(stream, like, { title = blockTitle(), privacy } = {}) {
  const ins = await yt('POST', 'liveBroadcasts?part=id,snippet,status,contentDetails', {
    snippet: { title, description: like?.snippet?.description || '', scheduledStartTime: new Date().toISOString() },
    status: { privacyStatus: privacy || like?.status?.privacyStatus || 'public', selfDeclaredMadeForKids: false },
    contentDetails: {
      enableAutoStart: true,
      enableAutoStop: true,
      enableDvr: like?.contentDetails?.enableDvr ?? true,
      enableEmbed: like?.contentDetails?.enableEmbed ?? true,
      recordFromStart: true,
      latencyPreference: like?.contentDetails?.latencyPreference || 'normal',
      monitorStream: { enableMonitorStream: false },
    },
  });
  say(`created ${ins.id} "${title}" (${ins.status.privacyStatus})`);
  await yt('POST', `liveBroadcasts/bind?id=${ins.id}&streamId=${stream.id}&part=id,contentDetails`);
  say(`bound ${ins.id} to the stream`);
  return ins;
}
/** Take a bound broadcast live (auto start may do it first). */
async function goLive(b) {
  let last = '';
  for (let i = 0; i < 48; i++) {
    const [x] = (await yt('GET', `liveBroadcasts?part=id,status&id=${b.id}`)).items || [];
    const st = x?.status?.lifeCycleStatus;
    if (st === 'live') return say(`${b.id} is live`);
    if (st === 'ready' || st === 'testing') {
      try {
        await yt('POST', `liveBroadcasts/transition?broadcastStatus=live&id=${b.id}&part=id,status`);
      } catch (err) {
        if (err.message !== last) say(`transition: ${(last = err.message)} (trying again)`);
      }
    }
    await sleep(5000);
  }
  throw new Error(`${b.id} did not go live in 4 minutes (the ensure timer tries again)`);
}
async function endBlock(b) {
  await yt('POST', `liveBroadcasts/transition?broadcastStatus=complete&id=${b.id}&part=id,status`);
  say(`ended ${b.id} "${b.snippet.title}" (archived in the Live tab)`);
}

/** Wait for a break (an ad break or the filler card) on air, so a block never ends mid-story. */
async function waitForBreak() {
  const file = path.join(root, 'data', 'playout', 'air-status.json');
  const t0 = Date.now();
  while (Date.now() - t0 < BREAK_WAIT_MS) {
    try {
      const on = JSON.parse(fs.readFileSync(file, 'utf8')).onAir || {};
      if (on.kind === 'filler' || /^break$/i.test(on.title || '') || on.kind === 'break') return say(`on air: ${on.title || on.kind}; rotating now`);
    } catch {
      /* no status yet */
    }
    await sleep(2000);
  }
  say('no break in 15 minutes; rotating anyway');
}

/** Have the playout drop its RTMP connection for 75 s (air.mjs, SIGUSR2), so YouTube auto starts the bound block. */
function holdEncoder() {
  const st = JSON.parse(fs.readFileSync(path.join(root, 'data', 'playout', 'air-status.json'), 'utf8'));
  // (an air.mjs without the handler would be killed by the signal)
  if (!st.canHold || !st.pid) throw new Error('the playout on air cannot hold (deploy, then restart globit24-live)');
  process.kill(st.pid, 'SIGUSR2');
  say(`encoder off for 75 s (air.mjs ${st.pid})`);
}
/** Any other broadcast waiting on our stream could take the auto start from `keep`, so it goes: the ready
 * "Emisión en directo de …" YouTube Studio makes after each end, or a block left by a rotation cut short. */
async function dropOtherUpcoming(stream, keep) {
  for (const b of await broadcasts('upcoming', stream.id)) {
    if (b.id !== keep.id) {
      await yt('DELETE', `liveBroadcasts?id=${b.id}`);
      say(`deleted the waiting ${b.id} "${b.snippet.title}"`);
    }
  }
}
async function rotate(stream, live) {
  const fresh = await prepareBlock(stream, live[0] || null);
  for (const b of live) await endBlock(b);
  await dropOtherUpcoming(stream, fresh);
  holdEncoder();
  await goLive(fresh);
}

await auth();
const stream = await ourStream();
const live = await broadcasts('active', stream.id);
const streamUp = stream.status?.streamStatus === 'active';

if (mode === '--clean-probes') {
  for (const st of ['upcoming', 'active', 'completed']) {
    const b = await yt('GET', `liveBroadcasts?part=id,snippet,status&broadcastStatus=${st}&broadcastType=all&maxResults=50`);
    for (const x of b.items || []) {
      if (x.status.privacyStatus !== 'public' && /rotation probe/.test(x.snippet.title)) {
        await yt('DELETE', `liveBroadcasts?id=${x.id}`);
        say(`deleted probe ${x.id} (${x.status.lifeCycleStatus})`);
      }
    }
  }
} else if (mode === '--status') {
  console.log(`stream ${stream.id}: ${stream.status?.streamStatus} (${stream.status?.healthStatus?.status || '?'})`);
  for (const b of live) console.log(`live ${b.id} "${b.snippet.title}" since ${b.snippet.actualStartTime} (${b.status.privacyStatus})`);
  for (const b of await broadcasts('upcoming', stream.id)) console.log(`upcoming ${b.id} "${b.snippet.title}" ${b.status.lifeCycleStatus}`);
} else if (mode === '--rotate') {
  if (!streamUp) throw new Error('the stream is not up: nothing to rotate');
  await waitForBreak();
  await rotate(stream, await broadcasts('active', stream.id));
} else if (mode === '--ensure') {
  if (!streamUp) say('the stream is not up; nothing to do');
  else if (!live.length) {
    // a block made but not taken live (a rotation cut short) is used first
    const waiting = (await broadcasts('upcoming', stream.id)).find((b) => b.status.privacyStatus === 'public' && /^GLOBIT 24/.test(b.snippet.title));
    say(`the stream is up with no live broadcast: ${waiting ? `taking ${waiting.id} live` : 'starting a block'}`);
    const b = waiting || (await prepareBlock(stream, (await yt('GET', 'liveBroadcasts?part=id,snippet,status,contentDetails&broadcastStatus=completed&broadcastType=all&maxResults=1')).items?.[0]));
    await dropOtherUpcoming(stream, b);
    holdEncoder();
    await goLive(b);
  } else {
    const age = (Date.now() - Date.parse(live[0].snippet.actualStartTime || Date.now())) / 3600_000;
    if (age > MAX_AGE_H) {
      say(`the live block is ${age.toFixed(1)} h old (over ${MAX_AGE_H} h): rotating`);
      await rotate(stream, live);
    }
  }
}
