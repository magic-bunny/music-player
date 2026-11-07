# Architecture

## Boundaries

```text
UI / skin strategy
        ↓
Shared navigation and playback controllers
        ↓
Validated platform command boundary
        ├── Native adapter → Tauri IPC → Rust providers / rodio
        └── Browser adapter → REST providers / HTMLAudioElement / IndexedDB
```

- `web/app.js` wires DOM events, view transitions, catalog requests and controllers. It does not implement audio decoding or build separate player instances for skins.
- `web/core/playback-controller.mjs` owns music/radio exclusivity, selection generations and radio controls. It takes an adapter, state and media element as dependencies and has no DOM queries.
- `web/core/navigation-controller.mjs` dispatches common menu actions and manages navigation history. Both skin menus route through it.
- `web/core/library-store.mjs` owns library configuration persistence. Native and browser adapters reuse its initializer and writes. Native legacy migration is read-only.
- `web/core/contracts.d.ts` documents public command arguments/results and provider methods. `backend.mjs` validates important arguments and responses at runtime. Native-only diagnostics stay outside the public product contract.
- `web/platform/runtime.mjs` selects the platform once and advertises capabilities. Browser networking, native IPC, file pickers and audio decoding stay inside platform adapters or Rust.
- `web/ui/skins/carthing.mjs`, `ipod.mjs` and `walkman.mjs` define menu composition, canvas geometry, native window action and hardware mapping. The iPod and Walkman presenters render status/cover UI without network or storage APIs. `menu-layout.mjs` shares compact-screen menu actions without coupling one skin to another renderer.
- `web/ui/rotary-input.mjs` turns wheel, pointer and keyboard input into detents and presses. The skin maps these to shared operations.
- `web/ui/animation.mjs` wraps the vendored Motion runtime. Skin changes and window transitions use this shared layer, so skins do not own transition timing or platform window choreography.
- `web/ui/marquee.mjs` updates on title or element-size changes. Repeated playback snapshots must not remove its animation class or rewrite its animation properties.
- `web/testing/native-check.mjs` is loaded only in native check mode. The static build excludes the entire testing directory.

The two audio engines remain distinct: native rodio and browser audio have different decoding, permission and lifecycle requirements. Shared contracts and integration checks enforce matching visible behavior rather than forcing both through one implementation.

## Skin extension path

Skins are currently registered at build time in `web/ui/skins/index.mjs`. Opening them to developers can preserve the shared player by stabilizing one skin contract with these fields: identity and label, canvas geometry and tab anchor, view layout strategy, rotary/button action mapping, a presenter lifecycle, a chrome factory, and a local stylesheet URL. A future manifest loader can validate that contract before registration; playback, navigation, library storage, providers, compact-window behavior and transitions stay outside the plugin.

The first public version should load local, trusted modules only. Loading arbitrary remote JavaScript would conflict with the Tauri CSP and would give a skin the same privileges as the player UI.

## Test scope

| Change | Required verification |
| --- | --- |
| Shared navigation, persistence, playback policy | Relevant Node tests; race/order cases for async behavior |
| Adapter command or provider response | Shared adapter contract suite; real integration for changed transport |
| Pure style / skin layout | Browser screenshot and targeted interaction; no repeated live audio suite unless playback changed |
| Rust engine, IPC, native window | Cargo tests/clippy and `--check-ui-hardware` with local silent WAV; provider changes additionally run live checks |
| Directory or build configuration | Static build, nested URL loading, Cargo build and launcher |

The native bridge contract test uses deterministic IPC fixtures. It does not replace the native smoke test. Browser file tests verify actual IndexedDB and local audio via `scripts/browser-smoke.html`.

## Storage and deployment

Storage keys and the Tauri identifier are stable across source-folder renames. Local file contents belong to filesystem / IndexedDB, while library metadata belongs to localStorage.

`scripts/build-pages.mjs` recreates only the generated `dist/` directory and recursively copies deployable modules. It excludes test fixtures and TypeScript declarations. Modules use paths relative to their own location, including preview data, so GitHub Pages repository prefixes work.

## Remaining deliberate differences

- NetEase desktop uses the anonymous native protocol; Web uses a user-configured CORS-enabled proxy.
- Rust and browser providers implement the same domain rules in different languages; no WASM build is required.
- `app.js` still coordinates view-specific loading/error states. More UI components can be extracted when they acquire independent behavior; avoid one class per small helper.
- Existing Codex chats can use the old project path through a compatibility symlink. The app's saved sidebar label/path may remain the old one; the symlink points to the sole canonical checkout and should remain while those chats are in use.
