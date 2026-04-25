export const EXTENSION_SETTINGS_STORAGE_KEY = "organize115MediaSettings";

export const DEFAULT_EXTENSION_SETTINGS = Object.freeze({
  targetRootCid: "",
  targetRootName: "",
  tmdbApiKey: "",
  tmdbBaseUrl: "https://api.themoviedb.org/3",
  openaiApiKey: "",
  openaiBaseUrl: "https://api.openai.com/v1",
  openaiModel: "gpt-5.4-mini",
  enableLlmFallback: false,
});

function normalizeUrl(value, fallback) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return fallback;
  }

  return raw.replace(/\/+$/u, "");
}

function normalizeBoolean(value) {
  return value === true || value === "true";
}

export function normalizeExtensionSettings(value = {}) {
  return {
    targetRootCid: String(value.targetRootCid ?? value.TARGET_ROOT_CID ?? "").trim(),
    targetRootName: String(value.targetRootName ?? value.TARGET_ROOT_NAME ?? "").trim(),
    tmdbApiKey: String(value.tmdbApiKey ?? value.TMDB_API_KEY ?? "").trim(),
    tmdbBaseUrl: normalizeUrl(
      value.tmdbBaseUrl ?? value.TMDB_API_BASE_URL,
      DEFAULT_EXTENSION_SETTINGS.tmdbBaseUrl,
    ),
    openaiApiKey: String(value.openaiApiKey ?? value.OPENAI_API_KEY ?? "").trim(),
    openaiBaseUrl: normalizeUrl(
      value.openaiBaseUrl ?? value.OPENAI_BASE_URL,
      DEFAULT_EXTENSION_SETTINGS.openaiBaseUrl,
    ),
    openaiModel: String(value.openaiModel ?? value.OPENAI_MODEL ?? DEFAULT_EXTENSION_SETTINGS.openaiModel).trim(),
    enableLlmFallback: normalizeBoolean(value.enableLlmFallback),
  };
}

export function validateExtensionSettings(value = {}) {
  const settings = normalizeExtensionSettings(value);
  const errors = [];

  for (const [key, urlValue] of [
    ["tmdbBaseUrl", settings.tmdbBaseUrl],
    ["openaiBaseUrl", settings.openaiBaseUrl],
  ]) {
    try {
      const url = new URL(urlValue);
      if (!["http:", "https:"].includes(url.protocol)) {
        errors.push(`${key} 只支持 http/https`);
      }
    } catch {
      errors.push(`${key} 不是合法 URL`);
    }
  }

  if (!settings.openaiModel) {
    errors.push("openaiModel 不能为空");
  }

  if (settings.targetRootName && !settings.targetRootCid) {
    errors.push("targetRootName 已填写时必须同时填写 targetRootCid");
  }

  if (settings.enableLlmFallback && !settings.openaiApiKey) {
    errors.push("启用 LLM fallback 时必须填写 OPENAI_API_KEY");
  }

  return {
    ok: errors.length === 0,
    errors,
    settings,
  };
}

export function maskSecret(value = "") {
  const raw = String(value ?? "");
  if (!raw) {
    return "";
  }

  if (raw.length <= 8) {
    return "********";
  }

  return `${raw.slice(0, 4)}****${raw.slice(-4)}`;
}

export function summarizeExtensionSettings(value = {}) {
  const settings = normalizeExtensionSettings(value);

  return {
    targetRootConfigured: Boolean(settings.targetRootCid),
    targetRootCid: settings.targetRootCid,
    targetRootName: settings.targetRootName,
    tmdbConfigured: Boolean(settings.tmdbApiKey),
    tmdbBaseUrl: settings.tmdbBaseUrl,
    openaiConfigured: Boolean(settings.openaiApiKey),
    openaiBaseUrl: settings.openaiBaseUrl,
    openaiModel: settings.openaiModel,
    enableLlmFallback: settings.enableLlmFallback,
    tmdbApiKeyMasked: maskSecret(settings.tmdbApiKey),
    openaiApiKeyMasked: maskSecret(settings.openaiApiKey),
  };
}
