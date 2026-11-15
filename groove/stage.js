// The stage: a light show driven by what is actually played, so you feel each gesture.
//
// Every hit the engine logs (lane, time, velocity) becomes a shape that lives a few
// hundred milliseconds, drawn on the audio clock, so it lands with the sound:
//   kick  → a disc that thumps in the middle        snare → a ring that flies out
//   hats  → sparks                                  perc  → small diamonds
//   bass  → a wave rising from the floor            keys  → light beams
//   melody (you) → a comet per note: left = low, right = high; it rises while you hold
//                  the key and floats away when you let go
// On top, the live gestures:
//   filter → curtains close from top and bottom     roll / build-up → a meter that fills
//   break  → the floor goes dark, "BREAK"           drop → white flash and a shake
// The background glows in the colour of the style playing the beat, as loud as the mix.

const STAGE_LIFE = { kick: 0.35, snare: 0.5, hat: 0.2, perc: 0.3, bass: 0.45, keys: 0.35 };

// Same "random" position for the same hit on every frame: derived from its time.
function stageRand(seed, k = 1) {
  const x = Math.sin(seed * 12.9898 * k + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function stageLevel(analyser) {
  const d = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(d);
  let e = 0;
  for (let i = 0; i < d.length; i += 4) e += d[i] * d[i];
  return Math.min(1, Math.sqrt(e / (d.length / 4)) * 4);
}

function drawStage(canvas, s) {
  const g = prepCanvas(canvas);
  const { width: W, height: H } = canvas;
  const dpr = devicePixelRatio;
  const cx = W / 2, cy = H / 2;
  const level = s.running ? stageLevel(s.analyser) : 0;

  // Drop: a short shake of the whole picture.
  const dropAge = s.now - s.lastDrop;
  const dropping = s.lastDrop > 0 && dropAge >= 0 && dropAge < 0.7;
  g.save();
  if (dropping) {
    const a = (1 - dropAge / 0.7) * 8 * dpr;
    g.translate((Math.random() - 0.5) * a, (Math.random() - 0.5) * a);
  }

  // Background glow.
  const glow = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.6);
  glow.addColorStop(0, s.color);
  glow.addColorStop(1, "transparent");
  g.globalAlpha = 0.06 + level * 0.35;
  g.fillStyle = glow;
  g.fillRect(-20, -20, W + 40, H + 40);

  // Hits.
  for (const h of s.hits) {
    const age = s.now - h.t;
    const life = STAGE_LIFE[h.lane];
    if (age < 0 || age > life) continue;
    const a = age / life;            // 0 → 1 over the life of the shape
    const fade = 1 - a;
    g.fillStyle = g.strokeStyle = s.colors[h.lane];
    if (h.lane === "kick") {
      const r = H * (0.16 + 0.16 * h.v) * (1 - 0.3 * a) * (a < 0.08 ? 0.85 + 2 * a : 1);
      g.globalAlpha = 0.85 * fade;
      g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
    } else if (h.lane === "snare") {
      g.globalAlpha = 0.9 * fade * (0.4 + 0.6 * h.v);
      g.lineWidth = (2 + 6 * h.v) * fade * dpr;
      g.beginPath(); g.arc(cx, cy, H * (0.2 + 0.75 * Math.sqrt(a)), 0, Math.PI * 2); g.stroke();
    } else if (h.lane === "hat") {
      for (let k = 1; k <= 3; k++) {
        const x = stageRand(h.t, k) * W, y = stageRand(h.t, k + 7) * H * 0.8;
        g.globalAlpha = fade * (0.3 + 0.6 * h.v);
        g.beginPath(); g.arc(x, y, (1.5 + 2 * h.v) * dpr, 0, Math.PI * 2); g.fill();
      }
    } else if (h.lane === "perc") {
      const x = W * (0.15 + 0.7 * stageRand(h.t, 3)), y = H * (0.2 + 0.5 * stageRand(h.t, 5));
      const r = (5 + 6 * h.v) * dpr * (1 + a);
      g.globalAlpha = fade * 0.8;
      g.beginPath(); g.moveTo(x, y - r); g.lineTo(x + r, y); g.lineTo(x, y + r); g.lineTo(x - r, y); g.closePath(); g.fill();
    } else if (h.lane === "bass") {
      const hh = H * 0.22 * h.v * fade;
      g.globalAlpha = 0.55 * fade;
      g.beginPath();
      g.moveTo(0, H);
      for (let x = 0; x <= W; x += 8 * dpr) {
        g.lineTo(x, H - hh * (0.7 + 0.3 * Math.sin(x / (40 * dpr) + h.t * 9)));
      }
      g.lineTo(W, H); g.closePath(); g.fill();
    } else if (h.lane === "keys") {
      for (let k = 1; k <= 3; k++) {
        const x = W * (0.1 + 0.8 * stageRand(h.t, k + 20));
        const grad = g.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, s.colors.keys);
        grad.addColorStop(1, "transparent");
        g.globalAlpha = 0.45 * fade * h.v;
        g.fillStyle = grad;
        g.fillRect(x - 3 * dpr, 0, 6 * dpr, H * (0.4 + 0.4 * stageRand(h.t, k)));
      }
    }
  }
  // Melody notes: comets.
  if (s.lead) {
    for (const n of s.lead) {
      if (n.t > s.now) continue;
      const after = n.end === Infinity ? 0 : s.now - n.end;
      if (after > 0.8) continue;
      const fade = 1 - after / 0.8;
      const held = Math.min(n.end, s.now) - n.t;
      const x = W * (0.06 + 0.88 * Math.min(1, Math.max(0, (n.midi - 55) / 36)));
      const y = H * (0.88 - 0.55 * Math.min(1, held / 1.2)) - after * H * 0.5;
      const r = (10 + 5 * Math.min(1, held)) * dpr;
      // The moment the note starts: a ripple on the floor.
      const born = s.now - n.t;
      if (born < 0.45) {
        const a = born / 0.45;
        g.globalAlpha = 0.8 * (1 - a);
        g.strokeStyle = s.colors.lead;
        g.lineWidth = 3 * dpr * (1 - a);
        g.beginPath(); g.arc(x, H * 0.88, r + a * H * 0.35, 0, Math.PI * 2); g.stroke();
      }
      const trail = g.createLinearGradient(0, y, 0, H);
      trail.addColorStop(0, s.colors.lead);
      trail.addColorStop(1, "transparent");
      g.globalAlpha = 0.35 * fade;
      g.fillStyle = trail;
      g.fillRect(x - r * 0.35, y, r * 0.7, H - y);
      const halo = g.createRadialGradient(x, y, 0, x, y, r * 3);
      halo.addColorStop(0, s.colors.lead);
      halo.addColorStop(1, "transparent");
      g.globalAlpha = 0.5 * fade;
      g.fillStyle = halo;
      g.fillRect(x - r * 3, y - r * 3, r * 6, r * 6);
      g.globalAlpha = fade;
      g.fillStyle = "#ffe6f4";
      g.beginPath(); g.arc(x, y, r * 0.6, 0, Math.PI * 2); g.fill();
    }
  }
  g.globalAlpha = 1;

  // Break: the floor goes dark.
  const big = (text, alpha, size = 34, color = "#e9e6ff") => {
    g.globalAlpha = alpha;
    g.fillStyle = color;
    g.font = `600 ${size * dpr}px sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text, cx, cy);
    g.textAlign = "start";
  };
  if (s.live.breaking) {
    g.globalAlpha = 0.45;
    g.fillStyle = "#000";
    g.fillRect(0, 0, W, H);
    big("BREAK", 0.5 + 0.2 * Math.sin(s.now * 8));
  }

  // Filter: curtains closing from top and bottom, with the cutoff as a glowing edge.
  if (s.filter > 0.01) {
    const c = Math.min(1, s.filter) * H * 0.42;
    g.globalAlpha = 0.82;
    g.fillStyle = "#07060c";
    g.fillRect(0, 0, W, c);
    g.fillRect(0, H - c, W, c);
    g.globalAlpha = 0.9;
    g.fillStyle = s.colors.keys;
    g.fillRect(0, c - 2 * dpr, W, 2 * dpr);
    g.fillRect(0, H - c, W, 2 * dpr);
  }

  // Roll / build-up meter on the right edge.
  if (s.live.rolling || s.held.has("roll") || s.held.has("build")) {
    const building = s.live.building || s.held.has("build");
    const lv = s.live.rollLevel;
    const mw = 10 * dpr, mx = W - mw - 12 * dpr;
    g.globalAlpha = 0.25;
    g.fillStyle = "#e9e6ff";
    g.fillRect(mx, 12 * dpr, mw, H - 24 * dpr);
    g.globalAlpha = 0.9;
    g.fillStyle = building ? "#ff7a9a" : s.colors.snare;
    const mh = (H - 24 * dpr) * Math.max(0.04, lv);
    g.fillRect(mx, H - 12 * dpr - mh, mw, mh);
    if (building) big("BUILD", 0.35 + 0.5 * lv + 0.15 * Math.sin(s.now * (6 + 20 * lv)), 30 + 14 * lv);
  }

  // Drop: white flash and the word.
  if (dropping) {
    const a = 1 - dropAge / 0.7;
    g.globalAlpha = 0.55 * a * a;
    g.fillStyle = "#ffffff";
    g.fillRect(-20, -20, W + 40, H + 40);
    big("DROP", a, 48 + 20 * (1 - a), a > 0.5 ? "#0a0a0f" : "#e9e6ff");
  }

  g.restore();
  g.globalAlpha = 1;
}
