// Groove page: builds the instruments, wires the controls and draws the step grid.

const ctx = new AudioContext();
const master = new MasterBus(ctx);
master.input.gain.value = 0.8;
master.reverb.setSize(3.5); // a smaller room than Focus music: rhythm needs air, not fog

// Two synth sounds of our own (not the saved ones: these are made for rhythm).
const BASS_PATCH = {
  ...makePatch("Bass"),
  "filter.cutoff": 260, "filter.env": 2.2, "fenv.decay": 0.22,
  "amp.release": 0.06, volume: 0.8,
};
const KEYS_PATCH = {
  ...defaultParams(),
  "a.unison": 1, "a.spread": 0, "a.width": 0, "a.level": 0.5,
  "b.wave": "square", "b.octave": 0, "b.fine": 7, "b.level": 0.3,
  "noise.level": 0,
  "filter.cutoff": 900, "filter.res": 0.3, "filter.env": 2.5,
  "fenv.attack": 0.002, "fenv.decay": 0.18, "fenv.sustain": 0.1, "fenv.release": 0.1,
  "amp.attack": 0.003, "amp.decay": 0.25, "amp.sustain": 0.35, "amp.release": 0.12,
  "mod1.src": "off", "mod3.src": "off", "mod2.amount": 0.25,
  volume: 0.5,
};

// A tape echo for dub, next to the shared reverb.
const echo = new Echo(ctx);
echo.output.connect(master.input);

// The DJ filter sits on the whole mix (reverb included), just before the limiter.
const djf = new DJFilter(ctx);
djf.insert(master);

const drums = new Drums(ctx, master.input, master.send, echo.input);
const synths = {
  bass: new Synth(ctx, BASS_PATCH, master.input, master.send),
  keys: new Synth(ctx, KEYS_PATCH, master.input, master.send),
};
const harmony = new Harmony(2, "dorian");
const groove = new Groove(ctx, drums, synths, harmony);

// The lead you play from the keyboard: two detuned saws, a soft filter, a slow vibrato.
const LEAD_PATCH = {
  ...defaultParams(),
  "a.wave": "sawtooth", "a.unison": 2, "a.spread": 0.15, "a.width": 0.4, "a.level": 0.45,
  "b.wave": "square", "b.octave": 0, "b.fine": -6, "b.level": 0.2,
  "noise.level": 0,
  "filter.cutoff": 1800, "filter.res": 0.2, "filter.env": 1.2,
  "fenv.attack": 0.005, "fenv.decay": 0.35, "fenv.sustain": 0.4, "fenv.release": 0.3,
  "amp.attack": 0.006, "amp.decay": 0.3, "amp.sustain": 0.7, "amp.release": 0.25,
  "lfo1.shape": "sine", "lfo1.rate": 5.5,
  "mod1.src": "lfo1", "mod1.dst": "pitch", "mod1.amount": 0.06,
  "mod2.src": "off", "mod3.src": "off",
  "fx.reverb": 0.3,
  volume: 0.45,
};
// Presets for the FM and plucked-string engines (synth/fm.js, synth/pluck.js).
const SOUNDS = {
  epiano: { engine: "fm", // tine electric piano: a body (ratio 1) and a metallic click (ratio 14)
    "m1.ratio": 1, "m1.index": 1.4, "m1.decay": 1.0, "m1.sustain": 0.25,
    "m2.ratio": 14, "m2.index": 0.9, "m2.decay": 0.06,
    attack: 0.002, decay: 2.2, sustain: 0.15, release: 0.35,
    tremolo: 0.25, tremRate: 4.2, velBright: 0.8, level: 0.24, "fx.reverb": 0.3 },
  bells: { engine: "fm", // an odd ratio (3.5) makes the partials inharmonic: a bell
    "m1.ratio": 3.5, "m1.index": 2.2, "m1.decay": 3, "m1.sustain": 0.2,
    "m2.ratio": 1.41, "m2.index": 0.4, "m2.decay": 1,
    attack: 0.001, decay: 3.5, sustain: 0, release: 2.5, level: 0.16, "fx.reverb": 0.5 },
  marimba: { engine: "fm", // the 4th harmonic, struck and gone fast: a wooden bar
    "m1.ratio": 4, "m1.index": 1.6, "m1.decay": 0.12, "m1.sustain": 0,
    "m2.ratio": 10, "m2.index": 0.4, "m2.decay": 0.02,
    attack: 0.001, decay: 0.5, sustain: 0, release: 0.25, level: 0.5, "fx.reverb": 0.25 },
  brass: { engine: "fm", // the brightness swells in after the note starts: the "blat" of a horn
    "m1.ratio": 1, "m1.index": 2.8, "m1.attack": 0.06, "m1.decay": 0.5, "m1.sustain": 0.6,
    attack: 0.03, decay: 0.5, sustain: 0.8, release: 0.15,
    velBright: 0.9, detune: 6, level: 0.33, "fx.reverb": 0.2 },
  clavinet: { engine: "pluck", // a bright string hit near its end, damped as soon as you let go
    decay: 0.9, brightness: 0.95, pick: 0.08, tone: 6500, release: 0.05, velBright: 0.5,
    level: 1.2, "fx.reverb": 0.12 },
  guitar: { engine: "pluck", // nylon: softer pluck, a bit further from the bridge
    decay: 2.2, brightness: 0.45, pick: 0.18, tone: 4200, release: 0.12, level: 0.73, "fx.reverb": 0.25 },
  harp: { engine: "pluck", // plucked in the middle: hollow; keeps ringing after release
    decay: 3.5, brightness: 0.35, pick: 0.5, tone: 5000, release: 1.2, level: 0.44, "fx.reverb": 0.4 },
  piano: { engine: "pluck", // two strings per note, slightly detuned, struck by a felt hammer
    decay: 3.5, brightness: 0.4, pick: 0.12, strings: 2, detune: 1.2, tone: 5000, release: 0.25,
    velBright: 0.8, level: 0.78, "fx.reverb": 0.25 },
};

// The lead changes sound with the style playing the beat, as a band would change
// instrument: a clavinet (a plucked string) for funk, an FM electric piano for boom bap,
// FM brass for afrobeat, a marimba for reggaeton, a melodica for dub, a flute for bossa.
const LEAD_SOUNDS = {
  Funk: SOUNDS.clavinet,
  Dub: {
    "a.wave": "sawtooth", "a.unison": 1, "a.level": 0.35, "b.wave": "square", "b.level": 0.3,
    "filter.cutoff": 1500, "filter.res": 0.15, "filter.env": 0.6, "fenv.decay": 0.4, "fenv.sustain": 0.6,
    "amp.attack": 0.02, "amp.decay": 0.3, "amp.sustain": 0.8, "amp.release": 0.2, "mod1.amount": 0.015,
  },
  "Bossa nova": {
    "a.wave": "triangle", "a.unison": 1, "a.level": 0.6, "b.wave": "sine", "b.level": 0.25,
    "filter.cutoff": 2600, "filter.res": 0.1, "filter.env": 0.3, "fenv.sustain": 0.6,
    "amp.attack": 0.035, "amp.decay": 0.3, "amp.sustain": 0.75, "amp.release": 0.3, "mod1.amount": 0.025,
  },
  House: SOUNDS.piano,
  Afrobeat: SOUNDS.brass,
  "Boom bap": SOUNDS.epiano,
  "Trip-hop": { // a lonely, wobbly sine, like a theremin
    "a.wave": "sine", "a.unison": 1, "a.level": 0.7, "b.wave": "triangle", "b.level": 0.15,
    "filter.cutoff": 1800, "filter.res": 0.1, "filter.env": 0.2,
    "amp.attack": 0.08, "amp.decay": 0.4, "amp.sustain": 0.85, "amp.release": 0.5, "mod1.amount": 0.04,
  },
  Reggaeton: SOUNDS.marimba,
};
// Instruments you can pick for the melody (or "Auto": the sound follows the style).
// All made with the same little synth: two oscillators, a filter, envelopes, LFOs.
const INSTRUMENTS = {
  piano: { label: "Piano", sound: SOUNDS.piano },
  epiano: { label: "Electric piano", sound: SOUNDS.epiano },
  organ: { label: "Organ", sound: { // two "drawbars" (fundamental + octave), no decay, a rotating-speaker wobble
    "a.wave": "sine", "a.unison": 1, "a.level": 0.42, "b.wave": "sine", "b.octave": 1, "b.level": 0.33,
    "filter.cutoff": 4000, "filter.res": 0, "filter.env": 0,
    "amp.attack": 0.006, "amp.decay": 0.1, "amp.sustain": 1, "amp.release": 0.06, "mod1.amount": 0.008,
    "lfo2.shape": "sine", "lfo2.rate": 6.5, "mod2.src": "lfo2", "mod2.dst": "amp", "mod2.amount": 0.15,
  } },
  clavinet: { label: "Clavinet", sound: SOUNDS.clavinet },
  guitar: { label: "Guitar", sound: SOUNDS.guitar },
  harp: { label: "Harp", sound: SOUNDS.harp },
  synth: { label: "Synth lead", sound: {} }, // the base patch: detuned saws and vibrato
  strings: { label: "Strings", sound: { // many detuned saws, slow bow
    "a.wave": "sawtooth", "a.unison": 3, "a.spread": 0.25, "a.width": 0.8, "a.level": 0.4, "b.level": 0,
    "filter.cutoff": 2400, "filter.res": 0.1, "filter.env": 0.3,
    "amp.attack": 0.25, "amp.decay": 0.5, "amp.sustain": 0.85, "amp.release": 0.7, "mod1.amount": 0.02,
  } },
  brass: { label: "Brass", sound: SOUNDS.brass },
  flute: { label: "Flute", sound: { ...LEAD_SOUNDS["Bossa nova"], "noise.level": 0.08 } }, // + breath
  melodica: { label: "Melodica", sound: LEAD_SOUNDS.Dub },
  marimba: { label: "Marimba", sound: SOUNDS.marimba },
  bells: { label: "Bells", sound: SOUNDS.bells },
  theremin: { label: "Theremin", sound: LEAD_SOUNDS["Trip-hop"] },
};

// The melody's instrument: any engine (subtractive, FM, plucked string), see instrument.js.
const lead = new Instrument(ctx, master.input, master.send);
lead.volume.gain.value = LEAD_PATCH.volume;
let instrument = "auto"; // or a key of INSTRUMENTS
let leadSound = "";
let leadToast = null;    // { text, t } shown on the stage when the sound changes
function applyLeadSound(styleName) {
  const key = instrument === "auto" ? "style:" + styleName : instrument;
  if (key === leadSound) return;
  leadSound = key;
  const sound = instrument === "auto" ? LEAD_SOUNDS[styleName] || {} : INSTRUMENTS[instrument].sound;
  // FM and string presets stand alone; subtractive ones are tweaks of the base patch.
  lead.loadPatch(sound.engine ? { ...sound } : { ...LEAD_PATCH, ...sound });
  if (groove.running || instrument !== "auto") {
    leadToast = { text: instrument === "auto" ? `${styleName} sound` : INSTRUMENTS[instrument].label, t: ctx.currentTime };
  }
}
applyLeadSound(groove.core.name);
const melody = new Melody(ctx, lead, harmony);
const composer = new Composer(groove, harmony, melody);
const singer = new Singer(ctx, lead, harmony, groove, melody);

// Each loop layer gets its own synth, with the melody's sound at the moment of recording.
const looper = new Looper(ctx, groove, harmony, melody, () => ({
  synth: lead.clone(master.input, master.send),
  label: instrument === "auto" ? `${groove.core.name} sound` : INSTRUMENTS[instrument].label,
}));
singer.onNote = (midi, t, on) => looper.capture(midi, t, on, "voice");
looper.heldNow = () => [...new Set([...melody.down.values(), ...(singer.note !== null ? [singer.note] : [])])];
groove.onStep = (i, abs, t, sixteenth) => {
  composer.onStep(i, abs, t, sixteenth);
  looper.onStep(i, abs, t, sixteenth);
};
// The lead also goes to the echo, as much as the style's keys do (dub: lots).
const leadEcho = ctx.createGain();
leadEcho.gain.value = 0;
lead.volume.connect(leadEcho);
leadEcho.connect(echo.input);
groove.onBar = () => {
  setParam(ctx, leadEcho.gain, groove.owners.keys.echo.keys * 0.8, true);
  applyLeadSound(groove.core.name);
};

groove.filter = djf;

// Echo sends for the two synths, taken after their volume (like their reverb send).
groove.echo = echo;
for (const lane of ["bass", "keys"]) {
  const g = ctx.createGain();
  g.gain.value = 0;
  synths[lane].volume.connect(g);
  g.connect(echo.input);
  groove.synthEcho[lane] = g;
}

const $ = (id) => document.getElementById(id);
const css = getComputedStyle(document.documentElement);
const colors = Object.fromEntries([...GROOVE_LANES, "lead"].map((l) => [l, css.getPropertyValue(`--c-${l}`).trim()]));
const STYLE_COLORS = {
  Funk: "#f2b56d", Dub: "#4fb8a8", "Bossa nova": "#c4bdff", House: "#5ec4f2",
  Afrobeat: "#f2c46d", "Boom bap": "#ff9a76", "Trip-hop": "#7a8cff", Reggaeton: "#ff7a9a",
};
const LANE_NAMES = { kick: "Kick", snare: "Snare", hat: "Hats", perc: "Perc", bass: "Bass", keys: "Keys" };

// ---- Transport ----

async function togglePlay() {
  await ctx.resume();
  composer.reset();
  groove.running ? groove.stop() : groove.start();
  $("play").classList.toggle("playing", groove.running);
  $("play-icon").setAttribute("d", groove.running ? "M7 7h10v10H7z" : "M8 5v14l11-7z");
}
$("play").addEventListener("click", togglePlay);

$("volume").addEventListener("input", (e) => setParam(ctx, master.input.gain, e.target.value / 100, true));

// ---- Styles ----

for (const id of ["style-a", "style-b"]) {
  for (const [key, s] of Object.entries(GROOVE_STYLES)) $(id).append(new Option(s.name, key));
}
$("style-a").value = "funk";
$("style-b").value = "dub";

function applyStyles() {
  groove.a = GROOVE_STYLES[$("style-a").value];
  groove.b = GROOVE_STYLES[$("style-b").value];
  $("name-a").textContent = groove.a.name;
  $("name-b").textContent = groove.b.name;
  idleUpdate();
}

// While stopped, show (and later start from) what the morph position asks for.
function idleUpdate() {
  if (groove.running) return;
  groove.owners = groove.wanted();
  if (groove.followTempo) groove.bpm = groove.restingBpm();
}
$("style-a").addEventListener("change", applyStyles);
$("style-b").addEventListener("change", applyStyles);

$("mix").addEventListener("input", (e) => {
  groove.mix = e.target.value / 100;
  idleUpdate();
});

$("auto").addEventListener("change", (e) => {
  groove.autoMorph = e.target.checked;
  $("mix").disabled = e.target.checked;
});

$("follow").addEventListener("change", (e) => {
  groove.followTempo = e.target.checked;
  $("bpm").disabled = e.target.checked;
  if (!e.target.checked) groove.bpm = Number($("bpm").value);
});
$("bpm").disabled = true;
$("bpm").addEventListener("input", (e) => { groove.bpm = Number(e.target.value); });

NOTE_NAMES.forEach((n, i) => $("key").append(new Option(n, i, false, i === harmony.root)));
$("key").addEventListener("change", (e) => harmony.setKey(Number(e.target.value), harmony.mode));

applyStyles();

// ---- Instruments (mute) ----

const laneChecks = {};
for (const lane of GROOVE_LANES) {
  const row = document.createElement("label");
  row.className = "lane";
  row.style.setProperty("--c", colors[lane]);
  row.innerHTML = `<input type="checkbox" checked><span class="dot"></span>${LANE_NAMES[lane]}`;
  const check = row.querySelector("input");
  laneChecks[lane] = check;
  check.addEventListener("change", () => setLane(lane, check.checked));
  $("lanes").append(row);
}

function setLane(lane, on) {
  groove.on[lane] = on;
  laneChecks[lane].checked = on;
  if (DRUM_LANES.includes(lane)) drums.setOn(lane, on);
}

// ---- Live keyboard ----
// Keyboards don't all say "1" the same way, so the lane keys are recognised by any of:
// - the physical key `e.code`: Digit1…Digit6 (top row, any layout) or Numpad1…Numpad6
// - the character `e.key`: 1…6, or what a French AZERTY top row types without Shift:
//   & é " ' ( -   (some browsers and remote desktops report only the character)
const AZERTY_ROW = ["&", "é", '"', "'", "(", "-"];

function laneKey(e) {
  const m = /^(Digit|Numpad)([1-6])$/.exec(e.code);
  if (m) return Number(m[2]);
  if (/^[1-6]$/.test(e.key)) return Number(e.key);
  const i = AZERTY_ROW.indexOf(e.key);
  return i >= 0 ? i + 1 : 0;
}

// Which layout the keyboard has, for the labels and for keyboards that only report the
// character: a guess from the browser language, then the browser's own layout map if it
// has one, then what the keys actually type.
let layout = /^fr(?!-CA)/i.test(navigator.language || "") ? "azerty" : "qwerty";
if (navigator.keyboard && navigator.keyboard.getLayoutMap) {
  navigator.keyboard.getLayoutMap().then((map) => {
    const q = map.get("KeyQ");
    if (q) { layout = q === "a" ? "azerty" : "qwerty"; pianoKey = ""; }
  }).catch(() => {});
}
function learnLayout(e) {
  const k = e.key.toLowerCase();
  if (e.code === "KeyQ" && (k === "a" || k === "q")) {
    const l = k === "a" ? "azerty" : "qwerty";
    if (l !== layout) { layout = l; pianoKey = ""; }
  }
}

// The melody key of an event, as a physical code (from the code, or from the character).
function melodyCode(e) {
  if (melody.place(e.code)) return e.code;
  if (e.code) return null;
  const k = e.key.toLowerCase();
  for (let r = 0; r < 2; r++) {
    const i = MELODY_LETTERS[layout][r].indexOf(k);
    if (i >= 0) return MELODY_ROWS[r][i];
  }
  return null;
}

// What a key does. Physical code first, then the character, for keyboards and remote
// desktops that only report one of them. Gestures live on the bottom row and the space
// bar, so the two letter rows above are free for the melody. The octave is on the first
// two keys of the bottom row, like in Ableton (Z X on QWERTY = W X on AZERTY): some
// browsers keep the up/down arrows for themselves and never pass them to the page.
function action(e) {
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (e.code === "Enter" || k === "Enter") return "play";
  if (e.code === "Space" || k === " ") return "roll";
  if (e.code === "KeyB" || k === "b") return "break";
  if (e.code === "KeyV" || k === "v") return "filter";
  if (e.code === "KeyN" || k === "n") return "build";
  if (e.code === "KeyC" || k === "c") return "mode";
  if (e.code === "KeyM" || (!e.code && k === (layout === "azerty" ? "," : "m"))) return "instrument";
  if (e.code === "ArrowRight" || k === "ArrowRight") return "right";
  if (e.code === "ArrowLeft" || k === "ArrowLeft") return "left";
  if (e.code === "KeyX" || k === "x" || e.code === "ArrowUp" || k === "ArrowUp") return "up";
  if (e.code === "KeyZ" || (!e.code && k === (layout === "azerty" ? "w" : "z"))
    || e.code === "ArrowDown" || k === "ArrowDown") return "down";
  if (laneKey(e)) return "lane";
  if (melodyCode(e)) return "note";
  return null;
}

// The key panel: a key stays lit while it is held.
const CHIP = { play: "Enter", roll: "Space", break: "KeyB", filter: "KeyV", build: "KeyN",
  right: "Arrows", left: "Arrows", up: "Octave", down: "Octave", lane: "Digits", mode: "KeyC",
  instrument: "KeyM" };
const held = new Set();
function chip(act, on) {
  const el = document.querySelector(`.key[data-key="${CHIP[act]}"]`);
  if (el) el.classList.toggle("held", on);
}
function tapChip(act) {
  chip(act, true);
  setTimeout(() => { if (!held.has(act)) chip(act, false); }, 140);
}

function press(act, e) {
  if (act === "note") {
    ctx.resume();
    const code = melodyCode(e);
    melody.press(code);
    if (melody.down.has(code)) looper.capture(melody.down.get(code), ctx.currentTime, true, "keys");
    // Judge against what you hear: the sound leaves the speakers a bit after ctx time.
    composer.judge(code, ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0));
    return;
  }
  if (act === "instrument") {
    const order = ["auto", ...Object.keys(INSTRUMENTS)];
    setInstrument(order[(order.indexOf(instrument) + 1) % order.length]);
    return tapChip(act);
  }
  if (act === "mode") {
    const order = ["free", "guide", "auto"];
    setMelodyMode(order[(order.indexOf(composer.mode) + 1) % 3]);
    return tapChip(act);
  }
  if (act === "up" || act === "down") {
    melody.octave = Math.max(-2, Math.min(2, melody.octave + (act === "up" ? 1 : -1)));
    return tapChip(act);
  }
  if (act === "play") return tapChip(act), togglePlay();
  if (act === "lane") {
    const lane = GROOVE_LANES[laneKey(e) - 1];
    setLane(lane, !groove.on[lane]);
    return tapChip(act);
  }
  if (act === "left" || act === "right") {
    groove.stepMorph(act === "right" ? 1 : -1);
    $("auto").checked = false;
    $("mix").disabled = false;
    $("mix").value = Math.round(groove.mix * 100);
    idleUpdate();
    return tapChip(act);
  }
  if (act === "roll" && !groove.running) return tapChip(act), togglePlay();
  // Held gestures.
  held.add(act);
  chip(act, true);
  if (act === "roll") groove.rollPress();
  if (act === "break") groove.breakPress();
  if (act === "filter") djf.close(3);
  if (act === "build") groove.buildPress();
}

function release(act) {
  if (!held.delete(act)) return;
  chip(act, false);
  if (act === "roll") groove.rollRelease();
  if (act === "break") groove.breakRelease();
  if (act === "filter" && !groove.live.building) djf.open();
  if (act === "build") groove.buildRelease();
}

// Listened in the capture phase, on the window: we get each key before anything else on
// the page (a focused slider or menu) can use it.
window.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target.tagName === "SELECT") return; // let an open menu use its own keys
  learnLayout(e);
  const act = action(e);
  if (!act) return;
  e.preventDefault(); // no page scroll on Space or arrows, no slider move
  if (document.activeElement && document.activeElement.tagName === "INPUT") document.activeElement.blur();
  if (e.repeat) return; // a held key repeats: we only want the first press
  press(act, e);
}, true);

window.addEventListener("keyup", (e) => {
  const act = action(e);
  if (act === "note") {
    const code = melodyCode(e);
    const midi = melody.down.get(code);
    melody.release(code);
    if (midi !== undefined) looper.capture(midi, ctx.currentTime, false, "keys");
  }
  else if (act) release(act);
}, true);

// Switching window or tab while holding a key: we never get its keyup, so let go of all.
window.addEventListener("blur", () => {
  [...held].forEach(release);
  melody.releaseAll();
});

// ---- On-screen keyboard (melody) ----
// Two rows of keys, as on the real keyboard: the letter, the note it plays, the root
// marked, and the notes of the chord playing now marked too (good notes to land on).

let pianoKey = ""; // what the keyboard was last drawn for, to redraw only on change
function renderPiano() {
  const chord = groove.running && groove.tones ? groove.tones.slice(0, 3) : []; // the triad
  const sig = [layout, harmony.root, harmony.mode, melody.octave, chord.join()].join("|");
  if (sig !== pianoKey) {
    pianoKey = sig;
    const el = $("piano");
    el.innerHTML = "";
    for (const r of [1, 0]) {
      const row = document.createElement("div");
      row.className = "prow" + (r === 0 ? " pmid" : "");
      MELODY_ROWS[r].forEach((code, i) => {
        const midi = melody.noteFor(code);
        const k = document.createElement("div");
        k.className = "pk";
        if (i % 7 === 0) k.classList.add("root");
        if (chord.includes(midi % 12)) k.classList.add("chord");
        k.dataset.code = code;
        const letter = MELODY_LETTERS[layout][r][i];
        k.innerHTML = `<kbd>${letter.toUpperCase()}</kbd><span>${NOTE_NAMES[midi % 12]}<small>${Math.floor(midi / 12) - 1}</small></span>`;
        row.append(k);
      });
      el.append(row);
    }
    $("octave-out").textContent = (melody.octave > 0 ? "+" : "") + melody.octave;
    $("oct-down").textContent = layout === "azerty" ? "W" : "Z";
    $("inst-key").textContent = layout === "azerty" ? "," : "M";
  }
  // Lit: held by you, or sounding from the composer (Auto).
  const now = ctx.currentTime;
  const sounding = new Set(melody.down.keys());
  for (const n of melody.log) if (n.t <= now && now < n.end) sounding.add(n.code);
  // Cues: the next note due on each key glows brighter as it comes (over 2 beats),
  // and is filled while it should be held.
  const cue = {}, cueNow = new Set();
  if (composer.mode !== "free" && groove.running) {
    const span = 8 * (60 / groove.bpm / 4);
    for (const n of composer.notes) {
      if (n.judged === "miss") continue;
      const end = n.end ?? n.t + n.len * (60 / groove.bpm / 4);
      if (n.t <= now && now < end) cueNow.add(n.code);
      const dt = n.t - now;
      if (dt >= 0 && dt < span) cue[n.code] = Math.max(cue[n.code] || 0, 1 - dt / span);
    }
  }
  for (const k of $("piano").querySelectorAll(".pk")) {
    const c = k.dataset.code;
    k.classList.toggle("on", sounding.has(c));
    k.classList.toggle("cue", !!cue[c]);
    k.classList.toggle("cue-now", cueNow.has(c));
    k.style.setProperty("--cue", (cue[c] || 0).toFixed(2));
  }
}

// ---- Melody mode: free / guide / auto ----

function setMelodyMode(mode) {
  composer.mode = mode;
  composer.reset();
  if (mode === "guide") composer.resetScore();
  for (const b of document.querySelectorAll("#mode button")) b.classList.toggle("active", b.dataset.mode === mode);
}
for (const b of document.querySelectorAll("#mode button")) {
  b.addEventListener("click", () => { setMelodyMode(b.dataset.mode); b.blur(); });
}

function updateScore() {
  const m = composer.mode;
  let text = "";
  if (m === "guide") {
    const pct = composer.judgedCount ? Math.round((100 * composer.hits) / composer.judgedCount) : 0;
    text = groove.running
      ? `Streak ${composer.streak} · best ${composer.best} · ${pct}% of notes hit`
      : "Press play: the notes start falling after one bar.";
  } else if (m === "auto") {
    text = groove.running ? "The melody plays itself. Play along if you like." : "Press play to hear it.";
  }
  $("score").textContent = text;
}

$("lead-volume").addEventListener("input", (e) => lead.set("volume", e.target.value / 100));

// ---- Sing (microphone) ----

async function startSinging() {
  await ctx.resume();
  try {
    await singer.start();
  } catch (err) {
    micError = "Microphone refused or not found";
  }
  showSingButton();
}
let micError = "";
function showSingButton() {
  $("sing").classList.toggle("active", singer.on);
  $("sing").textContent = singer.on ? "● Listening" : "🎤 Sing";
}
$("sing").addEventListener("click", async () => {
  $("sing").blur();
  if (singer.on) singer.stop(); else await startSinging();
  showSingButton();
});
$("voice-octave").addEventListener("change", (e) => {
  singer.octave = e.target.value === "auto" ? "auto" : Number(e.target.value);
  e.target.blur();
});
function updateSing() {
  $("sing-level").style.width = singer.on ? `${Math.min(100, singer.level * 600)}%` : "0";
  $("sung").textContent = !singer.on ? micError
    : singer.note !== null ? `${NOTE_NAMES[singer.note % 12]}${Math.floor(singer.note / 12) - 1}`
    : singer.level > singer.gate ? "…" : "sing or hum";
}

// ---- Loop & build ----

composer.themeSource = () => ($("guide-theme").checked && looper.theme ? looper : null);

$("rec").addEventListener("click", async () => {
  $("rec").blur();
  await ctx.resume();
  if (looper.armed || looper.rec) { looper.cancel(); return; }
  if (!groove.running) await togglePlay();
  // Recording listens to the microphone too: switch it on if it isn't (you can also
  // play the letter keys).
  if (!singer.on) await startSinging();
  looper.arm(Number($("loop-bars").value));
});
$("build").addEventListener("change", (e) => {
  looper.build = e.target.checked;
  looper.applyTheme();
  e.target.blur();
});
$("clear-loops").addEventListener("click", (e) => { looper.clear(); e.target.blur(); });

let loopMessage = "";
looper.onChange = (what) => {
  loopMessage = what === "empty"
    ? (singer.on ? "Nothing heard: sing a bit louder, or play the letter keys." : "Nothing heard: allow the microphone, or play the letter keys.")
    : "";
  renderLayers();
};
function renderLayers() {
  const el = $("layers");
  el.innerHTML = "";
  looper.layers.forEach((l, k) => {
    const row = document.createElement("div");
    row.className = "layer" + (l.muted ? " muted" : "");
    row.style.setProperty("--c", l.color);
    const role = k === 0 ? (looper.build ? " · theme, chords follow it" : " · theme") : "";
    row.innerHTML = `<span class="dot"></span><span class="what">Layer ${k + 1} · ${l.label} · ${l.bars} bar${l.bars > 1 ? "s" : ""} · ${l.notes.length} notes${role}</span>`;
    const mute = document.createElement("button");
    mute.textContent = l.muted ? "Unmute" : "Mute";
    mute.onclick = () => { l.muted = !l.muted; if (l.muted) l.synth.allOff(); renderLayers(); mute.blur(); };
    const del = document.createElement("button");
    del.textContent = "Delete";
    del.onclick = () => looper.remove(k);
    row.append(mute, del);
    el.append(row);
  });
  $("clear-loops").hidden = !looper.layers.length;
}
renderLayers();

// Where a layer or the take is, as a fraction of its loop, at the step sounding now.
function loopFrac(startBar, bars) {
  const now = ctx.currentTime;
  let cur = null;
  for (const st of groove.steps) if (st.t <= now) cur = st;
  if (!cur) return 0;
  const L = bars * 16;
  return (((((cur.bar - startBar) * 16 + cur.step) % L) + L) % L) / L;
}
function updateLoop() {
  const r = looper.rec;
  $("rec").classList.toggle("active", !!(looper.armed || r));
  $("rec").textContent = looper.armed ? "● Waiting for the one" : r ? "● Recording" : "⏺ Record";
  const caught = r ? r.notes.length + r.open.size : 0;
  $("rec-status").textContent = r ? `bar ${Math.min(r.bars, Math.floor(loopFrac(r.startBar, r.bars) * r.bars) + 1)} / ${r.bars} · ${caught} note${caught === 1 ? "" : "s"}`
    : looper.layers.length >= MAX_LAYERS ? "4 layers: delete one to record again" : loopMessage;
  $("rec").disabled = looper.layers.length >= MAX_LAYERS && !r && !looper.armed;
}

// ---- Melody instrument ----

$("instrument").append(new Option("Auto (follows the style)", "auto"));
for (const [key, inst] of Object.entries(INSTRUMENTS)) $("instrument").append(new Option(inst.label, key));
function setInstrument(key) {
  instrument = key;
  $("instrument").value = key;
  leadSound = ""; // force a reload
  applyLeadSound(groove.core.name);
}
$("instrument").addEventListener("change", (e) => setInstrument(e.target.value));

// After a click on a menu, checkbox or slider, hand the keyboard back to the page:
// a focused menu would swallow every key, and Space would also tick a focused checkbox.
document.addEventListener("change", (e) => {
  if (e.target.matches("select, input[type=checkbox]")) e.target.blur();
});
document.addEventListener("pointerup", (e) => {
  if (e.target.matches("input[type=range], input[type=checkbox]")) setTimeout(() => e.target.blur(), 0);
});

// ---- Display ----

function drawGrid() {
  const canvas = $("grid");
  const g = prepCanvas(canvas);
  const { width: W, height: H } = canvas;
  const dpr = devicePixelRatio;
  const now = ctx.currentTime;
  const labelW = 58 * dpr;
  const cellW = (W - labelW) / 16;
  const cellH = H / GROOVE_LANES.length;
  const playing = groove.running ? groove.stepAt(now) : null;
  const pad = 2 * dpr;

  g.font = `${11 * dpr}px sans-serif`;
  g.textBaseline = "middle";
  const owners = groove.running ? groove.owners : groove.wanted();
  GROOVE_LANES.forEach((lane, r) => {
    const y = r * cellH;
    const style = owners[lane];
    const live = groove.on[lane] && !(groove.live.breaking && DRUM_LANES.includes(lane));
    // Lane name, and under it the style it is playing right now.
    g.globalAlpha = live ? 0.9 : 0.3;
    g.fillStyle = colors[lane];
    g.font = `${11 * dpr}px sans-serif`;
    g.fillText(LANE_NAMES[lane], 0, y + cellH / 2 - 6 * dpr);
    g.globalAlpha *= 0.6;
    g.fillStyle = css.getPropertyValue("--fg").trim();
    g.font = `${9 * dpr}px sans-serif`;
    g.fillText(style.name.toLowerCase(), 0, y + cellH / 2 + 7 * dpr);
    for (let i = 0; i < 16; i++) {
      const x = labelW + i * cellW;
      const p = style.lanes[lane].prob[i];
      // Empty cell outline, then a fill as bright as the chance of playing.
      g.globalAlpha = i % 4 === 0 ? 0.16 : 0.08;
      g.fillStyle = css.getPropertyValue("--fg").trim();
      g.fillRect(x + pad, y + pad, cellW - 2 * pad, cellH - 2 * pad);
      if (p > 0) {
        g.globalAlpha = (live ? 0.12 : 0.05) + p * (live ? 0.5 : 0.1);
        g.fillStyle = colors[lane];
        g.fillRect(x + pad, y + pad, cellW - 2 * pad, cellH - 2 * pad);
      }
    }
  });

  // Hits that just sounded flash, then fade.
  for (const h of groove.hits) {
    const age = now - h.t;
    if (age < 0 || age > 0.35) continue;
    const r = GROOVE_LANES.indexOf(h.lane);
    g.globalAlpha = (1 - age / 0.35) * (0.4 + 0.6 * h.v);
    g.fillStyle = colors[h.lane];
    g.fillRect(labelW + h.step * cellW + pad, r * cellH + pad, cellW - 2 * pad, cellH - 2 * pad);
  }

  // Playhead.
  if (playing !== null) {
    g.globalAlpha = 0.5;
    g.fillStyle = css.getPropertyValue("--fg").trim();
    g.fillRect(labelW + playing * cellW, H - 3 * dpr, cellW, 3 * dpr);
  }
  g.globalAlpha = 1;
}

function updateReadout() {
  const c = groove.running ? groove.chordName : null;
  $("chord").innerHTML = c ? `${c.name}<small>${c.roman}</small>` : "—";
  const owners = groove.running ? groove.owners : groove.wanted();
  const onB = GROOVE_LANES.filter((l) => owners[l] !== groove.a).length;
  const where = onB === 0 ? groove.a.name : onB === GROOVE_LANES.length ? groove.b.name
    : `${groove.a.name} → ${groove.b.name} · ${onB}/${GROOVE_LANES.length} on ${groove.b.name}`;
  const L = groove.live;
  const live = !groove.running ? ""
    : L.building ? " · build-up…"
    : L.breaking ? " · break"
    : L.rolling || groove.fill ? " · roll" : "";
  $("status").textContent = `${where}${live} · ${Math.round(groove.bpm)} bpm · ${NOTE_NAMES[harmony.root]} ${harmony.mode}`;
  if (groove.autoMorph) $("mix").value = Math.round(groove.mix * 100);
  $("bpm-out").textContent = Math.round(groove.bpm);
  if (groove.followTempo) $("bpm").value = Math.round(groove.bpm);
}

function frame() {
  composer.sweep(ctx.currentTime);
  updateScore();
  drawStage($("stage"), {
    now: ctx.currentTime, hits: groove.hits, live: groove.live, running: groove.running,
    filter: djf.amount, lastDrop: groove.lastDrop, held, lead: melody.log,
    latched: groove.latched && !held.has("build"),
    toast: leadToast,
    voice: singer.on ? { trail: singer.trail, raw: singer.raw } : null,
    loop: {
      armed: !!looper.armed,
      rec: looper.rec ? loopFrac(looper.rec.startBar, looper.rec.bars) : null,
      layers: looper.layers.map((l) => ({ color: l.color, frac: loopFrac(l.startBar, l.bars), muted: l.muted })),
    },
    guide: composer.mode === "free" ? null : {
      notes: composer.notes, feedback: composer.feedback, sixteenth: 60 / groove.bpm / 4,
      noteFor: (code) => melody.noteFor(code), game: composer.mode === "guide",
      labelFor: (code) => {
        const p = melody.place(code);
        return p ? MELODY_LETTERS[layout][p.r][p.i].toUpperCase() : "";
      },
    },
    color: STYLE_COLORS[groove.core.name] || "#8a7fff", colors, analyser: master.analyser,
  });
  drawGrid();
  renderPiano();
  updateSing();
  updateLoop();
  updateReadout();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
