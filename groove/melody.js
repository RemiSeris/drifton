// Melody: the computer keyboard becomes an instrument, always in the groove's scale.
//
//   top row     (AZERTY: A Z E R T Y U I O P)  = the same notes, one octave higher
//   middle row  (AZERTY: Q S D F G H J K L M)  = 10 notes of the scale, from the root up
//
// Keys are read by their physical place (`e.code`: KeyA, KeyS…), so the rows are the same
// on every keyboard; only the letters printed on them differ. Because every key is a
// note of the current scale, there is no wrong note: you can only choose where to go.
// When the groove changes key or mode (dub is minor, bossa major), the same keys follow.
//
// A note sounds while its key is held (noteOn on press, noteOff on release), and the
// notes played are logged for the stage and the on-screen keyboard.

const MELODY_ROWS = [
  ["KeyA", "KeyS", "KeyD", "KeyF", "KeyG", "KeyH", "KeyJ", "KeyK", "KeyL", "Semicolon"], // middle
  ["KeyQ", "KeyW", "KeyE", "KeyR", "KeyT", "KeyY", "KeyU", "KeyI", "KeyO", "KeyP"],      // top
];

// Letters printed on those keys, for keyboards that only report the character, and for
// the labels on screen.
const MELODY_LETTERS = {
  azerty: ["qsdfghjklm", "azertyuiop"],
  qwerty: ["asdfghjkl;", "qwertyuiop"],
};

class Melody {
  constructor(ctx, synth, harmony) {
    this.ctx = ctx;
    this.synth = synth;
    this.harmony = harmony;
    this.octave = 0;        // shift in octaves (↑ ↓)
    this.down = new Map();  // code → MIDI note, for the keys held right now
    this.log = [];          // { midi, t, end } for the display
  }

  // Row and position of a key, or null if it is not a melody key.
  place(code) {
    for (let r = 0; r < 2; r++) {
      const i = MELODY_ROWS[r].indexOf(code);
      if (i >= 0) return { r, i };
    }
    return null;
  }

  // The MIDI note of a key: step i of the scale from the root (top row: +1 octave).
  // The root sits between middle C and the B above, so the melody stays above the keys.
  noteFor(code) {
    const p = this.place(code);
    if (!p) return null;
    const h = this.harmony;
    const step = p.i;
    const base = 60 + h.root + 12 * (this.octave + p.r);
    return base + 12 * Math.floor(step / 7) + h.scale[step % 7];
  }

  // `t` defaults to now (live); a time can be given to schedule (tests, recordings).
  press(code, velocity = 0.8, t = this.ctx.currentTime) {
    if (this.down.has(code)) return;
    const midi = this.noteFor(code);
    if (midi === null) return;
    this.synth.noteOn(midi, velocity, t);
    this.down.set(code, midi);
    this.log.push({ midi, t, end: Infinity, code });
    if (this.log.length > 64) this.log.shift();
  }

  release(code, t = this.ctx.currentTime) {
    if (!this.down.has(code)) return;
    const midi = this.down.get(code);
    this.down.delete(code);
    // The same note can be held on two keys (top row = middle row + 1 octave overlaps):
    // only stop it when no key holds it any more.
    if ([...this.down.values()].includes(midi)) return;
    this.synth.noteOff(midi, t);
    for (const n of this.log) if (n.code === code && n.end === Infinity) n.end = t;
  }

  releaseAll() {
    for (const code of [...this.down.keys()]) this.release(code);
  }
}
