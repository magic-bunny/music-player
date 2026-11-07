export class ArtworkPreloader {
  constructor({
    fetchBatch,
    onBatch,
    onError = () => {},
    onSettled = () => {},
    batchSize = 4,
  }) {
    this.fetchBatch = fetchBatch;
    this.onBatch = onBatch;
    this.onError = onError;
    this.onSettled = onSettled;
    this.batchSize = Math.max(1, batchSize);
    this.queue = [];
    this.pending = new Set();
    this.running = false;
    this.idleWaiters = [];
  }

  enqueue(items, { priority = false } = {}) {
    const added = [];
    for (const item of items) {
      if (!item?.id || this.pending.has(item.id)) continue;
      this.pending.add(item.id);
      added.push(item);
    }
    if (!added.length) return;
    this.queue = priority
      ? [...added, ...this.queue]
      : [...this.queue, ...added];
    void this.drain();
  }

  whenIdle() {
    if (!this.running && !this.queue.length) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  async drain() {
    if (this.running) return;
    this.running = true;
    while (this.queue.length) {
      const batch = this.queue.splice(0, this.batchSize);
      try {
        const result = await this.fetchBatch(batch.map((item) => item.id));
        await this.onBatch(batch, result || {});
      } catch (error) {
        this.onError(error, batch);
      } finally {
        for (const item of batch) {
          this.pending.delete(item.id);
          this.onSettled(item);
        }
      }
    }
    this.running = false;
    for (const resolve of this.idleWaiters.splice(0)) resolve();
  }
}
