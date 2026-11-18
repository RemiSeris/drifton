// Sing: hum or sing into the microphone, the lead plays your note, in the groove's scale.
//
//   microphone ──> analyser (not sent to the speakers) ──> pitch detection every 15 ms
//        ──> note (snapped to the scale, moved up into the melody's range) ──> lead synth
//
// Pitch detection uses YIN (de Cheveigné & Kawahara, 2002), the classic for voices:
// a sound with a pitch repeats itself every period, so we look for the delay at which
// the signal looks most like itself. The "difference" for each delay tau is
// sum (x[i] - x[i + tau])², normalised so that small delays are not favoured; the first
// delay where it drops low enough is the period, refined between samples by a parabola.
// It runs on every other sample (a voice has nothing useful above ~1 kHz), which makes
// it four times cheaper.
//
// To avoid nervous notes (a real voice wobbles, with vibrato, by a fraction of a semitone):
// - the pitch used to choose the note is averaged over the last 0.15 s, about one cycle
//   of vibrato, so the wobble cancels out (the raw pitch is still drawn on the stage),
//   restarted at each real jump so a new note is not slowed down by the old one;
// - the note sounding is kept unless another note of the scale is clearly closer (by a
//   third of a semitone), so a note sung between two notes of the scale doesn't flicker;
// - the automatic octave is chosen once and kept while it still fits, so a note sung
//   right on an octave boundary doesn't jump from one octave to the other;
// - a new note only starts once it has been heard on 2 checks in a row (~30 ms), and a
//   note stops after ~60 ms of silence.
//
// Every note sung is also logged with its place on the groove clock (in sixteenths
// since the start), so a hummed phrase can later be looped and built on.

class Singer {
  constructor(ctx, lead, harmony, groove, melody) {
    this.ctx = ctx;
    this.lead = lead;
    this.harmony = harmony;
    this.groove = groove;
    this.melody = melody;
    this.on = false;
    this.octave = "auto";   // "auto" (lift into the melody range) or a number of octaves
    this.gate = 0.012;      // RMS below this = silence
    this.raw = null;        // last detected pitch as a MIDI float (for the display)
    this.level = 0;
    this.note = null;       // MIDI note sounding now
    this.candidate = null; this.candidateCount = 0; this.silence = 0;
    this.trail = [];        // { midi (float), t } of the last seconds, for the stage
    this.take = [];         // notes sung: { midi, start, end } in sixteenths on the groove clock
    this.autoShift = null;  // octave shift chosen in "auto" (kept while it fits)
  }

  // Start listening. `source` (optional) replaces the microphone (used by the tests).
  async start(source) {
    if (this.on) return;
    if (!source) {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false },
      });
      source = this.ctx.createMediaStreamSource(this.stream);
    }
    this.source = source;
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    source.connect(this.analyser);
    this.buf = new Float32Array(this.analyser.fftSize);
    this.on = true;
    this.timer = setInterval(() => this.listen(), 15);
  }

  stop() {
    if (!this.on) return;
    this.on = false;
    clearInterval(this.timer);
    this.release(this.ctx.currentTime);
    try { this.source.disconnect(this.analyser); } catch (e) {}
    if (this.stream) for (const tr of this.stream.getTracks()) tr.stop();
    this.stream = null;
    this.raw = null;
    this.autoShift = null;
  }

  listen() {
    this.analyser.getFloatTimeDomainData(this.buf);
    const { freq, rms } = detectPitch(this.buf, this.ctx.sampleRate, this.gate);
    this.level = rms;
    const t = this.ctx.currentTime;
    if (!freq) {
      this.raw = null;
      this.candidate = null;
      if (this.note !== null && ++this.silence >= 4) this.release(t);
      return;
    }
    this.silence = 0;
    const midi = 69 + 12 * Math.log2(freq / 440);
    this.raw = midi + this.shift(midi);
    this.trail.push({ midi: this.raw, t });
    this.trail = this.trail.filter((p) => t - p.t < 2.5);

    // Average over the last 0.15 s of continuous singing (one vibrato cycle), but only
    // since the last real jump: vibrato moves the voice by ~0.3 semitone, a new note by
    // more, so a jump of 0.8 starts a fresh average and the new note comes fast.
    let sum = 0, n = 0;
    const latest = this.trail[this.trail.length - 1].midi;
    for (let k = this.trail.length - 1; k >= 0; k--) {
      const p = this.trail[k];
      const next = this.trail[k + 1];
      if (next && next.t - p.t > 0.05) break;           // a silence: older notes don't count
      if (Math.abs(latest - p.midi) > 0.8) break;      // a jump: older notes don't count
      if (t - p.t > 0.15) break;
      sum += p.midi; n++;
    }
    const smooth = sum / n;
    const target = this.snap(smooth);
    if (target === this.note) { this.candidate = null; return; }
    // Only move if the new note is clearly closer than the one sounding.
    if (this.note !== null && Math.abs(smooth - this.note) - Math.abs(smooth - target) < 0.33) {
      this.candidate = null;
      return;
    }
    if (target === this.candidate) this.candidateCount++;
    else { this.candidate = target; this.candidateCount = 1; }
    if (this.candidateCount >= 2) {
      this.release(t);
      this.attack(target, t, rms);
      this.candidate = null;
    }
  }

  // Octaves to add so the sung note lands in the melody's range (a low voice hums
  // around MIDI 45–60, the melody lives around 66–84).
  shift(midi) {
    if (this.octave !== "auto") return 12 * this.octave;
    const s = this.autoShift;
    if (s !== null && midi + s >= 57 && midi + s <= 90) return s; // still fits: keep it
    let n = 0;
    while (midi + n < 62) n += 12;
    while (midi + n > 86) n -= 12;
    this.autoShift = n;
    return n;
  }

  // Nearest note of the current scale.
  snap(midi) {
    const h = this.harmony;
    let best = null, bestD = Infinity;
    for (let o = -1; o <= 1; o++) {
      const base = 12 * (Math.floor(midi / 12) + o);
      for (const iv of h.scale) {
        const n = base + ((h.root + iv) % 12);
        const d = Math.abs(n - midi);
        if (d < bestD) { bestD = d; best = n; }
      }
    }
    return best;
  }

  attack(midi, t, rms) {
    const vel = Math.min(1, 0.5 + rms * 8);
    this.lead.noteOn(midi, vel, t);
    this.note = midi;
    // For the comets and the on-screen keyboard: which key plays this note, if any.
    const code = [...MELODY_ROWS[0], ...MELODY_ROWS[1]].find((c) => this.melody.noteFor(c) === midi) || "voice";
    this.logEntry = { midi, t, end: Infinity, code };
    this.melody.log.push(this.logEntry);
    if (this.melody.log.length > 64) this.melody.log.shift();
    const pos = this.groovePos(t);
    if (pos !== null) {
      this.takeEntry = { midi, start: pos, end: null };
      this.take.push(this.takeEntry);
      if (this.take.length > 256) this.take.shift();
    }
  }

  release(t) {
    if (this.note === null) return;
    this.lead.noteOff(this.note, t);
    if (this.logEntry) this.logEntry.end = t;
    if (this.takeEntry) this.takeEntry.end = this.groovePos(t);
    this.note = null;
    this.logEntry = this.takeEntry = null;
  }

  // Where time t falls on the groove clock, in sixteenths since the start (or null).
  groovePos(t) {
    const g = this.groove;
    if (!g.running || !g.steps.length) return null;
    let s = null;
    for (const st of g.steps) if (st.t <= t) s = st;
    if (!s) return null;
    return s.abs + (t - s.t) / (60 / g.bpm / 4);
  }
}

// YIN pitch detection. Returns { freq (Hz, 0 if no clear pitch), rms }.
function detectPitch(buf, sampleRate, gate = 0.012) {
  // Every other sample: half the rate, enough for a voice.
  const n = buf.length >> 1;
  const x = new Float32Array(n);
  let rms = 0;
  for (let i = 0; i < n; i++) { x[i] = buf[2 * i]; rms += x[i] * x[i]; }
  rms = Math.sqrt(rms / n);
  if (rms < gate) return { freq: 0, rms };
  const sr = sampleRate / 2;
  const W = n >> 1;
  const minTau = Math.floor(sr / 1100); // up to ~1100 Hz
  const maxTau = Math.min(W - 1, Math.floor(sr / 70)); // down to 70 Hz
  const d = new Float32Array(maxTau + 1);
  for (let tau = 1; tau <= maxTau; tau++) {
    let sum = 0;
    for (let i = 0; i < W; i++) { const v = x[i] - x[i + tau]; sum += v * v; }
    d[tau] = sum;
  }
  // Cumulative mean normalised difference.
  let running = 0;
  const c = new Float32Array(maxTau + 1);
  c[0] = 1;
  for (let tau = 1; tau <= maxTau; tau++) {
    running += d[tau];
    c[tau] = running ? (d[tau] * tau) / running : 1;
  }
  let tau = -1;
  for (let k = minTau; k <= maxTau; k++) {
    if (c[k] < 0.12) {
      while (k + 1 <= maxTau && c[k + 1] < c[k]) k++;
      tau = k;
      break;
    }
  }
  if (tau < 0) return { freq: 0, rms }; // no clear pitch (breath, noise, a consonant)
  // Parabola through the three points around the minimum, for sub-sample precision.
  let better = tau;
  if (tau > 1 && tau < maxTau) {
    const a = c[tau - 1], b = c[tau], e = c[tau + 1];
    const den = a + e - 2 * b;
    if (den) better = tau + (a - e) / (2 * den);
  }
  return { freq: sr / better, rms };
}
