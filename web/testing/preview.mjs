// Explicit browser-only ?preview=1 adapter; native Tauri always uses real IPC.
const data = await fetch(
  new URL("./preview-data.json?playlists=1", import.meta.url),
  { cache: "no-store" },
).then((r) => r.json());
let state = {
  track: null,
  position: 0,
  duration: 0,
  paused: true,
  loading: false,
  repeat: false,
  shuffle: false,
  volume: 0.45,
  lyric: "",
  next_lyric: "",
  error: null,
  revision: 0,
};
let favorites = [];
let queue = [];
let index = 0;
let last = Date.now();
export async function invoke(command, args = {}) {
  if (command === "window_action") return;
  if (command === "music_sources")
    return [
      { id: "netease", name: "NetEase Music" },
      { id: "audius", name: "Audius" },
    ];
  if (command === "collections") {
    if (args.source === "audius")
      throw Error("Audius requires the desktop app.");
    const items = args.query
      ? data.collections.filter((c) =>
          `${c.title} ${c.artist}`.includes(args.query),
        )
      : data.collections;
    return items.slice(
      args.offset || 0,
      (args.offset || 0) + ((args.offset || 0) === 0 ? 10 : 30),
    );
  }
  if (command === "collection_tracks") {
    if (!data.playlistTracks[args.id])
      throw Error("Open this playlist in the desktop app.");
    return { tracks: data.playlistTracks[args.id], cached: false };
  }
  if (command === "local_playlists") return [];
  if (command === "favorites") return structuredClone(favorites);
  if (command === "toggle_favorite") {
    const t = data.tracks.find((t) => t.id === args.id);
    if (favorites.some((t) => t.id === args.id))
      favorites = favorites.filter((t) => t.id !== args.id);
    else if (t) favorites.push(t);
    return structuredClone(favorites);
  }
  if (command === "radio_search")
    throw Error("Live radio is available in the desktop app.");
  if (command === "search")
    return data.tracks.filter((t) =>
      `${t.title} ${t.artist}`.includes(args.query),
    );
  if (command === "artwork")
    return Object.fromEntries(
      args.ids.filter((id) => data.art[id]).map((id) => [id, data.art[id]]),
    );
  if (command === "import_playlist")
    throw Error("Add playlist folders in the desktop app.");
  if (command === "play") {
    queue = args.queue;
    index = args.index;
    select();
    return;
  }
  if (command === "control") {
    switch (args.action) {
      case "toggle":
        state.paused = !state.paused;
        last = Date.now();
        break;
      case "seek":
        state.position = Math.min(args.value, state.duration);
        break;
      case "volume":
        state.volume = args.value;
        break;
      case "shuffle":
        state.shuffle = !state.shuffle;
        break;
      case "stop":
        state.track = null;
        state.paused = true;
        break;
      case "repeat":
        state.repeat = !state.repeat;
        break;
      case "next":
        if (index < queue.length - 1) {
          index++;
          select();
        }
        break;
      case "previous":
        if (index > 0) {
          index--;
          select();
        }
        break;
    }
    return;
  }
  if (command === "snapshot") {
    const now = Date.now();
    if (!state.paused)
      state.position = Math.min(
        state.duration,
        state.position + (now - last) / 1000,
      );
    last = now;
    return structuredClone(state);
  }
  throw Error(`Unknown preview command ${command}`);
}
function select() {
  state.track = data.tracks.find((t) => t.id === queue[index]);
  state.duration = state.track.seconds;
  state.position = 0;
  state.paused = false;
  state.revision++;
  last = Date.now();
}
