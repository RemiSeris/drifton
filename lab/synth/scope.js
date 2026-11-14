// Draws what comes out of the synth, read from an AnalyserNode:
// - the waveform (oscilloscope): the signal over time, a few milliseconds of it
// - the spectrum: how much energy at each frequency, on a log scale (20 Hz → 20 kHz)

class Scope {
  constructor(analyser, scopeCanvas, specCanvas) {
    this.analyser = analyser;
    this.scope = scopeCanvas;
    this.spec = specCanvas;
    this.wave = new Float32Array(analyser.fftSize);
    this.freq = new Float32Array(analyser.frequencyBinCount);
    const css = getComputedStyle(document.documentElement);
    this.accent = css.getPropertyValue("--accent").trim();
    this.muted = css.getPropertyValue("--muted").trim();
    const loop = () => { this.draw(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  draw() {
    this.drawWave();
    this.drawSpectrum();
  }

  drawWave() {
    const g = prepCanvas(this.scope);
    const { width: W, height: H } = this.scope;
    this.analyser.getFloatTimeDomainData(this.wave);

    // "Trigger": start drawing where the signal crosses zero going up, so a steady
    // note stays still on screen instead of scrolling (like a real oscilloscope).
    let start = 0;
    for (let i = 1; i < this.wave.length / 2; i++) {
      if (this.wave[i - 1] < 0 && this.wave[i] >= 0) { start = i; break; }
    }
    const n = 1024;
    midline(g, W, H, this.muted);
    g.beginPath();
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * W;
      const y = H / 2 - this.wave[start + i] * H * 0.45;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.strokeStyle = this.accent;
    g.lineWidth = devicePixelRatio * 1.5;
    g.stroke();
  }

  drawSpectrum() {
    const g = prepCanvas(this.spec);
    const { width: W, height: H } = this.spec;
    this.analyser.getFloatFrequencyData(this.freq); // values in dB
    const nyquist = this.analyser.context.sampleRate / 2;
    const bins = this.freq.length;

    // Grid lines at 100 Hz, 1 kHz, 10 kHz.
    g.fillStyle = this.muted;
    g.font = `${10 * devicePixelRatio}px sans-serif`;
    for (const [f, label] of [[100, "100"], [1000, "1k"], [10000, "10k"]]) {
      const x = (Math.log(f / 20) / Math.log(1000)) * W;
      g.globalAlpha = 0.25;
      g.fillRect(x, 0, devicePixelRatio, H);
      g.globalAlpha = 0.8;
      g.fillText(label, x + 4 * devicePixelRatio, 12 * devicePixelRatio);
    }
    g.globalAlpha = 1;

    g.beginPath();
    g.moveTo(0, H);
    for (let x = 0; x <= W; x += 2) {
      const f = 20 * Math.pow(1000, x / W); // x → frequency, logarithmic
      const bin = Math.min(bins - 1, Math.round((f / nyquist) * bins));
      const db = this.freq[bin];
      const level = Math.max(0, Math.min(1, (db + 100) / 90)); // -100 dB → 0, -10 dB → 1
      g.lineTo(x, H - level * H);
    }
    g.lineTo(W, H);
    g.closePath();
    g.fillStyle = this.accent;
    g.globalAlpha = 0.35;
    g.fill();
    g.globalAlpha = 1;
    g.strokeStyle = this.accent;
    g.lineWidth = devicePixelRatio;
    g.stroke();
  }
}

// Match the canvas resolution to its on-screen size (sharp on retina screens), clear it.
function prepCanvas(canvas) {
  const w = Math.round(canvas.clientWidth * devicePixelRatio);
  const h = Math.round(canvas.clientHeight * devicePixelRatio);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  const g = canvas.getContext("2d");
  g.clearRect(0, 0, w, h);
  return g;
}

function midline(g, W, H, color) {
  g.fillStyle = color;
  g.globalAlpha = 0.3;
  g.fillRect(0, H / 2, W, devicePixelRatio);
  g.globalAlpha = 1;
}

// Draw the shape of an ADSR envelope (used under each envelope's sliders).
function drawEnvelope(canvas, env, color) {
  const g = prepCanvas(canvas);
  const { width: W, height: H } = canvas;
  const pad = 4 * devicePixelRatio;
  const top = pad, bottom = H - pad, h = bottom - top;
  const holdTime = Math.max(0.6, (env.attack + env.decay + env.release) * 0.25);
  const total = env.attack + env.decay + holdTime + env.release;
  const X = (t) => pad + (t / total) * (W - 2 * pad);
  const sY = bottom - env.sustain * h;

  g.beginPath();
  g.moveTo(X(0), bottom);
  g.lineTo(X(env.attack), top);
  // Decay and release are exponential curves: draw them with a few points.
  for (let i = 1; i <= 20; i++) {
    const k = i / 20;
    const y = sY + (top - sY) * Math.exp(-k * 4);
    g.lineTo(X(env.attack + k * env.decay), y);
  }
  const relStart = env.attack + env.decay + holdTime;
  g.lineTo(X(relStart), sY);
  for (let i = 1; i <= 20; i++) {
    const k = i / 20;
    const y = bottom + (sY - bottom) * Math.exp(-k * 5);
    g.lineTo(X(relStart + k * env.release), y);
  }
  g.lineTo(X(total), bottom);
  g.fillStyle = color;
  g.globalAlpha = 0.2;
  g.fill();
  g.globalAlpha = 1;
  g.strokeStyle = color;
  g.lineWidth = devicePixelRatio * 1.5;
  g.stroke();
}

// Draw the recent values of an LFO (-1..+1), newest on the right.
function drawTrace(canvas, values, color) {
  const g = prepCanvas(canvas);
  const { width: W, height: H } = canvas;
  midline(g, W, H, color);
  if (values.length < 2) return;
  g.beginPath();
  values.forEach((v, i) => {
    const x = W - (values.length - 1 - i) * (W / 239);
    const y = H / 2 - v * (H / 2 - 3 * devicePixelRatio);
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  });
  g.strokeStyle = color;
  g.lineWidth = devicePixelRatio * 1.5;
  g.stroke();
}
