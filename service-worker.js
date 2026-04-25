import { buildPlanAsync } from "./src/build-115-plan.js";
import { createOpenAiLlmResolver } from "./src/openai-llm-resolver-client.js";
import { createTmdbClient } from "./src/tmdb-client.js";
import { normalizeExtensionSettings, summarizeExtensionSettings, validateExtensionSettings, EXTENSION_SETTINGS_STORAGE_KEY } from "./src/extension-settings.js";

async function chromeStorageGet(key) {
  return chrome.storage.local.get(key);
}

async function chromeStorageSet(value) {
  return chrome.storage.local.set(value);
}

async function chromeStorageRemove(key) {
  return chrome.storage.local.remove(key);
}

async function readSettings() {
  const payload = await chromeStorageGet(EXTENSION_SETTINGS_STORAGE_KEY);
  return normalizeExtensionSettings(payload[EXTENSION_SETTINGS_STORAGE_KEY] ?? {});
}

async function saveSettings(settings) {
  const validation = validateExtensionSettings(settings);
  if (!validation.ok) {
    throw new Error(validation.errors.join("；"));
  }

  await chromeStorageSet({
    [EXTENSION_SETTINGS_STORAGE_KEY]: validation.settings,
  });

  return validation.settings;
}

async function clearSettings() {
  await chromeStorageRemove(EXTENSION_SETTINGS_STORAGE_KEY);
}

async function loadCleanupOverrides() {
  try {
    const response = await fetch(chrome.runtime.getURL("config/media-cleanup-overrides.json"));
    if (!response.ok) {
      return {};
    }

    const payload = await response.json();
    return payload && typeof payload === "object" ? payload : {};
  } catch {
    return {};
  }
}

function normalizeSourceData(value = {}) {
  return value && typeof value === "object" ? value : {};
}

function attachExecutionContext(plan, { sourceData, executionRoot, rootPath }) {
  const normalizedSourceData = normalizeSourceData(sourceData);
  const normalizedExecutionRoot = normalizeSourceData(executionRoot);
  const executionRootCid = normalizedExecutionRoot.cid ?? normalizedSourceData.cid ?? null;
  const executionFolderName =
    normalizedExecutionRoot.folderName ??
    normalizedSourceData.folderName ??
    rootPath ??
    "当前目录";

  return {
    ...plan,
    rootCid: executionRootCid,
    executionRootCid,
    folderName: executionFolderName,
    executionFolderName,
    sourceRootCid: normalizedSourceData.cid ?? null,
    sourceFolderName: normalizedSourceData.folderName ?? rootPath ?? "当前目录",
  };
}

async function buildPlan(messagePayload = {}) {
  const settings = await readSettings();
  const mode = messagePayload.mode ?? "classify";
  const entries = Array.isArray(messagePayload.entries) ? messagePayload.entries : [];
  const sourceData = normalizeSourceData(messagePayload.sourceData);
  const rootPath = messagePayload.rootPath ?? sourceData.rootPath ?? sourceData.folderName ?? "";
  const inputContext = {
    rootPath,
    sourceRootRelativePath: sourceData.sourceRootRelativePath,
    state: sourceData.state,
    pendingFolderCount: sourceData.pendingFolderCount,
    folderFetchCount: sourceData.folderFetchCount,
    entryCount: sourceData.entryCount,
    pausedReason: sourceData.pausedReason,
  };
  const configuredTargetRoot = settings.targetRootCid
    ? {
        cid: settings.targetRootCid,
        folderName: settings.targetRootName || "整理目标目录",
      }
    : null;
  const executionRoot = messagePayload.executionRoot ?? configuredTargetRoot;
  const cleanupOverrides = await loadCleanupOverrides();
  const options = {
    mode,
    rootPath,
    sourceRootRelativePath: sourceData.sourceRootRelativePath,
    inputContext,
    executionRootPath: executionRoot?.folderName ?? sourceData.folderName ?? "",
    cleanupOverrides,
  };

  if (mode === "tmdb-normalize") {
    if (!settings.tmdbApiKey) {
      throw new Error("缺少 TMDB_API_KEY，请先在扩展设置页配置。");
    }

    options.tmdbClient = createTmdbClient({
      apiKey: settings.tmdbApiKey,
      baseUrl: settings.tmdbBaseUrl,
      fetchImpl: fetch,
    });

    if (settings.enableLlmFallback) {
      if (!settings.openaiApiKey) {
        throw new Error("已启用 LLM fallback，但缺少 OPENAI_API_KEY。");
      }

      options.llmResolver = createOpenAiLlmResolver({
        apiKey: settings.openaiApiKey,
        baseUrl: settings.openaiBaseUrl,
        model: settings.openaiModel,
        fetchImpl: fetch,
        throwOnError: true,
      });
    } else {
      options.llmResolver = null;
    }
  }

  const plan = await buildPlanAsync(entries, options);
  return attachExecutionContext(plan, {
    sourceData: messagePayload.sourceData,
    executionRoot,
    rootPath,
  });
}

async function openOptionsPage() {
  await chrome.runtime.openOptionsPage();
  return { opened: true };
}

// 设置页统一由后台打开，兼容工具栏点击和页面面板消息。
chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== "object" || !String(message.type ?? "").startsWith("organize115:")) {
    return false;
  }

  Promise.resolve()
    .then(async () => {
      if (message.type === "organize115:getSettingsSummary") {
        const settings = await readSettings();
        return summarizeExtensionSettings(settings);
      }

      if (message.type === "organize115:getSettings") {
        return readSettings();
      }

      if (message.type === "organize115:saveSettings") {
        const settings = await saveSettings(message.payload ?? {});
        return summarizeExtensionSettings(settings);
      }

      if (message.type === "organize115:clearSettings") {
        await clearSettings();
        return summarizeExtensionSettings({});
      }

      if (message.type === "organize115:buildPlan") {
        return buildPlan(message.payload ?? {});
      }

      if (message.type === "organize115:openOptions") {
        return openOptionsPage();
      }

      throw new Error(`未知消息类型: ${message.type}`);
    })
    .then(
      (payload) => sendResponse({ ok: true, payload }),
      (error) => {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      },
    );

  return true;
});
