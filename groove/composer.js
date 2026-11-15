// Composer: writes a melody for the groove, one bar ahead, on the keys of the melody rows.
//
// It thinks in 4-bar phrases, the way a lot of songs do:
//   bar 1  a motif (a rhythm + a little shape)
//   bar 2  the same rhythm, the shape moved a little (or repeated): the ear recognises it
//   bar 3  an answer: a new rhythm
//   bar 4  the cadence: fewer notes, ending long on a note of the chord
//
// Rhythm: where notes may start depends on the style playing the beat (FEEL below,
// written like the drum grids: one character per sixteenth, . = never, 1..9 = weight).
// Funk: busy and syncopated. Dub: few notes, long, off the beat. Bossa: swaying eighths.
//
// Pitch: a walk on the scale, mostly by steps, sometimes a leap (then it turns back,
// as singers do). On strong beats it prefers the notes of the chord playing then, so the
// melody "lands". Notes are positions on the keyboard rows (step 0 = root on the middle
// row), so the same plan can be played by the computer (Auto) or shown to you (Guide).
//
// Each note: { abs, len, step, code, t, end, judged } — abs = step index on the groove
// clock, len in sixteenths, t / end = audio times (estimated, then exact when it comes).

const FEEL = {
  Funk:         { grid: "8.36.5.47.36.5.4", notes: [4, 6], maxLen: 3 },
  Dub:          { grid: "5...3.6...4...6.", notes: [2, 3], maxLen: 8 },
  "Bossa nova": { grid: "7..5..6.4..6..5.", notes: [3, 5], maxLen: 4 },
};
const FEEL_DEFAULT = FEEL.Funk;
const TOP_STEP = 12; // highest scale step used (the top row goes higher, for you)

class Composer {
  constructor(groove, harmony, melody) {
    this.groove = groove;
    this.harmony = harmony;
    this.melody = melody;
    this.mode = "free";  // "free" | "guide" | "auto"
    this.notes = [];     // planned and recent notes
    this.cur = 2;        // current scale step of the walk
    this.motif = null;   // { onsets, steps } of the phrase's first bar
    this.answer = null;
    // Guide game.
    this.streak = 0; this.best = 0; this.hits = 0; this.judgedCount = 0;
    this.feedback = [];  // { text, midi, t } for the stage
  }

  reset() {
    this.notes = [];
    this.motif = this.answer = null;
    this.cur = 2;
  }

  // Called by the groove for every step it schedules.
  onStep(i, abs, t, sixteenth) {
    if (this.mode === "free") return;
    this.sixteenth = sixteenth;
    this.clock = { abs, t };
    // At each downbeat, write the bar after this one.
    if (i === 0) this.planBar(abs / 16 + 1, abs, t, sixteenth);
    for (const n of this.notes) {
      if (n.abs !== abs) continue;
      n.t = t;                                   // now we know the exact time
      n.end = t + n.len * sixteenth * 0.92;
      if (this.mode === "auto") {
        this.melody.press(n.code, n.vel, n.t);
        this.melody.release(n.code, n.end);
      }
    }
    // Keep only what is recent or to come.
    this.notes = this.notes.filter((n) => n.end === undefined || n.end > t - 2);
  }

  // ---- Writing ----

  planBar(bar, absNow, tNow, sixteenth) {
    const g = this.groove;
    const feel = FEEL[g.core.name] || FEEL_DEFAULT;
    const pos = (bar - 1) % 4; // place in the 4-bar phrase (bar 0 is left empty: count-in)
    if (bar < 1) return;
    // The chord that will be playing in that bar.
    const changes = g.barsInChord + 1 >= g.core.chordBars;
    const degree = changes && g.nextDegree !== undefined ? g.nextDegree : g.degree;
    const triad = this.harmony.chordTones(degree).slice(0, 3);

    let onsets, steps;
    if (pos === 0 || !this.motif) {
      onsets = this.rhythm(feel);
      steps = this.walk(onsets, triad);
      this.motif = { onsets, steps };
    } else if (pos === 1) {
      onsets = this.motif.onsets;
      const shift = Math.random() < 0.4 ? 0 : Math.random() < 0.5 ? 1 : -1;
      steps = this.motif.steps.map((s) => this.clamp(s + shift));
      steps[steps.length - 1] = this.nearestChordStep(steps[steps.length - 1], triad);
    } else if (pos === 2) {
      onsets = this.rhythm(feel);
      steps = this.walk(onsets, triad);
    } else {
      // Cadence: a short pickup, then a long note on the root of the chord.
      const n = Math.max(1, Math.min(2, feel.notes[0] - 1));
      onsets = this.rhythm(feel, n, 8);
      steps = this.walk(onsets, triad);
      steps[steps.length - 1] = this.nearestChordStep(steps[steps.length - 1], [triad[0]]);
    }
    if (!steps.length) return;
    this.cur = steps[steps.length - 1];

    // Turn onsets into notes: each lasts until the next one (with a ceiling).
    const start = bar * 16;
    onsets.forEach((o, k) => {
      const next = k + 1 < onsets.length ? onsets[k + 1] : 16;
      const len = pos === 3 && k === onsets.length - 1 ? 16 - o : Math.min(feel.maxLen, next - o);
      const abs = start + o;
      this.notes.push({
        abs, len, step: steps[k], code: this.codeFor(steps[k]),
        vel: o % 4 === 0 ? 0.85 : 0.65,
        t: tNow + (abs - absNow) * sixteenth, end: undefined, judged: null,
      });
    });
  }

  // Pick n onsets in the bar, weighted by the feel's grid (from step `from` on).
  rhythm(feel, n, from = 0) {
    const w = [...feel.grid].map((c) => (c === "." ? 0 : Number(c)));
    for (let i = 0; i < from; i++) w[i] = 0;
    if (n === undefined) n = feel.notes[0] + Math.floor(Math.random() * (feel.notes[1] - feel.notes[0] + 1));
    const out = [];
    for (let k = 0; k < n; k++) {
      const total = w.reduce((a, b) => a + b, 0);
      if (total === 0) break;
      let r = Math.random() * total, i = 0;
      while (r >= w[i]) r -= w[i++];
      out.push(i);
      w[i] = 0;
      if (i > 0) w[i - 1] *= 0.3; // no two notes glued together too often
      if (i < 15) w[i + 1] *= 0.3;
    }
    return out.sort((a, b) => a - b);
  }

  // A walk on the scale, one step per onset.
  walk(onsets, triad) {
    const steps = [];
    let cur = this.cur, lastMove = 0;
    for (const o of onsets) {
      const cands = [];
      for (let d = -3; d <= 3; d++) {
        const s = cur + d;
        if (s < 0 || s > TOP_STEP) continue;
        let w = { 0: 1, 1: 4, 2: 3, 3: 1 }[Math.abs(d)];
        if (Math.abs(lastMove) >= 3 && Math.sign(d) === Math.sign(lastMove)) w *= 0.2; // after a leap, turn back
        if (o % 4 === 0 && triad.includes(this.pcOf(s))) w *= 3; // strong beat: chord note
        cands.push([s, w]);
      }
      const total = cands.reduce((a, c) => a + c[1], 0);
      let r = Math.random() * total, pick = cands[0][0];
      for (const [s, w] of cands) { if ((r -= w) < 0) { pick = s; break; } }
      lastMove = pick - cur;
      cur = pick;
      steps.push(cur);
    }
    return steps;
  }

  pcOf(step) { return this.harmony.pc(step); }
  clamp(s) { return Math.max(0, Math.min(TOP_STEP, s)); }

  nearestChordStep(s, pcs) {
    for (let d = 0; d <= 3; d++) {
      for (const c of [s - d, s + d]) if (c >= 0 && c <= TOP_STEP && pcs.includes(this.pcOf(c))) return c;
    }
    return s;
  }

  // Scale step → key: steps 0–9 on the middle row, higher ones on the top row.
  codeFor(step) {
    return step <= 9 ? MELODY_ROWS[0][step] : MELODY_ROWS[1][step - 7];
  }

  // ---- Guide game ----

  // You pressed a key at audio time t: was a note due on it?
  judge(code, t) {
    if (this.mode !== "guide") return;
    let best = null;
    for (const n of this.notes) {
      if (n.judged || n.code !== code) continue;
      const dt = Math.abs(t - n.t);
      if (dt <= 0.15 && (!best || dt < Math.abs(t - best.t))) best = n;
    }
    if (!best) return;
    const dt = Math.abs(t - best.t);
    best.judged = dt <= 0.06 ? "perfect" : "good";
    this.hits++; this.judgedCount++;
    this.streak++; this.best = Math.max(this.best, this.streak);
    this.feedback.push({ text: best.judged === "perfect" ? "Perfect" : "Good", midi: this.melody.noteFor(code), t });
  }

  // Notes whose time has passed without a press: missed.
  sweep(now) {
    if (this.mode !== "guide") return;
    for (const n of this.notes) {
      if (n.judged || n.t + 0.15 > now) continue;
      n.judged = "miss";
      this.judgedCount++;
      this.streak = 0;
      this.feedback.push({ text: "Miss", midi: this.melody.noteFor(n.code), t: now });
    }
    this.feedback = this.feedback.filter((f) => now - f.t < 0.8);
  }

  resetScore() {
    this.streak = this.best = this.hits = this.judgedCount = 0;
  }
}
