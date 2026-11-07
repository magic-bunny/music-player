export function closeBrowserPlayer({
  host = window,
  documentRoot = document,
} = {}) {
  // Ordinary tabs may refuse window.close(). In that case the stopped player
  // remains closed locally, with an explicit way to reopen the saved library.
  documentRoot.body.classList.add("player-closed");
  documentRoot.documentElement.classList.add("player-closed-root");
  documentRoot.getElementById("closed-player").hidden = false;
  try {
    host.close();
  } catch {}
}
