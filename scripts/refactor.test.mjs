import { test } from "node:test";
import assert from "node:assert/strict";
import { Marquee } from "../web/ui/marquee.mjs";
import { PlaybackController } from "../web/core/playback-controller.mjs";
import { NavigationController } from "../web/core/navigation-controller.mjs";
import { createState } from "../web/core/state.mjs";
import { skinFor } from "../web/ui/skins/index.mjs";

test("unchanged playback snapshots never restart title scrolling; text and size changes do", () => {
  const classes = new Set();
  let resets = 0,
    frames = [],
    observer;
  const clip = {
    clientWidth: 121,
    classList: {
      add: (k) => classes.add(k),
      remove: (k) => {
        classes.delete(k);
        resets++;
      },
    },
  };
  const values = new Map();
  const text = {
    scrollWidth: 250,
    style: {
      setProperty: (k, v) => values.set(k, v),
      removeProperty: (k) => values.delete(k),
    },
  };
  const marquee = new Marquee(clip, text, {
    requestFrame: (fn) => {
      frames.push(fn);
      return frames.length;
    },
    cancelFrame: () => {},
    observe: (fn) => {
      observer = fn;
      return { observe() {}, disconnect() {} };
    },
  });
  const flush = () => {
    const pending = frames;
    frames = [];
    pending.forEach((fn) => fn());
  };
  marquee.update("A long song title");
  flush();
  assert.equal(values.get("--ipod-title-shift"), "-129px");
  assert.ok(classes.has("is-overflowing"));
  for (let i = 0; i < 40; i++) marquee.update("A long song title");
  flush();
  assert.equal(resets, 1);
  observer();
  flush();
  assert.equal(resets, 1);
  clip.clientWidth = 280;
  observer();
  flush();
  assert.equal(classes.has("is-overflowing"), false);
  clip.clientWidth = 120;
  marquee.update("Another title");
  flush();
  assert.ok(classes.has("is-overflowing"));
  marquee.dispose();
});

function radio() {
  return {
    paused: true,
    currentTime: 0,
    readyState: 4,
    volume: 0,
    src: "",
    pause() {
      this.paused = true;
    },
    play() {
      this.paused = false;
      return Promise.resolve();
    },
    removeAttribute() {
      this.src = "";
    },
    load() {},
  };
}
const song = { id: "music:one", title: "Song", artist: "Artist", seconds: 60 };
const station = {
  id: "radio:one",
  title: "Station",
  artist: "Radio",
  seconds: 0,
  stream: "https://example.com/live",
};
test("shared controller stops music before radio and stops radio before music", async () => {
  const state = createState(),
    audio = radio(),
    events = [];
  const invoke = async (command, args) => {
    events.push([command, args]);
    if (command === "snapshot") return { track: null };
  };
  const controller = new PlaybackController({
    invoke,
    state,
    radio: audio,
    getVolume: () => 0.3,
  });
  await controller.start(station.id, [station]);
  assert.equal(events[0][1].action, "stop");
  assert.equal(state.radioActive, true);
  assert.equal(audio.volume, 0.3);
  assert.equal(audio.paused, false);
  await controller.start(song.id, [song]);
  assert.equal(audio.paused, true);
  assert.equal(audio.src, "");
  assert.equal(state.radioActive, false);
  assert.equal(state.current.id, song.id);
  assert.equal(events.at(-1)[0], "play");
});
test("a delayed old music response cannot overwrite the current radio selection", async () => {
  let finish;
  const pending = new Promise((resolve) => (finish = resolve));
  const state = createState(),
    audio = radio();
  const controller = new PlaybackController({
    state,
    radio: audio,
    getVolume: () => 0,
    invoke: async (command) => (command === "play" ? pending : { track: null }),
  });
  const first = controller.start(song.id, [song]);
  await controller.start(station.id, [station]);
  finish();
  await first;
  assert.equal(state.current.id, station.id);
  assert.equal(state.radioActive, true);
  assert.equal(audio.paused, false);
});
test("late radio failures cannot pause a newer selection", async () => {
  let reject;
  const failed = new Promise((_, r) => (reject = r)),
    state = createState(),
    audio = radio();
  let errors = 0;
  audio.play = () => failed;
  const controller = new PlaybackController({
    state,
    radio: audio,
    getVolume: () => 0,
    onError: () => errors++,
    invoke: async () => ({ track: null }),
  });
  const old = controller.start(station.id, [station]);
  await new Promise((r) => setImmediate(r));
  await controller.start(song.id, [song]);
  reject(Error("old failure"));
  await old;
  assert.equal(state.current.id, song.id);
  assert.equal(errors, 0);
});
test("all skins route catalog actions through the same navigation controller", async () => {
  for (const name of ["carthing", "ipod", "walkman"]) {
    const state = createState(),
      calls = [];
    let items = [{ id: "p", collection: true }];
    const navigation = new NavigationController(state, {
      items: () => items,
      collection: (p) => calls.push(p.id),
      view: (view) => calls.push(view),
      play: (id) => calls.push(id),
      search: () => calls.push("search"),
      importPlaylist: () => calls.push("import"),
      tune: () => calls.push("tune"),
    });
    await navigation.activate();
    items = [song];
    await navigation.activate();
    if (name !== "carthing") {
      items = skinFor(name).catalogItems([], "radio", (x) => x);
      state.selected = 1;
      await navigation.activate();
      assert.equal(calls.at(-1), "tune");
    }
    navigation.remember(
      { view: "browse", page: 2, selected: 6, scroll: 120 },
      "tracks",
    );
    state.view = "tracks";
    const before = state.openId;
    const previous = navigation.previous();
    assert.equal(state.selected, 6);
    assert.equal(previous.scroll, 120);
    assert.equal(state.openId, before + 1);
    navigation.home();
    assert.equal(calls.at(-1), "home");
    assert.deepEqual(state.history, []);
    assert.deepEqual(calls.slice(0, 2), ["p", song.id]);
  }
});
test("skin-specific dial mappings do not duplicate playback policy", () => {
  assert.equal(skinFor("carthing").centerAction({ view: "player" }), "toggle");
  assert.equal(
    skinFor("ipod").centerAction({ view: "player", live: false }),
    "seek",
  );
  assert.equal(
    skinFor("ipod").rotationAction({
      view: "player",
      live: false,
      seeking: true,
    }),
    "seek",
  );
  assert.equal(
    skinFor("ipod").rotationAction({
      view: "player",
      live: true,
      seeking: true,
    }),
    "volume",
  );
  for (const id of ["carthing", "ipod", "walkman"])
    assert.equal(skinFor(id).centerAction({ view: "tuner" }), "tune");
});
