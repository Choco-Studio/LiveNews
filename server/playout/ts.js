// MPEG-TS just enough for the playout's relays (tools/playout/air.mjs): the encoder's stream cut into whole 188-byte
// packets, the latest PAT and PMT kept, and a relay that joins (or joins again) fed from the next video keyframe with
// those tables first, so its first picture is a whole one and nothing before it is undecodable.
//
//   new TsPackets()                    .push(chunk) -> Buffer of whole packets (the rest kept for the next chunk)
//   pidOf(packet)                      the packet's PID
//   isKeyStart(packet, videoPid)       a video packet that starts a keyframe (PUSI and the random access indicator)
//   new TsTables()                     .see(packets) keeps the last PAT (PID 0) and PMT; .prefix() -> Buffer of both
//   joinAt(packets, videoPid)          the offset of the first keyframe start in a run of packets, or -1
//
// ffmpeg's muxer: the PMT on PID 0x1000, the first stream (the video) on PID 0x100, the random access indicator on
// every keyframe's first packet; the encoder repeats SPS and PPS before every IDR (server/playout/encode.js).

export const TS = 188;
export const PMT_PID = 0x1000;
export const VIDEO_PID = 0x100;

export const pidOf = (p, o = 0) => ((p[o + 1] & 0x1f) << 8) | p[o + 2];

/** A video packet that starts a keyframe: PUSI set, an adaptation field with its random access indicator. */
export function isKeyStart(p, videoPid = VIDEO_PID, o = 0) {
  if (p[o] !== 0x47 || pidOf(p, o) !== videoPid || !(p[o + 1] & 0x40)) return false;
  const afc = (p[o + 3] >> 4) & 3;
  return (afc === 2 || afc === 3) && p[o + 4] > 0 && (p[o + 5] & 0x40) !== 0;
}

/** The offset of the first keyframe start in `buf` (whole packets), or -1. */
export function joinAt(buf, videoPid = VIDEO_PID) {
  for (let o = 0; o + TS <= buf.length; o += TS) if (isKeyStart(buf, videoPid, o)) return o;
  return -1;
}

/** The encoder's bytes in whole packets: what does not make a whole packet waits for the next chunk. */
export class TsPackets {
  constructor() {
    this.carry = Buffer.alloc(0);
  }
  push(chunk) {
    let buf = this.carry.length ? Buffer.concat([this.carry, chunk]) : chunk;
    // (resynchronise on the sync byte should the stream ever be cut mid-packet)
    if (buf.length && buf[0] !== 0x47) {
      const i = buf.indexOf(0x47);
      buf = i < 0 ? Buffer.alloc(0) : buf.subarray(i);
    }
    const n = buf.length - (buf.length % TS);
    this.carry = Buffer.from(buf.subarray(n));
    return buf.subarray(0, n);
  }
}

/** The last PAT and PMT seen, to put in front of a relay that joins mid-stream. */
export class TsTables {
  constructor(pmtPid = PMT_PID) {
    this.pmtPid = pmtPid;
    this.pat = null;
    this.pmt = null;
  }
  see(buf) {
    for (let o = 0; o + TS <= buf.length; o += TS) {
      const pid = pidOf(buf, o);
      if (pid === 0) this.pat = Buffer.from(buf.subarray(o, o + TS));
      else if (pid === this.pmtPid) this.pmt = Buffer.from(buf.subarray(o, o + TS));
    }
  }
  prefix() {
    return this.pat && this.pmt ? Buffer.concat([this.pat, this.pmt]) : null;
  }
}
