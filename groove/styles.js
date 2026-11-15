// Groove styles, written as grids you can read and edit.
//
// One bar = 16 steps (sixteenth notes): "1 e & a 2 e & a 3 e & a 4 e & a".
// For each lane, two strings of 16 characters:
//   p = how likely a hit is on that step   . = never   1..9 = 10%..90%   X = always
//   v = how hard (velocity)                . = –       1..9 = soft..hard X = full
// Low velocity + medium probability = ghost notes, the small in-between hits that make
// funk feel alive. Because every bar is drawn again from the grid, the groove stays
// recognisable but never repeats exactly.
//
// The bass has a third string, n: which chord note to play on that step.
//   R = root   3 = third   5 = fifth   7 = seventh   8 = root an octave up
// (Just before a chord change the bass sometimes slides in from a semitone away:
// that is done by the engine, not written here.)
//
// Other settings:
//   bpm        tempo (quarter notes per minute)
//   swing      0..0.5: how late the off-sixteenths ("e" and "a") are pushed
//   chordBars  bars per chord
//   mode       scale used for the chords (see generator/harmony.js)
//   bassGate / keysGate  note length in seconds (short = staccato)
//   space      reverb send per lane (hats stay dry: in the room they turn to hiss)
//   echo       echo send per lane, and echoBeats: echo time in beats (0.75 = dotted 8th)
//   kit        (optional) a different sound for a lane, e.g. { snare: "rim" }

const GROOVE_STYLES = {
  funk: {
    name: "Funk",
    bpm: 98, swing: 0.14, chordBars: 4, mode: "dorian",
    bassGate: 0.13, keysGate: 0.09,
    space: { kick: 0, snare: 0.1, hat: 0, perc: 0.15, bass: 0, keys: 0.2 },
    echo: { kick: 0, snare: 0, hat: 0, perc: 0, bass: 0, keys: 0 }, echoBeats: 0.75,
    lanes: {
      //      "1e&a2e&a3e&a4e&a"
      kick:  { p: "X..4..7.X.3...5.", v: "9..6..8.8.5...6." },
      snare: { p: "....X..3.3.2X..4", v: "....9..2.2.29..3" },
      hat:   { p: "X7X7X7X7X7X7X7X6", v: "7383738373837393" },
      perc:  { p: "..........3.....", v: "..........6....." },
      bass:  { p: "X..7..X.5.6..4.6", v: "9..6..8.4.7..3.6", n: "R..8..R.R.5..8.7" },
      keys:  { p: ".6.7..5..6.7...5", v: ".6.8..6..6.8...6" },
    },
  },

  dub: {
    name: "Dub",
    bpm: 74, swing: 0.06, chordBars: 2, mode: "aeolian",
    kit: { snare: "rim" }, // one drop is played on the rim (cross-stick), not the skin
    bassGate: 0.5, keysGate: 0.14,
    // Dub's space is an echo, not a big room: a snare in a reverb turns into a hiss,
    // a snare in an echo stays a snare, repeated and melting away.
    space: { kick: 0, snare: 0.1, hat: 0, perc: 0.08, bass: 0, keys: 0.25 },
    echo: { kick: 0, snare: 0.55, hat: 0, perc: 0.4, bass: 0, keys: 0.35 }, echoBeats: 0.75,
    lanes: {
      //      "1e&a2e&a3e&a4e&a"
      kick:  { p: "........X.......", v: "........9......." }, // "one drop": nothing on 1
      snare: { p: "........X.......", v: "........8......." }, // rim, with the kick
      hat:   { p: "..6...6...6...6.", v: "..4...4...4...4." },
      perc:  { p: ".............3..", v: ".............5.." },
      bass:  { p: "X.....6.X..5..4.", v: "9.....7.8..6..6.", n: "R.....5.8..R..5." },
      keys:  { p: "....X.......X...", v: "....8.......8..." }, // the skank on 2 and 4
    },
  },

  bossa: {
    name: "Bossa nova",
    bpm: 70, swing: 0, chordBars: 2, mode: "ionian",
    bassGate: 0.35, keysGate: 0.22,
    space: { kick: 0, snare: 0, hat: 0, perc: 0.15, bass: 0, keys: 0.3 },
    echo: { kick: 0, snare: 0, hat: 0, perc: 0, bass: 0, keys: 0 }, echoBeats: 0.75,
    lanes: {
      //      "1e&a2e&a3e&a4e&a"
      kick:  { p: "X..4..6.X..4..6.", v: "6..4..5.6..4..5." },
      snare: { p: "................", v: "................" },
      hat:   { p: "X6X6X6X6X6X6X6X6", v: "4242424242424242" }, // a soft shaker
      perc:  { p: "X..X..X...X..X..", v: "7..7..7...7..7.." }, // bossa clave on the rim
      bass:  { p: "X.....X.X.....X.", v: "8.....6.8.....6.", n: "R.....5.5.....R." },
      keys:  { p: "X..6..X...7..6..", v: "6..5..6...6..5.." },
    },
  },
};

// Turn the strings into numbers once, and check them: a typo in a grid should say
// where it is instead of quietly breaking the groove.
function compileStyles(styles) {
  const value = (c) => (c === "." ? 0 : c === "X" ? 1 : Number(c) / 10);
  for (const [id, style] of Object.entries(styles)) {
    for (const [lane, g] of Object.entries(style.lanes)) {
      for (const key of ["p", "v", "n"]) {
        if (g[key] !== undefined && g[key].length !== 16) {
          throw new Error(`Groove style "${id}", lane "${lane}": "${key}" has ${g[key].length} steps instead of 16`);
        }
      }
      g.prob = [...g.p].map(value);
      g.vel = [...g.v].map(value);
    }
  }
  return styles;
}
compileStyles(GROOVE_STYLES);
