// PRESS START's hand check (docs/roadmap/critique/press-start-design.md): every item of a sample judged by hand, use or
// out, and the standards' verdicts measured against it. The hand labels live beside the readings, under
// data/play-measure/ (gitignored, with the outlets' text):
//
//   node tools/play/handcheck.mjs draft <report.json> <London day> <out.json> [--overrides overrides.json]
//       writes a draft label file for every item of that day, each labelled as the tool labelled it, then the
//       overrides (an array of { outlet, title (a prefix), hand, why }) applied: the editor reads every line and
//       corrects it before it counts
//   node tools/play/handcheck.mjs score [--chosen] <report.json> <labels.json> [...more labels]
//       the confusion of the tool's "use" against the hand's, overall and per outlet; with --chosen, only the reports
//       the measurement would air (one an event): the share of them the hand passes
import fs from 'node:fs';

const key = (outlet, title) => `${outlet}|${String(title).replace(/\s+/g, ' ').trim().toLowerCase()}`;

/** The tool's "use" against the hand's: { n, tp, fp, fn, tn, precision, recall, errors }. */
export function score(items, labels, { chosen = false } = {}) {
  const byKey = new Map(items.map((s) => [key(s.outlet, s.title), s]));
  const out = { n: 0, tp: 0, fp: 0, fn: 0, tn: 0, missing: 0, errors: [], perOutlet: {} };
  for (const l of labels) {
    const s = byKey.get(key(l.outlet, l.title));
    if (!s) {
      out.missing++;
      continue;
    }
    if (chosen && !s.chosen) continue;
    out.n++;
    const tool = chosen ? true : !s.out;
    const hand = l.hand === 'use';
    const k = tool && hand ? 'tp' : tool ? 'fp' : hand ? 'fn' : 'tn';
    out[k]++;
    const o = (out.perOutlet[s.outlet] ??= { n: 0, tp: 0, fp: 0, fn: 0, tn: 0 });
    o.n++;
    o[k]++;
    if (k === 'fp' || k === 'fn') out.errors.push({ kind: k, outlet: s.outlet, title: s.title, tool: s.out || `use (${s.treatment})`, why: l.why || '' });
  }
  out.precision = out.tp + out.fp ? Math.round((1000 * out.tp) / (out.tp + out.fp)) / 10 : null;
  out.recall = out.tp + out.fn ? Math.round((1000 * out.tp) / (out.tp + out.fn)) / 10 : null;
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const chosenOnly = argv.includes('--chosen');
  const [cmd, reportFile, ...rest] = argv.filter((a) => a !== '--chosen');
  const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
  if (cmd === 'draft') {
    const [day, outFile] = rest;
    const oi = rest.indexOf('--overrides');
    const overrides = oi >= 0 ? JSON.parse(fs.readFileSync(rest[oi + 1], 'utf8')) : [];
    const labels = report.items.filter((s) => s.day === day).sort((a, b) => a.outlet.localeCompare(b.outlet) || a.title.localeCompare(b.title)).map((s) => {
      const o = overrides.find((x) => x.outlet === s.outlet && s.title.toLowerCase().startsWith(x.title.toLowerCase()));
      return { outlet: s.outlet, title: s.title, hand: o ? o.hand : s.out ? 'out' : 'use', why: o ? o.why : s.out || s.treatment, tool: s.out || 'use' };
    });
    fs.writeFileSync(outFile, JSON.stringify({ day, judged: new Date().toISOString(), labels }, null, 1));
    console.log(`[play] ${labels.length} labels drafted for ${day} into ${outFile} (${overrides.length} overrides)`);
  } else if (cmd === 'score') {
    for (const f of rest) {
      const { day, labels } = JSON.parse(fs.readFileSync(f, 'utf8'));
      const r = score(report.items, labels, { chosen: chosenOnly });
      console.log(`\n## ${f} (${day}): ${r.n} judged, ${r.missing} not in the report`);
      console.log(`tool use & hand use ${r.tp}; tool use & hand out ${r.fp}; tool out & hand use ${r.fn}; both out ${r.tn}`);
      console.log(`precision of "use" ${r.precision} %; recall ${r.recall} %`);
      for (const e of r.errors) console.log(`  ${e.kind === 'fp' ? 'KEPT, SHOULD GO' : 'DROPPED, SHOULD AIR'} [${e.outlet}] ${e.title.slice(0, 120)} (tool: ${e.tool}; hand: ${e.why})`);
      console.log('per outlet: ' + Object.entries(r.perOutlet).map(([k, v]) => `${k} ${v.tp + v.tn}/${v.n}`).join(', '));
    }
  } else {
    console.error('usage: handcheck.mjs draft <report> <day> <out> [--overrides f] | score <report> <labels...>');
    process.exit(2);
  }
}
