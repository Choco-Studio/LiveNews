#!/usr/bin/env node
// The operator's command line for compliance (docs/publishing/compliance.md §7, §9): the launch report, the publish
// check of a saved item, marking and reading C2PA, and the register of complaints and takedowns.
//
//   node tools/compliance/cli.mjs launch
//   node tools/compliance/cli.mjs check <item.json>            preflight of a saved item (exit 1 when refused); its
//        stories' words are checked against the archive's titles and summaries and the audit's cached articles
//   node tools/compliance/cli.mjs mark <file> [--item <item.json>]
//   node tools/compliance/cli.mjs read <file>
//   node tools/compliance/cli.mjs complaint add --category <c> --text "…" [--from …] [--contact …] [--url …]
//        [--person "Name"] [--story <id>] [--item <id>] [--channel email|youtube|tiktok|meta|x|letter|form]
//   node tools/compliance/cli.mjs complaint triage <id> --decision remove|unlist|correct|block-person|reject|escalate [--reason …]
//   node tools/compliance/cli.mjs complaint done <actionId> [--failed] [--result …]
//   node tools/compliance/cli.mjs complaint close <id> --outcome … [--reply …]
//   node tools/compliance/cli.mjs complaints [--open | --overdue]
//   node tools/compliance/cli.mjs actions                       the removals still to do
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchReport, preflight, markFile, readMark, buildManifest, sharedRegister, archiveGetStory, CATEGORIES } from '../../server/compliance/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const dataDir = process.env.DATA_DIR || path.join(root, 'data');
const [cmd, sub, ...rest] = process.argv.slice(2);
const args = [sub, ...rest].filter((x) => x !== undefined);
const opt = (name, def = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined && !args[i + 1].startsWith('--') ? args[i + 1] : def;
};
const flag = (name) => args.includes(`--${name}`);
const out = (x) => console.log(typeof x === 'string' ? x : JSON.stringify(x, null, 2));
const readJson = (f) => JSON.parse(fs.readFileSync(path.resolve(f), 'utf8'));

function usage() {
  console.error(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n'));
  process.exit(2);
}

const reg = () => sharedRegister(dataDir);

switch (cmd) {
  case 'launch': {
    const r = launchReport({ dataDir });
    out(`${r.ready ? 'READY' : 'NOT READY'} for launch`);
    for (const b of r.blockers) out(`  BLOCKER  ${b}`);
    for (const w of r.warnings) out(`  warning  ${w}`);
    if (r.verbatim.stories) out(`  verbatim ${r.verbatim.violating} of the last ${r.verbatim.stories} stories break the rule (${r.verbatim.withArticle} measured against their article)`);
    process.exit(r.ready ? 0 : 1);
    break;
  }
  case 'check': {
    if (!sub) usage();
    const item = readJson(sub);
    const r = preflight(item, { register: reg(), dataDir, getStory: archiveGetStory({ dataDir }) });
    out(r.ok ? 'OK: may be published' : 'REFUSED');
    for (const v of r.violations) out(`  ${v.rule.padEnd(26)} ${v.message}`);
    for (const w of r.warnings) out(`  warning                    ${w}`);
    process.exit(r.ok ? 0 : 1);
    break;
  }
  case 'mark': {
    if (!sub) usage();
    const item = opt('item') ? readJson(opt('item')) : { kind: 'episode' };
    out(markFile(sub, buildManifest(item), { dataDir }));
    break;
  }
  case 'read': {
    if (!sub) usage();
    out(readMark(sub));
    break;
  }
  case 'complaint': {
    const r = reg();
    if (sub === 'add') {
      const category = opt('category', 'other');
      if (!CATEGORIES[category]) {
        console.error(`category is one of: ${Object.keys(CATEGORIES).join(', ')}`);
        process.exit(2);
      }
      const about = {};
      if (opt('url')) about.url = opt('url');
      if (opt('person')) about.person = { name: opt('person') };
      if (opt('story')) about.storyId = opt('story');
      if (opt('item')) about.itemId = opt('item');
      out(r.fileComplaint({ channel: opt('channel', 'email'), from: opt('from'), contact: opt('contact'), category, about, text: opt('text', '') }));
    } else if (sub === 'triage') {
      const id = rest[0];
      out(r.triage(id, { decision: opt('decision'), reason: opt('reason', ''), by: opt('by', 'owner') }));
    } else if (sub === 'done') {
      out(r.actionDone(rest[0], { ok: !flag('failed'), result: opt('result', '') }));
    } else if (sub === 'close') {
      out(r.close(rest[0], { outcome: opt('outcome', ''), reply: opt('reply', '') }));
    } else usage();
    break;
  }
  case 'complaints': {
    const r = reg();
    if (flag('overdue')) out(r.overdue());
    else out([...r.complaints.values()].filter((c) => !flag('open') || !c.closed).map((c) => ({ id: c.id, category: c.category, receivedAt: c.receivedAt, actBy: c.actBy, triaged: c.triage?.decision || null, closed: !!c.closed, about: c.about })));
    break;
  }
  case 'actions':
    out(reg().openActions());
    break;
  default:
    usage();
}
