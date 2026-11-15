// The groove engine: plays two styles at once, blended by `mix` (0 = style A, 1 = B).
//
// Blending works because a style is a grid of probabilities: halfway between funk and
// dub, a step that funk plays 70% of the time and dub never plays is played 35% of the
// time. Velocity, swing, tempo, note length and reverb sends are blended the same way.
//
// Chords come from the same Harmony as Focus music. The bass picks chord notes as the
// style asks (root, fifth, octave…) and, at the end of a chord, sometimes slides into
// the next root from a semitone away (a "chromatic approach", very funk, very jazz).
//
// Timing: same lookahead idea as the generator, but tighter (a groove must react fast
// when you move the morph): a timer every 25 ms schedules what falls in the next 150 ms.
// When the tab is hidden, browsers slow timers down to about once a second, so the
// lookahead is stretched to keep playing without gaps.

const GROOVE_LANES = ["kick", "snare", "hat", "perc", "bass", "keys"];

class Groove {
  constructor(ctx, drums, synths, harmony) {
    this.ctx = ctx;
    this.drums = drums;
    this.synths = synths; // { bass, keys }
    this.harmony = harmony;
    this.a = GROOVE_STYLES.funk;
    this.b = GROOVE_STYLES.dub;
    this.mix = 0;
    this.bpm = this.a.bpm;
    this.followTempo = true; // tempo glides between the two styles' tempos
    this.autoMorph = false;  // mix drifts A → B → A by itself, over 32 bars
    this.autoDir = 1;
    this.on = Object.fromEntries(GROOVE_LANES.map((l) => [l, true]));
    this.running = false;
    this.hits = [];   // log for the display: { lane, step, t, v }
    this.steps = [];  // { step, t }: when each step starts (for the playhead)
    this.onBar = null; // callback for the page
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.step = 0;
    this.bar = 0;
    this.barsInChord = 0;
    this.nextStep = this.ctx.currentTime + 0.1;
    this.degree = 0;
    this.keysVoicing = [];
    this.changeChord(0);
    this.timer = setInterval(() => this.tick(), 25);
    this.tick();
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    clearInterval(this.timer);
    this.synths.bass.allOff();
    this.synths.keys.allOff();
  }

  // A blend of one numeric setting of the two styles.
  blend(get) {
    return get(this.a) * (1 - this.mix) + get(this.b) * this.mix;
  }

  // The style nearest to the current mix, for settings that cannot be blended.
  nearest() {
    return this.mix < 0.5 ? this.a : this.b;
  }

  tick() {
    const ahead = (typeof document !== "undefined" && document.hidden) ? 1.5 : 0.15;
    const horizon = this.ctx.currentTime + ahead;
    while (this.nextStep < horizon) {
      this.playStep(this.step, this.nextStep);
      this.nextStep += 60 / this.bpm / 4; // one sixteenth note
      this.step = (this.step + 1) % 16;
    }
    const old = this.ctx.currentTime - 4;
    this.hits = this.hits.filter((h) => h.t > old);
    this.steps = this.steps.filter((s) => s.t > old);
  }

  playStep(i, t) {
    if (i === 0) this.startBar(t);
    this.steps.push({ step: i, t });
    // Swing: the off-sixteenths come a little late.
    const sixteenth = 60 / this.bpm / 4;
    const swung = t + (i % 2 ? this.blend((s) => s.swing) * sixteenth : 0);

    for (const lane of GROOVE_LANES) {
      if (!this.on[lane]) continue;
      const A = this.a.lanes[lane], B = this.b.lanes[lane];
      const wa = A.prob[i] * (1 - this.mix), wb = B.prob[i] * this.mix;
      const p = wa + wb;
      if (p === 0 || Math.random() >= p) continue;
      // Velocity of the blend, weighted by how much each style wants this hit.
      let v = (wa * A.vel[i] + wb * B.vel[i]) / p;
      // A human never hits twice exactly the same, nor exactly on time.
      v = Math.min(1, v * (0.88 + Math.random() * 0.24));
      const tt = swung + (Math.random() - 0.5) * 0.008;
      const fromB = Math.random() < wb / p; // which style "owns" this hit
      this.fire(lane, i, tt, v, fromB ? this.b : this.a);
      this.hits.push({ lane, step: i, t: tt, v });
    }
  }

  startBar(t) {
    if (this.bar > 0) {
      this.barsInChord++;
      if (this.barsInChord >= this.nearest().chordBars) this.changeChord(t);
    }
    if (this.autoMorph) {
      // Walk 1/16 per bar from wherever the mix is, and turn back at each end:
      // A → B in 16 bars, B → A in 16 more.
      this.mix += this.autoDir / 16;
      if (this.mix >= 1) { this.mix = 1; this.autoDir = -1; }
      if (this.mix <= 0) { this.mix = 0; this.autoDir = 1; }
    }
    if (this.followTempo) this.bpm = this.blend((s) => s.bpm);
    for (const lane of DRUM_LANES) this.drums.setSend(lane, this.blend((s) => s.space[lane]));
    for (const lane of ["bass", "keys"]) this.synths[lane].set("fx.reverb", this.blend((s) => s.space[lane]));
    this.bar++;
    if (this.onBar) this.onBar(t);
  }

  changeChord(t) {
    if (this.nextDegree !== undefined) this.degree = this.nextDegree;
    // The mode follows the nearest style (funk: dorian, dub: aeolian, bossa: major).
    const mode = this.nearest().mode;
    if (mode !== this.harmony.mode) this.harmony.setKey(this.harmony.root, mode);
    if (!this.harmony.usable(this.degree)) this.degree = 0;
    this.tones = this.harmony.chordTones(this.degree);
    this.chordName = this.harmony.chordName(this.degree);
    this.keysVoicing = voiceLead(this.keysVoicing, this.tones, 55, 74, 4);
    // Decide the next chord now, so the bass knows where to slide to.
    this.nextDegree = this.harmony.nextDegree(this.degree);
    this.barsInChord = 0;
  }

  // ---- Playing one hit ----

  fire(lane, i, t, v, style) {
    if (DRUM_LANES.includes(lane)) return this.drums.play(lane, t, v);
    if (lane === "bass") return this.bassNote(i, t, v, style);
    if (lane === "keys") return this.keysChord(t, v);
  }

  bassNote(i, t, v, style) {
    let ch = style.lanes.bass.n[i];
    if (ch === ".") ch = "R";
    const pick = { R: 0, 3: 1, 5: 2, 7: 3 };
    let note = ch === "8" ? pitchFrom(this.tones[0], 36) + 12 : pitchFrom(this.tones[pick[ch] ?? 0], 36);
    // Last beat before a chord change: half the time, approach the next root.
    const lastBar = this.barsInChord === this.nearest().chordBars - 1;
    if (lastBar && i >= 13 && Math.random() < 0.5) {
      const nextRoot = pitchFrom(this.harmony.pc(this.nextDegree), 36);
      note = nextRoot + (Math.random() < 0.5 ? -1 : 1);
    }
    const gate = this.blend((s) => s.bassGate);
    this.synths.bass.noteOn(note, v, t);
    this.synths.bass.noteOff(note, t + gate);
  }

  keysChord(t, v) {
    const gate = this.blend((s) => s.keysGate);
    for (const n of this.keysVoicing) {
      this.synths.keys.noteOn(n, v * 0.6, t);
      this.synths.keys.noteOff(n, t + gate);
    }
  }

  // For the display: the step sounding at time t (steps are scheduled ahead).
  stepAt(t) {
    let cur = null;
    for (const s of this.steps) if (s.t <= t) cur = s.step;
    return cur;
  }
}
