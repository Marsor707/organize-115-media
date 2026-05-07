# Directory Structure

> How extension and browser-facing code is organized in this project.

---

## Overview

This is a single-root Chrome MV3 extension. The repository root is the unpacked
extension root; do not create a second `extension/` directory or move runtime
entry points under a build output folder.

Real root-level extension files:

```text
manifest.json
service-worker.js
options.html
options.css
options.js
snippets/organize-115-media-helper.user.js
src/
config/media-cleanup-overrides.json
test/
```

`test/extension-manifest.test.js` enforces this root shape and verifies that the
legacy `extension/` directory does not exist.

---

## Runtime Layout

```text
.
├── manifest.json                         # MV3 declaration and extension entry map
├── service-worker.js                     # background service worker, message router
├── options.html / options.css / options.js
│                                           # settings page saved to chrome.storage.local
├── snippets/
│   └── organize-115-media-helper.user.js # injected content script / page helper
├── src/
│   ├── build-115-plan.js                 # browser-safe async planner entry
│   ├── organize115.js                    # classify / flatten planner logic
│   ├── tmdb-normalize.js                 # TMDB normalize orchestration
│   ├── tmdb-normalize-core.js            # browser-safe TMDB planning core
│   ├── tmdb-client.js                    # TMDB HTTP client with injected fetch
│   ├── openai-llm-resolver-client.js     # browser-safe OpenAI-compatible client
│   ├── extension-settings.js             # settings normalization, validation, summary
│   ├── path-posix.js                     # local browser-safe POSIX path helper
│   └── tmdb-query-scheduler.js           # throttled TMDB query scheduler
├── config/
│   └── media-cleanup-overrides.json      # static cleanup override data
└── test/
    └── *.test.js                         # node:test coverage
```

---

## Module Organization

Keep extension responsibilities separated by runtime:

- `service-worker.js` owns Chrome extension APIs that require the background
  context, such as `chrome.runtime.openOptionsPage()` and reading package
  resources with `chrome.runtime.getURL(...)`.
- `options.js` owns the options form only. It reads DOM fields, calls
  `normalizeExtensionSettings(...)` / `validateExtensionSettings(...)`, and
  writes `chrome.storage.local`.
- `snippets/organize-115-media-helper.user.js` owns the injected panel, current
  115 page capture, preview modal, execution controls, resume state, and all
  direct 115 Web requests.
- `src/` modules must be browser-safe unless the file is test-only. The test
  `test/browser-safe-planner.test.js` checks the important planner modules for
  static `node:` imports.
- `test/` may use Node-only imports such as `node:fs/promises` and
  `node:path`.

Real routing example from `service-worker.js`:

```js
if (message.type === "organize115:buildPlan") {
  return buildPlan(message.payload ?? {});
}

if (message.type === "organize115:openOptions") {
  return openOptionsPage();
}
```

Real browser-safe planner entry from `src/build-115-plan.js`:

```js
export async function buildPlanAsync(entries, options = {}) {
  const mode = normalizePlanMode(options.mode);

  if (mode === TMDB_NORMALIZE_MODE) {
    return buildTmdbNormalizePlan(entries, options);
  }

  return buildPlan(entries, options);
}
```

---

## Naming Conventions

- Use ES modules and explicit relative imports.
- Use two-space indentation and semicolons.
- Use `camelCase` for variables and functions.
- Use `UPPER_SNAKE_CASE` for fixed keys, modes, selector IDs, storage keys, and
  retry/delay constants.
- Keep file names lowercase and hyphenated: `tmdb-query-scheduler.js`,
  `openai-llm-resolver-client.js`.
- Keep tests named `test/<feature>.test.js`.

Real constant examples:

```js
export const EXTENSION_SETTINGS_STORAGE_KEY = "organize115MediaSettings";
export const DEFAULT_PLAN_MODE = "classify";
export const TMDB_NORMALIZE_MODE = "tmdb-normalize";
const APPLY_LOCAL_STORAGE_KEY = "__115_apply_plan_state_v1__";
```

---

## Adding New Files

- Add shared planning logic under `src/` only when it can run in the extension
  without a bundler.
- Add new page-helper UI and direct 115 Web interaction to
  `snippets/organize-115-media-helper.user.js` unless the task explicitly
  extracts a module and wires it through `manifest.json`.
- Add new settings fields to `options.html`, `options.js`, and
  `src/extension-settings.js` together, then cover them in
  `test/extension-settings.test.js`.
- Add or adjust manifest entry points with `test/extension-manifest.test.js`.

---

## Forbidden Layouts

- Do not add `bin/`, old local batch scripts, generated apply scripts, real
  captures, or real execution plans back into the public runtime surface.
- Do not create `extension/` as a duplicate root.
- Do not add a build-only `dist/` requirement for normal development.
- Do not import `node:fs`, `node:path`, or other Node-only modules from
  browser-facing runtime files.
