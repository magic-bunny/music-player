import { skinIds } from "./index.mjs";
import { createWalkmanChrome } from "./walkman.mjs";
export function readSkin(storage) {
  try {
    const value = storage.getItem("yuyin-skin-v1");
    return skinIds.includes(value) ? value : "carthing";
  } catch {
    return "carthing";
  }
}
export function saveSkin(storage, skin) {
  if (!skinIds.includes(skin)) throw Error("Unknown appearance");
  storage.setItem("yuyin-skin-v1", skin);
}

export function createSkinChrome(
  icon,
  {
    changeSkin,
    openCustomGuide,
    menu,
    home,
    previous,
    next,
    toggle,
    select,
    volume,
    like,
  },
) {
  const spotify = document.querySelector(".brand-tag");
  spotify.dataset.skin = "carthing";
  spotify.dataset.tab = "carthing";
  spotify.setAttribute("role", "button");
  spotify.tabIndex = 0;
  spotify.setAttribute("aria-label", "Car Thing appearance");
  spotify.title = "Spotify · Car Thing";
  const ipod = document.createElement("button");
  ipod.className = "brand-tag ipod-tag";
  ipod.dataset.skin = "ipod";
  ipod.dataset.tab = "ipod";
  ipod.setAttribute("aria-label", "iPod appearance");
  ipod.title = "Apple · iPod Classic";
  ipod.innerHTML =
    '<span class="brand-lockup"><svg class="brand-logo apple-logo" viewBox="0 0 24 24" aria-hidden="true"><path d="M16.8 1c.2 2-1.4 4.2-3.5 4.4-.4-1.9 1.5-4.1 3.5-4.4ZM20.6 17.5c-.6 1.3-.9 1.9-1.7 3-1 1.3-2.3 2.9-3.9 2.9-1.4 0-1.8-.9-3.7-.9-1.8 0-2.3.9-3.7.9-1.5 0-2.8-1.5-3.7-2.8C1.4 17.1.7 11.6 2.3 8.8c1.1-2 2.8-3.1 4.5-3.1 1.6 0 2.6.9 4 .9 1.4 0 2.3-.9 4.1-.9 1.5 0 3.1.8 4.2 2.2-3.7 2-3.1 7.1 1.5 9.6Z" fill="currentColor" stroke="none"/></svg><span class="brand-title">iPod</span></span>';
  spotify.after(ipod);
  const walkman = document.createElement("button");
  walkman.className = "brand-tag walkman-tag";
  walkman.dataset.skin = "walkman";
  walkman.dataset.tab = "walkman";
  walkman.setAttribute("aria-label", "Walkman appearance");
  walkman.title = "Sony · TPS-L2";
  walkman.innerHTML =
    '<span class="brand-lockup"><span class="brand-logo wm-mark" aria-hidden="true">W</span><span class="brand-title">Walkman</span></span>';
  ipod.after(walkman);
  const custom = document.createElement("button");
  custom.className = "brand-tag custom-tag";
  custom.dataset.tab = "custom";
  custom.setAttribute("aria-label", "Custom skin guide on GitHub");
  custom.title = "GitHub · Custom skins";
  custom.innerHTML =
    '<span class="brand-lockup"><svg class="brand-logo github-logo" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" stroke="none" d="M12 .7a11.5 11.5 0 0 0-3.64 22.4c.58.1.79-.25.79-.56v-2.2c-3.22.7-3.9-1.36-3.9-1.36-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.71.08-.71 1.17.08 1.78 1.2 1.78 1.2 1.04 1.77 2.72 1.26 3.38.96.1-.75.4-1.26.74-1.55-2.57-.29-5.27-1.29-5.27-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.04 0 0 .97-.31 3.16 1.18a10.96 10.96 0 0 1 5.76 0c2.2-1.49 3.16-1.18 3.16-1.18.63 1.58.23 2.75.11 3.04.74.81 1.19 1.83 1.19 3.09 0 4.4-2.71 5.38-5.29 5.67.42.36.79 1.07.79 2.16v3.2c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .7Z"/></svg><span class="brand-title">Custom</span></span>';
  walkman.after(custom);
  custom.onclick = openCustomGuide;
  for (const tag of [spotify, ipod, walkman]) {
    tag.onclick = () => changeSkin(tag.dataset.skin);
    if (tag === spotify)
      tag.onkeydown = (e) => {
        if (["Enter", " "].includes(e.key)) {
          e.preventDefault();
          tag.click();
        }
      };
  }
  const status = document.createElement("div");
  status.id = "ipod-status";
  status.innerHTML =
    '<strong id="ipod-screen-title">iPod</strong><span id="ipod-play-state" aria-hidden="true" hidden></span><span class="ipod-battery" aria-hidden="true"><i></i></span>';
  document.querySelector(".shell").prepend(status);
  const preview = document.createElement("div");
  preview.id = "ipod-menu-preview";
  preview.innerHTML =
    '<img id="ipod-menu-cover" alt=""><span id="ipod-menu-caption"></span>';
  document.getElementById("browse-view").append(preview);
  const wheel = document.createElement("div");
  wheel.id = "ipod-wheel-buttons";
  wheel.innerHTML = `<button id="ipod-menu" aria-label="Menu">MENU</button><button id="ipod-previous" aria-label="Previous track">${icon("previous")}</button><button id="ipod-next" aria-label="Next track">${icon("next")}</button><button id="ipod-toggle" aria-label="Play or pause">${icon("play")}${icon("pause")}</button>`;
  document.querySelector(".dial-window").append(wheel);
  let timer,
    held = false;
  const button = document.getElementById("ipod-menu");
  button.onpointerdown = () => {
    held = false;
    timer = setTimeout(() => {
      held = true;
      home();
    }, 650);
  };
  button.onpointerup =
    button.onpointerleave =
    button.onpointercancel =
      () => clearTimeout(timer);
  button.onclick = (e) => {
    if (!held) menu(e.isTrusted);
    held = false;
  };
  document.getElementById("ipod-previous").onclick = previous;
  document.getElementById("ipod-next").onclick = next;
  document.getElementById("ipod-toggle").onclick = toggle;
  for (const [source, label] of [
    ["like", "Like"],
    ["shuffle", "Shuffle"],
  ]) {
    const button = document.createElement("button");
    button.className = "ipod-extra";
    button.dataset.sourceControl = source;
    button.innerHTML = `${icon(source === "like" ? "heart" : "shuffle")}<span data-i18n="${label}">${label}</span>`;
    button.onclick = () => document.getElementById(source).click();
    document.getElementById("settings").append(button);
  }
  const position = document.createElement("p");
  position.id = "ipod-track-number";
  document.getElementById("song-details").append(position);
  createWalkmanChrome(icon, {
    menu,
    home,
    previous,
    next,
    toggle,
    select,
    volume,
    like,
  });
}
