// Drums: four synthesised percussion sounds, no samples.
//
//   kick ─┐
//   snare ┼──> each lane's gain ──> output ──> MasterBus
//   hat ──┤           └──> reverb send (per lane: a dub snare lives in the room,
//   perc ─┘                              a kick stays dry)
//
// Every hit builds a few short-lived nodes, plays, and throws them away, like a Voice.
// - kick:  a sine whose pitch falls fast (160 → 48 Hz): the drop IS the thump,
//          plus a tiny burst of noise for the click of the beater
// - snare: noise through a band-pass (the wires) + two short falling triangles (the skin)
// - hat:   the Roland TR-808 trick: six square waves at out-of-tune ratios. Their
//          harmonics clash into a metallic shimmer, then only the top is kept. Much
//          tighter and less "hissy" than plain white noise, which sounds like a wash.
// - perc:  a short high sine, like a clave or a rim click

const DRUM_LANES = ["kick", "snare", "hat", "perc"];

// Mix of the kit: the hats play 16 times a bar, so they sit well under the kick.
const DRUM_LEVELS = { kick: 1, snare: 0.75, hat: 0.35, perc: 0.6 };

// The six "out of tune" square waves of the 808 cymbal circuit, in Hz.
const HAT_FREQS = [205.3, 304.4, 369.6, 522.7, 540, 800];
// Only the faint top harmonics get through the filters: bring them back up.
const HAT_GAIN = 1;

class Drums {
  constructor(ctx, destination, send) {
    this.ctx = ctx;
    this.noise = makeNoiseBuffers(ctx).white;
    this.output = ctx.createGain();
    this.output.gain.value = 0.55; // leaves headroom: the kick alone peaks high
    this.output.connect(destination);
    this.lanes = {};
    for (const name of DRUM_LANES) {
      const gain = ctx.createGain();
      gain.gain.value = DRUM_LEVELS[name];
      const sendGain = ctx.createGain();
      sendGain.gain.value = 0;
      gain.connect(this.output);
      gain.connect(sendGain);
      if (send) sendGain.connect(send);
      this.lanes[name] = { gain, sendGain };
    }
  }

  setSend(name, value) {
    setParam(this.ctx, this.lanes[name].sendGain.gain, value, true);
  }

  setOn(name, on) {
    setParam(this.ctx, this.lanes[name].gain.gain, on ? DRUM_LEVELS[name] : 0, true);
  }

  play(name, t, velocity) {
    const out = this.lanes[name].gain;
    if (name === "kick") this.kick(t, velocity, out);
    else if (name === "snare") this.snare(t, velocity, out);
    else if (name === "hat") this.hat(t, velocity, out, velocity > 0.85);
    else this.perc(t, velocity, out);
  }

  kick(t, v, out) {
    const osc = this.ctx.createOscillator();
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(48, t + 0.11);
    this.hit(osc, [], out, t, v * 1.1, 0.002, 0.4);
    this.noiseHit("highpass", 3000, out, t, v * 0.12, 0.006);
  }

  snare(t, v, out) {
    this.noiseHit("bandpass", 2800, out, t, v * 2.2, 0.13);
    for (const [f, level] of [[185, 0.6], [330, 0.3]]) {
      const osc = this.ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(f, t);
      osc.frequency.exponentialRampToValueAtTime(f * 0.8, t + 0.06);
      this.hit(osc, [], out, t, v * level, 0.001, 0.08);
    }
  }

  hat(t, v, out, open) {
    const ctx = this.ctx;
    const mixer = ctx.createGain();
    mixer.gain.value = HAT_GAIN;
    const oscs = HAT_FREQS.map((f) => {
      const o = ctx.createOscillator();
      o.type = "square";
      o.frequency.value = f;
      o.connect(mixer);
      return o;
    });
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 10000;
    band.Q.value = 0.8;
    const high = ctx.createBiquadFilter();
    high.type = "highpass";
    high.frequency.value = 7000;
    const decay = open ? 0.18 : 0.035;
    // The oscillators play through one shared gain envelope: route them via `mixer`.
    this.hit(mixer, [band, high], out, t, v, 0.001, decay, 0, oscs);
  }

  perc(t, v, out) {
    const osc = this.ctx.createOscillator();
    osc.frequency.value = 2300;
    this.hit(osc, [], out, t, v * 0.35, 0.001, 0.06);
  }

  // A burst of noise through one filter.
  noiseHit(type, freq, out, t, v, decay) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    this.hit(src, [filter], out, t, v, 0.001, decay, Math.random() * 3);
  }

  // Shared plumbing: source → filters → gain (fast attack, exponential decay) → out.
  // The decay is exponential because that is how a struck object loses energy.
  // `sources` (optional): oscillators feeding `src` when `src` is only a mixer.
  hit(src, filters, out, t, v, attack, decay, offset = 0, sources = null) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0005, t + attack + decay);
    let node = src;
    for (const f of filters) { node.connect(f); node = f; }
    node.connect(g);
    g.connect(out);
    const end = t + attack + decay + 0.02;
    if (sources) {
      for (const o of sources) { o.start(t); o.stop(end); }
      sources[0].onended = () => g.disconnect();
    } else {
      src.start(t, offset);
      src.stop(end);
      src.onended = () => g.disconnect();
    }
  }
}
