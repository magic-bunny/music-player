import { test } from "node:test";
import assert from "node:assert/strict";
import {
  coverPose,
  coverIndex,
  localHorizontalDelta,
} from "../web/ui/cover-flow.mjs";
import { skinFor } from "../web/ui/skins/index.mjs";
import { NavigationController } from "../web/core/navigation-controller.mjs";
import { createState } from "../web/core/state.mjs";

test("radio cover actions never enter the playback queue", async () => {
  const radio = { id: "radio:one", stream: "https://example.com/live" };
  let queued;
  const controller = new NavigationController(createState(), {
    items: () => [
      radio,
      { id: "ui:more", action: "more" },
      { id: "ui:add", action: "tune-radio" },
    ],
    play: (id, queue) => {
      queued = { id, queue };
    },
  });
  await controller.activate();
  assert.equal(queued.id, radio.id);
  assert.deepEqual(queued.queue, [radio]);
});

test("Cover Flow centers the selected cover and mirrors its tilted side stacks", () => {
  const center = coverPose(0);
  assert.equal(center.x, 0);
  assert.equal(Math.abs(center.angle), 0);
  assert.equal(Math.abs(center.z), 0);
  assert.equal(center.order, 100);
  assert.equal(center.hidden, false);
  for (const distance of [0.3, 1, 2, 4]) {
    const left = coverPose(-distance),
      right = coverPose(distance);
    assert.equal(left.x, -right.x);
    assert.equal(left.angle, -right.angle);
    assert.equal(left.z, right.z);
    assert.ok(left.order < 100);
    assert.ok(left.angle > 0);
    assert.ok(right.angle < 0);
  }
  assert.ok(coverPose(6).hidden);
});
test("touch displacement stays relative to the screen after phone rotation and scaling", () => {
  assert.equal(localHorizontalDelta(64, 0), 64);
  assert.equal(localHorizontalDelta(32, 0, { a: 0.5, b: 0, c: 0, d: 0.5 }), 64);
  assert.equal(
    localHorizontalDelta(0, 32, { a: 0, b: 0.5, c: -0.5, d: 0 }),
    64,
  );
  assert.equal(coverIndex(-20, 10), 0);
  assert.equal(coverIndex(20, 10), 9);
  assert.equal(coverIndex(2.6, 10), 3);
});
test("only iPod collection and radio browsing uses Cover Flow; song lists stay vertical", () => {
  for (const view of ["browse", "playlists", "radio", "radio-list"])
    assert.equal(skinFor("ipod").layout(view), "coverflow");
  assert.equal(skinFor("ipod").layout("tracks"), "list");
  assert.equal(skinFor("ipod").layout("home"), "list");
  assert.equal(skinFor("walkman").layout("radio"), "list");
  assert.equal(skinFor("carthing").layout("browse"), "carousel");
});
