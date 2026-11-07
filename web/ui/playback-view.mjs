export function createPlaybackView({
  state,
  icon,
  t,
  clock,
  fill,
  artworkLoaded,
  updateSkinStatus,
}) {
  const $ = (id) => document.getElementById(id);
  function renderCurrent() {
    const track = state.current;
    $("song-title").textContent = track?.title || t("Choose a track");
    $("song-title").title = track?.title || "";
    $("song-artist").textContent = track?.artist || "";
    $("play-context").textContent = track?.stream
      ? t("Internet Radio")
      : track?.album || t("Music");
    $("mini-title").textContent = track?.title || t("Choose music");
    $("mini-artist").textContent = track?.artist || "";
    $("mini-playing").hidden = !track;
    $("live-label").hidden = !track?.stream;
    $("seek").hidden = !!track?.stream;
    document.querySelector(".time").hidden = !!track?.stream;
    $("shuffle").disabled = !!track?.stream;
    $("repeat").disabled = !!track?.stream;
    $("lyrics").disabled = !!track?.stream;
    $("like").disabled = !track;
    updateLike();
    artworkLoaded();
  }
  function updateLike() {
    const liked = state.favorites.some((t) => t.id === state.current?.id);
    $("like").setAttribute("aria-pressed", String(liked));
    $("like").classList.toggle("active", liked);
    $("like").title = liked ? t("Unlike") : t("Like");
    $("like").setAttribute("aria-label", $("like").title);
  }

  function transport(playing, loading) {
    const active = playing && !loading;
    document.body.classList.toggle("playback-active", active);
    state.playbackStatus = loading
      ? "Buffering"
      : active
        ? "Playing"
        : "Paused";
    for (const indicator of document.querySelectorAll(".now-playing-indicator"))
      indicator.setAttribute("aria-label", t(state.playbackStatus));
    for (const id of ["play", "mini-play"]) {
      const b = $(id),
        label = playing ? t("Pause") : t("Play");
      if (b.getAttribute("aria-label") !== label) {
        b.innerHTML = icon(playing ? "pause" : "play");
        b.setAttribute("aria-label", label);
      }
      b.disabled = loading;
    }
    updateSkinStatus();
  }

  function renderSnapshot(s) {
    $("seek").max = String(s.duration || 1);
    $("seek").disabled = s.loading || !s.duration;
    if (!state.dragging) {
      $("seek").value = String(s.position);
      $("elapsed").textContent = clock(s.position);
      fill($("seek"));
    }
    $("duration").textContent = clock(s.duration);
    for (const id of ["repeat", "shuffle"]) {
      $(id).classList.toggle("active", s[id]);
      $(id).setAttribute("aria-pressed", String(!!s[id]));
    }
    $("lyric-current").textContent = ["No lyrics available", "Intro…"].includes(
      s.lyric,
    )
      ? t(s.lyric)
      : s.lyric || t("No lyrics available");
    $("lyric-next").textContent = s.next_lyric || "";
  }
  return { renderCurrent, updateLike, transport, renderSnapshot };
}
