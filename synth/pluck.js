// Pluck synth: a plucked (or struck) string, computed with the Karplus-Strong algorithm.
//
// A string is a loop: a burst of noise (the pluck) goes round a delay line exactly one
// period long, and each time round it passes through a gentle low-pass and loses a bit
// of energy. The noise quickly turns into a tone (only what repeats at the period
// survives), bright at first and mellower as the low-pass eats the highs: a string.
//
//   noise burst ──> [ delay (one period) ──> low-pass ──> fine tuning ──> loss ] ─┐
//                       ^─────────────────────────────────────────────────────────┘
//
// - fine tuning: the delay line can only be a whole number of samples; a first-order
//   all-pass adds the missing fraction, so high notes are in tune
// - pick position: plucking a string at 1/5 of its length removes every 5th harmonic;
//   we do the same to the noise burst (a comb), it changes the colour a lot
// - brightness and velocity: the noise burst is low-passed (a soft pick, a felt hammer)
//   and the loop's low-pass is stronger or weaker
// - several strings slightly detuned (a piano has 2–3 per note) give a slow beating
//
// The loop is too short for Web Audio's own delay nodes (they need 128 samples or more
// in a feedback loop, i.e. notes below ~375 Hz), so each note is computed in JavaScript
// into a buffer, once, and kept in a cache. A string rings and fades by itself, so a
// pre-computed buffer is all it needs; noteOff just damps it.

const PLUCK_DEFAULTS = {
  decay: 2.5,       // seconds to fade by 60 dB, at 440 Hz (lower notes ring longer)
  brightness: 0.6,  // 0 = dark (felt, thumb), 1 = bright (pick, metal)
  pick: 0.2,        // where the string is plucked, as a fraction of its length
  strings: 1, detune: 1.2, // number of strings per note, and their spread in cents
  tone: 6000,       // final low-pass (the body)
  release: 0.15,    // damping time when the key is released
  velBright: 0.6, level: 1, "fx.reverb": 0.25,
};

class PluckSynth {
  constructor(ctx, destination, send) {
    this.ctx = ctx;
    this.params = { ...PLUCK_DEFAULTS };
    this.voices = new Map();
    this.maxVoices = 12;
    this.cache = new Map();
    this.toneFilter = ctx.createBiquadFilter();
    this.toneFilter.type = "lowpass";
    this.volume = ctx.createGain();
    this.toneFilter.connect(this.volume);
    this.volume.connect(destination);
    this.reverbSend = ctx.createGain();
    this.volume.connect(this.reverbSend);
    if (send) this.reverbSend.connect(send);
    this.apply();
  }

  loadPatch(patch) { this.params = { ...PLUCK_DEFAULTS, ...patch }; this.cache.clear(); this.apply(); }
  set(key, value) { this.params[key] = value; if (key !== "level" && key !== "fx.reverb") this.cache.clear(); this.apply(); }

  apply() {
    const P = this.params;
    setParam(this.ctx, this.volume.gain, P.level, true);
    setParam(this.ctx, this.reverbSend.gain, P["fx.reverb"], true);
    this.toneFilter.frequency.value = P.tone;
  }

  noteOn(note, velocity = 0.8, t = this.ctx.currentTime) {
    this.noteOff(note, t, 0.02); // a string plucked again is first stopped by the finger
    if (this.voices.size >= this.maxVoices) this.noteOff(this.voices.keys().next().value, t, 0.03);
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer(note, velocity);
    const g = this.ctx.createGain();
    g.gain.value = 0.35 + 0.65 * velocity;
    src.connect(g);
    g.connect(this.toneFilter);
    src.start(t);
    src.onended = () => g.disconnect();
    this.voices.set(note, { src, g });
  }

  noteOff(note, t = this.ctx.currentTime, release = this.params.release) {
    const v = this.voices.get(note);
    if (!v) return;
    this.voices.delete(note);
    holdAt(v.g.gain, t);
    v.g.gain.setTargetAtTime(0, t, release / 4);
    try { v.src.stop(t + release * 1.6 + 0.05); } catch (e) {}
  }

  allOff() {
    for (const note of [...this.voices.keys()]) this.noteOff(note, this.ctx.currentTime, 0.05);
  }

  // The note's sound, from the cache or computed now (velocity in 4 steps).
  buffer(note, velocity) {
    const vb = Math.round(velocity * 3) / 3;
    const key = note + "|" + vb;
    let buf = this.cache.get(key);
    if (buf) return buf;
    const sr = this.ctx.sampleRate;
    const out = this.render(sr, note, vb);
    buf = this.ctx.createBuffer(1, out.length, sr);
    buf.getChannelData(0).set(out);
    if (this.cache.size > 160) this.cache.delete(this.cache.keys().next().value);
    this.cache.set(key, buf);
    return buf;
  }

  // The samples of one note (a subclass can model another instrument, see piano.js).
  render(sr, note, velocity) {
    const P = this.params;
    const f = midiToFreq(note);
    const T = Math.min(6, Math.max(0.2, P.decay * Math.pow(440 / f, 0.4)));
    const out = new Float32Array(Math.floor(sr * Math.min(6, T * 1.1 + 0.05)));
    const bright = Math.min(1, P.brightness * (1 - P.velBright + P.velBright * velocity));
    for (let s = 0; s < P.strings; s++) {
      const cents = P.strings > 1 ? (s / (P.strings - 1) - 0.5) * 2 * P.detune : 0;
      karplusStrong(out, sr, f * Math.pow(2, cents / 1200), T, bright, P.pick, 1 / P.strings);
    }
    return out;
  }
}

// One string, added into `out`.
function karplusStrong(out, sr, freq, decaySeconds, bright, pick, gain) {
  const period = sr / freq;
  const S = 0.5 - 0.42 * bright;       // loop low-pass: 0.5 = darkest
  const N = Math.max(2, Math.floor(period - S - 0.1));
  const frac = period - S - N;          // the missing fraction (0.1 – 1.1 samples)
  const C = (1 - frac) / (1 + frac);    // all-pass coefficient for that fraction
  const rho = Math.pow(10, (-3 * period) / (sr * decaySeconds)); // loss per period

  // The pluck: noise, softened by a one-pole low-pass, combed by the pick position.
  const exc = new Float32Array(N);
  const a = Math.exp((-2 * Math.PI * (600 + 9000 * bright)) / sr);
  let lp = 0;
  for (let i = 0; i < N; i++) { lp = a * lp + (1 - a) * (Math.random() * 2 - 1); exc[i] = lp; }
  const P = Math.max(1, Math.round(pick * N));
  for (let i = N - 1; i >= P; i--) exc[i] -= exc[i - P];
  let peak = 0;
  for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(exc[i]));
  for (let i = 0; i < N; i++) exc[i] *= 0.5 / (peak || 1);

  const d = exc; // the delay line starts full of the pluck
  let ptr = 0, prev = 0, apX = 0, apY = 0;
  for (let i = 0; i < out.length; i++) {
    const x = d[ptr];
    out[i] += x * gain;
    const low = (1 - S) * x + S * prev;
    prev = x;
    const ap = C * low + apX - C * apY;
    apX = low; apY = ap;
    d[ptr] = rho * ap;
    ptr = ptr + 1 === N ? 0 : ptr + 1;
  }
}
