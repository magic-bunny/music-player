export async function runHardwareChecks(context, until) {
  const {
    state,
    invoke,
    control,
    startTrack,
    changeSkin,
    windowControls,
    view,
    rotate,
    goHome,
    prepareRadios,
    openTuner,
    activateSelected,
    back,
    $,
  } = context;
  await new Promise(requestAnimationFrame);
  const original = { width: innerWidth, height: innerHeight };
  let referenceTabs;
  const windowInfo = await invoke("window_state");
  if (document.querySelector(".window-controls"))
    throw Error("Chassis close buttons must be removed");
  await changeSkin("walkman", { persist: false });
  const seam = document.querySelector(".wm-door-seam"),
    sony = document.querySelector(".wm-sony"),
    wordmark = document.querySelector(".wm-wordmark"),
    tape = document.querySelector(".wm-cassette-window");
  if (
    sony.offsetLeft <= seam.offsetLeft ||
    tape.offsetLeft <= sony.offsetLeft ||
    tape.offsetLeft + tape.offsetWidth >= wordmark.offsetLeft
  )
    throw Error("Walkman face layout no longer matches the approved reference");
  if (
    tape.querySelectorAll(".wm-reel").length !== 2 ||
    document.querySelector(".wm-door-panel")
  )
    throw Error(
      "Static cassette window must contain both reels without an opening door",
    );
  const remoteBounds = document.getElementById("dial").getBoundingClientRect(),
    lcdBounds = document.querySelector(".shell").getBoundingClientRect();
  if (
    Math.abs(
      (remoteBounds.left +
        remoteBounds.right -
        lcdBounds.left -
        lcdBounds.right) /
        2,
    ) > 1 ||
    Math.abs(
      (remoteBounds.top +
        remoteBounds.bottom -
        lcdBounds.top -
        lcdBounds.bottom) /
        2,
    ) > 1
  )
    throw Error("Remote LCD is not concentric");
  if (!document.querySelector(".wm-cassette").hidden)
    throw Error("Unselected Walkman must have an empty cassette bay");
  const topKey = document.querySelector(".wm-silver-key");
  if (
    topKey?.dataset.wm !== "toggle" ||
    topKey.getAttribute("aria-label") !== "Walkman play or pause"
  )
    throw Error("Top silver key is not the shared play/pause control");
  for (const appearance of ["carthing", "ipod"]) {
    await invoke("check_progress", {
      stage: `empty-restore-${appearance}`,
    });
    await changeSkin(appearance, { persist: false });
    goHome();
    back();
    await until(() => document.body.classList.contains("compact-mode"), 3000);
    await windowControls.whenIdle();
    $("mini-track").click();
    await windowControls.whenIdle();
    await until(() => !document.body.classList.contains("compact-mode"), 3000);
    const screen = document.querySelector(".shell"),
      style = getComputedStyle(screen),
      bounds = screen.getBoundingClientRect();
    if (
      state.current ||
      style.display === "none" ||
      style.visibility === "hidden" ||
      Number(style.opacity) < 0.99 ||
      bounds.width < 100 ||
      bounds.height < 100
    )
      throw Error(`${appearance} screen vanished after an empty restore`);
  }
  await changeSkin("carthing", { persist: false });
  const tracks = await invoke("check_media");
  await control("volume", 0);
  await startTrack(tracks[0].id, tracks);
  await until(
    () =>
      state.snapshot?.track?.id === tracks[0].id &&
      !state.snapshot.loading &&
      state.snapshot.position > 0.1,
    10000,
  );
  for (const appearance of ["ipod", "walkman", "carthing", "walkman"]) {
    await changeSkin(appearance, { persist: false });
    await new Promise(requestAnimationFrame);
    if (innerWidth !== original.width || innerHeight !== original.height)
      throw Error("Skin change moved the shared window frame");
    const tabRects = [
      ...document.querySelectorAll(".brand-tag[data-skin]"),
    ].map((node) => node.getBoundingClientRect());
    if (!referenceTabs) referenceTabs = tabRects;
    for (let i = 0; i < tabRects.length; i++)
      for (const key of ["left", "top", "width", "height"])
        if (Math.abs(tabRects[i][key] - referenceTabs[i][key]) > 1)
          throw Error(`Skin tabs moved: ${appearance} ${key}`);
    await until(
      () =>
        document.body.dataset.skin === appearance &&
        document.body.getBoundingClientRect().width > 0,
      3000,
    );
    if (state.snapshot.track.id !== tracks[0].id || state.snapshot.paused)
      throw Error("Skin switch interrupted local playback");
    if (getComputedStyle($("mini-close")).display !== "none")
      throw Error("Close button leaked into a full player");
    goHome();
    back();
    await until(() => document.body.classList.contains("compact-mode"), 3000);
    const close = $("mini-close").getBoundingClientRect(),
      next = $("mini-next").getBoundingClientRect();
    if (
      close.width < 20 ||
      close.left < next.right - 1 ||
      close.right > innerWidth ||
      document.documentElement.scrollWidth > innerWidth
    )
      throw Error(
        "Compact close button layout is invalid: " +
          JSON.stringify({
            appearance,
            viewport: [innerWidth, innerHeight],
            scrollWidth: document.documentElement.scrollWidth,
            body: document.body.getBoundingClientRect().toJSON(),
            footer: document.querySelector("footer").getBoundingClientRect().toJSON(),
            next: next.toJSON(),
            close: close.toJSON(),
          }),
      );
    $("mini-track").click();
    await until(
      () =>
        state.view === "player" &&
        !document.body.classList.contains("compact-mode"),
      3000,
    );
  }
  await changeSkin("ipod", { persist: false });
  goHome();
  if (document.body.classList.contains("ipod-home-preview"))
    throw Error("Initial iPod menu must fill the screen");
  rotate(1);
  if (!document.body.classList.contains("ipod-home-preview"))
    throw Error("Dial did not reveal the home artwork");
  goHome();
  if (document.body.classList.contains("ipod-home-preview"))
    throw Error("Home did not reset the artwork preview");
  state.localPlaylists = ["a", "b"].map((suffix) => ({
    id: `local-playlist:hardware-${suffix}`,
    title: `Hardware ${suffix}`,
    artist: "Local",
    track_count: tracks.length,
    collection: true,
  }));
  state.hasMore = false;
  await activateSelected();
  if (!document.body.classList.contains("coverflow-mode"))
    throw Error("iPod playlists are not Cover Flow");
  rotate(1);
  if (
    document.querySelector("#cards .selected")?.dataset.id !==
    "local-playlist:hardware-b"
  )
    throw Error("Dial did not select the next cover");
  await activateSelected();
  if (
    state.view !== "tracks" ||
    state.collectionTracks.length !== 2 ||
    document.body.classList.contains("coverflow-mode")
  )
    throw Error("Cover confirmation did not open the vertical track list");
  back();
  if (state.selected !== 1)
    throw Error("Cover Flow selection was not restored");
  state.radios = prepareRadios([
    {
      id: "hardware-flow-radio",
      title: "Test radio",
      stream: "https://example.invalid/live",
      artist: "Test",
    },
  ]);
  view("radio");
  if (!document.body.classList.contains("coverflow-mode"))
    throw Error("iPod radio is not Cover Flow");
  await changeSkin("walkman", { persist: false });
  view("player");
  if (document.querySelector(".wm-cassette").hidden)
    throw Error("Selected music did not insert the cassette");
  const lcd = $("walkman-lcd-cover");
  await until(() => ["ready", "fallback"].includes(lcd.dataset.artwork), 5000);
  if (lcd.width !== 100 || lcd.height !== 100)
    throw Error("LCD artwork is not 100 x 100");
  const rgba = lcd.getContext("2d").getImageData(0, 0, 100, 100).data;
  let pixels = 0;
  for (let p = 0; p < rgba.length; p += 4)
    if (rgba[p + 3]) {
      pixels++;
      if (rgba[p] !== 52 || rgba[p + 1] !== 75 || rgba[p + 2] !== 46)
        throw Error("LCD artwork is not monochrome");
    }
  if (!pixels) throw Error("LCD artwork is blank");
  if (
    getComputedStyle(document.querySelector(".transport")).display !== "none" ||
    document.getElementById("walkman-now-playing")
  )
    throw Error("LCD still has redundant controls");
  document.querySelector(".wm-remote-volume-up").click();
  await until(() => state.snapshot.volume > 0, 3000);
  if (!$("walkman-lcd-volume").querySelector(".filled"))
    throw Error("LCD volume cells did not light up");
  document.querySelector(".wm-remote-volume-down").click();
  await until(() => state.snapshot.volume === 0, 3000);
  if ($("walkman-lcd-volume").querySelector(".filled"))
    throw Error("Muted LCD volume cells are still active");
  await control("seek", 12);
  await until(
    () => $("walkman-lcd-time").textContent.startsWith("0:12 / 0:40"),
    3000,
  );
  const beforeLike = state.favorites.some(
    (track) => track.id === state.current.id,
  );
  document.querySelector(".wm-remote-like").click();
  await until(
    () =>
      state.favorites.some((track) => track.id === state.current.id) !==
      beforeLike,
    3000,
  );
  document.querySelector(".wm-remote-like").click();
  await until(
    () =>
      state.favorites.some((track) => track.id === state.current.id) ===
      beforeLike,
    3000,
  );
  rotate(1);
  await until(() => state.snapshot.volume > 0.0, 3000);
  if (
    getComputedStyle($("walkman-lcd-volume")).display === "none" ||
    !$("walkman-lcd-volume").querySelector(".filled")
  )
    throw Error("LCD volume indicator missing");
  await control("volume", 0);
  document.querySelector(".wm-remote-next").click();
  await until(
    () => state.snapshot.track?.id === tracks[1].id && !state.snapshot.loading,
    5000,
  );
  document.querySelector(".wm-remote-previous").click();
  await until(
    () => state.snapshot.track?.id === tracks[0].id && !state.snapshot.loading,
    5000,
  );
  document.querySelector(".wm-remote-select").click();
  await until(() => state.snapshot.paused, 3000);
  if (
    getComputedStyle(document.querySelector(".wm-reel")).animationPlayState !==
    "paused"
  )
    throw Error("Cassette reels did not pause");
  document.querySelector(".wm-remote-toggle").click();
  await until(
    () =>
      !state.snapshot.paused &&
      document.body.classList.contains("playback-active"),
    3000,
  );
  if (
    getComputedStyle(document.querySelector(".wm-reel")).animationPlayState !==
    "running"
  )
    throw Error("Cassette reels did not resume");
  goHome();
  state.radios = prepareRadios([
    {
      id: "hardware-station",
      title: "Hardware station",
      stream: "https://example.invalid/live",
      artist: "Test",
    },
  ]);
  view("radio");
  openTuner();
  const frequency = state.tunerFrequency;
  rotate(1);
  if (state.tunerFrequency === frequency) throw Error("Remote tuner failed");
  await changeSkin("carthing", { persist: false });
  await until(
    () => innerWidth === original.width && innerHeight === original.height,
    5000,
  );
  await control("toggle");
  await until(() => state.snapshot.paused, 3000);
  if (windowInfo.exitCheck) {
    goHome();
    back();
    await until(() => document.body.classList.contains("compact-mode"), 3000);
  }
  await invoke("check_report", {
    result: {
      ok: true,
      hardwareCheck: true,
      skins: ["carthing", "ipod", "walkman"],
      skinSwitchPreservesPlayback: true,
      remoteSelect: true,
      remoteTransport: true,
      volumeHud: true,
      reels: true,
      tuner: true,
      windowRestore: true,
      emptyRestore: true,
      alignedSkinTabs: true,
      coverFlow: true,
      lcdMonochrome: true,
      physicalVolumeAndLike: true,
      lcdTime: true,
      lcdVolume: true,
      compactClose: true,
      exitCheck: Boolean(windowInfo.exitCheck),
    },
  });
  if (windowInfo.exitCheck) $("mini-close").click();
}
