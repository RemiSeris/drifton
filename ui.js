"use strict";

/* ==================================================================
 *  INTERFACE — wires up the buttons and the display.
 *  Depends on PRESETS (presets.js) and the engine functions (engine.js).
 * ================================================================== */

const presetsEl = document.getElementById("presets");
const playBtn = document.getElementById("play");
const playIcon = document.getElementById("play-icon");
const volumeEl = document.getElementById("volume");
const breathEl = document.getElementById("breath");
const titleEl = document.querySelector("h1");

const PLAY_PATH = "M8 5v14l11-7z";
const PAUSE_PATH = "M6 5h4v14H6zm8 0h4v14h-4z";

// Build one button per preset
Object.entries(PRESETS).forEach(([key, p]) => {
  const btn = document.createElement("button");
  btn.className = "preset" + (key === currentPreset ? " active" : "");
  btn.dataset.key = key;
  btn.innerHTML = `<span class="name">${p.name}</span><span class="desc">${p.desc}</span>`;
  btn.addEventListener("click", () => switchPreset(key));
  presetsEl.appendChild(btn);
});

// --- Display updates (called from the engine) ---
function reflectPresetState() {
  document.querySelectorAll(".preset").forEach((b) => {
    b.classList.toggle("active", b.dataset.key === currentPreset);
  });
  titleEl.textContent = PRESETS[currentPreset].name;
}

function reflectPlayState() {
  playBtn.classList.toggle("playing", isPlaying);
  if (playIcon.firstElementChild) {
    playIcon.firstElementChild.setAttribute("d", isPlaying ? PAUSE_PATH : PLAY_PATH);
  }
  breathEl.classList.toggle("active", isPlaying);
}

// --- Controls ---
playBtn.addEventListener("click", () => {
  if (isPlaying) stop();
  else play();
});

volumeEl.addEventListener("input", (e) => setVolume(e.target.value / 100));

// Spacebar = play/pause
document.addEventListener("keydown", (e) => {
  if (e.code === "Space" && e.target.tagName !== "INPUT") {
    e.preventDefault();
    playBtn.click();
  }
});

// Init
userVolume = volumeEl.value / 100;
reflectPlayState();
