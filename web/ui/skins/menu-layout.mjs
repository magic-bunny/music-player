import { carThing } from "./carthing.mjs";

// Compact hardware displays share menu actions, not another skin's renderer.
export const listHomeItems = (items, current, t) => [
  ...items,
  { id: "ui:search", title: t("Search"), artist: "", action: "open-search" },
  {
    id: "ui:settings",
    title: t("Settings"),
    artist: "",
    action: "preferences",
  },
  ...(current
    ? [
        {
          id: "ui:playing",
          title: t("Now Playing"),
          artist: "",
          action: "player",
        },
      ]
    : []),
];
export const listCatalogItems = (items, kind, t) => [
  ...items,
  {
    id: `ui:${kind}-search`,
    title: t("Search"),
    artist: "",
    action: "open-search",
  },
  {
    id: `ui:${kind}-add`,
    title: t(kind === "radio" ? "Add FM station" : "Add local playlist"),
    artist: "",
    action: kind === "radio" ? "tune-radio" : "import-playlist",
  },
];
export const listLayout = (view) =>
  ["home", "browse", "radio"].includes(view) ? "list" : carThing.layout(view);
