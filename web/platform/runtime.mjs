import { createBackend } from "../core/backend.mjs";
import { installBrowserLayout } from "../ui/device-layout.mjs";
import { closeBrowserPlayer } from "./browser-exit.mjs";

export async function createRuntime(storage) {
  const native = Boolean(window.__TAURI__);
  const nativeMobile =
    native && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const params = new URLSearchParams(location.search),
    preview = !native && params.get("preview") === "1",
    browserPreview = preview && params.get("browser") === "1";
  let invoke,
    checking = false,
    hardwareChecking = false;
  if (native) {
    const raw = window.__TAURI__.core.invoke;
    checking = await raw("check_mode");
    if (checking)
      hardwareChecking = Boolean((await raw("window_state")).hardwareCheck);
    invoke = await (
      await import("./native-adapter.mjs")
    ).createNativeAdapter(raw, storage);
    if (nativeMobile) {
      document.documentElement.classList.add("browser-root", "native-mobile");
      document.body.classList.add("browser-mode", "native-mobile");
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = new URL("../browser.css", import.meta.url).href;
      await new Promise((resolve) => {
        css.onload = css.onerror = resolve;
        document.head.append(css);
      });
      installBrowserLayout();
    } else {
      installBrowserLayout({ native: true });
    }
  } else if (preview && !browserPreview) {
    document.body.classList.add("preview-mode");
    invoke = (await import("../testing/preview.mjs")).invoke;
    document.getElementById("preview-label").hidden = false;
    installBrowserLayout({ native: true });
  } else {
    document.documentElement.classList.add("browser-root");
    document.body.classList.add("browser-mode");
    if (browserPreview) document.body.classList.add("preview-mode");
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = new URL("../browser.css", import.meta.url).href;
    const styled = new Promise((resolve) => {
      css.onload = css.onerror = resolve;
    });
    document.head.append(css);
    invoke = browserPreview
      ? (await import("../testing/preview.mjs")).invoke
      : (await import("./browser-adapter.mjs")).createBrowserAdapter(storage);
    if (browserPreview) document.getElementById("preview-label").hidden = false;
    await styled;
    installBrowserLayout();
  }
  return {
    invoke: createBackend(invoke),
    native,
    preview,
    checking,
    hardwareChecking,
    exit: () =>
      native
        ? invoke("window_action", { action: "close" })
        : closeBrowserPlayer(),
    browserMode: !native && (!preview || browserPreview),
    capabilities: Object.freeze({
      nativeWindows: native,
    }),
  };
}
