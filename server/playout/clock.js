// The air clock (docs/publishing/playout.md §2): in pre-rendered playout the station lives at the time its programmes
// will AIR, not at the time they are made. The renderer (tools/playout/render.mjs) plays the viewer's part, faster or
// slower than real time, and tells the station what time it is on air; everything the station decides by the clock
// (NEWS IN 60 on its :00 and :30 marks, the dayparts, the countdown before a pinned programme) and everything the
// writers say by it ("good evening", "this morning", the weather's "now", what a sport bulletin calls last night)
// then reads for the moment it airs. The page's own clock (the on-screen clock, the studio sky) is the recorder's fake
// clock, set to the same air time.
//
//   const clock = createAirClock({ cap: 60_000 });
//   clock.set(airMs)      the renderer's word: it is airMs on air now
//   clock.now()           the air time: the last word, run on at real speed for at most `cap` ms (so a production
//                         budget measured on the clock still runs out while the renderer waits for it, and the
//                         clock never wanders far past the moment being rendered while the renderer idles)
//   clock.lead()          how far the air time is ahead of real time (ms)
//   installAirClock(clock) the process's Date reads the air clock (new Date(), Date.now(); Date.parse and
//                         Date.UTC unchanged). Returns uninstall(). Only tools/playout/station.mjs installs it.

const RealDate = globalThis.Date;

export function createAirClock({ realNow = () => RealDate.now(), cap = 60_000, start = null } = {}) {
  let base = Number.isFinite(start) ? start : realNow();
  let realAt = realNow();
  const clock = {
    cap,
    realNow,
    now() {
      const run = Math.min(Math.max(0, realNow() - realAt), clock.cap);
      return Math.round(base + run);
    },
    set(t) {
      const v = Number(t);
      if (!Number.isFinite(v)) return false;
      base = v;
      realAt = realNow();
      return true;
    },
    lead() {
      return clock.now() - realNow();
    },
    state() {
      return { air: clock.now(), real: realNow(), lead: clock.lead(), cap: clock.cap };
    },
  };
  return clock;
}

/** The process's Date on the air clock. Returns a function that puts the real Date back. */
export function installAirClock(clock) {
  class AirDate extends RealDate {
    constructor(...a) {
      if (a.length) super(...a);
      else super(clock.now());
    }
    static now() {
      return clock.now();
    }
  }
  // (Date() called as a function returns the time as a string)
  const Callable = new Proxy(AirDate, {
    apply: () => new AirDate().toString(),
  });
  globalThis.Date = Callable;
  globalThis.__airClock = clock;
  return () => {
    globalThis.Date = RealDate;
    delete globalThis.__airClock;
  };
}

/** The real time, whatever the process's Date reads (the playout's own logs and the buffer's measure). */
export const realNow = () => RealDate.now();
export { RealDate };
