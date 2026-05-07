# Hook Guidelines

> Event, listener, and async boundary patterns in this non-React extension.

---

## Overview

This project does not use React hooks. Treat "hooks" as browser and extension
event boundaries:

- `chrome.action.onClicked`
- `chrome.runtime.onMessage`
- DOM `addEventListener(...)`
- async initialization such as `loadSettings().catch(...)`
- injected helper pause/resume timers and 115 request loops

Keep these boundaries explicit and small. Put reusable business logic in `src/`
modules instead of hiding it inside event callbacks.

---

## Chrome Extension Listeners

`service-worker.js` owns extension-level event listeners. The message listener
must return `true` when it responds asynchronously through `sendResponse`.

Real message listener pattern:

```js
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
```

Real action listener:

```js
chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});
```

---

## DOM Event Listeners

Use direct listeners on stable controls after their DOM exists. Keep error
handling at the event boundary with `handleTopLevelError(...)` or `setStatus(...)`.

Real options-page initialization:

```js
clearButton.addEventListener("click", async () => {
  await chrome.storage.local.remove(EXTENSION_SETTINGS_STORAGE_KEY);
  fillForm(DEFAULT_EXTENSION_SETTINGS);
  setStatus("配置已清除。");
});

loadSettings().catch((error) => {
  setStatus(error instanceof Error ? error.message : String(error), true);
});
```

Real helper event boundary:

```js
panel.querySelector('[data-action="execute-plan"]').addEventListener("click", () => {
  startExecutePlan().catch((error) => handleTopLevelError("执行计划失败", error));
});
```

---

## Data Fetching

Use the runtime that owns the data:

- `service-worker.js` reads extension settings and static extension resources.
- The content script performs 115 Web requests with the page's browser session.
- TMDB and OpenAI clients accept an injected `fetchImpl` so tests can use fake
  clients and avoid real network calls.

Real 115 request shape from the helper:

```js
const response = await fetch(url, {
  credentials: "include",
  headers: {
    accept: "application/json, text/plain, */*",
  },
});
```

Real TMDB client injection:

```js
export function createTmdbClient(options = {}) {
  const fetchImpl = ensureFetch(options.fetchImpl ?? globalThis.fetch);
  const baseUrl = normalizeBaseUrl(options.baseUrl ?? env.TMDB_API_BASE_URL);
  // ...
}
```

Tests should pass fake clients or fake `globalThis.chrome`; they must not call
115, TMDB, or OpenAI for real.

---

## Naming Conventions

- Do not add `useSomething()` functions unless a future framework actually
  introduces hooks.
- Name event-boundary helpers after the user action or Chrome message:
  `openExtensionOptions`, `buildPlanFromCapture`, `loadSettingsSummary`,
  `startExecutePlan`.
- Message types must remain namespaced with `organize115:`.
- Timer, retry, and interval constants use `UPPER_SNAKE_CASE` and units in the
  name: `TREE_REQUEST_RETRY_DELAY_MS`, `APPLY_RESUME_DELAY_MS`.

Real constants:

```js
const TREE_REQUEST_INTERVAL_MS = 3500;
const TREE_REQUEST_RETRY_LIMIT = 3;
const APPLY_RESUME_DELAY_MS = 1 * 60 * 60 * 1000;
```

---

## Common Mistakes

- Forgetting `return true` from `chrome.runtime.onMessage` when using async
  `sendResponse`.
- Calling background-only Chrome APIs from the content script.
- Burying planner logic inside DOM listeners instead of routing through
  `src/build-115-plan.js`.
- Making tests depend on real API credentials or browser login state.
- Static-importing Node modules from browser runtime files.
