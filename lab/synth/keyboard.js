// Play the synth from the computer keyboard (Ableton-style layout) or by clicking keys.
//
// We use `event.code`, the PHYSICAL key position, not the letter printed on it.
// So the layout is the same on QWERTY and AZERTY: the middle row is the white keys
// (A S D F… on QWERTY = Q S D F… on AZERTY), the row above holds the black keys.

const CODE_TO_OFFSET = {
  KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6, KeyG: 7,
  KeyY: 8, KeyH: 9, KeyU: 10, KeyJ: 11, KeyK: 12, KeyO: 13, KeyL: 14, KeyP: 15, Semicolon: 16,
};
const OFFSET_TO_CODE = Object.fromEntries(Object.entries(CODE_TO_OFFSET).map(([c, o]) => [o, c]));
const BLACK = new Set([1, 3, 6, 8, 10]); // semitones within an octave that are black keys
const RANGE = 24; // on-screen keyboard: two octaves + top C

class Keyboard {
  constructor(root, synth, onOctave) {
    this.root = root;
    this.synth = synth;
    this.onOctave = onOctave;
    this.base = 48;            // C3: lowest note of the on-screen keyboard
    this.hold = false;         // latch mode: notes keep playing after the key is released
    this.active = new Set();   // notes currently on
    this.codeNote = new Map(); // physical key → the note it started (survives octave changes)
    this.pointerNote = new Map();
    this.layout = null;

    // Chrome can tell us the real letter on each physical key (for the labels).
    if (navigator.keyboard && navigator.keyboard.getLayoutMap) {
      navigator.keyboard.getLayoutMap().then((m) => { this.layout = m; this.render(); }).catch(() => {});
    }

    window.addEventListener("keydown", (e) => this.onKeyDown(e));
    window.addEventListener("keyup", (e) => this.onKeyUp(e));
    window.addEventListener("blur", () => { if (!this.hold) this.releaseAll(); });
    root.addEventListener("pointerdown", (e) => this.onPointerDown(e));
    window.addEventListener("pointerup", (e) => this.onPointerUp(e));
    window.addEventListener("pointercancel", (e) => this.onPointerUp(e));

    this.render();
  }

  // ---- Note logic (shared by computer keys and mouse/touch) ----

  press(note) {
    if (this.hold && this.active.has(note)) {
      // In hold mode, pressing a sounding note again turns it off.
      this.synth.noteOff(note);
      this.active.delete(note);
    } else {
      this.synth.noteOn(note);
      this.active.add(note);
    }
    this.refresh();
  }

  release(note) {
    if (this.hold) return;
    this.synth.noteOff(note);
    this.active.delete(note);
    this.refresh();
  }

  releaseAll() {
    for (const n of this.active) this.synth.noteOff(n);
    this.active.clear();
    this.codeNote.clear();
    this.refresh();
  }

  // Play another instrument. In Hold mode, the notes left ringing stay on the old one
  // (so you can hold a pad chord and play bells over it); otherwise they are released.
  setSynth(synth) {
    if (synth === this.synth) return;
    if (this.hold) {
      this.active.clear();
      this.codeNote.clear();
      this.refresh();
    } else {
      this.releaseAll();
    }
    this.synth = synth;
  }

  setHold(on) {
    this.hold = on;
    if (!on) this.releaseAll();
  }

  shiftOctave(dir) {
    this.base = Math.min(84, Math.max(24, this.base + dir * 12));
    this.render();
    this.onOctave(this.base);
  }

  // ---- Event handlers ----

  onKeyDown(e) {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.code === "KeyZ") return this.shiftOctave(-1);
    if (e.code === "KeyX") return this.shiftOctave(1);
    const offset = CODE_TO_OFFSET[e.code];
    if (offset === undefined) return;
    e.preventDefault();
    const note = this.base + offset;
    this.codeNote.set(e.code, note);
    this.press(note);
  }

  onKeyUp(e) {
    const note = this.codeNote.get(e.code);
    if (note === undefined) return;
    this.codeNote.delete(e.code);
    this.release(note);
  }

  onPointerDown(e) {
    const key = e.target.closest(".key");
    if (!key) return;
    e.preventDefault();
    const note = Number(key.dataset.note);
    this.pointerNote.set(e.pointerId, note);
    this.press(note);
  }

  onPointerUp(e) {
    const note = this.pointerNote.get(e.pointerId);
    if (note === undefined) return;
    this.pointerNote.delete(e.pointerId);
    this.release(note);
  }

  // ---- Drawing ----

  keyLabel(code) {
    const k = this.layout && this.layout.get(code);
    return (k || code.replace("Key", "").replace("Semicolon", ";")).toUpperCase();
  }

  render() {
    this.root.innerHTML = "";
    let whiteCount = 0;
    for (let i = 0; i <= RANGE; i++) if (!BLACK.has((this.base + i) % 12)) whiteCount++;
    const w = 100 / whiteCount;

    let wi = 0; // index of the current white key
    for (let i = 0; i <= RANGE; i++) {
      const note = this.base + i;
      const black = BLACK.has(note % 12);
      const el = document.createElement("div");
      el.className = "key " + (black ? "black" : "white");
      el.dataset.note = note;
      if (black) {
        el.style.left = `${wi * w - w * 0.3}%`;
        el.style.width = `${w * 0.6}%`;
      } else {
        el.style.left = `${wi * w}%`;
        el.style.width = `${w}%`;
        wi++;
      }
      const code = OFFSET_TO_CODE[i];
      if (code) el.insertAdjacentHTML("beforeend", `<span class="key-letter">${this.keyLabel(code)}</span>`);
      if (note % 12 === 0) el.insertAdjacentHTML("beforeend", `<span class="key-name">${noteName(note)}</span>`);
      this.root.appendChild(el);
    }
    this.refresh();
  }

  refresh() {
    for (const el of this.root.children) {
      el.classList.toggle("on", this.active.has(Number(el.dataset.note)));
    }
  }
}
