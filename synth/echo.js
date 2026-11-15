// Echo: a tape-style delay, the signature effect of dub.
//
//   send ──> delay ──┬──> output
//              ^     │
//              └─ high cut ← low cut ← feedback gain
//
// Each repeat goes back through the loop, a little quieter (feedback) and a little
// duller (the filters), like an old tape echo: the repeats melt away instead of piling
// up. Unlike a reverb, an echo repeats the hit itself, so a snare stays a snare and
// never turns into a cymbal-like wash.
//
// The delay time follows the tempo (setBeats). Changing it while repeats are still in
// the loop makes them bend in pitch for a moment: on a real tape echo that warble is
// part of the fun, so we let it happen, smoothly.

class Echo {
  constructor(ctx) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.delay = ctx.createDelay(4);
    this.delay.delayTime.value = 0.5;
    this.feedback = ctx.createGain();
    this.feedback.gain.value = 0.55;
    this.lowcut = ctx.createBiquadFilter();
    this.lowcut.type = "highpass";
    this.lowcut.frequency.value = 300;
    this.highcut = ctx.createBiquadFilter();
    this.highcut.type = "lowpass";
    this.highcut.frequency.value = 2200;

    this.input.connect(this.delay);
    this.delay.connect(this.output);
    this.delay.connect(this.feedback);
    this.feedback.connect(this.lowcut);
    this.lowcut.connect(this.highcut);
    this.highcut.connect(this.delay);
  }

  // Delay time in beats (quarter notes) at a given tempo: 0.75 = a dotted eighth.
  setBeats(beats, bpm) {
    const seconds = Math.min(3.9, (60 / bpm) * beats);
    this.delay.delayTime.setTargetAtTime(seconds, this.ctx.currentTime, 0.05);
  }
}
