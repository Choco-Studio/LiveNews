// A V8 heap snapshot (CDP HeapProfiler.takeHeapSnapshot) summed up: objects by constructor name (count, self size),
// the detached DOM nodes by name, and the totals; and the difference between two summaries, largest growth first.
// The full snapshot is never kept (a hundred megabytes and more); the summary is a few kilobytes.

export function summariseSnapshot(snap) {
  const meta = snap.snapshot.meta;
  const F = meta.node_fields;
  const types = meta.node_types[0];
  const nf = F.length;
  const iType = F.indexOf('type');
  const iName = F.indexOf('name');
  const iSize = F.indexOf('self_size');
  const iDet = F.indexOf('detachedness');
  const { nodes, strings } = snap;
  const by = new Map();
  const detached = new Map();
  let total = 0;
  let count = 0;
  for (let i = 0; i < nodes.length; i += nf) {
    const type = types[nodes[i + iType]];
    const size = nodes[i + iSize];
    total += size;
    count++;
    if (type !== 'object' && type !== 'native' && type !== 'closure' && type !== 'array') continue;
    let name = strings[nodes[i + iName]];
    if (type === 'closure') name = `(closure) ${name}`;
    else if (type === 'array') name = `(array) ${name}`;
    // names that carry an instance's text ("system / Context", a URL): kept to their first word
    if (name.length > 80) name = name.slice(0, 80);
    const o = by.get(name) || { count: 0, size: 0 };
    o.count++;
    o.size += size;
    by.set(name, o);
    const det = iDet >= 0 ? nodes[i + iDet] : 0;
    if (det === 2 || name.startsWith('Detached ')) {
      const n = name.replace(/^Detached /, '');
      const d = detached.get(n) || { count: 0, size: 0 };
      d.count++;
      d.size += size;
      detached.set(n, d);
    }
  }
  const top = [...by.entries()].filter(([, v]) => v.count >= 5 || v.size > 65536).map(([name, v]) => ({ name, ...v }));
  top.sort((a, b) => b.size - a.size);
  return {
    totalMB: +(total / 1048576).toFixed(2),
    objects: count,
    detached: Object.fromEntries([...detached.entries()].sort((a, b) => b[1].count - a[1].count)),
    detachedCount: [...detached.values()].reduce((a, b) => a + b.count, 0),
    byName: top.slice(0, 1500),
  };
}

/** The constructors that grew most between two summaries (by count), with their change in size. */
export function diffSummaries(a, b, n = 30) {
  const A = new Map(a.byName.map((x) => [x.name, x]));
  const B = new Map(b.byName.map((x) => [x.name, x]));
  const names = new Set([...A.keys(), ...B.keys()]);
  const out = [];
  for (const name of names) {
    const x = A.get(name) || { count: 0, size: 0 };
    const y = B.get(name) || { count: 0, size: 0 };
    if (y.count === x.count && y.size === x.size) continue;
    out.push({ name, dCount: y.count - x.count, dKB: Math.round((y.size - x.size) / 1024), count: y.count });
  }
  out.sort((p, q) => q.dCount - p.dCount);
  return out.slice(0, n);
}
