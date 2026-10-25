// The live chat's moderator: what to do with each message (docs/publishing/chat-moderation.md). The rules (rules.js)
// say what a message breaks; this decides what happens, from what the author did before and from what YouTube's quota
// still allows today. tools/publish/chatmod.mjs carries it out.
//
// What happens (a strike is a removed message; strikes count for 30 minutes):
//   a scam bot (a scam with a link, a number, an address or a messaging app)   removed, and banned for good
//   a threat or a slur                                                          removed, the author out for 24 hours
//   a name that passes for the channel                                          removed, the author out for 24 hours
//   anything else that breaks a rule                                            removed; a 2nd strike 5 minutes out,
//                                                                               a 3rd an hour, a 4th and on 24 hours
//   the same message 3 times in 2 minutes, or 7 messages in 30 seconds          removed (a strike like any other)
// Threats, slurs and impersonation are flagged for the owner (the daily summary). The channel's owner and its
// moderators are never judged.
//
// The quota (YouTube Data API, read 25 Oct 2026, developers.google.com/youtube/v3/determine_quota_cost): reading the
// chat 5 units a call (the stream holds one call open), removing a message 20, a ban or a timeout 200, out of the
// project's 10,000 a day, which the uploads, the live title and the block rotation share. The moderator keeps to its
// own share (POLICY.dayUnits, CHAT_QUOTA_UNITS) and spends it on the worst first: a low-severity removal may use 60 %
// of the day's share, a medium one 85 %, a threat, a slur or a scam bot all of it; a ban the quota cannot pay becomes a
// removal, and what it cannot remove at all is logged as such (YouTube's own filters still stand: chat-moderation.md).
//
//   new QuotaLedger({ file, cap, now })        spent units per YouTube day (midnight Pacific), kept in a file
//   new ChatModerator({ ledger, policy, classifyOpts, now })
//     .consider(message) -> { action: 'keep'|'delete'|'timeout'|'ban', seconds, rule, severity, reason, strikes,
//                             flag, degraded }
//     .record(decision, message, done)          what was really done (the ledger's units, the strike)
import fs from 'node:fs';
import path from 'node:path';
import { classify, floodKey } from './rules.js';

export const COST = Object.freeze({ read: 5, lookup: 1, delete: 20, ban: 200, say: 20 });

export const POLICY = Object.freeze({
  dayUnits: 3000,
  shares: Object.freeze({ high: 1, medium: 0.85, low: 0.6 }),
  strikeWindowMs: 30 * 60_000,
  timeouts: Object.freeze([0, 300, 3600, 86400]),
  longTimeout: 86400,
  flood: Object.freeze({ same: 3, sameWindowMs: 120_000, burst: 7, burstWindowMs: 30_000 }),
  bansPerDay: 4,
});

/** YouTube's quota day: it resets at midnight Pacific time. */
export const quotaDay = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));

export class QuotaLedger {
  constructor({ file = null, cap = POLICY.dayUnits, now = Date.now } = {}) {
    Object.assign(this, { file, cap, now });
    this.state = { day: quotaDay(now()), used: 0, byKind: {} };
    try {
      const s = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (s.day === this.state.day) this.state = { ...this.state, ...s };
    } catch {
      /* a new day, or no file yet */
    }
  }
  roll() {
    const day = quotaDay(this.now());
    if (day !== this.state.day) this.state = { day, used: 0, byKind: {} };
    return this.state;
  }
  used() {
    return this.roll().used;
  }
  /** May `units` be spent at a share of the day's cap (1 = all of it)? */
  canSpend(units, share = 1) {
    return this.roll().used + units <= this.cap * share;
  }
  spend(kind, units) {
    const s = this.roll();
    s.used += units;
    s.byKind[kind] = (s.byKind[kind] || 0) + units;
    if (this.file) {
      try {
        fs.mkdirSync(path.dirname(this.file), { recursive: true });
        fs.writeFileSync(this.file, JSON.stringify(s));
      } catch {
        /* the ledger is a guide: never stops the moderator */
      }
    }
    return s.used;
  }
}

export class ChatModerator {
  constructor({ ledger = new QuotaLedger(), policy = POLICY, classifyOpts = {}, now = Date.now } = {}) {
    Object.assign(this, { ledger, policy, classifyOpts, now });
    this.authors = new Map(); // channelId -> { recent: [{ t, key }], strikes: [t] }
    this.bans = { day: null, n: 0 };
  }
  author(id) {
    if (!this.authors.has(id)) this.authors.set(id, { recent: [], strikes: [] });
    return this.authors.get(id);
  }
  /** The same message again and again, or a burst: judged on the author's last messages (the current one included). */
  flood(a, key, t) {
    const f = this.policy.flood;
    a.recent = a.recent.filter((m) => t - m.t < Math.max(f.sameWindowMs, f.burstWindowMs)).concat([{ t, key }]).slice(-30);
    const same = a.recent.filter((m) => key && m.key === key && t - m.t < f.sameWindowMs).length;
    if (same >= f.same) return { rule: 'flood', severity: 'low', reason: `the same message ${same} times in ${f.sameWindowMs / 60000} minutes` };
    const burst = a.recent.filter((m) => t - m.t < f.burstWindowMs).length;
    if (burst >= f.burst) return { rule: 'flood', severity: 'low', reason: `${burst} messages in ${f.burstWindowMs / 1000} seconds` };
    return null;
  }
  consider(message) {
    const t = this.now();
    const au = message?.author || {};
    if (au.owner || au.moderator) return { action: 'keep', exempt: true };
    const a = this.author(au.channelId || au.name || '?');
    const verdicts = classify(message, this.classifyOpts);
    const fl = this.flood(a, floodKey(message?.text), t);
    if (fl) verdicts.push(fl);
    if (!verdicts.length) return { action: 'keep' };
    const top = verdicts[0];
    a.strikes = a.strikes.filter((s) => t - s < this.policy.strikeWindowMs);
    const strikes = a.strikes.length + 1;
    let action = 'delete';
    let seconds = 0;
    const flag = top.rule === 'threat' || top.rule === 'hate' || top.rule === 'impersonation';
    if (top.rule === 'scam' && top.severity === 'high') action = 'ban';
    else if (top.severity === 'high') [action, seconds] = ['timeout', this.policy.longTimeout];
    else {
      const ts = this.policy.timeouts;
      seconds = ts[Math.min(strikes - 1, ts.length - 1)];
      if (seconds > 0) action = 'timeout';
    }
    // what the quota still allows today (the worst first)
    const share = this.policy.shares[top.severity] ?? 1;
    let degraded = null;
    const day = quotaDay(t);
    if (this.bans.day !== day) this.bans = { day, n: 0 };
    if (action === 'ban' && this.bans.n >= this.policy.bansPerDay) [action, seconds, degraded] = ['timeout', this.policy.longTimeout, 'bans-per-day'];
    if ((action === 'ban' || action === 'timeout') && !this.ledger.canSpend(COST.delete + COST.ban, share)) [action, seconds, degraded] = ['delete', 0, 'quota'];
    if (action === 'delete' && !this.ledger.canSpend(COST.delete, share)) [action, degraded] = ['keep', 'quota'];
    return { action, seconds, rule: top.rule, severity: top.severity, reason: top.reason, rules: verdicts.map((v) => v.rule), strikes, flag, degraded };
  }
  /**
   * What was really done: the units spent, the strike, the day's bans. `done` = { deleted, banned, dry }: a dry run
   * spends nothing but counts the strike as if it had acted, so its log shows the escalation it would have made.
   */
  record(decision, message, { deleted = false, banned = false, dry = false } = {}) {
    if (dry) {
      if (decision.action !== 'keep') this.author(message?.author?.channelId || message?.author?.name || '?').strikes.push(this.now());
      if (decision.action === 'ban') this.bans.n++;
      return;
    }
    if (deleted) this.ledger.spend('delete', COST.delete);
    if (banned) {
      this.ledger.spend('ban', COST.ban);
      if (decision.action === 'ban') this.bans.n++;
    }
    if (deleted || banned) this.author(message?.author?.channelId || message?.author?.name || '?').strikes.push(this.now());
  }
}
