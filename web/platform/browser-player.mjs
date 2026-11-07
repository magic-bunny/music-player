export class BrowserPlayer {
  constructor({
    resolve,
    makeAudio = () => new Audio(),
    random = Math.random,
  }) {
    this.resolve = resolve;
    this.makeAudio = makeAudio;
    this.random = random;
    this.audio = null;
    this.queue = [];
    this.index = 0;
    this.history = [];
    this.generation = 0;
    this.state = {
      track: null,
      paused: true,
      loading: false,
      repeat: false,
      shuffle: false,
      volume: 0.45,
      lyric: "",
      next_lyric: "",
      error: null,
      revision: 0,
    };
  }
  play(queue, index) {
    if (
      !queue.length ||
      !Number.isInteger(index) ||
      index < 0 ||
      index >= queue.length
    )
      throw Error("Invalid play queue");
    this.queue = queue;
    this.history = [];
    this.select(index);
  }
  select(index) {
    const request = ++this.generation;
    this.release();
    this.index = index;
    const track = this.queue[index];
    const audio = this.makeAudio();
    this.audio = audio;
    audio.preload = "auto";
    audio.volume = this.state.volume;
    Object.assign(this.state, {
      track,
      loading: true,
      paused: false,
      error: null,
      revision: this.state.revision + 1,
    });
    const current = () => request === this.generation;
    const fail = (error) => {
      if (current()) {
        this.state.error =
          error?.name === "NotAllowedError"
            ? "Press Play to enable audio."
            : String(error?.message || error || "Unable to play this track.");
        this.state.loading = false;
        this.state.paused = true;
      }
    };
    for (const event of ["playing", "canplay", "pause", "ended"])
      audio.addEventListener(event, () => {
        if (current()) {
          this.state.loading = false;
          this.state.paused = audio.paused;
        }
      });
    audio.addEventListener("waiting", () => {
      if (current() && !audio.paused) this.state.loading = true;
    });
    audio.addEventListener("error", () =>
      fail(Error("Audio unavailable. Try another track.")),
    );
    audio.addEventListener("ended", () => {
      if (!current()) return;
      if (this.state.repeat) {
        audio.currentTime = 0;
        audio.play().catch(fail);
      } else this.next(true);
    });
    this.pending = (async () => {
      try {
        const url = await this.resolve(track);
        if (!current()) return;
        audio.src = url;
        await audio.play();
        if (current()) {
          this.state.loading = false;
          this.state.paused = audio.paused;
        }
      } catch (error) {
        fail(error);
      }
    })();
  }
  release() {
    if (this.audio) {
      this.audio.pause();
      this.audio.removeAttribute("src");
      this.audio.load();
      this.audio = null;
    }
  }
  next(automatic = false) {
    if (!this.state.track) return;
    let next = this.index + 1;
    if (this.state.shuffle && this.queue.length > 1) {
      next = Math.floor(this.random() * (this.queue.length - 1));
      if (next >= this.index) next++;
    }
    if (next >= this.queue.length) {
      if (automatic) this.state.paused = true;
      return;
    }
    this.history.push(this.index);
    this.select(next);
  }
  async control(action, value) {
    if (action === "stop") {
      ++this.generation;
      this.release();
      Object.assign(this.state, {
        track: null,
        loading: false,
        paused: true,
        error: null,
      });
      return;
    }
    if (action === "volume") {
      this.state.volume = Math.max(0, Math.min(1, Number(value) || 0));
      if (this.audio) this.audio.volume = this.state.volume;
      return;
    }
    if (action === "shuffle" || action === "repeat") {
      this.state[action] = !this.state[action];
      return;
    }
    if (!this.audio) return;
    if (action === "toggle") {
      this.state.error = null;
      if (this.audio.paused) {
        if (this.audio.error || !this.audio.src) {
          this.select(this.index);
          return;
        }
        try {
          await this.audio.play();
          this.state.paused = false;
        } catch (e) {
          this.state.loading = false;
          this.state.paused = true;
          throw e;
        }
      } else {
        this.audio.pause();
        this.state.paused = true;
        this.state.loading = false;
      }
    }
    if (action === "seek" && Number.isFinite(this.audio.duration))
      this.audio.currentTime = Math.max(
        0,
        Math.min(this.audio.duration, Number(value) || 0),
      );
    if (action === "next") this.next();
    if (action === "previous") {
      const previous = this.history.pop() ?? Math.max(0, this.index - 1);
      this.select(previous);
    }
  }
  snapshot() {
    return {
      ...this.state,
      position: this.audio?.currentTime || 0,
      duration: Number.isFinite(this.audio?.duration)
        ? this.audio.duration
        : this.state.track?.seconds || 0,
    };
  }
}
