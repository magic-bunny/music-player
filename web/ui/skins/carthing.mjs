const listViews = new Set([
  "tracks",
  "local",
  "favorites",
  "queue",
  "search",
  "playlists",
  "radio-list",
]);
export const carThing = {
  id: "carthing",
  geometry: {
    width: 1000,
    height: 540,
    portrait: false,
    fitDesktop: true,
    tabs: { x: 4, y: 64 },
  },
  windowAction: "skin-carthing",
  seeking: false,
  holdForOptions: false,
  homeItems: (items) => items,
  catalogItems: (items) => items,
  layout: (view) =>
    listViews.has(view)
      ? "list"
      : ["browse", "radio"].includes(view)
        ? "carousel"
        : "cards",
  centerAction: ({ view }) =>
    view === "player" ? "toggle" : view === "tuner" ? "tune" : "activate",
  rotationAction: ({ view }) =>
    ({ preferences: "preferences", player: "volume", tuner: "tune" })[view] ||
    "select",
};
