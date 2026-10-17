// The cast's voices (server/voice/casting.json), measured (docs/roadmap/critique/voices-naturalness.md; owner 16 Oct:
// "las voces de los nuevos programas necesitan más naturalidad"). The old rule, a blend made of components nobody
// else used, had pushed the newer characters onto voices of other languages reading English and onto Kokoro's
// weakest English voices. The rules now: English voices only, a well-graded voice in the lead, and the distinctness
// measured, not assumed (tools/voice/audit.py, whose summary tools/voice/voice-audit.json must describe exactly what
// is cast), strictest between the people of one programme. The break bumper's announcer and the re-staged guests'
// generic voices are measured with them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url), 'utf8'));
const CASTING = read('../server/voice/casting.json');
const ADCAST = read('../server/voice/adcast.json');
const AUDIT = read('../tools/voice/voice-audit.json');
const GRADES = read('../tools/voice/voice-grades.json');
const CHANNEL = read('../config/channel.json');
const { HOST_LOOK } = await import('../public/js/pay-attention-looks.js');
const { HOST_NAMES } = await import('../public/js/v2/canvas25d/cast/pay-attention.js');
const { CONTINUITY } = await import('../public/js/ads/index.js');
const { GUEST_VOICES } = await import('../server/guests/restage.js');

// The bars. On the 16 Oct cast, before this round: the closest pair on one programme was Clara-Ines at 35 (and Kai-Max
// 34.5 anywhere); the lowest listening score 3.51 (Tomas); the host's candidates and two experts were heard as foreign
// (native-English margins down to -0.25); every English Kokoro voice alone scores 0.17 and up on the config's accent.
const PROGRAMME_MIN = 40; // timbre distance between two people heard on one programme
const CHANNEL_MIN = 25; // between any two characters of the channel
const WER_MAX = 0.06; // the recogniser's word error rate on the audit copy (digits compared one by one)
const MOS_MIN = 4.0; // the predicted listening score (1-5), UNIT-8's robot excepted
const NATIVE_MIN = 0.15; // the accent classifier: native English (any) over the best second-language accent
const ACCENT_MIN = 0.05; // ... and the config's accent (England for en-GB, the US or Canada for en-US) over the latter
// Heard with another native accent than the config's, and why (docs/roadmap/critique/voices-naturalness.md). None
// now: Omar, the one exception while bm_fable left him American, is heard as British with bm_daniel.
const ACCENT_EXCEPTIONS = {};
// UNIT-8's voice was chosen by ear by the owner (3 Oct, the soft robot): its lead is not held to the grade rule.
const OWNER_PICKS = new Set(['unit8']);
// Led by a voice graded below C, and why; the listening score is still held to MOS_MIN.
const GRADE_EXCEPTIONS = {
  continuity:
    'the announcer, not a character: every British woman\'s voice graded C or better leads a character, and the ' +
    'bumper must not sound like the presenter who has just handed over (bf_lily leads; measured instead)',
};

const parts = (spec) =>
  String(spec)
    .split('+')
    .map((p) => {
      const [name, w] = p.split(':');
      return { name, w: w === undefined ? 1 : Number(w) };
    });
const dominant = (spec) => parts(spec).reduce((a, b) => (b.w > a.w ? b : a)).name;
const rank = (grade) => GRADES.order.indexOf(grade);

/** Every voice the channel speaks with: [label, entry] for each cast entry and each candidate of one still cast. */
function everyVoice() {
  const out = [];
  for (const [id, c] of Object.entries(CASTING)) {
    if (!c?.voice) continue;
    out.push([id, c]);
    for (const [letter, cand] of Object.entries(c.candidates || {})) out.push([`${id}:${letter}`, cand]);
  }
  return out;
}

/** The people heard on each programme: its presenters, contestants, experts and correspondents (drafts too). */
function programmes() {
  const progs = { ...CHANNEL.programs, ...(CHANNEL.drafts || {}) };
  const out = {};
  for (const [pid, p] of Object.entries(progs)) {
    if (!p || typeof p !== 'object') continue;
    const people = [...new Set(['presenters', 'contestants', 'experts', 'correspondents'].flatMap((k) => p[k] || []))];
    if (people.length > 1) out[pid] = people;
  }
  return out;
}

test('everyone a live programme puts on air has a measured voice of their own, not the planner\'s fallback blend', () => {
  // server/voice/plan.js castFor falls back to a generic blend by gender for a presenter with no casting entry
  for (const [pid, p] of Object.entries(CHANNEL.programs)) {
    for (const id of ['presenters', 'contestants', 'experts', 'correspondents'].flatMap((k) => p?.[k] || [])) {
      assert.ok(CASTING[id]?.voice, `${pid}: ${id} has no entry in server/voice/casting.json`);
      assert.ok(AUDIT.voices[id], `${pid}: ${id} is not in tools/voice/voice-audit.json`);
    }
  }
});

test('every character speaks English with English voices: no voice of another language reading English', () => {
  for (const [label, c] of everyVoice()) {
    for (const { name, w } of parts(c.voice)) {
      assert.match(name, /^(af|am|bf|bm)_[a-z]+$/, `${label}: ${name} is not one of Kokoro's English voices`);
      assert.ok(w > 0 && w <= 1, `${label}: weight ${w}`);
    }
    assert.ok(['en-us', 'en-gb'].includes(c.lang), `${label}: ${c.lang}`);
  }
});

test('every character leads with a voice Kokoro grades C or better, written first in its blend', () => {
  for (const [label, c] of everyVoice()) {
    const lead = dominant(c.voice);
    assert.equal(parts(c.voice)[0].name, lead, `${label}: the dominant component is written first`);
    if (OWNER_PICKS.has(label) || GRADE_EXCEPTIONS[label]) continue;
    const grade = GRADES.voices[lead];
    assert.ok(grade, `${label}: ${lead} has a grade`);
    assert.ok(rank(grade) <= rank('C'), `${label}: ${lead} is graded ${grade}`);
  }
});

test('the voice audit was measured under the rendering recipe the station uses now', async () => {
  // a change to the rendering bumps server/voice/plan.js RECIPE: the summary must then be measured again
  const { RECIPE } = await import('../server/voice/plan.js');
  assert.equal(AUDIT.recipe, RECIPE, 'tools/voice/voice-audit.json is stale: run tools/voice/audit.py again');
});

test('the voice audit measured exactly what is cast (voice, speed and accent), every voice and every candidate', () => {
  for (const [label, c] of everyVoice()) {
    const m = AUDIT.voices[label];
    assert.ok(m, `${label} is in tools/voice/voice-audit.json: run tools/voice/audit.py after a casting change`);
    assert.equal(m.voice, c.voice, `${label}: the audit heard ${m.voice}`);
    assert.equal(m.speed, c.speed, `${label}: speed`);
    assert.equal(m.lang, c.lang, `${label}: accent`);
  }
});

test('the people of one programme sound unlike each other, and never share a lead voice', () => {
  for (const [pid, people] of Object.entries(programmes())) {
    for (let i = 0; i < people.length; i++) {
      for (let j = i + 1; j < people.length; j++) {
        const [a, b] = [people[i], people[j]];
        if (!CASTING[a]?.voice || !CASTING[b]?.voice) continue;
        const d = AUDIT.distance[a]?.[b];
        assert.ok(Number.isFinite(d), `${pid}: ${a}-${b} measured`);
        assert.ok(d >= PROGRAMME_MIN, `${pid}: ${a}-${b} only ${d} apart`);
        assert.notEqual(dominant(CASTING[a].voice), dominant(CASTING[b].voice), `${pid}: ${a} and ${b} lead with the same voice`);
      }
    }
  }
});

test('no two characters of the channel are alike, wherever they air', () => {
  const ids = Object.keys(CASTING).filter((id) => CASTING[id]?.voice);
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const d = AUDIT.distance[ids[i]]?.[ids[j]];
      assert.ok(Number.isFinite(d), `${ids[i]}-${ids[j]} measured`);
      assert.ok(d >= CHANNEL_MIN, `${ids[i]}-${ids[j]} only ${d} apart`);
    }
  }
});

test('PAY ATTENTION\'s host: three candidates in natural English voices, each unlike the eight players and the others', () => {
  const qm = CASTING.qm;
  assert.deepEqual(Object.keys(qm.candidates), ['A', 'B', 'C']);
  assert.equal(qm.voice, qm.candidates[HOST_LOOK].voice, 'the voice on air is the provisional candidate\'s');
  const players = (CHANNEL.programs['pay-attention'] || CHANNEL.drafts['pay-attention']).contestants;
  const letters = Object.keys(qm.candidates);
  for (const l of letters) {
    const c = qm.candidates[l];
    assert.equal(c.gender, HOST_NAMES[l].gender, `${l}: the voice fits the look`);
    for (const p of players) {
      const d = AUDIT.distance[`qm:${l}`]?.[p];
      assert.ok(d >= PROGRAMME_MIN, `candidate ${l} is only ${d} from ${p}, who plays`);
      assert.notEqual(dominant(c.voice), dominant(CASTING[p].voice), `candidate ${l} leads with ${p}'s voice`);
    }
  }
  for (let i = 0; i < letters.length; i++) {
    for (let j = i + 1; j < letters.length; j++) {
      const d = AUDIT.distance[`qm:${letters[i]}`]?.[`qm:${letters[j]}`];
      assert.ok(d >= CHANNEL_MIN, `candidates ${letters[i]} and ${letters[j]} are only ${d} apart`);
    }
  }
});

test('every voice was heard by a recogniser and a listening-score predictor, and passes both', () => {
  for (const [label] of everyVoice()) {
    const m = AUDIT.voices[label];
    assert.ok(Number.isFinite(m.wer), `${label}: no word error rate in the audit`);
    assert.ok(m.wer <= WER_MAX, `${label}: word error rate ${m.wer}`);
    if (OWNER_PICKS.has(label)) continue;
    assert.ok(Number.isFinite(m.mos), `${label}: no listening score in the audit`);
    assert.ok(m.mos >= MOS_MIN, `${label}: listening score ${m.mos}`);
  }
});

test('no character sounds like a speaker of another language reading English (the accent classifier)', () => {
  // the owner's "suena fatal": the old host candidates and two experts were heard as Indian or African English
  for (const [label] of everyVoice()) {
    const m = AUDIT.voices[label];
    assert.ok(Number.isFinite(m.nativeMargin), `${label}: no accent score in the audit`);
    assert.ok(m.nativeMargin >= NATIVE_MIN, `${label}: native English by only ${m.nativeMargin}`);
  }
});

test('every character is heard with the accent its config gives (British for en-GB, American for en-US)', () => {
  for (const [label, c] of everyVoice()) {
    const m = AUDIT.voices[label];
    if (ACCENT_EXCEPTIONS[label.split(':')[0]]) continue;
    assert.ok(m.accentMargin >= ACCENT_MIN, `${label} (${c.lang}): accent margin ${m.accentMargin}`);
  }
});

test('a re-cast voice keeps the one it replaced, so the owner can have it back in one step', () => {
  for (const [label, c] of everyVoice()) {
    if (!c.previous) continue;
    assert.ok(c.previous.voice && c.previous.voice !== c.voice, `${label}: previous is another blend`);
    assert.ok(Number.isFinite(c.previous.speed) && ['en-us', 'en-gb'].includes(c.previous.lang), `${label}: previous speed and accent`);
  }
});

test('re-staged guests speak with generic English voices: measured, natural, native, unlike anyone they air with', () => {
  // IN THEIR WORDS (server/guests/restage.js): a recreation must never sound like the channel's own people
  const progs = { ...CHANNEL.programs, ...(CHANNEL.drafts || {}) };
  const company = new Set(
    Object.values(progs)
      .filter((p) => p?.restage)
      .flatMap((p) => ['presenters', 'contestants', 'experts', 'correspondents'].flatMap((k) => p[k] || [])),
  );
  assert.ok(company.size > 5, 'the programmes that re-stage guests');
  const leads = new Set(Object.entries(CASTING).filter(([id, c]) => id !== 'continuity' && c?.voice).map(([, c]) => dominant(c.voice)));
  for (const p of ['man', 'woman']) {
    GUEST_VOICES[p].forEach((v, i) => {
      const label = `guest:${p}:${i}`;
      const m = AUDIT.voices[label];
      assert.ok(m, `${label} is in tools/voice/voice-audit.json`);
      for (const k of ['voice', 'speed', 'lang']) assert.equal(m[k], v[k], `${label}: the audit heard another ${k}`);
      for (const { name } of parts(v.voice)) assert.match(name, p === 'man' ? /^(am|bm)_[a-z]+$/ : /^(af|bf)_[a-z]+$/, `${label}: ${name}`);
      assert.ok(!leads.has(dominant(v.voice)), `${label} leads with ${dominant(v.voice)}, a character's lead`);
      assert.ok(m.wer <= WER_MAX, `${label}: word error rate ${m.wer}`);
      assert.ok(m.mos >= MOS_MIN, `${label}: listening score ${m.mos}`);
      assert.ok(m.nativeMargin >= NATIVE_MIN, `${label}: native English by only ${m.nativeMargin}`);
      assert.ok(m.accentMargin >= ACCENT_MIN, `${label} (${v.lang}): accent margin ${m.accentMargin}`);
      for (const id of Object.keys(CASTING)) {
        const d = AUDIT.distance[label]?.[id];
        assert.ok(d >= (company.has(id) ? PROGRAMME_MIN : CHANNEL_MIN), `${label} is only ${d} from ${id}`);
      }
    });
  }
});

test('the break bumper speaks with the casting sheet\'s continuity voice, the one the audit measured', () => {
  // the bumper is voiced like an advert's script (server/voice/service.js adCast): without its own adcast entry it
  // took the adverts' default British woman, which nothing measured
  assert.equal(CONTINUITY.id, 'continuity');
  const own = ADCAST[CONTINUITY.id];
  assert.ok(own?.voice, 'adcast.json has the bumper\'s own entry');
  for (const k of ['voice', 'speed', 'lang']) assert.equal(own[k], CASTING.continuity[k], `bumper ${k}`);
  assert.equal(CONTINUITY.voice.gender, 'female');
});

test('no advert leads with a character\'s lead voice (the break follows the programmes)', () => {
  const leads = new Set(Object.entries(CASTING).filter(([id, c]) => id !== 'continuity' && c?.voice).map(([, c]) => dominant(c.voice)));
  for (const [id, a] of Object.entries(ADCAST)) {
    if (!a?.voice) continue;
    assert.ok(!leads.has(dominant(a.voice)), `advert ${id} leads with ${dominant(a.voice)}, a character's lead`);
  }
});
