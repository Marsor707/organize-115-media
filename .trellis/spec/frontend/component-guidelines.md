# Component Guidelines

> Native DOM UI patterns for the extension options page and injected 115 helper.

---

## Overview

There is no component framework in this repository. "Component" means one of:

- A static HTML/CSS/JS screen, currently the options page.
- A DOM island created by the content script, currently the injected helper panel
  and plan preview modal.
- A small plain JavaScript function that renders or updates one of those DOM
  islands.

Do not introduce React/Vue/Svelte component patterns for routine UI work.

---

## Options Page Pattern

The options page uses static HTML, one CSS file, and one ES module script.
`options.html` owns semantic structure and labels; `options.js` owns field
lookup, normalization, validation, and `chrome.storage.local` persistence.

Real pattern from `options.js`:

```js
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
```

Form submit validates before writing:

```js
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
```

When adding a setting, update the HTML input, `fields`, `readForm()`,
`fillForm()`, normalization/validation in `src/extension-settings.js`, and the
settings tests.

---

## Injected Helper Pattern

The content script is a self-contained IIFE that exits outside browser/page
contexts and refuses non-extension runtime use:

```js
(() => {
  "use strict";

  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  const HELPER_RUNTIME = isExtensionRuntimeAvailable() ? "extension" : "userscript";
  if (HELPER_RUNTIME !== "extension") {
    console.warn(`[115 整理助手] ${NON_EXTENSION_CONTEXT_MESSAGE}`);
    return;
  }
})();
```

UI is created with stable IDs, `data-action`, and `data-role` selectors.
Listeners are attached after the panel is inserted:

```js
panel.querySelector('[data-action="capture-current"]').addEventListener("click", () => {
  captureCurrentFolderTreeForPlanning().catch((error) => handleTopLevelError("采集当前目录失败", error));
});
panel.querySelector('[data-action="generate-plan"]').addEventListener("click", () => {
  generatePlanFromLastCapture().catch((error) => handleTopLevelError("生成计划失败", error));
});
panel.querySelector('[data-role="capture-file"]').addEventListener("change", importCaptureFromFile);
```

Use `data-role` for DOM nodes that code reads or updates, and `data-action` for
interactive controls.

---

## Composition and Data Passing

Use plain object options instead of positional argument lists when a function
crosses feature boundaries.

Real examples:

```js
async function buildPlanFromCapture(capture, { mode, label, executionRoot }) {
  // ...
}

startExecutePlan({ resumeRequested: true }).catch((error) =>
  handleTopLevelError("恢复执行失败", error),
);
```

Chrome message payloads should stay explicit and namespaced:

```js
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
```

---

## Styling Patterns

- `options.css` uses CSS variables, semantic page classes, and normal stylesheet
  loading from `options.html`.
- The injected helper writes a `<style>` node from the content script because it
  needs to control panel/modal styles inside the 115 page.
- Keep dimensions stable and bounded for panels and modals.
- Reuse existing visual scale: 6-8px radii, explicit grids, native buttons and
  inputs.

Real helper modal style contract:

```css
#${PREVIEW_MODAL_ID} .preview-dialog {
  width: min(1280px, calc(100vw - 40px));
  max-height: calc(100vh - 40px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 8px;
}
```

---

## Accessibility

Use native form controls and semantic roles already present in the codebase:

- `options.html` labels every input and uses `role="status"` for save feedback.
- The preview modal uses `role="dialog"`, `aria-modal="true"`, and
  `aria-labelledby`.
- Buttons that are not form submits must have `type="button"` in static HTML or
  be outside forms.
- Use `textContent` for dynamic text whenever possible. Use `innerHTML` only for
  controlled static templates, not raw external data.

Real modal shell:

```js
modal.innerHTML = `
  <div class="preview-dialog" role="dialog" aria-modal="true" aria-labelledby="${PREVIEW_MODAL_ID}-title">
    <div class="preview-head">
      <div>
        <div class="preview-title" id="${PREVIEW_MODAL_ID}-title">预览计划</div>
        <div class="preview-subtitle" data-role="preview-subtitle"></div>
      </div>
      <button class="preview-close" type="button" data-preview-close title="关闭">×</button>
    </div>
  </div>
`;
```

---

## Common Mistakes

- Do not call `chrome.runtime.openOptionsPage()` from the content script; send
  `organize115:openOptions` and let `service-worker.js` call the extension API.
- Do not reintroduce `window.prompt` or text-only execution confirmation. The
  helper must keep the explicit high-risk confirmation flow.
- Do not replace the preview modal table/tabs/search with a one-line summary.
- Do not use framework-style props or state containers for small DOM islands.
- Do not let generated labels or long IDs resize fixed toolbar/button layouts.
