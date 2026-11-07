import test from "node:test";
import assert from "node:assert/strict";
import { paletteFromRgba } from "../web/ui/palette.mjs";
const samples = (rgb, n) =>
  Array.from({ length: n }, () => [...rgb, 255]).flat();
test("dominant warm cover survives highlights and small blue accents", () => {
  const p = paletteFromRgba([
    ...samples([210, 75, 34], 80),
    ...samples([255, 255, 255], 30),
    ...samples([20, 40, 200], 10),
  ]);
  assert.ok(p.primary[0] > p.primary[1] * 1.5);
  assert.ok(p.controls[0] < p.primary[0]);
});
test("purple and blue covers produce different palettes", () => {
  const purple = paletteFromRgba(samples([155, 45, 122], 100));
  const blue = paletteFromRgba(samples([35, 90, 175], 100));
  assert.ok(purple.primary[0] > purple.primary[1]);
  assert.ok(blue.primary[2] > blue.primary[0]);
  assert.notDeepEqual(purple, blue);
});
test("neutral, black and transparent inputs have safe dark fallbacks", () => {
  for (const pixels of [
    samples([0, 0, 0], 20),
    samples([240, 240, 240], 20),
    [255, 0, 0, 0],
    [],
  ]) {
    const p = paletteFromRgba(pixels);
    assert.ok(p.primary.every((c) => Number.isFinite(c) && c >= 0 && c < 160));
    assert.ok(
      p.controls.reduce((a, b) => a + b, 0) <
        p.primary.reduce((a, b) => a + b, 0),
    );
  }
});
