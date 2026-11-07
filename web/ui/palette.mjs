const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
function hsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    d = max - min,
    l = (max + min) / 2;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h =
    max === r
      ? ((g - b) / d) % 6
      : max === g
        ? (b - r) / d + 2
        : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}
function rgb(h, s, l) {
  const a = s * Math.min(l, 1 - l),
    f = (n) => {
      const k = (n + h / 30) % 12;
      return Math.round(
        255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))),
      );
    };
  return [f(0), f(8), f(4)];
}
// Population-weighted hue bins preserve the dominant cover color instead of averaging it into gray.
export function paletteFromRgba(pixels) {
  const bins = new Map();
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue;
    const [h, s, l] = hsl(pixels[i], pixels[i + 1], pixels[i + 2]);
    if (l < 0.055 || l > 0.95) continue;
    const key = `${s < 0.12 ? "n" : Math.floor(h / 30)}:${Math.floor(l * 5)}`;
    const b = bins.get(key) || { count: 0, sum: [0, 0, 0], score: 0 };
    b.count++;
    for (let c = 0; c < 3; c++) b.sum[c] += pixels[i + c];
    b.score += (0.35 + s * 1.1) * (1 - Math.abs(l - 0.42) * 0.4);
    bins.set(key, b);
  }
  const best = [...bins.values()].sort((a, b) => b.score - a.score)[0];
  const color = best ? best.sum.map((v) => v / best.count) : [74, 79, 84];
  const [h, s, l] = hsl(...color);
  const saturation = clamp(s * 0.9, 0, 0.72),
    lightness = clamp(l * 0.55, 0.21, 0.36);
  return {
    primary: rgb(h, saturation, lightness),
    controls: rgb(h, saturation * 0.96, lightness * 0.64),
  };
}
export const cssColor = (color) => `rgb(${color.join(",")})`;
