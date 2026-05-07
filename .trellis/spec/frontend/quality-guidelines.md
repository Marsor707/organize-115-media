# Quality Guidelines

> Code quality, verification, and review standards for the extension.

---

## Overview

Quality gates are lightweight and explicit. There is no build step. The main
verification entry is `npm test`, supported by direct syntax and JSON checks for
the extension entry points.

Required checks by change type:

```bash
node --check service-worker.js
node --check options.js
node --check snippets/organize-115-media-helper.user.js
node -e "JSON.parse(require('fs').readFileSync('manifest.json', 'utf8'))"
npm test
```

For behavior changes, prefer running `npm test` even if only one file changed.

---

## Testing Requirements

Tests use Node's built-in test runner and strict assertions:

```js
import test from "node:test";
import assert from "node:assert/strict";
```

Add or update focused tests when changing:

- Planner classification, TMDB normalization, collision, no-op, delete, or
  review behavior.
- Extension settings normalization, validation, or summaries.
- Service-worker message behavior.
- Manifest entry points or extension root structure.
- Helper UI contracts that are intentionally stable.
- README public-surface claims.

Real browser-safety test:

```js
test("浏览器 planner 核心模块不再静态导入 Node 内置模块", async () => {
  const files = [
    "src/build-115-plan.js",
    "src/organize115.js",
    "src/tmdb-normalize-core.js",
    "src/tmdb-client.js",
    "src/openai-llm-resolver-client.js",
  ];

  for (const file of files) {
    const source = await fs.readFile(file, "utf8");
    assert.doesNotMatch(source, /from\s+["']node:/u, file);
  }
});
```

Real service-worker test pattern with fake Chrome APIs:

```js
globalThis.chrome = {
  action: {
    onClicked: {
      addListener() {},
    },
  },
  runtime: {
    getURL: (value) => value,
    openOptionsPage: async () => {},
    onMessage: {
      addListener(listener) {
        listeners.push(listener);
      },
    },
  },
  storage: {
    local: {
      async get(key) {
        return { [key]: storage[key] };
      },
    },
  },
};
```

---

## Deterministic External Clients

Do not call real 115, TMDB, or OpenAI APIs from tests. Use injected fakes.

Real fake TMDB pattern:

```js
const tmdbClient = createFakeTmdbClient({
  movieResults: {
    "Spirited Away": [
      {
        id: 129,
        title: "千与千寻",
        original_title: "Spirited Away",
        release_date: "2001-07-20",
      },
    ],
  },
});
```

Real OpenAI failure test pattern:

```js
const resolver = createOpenAiLlmResolver({
  apiKey: "bad-key",
  baseUrl: "https://example.com/v1",
  model: "gpt-test",
  throwOnError: true,
  fetchImpl: async () => {
    return new Response(JSON.stringify({ error: { message: "invalid api key" } }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  },
});
```

---

## Required Patterns

- Keep browser-facing code as ES modules with two-space indentation and
  semicolons.
- Validate settings before saving to `chrome.storage.local`.
- Keep content-script calls to extension-only APIs behind service-worker
  messages.
- Preserve manual confirmation for real 115 execution.
- Keep API keys masked in summaries.
- Keep public README and manifest surface aligned with the Chrome extension
  workflow only.
- Add concise Chinese comments for complex browser flows when they save future
  readers from tracing the whole flow.

Real safety comment from `service-worker.js`:

```js
// 设置页统一由后台打开，兼容工具栏点击和页面面板消息。
chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});
```

---

## Forbidden Patterns

- No React/Vue/TypeScript/bundler conventions unless explicitly requested.
- No real API calls in tests.
- No committed API keys, captures, generated plans, logs, screenshots, or real
  115 directory data.
- No generated snippets or old local CLI/batch workflow files in the public
  extension surface.
- No direct `chrome.runtime.openOptionsPage()` from the content script.
- No `node:` imports from browser runtime files.
- No `window.prompt` confirmation for high-risk execution.

---

## Code Review Checklist

Before considering a change complete:

1. Does the touched runtime match its boundary: service worker, options page,
   content script, or browser-safe `src/` module?
2. Are message types, selectors, storage keys, and plan fields searched for and
   updated consistently?
3. Are user-provided settings, imported JSON, and API responses normalized or
   validated before use?
4. Are secrets masked and generated/real data excluded from tracked files?
5. Are tests updated with deterministic fakes instead of real network calls?
6. Did the relevant syntax checks and `npm test` pass or get reported with the
   exact blocker?
