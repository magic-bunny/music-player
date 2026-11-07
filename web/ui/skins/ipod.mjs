import { carThing } from "./carthing.mjs";
import { listHomeItems, listCatalogItems, listLayout } from "./menu-layout.mjs";

export const ipod = {
  id: "ipod",
  geometry: {
    width: 520,
    height: 800,
    portrait: true,
    fitDesktop: true,
    tabs: { x: 22, y: 194 },
  },
  windowAction: "skin-ipod",
  seeking: true,
  holdForOptions: true,
  homeItems: listHomeItems,
  catalogItems: listCatalogItems,
  layout: (view) =>
    ["browse", "playlists", "radio", "radio-list"].includes(view)
      ? "coverflow"
      : listLayout(view),
  centerAction: ({ view, optionsOpen, live }) =>
    optionsOpen
      ? "option"
      : view === "player"
        ? live
          ? "options"
          : "seek"
        : carThing.centerAction({ view }),
  rotationAction: ({ view, optionsOpen, seeking, live }) =>
    optionsOpen
      ? "option"
      : view === "player" && seeking && !live
        ? "seek"
        : carThing.rotationAction({ view }),
};

export class IpodPresenter {
  constructor({ $, icon, t }) {
    this.$ = $;
    this.icon = icon;
    this.t = t;
  }
  text(id, value) {
    const node = this.$(id);
    if (node.textContent !== value) node.textContent = value;
  }
  enter() {
    document.body.classList.remove("ipod-home-preview");
    this.$("ipod-menu-preview").setAttribute("aria-hidden", "true");
  }
  rotate(view) {
    if (view !== "home") return;
    document.body.classList.add("ipod-home-preview");
    this.$("ipod-menu-preview").setAttribute("aria-hidden", "false");
  }
  update({ state, seeking, collectionTitle }) {
    const { $, t, icon } = this;
    for (const button of document.querySelectorAll("[data-source-control]")) {
      const source = $(button.dataset.sourceControl);
      button.disabled = source.disabled;
      button.classList.toggle("active", source.classList.contains("active"));
      button.setAttribute(
        "aria-pressed",
        source.getAttribute("aria-pressed") || "false",
      );
    }
    this.text(
      "ipod-screen-title",
      seeking
        ? t("Playback position")
        : ipod.layout(state.view) === "coverflow"
          ? "Cover Flow"
          : {
              home: "iPod",
              player: t("Now Playing"),
              preferences: t("Settings"),
              tuner: t("FM tuner"),
            }[state.view] ||
            collectionTitle ||
            t("Music"),
    );
    const status = state.current
      ? state.playbackStatus === "Playing"
        ? "play"
        : "pause"
      : "";
    const indicator = $("ipod-play-state");
    indicator.hidden = !status;
    if (indicator.dataset.status !== status) {
      indicator.innerHTML = status ? icon(status) : "";
      indicator.dataset.status = status;
    }
    this.text(
      "ipod-track-number",
      state.current && !state.current.stream
        ? `${Math.max(1, state.queue.findIndex((track) => track.id === state.current.id) + 1)} / ${Math.max(1, state.queue.length)}`
        : "",
    );
    if (state.view === "player")
      $("dial").title = t(
        seeking
          ? "Rotate to seek; press to return to volume."
          : "Rotate to adjust volume; press to seek; hold for options.",
      );
  }
  preview({ selected, current, artworkUrl, setImage }) {
    const url =
      (selected && artworkUrl(selected.id)) ||
      (current && artworkUrl(current.id)) ||
      artworkUrl("home:music");
    setImage(this.$("ipod-menu-cover"), url);
  }
}
