// The compliance register: where everything was published, every complaint and what was done about it, and who and
// what may never air or be published again (docs/publishing/compliance.md §7, the takedown and correction workflow).
//
// One append-only file, data/compliance/register.jsonl: each line an event, the state rebuilt by replaying them. A
// crash can tear at most the last line (skipped); nothing is ever rewritten, so the file is its own audit trail.
//
//   const reg = new ComplianceRegister({ dir })
//   reg.recordPublication({ itemId, parentId, kind, platform, remoteId, url, programId, storyIds, recreations, flags, manifest })
//   reg.recordReview(itemId, { by, checks, verdict, note })      the owner's editorial review of an item
//   reg.fileComplaint({ receivedAt, channel, from, contact, about, category, text })   -> complaint (with its deadline)
//   reg.triage(complaintId, { decision, scope, reason, by })     -> { actions, blocks }: everything to take down
//   reg.actionDone(actionId, { ok, result })                     the publisher reports each removal
//   reg.close(complaintId, { outcome, reply })
//   reg.isBlocked({ name, qid, storyId, itemId })                -> reason | null (restage.js and the publish check)
//   reg.openActions() / reg.overdue(now) / reg.publicationsFor(scope) / reg.complaint(id) / reg.review(itemId)
//   reg.correction({ about, text, onAir, complaintId })          a correction to read on air and pin under the item
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const HOUR = 3600_000;

/** What a complaint can be about, and how fast it is answered and acted on (hours from receipt). */
export const CATEGORIES = Object.freeze({
  'privacy-likeness': { ack: 24, act: 24, about: 'a person asks that a recreation of them (or their name, image or voice) come down' },
  defamation: { ack: 24, act: 24, about: 'words attributed to someone they did not say, or a false statement about them' },
  inaccuracy: { ack: 24, act: 24, about: 'a factual error, a wrong quote, a wrong picture or caption' },
  copyright: { ack: 24, act: 24, about: 'a rights holder says we used their text, picture, footage or sound without the right' },
  election: { ack: 6, act: 6, about: 'content about a vote, a candidate or a campaign, near or during an election period' },
  harm: { ack: 6, act: 6, about: 'a victim, a child, a private person or someone accused shown or named against our rules' },
  disclosure: { ack: 24, act: 48, about: 'a missing or wrong AI label (EU Code of Practice, Measure 2.3)' },
  platform: { ack: 24, act: 24, about: 'a platform notice: a privacy complaint, a strike, a label applied, a removal' },
  other: { ack: 72, act: 168, about: 'anything else' },
});

/** What a triage may decide. */
export const DECISIONS = Object.freeze(['remove', 'unlist', 'correct', 'block-person', 'reject', 'escalate']);

const id = (prefix) => `${prefix}_${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;
const fold = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export class ComplianceRegister {
  constructor({ dir = null, file = null, now = () => Date.now(), log = console } = {}) {
    this.file = file || (dir ? path.join(dir, 'register.jsonl') : null);
    this.now = now;
    this.log = log;
    this.reset();
    this.load();
  }

  reset() {
    this.publications = new Map(); // id -> publication (with .state)
    this.complaints = new Map(); // id -> complaint (with .triage, .actions, .closed)
    this.actions = new Map(); // id -> action
    this.blocks = new Map(); // id -> block
    this.reviews = new Map(); // itemId -> latest review
    this.corrections = [];
  }

  load() {
    this.size = 0;
    this.refresh();
  }

  /**
   * Read what other processes appended since (the publisher, the complaints tool): only the new bytes, whole lines.
   * The server's checks call this first, so a block filed from the command line holds at once.
   */
  refresh() {
    if (!this.file) return;
    let st;
    try {
      st = fs.statSync(this.file);
    } catch {
      return;
    }
    if (st.size < this.size) {
      // (replaced by a restore from backup: read it all again)
      this.reset();
      this.size = 0;
    }
    if (st.size === this.size) return;
    const fd = fs.openSync(this.file, 'r');
    try {
      const buf = Buffer.alloc(st.size - this.size);
      fs.readSync(fd, buf, 0, buf.length, this.size);
      const text = buf.toString('utf8');
      const end = text.lastIndexOf('\n');
      if (end < 0) return; // a line still being written
      for (const line of text.slice(0, end).split('\n')) {
        if (!line.trim()) continue;
        try {
          this.apply(JSON.parse(line));
        } catch { /* a torn line after a crash */ }
      }
      this.size += Buffer.byteLength(text.slice(0, end + 1), 'utf8');
    } finally {
      fs.closeSync(fd);
    }
  }

  append(ev) {
    this.refresh();
    const e = { at: new Date(this.now()).toISOString(), ...ev };
    this.apply(e);
    if (this.file) {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const line = `${JSON.stringify(e)}\n`;
      fs.appendFileSync(this.file, line);
      this.size += Buffer.byteLength(line, 'utf8');
    }
    return e;
  }

  /** Replay one event into the state. */
  apply(e) {
    switch (e.type) {
      case 'publication':
        this.publications.set(e.id, { ...e, state: 'live' });
        break;
      case 'publication-state': {
        const p = this.publications.get(e.id);
        if (p) p.state = e.state;
        break;
      }
      case 'review':
        this.reviews.set(e.itemId, e);
        break;
      case 'complaint':
        this.complaints.set(e.id, { ...e, triage: null, actions: [], closed: null });
        break;
      case 'triage': {
        const c = this.complaints.get(e.complaintId);
        if (c) c.triage = e;
        break;
      }
      case 'action': {
        const prev = this.actions.get(e.id);
        const a = { ...(prev || {}), ...e };
        this.actions.set(e.id, a);
        const c = this.complaints.get(a.complaintId);
        if (c && !prev) c.actions.push(e.id);
        break;
      }
      case 'block':
        this.blocks.set(e.id, { ...e, active: true });
        break;
      case 'unblock': {
        const b = this.blocks.get(e.blockId);
        if (b) b.active = false;
        break;
      }
      case 'correction':
        this.corrections.push({ ...e });
        break;
      case 'correction-aired': {
        const c = this.corrections.find((x) => x.id === e.correctionId);
        if (c) c.aired = e.at;
        break;
      }
      case 'close': {
        const c = this.complaints.get(e.complaintId);
        if (c) c.closed = e;
        break;
      }
      default:
        break;
    }
  }

  // ---------------------------------------------------------------------------------------------- publications

  /**
   * Record one publication of one item on one platform (the publisher calls this when the upload succeeds).
   * `recreations` = disclosure.js recreationsIn() of what the item really contains ([{ id, name, qid }]).
   */
  recordPublication(p) {
    if (!p?.itemId || !p?.platform) throw new Error('a publication needs itemId and platform');
    return this.append({
      type: 'publication',
      id: id('pub'),
      itemId: String(p.itemId),
      parentId: p.parentId || null,
      kind: p.kind || null,
      platform: String(p.platform),
      remoteId: p.remoteId || null,
      url: p.url || null,
      programId: p.programId || null,
      storyIds: Array.isArray(p.storyIds) ? p.storyIds.slice(0, 40) : [],
      outlets: Array.isArray(p.outlets) ? p.outlets.slice(0, 40) : [],
      recreations: (p.recreations || []).map((r) => ({ id: r.id || null, name: r.name || null, qid: r.qid || null, outlet: r.outlet || null })),
      flags: p.flags || null,
      manifest: p.manifest || null,
    });
  }

  /** The owner's editorial review of an item before publication (AI Act guidelines §6.2.3: substance, facts, sources). */
  recordReview(itemId, { by, checks = {}, verdict = 'approve', note = '' } = {}) {
    if (!itemId || !by) throw new Error('a review needs the item and who reviewed it');
    return this.append({ type: 'review', itemId: String(itemId), by: String(by), checks, verdict, note: String(note || '').slice(0, 2000) });
  }

  review(itemId) {
    return this.reviews.get(String(itemId)) || null;
  }

  /** Publications matching a scope: { person: { name, qid }, storyId, itemId, remote: { platform, remoteId }, url }. */
  publicationsFor(scope = {}, { live = true } = {}) {
    const out = [];
    const name = scope.person?.name ? fold(scope.person.name) : null;
    const qid = scope.person?.qid || null;
    let itemIds = new Set(scope.itemId ? [String(scope.itemId)] : []);
    // a platform's id or a URL names one publication: everything of the same item goes with it
    for (const p of this.publications.values()) {
      if ((scope.remote && p.platform === scope.remote.platform && p.remoteId === scope.remote.remoteId) || (scope.url && p.url === scope.url)) itemIds.add(p.itemId);
    }
    for (const p of this.publications.values()) {
      if (live && p.state !== 'live') continue;
      // an item named goes with the clips cut from it: all of them when nothing narrower is named, those holding the
      // story when a story is named, those holding the person (byPerson) when a person is
      const child = p.parentId && itemIds.has(p.parentId) && (scope.storyId ? p.storyIds.includes(scope.storyId) : !(name || qid));
      const byItem = itemIds.has(p.itemId) || child;
      const byStory = scope.storyId && p.storyIds.includes(scope.storyId);
      const byPerson = (name || qid) && p.recreations.some((r) => (qid && r.qid === qid) || (name && fold(r.name) === name));
      if (byItem || byStory || byPerson) out.push(p);
    }
    return out;
  }

  // ---------------------------------------------------------------------------------------------- complaints

  /**
   * Log a complaint the moment it arrives (email, the platform's notice, a form, a letter). `about` = { url, itemId,
   * remote: { platform, remoteId }, storyId, person: { name, qid } } (whatever the complainant gave).
   */
  fileComplaint({ receivedAt = null, channel = 'email', from = null, contact = null, about = {}, category = 'other', text = '' } = {}) {
    const cat = CATEGORIES[category] ? category : 'other';
    const recv = Number.isFinite(Date.parse(receivedAt || '')) ? Date.parse(receivedAt) : this.now();
    const c = this.append({
      type: 'complaint',
      id: id('cmp'),
      receivedAt: new Date(recv).toISOString(),
      channel: String(channel),
      from: from ? String(from).slice(0, 200) : null,
      contact: contact ? String(contact).slice(0, 200) : null,
      about,
      category: cat,
      text: String(text || '').slice(0, 8000),
      ackBy: new Date(recv + CATEGORIES[cat].ack * HOUR).toISOString(),
      actBy: new Date(recv + CATEGORIES[cat].act * HOUR).toISOString(),
    });
    // while it is triaged, whatever it names is held back from new publications (a precaution, lifted at triage)
    const hold = this.precaution(c);
    return { ...this.complaints.get(c.id), held: hold };
  }

  /** A new complaint about a person, a story or an item holds new publications of it until it is triaged. */
  precaution(c) {
    const a = c.about || {};
    if (!a.person?.name && !a.person?.qid && !a.storyId && !a.itemId && !a.url && !a.remote) return null;
    const itemIds = new Set(this.publicationsFor({ url: a.url, remote: a.remote, itemId: a.itemId }).map((p) => p.itemId));
    return this.append({ type: 'block', id: id('blk'), kind: 'precaution', complaintId: c.id, person: a.person || null, storyId: a.storyId || null, itemIds: [...itemIds, ...(a.itemId ? [String(a.itemId)] : [])], reason: `complaint ${c.id} awaiting triage` });
  }

  complaint(cid) {
    return this.complaints.get(cid) || null;
  }

  /**
   * Decide a complaint. `decision` one of DECISIONS; `scope` what it covers ({ person, storyId, itemId, url, remote },
   * defaulting to what the complaint named). Remove, unlist and block-person take down every live publication in
   * scope, on every platform, derived clips included; correct edits and pins a correction under each; block-person
   * and remove also keep it from air and from publication from now on. -> { actions, blocks }
   */
  triage(complaintId, { decision, scope = null, reason = '', by = 'owner' } = {}) {
    const c = this.complaints.get(complaintId);
    if (!c) throw new Error(`no complaint ${complaintId}`);
    if (!DECISIONS.includes(decision)) throw new Error(`a decision is one of ${DECISIONS.join(', ')}`);
    const sc = scope || c.about || {};
    this.append({ type: 'triage', complaintId, decision, scope: sc, reason: String(reason || '').slice(0, 2000), by });
    // the precaution gives way to the decision
    for (const b of this.blocks.values()) if (b.active && b.kind === 'precaution' && b.complaintId === complaintId) this.append({ type: 'unblock', blockId: b.id, reason: `triaged: ${decision}` });
    const actions = [];
    const blocks = [];
    if (decision === 'reject' || decision === 'escalate') return { actions, blocks };
    const pubs = this.publicationsFor(sc);
    const verb = decision === 'unlist' ? 'unlist' : decision === 'correct' ? 'correct' : 'delete';
    for (const p of pubs) {
      actions.push(this.append({ type: 'action', id: id('act'), complaintId, publicationId: p.id, platform: p.platform, remoteId: p.remoteId, url: p.url, action: verb, state: 'planned' }));
    }
    if (decision === 'remove' || decision === 'block-person' || decision === 'unlist') {
      const itemIds = [...new Set(pubs.map((p) => p.itemId).concat(sc.itemId ? [String(sc.itemId)] : []))];
      blocks.push(this.append({ type: 'block', id: id('blk'), kind: decision === 'block-person' ? 'person' : 'takedown', complaintId, person: sc.person || null, storyId: sc.storyId || null, itemIds, reason: reason || c.category }));
    }
    return { actions, blocks };
  }

  /** The publisher reports one action done (or failed: it stays open and is retried). */
  actionDone(actionId, { ok = true, result = '' } = {}) {
    const a = this.actions.get(actionId);
    if (!a) throw new Error(`no action ${actionId}`);
    this.append({ type: 'action', id: actionId, state: ok ? 'done' : 'failed', result: String(result || '').slice(0, 1000) });
    if (ok) this.append({ type: 'publication-state', id: a.publicationId, state: a.action === 'delete' ? 'removed' : a.action === 'unlist' ? 'unlisted' : 'corrected', complaintId: a.complaintId });
    return this.actions.get(actionId);
  }

  /** Every action not yet done (planned or failed), oldest first. */
  openActions() {
    return [...this.actions.values()].filter((a) => a.state !== 'done').sort((x, y) => String(x.at).localeCompare(String(y.at)));
  }

  /** Close a complaint once every action is done and the complainant has had our answer. */
  close(complaintId, { outcome = '', reply = '' } = {}) {
    const c = this.complaints.get(complaintId);
    if (!c) throw new Error(`no complaint ${complaintId}`);
    const open = c.actions.map((a) => this.actions.get(a)).filter((a) => a && a.state !== 'done');
    if (open.length) throw new Error(`${open.length} action(s) still open: ${open.map((a) => `${a.action} on ${a.platform}`).join(', ')}`);
    return this.append({ type: 'close', complaintId, outcome: String(outcome).slice(0, 1000), reply: String(reply).slice(0, 4000) });
  }

  /** Complaints past a deadline: not triaged by actBy, or with actions still open after it. */
  overdue(now = this.now()) {
    const out = [];
    for (const c of this.complaints.values()) {
      if (c.closed) continue;
      const late = now > Date.parse(c.actBy);
      const open = c.actions.some((a) => this.actions.get(a)?.state !== 'done');
      if (late && (!c.triage || open)) out.push({ id: c.id, category: c.category, actBy: c.actBy, triaged: !!c.triage, openActions: c.actions.filter((a) => this.actions.get(a)?.state !== 'done').length });
    }
    return out;
  }

  // ---------------------------------------------------------------------------------------------- blocks

  /** Is this person, story or item kept off air and out of publication? -> the reason, or null. */
  isBlocked({ name = null, qid = null, storyId = null, itemId = null } = {}) {
    this.refresh();
    const n = name ? fold(name) : null;
    for (const b of this.blocks.values()) {
      if (!b.active) continue;
      const p = b.person;
      if (p && ((qid && p.qid && p.qid === qid) || (n && p.name && fold(p.name) === n))) return `${b.kind}: ${b.reason}`;
      if (storyId && b.storyId && b.storyId === storyId) return `${b.kind}: ${b.reason}`;
      if (itemId && (b.itemIds || []).includes(String(itemId))) return `${b.kind}: ${b.reason}`;
    }
    return null;
  }

  /** Lift a block (a person who agrees again, a complaint withdrawn). */
  unblock(blockId, { reason = '' } = {}) {
    if (!this.blocks.has(blockId)) throw new Error(`no block ${blockId}`);
    return this.append({ type: 'unblock', blockId, reason });
  }

  // ---------------------------------------------------------------------------------------------- corrections

  /** A correction: read on air in the programme's next edition, pinned and added to each publication's description. */
  correction({ about = {}, text, onAir = true, complaintId = null } = {}) {
    if (!text) throw new Error('a correction needs its words');
    return this.append({ type: 'correction', id: id('cor'), about, text: String(text).slice(0, 1000), onAir: !!onAir, complaintId, aired: false });
  }

  /** Corrections still to read on air (the producer may take them into the next edition of the programme). */
  pendingCorrections() {
    this.refresh();
    return this.corrections.filter((c) => c.onAir && !c.aired);
  }

  /** A correction was read on air. */
  correctionAired(correctionId, { programId = null, episodeId = null } = {}) {
    return this.append({ type: 'correction-aired', correctionId, programId, episodeId });
  }
}

let shared = null;
/** The server's register (data/compliance/register.jsonl under `dataDir`), created once. */
export function sharedRegister(dataDir) {
  if (!shared || (dataDir && shared.file !== path.join(dataDir, 'compliance', 'register.jsonl'))) shared = new ComplianceRegister({ dir: dataDir ? path.join(dataDir, 'compliance') : null });
  return shared;
}
