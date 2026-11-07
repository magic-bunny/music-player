import { mkdir, copyFile, readdir, writeFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const source = new URL("../web/", import.meta.url),
  out = new URL("../dist/", import.meta.url);
await rm(out, { recursive: true, force: true });
async function copyTree(from, to) {
  await mkdir(to, { recursive: true });
  for (const entry of await readdir(from, { withFileTypes: true })) {
    if (entry.name === "testing") continue;
    if (entry.isDirectory()) {
      await copyTree(
        new URL(entry.name + "/", from),
        new URL(entry.name + "/", to),
      );
      continue;
    }
    if (!/\.(html|css|js|mjs|png|ico|svg|md|webmanifest)$/.test(entry.name))
      continue;
    await copyFile(new URL(entry.name, from), new URL(entry.name, to));
  }
}
await copyTree(source, out);
await writeFile(new URL(".nojekyll", out), "");
console.log(`GitHub Pages files: ${fileURLToPath(out)}`);
