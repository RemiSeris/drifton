// The thin bar above the roll: the whole song, where we are, the loop. Tap or drag on it
// to jump anywhere.

class Timeline {
  constructor(canvas, onSeek) {
    this.canvas = canvas;
    this.g = canvas.getContext("2d");
    this.duration = 0;
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();

    const seek = (e) => {
      if (!this.duration) return;
      const r = canvas.getBoundingClientRect();
      onSeek(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * this.duration);
    };
    canvas.addEventListener("pointerdown", (e) => {
      canvas.setPointerCapture(e.pointerId); // keep receiving moves outside the bar
      seek(e);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (canvas.hasPointerCapture(e.pointerId)) seek(e);
    });
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.round(r.width * dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * dpr));
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = r.width;
    this.h = r.height;
  }

  draw(song, pos, loop) {
    const { g, w, h } = this;
    g.clearRect(0, 0, w, h);
    this.duration = song ? song.duration : 0;
    if (!song) return;
    const x = (t) => (Math.max(0, Math.min(t, song.duration)) / song.duration) * w;
    const mid = h / 2;

    g.fillStyle = "#221f33";
    g.fillRect(0, mid - 3, w, 6);
    if (loop.on) {
      g.fillStyle = "rgba(138, 127, 255, 0.35)";
      g.fillRect(x(loop.a), 2, x(loop.b) - x(loop.a), h - 4);
    }
    // A tick every few bars, spaced enough to stay readable.
    const every = Math.max(1, Math.ceil(song.bars.length / (w / 8)));
    g.fillStyle = "#3a3654";
    for (let i = 0; i < song.bars.length; i += every) g.fillRect(Math.round(x(song.bars[i])), mid + 4, 1, 4);

    g.fillStyle = "#8a7fff";
    g.fillRect(0, mid - 3, x(pos), 6);
    g.beginPath();
    g.arc(x(pos), mid, 7, 0, Math.PI * 2);
    g.fill();
  }
}
