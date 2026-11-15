// Reverb: the sound of a room, shared by every instrument.
//
//   send ──> pre-delay ──> low cut ──> convolver ──> output (into the MasterBus)
//
// A ConvolverNode plays its input through an "impulse response" (IR): what a room
// sounds like after a single click. We don't load a recording, we compute one:
// noise that fades out, a little different on each side so the tail is wide, and
// darker and darker over time, because in a real room the high frequencies die first.
//
// Each instrument decides how much of itself goes into the room (its "Reverb" send,
// a patch parameter); the room itself (its size) is the same for everyone, like one
// reverb on a send track in Ableton.
//
// - pre-delay: a short gap before the tail starts, so the dry note stays clear
// - low cut: no bass in the tail, otherwise the low end turns to mud
// - size: changing it builds a new IR and crossfades to it, so there is no cut

class Reverb {
  constructor(ctx, seconds = 6) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    // The normalised tail comes out quiet (its energy is spread over seconds):
    // bring it back up so a 50% send is clearly heard under the dry sound.
    this.output.gain.value = 3;

    this.predelay = ctx.createDelay(0.2);
    this.predelay.delayTime.value = 0.03;
    this.lowcut = ctx.createBiquadFilter();
    this.lowcut.type = "highpass";
    this.lowcut.frequency.value = 180;
    this.lowcut.Q.value = -3; // no resonant bump

    this.input.connect(this.predelay);
    this.predelay.connect(this.lowcut);

    this.room = null; // { convolver, gain } currently heard
    this.seconds = 0;
    this.setSize(seconds);
  }

  // Reverb time in seconds: how long the tail takes to fade by 60 dB.
  setSize(seconds) {
    if (Math.abs(seconds - this.seconds) < 0.05) return;
    this.seconds = seconds;
    const t = this.ctx.currentTime;
    const fade = 1.5;

    const convolver = this.ctx.createConvolver();
    convolver.buffer = makeRoomIR(this.ctx, seconds);
    const gain = this.ctx.createGain();
    this.lowcut.connect(convolver);
    convolver.connect(gain);
    gain.connect(this.output);

    const old = this.room;
    if (!old) {
      gain.gain.value = 1;
    } else {
      // Equal-power-ish crossfade: the old room fades out while the new one fades in.
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(1, t + fade);
      holdAt(old.gain.gain, t);
      old.gain.gain.linearRampToValueAtTime(0, t + fade);
      setTimeout(() => {
        this.lowcut.disconnect(old.convolver);
        old.convolver.disconnect();
        old.gain.disconnect();
      }, (fade + 0.2) * 1000);
    }
    this.room = { convolver, gain };
  }
}

// The computed room. For each stereo side and each sample:
// - white noise (a dense cloud of tiny echoes)
// - times an exponential fade: -60 dB after `seconds`
// - through a one-pole low-pass whose cutoff slides down from ~9 kHz to ~1.2 kHz,
//   so the tail gets warmer as it fades
// The first few milliseconds fade in, so the reverb blooms instead of clicking.
function makeRoomIR(ctx, seconds) {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * seconds);
  const ir = ctx.createBuffer(2, len, sr);
  const attack = Math.floor(sr * 0.012);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const k = i / len;                          // 0 → 1 over the tail
      const env = Math.exp(-6.908 * k);           // e^-6.9 ≈ 0.001 = -60 dB
      const cutoff = 9000 * Math.pow(1200 / 9000, k);
      const a = Math.exp((-2 * Math.PI * cutoff) / sr);
      lp = a * lp + (1 - a) * (Math.random() * 2 - 1);
      const bloom = i < attack ? i / attack : 1;
      d[i] = lp * env * bloom;
    }
  }
  // The ConvolverNode normalises the IR's loudness by itself (normalize = true),
  // so short and long rooms come out at a similar level.
  return ir;
}
