import { test } from "node:test";
import assert from "node:assert/strict";
import { createBackend } from "../web/core/backend.mjs";
import { createBrowserAdapter } from "../web/platform/browser-adapter.mjs";
import { createNativeAdapter } from "../web/platform/native-adapter.mjs";

const rawSong = {
  id: "abc",
  title: "Track",
  duration: 30,
  is_streamable: true,
  user: { name: "Artist" },
};
const song = {
  id: "audius:abc",
  title: "Track",
  artist: "Artist",
  seconds: 30,
  local: false,
};
const collection = {
  id: "audius-playlist:mix",
  title: "Mix",
  artist: "Artist",
  track_count: 1,
};
const memory = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
};
class Audio extends EventTarget {
  paused = true;
  currentTime = 0;
  duration = 30;
  src = "";
  async play() {
    this.paused = false;
    this.dispatchEvent(new Event("playing"));
  }
  pause() {
    this.paused = true;
  }
  removeAttribute() {
    this.src = "";
  }
  load() {}
}
const fetcher = async (url) => ({
  ok: true,
  json: async () => ({
    data: String(url).includes("playlists/trending")
      ? [
          {
            id: "mix",
            playlist_name: "Mix",
            track_count: 1,
            user: { name: "Artist" },
          },
        ]
      : String(url).includes("/tracks/search") ||
          String(url).includes("/playlists/mix/tracks")
        ? [rawSong]
        : rawSong,
  }),
});
async function native() {
  let favorites = [];
  let state = {
    track: null,
    position: 0,
    duration: 0,
    volume: 0.45,
    paused: true,
    loading: false,
    repeat: false,
    shuffle: false,
  };
  return createNativeAdapter(async (command, args) => {
    switch (command) {
      case "check_mode":
        return true;
      case "restore_library":
        favorites = args.tracks;
        return [];
      case "music_sources":
        return [{ id: "audius", name: "Audius" }];
      case "collections":
        return [collection];
      case "collection_tracks":
        return { tracks: [song], cached: false };
      case "search":
        return [song];
      case "resolve_track":
        return song;
      case "play":
        state = {
          ...state,
          track: song,
          position: 0,
          duration: 30,
          paused: false,
        };
        return;
      case "snapshot":
        return state;
      case "control":
        if (args.action === "volume") state.volume = args.value;
        if (args.action === "seek") state.position = args.value;
        if (args.action === "toggle") state.paused = !state.paused;
        if (args.action === "stop") state.track = null;
        return;
      default:
        throw Error(command);
    }
  }, memory());
}
for (const [name, create] of [
  [
    "browser",
    () =>
      createBrowserAdapter(memory(), { fetcher, makeAudio: () => new Audio() }),
  ],
  ["native IPC bridge", native],
])
  test(`${name} satisfies the shared catalog, favorite and playback contract`, async () => {
    const invoke = createBackend(await create());
    const sources = await invoke("music_sources");
    if (name === "browser")
      assert.deepEqual(sources, [{ id: "audius", name: "Audius" }]);
    else assert.ok(sources.length);
    assert.equal(
      (
        await invoke("collections", { query: "", source: "audius", offset: 0 })
      )[0].id,
      collection.id,
    );
    const { tracks } = await invoke("collection_tracks", { id: collection.id });
    assert.equal(tracks[0].id, song.id);
    assert.equal(
      (await invoke("search", { query: "Track", source: "audius" }))[0].id,
      song.id,
    );
    assert.deepEqual(await invoke("favorites"), []);
    assert.equal(
      (await invoke("toggle_favorite", { id: song.id }))[0].id,
      song.id,
    );
    assert.deepEqual(await invoke("toggle_favorite", { id: song.id }), []);
    await invoke("play", { queue: [song.id], index: 0 });
    await new Promise((r) => setImmediate(r));
    assert.equal((await invoke("snapshot")).track.id, song.id);
    await invoke("control", { action: "volume", value: 0.2 });
    assert.equal((await invoke("snapshot")).volume, 0.2);
    await invoke("control", { action: "seek", value: 12 });
    assert.equal((await invoke("snapshot")).position, 12);
    await invoke("control", { action: "toggle" });
    assert.equal((await invoke("snapshot")).paused, true);
    await invoke("control", { action: "stop" });
    assert.equal((await invoke("snapshot")).track, null);
  });
test("invalid arguments fail before dispatch and malformed adapter results fail at the boundary", async () => {
  let calls = 0;
  const invoke = createBackend(async () => {
    calls++;
    return {};
  });
  await assert.rejects(invoke("play", { queue: ["a"], index: 1 }), /arguments/);
  await assert.rejects(
    invoke("control", { action: "volume", value: 2 }),
    /arguments/,
  );
  assert.equal(calls, 0);
  await assert.rejects(invoke("snapshot"), /response/);
  await assert.rejects(invoke("collection_tracks", { id: "mix" }), /response/);
});
