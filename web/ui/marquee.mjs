// Playback snapshots may arrive every 250 ms. Only text/geometry changes should
// restart a marquee; repeatedly applying its animation would pin it at the start.
export class Marquee {
  constructor(
    clip,
    text,
    {
      requestFrame = (callback) => requestAnimationFrame(callback),
      cancelFrame = (id) => cancelAnimationFrame(id),
      observe = (callback) => new ResizeObserver(callback),
    } = {},
  ) {
    this.clip = clip;
    this.text = text;
    this.requestFrame = requestFrame;
    this.cancelFrame = cancelFrame;
    this.value = null;
    this.geometry = null;
    this.frame = null;
    this.observer = observe(() => this.schedule());
    this.observer.observe(clip);
  }
  update(value) {
    if (value === this.value) return;
    this.value = value;
    this.geometry = null;
    this.text.textContent = value;
    this.clip.title = value;
    this.clip.classList.remove("is-overflowing");
    this.schedule();
  }
  schedule() {
    if (this.frame !== null) return;
    this.frame = this.requestFrame(() => {
      this.frame = null;
      this.measure();
    });
  }
  measure() {
    const width = this.clip.clientWidth,
      textWidth = this.text.scrollWidth;
    const geometry = `${width}:${textWidth}`;
    if (geometry === this.geometry) return;
    this.geometry = geometry;
    const overflow = Math.max(0, Math.ceil(textWidth - width));
    if (width > 0 && overflow > 2) {
      this.text.style.setProperty("--ipod-title-shift", `-${overflow}px`);
      this.text.style.setProperty(
        "--ipod-title-duration",
        `${Math.min(12, Math.max(5, 4 + overflow / 25)).toFixed(2)}s`,
      );
      this.clip.classList.add("is-overflowing");
    } else {
      this.clip.classList.remove("is-overflowing");
      this.text.style.removeProperty("--ipod-title-shift");
      this.text.style.removeProperty("--ipod-title-duration");
    }
  }
  dispose() {
    this.observer.disconnect();
    if (this.frame !== null) this.cancelFrame(this.frame);
  }
}
