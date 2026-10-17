// ============================================================================================================
//  STUB — a stand-in for server/compliance/ (the compliance desk's module, built in parallel; contract in
//  docs/publishing/compliance.md §8). server/publish/compliance.js loads the real module whenever it exists and
//  this file only when it does not. Same names, same shapes, the SAFE side of every rule: when in doubt it
//  refuses. It is never the reason anything is published: nothing is published until the owner says so, and a
//  live publish refuses to run on the stub (server/publish/publisher.js).
// ============================================================================================================
//
//   disclosureFor(item)        flags and labels per platform (every flag set: a synthetic voice narrates real news)
//   describe(item, { credits, summary })   a description with the disclosure first
//   textPost(item, { max })    a text post that starts "AI-generated:"
//   creditsFor(item)           credit lines: the outlets the item's stories came from, the channel's own assets
//   checkClip(clip, opts)      demo data, cuts inside sentences and quotes, recreations (provenance, label in every
//                              frame), the platforms' flags, an election period
//   markFile(path, manifest)   a C2PA sidecar manifest beside the file (the real module signs the file itself)
//   buildManifest(item, opts)  the manifest
//   preflight(item, opts)      checkClip (video) or the text rule, with the disclosure and credits
export const STUB = true;

const TEXT_PREFIX = 'AI-generated:';
const PLATFORM_FIELDS = {
  youtube: { field: 'videos.status.containsSyntheticMedia', key: 'containsSyntheticMedia' },
  tiktok: { field: 'post_info.is_aigc', key: 'is_aigc' },
  instagram: { field: 'is_ai_generated', key: 'is_ai_generated' },
  facebook: { field: null },
  threads: { field: null },
  x: { field: null },
  bluesky: { field: null },
  telegram: { field: null },
};
const isVideo = (k) => ['live', 'episode', 'clip', 'short'].includes(k);
const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/** The IN THEIR WORDS pieces of an episode (a cross of kind 'restage'). */
export function recreationsIn(episode) {
  const out = [];
  (episode?.segments || []).forEach((seg, index) => {
    if (!seg || !(seg.recreation === true || seg.kind === 'restage')) return;
    const b = episode?.guests?.[seg.reporter] || null;
    out.push({ index, id: seg.reporter || b?.id || null, name: b?.name || b?.strap?.name || null, role: b?.role || b?.strap?.role || seg.desk || null, outlet: seg.quoteRef?.outlet || seg.source || null, storyId: seg.storyId || null, words: norm(seg.text) });
  });
  return out;
}

export function disclosureFor(item = {}) {
  const kind = String(item.kind || (item.episode ? 'episode' : 'text'));
  const recreations = Array.isArray(item.recreations) ? item.recreations : recreationsIn(item.episode);
  const opening = isVideo(kind)
    ? 'AI-produced news: written by the channel’s software from the named sources and presented by animated characters with synthetic voices.'
    : 'AI-generated: written by the channel’s software from the named source.';
  const lines = [opening, ...recreations.map((r) => `Contains an AI RECREATION: the words of ${r.name || r.role || 'a public figure'} as reported by ${r.outlet || 'the source'}, said by a generic synthetic voice over a pixel-art figure. It is not their real voice or image.`)];
  const wanted = Array.isArray(item.platforms) && item.platforms.length ? item.platforms : Object.keys(PLATFORM_FIELDS);
  const platforms = {};
  for (const p of wanted) {
    const f = PLATFORM_FIELDS[p];
    if (!f) continue;
    platforms[p] = f.field ? { field: f.field, [f.key]: true, required: recreations.length > 0, textTop: opening } : { field: null, manualLabel: recreations.length > 0 && isVideo(kind), textTop: p === 'x' || p === 'bluesky' ? TEXT_PREFIX : opening };
  }
  return { kind, stub: true, ai: { text: true, voices: isVideo(kind), recreation: recreations.length > 0, pictures: 'real, credited (never AI-generated)' }, recreations, labels: { mark: 'AI', textPrefix: TEXT_PREFIX }, description: { opening, lines }, platforms };
}

export function creditsFor(item = {}) {
  const ep = item.episode || null;
  const outlets = new Set();
  for (const s of ep?.segments || []) if (s.source || s.outlet) outlets.add(norm(s.source || s.outlet));
  for (const c of item.credits || []) if (c?.outlet) outlets.add(norm(c.outlet));
  const out = [...outlets].filter(Boolean).map((o) => `Reporting: ${o}`);
  out.push('Presenters, sets, graphics and music: original, by GLOBIT 24');
  return out;
}

export function describe(item, { credits = [], summary = '' } = {}) {
  const d = disclosureFor(item);
  const out = [...d.description.lines];
  if (summary) out.push('', String(summary).trim());
  if (credits.length) out.push('', 'Credits:', ...credits.map((c) => `· ${c}`));
  return out.join('\n');
}

export function textPost(item, { max = 280 } = {}) {
  const source = item.source ? ` (Source: ${item.source})` : '';
  const link = item.link ? ` ${item.link}` : '';
  let body = norm(item.text);
  const room = max - TEXT_PREFIX.length - 1 - source.length - (link ? 24 : 0);
  if (body.length > room) body = `${body.slice(0, Math.max(0, room - 1)).replace(/\s+\S*$/, '')}…`;
  return `${TEXT_PREFIX} ${body}${source}${link}`;
}

/** Sentences of the recording (the recorder's report): [{ start, end, text, segIndex, kind, quote }]. */
function sentencesFrom(episode, report) {
  const ev = Array.isArray(report?.events) ? report.events : [];
  const speaks = ev.filter((e) => e.type === 'speak' && Number.isFinite(e.v)).sort((a, b) => a.v - b.v);
  const sents = ev.filter((e) => e.type === 'sentence' && Number.isFinite(e.v)).sort((a, b) => a.v - b.v);
  const clips = ev.filter((e) => e.type === 'clip' && Number.isFinite(e.va) && Number.isFinite(e.duration));
  const segs = episode?.segments || [];
  const key = (s) => norm(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  let ptr = 0;
  const map = new Map();
  for (const s of speaks) {
    const head = key(s.text).slice(0, 30);
    for (let k = ptr; k < segs.length && head; k++) {
      if (key(segs[k].text).startsWith(head)) {
        map.set(s, k);
        ptr = k + 1;
        break;
      }
    }
  }
  return sents.map((s, i) => {
    const sp = [...speaks].reverse().find((x) => x.v <= s.v + 1e-6 && (!x.slot || !s.slot || x.slot === s.slot));
    const segIndex = sp && map.has(sp) ? map.get(sp) : null;
    const seg = segIndex !== null ? segs[segIndex] : null;
    const next = sents[i + 1];
    // a sentence ends where the next begins, or where its voice clip ends when that is sooner (the real module's rule)
    let end = next ? next.v : s.v + Math.max(1, String(s.text || '').split(/\s+/).length * 0.45);
    const clip = clips.find((c) => s.v >= c.va - 0.05 && s.v < c.va + c.duration);
    if (clip) end = Math.min(end, clip.va + clip.duration);
    const rec = !!(seg && (seg.recreation || seg.kind === 'restage'));
    return { start: s.v, end, text: s.text, segIndex, kind: rec ? 'recreation' : 'speech', quote: rec || /[“"][^”"]{6,}[”"]/.test(seg?.text || '') };
  });
}

const EPS = 0.12;
/** Election periods the owner sets (ELECTION_PERIODS="2026-11-03:US,2026-12-01:XX"): political items hold during them. */
function electionPeriods(env = process.env) {
  return String(env.ELECTION_PERIODS || '').split(',').map((x) => x.trim()).filter(Boolean).map((x) => {
    const [day, region = ''] = x.split(':');
    return { day: Date.parse(`${day}T00:00:00Z`), region };
  }).filter((p) => Number.isFinite(p.day));
}

export function checkClip(clip = {}, opts = {}) {
  const violations = [];
  const warnings = [];
  const v = (rule, message, extra = {}) => violations.push({ rule, message, ...extra });
  const episode = clip.episode || null;
  const kind = clip.kind || 'clip';
  const whole = kind === 'episode' || kind === 'live';
  if (episode?.demo || /\bDEMO DATA\b/.test(String(episode?.weather?.source || ''))) v('demo', 'demo data (the offline forecast) is never published');
  const range = whole ? null : { start: Number(clip.range?.start), end: Number(clip.range?.end) };
  if (!whole && !(range && Number.isFinite(range.start) && Number.isFinite(range.end) && range.end > range.start)) v('timeline-missing', 'a clip needs its range { start, end } in seconds');
  const sents = clip.recording ? sentencesFrom(episode, clip.recording) : Array.isArray(clip.timeline) ? clip.timeline : null;
  const recs = recreationsIn(episode);
  if (!whole && recs.length && !sents) v('timeline-missing', 'a clip of an episode with a recreation needs its recording: nothing can be verified, so nothing goes');
  const inRange = [];
  if (!whole && sents && range) {
    for (const edge of [range.start, range.end]) {
      const s = sents.find((x) => edge > x.start + EPS && edge < x.end - EPS);
      if (s) v(s.quote ? 'quote-cut' : 'sentence-cut', `the cut at ${edge.toFixed(2)} s falls inside "${s.text}"`, { at: edge });
    }
    for (const r of recs) {
      const said = sents.filter((x) => x.segIndex === r.index);
      if (!said.length) continue;
      const span = { start: Math.min(...said.map((x) => x.start)), end: Math.max(...said.map((x) => x.end)) };
      if (range.end <= span.start + EPS || range.start >= span.end - EPS) continue;
      inRange.push(r);
      const prov = sents.filter((x) => x.segIndex === r.index - 1).at(-1);
      if (!prov || range.start > prov.start + EPS) v('provenance-missing', 'the clip must start at the presenter’s line that says whose words these are', { recreation: r.id });
      if (range.start > span.start + EPS || range.end < span.end - EPS) v('quote-cut', 'the clip cuts into the recreation’s words', { recreation: r.id });
    }
  } else if (whole) inRange.push(...recs);
  // the label on every frame of the recreation (the renderer's own evidence: clip.labelFrames { total, labelled })
  if (inRange.length && !whole) {
    const lf = clip.labelFrames;
    if (!lf || !(lf.total > 0)) v('label-out-of-frame', 'no evidence that the RECREATION label and its SOURCE are on screen: the renderer reports the labelled frames');
    else if (lf.labelled < lf.total) v('label-out-of-frame', `the RECREATION label is missing on ${lf.total - lf.labelled} of ${lf.total} frames of the recreation`);
  }
  // the flags
  const d = disclosureFor({ kind, episode, recreations: inRange, platforms: clip.platforms });
  for (const [name, p] of Object.entries(d.platforms)) {
    const set = clip.flags?.[name] || {};
    if (name === 'youtube' && set.containsSyntheticMedia !== true) v('flag-missing', 'YouTube: set status.containsSyntheticMedia = true', { platform: name });
    if (name === 'tiktok' && set.is_aigc !== true) v('flag-missing', 'TikTok: set post_info.is_aigc = true', { platform: name });
    if (name === 'instagram' && set.is_ai_generated !== true) v('flag-missing', 'Instagram: set is_ai_generated = true', { platform: name });
    if (!p.field && p.manualLabel && set.manualLabel !== true) v('flag-unavailable', `${name}: no API flag; apply the AI label by hand or leave ${name} out`, { platform: name });
  }
  // an election period: no political item and no recreation of a politician
  const now = Number.isFinite(clip.publishAt) ? clip.publishAt : opts.now ?? Date.now();
  const periods = electionPeriods(opts.env || process.env).filter((p) => Math.abs(now - p.day) <= 3 * 86400_000);
  if (periods.length && (inRange.length || /\b(?:election|vote|ballot|candidate|campaign|polls?)\b/i.test(`${clip.text || ''}`))) v('election-hold', `an election period (${periods.map((p) => p.region || 'set').join(', ')}): political items and recreations wait`);
  return { ok: violations.length === 0, violations, warnings, recreations: inRange, disclosure: d, stub: true };
}

export function buildManifest(item = {}, { title = null, sources = [], credits = [], format = null } = {}) {
  return {
    claim_generator: 'GLOBIT 24 publishing desk',
    title: title || item.title || 'GLOBIT 24',
    format,
    assertions: [
      { label: 'c2pa.actions', data: { actions: [{ action: 'c2pa.created', digitalSourceType: 'http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia' }] } },
      { label: 'stds.schema-org.CreativeWork', data: { author: [{ '@type': 'Organization', name: 'GLOBIT 24' }], citation: sources, credits } },
    ],
  };
}

/** STUB: writes `<file>.c2pa.json` beside the file; the real module signs the file itself (c2patool). */
export async function markFile(file, manifest) {
  const fs = await import('node:fs');
  const sidecar = `${file}.c2pa.json`;
  fs.writeFileSync(sidecar, JSON.stringify({ stub: true, manifest }, null, 1));
  return { ok: false, stub: true, sidecar, reason: 'the compliance module is not installed: the file is not signed (a sidecar manifest only)' };
}

/**
 * The verbatim measure, on the safe side of the real one (server/compliance/verbatim.js): runs of 6 words or more
 * copied from the sources, a run over 12 words or more than 20 % of the words copied is a violation. Unlike the real
 * module it exempts no quotation, so an attributed headline counts as copied here too (the stub refuses more).
 */
export function storyReport(aired, sources, { maxRun = 12, maxShare = 0.2, phrase = 6 } = {}) {
  const toks = (t) => (String(t ?? '').match(/[\p{L}\p{N}]+(?:[’'][\p{L}]+)?/gu) || []).map((w) => w.toLowerCase().replace(/[’']/g, ''));
  const a = toks(aired);
  const srcs = (Array.isArray(sources) ? sources : [sources]).map(toks);
  const grams = new Set();
  for (const s of srcs) for (let i = 0; i + phrase <= s.length; i++) grams.add(s.slice(i, i + phrase).join(' '));
  const runs = [];
  for (let i = 0; i + phrase <= a.length; ) {
    if (!grams.has(a.slice(i, i + phrase).join(' '))) {
      i++;
      continue;
    }
    let k = phrase;
    while (i + k < a.length && grams.has(a.slice(i + k - phrase + 1, i + k + 1).join(' '))) k++;
    runs.push({ from: i, to: i + k, length: k, longest: k, outside: k, text: a.slice(i, i + k).join(' ') });
    i += k;
  }
  const copied = runs.reduce((n, r) => n + r.length, 0);
  const share = a.length ? copied / a.length : 0;
  const violations = [];
  for (const r of runs) if (r.length > maxRun) violations.push({ rule: 'run', length: r.length, text: r.text });
  if (share > maxShare) violations.push({ rule: 'share', share: Math.round(share * 1000) / 1000 });
  return { words: a.length, quoted: 0, copied, share, longest: runs.reduce((n, r) => Math.max(n, r.length), 0), runs, violations, stub: true };
}

export function preflight(item = {}, opts = {}) {
  const kind = item.kind || (item.episode ? 'episode' : 'text');
  if (isVideo(kind)) {
    const r = checkClip({ ...item, kind }, opts);
    return { ...r, credits: creditsFor(item), description: describe(item, { credits: creditsFor(item) }) };
  }
  const violations = [];
  if (!/^AI-generated:/.test(norm(item.text))) violations.push({ rule: 'text-disclosure-missing', message: 'a text post starts with "AI-generated:"' });
  const src = (item.sourceTexts || []).filter(Boolean);
  if (src.length && storyReport(String(item.text || '').replace(/https?:\/\/\S+/g, ' ').replace(/<[^>]+>/g, ' '), src).violations.length) violations.push({ rule: 'verbatim', message: 'the post copies its source (the stub counts a quoted headline as copied too)' });
  return { ok: violations.length === 0, violations, warnings: [], disclosure: disclosureFor({ ...item, kind }), credits: creditsFor(item), stub: true };
}
