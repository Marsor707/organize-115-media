import {
  DEFAULT_EXTENSION_SETTINGS,
  EXTENSION_SETTINGS_STORAGE_KEY,
  normalizeExtensionSettings,
  validateExtensionSettings,
} from "./src/extension-settings.js";

const form = document.getElementById("settings-form");
const statusEl = document.getElementById("status");
const clearButton = document.getElementById("clear");

const fields = {
  targetRootCid: document.getElementById("targetRootCid"),
  targetRootName: document.getElementById("targetRootName"),
  tmdbApiKey: document.getElementById("tmdbApiKey"),
  tmdbBaseUrl: document.getElementById("tmdbBaseUrl"),
  openaiApiKey: document.getElementById("openaiApiKey"),
  openaiBaseUrl: document.getElementById("openaiBaseUrl"),
  openaiModel: document.getElementById("openaiModel"),
  enableLlmFallback: document.getElementById("enableLlmFallback"),
};

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#9f2f24" : "#0f4e63";
}

function fillForm(settings) {
  fields.targetRootCid.value = settings.targetRootCid;
  fields.targetRootName.value = settings.targetRootName;
  fields.tmdbApiKey.value = settings.tmdbApiKey;
  fields.tmdbBaseUrl.value = settings.tmdbBaseUrl;
  fields.openaiApiKey.value = settings.openaiApiKey;
  fields.openaiBaseUrl.value = settings.openaiBaseUrl;
  fields.openaiModel.value = settings.openaiModel;
  fields.enableLlmFallback.checked = settings.enableLlmFallback;
}

function readForm() {
  return normalizeExtensionSettings({
    targetRootCid: fields.targetRootCid.value,
    targetRootName: fields.targetRootName.value,
    tmdbApiKey: fields.tmdbApiKey.value,
    tmdbBaseUrl: fields.tmdbBaseUrl.value,
    openaiApiKey: fields.openaiApiKey.value,
    openaiBaseUrl: fields.openaiBaseUrl.value,
    openaiModel: fields.openaiModel.value,
    enableLlmFallback: fields.enableLlmFallback.checked,
  });
}

async function loadSettings() {
  const payload = await chrome.storage.local.get(EXTENSION_SETTINGS_STORAGE_KEY);
  const settings = normalizeExtensionSettings(
    payload[EXTENSION_SETTINGS_STORAGE_KEY] ?? DEFAULT_EXTENSION_SETTINGS,
  );
  fillForm(settings);
  setStatus("设置已读取。");
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const validation = validateExtensionSettings(readForm());
  if (!validation.ok) {
    setStatus(validation.errors.join("；"), true);
    return;
  }

  await chrome.storage.local.set({
    [EXTENSION_SETTINGS_STORAGE_KEY]: validation.settings,
  });
  setStatus("设置已保存。");
});

clearButton.addEventListener("click", async () => {
  await chrome.storage.local.remove(EXTENSION_SETTINGS_STORAGE_KEY);
  fillForm(DEFAULT_EXTENSION_SETTINGS);
  setStatus("配置已清除。");
});

loadSettings().catch((error) => {
  setStatus(error instanceof Error ? error.message : String(error), true);
});
