// A light "keys" sound to play MIDI files: per note, a sine (the body) and a sawtooth
// through a low-pass filter that closes as the note decays, like a struck string losing
// its high harmonics. Simpler than the synth on purpose: a piano piece can have many
// notes at once, and it has to stay smooth on a tablet.

const MAX_VOICES = 48;

class PianoSound {
  constructor(ctx) {
    this.ctx = ctx;
    this.voices = []; // { pitch, start, end, gain, oscs }
    this.out = ctx.createGain();
    this.out.gain.value = 0.8;
    // Limiter: many loud notes together must not distort.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;
    this.out.connect(limiter).connect(ctx.destination);
  }

  setVolume(v) {
    this.out.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  // Play a MIDI note at audio time `t`, for `length` seconds (key held + pedal).
  play(pitch, velocity, t, length) {
    const ctx = this.ctx;
    this.voices = this.voices.filter((v) => v.end > ctx.currentTime);
    // The same key struck again: damp the previous note first.
    for (const v of this.voices) if (v.pitch === pitch && v.end > t) this.damp(v, t);
    if (this.voices.length >= MAX_VOICES) this.damp(this.voices[0], t);

    const f = 440 * 2 ** ((pitch - 69) / 12);
    const end = t + Math.max(length, 0.05);
    const peak = 0.04 + 0.22 * velocity ** 1.5;
    const ring = 0.6 + 3 * Math.max(0, (96 - pitch) / 60); // low notes ring longer

    // Volume: instant attack, quick drop, slow decay, short release when the key is up.
    const gain = ctx.createGain();
    const g = gain.gain;
    g.setValueAtTime(0, t);
    g.linearRampToValueAtTime(peak, t + 0.004);
    g.setTargetAtTime(peak * 0.4, t + 0.004, 0.12);
    if (end > t + 0.3) g.setTargetAtTime(0, t + 0.3, ring);
    g.setTargetAtTime(0, end, 0.07);

    // Brightness: harder notes are brighter, and every note darkens as it decays.
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 0;
    filter.frequency.setValueAtTime(Math.min(16000, f * (3 + 10 * velocity)), t);
    filter.frequency.setTargetAtTime(Math.min(16000, f * 1.5 + 200), t + 0.01, 0.25 + ring * 0.15);

    const saw = ctx.createOscillator();
    saw.type = "sawtooth";
    saw.frequency.value = f;
    saw.detune.value = 4;
    const sawLevel = ctx.createGain();
    sawLevel.gain.value = 0.45;
    const sine = ctx.createOscillator();
    sine.frequency.value = f;

    saw.connect(sawLevel).connect(filter);
    sine.connect(filter);
    filter.connect(gain).connect(this.out);

    const oscs = [saw, sine];
    for (const o of oscs) { o.start(t); o.stop(end + 0.6); }
    sine.onended = () => gain.disconnect();
    this.voices.push({ pitch, start: t, end, gain, oscs });
  }

  // Fade a note out quickly from time t.
  damp(v, t, fade = 0.03) {
    const g = v.gain.gain;
    if (v.start >= t) {
      // Not started yet: make sure it never sounds.
      g.cancelScheduledValues(0);
      g.setValueAtTime(0, 0);
    } else {
      if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(t);
      else g.cancelScheduledValues(t); // Firefox
      g.setTargetAtTime(0, t, fade);
    }
    // Calling stop() again replaces the earlier stop time.
    for (const o of v.oscs) try { o.stop(Math.max(t, v.start) + fade * 8); } catch {}
    v.end = Math.min(v.end, t);
    this.voices = this.voices.filter((x) => x !== v);
  }

  // Silence everything now (pause, seek, speed change).
  stopAll() {
    const now = this.ctx.currentTime;
    for (const v of [...this.voices]) this.damp(v, now, 0.02);
    this.voices = [];
  }
}
