// Instrument: one playable sound that can use any of the three engines.
//
//   engine "sub"   = Synth (synth.js): oscillators → filter → envelopes (subtractive)
//   engine "fm"    = FMSynth (fm.js): electric pianos, bells, marimba, brass
//   engine "pluck" = PluckSynth (pluck.js): clavinet, guitar, harp, piano
//
//   active engine ──> volume (yours, e.g. the melody volume slider) ──> MasterBus
//
// A preset says which engine it wants ({ engine: "fm", ... }); loadPatch switches.
// A note is always released by the engine that started it, so switching instrument
// while a note rings doesn't leave it hanging.
// The engines' own "volume"/"level" is the preset's balance; this.volume is yours.

class Instrument {
  constructor(ctx, destination, send) {
    this.ctx = ctx;
    this.volume = ctx.createGain();
    this.volume.connect(destination);
    this.engines = {
      sub: new Synth(ctx, { ...defaultParams(), volume: 1 }, this.volume, send),
      fm: new FMSynth(ctx, this.volume, send),
      pluck: new PluckSynth(ctx, this.volume, send),
    };
    this.engine = this.engines.sub;
    this.patch = {};
    this.held = new Map(); // note → engine that plays it
  }

  loadPatch(patch) {
    const name = patch.engine || "sub";
    const engine = this.engines[name];
    this.patch = { ...patch };
    if (name === "sub") engine.loadPatch({ ...defaultParams(), ...patch, volume: patch.level ?? 1 });
    else engine.loadPatch(patch);
    this.engine = engine;
  }

  // The preset playing now (for copies, e.g. a loop layer), with your volume.
  get params() { return { ...this.patch, volume: this.volume.gain.value }; }

  set(key, value) {
    if (key === "volume") setParam(this.ctx, this.volume.gain, value, true);
    else { this.patch[key] = value; this.engine.set(key, value); }
  }

  noteOn(note, velocity = 0.8, t = this.ctx.currentTime) {
    const prev = this.held.get(note);
    if (prev && prev !== this.engine) prev.noteOff(note, t);
    this.held.set(note, this.engine);
    this.engine.noteOn(note, velocity, t);
  }

  noteOff(note, t = this.ctx.currentTime) {
    const e = this.held.get(note) || this.engine;
    this.held.delete(note);
    e.noteOff(note, t);
  }

  allOff() {
    for (const e of Object.values(this.engines)) e.allOff();
    this.held.clear();
  }

  // A new instrument with the same preset and volume (for loop layers).
  clone(destination, send) {
    const c = new Instrument(this.ctx, destination, send);
    c.loadPatch(this.patch);
    c.volume.gain.value = this.volume.gain.value;
    return c;
  }
}
