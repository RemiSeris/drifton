// The generator: decides which notes each instrument plays, and when.
//
// Four roles, each with its own rules, all following the same harmony:
// - pad:     holds 4 notes of the current chord, voice-led from one chord to the next
// - bass:    holds the chord root, low; sometimes rests for a chord
// - bells:   sparse melodic notes, a random walk on the scale that leans on chord
//            tones, now and then repeating a short motif (a hint of melody, never a tune)
// - texture: one long note, rarely changing
//
// Timing uses a "lookahead scheduler": every 100 ms a JavaScript timer looks at what
// should happen in the next 1.5 s and schedules those notes at exact audio-clock times.
// JS timers are imprecise (they can be late by tens of ms, more in background tabs);
// the audio clock is not. The timer only needs to run often enough to stay ahead.

const LOOKAHEAD = 1.5;

class Generator {
  constructor(ctx, synths, harmony) {
    this.ctx = ctx;
    this.synths = synths;   // { pad, bass, bells, texture }: one Synth each
    this.harmony = harmony;
    this.on = { pad: true, bass: true, bells: true, texture: true };
    this.chordSeconds = 20; // average chord length
    this.density = 0.35;    // 0..1: how many bell notes
    this.running = false;
    this.notes = [];        // log for the piano roll: { role, note, start, end }
    this.chords = [];       // log of chord changes: { t, name, roman }
  }

  start() {
    if (this.running) return;
    const t = this.ctx.currentTime + 0.1;
    this.running = true;
    this.degree = 0;
    this.chordCount = 0;
    this.held = { pad: [], bass: null, texture: null };
    this.nextChord = t;
    this.nextBell = t + 3;
    this.bellDeg = 4;
    this.motif = [];
    this.timer = setInterval(() => this.tick(), 100);
    this.tick();
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    clearInterval(this.timer);
    const now = this.ctx.currentTime;
    for (const s of Object.values(this.synths)) s.allOff();
    for (const n of this.notes) if (n.end === Infinity) n.end = Math.max(n.start, now);
  }

  tick() {
    const now = this.ctx.currentTime;
    const horizon = now + LOOKAHEAD;
    while (this.nextChord < horizon) {
      this.changeChord(this.nextChord);
      // ±25% around the average so chord changes never fall into a regular pulse.
      this.nextChord += this.chordSeconds * (0.75 + Math.random() * 0.5);
    }
    if (!this.on.bells) this.nextBell = Math.max(this.nextBell, horizon);
    while (this.nextBell < horizon) {
      this.bell(this.nextBell);
      this.nextBell += this.bellGap();
    }
    // Forget piano-roll notes that ended long ago.
    this.notes = this.notes.filter((n) => n.end > now - 120);
    this.chords = this.chords.filter((c, i) => i >= this.chords.length - 4 || c.t > now - 120);
  }

  // ---- Settings changed from the page ----

  setDensity(v) {
    this.density = v;
    if (this.running) this.nextBell = Math.min(this.nextBell, this.ctx.currentTime + this.bellGap());
  }

  setRole(role, on) {
    this.on[role] = on;
    if (!this.running) return;
    const t = this.ctx.currentTime;
    if (role === "pad") on ? this.playPad(t) : this.releaseAll("pad", t);
    if (role === "bass") on ? this.playBass(t, true) : this.releaseAll("bass", t);
    if (role === "texture") on ? this.playTexture(t, true) : this.releaseAll("texture", t);
  }

  // ---- Harmony ----

  changeChord(t) {
    if (this.chordCount > 0) this.degree = this.harmony.nextDegree(this.degree);
    this.chordCount++;
    this.tones = this.harmony.chordTones(this.degree);
    this.chords.push({ t, ...this.harmony.chordName(this.degree) });
    if (this.on.pad) this.playPad(t);
    if (this.on.bass) this.playBass(t, false);
    if (this.on.texture) this.playTexture(t, false);
  }

  // ---- Roles ----

  playPad(t) {
    const next = voiceLead(this.held.pad, this.tones, 50, 74, 4);
    for (const n of this.held.pad) if (!next.includes(n)) this.release("pad", n, t);
    for (const n of next) if (!this.held.pad.includes(n)) this.play("pad", n, 0.55, t);
    this.held.pad = next;
  }

  playBass(t, force) {
    const root = pitchFrom(this.tones[0], 48);
    // One chord in five, the bass rests: the low end breathes.
    const rest = !force && this.chordCount > 1 && Math.random() < 0.2;
    if (this.held.bass !== null && (rest || this.held.bass !== root)) {
      this.release("bass", this.held.bass, t);
      this.held.bass = null;
    }
    if (!rest && this.held.bass === null) {
      this.play("bass", root, 0.7, t);
      this.held.bass = root;
    }
  }

  playTexture(t, force) {
    // Only moves on about one chord in three; follows the chord's fifth.
    if (this.held.texture !== null && !force && Math.random() > 0.3) return;
    const note = pitchFrom(this.tones[2], 60);
    if (note === this.held.texture) return;
    if (this.held.texture !== null) this.release("texture", this.held.texture, t);
    this.play("texture", note, 0.5, t);
    this.held.texture = note;
  }

  bell(t) {
    // Sometimes, replay the last few notes: a motif the ear can half-recognise.
    if (this.motif.length >= 3 && Math.random() < 0.15) {
      let tt = t;
      for (const d of this.motif) {
        this.strike(d, tt);
        tt += 0.35 + Math.random() * 0.4;
      }
      this.nextBell = tt;
      return;
    }
    // Random walk: small steps on the scale, mostly ±1 or ±2 degrees.
    const steps = [-3, -2, -1, -1, 1, 1, 2, 3];
    let d = this.bellDeg + steps[Math.floor(Math.random() * steps.length)];
    d = reflect(d, 0, 10);
    // Lean on chord tones: a note outside the chord is often nudged onto a neighbour.
    if (!this.tones.includes(this.harmony.pc(d)) && Math.random() < 0.6) {
      d = reflect(d + (Math.random() < 0.5 ? -1 : 1), 0, 10);
    }
    this.bellDeg = d;
    this.motif.push(d);
    if (this.motif.length > 4) this.motif.shift();
    this.strike(d, t);
  }

  strike(d, t) {
    const base = pitchFrom(this.harmony.root, 55);
    const note = base + Math.floor(d / 7) * 12 + this.harmony.scale[mod(d, 7)];
    this.play("bells", note, 0.25 + Math.random() * 0.35, t);
    this.release("bells", note, t + 0.3); // the bell patch keeps ringing after release
  }

  // Random gap between bells (exponential distribution: like raindrops, no pulse).
  bellGap() {
    const rate = 0.03 + this.density * 0.5; // notes per second
    return Math.max(0.25, -Math.log(1 - Math.random()) / rate);
  }

  // ---- Notes (also logged for the piano roll) ----

  play(role, note, velocity, t) {
    this.synths[role].noteOn(note, velocity, t);
    this.notes.push({ role, note, start: t, end: Infinity });
  }

  release(role, note, t) {
    this.synths[role].noteOff(note, t);
    for (let i = this.notes.length - 1; i >= 0; i--) {
      const n = this.notes[i];
      if (n.role === role && n.note === note && n.end === Infinity) { n.end = t; break; }
    }
  }

  releaseAll(role, t) {
    if (role === "pad") { for (const n of this.held.pad) this.release("pad", n, t); this.held.pad = []; }
    else if (this.held[role] !== null) { this.release(role, this.held[role], t); this.held[role] = null; }
  }

  // The chord sounding at time t (chords are scheduled a bit ahead).
  chordAt(t) {
    let current = null;
    for (const c of this.chords) if (c.t <= t) current = c;
    return current;
  }
}

// Bounce off the edges: 11 → 9 when the range is 0..10.
function reflect(d, lo, hi) {
  if (d < lo) return lo + (lo - d);
  if (d > hi) return hi - (d - hi);
  return d;
}
