// Small helpers shared by every building block of the synth.

// MIDI note number → frequency in Hz.
// Note 69 is A4 = 440 Hz, and each semitone multiplies the frequency by 2^(1/12).
function midiToFreq(note) {
  return 440 * Math.pow(2, (note - 69) / 12);
}

// MIDI note number → name, e.g. 60 → "C4".
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
function noteName(note) {
  return NOTE_NAMES[note % 12] + (Math.floor(note / 12) - 1);
}

// Set an AudioParam (a gain, a frequency, a detune…).
// When `smooth` is true we glide to the new value over a few milliseconds instead of
// jumping: an instant jump in gain or frequency makes an audible click ("zipper noise").
function setParam(ctx, param, value, smooth) {
  if (smooth) param.setTargetAtTime(value, ctx.currentTime, 0.015);
  else param.value = value;
}

// Freeze an AudioParam at whatever value it has at time t, dropping later automation.
// Needed when a note is released halfway through its attack: the release must start
// from where the sound currently is, not from where the attack was heading.
function holdAt(param, t) {
  if (param.cancelAndHoldAtTime) {
    param.cancelAndHoldAtTime(t);
  } else {
    // Firefox has no cancelAndHoldAtTime: read the current value and pin it.
    const v = param.value;
    param.cancelScheduledValues(t);
    param.setValueAtTime(v, t);
  }
}
