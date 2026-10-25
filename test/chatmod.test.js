// The live chat's moderator (docs/publishing/chat-moderation.md): its rules, its decisions and its quota, and the whole
// process against local stand-ins for YouTube (the REST API and the gRPC stream), dry and live.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { classify, phoneIn, linksIn, normalize } from '../server/publish/chat/rules.js';
import { ChatModerator, QuotaLedger, POLICY, COST, quotaDay } from '../server/publish/chat/moderator.js';
import { normalizeMessage, PROTO } from '../server/publish/chat/youtube.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const msg = (text, author = {}) => ({ id: `m${Math.random()}`, type: 'text', text, author: { channelId: 'UCviewer', name: 'Viewer', ...author } });
const rules = (text, author) => classify(msg(text, author)).map((v) => `${v.rule}:${v.severity}`);

test('the rules: what harms viewers goes, opinions stay', () => {
  // kept: news talk, criticism, swearing that is not a slur, shouting, numbers, other languages
  for (const t of ['Great report on the Bitcoin crash today', 'Telegram CEO arrested? wow', 'I lost money on bitcoin, my wallet is empty lol', 'this channel is garbage and the AI is biased', 'wtf this is so damn boring', 'ESTO ES UNA VERGÜENZA DE CANAL', 'the deficit is 1.250.000 euros', 'the deficit is 1 250 000 euros', 'from 2020-2025 prices rose', 'Spain vs U.S. trade, e.g. tariffs, node.js, St. Louis', 'Que pasa en Gaza hoy?', '😂😂😂 good one',
    // (each of these was wrongly caught once: 25 Oct, 82 everyday messages read through the rules)
    'the dot com bubble', 'my channel is called X', 'pi is 3.14159265', 'dm me? no thanks', 'asp.net', 'FIRST!!!',
    'I would kill for a coffee right now', 'he was shot dead by police', 'Free Palestine', 'Amazon earned $20 billion a quarter',
    'Nobel prize winner announced', 'giveaway? lol no', 'follow the money', 'check out the BBC article', 'call me Ishmael']) assert.deepEqual(rules(t), [], t);
  // removed
  assert.deepEqual(rules('DM me on WhatsApp +1 555 123 4567 for crypto signals'), ['scam:high', 'contact:medium']);
  assert.deepEqual(rules('Invest with Mr Daniel, contact him on telegram, I earned $5000 a week'), ['scam:high'], 'a messaging app is somewhere to go');
  assert.deepEqual(rules('visit www.freecoins.xyz now'), ['link:medium']);
  assert.deepEqual(rules('free money at bit.ly/abc'), ['link:medium']);
  assert.deepEqual(rules('my site is cash dot com'), ['link:medium'], 'an address spelt out');
  assert.deepEqual(rules('call 612 345 678 now'), ['contact:medium'], 'a Spanish number after "call"');
  assert.deepEqual(rules('email me at john dot smith at gmail dot com'), ['link:medium', 'contact:medium']);
  assert.deepEqual(rules('check out my channel guys sub4sub'), ['selfpromo:low']);
  assert.deepEqual(rules('send nudes'), ['sexual:medium']);
  assert.deepEqual(rules('I will kill you all'), ['threat:high']);
  assert.deepEqual(rules('te voy a matar'), ['threat:high']);
  assert.deepEqual(rules('kys'), ['threat:high']);
  assert.deepEqual(rules('n1gg3r'), ['hate:high'], 'leetspeak read back');
  assert.deepEqual(rules('class assessment, scunthorpe'), [], 'whole words only');
  assert.deepEqual(rules('a'.repeat(30)), ['chars:low']);
  assert.deepEqual(rules('hello', { name: 'GLOBIT 24 Official' }), ['impersonation:high']);
  assert.deepEqual(rules('hello', { name: 'YouTube Support Team' }), ['impersonation:medium']);
  // the owner and the moderators are never judged; the channel's own site may be allowed
  assert.deepEqual(rules('see www.globit24.tv', { owner: true }), []);
  assert.deepEqual(rules('kys', { moderator: true }), []);
  assert.deepEqual(classify(msg('see www.globit24.tv'), { allowDomains: ['globit24.tv'] }), []);
  // the pieces
  assert.equal(normalize('𝐟𝐫𝐞𝐞 Crypto'), 'free crypto');
  assert.equal(phoneIn('ring +44 20 7946 0958'), '+44 20 7946 0958');
  assert.equal(phoneIn('there were 1,500,000 people'), null);
  assert.deepEqual(linksIn('go to t.me/xyz'), ['t.me']);
});

test('the decisions: removed, then out for longer; a scam bot banned; threats and slurs out for a day and flagged', () => {
  let now = Date.parse('2026-10-25T12:00:00Z');
  const mod = new ChatModerator({ ledger: new QuotaLedger({ now: () => now }), now: () => now });
  const act = (text, author) => {
    const m = msg(text, author);
    const d = mod.consider(m);
    mod.record(d, m, { deleted: d.action !== 'keep', banned: d.action === 'ban' || d.action === 'timeout' });
    now += 1000;
    return [d.action, d.seconds || 0];
  };
  assert.deepEqual(act('visit www.x.xyz'), ['delete', 0], 'a first strike: removed');
  assert.deepEqual(act('visit www.y.xyz'), ['timeout', 300], 'a second within 30 minutes: 5 minutes out');
  assert.deepEqual(act('visit www.z.xyz'), ['timeout', 3600]);
  assert.deepEqual(act('visit www.w.xyz'), ['timeout', 86400]);
  now += 31 * 60_000;
  assert.deepEqual(act('visit www.v.xyz'), ['delete', 0], 'strikes last 30 minutes');
  assert.deepEqual(act('DM me on WhatsApp for crypto signals', { channelId: 'UCbot' }), ['ban', 0]);
  const threat = mod.consider(msg('te voy a matar', { channelId: 'UCangry' }));
  assert.deepEqual([threat.action, threat.seconds, threat.flag], ['timeout', 86400, true]);
  assert.equal(mod.consider(msg('hello there')).action, 'keep');
  assert.equal(mod.consider(msg('kys', { owner: true })).exempt, true);
  // the same message three times in two minutes
  const flood = new ChatModerator({ now: () => now });
  const a = { channelId: 'UCflood' };
  assert.equal(flood.consider(msg('FIRST!!', a)).action, 'keep');
  assert.equal(flood.consider(msg('first', a)).action, 'keep');
  const third = flood.consider(msg('First', a));
  assert.deepEqual([third.action, third.rule], ['delete', 'flood']);
});

test('the quota: the worst first, a ban the quota cannot pay becomes a removal, and the day turns at midnight Pacific', () => {
  let now = Date.parse('2026-10-25T12:00:00Z');
  const ledger = new QuotaLedger({ cap: 1000, now: () => now });
  const mod = new ChatModerator({ ledger, now: () => now });
  ledger.spend('read', 590);
  // 610 of 1000: a low-severity removal may use 60 %: kept (logged as not acted); a medium one still goes
  const low = mod.consider(msg('sub4sub', { channelId: 'UCa' }));
  assert.deepEqual([low.action, low.degraded], ['keep', 'quota']);
  assert.equal(mod.consider(msg('www.x.xyz', { channelId: 'UCb' })).action, 'delete');
  // a scam bot needs 220 units: at 900 used, it is removed, not banned
  ledger.spend('read', 290);
  const bot = mod.consider(msg('DM me on WhatsApp for crypto signals', { channelId: 'UCbot' }));
  assert.deepEqual([bot.action, bot.degraded], ['delete', 'quota']);
  // four bans a day at most
  const rich = new ChatModerator({ now: () => now });
  for (let i = 0; i < POLICY.bansPerDay; i++) {
    const m = msg('DM me on WhatsApp for crypto signals', { channelId: `UCbot${i}` });
    const d = rich.consider(m);
    assert.equal(d.action, 'ban');
    rich.record(d, m, { deleted: true, banned: true });
  }
  const fifth = rich.consider(msg('DM me on WhatsApp for crypto signals', { channelId: 'UCbot9' }));
  assert.deepEqual([fifth.action, fifth.degraded], ['timeout', 'bans-per-day']);
  // midnight Pacific: 07:00 or 08:00 UTC
  assert.equal(quotaDay(Date.parse('2026-10-25T06:59:00Z')), '2026-10-24');
  assert.equal(quotaDay(Date.parse('2026-10-25T07:01:00Z')), '2026-10-25');
  now = Date.parse('2026-10-26T08:00:00Z');
  assert.equal(ledger.used(), 0, 'a new quota day');
  assert.equal(COST.ban, 200);
});

test('a message from the REST API and from the gRPC stream read the same', () => {
  const rest = normalizeMessage({ id: 'a', snippet: { type: 'textMessageEvent', displayMessage: 'hi', textMessageDetails: { messageText: 'hi' }, publishedAt: '2026-10-25T12:00:00Z' }, authorDetails: { channelId: 'UC1', displayName: 'Ann', isChatModerator: true } });
  const grpc = normalizeMessage({ id: 'a', snippet: { type: 'TEXT_MESSAGE_EVENT', displayMessage: 'hi', textMessageDetails: { messageText: 'hi' }, publishedAt: '2026-10-25T12:00:00Z' }, authorDetails: { channelId: 'UC1', displayName: 'Ann', isChatModerator: true } });
  assert.deepEqual(rest, grpc);
  assert.equal(rest.type, 'text');
  assert.equal(rest.author.moderator, true);
  assert.equal(normalizeMessage({ snippet: { type: 'SUPER_CHAT_EVENT', superChatDetails: { userComment: 'great show' } } }).text, 'great show');
});

// ---------------------------------------------------------------- the whole process, against local stand-ins

async function standIns(messages) {
  const calls = [];
  const srv = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => {
      calls.push({ method: req.method, url: req.url, auth: req.headers.authorization || null, body: body ? (() => { try { return JSON.parse(body); } catch { return body; } })() : null });
      const send = (code, j) => {
        res.writeHead(code, { 'content-type': 'application/json' });
        res.end(j === undefined ? '' : JSON.stringify(j));
      };
      if (req.url === '/token') return send(200, { access_token: 'tok', expires_in: 3600 });
      if (req.url.startsWith('/youtube/v3/liveBroadcasts')) return send(200, { items: [{ id: 'b1', snippet: { liveChatId: 'chat1', title: 'GLOBIT 24 block' }, status: { lifeCycleStatus: 'live' } }] });
      if (req.method === 'DELETE') return send(204);
      return send(200, {});
    });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const grpc = await import('@grpc/grpc-js');
  const loader = await import('@grpc/proto-loader');
  const def = loader.loadSync(PROTO, { keepCase: false, longs: String, enums: String, defaults: false, oneofs: true });
  const Service = grpc.loadPackageDefinition(def).youtube.api.v3.V3DataLiveChatMessageService;
  const g = new grpc.Server();
  const streams = [];
  g.addService(Service.service, {
    StreamList: (call) => {
      streams.push({ auth: call.metadata.get('authorization')[0], request: call.request });
      call.write({ nextPageToken: 'p1', items: messages });
      // (held open, as YouTube does, until the client goes)
      call.on('cancelled', () => {});
    },
  });
  const port = await new Promise((r, j) => g.bindAsync('127.0.0.1:0', grpc.ServerCredentials.createInsecure(), (e, p) => (e ? j(e) : r(p))));
  return { calls, streams, http: srv.address().port, grpcPort: port, close: () => (srv.close(), g.forceShutdown()) };
}
const now = () => new Date().toISOString();
const wire = (id, text, author = {}) => ({ id, snippet: { type: 'TEXT_MESSAGE_EVENT', displayMessage: text, textMessageDetails: { messageText: text }, publishedAt: now(), authorChannelId: author.channelId || `UC${id}` }, authorDetails: { channelId: author.channelId || `UC${id}`, displayName: author.name || `viewer ${id}`, isChatOwner: !!author.owner, isChatModerator: false } });
const MESSAGES = () => [
  wire('own', 'our site: www.globit24.example', { owner: true, name: 'GLOBIT 24' }),
  wire('ok', 'Great coverage of the storm, thanks!'),
  wire('link', 'free stuff at www.freecoins.xyz'),
  wire('bot', 'DM me on WhatsApp +1 555 123 4567 for crypto signals'),
  wire('threat', 'I will kill you'),
];
function run(env, s) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [path.join(root, 'tools/publish/chatmod.mjs'), '--for', '3'], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    p.stdout.on('data', (d) => (log += d));
    p.stderr.on('data', (d) => (log += d));
    const t = setTimeout(() => p.kill('SIGKILL'), 20_000);
    p.on('exit', (code) => (clearTimeout(t), resolve({ code, log })));
  });
}
const envFor = (s, dir, extra = {}) => ({ YOUTUBE_API_BASE: `http://127.0.0.1:${s.http}/youtube/v3`, GOOGLE_OAUTH_URL: `http://127.0.0.1:${s.http}/token`, YOUTUBE_GRPC_TARGET: `127.0.0.1:${s.grpcPort}`, YOUTUBE_GRPC_INSECURE: '1', YOUTUBE_CLIENT_ID: 'id', YOUTUBE_CLIENT_SECRET: 'secret', YOUTUBE_REFRESH_TOKEN: 'refresh', CHATMOD_DIR: dir, GLOBIT_ENV_FILE: path.join(dir, 'none.env'), CHATMOD_ACTION_GAP_MS: '0', NODE_NO_WARNINGS: '1', PUBLISH_LIVE: '', CHAT_MOD: '', ...extra });

test('the process, dry: it reads the stream and logs what it would do, and touches nothing', { timeout: 30_000 }, async () => {
  const s = await standIns(MESSAGES());
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatmod-dry-'));
  try {
    const r = await run(envFor(s, dir), s);
    assert.equal(r.code, 0, r.log);
    assert.equal(s.streams[0]?.auth, 'Bearer tok', 'the stream carries the OAuth token');
    assert.deepEqual(s.streams[0].request.liveChatId, 'chat1');
    assert.deepEqual(s.calls.filter((c) => c.method !== 'GET' && c.url !== '/token'), [], 'no removal, no ban, no message');
    const lines = fs.readFileSync(path.join(dir, 'chatmod.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.deepEqual(lines.map((l) => [l.id, l.action, l.dry]), [['link', 'delete', true], ['bot', 'ban', true], ['threat', 'timeout', true]]);
    // the summary, in Spanish, says it was a test
    const sum = await new Promise((resolve) => {
      const p = spawn(process.execPath, [path.join(root, 'tools/publish/chatmod.mjs'), '--summary'], { env: { ...process.env, ...envFor(s, dir) } });
      let out = '';
      p.stdout.on('data', (d) => (out += d));
      p.on('exit', () => resolve(out));
    });
    assert.match(sum, /prueba: no ha tocado nada/);
    assert.match(sum, /3 mensajes quitados/);
    assert.match(sum, /Para que lo mires tú/);
    assert.match(sum, /I will kill you/);
  } finally {
    s.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the process, live: removes, bans the bot, times out the threat, greets the chat once, leaves the owner and the viewer alone', { timeout: 30_000 }, async () => {
  const s = await standIns(MESSAGES());
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatmod-live-'));
  try {
    const r = await run(envFor(s, dir, { PUBLISH_LIVE: '1', CHAT_MOD: '1' }), s);
    assert.equal(r.code, 0, r.log);
    const acts = s.calls.filter((c) => c.method !== 'GET' && c.url !== '/token');
    const deleted = acts.filter((c) => c.method === 'DELETE').map((c) => new URL(c.url, 'http://x').searchParams.get('id'));
    assert.deepEqual(deleted, ['link', 'bot', 'threat']);
    const bans = acts.filter((c) => c.url.startsWith('/youtube/v3/liveChat/bans')).map((c) => c.body.snippet);
    assert.deepEqual(bans.map((b) => [b.bannedUserDetails.channelId, b.type, b.banDurationSeconds ?? null]), [['UCbot', 'permanent', null], ['UCthreat', 'temporary', 86400]]);
    const said = acts.filter((c) => c.method === 'POST' && c.url.startsWith('/youtube/v3/liveChat/messages'));
    assert.equal(said.length, 1, 'the rules message, once');
    assert.match(said[0].body.snippet.textMessageDetails.messageText, /moderated automatically/);
    assert.ok(said[0].body.snippet.textMessageDetails.messageText.length <= 200);
    const q = JSON.parse(fs.readFileSync(path.join(dir, 'chatmod-quota.json'), 'utf8'));
    assert.equal(q.byKind.delete, 60);
    assert.equal(q.byKind.ban, 400);
    assert.equal(q.byKind.say, 20);
    const st = JSON.parse(fs.readFileSync(path.join(dir, 'chatmod-status.json'), 'utf8'));
    assert.equal(st.mode, 'live');
    assert.equal(st.today.removed, 3);
    // a second run in the same chat: greeted already, and the messages it judged are not judged again
    s.calls.length = 0;
    await run(envFor(s, dir, { PUBLISH_LIVE: '1', CHAT_MOD: '1' }), s);
    assert.deepEqual(s.calls.filter((c) => c.method !== 'GET' && c.url !== '/token'), []);
    assert.equal(s.streams.at(-1).request.pageToken, 'p1', 'it resumes from its page token');
  } finally {
    s.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
