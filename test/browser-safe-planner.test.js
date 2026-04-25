import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

import { buildPlanAsync } from "../src/build-115-plan.js";

test("浏览器 planner 入口可直接生成非 TMDB plan", async () => {
  const plan = await buildPlanAsync(
    [
      {
        source: "The.Last.of.Us.S01E01.1080p.mkv",
        fid: "file-1",
      },
    ],
    {
      mode: "classify",
    },
  );

  assert.equal(plan.moves.length, 1);
  assert.equal(plan.moves[0].category, "series");
});

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
