import { LibraryStore, createLibraryAdapter } from "../core/library-store.mjs";

export async function createNativeAdapter(invoke, storage) {
  const checking = await invoke("check_mode");
  if (checking) {
    const memory = new Map();
    storage = {
      getItem: (key) => memory.get(key) ?? null,
      setItem: (key, value) => memory.set(key, value),
    };
  }
  let playlists = [];
  return createLibraryAdapter(
    {
      legacy: () =>
        checking
          ? Promise.resolve({ favorites: [], playlists: [] })
          : invoke("legacy_configuration"),
      async restore(config) {
        playlists = await invoke("restore_library", {
          tracks: config.favorites.filter((t) => t.origin),
          folders: config.playlists.map((p) => p.folder).filter(Boolean),
        });
      },
      async importPlaylist() {
        const playlist = await invoke("import_playlist");
        if (playlist)
          playlists = [
            playlist,
            ...playlists.filter((p) => p.id !== playlist.id),
          ];
        return playlist;
      },
      invoke: (command, args) =>
        command === "local_playlists"
          ? Promise.resolve(playlists)
          : invoke(command, args),
    },
    new LibraryStore(storage),
  );
}
