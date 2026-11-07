import { createPlaybackView } from "./ui/playback-view.mjs";
import { createWindowControls } from "./ui/window-controls.mjs";
import { transitionSkin } from "./ui/animation.mjs";
import { bindRotary } from "./ui/rotary-input.mjs";
import { NavigationController } from "./core/navigation-controller.mjs";
import { renderBrowseItems } from "./ui/browse-items.mjs";
import { CoverFlow } from "./ui/cover-flow.mjs";
import { createRuntime } from "./platform/runtime.mjs";
import { PlaybackController } from "./core/playback-controller.mjs";
import { createExitController } from "./core/exit-controller.mjs";
import { skinFor, skinIds, createSkinPresenter } from "./ui/skins/index.mjs";
import { createState } from "./core/state.mjs";
import { clock } from "./core/time.mjs";
import { icon, paths } from "./ui/icons.mjs";
const $ = (id) => document.getElementById(id);
import { readPreferences, savePreferences } from "./core/preferences.mjs";
import { t, setLanguage, translateDocument } from "./ui/i18n.mjs";
const preferences = readPreferences(localStorage);
setLanguage(preferences.language);
import { VolumeControl } from "./ui/volume-control.mjs";
import { MechanicalAudio } from "./ui/mechanical-audio.mjs";
import { paletteFromRgba, cssColor } from "./ui/palette.mjs";
import {
  assignFrequencies,
  normalizeFrequency,
  signalAt,
  FM_MIN,
  FM_MAX,
} from "./core/fm-tuner.mjs";
import { ArtworkPreloader } from "./core/artwork-preloader.mjs";
import { readSkin, saveSkin, createSkinChrome } from "./ui/skins/chrome.mjs";
let activeSkin = readSkin(localStorage),
  skinSwitch = false,
  ipodSeeking = false,
  ipodSeekPosition = 0,
  ipodOptionIndex = 0;
const skin = () => skinFor(activeSkin);
const CUSTOM_SKIN_GUIDE =
  "https://github.com/magic-bunny/music-player/blob/main/docs/CUSTOM_SKINS.md";
async function openCustomGuide() {
  const nativeInvoke = window.__TAURI__?.core?.invoke;
  if (nativeInvoke) {
    await nativeInvoke("open_custom_skin_docs");
    return;
  }
  window.open(CUSTOM_SKIN_GUIDE, "_blank", "noopener,noreferrer");
}
function applySkinClasses() {
  for (const id of skinIds)
    document.body.classList.toggle(`skin-${id}`, activeSkin === id);
  document.body.dataset.skin = activeSkin;
}
window.__MUSIC_PLAYER_APP_READY__ = true;
for (const el of document.querySelectorAll("[data-icon]"))
  el.innerHTML = icon(el.dataset.icon);
createSkinChrome(icon, {
  changeSkin,
  openCustomGuide,
  menu: back,
  home: goHome,
  previous: () =>
    control(
      state.current &&
        !state.current.stream &&
        (state.snapshot?.position || 0) > 3
        ? "seek"
        : "previous",
      0,
    ),
  next: () => control("next"),
  toggle: ipodPlayPause,
  select: pressDial,
  volume: (steps) => volumeControl.step(steps),
  like: toggleLike,
});
const skinPresenter = createSkinPresenter({ $, icon, t });
for (const button of document.querySelectorAll("nav button")) {
  const label = button.querySelector("[data-i18n]")?.dataset.i18n;
  if (label) {
    button.setAttribute("data-i18n-aria-label", label);
    button.setAttribute("aria-label", t(label));
    button.setAttribute("data-i18n-title", label);
    button.title = t(label);
  }
}
const runtime = await createRuntime(localStorage);
const { invoke, preview, browserMode } = runtime;
if (runtime.checking)
  document.documentElement.dataset.disableMotion = "true";
async function windowAction(action) {
  if (!runtime.native) {
    if (action !== "drag")
      toast(t("Window controls are available in the desktop app."));
    return;
  }
  try {
    await invoke("window_action", { action });
  } catch (e) {
    toast(e);
  }
}
$("window-drag").onmousedown = (e) => {
  if (e.button === 0) {
    e.preventDefault();
    windowAction("drag");
  }
};
let clickSoundsEnabled = !preview;
try {
  if (!preview)
    clickSoundsEnabled = localStorage.getItem("yuyin-click-sounds") !== "off";
} catch {}
const mechanicalAudio = new MechanicalAudio({ enabled: clickSoundsEnabled });
$("click-sounds").setAttribute("aria-pressed", String(clickSoundsEnabled));
$("click-sounds").classList.toggle("active", clickSoundsEnabled);
$("click-sounds").onclick = () => {
  clickSoundsEnabled = !clickSoundsEnabled;
  mechanicalAudio.setEnabled(clickSoundsEnabled);
  $("click-sounds").setAttribute("aria-pressed", String(clickSoundsEnabled));
  $("click-sounds").classList.toggle("active", clickSoundsEnabled);
  try {
    localStorage.setItem(
      "yuyin-click-sounds",
      clickSoundsEnabled ? "on" : "off",
    );
  } catch {}
  if (clickSoundsEnabled) mechanicalAudio.play("button");
};
// Prime WebKit audio during real input; never emit a sound merely on startup.
document.addEventListener(
  "pointerdown",
  (e) => {
    if (e.isTrusted) void mechanicalAudio.unlock();
  },
  { capture: true },
);
document.addEventListener(
  "keydown",
  (e) => {
    if (e.isTrusted) void mechanicalAudio.unlock();
  },
  { capture: true },
);
const state = createState();
const home = [
  { id: "home:music", title: t("Music"), action: "browse" },
  { id: "home:radio", title: t("Radio"), action: "radio" },
  { id: "home:library", title: t("Liked Songs"), action: "favorites" },
];
const moreCard = {
  id: "ui:more",
  title: t("More"),
  artist: t("More playlists"),
  action: "more",
};
const loadMoreCard = {
  id: "ui:load-more",
  title: t("Load more"),
  artist: "",
  action: "load-more",
};
const radioMoreCard = {
  id: "ui:radio-more",
  title: t("More"),
  artist: t("More stations"),
  action: "radio-more",
};
const allMusic = () => [...state.localPlaylists, ...state.library];
const allRadios = () => {
  const known = new Set();
  return [...state.savedRadios, ...state.radios].filter(
    (t) => t && !known.has(t.id) && known.add(t.id),
  );
};
const followerLabel = (count) =>
  t(Number(count) === 1 ? "{count} follower" : "{count} followers", {
    count: new Intl.NumberFormat(preferences.language).format(
      Math.max(0, Number(count) || 0),
    ),
  });
function activeHomeCard() {
  if (!state.current) return null;
  if (state.current.stream) return "home:radio";
  if (state.favorites.some((track) => track.id === state.current.id))
    return "home:library";
  return "home:music";
}
function homeCards() {
  home.forEach((card) => {
    card.title = t(
      { browse: "Music", radio: "Radio", favorites: "Liked Songs" }[
        card.action
      ],
    );
  });
  const active = activeHomeCard(),
    music = allMusic()[0],
    radio = allRadios()[0];
  const cards = home.map((card) => {
    const followers =
      card.id === "home:music"
        ? (music?.followers ?? 0)
        : card.id === "home:radio"
          ? (radio?.followers ?? 0)
          : state.favorites.length;
    const homeActive = card.id === active;
    return {
      ...card,
      artist: homeActive ? t("Now Playing") : followerLabel(followers),
      homeActive,
    };
  });
  return skin().homeItems(cards, state.current, t);
}
const musicCards = () =>
  skin().catalogItems(
    [
      ...allMusic().slice(0, 10),
      ...(state.hasMore || allMusic().length > 10 ? [moreCard] : []),
    ],
    "music",
    t,
  );
const radioCards = () =>
  skin().catalogItems(
    [
      ...allRadios().slice(0, 9),
      ...(allRadios().length > 9 ? [radioMoreCard] : []),
    ],
    "radio",
    t,
  );
const songs = () =>
  ({
    home: homeCards(),
    browse: musicCards(),
    playlists: [
      ...allMusic().slice(10),
      ...(state.hasMore ? [loadMoreCard] : []),
    ],
    search: state.searchTracks,
    tracks: state.collectionTracks,
    local: state.local,
    favorites: state.favorites,
    radio: radioCards(),
    ["radio-list"]: allRadios().slice(9),
    queue: state.queue,
  })[state.view] || state.online;
const isTrackList = () => skin().layout(state.view) === "list";
const isCoverFlow = () => skin().layout(state.view) === "coverflow";
const isCarousel = () =>
  ["carousel", "coverflow"].includes(skin().layout(state.view));
const coverFlow = new CoverFlow($("cards"), {
  onSelect: (index) => rotate(index - state.selected),
  onActivate: (index) => {
    state.selected = index;
    activateSelected();
  },
  onCaption: (root) => updateOverflowTitles(root),
});
const totalTime = (tracks) => {
  const seconds = Math.round(
    tracks.reduce((n, t) => n + (Number(t.seconds) || 0), 0),
  );
  return seconds >= 3600
    ? `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
    : `${Math.floor(seconds / 60)}m`;
};
function toast(text) {
  clearTimeout(state.toastTimer);
  $("toast").textContent = t(String(text));
  $("toast").hidden = false;
  state.toastTimer = setTimeout(() => ($("toast").hidden = true), 6000);
}
function fill(el) {
  el.style.setProperty(
    "--fill",
    `${Math.min(100, (Number(el.value) / (Number(el.max) || 1)) * 100)}%`,
  );
}
function setImage(img, url) {
  if (img.dataset.url === url) return;
  img.dataset.url = url || "";
  img.classList.remove("ready");
  if (!url) {
    img.removeAttribute("src");
    if (img.id === "player-cover") applyPalette([]);
    return;
  }
  img.removeAttribute("crossorigin");
  if (browserMode && img.id === "player-cover" && url.startsWith("https:"))
    img.crossOrigin = "anonymous";
  img.onload = () => {
    img.classList.add("ready");
    if (img.id === "player-cover") tint(img);
  };
  img.onerror = () => {
    if (img.hasAttribute("crossorigin")) {
      img.removeAttribute("crossorigin");
      img.src = url;
      return;
    }
    img.classList.remove("ready");
    if (img.dataset.id === "home:music" || img.dataset.id === "home:radio") {
      state.failedArtUrls.add(url);
      img.dataset.url = "";
      queueMicrotask(artworkLoaded);
    }
  };
  img.src = url;
}
function applyPalette(pixels) {
  const colors = paletteFromRgba(pixels);
  document.body.style.setProperty("--player-color", cssColor(colors.primary));
  document.body.style.setProperty("--player-bottom", cssColor(colors.controls));
}
function tint(img) {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 36;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, 36, 36);
    applyPalette(ctx.getImageData(0, 0, 36, 36).data);
  } catch {
    applyPalette([]);
  }
}

function generatedCover(kind, title) {
  if (kind === "library")
    return (
      "data:image/svg+xml;charset=utf-8," +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><defs><linearGradient id="b" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#315de9"/><stop offset="1" stop-color="#7762dc"/></linearGradient></defs><rect width="400" height="400" fill="url(#b)"/><path d="M200 292 112 207c-55-54 19-127 88-60 69-67 143 6 88 60Z" fill="#f8f8f6"/></svg>',
      )
    );
  const palette =
    kind === "more"
      ? ["#41464d", "#1b2027"]
      : kind === "radio"
        ? ["#638b8e", "#1d4756"]
        : ["#d07943", "#773e36"];
  return (
    "data:image/svg+xml;charset=utf-8," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><defs><linearGradient id="b" x2="1" y2="1"><stop stop-color="${palette[0]}"/><stop offset="1" stop-color="${palette[1]}"/></linearGradient></defs><path fill="url(#b)" d="M0 0h400v400H0z"/><g fill="none" stroke="#ffffff20" stroke-width="36"><circle cx="350" cy="50" r="110"/><circle cx="350" cy="50" r="180"/></g><g transform="translate(45 145) scale(6)" fill="none" stroke="#fff" stroke-width="1.3" stroke-linejoin="round">${paths[kind === "more" ? "more" : kind === "radio" ? "radio" : "music"]}</g><text x="40" y="355" font-family="sans-serif" font-weight="700" font-size="40" fill="white">${title.replace(/[<>&"]/g, "")}</text></svg>`,
    )
  );
}
state.art.set("ui:more", generatedCover("more", t("More")));
state.art.set("ui:load-more", generatedCover("more", t("More")));
state.art.set("ui:radio-more", generatedCover("more", t("More")));
home.forEach((t) =>
  state.art.set(
    t.id,
    generatedCover(
      t.id.split(":")[1],
      { music: "MUSIC", radio: "RADIO", library: "LIKED" }[t.id.split(":")[1]],
    ),
  ),
);
function artworkUrl(id) {
  const sources =
    id === "home:music" ? allMusic() : id === "home:radio" ? allRadios() : null;
  if (sources) {
    for (const source of sources) {
      const url = state.art.get(source.id);
      if (url && state.realArt.has(source.id) && !state.failedArtUrls.has(url))
        return url;
    }
  }
  return state.art.get(id);
}
function artworkLoaded() {
  for (const img of document.querySelectorAll(".card-art>img, .row-art>img")) {
    const url = artworkUrl(img.dataset.id);
    if (url) setImage(img, url);
  }
  const url = state.current && state.art.get(state.current.id);
  setImage($("player-cover"), url);
  if (url) {
    $("mini-cover").src = url;
    $("mini-cover").hidden = false;
  } else {
    $("mini-cover").hidden = true;
  }
  updateIpodPreview();
}
function updateIpodPreview() {
  skinPresenter.preview(activeSkin, {
    selected: songs()[state.selected],
    current: state.current,
    artworkUrl,
    setImage,
  });
}
function updateSkinStatus() {
  skinPresenter.update(activeSkin, {
    state,
    seeking: ipodSeeking,
    collectionTitle: $("collection-title").textContent,
    position: state.radioActive
      ? $("radio-audio").currentTime
      : state.snapshot?.position || 0,
    duration: state.snapshot?.duration || state.current?.seconds || 0,
    volume: Number($("volume").value),
  });
}
async function ipodPlayPause() {
  const selected = songs()[state.selected];
  if (
    !["player", "preferences", "tuner"].includes(state.view) &&
    selected &&
    !selected.action
  ) {
    if (selected.collection) {
      try {
        const { tracks } = await fetchCollection(selected);
        if (tracks.length) await startTrack(tracks[0].id, tracks);
      } catch (error) {
        toast(error);
      }
      return;
    }
    if (selected.id !== state.current?.id) {
      await startTrack(selected.id, songs());
      return;
    }
  }
  await control("toggle");
}
function goHome() {
  navigation.home();
}
async function changeSkin(skin, { persist = true } = {}) {
  if (skinSwitch || skin === activeSkin || !skinIds.includes(skin)) return;
  skinSwitch = true;
  const previous = activeSkin;
  try {
    if (document.body.classList.contains("compact-mode")) await restoreWindow();
    await transitionSkin(async () => {
      if (runtime.native)
        await invoke("window_action", {
          action: skinFor(skin).windowAction,
        });
      if (persist) saveSkin(localStorage, skin);
      const selection = songs()[state.selected]?.id;
      activeSkin = skin;
      applySkinClasses();
      state.selected = Math.max(
        0,
        songs().findIndex((item) => item.id === selection),
      );
      state.page = Math.floor(state.selected / 3);
      view(state.view, { remember: false });
      updateSkinStatus();
    });
  } catch (error) {
    activeSkin = previous;
    applySkinClasses();
    view(state.view, { remember: false });
    updateSkinStatus();
    if (runtime.native)
      await invoke("window_action", {
        action: skinFor(previous).windowAction,
      }).catch(() => {});
    toast(error);
  } finally {
    skinSwitch = false;
  }
}
const artworkPreloader = new ArtworkPreloader({
  batchSize: 4,
  fetchBatch: (ids) => invoke("artwork", { ids }),
  onBatch: (tracks, result) => {
    for (const track of tracks) {
      const url = result[track.id];
      if (url) {
        state.art.set(track.id, url);
        state.realArt.add(track.id);
      } else {
        state.art.set(
          track.id,
          generatedCover(
            track.stream ? "radio" : "music",
            track.stream ? "RADIO" : "MUSIC",
          ),
        );
        state.realArt.delete(track.id);
      }
    }
    artworkLoaded();
  },
  onError: (_, tracks) => {
    for (const track of tracks)
      if (track.stream)
        state.art.set(
          track.id,
          generatedCover("radio", track.title.slice(0, 14)),
        );
    artworkLoaded();
  },
  onSettled: (track) => state.pendingArt.delete(track.id),
});
function loadArt(tracks, { priority = true } = {}) {
  if (!invoke) return;
  const candidates = tracks.filter(
    (t) => !t.action && !state.art.has(t.id) && !state.pendingArt.has(t.id),
  );
  if (!candidates.length) return;
  for (const track of candidates) state.pendingArt.add(track.id);
  artworkPreloader.enqueue(candidates, { priority });
}
const collectionCache = new Map();
let collectionPreloadTimer = 0;
function fetchCollection(collection) {
  if (!collection?.collection || !invoke)
    return Promise.reject(Error("Playlist unavailable"));
  if (collectionCache.has(collection.id))
    return collectionCache.get(collection.id);
  const request = invoke("collection_tracks", { id: collection.id })
    .then((result) => {
      loadArt(result.tracks.slice(0, 16), { priority: false });
      return result;
    })
    .catch((error) => {
      collectionCache.delete(collection.id);
      throw error;
    });
  collectionCache.set(collection.id, request);
  return request;
}
function preloadCollection(collection, delay = 260) {
  clearTimeout(collectionPreloadTimer);
  if (!collection?.collection || !invoke) return;
  collectionPreloadTimer = setTimeout(() => {
    void fetchCollection(collection).catch(() => {});
  }, delay);
}
function nowPlayingIndicator() {
  const indicator = document.createElement("span");
  indicator.className = "now-playing-indicator";
  indicator.setAttribute("role", "img");
  indicator.setAttribute("aria-label", t(state.playbackStatus || "Paused"));
  for (let i = 0; i < 4; i++) {
    const bar = document.createElement("i");
    bar.setAttribute("aria-hidden", "true");
    indicator.append(bar);
  }
  return indicator;
}
let overflowTitleFrame = 0;
function updateOverflowTitles(root = document) {
  cancelAnimationFrame(overflowTitleFrame);
  overflowTitleFrame = requestAnimationFrame(() => {
    for (const label of root.querySelectorAll(".track-title")) {
      const text = label.querySelector(".track-title-text");
      if (!text) continue;
      label.classList.remove("is-overflowing");
      label.style.removeProperty("--title-shift");
      label.style.removeProperty("--title-duration");
      const overflow = Math.ceil(text.scrollWidth - label.clientWidth);
      if (overflow <= 2) continue;
      label.classList.add("is-overflowing");
      label.style.setProperty("--title-shift", `-${overflow}px`);
      label.style.setProperty(
        "--title-duration",
        `${Math.min(12, Math.max(4.5, 3.6 + overflow / 30)).toFixed(2)}s`,
      );
    }
  });
}
let sourceList = [{ id: "netease", name: "NetEase Music" }],
  settingsSelection = 0,
  sourceLoading = false,
  sourceError = false,
  sourceRequest = 0;
const preferenceButtons = () =>
  [
    ...document.querySelectorAll("#preferences-view button:not([hidden])"),
  ].filter((button) => !button.closest("[hidden]"));
function highlightPreference() {
  const buttons = preferenceButtons();
  settingsSelection = Math.min(settingsSelection, buttons.length - 1);
  buttons.forEach((button, index) =>
    button.classList.toggle("dial-selected", index === settingsSelection),
  );
  if (state.view === "preferences")
    buttons[settingsSelection]?.scrollIntoView({ block: "nearest" });
}
function renderPreferences() {
  const options = $("source-options");
  if (options.children.length !== sourceList.length) {
    options.replaceChildren(
      ...sourceList.map((source) => {
        const button = document.createElement("button");
        button.dataset.source = source.id;
        button.onclick = () => changeSource(source.id);
        return button;
      }),
    );
  }
  for (const button of document.querySelectorAll("[data-language]")) {
    const active = button.dataset.language === preferences.language;
    button.classList.toggle("chosen", active);
    button.setAttribute("aria-pressed", String(active));
  }
  for (const button of options.children) {
    button.textContent = t(
      sourceList.find((p) => p.id === button.dataset.source).name,
    );
    const active = button.dataset.source === preferences.source;
    button.classList.toggle("chosen", active);
    button.setAttribute("aria-pressed", String(active));
  }
  $("source-status").textContent = sourceLoading
    ? t("Loading…")
    : sourceError
      ? t("Unable to load this music source. Try again.")
      : "";
  $("source-retry").hidden = !sourceError;
  preferenceButtons().forEach(
    (button, index) =>
      (button.onfocus = () => {
        settingsSelection = index;
        highlightPreference();
      }),
  );
  highlightPreference();
  updateSkinStatus();
}
function persistPreferences() {
  try {
    savePreferences(localStorage, preferences);
    return true;
  } catch {
    toast(t("Unable to save settings."));
    return false;
  }
}
function changeLanguage(language, { persist = true } = {}) {
  if (!["zh", "en", "ja"].includes(language)) return;
  const old = preferences.language;
  preferences.language = language;
  if (persist && !persistPreferences()) {
    preferences.language = old;
    return;
  }
  setLanguage(language);
  translateDocument();
  for (const id of ["ui:more", "ui:load-more", "ui:radio-more"])
    state.art.set(id, generatedCover("more", t("More")));
  renderPreferences();
  renderCurrent();
  if (state.view === "tuner") renderTuner();
  else if (!["player", "preferences"].includes(state.view)) renderBrowse();
  if (state.snapshot) applySnapshot(state.snapshot);
  $("volume-hud-title").textContent = t(
    Number($("volume").value) === 0 ? "Muted" : "Volume",
  );
}
async function loadSource() {
  if (!invoke) return;
  const request = ++sourceRequest,
    searchId = state.searchId,
    source = preferences.source;
  sourceLoading = true;
  sourceError = false;
  renderPreferences();
  try {
    const items = await invoke("collections", { query: "", offset: 0, source });
    if (
      request !== sourceRequest ||
      source !== preferences.source ||
      searchId !== state.searchId
    )
      return;
    state.library = items.map((item) => ({ ...item, collection: true }));
    state.hasMore = items.length === 10;
    state.nextOffset = items.length;
    loadArt(state.library, { priority: false });
    preloadCollection(state.library[0], 700);
    if (["home", "browse"].includes(state.view)) renderBrowse();
  } catch (error) {
    if (request === sourceRequest && searchId === state.searchId) {
      sourceError = true;
      state.hasMore = false;
    }
  } finally {
    if (request === sourceRequest) {
      sourceLoading = false;
      renderPreferences();
      if (["home", "browse"].includes(state.view)) renderBrowse();
    }
  }
}
async function changeSource(source, { persist = true } = {}) {
  if (!sourceList.some((p) => p.id === source) || preferences.source === source)
    return;
  const previous = preferences.source;
  preferences.source = source;
  if (persist && !persistPreferences()) {
    preferences.source = previous;
    return;
  }
  ++state.searchId;
  ++state.openId;
  state.searching = false;
  state.moreLoading = false;
  state.library = [];
  state.online = [];
  state.searchTracks = [];
  state.collection = null;
  state.collectionTracks = [];
  state.history = [];
  state.page = 0;
  state.selected = 0;
  state.query = "";
  state.nextOffset = 0;
  state.hasMore = false;
  renderPreferences();
  await loadSource();
}
for (const button of document.querySelectorAll("[data-language]"))
  button.onclick = () => changeLanguage(button.dataset.language);
$("source-retry").onclick = () => loadSource();
if (runtime.capabilities.proxyConfiguration) {
  $("browser-source-config").hidden = false;
  $("proxy-url").value = localStorage.getItem("yuyin-netease-proxy-v1") || "";
  $("browser-source-config").onsubmit = async (e) => {
    e.preventDefault();
    try {
      await invoke("configure_proxy", { url: $("proxy-url").value });
      sourceList = await invoke("music_sources");
      $("source-options").replaceChildren();
      if (!sourceList.some((p) => p.id === preferences.source)) {
        preferences.source = "audius";
        persistPreferences();
        collectionCache.clear();
        await loadSource();
      } else if (preferences.source === "netease") {
        collectionCache.clear();
        await loadSource();
      }
      renderPreferences();
      toast(t("Saved"));
    } catch (error) {
      toast(error);
    }
  };
}

function renderBrowse() {
  if (["player", "tuner", "preferences"].includes(state.view)) return;
  moreCard.title = t("More");
  moreCard.artist = t("More playlists");
  loadMoreCard.title = t("Load more");
  loadMoreCard.artist = t(
    sourceList.find((p) => p.id === preferences.source)?.name ||
      "NetEase Music",
  );
  radioMoreCard.title = t("More");
  radioMoreCard.artist = t("More stations");
  const previousScroll = $("track-list").scrollTop,
    previousHorizontal = $("cards").scrollLeft;
  const tracks = songs(),
    list = isTrackList(),
    pages = Math.max(1, Math.ceil(tracks.length / 3));
  state.page = Math.min(state.page, pages - 1);
  state.selected = Math.max(0, Math.min(state.selected, tracks.length - 1));
  $("collection-title").textContent =
    {
      home: "",
      browse: state.query
        ? t("Playlists · {query}", { query: state.query })
        : t("Music"),
      playlists: t("More playlists"),
      tracks: state.collection?.title || t("Tracks"),
      search: t("Search · {query}", { query: state.query }),
      local: t("Local music"),
      favorites: t("Liked Songs"),
      radio: t("Radio"),
      ["radio-list"]: t("More stations"),
      queue: t("Play queue"),
    }[state.view] ?? t("Music");
  $("count").textContent =
    state.view === "home"
      ? ""
      : state.searching
        ? t("Loading…")
        : state.view === "playlists"
          ? t("{count} playlists", { count: allMusic().slice(10).length })
          : state.view === "browse"
            ? t("{count} playlists", { count: Math.min(10, allMusic().length) })
            : state.view === "radio"
              ? t("{count} stations", {
                  count: Math.min(9, allRadios().length),
                })
              : state.view === "radio-list"
                ? t("{count} stations", { count: tracks.length })
                : list
                  ? t("{count} songs", {
                      count: `${tracks.length}${state.view === "tracks" && state.collection?.track_count > tracks.length ? " / " + state.collection.track_count : ""}`,
                    }) +
                    " · " +
                    totalTime(tracks)
                  : t("{count} playlists", { count: tracks.length });
  $("cards").hidden = list || !tracks.length;
  $("track-list").hidden = !list || !tracks.length;
  document.querySelector(".pager").hidden = list || isCarousel() || pages <= 1;
  const container = list ? $("track-list") : $("cards");
  const visible = renderBrowseItems(
    {
      container,
      items: tracks,
      list,
      carousel: isCarousel(),
      page: state.page,
      selected: state.selected,
      currentId: state.current?.id,
    },
    {
      icon,
      t,
      indicator: nowPlayingIndicator,
      select: (index) => {
        if (isCoverFlow()) {
          coverFlow.click(index);
          return;
        }
        state.selected = index;
        activateSelected();
      },
      focus: (index, item, button) => {
        if (isCoverFlow() && !button.matches(":focus-visible")) return;
        state.selected = index;
        highlight();
        preloadCollection(item);
      },
      hover: (item) => preloadCollection(item, 180),
    },
  );
  if (isCoverFlow()) coverFlow.mount(visible, state.selected);
  else coverFlow.disable();
  $("empty").hidden = tracks.length > 0;
  $("empty-text").textContent =
    state.searching || (state.view === "browse" && sourceLoading)
      ? t("Loading…")
      : state.view === "favorites"
        ? t("No favorites yet")
        : state.view === "local"
          ? t("Add local music")
          : state.view === "radio" || state.view === "radio-list"
            ? t("No supported HTTPS stations found")
            : state.view === "browse" || state.view === "playlists"
              ? t("No playlists found")
              : t("No full-length tracks available");
  if (state.view === "browse" && sourceError)
    $("empty-text").textContent = t(
      "Unable to load this music source. Try again.",
    );
  $("empty-action").textContent =
    state.view === "browse" && sourceError
      ? t("Retry")
      : state.view === "local"
        ? t("Add music")
        : t("Search");
  $("empty-action").hidden =
    state.searching ||
    (state.view === "browse" && sourceLoading) ||
    state.view === "favorites";
  $("page-count").textContent = `${state.page + 1} / ${pages}`;
  $("page-prev").disabled = state.page === 0;
  $("page-next").disabled = state.page + 1 >= pages;
  if (list) $("track-list").scrollTop = previousScroll;
  if (isCarousel()) $("cards").scrollLeft = previousHorizontal;
  updateOverflowTitles(container);
  artworkLoaded();
  updateSkinStatus();
  if (invoke)
    loadArt(
      state.view === "home"
        ? [...allMusic().slice(0, 10), ...allRadios().slice(0, 9)]
        : visible.slice(0, 40),
      { priority: true },
    );
}
$("track-list").onscroll = () => {
  if (!invoke || !isTrackList()) return;
  const box = $("track-list").getBoundingClientRect();
  const visible = [...document.querySelectorAll(".track-row")]
    .filter((row) => {
      const r = row.getBoundingClientRect();
      return (
        r.bottom > box.top &&
        r.top < box.bottom &&
        r.right > box.left &&
        r.left < box.right
      );
    })
    .map((row) => songs()[Number(row.dataset.index)])
    .filter(Boolean);
  loadArt(visible);
};
function highlight(scroll = false) {
  for (const b of document.querySelectorAll(".track-card,.track-row"))
    b.classList.toggle("selected", Number(b.dataset.index) === state.selected);
  if (isCoverFlow()) coverFlow.select(state.selected);
  if (scroll && !isCoverFlow()) {
    const selected = isTrackList()
      ? $("track-list").children[state.selected]
      : isCarousel()
        ? $("cards").children[state.selected]
        : null;
    selected?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: "auto",
    });
  }
  if (browserMode && state.view === "home")
    $("cards").children[state.selected]?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: "auto",
    });
  preloadCollection(songs()[state.selected]);
  updateIpodPreview();
}
function saveLocation() {
  return {
    view: state.view,
    page: state.page,
    selected: state.selected,
    collection: state.collection,
    collectionTracks: state.collectionTracks,
    horizontal: $("cards").scrollLeft,
    scroll: $("track-list").scrollTop,
  };
}
function view(name, { remember = true } = {}) {
  if (name === "preferences" && state.view !== "preferences")
    settingsSelection = Math.max(
      0,
      preferenceButtons().findIndex(
        (button) => button.dataset.language === preferences.language,
      ),
    );
  if (remember) navigation.remember(saveLocation(), name);
  if (name === "player" && state.view !== "player") state.lastView = state.view;
  state.view = name;
  skinPresenter.enter(activeSkin);
  ipodSeeking = false;
  document.body.classList.remove("ipod-seeking");
  document.body.classList.toggle("ipod-home", name === "home");
  if (name !== "player") volumeControl.hide();
  $("dial").setAttribute(
    "aria-label",
    name === "player"
      ? t("Volume dial")
      : name === "tuner"
        ? t("FM tuning dial")
        : t("Selection dial"),
  );
  $("dial").title =
    name === "player"
      ? t("Rotate to adjust volume; press to play or pause.")
      : name === "tuner"
        ? t("Rotate to tune; press to save the station.")
        : name === "preferences"
          ? t("Rotate to select; press to apply.")
          : t("Rotate to select; press to open or play.");
  document.body.classList.toggle("player-mode", name === "player");
  document.body.classList.toggle("tuner-mode", name === "tuner");
  document.body.classList.toggle("list-mode", isTrackList());
  document.body.classList.toggle("carousel-mode", isCarousel());
  document.body.classList.toggle("coverflow-mode", isCoverFlow());
  if (!isCoverFlow()) coverFlow.disable();
  $("preferences-view").hidden = name !== "preferences";
  $("browse-view").hidden = ["player", "tuner", "preferences"].includes(name);
  $("player-view").hidden = name !== "player";
  $("tuner-view").hidden = name !== "tuner";
  const canAdd = name === "browse" || name === "radio";
  $("add").hidden = !canAdd;
  $("add").setAttribute(
    "aria-label",
    name === "radio" ? t("Add FM station") : t("Add local playlist"),
  );
  $("add").title =
    name === "radio" ? t("Tune a station") : t("Add a playlist folder");
  document
    .querySelectorAll("nav button[data-view]")
    .forEach((b) => b.classList.toggle("active", b.dataset.view === name));
  $("search-form").hidden = true;
  $("settings").hidden = true;
  if (name === "player") renderCurrent();
  else if (name === "tuner") renderTuner();
  else if (name === "preferences") renderPreferences();
  else renderBrowse();
  updateSkinStatus();
}
async function openCollection(collection) {
  const request = ++state.openId;
  view("tracks");
  state.collection = collection;
  state.collectionTracks = [];
  state.selected = 0;
  state.searching = true;
  renderBrowse();
  try {
    const result = await fetchCollection(collection);
    const tracks = result.tracks;
    if (request !== state.openId || state.collection?.id !== collection.id)
      return;
    state.collection = { ...collection, cached: result.cached };
    state.collectionTracks = tracks;
    state.online = tracks;
    loadArt(tracks.slice(0, 24), { priority: true });
    // Playlist covers belong to the playlist; track rows retain their own album artwork.
  } catch (e) {
    if (request === state.openId) toast(e);
  } finally {
    if (request === state.openId) {
      state.searching = false;
      if (state.view === "tracks") {
        renderBrowse();
        $("track-list").scrollTop = 0;
      }
    }
  }
}
const playbackView = createPlaybackView({
  state,
  icon,
  t,
  clock,
  fill,
  artworkLoaded,
  updateSkinStatus,
});
const { renderCurrent, updateLike, transport } = playbackView;
async function toggleLike() {
  if (!state.current) return;
  try {
    state.favorites = await invoke("toggle_favorite", { id: state.current.id });
    updateLike();
  } catch (e) {
    toast(e);
  }
}
async function loadFavorites() {
  try {
    state.favorites = await invoke("favorites");
    updateLike();
    if (state.view === "home") renderBrowse();
  } catch (e) {
    toast(e);
  }
}
function prepareRadios(tracks) {
  return assignFrequencies(tracks);
}
function saveRadios() {
  try {
    localStorage.setItem(
      "yuyin-fm-stations",
      JSON.stringify(state.savedRadios),
    );
  } catch {}
}
function renderTuner() {
  state.tunerStations = assignFrequencies(allRadios());
  state.tunerSignal = signalAt(state.tunerFrequency, state.tunerStations);
  const signal = state.tunerSignal;
  $("tuner-frequency").textContent = signal.frequency.toFixed(1);
  $("tuner-needle").style.left =
    `${((signal.frequency - FM_MIN) / (FM_MAX - FM_MIN)) * 100}%`;
  const level = Math.round(signal.strength * 100);
  $("tuner-signal").setAttribute("aria-valuenow", String(level));
  [...$("tuner-signal").children].forEach((bar, index) =>
    bar.classList.toggle("active", level > index * 20),
  );
  $("tuner-station").textContent = signal.station?.title || t("Scanning");
  $("tuner-country").textContent = signal.station?.artist || t("No signal");
}
function openTuner() {
  if (!allRadios().length) {
    toast(t("Load the radio directory first."));
    return;
  }
  state.tunerStations = assignFrequencies(allRadios());
  view("tuner");
}
function confirmTuner() {
  const signal = signalAt(state.tunerFrequency, state.tunerStations);
  if (!signal.station) {
    toast(
      t("No station signal at {frequency} MHz.", {
        frequency: signal.frequency.toFixed(1),
      }),
    );
    return;
  }
  const station = { ...signal.station, frequency: signal.frequency };
  state.savedRadios = [
    station,
    ...state.savedRadios.filter((item) => item.id !== station.id),
  ];
  saveRadios();
  state.selected = 0;
  state.history.pop();
  view("radio", { remember: false });
  toast(
    t("{title} saved at {frequency} MHz", {
      title: station.title,
      frequency: signal.frequency.toFixed(1),
    }),
  );
}
async function search(
  query,
  radio = state.view === "radio" || state.view === "radio-list",
) {
  if (!invoke) {
    toast(t("Please open the desktop app."));
    return;
  }
  query = query.trim();
  const trackSearch = !radio && $("search-kind").value === "tracks";
  if (trackSearch && !query) return;
  const id = ++state.searchId;
  ++sourceRequest;
  sourceLoading = false;
  sourceError = false;
  state.searching = true;
  state.page = 0;
  state.selected = 0;
  const destination = radio ? "radio" : trackSearch ? "search" : "browse";
  if (radio) {
    state.radioQuery = query || "SomaFM";
    state.radios = [];
  } else {
    state.query = query;
    if (trackSearch) state.searchTracks = [];
    else state.library = [];
  }
  view(destination);
  try {
    const tracks = await invoke(
      radio ? "radio_search" : trackSearch ? "search" : "collections",
      { query, offset: 0, source: preferences.source },
    );
    if (id !== state.searchId) return;
    if (radio) {
      state.radios = prepareRadios(tracks);
    } else if (trackSearch) {
      state.searchTracks = tracks;
    } else {
      state.library = tracks.map((t) => ({ ...t, collection: true }));
      state.hasMore = tracks.length === 10;
      state.nextOffset = tracks.length;
      loadArt(state.library, { priority: false });
      preloadCollection(state.library[0], 700);
    }
  } catch (e) {
    if (id === state.searchId) toast(e);
  } finally {
    if (id === state.searchId) {
      state.searching = false;
      if (state.view === destination) renderBrowse();
    }
  }
}
async function loadMorePlaylists() {
  if (state.moreLoading || !state.hasMore) return;
  state.moreLoading = true;
  const query = state.query,
    offset = state.nextOffset,
    searchId = state.searchId;
  try {
    const items = await invoke("collections", {
      query,
      offset,
      source: preferences.source,
    });
    if (searchId !== state.searchId) return;
    const known = new Set(state.library.map((t) => t.id));
    state.library.push(
      ...items
        .filter((t) => !known.has(t.id))
        .map((t) => ({ ...t, collection: true })),
    );
    loadArt(
      items.map((t) => ({ ...t, collection: true })),
      { priority: false },
    );
    state.nextOffset = offset + items.length;
    state.hasMore = items.length === 30;
    if (state.view === "playlists") renderBrowse();
  } catch (e) {
    if (searchId === state.searchId) toast(e);
  } finally {
    if (searchId === state.searchId) state.moreLoading = false;
  }
}
$("cards").addEventListener(
  "wheel",
  (e) => {
    if (!isCarousel() || isCoverFlow()) return;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.preventDefault();
      $("cards").scrollLeft += e.deltaY;
    }
  },
  { passive: false },
);
window.addEventListener("resize", () => updateOverflowTitles());
const audio = $("radio-audio");
const volumeControl = new VolumeControl({
  value: Number($("volume").value),
  onChange(value) {
    $("volume").value = String(value);
    fill($("volume"));
    audio.volume = value;
    skinPresenter.volume(activeSkin, value);
    const percent = Math.round(value * 100);
    $("volume-hud-value").textContent = `${percent}%`;
    $("volume-hud-title").textContent =
      percent === 0 ? t("Muted") : t("Volume");
    $("volume-hud-icon").innerHTML = icon(percent === 0 ? "muted" : "volume");
    $("volume-hud-fill").style.width = `${percent}%`;
    $("volume-hud-bar").setAttribute("aria-valuenow", String(percent));
  },
  onApply(value) {
    return invoke
      ? invoke("control", { action: "volume", value })
      : Promise.resolve();
  },
  onVisibility(visible) {
    $("volume-hud").hidden = !visible;
  },
  onError: toast,
});

const playback = new PlaybackController({
  invoke,
  state,
  radio: audio,
  getVolume: () => Number($("volume").value),
  onError: toast,
  onIdle: () => view("home"),
  onSelected: (track) => {
    view("player");
    if (!track.stream) $("play").disabled = true;
    loadArt([track]);
  },
});
function stopRadio() {
  playback.stopRadio();
}
async function startTrack(id, queue) {
  $("settings").hidden = true;
  state.lyrics = false;
  $("lyrics").classList.remove("active");
  $("lyrics").setAttribute("aria-pressed", "false");
  $("lyric-panel").hidden = true;
  $("song-details").hidden = false;
  return playback.start(id, queue);
}
async function control(action, value) {
  if (action === "volume") return volumeControl.set(value);
  return playback.control(action, value);
}

function applySnapshot(s) {
  const changed = playback.acceptSnapshot(s);
  if (state.radioActive) {
    transport(
      !audio.paused,
      audio.readyState < 2 && !audio.paused && !state.radioError,
    );
    return;
  }
  if (changed) {
    renderCurrent();
    loadArt([s.track]);
    if (state.view !== "player") renderBrowse();
  }
  transport(!!s.track && !s.paused && !s.loading, s.loading);
  playbackView.renderSnapshot(s);
  if (s.error && state.lastError !== s.error) toast(s.error);
  state.lastError = s.error;
}
let pollTimer;
const exitController = createExitController({
  stopPlayback: async () => {
    clearTimeout(pollTimer);
    playback.stopRadio();
    await invoke("control", { action: "stop", value: null });
    mechanicalAudio.setEnabled(false);
    if (mechanicalAudio.context && mechanicalAudio.context.state !== "closed")
      await mechanicalAudio.context.close();
  },
  exitPlatform: () => runtime.exit(),
  onError: (error) => {
    mechanicalAudio.setEnabled(clickSoundsEnabled);
    $("mini-close").disabled = false;
    toast(error);
    schedulePoll();
  },
});
function schedulePoll() {
  clearTimeout(pollTimer);
  if (!exitController.stopped) pollTimer = setTimeout(poll, 250);
}
async function poll() {
  if (exitController.stopped) return;
  try {
    const result = await invoke("snapshot");
    if (!exitController.stopped) applySnapshot(result);
  } catch (e) {
    if (!state.lastError) toast(e);
    state.lastError = String(e);
  } finally {
    schedulePoll();
  }
}
function toggleSearch() {
  if (state.view === "preferences") view("browse");
  if (state.view === "player")
    view(state.lastView === "radio" ? "radio" : "browse");
  const open = $("search-form").hidden;
  $("search-form").hidden = !open;
  $("search-kind").hidden = state.view === "radio";
  $("query").placeholder =
    state.view === "radio"
      ? t("Station name")
      : $("search-kind").value === "tracks"
        ? t("Song or artist")
        : t("Playlist name");
  if (open) {
    $("query").value = state.view === "radio" ? state.radioQuery : state.query;
    $("query").focus();
    $("query").select();
  }
}
async function importPlaylist() {
  try {
    const added = await invoke("import_playlist");
    if (!added) return;
    const item = { ...added, collection: true };
    state.localPlaylists = [
      item,
      ...state.localPlaylists.filter((entry) => entry.id !== item.id),
    ];
    state.page = 0;
    state.selected = 0;
    view("browse", { remember: false });
    renderBrowse();
  } catch (e) {
    toast(e);
  }
}
const navigation = new NavigationController(state, {
  items: songs,
  view,
  collection: openCollection,
  play: startTrack,
  search: toggleSearch,
  importPlaylist,
  tune: openTuner,
  more: loadMorePlaylists,
  render: renderBrowse,
  musicCount: () => allMusic().length,
  searchRadio: () => search("", true),
  searchMusic: () => {
    $("search-kind").value = "playlists";
    return search("", false);
  },
});
async function activateSelected() {
  if (state.view === "preferences") {
    preferenceButtons()[settingsSelection]?.click();
    return;
  }
  return navigation.activate();
}
function rotate(steps, feedback = false) {
  // Wheel, pointer-drag and keyboard input all terminate in this function.
  if (!steps) return;
  if (feedback) mechanicalAudio.play("tick", Math.abs(steps));
  state.dialAngle += steps * 15;
  document.body.style.setProperty("--dial-angle", `${state.dialAngle}deg`);
  const rotation = skin().rotationAction({
    view: state.view,
    optionsOpen: !$("settings").hidden,
    seeking: ipodSeeking,
    live: Boolean(state.current?.stream),
  });
  if (rotation === "select") skinPresenter.rotate(activeSkin, state.view);
  if (rotation === "option") {
    const buttons = ipodOptions();
    ipodOptionIndex = Math.max(
      0,
      Math.min(buttons.length - 1, ipodOptionIndex + steps),
    );
    highlightIpodOptions();
    return;
  }
  if (rotation === "preferences") {
    const buttons = preferenceButtons();
    settingsSelection = Math.max(
      0,
      Math.min(buttons.length - 1, settingsSelection + steps),
    );
    highlightPreference();
    return;
  }
  if (rotation === "seek") {
    ipodSeekPosition = Math.max(
      0,
      Math.min(state.snapshot?.duration || 0, ipodSeekPosition + steps * 5),
    );
    void control("seek", ipodSeekPosition);
    return;
  }
  if (rotation === "volume") {
    void volumeControl.step(steps);
    return;
  }
  if (rotation === "tune") {
    state.tunerFrequency = normalizeFrequency(
      state.tunerFrequency + steps * 0.1,
    );
    renderTuner();
    return;
  }
  const items = songs();
  state.selected = Math.max(
    0,
    Math.min(items.length - 1, state.selected + steps),
  );
  if (isTrackList() || isCarousel()) {
    highlight(true);
    return;
  }
  const nextPage = Math.floor(state.selected / 3);
  if (nextPage === state.page) highlight();
  else {
    state.page = nextPage;
    renderBrowse();
  }
}
const windowControls = createWindowControls({
  invoke,
  browserMode,
  onError: toast,
  onRestore: () => {
    view(state.view, { remember: false });
    updateSkinStatus();
  },
});
const { compactWindow, restoreWindow } = windowControls;
function back(feedback = false) {
  if (feedback) mechanicalAudio.play("button");
  if (skin().seeking && ipodSeeking) {
    ipodSeeking = false;
    document.body.classList.remove("ipod-seeking");
    updateSkinStatus();
    return;
  }
  if (!$("settings").hidden) {
    $("settings").hidden = true;
    return;
  }
  if (!$("search-form").hidden) {
    $("search-form").hidden = true;
    return;
  }
  if (state.lyrics) {
    $("lyrics").click();
    return;
  }
  if (state.view === "home") {
    void compactWindow();
    return;
  }
  const previous = navigation.previous();
  view(previous.view, { remember: false });
  if (isTrackList()) $("track-list").scrollTop = previous.scroll;
  if (isCarousel()) $("cards").scrollLeft = previous.horizontal;
}

const ipodOptions = () =>
  [...document.querySelectorAll("#settings>button:not(:disabled)")].filter(
    (button) => button.offsetParent !== null,
  );
function highlightIpodOptions() {
  ipodOptions().forEach((button, index) =>
    button.classList.toggle("ipod-option-selected", index === ipodOptionIndex),
  );
  ipodOptions()[ipodOptionIndex]?.scrollIntoView({ block: "nearest" });
}
function pressDial() {
  switch (
    skin().centerAction({
      view: state.view,
      optionsOpen: !$("settings").hidden,
      live: Boolean(state.current?.stream),
    })
  ) {
    case "option":
      ipodOptions()[ipodOptionIndex]?.click();
      break;
    case "options":
      $("more").click();
      break;
    case "seek":
      ipodSeeking = !ipodSeeking;
      ipodSeekPosition = state.snapshot?.position || 0;
      document.body.classList.toggle("ipod-seeking", ipodSeeking);
      volumeControl.hide();
      updateSkinStatus();
      break;
    case "toggle":
      void control("toggle");
      break;
    case "tune":
      confirmTuner();
      break;
    default:
      void activateSelected();
  }
}

const dial = $("dial");
const { handleDialWheel } = bindRotary(dial, {
  onRotate: rotate,
  onPress: pressDial,
  onHold: () => $("more").click(),
  canHold: () => skin().holdForOptions && state.view === "player",
});
for (const button of document.querySelectorAll("[data-view]"))
  button.onclick = () => {
    state.openId++;
    state.searching = false;
    if (button.dataset.view === "home") state.history = [];
    state.page = 0;
    state.selected = 0;
    view(button.dataset.view, { remember: button.dataset.view !== "home" });
  };
$("back").onclick = (e) => back(e.isTrusted);
$("search-toggle").onclick = toggleSearch;
$("search-close").onclick = toggleSearch;
$("search-form").onsubmit = (e) => {
  e.preventDefault();
  search($("query").value);
};
$("search-kind").onchange = () => {
  $("query").placeholder =
    $("search-kind").value === "tracks"
      ? t("Song or artist")
      : t("Playlist name");
};
$("add").onclick = () =>
  state.view === "radio" ? openTuner() : importPlaylist();
$("empty-action").onclick = () =>
  state.view === "browse" && sourceError
    ? loadSource()
    : state.view === "local"
      ? importPlaylist()
      : toggleSearch();
$("page-prev").onclick = () => rotate(-3);
$("page-next").onclick = () => rotate(3);
$("previous").onclick = () => control("previous");
$("next").onclick = () => control("next");
$("mini-next").onclick = () => control("next");
$("mini-close").onclick = async () => {
  await windowControls.whenIdle();
  if (!document.body.classList.contains("compact-mode")) return;
  $("mini-close").disabled = true;
  void exitController.close();
};
$("reopen-player").onclick = () => location.reload();
$("play").onclick = () => control("toggle");
$("mini-play").onclick = () => control("toggle");
$("repeat").onclick = () => control("repeat");
$("shuffle").onclick = () => control("shuffle");
$("like").onclick = toggleLike;
$("mini-track").onclick = async () => {
  await windowControls.whenIdle();
  if (document.body.classList.contains("compact-mode")) await restoreWindow();
  if (!document.body.classList.contains("compact-mode") && state.current)
    view("player");
};
$("more").onclick = () => {
  $("settings").hidden = !$("settings").hidden;
  if (skin().holdForOptions && !$("settings").hidden) {
    ipodOptionIndex = 0;
    highlightIpodOptions();
  }
};
$("lyrics").onclick = () => {
  state.lyrics = !state.lyrics;
  $("lyric-panel").hidden = !state.lyrics;
  $("song-details").hidden = state.lyrics;
  $("lyrics").classList.toggle("active", state.lyrics);
  $("lyrics").setAttribute("aria-pressed", String(state.lyrics));
  $("settings").hidden = true;
};
$("seek").onpointerdown = () => (state.dragging = true);
$("seek").oninput = () => {
  state.dragging = true;
  fill($("seek"));
  $("elapsed").textContent = clock(Number($("seek").value));
};
$("seek").onchange = () => {
  control("seek", Number($("seek").value));
  state.dragging = false;
};
$("seek").onpointerup = () => setTimeout(() => (state.dragging = false), 0);
$("seek").onpointercancel = $("seek").onblur = () => (state.dragging = false);
$("volume").oninput = () => {
  void volumeControl.set(Number($("volume").value));
};
audio.addEventListener("error", () => {
  if (state.radioActive && audio.currentSrc) {
    state.radioError = t("This station stream is unavailable.");
    toast(state.radioError);
    transport(false, false);
  }
});
audio.addEventListener("playing", () => {
  state.radioError = null;
  transport(true, false);
});
document.addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLInputElement) {
    if (e.key === "Escape") back(e.isTrusted);
    return;
  }
  if (
    e.key === " " &&
    e.target !== dial &&
    !e.target.closest("#preferences-view")
  ) {
    e.preventDefault();
    control("toggle");
  }
  if (e.key === "/") {
    e.preventDefault();
    toggleSearch();
  }
  if (e.key === "Escape") back(e.isTrusted);
  if (e.target !== dial && e.key === "ArrowRight") rotate(1, e.isTrusted);
  if (e.target !== dial && e.key === "ArrowLeft") rotate(-1, e.isTrusted);
});
try {
  state.savedRadios = prepareRadios(
    JSON.parse(localStorage.getItem("yuyin-fm-stations") || "[]").filter(
      (item) => item?.id && item?.stream,
    ),
  );
} catch {
  state.savedRadios = [];
}
if (runtime.checking) {
  preferences.language = "en";
  preferences.source = "netease";
  activeSkin = "carthing";
  setLanguage("en");
}
applySkinClasses();
if (runtime.native)
  await invoke("window_action", { action: skin().windowAction });
if (invoke) {
  try {
    sourceList = await invoke("music_sources");
  } catch {
    sourceList = [{ id: "netease", name: "NetEase Music" }];
  }
  if (!sourceList.some((p) => p.id === preferences.source))
    preferences.source = sourceList[0]?.id || "netease";
}
translateDocument();
renderPreferences();
fill($("volume"));
view("home");
if (invoke) {
  loadFavorites();
  poll();
  invoke("local_playlists")
    .then((items) => {
      state.localPlaylists = items.map((t) => ({ ...t, collection: true }));
      loadArt(state.localPlaylists, { priority: false });
      if (state.view === "home" || state.view === "browse") renderBrowse();
    })
    .catch(toast);
  if (!runtime.hardwareChecking) {
    void loadSource();
    invoke("radio_search", { query: state.radioQuery, offset: 0 })
      .then((items) => {
        if (state.radioQuery !== "SomaFM" || state.radios.length) return;
        state.radios = prepareRadios(items);
        loadArt(state.radios.slice(0, 9), { priority: false });
        if (state.view === "home") renderBrowse();
      })
      .catch(() => {});
  }
} else toast(t("Please open the desktop app."));

if (runtime.checking) {
  const { runNativeChecks } = await import("./testing/native-check.mjs");
  await runNativeChecks({
    state,
    invoke,
    mechanicalAudio,
    control,
    fill,
    $,
    view,
    rotate,
    activateSelected,
    handleDialWheel,
    back,
    startTrack,
    toggleLike,
    prepareRadios,
    openTuner,
    normalizeFrequency,
    search,
    audio,
    stopRadio,
    changeLanguage,
    preferenceButtons,
    sourceList,
    changeSource,
    openCollection,
    changeSkin,
    windowControls,
    pressDial,
    goHome,
    isTrackList,
    get settingsSelection() {
      return settingsSelection;
    },
    set settingsSelection(value) {
      settingsSelection = value;
    },
    get sourceError() {
      return sourceError;
    },
    get ipodSeeking() {
      return ipodSeeking;
    },
  });
}
