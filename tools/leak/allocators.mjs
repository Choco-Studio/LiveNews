// Chromium's own account of a process's memory, by allocator: a memory-infra dump (CDP Tracing.requestMemoryDump,
// the data behind chrome://tracing's memory view) summed up per process: malloc, PartitionAlloc's partitions (array
// buffers, layout, strings and buffers, Blink's fast malloc), Blink's garbage-collected heap, V8, Skia, the compositor,
// discardable memory (the decoded-image cache lives there), the web and font caches, canvases' resource providers,
// media, the GPU's shared images. What RSS alone cannot say: which of them grows.
//
//   const dump = await allocatorDump(browserCdp)   -> { [pid]: { label, allocators: { name: MB } } }
//   rendererOf(dump)                                -> the page's renderer's entry (the one with the largest Blink heap)
// (the dumps nest: malloc holds what canvas/ResourceProvider names, for one; compare one name over time, never add them)

const MB = 1048576;
// the top-level dumps worth naming, and the partitions and caches under them
const KEEP = [
  /^malloc$/, /^malloc\/allocated_objects$/, /^partition_alloc$/, /^partition_alloc\/partitions\/[^/]+$/, /^blink_gc$/, /^blink_objects$/,
  /^v8$/, /^v8\/main\/heap$/, /^skia$/, /^skia\/sk_glyph_cache$/, /^skia\/sk_resource_cache$/, /^cc$/, /^discardable$/, /^web_cache$/,
  /^web_cache\/[^/]+$/, /^font_caches$/, /^canvas$/, /^canvas\/ResourceProvider$/, /^media$/, /^gpu$/, /^shared_memory$/, /^shared_image$/,
  /^java_heap$/, /^mojo$/, /^tracing$/, /^audio$/, /^site_storage$/, /^blink_gc\/main\/heap$/,
];

const sizeOf = (d) => {
  const s = d?.attrs?.size;
  if (!s) return 0;
  return typeof s.value === 'string' ? parseInt(s.value, 16) : Number(s.value) || 0;
};

/** One memory-infra dump of every process, by allocator (MB). `cdp` a browser-level CDP session. */
export async function allocatorDump(cdp) {
  const events = [];
  const onData = ({ value }) => events.push(...value);
  cdp.on('Tracing.dataCollected', onData);
  const complete = new Promise((resolve) => cdp.once('Tracing.tracingComplete', resolve));
  try {
    await cdp.send('Tracing.start', {
      transferMode: 'ReportEvents',
      traceConfig: { includedCategories: ['disabled-by-default-memory-infra'], excludedCategories: ['*'], memoryDumpConfig: { triggers: [] } },
    });
    await cdp.send('Tracing.requestMemoryDump', { deterministic: true, levelOfDetail: 'detailed' });
  } finally {
    await cdp.send('Tracing.end').catch(() => {});
    await complete;
    cdp.off('Tracing.dataCollected', onData);
  }
  const labels = {};
  for (const e of events) if (e.ph === 'M' && (e.name === 'process_name' || e.name === 'process_labels')) labels[e.pid] = [labels[e.pid], e.args?.name || e.args?.labels].filter(Boolean).join(' ');
  const out = {};
  for (const e of events) {
    const allocators = e.ph === 'v' ? e.args?.dumps?.allocators : null;
    if (!allocators) continue;
    const row = (out[e.pid] = out[e.pid] || { label: labels[e.pid] || '', allocators: {} });
    for (const [name, d] of Object.entries(allocators)) {
      if (!KEEP.some((re) => re.test(name))) continue;
      row.allocators[name] = +(sizeOf(d) / MB).toFixed(1);
    }
  }
  return out;
}

/** The page's renderer in a dump: the process with the largest Blink heap. */
export function rendererOf(dump) {
  let best = null;
  for (const [pid, row] of Object.entries(dump)) {
    const blink = row.allocators.blink_gc || 0;
    if (!best || blink > (best.allocators.blink_gc || 0)) best = { pid: Number(pid), ...row };
  }
  return best;
}
