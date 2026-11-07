export class MediaFiles {
  constructor() {
    this.urls = new Map();
  }
  open() {
    return (
      this.database ||
      (this.database = new Promise((resolve, reject) => {
        const request = indexedDB.open("yuyin-media-v1", 1);
        request.onupgradeneeded = () =>
          request.result.createObjectStore("files");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }).catch((e) => {
        this.database = null;
        throw e;
      }))
    );
  }
  async save(entries) {
    const db = await this.open();
    await new Promise((resolve, reject) => {
      const tx = db.transaction("files", "readwrite");
      for (const [key, file] of entries) tx.objectStore("files").put(file, key);
      tx.oncomplete = resolve;
      tx.onabort = tx.onerror = () =>
        reject(
          Error("Unable to store music files. Check browser storage space."),
        );
    });
  }
  async url(key) {
    if (this.urls.has(key)) return this.urls.get(key);
    const db = await this.open();
    const file = await new Promise((resolve, reject) => {
      const req = db.transaction("files").objectStore("files").get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    if (!file) return null;
    const url = URL.createObjectURL(file);
    this.urls.set(key, url);
    return url;
  }
}
export function chooseFolder() {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.webkitdirectory = true;
    input.multiple = true;
    input.hidden = true;
    document.body.append(input);
    input.addEventListener(
      "change",
      () => {
        const files = Array.from(input.files);
        input.remove();
        resolve(files);
      },
      { once: true },
    );
    input.addEventListener(
      "cancel",
      () => {
        input.remove();
        resolve([]);
      },
      { once: true },
    );
    try {
      input.click();
    } catch (e) {
      input.remove();
      reject(e);
    }
  });
}
export async function scanBrowserFolder(files) {
  if (!files.length) return null;
  const title = files[0].webkitRelativePath?.split("/")[0] || "Local music";
  const direct = files.filter(
    (f) =>
      !f.webkitRelativePath || f.webkitRelativePath.split("/").length === 2,
  );
  const audio = direct
    .filter((f) => /\.(mp3|m4a|aac|flac|wav|ogg)$/i.test(f.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (!audio.length)
    throw Error("The selected folder contains no supported audio files.");
  const manifest =
    title +
    "\n" +
    audio.map((f) => `${f.name}:${f.size}:${f.lastModified}`).join("\n");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(manifest),
  );
  const key = Array.from(new Uint8Array(digest))
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 24);
  const id = `browser-playlist:${key}`;
  const images = new Map(
    direct
      .filter((f) => /\.(png|jpe?g|webp)$/i.test(f.name))
      .map((f) => [f.name.replace(/\.[^.]+$/, "").toLowerCase(), f]),
  );
  const entries = [];
  if (images.has(title.toLowerCase()))
    entries.push([`cover:${id}`, images.get(title.toLowerCase())]);
  const tracks = audio.map((file, index) => {
    const title = file.name.replace(/\.[^.]+$/, "");
    const id = `browser-local:${key}:${index}`;
    entries.push([`audio:${id}`, file]);
    if (images.has(title.toLowerCase()))
      entries.push([`cover:${id}`, images.get(title.toLowerCase())]);
    return {
      id,
      title,
      artist: "Local library",
      album: files[0].webkitRelativePath?.split("/")[0] || "Local music",
      seconds: 0,
      local: true,
      stream: null,
    };
  });
  return {
    playlist: {
      id,
      title,
      artist: "Local folder",
      track_count: tracks.length,
      followers: 0,
      browserLocal: true,
      tracks,
    },
    entries,
  };
}
