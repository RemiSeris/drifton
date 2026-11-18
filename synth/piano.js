// Piano: a struck string, built partial by partial (additive synthesis).
//
// A plucked string (pluck.js) starts with a scrape of noise; a piano string is hit by
// a felt hammer: a soft knock, no scrape. Three things make a piano sound like one,
// and each is modelled here, for every partial (overtone) k of the note:
// - stretched partials: piano strings are stiff, so partial k is not exactly k × f but
//   a little higher, k × f × √(1 + B·k²). This "inharmonicity" (B) is the piano colour.
// - the hammer: harder = brighter. The partials fall off as k^-p, p smaller when you hit
//   harder; and the hammer strikes at 1/7 of the string, which softens the 7th partial.
// - the two-stage decay: each note has 2–3 strings a hair out of tune with each other.
//   Together they first fade fast (prompt sound), then one keeps singing (aftersound).
//   We model two strings per partial, one fading 3× faster than the other, slightly
//   detuned: the beating between them is the piano's slow shimmer.
// Higher partials fade faster than the fundamental, so the tone mellows as it rings.
// Plus a short low "thump": the hammer knocking the string and the soundboard.
//
// Each partial is a damped sine made by a 2-multiplication recursion (no Math.sin in
// the loop), so a note costs a few milliseconds the first time; then it's cached.
// It plays exactly like the plucked strings (same class, another render()).

const PIANO_DEFAULTS = {
  ...PLUCK_DEFAULTS,
  decay: 10,         // seconds to fade by 60 dB (aftersound) around middle C
  inharmonicity: 1,  // multiplies the natural B of the note
  hardness: 0.6,     // 0 = soft felt, 1 = hard hammer
  detune: 0.9,       // cents between the two strings
  thump: 0.5,
  tone: 7000, release: 0.25, level: 1, "fx.reverb": 0.25,
};

class PianoSynth extends PluckSynth {
  loadPatch(patch) { this.params = { ...PIANO_DEFAULTS, ...patch }; this.cache.clear(); this.apply(); }

  render(sr, note, velocity) {
    const P = this.params;
    const f = midiToFreq(note);
    const T1 = Math.min(8, P.decay * Math.pow(261.6 / f, 0.6)); // low notes ring longer
    const n = Math.floor(sr * Math.min(6, T1 * 0.8 + 0.1));
    const out = new Float32Array(n);
    const B = 0.0001 * Math.pow(2, (note - 60) / 24) * P.inharmonicity;
    const hard = Math.min(1, P.hardness * (0.5 + 0.7 * velocity));
    const p = 2.2 - 1.4 * hard;                     // spectral slope of the hammer
    const strike = 1 / 7;
    const K = Math.min(24, Math.floor(12000 / f));
    const detune = Math.pow(2, P.detune / 1200);
    let norm = 0;
    for (let k = 1; k <= K; k++) {
      const fk = k * f * Math.sqrt(1 + B * k * k);
      if (fk > sr * 0.45) break;
      const amp = Math.pow(k, -p) * (0.3 + 0.7 * Math.abs(Math.sin(Math.PI * k * strike)));
      norm += amp;
      const Tk = T1 / (1 + 0.015 * k * k * Math.sqrt(f / 261.6)); // highs die sooner
      // Two strings: the "prompt" one fades 3× faster; they are slightly detuned.
      addDampedSine(out, sr, fk, Tk / 3, amp * 0.6, Math.random() * 6.28);
      addDampedSine(out, sr, fk * detune, Tk, amp * 0.4, Math.random() * 6.28);
    }
    // Normalise, then a 2 ms rise so the attack doesn't click.
    const g = 0.5 / (norm || 1);
    const rise = Math.floor(sr * 0.002);
    for (let i = 0; i < n; i++) out[i] *= g * (i < rise ? i / rise : 1);
    // The thump: low-passed noise, 25 ms.
    const th = P.thump * 0.12 * velocity;
    const len = Math.floor(sr * 0.025);
    const a = Math.exp((-2 * Math.PI * 180) / sr);
    let lp = 0;
    for (let i = 0; i < len && i < n; i++) {
      lp = a * lp + (1 - a) * (Math.random() * 2 - 1);
      out[i] += lp * 6 * th * Math.exp(-i / (sr * 0.008));
    }
    return out;
  }
}

// A sine that fades to -60 dB in T seconds, added into out, by recursion:
// y[n] = 2r·cos(w)·y[n-1] − r²·y[n-2]  (r = decay per sample).
function addDampedSine(out, sr, freq, T, amp, phase) {
  const w = (2 * Math.PI * freq) / sr;
  const r = Math.pow(10, -3 / (T * sr));
  const c = 2 * r * Math.cos(w), r2 = r * r;
  let y1 = amp * Math.sin(phase - w) * (1 / r), y2 = amp * Math.sin(phase - 2 * w) * (1 / (r * r));
  const n = Math.min(out.length, Math.floor(T * sr * 1.2));
  for (let i = 0; i < n; i++) {
    const y = c * y1 - r2 * y2;
    out[i] += y;
    y2 = y1; y1 = y;
  }
}
