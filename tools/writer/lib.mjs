// The writer trial's measures (tools/writer/try.mjs; docs/publishing/server-setup.md §6): what each AI call cost and
// took, what each episode's stories copy, what the own-words loop rewrote, cut and dropped, what the editor found, and
// the month of 24/7 air those figures add up to. Pure functions, so the tests can run them on a fake model's episodes.
//
//   recordCalls(providers, calls, tag)       providers wrapped: every reply (or failure) recorded with its stage, tokens, time
//   episodeRow(episode, { getStory, calls }) one episode's measures
//   scheduleModel(channel, { air })          episodes a day and a month per programme on the clock (pins, rotation, dayparts)
//   monthlyVolume(model, perEpisode)         tokens a month: { input, output, cached, byProgramme }
//   costFormula(volume)                      the month's cost as a formula of the provider's prices per million tokens
//   summarize(rows, calls, { channel })      the whole trial; formatReport(summary) -> lines of text
import { lintEpisode } from '../../server/compliance/verbatim.js';
import { breakAir, episodeAir } from '../../server/station.js';

/** Wrap each provider's generate() so every call is recorded: { provider, stage, programme, ok, ms, input, output, cached, error }. */
export function recordCalls(providers, calls, tag = () => ({})) {
  return providers.map((p) => ({
    ...p,
    available: p.available,
    async generate(request) {
      const t0 = Date.now();
      const base = { provider: p.name, stage: request.stage || 'write', programme: request.program?.id || null, ...tag(request) };
      try {
        const result = await p.generate(request);
        calls.push({ ...base, ok: true, ms: Date.now() - t0, input: result.usage?.input || 0, output: result.usage?.output || 0, cached: result.usage?.cached || 0 });
        return result;
      } catch (err) {
        calls.push({ ...base, ok: false, ms: Date.now() - t0, input: 0, output: 0, cached: 0, error: String(err?.message || err).replace(/\s+/g, ' ').slice(0, 200) });
        throw err;
      }
    },
  }));
}

const sum = (list, k) => list.reduce((n, x) => n + (Number(x[k]) || 0), 0);
const round = (x, d = 3) => Math.round(x * 10 ** d) / 10 ** d;

/** The AI's calls of one episode, by stage: { write: { calls, failed, input, output, cached, ms }, rewrite, review }. */
export function stagesOf(calls) {
  const out = {};
  for (const c of calls) {
    const s = (out[c.stage] ||= { calls: 0, failed: 0, input: 0, output: 0, cached: 0, ms: 0 });
    s.calls++;
    if (!c.ok) s.failed++;
    s.input += c.input;
    s.output += c.output;
    s.cached += c.cached;
    s.ms += c.ms;
  }
  return out;
}

/**
 * One episode's measures: who wrote it, what each story copies as it will air (the publish gate's own lint), the
 * own-words loop after the writer and after the editor (rewrites, cuts, drops), the editor's changes, and the AI's
 * calls (tokens, time) by stage. `calls`: this episode's AI calls (recordCalls), offline writer's excluded.
 */
export function episodeRow(episode, { programme, getStory = () => null, calls = [], ms = 0, error = null } = {}) {
  const ai = calls.filter((c) => c.provider !== 'mock');
  const row = { programme, writtenBy: episode?.provider || null, ms, error, stages: stagesOf(ai), stories: [] };
  if (!episode) return row;
  const p = (name) => episode.pipeline?.find((x) => x.stage === name) || null;
  const write = p('write');
  const review = p('review');
  row.offline = !!write?.own?.offline;
  row.reviewed = !!review?.reviewed;
  row.air = Math.round(episodeAir(episode));
  row.pipelineMs = Object.fromEntries((episode.pipeline || []).map((x) => [x.stage, x.ms]));
  const own = [write?.own, review?.own].filter(Boolean);
  row.rewritten = [...new Set(own.flatMap((o) => o.rewritten || []))];
  row.trimmed = [...new Set(own.flatMap((o) => o.trimmed || []))];
  row.dropped = [...new Set(own.flatMap((o) => o.dropped || []))];
  row.refused = own.reduce((n, o) => n + (o.refused || 0), 0);
  row.rewriteRounds = own.reduce((n, o) => n + (o.rounds || 0), 0);
  row.faultsFound = own.reduce((n, o) => n + (o.faults || 0), 0);
  row.reviewChanges = review?.changes || { stories: 0, dropped: [], sentences: 0, fields: 0 };
  const lint = lintEpisode(episode, { getStory });
  row.stories = lint.stories.map((s) => ({ storyId: s.storyId, words: s.words ?? 0, share: round(s.share ?? 0), longest: s.longest ?? 0, ok: !s.violations?.length, unverified: !!s.unverified }));
  row.violating = lint.stories.filter((s) => s.violations?.length).length;
  return row;
}

/** Is the hour `h` (0-23) of weekday `d` (0 = Sunday) in a daypart? (from 22 to 6 wraps past midnight) */
const inPart = (part, h, d) => (part.from <= part.to ? h >= part.from && h < part.to : h >= part.from || h < part.to) && (!Array.isArray(part.days) || part.days.includes(d));

/**
 * Episodes a day and a month per programme on the channel's clock (config/channel.json `clock`): the pinned programme on
 * each of its marks (NEWS IN 60 at :00 and :30), the rotation in the time left (pinned programmes and the daypart's skips
 * left out), every programme followed by its break (station.js breakAir: one spot after a short programme, two after a
 * long one). `air`: programme id -> seconds on air (measured, else the middle of its targetSeconds, else 300). A
 * programme with `minGapHours` airs at most once in that many hours. An estimate: the station also skips a slot short of
 * news, and WORLD WEATHER waits for three news programmes.
 */
export function scheduleModel(channel, { air = {} } = {}) {
  const clock = channel.clock || {};
  const pins = clock.pins || [];
  const pinned = new Set(pins.map((p) => p.program));
  const { adsPerBreak = 2, minProgrammeBetween = 0 } = channel.breaks || {};
  const all = { ...channel.programs, ...(channel.drafts || {}) };
  const airOf = (id) => {
    if (Number.isFinite(air[id]) && air[id] > 0) return air[id];
    const t = all[id]?.targetSeconds;
    return Array.isArray(t) ? (t[0] + t[1]) / 2 : 300;
  };
  const slot = (id) => airOf(id) + breakAir({ ads: airOf(id) < minProgrammeBetween ? 1 : adsPerBreak });
  const week = {};
  const add = (id, n) => (week[id] = (week[id] || 0) + n);
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      let left = 3600;
      for (const p of pins) {
        add(p.program, 1);
        left -= slot(p.program);
      }
      const skip = new Set((clock.dayparts || []).filter((part) => inPart(part, h, d)).flatMap((part) => part.skip || []));
      const rotation = (channel.rotation || []).filter((id) => !pinned.has(id) && !skip.has(id) && channel.programs[id]);
      const cycle = rotation.reduce((t, id) => t + slot(id), 0);
      if (!cycle || left <= 0) continue;
      const cycles = left / cycle;
      for (const id of rotation) {
        const gap = Number(all[id]?.minGapHours) || 0;
        add(id, gap ? Math.min(cycles, 1 / gap) : cycles);
      }
    }
  }
  const perDay = Object.fromEntries(Object.entries(week).map(([id, n]) => [id, round(n / 7, 1)]));
  const perMonth = Object.fromEntries(Object.entries(week).map(([id, n]) => [id, Math.round((n / 7) * 30)]));
  return {
    perDay,
    perMonth,
    air: Object.fromEntries(Object.keys(week).map((id) => [id, Math.round(airOf(id))])),
    assumptions: [
      `${pins.length} pinned programme marks an hour (${[...pinned].join(', ') || 'none'})`,
      'the rotation fills the rest of each hour, in order, without the pinned programme and the dayparts\' skips',
      `a break after every programme (${breakAir({ ads: 1 })} s after one under ${minProgrammeBetween} s, ${breakAir({ ads: adsPerBreak })} s otherwise)`,
      'a month is 30 days; slots skipped for want of news are not taken off (an upper estimate)',
    ],
  };
}

/**
 * Tokens a month: each AI-written programme's episodes a month times its tokens per episode made (every call: write,
 * rewrites, review, failed replies, and the attempts the own-words check skipped, all spent for the episodes that air). `perEpisode`: id -> { input, output, cached }. Programmes without a
 * measure are listed in `unmeasured`.
 */
export function monthlyVolume(model, perEpisode) {
  const out = { input: 0, output: 0, cached: 0, byProgramme: {}, unmeasured: [] };
  for (const [id, n] of Object.entries(model.perMonth)) {
    const t = perEpisode[id];
    if (!t) continue;
    const v = { episodes: n, input: Math.round(n * t.input), output: Math.round(n * t.output), cached: Math.round(n * t.cached) };
    out.byProgramme[id] = v;
    out.input += v.input;
    out.output += v.output;
    out.cached += v.cached;
  }
  return out;
}

/** The month's cost as a formula of the provider's prices per million tokens (we do not know the price). */
export function costFormula(volume) {
  const m = (x) => round(x / 1e6, 2);
  const fresh = volume.input - volume.cached;
  return {
    inputM: m(volume.input),
    cachedM: m(volume.cached),
    outputM: m(volume.output),
    formula: `cost a month = ${m(fresh)} × P_in + ${m(volume.cached)} × P_cached + ${m(volume.output)} × P_out`,
    simple: `cost a month ≈ ${m(volume.input)} × P_in + ${m(volume.output)} × P_out (if cached input costs as much as fresh input)`,
    legend: 'P_in, P_cached, P_out: the provider\'s price per million input, cached input and output tokens (in your currency)',
  };
}

/** The whole trial: per programme and overall. `rows`: episodeRow()s; `calls`: every AI call recorded. */
export function summarize(rows, calls, { channel = null } = {}) {
  const ai = calls.filter((c) => c.provider !== 'mock');
  const made = rows.filter((r) => r.writtenBy);
  const byAI = made.filter((r) => !r.offline);
  const stories = byAI.flatMap((r) => r.stories);
  const shares = stories.map((s) => s.share).sort((a, b) => a - b);
  const pct = (list, p) => (list.length ? list[Math.min(list.length - 1, Math.floor(p * list.length))] : null);
  const byProgramme = {};
  for (const r of rows) {
    const b = (byProgramme[r.programme] ||= { episodes: 0, byAI: 0, offline: 0, notMade: 0, stories: 0, violating: 0, rewritten: 0, trimmed: 0, dropped: 0, reviewFaults: 0, air: [], tokens: { input: 0, output: 0, cached: 0 }, ms: [] });
    b.episodes++;
    // (every AI token counts, an attempt the own-words check skipped too: it is spent all the same)
    for (const st of Object.values(r.stages)) for (const k of ['input', 'output', 'cached']) b.tokens[k] += st[k];
    if (!r.writtenBy) b.notMade++;
    else if (r.offline) b.offline++;
    else {
      b.byAI++;
      b.stories += r.stories.length;
      b.violating += r.violating;
      b.rewritten += r.rewritten.length;
      b.trimmed += r.trimmed.length;
      b.dropped += r.dropped.length;
      b.reviewFaults += r.reviewChanges.sentences + r.reviewChanges.fields + r.reviewChanges.dropped.length;
      b.air.push(r.air);
      b.ms.push(r.ms);
    }
  }
  const perEpisode = {};
  const airMeasured = {};
  for (const [id, b] of Object.entries(byProgramme)) {
    if (b.byAI) perEpisode[id] = { input: b.tokens.input / b.byAI, output: b.tokens.output / b.byAI, cached: b.tokens.cached / b.byAI };
    if (b.air.length) airMeasured[id] = b.air.reduce((x, y) => x + y, 0) / b.air.length;
  }
  const stage = stagesOf(ai);
  for (const s of Object.values(stage)) s.msMean = s.calls ? Math.round(s.ms / s.calls) : 0;
  const model = channel ? scheduleModel(channel, { air: airMeasured }) : null;
  const volume = model ? monthlyVolume(model, perEpisode) : null;
  const offline = made.filter((r) => r.offline);
  // the programmes the AI writes (the others have writers of their own: the forecast, the archive, the quiz desk)
  const all = channel ? { ...channel.programs, ...(channel.drafts || {}) } : {};
  const aiProgrammes = Object.keys(all).filter((id) => !all[id].kind || all[id].kind === 'sport');
  return {
    aiProgrammes,
    episodes: rows.length,
    byAI: byAI.length,
    offlineStories: offline.reduce((n, r) => n + r.stories.length, 0),
    offlineViolating: offline.reduce((n, r) => n + r.violating, 0),
    offline: made.length - byAI.length,
    notMade: rows.length - made.length,
    stories: stories.length,
    violating: byAI.reduce((n, r) => n + r.violating, 0),
    share: { mean: stories.length ? round(stories.reduce((n, s) => n + s.share, 0) / stories.length) : null, p90: pct(shares, 0.9), max: shares.length ? shares.at(-1) : null },
    longest: stories.reduce((n, s) => Math.max(n, s.longest), 0),
    rewritten: byAI.reduce((n, r) => n + r.rewritten.length, 0),
    trimmed: byAI.reduce((n, r) => n + r.trimmed.length, 0),
    dropped: byAI.reduce((n, r) => n + r.dropped.length, 0),
    refused: byAI.reduce((n, r) => n + r.refused, 0),
    faultsFound: byAI.reduce((n, r) => n + r.faultsFound, 0),
    reviewFaults: byAI.reduce((n, r) => ({ stories: n.stories + r.reviewChanges.stories, sentences: n.sentences + r.reviewChanges.sentences, fields: n.fields + r.reviewChanges.fields, dropped: n.dropped + r.reviewChanges.dropped.length }), { stories: 0, sentences: 0, fields: 0, dropped: 0 }),
    failedCalls: ai.filter((c) => !c.ok).length,
    stages: stage,
    byProgramme,
    perEpisode,
    schedule: model,
    volume,
    cost: volume ? costFormula(volume) : null,
  };
}

const n0 = (x) => (x == null ? '-' : String(x));
const pc = (x) => (x == null ? '-' : `${Math.round(x * 1000) / 10} %`);

/** One episode's lines of the report. */
export function episodeLines(r) {
  const L = [];
  L.push(`  ${String(r.programme).padEnd(13)} ${r.writtenBy ? `by ${r.writtenBy}${r.offline ? ' (OFFLINE: never published)' : ''}${r.reviewed ? ' + review' : ''}` : `not made: ${r.error || 'not enough stories'}`}`);
  const tok = Object.entries(r.stages).map(([k, s]) => `${k} ${s.calls}x in ${s.input} out ${s.output}${s.cached ? ` cached ${s.cached}` : ''} ${(s.ms / 1000).toFixed(1)} s${s.failed ? ` (${s.failed} failed)` : ''}`).join(' | ');
  if (tok) L.push(`    AI: ${tok}`);
  if (!r.writtenBy) return L;
  L.push(`    stages (s): ${Object.entries(r.pipelineMs || {}).map(([k, v]) => `${k} ${(v / 1000).toFixed(1)}`).join(', ')}; on air ${r.air} s`);
  L.push(`    own words: ${r.rewritten.length} rewritten, ${r.trimmed.length} cut, ${r.dropped.length} dropped${r.refused ? `, ${r.refused} rewrites refused` : ''}${r.faultsFound ? `, ${r.faultsFound} paraphrase faults left` : ''}; editor changed ${r.reviewChanges.sentences} sentences and ${r.reviewChanges.fields} fields in ${r.reviewChanges.stories} stories${r.reviewChanges.dropped.length ? `, took out ${r.reviewChanges.dropped.length}` : ''}`);
  for (const s of r.stories) L.push(`    ${s.ok ? 'ok  ' : 'COPY'} ${s.storyId.padEnd(14)} copied ${pc(s.share).padStart(7)}  longest run ${String(s.longest).padStart(2)} words  (${s.words} words${s.unverified ? ', no article: title and summary only' : ''})`);
  return L;
}

/** The trial's report as lines of text (what try.mjs prints and keeps in report.txt). */
export function formatReport(summary, rows = []) {
  const L = ['EPISODES', ...rows.flatMap(episodeLines)];
  L.push('');
  L.push('SUMMARY');
  L.push(`  episodes ${summary.episodes}: ${summary.byAI} by the AI, ${summary.offline} by the offline writer, ${summary.notMade} not made; ${summary.failedCalls} failed AI calls`);
  L.push(`  stories by the AI: ${summary.stories}; breaking the verbatim rule as aired: ${summary.violating} (must be 0)`);
  if (summary.offline) L.push(`  stories by the offline writer: ${summary.offlineStories}, ${summary.offlineViolating} breaking the rule (its episodes are held at the publish gate: never published)`);
  L.push(`  copied share per story: mean ${pc(summary.share.mean)}, 90 % under ${pc(summary.share.p90)}, worst ${pc(summary.share.max)}; longest run ${summary.longest} words (rule: 12, 20 %)`);
  L.push(`  own words: ${summary.rewritten} stories rewritten, ${summary.trimmed} cut, ${summary.dropped} dropped, ${summary.refused} rewrites refused`);
  L.push(`  editor (review faults): ${summary.reviewFaults.sentences} sentences and ${summary.reviewFaults.fields} fields changed in ${summary.reviewFaults.stories} stories, ${summary.reviewFaults.dropped} stories taken out`);
  for (const [k, s] of Object.entries(summary.stages)) L.push(`  ${k.padEnd(8)} ${s.calls} calls, mean ${(s.msMean / 1000).toFixed(1)} s, in ${s.input} out ${s.output} cached ${s.cached} tokens${s.failed ? `, ${s.failed} failed` : ''}`);
  if (summary.schedule) {
    L.push('');
    L.push('A MONTH OF 24/7 AIR (estimate)');
    for (const [id, n] of Object.entries(summary.schedule.perMonth)) {
      const v = summary.volume.byProgramme[id];
      const why = !summary.aiProgrammes?.includes(id) ? 'not written by the AI' : summary.byProgramme[id] ? 'no episode made by the AI' : 'not in this trial';
      L.push(`  ${id.padEnd(14)} ${String(summary.schedule.perDay[id]).padStart(5)} a day, ${String(n).padStart(5)} a month${v ? `: in ${(v.input / 1e6).toFixed(2)} M, out ${(v.output / 1e6).toFixed(2)} M tokens` : `: ${why}`}`);
    }
    L.push(`  tokens a month: in ${n0(summary.cost.inputM)} M (cached ${n0(summary.cost.cachedM)} M), out ${n0(summary.cost.outputM)} M${Object.keys(summary.schedule.perMonth).some((id) => summary.aiProgrammes?.includes(id) && !summary.volume.byProgramme[id]) ? ' (only the programmes measured: run every programme for the whole month)' : ''}`);
    L.push(`  ${summary.cost.formula}`);
    L.push(`  ${summary.cost.simple}`);
    L.push(`  (${summary.cost.legend})`);
    for (const a of summary.schedule.assumptions) L.push(`  - ${a}`);
  }
  return L;
}
