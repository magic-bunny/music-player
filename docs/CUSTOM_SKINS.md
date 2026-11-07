# Custom skins

Music Player keeps playback, navigation, storage, music providers, rotary input, and window behavior outside the visual skins. A skin changes presentation and maps the shared controls to a different piece of hardware.

Custom skins are currently **source-level extensions**. They are reviewed and bundled with the application at build time, so they can use the shared player without allowing downloaded JavaScript to run inside the desktop app.

## What a skin provides

Each skin exports a descriptor from `web/ui/skins/` and is registered in `web/ui/skins/index.mjs`.

```js
export const myPlayer = {
  id: "my-player",
  geometry: {
    width: 960,
    height: 540,
    portrait: false,
    fitDesktop: true,
    tabs: { x: 12, y: 96 },
  },
  windowAction: "skin-my-player",
  seeking: false,
  holdForOptions: false,
  homeItems: (items) => items,
  catalogItems: (items) => items,
  layout: (view) => (view === "tracks" ? "list" : "cards"),
  centerAction: ({ view }) => (view === "player" ? "toggle" : "activate"),
  rotationAction: ({ view }) => (view === "player" ? "volume" : "select"),
};
```

The descriptor must keep the following behavior stable:

- `geometry` describes one fixed design canvas. `tabs` is the top-left position of the label rail in that canvas. The shared viewport fitter centers and scales the complete hardware, applies safe-area insets, and rotates landscape hardware together with its labels on portrait phones.
- `homeItems` and `catalogItems` reshape display data only. They must not fetch music or mutate player state.
- `layout` selects one of the shared browsing layouts.
- `centerAction` and `rotationAction` map the skin's physical controls to the shared controller actions.
- A presenter may update skin-only status displays, but playback commands still go through `PlaybackController` and navigation still goes through `NavigationController`.

## Add a skin

1. Create `web/ui/skins/my-player.mjs` and export the descriptor.
2. Add the skin to the `skins` map in `web/ui/skins/index.mjs`.
3. Add a side label in `web/ui/skins/chrome.mjs`. Give real appearance labels both `data-skin` and `data-tab` attributes.
4. Add scoped styles such as `.skin-my-player ...`. Keep the hardware inside the descriptor's fixed canvas and let `device-layout.mjs` own viewport positioning and scale.
5. Reuse the existing buttons and shared action callbacks. New physical controls should call the same `menu`, `home`, `previous`, `next`, `toggle`, `select`, `volume`, and `like` functions used by the bundled skins.
6. If the skin needs a status screen, add a small presenter and update it from the existing render model. Do not create a second playback state.
7. Add layout and behavior assertions under `scripts/`.

## Visual and interaction rules

- Keep text and hit targets inside the fixed design canvas.
- Use `touch-action: none` only on rotary or drag controls that need it. Browsing lists must keep native touch scrolling.
- Do not position the whole player with viewport CSS. The shared fitter owns `left`, `top`, `transform`, safe areas, and compact mode.
- Mobile iPod-style portrait hardware remains upright. Landscape hardware uses its native landscape layout and rotates as a unit on portrait phones.
- Do not add remote scripts, inline event handlers, or dynamic code loading. The desktop CSP intentionally limits executable sources.
- Store user preferences through the shared localStorage adapters. A skin must not create a parallel configuration file.

## Verify the result

```sh
node --test scripts/*.test.mjs
node scripts/build-pages.mjs
source "$HOME/.cargo/env"
cargo fmt --check
cargo test --locked
cargo clippy --all-targets -- -D warnings
```

For deterministic visual data, serve `web/` and open `/?preview=1`. Check at least a desktop viewport, a portrait phone with top and bottom safe areas, and a landscape phone with left and right cutouts.

Contributions can open a pull request against [magic-bunny/music-player](https://github.com/magic-bunny/music-player). Include a screenshot for the home and playback states and describe how every physical control maps to the shared actions.
