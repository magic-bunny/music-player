export const LIBRARY_KEY = "yuyin-library-v1";

// Configuration is shared by both runtimes. Media bytes never enter localStorage.
export class LibraryStore {
  constructor(storage, key = LIBRARY_KEY) {
    this.storage = storage;
    this.key = key;
  }
  read() {
    const raw = this.storage.getItem(this.key);
    if (raw === null) return null;
    const value = JSON.parse(raw);
    if (
      value.version !== 1 ||
      !Array.isArray(value.favorites) ||
      !Array.isArray(value.playlists)
    )
      throw Error("Saved library is invalid.");
    return value;
  }
  write(value) {
    this.storage.setItem(this.key, JSON.stringify({ ...value, version: 1 }));
    return value;
  }
  initialize(value = { favorites: [], playlists: [] }) {
    return this.read() || this.write(value);
  }
  toggle(track) {
    const value = this.read() || { favorites: [], playlists: [] };
    const exists = value.favorites.some((item) => item.id === track.id);
    value.favorites = exists
      ? value.favorites.filter((item) => item.id !== track.id)
      : [track, ...value.favorites];
    this.write(value);
    return value.favorites;
  }
  add(playlist) {
    const value = this.read() || { favorites: [], playlists: [] };
    value.playlists = [
      playlist,
      ...value.playlists.filter(
        (item) =>
          item.id !== playlist.id &&
          !(playlist.folder && item.folder === playlist.folder),
      ),
    ];
    this.write(value);
    return playlist;
  }
}

export function createLibraryAdapter(platform, store) {
  let initialization;
  const ready = () =>
    initialization ||
    (initialization = (async () => {
      const existing = store.read();
      const config =
        existing ||
        store.initialize(platform.legacy ? await platform.legacy() : undefined);
      await platform.restore(config);
    })().catch((error) => {
      initialization = null;
      throw error;
    }));
  return async (command, args = {}) => {
    // The picker must open in the originating user gesture, before any await.
    if (command === "import_playlist") {
      const picked = platform.importPlaylist();
      await ready();
      const playlist = await picked;
      if (!playlist) return null;
      return store.add(playlist);
    }
    if (
      [
        "favorites",
        "toggle_favorite",
        "local_playlists",
        "play",
        "collection_tracks",
        "artwork",
      ].includes(command)
    )
      await ready();
    if (command === "favorites") return store.read().favorites;
    if (command === "toggle_favorite")
      return store.toggle(await platform.invoke("resolve_track", args));
    if (command === "local_playlists")
      return platform.invoke(command, {
        ...args,
        playlists: store.read().playlists,
      });
    return platform.invoke(command, args);
  };
}
