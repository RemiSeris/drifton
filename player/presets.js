"use strict";

/* ==================================================================
 *  PRESETS — this is WHERE you tweak the sound.
 *
 *  Each ambience:
 *  - name       : label shown on the button
 *  - desc       : button subtitle
 *  - root       : root note in Hz (e.g. 110 = A2, 146.83 = D3)
 *  - intervals  : semitones added to the root, one voice per value
 *                 (0 = root, 7 = fifth, 12 = octave, 19 = fifth+octave...)
 *  - waveform   : "sine" | "triangle" | "sawtooth"
 *  - detune     : detune (cents) between a voice's two oscillators -> thickness
 *  - filter     : { base, range } master low-pass cutoff (Hz), swept by an LFO
 *  - reverb     : 0..1 amount sent to the reverb
 *  - noise      : 0..1 level of the noise layer (texture)
 *  - lfoRate    : voice swell speed (Hz) — smaller = slower
 *  - eventEvery : average seconds between two generative "event" notes
 *
 *  To add an ambience: copy a block, change the key.
 *  The button shows up automatically in the UI.
 * ================================================================== */
const PRESETS = {
  focus: {
    name: "Focus",
    desc: "Mid-range, steady",
    root: 146.83,                       // D3
    intervals: [0, 7, 12, 19],          // fifth + octaves: clear, tonal
    waveform: "triangle",
    detune: 6,
    filter: { base: 900, range: 500 },
    reverb: 0.35,
    noise: 0.12,
    lfoRate: 0.05,
    eventEvery: 14,
  },
  relax: {
    name: "Relax",
    desc: "Warm, slow",
    root: 110.0,                        // A2
    intervals: [0, 7, 10, 14],          // fifth + soft seventh
    waveform: "sine",
    detune: 9,
    filter: { base: 600, range: 350 },
    reverb: 0.55,
    noise: 0.18,
    lfoRate: 0.03,
    eventEvery: 20,
  },
  deep: {
    name: "Deep",
    desc: "Low, spacious",
    root: 73.42,                        // D2
    intervals: [0, 12, 19, 24, 28],     // low root + sparse high partials
    waveform: "sine",
    detune: 11,
    filter: { base: 420, range: 280 },
    reverb: 0.7,
    noise: 0.22,
    lfoRate: 0.022,
    eventEvery: 26,
  },
};

// Global engine settings
const FADE = 2.5;           // duration of play/pause/preset-change fades (s)
const MASTER_CEILING = 0.9; // headroom before the compressor
