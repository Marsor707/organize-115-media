# Repository Guidelines

## Project Structure & Module Organization

This repository is a Chrome Manifest V3 extension for organizing media folders in 115 Web. Root files such as `manifest.json`, `service-worker.js`, `options.html`, `options.css`, and `options.js` define the extension entry points and settings UI. Core planning logic lives in `src/`, with `src/build-115-plan.js` as the browser-safe planner entry and `src/organize115.js` / `src/tmdb-normalize*.js` handling classification and TMDB normalization. The injected page helper is `snippets/organize-115-media-helper.user.js`. Static cleanup overrides are stored in `config/media-cleanup-overrides.json`. Tests live in `test/*.test.js`.

## Build, Test, and Development Commands

- `npm test`: runs the Node.js test suite with `node --test`.
- `node --check service-worker.js`: validates service worker syntax.
- `node --check options.js`: validates settings page script syntax.
- `node --check snippets/organize-115-media-helper.user.js`: validates the injected helper syntax.
- `node -e "JSON.parse(require('fs').readFileSync('manifest.json', 'utf8'))"`: verifies `manifest.json` is valid JSON.

There is no build step; load the repository root directly in `chrome://extensions` as an unpacked extension.

## Coding Style & Naming Conventions

Use ES modules, two-space indentation, semicolons, and `camelCase` for variables and functions. Use `UPPER_SNAKE_CASE` for constants that represent fixed keys or modes. Keep file names lowercase and hyphenated, for example `tmdb-query-scheduler.js`. Keep browser-facing code free of Node-only imports such as `node:fs` or `node:path`.

## Testing Guidelines

Tests use `node:test` and `node:assert/strict`. Name tests as `test/<feature>.test.js`. Add or update focused tests when changing planner behavior, extension settings, manifest surface, or README public-surface claims. Prefer deterministic fake clients for TMDB and OpenAI behavior; do not call real APIs from tests.

## Commit & Pull Request Guidelines

Follow the existing Conventional Commits style, for example `chore: prepare open source release`. Pull requests should describe the user-facing change, list validation commands and results, and include screenshots when the extension panel or settings UI changes. Link related issues when available.

## Security & Configuration Tips

Never commit API keys, exported captures, generated plans, logs, or real 115 directory data. `.gitignore` excludes `data/`, `tmp/`, `115-plan-*.json`, `115-capture-*.json`, and generated `snippets/*`. API keys belong in `chrome.storage.local`. Any real execution against 115 Web must require manual confirmation of source cid, target cid, review count, and delete count.
