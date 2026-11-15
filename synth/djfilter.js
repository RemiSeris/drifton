// DJ filter: one low-pass on the whole mix, the classic "close the sound" gesture.
//
//   everything ──> low-pass ──> limiter
//
// close(): the cutoff slides down (exponentially, so it sounds even: each second takes
// away the same number of octaves) while the resonance rises, which gives the "wah"
// squeal of a closing filter. open(): it snaps back to fully open, at a given time
// (the build-up uses this to open exactly on the drop).
//
// insert(master) puts it in front of the MasterBus limiter, after the reverb too,
// so the room closes with the rest.

const DJ_OPEN = 20000;   // Hz: nothing is cut
const DJ_CLOSED = 180;   // Hz: only the kick and the bass get through

class DJFilter {
  constructor(ctx) {
    this.ctx = ctx;
    this.lp = ctx.createBiquadFilter();
    this.lp.type = "lowpass";
    this.lp.frequency.value = DJ_OPEN;
    this.lp.Q.value = 0.7;
    this.input = this.lp;
    this.output = this.lp;
    this.closing = false;
  }

  // Re-route a MasterBus: input and reverb go through the filter, then to the limiter.
  insert(master) {
    master.input.disconnect(master.limiter);
    master.reverb.output.disconnect(master.limiter);
    master.input.connect(this.input);
    master.reverb.output.connect(this.input);
    this.output.connect(master.limiter);
  }

  // Slide down to closed over `seconds`, starting at time `t` (now if omitted).
  close(seconds = 3, t = this.ctx.currentTime) {
    this.closing = true;
    this.hold(t);
    this.lp.frequency.exponentialRampToValueAtTime(DJ_CLOSED, t + seconds);
    this.lp.Q.linearRampToValueAtTime(7, t + seconds);
  }

  // Back to open, starting at time `t` (now if omitted).
  open(t = this.ctx.currentTime, seconds = 0.3) {
    this.closing = false;
    this.hold(t);
    this.lp.frequency.exponentialRampToValueAtTime(DJ_OPEN, t + seconds);
    this.lp.Q.linearRampToValueAtTime(0.7, t + seconds);
  }

  // Freeze the cutoff where it is at time t, so a new slide starts from there.
  hold(t) {
    for (const p of [this.lp.frequency, this.lp.Q]) {
      if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t);
      else { p.cancelScheduledValues(t); p.setValueAtTime(p.value, t); }
    }
  }

  // 0 = open, 1 = closed (for the display).
  get amount() {
    const f = this.lp.frequency.value;
    return 1 - Math.log(f / DJ_CLOSED) / Math.log(DJ_OPEN / DJ_CLOSED);
  }
}
