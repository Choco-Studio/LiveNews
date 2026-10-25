#!/usr/bin/env node
// The live chat's moderator (owner, 25 Oct: "añade el moderador de chat del directo"; docs/publishing/chat-moderation.md).
// It follows the channel's live broadcast (a new block every 8 hours: tools/publish/live-rotate.mjs; with YouTube's dual
// format both feeds share one chat), reads its chat as it comes (liveChatMessages.streamList over gRPC: one call held
// open; polled when the stream cannot be had), and removes, times out or bans by server/publish/chat/moderator.js.
//
//   node tools/publish/chatmod.mjs              a dry run: reads the chat and logs what it would do, touches nothing
//   PUBLISH_LIVE=1 CHAT_MOD=1 node tools/publish/chatmod.mjs   on the owner's word: it acts
//   node tools/publish/chatmod.mjs --summary [--day 2026-10-25]   the day's summary, in Spanish, for the owner
//   node tools/publish/chatmod.mjs --status     where it is (data/publish/chatmod-status.json)
//
// Needs YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN (scope youtube: the channel's owner or one of its
// chat moderators), from /etc/globit24.env (systemd passes it; a run by hand reads it). Settings: CHAT_QUOTA_UNITS
// (3000: its share of the project's 10,000 units a day), CHAT_ANNOUNCE (1: one message of the rules at the start of each
// broadcast's chat; 0 for none), CHAT_ALLOW_DOMAINS (hosts never removed as links, comma-separated).
//
// What it keeps (data/publish/): chatmod.jsonl, one line per message it removed or would have (the author's channel and
// name, the words, the rule, what it did; 30 days, for the owner's review and for appeals: nothing of the messages it
// leaves alone); chatmod-status.json; chatmod-quota.json (units spent today); chatmod-state.json (where it was in each
// chat, the chats it has greeted).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { YouTubeChatApi } from '../../server/publish/chat/youtube.js';
import { ChatModerator, QuotaLedger, POLICY, COST, quotaDay } from '../../server/publish/chat/moderator.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const opt = (name, def = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined && !args[i + 1].startsWith('--') ? args[i + 1] : def;
};
const env = process.env;
// the settings file, for a run by hand (systemd passes it already); what is set already wins
try {
  for (const line of fs.readFileSync(env.GLOBIT_ENV_FILE || '/etc/globit24.env', 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && env[m[1]] === undefined) env[m[1]] = m[2];
  }
} catch {
  /* not readable: the environment as given */
}
const DIR = path.resolve(env.CHATMOD_DIR || path.join(root, 'data', 'publish'));
const LOG = path.join(DIR, 'chatmod.jsonl');
const STATUS = path.join(DIR, 'chatmod-status.json');
const QUOTA = path.join(DIR, 'chatmod-quota.json');
const STATE = path.join(DIR, 'chatmod-state.json');
const say = (m) => console.log(`[chatmod ${new Date().toISOString().slice(11, 19)}] ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const KEEP_DAYS = 30;
const OWNER_TZ = 'Europe/Madrid';
const ownerDay = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: OWNER_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));

const RULE_ES = { link: 'enlaces', contact: 'teléfonos o correos', scam: 'estafas', selfpromo: 'autopromoción', sexual: 'spam sexual', hate: 'insultos de odio', threat: 'amenazas', impersonation: 'suplantación', flood: 'mensajes repetidos', chars: 'muros de caracteres', 'blocked-word': 'palabras bloqueadas' };
const ACTION_ES = { delete: 'borrado', timeout: 'expulsado un rato', ban: 'expulsado para siempre', keep: 'sin tocar' };

function readLog() {
  try {
    return fs.readFileSync(LOG, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------- the summary and the status, then out

if (args.includes('--summary')) {
  const day = opt('day', ownerDay(Date.now()));
  const lines = readLog().filter((l) => ownerDay(l.at) === day);
  const acted = lines.filter((l) => l.action !== 'keep');
  const out = [`Moderación del chat del directo, ${day}${lines.some((l) => l.dry) ? ' (prueba: no ha tocado nada, solo apunta lo que haría)' : ''}`];
  if (!lines.length) out.push('Nada que quitar hoy.');
  else {
    const by = (k) => Object.entries(acted.reduce((m, l) => ((m[l[k]] = (m[l[k]] || 0) + 1), m), {})).sort((a, b) => b[1] - a[1]);
    out.push(`${acted.length} mensajes quitados${lines.length > acted.length ? ` (y ${lines.length - acted.length} que habría quitado si quedara cuota)` : ''}.`);
    out.push(`Por qué: ${by('rule').map(([r, n]) => `${RULE_ES[r] || r} ${n}`).join(', ')}.`);
    out.push(`Qué se hizo: ${by('action').map(([a, n]) => `${ACTION_ES[a] || a} ${n}`).join(', ')}.`);
    const flagged = lines.filter((l) => l.flag);
    if (flagged.length) {
      out.push('', 'Para que lo mires tú (amenazas, odio, suplantación):');
      for (const l of flagged.slice(0, 20)) out.push(`· ${new Date(l.at).toLocaleTimeString('es-ES', { timeZone: OWNER_TZ, hour: '2-digit', minute: '2-digit' })} ${l.author?.name || '?'}: «${String(l.text || '').slice(0, 120)}» (${RULE_ES[l.rule] || l.rule}, ${ACTION_ES[l.action] || l.action})`);
    }
  }
  try {
    const q = JSON.parse(fs.readFileSync(QUOTA, 'utf8'));
    out.push('', `Cuota de YouTube usada hoy por el moderador: ${q.used} de ${Number(env.CHAT_QUOTA_UNITS) || POLICY.dayUnits} unidades.`);
  } catch {
    /* no ledger yet */
  }
  console.log(out.join('\n'));
  process.exit(0);
}
if (args.includes('--status')) {
  try {
    console.log(fs.readFileSync(STATUS, 'utf8'));
  } catch {
    console.log('no status yet');
  }
  process.exit(0);
}

// ---------------------------------------------------------------- the moderator

const LIVE = env.PUBLISH_LIVE === '1' && env.CHAT_MOD === '1';
const FOR = Number(opt('for', 0));
const CHECK_MS = Number(env.CHATMOD_CHECK_MS) || 5 * 60_000; // the live broadcast looked up again (a new block)
const IDLE_MS = Number(env.CHATMOD_IDLE_MS) || 5 * 60_000; // no live broadcast: look again this much later
const HISTORY_MS = 15 * 60_000; // what a stream hands over from before it opened: only this recent is judged
const READ_SHARE = 0.4; // reading may use this share of the day's units (the rest is for acting)
const ANNOUNCE = env.CHAT_ANNOUNCE !== '0';
const RULES_LINE = 'Welcome to GLOBIT 24: AI-produced news, 24 hours a day. This chat is moderated automatically: links, spam, contact details, threats and hate are removed. Be kind.';
const allowDomains = String(env.CHAT_ALLOW_DOMAINS || '').split(',').map((s) => s.trim()).filter(Boolean);

fs.mkdirSync(DIR, { recursive: true });
const api = new YouTubeChatApi({ env, log: say });
const ledger = new QuotaLedger({ file: QUOTA, cap: Number(env.CHAT_QUOTA_UNITS) || POLICY.dayUnits });
const mod = new ChatModerator({ ledger, classifyOpts: { allowDomains } });
let state = { chats: {} };
try {
  state = { chats: {}, ...JSON.parse(fs.readFileSync(STATE, 'utf8')) };
} catch {
  /* first run */
}
const saveState = () => {
  // (the last 30 chats; each keeps its last 2,000 message ids)
  const ids = Object.keys(state.chats).slice(-30);
  state.chats = Object.fromEntries(ids.map((id) => [id, { ...state.chats[id], seen: (state.chats[id].seen || []).slice(-2000) }]));
  fs.writeFileSync(STATE, JSON.stringify(state));
};
// the log keeps 30 days
try {
  const cut = Date.now() - KEEP_DAYS * 86400_000;
  const kept = readLog().filter((l) => Date.parse(l.at) >= cut);
  fs.writeFileSync(LOG, kept.map((l) => JSON.stringify(l)).join('\n') + (kept.length ? '\n' : ''));
} catch {
  /* nothing to prune */
}

const today = { day: ownerDay(Date.now()), seen: 0, removed: 0, timeouts: 0, bans: 0, flagged: 0, notActed: 0 };
let chat = null;
let checkedAt = 0;
let via = 'grpc';
let grpcFailedAt = 0;
let lastError = null;
let stopping = false;
let current = null;
const started = Date.now();
process.on('SIGINT', () => ((stopping = true), current?.cancel()));
process.on('SIGTERM', () => ((stopping = true), current?.cancel()));
const over = () => stopping || (FOR > 0 && Date.now() - started > FOR * 1000);

function status(extra = {}) {
  if (today.day !== ownerDay(Date.now())) Object.assign(today, { day: ownerDay(Date.now()), seen: 0, removed: 0, timeouts: 0, bans: 0, flagged: 0, notActed: 0 });
  const s = { pid: process.pid, mode: LIVE ? 'live' : 'dry', chat: chat ? { broadcastId: chat.broadcastId, liveChatId: chat.liveChatId, title: chat.title } : null, via, today, quota: { day: quotaDay(Date.now()), used: ledger.used(), cap: ledger.cap }, lastError, at: new Date().toISOString(), ...extra };
  try {
    fs.writeFileSync(STATUS, JSON.stringify(s, null, 1));
  } catch {
    /* a convenience */
  }
}

// the messages to judge, one after the other (a page can bring many at once: the API's own pace is respected)
const queue = [];
let working = false;
async function work() {
  if (working) return;
  working = true;
  try {
    while (queue.length) {
      const { m, liveChatId } = queue.shift();
      await judge(m, liveChatId);
    }
  } finally {
    working = false;
  }
}
async function judge(m, liveChatId) {
  today.seen++;
  const d = mod.consider(m);
  if (d.action === 'keep' && !d.degraded) return;
  const line = { at: new Date().toISOString(), chat: liveChatId, id: m.id, author: { channelId: m.author.channelId, name: m.author.name }, text: String(m.text).slice(0, 300), rule: d.rule, rules: d.rules, severity: d.severity, reason: d.reason, action: d.action, seconds: d.seconds || null, strikes: d.strikes, flag: !!d.flag, degraded: d.degraded || null, dry: !LIVE };
  let deleted = false;
  let banned = false;
  if (LIVE && d.action !== 'keep') {
    try {
      await api.remove(m.id);
      deleted = true;
    } catch (err) {
      line.error = err.message;
      if (err.reason === 'quotaExceeded') lastError = 'YouTube quota exceeded for today';
    }
    if (d.action === 'timeout' || d.action === 'ban') {
      try {
        await api.ban(liveChatId, m.author.channelId, d.action === 'ban' ? null : d.seconds);
        banned = true;
      } catch (err) {
        line.error = [line.error, err.message].filter(Boolean).join(' · ');
      }
    }
    await sleep(Number(env.CHATMOD_ACTION_GAP_MS ?? 250));
  }
  mod.record(d, m, { deleted, banned, dry: !LIVE });
  if (d.action === 'keep') today.notActed++;
  else today.removed++;
  if (d.action === 'timeout') today.timeouts++;
  if (d.action === 'ban') today.bans++;
  if (d.flag) today.flagged++;
  fs.appendFileSync(LOG, JSON.stringify(line) + '\n');
  say(`${LIVE ? '' : '(dry) '}${d.action}${d.seconds ? ` ${d.seconds} s` : ''} · ${d.rule} · ${m.author.name}: ${String(m.text).slice(0, 80)}${d.degraded ? ` [${d.degraded}]` : ''}${line.error ? ` [error: ${line.error}]` : ''}`);
  status();
}
function onPage(liveChatId) {
  const st = state.chats[liveChatId] || (state.chats[liveChatId] = { seen: [] });
  const seen = new Set(st.seen);
  return ({ items, nextPageToken }) => {
    // (where it is in the chat, kept as the pages come: a restart resumes from here)
    if (nextPageToken) st.pageToken = nextPageToken;
    for (const m of items) {
      if (!m.id || seen.has(m.id) || !['text', 'superchat', 'milestone'].includes(m.type)) continue;
      seen.add(m.id);
      st.seen.push(m.id);
      // (the history a new stream hands over: only the last minutes are judged)
      if (m.publishedAt && Date.now() - Date.parse(m.publishedAt) > HISTORY_MS) continue;
      queue.push({ m, liveChatId });
    }
    saveState();
    work();
  };
}

/** The next YouTube quota day starts at midnight Pacific: how long until then. */
function untilQuotaDay() {
  const now = Date.now();
  let t = now + 60_000;
  const day = quotaDay(now);
  while (quotaDay(t) === day && t - now < 26 * 3600_000) t += 5 * 60_000;
  return t - now;
}

/** The shortest time between two reads (a stream opened or a poll) that keeps the reading share for the rest of the day. */
function readGap() {
  const left = Math.max(1, Math.floor((ledger.cap * READ_SHARE - ledger.used()) / COST.read));
  return Math.ceil(untilQuotaDay() / left);
}

say(`${LIVE ? 'live: it acts' : 'dry run: it only logs (PUBLISH_LIVE=1 CHAT_MOD=1 to act)'} · quota share ${ledger.cap} units a day · ${DIR}`);
status();
let backoff = 0;
while (!over()) {
  try {
    if (!chat || Date.now() - checkedAt > CHECK_MS) {
      if (!ledger.canSpend(COST.lookup)) {
        lastError = 'the moderator’s quota for today is spent; waiting for the next quota day';
        status();
        await sleep(Math.min(untilQuotaDay(), FOR ? 1000 : 3600_000));
        continue;
      }
      const found = await api.activeChat();
      ledger.spend('lookup', COST.lookup);
      checkedAt = Date.now();
      if (!found) {
        if (chat) say('the broadcast is over; waiting for the next one');
        chat = null;
        status();
        await sleep(FOR ? Math.min(IDLE_MS, 1000) : IDLE_MS);
        continue;
      }
      if (found.liveChatId !== chat?.liveChatId) {
        chat = found;
        say(`chat of "${found.title}" (${found.broadcastId})`);
        const st = state.chats[found.liveChatId] || (state.chats[found.liveChatId] = { seen: [] });
        if (LIVE && ANNOUNCE && !st.announced && ledger.canSpend(COST.say, 0.5)) {
          try {
            await api.say(found.liveChatId, RULES_LINE);
            ledger.spend('say', COST.say);
            st.announced = new Date().toISOString();
          } catch (err) {
            say(`the rules message could not be sent: ${err.message}`);
          }
        }
        saveState();
      }
    }
    // reading: at most READ_SHARE of the day's units (the stream costs one call per connection)
    if (!ledger.canSpend(COST.read, READ_SHARE)) {
      lastError = 'reading the chat has used its share of today’s quota; waiting for the next quota day (YouTube’s own filters still stand)';
      status();
      await sleep(Math.min(untilQuotaDay(), FOR ? 1000 : 3600_000));
      continue;
    }
    const st = state.chats[chat.liveChatId];
    const handle = onPage(chat.liveChatId);
    if (via === 'grpc' || Date.now() - grpcFailedAt > 3600_000) {
      via = 'grpc';
      ledger.spend('read', COST.read);
      const openedAt = Date.now();
      let got = false;
      current = await api.stream(chat.liveChatId, st.pageToken || null, (page) => {
        got = true;
        handle(page);
      });
      status({ connected: true });
      const res = await Promise.race([current.done, FOR ? sleep(Math.max(0, FOR * 1000 - (Date.now() - started))).then(() => (current.cancel(), { pageToken: null, cancelled: true })) : new Promise(() => {})]);
      current = null;
      if (res.pageToken) st.pageToken = res.pageToken;
      saveState();
      if (res.ended) {
        say('the chat has ended');
        chat = null;
        continue;
      }
      // (each connection is a call: a stream that keeps closing early is opened again no oftener than the reading share
      // allows over the rest of the quota day; what was said meanwhile comes with the next one, from its page token)
      const gap = readGap();
      if (!res.error && !stopping && Date.now() - openedAt < gap) await sleep(Math.min(gap - (Date.now() - openedAt), FOR ? 200 : gap));
      if (res.error && !stopping) {
        lastError = res.error;
        // (the stream is not to be had here, gRPC's UNIMPLEMENTED or UNAVAILABLE again and again: poll for an hour)
        backoff = got || Date.now() - openedAt > 60_000 ? 0 : backoff + 1;
        if (res.code === 12 || backoff >= 5) {
          say(`the stream cannot be had (${res.error}); polling for an hour`);
          via = 'poll';
          grpcFailedAt = Date.now();
          backoff = 0;
        } else await sleep([1, 2, 5, 10, 30][Math.min(backoff, 4)] * 1000);
      }
      continue;
    }
    // polled: as often as YouTube asks, and no more often than the reading share allows over the rest of the day
    ledger.spend('read', COST.read);
    const p = await api.poll(chat.liveChatId, st.pageToken || null);
    handle(p);
    if (p.nextPageToken) st.pageToken = p.nextPageToken;
    saveState();
    status({ connected: true });
    if (p.offlineAt) {
      chat = null;
      continue;
    }
    await sleep(Math.max(p.pollingIntervalMillis, readGap()));
  } catch (err) {
    lastError = err.message;
    say(`error: ${err.message}`);
    status();
    if (err.reason === 'quotaExceeded') await sleep(Math.min(untilQuotaDay(), FOR ? 1000 : 3600_000));
    else await sleep(FOR ? 500 : 15_000);
  }
}
while (queue.length || working) await sleep(50);
status({ connected: false, stopped: true });
say(`stopped: ${today.seen} messages read, ${today.removed} removed, ${today.timeouts} timeouts, ${today.bans} bans`);
process.exit(0);
