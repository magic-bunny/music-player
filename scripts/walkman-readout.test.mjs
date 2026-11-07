import { test } from "node:test";
import assert from "node:assert/strict";
import { clock, playbackTime } from "../web/core/time.mjs";
import { volumeCells } from "../web/ui/skins/walkman.mjs";

test("LCD time readout formats playback, unknown duration and live radio", () => {
  assert.equal(playbackTime(72.8, 245), "1:12 / 4:05");
  assert.equal(playbackTime(0, 0), "0:00 / --:--");
  assert.equal(playbackTime(125, 0, "LIVE"), "2:05 / LIVE");
  assert.equal(clock(-1), "0:00");
  assert.equal(clock(Infinity), "0:00");
});
test("LCD volume cells represent mute, low volume and maximum without overflow", () => {
  assert.equal(volumeCells(0), 0);
  assert.equal(volumeCells(0.02), 1);
  assert.equal(volumeCells(0.45), 5);
  assert.equal(volumeCells(1), 10);
  assert.equal(volumeCells(2), 10);
  assert.equal(volumeCells(-1), 0);
  assert.equal(volumeCells(NaN), 0);
});
