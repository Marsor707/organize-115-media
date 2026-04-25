import test from "node:test";
import assert from "node:assert/strict";

import { createOpenAiLlmResolver } from "../src/openai-llm-resolver-client.js";

test("浏览器 OpenAI client 在 throwOnError=true 时会让 401 中断计划生成", async () => {
  const resolver = createOpenAiLlmResolver({
    apiKey: "bad-key",
    baseUrl: "https://example.com/v1",
    model: "gpt-test",
    throwOnError: true,
    fetchImpl: async () => {
      return new Response(
        JSON.stringify({
          error: {
            message: "invalid api key",
          },
        }),
        {
          status: 401,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    },
  });

  await assert.rejects(
    () =>
      resolver({
        rootSource: "The Last of Us",
        missSources: ["The.Last.of.Us.S01E01.mkv"],
        entries: [],
      }),
    /OpenAI 请求失败: 401 invalid api key/u,
  );
});

test("浏览器 OpenAI client 默认保持旧行为：失败时返回 unresolved", async () => {
  const resolver = createOpenAiLlmResolver({
    apiKey: "bad-key",
    baseUrl: "https://example.com/v1",
    model: "gpt-test",
    fetchImpl: async () => {
      throw new Error("network failed");
    },
  });

  const result = await resolver({
    rootSource: "The Last of Us",
    missSources: ["The.Last.of.Us.S01E01.mkv"],
    entries: [],
  });

  assert.deepEqual(result, {
    resolved: false,
  });
});
