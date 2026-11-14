"use strict";

/* ==================================================================
 *  AUDIO ENGINE — all the sound generation (Web Audio API).
 *  Depends on PRESETS, FADE, MASTER_CEILING (defined in presets.js).
 *  Calls reflectPlayState() / reflectPresetState() (defined in ui.js)
 *  to keep the interface in sync.
 *
 *  Graph:
 *    voices (oscillators) ─┐
 *    noise (noise+filter)  ┼─→ master filter ─→ compressor ─→ master ─→ output
 *                          └─→ (send) ──────────→ reverb ────┘
 * ================================================================== */

// --- Engine state ---
let ctx = null;            // AudioContext (created on first play: browsers require it)
let master = null;         // master gain (volume + fades)
let masterFilter = null;   // global low-pass
let reverb = null;         // ConvolverNode
let reverbSend = null;     // send gain into the reverb
let compressor = null;
let filterLfo = null;      // slow cutoff movement
let voices = [];           // active voices
let noiseNode = null;
let eventTimer = null;

let isPlaying = false;
let currentPreset = "focus";
let userVolume = 0.65;     // 0..1, from the slider

// --- Noise (looping buffer filled with "brown noise", soft and warm) ---
function createNoiseBuffer() {
  const seconds = 4;
  const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;   // integration -> brown noise
    data[i] = last * 3.5;
  }
  return buffer;
}

// --- Synthetic impulse response for the reverb (no external file) ---
function createReverbIR(duration, decay) {
  const len = ctx.sampleRate * duration;
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return ir;
}

// --- A voice = 2 detuned oscillators + a swell LFO ---
function createVoice(freq, preset, opts = {}) {
  const out = ctx.createGain();
  out.gain.value = 0;

  const oscGain = opts.peak == null ? 0.16 : opts.peak;

  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  osc1.type = osc2.type = preset.waveform;
  osc1.frequency.value = freq;
  osc2.frequency.value = freq;
  osc1.detune.value = -preset.detune;
  osc2.detune.value = preset.detune;
  osc1.connect(out);
  osc2.connect(out);
  osc1.start();
  osc2.start();

  // Slow LFO that makes the voice breathe (gain rising/falling)
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.frequency.value = preset.lfoRate * (0.6 + Math.random() * 0.8);
  lfo.type = "sine";
  lfoGain.gain.value = oscGain * 0.5;
  // stagger the start so voices don't breathe in unison
  lfo.connect(lfoGain).connect(out.gain);
  lfo.start(ctx.currentTime + Math.random() * 4);

  out.gain.setValueAtTime(0, ctx.currentTime);
  out.gain.setTargetAtTime(oscGain * 0.5, ctx.currentTime, FADE);

  // routing: dry into the master filter + send to the reverb
  out.connect(masterFilter);
  out.connect(reverbSend);

  return { out, osc1, osc2, lfo, lfoGain, peak: oscGain, temporary: !!opts.temporary };
}

function stopVoice(voice, when = ctx.currentTime, after = FADE) {
  voice.out.gain.cancelScheduledValues(when);
  voice.out.gain.setTargetAtTime(0, when, after / 3);
  const stopAt = when + after + 0.5;
  voice.osc1.stop(stopAt);
  voice.osc2.stop(stopAt);
  voice.lfo.stop(stopAt);
}

// --- Build the whole graph for a given preset ---
function buildGraph(preset) {
  master = ctx.createGain();
  master.gain.value = 0;

  masterFilter = ctx.createBiquadFilter();
  masterFilter.type = "lowpass";
  masterFilter.frequency.value = preset.filter.base;
  masterFilter.Q.value = 0.6;

  compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -18;
  compressor.knee.value = 24;
  compressor.ratio.value = 3;
  compressor.attack.value = 0.05;
  compressor.release.value = 0.4;

  reverb = ctx.createConvolver();
  reverb.buffer = createReverbIR(5, 2.5);
  reverbSend = ctx.createGain();
  reverbSend.gain.value = preset.reverb;

  // chain: filter -> compressor -> master -> output ; reverb -> compressor
  masterFilter.connect(compressor);
  reverbSend.connect(reverb);
  reverb.connect(compressor);
  compressor.connect(master);
  master.connect(ctx.destination);

  // Slow LFO on the master filter cutoff
  filterLfo = ctx.createOscillator();
  const filterLfoGain = ctx.createGain();
  filterLfo.frequency.value = 0.015;
  filterLfo.type = "sine";
  filterLfoGain.gain.value = preset.filter.range;
  filterLfo.connect(filterLfoGain).connect(masterFilter.frequency);
  filterLfo.start();

  // Drone voices
  voices = preset.intervals.map((semi, i) => {
    const freq = preset.root * Math.pow(2, semi / 12);
    // higher partials (larger interval) are more discreet
    const peak = 0.16 * Math.max(0.35, 1 - i * 0.12);
    return createVoice(freq, preset, { peak });
  });

  // Noise layer (texture)
  const src = ctx.createBufferSource();
  src.buffer = createNoiseBuffer();
  src.loop = true;
  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = "lowpass";
  noiseFilter.frequency.value = 700;
  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0;
  src.connect(noiseFilter).connect(noiseGain);
  noiseGain.connect(masterFilter);
  noiseGain.connect(reverbSend);
  src.start();
  noiseGain.gain.setTargetAtTime(preset.noise * 0.25, ctx.currentTime, FADE);
  noiseNode = { src, noiseGain };

  // Master fade-in
  master.gain.setValueAtTime(0, ctx.currentTime);
  master.gain.setTargetAtTime(userVolume * MASTER_CEILING, ctx.currentTime, FADE / 2);
}

// --- Generative events: a note fades in then fades away ---
function scheduleEvent() {
  const preset = PRESETS[currentPreset];
  const jitter = preset.eventEvery * (0.6 + Math.random() * 0.8);
  eventTimer = setTimeout(() => {
    if (isPlaying && ctx) {
      const semi = preset.intervals[Math.floor(Math.random() * preset.intervals.length)] + 12;
      const freq = preset.root * Math.pow(2, semi / 12);
      const v = createVoice(freq, preset, { peak: 0.07, temporary: true });
      // lives ~20-40s then fades out
      const life = 20 + Math.random() * 20;
      stopVoice(v, ctx.currentTime + life, FADE * 2);
    }
    if (isPlaying) scheduleEvent();
  }, jitter * 1000);
}

// --- Start / stop playback ---
async function play() {
  if (isPlaying) return;          // already playing (or starting): never stack two graphs
  isPlaying = true;
  reflectPlayState();
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === "suspended") await ctx.resume();
  if (!isPlaying) return;         // stopped again during the async resume
  buildGraph(PRESETS[currentPreset]);
  scheduleEvent();
}

function stop() {
  if (!isPlaying) return;
  isPlaying = false;
  clearTimeout(eventTimer);
  reflectPlayState();
  if (!ctx || !master) return;    // nothing was built yet (stopped during startup)
  const t = ctx.currentTime;
  master.gain.cancelScheduledValues(t);
  master.gain.setTargetAtTime(0, t, FADE / 3);
  voices.forEach((v) => stopVoice(v, t));
  if (noiseNode) noiseNode.noiseGain.gain.setTargetAtTime(0, t, FADE / 3);
  // capture this graph's nodes, then drop the globals so a new play() can't
  // collide with this teardown — release the captured nodes after the fade
  const dead = { master, filterLfo, noiseNode };
  master = null;
  filterLfo = null;
  noiseNode = null;
  voices = [];
  setTimeout(() => {
    try { dead.noiseNode && dead.noiseNode.src.stop(); } catch (e) {}
    try { dead.filterLfo && dead.filterLfo.stop(); } catch (e) {}
    try { dead.master && dead.master.disconnect(); } catch (e) {}
  }, (FADE + 1) * 1000);
}

function switchPreset(key) {
  currentPreset = key;
  reflectPresetState();
  if (isPlaying) {
    // fade out the current one, then rebuild with the new preset
    stop();
    holdPlayingVisual(); // keep the "playing" look during the crossfade
    setTimeout(() => play(), FADE * 1000 + 200);
  }
}

function setVolume(v) {
  userVolume = v;
  if (ctx && master && isPlaying) {
    master.gain.setTargetAtTime(userVolume * MASTER_CEILING, ctx.currentTime, 0.1);
  }
}
