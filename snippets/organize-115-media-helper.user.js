(() => {
  "use strict";

  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  const PANEL_ID = "__organize115MediaHelperPanel";
  const PANEL_STYLE_ID = "__organize115MediaHelperStyle";
  const PREVIEW_MODAL_ID = "__organize115MediaPlanPreviewModal";
  const HELPER_RUNTIME = isExtensionRuntimeAvailable() ? "extension" : "userscript";
  const NON_EXTENSION_CONTEXT_MESSAGE =
    "请通过 Chrome 扩展加载项目根目录后使用 115 整理助手。";
  if (HELPER_RUNTIME !== "extension") {
    console.warn(`[115 整理助手] ${NON_EXTENSION_CONTEXT_MESSAGE}`);
    return;
  }
  const existingPanel = document.getElementById(PANEL_ID);
  if (existingPanel) {
    const existingRuntime = existingPanel.getAttribute("data-organize115-runtime") || "userscript";
    // Chrome 扩展优先接管旧面板，避免非扩展上下文抢占设置入口。
    if (HELPER_RUNTIME === "extension" && existingRuntime !== "extension") {
      existingPanel.remove();
      document.querySelectorAll(`[data-organize115-style="${PANEL_STYLE_ID}"]`).forEach((node) => node.remove());
    } else {
      return;
    }
  }

  const PAGE_SIZE = 100;
  const TREE_REQUEST_INTERVAL_MS = 3500;
  const TREE_FOLDER_INTERVAL_MS = 5000;
  const TREE_REQUEST_JITTER_MS = 1200;
  const TREE_REQUEST_RETRY_LIMIT = 3;
  const TREE_REQUEST_RETRY_DELAY_MS = 10000;
  const APPLY_REQUEST_INTERVAL_MS = 350;
  const APPLY_RESUME_DELAY_MS = 1 * 60 * 60 * 1000;
  const APPLY_LOCAL_STORAGE_KEY = "__115_apply_plan_state_v1__";
  const APPLY_DELETE_BATCH_SIZE = 10;
  const MEDIA_CATEGORY_ROOT_NAMES = new Set(["电影", "剧集", "动漫", "纪录片"]);
  const RISK_KEYWORDS = [
    "操作过于频繁",
    "请稍后再试",
    "请稍候再试",
    "访问过于频繁",
    "请求过于频繁",
    "网络请求异常",
    "访问受限",
    "验证码",
    "需要验证",
    "安全验证",
    "验证后继续",
    "风控",
  ];

  class HelperPauseError extends Error {
    constructor(message, details = {}) {
      super(message);
      this.name = "HelperPauseError";
      this.details = details;
      this.isHelperPauseError = true;
    }
  }

  class ApplyPlanPauseError extends Error {
    constructor(message, details = {}) {
      super(message);
      this.name = "ApplyPlanPauseError";
      this.details = details;
      this.isApplyPlanPause = true;
    }
  }

  const state = {
    currentCid: null,
    currentFolderName: null,
    busy: false,
    logs: [],
    lastCapture: null,
    importedPlan: null,
    captureStopRequested: false,
    executionPauseRequested: false,
    runInFlight: false,
    autoResumeTimerId: null,
    autoResumePollId: null,
    nextMoveIndex: 0,
    nextDeleteIndex: 0,
    folderCache: new Map(),
    failedWrapperDirs: new Set(),
    successfulMoveCountByWrapper: new Map(),
    renamedItemIds: new Set(),
    activeOperation: null,
    report: null,
    lastGeneratedPlan: null,
    planBundle: null,
    settingsSummary: null,
  };

  const ui = createPanel();
  refreshCurrentLocation();
  syncUi();
  loadSettingsSummary().catch((error) => {
    log(`读取扩展设置失败：${error instanceof Error ? error.message : String(error)}`, "warn");
  });

  window.__115MediaHelper = {
    captureCurrentFolder,
    captureFolderTreeSlowSafe,
    captureCurrentFolderTreeForPlanning,
    generatePlanFromLastCapture,
    downloadLastCapture,
    downloadLastPlan,
    setCurrentFolderAsTargetRoot,
    organizeCurrentFolderRecursively: generatePlanFromLastCapture,
    getImportedPlan: () => state.importedPlan,
    getReport: () => state.report,
    startExecutePlan,
    pause: requestPause,
    resume: () => startExecutePlan({ resumeRequested: true }),
  };

  function createPanel() {
    const style = document.createElement("style");
    style.setAttribute("data-organize115-style", PANEL_STYLE_ID);
    style.setAttribute("data-organize115-runtime", HELPER_RUNTIME);
    style.textContent = `
      #${PANEL_ID} {
        position: fixed;
        right: 16px;
        bottom: 16px;
        z-index: 2147483647;
        width: 360px;
        max-width: calc(100vw - 32px);
        color: #e5e7eb;
        background: #111827;
        border: 1px solid rgba(255, 255, 255, 0.18);
        border-radius: 8px;
        box-shadow: 0 14px 36px rgba(0, 0, 0, 0.28);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-size: 13px;
        line-height: 1.45;
      }
      #${PANEL_ID} * { box-sizing: border-box; }
      #${PANEL_ID} .helper-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 12px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.14);
      }
      #${PANEL_ID} .helper-title {
        font-size: 14px;
        font-weight: 700;
      }
      #${PANEL_ID} .helper-body {
        padding: 10px 12px 12px;
      }
      #${PANEL_ID} .helper-grid {
        display: grid;
        gap: 8px;
      }
      #${PANEL_ID} .helper-row {
        display: grid;
        gap: 6px;
      }
      #${PANEL_ID} .helper-row-target,
      #${PANEL_ID} .helper-row-settings {
        grid-template-columns: minmax(0, 1fr);
      }
      #${PANEL_ID} .helper-row-capture {
        grid-template-columns: minmax(118px, 1.35fr) repeat(2, minmax(0, 1fr));
      }
      #${PANEL_ID} .helper-row-plan {
        grid-template-columns: repeat(4, minmax(0, 1fr));
      }
      #${PANEL_ID} .helper-row-execute {
        grid-template-columns: minmax(118px, 1.45fr) repeat(2, minmax(0, 1fr));
      }
      #${PANEL_ID} button {
        min-height: 32px;
        padding: 0 8px;
        border: 1px solid rgba(255, 255, 255, 0.16);
        border-radius: 6px;
        color: #f9fafb;
        background: #1f2937;
        cursor: pointer;
        white-space: nowrap;
      }
      #${PANEL_ID} button:hover { background: #374151; }
      #${PANEL_ID} .helper-primary {
        border-color: rgba(45, 212, 191, 0.52);
        background: #0f766e;
      }
      #${PANEL_ID} .helper-primary:hover { background: #0d9488; }
      #${PANEL_ID} button:disabled {
        color: #9ca3af;
        cursor: not-allowed;
        background: #1f2937;
        opacity: 0.64;
      }
      #${PANEL_ID} .helper-danger {
        border-color: rgba(248, 113, 113, 0.55);
        background: #7f1d1d;
      }
      #${PANEL_ID} .helper-danger:hover { background: #991b1b; }
      #${PANEL_ID} .helper-muted {
        color: #9ca3af;
        word-break: break-all;
      }
      #${PANEL_ID} .helper-section {
        margin-top: 10px;
        padding-top: 10px;
        border-top: 1px solid rgba(255, 255, 255, 0.12);
      }
      #${PANEL_ID} .helper-summary,
      #${PANEL_ID} .helper-log {
        max-height: 132px;
        overflow: auto;
        padding: 8px;
        border-radius: 6px;
        background: rgba(255, 255, 255, 0.06);
        white-space: pre-wrap;
      }
      #${PANEL_ID} .helper-log {
        max-height: 120px;
        color: #d1d5db;
      }
      #${PANEL_ID} .helper-status {
        margin-top: 4px;
        color: #bfdbfe;
      }
      #${PANEL_ID} .helper-collapse {
        width: 28px;
        min-height: 24px;
        padding: 0;
      }
      #${PANEL_ID}.is-collapsed .helper-body { display: none; }
      #${PREVIEW_MODAL_ID} {
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        color: #e5e7eb;
        background: rgba(15, 23, 42, 0.72);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-size: 13px;
        line-height: 1.45;
      }
      #${PREVIEW_MODAL_ID} * { box-sizing: border-box; }
      #${PREVIEW_MODAL_ID} .preview-dialog {
        width: min(1280px, calc(100vw - 40px));
        max-height: calc(100vh - 40px);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        border: 1px solid rgba(148, 163, 184, 0.32);
        border-radius: 8px;
        background: #0f172a;
        box-shadow: 0 24px 64px rgba(0, 0, 0, 0.38);
      }
      #${PREVIEW_MODAL_ID} .preview-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
        padding: 16px 18px 12px;
        border-bottom: 1px solid rgba(148, 163, 184, 0.24);
      }
      #${PREVIEW_MODAL_ID} .preview-title {
        font-size: 17px;
        font-weight: 700;
      }
      #${PREVIEW_MODAL_ID} .preview-subtitle {
        margin-top: 4px;
        color: #94a3b8;
        word-break: break-all;
      }
      #${PREVIEW_MODAL_ID} .preview-close {
        width: 32px;
        min-width: 32px;
        min-height: 32px;
        border: 1px solid rgba(148, 163, 184, 0.32);
        border-radius: 6px;
        color: #e5e7eb;
        background: #1e293b;
        cursor: pointer;
      }
      #${PREVIEW_MODAL_ID} .preview-close:hover { background: #334155; }
      #${PREVIEW_MODAL_ID} .preview-body {
        min-height: 0;
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 14px 18px 18px;
      }
      #${PREVIEW_MODAL_ID} .preview-stats {
        display: grid;
        grid-template-columns: repeat(6, minmax(0, 1fr));
        gap: 8px;
      }
      #${PREVIEW_MODAL_ID} .preview-stat {
        min-width: 0;
        padding: 8px 10px;
        border: 1px solid rgba(148, 163, 184, 0.2);
        border-radius: 6px;
        background: rgba(30, 41, 59, 0.72);
      }
      #${PREVIEW_MODAL_ID} .preview-stat-label {
        color: #94a3b8;
        font-size: 12px;
      }
      #${PREVIEW_MODAL_ID} .preview-stat-value {
        margin-top: 3px;
        color: #f8fafc;
        font-weight: 700;
        word-break: break-all;
      }
      #${PREVIEW_MODAL_ID} .preview-tabs {
        display: flex;
        gap: 8px;
        overflow-x: auto;
        padding-bottom: 2px;
      }
      #${PREVIEW_MODAL_ID} .preview-tab {
        min-height: 32px;
        white-space: nowrap;
        border: 1px solid rgba(148, 163, 184, 0.28);
        border-radius: 6px;
        color: #cbd5e1;
        background: #1e293b;
        cursor: pointer;
      }
      #${PREVIEW_MODAL_ID} .preview-tab[aria-selected="true"] {
        color: #ecfeff;
        border-color: rgba(45, 212, 191, 0.62);
        background: #0f766e;
      }
      #${PREVIEW_MODAL_ID} .preview-tools {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      #${PREVIEW_MODAL_ID} .preview-search {
        flex: 1;
        min-width: 0;
        min-height: 34px;
        padding: 7px 10px;
        border: 1px solid rgba(148, 163, 184, 0.32);
        border-radius: 6px;
        color: #f8fafc;
        background: #020617;
        outline: none;
      }
      #${PREVIEW_MODAL_ID} .preview-search:focus {
        border-color: rgba(45, 212, 191, 0.72);
      }
      #${PREVIEW_MODAL_ID} .preview-count {
        color: #94a3b8;
        white-space: nowrap;
      }
      #${PREVIEW_MODAL_ID} .preview-table-wrap {
        height: min(62vh, 640px);
        min-height: 260px;
        overflow: auto;
        border: 1px solid rgba(148, 163, 184, 0.24);
        border-radius: 6px;
        background: rgba(2, 6, 23, 0.42);
      }
      #${PREVIEW_MODAL_ID} table {
        width: 100%;
        min-width: 1180px;
        border-collapse: separate;
        border-spacing: 0;
      }
      #${PREVIEW_MODAL_ID} th,
      #${PREVIEW_MODAL_ID} td {
        padding: 8px 10px;
        border-bottom: 1px solid rgba(148, 163, 184, 0.16);
        border-right: 1px solid rgba(148, 163, 184, 0.1);
        text-align: left;
        vertical-align: top;
        white-space: pre-wrap;
        word-break: break-word;
      }
      #${PREVIEW_MODAL_ID} th {
        position: sticky;
        top: 0;
        z-index: 1;
        color: #cbd5e1;
        background: #111827;
        font-weight: 700;
      }
      #${PREVIEW_MODAL_ID} td {
        color: #e2e8f0;
      }
      #${PREVIEW_MODAL_ID} .preview-empty {
        padding: 28px;
        color: #94a3b8;
        text-align: center;
      }
      @media (max-width: 760px) {
        #${PREVIEW_MODAL_ID} {
          padding: 10px;
        }
        #${PREVIEW_MODAL_ID} .preview-dialog {
          width: calc(100vw - 20px);
          max-height: calc(100vh - 20px);
        }
        #${PREVIEW_MODAL_ID} .preview-stats {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        #${PREVIEW_MODAL_ID} .preview-tools {
          align-items: stretch;
          flex-direction: column;
        }
        #${PREVIEW_MODAL_ID} .preview-count {
          white-space: normal;
        }
      }
    `;
    document.documentElement.appendChild(style);

    const panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.setAttribute("data-organize115-runtime", HELPER_RUNTIME);
    panel.innerHTML = `
      <div class="helper-head">
        <div>
          <div class="helper-title">115 整理助手</div>
          <div class="helper-muted" data-role="cid"></div>
        </div>
        <button class="helper-collapse" data-action="collapse" title="折叠/展开">-</button>
      </div>
      <div class="helper-body">
        <div class="helper-grid">
          <div class="helper-row helper-row-target">
            <button data-action="set-target-root">设为目标目录</button>
          </div>
          <div class="helper-row helper-row-capture">
            <button class="helper-primary" data-action="capture-current">采集当前目录</button>
            <button data-action="import-capture">导入采集</button>
            <button data-action="download-capture">下载采集</button>
          </div>
          <div class="helper-row helper-row-plan">
            <button data-action="generate-plan">生成计划</button>
            <button data-action="download-plan">下载计划</button>
            <button data-action="import-plan">导入计划</button>
            <button data-action="preview-plan">预览计划</button>
          </div>
          <div class="helper-row helper-row-execute">
            <button class="helper-danger" data-action="execute-plan">执行计划</button>
            <button data-action="pause">暂停</button>
            <button data-action="resume">恢复</button>
          </div>
          <div class="helper-row helper-row-settings">
            <button data-action="open-options">设置</button>
          </div>
        </div>
        <input data-role="capture-file" type="file" accept="application/json,.json" hidden>
        <input data-role="plan-file" type="file" accept="application/json,.json" hidden>
        <div class="helper-section">
          <div class="helper-muted">状态</div>
          <div class="helper-status" data-role="status"></div>
        </div>
        <div class="helper-section">
          <div class="helper-muted">计划 / 进度</div>
          <div class="helper-summary" data-role="summary"></div>
        </div>
        <div class="helper-section">
          <div class="helper-muted">日志</div>
          <div class="helper-log" data-role="log"></div>
        </div>
      </div>
    `;
    document.body.appendChild(panel);

    panel.querySelector('[data-action="collapse"]').addEventListener("click", () => {
      panel.classList.toggle("is-collapsed");
      panel.querySelector('[data-action="collapse"]').textContent = panel.classList.contains("is-collapsed")
        ? "+"
        : "-";
    });
    panel.querySelector('[data-action="set-target-root"]').addEventListener("click", () => {
      setCurrentFolderAsTargetRoot().catch((error) => handleTopLevelError("设置目标目录失败", error));
    });
    panel.querySelector('[data-action="capture-current"]').addEventListener("click", () => {
      captureCurrentFolderTreeForPlanning().catch((error) => handleTopLevelError("采集当前目录失败", error));
    });
    panel.querySelector('[data-action="generate-plan"]').addEventListener("click", () => {
      generatePlanFromLastCapture().catch((error) => handleTopLevelError("生成计划失败", error));
    });
    panel.querySelector('[data-action="import-capture"]').addEventListener("click", () => {
      panel.querySelector('[data-role="capture-file"]').click();
    });
    panel.querySelector('[data-action="download-capture"]').addEventListener("click", downloadLastCapture);
    panel.querySelector('[data-action="download-plan"]').addEventListener("click", downloadLastPlan);
    panel.querySelector('[data-role="capture-file"]').addEventListener("change", importCaptureFromFile);
    panel.querySelector('[data-action="import-plan"]').addEventListener("click", () => {
      panel.querySelector('[data-role="plan-file"]').click();
    });
    panel.querySelector('[data-role="plan-file"]').addEventListener("change", importPlanFromFile);
    panel.querySelector('[data-action="preview-plan"]').addEventListener("click", () => {
      previewPlan();
      syncUi();
    });
    panel.querySelector('[data-action="execute-plan"]').addEventListener("click", () => {
      startExecutePlan().catch((error) => handleTopLevelError("执行计划失败", error));
    });
    panel.querySelector('[data-action="pause"]').addEventListener("click", requestPause);
    panel.querySelector('[data-action="resume"]').addEventListener("click", () => {
      startExecutePlan({ resumeRequested: true }).catch((error) => handleTopLevelError("恢复执行失败", error));
    });
    panel.querySelector('[data-action="open-options"]').addEventListener("click", () => {
      openExtensionOptions().catch((error) => handleTopLevelError("打开设置页失败", error));
    });

    return {
      panel,
      cid: panel.querySelector('[data-role="cid"]'),
      status: panel.querySelector('[data-role="status"]'),
      summary: panel.querySelector('[data-role="summary"]'),
      log: panel.querySelector('[data-role="log"]'),
      buttons: [...panel.querySelectorAll("button")],
      captureFileInput: panel.querySelector('[data-role="capture-file"]'),
      fileInput: panel.querySelector('[data-role="plan-file"]'),
    };
  }

  function refreshCurrentLocation() {
    const cid = getCurrentCid();
    if (state.currentCid !== cid) {
      state.currentFolderName = null;
    }
    state.currentCid = cid;
  }

  function getCurrentCid() {
    try {
      return new URL(window.location.href).searchParams.get("cid");
    } catch {
      return null;
    }
  }

  function setBusy(value) {
    state.busy = Boolean(value);
    syncUi();
  }

  function syncUi() {
    const cid = getCurrentCid();
    if (state.currentCid !== cid) {
      state.currentFolderName = null;
    }
    state.currentCid = cid;
    ui.cid.textContent = cid ? `cid=${cid}` : "未识别 cid，请打开 115 文件目录页";

    const report = state.report;
    const capture = state.lastCapture;
    const imported = state.importedPlan;
    const target = state.settingsSummary;
    const statusLines = [];
    if (state.busy) {
      statusLines.push("运行中");
    }
    if (target?.targetRootConfigured) {
      statusLines.push(`目标目录：${target.targetRootName || "未命名"}，cid=${target.targetRootCid}`);
    } else {
      statusLines.push("目标目录：未配置");
    }
    if (capture) {
      statusLines.push(`最近采集：${capture.state ?? "done"}，条目=${capture.entries?.length ?? 0}`);
      if (capture.pausedReason) {
        statusLines.push(`采集暂停：${capture.pausedReason}`);
      }
    }
    if (state.lastGeneratedPlan) {
      statusLines.push(`最近计划：${state.lastGeneratedPlan.mode ?? "unknown"}，move=${state.lastGeneratedPlan.moves?.length ?? 0}`);
    }
    if (state.planBundle) {
      statusLines.push(`计划批次：${state.planBundle.plans.length} 个，合并 move=${state.planBundle.combinedPlan.moves.length}`);
    }
    if (report) {
      statusLines.push(`执行状态：${report.status}`);
      statusLines.push(`move=${report.nextMoveIndex}/${report.total}，delete=${report.nextDeleteIndex}/${report.deleteTotal}`);
      if (report.resumeAt) {
        statusLines.push(`恢复时间：${formatTime(report.resumeAt)}`);
      }
    }
    ui.status.textContent = statusLines.join("\n") || "空闲";

    if (state.planBundle) {
      ui.summary.textContent = formatPlanBundleSummary(state.planBundle, report);
    } else if (imported) {
      ui.summary.textContent = formatPlanSummary(imported.summary, report);
    } else {
      ui.summary.textContent = "尚未生成整理计划。";
    }

    ui.log.textContent = state.logs.slice(-80).join("\n");
    for (const button of ui.buttons) {
      const action = button.getAttribute("data-action");
      const keepEnabled = action === "collapse" || action === "pause";
      button.disabled = state.busy && !keepEnabled;
    }
  }

  function log(message, level = "info") {
    const line = `[${new Date().toLocaleTimeString("zh-CN", { hour12: false })}] ${level}: ${message}`;
    state.logs.push(line);
    console[level === "error" ? "error" : level === "warn" ? "warn" : "log"](`[115 整理助手] ${message}`);
    syncUi();
  }

  function handleTopLevelError(prefix, error) {
    if (error?.isHelperPauseError || error?.isApplyPlanPause) {
      log(error.message, "warn");
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    log(`${prefix}: ${message}`, "error");
    window.alert(`${prefix}：${message}`);
    setBusy(false);
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function withJitter(baseMs) {
    return baseMs + Math.floor(Math.random() * TREE_REQUEST_JITTER_MS);
  }

  function sanitizeFilePart(value) {
    return String(value || "115")
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
  }

  function timestampForFile() {
    return new Date().toISOString().replace(/[:.]/g, "-");
  }

  function downloadJson(value, filename) {
    const blob = new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function downloadLastCapture() {
    if (!state.lastCapture) {
      window.alert("当前没有可下载的采集结果。");
      return;
    }

    const filename = `115-capture-${sanitizeFilePart(state.lastCapture.folderName || state.lastCapture.cid)}-${timestampForFile()}.json`;
    downloadJson(state.lastCapture, filename);
    log(`已下载采集：${filename}`);
  }

  function downloadLastPlan() {
    if (!state.lastGeneratedPlan && !state.planBundle) {
      window.alert("当前没有可下载的计划。");
      return;
    }

    const payload = state.planBundle ?? state.lastGeneratedPlan;
    const label = state.planBundle ? "cloud-download-bundle" : (state.lastGeneratedPlan?.folderName || state.lastGeneratedPlan?.mode);
    const filename = `115-plan-${sanitizeFilePart(label)}-${timestampForFile()}.json`;
    downloadJson(payload, filename);
    log(`已下载计划：${filename}`);
  }

  async function openExtensionOptions() {
    if (!isExtensionRuntimeAvailable()) {
      window.alert(NON_EXTENSION_CONTEXT_MESSAGE);
      return;
    }

    // content script 不直接打开设置页，交给 service worker 调用扩展 API。
    await sendExtensionMessage("organize115:openOptions");
  }

  function isExtensionRuntimeAvailable() {
    return (
      typeof chrome !== "undefined" &&
      chrome.runtime &&
      typeof chrome.runtime.sendMessage === "function"
    );
  }

  function sendExtensionMessage(type, payload = {}) {
    if (!isExtensionRuntimeAvailable()) {
      throw new Error(NON_EXTENSION_CONTEXT_MESSAGE);
    }

    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type, payload }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        if (!response?.ok) {
          reject(new Error(response?.error ?? "扩展后台未返回成功结果"));
          return;
        }

        resolve(response.payload);
      });
    });
  }

  async function loadSettingsSummary() {
    state.settingsSummary = await sendExtensionMessage("organize115:getSettingsSummary");
    syncUi();
    return state.settingsSummary;
  }

  async function readExtensionSettings() {
    return sendExtensionMessage("organize115:getSettings");
  }

  async function saveExtensionSettings(settings) {
    state.settingsSummary = await sendExtensionMessage("organize115:saveSettings", settings);
    syncUi();
    return state.settingsSummary;
  }

  async function resolveCurrentFolderName() {
    refreshCurrentLocation();
    if (!state.currentCid) {
      throw new Error("未从当前 URL 读取到 cid，请打开 115 文件目录页。");
    }

    if (state.currentFolderName) {
      return state.currentFolderName;
    }

    // 只读取第一页路径信息，避免为了保存目标目录触发全量采集。
    const firstPage = await fetchFolderPage(state.currentCid, 0);
    const folderName = firstPage.payload.path?.[firstPage.payload.path.length - 1]?.name || state.currentCid;
    state.currentFolderName = folderName;
    return folderName;
  }

  async function setCurrentFolderAsTargetRoot() {
    refreshCurrentLocation();
    if (!state.currentCid) {
      window.alert("未从当前 URL 读取到 cid，请打开 115 文件目录页。");
      return;
    }

    setBusy(true);
    try {
      const [settings, folderName] = await Promise.all([
        readExtensionSettings(),
        resolveCurrentFolderName(),
      ]);
      await saveExtensionSettings({
        ...settings,
        targetRootCid: state.currentCid,
        targetRootName: folderName,
      });
      log(`已设置整理目标目录：${folderName}，cid=${state.currentCid}`);
      window.alert(`已设置整理目标目录：${folderName}\ncid=${state.currentCid}`);
    } finally {
      setBusy(false);
    }
  }

  async function requireTargetRoot() {
    const summary = await loadSettingsSummary();
    if (!summary?.targetRootConfigured) {
      window.alert("请先打开目标目录页，点击“设为目标目录”。");
      return null;
    }

    return {
      cid: summary.targetRootCid,
      folderName: summary.targetRootName || "整理目标目录",
    };
  }

  function persistJsonItem(key, value) {
    if (!window.indexedDB) {
      return Promise.resolve(null);
    }

    return new Promise((resolve, reject) => {
      const request = window.indexedDB.open("organize115MediaExtension", 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("jsonItems")) {
          db.createObjectStore("jsonItems", { keyPath: "key" });
        }
      };
      request.onerror = () => reject(request.error ?? new Error("IndexedDB 打开失败"));
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("jsonItems", "readwrite");
        const store = tx.objectStore("jsonItems");
        store.put({
          key,
          value,
          updatedAt: new Date().toISOString(),
        });
        tx.oncomplete = () => {
          db.close();
          resolve(true);
        };
        tx.onerror = () => {
          const error = tx.error ?? new Error("IndexedDB 写入失败");
          db.close();
          reject(error);
        };
      };
    }).catch((error) => {
      log(`IndexedDB 写入失败：${error instanceof Error ? error.message : String(error)}`, "warn");
      return null;
    });
  }

  function buildFilesUrl(cid, offset, limit = PAGE_SIZE) {
    const url = new URL("https://webapi.115.com/files");
    url.search = new URLSearchParams({
      aid: "1",
      cid: String(cid),
      offset: String(offset),
      limit: String(limit),
      type: "0",
      show_dir: "1",
      fc_mix: "1",
      natsort: "1",
      count_folders: "1",
      format: "json",
      custom_order: "0",
    }).toString();
    return url.toString();
  }

  async function readJson(url, { retry = 1, pauseOnRisk = true } = {}) {
    let lastError = null;

    for (let attempt = 1; attempt <= retry; attempt += 1) {
      try {
        const response = await fetch(url, {
          credentials: "include",
          headers: {
            accept: "application/json, text/plain, */*",
          },
        });
        const text = await response.text();
        let payload = null;

        try {
          payload = JSON.parse(text);
        } catch {
          throw new Error(`接口未返回 JSON: ${url}`);
        }

        if (pauseOnRisk && isRateLimitPayload(response.status, payload, text)) {
          throw new HelperPauseError(`检测到 115 风控，已暂停请求：${readRiskMessage(payload) ?? `HTTP ${response.status}`}`, {
            url,
            responseStatus: response.status,
            payload,
          });
        }

        if (!response.ok) {
          throw new Error(`接口请求失败: HTTP ${response.status} ${url}`);
        }

        if (!payload || payload.state !== true) {
          throw new Error(`接口返回失败: ${payload?.error ?? payload?.message ?? "unknown"}`);
        }

        return payload;
      } catch (error) {
        if (error?.isHelperPauseError) {
          throw error;
        }

        lastError = error;
        if (attempt >= retry) {
          break;
        }

        log(`接口异常，准备重试 ${attempt}/${retry}: ${url}`, "warn");
        await sleep(TREE_REQUEST_RETRY_DELAY_MS * attempt);
      }
    }

    throw lastError ?? new Error(`接口读取失败: ${url}`);
  }

  async function fetchFolderPage(cid, offset, { retry = 1 } = {}) {
    const url = buildFilesUrl(cid, offset);
    const payload = await readJson(url, { retry });
    return {
      offset,
      url,
      payload,
    };
  }

  function resolveSourceRootRelativePath(rootPathNodes, fallbackFolderName) {
    const names = (rootPathNodes || [])
      .map((item) => String(item?.name ?? "").trim())
      .filter(Boolean);

    for (let index = names.length - 1; index >= 0; index -= 1) {
      if (MEDIA_CATEGORY_ROOT_NAMES.has(names[index])) {
        return names.slice(index).join("/");
      }
    }

    return MEDIA_CATEGORY_ROOT_NAMES.has(fallbackFolderName) ? fallbackFolderName : "";
  }

  async function captureCurrentFolder({ download = true } = {}) {
    refreshCurrentLocation();
    if (!state.currentCid) {
      window.alert("未从当前 URL 读取到 cid，请打开 115 文件目录页。");
      return;
    }

    setBusy(true);
    state.captureStopRequested = false;
    log(`开始采集当前目录：cid=${state.currentCid}`);

    try {
      const firstPage = await fetchFolderPage(state.currentCid, 0);
      const total = Number(firstPage.payload.count || 0);
      const pages = [firstPage];

      for (let offset = PAGE_SIZE; offset < total; offset += PAGE_SIZE) {
        if (state.captureStopRequested) {
          throw new HelperPauseError("用户暂停采集", { pausedReason: "manual-pause" });
        }

        log(`采集分页：offset=${offset}/${total}`);
        pages.push(await fetchFolderPage(state.currentCid, offset));
      }

      const entries = pages.flatMap((page) => page.payload.data || []);
      const folderName = firstPage.payload.path?.[firstPage.payload.path.length - 1]?.name || null;
      const sourceRootRelativePath = resolveSourceRootRelativePath(firstPage.payload.path, folderName);
      const result = {
        pageUrl: window.location.href,
        cid: state.currentCid,
        folderName,
        sourceRootRelativePath,
        scannedAt: new Date().toISOString(),
        pageSize: PAGE_SIZE,
        totalExpected: total,
        fetchedPages: pages.length,
        fileCount: firstPage.payload.file_count ?? null,
        folderCount: firstPage.payload.folder_count ?? null,
        entries,
        pageSummaries: pages.map((page) => ({
          offset: page.offset,
          fetched: Array.isArray(page.payload.data) ? page.payload.data.length : 0,
          count: page.payload.count,
          file_count: page.payload.file_count,
          folder_count: page.payload.folder_count,
          url: page.url,
        })),
        state: "done",
      };

      state.lastCapture = result;
      state.currentFolderName = folderName;
      window.__capture115AllPages = result;
      log(`当前目录采集完成：${entries.length} 条`);
      await persistJsonItem(`capture:${result.cid}:${result.scannedAt}`, result);
      if (download) {
        downloadLastCapture();
      }
      return result;
    } catch (error) {
      if (error?.isHelperPauseError) {
        const partial = {
          pageUrl: window.location.href,
          cid: state.currentCid,
          folderName: state.currentFolderName,
          scannedAt: new Date().toISOString(),
          entries: [],
          state: "paused",
          message: error.message,
          pausedReason: error.details?.pausedReason ?? "rate-limit-405",
          pauseContext: error.details ?? null,
        };
        state.lastCapture = partial;
        window.__capture115AllPages = partial;
      }
      throw error;
    } finally {
      setBusy(false);
    }
  }

  async function fetchFolderEntries(cid, relativePath) {
    const firstPage = await fetchFolderPage(cid, 0, { retry: TREE_REQUEST_RETRY_LIMIT });
    const total = Number(firstPage.payload.count || 0);
    const pages = [firstPage];

    for (let offset = PAGE_SIZE; offset < total; offset += PAGE_SIZE) {
      if (state.captureStopRequested) {
        throw new HelperPauseError("用户暂停采集", { pausedReason: "manual-pause" });
      }

      log(`递归分页：${relativePath || cid} offset=${offset}/${total}`);
      await sleep(withJitter(TREE_REQUEST_INTERVAL_MS));
      pages.push(await fetchFolderPage(cid, offset, { retry: TREE_REQUEST_RETRY_LIMIT }));
    }

    return {
      path: firstPage.payload.path || [],
      count: total,
      fileCount: firstPage.payload.file_count ?? null,
      folderCount: firstPage.payload.folder_count ?? null,
      entries: pages.flatMap((page) => page.payload.data || []),
      pageCount: pages.length,
    };
  }

  function normalizeEntry(item, parentPath) {
    const name = item.n;
    const source = parentPath ? `${parentPath}/${name}` : name;

    return {
      source,
      name,
      fid: item.fid ?? null,
      cid: item.cid ?? null,
      pid: item.pid ?? null,
      isDir: !item.fid && Boolean(item.cid),
      size: normalizeFileSize(item),
    };
  }

  function normalizeFileSize(item) {
    const fieldNames = ["size", "fileSize", "file_size", "fs", "s"];

    for (const fieldName of fieldNames) {
      if (!Object.prototype.hasOwnProperty.call(item, fieldName)) {
        continue;
      }

      const rawValue = item[fieldName];
      if (rawValue === null || rawValue === undefined || rawValue === "") {
        continue;
      }

      const numericValue =
        typeof rawValue === "number"
          ? rawValue
          : Number.parseFloat(String(rawValue).replace(/[,\s]/gu, ""));

      if (Number.isFinite(numericValue) && numericValue >= 0) {
        return numericValue;
      }
    }

    return null;
  }

  async function captureFolderTreeSlowSafe({ rootCid = null, download = true } = {}) {
    refreshCurrentLocation();
    const captureRootCid = rootCid ? String(rootCid) : state.currentCid;
    if (!captureRootCid) {
      window.alert("未从当前 URL 读取到 cid，请打开 115 文件目录页。");
      return;
    }

    setBusy(true);
    state.captureStopRequested = false;
    const startedAt = new Date().toISOString();
    const queue = [{ cid: captureRootCid, relativePath: "" }];
    const folders = [];
    const entries = [];
    let folderName = null;
    let sourceRootRelativePath = "";
    let currentFolder = "";

    const syncCaptureStatus = (payload) => {
      window.__capture115FolderTreeSlowSafeStatus = {
        state: payload.state,
        rootCid: captureRootCid,
        startedAt,
        pageSize: PAGE_SIZE,
        requestIntervalMs: TREE_REQUEST_INTERVAL_MS,
        folderIntervalMs: TREE_FOLDER_INTERVAL_MS,
        requestJitterMs: TREE_REQUEST_JITTER_MS,
        requestRetryLimit: TREE_REQUEST_RETRY_LIMIT,
        requestRetryDelayMs: TREE_REQUEST_RETRY_DELAY_MS,
        folderFetchCount: folders.length,
        entryCount: entries.length,
        pendingFolderCount: queue.length,
        currentFolder,
        message: payload.message,
        pausedReason: payload.pausedReason ?? null,
        pauseContext: payload.pauseContext ?? null,
        updatedAt: new Date().toISOString(),
        finishedAt: payload.finishedAt ?? null,
      };
    };

    const buildResult = (payload) => ({
      pageUrl: window.location.href,
      cid: captureRootCid,
      folderName,
      rootPath: folderName,
      sourceRootRelativePath,
      startedAt,
      finishedAt: payload.finishedAt ?? null,
      pageSize: PAGE_SIZE,
      requestIntervalMs: TREE_REQUEST_INTERVAL_MS,
      folderIntervalMs: TREE_FOLDER_INTERVAL_MS,
      requestJitterMs: TREE_REQUEST_JITTER_MS,
      requestRetryLimit: TREE_REQUEST_RETRY_LIMIT,
      requestRetryDelayMs: TREE_REQUEST_RETRY_DELAY_MS,
      folderFetchCount: folders.length,
      entryCount: entries.length,
      pendingFolderCount: queue.length,
      pendingQueuePreview: queue.slice(0, 30),
      folders,
      entries,
      state: payload.state,
      message: payload.message,
      pausedReason: payload.pausedReason ?? null,
      pauseContext: payload.pauseContext ?? null,
    });

    log(`开始低速递归采集：cid=${captureRootCid}`);
    syncCaptureStatus({ state: "running", message: "低速采集中" });

    try {
      const rootFolder = await fetchFolderEntries(captureRootCid, "");
      const rootPathNodes = rootFolder.path;
      folderName = rootPathNodes[rootPathNodes.length - 1]?.name ?? null;
      sourceRootRelativePath = resolveSourceRootRelativePath(rootPathNodes, folderName);
      state.currentFolderName = folderName;

      while (queue.length > 0) {
        if (state.captureStopRequested) {
          throw new HelperPauseError("用户暂停采集", { pausedReason: "manual-pause" });
        }

        const current = queue.shift();
        currentFolder = current.relativePath;
        syncCaptureStatus({
          state: "running",
          message: `低速采集中: ${currentFolder || folderName || captureRootCid}`,
        });
        log(`递归采集目录：${currentFolder || folderName || captureRootCid}`);

        const folderData = current.relativePath === "" ? rootFolder : await fetchFolderEntries(current.cid, current.relativePath);
        folders.push({
          cid: String(current.cid),
          relativePath: current.relativePath,
          count: folderData.count,
          fileCount: folderData.fileCount,
          folderCount: folderData.folderCount,
          pageCount: folderData.pageCount,
        });

        for (const item of folderData.entries) {
          const normalized = normalizeEntry(item, current.relativePath);
          entries.push(normalized);

          if (normalized.isDir) {
            queue.push({
              cid: normalized.cid,
              relativePath: normalized.source,
            });
          }
        }

        if (queue.length > 0) {
          syncCaptureStatus({
            state: "running",
            message: `已完成目录: ${currentFolder || folderName || state.currentCid}；准备冷却后继续`,
          });
          await sleep(withJitter(TREE_FOLDER_INTERVAL_MS));
        }
      }

      const result = buildResult({
        state: "done",
        message: "采集完成",
        finishedAt: new Date().toISOString(),
      });
      state.lastCapture = result;
      window.__capture115FolderTreeSlowSafe = result;
      syncCaptureStatus({ state: "done", message: "采集完成", finishedAt: result.finishedAt });
      log(`低速递归采集完成：目录=${folders.length}，条目=${entries.length}`);
      await persistJsonItem(`capture-tree:${result.cid}:${result.startedAt}`, result);
      if (download) {
        downloadLastCapture();
      }
      return result;
    } catch (error) {
      if (error?.isHelperPauseError) {
        const pauseContext = {
          currentFolder,
          pendingFolderCount: queue.length,
          pendingQueuePreview: queue.slice(0, 30),
          requestUrl: error.details?.url ?? null,
          responseStatus: error.details?.responseStatus ?? null,
        };
        const result = buildResult({
          state: "paused",
          message: error.message,
          finishedAt: new Date().toISOString(),
          pausedReason: error.details?.pausedReason ?? "rate-limit-405",
          pauseContext,
        });
        state.lastCapture = result;
        window.__capture115FolderTreeSlowSafe = result;
        syncCaptureStatus({
          state: "paused",
          message: error.message,
          finishedAt: result.finishedAt,
          pausedReason: result.pausedReason,
          pauseContext,
        });
        await persistJsonItem(`capture-tree:${result.cid}:${result.startedAt}`, result);
        if (download) {
          downloadLastCapture();
        }
      }
      throw error;
    } finally {
      setBusy(false);
    }
  }

  async function importCaptureFromFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const capture = normalizeCaptureForHelper(payload);
      state.lastCapture = capture;
      state.currentFolderName = capture.folderName ?? null;
      window.__capture115AllPages = capture;

      // 导入采集会替换计划输入源，必须清掉旧计划和执行进度，避免摘要误导。
      state.importedPlan = null;
      state.planBundle = null;
      state.lastGeneratedPlan = null;
      state.report = null;
      resetApplyRuntime();
      log(`已导入采集：${file.name}，cid=${capture.cid}，entries=${capture.entries.length}，可点击“生成计划”。`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      window.alert(`导入采集失败：${message}`);
      log(`导入采集失败：${message}`, "error");
    } finally {
      syncUi();
    }
  }

  async function importPlanFromFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      refreshCurrentLocation();
      state.importedPlan = normalizePlanForHelper(payload, {
        currentCid: state.currentCid,
        folderName: state.currentFolderName,
      });
      state.planBundle = null;
      state.lastGeneratedPlan = payload;
      state.report = null;
      resetApplyRuntime();
      previewPlan();
      log(`已导入计划：${file.name}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      window.alert(`导入计划失败：${message}`);
      log(`导入计划失败：${message}`, "error");
    } finally {
      syncUi();
    }
  }

  function normalizeCaptureForHelper(capture) {
    if (!capture || typeof capture !== "object" || Array.isArray(capture)) {
      throw new Error("采集 JSON 必须是对象");
    }
    if (!Array.isArray(capture.entries)) {
      if (Array.isArray(capture.moves)) {
        throw new Error("这是 plan，不是采集结果；请使用“导入计划”。");
      }
      throw new Error("采集 JSON 缺少 entries 数组");
    }

    const cid = String(capture.cid ?? "").trim();
    if (!cid) {
      throw new Error("采集 JSON 缺少 cid");
    }

    return {
      ...capture,
      cid,
      folderName: capture.folderName ?? null,
    };
  }

  async function captureCurrentFolderTreeForPlanning() {
    refreshCurrentLocation();
    if (!state.currentCid) {
      window.alert("未从当前 URL 读取到 cid，请打开 115 文件目录页。");
      return;
    }

    const result = await captureFolderTreeSlowSafe({
      rootCid: state.currentCid,
      download: false,
    });
    if (result) {
      log(`采集结果已保存：cid=${result.cid}，entries=${result.entries?.length ?? 0}，可点击“生成计划”。`);
    }
    syncUi();
    return result;
  }

  async function generatePlanFromLastCapture() {
    const capture = state.lastCapture;
    if (!capture || !Array.isArray(capture.entries)) {
      window.alert("请先点击“采集当前目录”。");
      log("没有可用于生成计划的采集结果，请先点击“采集当前目录”。", "warn");
      return null;
    }

    const executionRoot = await requireTargetRoot();
    if (!executionRoot) {
      log("未配置整理目标目录，已取消生成计划。", "warn");
      return null;
    }

    const plan = await installGeneratedPlanFromCapture(capture, {
      mode: "tmdb-normalize",
      label: capture.folderName || "当前目录",
      executionRoot,
    });
    log(`计划已生成：来源 cid=${plan.sourceRootCid}，目标 cid=${plan.executionRootCid}`);
    return plan;
  }

  async function generateCurrentTmdbPlan() {
    const capture = await ensureCurrentCapture();
    await installGeneratedPlanFromCapture(capture, {
      mode: "tmdb-normalize",
      label: capture.folderName || "当前目录",
      executionRoot: {
        cid: capture.cid,
        folderName: capture.folderName || "当前目录",
      },
    });
  }

  async function generatePendingReviewPlan() {
    const capture = await captureCurrentFolder({ download: false });
    await installGeneratedPlanFromCapture(capture, {
      mode: "tmdb-normalize",
      label: "/云下载/待人工确认",
      executionRoot: {
        cid: capture.cid,
        folderName: capture.folderName || "待人工确认",
      },
    });
  }

  async function generateAnimeFlattenPlan() {
    const capture = await captureFolderTreeSlowSafe({ download: false });
    await installGeneratedPlanFromCapture(capture, {
      mode: "flatten-wrapper-dir",
      label: "/云下载/动漫 拍平",
      executionRoot: {
        cid: capture.cid,
        folderName: capture.folderName || "动漫",
      },
    });
  }

  async function generateCloudDownloadTmdbPlans() {
    const rootCapture = await captureCurrentFolder({ download: false });
    const executionRoot = {
      cid: rootCapture.cid,
      folderName: rootCapture.folderName || "云下载",
    };
    const targetLabels = ["剧集", "动漫", "电影"];
    const plans = [];

    for (const label of targetLabels) {
      const child = findChildDirectory(rootCapture, label);
      if (!child) {
        throw new Error(`未在当前 /云下载 目录找到子目录：${label}`);
      }

      log(`准备采集并生成 ${label} TMDB 计划：cid=${child.cid}`);
      const capture = await captureFolderTreeSlowSafe({
        rootCid: child.cid,
        download: false,
      });
      const plan = await buildPlanFromCapture(capture, {
        mode: "tmdb-normalize",
        label,
        executionRoot,
      });
      plans.push({
        key: label,
        label,
        capture,
        plan,
        summary: summarizePlan(plan, {
          currentCid: executionRoot.cid,
          folderName: executionRoot.folderName,
        }),
      });
      await persistJsonItem(`plan:${label}:${plan.generatedAt}`, plan);
    }

    const combinedPlan = combinePlans(plans, executionRoot);
    state.lastGeneratedPlan = combinedPlan;
    state.planBundle = {
      generatedAt: combinedPlan.generatedAt,
      executionRoot,
      plans,
      combinedPlan,
    };
    state.importedPlan = normalizePlanForHelper(combinedPlan, {
      currentCid: executionRoot.cid,
      folderName: executionRoot.folderName,
    });
    state.report = null;
    resetApplyRuntime();
    await persistJsonItem(`plan-bundle:${executionRoot.cid}:${combinedPlan.generatedAt}`, state.planBundle);
    log(`历史批次计划生成完成：combined move=${combinedPlan.moves.length}, delete=${combinedPlan.deletes.length}`);
    syncUi();
  }

  async function ensureCurrentCapture() {
    refreshCurrentLocation();
    if (state.lastCapture && String(state.lastCapture.cid) === String(state.currentCid)) {
      return state.lastCapture;
    }

    return captureCurrentFolder({ download: false });
  }

  async function installGeneratedPlanFromCapture(capture, { mode, label, executionRoot }) {
    const plan = await buildPlanFromCapture(capture, {
      mode,
      label,
      executionRoot,
    });

    state.lastGeneratedPlan = plan;
    state.planBundle = null;
    state.importedPlan = normalizePlanForHelper(plan, {
      currentCid: plan.executionRootCid ?? executionRoot?.cid ?? state.currentCid,
      folderName: plan.executionFolderName ?? executionRoot?.folderName ?? capture.folderName,
    });
    state.report = null;
    resetApplyRuntime();
    await persistJsonItem(`plan:${label}:${plan.generatedAt}`, plan);
    previewPlan();
    syncUi();
    return plan;
  }

  function formatCountMapForLog(counts) {
    const entries = Object.entries(counts || {})
      .filter(([, count]) => Number(count) > 0)
      .sort((left, right) => Number(right[1]) - Number(left[1]));
    return entries.map(([key, count]) => `${key}=${count}`).join(", ");
  }

  function formatLlmFallbackLog(summary) {
    if (!summary || typeof summary !== "object") {
      return "";
    }

    const status = summary.enabled ? "已启用" : "未启用";
    const parts = [
      `LLM fallback ${status}`,
      `configured=${summary.configured === true}`,
      `calls=${summary.callCount ?? 0}`,
      `resolved=${summary.resolvedCount ?? 0}`,
      `rejected=${summary.rejectedCount ?? 0}`,
      `errors=${summary.errorCount ?? 0}`,
    ];
    const rejectedReasons = formatCountMapForLog(summary.rejectedReasonCounts);
    const errorReasons = formatCountMapForLog(summary.errorReasonCounts);

    if ((summary.errorCount ?? 0) > 0) {
      parts.push(`调用失败=${errorReasons || summary.errorCount}`);
    } else if ((summary.callCount ?? 0) === 0) {
      parts.push("未调用");
    } else if ((summary.rejectedCount ?? 0) > 0) {
      parts.push(`被拒绝=${rejectedReasons || summary.rejectedCount}`);
    }

    return parts.join("，");
  }

  async function buildPlanFromCapture(capture, { mode, label, executionRoot }) {
    if (!capture || !Array.isArray(capture.entries)) {
      throw new Error("缺少可用于生成计划的采集 entries");
    }

    setBusy(true);
    try {
      log(`开始生成计划：${label}，mode=${mode}，entries=${capture.entries.length}`);
      const plan = await sendExtensionMessage("organize115:buildPlan", {
        mode,
        entries: capture.entries,
        sourceData: {
          cid: capture.cid,
          folderName: capture.folderName,
          rootPath: capture.rootPath || capture.folderName,
          state: capture.state,
          pendingFolderCount: capture.pendingFolderCount,
          folderFetchCount: capture.folderFetchCount,
          entryCount: capture.entryCount,
          pausedReason: capture.pausedReason,
        },
        rootPath: capture.rootPath || capture.folderName || label,
        executionRoot,
      });
      log(`计划生成完成：${label}，move=${plan.moves?.length ?? 0}，delete=${plan.deletes?.length ?? 0}`);
      const llmFallbackLog = formatLlmFallbackLog(plan.llmFallbackSummary);
      if (llmFallbackLog) {
        log(llmFallbackLog, (plan.llmFallbackSummary?.errorCount ?? 0) > 0 ? "warn" : "info");
      }
      return plan;
    } finally {
      setBusy(false);
    }
  }

  function findChildDirectory(capture, label) {
    return (capture.entries || []).find((item) => {
      const name = item.n ?? item.name ?? item.source;
      const isDir = !item.fid && Boolean(item.cid);
      return isDir && name === label;
    });
  }

  function combinePlans(items, executionRoot) {
    const moves = items.flatMap((item) => item.plan.moves || []);
    const deletes = items.flatMap((item) => item.plan.deletes || []);
    const reviews = items.flatMap((item) => item.plan.reviews || []);
    const collisions = items.flatMap((item) => item.plan.collisions || []);
    const byCategory = {};

    for (const item of items) {
      for (const [category, count] of Object.entries(item.plan.summary?.byCategory || {})) {
        byCategory[category] = (byCategory[category] || 0) + Number(count || 0);
      }
    }

    return {
      generatedAt: new Date().toISOString(),
      mode: "cloud-download-tmdb-bundle",
      rootCid: executionRoot.cid,
      executionRootCid: executionRoot.cid,
      folderName: executionRoot.folderName,
      executionFolderName: executionRoot.folderName,
      summary: {
        totalEntries: items.reduce((sum, item) => sum + Number(item.plan.summary?.totalEntries || 0), 0),
        moveCount: moves.length,
        deleteCount: deletes.length,
        reviewCount: reviews.length,
        collisionCount: collisions.length,
        needsReviewCount: moves.filter((item) => item.needsReview === true).length,
        tmdbMatchedCount: items.reduce((sum, item) => sum + Number(item.plan.summary?.tmdbMatchedCount || 0), 0),
        tmdbMissCount: items.reduce((sum, item) => sum + Number(item.plan.summary?.tmdbMissCount || 0), 0),
        tmdbAmbiguousCount: items.reduce((sum, item) => sum + Number(item.plan.summary?.tmdbAmbiguousCount || 0), 0),
        byCategory,
      },
      collisions,
      reviews,
      moves,
      deletes,
      children: items.map((item) => ({
        key: item.key,
        label: item.label,
        generatedAt: item.plan.generatedAt,
        summary: item.plan.summary,
      })),
    };
  }

  function normalizePlanForHelper(plan, context = {}) {
    if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
      throw new Error("计划 JSON 必须是对象");
    }
    if (!Array.isArray(plan.moves)) {
      if (Array.isArray(plan.entries)) {
        throw new Error("这是采集结果，不是 plan；请使用“生成计划”生成 plan，或导入带 moves 数组的 plan JSON。");
      }
      throw new Error("计划 JSON 缺少 moves 数组");
    }
    if (plan.deletes !== undefined && !Array.isArray(plan.deletes)) {
      throw new Error("计划 JSON 的 deletes 必须是数组");
    }

    const summary = summarizePlan(plan, context);
    const normalizedPlan = {
      ...plan,
      rootCid: plan.rootCid ?? summary.executionRootCid,
      executionRootCid: summary.executionRootCid,
      folderName: plan.folderName ?? summary.executionFolderName,
      executionFolderName: summary.executionFolderName,
      sourceRootCid: summary.sourceRootCid,
      sourceFolderName: summary.sourceFolderName,
      deletes: Array.isArray(plan.deletes) ? plan.deletes : [],
    };

    return {
      plan: normalizedPlan,
      summary,
      planKey: buildPlanKey(normalizedPlan),
    };
  }

  function summarizePlan(plan, { currentCid = null, folderName = null } = {}) {
    const moves = Array.isArray(plan.moves) ? plan.moves : [];
    const deletes = Array.isArray(plan.deletes) ? plan.deletes : [];
    const reviews = Array.isArray(plan.reviews) ? plan.reviews : [];
    const collisions = Array.isArray(plan.collisions) ? plan.collisions : [];
    const summary = plan.summary && typeof plan.summary === "object" ? plan.summary : {};
    const executionRootCid = plan.executionRootCid ?? plan.rootCid ?? currentCid ?? null;
    const executionFolderName = plan.executionFolderName ?? plan.folderName ?? folderName ?? "当前目录";
    const sourceRootCid = plan.sourceRootCid ?? currentCid ?? null;
    const sourceFolderName = plan.sourceFolderName ?? folderName ?? "当前目录";
    const needsReviewCount = moves.filter((item) => item?.needsReview === true).length;

    return {
      mode: plan.mode ?? "classify",
      generatedAt: plan.generatedAt ?? null,
      sourceRootCid,
      sourceFolderName,
      executionRootCid,
      executionFolderName,
      totalEntries: Number(summary.totalEntries ?? moves.length + reviews.length + deletes.length),
      moveCount: Number(summary.moveCount ?? moves.length),
      renameCount: countRenameMoves(moves),
      deleteCount: Number(summary.deleteCount ?? deletes.length),
      reviewCount: Number(summary.reviewCount ?? reviews.length),
      collisionCount: Number(summary.collisionCount ?? collisions.length),
      needsReviewCount,
      moveTotal: moves.length,
      deleteTotal: deletes.length,
      tmdbMatchedCount: summary.tmdbMatchedCount,
      tmdbMissCount: summary.tmdbMissCount,
      tmdbAmbiguousCount: summary.tmdbAmbiguousCount,
      llmFallbackSummary: plan.llmFallbackSummary ?? null,
    };
  }

  function previewPlan() {
    if (!state.importedPlan) {
      window.alert("请先导入 plan JSON。");
      return;
    }

    const { summary } = state.importedPlan;
    log(`计划预览：move=${summary.moveCount}, rename=${summary.renameCount}, delete=${summary.deleteCount}, review=${summary.reviewCount}`);
    openPlanPreviewModal(state.importedPlan);
  }

  function openPlanPreviewModal(importedPlan) {
    closePlanPreviewModal();

    const { plan, summary } = importedPlan;
    const tabs = buildPlanPreviewTabs(plan);
    let activeTabKey = "moves";

    const modal = document.createElement("div");
    modal.id = PREVIEW_MODAL_ID;
    modal.innerHTML = `
      <div class="preview-dialog" role="dialog" aria-modal="true" aria-labelledby="${PREVIEW_MODAL_ID}-title">
        <div class="preview-head">
          <div>
            <div class="preview-title" id="${PREVIEW_MODAL_ID}-title">预览计划</div>
            <div class="preview-subtitle" data-role="preview-subtitle"></div>
          </div>
          <button class="preview-close" type="button" data-preview-close title="关闭">×</button>
        </div>
        <div class="preview-body">
          <div class="preview-stats" data-role="preview-stats"></div>
          <div class="preview-tabs" data-role="preview-tabs"></div>
          <div class="preview-tools">
            <input class="preview-search" data-role="preview-search" type="search" placeholder="搜索当前 Tab：源路径 / 目标路径 / 原因 / id">
            <div class="preview-count" data-role="preview-count"></div>
          </div>
          <div class="preview-table-wrap" data-role="preview-table"></div>
        </div>
      </div>
    `;

    const subtitle = modal.querySelector('[data-role="preview-subtitle"]');
    subtitle.textContent = `来源 cid=${formatPreviewValue(summary.sourceRootCid)}，目标 cid=${formatPreviewValue(summary.executionRootCid)}`;

    renderPlanPreviewStats(modal.querySelector('[data-role="preview-stats"]'), summary);
    renderPlanPreviewTabs(modal.querySelector('[data-role="preview-tabs"]'), tabs, activeTabKey);

    const searchInput = modal.querySelector('[data-role="preview-search"]');
    const countNode = modal.querySelector('[data-role="preview-count"]');
    const tableWrap = modal.querySelector('[data-role="preview-table"]');

    const renderActiveTab = () => {
      const activeTab = tabs.find((tab) => tab.key === activeTabKey) ?? tabs[0];
      renderPlanPreviewTabs(modal.querySelector('[data-role="preview-tabs"]'), tabs, activeTab.key);
      renderPlanPreviewTable(tableWrap, activeTab, searchInput.value, countNode);
    };

    modal.addEventListener("click", (event) => {
      if (event.target === modal || event.target.closest("[data-preview-close]")) {
        closePlanPreviewModal();
        return;
      }

      const tabButton = event.target.closest("[data-preview-tab]");
      if (!tabButton || !modal.contains(tabButton)) {
        return;
      }

      activeTabKey = tabButton.getAttribute("data-preview-tab") || activeTabKey;
      renderActiveTab();
    });
    searchInput.addEventListener("input", renderActiveTab);

    const handleEsc = (event) => {
      if (event.key === "Escape") {
        closePlanPreviewModal();
      }
    };
    modal.__organize115PreviewEscHandler = handleEsc;
    document.addEventListener("keydown", handleEsc);

    document.body.appendChild(modal);
    renderActiveTab();
    searchInput.focus();
  }

  function closePlanPreviewModal() {
    const existing = document.getElementById(PREVIEW_MODAL_ID);
    if (!existing) {
      return;
    }

    if (existing.__organize115PreviewEscHandler) {
      document.removeEventListener("keydown", existing.__organize115PreviewEscHandler);
    }
    existing.remove();
  }

  function renderPlanPreviewStats(container, summary) {
    const stats = [
      ["来源目录 cid", summary.sourceRootCid ?? "未识别"],
      ["目标目录 cid", summary.executionRootCid ?? "未识别"],
      ["move", summary.moveCount],
      ["delete", summary.deleteCount],
      ["review", summary.reviewCount],
      ["collision", summary.collisionCount],
    ];

    container.textContent = "";
    for (const [label, value] of stats) {
      const item = document.createElement("div");
      item.className = "preview-stat";

      const labelNode = document.createElement("div");
      labelNode.className = "preview-stat-label";
      labelNode.textContent = label;

      const valueNode = document.createElement("div");
      valueNode.className = "preview-stat-value";
      valueNode.textContent = formatPreviewValue(value);

      item.append(labelNode, valueNode);
      container.appendChild(item);
    }
  }

  function renderPlanPreviewTabs(container, tabs, activeTabKey) {
    container.textContent = "";
    for (const tab of tabs) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "preview-tab";
      button.setAttribute("data-preview-tab", tab.key);
      button.setAttribute("aria-selected", tab.key === activeTabKey ? "true" : "false");
      button.textContent = `${tab.label} (${tab.rows.length})`;
      container.appendChild(button);
    }
  }

  function renderPlanPreviewTable(container, tab, query, countNode) {
    const normalizedQuery = String(query || "").trim().toLowerCase();
    const visibleRows = normalizedQuery
      ? tab.rows.filter((row) => row.searchText.toLowerCase().includes(normalizedQuery))
      : tab.rows;

    countNode.textContent = `显示 ${visibleRows.length}/${tab.rows.length} 条`;
    container.textContent = "";

    if (visibleRows.length === 0) {
      const empty = document.createElement("div");
      empty.className = "preview-empty";
      empty.textContent = tab.rows.length === 0 ? "暂无数据" : "无匹配数据";
      container.appendChild(empty);
      return;
    }

    const table = document.createElement("table");
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    for (const column of tab.columns) {
      const th = document.createElement("th");
      th.textContent = column;
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);

    const tbody = document.createElement("tbody");
    for (const row of visibleRows) {
      const tr = document.createElement("tr");
      for (const cellValue of row.cells) {
        const td = document.createElement("td");
        td.textContent = cellValue;
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }

    table.append(thead, tbody);
    container.appendChild(table);
  }

  function buildPlanPreviewTabs(plan) {
    const moves = Array.isArray(plan.moves) ? plan.moves : [];
    const deletes = Array.isArray(plan.deletes) ? plan.deletes : [];
    const reviews = Array.isArray(plan.reviews) ? plan.reviews : [];
    const collisions = Array.isArray(plan.collisions) ? plan.collisions : [];

    return [
      {
        key: "moves",
        label: "移动/重命名",
        columns: ["序号", "类型", "源路径", "目标目录", "目标名称", "目标路径", "needsReview", "matchSource", "tmdbType/tmdbId", "操作 id"],
        rows: moves.map((item, index) =>
          buildPlanPreviewRow([
            index + 1,
            formatMoveType(item),
            item?.source,
            item?.targetDir ?? dirname(item?.targetPath),
            item?.targetName ?? basename(item?.targetPath),
            item?.targetPath,
            formatPreviewBoolean(item?.needsReview),
            item?.matchSource,
            formatTmdbIdentity(item),
            firstPreviewValue(item?.operationId, item?.id, item?.fid, item?.cid, item?.itemId),
          ]),
        ),
      },
      {
        key: "deletes",
        label: "删除目录",
        columns: ["序号", "目录", "目录 cid", "策略", "原因", "关联 move 数量"],
        rows: deletes.map((item, index) =>
          buildPlanPreviewRow([
            index + 1,
            item?.wrapperDir ?? item?.source,
            item?.wrapperDirCid ?? item?.cid,
            item?.strategy,
            item?.reason,
            item?.moveCount,
          ]),
        ),
      },
      {
        key: "reviews",
        label: "待人工确认",
        columns: ["序号", "源路径", "原因", "分类/标题", "建议目标或备注"],
        rows: reviews.map((item, index) =>
          buildPlanPreviewRow([
            index + 1,
            item?.source ?? item?.wrapperDir ?? item?.targetPath,
            item?.reviewReason ?? item?.reason ?? item?.reviewType,
            formatCategoryTitle(item),
            formatReviewSuggestion(item),
          ]),
        ),
      },
      {
        key: "collisions",
        label: "冲突",
        columns: ["序号", "目标路径", "冲突来源数量", "冲突来源摘要"],
        rows: collisions.map((item, index) => {
          const sources = Array.isArray(item?.sources) ? item.sources : [];
          return buildPlanPreviewRow([
            index + 1,
            item?.targetPath,
            sources.length,
            sources,
          ]);
        }),
      },
    ];
  }

  function buildPlanPreviewRow(values) {
    const cells = values.map((value) => formatPreviewValue(value));
    return {
      cells,
      searchText: cells.join(" "),
    };
  }

  function formatMoveType(item) {
    if (item?.isDir === true || item?.role === "directory") {
      return "目录";
    }
    if (item?.role) {
      return item.role;
    }
    return "文件";
  }

  function formatPreviewBoolean(value) {
    if (value === true) {
      return "是";
    }
    if (value === false) {
      return "否";
    }
    return "-";
  }

  function formatTmdbIdentity(item) {
    const type = firstPreviewValue(item?.tmdbType, item?.searchType);
    const id = firstPreviewValue(item?.tmdbId, item?.tmdbID);
    if (type === undefined && id === undefined) {
      return "-";
    }
    return [type ?? "-", id ?? "-"].map((value) => String(value)).join("/");
  }

  function formatCategoryTitle(item) {
    const category = firstPreviewValue(item?.category, item?.reviewType);
    const title = firstPreviewValue(item?.title, item?.canonicalTitleZh, item?.canonicalTitleEn, item?.name);
    if (category === undefined && title === undefined) {
      return "-";
    }
    if (category === undefined) {
      return String(title);
    }
    if (title === undefined) {
      return String(category);
    }
    return `${category} / ${title}`;
  }

  function formatReviewSuggestion(item) {
    const values = [
      firstPreviewValue(item?.targetPath, item?.targetDir),
      firstPreviewValue(item?.note, item?.message),
    ].filter((value) => value !== undefined);
    if (values.length === 0 && Array.isArray(item?.sources)) {
      values.push(item.sources);
    }
    return values.length === 0 ? "-" : values;
  }

  function firstPreviewValue(...values) {
    return values.find((value) => value !== undefined && value !== null && value !== "");
  }

  function formatPreviewValue(value) {
    if (value === undefined || value === null || value === "") {
      return "-";
    }
    if (Array.isArray(value)) {
      return value.length === 0 ? "-" : value.map((item) => formatPreviewValue(item)).join("\n");
    }
    if (typeof value === "object") {
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    }
    return String(value);
  }

  function formatPlanSummary(summary, report) {
    const lines = [
      `来源：${summary.sourceFolderName}`,
      `来源 cid：${summary.sourceRootCid ?? "未识别"}`,
      `目标：${summary.executionFolderName}`,
      `目标 cid：${summary.executionRootCid ?? "未识别"}`,
      `模式：${summary.mode}`,
      `生成时间：${summary.generatedAt ?? "未知"}`,
      `move / rename / delete：${summary.moveCount} / ${summary.renameCount} / ${summary.deleteCount}`,
      `review / collision / needsReview：${summary.reviewCount} / ${summary.collisionCount} / ${summary.needsReviewCount}`,
    ];

    if (summary.tmdbMatchedCount !== undefined) {
      lines.push(`TMDB matched / miss / ambiguous：${summary.tmdbMatchedCount} / ${summary.tmdbMissCount ?? 0} / ${summary.tmdbAmbiguousCount ?? 0}`);
    }

    if (summary.llmFallbackSummary) {
      lines.push(formatLlmFallbackLog(summary.llmFallbackSummary));
    }

    if (report) {
      lines.push("");
      lines.push(`执行状态：${report.status}`);
      lines.push(`成功：${report.succeeded}`);
      lines.push(`失败：${report.errors.length}`);
      lines.push(`删除成功：${report.deleted.length}`);
      lines.push(`删除失败：${report.deleteErrors.length}`);
      lines.push(`下一个 move：${report.nextMoveIndex}/${report.total}`);
      lines.push(`下一个 delete：${report.nextDeleteIndex}/${report.deleteTotal}`);
      if (report.resumeAt) {
        lines.push(`风控恢复：${formatTime(report.resumeAt)}`);
      }
    }

    return lines.join("\n");
  }

  function formatPlanBundleSummary(bundle, report) {
    const combinedSummary = summarizePlan(bundle.combinedPlan, {
      currentCid: bundle.executionRoot.cid,
      folderName: bundle.executionRoot.folderName,
    });
    const lines = [
      `批次：历史批次计划`,
      `目录：${bundle.executionRoot.folderName}`,
      `cid：${bundle.executionRoot.cid}`,
      `生成时间：${bundle.generatedAt}`,
      `combined move / rename / delete：${combinedSummary.moveCount} / ${combinedSummary.renameCount} / ${combinedSummary.deleteCount}`,
      `combined review / collision / needsReview：${combinedSummary.reviewCount} / ${combinedSummary.collisionCount} / ${combinedSummary.needsReviewCount}`,
      "",
      ...bundle.plans.map((item) => {
        return `${item.label}: move=${item.summary.moveCount}, delete=${item.summary.deleteCount}, review=${item.summary.reviewCount}, miss=${item.summary.tmdbMissCount ?? 0}`;
      }),
    ];

    if (report) {
      lines.push("");
      lines.push(`执行状态：${report.status}`);
      lines.push(`成功：${report.succeeded}`);
      lines.push(`失败：${report.errors.length}`);
      lines.push(`删除成功：${report.deleted.length}`);
      lines.push(`删除失败：${report.deleteErrors.length}`);
      lines.push(`下一个 move：${report.nextMoveIndex}/${report.total}`);
      lines.push(`下一个 delete：${report.nextDeleteIndex}/${report.deleteTotal}`);
    }

    return lines.join("\n");
  }

  async function startExecutePlan({ resumeRequested = false } = {}) {
    if (!state.importedPlan) {
      window.alert("请先导入 plan JSON。");
      return;
    }
    if (state.runInFlight) {
      log("执行器正在运行，忽略重复启动。", "warn");
      return;
    }

    refreshCurrentLocation();
    const { plan, summary, planKey } = state.importedPlan;
    if (!summary.executionRootCid) {
      window.alert("当前计划没有 executionRootCid/rootCid，且页面未识别 cid，无法执行。");
      return;
    }
    const requiredPageCid = String(summary.sourceRootCid ?? summary.executionRootCid);
    const requiredPageLabel = summary.sourceRootCid ? "来源目录" : "执行目录";
    if (state.currentCid !== requiredPageCid) {
      window.alert(`当前页面 cid=${state.currentCid ?? "null"}，与${requiredPageLabel} cid=${requiredPageCid} 不一致。请先打开${requiredPageLabel}页。`);
      return;
    }

    const restored = restorePersistedState(planKey, summary);
    if (restored) {
      if (restored.pausedReason === "rate-limit-405") {
        const resumeAtTimestamp = restored.resumeAt ? Date.parse(restored.resumeAt) : Number.NaN;
        if (Number.isFinite(resumeAtTimestamp) && Date.now() < resumeAtTimestamp) {
          armAutoResume(resumeAtTimestamp);
          window.alert(`检测到同一计划已因 405/风控暂停，将在 ${formatTime(restored.resumeAt)} 后自动尝试恢复。`);
          syncUi();
          return;
        }
      }
      log("检测到同一计划断点，将从断点继续。");
    } else {
      if (resumeRequested) {
        window.alert("没有找到同一计划的可恢复断点，请使用“执行计划”并完成高风险确认。");
        return;
      }

      const confirmed = window.confirm(buildHighRiskConfirmText(summary));
      if (!confirmed) {
        log("用户取消执行。");
        return;
      }
      resetApplyRuntime();
      state.report = createInitialReport(summary, planKey);
    }

    state.executionPauseRequested = false;
    state.runInFlight = true;
    setBusy(true);
    clearAutoResumeScheduling();
    if (!state.report) {
      state.report = createInitialReport(summary, planKey);
    }
    state.report.status = "running";
    state.report.pausedReason = null;
    state.report.pausedAt = null;
    state.report.resumeAt = null;
    state.report.pauseContext = null;
    syncReport("running");

    try {
      await runApplyLoop(plan, summary, planKey);
      state.report.finishedAt = new Date().toISOString();
      state.report.status = "completed";
      state.report.pausedReason = null;
      state.report.pausedAt = null;
      state.report.resumeAt = null;
      state.report.pauseContext = null;
      syncReport("completed");
      clearPersistedState(planKey);
      log(`执行完成：成功=${state.report.succeeded}，失败=${state.report.errors.length}，删除失败=${state.report.deleteErrors.length}`);
      window.alert(`执行结束：移动成功 ${state.report.succeeded} 条，移动失败 ${state.report.errors.length} 条，目录删除失败 ${state.report.deleteErrors.length} 条。`);
    } catch (error) {
      if (error?.isApplyPlanPause) {
        log("脚本已因暂停条件停止继续请求。", "warn");
        return;
      }

      state.report.finishedAt = new Date().toISOString();
      state.report.status = "failed";
      state.report.errors.push({
        source: "__runtime__",
        message: error instanceof Error ? error.message : String(error),
      });
      syncReport("failed");
      clearAutoResumeScheduling();
      throw error;
    } finally {
      state.runInFlight = false;
      setBusy(false);
    }
  }

  async function runApplyLoop(plan, summary, planKey) {
    const moves = plan.moves;
    const deletes = plan.deletes || [];

    for (let index = state.nextMoveIndex; index < moves.length; index += 1) {
      if (state.executionPauseRequested) {
        pauseForManual(plan, planKey);
        throw new ApplyPlanPauseError("用户手动暂停执行", { pausedReason: "manual-pause" });
      }

      await processMove(plan, moves[index], index);
      state.nextMoveIndex = index + 1;
      syncReport("running");
    }

    while (state.nextDeleteIndex < deletes.length) {
      if (state.executionPauseRequested) {
        pauseForManual(plan, planKey);
        throw new ApplyPlanPauseError("用户手动暂停执行", { pausedReason: "manual-pause" });
      }

      const batchEndExclusive = await processDeleteBatch(plan, state.nextDeleteIndex);
      state.nextDeleteIndex = batchEndExclusive;
      syncReport("running");
    }
  }

  function resetApplyRuntime() {
    state.nextMoveIndex = 0;
    state.nextDeleteIndex = 0;
    state.folderCache.clear();
    state.failedWrapperDirs = new Set();
    state.successfulMoveCountByWrapper = new Map();
    state.renamedItemIds = new Set();
    state.activeOperation = null;
  }

  function createInitialReport(summary, planKey) {
    return {
      startedAt: new Date().toISOString(),
      execute: true,
      rootCid: summary.executionRootCid,
      folderName: summary.executionFolderName,
      sourceRootCid: summary.sourceRootCid,
      sourceFolderName: summary.sourceFolderName,
      executionRootCid: summary.executionRootCid,
      executionFolderName: summary.executionFolderName,
      total: summary.moveTotal,
      deleteTotal: summary.deleteTotal,
      succeeded: 0,
      skipped: [],
      createdFolders: [],
      renamed: [],
      moved: [],
      deleted: [],
      errors: [],
      deleteErrors: [],
      status: "running",
      pausedReason: null,
      pausedAt: null,
      resumeAt: null,
      nextMoveIndex: 0,
      nextDeleteIndex: 0,
      planKey,
      pauseContext: null,
    };
  }

  function syncReport(status = state.report?.status) {
    if (!state.report) {
      return;
    }

    state.report.status = status;
    state.report.nextMoveIndex = state.nextMoveIndex;
    state.report.nextDeleteIndex = state.nextDeleteIndex;
    window.__115ApplyPlanReport = state.report;
    syncUi();
  }

  function requestPause() {
    state.captureStopRequested = true;
    state.executionPauseRequested = true;
    log("已请求暂停；当前请求完成后会停止继续推进。", "warn");
  }

  function pauseForManual(plan, planKey) {
    state.report.status = "paused";
    state.report.pausedReason = "manual-pause";
    state.report.pausedAt = new Date().toISOString();
    state.report.resumeAt = null;
    state.report.pauseContext = {
      message: "用户手动暂停",
    };
    syncReport("paused");
    writePersistedState(plan, planKey);
  }

  function pauseForRateLimit(plan, planKey, details) {
    const pausedAt = new Date().toISOString();
    const resumeAt = new Date(Date.parse(pausedAt) + APPLY_RESUME_DELAY_MS).toISOString();
    state.report.status = "paused";
    state.report.pausedReason = "rate-limit-405";
    state.report.pausedAt = pausedAt;
    state.report.resumeAt = resumeAt;
    state.report.pauseContext = details;
    delete state.report.finishedAt;
    syncReport("paused");
    writePersistedState(plan, planKey);
    armAutoResume(Date.parse(resumeAt));
    window.alert(`检测到 115 405/风控，已暂停。页面保持打开时会在 ${formatTime(resumeAt)} 后自动尝试继续。`);
  }

  function buildPersistedState(plan, planKey) {
    return {
      version: 1,
      planKey,
      rootCid: plan.executionRootCid ?? plan.rootCid ?? null,
      sourceRootCid: plan.sourceRootCid ?? null,
      sourceFolderName: plan.sourceFolderName ?? null,
      executionRootCid: plan.executionRootCid ?? plan.rootCid ?? null,
      generatedAt: plan.generatedAt ?? null,
      moveTotal: Array.isArray(plan.moves) ? plan.moves.length : 0,
      deleteTotal: Array.isArray(plan.deletes) ? plan.deletes.length : 0,
      pausedReason: state.report?.pausedReason ?? null,
      pausedAt: state.report?.pausedAt ?? null,
      resumeAt: state.report?.resumeAt ?? null,
      nextMoveIndex: state.nextMoveIndex,
      nextDeleteIndex: state.nextDeleteIndex,
      successfulMoveCountByWrapper: mapToObject(state.successfulMoveCountByWrapper),
      failedWrapperDirs: [...state.failedWrapperDirs],
      renamedItemIds: [...state.renamedItemIds],
      report: JSON.parse(JSON.stringify(state.report ?? {})),
    };
  }

  function writePersistedState(plan, planKey) {
    try {
      localStorage.setItem(APPLY_LOCAL_STORAGE_KEY, JSON.stringify(buildPersistedState(plan, planKey)));
    } catch (error) {
      log(`写入 localStorage 断点失败：${error instanceof Error ? error.message : String(error)}`, "error");
    }
  }

  function readPersistedState() {
    try {
      const raw = localStorage.getItem(APPLY_LOCAL_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      localStorage.removeItem(APPLY_LOCAL_STORAGE_KEY);
      return null;
    }
  }

  function restorePersistedState(planKey, summary) {
    const persisted = readPersistedState();
    if (!persisted || persisted.planKey !== planKey) {
      return null;
    }

    const clamp = (value, total) => {
      const normalized = Number(value);
      if (!Number.isFinite(normalized) || normalized < 0) {
        return 0;
      }
      return Math.min(Math.trunc(normalized), Number(total) || 0);
    };

    state.nextMoveIndex = clamp(persisted.nextMoveIndex, summary.moveTotal);
    state.nextDeleteIndex = clamp(persisted.nextDeleteIndex, summary.deleteTotal);
    state.failedWrapperDirs = new Set(
      Array.isArray(persisted.failedWrapperDirs) ? persisted.failedWrapperDirs.map((item) => String(item)) : [],
    );
    state.successfulMoveCountByWrapper = new Map(
      Object.entries(persisted.successfulMoveCountByWrapper || {}).map(([key, value]) => [
        String(key),
        Number(value) || 0,
      ]),
    );
    state.renamedItemIds = new Set(
      (Array.isArray(persisted.renamedItemIds) ? persisted.renamedItemIds : []).map((item) => String(item)),
    );
    state.report = {
      ...createInitialReport(summary, planKey),
      ...(persisted.report || {}),
      planKey,
    };
    state.report.pausedReason = persisted.pausedReason ?? state.report.pausedReason ?? null;
    state.report.pausedAt = persisted.pausedAt ?? state.report.pausedAt ?? null;
    state.report.resumeAt = persisted.resumeAt ?? state.report.resumeAt ?? null;
    syncReport(state.report.status ?? "paused");
    return {
      pausedReason: state.report.pausedReason,
      pausedAt: state.report.pausedAt,
      resumeAt: state.report.resumeAt,
    };
  }

  function clearPersistedState(planKey) {
    const persisted = readPersistedState();
    if (!persisted || !persisted.planKey || persisted.planKey === planKey) {
      localStorage.removeItem(APPLY_LOCAL_STORAGE_KEY);
    }
  }

  function clearAutoResumeScheduling() {
    if (state.autoResumeTimerId !== null) {
      clearTimeout(state.autoResumeTimerId);
      state.autoResumeTimerId = null;
    }
    if (state.autoResumePollId !== null) {
      clearInterval(state.autoResumePollId);
      state.autoResumePollId = null;
    }
  }

  function armAutoResume(resumeAtTimestamp) {
    if (!Number.isFinite(resumeAtTimestamp)) {
      return;
    }

    clearAutoResumeScheduling();
    const maybeResume = () => {
      if (Date.now() < resumeAtTimestamp || state.runInFlight) {
        return;
      }
      clearAutoResumeScheduling();
      startExecutePlan({ resumeRequested: true }).catch((error) => handleTopLevelError("自动恢复失败", error));
    };
    state.autoResumeTimerId = setTimeout(maybeResume, Math.max(0, resumeAtTimestamp - Date.now()));
    state.autoResumePollId = setInterval(maybeResume, 60 * 1000);
    log(`已安排自动恢复：${formatTime(new Date(resumeAtTimestamp).toISOString())}`);
  }

  function mapToObject(map) {
    return Object.fromEntries([...map.entries()].map(([key, value]) => [key, Number(value) || 0]));
  }

  async function requestApplyJson(plan, planKey, url, options = {}) {
    const { method = "GET", params = null, body = null } = options;
    const requestUrl = new URL(url);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== "") {
          requestUrl.searchParams.set(key, String(value));
        }
      }
    }

    const response = await fetch(requestUrl.toString(), {
      method,
      credentials: "include",
      headers: body
        ? {
            "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
          }
        : undefined,
      body: body ? toForm(body) : undefined,
    });
    const text = await response.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        if (response.status === 405) {
          const details = buildPauseDetails(requestUrl, method, response.status, text);
          pauseForRateLimit(plan, planKey, details);
          throw new ApplyPlanPauseError("检测到 115 风控暂停", details);
        }
        throw new Error(`接口未返回 JSON: ${requestUrl.toString()}\n${text.slice(0, 300)}`);
      }
    }

    if (isRateLimitPayload(response.status, data, text)) {
      const details = buildPauseDetails(requestUrl, method, response.status, text, data);
      pauseForRateLimit(plan, planKey, details);
      throw new ApplyPlanPauseError("检测到 115 风控暂停", details);
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${requestUrl.toString()}\n${JSON.stringify(data)}`);
    }
    if (data && data.state === false) {
      throw new Error(`接口返回失败: ${requestUrl.toString()}\n${JSON.stringify(data)}`);
    }
    return data;
  }

  function buildPauseDetails(requestUrl, method, status, text, data = null) {
    return {
      requestUrl: requestUrl.toString(),
      method,
      status,
      responseBody: data,
      responseSnippet: typeof text === "string" ? text.slice(0, 300) : "",
      operation: buildOperationSummary(),
    };
  }

  function buildOperationSummary() {
    if (!state.activeOperation) {
      return null;
    }

    const item = state.activeOperation.item || {};
    return {
      phase: state.activeOperation.phase,
      index: state.activeOperation.index,
      source: item.source ?? item.wrapperDir ?? null,
      targetPath: item.targetPath ?? null,
      wrapperDir: item.wrapperDir ?? null,
      batchStartIndex: state.activeOperation.batchStartIndex ?? null,
      batchEndIndex: state.activeOperation.batchEndIndex ?? null,
      batchSize: Array.isArray(state.activeOperation.batchItems) ? state.activeOperation.batchItems.length : null,
    };
  }

  function toForm(payload) {
    const form = new URLSearchParams();
    for (const [key, value] of Object.entries(payload)) {
      if (value === undefined || value === null || value === "") {
        continue;
      }
      form.append(key, String(value));
    }
    return form;
  }

  async function listFolders(plan, pid) {
    const cacheKey = String(pid);
    if (state.folderCache.has(cacheKey)) {
      return state.folderCache.get(cacheKey);
    }

    const payload = await requestApplyJson(plan, state.importedPlan.planKey, "https://webapi.115.com/files", {
      params: {
        aid: 1,
        cid: pid,
        offset: 0,
        limit: 2000,
        type: 0,
        show_dir: 1,
        fc_mix: 0,
        natsort: 1,
        format: "json",
        custom_order: 0,
      },
    });
    const folders = (payload.data || [])
      .filter((item) => !item.fid && item.cid)
      .map((item) => ({
        cid: String(item.cid),
        name: item.n,
      }));
    state.folderCache.set(cacheKey, folders);
    return folders;
  }

  function invalidateFolderCache(pid) {
    state.folderCache.delete(String(pid));
  }

  async function findFolder(plan, pid, name) {
    const folders = await listFolders(plan, pid);
    return folders.find((item) => item.name === name) || null;
  }

  async function createFolder(plan, pid, name) {
    await requestApplyJson(plan, state.importedPlan.planKey, "https://webapi.115.com/files/add", {
      method: "POST",
      body: {
        pid,
        cname: name,
      },
    });
    invalidateFolderCache(pid);
    const created = await findFolder(plan, pid, name);
    if (!created) {
      throw new Error(`新建目录后未找到: pid=${pid}, name=${name}`);
    }
    state.report.createdFolders.push({ pid: String(pid), cid: created.cid, name });
    return created.cid;
  }

  async function ensureFolder(plan, pid, name) {
    const existing = await findFolder(plan, pid, name);
    if (existing) {
      return existing.cid;
    }
    return createFolder(plan, pid, name);
  }

  async function ensurePath(plan, pathValue) {
    const parts = String(pathValue || "").split("/").filter(Boolean);
    let currentPid = plan.executionRootCid || plan.rootCid;
    for (const part of parts) {
      currentPid = await ensureFolder(plan, currentPid, part);
      await sleep(APPLY_REQUEST_INTERVAL_MS);
    }
    return currentPid;
  }

  async function renameFileOrDir(plan, itemId, fileName) {
    const normalizedItemId = String(itemId);
    if (state.renamedItemIds.has(normalizedItemId)) {
      return;
    }
    await requestApplyJson(plan, state.importedPlan.planKey, "https://webapi.115.com/files/batch_rename", {
      method: "POST",
      body: {
        [`files_new_name[${itemId}]`]: fileName,
      },
    });
    state.report.renamed.push({ itemId: normalizedItemId, fileName });
    state.renamedItemIds.add(normalizedItemId);
  }

  async function moveFileOrDir(plan, itemId, parentCid) {
    await requestApplyJson(plan, state.importedPlan.planKey, "https://webapi.115.com/files/move", {
      method: "POST",
      body: {
        fid: itemId,
        pid: parentCid,
      },
    });
    state.report.moved.push({ itemId: String(itemId), parentCid: String(parentCid) });
  }

  async function deleteFolders(plan, batchItems) {
    if (!batchItems.length) {
      return;
    }

    const body = {
      pid: 0,
      ignore_warn: 1,
    };
    batchItems.forEach((item, index) => {
      body[`fid[${index}]`] = item.wrapperDirCid;
    });
    await requestApplyJson(plan, state.importedPlan.planKey, "https://webapi.115.com/rb/delete", {
      method: "POST",
      body,
    });
    state.folderCache.clear();
    for (const item of batchItems) {
      state.report.deleted.push({
        wrapperDir: item.wrapperDir,
        wrapperDirCid: String(item.wrapperDirCid),
      });
    }
  }

  async function processMove(plan, item, index) {
    const moves = plan.moves;
    const itemId = item.isDir ? item.cid : item.fid;
    if (!itemId) {
      if (item.wrapperDir) {
        state.failedWrapperDirs.add(String(item.wrapperDir));
      }
      state.report.errors.push({
        source: item.source,
        message: "缺少可操作的 item id",
      });
      return;
    }

    state.activeOperation = {
      phase: "move",
      index,
      item,
    };

    try {
      if (item.isDir) {
        const targetParentPath = dirname(item.targetDir);
        const finalFolderName = basename(item.targetDir);
        const targetParentCid = targetParentPath ? await ensurePath(plan, targetParentPath) : plan.executionRootCid || plan.rootCid;
        if (finalFolderName && finalFolderName !== item.name) {
          await renameFileOrDir(plan, itemId, finalFolderName);
          await sleep(APPLY_REQUEST_INTERVAL_MS);
        }
        await moveFileOrDir(plan, itemId, targetParentCid);
      } else {
        const targetParentCid = await ensurePath(plan, item.targetDir);
        if (item.targetName && item.targetName !== item.name) {
          await renameFileOrDir(plan, itemId, item.targetName);
          await sleep(APPLY_REQUEST_INTERVAL_MS);
        }
        await moveFileOrDir(plan, itemId, targetParentCid);
      }

      if (item.wrapperDir) {
        const currentSuccessCount = state.successfulMoveCountByWrapper.get(String(item.wrapperDir)) ?? 0;
        state.successfulMoveCountByWrapper.set(String(item.wrapperDir), currentSuccessCount + 1);
      }
      state.report.succeeded += 1;
      log(`[move ${index + 1}/${moves.length}] 完成：${item.source}`);
    } catch (error) {
      if (error?.isApplyPlanPause) {
        throw error;
      }
      if (item.wrapperDir) {
        state.failedWrapperDirs.add(String(item.wrapperDir));
      }
      state.report.errors.push({
        source: item.source,
        itemId: String(itemId),
        targetPath: item.targetPath,
        message: error instanceof Error ? error.message : String(error),
      });
      log(`[move ${index + 1}/${moves.length}] 失败：${item.source}`, "error");
    } finally {
      state.activeOperation = null;
    }

    await sleep(APPLY_REQUEST_INTERVAL_MS);
  }

  function collectDeleteBatch(plan, startIndex) {
    const deletes = plan.deletes || [];
    const endExclusive = Math.min(startIndex + APPLY_DELETE_BATCH_SIZE, deletes.length);
    const readyItems = [];

    for (let index = startIndex; index < endExclusive; index += 1) {
      const item = deletes[index];
      const wrapperKey = String(item.wrapperDir);
      const successCount = state.successfulMoveCountByWrapper.get(wrapperKey) ?? 0;
      const requiredMoveCount = Number(item.moveCount) || 0;

      if (state.failedWrapperDirs.has(wrapperKey) || successCount !== requiredMoveCount) {
        state.report.skipped.push({
          source: item.wrapperDir,
          reason: "wrapper 下存在迁移失败或未完成的视频，跳过删除目录",
        });
        continue;
      }

      if (!item.wrapperDirCid) {
        state.report.deleteErrors.push({
          wrapperDir: item.wrapperDir,
          message: "缺少可删除的 wrapperDirCid",
        });
        continue;
      }

      readyItems.push({
        index,
        item,
      });
    }

    return {
      startIndex,
      endExclusive,
      readyItems,
    };
  }

  async function processDeleteBatch(plan, startIndex) {
    const batch = collectDeleteBatch(plan, startIndex);
    const deletes = plan.deletes || [];
    const label = `${batch.startIndex + 1}-${Math.min(batch.endExclusive, deletes.length)}/${deletes.length}`;
    if (batch.readyItems.length === 0) {
      log(`[delete-batch ${label}] 无可删项，已跳过。`);
      return batch.endExclusive;
    }

    const batchItems = batch.readyItems.map((entry) => entry.item);
    state.activeOperation = {
      phase: "delete",
      index: startIndex,
      item: batchItems[0],
      batchStartIndex: batch.startIndex,
      batchEndIndex: batch.endExclusive - 1,
      batchItems,
    };

    try {
      await deleteFolders(plan, batchItems);
      log(`[delete-batch ${label}] 完成：发送 ${batchItems.length} 条`);
    } catch (error) {
      if (error?.isApplyPlanPause) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      for (const { item } of batch.readyItems) {
        state.report.deleteErrors.push({
          wrapperDir: item.wrapperDir,
          wrapperDirCid: String(item.wrapperDirCid),
          message,
        });
      }
      log(`[delete-batch ${label}] 失败：发送 ${batchItems.length} 条`, "error");
    } finally {
      state.activeOperation = null;
    }

    await sleep(APPLY_REQUEST_INTERVAL_MS);
    return batch.endExclusive;
  }

  function buildPlanKey(plan) {
    return [
      String(plan.executionRootCid ?? plan.rootCid ?? ""),
      String(plan.generatedAt ?? ""),
      Array.isArray(plan.moves) ? plan.moves.length : 0,
      Array.isArray(plan.deletes) ? plan.deletes.length : 0,
    ].join("::");
  }

  function buildHighRiskConfirmText(summary) {
    return [
      "将真实执行 115 整理计划。",
      `来源目录 cid：${summary.sourceRootCid ?? "未识别"}`,
      `目标目录 cid：${summary.executionRootCid ?? "未识别"}`,
      `移动条目：${summary.moveCount}`,
      `重命名条目：${summary.renameCount}`,
      `删除目录：${summary.deleteCount}`,
      `待人工确认：${summary.reviewCount}`,
      `moves 中 needsReview=true：${summary.needsReviewCount}`,
      "",
      `删除阶段会按每批 ${APPLY_DELETE_BATCH_SIZE} 个目录调用 rb/delete。`,
      "遇到 405 / 风控提示会立即暂停，并写入 localStorage 断点。",
      "如确认无误，请点击确认继续。",
    ].join("\n");
  }

  function countRenameMoves(moves) {
    return moves.filter((item) => {
      if (item?.isDir) {
        const targetName = basename(item.targetDir ?? item.targetPath ?? "");
        return Boolean(targetName && item.name && targetName !== item.name);
      }
      return Boolean(item?.targetName && item?.name && item.targetName !== item.name);
    }).length;
  }

  function dirname(pathValue) {
    const normalized = String(pathValue || "");
    const index = normalized.lastIndexOf("/");
    return index < 0 ? "" : normalized.slice(0, index);
  }

  function basename(pathValue) {
    const normalized = String(pathValue || "");
    const index = normalized.lastIndexOf("/");
    return index < 0 ? normalized : normalized.slice(index + 1);
  }

  function collectTextFragments(value, bucket = [], depth = 0) {
    if (value === undefined || value === null || depth > 4) {
      return bucket;
    }
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      bucket.push(String(value));
      return bucket;
    }
    if (Array.isArray(value)) {
      for (const item of value.slice(0, 20)) {
        collectTextFragments(item, bucket, depth + 1);
      }
      return bucket;
    }
    if (typeof value === "object") {
      for (const [key, item] of Object.entries(value)) {
        bucket.push(String(key));
        collectTextFragments(item, bucket, depth + 1);
      }
    }
    return bucket;
  }

  function isRateLimitPayload(status, data, text = "") {
    if (Number(status) === 405) {
      return true;
    }

    const codeCandidates = [
      data?.errno,
      data?.errNo,
      data?.code,
      data?.status,
      data?.errorCode,
      data?.errcode,
    ]
      .filter((item) => item !== undefined && item !== null && item !== "")
      .map((item) => String(item));

    if (codeCandidates.includes("405")) {
      return true;
    }

    const combined = [collectTextFragments(data).join(" | "), typeof text === "string" ? text : ""]
      .filter(Boolean)
      .join(" | ");
    const lowerCombined = combined.toLowerCase();

    return (
      /too many requests|rate limit|too frequent|risk control|captcha|verify/i.test(lowerCombined) ||
      RISK_KEYWORDS.some((keyword) => combined.includes(keyword))
    );
  }

  function readRiskMessage(payload) {
    const candidates = [
      payload?.error,
      payload?.message,
      payload?.msg,
      payload?.error_msg,
      payload?.state_msg,
      payload?.notice,
    ]
      .filter(Boolean)
      .map((value) => String(value).trim());

    return candidates.find((message) => RISK_KEYWORDS.some((keyword) => message.includes(keyword))) ?? null;
  }

  function formatTime(isoString) {
    if (!isoString) {
      return "未知时间";
    }

    const timestamp = Date.parse(isoString);
    if (Number.isNaN(timestamp)) {
      return isoString;
    }

    return new Date(timestamp).toLocaleString("zh-CN", { hour12: false });
  }
})();
