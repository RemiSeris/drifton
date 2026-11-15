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
// - snare: noise through a high-pass (the wires) + a short falling triangle (the skin)
// - hat:   white noise, only the very top kept, very short (longer when "open")
// - perc:  a short high sine, like a clave or a rim click

const DRUM_LANES = ["kick", "snare", "hat", "perc"];

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
    setParam(this.ctx, this.lanes[name].gain.gain, on ? 1 : 0, true);
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
    this.hit(osc, [], out, t, v * 1.1, 0.002, 0.45);
    this.noiseHit("highpass", 3000, out, t, v * 0.25, 0.008);
  }

  snare(t, v, out) {
    this.noiseHit("highpass", 1400, out, t, v * 0.9, 0.17);
    const osc = this.ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(200, t);
    osc.frequency.exponentialRampToValueAtTime(150, t + 0.08);
    this.hit(osc, [], out, t, v * 0.6, 0.001, 0.1);
  }

  hat(t, v, out, open) {
    this.noiseHit("highpass", 7500, out, t, v * 0.45, open ? 0.28 : 0.045);
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
  hit(src, filters, out, t, v, attack, decay, offset = 0) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0005, t + attack + decay);
    let node = src;
    for (const f of filters) { node.connect(f); node = f; }
    node.connect(g);
    g.connect(out);
    src.start(t, offset);
    src.stop(t + attack + decay + 0.02);
    src.onended = () => g.disconnect();
  }
}
