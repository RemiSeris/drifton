// Looper: record what you sing or play, loop it, and build the music around it.
//
// Recording
//   Record arms the looper; it starts on the next "one" and lasts 1, 2 or 4 bars.
//   It takes your notes from the keys and from the microphone (not the computer's).
//   Each note is placed on the groove clock, corrected for the delay between the music
//   leaving the speakers and you reacting to it (and, for the voice, the ~50 ms the
//   pitch detection needs), then snapped to the nearest sixteenth.
//
// Layers (a loop station)
//   Each take becomes a layer that loops in the instrument you were using when you
//   recorded it (its own synth). Up to 4 layers; each can be muted or deleted.
//
// The theme (building around it)
//   The first layer is the theme. With "build" on, the groove stops choosing chords by
//   chance and takes them from the theme: for each bar, the chord of the scale whose
//   notes fit the theme best (fitChords below). The scale (mode) stays the one the theme
//   was sung in. In Guide mode, the composer can hand you the theme to play back.

const LOOP_COLORS = ["#ff8fd0", "#5ec4f2", "#f2c46d", "#8affc1"];
const MAX_LAYERS = 4;

class Looper {
  constructor(ctx, groove, harmony, melody, makeSynth) {
    this.ctx = ctx;
    this.groove = groove;
    this.harmony = harmony;
    this.melody = melody;
    this.makeSynth = makeSynth; // () → { synth, label } with the sound playing now
    this.layers = [];  // { notes: [{ o, len, midi, vel }], bars, startBar, synth, label, color, muted }
    this.armed = null; // { bars } waiting for the next "one"
    this.rec = null;   // { startAbs, startBar, bars, notes, open }
    this.build = true; // the chords follow the theme
    this.onChange = null; // callback for the page (layers list)
  }

  get theme() { return this.layers[0] || null; }

  // ---- Recording ----

  arm(bars) {
    if (!this.groove.running || this.layers.length >= MAX_LAYERS) return false;
    if (this.rec) return false;
    this.armed = { bars };
    return true;
  }

  cancel() { this.armed = null; this.rec = null; }

  // A note from you (keys or voice) starts (on = true) or stops at audio time t.
  capture(midi, t, on, source) {
    if (!this.rec) return;
    const latency = (this.ctx.outputLatency || this.ctx.baseLatency || 0) + (source === "voice" ? 0.05 : 0);
    const pos = this.groovePos(t - latency);
    if (pos === null) return;
    if (on) {
      this.rec.open.set(midi, { midi, start: pos, vel: 0.8 });
    } else {
      const n = this.rec.open.get(midi);
      if (!n) return;
      this.rec.open.delete(midi);
      n.end = pos;
      this.rec.notes.push(n);
    }
  }

  // Where time t falls on the groove clock, in sixteenths since the start.
  groovePos(t) {
    const g = this.groove;
    let s = null;
    for (const st of g.steps) if (st.t <= t) s = st;
    if (!s) return null;
    return s.abs + (t - s.t) / (60 / g.bpm / 4);
  }

  // Called by the groove for every step it schedules.
  onStep(i, abs, t, sixteenth) {
    const bar = this.groove.bar - 1; // index of the bar playing this step
    if (i === 0) {
      if (this.rec && bar >= this.rec.startBar + this.rec.bars) this.finish(abs);
      if (this.armed) {
        this.rec = { startAbs: abs, startBar: bar, bars: this.armed.bars, notes: [], open: new Map() };
        this.armed = null;
      }
    }
    for (const layer of this.layers) {
      if (layer.muted) continue;
      const L = layer.bars * 16;
      const pos = ((((bar - layer.startBar) * 16 + i) % L) + L) % L;
      for (const n of layer.notes) {
        if (n.o !== pos) continue;
        const end = t + n.len * sixteenth * 0.95;
        layer.synth.noteOn(n.midi, n.vel, t);
        layer.synth.noteOff(n.midi, end);
        // For the stage comets and the on-screen keyboard.
        this.melody.log.push({ midi: n.midi, t, end, code: this.codeFor(n.midi) || "loop", layer: layer.color });
        if (this.melody.log.length > 96) this.melody.log.shift();
      }
    }
  }

  // End of the take: snap the notes to sixteenths and make a layer of them.
  finish(endAbs) {
    const r = this.rec;
    this.rec = null;
    for (const n of r.open.values()) { n.end = endAbs; r.notes.push(n); } // still held
    const L = r.bars * 16;
    const notes = [];
    for (const n of r.notes) {
      const o = Math.round(n.start - r.startAbs);
      if (o < 0 || o >= L) continue; // before the "one", or so late it's the next loop
      const end = Math.min(L, Math.max(o + 1, Math.round(n.end - r.startAbs)));
      if (notes.some((m) => m.o === o && m.midi === n.midi)) continue;
      notes.push({ o, len: end - o, midi: n.midi, vel: n.vel });
    }
    notes.sort((a, b) => a.o - b.o);
    if (!notes.length) { if (this.onChange) this.onChange("empty"); return; }
    const { synth, label } = this.makeSynth();
    const layer = {
      notes, bars: r.bars, startBar: r.startBar, synth, label,
      color: LOOP_COLORS[this.layers.length % LOOP_COLORS.length], muted: false,
    };
    this.layers.push(layer);
    if (this.layers.length === 1) this.applyTheme();
    if (this.onChange) this.onChange("added");
  }

  remove(k) {
    const [layer] = this.layers.splice(k, 1);
    if (layer) layer.synth.allOff();
    this.layers.forEach((l, j) => { l.color = LOOP_COLORS[j % LOOP_COLORS.length]; });
    this.applyTheme();
    if (this.onChange) this.onChange("removed");
  }

  clear() {
    for (const l of this.layers) l.synth.allOff();
    this.layers = [];
    this.cancel();
    this.applyTheme();
    if (this.onChange) this.onChange("cleared");
  }

  // ---- Building around the theme ----

  applyTheme() {
    const th = this.theme;
    if (!th || !this.build) { this.groove.chordPlan = null; return; }
    this.groove.chordPlan = { degrees: this.fitChords(th), startBar: th.startBar, mode: this.harmony.mode };
  }

  // For each bar of the theme, the chord of the scale that fits its notes best.
  // Each note counts for its length, more on a beat, most on the first beat.
  // A chord scores when the note is in it (root, third or fifth; less for the seventh),
  // and loses when the note sits a semitone above one of its notes (the clash).
  // Ties go to the tonic, then to changing chord rather than repeating.
  fitChords(theme) {
    const h = this.harmony;
    const degrees = [];
    for (let b = 0; b < theme.bars; b++) {
      const inBar = theme.notes.filter((n) => Math.floor(n.o / 16) === b);
      const prev = degrees[b - 1];
      if (!inBar.length) { degrees.push(prev !== undefined ? h.nextDegree(prev) : 0); continue; }
      let best = 0, bestScore = -Infinity;
      for (let d = 0; d < 7; d++) {
        if (!h.usable(d)) continue;
        const tones = h.chordTones(d);
        const triad = tones.slice(0, 3), seventh = tones[3];
        let score = 0;
        for (const n of inBar) {
          const pos = n.o % 16;
          const w = n.len * (pos === 0 ? 2 : pos % 4 === 0 ? 1.5 : 1);
          const pc = n.midi % 12;
          if (triad.includes(pc)) score += w;
          else if (pc === seventh) score += 0.4 * w;
          else if (triad.some((c) => (pc - c + 12) % 12 === 1)) score -= w;
          else score -= 0.2 * w;
        }
        if (d === 0) score += 0.3;
        if (d === prev) score -= 0.1;
        if (score > bestScore) { bestScore = score; best = d; }
      }
      degrees.push(best);
    }
    return degrees;
  }

  // The melody key that plays a note (trying other octaves), for the keyboard & Guide.
  codeFor(midi) {
    const codes = [...MELODY_ROWS[0], ...MELODY_ROWS[1]];
    for (const shift of [0, 12, -12, 24, -24]) {
      const c = codes.find((k) => this.melody.noteFor(k) === midi + shift);
      if (c) return c;
    }
    return null;
  }

  // The theme's notes for a bar (for the Guide): [{ o (0–15), len, midi, code }].
  themeBar(bar) {
    const th = this.theme;
    if (!th) return [];
    const b = (((bar - th.startBar) % th.bars) + th.bars) % th.bars;
    return th.notes
      .filter((n) => Math.floor(n.o / 16) === b)
      .map((n) => ({ o: n.o % 16, len: n.len, midi: n.midi, code: this.codeFor(n.midi) }))
      .filter((n) => n.code);
  }
}
