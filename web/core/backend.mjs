const controls = new Set([
  "toggle",
  "stop",
  "next",
  "previous",
  "volume",
  "seek",
  "shuffle",
  "repeat",
]);
const named = (value) =>
  value && typeof value.id === "string" && typeof value.title === "string";
const songs = (value) =>
  Array.isArray(value) &&
  value.every((item) => named(item) && typeof item.artist === "string");
const collections = (value) =>
  Array.isArray(value) &&
  value.every((item) => named(item) && Number.isFinite(item.track_count));
export function validateCommand(command, args = {}) {
  let valid = true;
  if (
    ["collection_tracks", "toggle_favorite", "resolve_track"].includes(command)
  )
    valid = typeof args.id === "string" && args.id.length > 0;
  if (["collections", "search", "radio_search"].includes(command))
    valid = typeof args.query === "string";
  if (command === "artwork")
    valid =
      Array.isArray(args.ids) &&
      args.ids.length <= 40 &&
      args.ids.every((id) => typeof id === "string");
  if (command === "play")
    valid =
      Array.isArray(args.queue) &&
      args.queue.length > 0 &&
      args.queue.every((id) => typeof id === "string") &&
      Number.isInteger(args.index) &&
      args.index >= 0 &&
      args.index < args.queue.length;
  if (command === "control")
    valid =
      controls.has(args.action) &&
      (!["seek", "volume"].includes(args.action) ||
        (Number.isFinite(args.value) &&
          args.value >= 0 &&
          (args.action !== "volume" || args.value <= 1)));
  if (!valid) throw Error(`Invalid ${command} arguments`);
}
export function validateResult(command, result) {
  let valid = true;
  if (
    ["search", "radio_search", "favorites", "toggle_favorite"].includes(command)
  )
    valid = songs(result);
  if (["collections", "local_playlists"].includes(command))
    valid = collections(result);
  if (command === "collection_tracks")
    valid =
      result && songs(result.tracks) && typeof result.cached === "boolean";
  if (command === "music_sources")
    valid =
      Array.isArray(result) &&
      result.every(
        (p) => typeof p.id === "string" && typeof p.name === "string",
      );
  if (command === "artwork")
    valid =
      result &&
      typeof result === "object" &&
      !Array.isArray(result) &&
      Object.values(result).every((url) => typeof url === "string");
  if (command === "import_playlist")
    valid = result === null || collections([result]);
  if (command === "snapshot")
    valid =
      result &&
      (result.track === null || named(result.track)) &&
      ["position", "duration", "volume"].every((key) =>
        Number.isFinite(result[key]),
      ) &&
      ["paused", "loading", "repeat", "shuffle"].every(
        (key) => typeof result[key] === "boolean",
      );
  if (!valid) throw Error(`Invalid ${command} response from platform adapter`);
  return result;
}
/** @returns {import('./contracts').BackendInvoke} */
export function createBackend(invoke) {
  return async (command, args = {}) => {
    validateCommand(command, args);
    // Dispatch synchronously so file pickers retain the input gesture.
    const pending = invoke(command, args);
    return validateResult(command, await pending);
  };
}
