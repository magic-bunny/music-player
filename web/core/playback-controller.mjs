// Platform adapters own music decoding. This controller owns music/radio
// exclusivity and selection races, independently of either visual skin.
export class PlaybackController {
  constructor({
    invoke,
    state,
    radio,
    getVolume,
    onSelected = () => {},
    onError = () => {},
    onIdle = () => {},
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now = Date.now,
  }) {
    Object.assign(this, {
      invoke,
      state,
      radio,
      getVolume,
      onSelected,
      onError,
      onIdle,
      sleep,
      now,
    });
    this.request = 0;
  }
  stopRadio() {
    ++this.request;
    this.state.radioActive = false;
    this.radio.pause();
    this.radio.removeAttribute("src");
    this.radio.load();
  }
  async start(id, queue) {
    const index = queue.findIndex((track) => track.id === id);
    if (index < 0) return;
    const track = queue[index];
    this.stopRadio();
    const request = this.request;
    const current = () => request === this.request;
    try {
      if (track.stream) {
        this.state.radioActive = true;
        this.state.radioError = null;
        await this.invoke("control", { action: "stop", value: null });
        if (!current()) return;
        const deadline = this.now() + 2500;
        while ((await this.invoke("snapshot")).track) {
          if (!current()) return;
          if (this.now() > deadline) throw Error("Music did not stop");
          await this.sleep(50);
        }
        if (!current()) return;
        this.select(track, queue);
        this.radio.src = track.stream;
        this.radio.volume = this.getVolume();
        let timeout;
        try {
          await Promise.race([
            this.radio.play(),
            new Promise((_, reject) => {
              timeout = setTimeout(
                () => reject(Error("Station connection timed out")),
                18000,
              );
            }),
          ]);
        } finally {
          clearTimeout(timeout);
        }
      } else {
        await this.invoke("play", {
          queue: queue.map((track) => track.id),
          index,
        });
        if (!current()) return;
        this.select(track, queue);
      }
    } catch (error) {
      if (!current()) return;
      this.state.radioError = track.stream ? String(error) : null;
      if (track.stream) this.radio.pause();
      this.onError(
        track.stream ? "Unable to connect. Try another station." : error,
      );
    }
  }
  select(track, queue) {
    this.state.current = track;
    this.state.queue = [...queue];
    this.onSelected(track);
  }
  acceptSnapshot(snapshot) {
    this.state.snapshot = snapshot;
    if (this.state.radioActive) return false;
    const changed = this.state.current?.id !== snapshot.track?.id;
    if (snapshot.track) this.state.current = snapshot.track;
    return changed && Boolean(snapshot.track);
  }
  async control(action, value) {
    if (this.state.radioActive) {
      if (action === "next" || action === "previous") {
        const index =
          this.state.queue.findIndex(
            (track) => track.id === this.state.current?.id,
          ) + (action === "next" ? 1 : -1);
        if (index < 0 || index >= this.state.queue.length) {
          this.onError(
            action === "next"
              ? "This is the last station."
              : "This is the first station.",
          );
          return;
        }
        return this.start(this.state.queue[index].id, this.state.queue);
      }
      if (action === "toggle") {
        if (this.radio.paused) {
          try {
            if (this.radio.error) this.radio.src = this.state.current.stream;
            await this.radio.play();
          } catch {
            this.onError("Unable to connect to the station.");
          }
        } else this.radio.pause();
        return;
      }
    }
    if (action === "toggle" && !this.state.current) {
      this.onIdle();
      return;
    }
    try {
      await this.invoke("control", { action, value: value ?? null });
    } catch (error) {
      this.onError(error);
    }
  }
}
