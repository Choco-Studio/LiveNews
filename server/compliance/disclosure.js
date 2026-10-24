// What GLOBIT 24 tells people about how it is made, everywhere it publishes (docs/publishing/compliance.md §3).
//
// One rule for the whole channel: every item says it is AI-produced, on screen and in its text, whether or not a law
// would let it stay silent. The live stream cannot use the editorial-review exemption of the AI Act (Article 50(4),
// second subparagraph: nobody reviews a bulletin before it airs), and the platforms ask for their own labels besides.
// On screen it is said by the channel's own ident before every programme, after its break (Article 50(5): at the first
// exposure to the programme), and on every clip's end card; a clip carries the platform's own AI label from its first
// second.
// Nothing over a programme, nothing inside a break (owner, 18 Oct). The RECREATION label stays in every frame of a
// recreation.
// One identity, said the same way everywhere, is also the honest one.
//
//   CHANNEL                       the channel-level statement: { name, short, onAir, notice, ident, statement, about }
//   programmeWording(id)          per-programme wording: { title, noun, onAir, notice, line }
//   writerOf(episode)             'ai' | 'software' (who wrote the words: an AI writer or the channel's rule-based one)
//   recreationsIn(episode)        [{ id, name, role, outlet, slot, storyId, words }] of an episode's IN THEIR WORDS pieces
//   disclosureFor(item)           flags, labels and text per platform for an episode, a clip, a Short or a text post
//   youtubeSynthetic(item)        YouTube's "altered or synthetic content" answer: { answer, reasons }
//   describe(item, { credits })   the description text: disclosure first, then the programme, then the credits
//   textPost(item)                a text post with its disclosure placed first (CoP Measure 1.2.2 f)
//
// Platform fields, as their APIs name them (checked 17 Oct 2026, sources in compliance.md §2):
//   YouTube    videos.status.containsSyntheticMedia (live: the broadcast's own video id, videos.update): YouTube's
//              "altered or synthetic content", answered by its four questions (youtubeSynthetic): No for what we make
//              and status.selfDeclaredMadeForKids = false on every video and broadcast (the audience YouTube requires)
//   TikTok     post_info.is_aigc (Content Posting API, /v2/post/publish/video/init/)
//   Instagram  is_ai_generated on the media container (Content Publishing API, 22 Jun 2026)
//   Facebook, Threads, X, Bluesky, Mastodon, LinkedIn: no API flag for this; the label in the frame, the C2PA
//              manifest (Meta and LinkedIn read it) and the words at the top of the text carry the disclosure.

// The notice's three parts (graphics/disclosure.js noticeParts: the same words, kept equal by a test).
const noticeOf = (noun = 'NEWS') => [`AI-PRODUCED ${noun}`, 'PRESENTERS ARE AI CHARACTERS', 'FACTS FROM CREDITED SOURCES'].join(' · ');
const NOTICE = noticeOf('NEWS');

export const PLATFORMS = ['youtube', 'tiktok', 'instagram', 'facebook', 'threads', 'x', 'bluesky', 'mastodon', 'linkedin'];

/** The channel-level statement. `contact` is filled from the environment (EDITORIAL_CONTACT) when it is set. */
export const CHANNEL = Object.freeze({
  name: 'GLOBIT 24',
  // the on-air identity: the first words of the notice (graphics/disclosure.js)
  short: 'AI-produced news',
  onAir: 'AI-PRODUCED NEWS',
  // the notice on screen: under the wordmark of the channel's ident before every programme, and on a clip's end card
  // (graphics/disclosure.js NOTICE_LINE says the same, a test keeps them equal)
  notice: NOTICE,
  // the plain-language statement (descriptions, the channel's About page, the ident's line in short form)
  statement:
    'GLOBIT 24 is AI-produced news. AI systems and the channel’s own software write the scripts from the reporting of the news organisations named on screen. ' +
    'The presenters, reporters and experts are animated characters with synthetic voices. Photos and footage are real and credited to their source. ' +
    'When a public figure appears in pixel art, it is a labelled AI RECREATION: their exact reported words in a generic synthetic voice, never their real voice or image.',
  // the ident's statement under the wordmark: the notice (graphics/disclosure.js IDENT_LINE)
  ident: NOTICE,
  about:
    'Who is responsible: GLOBIT 24 is published under the editorial responsibility of its owner (see the contact below). ' +
    'Corrections and complaints, including requests to remove a recreation of you: write to the contact address; we answer within 24 hours.',
});

/** Who answers for the channel (AI Act guidelines §6.2.3 ii; EMFA Art. 6): set before launch, never invented here. */
export function editorialContact(env = process.env) {
  const contact = String(env.EDITORIAL_CONTACT || '').trim();
  const name = String(env.EDITORIAL_RESPONSIBLE || '').trim();
  return contact ? { name: name || null, contact } : null;
}

// Per programme: the noun in the notice (AI-PRODUCED NEWS / FORECAST / SPORT…) and the description's line.
const PROGRAMMES = {
  'world-now': { title: 'WORLD NOW', noun: 'NEWS', what: 'the stories shaping our world', cast: 'Paco Pixel and Lola Byte' },
  'tech-bytes': { title: 'TECH BYTES', noun: 'NEWS', what: 'technology news', cast: 'Max Circuit and Ada Volt' },
  cosmos: { title: 'COSMOS DESK', noun: 'NEWS', what: 'science, space and our planet', cast: 'Dr Nova Reyes and UNIT-8' },
  'money-minute': { title: 'MONEY MINUTE', noun: 'NEWS', what: 'markets and money', cast: 'Penny Sterling', advice: 'Not financial advice: the programme reports what its sources say.' },
  'news-60': { title: 'NEWS IN 60', noun: 'NEWS', what: 'the headlines in a minute', cast: 'Sam' },
  'world-weather': { title: 'WORLD WEATHER', noun: 'FORECAST', what: 'the weather on every continent', cast: 'Sam', data: 'Written by software from Open-Meteo forecasts and GDACS alerts; no figure is made up.' },
  'seven-days': { title: 'SEVEN DAYS', noun: 'NEWS', what: 'the week on GLOBIT 24', cast: 'Paco Pixel and Lola Byte', data: 'Told only from what GLOBIT 24 aired this week.' },
  'full-time': { title: 'FULL TIME', noun: 'SPORT', what: 'the day in sport', cast: 'Kai and Rosa' },
  'pay-attention': { title: 'PAY ATTENTION', noun: 'QUIZ', what: 'the week’s news as a game', cast: 'the channel’s presenters', data: 'Every question comes from a story GLOBIT 24 has already aired.' },
  'press-start': { title: 'PRESS START', noun: 'NEWS', what: 'video game news', cast: 'the channel’s presenters' },
};

/** The wording of one programme (an unknown id gets the channel's own). */
export function programmeWording(id) {
  const p = PROGRAMMES[id] || { title: String(id || 'GLOBIT 24').toUpperCase(), noun: 'NEWS', what: 'news', cast: 'the channel’s presenters' };
  return {
    id: id || null,
    title: p.title,
    noun: p.noun,
    onAir: `AI-PRODUCED ${p.noun}`,
    notice: noticeOf(p.noun),
    line: `${p.title}: ${p.what}, presented by ${p.cast}, animated characters with synthetic voices.`,
    ...(p.data ? { data: p.data } : {}),
    ...(p.advice ? { advice: p.advice } : {}),
  };
}

// the channel's own rule-based writers (server/providers/mock.js, the weekly, quiz and weather writers); any other
// provider is an AI writer (an unknown one too: the safe side)
const RULE_BASED = new Set(['mock', 'weekly', 'quiz', 'weather', 'software']);

/** Who wrote an episode's words: 'ai' (an AI writer) or 'software' (the fallback, the weather, quiz and weekly writers). */
export function writerOf(episode) {
  const p = String(episode?.provider || '').toLowerCase();
  if (!p) return 'ai';
  return RULE_BASED.has(p) ? 'software' : 'ai';
}

// YouTube's "altered or synthetic content" (YouTube Studio, the video's details, "Uso de IA": four questions, read
// 24 Oct 2026; compliance.md §2.5) asks about realistic content a viewer could take for real, and about nothing else.
export const YOUTUBE_QUESTIONS = Object.freeze({
  realPerson: 'a real person seems to do or say something they did not do or say',
  alteredRecording: 'a recording of a real event or place has been altered',
  realisticScene: 'a realistic scene that did not happen has been generated',
  aiMusic: 'AI-made music is the focus of the video',
});

/**
 * YouTube's answer for an item: Yes only when one of its four questions is true of it. None is true of what the channel
 * makes: its presenters, reporters and experts are pixel-art characters (clearly animated); their voices are generic
 * synthetic ones, never a real person's; photos and footage are real, pixelated (a filter: what they show is
 * unchanged); a recreation is a pixel-art figure saying the person's exact public words in a generic voice; the music is
 * a bed under the news. So No, on every video and on the live (owner, 24 Oct: "estamos usando mal el botón de uso de
 * IA", YouTube's own assistant said so; until then every upload said Yes, and YouTube showed "altered or synthetic" on
 * the player of every news video). An item that ever is one names it in `item.synthetic` ({ realPerson: true, … }) and
 * the answer is Yes. The channel says how it is made in its own words: the ident before every programme, the
 * description's first line, the C2PA manifest (AI and real material mixed).
 */
export function youtubeSynthetic(item = {}) {
  const reasons = Object.keys(YOUTUBE_QUESTIONS).filter((k) => item?.synthetic?.[k] === true);
  return { answer: reasons.length > 0, reasons: reasons.map((k) => YOUTUBE_QUESTIONS[k]) };
}

/** The IN THEIR WORDS pieces of an episode (producer.js guests(): a `cross` of kind 'restage', recreation: true). */
export function recreationsIn(episode) {
  const out = [];
  const segs = Array.isArray(episode?.segments) ? episode.segments : [];
  segs.forEach((seg, index) => {
    if (!seg || !(seg.recreation === true || seg.kind === 'restage')) return;
    const booking = episode?.guests?.[seg.reporter] || null;
    out.push({
      index,
      id: seg.reporter || booking?.id || null,
      name: booking?.name || null,
      role: booking?.role || seg.desk || null,
      qid: booking?.qid || null,
      outlet: seg.quoteRef?.outlet || seg.source || null,
      by: seg.quoteRef?.by || null,
      slot: seg.anchor || null,
      storyId: seg.storyId || null,
      words: String(seg.text || ''),
    });
  });
  return out;
}

const kindOf = (item) => {
  const k = String(item?.kind || '').toLowerCase();
  if (['live', 'episode', 'clip', 'short', 'text', 'image'].includes(k)) return k;
  return item?.text && !item?.episode ? 'text' : 'episode';
};
const isVideo = (kind) => kind === 'live' || kind === 'episode' || kind === 'clip' || kind === 'short';

/** The recreation's description line (one per person, the outlet named). */
function recreationLine(r) {
  const who = r.name ? `${r.name}${r.role ? `, ${r.role},` : ''}` : r.role ? `the ${r.role}` : 'a public figure';
  return `Contains an AI RECREATION: the words of ${who} as reported by ${r.outlet || 'the source'}, said by a generic synthetic voice over a pixel-art figure. It is not their real voice or image.`;
}

/**
 * The disclosure of one item, everywhere it goes.
 * `item` = { kind: 'live'|'episode'|'clip'|'short'|'text'|'image', programId?, episode?, text?, platforms?, writer? }
 * (a clip's or a Short's `recreations` may be given; else they are read from its episode, all of them, which is the
 * safe side: checkClip() narrows a clip to the pieces its range really contains).
 * -> { kind, programme, writer, ai, recreations, election, labels, description, text, platforms: { <name>: {...} } }
 */
export function disclosureFor(item = {}) {
  const kind = kindOf(item);
  const episode = item.episode || null;
  const programId = item.programId || episode?.program?.id || null;
  const prog = programmeWording(programId);
  const writer = item.writer === 'ai' || item.writer === 'software' ? item.writer : episode ? writerOf(episode) : 'ai';
  const recreations = Array.isArray(item.recreations) ? item.recreations : recreationsIn(episode);
  const hasRecreation = recreations.length > 0;
  // what in it is made by AI: the words (an AI writer, or the rule-based writer that works from the outlets' own text)
  // and, in every video, the voices; a recreation adds a real person's words in a voice that is not theirs
  const ai = {
    text: true,
    textBy: writer,
    voices: isVideo(kind),
    presenters: isVideo(kind) ? 'animated characters' : null,
    recreation: hasRecreation,
    pictures: 'real, credited (never AI-generated)',
  };
  const madeBy = writer === 'ai' ? 'written by AI' : 'written by the channel’s software';
  const opening = isVideo(kind)
    ? `AI-produced news: ${madeBy} from the named sources and presented by animated characters with synthetic voices.`
    : `AI-generated: ${madeBy} from the named source.`;
  const lines = [opening];
  if (kind !== 'text') lines.push(prog.line);
  if (prog.data) lines.push(prog.data);
  if (prog.advice) lines.push(prog.advice);
  for (const r of recreations) lines.push(recreationLine(r));
  const labels = {
    onAir: prog.onAir,
    notice: prog.notice,
    ...(hasRecreation ? { recreation: 'AI RECREATION — WORDS FROM PUBLIC STATEMENTS', source: 'SOURCE: <OUTLET>' } : {}),
    textPrefix: 'AI-generated:',
  };
  // TikTok and Instagram ask for their label on realistic-sounding synthetic audio ("realistic images, audio, or video",
  // TikTok; "realistic-sounding audio that was digitally created", Meta): our voices are that, so every video carries
  // it, a recreation without exception. YouTube's question is narrower, about real people, real recordings, realistic
  // scenes and AI music (youtubeSynthetic): No for what we make.
  const flag = true;
  const yt = youtubeSynthetic(item);
  const platforms = {
    youtube: {
      field: kind === 'live' ? 'videos.status.containsSyntheticMedia (the broadcast’s video id)' : 'videos.status.containsSyntheticMedia',
      containsSyntheticMedia: yt.answer,
      reasons: yt.reasons,
      required: yt.answer,
      // the audience YouTube requires on every upload and broadcast (US COPPA): news for a general audience
      audienceField: 'status.selfDeclaredMadeForKids',
      selfDeclaredMadeForKids: false,
      descriptionTop: opening,
      // (news is a sensitive topic: a Yes would show YouTube's label on the player, not only in the description)
      prominentLabel: yt.answer,
    },
    tiktok: { field: 'post_info.is_aigc', is_aigc: flag, required: hasRecreation, captionTop: opening },
    instagram: { field: 'is_ai_generated', is_ai_generated: flag, required: hasRecreation, captionTop: opening },
    // (no API field: Meta's own "AI info" label set by hand on every video, recreation or not: since 18 Oct the label is
    // what a viewer sees first on a clip; the checklist asks for it and the gate holds a video without it)
    facebook: { field: null, manualLabel: isVideo(kind), c2pa: true, textTop: opening },
    threads: { field: null, manualLabel: isVideo(kind), c2pa: true, textTop: opening },
    x: { field: null, textTop: labels.textPrefix, automatedAccountLabel: true },
    bluesky: { field: null, textTop: labels.textPrefix, selfLabel: 'automated account in the profile' },
    mastodon: { field: null, textTop: labels.textPrefix, botAccount: true },
    linkedin: { field: null, c2pa: true, textTop: opening },
  };
  const wanted = Array.isArray(item.platforms) && item.platforms.length ? item.platforms : PLATFORMS;
  return {
    kind,
    programme: prog,
    writer,
    ai,
    recreations,
    labels,
    description: { opening, lines },
    channel: { statement: CHANNEL.statement, about: CHANNEL.about, contact: editorialContact() },
    platforms: Object.fromEntries(wanted.filter((p) => platforms[p]).map((p) => [p, platforms[p]])),
  };
}

/**
 * The description of a published video: the disclosure first (it is what shows before "more"), the programme and any
 * recreation, then the credits (credits.js creditsFor), then who answers for the channel.
 */
export function describe(item, { credits = [], summary = '', lead = '' } = {}) {
  const d = disclosureFor(item);
  // (a clip's lead, what it is about, right under the disclosure: YouTube shows a description's first lines before
  // "more", docs/publishing/thumbnails-titles.md)
  const out = lead ? [d.description.lines[0], String(lead).trim(), ...d.description.lines.slice(1)] : [...d.description.lines];
  if (summary) out.push('', String(summary).trim());
  if (credits.length) out.push('', 'Credits:', ...credits.map((c) => `· ${c}`));
  out.push('', CHANNEL.statement);
  const who = editorialContact();
  out.push(who ? `Editorial responsibility and complaints: ${who.name ? `${who.name}, ` : ''}${who.contact}` : 'Editorial responsibility and complaints: see the channel’s About page.');
  return out.join('\n');
}

/**
 * A text post (X, Threads, Bluesky, Mastodon, LinkedIn): the disclosure first, then the words, then the source.
 * `item.text` is the post, `item.source` the outlet, `item.link` a link. `max` the platform's length.
 */
export function textPost(item, { max = 280 } = {}) {
  const prefix = 'AI-generated:';
  const source = item.source ? ` (Source: ${item.source})` : '';
  const link = item.link ? ` ${item.link}` : '';
  let body = String(item.text || '').replace(/\s+/g, ' ').trim();
  // a link counts as 23 characters on X whatever its length
  const room = max - prefix.length - 1 - source.length - (link ? 24 : 0);
  if (body.length > room) {
    const cut = body.slice(0, Math.max(0, room - 1));
    body = `${cut.slice(0, cut.lastIndexOf(' ') > 0 ? cut.lastIndexOf(' ') : cut.length).replace(/[,;:\s]+$/, '')}…`;
  }
  return `${prefix} ${body}${source}${link}`;
}
