// Starter sounds, one per instrument. Each patch only lists what differs from the
// defaults in params.js; makePatch fills in the rest.

const STARTER_PATCHES = {
  Pad: { "fx.reverb": 0.45 },

  // Mono-ish and round: one saw an octave down, a sine sub-octave, filter mostly closed.
  Bass: {
    "a.octave": -1, "a.unison": 1, "a.spread": 0, "a.width": 0, "a.level": 0.6,
    "b.wave": "sine", "b.octave": -2, "b.level": 0.7,
    "noise.level": 0,
    "filter.cutoff": 320, "filter.res": 0.25, "filter.env": 1.5,
    "fenv.attack": 0.01, "fenv.decay": 0.6, "fenv.sustain": 0.2, "fenv.release": 0.4,
    "amp.attack": 0.01, "amp.decay": 0.5, "amp.sustain": 0.8, "amp.release": 0.5,
    "lfo1.rate": 0.1,
    "mod1.amount": 0.1, "mod2.src": "off", "mod3.src": "off",
    "fx.reverb": 0.1, // a dry bass keeps the low end clean
  },

  // Bell-like: pure sines, instant attack, sustain at 0 so the note dies away on its own.
  // Osc B is a quiet sine a fifth above.
  Bells: {
    "a.wave": "sine", "a.octave": 1, "a.unison": 1, "a.spread": 0, "a.width": 0, "a.level": 0.7,
    "b.wave": "sine", "b.octave": 0, "b.semi": 7, "b.level": 0.15,
    "noise.level": 0,
    "filter.cutoff": 6000, "filter.res": 0, "filter.env": 0,
    "amp.attack": 0.003, "amp.decay": 2.5, "amp.sustain": 0, "amp.release": 2.5,
    "lfo2.rate": 5,
    "mod1.src": "off",
    "mod2.dst": "pitch", "mod2.amount": 0.04,
    "mod3.dst": "pan", "mod3.amount": 0.5,
    "fx.reverb": 0.65, // bells live in the room
    volume: 0.6,
  },

  // Mostly noise through a narrow band-pass filter that drifts around: wind, air.
  Texture: {
    "a.unison": 7, "a.spread": 40, "a.width": 1, "a.level": 0.15,
    "b.level": 0,
    "noise.color": "pink", "noise.level": 0.8,
    "filter.type": "bandpass", "filter.cutoff": 1200, "filter.res": 0.6, "filter.env": 0,
    "amp.attack": 3, "amp.decay": 2, "amp.sustain": 1, "amp.release": 6,
    "lfo1.rate": 0.3, "lfo2.rate": 0.05,
    "mod1.amount": 0.5,
    "mod2.amount": 0.6,
    "mod3.dst": "amp", "mod3.amount": 0.4,
    "fx.reverb": 0.5,
    volume: 0.6,
  },
};

function makePatch(name) {
  return { ...defaultParams(), ...STARTER_PATCHES[name] };
}
