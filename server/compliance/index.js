// The compliance API for the publishing system (tools/publish/, server/publish/) and the station
// (docs/publishing/compliance.md §8, the contract). Every function is pure or reads only its own register and
// calendar; nothing here uploads anything.
//
//   disclosureFor(item)          flags, labels and text per platform (episode, clip, Short, text post, live)
//   describe(item, { credits })  the description: disclosure first, programme, recreations, credits, who answers
//   textPost(item, { max })      a text post with its disclosure first
//   creditsFor(item)             the description's credit lines
//   auditItem(item)              every asset with its rights record (missing ones listed)
//   checkClip(clip, opts)        recreation rules, label and mark in frame, cuts, flags, elections, register, review
//   markFile(path, manifest)     C2PA (and the audio watermark where installed), verified by reading it back
//   buildManifest(item, opts)    the manifest for markFile
//   readMark(path)               a file's C2PA manifest, read back
//   lintEpisode(episode, opts)   the verbatim lint (runs and shares copied from the sources)
//   preflight(item, opts)        all of the above that applies to one item: { ok, violations, warnings, ... }
//   launchReport(opts)           what must be in place before launch: { ready, blockers, warnings }
export { CHANNEL, PLATFORMS, programmeWording, disclosureFor, describe, textPost, recreationsIn, writerOf, editorialContact } from './disclosure.js';
export { creditsFor, auditItem, scanRepoAssets, rightsGate, loadRights } from './credits.js';
export { checkClip, timelineFromRecording, frameGeometry, legibleCap, RECREATION_WINDOW } from './clips.js';
export { markFile, readMark, buildManifest, c2paStatus, watermarkStatus, signingIdentity, SOURCE_TYPE } from './c2pa.js';
export { ComplianceRegister, sharedRegister, CATEGORIES, DECISIONS } from './registry.js';
export { lintEpisode, storyReport, verbatimRuns, MAX_RUN, MAX_SHARE, PHRASE } from './verbatim.js';
export { loadCalendar, electionHold, silenceHold, activeElections, ELECTION_RULE, startElectionCalendar } from './elections.js';

import fs from 'node:fs';
import path from 'node:path';
import { disclosureFor, describe, editorialContact } from './disclosure.js';
import { auditItem } from './credits.js';
import { checkClip } from './clips.js';
import { readMark, c2paStatus, watermarkStatus } from './c2pa.js';
import { lintEpisode } from './verbatim.js';
import { loadCalendar } from './elections.js';

const VIDEO = new Set(['live', 'episode', 'clip', 'short']);

/**
 * The publish-time gate of one item. Refuses (ok: false) on any violation; the publisher uploads nothing then.
 * `item` = checkClip's clip plus { kind, text (a post), files: [paths of the exported files] }.
 * `opts` = { register, calendar, getStory (verbatim sources), now, dataDir, verbatim: 'block'|'warn',
 *            requireReview, env }
 * -> { ok, violations, warnings, disclosure, credits, description, recreations }
 */
export function preflight(item = {}, opts = {}) {
  const env = opts.env || process.env;
  const violations = [];
  const warnings = [];
  const kind = item.kind || (item.episode ? 'episode' : 'text');
  const v = (rule, message, extra = {}) => violations.push({ rule, message, ...extra });
  let recreations = [];
  let disclosure;
  if (VIDEO.has(kind)) {
    const r = checkClip({ ...item, kind }, { ...opts, calendar: opts.calendar || loadCalendar({ dataDir: opts.dataDir || null, now: opts.now ?? Date.now() }) });
    violations.push(...r.violations);
    warnings.push(...r.warnings);
    recreations = r.recreations;
    disclosure = r.disclosure;
  } else {
    disclosure = disclosureFor({ ...item, kind });
    if (kind === 'text' && !/^AI-generated:/.test(String(item.text || '').trim())) v('text-disclosure-missing', 'a text post starts with "AI-generated:" (disclosure.textPost builds it)');
  }
  // the rights of every asset (exports are always strict)
  const audit = item.episode ? auditItem(item) : { assets: [], missing: [], credits: [] };
  for (const m of audit.missing) v('rights-missing', `${m.kind}${m.where ? ` (${m.where})` : ''}: ${m.reason}`, { asset: m });
  for (const a of audit.assets.filter((x) => x.publish === false)) v('not-publishable', `${a.kind}: ${a.class} is never published (demo or fixture material)`);
  // the verbatim rule (the writer team applies it upstream; here it is the last net)
  if (item.episode && typeof opts.getStory === 'function') {
    const lint = lintEpisode(item.episode, { getStory: opts.getStory, strict: opts.verbatimStrict === true });
    for (const x of lint.violations) {
      const msg = x.rule === 'run' ? `story ${x.storyId}: ${x.length} words in a row copied from the source ("${String(x.text).slice(0, 90)}…")` : x.rule === 'share' ? `story ${x.storyId}: ${Math.round(x.share * 100)} % of its words copied from the source` : `story ${x.storyId}: ${x.message}`;
      if ((opts.verbatim || 'block') === 'block') v('verbatim', msg, { storyId: x.storyId });
      else warnings.push(msg);
    }
  } else if (item.episode) warnings.push('verbatim: no getStory given, the story texts were not checked against their sources');
  // every exported file carries a manifest that reads back as AI-produced
  for (const f of item.files || []) {
    if (!fs.existsSync(f)) {
      v('file-missing', `no file ${f}`);
      continue;
    }
    if (!/\.(mp4|m4v|mov|png|jpe?g|webp|wav|mp3|m4a)$/i.test(f)) continue;
    const m = readMark(f, opts);
    if (!m.ok) v('unmarked', `${path.basename(f)} has no C2PA manifest (compliance.markFile before upload)`);
    else if (!m.aiGenerated) v('unmarked', `${path.basename(f)}'s manifest does not say it is AI-produced`);
  }
  // who answers for it, in every description (AI Act guidelines §6.2.3; EMFA Art. 6)
  if (!editorialContact(env)) v('editorial-contact-missing', 'EDITORIAL_CONTACT (and EDITORIAL_RESPONSIBLE) must be set: every description names who answers for the channel');
  return { ok: violations.length === 0, violations, warnings, disclosure, credits: audit.credits, description: describe(item, { credits: audit.credits }), recreations };
}

/**
 * What must be in place before the channel publishes anything (compliance.md §9): blockers stop launch, warnings
 * are to fix soon. Reads the environment and the machine; changes nothing.
 */
export function launchReport({ env = process.env, dataDir = null, now = Date.now() } = {}) {
  const blockers = [];
  const warnings = [];
  const c2 = c2paStatus();
  if (!c2.ok) blockers.push(`C2PA SDK missing: ${c2.reason} (pip install -r tools/c2pa/requirements.txt)`);
  else if (!(env.C2PA_CERT && env.C2PA_KEY)) {
    blockers.push(env.C2PA_ALLOW_DEV_CERT === '0' ? 'no C2PA signing certificate (C2PA_CERT, C2PA_KEY)' : 'C2PA signs with the development certificate: get a certificate from a CA on the C2PA trust list and set C2PA_CERT and C2PA_KEY');
  }
  const wm = watermarkStatus();
  if (!wm.ok) warnings.push(`audio watermark not active: ${wm.reason}`);
  if (!editorialContact(env)) blockers.push('EDITORIAL_CONTACT is not set (who answers for the channel, in every description and the About page)');
  if ((env.RIGHTS_GATE || 'report') !== 'strict') blockers.push('RIGHTS_GATE is not strict: pictures without a rights record could air');
  if (!env.OPEN_METEO_API_KEY && !env.OPEN_METEO_COMMERCIAL) blockers.push('Open-Meteo: the free API is non-commercial only; a monetised channel needs a paid plan (set OPEN_METEO_API_KEY once it is in place)');
  const cal = loadCalendar({ dataDir, now });
  if (cal.stale) blockers.push('the election calendar is out of date (node tools/compliance/elections.mjs, and the server refreshes it daily)');
  warnings.push('YouTube live: set "altered or synthetic content" on the broadcast (videos.update on its video id, or Studio) at each new stream');
  warnings.push('X, Bluesky, Mastodon: mark the accounts as automated where the network offers it');
  return { ready: blockers.length === 0, blockers, warnings, c2pa: c2, watermark: wm, calendar: { generatedAt: cal.generatedAt, stale: cal.stale, votes: cal.elections.length } };
}

