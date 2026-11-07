import { test } from "node:test";
import assert from "node:assert/strict";
import {
  animateElement,
  applyFinalFrame,
  clearMotionStyles,
} from "../web/ui/animation.mjs";

function target() {
  const values = new Map();
  return {
    values,
    style: {
      opacity: "",
      filter: "",
      scale: "",
      setProperty: (name, value) => values.set(name, value),
      removeProperty: (name) => values.delete(name),
    },
  };
}

test("reduced motion applies the final state without starting an animation", async () => {
  const node = target();
  let started = false;
  await animateElement(
    node,
    { opacity: [1, 0.7], "--window-motion-scale": [1, 0.4] },
    {},
    {
      reduce: true,
      animate: () => {
        started = true;
      },
    },
  );
  assert.equal(started, false);
  assert.equal(node.style.opacity, "0.7");
  assert.equal(node.values.get("--window-motion-scale"), "0.4");
});

test("Motion receives the element, keyframes and transition options", async () => {
  const node = target(),
    calls = [];
  await animateElement(
    node,
    { scale: [0.9, 1] },
    { type: "spring", bounce: 0.1 },
    {
      reduce: false,
      animate: async (...args) => calls.push(args),
    },
  );
  assert.deepEqual(calls, [
    [node, { scale: [0.9, 1] }, { type: "spring", bounce: 0.1 }],
  ]);
});

test("motion cleanup removes custom and standard inline properties", () => {
  const node = target();
  applyFinalFrame(node, {
    opacity: [0, 1],
    filter: ["blur(4px)", "blur(0px)"],
    "--window-motion-scale": [0.4, 1],
  });
  clearMotionStyles(node, [
    "opacity",
    "filter",
    "--window-motion-scale",
  ]);
  assert.equal(node.style.opacity, "");
  assert.equal(node.style.filter, "");
  assert.equal(node.values.has("--window-motion-scale"), false);
});
