import test from "node:test";
import assert from "node:assert/strict";
import {
  MechanicalAudio,
  mechanicalSamples,
} from "../web/ui/mechanical-audio.mjs";

function fakeContext() {
  const context = {
    state: "running",
    currentTime: 1,
    sampleRate: 48000,
    destination: {},
    starts: [],
    stops: 0,
    createGain() {
      return { gain: { value: 0 }, connect() {} };
    },
    createBuffer(channels, length, sampleRate) {
      return {
        channels,
        length,
        sampleRate,
        copyToChannel(data) {
          assert.equal(data.length, length);
        },
      };
    },
    createBufferSource() {
      return {
        connect() {},
        disconnect() {},
        start(time) {
          context.starts.push(time);
        },
        stop() {
          context.stops++;
        },
      };
    },
    async resume() {
      context.state = "running";
    },
  };
  return context;
}
for (const kind of ["tick", "button"])
  test(`${kind}: short, bounded signal with a decaying tail`, () => {
    const pcm = mechanicalSamples(kind, 48000);
    assert.ok(pcm.length > 500 && pcm.length < 3000);
    assert.equal(pcm[0], 0);
    assert.equal(pcm.at(-1), 0);
    assert.ok(pcm.every((n) => Number.isFinite(n) && Math.abs(n) <= 0.65));
    const energy = (a) => a.reduce((sum, n) => sum + n * n, 0) / a.length;
    assert.ok(energy(pcm.slice(0, 600)) > energy(pcm.slice(-300)) * 100);
    assert.ok(energy(pcm) > 0.00001);
  });
test("multiple detents schedule one distinct click each without a long backlog", () => {
  const context = fakeContext(),
    audio = new MechanicalAudio({ contextFactory: () => context });
  audio.play("tick", 3);
  assert.equal(audio.stats.ticks, 3);
  assert.equal(context.starts.length, 3);
  assert.ok(
    context.starts[0] < context.starts[1] &&
      context.starts[1] < context.starts[2],
  );
  for (let i = 0; i < 20; i++) audio.play("tick", 3);
  assert.equal(audio.stats.ticks, 63);
  assert.ok(Math.max(...context.starts) < context.currentTime + 0.15);
  audio.play("button");
  assert.equal(audio.stats.buttons, 1);
});
test("disabled effects cancel pending clicks and do not open an audio device", () => {
  let created = 0;
  const context = fakeContext(),
    audio = new MechanicalAudio({
      enabled: false,
      contextFactory: () => {
        created++;
        return context;
      },
    });
  audio.play("tick", 2);
  assert.equal(created, 0);
  audio.setEnabled(true);
  audio.play("tick", 2);
  audio.setEnabled(false);
  assert.equal(context.stops, 2);
  audio.play("button");
  assert.equal(audio.stats.buttons, 0);
});
test("silent native verification uses zero output gain", () => {
  const audio = new MechanicalAudio({ contextFactory: fakeContext });
  audio.setMutedForTest(true);
  audio.play("tick");
  assert.equal(audio.gain.gain.value, 0);
  assert.equal(audio.stats.ticks, 1);
});
