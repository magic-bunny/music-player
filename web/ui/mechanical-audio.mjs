// Locally synthesized mechanical sounds: no downloads and no media element resets.
export function mechanicalSamples(kind, sampleRate = 48000) {
  if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 192000)
    throw new RangeError("Unsupported sample rate");
  const button = kind === "button";
  const duration = button ? 0.052 : 0.026;
  const samples = new Float32Array(Math.ceil(sampleRate * duration));
  let seed = button ? 0x52fa304b : 0x19410abc;
  let low = 0;
  const noise = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    const white = (seed >>> 0) / 2147483648 - 1;
    low += 0.22 * (white - low);
    return white - low;
  };
  for (let i = 0; i < samples.length; i++) {
    const t = i / sampleRate;
    const attack = Math.min(1, t / 0.0006);
    const body =
      Math.sin(2 * Math.PI * (button ? 620 : 1600) * t) *
      Math.exp(-t / (button ? 0.007 : 0.003));
    const impact = noise() * Math.exp(-t / (button ? 0.0038 : 0.0018));
    const reboundTime = t - (button ? 0.011 : 0.005);
    const rebound =
      reboundTime > 0
        ? noise() *
          Math.min(1, reboundTime / 0.0004) *
          Math.exp(-reboundTime / 0.002)
        : 0;
    const fade = Math.min(1, (duration - t) / 0.003);
    samples[i] = Math.max(
      -0.65,
      Math.min(
        0.65,
        (impact * 0.5 + body * 0.22 + rebound * 0.16) * attack * fade,
      ),
    );
  }
  samples[0] = 0;
  samples[samples.length - 1] = 0;
  return samples;
}

export class MechanicalAudio {
  constructor({ enabled = true, contextFactory } = {}) {
    this.enabled = enabled;
    this.contextFactory =
      contextFactory ||
      (() =>
        new (window.AudioContext || window.webkitAudioContext)({
          latencyHint: "interactive",
        }));
    this.context = null;
    this.gain = null;
    this.buffers = new Map();
    this.sources = new Set();
    this.tickEnd = 0;
    this.mutedForTest = false;
    this.stats = { ticks: 0, buttons: 0 };
  }
  prepare() {
    if (!this.enabled) return null;
    try {
      if (!this.context || this.context.state === "closed") {
        this.context = this.contextFactory();
        this.gain = this.context.createGain();
        this.gain.gain.value = this.mutedForTest ? 0 : 0.12;
        this.gain.connect(this.context.destination);
        this.buffers.clear();
        this.tickEnd = 0;
      }
      return this.context;
    } catch {
      return null;
    }
  }
  async unlock() {
    const context = this.prepare();
    if (!context) return false;
    try {
      if (context.state !== "running") await context.resume();
      return context.state === "running";
    } catch {
      return false;
    }
  }
  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (!this.enabled) {
      for (const source of this.sources) {
        try {
          source.stop();
        } catch {}
      }
      this.sources.clear();
      this.tickEnd = 0;
    }
  }
  setMutedForTest(muted) {
    this.mutedForTest = muted;
    if (this.gain) this.gain.gain.value = muted ? 0 : 0.12;
  }
  play(kind, count = 1) {
    if (!this.enabled || !Number.isFinite(count)) return;
    count = Math.max(0, Math.trunc(Math.abs(count)));
    if (!count) return;
    const requestedAt = performance.now();
    const context = this.prepare();
    if (!context) return;
    const schedule = () => {
      // Do not replay an old UI interaction after the audio device wakes much later.
      if (
        !this.enabled ||
        context.state !== "running" ||
        performance.now() - requestedAt > 180
      )
        return;
      let buffer = this.buffers.get(kind);
      if (!buffer) {
        const samples = mechanicalSamples(kind, context.sampleRate);
        buffer = context.createBuffer(1, samples.length, context.sampleRate);
        buffer.copyToChannel(samples, 0);
        this.buffers.set(kind, buffer);
      }
      const now = context.currentTime + 0.003;
      // Every visual detent gets one sound, but fast spins never accumulate a long queue.
      const first =
        kind === "tick"
          ? Math.max(now, Math.min(this.tickEnd, now + 0.025))
          : now;
      const interval = Math.min(0.022, 0.09 / count);
      for (let i = 0; i < count; i++) {
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(this.gain);
        source.onended = () => {
          source.disconnect();
          this.sources.delete(source);
        };
        this.sources.add(source);
        source.start(first + i * interval);
      }
      if (kind === "tick") {
        this.tickEnd = first + count * interval;
        this.stats.ticks += count;
      } else this.stats.buttons += count;
    };
    if (context.state === "running") schedule();
    else
      this.unlock()
        .then(schedule)
        .catch(() => {});
  }
}
