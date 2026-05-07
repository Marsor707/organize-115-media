# Frontend Development Guidelines

> Project-specific guidelines for the 115 media organizer Chrome extension.

---

## Overview

This repository is a Chrome Manifest V3 extension, not a React/Vue/TypeScript app.
The runtime surface is loaded directly from the repository root as an unpacked
extension:

```json
{
  "manifest_version": 3,
  "background": {
    "service_worker": "service-worker.js",
    "type": "module"
  },
  "content_scripts": [
    {
      "js": ["snippets/organize-115-media-helper.user.js"],
      "run_at": "document_idle"
    }
  ]
}
```

Use browser-safe ES modules, native DOM APIs, `chrome.storage.local`, and
deterministic `node:test` coverage. There is no build step and no bundler.

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | Chrome extension entry points, browser-safe modules, tests | Filled |
| [Component Guidelines](./component-guidelines.md) | Native DOM UI patterns for options page and injected helper | Filled |
| [Hook Guidelines](./hook-guidelines.md) | Extension listeners, DOM events, and async message boundaries | Filled |
| [State Management](./state-management.md) | `chrome.storage.local`, helper runtime state, resume state | Filled |
| [Quality Guidelines](./quality-guidelines.md) | Tests, syntax checks, security, review checklist | Filled |
| [Type Safety](./type-safety.md) | Runtime normalization and validation in plain JavaScript | Filled |

---

## Pre-Development Checklist

Before changing extension behavior:

1. Read the guideline file that matches the touched area.
2. Search for the value, message type, selector, storage key, or plan field you
   are about to change.
3. Keep browser-facing files free of Node-only imports.
4. Add or update focused `node:test` coverage for planner behavior, extension
   settings, manifest surface, README public-surface claims, or helper UI
   contracts.
5. Run the smallest relevant checks, and prefer `npm test` when behavior changed.

---

## Stack Boundaries

- Extension shell: `manifest.json`, `service-worker.js`, `options.html`,
  `options.css`, `options.js`.
- Injected 115 page helper: `snippets/organize-115-media-helper.user.js`.
- Shared browser-safe planner modules: `src/*.js`, especially
  `src/build-115-plan.js`, `src/organize115.js`, and `src/tmdb-normalize*.js`.
- Static cleanup data: `config/media-cleanup-overrides.json`.
- Tests: `test/*.test.js` using `node:test` and `node:assert/strict`.

Do not introduce React, Vue, TypeScript, a bundler, a duplicate extension root,
or old local CLI/batch workflows unless a task explicitly reopens that scope.

---

**Language**: Spec documentation is written in English. User-facing extension
copy and existing source examples may remain Chinese where that is the real
product language.
