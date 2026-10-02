// Picking Web Speech voices for presenter profiles. Pure (works on plain
// {name, lang, localService} objects), so the choice is unit tested. Natural
// and neural voices win over the old desktop ones, novelty and child voices
// lose, and two presenters never share a voice while another fits.

// Name hints for the voice's gender, English and Spanish together (a voice list
// only ever holds one language in practice). The first group matches as a
// substring, the second only as a whole word so "Tom" does not hit "Tomás".
const MALE_RE = new RegExp(
  'jorge|pablo|alvaro|álvaro|diego|enrique|carlos|juan|raul|raúl|hombre|' +
  '(?<!\\p{L})(?:male|eddy|reed|rocko|grandpa|alonso|tomás|tomas|miguel|ricardo|sergio|óscar|oscar|' +
  'jesús|jesus|darío|dario|elías|elias|saúl|saul|teo|yago|pelayo|gerardo|cecilio|liberto|luciano|' +
  'daniel|george|arthur|ryan|thomas|oliver|guy|christopher|eric|david|mark|alex|tom|aaron|evan|gordon|' +
  'lee|rishi|james|brian|roger|steffan|davis|jason|tony|andrew|william|liam|connor|luke|noah|alfie|' +
  'ethan|prabhat|mitchell|fred|elliot|kai|nathan|jacob|ralf)(?!\\p{L})',
  'iu',
);
const FEMALE_RE = new RegExp(
  'helena|laura|lucia|lucía|elvira|monica|mónica|paulina|sabina|conchita|female|mujer|elena|dalia|' +
  '(?<!\\p{L})(?:flo|sandy|shelley|grandma|marisol|lupe|paloma|abril|estrella|irene|laia|triana|' +
  'vera|beatriz|candela|carlota|marina|nuria|renata|ximena|' +
  'samantha|ava|allison|susan|serena|kate|libby|sonia|jenny|aria|michelle|hazel|zira|maisie|mia|emma|' +
  'jane|sara|nancy|ana|amy|joanna|karen|moira|tessa|fiona|victoria|martha|nicky|catherine|natasha|' +
  'neerja|clara|emily|leah|heather|zoe|jessa|cora|elizabeth|ashley|amber|nova|olivia|bella)(?!\\p{L})',
  'iu',
);
// Robotic / novelty voices that macOS lists next to the real ones.
const NOVELTY_RE = new RegExp(
  '(?<!\\p{L})(?:albert|agnes|bad news|bahh|bells|boing|bubbles|bruce|cellos|deranged|good news|' +
  'hysterical|jester|junior|kathy|organ|princess|ralph|superstar|trinoids|vicki|whisper|wobble|zarvox)(?!\\p{L})',
  'iu',
);
// Child voices (Edge's "Ana", the macOS/Azure "Maisie"): charming, but not for a news desk.
const CHILD_RE = /(?<!\p{L})(?:ana|maisie|kid|child)(?!\p{L})/iu;
// Legacy macOS voices that sound robotic: what the 'robot' gender looks for.
const ROBOT_RE = /(?<!\p{L})(?:zarvox|trinoids|fred|ralph|junior|albert|robot)(?!\p{L})/iu;

// Regional variants to prefer, best first. A region in the engine option goes in front.
const LANG_PREF = { en: ['en-gb', 'en-us'], es: ['es-es'] };

export function langPlan(option) {
  const [head, region] = String(option || 'en').toLowerCase().split(/[-_]/);
  const base = (head || '').replace(/[^a-z]/g, '') || 'en';
  const pref = [...new Set([...(region ? [`${base}-${region}`] : []), ...(LANG_PREF[base] ?? [])])];
  return { base, pref, match: new RegExp(`^${base}(?:[-_]|$)`, 'i') };
}

const voiceName = (v) => String(v?.name ?? '');

/** 'male' | 'female' | null from the voice name alone. */
export function voiceGender(v) {
  const name = voiceName(v);
  const male = MALE_RE.test(name);
  const female = FEMALE_RE.test(name);
  return male && !female ? 'male' : female && !male ? 'female' : null;
}

/** How natural a voice sounds, from what its name and service say. */
export function voiceQuality(v) {
  const n = voiceName(v).toLowerCase();
  let q = 0;
  if (/(?<![a-z])(natural|neural)(?![a-z])/.test(n)) q += 40; // Edge / Azure neural voices
  else if (/(?<![a-z])(premium|enhanced|siri)(?![a-z])/.test(n)) q += 32; // downloadable macOS / iOS voices
  else if (/(?<![a-z])online(?![a-z])/.test(n)) q += 22;
  else if (/^google(?![a-z])/.test(n)) q += 18; // Chrome's network voices
  if (v?.localService === false) q += 3;
  if (/espeak|mbrola|festival|pico(?![a-z])/.test(n)) q -= 25;
  if (/(?<![a-z])compact(?![a-z])/.test(n)) q -= 8;
  if (/(?<![a-z])desktop(?![a-z])/.test(n)) q -= 4;
  return q;
}

/** Score of a voice for a slot: language variant, gender, then quality. */
export function voiceScore(v, gender, pref) {
  const rank = pref.indexOf(String(v.lang ?? '').toLowerCase().replace('_', '-'));
  let s = rank >= 0 ? Math.max(10, 30 - rank * 10) : 10;
  const name = voiceName(v);
  const g = voiceGender(v);
  const robotic = gender === 'robot' && ROBOT_RE.test(name);
  if (gender === 'male' || gender === 'female') s += g === gender ? 50 : g ? -50 : 0;
  else if (gender === 'robot') s += robotic ? 60 : g === 'male' ? 20 : 0;
  if (gender !== 'robot') s += voiceQuality(v);
  if (NOVELTY_RE.test(name) && !robotic) s -= 60;
  if (CHILD_RE.test(name) && /^en/i.test(String(v.lang ?? ''))) s -= 45;
  return s;
}

/**
 * Best voice for a slot. Prefers voices of the right gender that no other slot
 * has taken yet, so two presenters do not share one voice unless they must.
 */
export function chooseVoice(pool, gender, pref, used) {
  const scored = pool.map((v) => ({ v, s: voiceScore(v, gender, pref), g: voiceGender(v) }));
  const fits = scored.filter((c) => !((gender === 'male' && c.g === 'female') || (gender === 'female' && c.g === 'male')));
  const fresh = fits.filter((c) => !used.has(c.v));
  const list = fresh.length ? fresh : fits.length ? fits : scored;
  return list.reduce((best, c) => (c.s > best.s ? c : best)).v;
}

// ----------------------------------------------------------- voice profiles

const GENDER_DEFAULTS = {
  male: { pitch: 0.95, rate: 1.02 },
  female: { pitch: 1.08, rate: 1.08 },
  robot: { pitch: 0.5, rate: 1.15 },
  neutral: { pitch: 1, rate: 1.05 },
};

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const numOr = (v, fallback, lo, hi) => (v == null || v === '' || !Number.isFinite(Number(v)) ? fallback : clamp(Number(v), lo, hi));

/** Forgiving: { gender: 'male'|'female'|'robot', lang, pitch, rate } or just a gender string. */
export function normProfile(p, explicit = true) {
  const src = typeof p === 'string' ? { gender: p } : p ?? {};
  const g = String(src.gender ?? '').trim().toLowerCase();
  const gender = /^(f|w|girl)/.test(g) ? 'female' : /^(m|boy)/.test(g) ? 'male' : /^(r|bot|android)/.test(g) ? 'robot' : 'neutral';
  const d = GENDER_DEFAULTS[gender];
  return {
    gender,
    lang: typeof src.lang === 'string' && src.lang.trim() ? src.lang.trim() : null,
    pitch: numOr(src.pitch, d.pitch, 0.1, 2),
    rate: numOr(src.rate, d.rate, 0.5, 2),
    explicit,
  };
}

// Without a profile: 'A' is the male anchor, 'B' the female one, anything else a neutral announcer.
export const DEFAULT_PROFILES = new Map([['A', normProfile('male', false)], ['B', normProfile('female', false)]]);
export const NEUTRAL_PROFILE = normProfile('neutral', false);

// Blip timbres per gender. Robots are low, flat, staccato and heavily filtered.
const BLIP_KINDS = {
  male: { base: 200, wave: 'pulse50', gain: 0.1, cut: 2600, vary: 0.12, flat: 0, len: 0.78 },
  female: { base: 350, wave: 'tri', gain: 0.26, cut: 2600, vary: 0.12, flat: 0, len: 0.78 },
  neutral: { base: 270, wave: 'tri', gain: 0.24, cut: 2600, vary: 0.12, flat: 0, len: 0.78 },
  robot: { base: 130, wave: 'pulse50', gain: 0.11, cut: 1400, vary: 0.03, flat: 0.8, len: 0.55 },
};

function hash01(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

// Slots with their own profile get a pitch from it plus a small per-slot offset,
// so two presenters of the same gender do not beep alike either.
export function blipFor(key, prof) {
  const kind = BLIP_KINDS[prof.gender];
  if (!prof.explicit && (key === 'A' || key === 'B')) return { ...kind };
  const pitch = prof.gender === 'robot' ? 1 : clamp(prof.pitch, 0.6, 1.6);
  return { ...kind, base: Math.max(90, kind.base * pitch * (1 + (hash01(key) - 0.5) * 0.14)) };
}

/**
 * Voice, pitch, rate and blip timbre for every known slot, in a fixed order
 * (profiles, then A and B, then the rest) so assignments stay stable.
 * @param all every installed voice; @param voices the ones in the engine's language
 */
export function resolveVoices({ all = [], voices = [], profiles = new Map(), seen = [], lang = langPlan('en') } = {}) {
  const used = new Map(); // voice -> slots using it
  const out = new Map();
  for (const key of new Set([...profiles.keys(), 'A', 'B', ...seen])) {
    const prof = profiles.get(key) ?? DEFAULT_PROFILES.get(key) ?? NEUTRAL_PROFILE;
    // Profile language family first; if nothing is installed, the engine's language.
    const plan = prof.lang ? langPlan(prof.lang) : lang;
    const family = all.filter((v) => plan.match.test(String(v.lang ?? '')));
    const pool = family.length ? family : voices;
    const voice = pool.length ? chooseVoice(pool, prof.gender, plan.pref, used) : null;
    let pitch = prof.pitch;
    if (voice) {
      const g = voiceGender(voice);
      if (prof.gender === 'male' && g === 'female') pitch *= 0.85;
      else if (prof.gender === 'female' && g === 'male') pitch *= 1.2;
      // Voice already taken by a slot of this gender (any slot, for neutral): nudge the pitch apart.
      const taken = used.get(voice) ?? [];
      const twins = prof.gender === 'neutral' ? taken.length : taken.filter((k) => out.get(k).gender === prof.gender).length;
      if (twins) pitch *= twins % 2 ? 1.12 : 0.88;
      used.set(voice, [...taken, key]);
    }
    out.set(key, {
      gender: prof.gender,
      voice,
      pitch: clamp(pitch, 0.1, 2),
      rate: prof.rate,
      lang: prof.lang ?? plan.pref[0] ?? plan.base,
      blip: blipFor(key, prof),
    });
  }
  // Default anchors forced onto one voice: split them well apart by pitch.
  const a = out.get('A');
  const b = out.get('B');
  if (!profiles.has('A') && !profiles.has('B') && a.voice && a.voice === b.voice) {
    a.pitch = 0.85;
    b.pitch = 1.2;
  }
  return out;
}
