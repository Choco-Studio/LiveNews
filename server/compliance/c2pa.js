// Machine-readable marking of every exported video and image (AI Act Art. 50(2); docs/publishing/compliance.md §4).
//
// Two layers, as the EU Code of Practice on transparency of AI-generated content asks for content that travels
// online (Measure 1.1: digitally signed metadata AND an imperceptible watermark):
//   1. C2PA content credentials: a signed, time-stamped manifest saying the file is AI-produced (the IPTC digital
//      source type "compositeWithTrainedAlgorithmicMedia"), what in it is AI and what is not, its programme, its
//      sources and any recreation, and who published it. Open standard, open verifiers (contentcredentials.org,
//      the C2PA SDK), read by YouTube, TikTok, Meta and LinkedIn to apply their own AI labels. Built with the C2PA
//      SDK's Python binding (tools/c2pa/c2pa_tool.py; pip install -r tools/c2pa/requirements.txt).
//   2. An imperceptible audio watermark on the synthetic voices (what in our videos is AI-generated), embedded before
//      signing so it survives the platforms' re-encoding when the manifest is stripped. Prepared, not active here:
//      the open-source embedder (audiowmark) could not be fetched from this environment (its download host and
//      GitHub answered 403 through the proxy). With AUDIO_WATERMARK=audiowmark on a machine that has it, it runs.
//
//   buildManifest(item, { title, sources, credits })   -> the C2PA manifest (JSON) for an item
//   markFile(path, manifest, opts)                     -> { ok, path, label, validation, timestamped, devCert, watermark }
//   readMark(path, opts)                               -> { ok, aiGenerated, sourceType, disclosure, validation, signer }
//   c2paStatus(opts)                                   -> { ok, sdk, python, reason }
//   signingIdentity(opts)                              -> { cert, key, dev } (env C2PA_CERT/C2PA_KEY, else a dev chain)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { disclosureFor, CHANNEL, editorialContact } from './disclosure.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TOOL = path.join(ROOT, 'tools', 'c2pa', 'c2pa_tool.py');
export const SOURCE_TYPE = {
  composite: 'http://cv.iptc.org/newscodes/digitalsourcetype/compositeWithTrainedAlgorithmicMedia',
  trained: 'http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia',
};
const DEFAULT_TSA = 'http://timestamp.digicert.com';

const pythonOf = (opts) => opts.python || process.env.C2PA_PYTHON || 'python3';

function run(opts, args, { timeoutMs = 120_000 } = {}) {
  const r = spawnSync(pythonOf(opts), [TOOL, ...args], { encoding: 'utf8', timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024 });
  if (r.error) return { error: `${pythonOf(opts)}: ${r.error.message}` };
  const line = String(r.stdout || '').trim().split('\n').pop();
  try {
    return JSON.parse(line);
  } catch {
    return { error: `c2pa tool: ${String(r.stderr || r.stdout || 'no answer').trim().slice(0, 400)}` };
  }
}

/** Is the C2PA SDK there? -> { ok, sdk, python, reason } */
export function c2paStatus(opts = {}) {
  const r = run(opts, ['version'], { timeoutMs: 30_000 });
  return r.ok ? { ok: true, sdk: r.sdk, python: pythonOf(opts), mimeTypes: r.mimeTypes } : { ok: false, python: pythonOf(opts), reason: r.error || 'unavailable' };
}

/**
 * The signing identity: the channel's certificate chain and private key from C2PA_CERT and C2PA_KEY (paths; a
 * certificate from a CA on the C2PA trust list for launch), else a development chain made once in
 * <dataDir>/compliance/c2pa/ (ES256: a root and an end-entity signing certificate). The private key never leaves
 * that directory and never enters the repository (data/ is ignored).
 */
export function signingIdentity({ dataDir = path.join(ROOT, 'data'), env = process.env } = {}) {
  if (env.C2PA_CERT && env.C2PA_KEY) return { cert: env.C2PA_CERT, key: env.C2PA_KEY, dev: false };
  if (env.C2PA_ALLOW_DEV_CERT === '0') throw new Error('no C2PA signing certificate (C2PA_CERT, C2PA_KEY) and the development one is not allowed');
  const dir = path.join(dataDir, 'compliance', 'c2pa');
  const cert = path.join(dir, 'chain.pem');
  const key = path.join(dir, 'sign.key');
  if (fs.existsSync(cert) && fs.existsSync(key)) return { cert, key, dev: true };
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const ssl = (args) => {
    const r = spawnSync('openssl', args, { cwd: dir, encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`openssl ${args[0]}: ${String(r.stderr || r.error?.message || '').trim().slice(0, 300)}`);
  };
  ssl(['ecparam', '-name', 'prime256v1', '-genkey', '-noout', '-out', 'root.key']);
  ssl(['req', '-x509', '-new', '-key', 'root.key', '-sha256', '-days', '3650', '-subj', '/CN=GLOBIT 24 DEV ROOT/O=GLOBIT 24', '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,keyCertSign,cRLSign', '-out', 'root.pem']);
  ssl(['ecparam', '-name', 'prime256v1', '-genkey', '-noout', '-out', 'sign.ec']);
  ssl(['pkcs8', '-topk8', '-nocrypt', '-in', 'sign.ec', '-out', 'sign.key']);
  ssl(['req', '-new', '-key', 'sign.key', '-subj', '/CN=GLOBIT 24 publisher (development)/O=GLOBIT 24', '-out', 'sign.csr']);
  fs.writeFileSync(path.join(dir, 'ext.cnf'), ['basicConstraints=critical,CA:FALSE', 'keyUsage=critical,digitalSignature', 'extendedKeyUsage=emailProtection', 'subjectKeyIdentifier=hash', 'authorityKeyIdentifier=keyid', ''].join('\n'));
  ssl(['x509', '-req', '-in', 'sign.csr', '-CA', 'root.pem', '-CAkey', 'root.key', '-CAcreateserial', '-days', '825', '-sha256', '-extfile', 'ext.cnf', '-out', 'sign.pem']);
  fs.writeFileSync(cert, fs.readFileSync(path.join(dir, 'sign.pem'), 'utf8') + fs.readFileSync(path.join(dir, 'root.pem'), 'utf8'));
  for (const f of ['sign.ec', 'sign.csr', 'root.srl']) fs.rmSync(path.join(dir, f), { force: true });
  for (const f of ['root.key', 'sign.key']) fs.chmodSync(path.join(dir, f), 0o600);
  return { cert, key, dev: true };
}

/**
 * The manifest of one item: AI-produced (IPTC digital source type), what in it is AI (the words, the voices; never
 * the pictures, which are real and credited), its programme, sources, recreations and credits, and who answers for
 * it. No personal data of viewers or staff (AI Act guidelines §4.4), only the public facts of the publication.
 */
export function buildManifest(item = {}, { title = null, sources = [], credits = [], format = null } = {}) {
  const d = disclosureFor(item);
  const audioOnly = item.kind === 'audio';
  const who = editorialContact();
  return {
    claim_generator_info: [{ name: `${CHANNEL.name} publisher`, version: '1.0' }],
    title: String(title || item.title || `${d.programme.title} · ${CHANNEL.name}`).slice(0, 200),
    ...(format ? { format } : {}),
    assertions: [
      {
        label: 'c2pa.actions.v2',
        data: {
          actions: [
            {
              action: 'c2pa.created',
              digitalSourceType: audioOnly ? SOURCE_TYPE.trained : SOURCE_TYPE.composite,
              softwareAgent: { name: `${CHANNEL.name} newsroom` },
              description: d.description.opening,
            },
          ],
        },
      },
      {
        label: 'org.globit24.disclosure',
        data: {
          statement: CHANNEL.statement,
          label: d.labels.onAir,
          notice: d.labels.notice,
          programme: d.programme.id,
          ai: d.ai,
          recreations: d.recreations.map((r) => ({ name: r.name, role: r.role, outlet: r.outlet, words: 'their reported words, generic synthetic voice, pixel-art figure: not their voice or image' })),
          sources: [...new Set(sources)].slice(0, 40),
          credits: credits.slice(0, 60),
          editorialResponsibility: who ? { name: who.name, contact: who.contact } : null,
        },
      },
    ],
  };
}

/**
 * Mark a file in place: the audio watermark when it can (layer 2), then the signed C2PA manifest (layer 1), then
 * read back and verified. Throws when the file cannot be marked or the manifest does not read back: an unmarked file
 * is never published. `opts` = { output (else in place), cert, key, tsa (C2PA_TSA, '' for none), python, dataDir,
 * watermark: 'audiowmark' | 'off' (AUDIO_WATERMARK), payload (hex) }
 */
export function markFile(file, manifest, opts = {}) {
  const input = path.resolve(file);
  if (!fs.existsSync(input)) throw new Error(`no file ${input}`);
  const output = path.resolve(opts.output || input);
  const id = opts.cert && opts.key ? { cert: opts.cert, key: opts.key, dev: !!opts.dev } : signingIdentity({ dataDir: opts.dataDir });
  const tsa = opts.tsa !== undefined ? opts.tsa : process.env.C2PA_TSA !== undefined ? process.env.C2PA_TSA : DEFAULT_TSA;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mark-'));
  try {
    let src = input;
    const watermark = watermarkFile(src, { ...opts, outDir: tmpDir });
    if (watermark.ok) src = watermark.path;
    const mf = path.join(tmpDir, 'manifest.json');
    fs.writeFileSync(mf, JSON.stringify(manifest));
    const signed = path.join(tmpDir, `signed${path.extname(input)}`);
    const args = ['sign', '--in', src, '--out', signed, '--manifest', mf, '--cert', id.cert, '--key', id.key];
    let r = run(opts, tsa ? [...args, '--tsa', tsa] : args);
    let timestamped = !!(r.ok && tsa);
    if (!r.ok && tsa) {
      // the time-stamp authority out of reach: signed without it, said in the result (the signature still binds)
      r = run(opts, args);
      timestamped = false;
    }
    if (!r.ok) throw new Error(`C2PA signing failed: ${r.error || 'no answer'}`);
    const back = readMark(signed, opts);
    if (!back.ok) throw new Error(`the C2PA manifest did not read back: ${back.error || 'none'}`);
    const bad = back.validation.filter((s) => !/^signingCredential\.untrusted$|^timeStamp\.(?:untrusted|trusted)$/.test(s.code) && /mismatch|invalid|missing|failure|error/i.test(s.code));
    if (bad.length) throw new Error(`the manifest reads back invalid: ${bad.map((s) => s.code).join(', ')}`);
    fs.copyFileSync(signed, `${output}.part`);
    fs.renameSync(`${output}.part`, output);
    return { ok: true, path: output, label: back.label, validation: back.validation.map((s) => s.code), timestamped, devCert: id.dev, aiGenerated: back.aiGenerated, watermark: watermark.ok ? { ok: true, backend: watermark.backend } : { ok: false, reason: watermark.reason } };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

/** Read a file's C2PA manifest. -> { ok, label, aiGenerated, sourceType, disclosure, validation, signer, error } */
export function readMark(file, opts = {}) {
  const r = run(opts, ['read', '--in', path.resolve(file)]);
  if (r.error && !('ok' in r)) return { ok: false, error: r.error, validation: [] };
  const m = r.manifest || null;
  const actions = (m?.assertions || []).filter((a) => /^c2pa\.actions/.test(a.label)).flatMap((a) => a.data?.actions || []);
  const sourceType = actions.map((a) => a.digitalSourceType).find(Boolean) || null;
  const disclosure = (m?.assertions || []).find((a) => a.label === 'org.globit24.disclosure')?.data || null;
  return {
    ok: !!m,
    label: r.active || null,
    aiGenerated: !!sourceType && /trainedAlgorithmicMedia$/i.test(sourceType),
    sourceType,
    disclosure,
    validation: r.validation_status || [],
    state: r.validation_state || null,
    signer: m?.signature_info || null,
    error: r.error || null,
  };
}

// ------------------------------------------------------------------------------------------------ the watermark

/** Is an audio watermark embedder available? -> { ok, backend, reason } */
export function watermarkStatus(opts = {}) {
  const backend = String(opts.watermark || process.env.AUDIO_WATERMARK || 'audiowmark');
  if (backend === 'off') return { ok: false, backend, reason: 'turned off (AUDIO_WATERMARK=off)' };
  const bin = opts.watermarkBin || process.env.AUDIO_WATERMARK_BIN || backend;
  const r = spawnSync(bin, ['--version'], { encoding: 'utf8', timeout: 10_000 });
  if (r.error || r.status !== 0) return { ok: false, backend, reason: `${bin} not installed (its download host and GitHub answer 403 here; see compliance.md §4)` };
  return { ok: true, backend, bin, version: String(r.stdout || '').trim().split('\n')[0] };
}

/**
 * Watermark the audio track of a video (or an audio file) with the channel's payload: the track is taken out with
 * ffmpeg, marked by the embedder (audiowmark add IN OUT PAYLOAD) and put back without touching the picture.
 * -> { ok, path, backend } | { ok: false, reason }
 */
export function watermarkFile(file, opts = {}) {
  const st = watermarkStatus(opts);
  if (!st.ok) return st;
  const ext = path.extname(file).toLowerCase();
  if (!['.mp4', '.mov', '.m4v', '.wav', '.m4a', '.mp3'].includes(ext)) return { ok: false, backend: st.backend, reason: `no audio track in a ${ext} file` };
  const dir = opts.outDir || fs.mkdtempSync(path.join(os.tmpdir(), 'wm-'));
  const payload = String(opts.payload || process.env.AUDIO_WATERMARK_PAYLOAD || 'a1b24c0ffee0a1b24c0ffee0a1b24c0f').replace(/[^0-9a-f]/gi, '').slice(0, 32).padEnd(32, '0');
  const wavIn = path.join(dir, 'voice.wav');
  const wavOut = path.join(dir, 'voice.marked.wav');
  const out = path.join(dir, `watermarked${ext}`);
  const ff = (args) => spawnSync('ffmpeg', ['-loglevel', 'error', '-y', ...args], { encoding: 'utf8', timeout: 600_000 });
  let r = ff(['-i', file, '-vn', '-ac', '2', '-ar', '48000', wavIn]);
  if (r.status !== 0) return { ok: false, backend: st.backend, reason: `ffmpeg: ${String(r.stderr).trim().slice(0, 200)}` };
  r = spawnSync(st.bin, ['add', wavIn, wavOut, payload], { encoding: 'utf8', timeout: 600_000 });
  if (r.status !== 0 || !fs.existsSync(wavOut)) return { ok: false, backend: st.backend, reason: `${st.bin}: ${String(r.stderr || r.error?.message || '').trim().slice(0, 200)}` };
  if (ext === '.wav') {
    fs.copyFileSync(wavOut, out);
  } else {
    const codec = ext === '.mp3' ? ['-c:a', 'libmp3lame', '-b:a', '192k'] : ['-c:a', 'aac', '-b:a', '192k'];
    r = ff(['-i', file, '-i', wavOut, '-map', '0:v?', '-map', '1:a', '-c:v', 'copy', ...codec, '-movflags', '+faststart', out]);
    if (r.status !== 0) return { ok: false, backend: st.backend, reason: `ffmpeg mux: ${String(r.stderr).trim().slice(0, 200)}` };
  }
  return { ok: true, path: out, backend: st.backend, payload };
}
