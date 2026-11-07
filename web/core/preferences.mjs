export const languages = ["en", "zh", "ja"];
export const defaultPreferences = Object.freeze({
  language: "en",
  source: "netease",
});
const key = "yuyin-preferences-v1";
export function readPreferences(storage) {
  try {
    const value = JSON.parse(storage.getItem(key));
    return {
      language: languages.includes(value?.language) ? value.language : "en",
      source:
        typeof value?.source === "string" &&
        /^[a-z][a-z0-9-]{0,63}$/.test(value.source)
          ? value.source
          : "netease",
    };
  } catch {
    return { ...defaultPreferences };
  }
}
export function savePreferences(storage, value) {
  storage.setItem(
    key,
    JSON.stringify({ language: value.language, source: value.source }),
  );
}
