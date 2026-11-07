import { test } from "node:test";
import assert from "node:assert/strict";
import { createExitController } from "../web/core/exit-controller.mjs";
import { closeBrowserPlayer } from "../web/platform/browser-exit.mjs";

test("all platforms stop playback before exiting and ignore duplicate clicks", async () => {
  let release;
  const waiting = new Promise((resolve) => (release = resolve)),
    calls = [];
  const exit = createExitController({
    stopPlayback: async () => {
      calls.push("stop");
      await waiting;
    },
    exitPlatform: () => calls.push("exit"),
    onError: assert.fail,
  });
  const first = exit.close();
  await exit.close();
  assert.deepEqual(calls, ["stop"]);
  assert.equal(exit.stopped, true);
  release();
  await first;
  await exit.close();
  assert.deepEqual(calls, ["stop", "exit"]);
});
test("failed cleanup does not pretend to exit and can be retried", async () => {
  let failure = true,
    errors = 0,
    exits = 0;
  const exit = createExitController({
    stopPlayback: async () => {
      if (failure) throw Error("stop failed");
    },
    exitPlatform: () => exits++,
    onError: () => errors++,
  });
  await exit.close();
  assert.equal(exit.stopped, false);
  assert.equal(exits, 0);
  assert.equal(errors, 1);
  failure = false;
  await exit.close();
  assert.equal(exits, 1);
  assert.equal(exit.stopped, true);
});
test("browser fallback closes the player interface when the tab cannot be closed", () => {
  const body = new Set(),
    root = new Set(),
    panel = { hidden: true };
  let attempts = 0;
  closeBrowserPlayer({
    host: {
      close() {
        attempts++;
        throw Error("not script-closable");
      },
    },
    documentRoot: {
      body: { classList: { add: (value) => body.add(value) } },
      documentElement: { classList: { add: (value) => root.add(value) } },
      getElementById: () => panel,
    },
  });
  assert.equal(attempts, 1);
  assert.ok(body.has("player-closed"));
  assert.ok(root.has("player-closed-root"));
  assert.equal(panel.hidden, false);
});
