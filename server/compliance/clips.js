// The publish-time check of a clip, a Short or a whole programme (docs/publishing/compliance.md §5): it refuses
// what the rules forbid, it does not just warn. Every rule names itself in the violation, with what to do.
//
//   provenance-missing   a clip with a recreation starts after the presenter's line that says whose words they are
//   quote-cut            a cut inside a quotation (a recreation's words, or a sentence that quotes someone)
//   sentence-cut         a cut inside any sentence (a half sentence can say what nobody said)
//   label-out-of-frame   the recreation's AI RECREATION label or its SOURCE falls outside the crop, or loses a word
//   label-illegible      the label is too small on the published picture (a 16:9 frame shrunk into a 9:16 one)
//   end-card-missing     a clip or Short without its end card carrying the AI notice (the channel ident's words)
//   text-disclosure-missing  a video without a caption or description, or one whose first line does not say it is
//                        AI-produced (a clip's caption: "AI-produced news: …")
//   ident-missing        a programme (a whole upload, a programme of the stream) whose recording does not open with the
//                        channel's ident (IDENT_RULES.startWithin s, held IDENT_RULES.minSeconds): the disclosure before
//                        every programme and after every break; on the stream, also an ident card without the notice
//   ident-gap            a programme of the stream long enough that, with the break after it, a viewer could go more than
//                        IDENT_RULES.maxGap s without an ident (the ads never count: the ident is the channel's own card)
//   (the platform's own AI label, the clip's other first-frame disclosure, is `flag-missing` / `flag-unavailable`)
//   (no rule asks for the yellow AI plate once docked to the bug, nor for any notice over a programme or a clip's first
//   seconds: owner, 18 Oct; compliance.md §2.10, §3)
//   flag-missing        a platform's synthetic-media flag is not set on an upload that must carry it
//   flag-unavailable     a platform with no API flag for a recreation (Facebook, Threads): set it by hand or leave it out
//   election-hold        a recreation of a politician of a country inside its election window, or of a candidate
//   election-silence     an item about a vote in a country during its legal silence (held until polls close)
//   blocked              a person, story or item kept off air and out of publication by the register (§7)
//   review-missing       an item with a recreation that the owner has not reviewed (§3.3)
//   demo                 demo data (the offline weather's fictional storm) is never published
//   timeline-missing     a clip with a recreation and no timeline: nothing can be verified, so nothing goes
//
//   timelineFromRecording(episode, report)   tools/record.mjs --report -> [{ start, end, text, slot, segIndex, kind, recreationId, quote }]
//   identRuns(report)                        the channel's ident on screen in a recording: [{ from, to }] (seconds)
//   clipCards({ endCard })                   what a clip's end card says (the factory declares it: clip.cards)
//   checkClip(clip, opts)                    -> { ok, violations: [{ rule, message, ... }], warnings, recreations, disclosure }
//   frameGeometry(frame)                     -> { crop, place, output, window, scale }
//   IDENT_RULES                              the ident's timing the check applies
import { recreationOf, recreationLayout, RECREATION_WINDOW } from '../../public/js/graphics/recreation.js';
export { RECREATION_WINDOW };
import { noticeParts, NOTICE_SEP } from '../../public/js/graphics/disclosure.js';
import { CHANNEL as PACE } from '../../public/js/pace.js';
import { V, VW, VH, boardBox } from '../../public/js/clip/layout.js';
import { disclosureFor, recreationsIn } from './disclosure.js';
import { electionHold, silenceHold, loadCalendar } from './elections.js';
import { roleKind } from '../guests/restage.js';

const SRC_W = 384;
const SRC_H = 216;
const CAP = 7; // the body face's cap height in source pixels
const MICRO_CAP = 5; // the micro face's
const EPS = 0.12; // seconds: a cut this close to a sentence's edge is on the edge

const norm = (s) => String(s ?? '').toLowerCase().replace(/[“”"‘’'`]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const hasQuote = (s) => /[“"][^”"]{6,}[”"]/u.test(String(s ?? ''));

/**
 * The ident's timing (pace.js CHANNEL.ident; the director airs it before every programme): a programme's recording opens
 * with it within `startWithin` s, held at least `minSeconds`; an end card holds at least `endCardSeconds`. On the stream
 * a viewer never goes more than `maxGap` s without one: a programme's span from its ident to its end, plus the longest
 * break that can follow it (`breakAllowance`: the bumper, two spots, the promo and the countdown's 90 s hold, as
 * server/station.js breakAir counts it), stays within it.
 */
export const IDENT_RULES = Object.freeze({
  startWithin: 3,
  minSeconds: Math.min(3, PACE.ident.hold),
  endCardSeconds: 2,
  maxGap: 900,
  breakAllowance: 180,
});
/** A first line that says what the item is: "AI-produced news: …" (a description, a caption), "AI-generated: …" (a post). */
const TEXT_DISCLOSURE = /\bAI-(?:produced|generated)\b/i;
/** …at the line's start (an emoji or a quotation mark before it at most). */
const TEXT_FIRST = /^\W{0,3}AI-(?:produced|generated)\b/iu;
/** What in it is AI: the presenters as characters, their voices (the caption's sentence, the description's opening). */
const TEXT_WHAT = /\b(?:AI(?:-generated)?|animated) characters\b|\bwritten by (?:AI|the channel)/i;
const sameParts = (a, b) => Array.isArray(a) && a.length === b.length && a.every((x, i) => String(x).trim().toUpperCase() === b[i]);

/**
 * The channel's ident in a recording (the recorder logs every shot with its card's kind: tools/recorder/page.mjs; the
 * break bumper shares the 'ident' shot with card kind 'break' and is not the ident): [{ from, to }], each held until
 * the next shot, the last to the recording's end.
 */
export function identRuns(report) {
  const shots = (Array.isArray(report?.events) ? report.events : []).filter((e) => e?.type === 'shot' && Number.isFinite(e.v)).sort((a, b) => a.v - b.v);
  const end = Number.isFinite(report?.seconds) ? report.seconds : Infinity;
  const out = [];
  shots.forEach((e, i) => {
    if (e.shot === 'ident' && e.card !== 'break') out.push({ from: e.v, to: shots[i + 1] ? shots[i + 1].v : end });
  });
  return out;
}

/**
 * What a clip's end card says, as the factory composites it (tools/publish/factory.mjs; clip/cards.js drawEndCard): the
 * channel ident's words for `endCard` seconds. -> clip.cards
 */
export function clipCards({ endCard = 2.6 } = {}) {
  return { endCard: { seconds: endCard, parts: noticeParts('NEWS') } };
}

/** The words a segment says (for matching the recorder's speak events to segments). */
function spoken(seg) {
  return String(seg?.text ?? seg?.say ?? '');
}

/**
 * The episode's timeline from the deterministic recorder's report (tools/record.mjs --report: events of type
 * 'speak' { slot, text } and 'sentence' { slot, i, text } with their video time `v`, and 'clip' { va, duration } for
 * each recorded voice clip heard). `offset` = the recording's start within the clip's own timeline (seconds).
 */
export function timelineFromRecording(episode, report, { offset = 0 } = {}) {
  const events = Array.isArray(report?.events) ? report.events : [];
  const speaks = events.filter((e) => e.type === 'speak' && Number.isFinite(e.v)).sort((a, b) => a.v - b.v);
  const sentences = events.filter((e) => e.type === 'sentence' && Number.isFinite(e.v)).sort((a, b) => a.v - b.v);
  const clips = events.filter((e) => e.type === 'clip' && Number.isFinite(e.va) && Number.isFinite(e.duration));
  const segs = Array.isArray(episode?.segments) ? episode.segments : [];
  // each speak event to the next segment whose words begin with it
  let ptr = 0;
  const speakSeg = new Map();
  for (const s of speaks) {
    const head = norm(s.text).slice(0, 40);
    for (let k = ptr; k < segs.length && head; k++) {
      if (norm(spoken(segs[k])).startsWith(head)) {
        speakSeg.set(s, k);
        ptr = k + 1;
        break;
      }
    }
  }
  const out = [];
  sentences.forEach((s, i) => {
    const sp = [...speaks].reverse().find((x) => x.v <= s.v + 1e-6 && x.slot === s.slot);
    const segIndex = sp && speakSeg.has(sp) ? speakSeg.get(sp) : null;
    const next = sentences[i + 1];
    let end = next ? next.v : s.v + Math.max(1, String(s.text || '').split(/\s+/).length * 0.45);
    const clip = clips.find((c) => s.v >= c.va - 0.05 && s.v < c.va + c.duration);
    if (clip) end = Math.min(end, clip.va + clip.duration);
    const seg = segIndex !== null ? segs[segIndex] : null;
    const isRec = !!(seg && (seg.recreation || seg.kind === 'restage'));
    out.push({ start: s.v + offset, end: Math.max(s.v, end) + offset, text: String(s.text || ''), slot: s.slot || null, segIndex, kind: isRec ? 'recreation' : 'speech', recreationId: isRec ? seg.reporter || null : null, quote: isRec || hasQuote(seg?.text) });
  });
  // the presenter's hand-over: the last sentence of the segment right before each recreation (producer.js guests())
  for (let k = 0; k < out.length; k++) {
    const t = out[k];
    if (t.kind !== 'recreation') continue;
    const segIdx = t.segIndex;
    const prev = segIdx !== null ? segs[segIdx - 1] : null;
    if (!prev || prev.linkKind !== 'restage') continue;
    for (let j = k - 1; j >= 0; j--) {
      if (out[j].segIndex === segIdx - 1) {
        if (out[j].kind !== 'provenance') out[j] = { ...out[j], kind: 'provenance', recreationId: t.recreationId };
        break;
      }
    }
  }
  return out;
}

/**
 * The clip's picture geometry. `frame` = { crop: { x, y, w, h } in the 384x216 canvas, output: { w, h } px,
 * place: { x, y, w, h } where the crop lands in the output (default: fills it), window: '9x16@131' | { x, w } | null
 * (the window the graphics were laid out in: tools/record.mjs with ?frame=...) }. Missing: the whole 16:9 frame at
 * 1920x1080. `layout: 'vertical-216x384'`: the publishing desk's vertical picture, composed natively at 216x384 (its
 * crop is the whole of that canvas, and its graphics are laid out for it: `vertical` in the result).
 */
export function frameGeometry(frame = {}) {
  if (frame.layout === 'vertical-216x384') {
    const crop = { x: 0, y: 0, w: VW, h: VH, ...(frame.crop || {}) };
    const output = { w: 1080, h: 1920, ...(frame.output || {}) };
    const place = { x: 0, y: 0, w: output.w, h: output.h, ...(frame.place || {}) };
    return { crop, output, place, window: { active: false, x: 0, w: VW }, scale: Math.min(place.w / crop.w, place.h / crop.h), vertical: true };
  }
  const crop = { x: 0, y: 0, w: SRC_W, h: SRC_H, ...(frame.crop || {}) };
  const output = { w: 1920, h: 1080, ...(frame.output || {}) };
  const place = { x: 0, y: 0, w: output.w, h: output.h, ...(frame.place || {}) };
  let window = { active: false, x: 0, w: SRC_W };
  const wspec = frame.window;
  if (typeof wspec === 'string') {
    const m = /^(9x16|1x1|4x5|3x4)(?:@(\d{1,3}))?$/.exec(wspec);
    if (m) {
      const ratio = { '9x16': 9 / 16, '1x1': 1, '4x5': 4 / 5, '3x4': 3 / 4 }[m[1]];
      const w = Math.floor(SRC_H * ratio);
      const x = m[2] !== undefined ? Math.max(0, Math.min(SRC_W - w, Number(m[2]))) : Math.round((SRC_W - w) / 2);
      window = { active: true, x, w };
    }
  } else if (wspec && Number.isFinite(wspec.x) && Number.isFinite(wspec.w)) window = { active: true, x: wspec.x, w: wspec.w };
  const scale = Math.min(place.w / crop.w, place.h / crop.h);
  return { crop, output, place, window, scale };
}

const inside = (r, c) => r.x0 >= c.x - 1e-9 && r.y0 >= c.y - 1e-9 && r.x1 <= c.x + c.w + 1e-9 && r.y1 <= c.y + c.h + 1e-9;

/** The smallest cap height a label may have on the published picture: 1.6 % of its height, 16 px at least. */
export const legibleCap = (outputH) => Math.max(16, 0.016 * outputH);

/**
 * Check one item before it is published. `clip` = {
 *   id, kind: 'clip'|'short'|'episode', episode, range: { start, end } (seconds; an episode: the whole),
 *   timeline? (timelineFromRecording), recording? (the record.mjs report, when no timeline is given),
 *   frame? (frameGeometry), platforms: ['youtube', ...], flags: { youtube: { containsSyntheticMedia: true, selfDeclaredMadeForKids: false }, ... },
 *   text? (the post's or description's words), publishAt? (ms)
 * }
 * `opts` = { now, calendar, register (registry.js), requireReview (true), dataDir }
 */
export function checkClip(clip = {}, opts = {}) {
  const now = Number.isFinite(clip.publishAt) ? clip.publishAt : opts.now ?? Date.now();
  const violations = [];
  const warnings = [];
  const v = (rule, message, extra = {}) => violations.push({ rule, message, ...extra });
  const episode = clip.episode || null;
  const kind = clip.kind || 'clip';
  const whole = kind === 'episode' || kind === 'live';
  const range = whole ? { start: -Infinity, end: Infinity } : { start: Number(clip.range?.start), end: Number(clip.range?.end) };
  if (!whole && !(Number.isFinite(range.start) && Number.isFinite(range.end) && range.end > range.start)) v('timeline-missing', 'a clip needs its range { start, end } in seconds');

  // demo data never goes out (the offline weather's storm is fictional)
  if (episode?.demo || episode?.weather?.demo || /\bDEMO DATA\b/.test(String(episode?.weather?.source || ''))) v('demo', 'demo data (the offline forecast) is never published');

  const all = recreationsIn(episode);
  let timeline = Array.isArray(clip.timeline) ? clip.timeline : null;
  if (!timeline && clip.recording) timeline = timelineFromRecording(episode, clip.recording);
  if (all.length && !whole && !timeline) v('timeline-missing', 'this clip comes from an episode with a recreation and has no timeline: the cut cannot be verified, so it is refused');

  // ---- which recreations the clip holds, and the cut around them
  const inRange = [];
  if (whole) inRange.push(...all);
  else if (timeline) {
    for (const rec of all) {
      const said = timeline.filter((t) => t.kind === 'recreation' && (t.recreationId === rec.id || t.segIndex === rec.index));
      if (!said.length) {
        if (timeline.length) warnings.push(`recreation ${rec.name || rec.role}: not found in the timeline`);
        continue;
      }
      const span = { start: Math.min(...said.map((t) => t.start)), end: Math.max(...said.map((t) => t.end)) };
      if (range.end <= span.start + EPS || range.start >= span.end - EPS) continue;
      inRange.push(rec);
      const prov = timeline.find((t) => t.kind === 'provenance' && (t.recreationId === rec.id || t.segIndex === rec.index - 1));
      if (!prov) v('provenance-missing', `no presenter's hand-over before ${rec.name || rec.role}'s recreation in the timeline`, { recreation: rec.id });
      else if (range.start > prov.start + EPS) v('provenance-missing', `the clip starts at ${range.start.toFixed(2)} s, after the presenter's line that says whose words these are (${prov.start.toFixed(2)} s: "${prov.text}"): start it there`, { recreation: rec.id, startAt: prov.start });
      if (range.start > span.start + EPS) v('quote-cut', `the clip starts inside ${rec.name || rec.role}'s words (${span.start.toFixed(2)}-${span.end.toFixed(2)} s)`, { recreation: rec.id });
      if (range.end < span.end - EPS) v('quote-cut', `the clip ends inside ${rec.name || rec.role}'s words (${span.start.toFixed(2)}-${span.end.toFixed(2)} s): end it at ${span.end.toFixed(2)} s or later`, { recreation: rec.id, endAt: span.end });
    }
  }
  // ---- no cut inside a sentence (inside a quotation it is a quote-cut)
  if (!whole && timeline) {
    for (const edge of [range.start, range.end]) {
      const s = timeline.find((t) => edge > t.start + EPS && edge < t.end - EPS);
      if (s && !violations.some((x) => x.rule === 'quote-cut' && s.kind === 'recreation')) {
        v(s.quote ? 'quote-cut' : 'sentence-cut', `the cut at ${edge.toFixed(2)} s falls inside "${s.text}" (${s.start.toFixed(2)}-${s.end.toFixed(2)} s)`, { at: edge, sentence: s.text });
      }
    }
  }

  // ---- the recreation's label in the frame, whole and legible; the AI disclosure the item itself carries
  const isVideo = kind !== 'text' && kind !== 'image';
  if (isVideo) {
    const g = frameGeometry(clip.frame || {});
    const c = { x: g.crop.x, y: g.crop.y, w: g.crop.w, h: g.crop.h };
    const need = legibleCap(g.output.h);
    for (const rec of inRange) {
      const booking = episode?.guests?.[rec.id] || null;
      const seg = episode?.segments?.[rec.index] || {};
      const L = recreationLayout(recreationOf(booking, seg), g.vertical ? { vertical: boardBox({ x: 0, y: V.stage.y, w: VW, h: V.stage.h }) } : g.window);
      if (!L.whole) v('label-out-of-frame', `the label or the name super loses words in this window: ${L.lost.join(' / ')}`, { recreation: rec.id });
      if (!inside(L.label, c)) v('label-out-of-frame', `the AI RECREATION label and its SOURCE (x ${L.label.x0}-${L.label.x1}, y ${L.label.y0}-${L.label.y1}) are not inside the crop (x ${c.x}-${c.x + c.w}): record with ?frame=${aspectOf(g)}@${c.x}`, { recreation: rec.id, label: L.label, crop: c });
      // the smallest capitals of the label: the body face's 7 px, or the micro face's 5 px for the source in a window
      const cap = Math.min(...L.plates.filter((p) => p.role === 'mark' || p.role === 'line' || p.role === 'credit').map((p) => (p.font === 'micro' ? MICRO_CAP : CAP)));
      const px = cap * g.scale;
      if (px < need) v('label-illegible', `the label's smallest capitals are ${px.toFixed(1)} px tall on a ${g.output.h} px picture (at least ${need.toFixed(1)}): crop to the window instead of shrinking the whole frame`, { recreation: rec.id, capPx: px, need });
    }
    // a clip or a Short: its end card, in the ident's words (a clip cut from mid-programme never shows the ident: the
    // platform's own AI label from its first frame, its caption's first line and its end card say it)
    if (kind === 'clip' || kind === 'short') {
      const e = clip.cards?.endCard || null;
      if (!e) v('end-card-missing', 'the clip has no end card carrying the AI notice (clip.cards.endCard): it is held until it does');
      else {
        if (!sameParts(e.parts, noticeParts('NEWS'))) v('end-card-missing', `the end card must carry "${noticeParts('NEWS').join(NOTICE_SEP)}"`);
        if (!(Number(e.seconds) >= IDENT_RULES.endCardSeconds)) v('end-card-missing', `the end card holds ${Number(e.seconds) || 0} s: at least ${IDENT_RULES.endCardSeconds} s`);
      }
      if (typeof clip.text !== 'string' || !clip.text.trim()) v('text-disclosure-missing', 'the clip has no caption: its first line says it is AI-produced ("AI-produced news: …", clipmeta.js)');
    }
    // a programme: it opens with the channel's ident (and on the stream, no viewer goes too long without one)
    if (whole) {
      const report = clip.recording || null;
      if (!report) warnings.push('the channel\'s ident is read from the recording and none was given (the playout checks it again once the programme is rendered)');
      else {
        const idents = identRuns(report);
        const end = Number.isFinite(report.seconds) ? report.seconds : null;
        // (on air before the recording's first frame counts: the recording may start a beat into it)
        const first = idents.find((x) => x.from <= IDENT_RULES.startWithin && x.to > 0) || null;
        if (!first) v('ident-missing', idents.length ? `the channel's ident first airs at ${idents[0].from.toFixed(1)} s: the programme opens with it (within ${IDENT_RULES.startWithin} s)` : 'the recording does not open with the channel\'s ident: every programme does (director.js playIdent)');
        else if (first.to - first.from < IDENT_RULES.minSeconds) v('ident-missing', `the ident holds ${(first.to - first.from).toFixed(1)} s: at least ${IDENT_RULES.minSeconds} s`);
        if (kind === 'live' && first && end !== null && end - first.from + IDENT_RULES.breakAllowance > IDENT_RULES.maxGap) {
          v('ident-gap', `${Math.round(end - first.from)} s from the ident to the programme's end, and up to ${IDENT_RULES.breakAllowance} s of break after it: more than ${IDENT_RULES.maxGap} s without the channel's ident`, { span: end - first.from });
        }
      }
    }
    // the caption or the description: its first line says what the item is (what the platforms show before "more"),
    // and opens with it: the disclosure's words are the first a viewer reads, whatever follows them on the line
    const lines = typeof clip.text === 'string' ? clip.text.trim().split('\n').filter((l) => l.trim()) : [];
    if (lines.length && !(TEXT_DISCLOSURE.test(lines[0]) && TEXT_FIRST.test(lines[0]))) v('text-disclosure-missing', 'the caption or description opens with the AI disclosure ("AI-produced news: …", as disclosure.describe and clipmeta.js write it)');
    // a clip's caption that opens "AI-produced news: <hook>" (since 23 Oct, compliance.md §2.10) carries the
    // disclosure's whole sentence right under it: what is AI (the presenters, their voices) and where the facts are from
    else if (lines.length && (kind === 'clip' || kind === 'short') && !TEXT_WHAT.test(lines[0]) && !TEXT_WHAT.test(lines.slice(1, 3).join(' '))) v('text-disclosure-missing', 'the caption opens with the AI disclosure\'s words and its hook, but the disclosure\'s sentence ("Presenters are AI characters with synthetic voices; every fact is from a credited source.") is not right under it');
  }

  // ---- the platforms' flags
  const disclosure = disclosureFor({ kind: kind === 'short' ? 'short' : kind, episode, recreations: inRange, platforms: clip.platforms });
  for (const [name, d] of Object.entries(disclosure.platforms)) {
    const set = clip.flags?.[name] || {};
    if (d.field && name === 'youtube' && set.containsSyntheticMedia !== true) v('flag-missing', 'YouTube: set status.containsSyntheticMedia = true', { platform: name, field: 'containsSyntheticMedia' });
    if (d.field && name === 'youtube' && set.selfDeclaredMadeForKids !== false) v('flag-missing', 'YouTube: set status.selfDeclaredMadeForKids = false (news for a general audience, not made for kids)', { platform: name, field: 'selfDeclaredMadeForKids' });
    if (d.field && name === 'tiktok' && set.is_aigc !== true) v('flag-missing', 'TikTok: set post_info.is_aigc = true', { platform: name });
    if (d.field && name === 'instagram' && set.is_ai_generated !== true) v('flag-missing', 'Instagram: set is_ai_generated = true', { platform: name });
    if (!d.field && d.manualLabel && set.manualLabel !== true) v('flag-unavailable', `${name}: no API flag for AI content; publish this item with the AI label applied by hand (flags.${name}.manualLabel = true) or leave ${name} out`, { platform: name });
  }

  // ---- election periods
  const calendar = opts.calendar || loadCalendar({ dataDir: opts.dataDir || null, now });
  for (const rec of inRange) {
    const booking = episode?.guests?.[rec.id] || {};
    const speaker = { name: rec.name, role: rec.role, org: booking.org || null, kind: roleKind(rec.role) || (rec.name ? 'named' : 'unknown'), citizenship: booking.citizenship || null };
    const seg = episode?.segments?.find((s) => s.type === 'story' && s.storyId === rec.storyId);
    const story = { title: seg?.headline || '', summary: seg?.text || '', location: seg?.location || null };
    const hold = electionHold({ speaker, story, identity: booking.citizenship ? { citizenship: booking.citizenship } : null, now, calendar });
    for (const r of hold.reasons) v('election-hold', `${rec.name || rec.role}: ${r}`, { recreation: rec.id });
  }
  const words = [clip.text || '', ...(episode?.segments || []).filter((s) => s.type === 'story' && (whole || inRangeStory(s, timeline, range, episode))).map((s) => `${s.headline || ''}. ${s.text || ''}`)].join(' ');
  const silent = silenceHold({ text: words, now, calendar });
  if (silent.hold) v('election-silence', `about ${silent.elections.map((e) => e.name).join(', ')} during its silence: publish after ${silent.until}`, { until: silent.until });

  // ---- the register: takedowns, people who asked not to be re-staged, stories withdrawn
  const reg = opts.register || null;
  if (reg) {
    for (const rec of inRange) {
      const b = reg.isBlocked({ name: rec.name, qid: rec.qid });
      if (b) v('blocked', `${rec.name || rec.role}: ${b}`, { recreation: rec.id });
    }
    for (const id of [clip.id, episode?.id].filter(Boolean)) {
      const b = reg.isBlocked({ itemId: id });
      if (b) v('blocked', `item ${id}: ${b}`);
    }
    for (const sid of new Set((episode?.storyIds || []).filter(Boolean))) {
      const b = reg.isBlocked({ storyId: sid });
      if (b) v('blocked', `story ${sid}: ${b}`);
    }
  }
  // ---- the owner's review of anything with a recreation (the riskiest thing we publish)
  if (inRange.length && opts.requireReview !== false) {
    const r = reg?.review(clip.id) || reg?.review(episode?.id);
    if (!r || r.verdict !== 'approve') v('review-missing', 'an item with a recreation needs the owner\'s review before it is published (register.recordReview: the quote checked against its source)');
  }
  return { ok: violations.length === 0, violations, warnings, recreations: inRange, disclosure };
}

function aspectOf(g) {
  const r = g.output.w / g.output.h;
  return r < 0.7 ? '9x16' : r < 0.9 ? '4x5' : '1x1';
}

/** Does a story segment fall inside the clip's range (by its sentences in the timeline)? */
function inRangeStory(seg, timeline, range, episode) {
  if (!timeline) return true;
  const idx = episode.segments.indexOf(seg);
  return timeline.some((t) => t.segIndex === idx && t.end > range.start && t.start < range.end);
}
