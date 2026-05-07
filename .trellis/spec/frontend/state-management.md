# State Management

> How state is stored and passed in the Chrome extension.

---

## Overview

There is no Redux, Zustand, Vuex, Pinia, React Query, or server-state cache in
this project. State is plain JavaScript and is scoped by runtime:

- Persistent settings: `chrome.storage.local`.
- Options page form state: DOM field values plus normalized settings objects.
- Content script runtime state: one local `state` object inside the helper IIFE.
- Execution resume state: `localStorage` keyed by `APPLY_LOCAL_STORAGE_KEY`.
- Debug/status exports: selected `window.__...` values for manual inspection.
- Planner data: explicit plan/capture objects passed through message payloads.

---

## Persistent Settings

Settings are normalized and validated before saving. The storage key is defined
once in `src/extension-settings.js` and reused by `options.js` and
`service-worker.js`.

Real storage key and defaults:

```js
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
```

Real read path from `service-worker.js`:

```js
async function readSettings() {
  const payload = await chromeStorageGet(EXTENSION_SETTINGS_STORAGE_KEY);
  return normalizeExtensionSettings(payload[EXTENSION_SETTINGS_STORAGE_KEY] ?? {});
}
```

When adding a setting, update normalization, validation, summary masking if it
is secret-like, options form read/write, and tests.

---

## Helper Runtime State

The injected helper keeps all mutable page workflow state in a single object.
Do not scatter helper state into independent globals.

Real helper state shape:

```js
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
```

After mutating helper state, call the existing UI sync/render function for the
touched surface, such as `syncUi()` or a modal render helper.

---

## Resume and Debug State

Execution pause/resume state is intentionally persisted to the 115 page's
`localStorage`, not to repository files. This lets the helper resume after rate
limit or browser refresh.

Real persistence example:

```js
localStorage.setItem(APPLY_LOCAL_STORAGE_KEY, JSON.stringify(buildPersistedState(plan, planKey)));
```

The helper also exposes debug handles for manual inspection:

```js
window.__115MediaHelper = {
  captureCurrentFolder,
  generatePlanFromLastCapture,
  getImportedPlan: () => state.importedPlan,
  getReport: () => state.report,
  startExecutePlan,
  pause: requestPause,
  resume: () => startExecutePlan({ resumeRequested: true }),
};
```

Keep these exports small and tied to real troubleshooting workflows. Do not
store secrets or generated plans in the repository.

---

## Planner State

Planner functions should be deterministic over explicit inputs. Pass state as
`entries` and an `options` object; avoid hidden globals.

Real service-worker plan context:

```js
const options = {
  mode,
  rootPath,
  sourceRootRelativePath: sourceData.sourceRootRelativePath,
  inputContext,
  executionRootPath: executionRoot?.folderName ?? sourceData.folderName ?? "",
  cleanupOverrides,
};

const plan = await buildPlanAsync(entries, options);
```

The returned plan is then enriched with execution/source context by
`attachExecutionContext(...)`.

---

## Derived State

Prefer computing summaries from plan/capture data at install/render time rather
than maintaining duplicate counters by hand. Existing plan summaries include
counts for moves, deletes, reviews, and collisions, and helper rendering reads
from those summary fields.

Real preview entry:

```js
const { summary } = state.importedPlan;
log(`计划预览：move=${summary.moveCount}, rename=${summary.renameCount}, delete=${summary.deleteCount}, review=${summary.reviewCount}`);
openPlanPreviewModal(state.importedPlan);
```

---

## Common Mistakes

- Do not save API keys, captures, plans, logs, or screenshots to tracked files.
- Do not split helper workflow state across multiple globals when it belongs in
  the existing `state` object.
- Do not treat `targetRootName` as authoritative; real execution uses cid.
- Do not skip validation before writing `chrome.storage.local`.
- Do not use `localStorage` for extension settings; it is only for page-helper
  execution resume state.
