// IN THEIR WORDS, re-staged, on screen (owner 12 Oct; server/guests/restage.js; WAVE3 §6): the person a story quotes
// appears in the press room and says their own words, labelled RECREATION from the first frame of the piece to the
// last. The guest's look (cast/guest.js: deterministic, palette only, never a presenter's, never a twin of the cast,
// materials shared by colour), the press room (studio/press.js), the Stage, the graphics and the director.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// a recording 2D context (font.js renders text offscreen through document.createElement)
function fakeCtx() {
  return {
    depth: 0,
    fills: [],
    images: 0,
    fillStyle: '#000',
    globalAlpha: 1,
    imageSmoothingEnabled: false,
    save() {
      this.depth++;
    },
    restore() {
      this.depth--;
    },
    beginPath() {},
    rect() {},
    clip() {},
    putImageData() {},
    fillRect(x, y, w, h) {
      this.fills.push({ x, y, w, h, c: this.fillStyle });
    },
    drawImage() {
      this.images++;
    },
  };
}
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => fakeCtx() }) };

const { bookGuest, speakerProfile } = await import('../server/guests/restage.js');
const { lookFor, LOOKS, CORRESPONDENT_LOOKS, EXPERT_LOOKS } = await import('../public/js/v2/canvas25d/cast/index.js');
const { buildGuestLook, guestLook, guestSpec, guestFeatures, twinOf, likeness, namedFeatures, isGuestId, guestCacheSize, NAMED_IDS, SKIN_RAMPS } = await import('../public/js/v2/canvas25d/cast/guest.js');
const { frame, drawActors, actor } = await import('../public/js/v2/canvas25d/scene.js');
const { C, MAT, MAX_MATS, u32 } = await import('../public/js/v2/canvas25d/pixbuf.js');
const { drawPressRoom, drawPressFront, PRESS, LECTERN, MICS } = await import('../public/js/v2/canvas25d/studio/press.js');
const { Stage } = await import('../public/js/v2/canvas25d/runtime/stage.js');
const { Graphics } = await import('../public/js/graphics/index.js');
const { recreationOf, drawRecreation, RECREATION } = await import('../public/js/graphics/recreation.js');
const { drawLinkGraphics } = await import('../public/js/graphics/remote.js');
const { STRAP, CAPTION } = await import('../public/js/graphics/layout.js');
const { P } = await import('../public/js/palette.js');
const { Director } = await import('../public/js/director.js');

const W = 384, H = 216;
const PALETTE = new Set(Object.values(C).map((c) => c >>> 0));
const CAST = [...Object.values(LOOKS), ...Object.values(CORRESPONDENT_LOOKS), ...Object.values(EXPERT_LOOKS)];

/** A booking the way the server makes it (a named public figure, the pronoun after the name). */
function booking(name, role, outlet = 'Pixelburg Post', pron = 'she') {
  return bookGuest(speakerProfile(name, `${name}, ${role}, said the plan would go ahead. "We will publish it next week," ${pron} said.`), { outlet });
}
/** Many bookings across presentations (fictional names, the server's seeding). */
function many(n, salt = '') {
  const out = [];
  for (let i = 0; i < n; i++) {
    const presentation = ['man', 'woman', 'neutral'][i % 3];
    out.push(bookGuest({ name: `Person ${salt}${i}`, role: 'minister', org: null, kind: 'politician', presentation }, { outlet: 'Pixelburg Post' }));
  }
  return out;
}
function render(id, info) {
  frame.px.fill(C.ink);
  drawActors(1, [{ actor: actor(id, { side: 0 }, info), x: PRESS.x, y: PRESS.y, s: PRESS.s, clip: false }]);
  return new Uint32Array(frame.px);
}

test('the guest look: deterministic for its booking, drawn in the palette only, a whole adult figure', () => {
  const b = booking('Ana Silva', 'the mayor of Lisbon');
  assert.ok(isGuestId(b.id));
  const a = buildGuestLook(b), c = buildGuestLook(JSON.parse(JSON.stringify(b)));
  for (const k of ['head', 'eyes', 'brows', 'nose', 'mouth', 'skin', 'hair', 'jacket', 'shirt', 'tie', 'glasses', 'beard', 'mustache', 'torso', 'persona', 'matKeys']) assert.deepEqual(a[k], c[k], `the same ${k} twice`);
  assert.equal(a.parts.hair, c.parts.hair);
  const px1 = render(b.id, b), px2 = render(b.id, JSON.parse(JSON.stringify(b)));
  assert.deepEqual(px1, px2, 'the same pixels every time');
  let drawn = 0;
  for (const p of px1) {
    assert.ok(PALETTE.has(p >>> 0), 'a colour off the palette');
    if (p !== C.ink) drawn++;
  }
  assert.ok(drawn > 6000, `the guest is drawn (${drawn} px)`);
  // their face is in the skin ramp the spec gives
  const skin = SKIN_RAMPS[b.look.skin].map(u32);
  let face = 0;
  const cy = PRESS.y - 13 * PRESS.s;
  for (let y = Math.round(cy - 10); y < cy + 20; y++) for (let x = PRESS.x - 12; x < PRESS.x + 12; x++) if (skin.includes(px1[y * W + x])) face++;
  assert.ok(face > 250, `a face in the ${b.look.skin} ramp (${face} px)`);
  // composed: no resting smile, a calm head
  assert.equal(a.persona.smile, 0);
  assert.ok(a.persona.energy <= 0.6);
});

test('a re-staged guest never wears a presenter\'s, a correspondent\'s or an expert\'s look (no Paco or Lola fallback)', () => {
  const cast = new Set(CAST);
  const b = booking('Karim Haddad', 'the health minister', 'Ledger Daily', 'he');
  const cases = [
    [b.id, b],
    [b.id, null], // the booking missing (an old episode): a seeded generic guest
    ['rp_0000000000', { voice: { gender: 'female' } }], // a config-like entry must not pick Lola
    ['rp_ffffffffff', { voice: { gender: 'male' } }],
    ['guest-x', { kind: 'restaged', id: 'guest-x', look: b.look }],
  ];
  for (const [id, info] of cases) {
    const L = lookFor(id, info);
    assert.ok(!cast.has(L), `${id}: a cast look`);
    assert.equal(L.id, id, `${id}: its own id`);
    assert.equal(L.guest, true);
    assert.ok(!L.parts.over || !/Earpiece/.test(L.parts.over.name), 'no earpiece (only the channel\'s people wear one)');
  }
  // the cast is untouched
  assert.equal(lookFor('paco').id, 'paco');
  assert.equal(lookFor('nobody', { voice: { gender: 'female' } }).id, 'lola');
});

test('no guest is a twin of the cast: the same hair in the same colour plus one more cue is swapped away', () => {
  const named = namedFeatures();
  assert.equal(named.length, NAMED_IDS.length, 'every named face with hair is known');
  // every face of the channel but UNIT-8 (a robot: no hair) is in the guard's table
  for (const L of CAST) if (L.id !== 'unit8') assert.ok(NAMED_IDS.includes(L.id), `${L.id} is missing from the twin guard`);
  // the guard's own terms: Paco's hair and colour on a guest is a twin; another silhouette never is
  const paco = named.find((n) => n.id === 'paco');
  assert.ok(likeness({ ...paco, skin: 'deep' }, paco) >= 4);
  assert.equal(twinOf({ ...paco, skin: 'deep', facial: 'none' }), 'paco', 'an anchor\'s hair in its colour alone is enough');
  assert.equal(twinOf({ ...paco, drawer: 'mop' }), null, 'another silhouette is nobody\'s twin');
  // Ada's long near-black hair and rectangular glasses on a guest: swapped (another drawer or colour)
  const amina = guestSpec('rp_amina', { v: 1, presentation: 'woman', age: 'adult', build: 'average', skin: 'medium', hair: { style: 'long-straight', colour: 'black' }, facialHair: { style: 'none' }, glasses: 'rect', wear: { outfit: 'blazer', main: 'plum', tie: 'none' } });
  assert.ok(!(amina.hair.drawer === 'straight' && amina.hair.colour === 'black'), 'not Ada');
  // over many seeded guests: never a twin, never unresolved, the spec kept nearly always
  let changed = 0;
  for (const g of many(900)) {
    const d = guestSpec(g.id, g.look);
    assert.equal(d.twin, null, `${g.id}: unresolved`);
    assert.equal(twinOf(guestFeatures(d)), null, `${g.id}: a twin`);
    if (d.hair.colour !== g.look.hair.colour || d.glasses !== g.look.glasses) changed++;
  }
  assert.ok(changed < 900 * 0.12, `the spec is drawn as booked for most guests (${changed} of 900 stepped aside)`);
});

test('a 24/7 run of guests shares materials by colour: the table stays bounded, the look cache too', () => {
  const before = MAT.count;
  for (const g of many(240, 'a')) render(g.id, g);
  const grown = MAT.count - before;
  const keys = [...MAT.byKey.keys()];
  assert.ok(!keys.some((k) => k.startsWith('rp_')), 'no material registered under a guest\'s id');
  const guestKeys = keys.filter((k) => k.startsWith('guest:'));
  // skins x 5, hair colours x 15, suits x 7, shirts x 2, ties: the most there can ever be
  assert.ok(guestKeys.length <= 6 * 5 + 8 * 15 + 5 * 7 + 4 * 2 + 5, `${guestKeys.length} shared guest materials`);
  assert.ok(grown <= guestKeys.length + 8, `${grown} materials for 240 guests`);
  const mid = MAT.count;
  for (const g of many(240, 'b')) render(g.id, g);
  assert.ok(MAT.count - mid < 12, `240 more guests add almost nothing (${MAT.count - mid})`);
  assert.ok(MAT.count < MAX_MATS / 2 && !MAT.full);
  assert.ok(guestCacheSize() <= 32, `looks cached: ${guestCacheSize()}`);
  // a cached look comes back the same object; a new spec for the same id rebuilds it
  const b = booking('Lena Brandt', 'the foreign secretary');
  assert.equal(guestLook(b.id, b), guestLook(b.id, b));
  assert.notEqual(guestLook(b.id, b), guestLook(b.id, { ...b, look: { ...b.look, glasses: b.look.glasses === 'none' ? 'round' : 'none' } }));
});

test('the press room: palette only, calm behind the head, the emblem with no words, a sober grave variant, still', () => {
  const a = new Uint32Array(W * H), g = new Uint32Array(W * H), later = new Uint32Array(W * H);
  drawPressRoom(a, 'press', 0);
  drawPressRoom(g, 'grave', 0);
  drawPressRoom(later, 'press', 37);
  assert.deepEqual(a, later, 'nothing moves in the room');
  const lum = (px) => {
    let n = 0;
    for (const c of px) n += (c & 255) + ((c >>> 8) & 255) + ((c >>> 16) & 255);
    return n / px.length;
  };
  for (const px of [a, g]) for (const c of px) assert.ok(PALETTE.has(c >>> 0));
  assert.ok(lum(g) < lum(a) * 0.8, `the grave room is darker (${lum(g).toFixed(0)} < ${lum(a).toFixed(0)})`);
  const warm = new Set([C.red, C.orange, C.yellow, C.pink, C.magenta, C.green, C.cyan]);
  assert.ok(![...g].some((c) => warm.has(c)), 'no colour on the grave wall');
  // behind the head: a few calm colours, no glare
  const behind = new Set();
  for (let y = 40; y < 108; y++) for (let x = PRESS.x - 26; x < PRESS.x + 26; x++) behind.add(a[y * W + x]);
  assert.ok(behind.size <= 6 && !behind.has(C.white), `behind the head: ${behind.size} colours`);
  // the lectern and the microphones are drawn over the speaker, nothing else
  const f = new Uint32Array(W * H).fill(1);
  drawPressFront(f, 'press', 'wood');
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (f[y * W + x] === 1) continue;
    const inLectern = y >= LECTERN.top - 3 && x >= LECTERN.x0 && x < LECTERN.x1;
    const nearMic = MICS.some((m) => Math.abs(x - m.hx) < 12 && y >= m.hy - 12 && y <= LECTERN.top);
    assert.ok(inLectern || nearMic, `a front pixel at ${x},${y}`);
  }
  // the microphones stay below the chin: the mouth is never covered
  for (const m of MICS) assert.ok(m.hy - 9 > PRESS.y - 13.4 * PRESS.s + 9.6 * PRESS.s, 'a microphone over the chin');
});

function guestScene(b, extra = {}) {
  const ep = { id: `ep-${b.id}`, program: { id: 'tech-bytes', title: 'TECH BYTES', theme: 'tech' }, cast: { A: 'max', B: 'ada' }, correspondents: { R1: b.id }, guests: { [b.id]: b } };
  return { episode: ep, program: ep.program, cast: ep.cast, anchors: { R1: { emotion: 'neutral' } }, images: new Map(), wall: { mode: 'logo' }, segPlan: null, focus: 'R1', shot: 'location', shotSince: 1,
    remote: { slot: 'R1', id: b.id, kind: 'restage', backdrop: 'press', grave: false, footage: 'clip', lat: 10, lon: 10 }, ...extra };
}
function speakingAudio(slot = 'R1') {
  let sentence = 0;
  return {
    next() {
      sentence++;
    },
    speechFrame(ms, s, o = {}) {
      const on = s === slot;
      return Object.assign(o, { slot: s, speaking: on, level: on ? 0.5 : 0, viseme: on ? 'AA' : 'rest', next: 'rest', mix: 0, wordIndex: -1, charIndex: -1, sentenceIndex: on ? sentence : -1, accent: 0, pause: false });
    },
  };
}

test('the Stage: the guest in the press room behind the lectern, a neutral or serious face, small nods only', () => {
  const b = booking('Tomas Kowalski', 'the health minister', 'Pixelburg Post', 'he');
  const audio = speakingAudio();
  const st = new Stage({ audio, channel: { presenters: {} }, idle: null });
  const deck = { ready: () => true, frame: () => ({ px: new Uint32Array(192 * 108), w: 192, h: 108 }) };
  const scene = guestScene(b, { footageDeck: deck, anchors: { R1: { emotion: 'happy' } } });
  for (let i = 0; i < 6; i++) st.frame({ putImageData() {} }, 1 + i * 0.1, scene);
  assert.equal(st.backdrop.kind, 'press', 'the press room, never a place\'s footage');
  assert.equal(st.remote.actor.look.id, b.id);
  assert.equal(st.remote.actor.look.guest, true);
  assert.equal(st.remote.emotion, 'neutral', 'a smile cue never reaches a re-staged face');
  // the room and the lectern are on screen round them
  const ref = new Uint32Array(W * H);
  drawPressRoom(ref, 'press');
  let same = 0, n = 0;
  for (let y = 0; y < 40; y++) for (let x = 320; x < W; x++, n++) if (frame.px[y * W + x] === ref[y * W + x]) same++;
  assert.ok(same / n > 0.98, 'the press room behind them');
  const lectern = frame.px[(LECTERN.top + 6) * W + 60];
  assert.ok([C.brown, C.maroon, C.slate, C.ink].includes(lectern), 'the lectern in front');
  for (const c of frame.px) assert.ok(PALETTE.has(c >>> 0));
  // a long piece: every gesture a small nod, never two within the gap
  for (let i = 0; i < 40; i++) {
    audio.next();
    for (let k = 0; k < 10; k++) st.frame({ putImageData() {} }, 2 + i * 1.6 + k * 0.16, scene);
  }
  const g = st.remote.perf.gestures;
  assert.ok(g.length > 0, 'they move a little');
  assert.ok(g.every((e) => e.name === 'nod' && e.amp <= 0.8), `nods only (${g.map((e) => e.name)})`);
  for (let i = 1; i < g.length; i++) assert.ok(g[i].t0 - g[i - 1].t0 >= 6, 'calm');
  // a grave piece: the sober room, a serious face whatever the cue
  const st2 = new Stage({ audio: speakingAudio(), channel: { presenters: {} }, idle: null });
  const grave = guestScene(b, { remote: { ...scene.remote, grave: true }, anchors: { R1: { emotion: 'sad' } } });
  for (let i = 0; i < 4; i++) st2.frame({ putImageData() {} }, 1 + i * 0.1, grave);
  assert.equal(st2.backdrop.press, 'grave');
  assert.equal(st2.remote.emotion, 'serious');
});

test('the label: RECREATION and the source on screen from the first frame of the piece, the name super, the words above', () => {
  const b = booking('Mara Adeyemi', 'the mayor of Lisbon', 'Harbour Herald');
  const rec = recreationOf(b, { source: 'Harbour Herald' });
  assert.deepEqual(rec, { name: 'MARA ADEYEMI', role: 'MAYOR OF LISBON', line: 'RECREATION — WORDS FROM PUBLIC STATEMENTS', credit: 'SOURCE: HARBOUR HERALD' });
  // an unnamed speaker: the role on the bar, the feature on the tag; a piece without a booking still labelled
  assert.equal(recreationOf(bookGuest(speakerProfile('a spokesperson', ''), { outlet: 'Circuit Weekly' })).name, 'SPOKESPERSON');
  const bare = recreationOf(null, { quoteRef: { outlet: 'Starfield Journal', by: 'the lead researcher' } });
  assert.equal(bare.line, 'RECREATION — WORDS FROM PUBLIC STATEMENTS');
  assert.equal(bare.credit, 'SOURCE: STARFIELD JOURNAL');
  assert.equal(bare.name, 'LEAD RESEARCHER');
  // drawn: the yellow RECREATION plate and the source plate under the clock, the role tag and the name bar
  const ctx = fakeCtx();
  drawRecreation(ctx, rec, P.cyan);
  const plate = ctx.fills.find((f) => f.c === P.yellow && f.y === RECREATION.y);
  assert.ok(plate && plate.h === 11 && plate.x + plate.w <= RECREATION.right, 'RECREATION on its plate, inside action-safe');
  assert.ok(ctx.fills.some((f) => f.c === P.ink && f.y === RECREATION.y + 13), 'the source on its plate');
  assert.ok(ctx.fills.some((f) => f.c === P.cyan && f.y === STRAP.tagY), 'the role on the accent tag');
  assert.ok(ctx.fills.some((f) => f.c === P.ink && f.y === STRAP.barY && f.h === STRAP.barH), 'the name bar');
  assert.ok(ctx.images >= 5, 'the label, the source, the role and the name are written');
  assert.ok(ctx.fills.every((f) => f.y + f.h <= RECREATION.y + 24 || f.y >= STRAP.tagY), 'nothing over the face');
  // the correspondent's place tag never sits over it
  const lt = fakeCtx();
  drawLinkGraphics(lt, 1, { shot: 'location', remote: { kind: 'restage', place: 'LISBON' }, fileCredit: null }, P.red);
  assert.equal(lt.fills.length, 0);
  // the graphics package: a story strap up before the cut is gone on the piece's first frame; the label is there
  const g = new Graphics({ now: () => Date.UTC(2026, 9, 12, 14, 0) });
  const base = { program: { id: 'tech-bytes', title: 'TECH BYTES', theme: 'tech' }, rundown: [], ticker: [], subtitles: true };
  const story = { ...base, shot: 'close', shotSince: 0, lowerThird: { headline: 'Trams return to the old town', source: 'Harbour Herald', since: 0.5 } };
  for (let t = 0; t < 6; t += 0.1) g.draw(fakeCtx(), t, story);
  assert.ok(g.strap.cur, 'the story strap is up');
  const piece = { ...base, shot: 'location', shotSince: 6, remote: { kind: 'restage', slot: 'R1', id: b.id }, recreation: rec, subtitle: 'We will publish it next week.', lowerThird: null };
  const first = fakeCtx();
  g.draw(first, 6, piece);
  assert.equal(g.strap.cur, null, 'no strap leaving over the guest');
  assert.ok(first.fills.some((f) => f.c === P.yellow && f.y === RECREATION.y), 'RECREATION on the very first frame');
  assert.ok(first.fills.some((f) => f.c === P.ink && f.y === STRAP.barY && f.h === STRAP.barH), 'the name super on the very first frame');
  for (let t = 6.1; t < 12; t += 0.25) {
    const c = fakeCtx();
    g.draw(c, t, piece);
    assert.ok(c.fills.some((f) => f.c === P.yellow && f.y === RECREATION.y), `RECREATION at ${t.toFixed(2)} s`);
  }
  assert.equal(g.captionPlace(12, piece).bottom, STRAP.tagY - CAPTION.gap, 'the words sit above the name super');
  // the presenter's last caption never carries over the cut onto the guest (captions linger after speech)
  const g2 = new Graphics({ now: () => Date.UTC(2026, 9, 12, 14, 0) });
  for (let t = 0; t < 3; t += 0.1) g2.draw(fakeCtx(), t, { ...story, subtitle: 'As reported by Harbour Herald:' });
  g2.draw(fakeCtx(), 3.05, { ...story, subtitle: null });
  assert.ok(g2.captions.active, 'the caption lingers after the presenter\'s words');
  g2.draw(fakeCtx(), 3.1, { ...piece, subtitle: null });
  assert.ok(!g2.captions.active, 'gone on the guest\'s first frame');
});

function fakeDirector(v2 = true) {
  const log = [];
  const audio = {
    setVoices(v) {
      log.push({ k: 'voices', v });
    },
    sfx() {},
    playTune: () => ({ stop() {} }),
    async speak(text, slot, opts) {
      const s = d.scene;
      log.push({ k: 'speak', slot, text, shot: s.shot, rec: s.recreation, remote: s.remote?.kind || null });
      const lines = text.split(/(?<=[.!?])\s+/);
      for (let i = 0; i < lines.length; i++) {
        opts?.onSentence?.(lines[i], i);
        log.push({ k: 'sentence', i, slot, shot: s.shot, rec: s.recreation, remote: s.remote?.kind || null });
        await new Promise((r) => setTimeout(r, 5));
      }
    },
  };
  const d = new Director({ audio, channel: { name: 'GLOBIT 24', slogan: '', presenters: { max: { name: 'Max Circuit' }, ada: { name: 'Ada Volt' } } }, music: false });
  d.voices = { audioFor: async () => null, episode() {}, refreshAds() {}, prepareAd() {}, adLine: () => null };
  // (a v2 direction that plans nothing: the story's default path, the Stage's shots for the guest)
  d.v2 = v2 ? { episode() {}, shots: () => null, begin: () => null, planAt: () => null } : null;
  const setShot = d.setShot.bind(d);
  d.setShot = (shot, extra = {}) => {
    setShot(shot, extra);
    log.push({ k: 'shot', shot, rec: d.scene.recreation, card: d.scene.card });
  };
  return { d, log };
}

function restageEpisode() {
  const b = booking('Lena Novak', 'the foreign secretary', 'Pixelburg Post');
  const story = {
    type: 'story', anchor: 'A', emotion: 'neutral', storyId: 's1', headline: 'Talks on the river treaty resume', source: 'Pixelburg Post', category: 'world', hasImage: false, cues: [],
    text: 'Talks on the river treaty resumed on Monday after a year. Both sides sent new negotiators. In the words of Lena Novak, the foreign secretary, as reported by Pixelburg Post:',
    quote: { text: 'We came back to the table because the river does not wait for anyone', by: 'Lena Novak' }, link: 'R1', linkKind: 'restage',
  };
  const piece = { type: 'cross', part: 'piece', kind: 'restage', anchor: 'R1', reporter: b.id, emotion: 'neutral', cues: [], text: 'We came back to the table because the river does not wait for anyone.', recreation: true, quoteRef: { outlet: 'Pixelburg Post', by: 'Lena Novak' }, storyId: 's1', headline: story.headline, source: 'Pixelburg Post', backdrop: 'press', place: '', desk: 'FOREIGN SECRETARY' };
  const next = { type: 'story', anchor: 'B', emotion: 'neutral', storyId: 's2', headline: 'A new chip', source: 'Circuit Weekly', category: 'tech', hasImage: false, cues: [], text: 'A new chip was shown today.' };
  const ep = { id: 'epRS', program: { id: 'tech-bytes', title: 'TECH BYTES', theme: 'tech' }, cast: { A: 'max', B: 'ada' }, correspondents: { R1: b.id }, guests: { [b.id]: b }, segments: [story, piece, next], rundown: [] };
  return { b, story, piece, next, ep };
}

test('the director: the story hands over on its provenance line, then the person full frame in the press room, labelled to the cut back', async () => {
  const { b, story, piece, next, ep } = restageEpisode();
  const { d, log } = fakeDirector(true);
  d.episode = ep;
  d.scene.program = ep.program;
  d.setCast(ep);
  // the guest's browser voice by their presentation (the server records their own blend)
  assert.equal(log.find((e) => e.k === 'voices').v.R1.gender, 'female');
  const r = d.remoteOf(piece);
  assert.equal(r.kind, 'restage');
  assert.equal(r.slot, 'R1');
  assert.equal(r.booking, b);
  assert.equal(r.name, 'LENA NOVAK');
  assert.equal(r.footage, null);
  assert.equal(r.recreation.credit, 'SOURCE: PIXELBURG POST');
  d.scene.shotSince = performance.now() / 1000 - 30;
  await d.playStory(story);
  const said = log.filter((e) => e.k === 'sentence' && e.slot === 'A');
  const last = said.at(-1);
  assert.ok(['close', 'wide'].includes(last.shot), `the provenance line on the presenter (${last.shot})`);
  assert.equal(last.rec, null, 'no label before the person is on screen');
  assert.equal(last.remote, 'restage', 'the guest is ready (the Stage builds them during the hand-over)');
  assert.ok(!log.some((e) => e.k === 'shot' && (e.shot === 'twoway' || (e.shot === 'fact' && e.card?.quote))), 'no two-way, no quote card before the person says the words');
  await d.playCross(piece, [next]);
  const spoke = log.filter((e) => e.k === 'speak' && e.slot === 'R1');
  assert.equal(spoke.length, 1);
  assert.equal(spoke[0].text, piece.text, 'their own words, exactly');
  const during = log.filter((e) => e.k === 'sentence' && e.slot === 'R1');
  assert.ok(during.every((e) => e.shot === 'location' && e.rec?.line?.startsWith('RECREATION')), 'full frame in the press room, labelled, every sentence');
  const cut = log.findIndex((e) => e.k === 'shot' && e.shot === 'location');
  assert.ok(cut >= 0 && log[cut].rec, 'the label comes up with the cut itself');
  // a one-line piece is held on the person to the programme's shot floor (the pause after it included)
  const { paceFor, gapAfter } = await import('../public/js/pace.js');
  const held = performance.now() / 1000 - d.scene.shotSince + gapAfter(ep, 1).gap;
  assert.ok(held >= paceFor('tech-bytes').shots.min - 0.05, `the guest's shot holds ${held.toFixed(2)} s`);
  assert.ok(!log.slice(cut).some((e) => e.k === 'shot' && ['broll', 'twoway'].includes(e.shot)), 'no B-roll, no two-way');
  // the piece ends: the person (and the label) stay until the next segment cuts back to the studio
  d.endLink();
  assert.ok(d.scene.recreation, 'still labelled while still on screen');
  d.setShot('close', { focus: 'B', storyId: 's2' });
  assert.equal(d.scene.recreation, null);
  assert.equal(d.scene.remote, null);
});

test('the director without the v2 Stage: the words over their quote card, still labelled; recreation honoured with no booking', async () => {
  const { piece, ep } = restageEpisode();
  const { d, log } = fakeDirector(false);
  d.episode = { ...ep, guests: {} }; // an episode whose booking was lost
  d.scene.program = ep.program;
  d.scene.cast = ep.cast;
  d.scene.anchors = {};
  d.scene.shotSince = performance.now() / 1000 - 30;
  await d.playCross({ ...piece, kind: undefined }, []); // `recreation: true` alone is enough
  const words = log.filter((e) => e.k === 'sentence' && e.slot === 'R1');
  assert.ok(words.length > 0);
  assert.ok(words.every((e) => e.shot === 'fact' && e.rec?.line?.startsWith('RECREATION') && e.rec.credit === 'SOURCE: PIXELBURG POST'), 'labelled over the quote card');
  d.endLink();
  d.setShot('wide', { focus: 'A' });
  assert.equal(d.scene.recreation, null);
});
