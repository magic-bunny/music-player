const finalValue = (value) =>
  Array.isArray(value) ? value[value.length - 1] : value;

export function applyFinalFrame(target, keyframes) {
  for (const [property, value] of Object.entries(keyframes)) {
    const result = finalValue(value);
    if (property.startsWith("--"))
      target.style.setProperty(property, String(result));
    else target.style[property] = String(result);
  }
}

export function clearMotionStyles(target, properties) {
  for (const property of properties) {
    if (property.startsWith("--")) target.style.removeProperty(property);
    else target.style[property] = "";
  }
}

export function reducedMotion() {
  return Boolean(
    (typeof document !== "undefined" &&
      document.documentElement?.dataset.disableMotion === "true") ||
    typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
}

export async function animateElement(
  target,
  keyframes,
  options,
  { animate = globalThis.Motion?.animate, reduce = reducedMotion() } = {},
) {
  if (reduce || typeof animate !== "function") {
    applyFinalFrame(target, keyframes);
    return;
  }
  await animate(target, keyframes, options);
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
    if (typeof requestAnimationFrame === "function")
      requestAnimationFrame(() => {
        clearTimeout(fallback);
        finish();
      });
  });

export async function transitionSkin(
  commit,
  { target = document.body, animate, reduce } = {},
) {
  const dependencies = { animate, reduce };
  target.classList.add("skin-transitioning");
  try {
    await animateElement(
      target,
      { opacity: [1, 0], filter: ["blur(0px)", "blur(5px)"] },
      { duration: 0.16, ease: "easeIn" },
      dependencies,
    );
    await commit();
    await nextFrame();
    await animateElement(
      target,
      { opacity: [0, 1], filter: ["blur(5px)", "blur(0px)"] },
      { duration: 0.3, ease: [0.16, 1, 0.3, 1] },
      dependencies,
    );
  } finally {
    clearMotionStyles(target, ["opacity", "filter"]);
    target.classList.remove("skin-transitioning");
  }
}
