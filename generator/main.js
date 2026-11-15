// Generator page: creates the four instruments, the harmony and the generator,
// wires the controls and draws the piano roll.

const ctx = new AudioContext();
const master = new MasterBus(ctx);
master.input.gain.value = 0.8;

const ROLES = [
  { id: "pad", name: "Pad", patch: "Pad", volume: 0.7 },
  { id: "bass", name: "Bass", patch: "Bass", volume: 0.6 },
  { id: "bells", name: "Bells", patch: "Bells", volume: 0.5 },
  { id: "texture", name: "Texture", patch: "Texture", volume: 0.35 },
];

// Each instrument uses the sound saved on the synth page (or its starter sound).
// The volume is the generator's own mix, not part of the sound.
const synths = {};
for (const r of ROLES) {
  synths[r.id] = new Synth(ctx, { ...currentPatch(r.patch), volume: r.volume }, master.input, master.send);
}

// The synth page is open in another tab and a sound changed: apply it right away.
PatchStore.onChange(() => {
  for (const r of ROLES) {
    const s = synths[r.id];
    s.loadPatch({ ...currentPatch(r.patch), volume: s.params.volume });
  }
});

const harmony = new Harmony(2, "dorian"); // D dorian
const gen = new Generator(ctx, synths, harmony);

const $ = (id) => document.getElementById(id);
const css = getComputedStyle(document.documentElement);
const colors = Object.fromEntries(ROLES.map((r) => [r.id, css.getPropertyValue(`--c-${r.id}`).trim()]));

// ---- Transport ----

const playBtn = $("play");
const PLAY_PATH = "M8 5v14l11-7z";
const STOP_PATH = "M7 7h10v10H7z";

playBtn.addEventListener("click", async () => {
  await ctx.resume();
  if (gen.running) gen.stop();
  else gen.start();
  playBtn.classList.toggle("playing", gen.running);
  $("play-icon").setAttribute("d", gen.running ? STOP_PATH : PLAY_PATH);
});

$("volume").addEventListener("input", (e) => {
  setParam(ctx, master.input.gain, e.target.value / 100, true);
});

// ---- Harmony controls ----

const keySel = $("key");
NOTE_NAMES.forEach((n, i) => keySel.append(new Option(n, i, false, i === harmony.root)));
function applyKey() { harmony.setKey(Number(keySel.value), $("mode").value); }
keySel.addEventListener("change", applyKey);
$("mode").addEventListener("change", applyKey);

const chordLen = $("chord-len");
function applyChordLen() {
  gen.chordSeconds = Number(chordLen.value);
  $("chord-len-out").textContent = chordLen.value + " s";
}
chordLen.addEventListener("input", applyChordLen);
applyChordLen();

// ---- Instruments ----

const rolesEl = $("roles");
const legend = $("legend");
for (const r of ROLES) {
  const row = document.createElement("div");
  row.className = "role";
  row.style.setProperty("--c", colors[r.id]);
  row.innerHTML = `
    <label class="name"><input type="checkbox" checked><span class="dot"></span>${r.name}</label>
    <input type="range" min="0" max="100" value="${Math.round(r.volume * 100)}" aria-label="${r.name} volume">
    <a class="edit" href="../synth/index.html#${r.patch}" target="_blank" rel="noopener">Edit</a>`;
  const [check, slider] = row.querySelectorAll("input");
  check.addEventListener("change", () => gen.setRole(r.id, check.checked));
  slider.addEventListener("input", () => synths[r.id].set("volume", slider.value / 100));
  rolesEl.append(row);

  const tag = document.createElement("span");
  tag.style.setProperty("--c", colors[r.id]);
  tag.textContent = r.name;
  legend.append(tag);
}

const density = $("density");
function applyDensity() {
  gen.setDensity(density.value / 100);
  $("density-out").textContent = density.value + "%";
}
density.addEventListener("input", applyDensity);
applyDensity();

// ---- Space ----

const room = $("room");
function applyRoom() {
  master.reverb.setSize(Number(room.value));
  $("room-out").textContent = room.value + " s";
}
room.addEventListener("change", applyRoom); // on release: each change builds a new room
room.addEventListener("input", () => { $("room-out").textContent = room.value + " s"; });
applyRoom();

// ---- Display: chord name and piano roll ----

const WINDOW = 45;          // seconds shown in the piano roll
const LOW = 30, HIGH = 92;  // MIDI range shown

function drawRoll() {
  const canvas = $("roll");
  const g = prepCanvas(canvas);
  const { width: W, height: H } = canvas;
  const now = ctx.currentTime;
  const dpr = devicePixelRatio;
  const rowH = H / (HIGH - LOW);
  const X = (t) => W - ((now - t) / WINDOW) * W;
  const Y = (note) => H - (note - LOW + 1) * rowH;

  // Faint line on every C.
  g.fillStyle = css.getPropertyValue("--muted").trim();
  g.globalAlpha = 0.18;
  for (let n = LOW; n <= HIGH; n++) if (n % 12 === 0) g.fillRect(0, Y(n) + rowH / 2, W, dpr);

  // Chord changes: vertical line + name.
  g.font = `${11 * dpr}px sans-serif`;
  for (const c of gen.chords) {
    if (c.t > now || c.t < now - WINDOW) continue;
    g.globalAlpha = 0.3;
    g.fillRect(X(c.t), 0, dpr, H);
    g.globalAlpha = 0.8;
    g.fillText(c.name, X(c.t) + 4 * dpr, 14 * dpr);
  }

  // Notes.
  for (const n of gen.notes) {
    if (n.start > now) continue;
    const x0 = X(n.start);
    const x1 = X(Math.min(n.end, now));
    if (x1 < 0) continue;
    g.fillStyle = colors[n.role];
    g.globalAlpha = n.end > now ? 0.95 : 0.55;
    g.fillRect(x0, Y(n.note), Math.max(4 * dpr, x1 - x0), Math.max(3 * dpr, rowH - dpr));
  }
  g.globalAlpha = 1;
}

function updateReadout() {
  const now = ctx.currentTime;
  const chord = gen.running ? gen.chordAt(now) : null;
  $("chord").innerHTML = chord ? `${chord.name}<small>${chord.roman}</small>` : "—";
  const keyName = `${NOTE_NAMES[harmony.root]} ${harmony.mode}`;
  $("status").textContent = gen.running
    ? `${keyName} · next chord in ${Math.max(0, Math.round(gen.nextChord - now))} s`
    : `${keyName} · press play`;
}

function frame() {
  drawRoll();
  updateReadout();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
