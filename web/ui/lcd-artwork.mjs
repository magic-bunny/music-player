const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const LCD_SIZE = 100;
export const LCD_INK = [52, 75, 46];

// One ink color and transparent LCD glass, with ordered dithering for tone.
export function monochromePixels(rgba, width = LCD_SIZE, ink = LCD_INK) {
  const luminance = new Float32Array(rgba.length / 4),
    histogram = new Uint32Array(256);
  for (let i = 0; i < luminance.length; i++) {
    const p = i * 4,
      alpha = rgba[p + 3] / 255;
    const light =
      (rgba[p] * 0.2126 + rgba[p + 1] * 0.7152 + rgba[p + 2] * 0.0722) * alpha +
      255 * (1 - alpha);
    luminance[i] = light;
    histogram[Math.min(255, Math.round(light))]++;
  }
  let count = 0,
    low = 0,
    high = 255;
  for (let i = 0; i < 256; i++) {
    count += histogram[i];
    if (count < luminance.length * 0.04) low = i;
    if (count < luminance.length * 0.96) high = i;
  }
  const stretch = high - low > 24;
  const output = new Uint8ClampedArray(rgba.length);
  for (let i = 0; i < luminance.length; i++) {
    const light = stretch
      ? Math.max(0, Math.min(1, (luminance[i] - low) / (high - low)))
      : luminance[i] / 255;
    const threshold =
      (bayer[(Math.floor(i / width) % 4) * 4 + ((i % width) % 4)] + 0.5) / 16;
    const p = i * 4;
    output[p] = ink[0];
    output[p + 1] = ink[1];
    output[p + 2] = ink[2];
    output[p + 3] = 1 - light > threshold ? 255 : 0;
  }
  return output;
}

export class LcdArtwork {
  constructor(
    canvas,
    {
      makeImage = () => new Image(),
      makeCanvas = () => document.createElement("canvas"),
    } = {},
  ) {
    Object.assign(this, { canvas, makeImage, makeCanvas });
    this.url = undefined;
    this.generation = 0;
    canvas.width = canvas.height = LCD_SIZE;
  }
  update(url) {
    url = url || null;
    if (url === this.url) return;
    this.url = url;
    const request = ++this.generation;
    const ctx = this.canvas.getContext("2d");
    ctx.clearRect(0, 0, LCD_SIZE, LCD_SIZE);
    this.canvas.dataset.artwork = url ? "loading" : "empty";
    if (!url) {
      this.fallback();
      return;
    }
    const image = this.makeImage();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      if (request !== this.generation) return;
      try {
        const small = this.makeCanvas();
        small.width = small.height = LCD_SIZE;
        const input = small.getContext("2d", { willReadFrequently: true });
        input.imageSmoothingEnabled = true;
        input.imageSmoothingQuality = "high";
        const side = Math.min(image.naturalWidth, image.naturalHeight);
        if (!side) throw Error("Empty artwork");
        input.drawImage(
          image,
          (image.naturalWidth - side) / 2,
          (image.naturalHeight - side) / 2,
          side,
          side,
          0,
          0,
          LCD_SIZE,
          LCD_SIZE,
        );
        const pixels = input.getImageData(0, 0, LCD_SIZE, LCD_SIZE);
        const output = ctx.createImageData(LCD_SIZE, LCD_SIZE);
        output.data.set(monochromePixels(pixels.data));
        ctx.putImageData(output, 0, 0);
        this.canvas.dataset.artwork = "ready";
      } catch {
        this.fallback();
      }
    };
    image.onerror = () => {
      if (request === this.generation) this.fallback();
    };
    image.src = url;
  }
  fallback() {
    const ctx = this.canvas.getContext("2d");
    ctx.clearRect(0, 0, LCD_SIZE, LCD_SIZE);
    ctx.fillStyle = `rgb(${LCD_INK.join(",")})`;
    for (const [x, y, w, h] of [
      [38, 24, 5, 47],
      [43, 24, 30, 6],
      [68, 24, 5, 39],
      [25, 66, 18, 9],
      [55, 58, 18, 9],
    ])
      ctx.fillRect(x, y, w, h);
    this.canvas.dataset.artwork = this.url ? "fallback" : "empty";
  }
}
