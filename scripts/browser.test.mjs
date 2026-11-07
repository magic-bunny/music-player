import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LibraryStore,
  createLibraryAdapter,
  LIBRARY_KEY,
} from "../web/core/library-store.mjs";
import { createNativeAdapter } from "../web/platform/native-adapter.mjs";
import { BrowserPlayer } from "../web/platform/browser-player.mjs";
import {
  AudiusProvider,
  audiusTrack,
  NeteaseProxyProvider,
  proxyUrl,
} from "../web/platform/browser-providers.mjs";
import { scanBrowserFolder } from "../web/platform/browser-files.mjs";

const memory = () => {
  const data = new Map();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, v),
  };
};
const song = {
  id: "audius:a",
  title: "A",
  artist: "Artist",
  album: "Album",
  seconds: 100,
  origin: { Audius: { id: "a", cover_url: "https://example.com/cover.jpg" } },
};
test("shared configuration survives reload; migration runs once and files are not written", async () => {
  const storage = memory();
  const commands = [];
  const raw = async (command, args) => {
    commands.push(command);
    switch (command) {
      case "check_mode":
        return false;
      case "legacy_configuration":
        return {
          favorites: [song],
          playlists: [{ id: "legacy", folder: "/Music" }],
        };
      case "restore_library":
        assert.deepEqual(args.tracks, [song]);
        return [{ id: "local-playlist:1", folder: "/Music" }];
      case "resolve_track":
        return song;
      default:
        throw Error(command);
    }
  };
  const first = await createNativeAdapter(raw, storage);
  assert.deepEqual(await first("favorites"), [song]);
  assert.equal((await first("local_playlists"))[0].folder, "/Music");
  const second = await createNativeAdapter(raw, storage);
  assert.deepEqual(await second("favorites"), [song]);
  assert.equal(commands.filter((c) => c === "legacy_configuration").length, 1);
  assert.deepEqual(await second("toggle_favorite", { id: song.id }), []);
  assert.equal(new LibraryStore(storage).read().favorites.length, 0);
  assert.ok(!commands.includes("toggle_favorite"));
});
test("storage errors do not silently discard or overwrite a library", () => {
  const storage = memory();
  storage.setItem(LIBRARY_KEY, "broken");
  assert.throws(() => new LibraryStore(storage).initialize());
  const store = new LibraryStore({
    getItem: () =>
      JSON.stringify({ version: 1, favorites: [song], playlists: [] }),
    setItem: () => {
      throw Error("QuotaExceeded");
    },
  });
  assert.throws(() => store.toggle(song), /Quota/);
});
test("both adapters use the same favorite and playlist writes; picker retains user activation", async () => {
  let opened = false;
  const storage = memory();
  const playlist = { id: "p", title: "Folder" };
  const invoke = createLibraryAdapter(
    {
      restore: async () => {},
      importPlaylist: () => {
        opened = true;
        return Promise.resolve(playlist);
      },
      invoke: async () => song,
    },
    new LibraryStore(storage),
  );
  const pending = invoke("import_playlist");
  assert.equal(opened, true);
  await pending;
  await invoke("toggle_favorite", { id: song.id });
  assert.deepEqual(new LibraryStore(storage).read(), {
    version: 1,
    favorites: [song],
    playlists: [playlist],
  });
});
class FakeAudio extends EventTarget {
  paused = true;
  currentTime = 0;
  duration = 100;
  src = "";
  volume = 1;
  async play() {
    this.paused = false;
    this.dispatchEvent(new Event("playing"));
  }
  pause() {
    this.paused = true;
    this.dispatchEvent(new Event("pause"));
  }
  removeAttribute() {
    this.src = "";
  }
  load() {}
}
test("browser playback handles seek, volume, shuffle history, repeat and end of queue", async () => {
  const p = new BrowserPlayer({
    resolve: async (t) => "https://example.com/" + t.id,
    makeAudio: () => new FakeAudio(),
    random: () => 0,
  });
  p.play([song, { ...song, id: "b" }, { ...song, id: "c" }], 0);
  await p.pending;
  assert.equal(p.snapshot().paused, false);
  await p.control("seek", 25);
  await p.control("volume", 0.2);
  assert.equal(p.snapshot().position, 25);
  assert.equal(p.audio.volume, 0.2);
  await p.control("shuffle");
  await p.control("next");
  await p.pending;
  assert.equal(p.snapshot().track.id, "b");
  await p.control("previous");
  await p.pending;
  assert.equal(p.snapshot().track.id, song.id);
  await p.control("repeat");
  p.audio.currentTime = 100;
  p.audio.dispatchEvent(new Event("ended"));
  assert.equal(p.audio.currentTime, 0);
  await p.control("repeat");
  await p.control("shuffle");
  p.play([song], 0);
  await p.pending;
  p.audio.paused = true;
  p.audio.dispatchEvent(new Event("ended"));
  assert.equal(p.snapshot().paused, true);
  await p.control("stop");
  assert.equal(p.snapshot().track, null);
});
test("obsolete audio requests and errors cannot replace a newer selection", async () => {
  let release;
  const pending = new Promise((r) => (release = r));
  const p = new BrowserPlayer({
    resolve: (t) =>
      t.id === "slow"
        ? pending
        : Promise.resolve("https://example.com/new.mp3"),
    makeAudio: () => new FakeAudio(),
  });
  p.play([{ ...song, id: "slow" }, song], 0);
  const old = p.audio;
  await p.control("next");
  await p.pending;
  release("https://example.com/old.mp3");
  await Promise.resolve();
  old.dispatchEvent(new Event("error"));
  assert.equal(p.snapshot().track.id, song.id);
  assert.equal(p.snapshot().error, null);
  assert.equal(p.audio.src, "https://example.com/new.mp3");
});
test("autoplay rejection leaves a recoverable paused player", async () => {
  const audio = new FakeAudio();
  audio.play = async () => {
    throw Object.assign(Error("blocked"), { name: "NotAllowedError" });
  };
  const p = new BrowserPlayer({
    resolve: async () => "/song.mp3",
    makeAudio: () => audio,
  });
  p.play([song], 0);
  await p.pending;
  assert.equal(p.snapshot().loading, false);
  assert.equal(p.snapshot().paused, true);
  assert.match(p.snapshot().error, /Press Play/);
  audio.play = FakeAudio.prototype.play;
  await p.control("toggle");
  assert.equal(p.snapshot().paused, false);
});
test("Audius excludes restricted tracks and rechecks before streaming", async () => {
  const value = {
    id: "a",
    title: "A",
    is_streamable: true,
    artwork: { "480x480": "https://example.com/art.jpg" },
  };
  assert.equal(audiusTrack(value).cover_url, "https://example.com/art.jpg");
  assert.equal(audiusTrack({ ...value, is_stream_gated: true }), null);
  const provider = new AudiusProvider(async () => ({
    ok: true,
    json: async () => ({ data: { ...value, access: { stream: false } } }),
  }));
  await assert.rejects(() => provider.stream(song), /requires access/);
});
test("NetEase endpoint validation and full-track access checks", () => {
  assert.equal(
    proxyUrl("https://music.example/api/"),
    "https://music.example/api",
  );
  assert.throws(() => proxyUrl("http://music.example"));
  assert.throws(() => proxyUrl("https://user:pass@music.example"));
  const provider = new NeteaseProxyProvider("https://music.example");
  assert.ok(
    provider.allowed({
      code: 200,
      fee: 0,
      url: "https://example.com/music.mp3",
    }),
  );
  assert.ok(
    !provider.allowed({
      code: 200,
      fee: 1,
      url: "https://example.com/music.mp3",
    }),
  );
  assert.ok(
    !provider.allowed({
      code: 200,
      url: "https://example.com/music.mp3",
      freeTrialInfo: { start: 0 },
    }),
  );
});
test("browser folder import matches folder and song covers and keeps bytes out of configuration", async () => {
  const file = (name) => ({
    name,
    webkitRelativePath: "Drive/" + name,
    size: 10,
    lastModified: 123,
  });
  const { playlist, entries } = await scanBrowserFolder(
    ["Drive.png", "Song.mp3", "Song.jpg", "Second.wav"].map(file),
  );
  assert.equal(playlist.title, "Drive");
  assert.equal(playlist.tracks.length, 2);
  assert.equal(entries.length, 4);
  assert.ok(entries.some(([key]) => key === `cover:${playlist.id}`));
  assert.equal(JSON.stringify(playlist).includes("blob:"), false);
  assert.deepEqual(
    (
      await scanBrowserFolder(
        ["Drive.png", "Song.mp3", "Song.jpg", "Second.wav"].map(file),
      )
    ).playlist,
    playlist,
  );
});
