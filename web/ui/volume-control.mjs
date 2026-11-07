export function clampVolume(value) {
  if (!Number.isFinite(value)) throw new TypeError("Invalid volume");
  return Math.round(Math.max(0, Math.min(1, value)) * 100) / 100;
}

// One shared level for Rust playback, live radio, the settings slider and the HUD.
export class VolumeControl {
  constructor({
    value = 0.45,
    onChange,
    onApply,
    onVisibility,
    onError = () => {},
    hideDelay = 1400,
    setTimer = (fn, delay) => setTimeout(fn, delay),
    clearTimer = (id) => clearTimeout(id),
  }) {
    this.value = clampVolume(value);
    this.onChange = onChange;
    this.onApply = onApply;
    this.onVisibility = onVisibility;
    this.onError = onError;
    this.hideDelay = hideDelay;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.timer = null;
    this.pending = null;
    this.flushing = null;
    this.visible = false;
  }
  show() {
    this.clearTimer(this.timer);
    this.visible = true;
    this.onVisibility(true);
    this.timer = this.setTimer(() => this.hide(), this.hideDelay);
  }
  hide() {
    this.clearTimer(this.timer);
    this.timer = null;
    this.visible = false;
    this.onVisibility(false);
  }
  step(steps) {
    return this.set(this.value + Math.trunc(steps) * 0.02, true);
  }
  set(value, show = false) {
    this.value = clampVolume(value);
    this.onChange(this.value);
    if (show) this.show();
    this.pending = this.value;
    // Coalesce fast turns while an IPC call is in flight; never apply an older value last.
    if (!this.flushing)
      this.flushing = Promise.resolve()
        .then(async () => {
          while (this.pending !== null) {
            const next = this.pending;
            this.pending = null;
            try {
              await this.onApply(next);
            } catch (error) {
              this.onError(error);
            }
          }
        })
        .finally(() => {
          this.flushing = null;
        });
    return this.flushing;
  }
}
