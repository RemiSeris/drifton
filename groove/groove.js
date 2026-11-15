// The groove engine: plays style A, style B, or a hand-over between them (`mix`, 0..1).
//
// The hand-over works like a DJ or a band changing groove: instruments pass from A to B
// one at a time, always on a new bar, never half and half. As `mix` rises, the hats go
// first, then the percussion, the keys, the bass, and last the core of the beat (kick
// and snare together). Each lane always plays ONE style's grid, so every in-between
// state is a real groove, not a blur of two.
//
// The core switch is the big moment: it is announced by a fill (a snare roll on the
// second half of the bar), the tempo slides to the new style's tempo during that fill,
// and the new beat lands on the next downbeat. Every 8 bars there is also a short fill
// (last beat only), the way a drummer marks a phrase.
//
// Inside one style nothing changes from before: each bar is drawn again from the grid
// of chances, so the groove stays itself without repeating exactly.
//
// Space: each lane sends to the shared reverb and, for dub, to an echo (see echo.js),
// with the amounts of the style that owns it.
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

// When each lane hands over to style B as `mix` rises (and back to A as it falls).
const HANDOVER = { hat: 0.15, perc: 0.3, keys: 0.45, bass: 0.6, kick: 0.8, snare: 0.8 };
const CORE = ["kick", "snare"];

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
    this.followTempo = true; // tempo = the tempo of the style playing the core
    this.autoMorph = false;  // mix walks A → B → A by itself, 16 bars each way
    this.autoDir = 1;
    this.on = Object.fromEntries(GROOVE_LANES.map((l) => [l, true]));
    this.running = false;
    this.hits = [];   // log for the display: { lane, step, t, v }
    this.steps = [];  // { step, t }: when each step starts (for the playhead)
    this.onBar = null; // callback for the page
    this.echo = null;     // optional Echo, with one send per synth: { bass, keys }
    this.synthEcho = {};
    this.owners = this.wanted();
    this.fill = null; // { from: step, to: style } while an automatic fill is playing

    // Live gestures (keys held down). Times are counted in steps since start (`abs`),
    // and every gesture waits for the next beat, so it always lands in time.
    this.abs = 0;       // absolute index of the next step to schedule
    this.roll = null;   // { from, until, build }: snare roll, `until` = Infinity while held
    this.brk = null;    // { from, until }: drums out
    this.dropAt = null; // abs step where a build-up drops
    this.filter = null; // optional DJFilter (the build-up closes it, the drop opens it)
    this.live = { rolling: false, building: false, breaking: false, rollLevel: 0 };
    this.lastDrop = -1; // audio time of the last drop (for the display)
    this.onStep = null; // optional (i, abs, t, sixteenth) → for the melody composer
  }

  // ---- Live controls (keys held down) ----

  nextBeat() { return Math.ceil(this.abs / 4) * 4; }
  nextDownbeat(after = this.abs) { return Math.ceil(after / 16) * 16; }

  // Space down: a snare roll from the next beat, louder and denser the longer you hold.
  rollPress() {
    if (!this.running || this.roll) return;
    this.roll = { from: this.nextBeat(), until: Infinity, build: false };
  }
  // Space up: the roll ends on the next beat (at least one beat long); the groove is back.
  rollRelease() {
    if (!this.roll || this.roll.build || this.roll.until !== Infinity) return;
    this.roll.until = Math.max(this.nextBeat(), this.roll.from + 4);
  }

  // B down: the drums drop out from the next beat, for as long as you hold.
  breakPress() {
    if (!this.running || this.brk) return;
    this.brk = { from: this.nextBeat(), until: Infinity };
  }
  // B up: they come back on the next downbeat (the "one").
  breakRelease() {
    if (!this.brk || this.brk.until !== Infinity) return;
    this.brk.until = Math.max(this.nextDownbeat(), this.nextDownbeat(this.brk.from + 1));
  }

  // R down: build-up. Kick and bass leave, a roll starts and swells, the filter closes.
  buildPress() {
    if (!this.running || (this.roll && this.roll.build)) return;
    this.roll = { from: this.nextBeat(), until: Infinity, build: true };
    if (this.filter) this.filter.close(4);
  }
  // R up: the DROP, on the next downbeat: everything back at once, filter wide open.
  buildRelease() {
    if (!this.roll || !this.roll.build || this.roll.until !== Infinity) return;
    const drop = Math.max(this.nextDownbeat(), this.nextDownbeat(this.roll.from + 1));
    this.roll.until = drop;
    this.dropAt = drop;
  }

  // Move the morph by one instrument: to the next (dir = 1) or previous (-1) hand-over.
  stepMorph(dir) {
    this.autoMorph = false;
    const marks = [0, ...new Set(Object.values(HANDOVER))].sort((x, y) => x - y).concat(1);
    if (dir > 0) this.mix = marks.find((m) => m > this.mix + 1e-6) ?? 1;
    else this.mix = [...marks].reverse().find((m) => m < this.mix - 1e-6) ?? 0;
  }

  // Which style each lane should play for the current `mix`.
  wanted() {
    return Object.fromEntries(GROOVE_LANES.map((l) => [l, this.mix >= HANDOVER[l] ? this.b : this.a]));
  }

  // The style playing the core of the beat: it sets tempo, swing, chord length, echo time.
  get core() {
    return this.owners.kick;
  }

  // Tempo when nothing is playing (shown on the page).
  restingBpm() {
    return this.wanted().kick.bpm;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.step = 0;
    this.bar = 0;
    this.barsInChord = 0;
    this.owners = this.wanted();
    this.fill = null;
    this.abs = 0;
    this.roll = this.brk = this.dropAt = null;
    if (this.followTempo) this.bpm = this.core.bpm;
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
    if (this.filter) this.filter.open();
    this.roll = this.brk = this.dropAt = null;
    this.live = { rolling: false, building: false, breaking: false, rollLevel: 0 };
  }

  tick() {
    const hidden = typeof document !== "undefined" && document.hidden;
    const horizon = this.ctx.currentTime + (hidden ? 1.5 : 0.15);
    while (this.nextStep < horizon) {
      this.playStep(this.step, this.nextStep);
      this.nextStep += 60 / this.bpm / 4; // one sixteenth note
      this.step = (this.step + 1) % 16;
    }
    const old = this.ctx.currentTime - 4;
    this.hits = this.hits.filter((h) => h.t > old);
    this.steps = this.steps.filter((s) => s.t > old);
  }

  // ---- Bars: hand-over, fills, chords, effects ----

  startBar(t) {
    if (this.autoMorph && this.bar > 0) {
      // 1/16 per bar from wherever the mix is, turning back at each end.
      this.mix += this.autoDir / 16;
      if (this.mix >= 1) { this.mix = 1; this.autoDir = -1; }
      if (this.mix <= 0) { this.mix = 0; this.autoDir = 1; }
    }

    // A fill just ended: the new core lands now.
    const switching = this.fill && this.fill.to !== this.core;
    const want = this.wanted();
    for (const lane of GROOVE_LANES) {
      if (!CORE.includes(lane)) this.owners[lane] = want[lane];
    }
    if (this.fill) {
      for (const lane of CORE) this.owners[lane] = this.fill.to;
      this.fill = null;
    }

    // Plan this bar's fill: a long one before a core switch, a short one every 8 bars.
    if (want.kick !== this.core) {
      this.fill = { from: 8, to: want.kick, fromBpm: this.bpm };
    } else if (this.bar % 8 === 7 && !this.roll) {
      this.fill = { from: 12, to: this.core, fromBpm: this.bpm };
    }

    if (this.bar > 0) {
      this.barsInChord++;
      if (switching || this.barsInChord >= this.core.chordBars) this.changeChord(t);
    }
    if (this.followTempo && !(this.fill && this.fill.to !== this.core)) this.bpm = this.core.bpm;
    this.applySends();
    this.bar++;
    if (this.onBar) this.onBar(t);
  }

  // Reverb and echo amounts of the style that owns each lane.
  applySends() {
    for (const lane of DRUM_LANES) this.drums.setSend(lane, this.owners[lane].space[lane]);
    for (const lane of ["bass", "keys"]) this.synths[lane].set("fx.reverb", this.owners[lane].space[lane]);
    if (!this.echo) return;
    this.echo.setBeats(this.core.echoBeats, this.bpm);
    for (const lane of DRUM_LANES) this.drums.setEcho(lane, this.owners[lane].echo[lane]);
    for (const lane of ["bass", "keys"]) {
      setParam(this.ctx, this.synthEcho[lane].gain, this.owners[lane].echo[lane], true);
    }
  }

  changeChord(t) {
    if (this.nextDegree !== undefined) this.degree = this.nextDegree;
    // The mode follows whoever plays the harmony (the keys).
    const mode = this.owners.keys.mode;
    if (mode !== this.harmony.mode) this.harmony.setKey(this.harmony.root, mode);
    if (!this.harmony.usable(this.degree)) this.degree = 0;
    this.tones = this.harmony.chordTones(this.degree);
    this.chordName = this.harmony.chordName(this.degree);
    this.keysVoicing = voiceLead(this.keysVoicing, this.tones, 55, 74, 4);
    // Decide the next chord now, so the bass knows where to slide to.
    this.nextDegree = this.harmony.nextDegree(this.degree);
    this.barsInChord = 0;
  }

  // ---- Steps ----

  playStep(i, t) {
    if (i === 0) this.startBar(t);
    const abs = this.abs++;
    // Live gestures: which ones are sounding on this step?
    if (this.roll && abs >= this.roll.until) this.roll = null;
    if (this.brk && abs >= this.brk.until) this.brk = null;
    const roll = this.roll && abs >= this.roll.from ? this.roll : null;
    const breaking = !!(this.brk && abs >= this.brk.from);
    const dropping = this.dropAt === abs;
    if (dropping) {
      this.dropAt = null;
      if (this.filter) this.filter.open(t, 0.05);
      this.lastDrop = t;
    }
    // How far the roll has grown: 0 → 1 over 1 bar (2 bars for a build-up).
    const rollLevel = roll ? Math.min(1, (abs - roll.from) / (roll.build ? 32 : 16)) : 0;
    this.live = { rolling: !!roll, building: !!(roll && roll.build), breaking, rollLevel };

    const fill = !roll && this.fill && i >= this.fill.from ? this.fill : null;
    // During a switching fill, the tempo slides step by step towards the new style.
    if (fill && this.followTempo && fill.to !== this.core) {
      const k = (i - fill.from + 1) / (16 - fill.from);
      this.bpm = fill.fromBpm + (fill.to.bpm - fill.fromBpm) * k;
    }
    this.steps.push({ step: i, t });
    // Swing: the off-sixteenths come a little late.
    const sixteenth = 60 / this.bpm / 4;
    const swung = t + (i % 2 ? this.core.swing * sixteenth : 0);
    if (this.onStep) this.onStep(i, abs, swung, sixteenth);

    for (const lane of GROOVE_LANES) {
      if (!this.on[lane]) continue;
      const drum = DRUM_LANES.includes(lane);
      if (breaking && drum) continue;
      if (roll && roll.build && lane === "bass") continue; // the build-up takes the bass away
      const style = this.owners[lane];
      let p = style.lanes[lane].prob[i];
      let v = style.lanes[lane].vel[i];
      if (roll && drum) [p, v] = this.rollHit(lane, abs, roll, rollLevel);
      else if (fill && drum) [p, v] = this.fillHit(lane, i, fill);
      if (dropping && lane === "kick") [p, v] = [1, 1]; // the drop lands on a full kick
      if (p === 0 || Math.random() >= p) continue;
      // A human never hits twice exactly the same, nor exactly on time.
      v = Math.min(1, v * (0.88 + Math.random() * 0.24));
      const tt = swung + (Math.random() - 0.5) * 0.008;
      this.fire(lane, i, tt, v, style);
      this.hits.push({ lane, step: i, t: tt, v });
      // A roll held long enough doubles up: an extra hit between the sixteenths.
      if (roll && lane === "snare" && rollLevel > 0.5) {
        const t2 = tt + sixteenth / 2;
        this.fire(lane, i, t2, v * 0.8, style);
        this.hits.push({ lane, step: i, t: t2, v: v * 0.8 });
      }
    }
  }

  // A live roll replaces the drums: snare only (plus the kick on its first step, except
  // in a build-up, where the kick is gone until the drop).
  rollHit(lane, abs, roll, level) {
    if (lane === "snare") return [roll.build ? 1 : abs % 2 ? 0.6 : 0.95, 0.3 + 0.65 * level];
    if (lane === "kick" && !roll.build && abs === roll.from) return [1, 0.85];
    return [0, 0];
  }

  // A fill replaces the drums: a snare roll that grows louder, the kick on its first
  // step, nothing else (silence around a roll makes it stand out).
  fillHit(lane, i, fill) {
    const k = (i - fill.from) / (16 - fill.from); // 0 → 1 across the fill
    if (lane === "snare") return [i % 2 ? 0.55 : 0.95, 0.35 + 0.6 * k];
    if (lane === "kick") return i === fill.from ? [1, 0.85] : [0, 0];
    return [0, 0];
  }

  // ---- Playing one hit ----

  fire(lane, i, t, v, style) {
    if (DRUM_LANES.includes(lane)) return this.drums.play(lane, t, v, style.kit && style.kit[lane]);
    if (lane === "bass") return this.bassNote(i, t, v, style);
    if (lane === "keys") return this.keysChord(t, v, style);
  }

  bassNote(i, t, v, style) {
    let ch = style.lanes.bass.n[i];
    if (ch === ".") ch = "R";
    const pick = { R: 0, 3: 1, 5: 2, 7: 3 };
    let note = ch === "8" ? pitchFrom(this.tones[0], 36) + 12 : pitchFrom(this.tones[pick[ch] ?? 0], 36);
    // Last beat before a chord change: half the time, approach the next root.
    const lastBar = this.barsInChord === this.core.chordBars - 1;
    if (lastBar && i >= 13 && Math.random() < 0.5) {
      const nextRoot = pitchFrom(this.harmony.pc(this.nextDegree), 36);
      note = nextRoot + (Math.random() < 0.5 ? -1 : 1);
    }
    this.synths.bass.noteOn(note, v, t);
    this.synths.bass.noteOff(note, t + style.bassGate);
  }

  keysChord(t, v, style) {
    for (const n of this.keysVoicing) {
      this.synths.keys.noteOn(n, v * 0.6, t);
      this.synths.keys.noteOff(n, t + style.keysGate);
    }
  }

  // For the display: the step sounding at time t (steps are scheduled ahead).
  stepAt(t) {
    let cur = null;
    for (const s of this.steps) if (s.t <= t) cur = s.step;
    return cur;
  }
}
