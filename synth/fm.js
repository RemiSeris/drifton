// FM synth: frequency modulation, the sound of 80s electric pianos, bells and marimbas.
//
//   modulator 1 ──┐
//                 ├──> carrier frequency ──> carrier ──> amp envelope ──> tremolo ──> volume
//   modulator 2 ──┘
//
// A modulator is an oscillator that wobbles the carrier's pitch so fast that we don't
// hear a wobble but new partials (overtones). How many and how loud depends on the
// "index" (how far it pushes the pitch) and the "ratio" (modulator frequency / carrier
// frequency): whole ratios (1, 2, 14) give harmonic, piano-like tones; odd ones (3.5)
// give bell-like, inharmonic tones.
// The magic of FM is that the index has its own envelope: a bright attack that mellows
// as it decays, which is what real struck or plucked things do.
// Velocity changes the index, not only the volume: hit harder, the sound gets brighter.
//
// Patch keys (all optional, see FM_DEFAULTS):
//   m1.ratio, m1.index, m1.attack, m1.decay, m1.sustain   modulator 1 (the "body")
//   m2.ratio, m2.index, m2.decay                          modulator 2 (a short "click")
//   attack, decay, sustain, release                       carrier amplitude
//   velBright (0–1: how much velocity changes brightness), tremolo, tremRate, level,
//   detune (cents, a second carrier for a chorus-like width), fx.reverb

const FM_DEFAULTS = {
  "m1.ratio": 1, "m1.index": 1.5, "m1.attack": 0.002, "m1.decay": 0.8, "m1.sustain": 0.3,
  "m2.ratio": 14, "m2.index": 0, "m2.decay": 0.08,
  attack: 0.002, decay: 1.5, sustain: 0.2, release: 0.4,
  velBright: 0.7, tremolo: 0, tremRate: 4.5, detune: 0, level: 1, "fx.reverb": 0.3,
};

class FMSynth {
  constructor(ctx, destination, send) {
    this.ctx = ctx;
    this.params = { ...FM_DEFAULTS };
    this.voices = new Map(); // note → voice
    this.maxVoices = 10;
    // Tremolo: a slow LFO on a shared gain (the electric piano's "wah-wah" in stereo
    // is a pan; here it is the simpler amplitude version).
    this.bus = ctx.createGain();
    this.trem = ctx.createOscillator();
    this.tremDepth = ctx.createGain();
    this.trem.connect(this.tremDepth);
    this.tremDepth.connect(this.bus.gain);
    this.trem.start();
    this.volume = ctx.createGain();
    this.bus.connect(this.volume);
    this.volume.connect(destination);
    this.reverbSend = ctx.createGain();
    this.volume.connect(this.reverbSend);
    if (send) this.reverbSend.connect(send);
    this.apply();
  }

  loadPatch(patch) { this.params = { ...FM_DEFAULTS, ...patch }; this.apply(); }
  set(key, value) { this.params[key] = value; this.apply(); }

  apply() {
    const P = this.params;
    setParam(this.ctx, this.volume.gain, P.level, true);
    setParam(this.ctx, this.reverbSend.gain, P["fx.reverb"], true);
    this.trem.frequency.value = P.tremRate;
    // bus gain = 1 - depth/2 + (depth/2) * lfo: swings between 1 - depth and 1.
    this.bus.gain.value = 1 - P.tremolo / 2;
    this.tremDepth.gain.value = P.tremolo / 2;
  }

  noteOn(note, velocity = 0.8, t = this.ctx.currentTime) {
    this.noteOff(note, t);
    if (this.voices.size >= this.maxVoices) {
      const oldest = this.voices.keys().next().value;
      this.noteOff(oldest, t, 0.03);
    }
    const P = this.params;
    const ctx = this.ctx;
    const f = midiToFreq(note);
    const bright = 1 - P.velBright + P.velBright * velocity;
    const amp = ctx.createGain();
    amp.gain.value = 0;
    amp.connect(this.bus);

    const carriers = [0, P.detune].filter((d, k) => k === 0 || d).map((cents) => {
      const c = ctx.createOscillator();
      c.frequency.value = f * Math.pow(2, cents / 1200);
      c.connect(amp);
      return c;
    });
    const nodes = [...carriers];

    // Modulator 1: the body of the tone; its index rises (attack) then settles (sustain).
    const mod = (ratio, index, attack, decay, sustain) => {
      if (!index) return;
      const m = ctx.createOscillator();
      m.frequency.value = f * ratio;
      const depth = ctx.createGain();
      const peak = index * f * ratio * bright; // deviation in Hz = index × modulator freq
      depth.gain.setValueAtTime(0, t);
      depth.gain.linearRampToValueAtTime(peak, t + attack);
      depth.gain.setTargetAtTime(peak * sustain, t + attack, decay / 3);
      m.connect(depth);
      for (const c of carriers) depth.connect(c.frequency);
      nodes.push(m);
    };
    mod(P["m1.ratio"], P["m1.index"], P["m1.attack"], P["m1.decay"], P["m1.sustain"]);
    mod(P["m2.ratio"], P["m2.index"], 0.001, P["m2.decay"], 0);

    // Amplitude: a velocity curve (soft notes are not just quieter, they are gentler).
    const peak = (0.12 + 0.18 * velocity) / carriers.length;
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(peak, t + P.attack);
    amp.gain.setTargetAtTime(peak * P.sustain, t + P.attack, P.decay / 3);
    for (const n of nodes) n.start(t);
    this.voices.set(note, { amp, nodes });
  }

  noteOff(note, t = this.ctx.currentTime, release = this.params.release) {
    const v = this.voices.get(note);
    if (!v) return;
    this.voices.delete(note);
    holdAt(v.amp.gain, t);
    v.amp.gain.setTargetAtTime(0, t, release / 4);
    const end = t + release * 1.6 + 0.05;
    for (const n of v.nodes) n.stop(end);
    v.nodes[0].onended = () => v.amp.disconnect();
  }

  allOff() {
    for (const note of [...this.voices.keys()]) this.noteOff(note, this.ctx.currentTime, 0.05);
  }
}
