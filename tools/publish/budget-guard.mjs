#!/usr/bin/env node
// The Claude credit, by estimate (owner, 24 Oct: when the balance falls under $100, the live stream stops). The API
// shows no prepaid balance and a personal account has no Admin API, so the balance is the owner's figure from the
// console (platform.claude.com → Billing) minus what the calls since cost at list price, from the station's ledger
// (data/usage-ledger.jsonl, server/usage.js), with a safety margin. Under the floor: globit24-live is stopped and
// disabled (YouTube ends the broadcast by itself); the daily programmes go on. The credit is a monthly grant: on the
// 1st (UTC) it is back at MONTHLY, and a live stream this guard stopped is started again.
//
//   node tools/publish/budget-guard.mjs --set-balance 123.45 [--floor 100]   the console's balance now
//   node tools/publish/budget-guard.mjs --check     (the timer) stop the live stream if the estimate is under the floor
//   node tools/publish/budget-guard.mjs --status    the estimate, the rate and the time left
//
// After a top-up mid-month: --set-balance with the new figure, then `systemctl enable --now globit24-live`.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const LEDGER = path.join(root, 'data', 'usage-ledger.jsonl');
const STATE = path.join(root, 'data', 'publish', 'budget.json');
const SERVICE = 'globit24-live';
// what the estimate adds on top of list price (pricing changes, long prompts, calls the ledger missed)
const MARGIN = 1.2;
const MONTHLY = 200;
// $ per million tokens (list price, 24 Oct 2026): input, output; cache reads at 0.1x input, writes at 1.25x
const PRICES = {
  'claude-haiku-5-5': { in: 0.1, out: 0.5 },
  'claude-sonnet-5-5': { in: 2, out: 10 },
  'claude-opus-5-5': { in: 4, out: 20 },
};
const UNKNOWN = { in: 5, out: 25 }; // a model not in the table: priced high, never under
const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const say = (m) => console.log(`[budget ${new Date().toISOString().slice(0, 19)}Z] ${m}`);
const usd = (n) => `$${n.toFixed(2)}`;

function cost(e) {
  const p = PRICES[e.model] || UNKNOWN;
  const cached = e.cached || 0;
  const write = e.cacheWrite || 0;
  const plain = Math.max(0, (e.input || 0) - cached - write);
  return ((plain + cached * 0.1 + write * 1.25) * p.in + (e.output || 0) * p.out) / 1e6;
}
function spentSince(sinceMs) {
  const out = { total: 0, lastHour: 0, lastDay: 0, byModel: {} };
  let text = '';
  try {
    text = fs.readFileSync(LEDGER, 'utf8');
  } catch {
    return out;
  }
  const now = Date.now();
  for (const line of text.split('\n')) {
    if (!line) continue;
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    const t = Date.parse(e.at);
    if (!(t > sinceMs)) continue;
    const c = cost(e) * MARGIN;
    out.total += c;
    if (now - t < 3600_000) out.lastHour += c;
    if (now - t < 86400_000) out.lastDay += c;
    out.byModel[e.model || '?'] = (out.byModel[e.model || '?'] || 0) + c;
  }
  return out;
}
const readState = () => {
  try {
    return JSON.parse(fs.readFileSync(STATE, 'utf8'));
  } catch {
    return null;
  }
};

if (args.includes('--set-balance')) {
  const balance = Number(opt('set-balance'));
  const floor = Number(opt('floor') ?? readState()?.floorUsd ?? 100);
  if (!(balance > 0) || !(floor >= 0)) {
    console.error('usage: --set-balance <dollars> [--floor <dollars>]');
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(STATE), { recursive: true });
  fs.writeFileSync(STATE, JSON.stringify({ balanceUsd: balance, balanceAt: new Date().toISOString(), floorUsd: floor }, null, 2));
  say(`balance ${usd(balance)} from now; the live stream stops under ${usd(floor)}`);
  process.exit(0);
}

let st = readState();
// a new month: the grant again, and the live stream back if this guard stopped it
const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
if (st && Date.parse(st.balanceAt) < monthStart.getTime()) {
  const was = st;
  st = { balanceUsd: MONTHLY, balanceAt: monthStart.toISOString(), floorUsd: was.floorUsd };
  fs.writeFileSync(STATE, JSON.stringify(st, null, 2));
  say(`a new month: the balance is ${usd(MONTHLY)} again`);
  if (was.stoppedAt && args.includes('--check')) {
    execFileSync('systemctl', ['enable', '--now', SERVICE], { stdio: 'inherit' });
    say(`${SERVICE} enabled and started again`);
  }
}
if (!st) {
  say(`no balance set (--set-balance <dollars>): nothing to check`);
  process.exit(args.includes('--check') ? 0 : 1);
}
const spent = spentSince(Date.parse(st.balanceAt));
const left = st.balanceUsd - spent.total;
const hoursLeft = spent.lastHour > 0 ? (left - st.floorUsd) / spent.lastHour : Infinity;

if (args.includes('--status')) {
  console.log(`balance ${usd(st.balanceUsd)} at ${st.balanceAt}; spent since (estimate, x${MARGIN}) ${usd(spent.total)}; left ${usd(left)}; floor ${usd(st.floorUsd)}`);
  console.log(`rate: ${usd(spent.lastHour)} in the last hour, ${usd(spent.lastDay)} in the last 24 h${Number.isFinite(hoursLeft) ? `; the floor in about ${Math.max(0, hoursLeft).toFixed(0)} h at this hour's rate` : ''}`);
  for (const [m, c] of Object.entries(spent.byModel)) console.log(`  ${m}: ${usd(c)}`);
  if (st.stoppedAt) console.log(`the live stream was stopped at ${st.stoppedAt}`);
} else if (args.includes('--check')) {
  if (left >= st.floorUsd) {
    say(`left ${usd(left)} (spent ${usd(spent.total)}, ${usd(spent.lastHour)}/h); floor ${usd(st.floorUsd)}`);
  } else if (!st.stoppedAt) {
    say(`left ${usd(left)}: under the floor of ${usd(st.floorUsd)}; stopping ${SERVICE}`);
    execFileSync('systemctl', ['disable', '--now', SERVICE], { stdio: 'inherit' });
    fs.writeFileSync(STATE, JSON.stringify({ ...st, stoppedAt: new Date().toISOString(), leftAtStop: +left.toFixed(2) }, null, 2));
    say(`${SERVICE} stopped and disabled; after a top-up: --set-balance, then systemctl enable --now ${SERVICE}`);
  }
} else {
  console.error('usage: node tools/publish/budget-guard.mjs --set-balance <dollars> [--floor 100] | --check | --status');
  process.exit(1);
}
