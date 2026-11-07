import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fitLandscape,
  TAB_LAYOUT,
  tabIds,
} from "../web/ui/device-layout.mjs";
import { skinIds } from "../web/ui/skins/index.mjs";

function tabRects(layout) {
  return layout.tabs.map((tab) => {
    const dx = tab.left - layout.canvasWidth / 2,
      dy = tab.top - layout.canvasHeight / 2;
    return {
      x: layout.x + (layout.angle ? -dy : dx) * layout.scale,
      y: layout.y + (layout.angle ? dx : dy) * layout.scale,
      width: TAB_LAYOUT.width * layout.scale,
      height: TAB_LAYOUT.height * layout.scale,
      angle: layout.angle + tab.angle,
    };
  });
}

test("all four tab rectangles stay aligned with each active skin", () => {
  for (const [width, height, insets] of [
    [1280, 720, {}],
    [393, 852, { top: 59, bottom: 34 }],
    [852, 393, { left: 59, right: 30, bottom: 21 }],
  ]) {
    for (const skin of skinIds) {
      const r = fitLandscape({
        width,
        height,
        insets,
        skin,
        offsetLeft: 7,
        offsetTop: 11,
      });
      assert.deepEqual(
        r.tabs.map((tab) => tab.id),
        tabIds,
      );
      for (const rectangle of tabRects(r)) assert.equal(rectangle.angle, 0);
      assert.ok(
        r.x - r.renderedWidth / 2 >= 7 + (insets.left || 0) + 6 - 1e-6,
      );
      assert.ok(
        r.x + r.renderedWidth / 2 <=
          7 + width - (insets.right || 0) - 6 + 1e-6,
      );
      assert.ok(
        r.y - r.renderedHeight / 2 >= 11 + (insets.top || 0) + 6 - 1e-6,
      );
      assert.ok(
        r.y + r.renderedHeight / 2 <=
          11 + height - (insets.bottom || 0) - 6 + 1e-6,
      );
    }
  }
});
test("compact bars remain at the bottom right and ignore the chassis anchor", () => {
  for (const skin of ["carthing", "ipod", "walkman"]) {
    const r = fitLandscape({ width: 1280, height: 720, skin, compact: true });
    assert.equal(r.x + r.renderedWidth / 2, 1264);
    assert.equal(r.y + r.renderedHeight / 2, 704);
  }
});

test("portrait, landscape and compact devices avoid cutout and gesture insets", () => {
  for (const [width, height, insets] of [
    [393, 852, { top: 59, bottom: 34 }],
    [852, 393, { left: 59, right: 59, bottom: 21 }],
    [852, 393, { right: 59, bottom: 21 }],
    [412, 915, { top: 32, bottom: 24 }],
    [915, 412, { left: 32, bottom: 24 }],
    [320, 568, {}],
    [667, 375, {}],
  ])
    for (const compact of [false, true]) {
      const r = fitLandscape({ width, height, insets, compact });
      assert.ok(r.x - r.renderedWidth / 2 >= (insets.left || 0) + 6 - 1e-6);
      assert.ok(r.y - r.renderedHeight / 2 >= (insets.top || 0) + 6 - 1e-6);
      assert.ok(
        r.x + r.renderedWidth / 2 <= width - (insets.right || 0) - 6 + 1e-6,
      );
      assert.ok(
        r.y + r.renderedHeight / 2 <= height - (insets.bottom || 0) - 6 + 1e-6,
      );
      assert.equal(
        r.canvasWidth / r.canvasHeight,
        compact ? 440 / 88 : 1000 / 540,
      );
    }
});
test("keyboard viewport offsets retain the locked portrait canvas", () => {
  const r = fitLandscape({
    width: 390,
    height: 280,
    portrait: true,
    offsetTop: 120,
    offsetLeft: 5,
    insets: { top: 20, bottom: 10 },
  });
  assert.equal(r.angle, 90);
  assert.ok(r.y - r.renderedHeight / 2 >= 146);
  assert.ok(r.y + r.renderedHeight / 2 <= 384);
});

test("mobile orientations preserve each hardware design", () => {
  for (const skin of ["carthing", "walkman"]) {
    assert.equal(fitLandscape({ width: 390, height: 844, skin }).angle, 90);
    assert.equal(fitLandscape({ width: 844, height: 390, skin }).angle, 0);
  }
  assert.equal(fitLandscape({ width: 390, height: 844, skin: "ipod" }).angle, 0);
  assert.equal(fitLandscape({ width: 844, height: 390, skin: "ipod" }).angle, 0);
});

test("desktop chassis centers unless a tab rail would leave the viewport", () => {
  for (const skin of skinIds) {
    const r = fitLandscape({ width: 1600, height: 1000, skin, mobile: false });
    assert.equal(r.x, 800);
    assert.equal(r.y, 500);
  }
});
