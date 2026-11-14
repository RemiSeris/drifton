// Wires the page: opening a file, the transport (play, speed, loop), the parts, and the
// animation that redraws the roll every frame.

const ctx = new AudioContext();
// iPhone / iPad: play even when the device is in silent mode (Safari 17+).
try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch {}

const sound = new PianoSound(ctx);
const player = new Player(ctx, sound);
const roll = new Roll(document.getElementById("roll"));
const timeline = new Timeline(document.getElementById("timeline"), (t) => player.seek(t));

const $ = (id) => document.getElementById(id);
const LAST_KEY = "drifton.score.last";

// Browsers only start audio after a tap or a key press.
function wake() { if (ctx.state !== "running") ctx.resume(); }
document.addEventListener("pointerdown", wake, true);
document.addEventListener("keydown", wake, true);

function setStatus(text) { $("status").textContent = text; }

// ---- Loading a song ----

function loadSong(song, name) {
  player.load(song);
  roll.setSong(song);
  $("song").textContent = name;
  buildParts(song);
  updatePlay();
  updateLoop();
  setStatus(`${song.notes.length} notes · ${Math.round(song.bpm)} bpm · ${song.meter}`);
}

async function openFile(file) {
  try {
    const buffer = await file.arrayBuffer();
    const song = parseMidi(buffer);
    if (!song.notes.length) throw new Error("No notes in this file.");
    loadSong(song, file.name.replace(/\.midi?$/i, ""));
    remember(file.name, buffer);
  } catch (e) {
    setStatus(`Could not read ${file.name}: ${e.message}`);
  }
}

// Keep the last file in the browser, so the page reopens on it.
function remember(name, buffer) {
  try {
    const bytes = new Uint8Array(buffer);
    if (bytes.length > 1_000_000) return;
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    localStorage.setItem(LAST_KEY, JSON.stringify({ name, data: btoa(bin) }));
  } catch {}
}

function restore() {
  try {
    const last = JSON.parse(localStorage.getItem(LAST_KEY));
    if (!last) return false;
    const bin = atob(last.data);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    loadSong(parseMidi(bytes.buffer), last.name.replace(/\.midi?$/i, ""));
    return true;
  } catch {
    return false;
  }
}

$("open").addEventListener("click", () => $("file").click());
$("file").addEventListener("change", (e) => {
  const file = e.target.files[0];
  e.target.value = ""; // allow opening the same file again
  if (file) openFile(file);
});
$("demo").addEventListener("click", () => loadSong(demoSong(), "Ode to Joy (demo)"));

// Drag and drop a file anywhere on the page (computer).
document.addEventListener("dragover", (e) => e.preventDefault());
document.addEventListener("drop", (e) => {
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  if (file) openFile(file);
});

// ---- Parts: see / hear each hand or track ----

function buildParts(song) {
  const list = $("parts");
  list.textContent = "";
  song.parts.forEach((part, i) => {
    const chip = document.createElement("div");
    chip.className = "part";
    const dot = document.createElement("span");
    dot.className = "dot";
    dot.style.background = PART_COLORS[i % PART_COLORS.length];
    const name = document.createElement("span");
    name.className = "part-name";
    name.textContent = part.name;
    chip.append(dot, name, toggle("See", part, "visible"), toggle("Hear", part, "audible"));
    list.append(chip);
  });
}

function toggle(label, obj, key) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "btn small toggle";
  b.textContent = label;
  const show = () => b.classList.toggle("active", obj[key]);
  b.addEventListener("click", () => { obj[key] = !obj[key]; show(); });
  show();
  return b;
}

// ---- Transport ----

const PLAY_ICON = "M8 5v14l11-7z";
const PAUSE_ICON = "M6 5h4v14H6zM14 5h4v14h-4z";

function togglePlay() {
  if (player.playing) player.pause();
  else player.play();
  updatePlay();
}
function updatePlay() {
  $("play").classList.toggle("playing", player.playing);
  $("play-icon").setAttribute("d", player.playing ? PAUSE_ICON : PLAY_ICON);
}
player.onEnd = updatePlay;

function restart() {
  player.seek(player.loop.on ? player.loop.a - 1 : -LEAD_IN);
}

$("play").addEventListener("click", togglePlay);
$("restart").addEventListener("click", restart);

// Speed: the label follows the slider, the speed changes when it's released.
function setSpeed(percent) {
  percent = Math.min(150, Math.max(20, percent));
  $("speed").value = percent;
  $("speed-out").textContent = `${percent}%`;
  player.setSpeed(percent / 100);
}
$("speed").addEventListener("input", () => { $("speed-out").textContent = `${$("speed").value}%`; });
$("speed").addEventListener("change", () => setSpeed(Number($("speed").value)));
$("slower").addEventListener("click", () => setSpeed(Number($("speed").value) - 5));
$("faster").addEventListener("click", () => setSpeed(Number($("speed").value) + 5));

$("volume").addEventListener("input", () => sound.setVolume($("volume").value / 100));
$("names").addEventListener("click", () => {
  roll.showNames = !roll.showNames;
  $("names").classList.toggle("active", roll.showNames);
});

// ---- Loop ----
// Start and End snap to bar lines: pause where the passage begins, tap Start; move to
// where it ends, tap End. (A little tolerance for taps slightly early or late.)

function barIndex(t) { // index of the bar containing t
  const bars = player.song.bars;
  let i = 0;
  while (i + 1 < bars.length && bars[i + 1] <= t + 1e-3) i++;
  return i;
}
function snapDown(t) {
  const bars = player.song.bars;
  const before = bars.filter((b) => b <= t + 0.2);
  return before.length ? before[before.length - 1] : t;
}
function snapUp(t) {
  const after = player.song.bars.find((b) => b >= t - 0.2 && b > 0);
  return after !== undefined ? after : player.song.duration;
}

function updateLoop() {
  const { on, a, b } = player.loop;
  $("loop-on").classList.toggle("active", on);
  let text = "";
  if (on && player.song.bars.length) {
    const first = barIndex(a) + 1, last = Math.max(first, barIndex(b - 0.01) + 1);
    text = first === last ? `Bar ${first}` : `Bars ${first}–${last}`;
  } else if (on) {
    text = `${clock(a)}–${clock(b)}`;
  }
  $("loop-info").textContent = text;
}

$("loop-a").addEventListener("click", () => {
  if (!player.song) return;
  const a = snapDown(Math.max(0, player.position()));
  const b = player.loop.b > a + 0.5 ? player.loop.b : snapUp(a + 0.5);
  player.setLoop(a, b);
  updateLoop();
});
$("loop-b").addEventListener("click", () => {
  if (!player.song) return;
  const b = snapUp(player.position());
  const a = player.loop.a < b - 0.5 ? player.loop.a : snapDown(b - 0.5);
  player.setLoop(a, b);
  updateLoop();
});
$("loop-on").addEventListener("click", () => {
  if (!player.song) return;
  player.loop.on = !player.loop.on;
  updateLoop();
});
$("loop-clear").addEventListener("click", () => {
  if (!player.song) return;
  player.loop = { on: false, a: 0, b: player.song.duration };
  updateLoop();
});

// ---- Drag the roll up or down to move in time; a simple tap plays / pauses ----

const rollCanvas = $("roll");
let drag = null;
rollCanvas.addEventListener("pointerdown", (e) => {
  rollCanvas.setPointerCapture(e.pointerId);
  drag = { y: e.clientY, pos: player.position(), moved: false, wasPlaying: player.playing };
});
rollCanvas.addEventListener("pointermove", (e) => {
  if (!drag) return;
  const dy = e.clientY - drag.y;
  if (!drag.moved && Math.abs(dy) < 6) return;
  if (!drag.moved) { drag.moved = true; player.pause(); }
  // Dragging the notes down = moving forward in the song.
  player.seek(drag.pos + dy / roll.pxPerSecond());
});
rollCanvas.addEventListener("pointerup", () => {
  if (!drag) return;
  if (!drag.moved) togglePlay();
  else if (drag.wasPlaying) player.play();
  drag = null;
  updatePlay();
});
rollCanvas.addEventListener("pointercancel", () => { drag = null; });

// ---- Computer keyboard: Space, ← →, Home, A / B / L ----

document.addEventListener("keydown", (e) => {
  if (!player.song || e.metaKey || e.ctrlKey || e.altKey) return;
  const step = () => {
    const bars = player.song.bars;
    return bars.length > 1 ? bars[1] - bars[0] : 2;
  };
  const actions = {
    Space: togglePlay,
    ArrowRight: () => player.seek(player.position() + step()),
    ArrowLeft: () => player.seek(player.position() - step()),
    Home: restart,
    KeyA: () => $("loop-a").click(),
    KeyB: () => $("loop-b").click(),
    KeyL: () => $("loop-on").click(),
  };
  const action = actions[e.code];
  if (!action || e.target.tagName === "INPUT" && e.target.type !== "range") return;
  e.preventDefault();
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  action();
});

// ---- Animation ----

function clock(t) {
  t = Math.max(0, t);
  return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
}

function frame() {
  const song = player.song;
  const pos = player.position();
  roll.draw(pos, player.loop);
  timeline.draw(song, pos, player.loop);
  if (song) {
    const bar = song.bars.length && pos >= 0 ? ` · bar ${barIndex(pos) + 1}` : "";
    $("clock").textContent = `${clock(pos)} / ${clock(song.duration)}${bar}`;
  }
  $("asleep").classList.toggle("hidden", ctx.state === "running");
  requestAnimationFrame(frame);
}

if (!restore()) loadSong(demoSong(), "Ode to Joy (demo)");
requestAnimationFrame(frame);
