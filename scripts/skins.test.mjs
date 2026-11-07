import { test } from "node:test";
import assert from "node:assert/strict";
import { readSkin, saveSkin } from "../web/ui/skins/chrome.mjs";
import { fitLandscape } from "../web/ui/device-layout.mjs";
import { skinFor } from "../web/ui/skins/index.mjs";
test("skin preference is independent of language, source and playback", () => {
  const data = new Map([["yuyin-preferences-v1", "existing preferences"]]);
  const storage = {
    getItem: (k) => data.get(k),
    setItem: (k, v) => data.set(k, v),
  };
  assert.equal(readSkin(storage), "carthing");
  saveSkin(storage, "ipod");
  assert.equal(readSkin(storage), "ipod");
  assert.equal(data.get("yuyin-preferences-v1"), "existing preferences");
  assert.throws(() => saveSkin(storage, "unknown"));
  assert.equal(readSkin(storage), "ipod");
  saveSkin(storage, "carthing");
  assert.equal(readSkin(storage), "carthing");
  saveSkin(storage, "walkman");
  assert.equal(readSkin(storage), "walkman");
});
test("Walkman uses shared menu actions and preserves its landscape proportions inside safe areas", () => {
  const skin = skinFor("walkman");
  assert.equal(skin.centerAction({ view: "player" }), "toggle");
  assert.equal(skin.rotationAction({ view: "player" }), "volume");
  assert.equal(skin.centerAction({ view: "tuner" }), "tune");
  assert.equal(skin.layout("radio"), "list");
  assert.ok(
    skin
      .catalogItems([], "radio", (x) => x)
      .some((item) => item.action === "tune-radio"),
  );
  for (const [width, height, insets] of [
    [393, 852, { top: 59, bottom: 34 }],
    [852, 393, { left: 59, right: 59, bottom: 21 }],
    [1280, 720, {}],
  ]) {
    const fitted = fitLandscape({ width, height, insets, skin: "walkman" });
    assert.equal(fitted.canvasWidth / fitted.canvasHeight, 1240 / 650);
    assert.ok(
      fitted.x - fitted.renderedWidth / 2 >= (insets.left || 0) + 6 - 1e-6,
    );
    assert.ok(
      fitted.x + fitted.renderedWidth / 2 <=
        width - (insets.right || 0) - 6 + 1e-6,
    );
    assert.ok(
      fitted.y - fitted.renderedHeight / 2 >= (insets.top || 0) + 6 - 1e-6,
    );
    assert.ok(
      fitted.y + fitted.renderedHeight / 2 <=
        height - (insets.bottom || 0) - 6 + 1e-6,
    );
  }
});
test("portrait iPod and its mini player fit phone cutouts in either orientation", () => {
  for (const [width, height, insets] of [
    [393, 852, { top: 59, bottom: 34 }],
    [852, 393, { left: 59, right: 59, bottom: 21 }],
    [320, 568, {}],
  ])
    for (const compact of [true, false]) {
      const r = fitLandscape({ width, height, insets, skin: "ipod", compact });
      assert.equal(r.angle, 0);
      assert.ok(r.x - r.renderedWidth / 2 >= (insets.left || 0) + 6 - 1e-6);
      assert.ok(
        r.x + r.renderedWidth / 2 <= width - (insets.right || 0) - 6 + 1e-6,
      );
      assert.ok(r.y - r.renderedHeight / 2 >= (insets.top || 0) + 6 - 1e-6);
      assert.ok(
        r.y + r.renderedHeight / 2 <= height - (insets.bottom || 0) - 6 + 1e-6,
      );
    }
});
