import { test } from "node:test";
import assert from "node:assert/strict";
import { ArtworkPreloader } from "../web/core/artwork-preloader.mjs";

test("artwork preloader returns small batches progressively", async () => {
  const fetched = [];
  const displayed = [];
  const loader = new ArtworkPreloader({
    batchSize: 2,
    fetchBatch: async (ids) => {
      fetched.push(ids);
      return Object.fromEntries(ids.map((id) => [id, `cover:${id}`]));
    },
    onBatch: (items, result) =>
      displayed.push(items.map((item) => result[item.id])),
  });
  loader.enqueue(["a", "b", "c", "d", "e"].map((id) => ({ id })));
  await loader.whenIdle();
  assert.deepEqual(fetched, [["a", "b"], ["c", "d"], ["e"]]);
  assert.deepEqual(displayed, [
    ["cover:a", "cover:b"],
    ["cover:c", "cover:d"],
    ["cover:e"],
  ]);
});

test("visible artwork jumps ahead of queued background work", async () => {
  let releaseFirst;
  const first = new Promise((resolve) => (releaseFirst = resolve));
  const fetched = [];
  const loader = new ArtworkPreloader({
    batchSize: 1,
    fetchBatch: async (ids) => {
      fetched.push(ids[0]);
      if (ids[0] === "background-1") await first;
      return {};
    },
    onBatch: () => {},
  });
  loader.enqueue([{ id: "background-1" }, { id: "background-2" }]);
  await Promise.resolve();
  loader.enqueue([{ id: "visible" }], { priority: true });
  releaseFirst();
  await loader.whenIdle();
  assert.deepEqual(fetched, ["background-1", "visible", "background-2"]);
});
