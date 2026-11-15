// Composer: writes a melody that fits the groove, one bar ahead, on the melody keys.
//
// What makes a melody fit (and what this file does about each):
// - It lands on the chord. Notes on strong beats and long notes are always notes of the
//   chord playing then. In between, short passing notes come from the pentatonic (the
//   5 notes of the scale with no half steps), never a semitone above a chord note: that
//   is the one interval that grates when held.
// - It has its own space. It sits above the chords (MIDI 66–84, the keys play below 67)
//   and it breathes: the rhythms have rests.
// - It speaks the style. Rhythms come from small hand-written phrase shapes per style:
//   funk = short syncopated stabs, dub = long melodica notes off the beat, bossa = long
//   tied notes that sway. The lead's sound changes with the style too (see main.js).
// - It repeats, so the ear can follow. 4-bar phrases: A, A again (same rhythm, same
//   shape moved onto the new chord), B (an answer), and a cadence that ends long on
//   the root.
//
// Rhythm shapes: one character per sixteenth, x = a note starts, - = it holds,
// . = silence. Notes are positions on the keyboard rows (scale steps), so the same plan
// can be played by the computer (Auto) or shown to you (Guide).
//
// Each note: { abs, len, step, code, t, end, judged } — abs = step index on the groove
// clock, len in sixteenths, t / end = audio times (estimated, then exact when it comes).

const PHRASES = {
  Funk: {
    motifs: ["x.x...x...x.x...", "..x.x...x.x...x.", "x..x..x...x-x...", "...x.x..x...x.x."],
    cadences: ["x.x...x---------", "..x.x...x-------"],
  },
  Dub: {
    motifs: ["....x---....x---", "..x-----......x-", "x-------..x-x---", "....x-x-....x---"],
    cadences: ["....x-----------", "x-------........"],
  },
  "Bossa nova": {
    motifs: ["x-.x--x-........", "..x--x--x---....", "x---..x-x--x....", "....x-x--x--x---"],
    cadences: ["x--x--x---------", "..x--x--x-------"],
    sevenths: true, // bossa melodies love the 7th of the chord
  },
};
const MELODY_RANGE = [66, 84]; // MIDI: above the keys, below shrill
// Pentatonic = these scale steps (0-based) of each mode: no half steps between them.
const PENTA = {
  ionian: [0, 1, 2, 4, 5], lydian: [0, 1, 2, 4, 5], mixolydian: [0, 1, 2, 4, 5],
  dorian: [0, 2, 3, 4, 6], aeolian: [0, 2, 3, 4, 6], phrygian: [0, 2, 3, 4, 6],
};

// "x.x-" → [{ o: 0, len: 1 }, { o: 2, len: 2 }]
function parsePhrase(shape) {
  if (shape.length !== 16) throw new Error(`Melody shape "${shape}" has ${shape.length} steps instead of 16`);
  const out = [];
  for (let i = 0; i < 16; i++) {
    if (shape[i] !== "x") continue;
    let len = 1;
    while (i + len < 16 && shape[i + len] === "-") len++;
    out.push({ o: i, len });
  }
  return out;
}
for (const p of Object.values(PHRASES)) {
  p.motifs = p.motifs.map(parsePhrase);
  p.cadences = p.cadences.map(parsePhrase);
}

const pick = (list) => list[Math.floor(Math.random() * list.length)];

class Composer {
  constructor(groove, harmony, melody) {
    this.groove = groove;
    this.harmony = harmony;
    this.melody = melody;
    this.mode = "free";  // "free" | "guide" | "auto"
    this.notes = [];     // planned and recent notes
    this.reset();
    // Guide game.
    this.streak = 0; this.best = 0; this.hits = 0; this.judgedCount = 0;
    this.feedback = [];  // { text, midi, t } for the stage
  }

  reset() {
    this.notes = [];
    this.phrase = null;  // { a, b, cadence, aSteps } for the 4 bars being written
    this.prev = null;    // last scale step written
    this.bars = 0;
    this.lastBarAbs = undefined;
  }

  // Called by the groove for every step it schedules.
  onStep(i, abs, t, sixteenth) {
    if (this.mode === "free") return;
    this.sixteenth = sixteenth;
    // At each downbeat, write the bar after this one. A bar that starts early (a drop)
    // leaves the notes planned on the old grid off the beat: forget them.
    if (i === 0) {
      if (this.lastBarAbs !== undefined && abs !== this.lastBarAbs + 16) {
        this.notes = this.notes.filter((n) => n.end !== undefined);
      }
      this.lastBarAbs = abs;
      this.planBar(++this.bars, abs, t, sixteenth);
    }
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
    const book = PHRASES[g.core.name] || PHRASES.Funk;
    const pos = (bar - 1) % 4; // place in the 4-bar phrase
    if (pos === 0 || !this.phrase) {
      const a = pick(book.motifs);
      let b = pick(book.motifs);
      if (b === a && book.motifs.length > 1) b = book.motifs[(book.motifs.indexOf(a) + 1) % book.motifs.length];
      this.phrase = { a, b, cadence: pick(book.cadences), aSteps: null };
    }
    const ph = this.phrase;
    const rhythm = pos <= 1 ? ph.a : pos === 2 ? ph.b : ph.cadence;

    // The chord that will be playing in that bar.
    const changes = g.barsInChord + 1 >= g.core.chordBars;
    const degree = changes && g.nextDegree !== undefined ? g.nextDegree : g.degree;
    const tones = this.harmony.chordTones(degree);
    const chord = book.sevenths ? tones.slice(0, 4) : tones.slice(0, 3);
    const triad = tones.slice(0, 3);

    let steps;
    if (pos === 1 && ph.aSteps) {
      // Same rhythm, same shape: each note moves to the nearest fitting note of the new chord.
      steps = rhythm.map((n, k) => this.nearest(ph.aSteps[k], this.allowed(n, chord, triad)));
    } else {
      steps = this.line(rhythm, chord, triad);
    }
    if (pos === 0) ph.aSteps = steps;
    if (pos === 3) {
      // The cadence ends on the root of the chord.
      const k = steps.length - 1;
      steps[k] = this.nearest(steps[k], this.stepsWhere((pc) => pc === tones[0]));
    }
    if (steps.length) this.prev = steps[steps.length - 1];

    const start = absNow + 16;
    rhythm.forEach((n, k) => {
      const abs = start + n.o;
      this.notes.push({
        abs, len: n.len, step: steps[k], code: this.codeFor(steps[k]),
        vel: n.o % 4 === 0 ? 0.85 : 0.68,
        t: tNow + (abs - absNow) * sixteenth, end: undefined, judged: null,
      });
    });
  }

  // Scale steps (0–16, the two rows) inside the melody range whose note passes `test`.
  stepsWhere(test) {
    const out = [];
    for (let s = 0; s <= 16; s++) {
      const midi = this.melody.noteFor(this.codeFor(s));
      if (midi < MELODY_RANGE[0] || midi > MELODY_RANGE[1]) continue;
      if (test(midi % 12, s)) out.push(s);
    }
    return out;
  }

  // Which steps a note may use: chord notes if it is on a beat or long, otherwise
  // pentatonic passing notes too (but never a semitone above a chord note).
  allowed(n, chord, triad) {
    const strong = n.o % 4 === 0 || n.len >= 3;
    const chordSteps = this.stepsWhere((pc) => (strong ? triad : chord).includes(pc));
    if (strong) return chordSteps;
    const penta = PENTA[this.harmony.mode] || PENTA.dorian;
    const clash = (pc) => chord.some((c) => (pc - c + 12) % 12 === 1) && !chord.includes(pc);
    const passing = this.stepsWhere((pc, s) => penta.includes(s % 7) && !clash(pc));
    return [...new Set([...chordSteps, ...passing])];
  }

  // A line through the rhythm: mostly steps, sometimes a leap (then turning back).
  line(rhythm, chord, triad) {
    const steps = [];
    let prev = this.prev, lastMove = 0;
    for (const n of rhythm) {
      const cands = this.allowed(n, chord, triad);
      if (!cands.length) { steps.push(prev ?? 7); continue; }
      if (prev === null) { prev = this.nearest(7, cands); steps.push(prev); continue; }
      const weights = cands.map((s) => {
        const d = s - prev;
        let w = { 0: 1.2, 1: 4, 2: 3, 3: 1.5, 4: 0.7, 5: 0.35 }[Math.abs(d)] ?? 0.1;
        if (Math.abs(lastMove) >= 3 && Math.sign(d) === Math.sign(lastMove)) w *= 0.2;
        return w;
      });
      const total = weights.reduce((a, b) => a + b, 0);
      let r = Math.random() * total, k = 0;
      while ((r -= weights[k]) > 0 && k < cands.length - 1) k++;
      lastMove = cands[k] - prev;
      prev = cands[k];
      steps.push(prev);
    }
    return steps;
  }

  nearest(s, cands) {
    if (!cands.length) return s;
    return cands.reduce((best, c) => (Math.abs(c - s) < Math.abs(best - s) ? c : best), cands[0]);
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
