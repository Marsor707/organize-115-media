import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_EXTENSION_SETTINGS,
  maskSecret,
  normalizeExtensionSettings,
  summarizeExtensionSettings,
  validateExtensionSettings,
} from "../src/extension-settings.js";

test("扩展设置会规范化 TMDB / OpenAI 字段和默认值", () => {
  const settings = normalizeExtensionSettings({
    TARGET_ROOT_CID: " 123456 ",
    TARGET_ROOT_NAME: " 影视库 ",
    TMDB_API_KEY: " tmdb-key ",
    TMDB_API_BASE_URL: "https://api.themoviedb.org/3/",
    OPENAI_API_KEY: " openai-key ",
    OPENAI_BASE_URL: "https://example.com/v1/",
    OPENAI_MODEL: "gpt-test",
    enableLlmFallback: "true",
  });

  assert.equal(settings.targetRootCid, "123456");
  assert.equal(settings.targetRootName, "影视库");
  assert.equal(settings.tmdbApiKey, "tmdb-key");
  assert.equal(settings.tmdbBaseUrl, "https://api.themoviedb.org/3");
  assert.equal(settings.openaiApiKey, "openai-key");
  assert.equal(settings.openaiBaseUrl, "https://example.com/v1");
  assert.equal(settings.openaiModel, "gpt-test");
  assert.equal(settings.enableLlmFallback, true);
});

test("扩展设置允许清空目标目录，但目标名称不能脱离 cid 单独保存", () => {
  assert.equal(validateExtensionSettings(DEFAULT_EXTENSION_SETTINGS).ok, true);

  const validation = validateExtensionSettings({
    ...DEFAULT_EXTENSION_SETTINGS,
    targetRootCid: "",
    targetRootName: "影视库",
  });

  assert.equal(validation.ok, false);
  assert.match(validation.errors.join("\n"), /targetRootCid/u);
});

test("扩展设置启用 LLM fallback 时会强制要求 OpenAI key", () => {
  const validation = validateExtensionSettings({
    ...DEFAULT_EXTENSION_SETTINGS,
    enableLlmFallback: true,
    openaiApiKey: "",
  });

  assert.equal(validation.ok, false);
  assert.match(validation.errors.join("\n"), /OPENAI_API_KEY/u);
});

test("扩展设置摘要只暴露 key 的脱敏信息", () => {
  const summary = summarizeExtensionSettings({
    targetRootCid: "target-cid",
    targetRootName: "影视库",
    tmdbApiKey: "tmdb-12345678",
    openaiApiKey: "openai-12345678",
  });

  assert.equal(maskSecret("abcd1234efgh"), "abcd****efgh");
  assert.equal(summary.targetRootConfigured, true);
  assert.equal(summary.targetRootCid, "target-cid");
  assert.equal(summary.targetRootName, "影视库");
  assert.equal(summary.tmdbConfigured, true);
  assert.equal(summary.openaiConfigured, true);
  assert.equal(summary.tmdbApiKeyMasked, "tmdb****5678");
  assert.equal(summary.openaiApiKeyMasked, "open****5678");
});
