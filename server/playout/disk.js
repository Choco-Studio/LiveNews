// The playout's disk policy (docs/publishing/playout.md §8): keep the buffer (everything not yet aired) and a short
// tail of what aired; delete an aired air file after `airedHours`; keep a programme's clip-mode master for the
// publishing desk until the clip factory has cut it (its folder holds factory.json), or until `masterHours` have passed
// since it aired (0: until cut, however long); keep a held unit's files `heldHours` for a look on the approval page.
// Pure: it plans, tools/playout/render.mjs deletes (and logs each deletion).
//
//   diskPlan({ aired, held, masters, now, policy }) -> [{ path, kind, reason }]
//     aired:   [{ id, airAt, frames, fps, file }]          segments the playout has aired or dropped
//     held:    [{ id, heldAt, files: [paths] }]            units the gate held
//     masters: [{ dir, airEnd, cut }]                      clip-mode masters (one folder per programme)

export const DISK_DEFAULTS = Object.freeze({
  airedHours: 2, // PLAYOUT_KEEP_AIRED_H
  heldHours: 24, // PLAYOUT_KEEP_HELD_H
  masterHours: 48, // PLAYOUT_KEEP_MASTER_H (0: until the factory has cut it)
  cutGraceHours: 1, // a cut master stays this long after the cut (the factory may run a second format)
});

const H = 3600_000;

export function diskPlan({ aired = [], held = [], masters = [], now = Date.now(), policy = {} } = {}) {
  const p = { ...DISK_DEFAULTS, ...policy };
  const out = [];
  for (const s of aired) {
    if (!s?.file) continue;
    const end = s.airAt + ((s.frames || 0) / (s.fps || 30)) * 1000;
    if (now - end >= p.airedHours * H) out.push({ path: s.file, kind: 'aired', id: s.id, reason: `aired ${((now - end) / H).toFixed(1)} h ago (keep ${p.airedHours} h)` });
  }
  for (const u of held) {
    const at = Number(u?.heldAt) || 0;
    if (!at || now - at < p.heldHours * H) continue;
    for (const f of u.files || []) out.push({ path: f, kind: 'held', id: u.id, reason: `held ${((now - at) / H).toFixed(1)} h ago (keep ${p.heldHours} h)` });
  }
  for (const m of masters) {
    if (!m?.dir || !Number.isFinite(m.airEnd)) continue;
    if (m.airEnd > now) continue; // not aired yet: part of the buffer
    if (m.cut) {
      const cutAt = Number(m.cutAt) || m.airEnd;
      if (now - cutAt >= p.cutGraceHours * H) out.push({ path: m.dir, kind: 'master', reason: 'cut by the clip factory' });
      continue;
    }
    if (p.masterHours > 0 && now - m.airEnd >= p.masterHours * H) out.push({ path: m.dir, kind: 'master', reason: `never cut, aired ${((now - m.airEnd) / H).toFixed(1)} h ago (keep ${p.masterHours} h)` });
  }
  return out;
}

/** The policy from the environment (hours; a bad value keeps the default). */
export function diskPolicyFromEnv(env = process.env) {
  const num = (k, d) => {
    const n = Number(env[k]);
    return env[k] !== undefined && env[k] !== '' && Number.isFinite(n) && n >= 0 ? n : d;
  };
  return {
    airedHours: num('PLAYOUT_KEEP_AIRED_H', DISK_DEFAULTS.airedHours),
    heldHours: num('PLAYOUT_KEEP_HELD_H', DISK_DEFAULTS.heldHours),
    masterHours: num('PLAYOUT_KEEP_MASTER_H', DISK_DEFAULTS.masterHours),
    cutGraceHours: DISK_DEFAULTS.cutGraceHours,
  };
}
