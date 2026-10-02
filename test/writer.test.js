import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { ANCHORS, EMOTIONS, SHOTS, buildPrompt, extractJson, normalizeBulletin } from '../server/writer.js';

// ---------------------------------------------------------------- helpers

const makeStory = (id, extra = {}) => ({
  id,
  title: `Titular de la noticia ${id}`,
  summary: 'Resumen de la noticia. Segunda frase del resumen.',
  source: 'Fuente Uno',
  category: 'general',
  image: null,
  ...extra,
});

const STORIES = [makeStory('s1'), makeStory('s2', { image: 'https://img.test/s2.jpg', source: 'Fuente Dos' }), makeStory('s3')];

const storySeg = (id, extra = {}) => ({
  type: 'story',
  storyId: id,
  anchor: 'A',
  emotion: 'neutral',
  headline: `Rótulo ${id}`,
  text: `Texto de la noticia ${id}.`,
  shot: 'wide',
  ...extra,
});

const otherSeg = (type, extra = {}) => ({ type, anchor: 'A', emotion: 'neutral', text: `Texto de ${type}.`, ...extra });

const normalize = (segments, { stories = STORIES, raw = {}, opts } = {}) => normalizeBulletin({ title: 'Boletín', ...raw, segments }, stories, opts);

const types = (bulletin) => bulletin.segments.map((s) => s.type);

// ---------------------------------------------------------------- extractJson

describe('extractJson', () => {
  const obj = { title: 'T', segments: [{ type: 'intro', text: 'Hola' }] };

  test('parses plain JSON', () => {
    assert.deepEqual(extractJson(JSON.stringify(obj)), obj);
  });

  test('parses JSON wrapped in ```json fences', () => {
    const raw = '```json\n' + JSON.stringify(obj, null, 2) + '\n```';
    assert.deepEqual(extractJson(raw), obj);
  });

  test('parses JSON wrapped in bare ``` fences', () => {
    assert.deepEqual(extractJson('```\n' + JSON.stringify(obj) + '\n```'), obj);
  });

  test('ignores text before and after the object', () => {
    const raw = `Claro, aquí tienes el boletín:\n\n${JSON.stringify(obj)}\n\nEspero que te guste. ¡Un saludo!`;
    assert.deepEqual(extractJson(raw), obj);
  });

  test('handles braces inside string values', () => {
    const tricky = { text: 'a } b', other: 'x { y', nested: { k: '}}}' } };
    assert.deepEqual(extractJson(`prefijo ${JSON.stringify(tricky)} sufijo`), tricky);
    assert.deepEqual(extractJson('{"text": "a } b"}'), { text: 'a } b' });
  });

  test('handles escaped quotes and backslashes inside strings', () => {
    const tricky = { text: 'dijo "hola }" y una barra \\', ok: true };
    assert.deepEqual(extractJson(JSON.stringify(tricky) + ' trailing }'), tricky);
  });

  test('handles nested objects and arrays', () => {
    const deep = { a: { b: { c: [1, { d: [] }] } }, e: [{ f: {} }] };
    assert.deepEqual(extractJson(JSON.stringify(deep)), deep);
  });

  test('returns only the first top-level object when there are several', () => {
    assert.deepEqual(extractJson('{"n":1} {"n":2}'), { n: 1 });
  });

  test('throws when there is no JSON object at all', () => {
    assert.throws(() => extractJson('Lo siento, no puedo ayudar con eso.'), /no contiene JSON/);
    assert.throws(() => extractJson(''), /no contiene JSON/);
  });

  test('throws on truncated JSON', () => {
    assert.throws(() => extractJson('{"title": "T", "segments": [{"type": "intro"'), /incompleto/);
    assert.throws(() => extractJson('{"a": {"b": 1}'), /incompleto/);
    assert.throws(() => extractJson('{"text": "sin cerrar'), /incompleto/);
  });

  test('throws a SyntaxError when the braces balance but the content is not valid JSON', () => {
    assert.throws(() => extractJson('{esto no es json}'), SyntaxError);
  });
});

// ---------------------------------------------------------------- normalizeBulletin

describe('normalizeBulletin: story segments', () => {
  test('keeps valid story segments and decorates them with source, hasImage and flags', () => {
    const b = normalize([storySeg('s1', { breaking: true }), storySeg('s2', { shot: 'close', emotion: 'serious', anchor: 'B' })]);
    const [, s1, s2] = b.segments;
    assert.equal(s1.storyId, 's1');
    assert.equal(s1.source, 'Fuente Uno');
    assert.equal(s1.hasImage, false);
    assert.equal(s1.breaking, true);
    assert.equal(s2.source, 'Fuente Dos');
    assert.equal(s2.hasImage, true);
    assert.equal(s2.breaking, false);
    assert.equal(s2.shot, 'close');
    assert.equal(s2.emotion, 'serious');
    assert.equal(s2.anchor, 'B');
  });

  test('drops segments with an unknown storyId', () => {
    const b = normalize([storySeg('s1'), storySeg('nope'), storySeg('s2')]);
    assert.deepEqual(b.storyIds, ['s1', 's2']);
    assert.equal(b.segments.filter((s) => s.type === 'story').length, 2);
  });

  test('drops duplicate story segments (the first one wins)', () => {
    const b = normalize([storySeg('s1', { text: 'Primera versión.' }), storySeg('s1', { text: 'Segunda versión.' }), storySeg('s2')]);
    const stories = b.segments.filter((s) => s.type === 'story');
    assert.deepEqual(stories.map((s) => s.storyId), ['s1', 's2']);
    assert.equal(stories[0].text, 'Primera versión.');
  });

  test('throws when no valid story remains', () => {
    assert.throws(() => normalize([storySeg('nope'), otherSeg('intro'), otherSeg('outro')]), /no contiene noticias válidas/);
    assert.throws(() => normalize([otherSeg('intro'), otherSeg('chat'), otherSeg('outro')]), /no contiene noticias válidas/);
    assert.throws(() => normalize([]), /no contiene noticias válidas/);
    assert.throws(() => normalizeBulletin({}, STORIES), /no contiene noticias válidas/);
    assert.throws(() => normalizeBulletin(null, STORIES), /no contiene noticias válidas/);
    assert.throws(() => normalizeBulletin({ segments: 'texto' }, STORIES), /no contiene noticias válidas/);
    assert.throws(() => normalize([storySeg('s1')], { stories: [] }), /no contiene noticias válidas/);
  });

  test('drops segments with an unknown type or no text', () => {
    const b = normalize([
      storySeg('s1'),
      { type: 'banner', text: 'no existe este tipo' },
      null,
      'texto suelto',
      storySeg('s2', { text: '   ' }),
      storySeg('s3'),
    ]);
    assert.deepEqual(b.storyIds, ['s1', 's3']);
  });

  test('breaking is only true for a literal boolean true', () => {
    const b = normalize([storySeg('s1', { breaking: 'true' }), storySeg('s2', { breaking: 1 }), storySeg('s3', { breaking: true })]);
    assert.deepEqual(b.segments.filter((s) => s.type === 'story').map((s) => s.breaking), [false, false, true]);
  });
});

describe('normalizeBulletin: field validation', () => {
  test('invalid emotion becomes "neutral"; valid ones are kept', () => {
    for (const emotion of EMOTIONS) {
      assert.equal(normalize([storySeg('s1', { emotion })]).segments[1].emotion, emotion);
    }
    for (const emotion of ['furious', '', undefined, 42, 'HAPPY']) {
      assert.equal(normalize([storySeg('s1', { emotion })]).segments[1].emotion, 'neutral', String(emotion));
    }
  });

  test('invalid shot becomes "wide"; valid ones are kept', () => {
    for (const shot of SHOTS) {
      assert.equal(normalize([storySeg('s1', { shot })]).segments[1].shot, shot);
    }
    for (const shot of ['zoom', '', undefined, null]) {
      assert.equal(normalize([storySeg('s1', { shot })]).segments[1].shot, 'wide', String(shot));
    }
  });

  test('any anchor other than "B" becomes "A"', () => {
    assert.equal(normalize([storySeg('s1', { anchor: 'B' })]).segments[1].anchor, 'B');
    for (const anchor of ['A', 'C', 'b', '', undefined, 1]) {
      assert.equal(normalize([storySeg('s1', { anchor })]).segments[1].anchor, 'A', String(anchor));
    }
  });

  test('validation also applies to intro, chat and outro segments', () => {
    const b = normalize([
      otherSeg('intro', { anchor: 'Z', emotion: 'ecstatic' }),
      storySeg('s1'),
      otherSeg('chat', { anchor: 'B', emotion: 'surprised' }),
      otherSeg('outro', { anchor: 'x', emotion: 'sad' }),
    ]);
    const [intro, , chat, outro] = b.segments;
    assert.deepEqual([intro.anchor, intro.emotion], ['A', 'neutral']);
    assert.deepEqual([chat.anchor, chat.emotion], ['B', 'surprised']);
    assert.deepEqual([outro.anchor, outro.emotion], ['A', 'sad']);
  });

  test('clamps the headline to 56 characters at a word boundary', () => {
    const headline = 'cinco '.repeat(12).trim(); // 71 chars, words of 5 letters
    const [, s] = normalize([storySeg('s1', { headline })]).segments;
    assert.ok(s.headline.length <= 56, `length ${s.headline.length}`);
    assert.equal(s.headline, 'cinco '.repeat(9).trim());
    assert.ok(headline.startsWith(s.headline) && headline[s.headline.length] === ' ', 'cut must fall on a word boundary');
  });

  test('keeps a headline that is already short enough, including exactly 56 characters', () => {
    const exactly56 = 'palabra ' + 'x'.repeat(48);
    assert.equal(exactly56.length, 56);
    assert.equal(normalize([storySeg('s1', { headline: exactly56 })]).segments[1].headline, exactly56);
    assert.equal(normalize([storySeg('s1', { headline: 'Corto' })]).segments[1].headline, 'Corto');
  });

  test('strips trailing punctuation left over after clamping the headline', () => {
    const headline = 'x'.repeat(50) + ', ' + 'yyyyyyyy zzz';
    const [, s] = normalize([storySeg('s1', { headline })]).segments;
    assert.equal(s.headline, 'x'.repeat(50));
  });

  test('a single very long word is still clamped to 56 characters', { todo: 'BUG server/writer.js:116 - clipWords slices max+1 chars and only trims at whitespace, so a headline with no spaces comes back 57 chars long' }, () => {
    const [, s] = normalize([storySeg('s1', { headline: 'a'.repeat(100) })]).segments;
    assert.ok(s.headline.length <= 56, `length ${s.headline.length}`);
  });

  test('falls back to the (clamped) story title when the headline is empty or missing', () => {
    const stories = [makeStory('s1', { title: 'Titular original de la noticia' }), makeStory('s2', { title: 'palabra '.repeat(20) })];
    const b = normalize([storySeg('s1', { headline: '' }), storySeg('s2', { headline: undefined })], { stories });
    const [, a, c] = b.segments;
    assert.equal(a.headline, 'Titular original de la noticia');
    assert.ok(c.headline.length <= 56 && c.headline.startsWith('palabra palabra'));
  });

  test('clips long text to 520 characters, preferably at a sentence end', () => {
    const text = 'Esta es una frase de relleno para el guion. '.repeat(30).trim();
    const [, s] = normalize([storySeg('s1', { text })]).segments;
    assert.ok(text.length > 520);
    assert.ok(s.text.length <= 520, `length ${s.text.length}`);
    assert.ok(s.text.endsWith('.'), s.text.slice(-20));
    assert.ok(text.startsWith(s.text));
  });

  test('clips long text without sentence stops at a word boundary and adds an ellipsis', () => {
    const [, s] = normalize([storySeg('s1', { text: 'palabra '.repeat(200) })]).segments;
    assert.ok(s.text.length <= 520, `length ${s.text.length}`);
    assert.ok(s.text.endsWith('palabra…'), s.text.slice(-20));
  });

  test('leaves short text untouched', () => {
    assert.equal(normalize([storySeg('s1', { text: 'Dos frases. Nada más.' })]).segments[1].text, 'Dos frases. Nada más.');
  });

  test('strips markdown characters (* _ # `) and collapses whitespace in text, headline and title', () => {
    const b = normalize([storySeg('s1', { text: '**Hola**   _mundo_\n# `código`', headline: '## **Titular** `uno`' })], {
      raw: { title: '*Boletín* #1' },
    });
    assert.equal(b.segments[1].text, 'Hola mundo código');
    assert.equal(b.segments[1].headline, 'Titular uno');
    assert.equal(b.title, 'Boletín 1');
  });

  test('title defaults to "Boletín informativo" and is capped at 80 characters', () => {
    assert.equal(normalize([storySeg('s1')], { raw: { title: undefined } }).title, 'Boletín informativo');
    assert.equal(normalize([storySeg('s1')], { raw: { title: '  ' } }).title, 'Boletín informativo');
    assert.equal(normalize([storySeg('s1')], { raw: { title: 'T'.repeat(200) } }).title.length, 80);
  });
});

describe('normalizeBulletin: structure', () => {
  test('keeps at most 3 chat segments', () => {
    const b = normalize([storySeg('s1'), ...Array.from({ length: 5 }, (_, i) => otherSeg('chat', { text: `Chat ${i}.` })), storySeg('s2')]);
    const chats = b.segments.filter((s) => s.type === 'chat');
    assert.deepEqual(chats.map((c) => c.text), ['Chat 0.', 'Chat 1.', 'Chat 2.']);
  });

  test('adds a default intro and outro (using the channel name) when they are missing', () => {
    const b = normalize([storySeg('s1'), storySeg('s2')], { opts: { channelName: 'MI CANAL' } });
    assert.deepEqual(types(b), ['intro', 'story', 'story', 'outro']);
    assert.equal(b.segments[0].anchor, 'A');
    assert.match(b.segments[0].text, /MI CANAL/);
    assert.equal(b.segments.at(-1).anchor, 'B');
    assert.match(b.segments.at(-1).text, /MI CANAL/);
  });

  test('default channel name is LIVENEWS', () => {
    const b = normalize([storySeg('s1')]);
    assert.match(b.segments[0].text, /LIVENEWS/);
  });

  test('uses the intro and outro written by the model instead of the defaults', () => {
    const b = normalize([otherSeg('intro', { text: 'Mi intro.' }), storySeg('s1'), otherSeg('outro', { text: 'Mi despedida.' })]);
    assert.deepEqual(types(b), ['intro', 'story', 'outro']);
    assert.equal(b.segments[0].text, 'Mi intro.');
    assert.equal(b.segments[2].text, 'Mi despedida.');
  });

  test('puts the intro first and the outro last even when the model misplaced them', () => {
    const b = normalize([
      storySeg('s1'),
      otherSeg('outro', { text: 'Adiós.' }),
      otherSeg('intro', { text: 'Hola.' }),
      storySeg('s2'),
      otherSeg('chat', { text: 'Comentario.' }),
    ]);
    assert.deepEqual(types(b), ['intro', 'story', 'story', 'chat', 'outro']);
    assert.equal(b.segments[0].text, 'Hola.');
    assert.equal(b.segments.at(-1).text, 'Adiós.');
  });

  test('keeps only one intro and one outro', () => {
    const b = normalize([otherSeg('intro', { text: 'Uno.' }), otherSeg('intro', { text: 'Dos.' }), storySeg('s1'), otherSeg('outro', { text: 'Fin A.' }), otherSeg('outro', { text: 'Fin B.' })]);
    assert.deepEqual(types(b), ['intro', 'story', 'outro']);
    assert.equal(b.segments[0].text, 'Uno.');
    assert.equal(b.segments[2].text, 'Fin A.');
  });

  test('removes leading chat segments before the first story, keeps later ones', () => {
    const b = normalize([otherSeg('chat', { text: 'Chat inicial 1.' }), otherSeg('chat', { text: 'Chat inicial 2.' }), storySeg('s1'), otherSeg('chat', { text: 'Chat posterior.' }), storySeg('s2')]);
    assert.deepEqual(types(b), ['intro', 'story', 'chat', 'story', 'outro']);
    assert.equal(b.segments[2].text, 'Chat posterior.');
  });

  test('also removes leading chats that come right after the intro', () => {
    const b = normalize([otherSeg('intro'), otherSeg('chat', { text: 'Chat huérfano.' }), storySeg('s1')]);
    assert.deepEqual(types(b), ['intro', 'story', 'outro']);
  });

  test('rundown lists the story headlines in running order; storyIds lists the used ids', () => {
    const b = normalize([storySeg('s3', { headline: 'Tercera' }), otherSeg('chat'), storySeg('s1', { headline: 'Primera' }), storySeg('unknown'), storySeg('s2', { headline: 'Segunda' })]);
    assert.deepEqual(b.rundown, [
      { storyId: 's3', headline: 'Tercera' },
      { storyId: 's1', headline: 'Primera' },
      { storyId: 's2', headline: 'Segunda' },
    ]);
    assert.deepEqual(b.storyIds, ['s3', 's1', 's2']);
    assert.deepEqual(
      b.segments.filter((s) => s.type === 'story').map((s) => s.storyId),
      b.rundown.map((r) => r.storyId)
    );
  });

  test('does not mutate the raw input', () => {
    const raw = { title: 'T', segments: [storySeg('s1', { headline: '**x**' })] };
    const copy = structuredClone(raw);
    normalizeBulletin(raw, STORIES);
    assert.deepEqual(raw, copy);
  });
});

// ---------------------------------------------------------------- buildPrompt

describe('buildPrompt', () => {
  const now = new Date('2026-10-15T10:30:00Z');

  test('mentions every story id and the channel name', () => {
    const prompt = buildPrompt({ channelName: 'CANAL PRUEBA', stories: STORIES, now });
    assert.match(prompt, /"CANAL PRUEBA"/);
    for (const s of STORIES) {
      assert.ok(prompt.includes(`"id": "${s.id}"`), `missing id ${s.id}`);
      assert.ok(prompt.includes(s.title), `missing title of ${s.id}`);
    }
    assert.ok(prompt.includes('Fuente Dos'));
  });

  test('never contains the string "undefined"', () => {
    const prompt = buildPrompt({ channelName: 'TEST', stories: STORIES, now });
    assert.ok(!prompt.includes('undefined'));
    assert.ok(!buildPrompt({ channelName: 'TEST', stories: STORIES }).includes('undefined'), 'also with the default "now"');
    assert.ok(!buildPrompt({ channelName: 'TEST', stories: [makeStory('x', { summary: '' })], now }).includes('undefined'));
  });

  test('names both anchors and the JSON output contract', () => {
    const prompt = buildPrompt({ channelName: 'TEST', stories: STORIES, now });
    assert.ok(prompt.includes(ANCHORS.A.name) && prompt.includes(ANCHORS.B.name));
    for (const e of EMOTIONS) assert.ok(prompt.includes(e), `emotion ${e}`);
    for (const s of SHOTS) assert.ok(prompt.includes(s), `shot ${s}`);
  });

  test('formats the date in Madrid time', () => {
    const prompt = buildPrompt({ channelName: 'TEST', stories: STORIES, now });
    assert.match(prompt, /Fecha y hora \(Madrid\): .*octubre.*12:30/);
  });

  test('truncates long summaries to 700 characters and embeds stories as JSON', () => {
    const long = makeStory('big', { summary: 'palabra '.repeat(200) });
    const prompt = buildPrompt({ channelName: 'TEST', stories: [long], now });
    const json = prompt.slice(prompt.indexOf('NOTICIAS\n') + 'NOTICIAS\n'.length);
    const [parsed] = JSON.parse(json);
    assert.equal(parsed.id, 'big');
    assert.equal(parsed.fuente, 'Fuente Uno');
    assert.equal(parsed.titular, long.title);
    assert.equal(parsed.resumen.length, 700);
  });
});
