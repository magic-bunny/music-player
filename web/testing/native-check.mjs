export async function runNativeChecks(context) {
  const {
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
    pressDial,
    goHome,
    isTrackList,
  } = context;
  const until = async (fn, timeout = 65000) => {
    const end = Date.now() + timeout;
    while (!fn()) {
      if (Date.now() > end)
        throw Error(
          "Timed out waiting for UI state: " +
            JSON.stringify({
              view: state.view,
              track: state.snapshot?.track?.id,
              loading: state.snapshot?.loading,
              error: state.snapshot?.error,
              position: state.snapshot?.position,
              paused: state.snapshot?.paused,
            }),
        );
      await new Promise((r) => setTimeout(r, 150));
    }
  };
  try {
    mechanicalAudio.setEnabled(true);
    mechanicalAudio.setMutedForTest(true);
    if (!(await mechanicalAudio.unlock()))
      throw Error("Mechanical audio output unavailable");
    const effectStart = { ...mechanicalAudio.stats };
    const windowInfo = await invoke("window_state");
    if (windowInfo.hardwareCheck) {
      const { runHardwareChecks } = await import("./hardware-check.mjs");
      await runHardwareChecks(context, until);
      return;
    }
    if (windowInfo.decorated)
      throw Error("System decorations are still enabled");
    if (
      document.querySelector(".window-controls") ||
      getComputedStyle($("mini-close")).display !== "none"
    )
      throw Error("Full player must not expose a close button");
    await invoke("check_progress", { stage: "search" });
    await until(() => state.library.length > 0);
    await control("volume", 0);
    $("volume").value = "0";
    fill($("volume"));
    view("home");
    if (!$("add").hidden) throw Error("Home must not show the add button");
    state.selected = 0;
    const firstHomeCard = $("cards").firstElementChild;
    rotate(1);
    if ($("cards").firstElementChild !== firstHomeCard || state.selected !== 1)
      throw Error("Same-page dial selection rebuilt the cards");
    rotate(-1);
    await activateSelected();
    if (state.view !== "browse" || $("add").hidden)
      throw Error("Home Music navigation or add button failed");
    if (state.library.length !== 10 || $("cards").children.length !== 11)
      throw Error("Expected ten playlist covers and More");
    handleDialWheel({
      preventDefault() {},
      deltaY: 35,
      deltaX: 0,
      isTrusted: false,
    });
    if (state.selected !== 1)
      throw Error("Mouse wheel did not use dial rotation");
    handleDialWheel({
      preventDefault() {},
      deltaY: -35,
      deltaX: 0,
      isTrusted: false,
    });
    if (state.selected !== 0)
      throw Error("Reverse mouse wheel rotation failed");
    rotate(1, true);
    if (state.selected !== 1) throw Error("Dial selection failed");
    rotate(-1, true);
    rotate(10);
    await activateSelected();
    if (state.view !== "playlists" || state.library.length <= 10)
      throw Error("More playlists did not load");
    back();
    if (state.view !== "browse" || state.selected !== 10)
      throw Error("Carousel position was not restored");
    state.selected = 0;
    await activateSelected();
    if (state.view !== "tracks" || !state.collectionTracks.length)
      throw Error("Playlist tracks did not open");
    const playlistCount = state.collectionTracks.length;
    const track =
      state.online.find((t) => t.id === "netease:1960405637") ||
      state.online[0];
    await invoke("check_progress", { stage: "music" });
    await startTrack(track.id, state.online);
    await until(
      () => state.snapshot?.position > 0.3 && !state.snapshot.loading,
    );
    back();
    const indicator = document.querySelector(
        ".track-row.current .now-playing-indicator",
      ),
      miniIndicator = $("mini-playing");
    if (
      !indicator ||
      indicator.getAttribute("aria-label") !== "Playing" ||
      !document.body.classList.contains("playback-active")
    )
      throw Error("Playing indicator did not activate");
    if (
      miniIndicator.hidden ||
      miniIndicator.getAttribute("aria-label") !== "Playing"
    )
      throw Error("Footer playing indicator did not activate");
    if (
      !matchMedia("(prefers-reduced-motion: reduce)").matches &&
      (getComputedStyle(indicator.firstElementChild).animationPlayState !==
        "running" ||
        getComputedStyle(miniIndicator.firstElementChild).animationPlayState !==
          "running")
    )
      throw Error("Playing indicator is not animated");
    view("player");
    await control("toggle");
    await until(() => state.snapshot.paused);
    back();
    if (
      document.body.classList.contains("playback-active") ||
      document
        .querySelector(".track-row.current .now-playing-indicator")
        ?.getAttribute("aria-label") !== "Paused" ||
      miniIndicator.getAttribute("aria-label") !== "Paused" ||
      getComputedStyle(miniIndicator.firstElementChild).animationPlayState !==
        "paused"
    )
      throw Error("Playing indicator did not pause");
    view("player");
    await control("seek", 30);
    await until(() => state.snapshot.position >= 29);
    const selectedTrack = state.current.id;
    rotate(2);
    await until(() => state.snapshot.volume === 0.04);
    if (
      state.view !== "player" ||
      state.current.id !== selectedTrack ||
      $("volume-hud").hidden
    )
      throw Error("Music volume dial changed selection or failed to show HUD");
    rotate(-100);
    await until(() => state.snapshot.volume === 0);
    await until(() => $("volume-hud").hidden, 3000);
    const wasLiked = state.favorites.some((t) => t.id === track.id);
    await toggleLike();
    if (state.favorites.some((t) => t.id === track.id) === wasLiked)
      throw Error("Favorite was not saved");
    await toggleLike();
    await control("shuffle");
    await until(() => state.snapshot.shuffle);
    await control("shuffle");
    await until(() => !state.snapshot.shuffle);
    $("lyrics").click();
    if ($("lyric-panel").hidden) throw Error("Lyrics did not open");
    back(true);
    if (state.lyrics) throw Error("Back did not close lyrics");
    back();
    if (state.view === "player") throw Error("Back did not return to browsing");
    back();
    if (state.view !== "browse")
      throw Error("Back did not return to playlists");
    back();
    if (state.view !== "home") throw Error("Back did not return Home");
    const savedDirectory = state.radios,
      savedStations = state.savedRadios;
    state.savedRadios = [];
    state.radios = prepareRadios(
      Array.from({ length: 12 }, (_, i) => ({
        id: `check-radio:${i}`,
        title: `Check Radio ${i + 1}`,
        artist: "Test signal",
        stream: `https://example.invalid/${i}`,
      })),
    );
    view("radio");
    if (
      $("cards").children.length !== 10 ||
      $("cards").lastElementChild?.dataset.id !== "ui:radio-more" ||
      $("add").hidden
    )
      throw Error(
        "Radio menu mismatch: " +
          JSON.stringify({
            skin: document.body.dataset.skin,
            view: state.view,
            cards: $("cards").children.length,
            last: $("cards").lastElementChild?.dataset.id,
            addHidden: $("add").hidden,
            stations: state.radios.length,
          }),
      );
    const frequency = state.radios[0].frequency;
    state.tunerFrequency = frequency;
    openTuner();
    if (
      state.view !== "tuner" ||
      $("tuner-station").textContent !== "Check Radio 1" ||
      !$("add").hidden
    )
      throw Error("FM tuner did not lock the selected station");
    rotate(1);
    if (
      Number($("tuner-frequency").textContent) !==
      normalizeFrequency(frequency + 0.1)
    )
      throw Error("FM tuner did not advance by 0.1 MHz");
    back();
    state.radios = savedDirectory;
    state.savedRadios = savedStations;
    state.history = [];
    view("home", { remember: false });
    let station = null;
    if (!windowInfo.skinCheck) {
      await invoke("check_progress", { stage: "radio" });
      await search("Groove Salad", true);
      if (!state.radios.length) throw Error("No HTTPS radio stations found");
      for (const candidate of state.radios.slice(0, 3)) {
        await startTrack(candidate.id, state.radios);
        try {
          await until(() => audio.currentTime > 0.3, 12000);
          station = candidate;
          break;
        } catch {
          stopRadio();
        }
      }
      if (!station) throw Error("Radio playback check failed");
      if ($("live-label").hidden || !$("seek").hidden)
        throw Error("Incorrect live radio state");
      audio.muted = true;
      const stationId = state.current.id;
      rotate(3);
      await until(() => state.snapshot.volume === 0.06);
      if (
        state.view !== "player" ||
        state.current.id !== stationId ||
        Math.abs(audio.volume - 0.06) > 0.001 ||
        $("volume-hud").hidden
      )
        throw Error("Radio volume dial failed");
      await control("volume", 0);
      audio.muted = false;
      await invoke("check_progress", { stage: "return-to-music" });
      audio.pause();
      stopRadio();
      await startTrack(track.id, state.online);
      await until(
        () =>
          state.snapshot?.track?.id === track.id &&
          !state.snapshot.loading &&
          state.snapshot.position > 0.3,
      );
      await control("toggle");
      await until(() => state.snapshot.paused);
      await control("seek", 30);
      await until(() => state.snapshot.position >= 29);
      await until(() => state.art.has(track.id));
    }
    view("player");
    await new Promise((r) => setTimeout(r, 700));
    const panelColor = getComputedStyle(
        document.querySelector(".shell"),
      ).backgroundColor,
      controlColor = getComputedStyle(
        document.querySelector(".transport"),
      ).backgroundColor;
    if (panelColor === controlColor)
      throw Error("Playback and control colors must differ");
    if (document.documentElement.scrollWidth > innerWidth)
      throw Error("Horizontal layout overflow");
    view("home");
    back(true);
    await until(
      () =>
        document.body.classList.contains("compact-mode") &&
        innerWidth >= 430 &&
        innerHeight >= 80,
      3000,
    );
    const compactState = await invoke("window_state");
    if (!compactState.compact) throw Error("Compact player did not open");
    if (
      $("mini-close").getBoundingClientRect().left <
        $("mini-next").getBoundingClientRect().right ||
      getComputedStyle($("mini-close")).display === "none"
    )
      throw Error(
        "Compact close button is missing or overlaps transport controls",
      );
    const compactWidth = innerWidth,
      compactHeight = innerHeight,
      miniTrackRect = $("mini-track").getBoundingClientRect(),
      miniPlayRect = $("mini-play").getBoundingClientRect();
    if (
      miniIndicator.hidden ||
      document.documentElement.scrollWidth > innerWidth ||
      miniTrackRect.right > miniPlayRect.left ||
      $("mini-title").parentElement.getBoundingClientRect().width < 140
    )
      throw Error(
        "Compact player controls overlap or playing indicator is missing",
      );
    $("mini-track").click();
    await until(
      () =>
        state.view === "player" &&
        !document.body.classList.contains("compact-mode"),
      3000,
    );
    await new Promise((r) => setTimeout(r, 250));
    const restoredState = await invoke("window_state");
    if (
      restoredState.compact ||
      document.body.classList.contains("compact-mode") ||
      $("player-view").hidden
    )
      throw Error("Compact cover did not restore the player");
    await invoke("check_progress", { stage: "settings" });
    view("preferences");
    if (
      $("preferences-view").hidden ||
      !$("browse-view").hidden ||
      sourceList.length < 2
    )
      throw Error("Settings navigation or providers missing");
    for (const [language, label] of [
      ["zh", "设置"],
      ["ja", "設定"],
      ["en", "Settings"],
    ]) {
      changeLanguage(language, { persist: false });
      if (
        document
          .querySelector('nav [data-view="preferences"]')
          .textContent.trim() !== label
      )
        throw Error("Navigation language did not update");
      if (document.documentElement.scrollWidth > innerWidth)
        throw Error("Localized settings overflow");
    }
    context.settingsSelection = 0;
    rotate(1);
    if (
      context.settingsSelection !== 1 ||
      !preferenceButtons()[1].classList.contains("dial-selected")
    )
      throw Error("Settings dial selection failed");
    await invoke("check_progress", { stage: "audius" });
    await changeSource("audius", { persist: false });
    if (
      context.sourceError ||
      !state.library.length ||
      state.library.some((item) => !item.id.startsWith("audius-playlist:"))
    )
      throw Error("Audius playlists did not load");
    const audiusSearch = await invoke("search", {
      source: "audius",
      query: "electronic",
    });
    if (
      !audiusSearch.length ||
      audiusSearch.some((item) => !item.id.startsWith("audius:"))
    )
      throw Error("Audius search failed");
    await openCollection(state.library[0]);
    if (!state.collectionTracks.length) throw Error("Audius playlist is empty");
    const audiusTrack = state.collectionTracks[0];
    await invoke("check_progress", {
      stage: "audius-playback:" + audiusTrack.id,
    });
    await startTrack(audiusTrack.id, state.collectionTracks);
    await until(() => {
      if (state.snapshot?.track?.id === audiusTrack.id && state.snapshot.error)
        throw Error(state.snapshot.error);
      return (
        state.snapshot?.track?.id === audiusTrack.id &&
        !state.snapshot.loading &&
        state.snapshot.position > 0.3
      );
    });
    await control("toggle");
    await until(() => state.snapshot.paused);
    await control("seek", 10);
    await until(() => state.snapshot.position >= 9);
    const audiusArtwork = await invoke("artwork", { ids: [audiusTrack.id] });
    if (!audiusArtwork[audiusTrack.id]) throw Error("Audius artwork missing");
    const audiusLiked = state.favorites.some(
      (item) => item.id === audiusTrack.id,
    );
    await toggleLike();
    if (
      state.favorites.some((item) => item.id === audiusTrack.id) === audiusLiked
    )
      throw Error("Audius favorite failed");
    await toggleLike();
    view("preferences");
    await changeSource("netease", { persist: false });
    if (
      !state.library.length ||
      state.library.some((item) => !item.id.startsWith("playlist:")) ||
      state.current.id !== audiusTrack.id
    )
      throw Error("Switching source lost playback or mixed catalogs");
    await invoke("check_progress", { stage: "ipod" });
    await control("toggle");
    await until(() => !state.snapshot.paused && state.snapshot.position > 10);
    const beforeSkin = state.snapshot.position;
    await changeSkin("ipod", { persist: false });
    await until(() => document.body.classList.contains("skin-ipod"));
    view("player");
    pressDial();
    if (!context.ipodSeeking)
      throw Error("iPod center did not enter seek mode");
    rotate(1);
    await until(() => state.snapshot.position >= beforeSkin + 4);
    pressDial();
    await until(
      () =>
        !state.snapshot.paused && state.snapshot.track.id === audiusTrack.id,
    );
    goHome();
    if (!document.querySelector('.track-row[data-id="home:radio"]'))
      throw Error("iPod Radio menu missing");
    state.selected = 0;
    await activateSelected();
    if (
      !document.body.classList.contains("coverflow-mode") ||
      state.view !== "browse"
    )
      throw Error("iPod playlist navigation failed");
    back();
    state.selected = 4;
    await activateSelected();
    if (state.view !== "preferences") throw Error("iPod settings menu failed");
    await invoke("check_progress", { stage: "walkman" });
    await changeSkin("walkman", { persist: false });
    await until(
      () =>
        innerWidth > innerHeight &&
        document.body.classList.contains("skin-walkman"),
    );
    view("player");
    const walkmanVolume = state.snapshot.volume;
    rotate(1);
    await until(() => state.snapshot.volume > walkmanVolume);
    await control("volume", 0);
    if (state.snapshot.track.id !== audiusTrack.id || state.snapshot.paused)
      throw Error("Walkman interrupted playback");
    goHome();
    state.selected = 0;
    await activateSelected();
    if (!isTrackList())
      throw Error("Walkman menus did not use shared navigation");
    if (
      !document.querySelector('[data-wm="select"]') ||
      !document.getElementById("walkman-chassis")
    )
      throw Error("Walkman hardware is missing");
    await changeSkin("carthing", { persist: false });
    await until(
      () => innerWidth === windowInfo.width || innerWidth > innerHeight,
    );
    if (state.snapshot.track.id !== audiusTrack.id || state.snapshot.paused)
      throw Error("Skin switching interrupted playback");
    await control("toggle");
    await until(() => state.snapshot.paused);
    if (
      mechanicalAudio.stats.ticks - effectStart.ticks !== 2 ||
      mechanicalAudio.stats.buttons - effectStart.buttons !== 2
    )
      throw Error(
        "Incorrect mechanical sound count: " +
          JSON.stringify({
            ticks: mechanicalAudio.stats.ticks - effectStart.ticks,
            buttons: mechanicalAudio.stats.buttons - effectStart.buttons,
          }),
      );
    const dragBound = typeof $("window-drag").onmousedown === "function";
    if (!dragBound) throw Error("Window drag handler is not bound");
    await invoke("check_report", {
      result: {
        ok: true,
        ipodSkin: true,
        walkmanSkin: true,
        skinSwitchPreservesPlayback: true,
        languages: true,
        musicSources: sourceList.map((p) => p.id),
        audiusPlayback: true,
        audiusSearch: true,
        audiusArtwork: true,
        sourceSwitchPreservesPlayback: true,
        animatedPlayingIndicator: true,
        musicVolumeDial: true,
        radioVolumeDial: !!station,
        volumeHud: true,
        soundTicks: mechanicalAudio.stats.ticks - effectStart.ticks,
        soundButtons: mechanicalAudio.stats.buttons - effectStart.buttons,
        audioState: mechanicalAudio.context.state,
        playlistTracks: playlistCount,
        tracks: state.online.length,
        track: track.title,
        radio: station?.title ?? null,
        radioPlayed: !!station,
        decorated: windowInfo.decorated,
        dragBound,
        compact: true,
        compactWidth,
        compactHeight,
        restored: true,
        panelColor,
        controlColor,
        dial: true,
        favorites: true,
        shuffle: true,
        back: true,
        paused: state.snapshot.paused,
        position: state.snapshot.position,
        width: innerWidth,
        height: innerHeight,
      },
    });
  } catch (error) {
    await invoke("check_report", {
      result: { ok: false, error: String(error) },
    });
  }
}
