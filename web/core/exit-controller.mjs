export function createExitController({ stopPlayback, exitPlatform, onError }) {
  let closing = false,
    closed = false;
  return {
    get stopped() {
      return closing || closed;
    },
    async close() {
      if (closing || closed) return;
      closing = true;
      try {
        await stopPlayback();
        await exitPlatform();
        closed = true;
      } catch (error) {
        closing = false;
        onError(error);
      } finally {
        closing = false;
      }
    },
  };
}
