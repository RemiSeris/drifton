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
// - It has a form, like a song (v3). 16 bars in four 4-bar sections:
//     A    the motif, the motif again, an answer, a cadence
//     A'   the motif developed (moved up the scale, shifted in time, turned upside down
//          or ornamented, depending on the style), the answer, a cadence
//     B    contrast: a new motif, higher, and its answer, ending open (not on the root)
//     A''  back home: the motif, the answer, a final cadence on the root
//   A motif is kept as a rhythm + a shape (the intervals between its notes): each time
//   it comes back, the shape is laid on the chord playing then, so the ear recognises
//   it even when the harmony has moved.
// - It speaks the style: approach notes (a neighbour note just before a strong-beat
//   note, bossa, boom bap, trip-hop), horn lines doubled an octave below (afrobeat),
//   a third under the strong notes (house), hooks repeated as they are (reggaeton).
// - It breathes in dynamics: each section has its level (B the strongest), each phrase
//   rises then settles at the cadence, beats are accented.
//
// Rhythm shapes: one character per sixteenth, x = a note starts, - = it holds,
// . = silence. Notes are positions on the keyboard rows (scale steps), so the same plan
// can be played by the computer (Auto) or shown to you (Guide).
//
// Each note: { abs, len, step, code, t, end, judged } — abs = step index on the groove
// clock, len in sixteenths, t / end = audio times (estimated, then exact when it comes).

// play: how the composer plays the notes it writes (Auto mode), per style.
//   gate   = how much of the written length sounds (0.5 = short and punchy, >1 = notes
//            overlap: legato, and the sounds with glide slide from one to the next)
//   late   = seconds behind the beat (a laid-back feel)
//   jitter = random timing, in seconds, a human never plays exactly on the grid
const PLAY_DEFAULT = { gate: 0.9, late: 0, jitter: 0.008 };
const PHRASES = {
  Funk: {
    play: { gate: 0.5, late: 0, jitter: 0.006 }, // staccato
    develop: ["displace", "ornament"], b: "denser", // riffs: shifted, decorated, not moved
    motifs: ["x.x...x...x.x...", "..x.x...x.x...x.", "x..x..x...x-x...", "...x.x..x...x.x."],
    cadences: ["x.x...x---------", "..x.x...x-------"],
  },
  Dub: {
    play: { gate: 1.0, late: 0.01, jitter: 0.01 },
    develop: ["transpose", "displace"], b: "sparser",
    motifs: ["....x---....x---", "..x-----......x-", "x-------..x-x---", "....x-x-....x---"],
    cadences: ["....x-----------", "x-------........"],
  },
  "Bossa nova": {
    play: { gate: 1.08, late: 0, jitter: 0.01 }, // legato
    develop: ["transpose", "ornament"], approach: true,
    motifs: ["x-.x--x-........", "..x--x--x---....", "x---..x-x--x....", "....x-x--x--x---"],
    cadences: ["x--x--x---------", "..x--x--x-------"],
    sevenths: true, // bossa melodies love the 7th of the chord
  },
  House: { // short piano-like riffs that answer the off-beat bass
    play: { gate: 0.7, late: 0, jitter: 0.005 },
    develop: ["transpose", "displace"], double: "third",
    motifs: ["x.x...x...x.x...", "..x-..x-..x-..x-", "x--.x--.x---....", "....x-x-....x-x-"],
    cadences: ["x-x-x-----------", "..x-..x---------"],
  },
  Afrobeat: { // horn lines: punchy, repeated, call and response
    play: { gate: 0.8, late: 0, jitter: 0.008 },
    develop: ["transpose", "displace"], double: "octave",
    motifs: ["x.x.x...x.x.....", "..x.x.x-....x.x.", "x-..x-..x.x.x...", "....x.x.x-x-...."],
    cadences: ["x.x.x-----------", "....x.x.x-------"],
  },
  "Boom bap": { // laid back, few notes, behind the beat (the swing does that)
    play: { gate: 0.95, late: 0.018, jitter: 0.012 }, // a hair behind the beat
    develop: ["transpose", "invert"], approach: true, b: "sparser",
    motifs: ["x---....x-x-....", "....x-x---......", "..x---....x---..", "x-x---......x---"],
    cadences: ["x---------------", "....x-----------"],
    sevenths: true,
  },
  "Trip-hop": { // slow, long, lonely notes with lots of space
    play: { gate: 1.08, late: 0.012, jitter: 0.012 },
    develop: ["transpose", "invert"], approach: true,
    motifs: ["x-------........", "........x-----x-", "....x---x-------", "x---....x---...."],
    cadences: ["x---------------", "........x-------"],
  },
  Reggaeton: { // follows the dembow's syncopation
    play: { gate: 0.55, late: 0, jitter: 0.005 },
    develop: ["none"], // a hook comes back exactly as it was
    motifs: ["...x..x....x..x.", "x..x..x.x.......", "...x..x-x-......", "x-.x-.x-........"],
    cadences: ["...x..x---------", "x..x..x---------"],
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

// A rhythm shifted later by `by` sixteenths (what falls past the bar is dropped).
function displace(rhythm, by) {
  return rhythm.filter((n) => n.o + by < 16).map((n) => ({ o: n.o + by, len: Math.min(n.len, 16 - n.o - by) }));
}

class Composer {
  constructor(groove, harmony, melody) {
    this.groove = groove;
    this.harmony = harmony;
    this.melody = melody;
    this.mode = "free";  // "free" | "guide" | "auto"
    this.notes = [];     // planned and recent notes
    this.themeSource = null; // optional () → looper with a theme: Guide hands you the theme
    this.reset();
    // Guide game.
    this.streak = 0; this.best = 0; this.hits = 0; this.judgedCount = 0;
    this.feedback = [];  // { text, midi, t } for the stage
  }

  reset() {
    this.notes = [];
    this.song = null;    // the 16-bar plan being written (see newSong)
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
        // Played with the style's phrasing: length, a little behind or not, never
        // exactly on the grid, never twice exactly as loud.
        const pl = (PHRASES[this.groove.core.name] || {}).play || PLAY_DEFAULT;
        const tp = Math.max(t, t + pl.late + (Math.random() - 0.5) * pl.jitter);
        const vel = Math.max(0.2, Math.min(1, n.vel + (Math.random() - 0.5) * 0.12));
        this.melody.press(n.code, vel, tp);
        this.melody.release(n.code, tp + n.len * sixteenth * pl.gate);
      }
    }
    // Keep only what is recent or to come.
    this.notes = this.notes.filter((n) => n.end === undefined || n.end > t - 2);
  }

  // ---- Writing ----

  planBar(bar, absNow, tNow, sixteenth) {
    const g = this.groove;
    // Guide with a recorded theme: the notes to play are the theme's, bar by bar.
    const src = this.mode === "guide" && this.themeSource ? this.themeSource() : null;
    if (src) {
      for (const n of src.themeBar(g.bar)) {
        const abs = absNow + 16 + n.o;
        this.notes.push({
          abs, len: n.len, step: null, code: n.code, vel: 0.8,
          t: tNow + (abs - absNow) * sixteenth, end: undefined, judged: null,
        });
      }
      return;
    }
    const book = PHRASES[g.core.name] || PHRASES.Funk;
    const cyc = (bar - 1) % 16;
    const section = Math.floor(cyc / 4); // 0 A, 1 A', 2 B, 3 A''
    const pos = cyc % 4;                 // bar in the section
    if (!this.song || cyc === 0 || this.song.style !== book) this.song = this.newSong(book);
    const song = this.song;

    // The chord that will be playing in that bar.
    const degree = g.upcomingDegree();
    const tones = this.harmony.chordTones(degree);
    const chord = book.sevenths ? tones.slice(0, 4) : tones.slice(0, 3);
    const triad = tones.slice(0, 3);
    const fit = (rhythm, idea, shift = 0, invert = false) =>
      this.realize(rhythm, idea, shift, invert, chord, triad);

    let rhythm, steps;
    const last = pos === 3;
    if (section === 2) {
      // B: contrast. Its own motif, higher; its answer; an open ending.
      if (pos <= 1) { rhythm = song.p; steps = fit(rhythm, song.ideas.p); }
      else if (pos === 2) { rhythm = song.q; steps = fit(rhythm, song.ideas.q); }
      else { rhythm = song.c; steps = fit(rhythm, song.ideas.c, 3); }
    } else if (pos <= 1) {
      // The motif: as it was (A, A''), or developed (A').
      rhythm = song.m;
      let shift = 0, invert = false;
      if (section === 1) {
        const how = song.develop;
        if (how === "transpose") shift = pos === 0 ? song.step : 2 * song.step; // a sequence
        if (how === "displace") rhythm = displace(song.m, 2);
        if (how === "invert") invert = true;
      }
      steps = fit(rhythm, song.ideas.m, shift, invert);
    } else if (pos === 2) {
      rhythm = song.n; steps = fit(rhythm, song.ideas.n);
    } else {
      rhythm = song.c; steps = fit(rhythm, song.ideas.c);
    }

    // Endings: home on the root at the end of A, A' and A''; open (3rd or 5th) after B.
    if (last && steps.length) {
      const k = steps.length - 1;
      const target = section === 2 ? [tones[1], tones[2]] : [tones[0]];
      steps[k] = this.nearest(steps[k], this.stepsWhere((pc) => target.includes(pc)));
    }

    // Notes, with their dynamics: a level per section (B the strongest), a rise through
    // the phrase that settles at the cadence, accents on the beats.
    const level = [0.6, 0.66, 0.84, 0.72][section] + [0, 0.04, 0.09, -0.05][pos];
    let notes = rhythm.map((n, k) => ({
      o: n.o, len: n.len, step: steps[k],
      vel: level + (n.o % 4 === 0 ? 0.1 : n.o % 4 === 2 ? 0.03 : 0) + (last && k === rhythm.length - 1 ? 0.05 : 0),
    }));
    const ornament = book.approach || (section === 1 && song.develop === "ornament");
    if (ornament && this.mode !== "guide") notes = this.approach(notes, song.seed + rhythm.length * 7);
    if (notes.length) this.prev = notes[notes.length - 1].step;

    const start = absNow + 16;
    for (const n of notes) {
      const abs = start + n.o;
      const base = { abs, len: n.len, t: tNow + (abs - absNow) * sixteenth, end: undefined, judged: null };
      const vel = Math.max(0.3, Math.min(1, n.vel));
      this.notes.push({ ...base, step: n.step, code: this.codeFor(n.step), vel });
      // Doubling (Auto only: in Guide you play the melody itself).
      if (book.double && this.mode === "auto" && (n.len >= 2 || n.o % 4 === 0)) {
        const d = book.double === "octave" ? n.step - 7 : n.step - 2;
        const pc = this.pcOf(d);
        if (d >= 0 && (book.double === "octave" || triad.includes(pc))) {
          this.notes.push({ ...base, step: d, code: this.codeFor(d), vel: vel * 0.8, extra: true });
        }
      }
    }
  }

  // A new song plan: the rhythms of each section and how A' will develop the motif.
  newSong(book) {
    const by = (list) => [...list].sort((a, b) => a.length - b.length);
    const m = pick(book.motifs);
    const others = book.motifs.filter((r) => r !== m);
    const n = others.length ? pick(others) : m;
    // B: a motif different from A's; denser or sparser as the style likes.
    const rest = others.filter((r) => r !== n);
    const pool = rest.length ? rest : others.length ? others : [m];
    const p = book.b === "denser" ? by(pool)[pool.length - 1] : book.b === "sparser" ? by(pool)[0] : pick(pool);
    const q = pick(book.motifs.filter((r) => r !== p)) || p;
    return {
      style: book, m, n, p, q, c: pick(book.cadences),
      develop: pick(book.develop || ["transpose"]),
      step: pick([2, -2, 3]),
      seed: Math.floor(Math.random() * 1e6), // fixes the ornaments: a motif comes back as it was
      ideas: { m: null, n: null, p: null, q: null, c: null }, // shapes, once written
    };
  }

  // Lay a rhythm on the current chord. The first time, the line is invented (and its
  // shape kept); the next times, the kept shape is followed: each note goes to the
  // fitting note of the scale nearest to where the shape says it should be.
  realize(rhythm, ideaHolder, shift, invert, chord, triad) {
    let idea = ideaHolder;
    const isB = this.song.p === rhythm || this.song.q === rhythm;
    if (!idea) {
      // Register: A around MIDI 70, B about a fifth higher.
      this.prev = this.nearest(this.stepNear(isB ? 78 : 70), this.stepsWhere(() => true));
      const steps = this.line(rhythm, chord, triad);
      if (!steps.length) return steps;
      idea = { anchor: steps[0], shape: steps.map((x) => x - steps[0]), onsets: rhythm.map((n) => n.o) };
      // Remember it under its name (m, n, p, q or c).
      for (const k of ["m", "n", "p", "q", "c"]) {
        if (this.song[k] === rhythm && this.song.ideas[k] === null) { this.song.ideas[k] = idea; break; }
      }
      if (!shift && !invert) return steps;
    }
    return rhythm.map((n, k) => {
      // Notes shifted in time keep their place in the shape by onset order.
      const j = Math.min(k, idea.shape.length - 1);
      const target = idea.anchor + shift + (invert ? -idea.shape[j] : idea.shape[j]);
      return this.nearest(target, this.allowed(n, chord, triad));
    });
  }

  // Approach notes: just before some strong-beat notes, a neighbour from the scale
  // (from above or below) on the sixteenth before, if that sixteenth is free.
  // Which notes get one, and from which side, is decided by the song's seed, not drawn
  // again each bar: when a motif comes back, its ornaments come back with it.
  approach(notes, seed) {
    const out = notes.map((n) => ({ ...n }));
    const roll = (o, k) => { const x = Math.sin(seed * 12.9898 + o * 78.233 + k * 37.719) * 43758.5453; return x - Math.floor(x); };
    let added = 0;
    for (const n of out.slice()) {
      if (added >= 2 || n.o === 0 || n.o % 4 !== 0 || roll(n.o, 1) > 0.6) continue;
      const slot = n.o - 1;
      const before = out.find((m) => m !== n && m.o < n.o && m.o + m.len > slot);
      if (before) {
        if (slot - before.o < 1) continue; // no room: the note before would vanish
        before.len = slot - before.o;
      }
      if (out.some((m) => m.o === slot)) continue;
      const from = n.step + (roll(n.o, 2) < 0.5 ? 1 : -1);
      const ok = this.stepsWhere(() => true).includes(from);
      if (!ok) continue;
      out.push({ o: slot, len: 1, step: from, vel: n.vel - 0.12 });
      added++;
    }
    return out.sort((a, b) => a.o - b.o);
  }

  // The scale step whose note is nearest to a MIDI note.
  stepNear(midi) {
    let best = 0, bestD = Infinity;
    for (let s = 0; s <= 16; s++) {
      const d = Math.abs(this.melody.noteFor(this.codeFor(s)) - midi);
      if (d < bestD) { bestD = d; best = s; }
    }
    return best;
  }

  pcOf(step) { return this.melody.noteFor(this.codeFor(step)) % 12; }

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
