// Lo-fi newsroom proposal: AudioParam automation that can interrupt itself at
// any time. Chromium only continues smoothly from cancelAndHoldAtTime() with
// setTargetAtTime(): a linear or exponential ramp after a hold that cut a
// running setTarget jumps (measured in the lab: a 0.66 step, heard as a click).
// So every "ramp" here is a target approach that gets within ~5% after `dur`.

export function holdAt(param, t) {
  if (typeof param.cancelAndHoldAtTime === 'function') param.cancelAndHoldAtTime(t);
  else {
    param.cancelScheduledValues(t);
    param.setValueAtTime(param.value, t);
  }
}

export function targetTo(param, v, t, tc) {
  holdAt(param, t);
  param.setTargetAtTime(v, t, Math.max(0.002, tc));
}

export function rampTo(param, v, t, dur) {
  targetTo(param, v, t, Math.max(0.005, dur) / 3);
}

export const dbToGain = (db) => 10 ** (db / 20);
