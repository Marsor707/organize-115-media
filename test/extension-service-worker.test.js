import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";

test("service worker 生成 plan 时会用设置里的目标目录作为 executionRoot", async () => {
  const listeners = [];
  const storage = {
    organize115MediaSettings: {
      targetRootCid: "target-root",
      targetRootName: "影视库",
      tmdbApiKey: "",
    },
  };

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
        async set(value) {
          Object.assign(storage, value);
        },
        async remove(key) {
          delete storage[key];
        },
      },
    },
  };
  globalThis.fetch = async () => ({
    ok: false,
    async json() {
      return {};
    },
  });

  const serviceWorkerUrl = pathToFileURL(path.resolve("service-worker.js"));
  await import(`${serviceWorkerUrl.href}?target-root-test=${Date.now()}`);

  assert.equal(listeners.length, 1);
  const response = await new Promise((resolve) => {
    listeners[0](
      {
        type: "organize115:buildPlan",
        payload: {
          mode: "classify",
          entries: [
            {
              source: "The.Last.of.Us.S01E01.mkv",
              fid: "file-1",
            },
          ],
          sourceData: {
            cid: "source-root",
            folderName: "下载目录",
            rootPath: "下载目录",
          },
        },
      },
      {},
      resolve,
    );
  });

  assert.equal(response.ok, true);
  assert.equal(response.payload.sourceRootCid, "source-root");
  assert.equal(response.payload.sourceFolderName, "下载目录");
  assert.equal(response.payload.executionRootCid, "target-root");
  assert.equal(response.payload.executionFolderName, "影视库");
  assert.equal(response.payload.rootCid, "target-root");
});
