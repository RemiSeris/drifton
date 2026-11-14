// One oscillator layer of a voice, with unison.
//
// Unison = several copies of the same oscillator played together, each slightly
// detuned and placed at a different point in the stereo field:
//
//   copy 1  -14 ct  ── pan left  ─┐
//   copy 2   -7 ct  ── pan ...   ─┤
//   copy 3    0 ct  ── center    ─┼──> level ──> out
//   copy 4   +7 ct  ── pan ...   ─┤
//   copy 5  +14 ct  ── pan right ─┘
//
// The tiny pitch differences make the copies drift in and out of phase, which gives the
// thick, moving "supersaw" sound of Serum-style pads. A cent is 1/100 of a semitone.

class OscLayer {
  constructor(ctx, p, prefix, freq, t, out) {
    this.ctx = ctx;
    this.prefix = prefix;
    this.level = ctx.createGain();
    this.level.connect(out);
    this.oscs = [];
    this.pans = [];

    const n = p[`${prefix}.unison`];
    for (let i = 0; i < n; i++) {
      const osc = ctx.createOscillator();
      const pan = ctx.createStereoPanner();
      osc.type = p[`${prefix}.wave`];
      osc.frequency.value = freq;
      osc.connect(pan);
      pan.connect(this.level);
      // Web Audio oscillators always start at phase 0, so identical copies would add up
      // into one loud click. Starting each one a random fraction of a cycle late gives
      // them random phases, like Serum's "random phase" switch.
      osc.start(t + Math.random() / freq);
      this.oscs.push(osc);
      this.pans.push(pan);
    }
    this.update(p, false);
  }

  // Position of copy i in the stack, from -1 (first) to +1 (last); 0 if alone.
  position(i) {
    const n = this.oscs.length;
    return n === 1 ? 0 : (i / (n - 1)) * 2 - 1;
  }

  // Apply the current patch values (called again whenever a slider moves).
  update(p, smooth) {
    const pre = this.prefix;
    const n = this.oscs.length;
    // Octave, semitones and fine tuning are all expressed in cents and summed.
    const pitch = p[`${pre}.octave`] * 1200 + p[`${pre}.semi`] * 100 + p[`${pre}.fine`];

    this.oscs.forEach((osc, i) => {
      const pos = this.position(i);
      if (osc.type !== p[`${pre}.wave`]) osc.type = p[`${pre}.wave`];
      setParam(this.ctx, osc.detune, pitch + pos * p[`${pre}.spread`], smooth);
      setParam(this.ctx, this.pans[i].pan, pos * p[`${pre}.width`], smooth);
    });

    // n copies summed get louder; dividing by sqrt(n) keeps the perceived level steady.
    setParam(this.ctx, this.level.gain, p[`${pre}.level`] / Math.sqrt(n), smooth);
  }

  stop(t) {
    for (const osc of this.oscs) osc.stop(t);
  }
}
