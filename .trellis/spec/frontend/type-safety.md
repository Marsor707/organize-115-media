# Type Safety

> Runtime validation and shape normalization in plain JavaScript.

---

## Overview

This project uses JavaScript ES modules, not TypeScript. Type safety is achieved
through:

- Runtime normalization functions.
- Explicit validation before persistence or execution.
- Shape guards such as `Array.isArray(...)`, `typeof value === "object"`, and
  optional chaining.
- Deterministic tests that assert normalized outputs and error messages.

Do not add TypeScript syntax, generated type layers, or a schema library unless a
task explicitly changes the stack.

---

## Normalization Pattern

Normalize external or user-provided data at boundaries, then pass normalized
objects through the rest of the flow.

Real settings normalizer:

```js
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
```

Real source-data guard:

```js
function normalizeSourceData(value = {}) {
  return value && typeof value === "object" ? value : {};
}
```

---

## Validation Pattern

Validation functions return structured results instead of throwing for expected
form errors. Callers decide how to display the errors.

Real settings validator:

```js
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

  return {
    ok: errors.length === 0,
    errors,
    settings,
  };
}
```

`options.js` uses this shape directly:

```js
const validation = validateExtensionSettings(readForm());
if (!validation.ok) {
  setStatus(validation.errors.join("；"), true);
  return;
}
```

---

## JSON and API Boundaries

Parse JSON at the boundary and validate the resulting shape before use.

Real TMDB client pattern:

```js
const text = await response.text();

let payload;
try {
  payload = JSON.parse(text);
} catch {
  throw new Error(`TMDB 返回了非 JSON 响应: ${url.pathname}`);
}

if (!response.ok) {
  const message = payload?.status_message ?? payload?.message ?? text.slice(0, 200);
  throw new Error(`TMDB 请求失败: ${response.status} ${url.pathname} ${message}`);
}
```

Real content-script message response guard:

```js
if (!response?.ok) {
  reject(new Error(response?.error ?? "扩展后台未返回成功结果"));
  return;
}
```

---

## Browser-Safe Type Boundaries

Browser-facing modules must not rely on Node-specific types or imports. When a
Node-like helper is needed, provide a browser-safe local module, as
`src/path-posix.js` does for POSIX path operations.

The browser safety rule is covered by `test/browser-safe-planner.test.js`:

```js
for (const file of files) {
  const source = await fs.readFile(file, "utf8");
  assert.doesNotMatch(source, /from\s+["']node:/u, file);
}
```

---

## Test Doubles as Contracts

Use fake clients to define the shape expected by planner code. This is the
current convention for TMDB and OpenAI behavior.

Real fake TMDB client shape:

```js
return {
  calls,
  async searchMovie(query, extra = {}) {
    calls.push({ type: "movie", query, extra });
    return resolveResults(movieResults, query);
  },
  async searchTv(query, extra = {}) {
    calls.push({ type: "tv", query, extra });
    return resolveResults(tvResults, query);
  },
};
```

---

## Forbidden Patterns

- Do not add `.ts`, `interface`, `type`, or generics to runtime code without a
  stack-level decision.
- Do not assume input objects have the expected shape; normalize at boundaries.
- Do not parse API JSON and continue after parse failure.
- Do not expose raw API keys in summaries or logs. Use `maskSecret(...)`.
- Do not use `any`-style comments as a substitute for real validation.
