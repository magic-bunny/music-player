import { test } from "node:test";
import assert from "node:assert/strict";
import { readPreferences, savePreferences } from "../web/core/preferences.mjs";
import { messages, setLanguage, t } from "../web/ui/i18n.mjs";
test("preferences survive a reload; invalid or old storage falls back safely", () => {
  let data = null;
  const storage = {
    getItem: () => data,
    setItem: (_, value) => (data = value),
  };
  assert.deepEqual(readPreferences(storage), {
    language: "en",
    source: "netease",
  });
  savePreferences(storage, { language: "ja", source: "audius" });
  assert.deepEqual(readPreferences(storage), {
    language: "ja",
    source: "audius",
  });
  data = "invalid JSON";
  assert.deepEqual(readPreferences(storage), {
    language: "en",
    source: "netease",
  });
  data = '{"language":"invalid","source":null}';
  assert.deepEqual(readPreferences(storage), {
    language: "en",
    source: "netease",
  });
});
test("all interface translations preserve interpolation tokens and metadata", () => {
  for (const [english, translated] of Object.entries(messages))
    for (const text of translated) {
      assert.ok(text.trim());
      assert.deepEqual(
        [...text.matchAll(/\{\w+\}/g)].map((x) => x[0]).sort(),
        [...english.matchAll(/\{\w+\}/g)].map((x) => x[0]).sort(),
      );
    }
  for (const [lang, label] of [
    ["zh", "设置"],
    ["en", "Settings"],
    ["ja", "設定"],
  ]) {
    setLanguage(lang);
    assert.equal(t("Settings"), label);
    assert.equal(t("Artist original title"), "Artist original title");
    assert.ok(t("{count} songs", { count: 12 }).includes("12"));
  }
});
