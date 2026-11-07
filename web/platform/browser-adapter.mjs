import { LibraryStore, createLibraryAdapter } from "../core/library-store.mjs";
import {
  AudiusProvider,
  radioStations,
} from "./browser-providers.mjs";
import { BrowserPlayer } from "./browser-player.mjs";
import {
  MediaFiles,
  chooseFolder,
  scanBrowserFolder,
} from "./browser-files.mjs";

export function createBrowserAdapter(
  storage,
  { fetcher = fetch, makeAudio } = {},
) {
  const catalog = new Map(),
    covers = new Map(),
    local = new Map(),
    files = new MediaFiles();
  const providers = new Map([["audius", new AudiusProvider(fetcher)]]);
  const provider = (id) => {
    const value = providers.get(id);
    if (!value) throw Error("This music source is unavailable in the browser.");
    return value;
  };
  const register = (items) => {
    for (const t of items) {
      catalog.set(t.id, t);
      if (t.cover_url) covers.set(t.id, t.cover_url);
    }
    return items;
  };
  const track = (id) => {
    const t = catalog.get(id);
    if (!t) throw Error("Track unavailable. Search again.");
    return t;
  };
  const player = new BrowserPlayer({
    makeAudio,
    resolve: async (t) => {
      if (t.local) {
        const url = await files.url(`audio:${t.id}`);
        if (!url)
          throw Error("Local file unavailable. Import the folder again.");
        return url;
      }
      return provider(t.id.split(":")[0]).stream(t);
    },
  });
  const platform = {
    async restore(config) {
      register(config.favorites);
      for (const p of config.playlists)
        if (p.browserLocal) {
          local.set(p.id, p);
          register(p.tracks || []);
        }
    },
    importPlaylist() {
      const picked = chooseFolder();
      return picked.then(scanBrowserFolder).then(async (result) => {
        if (!result) return null;
        await files.save(result.entries);
        local.set(result.playlist.id, result.playlist);
        register(result.playlist.tracks);
        return result.playlist;
      });
    },
    async invoke(command, args = {}) {
      switch (command) {
        case "music_sources":
          return Array.from(providers.values(), (p) => ({
            id: p.id,
            name: p.name,
          }));
        case "collections": {
          const items = await provider(args.source || "audius").collections(
            args.query,
            args.offset,
          );
          for (const p of items) if (p.cover_url) covers.set(p.id, p.cover_url);
          return items;
        }
        case "collection_tracks":
          return {
            tracks: local.has(args.id)
              ? local.get(args.id).tracks
              : register(
                  await provider(
                    args.id.startsWith("audius-playlist:")
                      ? "audius"
                      : "netease",
                  ).tracks(args.id),
                ),
            cached: local.has(args.id),
          };
        case "search":
          return register(
            await provider(args.source || "audius").search(args.query),
          );
        case "radio_search":
          return register(await radioStations(args.query, fetcher));
        case "local_playlists":
          return Array.from(local.values());
        case "resolve_track":
          return track(args.id);
        case "artwork":
          return Object.fromEntries(
            (
              await Promise.all(
                args.ids.map(async (id) => {
                  const url =
                    covers.get(id) ||
                    (id.startsWith("browser-")
                      ? await files.url(`cover:${id}`)
                      : null);
                  if (!url) return null;
                  // Start image transfers while the user is still browsing the previous screen.
                  await new Promise((resolve) => {
                    const img = new Image();
                    const timer = setTimeout(resolve, 8000);
                    img.onload = img.onerror = () => {
                      clearTimeout(timer);
                      resolve();
                    };
                    img.src = url;
                  });
                  return [id, url];
                }),
              )
            ).filter(Boolean),
          );
        case "play":
          player.play(args.queue.map(track), args.index);
          return;
        case "control":
          return player.control(args.action, args.value);
        case "snapshot":
          return player.snapshot();
        case "window_action":
          return;
        default:
          throw Error(`Unsupported browser command: ${command}`);
      }
    },
  };
  return createLibraryAdapter(platform, new LibraryStore(storage));
}
