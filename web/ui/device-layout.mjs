import { skinFor, skinIds } from "./skins/index.mjs";

export const TAB_LAYOUT = Object.freeze({ width: 30, height: 100, gap: 104 });
export const tabIds = Object.freeze([...skinIds, "custom"]);
function frameFor(id, mobile, portrait) {
  const geometry = skinFor(id).geometry;
  // Portrait hardware stays upright. Landscape hardware rotates only when a
  // phone is physically portrait so its native landscape canvas can fill it.
  const rotated = mobile && !geometry.portrait && portrait;
  const anchor = rotated ? geometry.rotatedTabs : geometry.tabs;
  const project = (x, y) => (rotated ? { x: -y, y: x } : { x, y });
  const corners = [
    [0, 0],
    [geometry.width, 0],
    [0, geometry.height],
    [geometry.width, geometry.height],
  ].map(([x, y]) => project(x - anchor.x, y - anchor.y));
  return { geometry, rotated, anchor, project, corners };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// Center the active chassis in the usable viewport. Its tab rail is included
// when fitting and can nudge the chassis only as much as needed to avoid a
// cutout or screen edge. Tabs counter-rotate on portrait phones.
export function fitLandscape({
  width,
  height,
  insets = {},
  portrait = height > width,
  mobile = Math.min(width, height) <= 600,
  compact = false,
  offsetLeft = 0,
  offsetTop = 0,
  skin = "carthing",
}) {
  const gutter = mobile ? 6 : 16,
    left = (insets.left || 0) + gutter,
    top = (insets.top || 0) + gutter,
    right = width - (insets.right || 0) - gutter,
    bottom = height - (insets.bottom || 0) - gutter;
  const availableWidth = Math.max(1, right - left);
  const availableHeight = Math.max(1, bottom - top);
  if (compact) {
    const angle = skinFor(skin).geometry.portrait ? 0 : portrait ? 90 : 0;
    const w = angle ? 88 : 440,
      h = angle ? 440 : 88,
      scale = Math.min(1, availableWidth / w, availableHeight / h);
    return {
      canvasWidth: 440,
      canvasHeight: 88,
      angle,
      scale,
      renderedWidth: w * scale,
      renderedHeight: h * scale,
      x: offsetLeft + left + availableWidth - (w * scale) / 2,
      y: offsetTop + top + availableHeight - (h * scale) / 2,
    };
  }
  const { geometry, rotated, anchor, project } = frameFor(
    skin,
    mobile,
    portrait,
  );
  const center = project(geometry.width / 2 - anchor.x, geometry.height / 2 - anchor.y);
  const relativeDevice = [
    [0, 0],
    [geometry.width, 0],
    [0, geometry.height],
    [geometry.width, geometry.height],
  ].map(([x, y]) => {
    const point = project(x - anchor.x, y - anchor.y);
    return { x: point.x - center.x, y: point.y - center.y };
  });
  const tabs = tabIds.map((id, index) => ({
    id,
    left: anchor.x + (rotated ? index * TAB_LAYOUT.gap : 0),
    top: anchor.y + (rotated ? 0 : index * TAB_LAYOUT.gap),
    angle: rotated ? -90 : 0,
  }));
  const relativeTabs = tabs.flatMap((tab) => {
    const point = project(tab.left - anchor.x, tab.top - anchor.y);
    const x = point.x - center.x,
      y = point.y - center.y;
    return [
      { x, y },
      { x: x + TAB_LAYOUT.width, y: y + TAB_LAYOUT.height },
    ];
  });
  const bounds = [...relativeDevice, ...relativeTabs];
  const minX = Math.min(...bounds.map((p) => p.x)),
    maxX = Math.max(...bounds.map((p) => p.x));
  const minY = Math.min(...bounds.map((p) => p.y)),
    maxY = Math.max(...bounds.map((p) => p.y));
  const scale = Math.min(
    1,
    availableWidth / (maxX - minX),
    availableHeight / (maxY - minY),
  );
  const idealX = offsetLeft + left + availableWidth / 2,
    idealY = offsetTop + top + availableHeight / 2;
  const x = clamp(
      idealX,
      offsetLeft + left - minX * scale,
      offsetLeft + right - maxX * scale,
    ),
    y = clamp(
      idealY,
      offsetTop + top - minY * scale,
      offsetTop + bottom - maxY * scale,
    );
  return {
    canvasWidth: geometry.width,
    canvasHeight: geometry.height,
    angle: rotated ? 90 : 0,
    scale,
    renderedWidth: (rotated ? geometry.height : geometry.width) * scale,
    renderedHeight: (rotated ? geometry.width : geometry.height) * scale,
    x,
    y,
    tabs,
  };
}

export function installBrowserLayout({ native = false } = {}) {
  const root = document.documentElement,
    body = document.body;
  if (!native)
    document.querySelector('meta[name="viewport"]').content =
      "width=device-width,initial-scale=1,viewport-fit=cover";
  const probe = document.createElement("div");
  probe.className = "safe-area-probe";
  probe.setAttribute("aria-hidden", "true");
  root.append(probe);
  let frame = 0,
    portrait = innerHeight > innerWidth;
  function update() {
    const appearance = skinFor(body.dataset.skin || "carthing"),
      compact = body.classList.contains("compact-mode");
    const mobile =
      !native &&
      Math.min(innerWidth, innerHeight) <= 600 &&
      (matchMedia("(pointer:coarse)").matches ||
        innerWidth <= 700 ||
        (innerWidth <= 1000 && innerHeight <= 600));
    root.classList.toggle("mobile-viewport", mobile);
    body.classList.toggle(
      "mobile-landscape",
      mobile && appearance.id === "carthing",
    );
    root.classList.toggle(
      "ipod-viewport",
      appearance.id === "ipod" && !compact,
    );
    root.classList.toggle(
      "walkman-viewport",
      appearance.id === "walkman" && !compact,
    );
    root.classList.toggle("aligned-viewport", !compact);
    body.classList.toggle("aligned-device", !compact);
    if (!mobile && compact) return;
    if (!(document.activeElement instanceof HTMLInputElement))
      portrait = innerHeight > innerWidth;
    const viewport = window.visualViewport,
      style = getComputedStyle(probe);
    const layout = fitLandscape({
      width: viewport?.width || innerWidth,
      height: viewport?.height || innerHeight,
      offsetLeft: viewport?.offsetLeft || 0,
      offsetTop: viewport?.offsetTop || 0,
      portrait,
      mobile,
      compact,
      skin: appearance.id,
      insets: {
        top: parseFloat(style.paddingTop),
        right: parseFloat(style.paddingRight),
        bottom: parseFloat(style.paddingBottom),
        left: parseFloat(style.paddingLeft),
      },
    });
    for (const [key, value] of Object.entries({
      x: `${layout.x}px`,
      y: `${layout.y}px`,
      scale: layout.scale,
      angle: `${layout.angle}deg`,
      width: `${layout.canvasWidth}px`,
      height: `${layout.canvasHeight}px`,
    }))
      body.style.setProperty(`--mobile-${key}`, value);
    for (const tab of layout.tabs || []) {
      const node = document.querySelector(`.brand-tag[data-tab="${tab.id}"]`);
      if (!node) continue;
      Object.assign(node.style, {
        left: `${tab.left}px`,
        top: `${tab.top}px`,
        width: `${TAB_LAYOUT.width}px`,
        height: `${TAB_LAYOUT.height}px`,
        transformOrigin: "0 0",
        transform: `rotate(${tab.angle}deg)`,
      });
    }
    body.classList.toggle("mobile-portrait", portrait);
  }
  const schedule = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(update);
  };
  window.addEventListener("resize", schedule);
  window.visualViewport?.addEventListener("resize", schedule);
  window.visualViewport?.addEventListener("scroll", schedule);
  document.addEventListener("focusout", schedule);
  new MutationObserver(schedule).observe(body, {
    attributes: true,
    attributeFilter: ["class", "data-skin"],
  });
  update();
}
