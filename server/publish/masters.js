// Rendered masters: the hook for the pre-rendered playout (another desk renders programmes ahead of air with a virtual
// clock). When it has already rendered a programme for the factory, the factory cuts that master instead of recording
// the programme again (docs/publishing/pipeline.md §8, clips.md §1). This desk does not render anything here.
//
// The contract, one folder per episode under any of the roots (RENDERED_MASTERS, a list of folders separated by ':',
// or beta.mjs --masters-from):
//   <root>/<episode id>/<format>.mkv            the master: the episode in clip mode (?clip=1, &format=vertical for 9:16),
//                                               at the channel's 1x (384x216 or 216x384), 30 fps, lossless or near it
//   <root>/<episode id>/<format>.report.json    tools/record.mjs --report's report of that same run (the timeline, the
//                                               speech and the voice clips the factory reads)
// Both must be there, and the report must name 30 fps and say how long it is; anything else is ignored and the factory
// records as before.
//
//   masterRoots(env, extra)                       the roots to look in
//   renderedMaster(episode, format, roots)        -> { file, report, root } | null
//   useRenderedMaster(episode, format, roots, mastersDir, prog) -> the factory's master names in mastersDir, linked to
//       the rendered files (`<prog>-<format>.mkv`, `.report.json`: factory.mjs keeps a master it finds there), or null
import fs from 'node:fs';
import path from 'node:path';

export const FORMATS = Object.freeze(['vertical', 'horizontal']);

export function masterRoots(env = process.env, extra = []) {
  const fromEnv = String(env?.RENDERED_MASTERS || '').split(':').map((s) => s.trim()).filter(Boolean);
  return [...new Set([...extra.filter(Boolean), ...fromEnv].map((r) => path.resolve(r)))];
}

/** The rendered master of an episode in a format, when the playout has made one (both files, a sane report). */
export function renderedMaster(episode, format, roots = masterRoots()) {
  const id = String(episode?.id || '');
  if (!/^[a-z0-9_-]{1,80}$/i.test(id) || !FORMATS.includes(format)) return null;
  for (const root of roots) {
    const dir = path.join(root, id);
    const file = path.join(dir, `${format}.mkv`);
    const report = path.join(dir, `${format}.report.json`);
    if (!fs.existsSync(file) || !fs.existsSync(report)) continue;
    try {
      const r = JSON.parse(fs.readFileSync(report, 'utf8'));
      if (Number(r.fps) !== 30 || !(Number(r.seconds) > 0)) continue;
    } catch {
      continue;
    }
    return { file, report, root };
  }
  return null;
}

/**
 * Put the rendered master where the factory looks for a kept one (`--masters <dir>`), as links (a copy where links are
 * refused). The factory then says "master: kept" and cuts it; it removes only the link afterwards.
 */
export function useRenderedMaster(episode, format, roots, mastersDir, prog = episode?.program?.id || 'programme') {
  const found = renderedMaster(episode, format, roots);
  if (!found) return null;
  fs.mkdirSync(mastersDir, { recursive: true });
  for (const [src, dst] of [[found.file, path.join(mastersDir, `${prog}-${format}.mkv`)], [found.report, path.join(mastersDir, `${prog}-${format}.report.json`)]]) {
    fs.rmSync(dst, { force: true });
    try {
      fs.symlinkSync(src, dst);
    } catch {
      fs.copyFileSync(src, dst);
    }
  }
  return found;
}
