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

const drums = new Drums(ctx, master.input, master.send, echo.input);
const synths = {
  bass: new Synth(ctx, BASS_PATCH, master.input, master.send),
  keys: new Synth(ctx, KEYS_PATCH, master.input, master.send),
};
const harmony = new Harmony(2, "dorian");
const groove = new Groove(ctx, drums, synths, harmony);

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
const colors = Object.fromEntries(GROOVE_LANES.map((l) => [l, css.getPropertyValue(`--c-${l}`).trim()]));
const LANE_NAMES = { kick: "Kick", snare: "Snare", hat: "Hats", perc: "Perc", bass: "Bass", keys: "Keys" };

// ---- Transport ----

$("play").addEventListener("click", async () => {
  await ctx.resume();
  groove.running ? groove.stop() : groove.start();
  $("play").classList.toggle("playing", groove.running);
  $("play-icon").setAttribute("d", groove.running ? "M7 7h10v10H7z" : "M8 5v14l11-7z");
});

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

for (const lane of GROOVE_LANES) {
  const row = document.createElement("label");
  row.className = "lane";
  row.style.setProperty("--c", colors[lane]);
  row.innerHTML = `<input type="checkbox" checked><span class="dot"></span>${LANE_NAMES[lane]}`;
  row.querySelector("input").addEventListener("change", (e) => {
    groove.on[lane] = e.target.checked;
    if (DRUM_LANES.includes(lane)) drums.setOn(lane, e.target.checked);
  });
  $("lanes").append(row);
}

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
    // Lane name, and under it the style it is playing right now.
    g.globalAlpha = groove.on[lane] ? 0.9 : 0.3;
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
        g.globalAlpha = (groove.on[lane] ? 0.12 : 0.05) + p * (groove.on[lane] ? 0.5 : 0.1);
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
  const fill = groove.running && groove.fill && groove.fill.to !== groove.core ? " · fill!" : "";
  $("status").textContent = `${where}${fill} · ${Math.round(groove.bpm)} bpm · ${NOTE_NAMES[harmony.root]} ${harmony.mode}`;
  if (groove.autoMorph) $("mix").value = Math.round(groove.mix * 100);
  $("bpm-out").textContent = Math.round(groove.bpm);
  if (groove.followTempo) $("bpm").value = Math.round(groove.bpm);
}

function frame() {
  drawGrid();
  updateReadout();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
