// LFO = Low Frequency Oscillator: an oscillator far too slow to hear (0.01 – 20 Hz).
// Instead of making sound, its output (a value moving between -1 and +1) is plugged
// into a parameter to move it: a slow sine on the cutoff makes the sound "breathe",
// a fast one on the pitch is a vibrato, on the volume a tremolo.
//
// In Web Audio, any audio signal can be connected to an AudioParam. So an LFO is just
// a normal oscillator connected to a param instead of to the speakers:
//
//   LFO source ──> out ──> amount (gain) ──> filter.detune
//                     └──> amount (gain) ──> pan  ...
//
// Two shapes have no oscillator:
// - "Drift": glides smoothly to a new random value every period. It never repeats,
//   which is perfect for ambient (nothing the ear can learn and anticipate).
// - "S&H" (sample & hold): jumps to a new random value every period, a classic of
//   modular synths.
// Both drive a ConstantSourceNode (a node that outputs a constant value) whose value
// we schedule from JavaScript, a little ahead of time.

class LFO {
  constructor(ctx) {
    this.ctx = ctx;
    this.out = ctx.createGain(); // fixed output point: voices stay connected even when the shape changes
    this.meter = ctx.createAnalyser(); // only used to draw the LFO on the page
    this.meter.fftSize = 32;
    this.buf = new Float32Array(32);
    this.out.connect(this.meter);
    this.shape = null;
    this.rate = 1;
    this.src = null;
    this.timer = null;
  }

  set(shape, rate) {
    const rateChanged = rate !== this.rate;
    this.rate = rate;
    if (shape !== this.shape) return this.build(shape);
    if (!rateChanged) return;
    if (this.src instanceof OscillatorNode) setParam(this.ctx, this.src.frequency, rate, true);
    else this.restartRandom();
  }

  build(shape) {
    this.teardown();
    this.shape = shape;
    if (shape === "drift" || shape === "sh") {
      this.src = this.ctx.createConstantSource();
      this.src.offset.value = 0;
      this.src.connect(this.out);
      this.src.start();
      this.restartRandom();
      this.timer = setInterval(() => this.scheduleRandom(), 100);
    } else {
      this.src = this.ctx.createOscillator();
      this.src.type = shape;
      this.src.frequency.value = this.rate;
      this.src.connect(this.out);
      this.src.start();
    }
  }

  restartRandom() {
    const now = this.ctx.currentTime;
    holdAt(this.src.offset, now);
    this.next = now;
    this.scheduleRandom();
  }

  // Schedule the random values for the next second (called every 100 ms).
  scheduleRandom() {
    const until = this.ctx.currentTime + 1;
    const period = 1 / this.rate;
    const offset = this.src.offset;
    while (this.next < until) {
      const v = Math.random() * 2 - 1;
      if (this.shape === "drift") offset.setTargetAtTime(v, this.next, period / 3);
      else offset.setValueAtTime(v, this.next);
      this.next += period;
    }
  }

  teardown() {
    clearInterval(this.timer);
    this.timer = null;
    if (this.src) {
      this.src.stop();
      this.src.disconnect();
      this.src = null;
    }
  }

  // Current output value, for drawing.
  value() {
    this.meter.getFloatTimeDomainData(this.buf);
    return this.buf[this.buf.length - 1];
  }
}
