// A short built-in piece to try the player without a file: the "Ode to Joy" theme
// (Beethoven, public domain), melody in the right hand and a simple left hand.

function demoSong() {
  const beat = 0.6; // 100 bpm
  const right =
    "E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | E4:1.5 D4:0.5 D4:2 |" +
    "E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | D4:1.5 C4:0.5 C4:2 |" +
    "D4 D4 E4 C4 | D4 E4:0.5 F4:0.5 E4 C4 | D4 E4:0.5 F4:0.5 E4 D4 | C4 D4 G3:2 |" +
    "E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | D4:1.5 C4:0.5 C4:2";
  const left =
    "C3:2 G3:2 | G2:2 D3:2 | C3:2 G3:2 | G2:2 D3:2 |" +
    "C3:2 G3:2 | G2:2 D3:2 | C3:2 G3:2 | G2:2 C3:2 |" +
    "G2:2 C3:2 | G2:2 C3:2 | G2:2 C3:2 | C3:2 G2:2 |" +
    "C3:2 G3:2 | G2:2 D3:2 | C3:2 G3:2 | G2:2 C3:2";

  const notes = [];
  [right, left].forEach((line, part) => {
    let t = 0;
    for (const token of line.split(/[\s|]+/).filter(Boolean)) {
      const [name, beats = "1"] = token.split(":");
      const length = Number(beats) * beat;
      notes.push({
        pitch: pitchOf(name),
        velocity: part === 0 ? 0.7 : 0.5,
        start: t,
        end: t + length * 0.92, // a tiny gap between notes, like real playing
        soundEnd: t + length * 0.92,
        part,
      });
      t += length;
    }
  });
  const bars = Array.from({ length: 16 }, (_, i) => i * 4 * beat);
  return makeSong(notes, [{ name: "Right hand" }, { name: "Left hand" }], bars, { bpm: 100 });
}

// "C4" → 60, "F#3" → 54
function pitchOf(name) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]];
  const shift = m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0;
  return 12 * (Number(m[3]) + 1) + base + shift;
}
