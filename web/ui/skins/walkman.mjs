import { carThing } from "./carthing.mjs";
import { listHomeItems, listCatalogItems, listLayout } from "./menu-layout.mjs";
import { Marquee } from "../marquee.mjs";
import { LcdArtwork } from "../lcd-artwork.mjs";
import { arcButton } from "./remote-geometry.mjs";
import { playbackTime } from "../../core/time.mjs";

export function volumeCells(value) {
  return Math.ceil(
    Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)) * 10,
  );
}

export const walkman = {
  ...carThing,
  id: "walkman",
  geometry: {
    width: 1240,
    height: 650,
    portrait: false,
    fitDesktop: true,
    tabs: { x: 50, y: 119 },
    rotatedTabs: { x: 414, y: 666 },
  },
  windowAction: "skin-walkman",
  holdForOptions: true,
  homeItems: listHomeItems,
  catalogItems: listCatalogItems,
  layout: listLayout,
  centerAction: (context) =>
    context.optionsOpen ? "option" : carThing.centerAction(context),
  rotationAction: (context) =>
    context.optionsOpen ? "option" : carThing.rotationAction(context),
};

export function createWalkmanChrome(
  icon,
  { menu, home, previous, next, toggle, select, volume, like },
) {
  const decor = document.createElement("div");
  decor.id = "walkman-chassis";
  // Both ends are defined in the same 1240 x 650 canvas as the two housings.
  const cable = "M802 78 C802 18 990 24 990 144";
  decor.innerHTML = `
    <svg class="wm-cables" viewBox="0 0 1240 650" aria-hidden="true"><path class="wm-wire-shadow" d="${cable}"/><path class="wm-wire" d="${cable}"/><path class="wm-wire-glint" d="${cable}"/></svg>
    <div class="wm-deck">
      <i class="wm-jack"></i><div class="wm-top-rail"><i class="wm-rail-pin"></i></div>
      <button data-wm="toggle" class="wm-silver-key" title="Play or pause" aria-label="Walkman play or pause" aria-pressed="false"></button>
      <span class="wm-door-seam"></span><span class="wm-sony">SONY</span><span class="wm-wordmark">WALKMAN</span><svg class="wm-direction" viewBox="0 0 100 40" aria-hidden="true"><path d="M5 20 43 4v10h50v12H43v10Z"/></svg><div class="wm-cassette-window" aria-hidden="true"><div class="wm-empty-bay"><i></i><i></i></div><div class="wm-cassette" hidden><img id="walkman-tape-cover" alt=""><span class="wm-label-ridge"></span></div><div class="wm-spool wm-spool-left"><div class="wm-reel"></div></div><div class="wm-spool wm-spool-right"><div class="wm-reel"></div></div></div>
    </div>`;
  document.body.prepend(decor);
  const remote = document.createElement("div");
  remote.id = "walkman-remote-chrome";
  remote.innerHTML = `<span class="wm-remote-port"></span><div class="wm-recess" aria-hidden="true"></div>
    <svg class="wm-remote-lettering" viewBox="0 0 360 360" aria-hidden="true"><defs>
      <path id="wm-brand-arc" d="M41.436 100 A160 160 0 0 1 166.055 20.609"/>
      <path id="wm-sony-arc" d="M202.268 21.557 A160 160 0 0 1 298.903 72.939"/>
      <linearGradient id="wm-key-metal" x1="0" y1="0" x2="0.7" y2="1"><stop stop-color="#72837a"/><stop offset=".28" stop-color="#a8b4ac"/><stop offset=".52" stop-color="#697970"/><stop offset="1" stop-color="#4d6055"/></linearGradient>
    </defs><text class="wm-remote-brand"><textPath href="#wm-brand-arc" startOffset="50%" text-anchor="middle">WALKMAN</textPath></text><text class="wm-remote-sony"><textPath href="#wm-sony-arc" startOffset="50%" text-anchor="middle">SONY</textPath></text></svg>`;
  document.querySelector(".dial-window").append(remote);
  const keys = [
    ["back", "menu", 270, 296, "MENU", "Remote menu"],
    ["previous", "previous", 240, 266, "previous", "Remote previous track"],
    ["volume-down", "volume-down", 210, 236, "VOL −", "Remote volume down"],
    ["toggle", "toggle", 180, 206, "play", "Remote play or pause"],
    ["select", "select", 150, 176, "SELECT", "Remote select"],
    ["volume-up", "volume-up", 120, 146, "VOL +", "Remote volume up"],
    ["next", "next", 90, 116, "next", "Remote next track"],
    ["like", "like", 60, 86, "heart", "Remote like"],
  ];
  for (const [action, name, start, end, label, aria] of keys) {
    const shape = arcButton(start, end),
      button = document.createElement("button");
    button.className = `wm-arc-key wm-remote-${name}`;
    button.dataset.wm = action;
    button.setAttribute("aria-label", aria);
    button.title = aria.replace("Remote ", "");
    Object.assign(button.style, {
      left: `${shape.left}px`,
      top: `${shape.top}px`,
      width: `${shape.width}px`,
      height: `${shape.height}px`,
      clipPath: `path('${shape.path}')`,
    });
    const symbol = ["previous", "next", "play", "heart"].includes(label)
      ? `<g class="wm-key-icon" transform="translate(${shape.x - 8} ${shape.y - 8})">${icon(label).replace("<svg ", '<svg width="16" height="16" ')}</g>`
      : `<defs><path id="wm-key-label-${name}" d="${shape.label}"/></defs><text class="wm-key-label" dy="3"><textPath href="#wm-key-label-${name}" startOffset="50%" text-anchor="middle">${label}</textPath></text>`;
    button.innerHTML = `<svg viewBox="0 0 ${shape.width} ${shape.height}" aria-hidden="true"><path class="wm-key-surface" d="${shape.path}"/>${symbol}</svg>`;
    remote.append(button);
  }
  const status = document.createElement("div");
  status.id = "walkman-lcd-status";
  status.innerHTML =
    '<span id="walkman-lcd-symbol" aria-hidden="true"></span><strong id="walkman-lcd-page">WALKMAN</strong><span class="wm-lcd-battery" aria-hidden="true">▰▰▰</span>';
  document.querySelector(".shell").prepend(status);
  const media = document.createElement("div");
  media.id = "walkman-lcd-media";
  media.innerHTML =
    '<canvas id="walkman-lcd-cover" width="100" height="100" role="img" aria-label="Album artwork"></canvas><span id="walkman-title-clip"><span id="walkman-title-text"></span></span><span id="walkman-lcd-time">0:00 / --:--</span>';
  document.getElementById("player-view").prepend(media);
  const meter = document.createElement("div");
  meter.id = "walkman-lcd-volume";
  meter.setAttribute("role", "meter");
  meter.setAttribute("aria-label", "Volume level");
  meter.setAttribute("data-i18n-aria-label", "Volume level");
  meter.setAttribute("aria-valuemin", "0");
  meter.setAttribute("aria-valuemax", "100");
  meter.innerHTML =
    '<span class="wm-volume-caption">VOL</span><span class="wm-volume-columns" aria-hidden="true">' +
    Array.from(
      { length: 10 },
      (_, index) =>
        '<span class="wm-volume-column">' +
        "<i></i>".repeat(Math.ceil((index + 1) / 2)) +
        "</span>",
    ).join("") +
    "</span>";
  document.querySelector(".shell").append(meter);
  const actions = {
    menu: home,
    back: () => menu(true),
    previous,
    next,
    toggle,
    select,
    like,
    "volume-up": () => volume(1),
    "volume-down": () => volume(-1),
  };
  for (const button of document.querySelectorAll("[data-wm]"))
    button.onclick = () => actions[button.dataset.wm]?.();
  const center = remote.querySelector('[data-wm="select"]');
  let timer,
    held = false;
  center.onpointerdown = () => {
    held = false;
    timer = setTimeout(() => {
      held = true;
      document.getElementById("more").click();
    }, 650);
  };
  center.onpointerup =
    center.onpointerleave =
    center.onpointercancel =
      () => clearTimeout(timer);
  center.onclick = () => {
    if (!held) select();
    held = false;
  };
}

export class WalkmanPresenter {
  constructor({ $, icon, t }) {
    Object.assign(this, { $, icon, t });
    this.marquee = new Marquee(
      $("walkman-title-clip"),
      $("walkman-title-text"),
    );
    this.lcd = new LcdArtwork($("walkman-lcd-cover"));
  }
  volume(value) {
    const cells = volumeCells(value),
      meter = this.$("walkman-lcd-volume");
    meter.setAttribute(
      "aria-valuenow",
      String(Math.round(Math.max(0, Math.min(1, value)) * 100)),
    );
    meter
      .querySelectorAll(".wm-volume-column")
      .forEach((column, index) =>
        column.classList.toggle("filled", index < cells),
      );
  }
  update({ state, collectionTitle, position = 0, duration = 0, volume = 0 }) {
    const { $, t, icon } = this;
    const title =
      {
        home: "WALKMAN",
        player: state.current?.stream ? "FM" : "MUSIC",
        preferences: t("Settings"),
        tuner: "FM",
      }[state.view] ||
      collectionTitle ||
      t("Music");
    if ($("walkman-lcd-page").textContent !== title)
      $("walkman-lcd-page").textContent = title;
    const status = state.current
      ? state.playbackStatus === "Playing"
        ? "play"
        : "pause"
      : "";
    const symbol = $("walkman-lcd-symbol");
    if (symbol.dataset.status !== status) {
      symbol.innerHTML = status ? icon(status) : "";
      symbol.dataset.status = status;
    }
    this.marquee.update(state.current?.title || "");
    const timing = playbackTime(
      position,
      duration,
      state.current?.stream ? t("LIVE") : null,
    );
    if ($("walkman-lcd-time").textContent !== timing)
      $("walkman-lcd-time").textContent = timing;
    this.volume(volume);
    const present = Boolean(state.current);
    document.body.classList.toggle("walkman-loaded", present);
    document.querySelector(".wm-cassette").hidden = !present;
    document.body.classList.toggle(
      "walkman-live",
      Boolean(state.current?.stream),
    );
    document
      .querySelectorAll('[data-wm="toggle"]')
      .forEach((button) =>
        button.setAttribute(
          "aria-pressed",
          String(state.playbackStatus === "Playing"),
        ),
      );
    const heart = document.querySelector(".wm-remote-like"),
      liked = state.favorites.some((track) => track.id === state.current?.id);
    heart.disabled = !present;
    heart.setAttribute("aria-pressed", String(liked));
    heart.title = t(liked ? "Unlike" : "Like");
  }
  preview({ current, artworkUrl, setImage }) {
    const url = current ? artworkUrl(current.id) : null;
    setImage(this.$("walkman-tape-cover"), url);
    this.lcd.update(url);
  }
}
