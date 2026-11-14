// ADSR envelope: Attack, Decay, Sustain, Release.
//
//   level
//     ^     /\
//     |    /  \_________          A: time to rise to the peak after note-on
//     |   /             \         D: time to fall to the sustain level
//     |  /               \        S: level held while the key stays down (0..1 of peak)
//     | /                 \       R: time to fade back after note-off
//     +----------------------> time
//       A  D     S        R
//
// An envelope does not make sound: it moves an AudioParam over time. On the amp gain it
// shapes the volume; on the filter detune it opens and closes the filter.

const Envelope = {
  // Note-on: go from `base` up to `base + peak`, then settle at `base + peak * sustain`.
  start(param, t, env, peak, base = 0) {
    param.cancelScheduledValues(t);
    param.setValueAtTime(base, t);
    param.linearRampToValueAtTime(base + peak, t + env.attack);
    // setTargetAtTime approaches its target exponentially, like an analog circuit:
    // after one "time constant" it has covered ~63% of the way, after 4 about 98%.
    // So a time constant of decay/4 means "basically there" after `decay` seconds.
    param.setTargetAtTime(base + peak * env.sustain, t + env.attack, env.decay / 4);
  },

  // Note-off: from wherever the param is right now, fall back to `base`.
  // Returns the time after which the sound is inaudible, so the caller can stop it.
  release(param, t, env, base = 0) {
    holdAt(param, t);
    param.setTargetAtTime(base, t, env.release / 4);
    return t + env.release * 1.25; // 5 time constants: below 1% of the level
  },
};
