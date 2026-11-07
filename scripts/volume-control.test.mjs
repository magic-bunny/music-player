import test from "node:test";
import assert from "node:assert/strict";
import { VolumeControl, clampVolume } from "../web/ui/volume-control.mjs";

function fixture(extra = {}) {
  const changes = [],
    applied = [],
    visibility = [],
    timers = new Map();
  let serial = 0;
  const volume = new VolumeControl({
    onChange: (v) => changes.push(v),
    onApply: async (v) => applied.push(v),
    onVisibility: (v) => visibility.push(v),
    setTimer: (fn) => {
      timers.set(++serial, fn);
      return serial;
    },
    clearTimer: (id) => timers.delete(id),
    ...extra,
  });
  return { volume, changes, applied, visibility, timers };
}
test("each detent adjusts two percent and clamps to mute/full volume", async () => {
  const { volume, changes } = fixture();
  await volume.step(3);
  assert.equal(volume.value, 0.51);
  await volume.step(-100);
  assert.equal(volume.value, 0);
  await volume.step(100);
  assert.equal(volume.value, 1);
  assert.deepEqual(changes, [0.51, 0, 1]);
  assert.throws(() => clampVolume(NaN));
});
test("HUD timeout restarts on every turn and hides when leaving the page", async () => {
  const { volume, timers, visibility } = fixture();
  await volume.step(1);
  const first = [...timers.keys()][0];
  await volume.step(1);
  assert.equal(timers.has(first), false);
  assert.equal(timers.size, 1);
  [...timers.values()][0]();
  assert.equal(volume.visible, false);
  assert.equal(timers.size, 0);
  await volume.step(-1);
  volume.hide();
  assert.equal(volume.visible, false);
  assert.equal(timers.size, 0);
  assert.equal(visibility.at(-1), false);
});
test("fast input coalesces and cannot leave an old IPC value applied last", async () => {
  const applied = [];
  let release;
  const gate = new Promise((r) => (release = r));
  const { volume } = fixture({
    onApply: async (v) => {
      applied.push(v);
      if (applied.length === 1) await gate;
    },
  });
  const first = volume.set(0.1);
  await Promise.resolve();
  volume.set(0.3);
  volume.set(0.7);
  volume.set(0.9);
  release();
  await first;
  assert.deepEqual(applied, [0.1, 0.9]);
  assert.equal(volume.value, 0.9);
});
test("slider and rotary changes share the same level", async () => {
  const { volume, applied } = fixture();
  await volume.set(0.8);
  assert.equal(volume.visible, false);
  await volume.step(-2);
  assert.equal(volume.value, 0.76);
  assert.deepEqual(applied, [0.8, 0.76]);
});
