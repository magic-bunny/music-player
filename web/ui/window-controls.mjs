import {
  animateElement,
  clearMotionStyles,
} from "./animation.mjs";

export function createWindowControls({
  invoke,
  browserMode,
  onError,
  onRestore = () => {},
}) {
  let windowTransition = false;
  let normalWindow;
  const compactSize = { width: 440, height: 88 };
  const scaleFor = (width = innerWidth) =>
    Math.min(1, compactSize.width / Math.max(1, width));
  const waitForViewport = (width, height, timeout = 900) =>
    new Promise((resolve) => {
      const started = performance.now();
      const check = () => {
        if (
          (Math.abs(innerWidth - width) <= 2 &&
            Math.abs(innerHeight - height) <= 2) ||
          performance.now() - started >= timeout
        )
          resolve();
        else setTimeout(check, 16);
      };
      check();
    });
  function resetBodyMotion() {
    clearMotionStyles(document.body, [
      "--window-motion-scale",
      "opacity",
      "filter",
    ]);
    document.body.classList.remove("window-transitioning");
  }
  function resetShellMotion() {
    const shell = document.querySelector(".shell");
    if (shell)
      clearMotionStyles(shell, ["opacity", "filter", "transform", "scale"]);
  }
  const nextFrame = () =>
    new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      const fallback = setTimeout(finish, 50);
      requestAnimationFrame(() => {
        clearTimeout(fallback);
        finish();
      });
    });
  const nextPaint = async () => {
    await nextFrame();
    await nextFrame();
  };
  async function animateFullPlayer(from, to) {
    document.body.classList.add("window-transitioning");
    await animateElement(
      document.body,
      {
        "--window-motion-scale": [from, to],
        opacity: from < to ? [0.72, 1] : [1, 0.72],
        filter: from < to
          ? ["blur(1.2px)", "blur(0px)"]
          : ["blur(0px)", "blur(1.2px)"],
      },
      { duration: 0.42, ease: [0.16, 1, 0.3, 1] },
    );
  }
  async function animateCompactPlayer(entering) {
    const shell = document.querySelector(".shell");
    if (!shell) return;
    try {
      await animateElement(
        shell,
        {
          opacity: entering ? [0, 1] : [1, 0],
          scale: entering ? [0.9, 1] : [1, 0.9],
        },
        { duration: 0.24, ease: [0.16, 1, 0.3, 1] },
      );
    } finally {
      resetShellMotion();
    }
  }
  async function compactWindow() {
    if (windowTransition || document.body.classList.contains("compact-mode"))
      return;
    windowTransition = true;
    normalWindow = { width: innerWidth, height: innerHeight };
    try {
      await animateFullPlayer(1, scaleFor(normalWindow.width));
      if (!browserMode && invoke) {
        await invoke("window_action", { action: "compact" });
        await waitForViewport(compactSize.width, compactSize.height);
      }
      document.body.classList.add("compact-mode");
      resetBodyMotion();
      await animateCompactPlayer(true);
    } catch (e) {
      onError(e);
    } finally {
      resetBodyMotion();
      windowTransition = false;
    }
  }
  async function restoreWindow() {
    if (windowTransition || !document.body.classList.contains("compact-mode"))
      return;
    windowTransition = true;
    try {
      await animateCompactPlayer(false);
      if (!browserMode && invoke) {
        await invoke("window_action", { action: "restore" });
        await waitForViewport(
          normalWindow?.width || 1060,
          normalWindow?.height || 620,
        );
      }
      document.body.classList.remove("compact-mode");
      resetShellMotion();
      await nextPaint();
      await onRestore();
      const scale = scaleFor(normalWindow?.width || 1060);
      await animateFullPlayer(scale, 1);
    } catch (e) {
      onError(e);
    } finally {
      resetShellMotion();
      resetBodyMotion();
      windowTransition = false;
    }
  }
  async function whenIdle() {
    while (windowTransition)
      await new Promise((resolve) => setTimeout(resolve, 16));
  }

  return {
    compactWindow,
    restoreWindow,
    whenIdle,
    get transitioning() {
      return windowTransition;
    },
  };
}
