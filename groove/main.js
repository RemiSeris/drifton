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
  volume: 0.55,
};
const lead = new Synth(ctx, LEAD_PATCH, master.input, master.send);
const melody = new Melody(ctx, lead, harmony);
// The lead also goes to the echo, as much as the style's keys do (dub: lots).
const leadEcho = ctx.createGain();
leadEcho.gain.value = 0;
lead.volume.connect(leadEcho);
leadEcho.connect(echo.input);
groove.onBar = () => setParam(ctx, leadEcho.gain, groove.owners.keys.echo.keys * 0.8, true);

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
const STYLE_COLORS = { Funk: "#f2b56d", Dub: "#4fb8a8", "Bossa nova": "#c4bdff" };
const LANE_NAMES = { kick: "Kick", snare: "Snare", hat: "Hats", perc: "Perc", bass: "Bass", keys: "Keys" };

// ---- Transport ----

async function togglePlay() {
  await ctx.resume();
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
// desktops that only report one of them. Gestures live on the bottom row (V B N) and
// the space bar, so the two letter rows above are free for the melody.
function action(e) {
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (e.code === "Enter" || k === "Enter") return "play";
  if (e.code === "Space" || k === " ") return "roll";
  if (e.code === "KeyB" || k === "b") return "break";
  if (e.code === "KeyV" || k === "v") return "filter";
  if (e.code === "KeyN" || k === "n") return "build";
  if (e.code === "ArrowRight" || k === "ArrowRight") return "right";
  if (e.code === "ArrowLeft" || k === "ArrowLeft") return "left";
  if (e.code === "ArrowUp" || k === "ArrowUp") return "up";
  if (e.code === "ArrowDown" || k === "ArrowDown") return "down";
  if (laneKey(e)) return "lane";
  if (melodyCode(e)) return "note";
  return null;
}

// The key panel: a key stays lit while it is held.
const CHIP = { play: "Enter", roll: "Space", break: "KeyB", filter: "KeyV", build: "KeyN",
  right: "Arrows", left: "Arrows", up: "Octave", down: "Octave", lane: "Digits" };
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
  if (act === "note") return ctx.resume(), melody.press(melodyCode(e));
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

document.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target.tagName === "SELECT") return; // let an open menu use its own keys
  learnLayout(e);
  const act = action(e);
  if (!act) return;
  e.preventDefault(); // no page scroll on Space or arrows, no slider move
  if (document.activeElement && document.activeElement.tagName === "INPUT") document.activeElement.blur();
  if (e.repeat) return; // a held key repeats: we only want the first press
  press(act, e);
});

document.addEventListener("keyup", (e) => {
  const act = action(e);
  if (act === "note") melody.release(melodyCode(e));
  else if (act) release(act);
});

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
  }
  for (const k of $("piano").querySelectorAll(".pk")) k.classList.toggle("on", melody.down.has(k.dataset.code));
}

$("lead-volume").addEventListener("input", (e) => lead.set("volume", e.target.value / 100));

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
  drawStage($("stage"), {
    now: ctx.currentTime, hits: groove.hits, live: groove.live, running: groove.running,
    filter: djf.amount, lastDrop: groove.lastDrop, held, lead: melody.log,
    color: STYLE_COLORS[groove.core.name] || "#8a7fff", colors, analyser: master.analyser,
  });
  drawGrid();
  renderPiano();
  updateReadout();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
