import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

test("README 只保留 Chrome 扩展用户流程", async () => {
  const source = await fs.readFile("README.md", "utf8");

  assert.doesNotMatch(source, /Tampermonkey/u);
  assert.doesNotMatch(source, /Console/u);
  assert.doesNotMatch(source, /Node CLI/u);
  assert.doesNotMatch(source, /npm run plan/u);
  assert.doesNotMatch(source, /wizard/u);
  assert.doesNotMatch(source, /云下载 三计划/u);
  assert.doesNotMatch(source, /\/Users\/marsor/u);
  assert.match(source, /chrome\.storage\.local/u);
  assert.match(source, /加载已解压的扩展程序/u);
  assert.match(source, /npm test/u);
});

test("公开仓库不保留旧 CLI、批处理和真实执行产物", async () => {
  const removedPaths = [
    "bin",
    "skills",
    "data",
    "tmp",
    "examples",
    "src/generate-115-apply-script.js",
    "src/plan-115-media-cli.js",
    "src/organize-115-wizard.js",
    "src/openai-llm-resolver.js",
    "snippets/capture-115-folder-all-pages.js",
    "snippets/apply-115-cloud-download-anime-tmdb-plan.js",
  ];

  for (const filePath of removedPaths) {
    await assert.rejects(fs.stat(filePath), {
      code: "ENOENT",
    });
  }

  const helper = await fs.stat("snippets/organize-115-media-helper.user.js");
  assert.equal(helper.isFile(), true);
});
