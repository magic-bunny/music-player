import { test } from "node:test";
import assert from "node:assert/strict";
import {
  monochromePixels,
  LcdArtwork,
  LCD_INK,
  LCD_SIZE,
} from "../web/ui/lcd-artwork.mjs";
import { arcButton, polar } from "../web/ui/skins/remote-geometry.mjs";

const pixels = (r, g, b, a = 255) => {
  const data = new Uint8ClampedArray(100 * 100 * 4);
  for (let i = 0; i < data.length; i += 4) data.set([r, g, b, a], i);
  return data;
};
test("100x100 LCD artwork uses exactly the font ink color and transparent glass", () => {
  const input = pixels(120, 180, 210),
    original = input.slice(),
    output = monochromePixels(input);
  let ink = 0,
    clear = 0;
  assert.equal(output.length, 100 * 100 * 4);
  assert.deepEqual(input, original);
  for (let i = 0; i < output.length; i += 4) {
    assert.deepEqual([...output.slice(i, i + 3)], LCD_INK);
    assert.ok([0, 255].includes(output[i + 3]));
    output[i + 3] ? ink++ : clear++;
  }
  assert.ok(ink > 0 && clear > 0);
  assert.ok(
    monochromePixels(pixels(0, 0, 0)).every(
      (value, index) => index % 4 !== 3 || value === 255,
    ),
  );
  assert.ok(
    monochromePixels(pixels(255, 255, 255)).every(
      (value, index) => index % 4 !== 3 || value === 0,
    ),
  );
  assert.ok(
    monochromePixels(pixels(0, 0, 0, 0)).every(
      (value, index) => index % 4 !== 3 || value === 0,
    ),
  );
});
test("late image loads and CORS failures cannot restore an old cover", () => {
  const images = [];
  let draws = 0;
  const context = {
    clearRect() {},
    fillRect() {},
    createImageData: () => ({ data: new Uint8ClampedArray(40000) }),
    putImageData() {
      draws++;
    },
  };
  const canvas = { dataset: {}, getContext: () => context };
  const renderer = new LcdArtwork(canvas, {
    makeImage: () => {
      const image = { naturalWidth: 400, naturalHeight: 400 };
      images.push(image);
      return image;
    },
    makeCanvas: () => ({
      getContext: () => ({
        drawImage() {},
        getImageData: () => ({ data: pixels(0, 0, 0) }),
      }),
    }),
  });
  renderer.update("first");
  renderer.update("second");
  images[0].onload();
  assert.equal(draws, 0);
  images[1].onload();
  assert.equal(draws, 1);
  assert.equal(canvas.dataset.artwork, "ready");
  images[0].onerror();
  assert.equal(canvas.dataset.artwork, "ready");
  renderer.update("blocked");
  images[2].onerror();
  assert.equal(canvas.dataset.artwork, "fallback");
  renderer.update(null);
  assert.equal(canvas.dataset.artwork, "empty");
  assert.equal(canvas.width, LCD_SIZE);
  assert.equal(canvas.height, LCD_SIZE);
});
test("curved physical keys stay inside the circular remote and have usable bounds", () => {
  for (const start of [60, 90, 120, 150, 180, 210, 240, 270]) {
    const shape = arcButton(start, start + 26);
    assert.ok(shape.outer < 180);
    assert.ok(shape.left >= 0 && shape.top >= 0);
    assert.ok(
      shape.left + shape.width <= 360 && shape.top + shape.height <= 360,
    );
    for (const radius of [143, 171])
      for (let angle = start; angle <= start + 26; angle++) {
        const p = polar(radius, angle);
        assert.ok(p.x >= shape.left && p.x <= shape.left + shape.width);
        assert.ok(p.y >= shape.top && p.y <= shape.top + shape.height);
        assert.ok(Math.hypot(p.x - 180, p.y - 180) < 180);
      }
  }
});
