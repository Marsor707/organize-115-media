import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

test("仓库根 manifest 可作为唯一 Chrome 未打包扩展入口加载", async () => {
  const manifest = JSON.parse(await fs.readFile("manifest.json", "utf8"));
  const referencedFiles = [
    manifest.background.service_worker,
    manifest.options_ui.page,
    ...manifest.content_scripts.flatMap((item) => item.js),
    "src/build-115-plan.js",
    "src/openai-llm-resolver-client.js",
    "src/tmdb-client.js",
    "config/media-cleanup-overrides.json",
  ];

  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.background.service_worker, "service-worker.js");
  assert.deepEqual(manifest.action, {
    default_title: "115 影视整理助手设置",
  });
  assert.equal(manifest.options_page, undefined);
  assert.equal(manifest.options_ui.page, "options.html");
  assert.equal(manifest.options_ui.open_in_tab, true);

  for (const file of referencedFiles) {
    assert.equal(file.startsWith("extension/"), false, file);
    const stat = await fs.stat(file);
    assert.equal(stat.isFile(), true, file);
  }
});

test("extension 目录不再作为重复扩展根目录保留", async () => {
  await assert.rejects(fs.stat("extension"), {
    code: "ENOENT",
  });
});

test("扩展设置入口由 service worker 统一打开", async () => {
  const serviceWorker = await fs.readFile("service-worker.js", "utf8");
  const contentScript = await fs.readFile(path.join("snippets", "organize-115-media-helper.user.js"), "utf8");

  assert.match(serviceWorker, /organize115:openOptions/u);
  assert.match(serviceWorker, /chrome\.action\.onClicked/u);
  assert.match(serviceWorker, /chrome\.runtime\.openOptionsPage/u);

  assert.match(contentScript, /organize115:openOptions/u);
  assert.match(contentScript, /data-organize115-runtime/u);
  assert.match(contentScript, /设为目标目录/u);
  assert.match(contentScript, /导入计划/u);
  assert.match(contentScript, /采集当前目录/u);
  assert.match(contentScript, /生成计划/u);
  assert.doesNotMatch(contentScript, /刷新目录/u);
  assert.doesNotMatch(contentScript, /设当前目录为目标目录/u);
  assert.doesNotMatch(contentScript, /导入 plan（高级）/u);
  assert.doesNotMatch(contentScript, /data-action="refresh"/u);
  assert.doesNotMatch(contentScript, /\[data-action="refresh"\]/u);
  assert.match(contentScript, /window\.confirm\(buildHighRiskConfirmText\(summary\)\)/u);
  assert.doesNotMatch(contentScript, /window\.prompt/u);
  assert.doesNotMatch(contentScript, /确认执行/u);
  assert.doesNotMatch(contentScript, />递归整理当前目录</u);
  assert.match(contentScript, /summary\.sourceRootCid \?\? summary\.executionRootCid/u);
  assert.match(contentScript, /let currentPid = plan\.executionRootCid \|\| plan\.rootCid/u);
  assert.doesNotMatch(contentScript, /chrome\.runtime\.openOptionsPage/u);
});

test("页面助手的预览计划入口使用 modal Tab 表格", async () => {
  const contentScript = await fs.readFile(path.join("snippets", "organize-115-media-helper.user.js"), "utf8");

  assert.match(contentScript, /const PREVIEW_MODAL_ID = "__organize115MediaPlanPreviewModal";/u);
  assert.match(contentScript, /function openPlanPreviewModal\(importedPlan\)/u);
  assert.match(contentScript, /const \{ plan, summary \} = importedPlan/u);
  assert.match(contentScript, /openPlanPreviewModal\(state\.importedPlan\);/u);
  assert.match(contentScript, /key: "moves"/u);
  assert.match(contentScript, /key: "deletes"/u);
  assert.match(contentScript, /key: "reviews"/u);
  assert.match(contentScript, /key: "collisions"/u);
  assert.match(contentScript, /placeholder="搜索当前 Tab：源路径 \/ 目标路径 \/ 原因 \/ id"/u);
  assert.match(contentScript, /position: sticky;/u);
  assert.match(contentScript, /height: min\(62vh, 640px\);/u);
  assert.match(contentScript, /暂无数据/u);
});

test("页面助手拆分采集与生成计划入口", async () => {
  const contentScript = await fs.readFile(path.join("snippets", "organize-115-media-helper.user.js"), "utf8");

  assert.match(contentScript, /<button class="helper-primary" data-action="capture-current">采集当前目录<\/button>/u);
  assert.match(contentScript, /<button data-action="generate-plan">生成计划<\/button>/u);
  assert.match(
    contentScript,
    /\[data-action="capture-current"\][\s\S]*?captureCurrentFolderTreeForPlanning\(\)\.catch\(\(error\) => handleTopLevelError\("采集当前目录失败", error\)\)/u,
  );
  assert.match(
    contentScript,
    /\[data-action="generate-plan"\][\s\S]*?generatePlanFromLastCapture\(\)\.catch\(\(error\) => handleTopLevelError\("生成计划失败", error\)\)/u,
  );

  const captureStart = contentScript.indexOf("async function captureCurrentFolderTreeForPlanning()");
  const generateStart = contentScript.indexOf("async function generatePlanFromLastCapture()");
  const legacyGenerateStart = contentScript.indexOf("async function generateCurrentTmdbPlan()");
  assert.notEqual(captureStart, -1);
  assert.notEqual(generateStart, -1);
  assert.notEqual(legacyGenerateStart, -1);

  const captureFunction = contentScript.slice(captureStart, generateStart);
  assert.match(
    captureFunction,
    /captureFolderTreeSlowSafe\(\{\s*rootCid: state\.currentCid,\s*download: false,\s*\}\)/u,
  );
  assert.doesNotMatch(captureFunction, /installGeneratedPlanFromCapture/u);

  const generateFunction = contentScript.slice(generateStart, legacyGenerateStart);
  assert.match(generateFunction, /const capture = state\.lastCapture/u);
  assert.match(generateFunction, /window\.alert\("请先点击“采集当前目录”。"\)/u);
  assert.match(generateFunction, /const executionRoot = await requireTargetRoot\(\)/u);
  assert.match(generateFunction, /installGeneratedPlanFromCapture\(capture, \{/u);
  assert.match(generateFunction, /mode: "tmdb-normalize"/u);
});

test("页面助手支持导入采集 JSON", async () => {
  const contentScript = await fs.readFile(path.join("snippets", "organize-115-media-helper.user.js"), "utf8");

  assert.match(contentScript, /helper-row-capture/u);
  assert.match(contentScript, /white-space: nowrap;/u);
  assert.match(contentScript, /<button data-action="import-capture">导入采集<\/button>/u);
  assert.match(contentScript, /<button data-action="download-capture">下载采集<\/button>/u);
  assert.doesNotMatch(contentScript, /<button[^>]*>下载采集结果<\/button>/u);
  assert.match(contentScript, /<input data-role="capture-file" type="file" accept="application\/json,\.json" hidden>/u);
  assert.match(contentScript, /data-action="import-capture"/u);
  assert.match(contentScript, /data-role="capture-file"/u);
  assert.match(
    contentScript,
    /\[data-action="import-capture"\][\s\S]*?querySelector\('\[data-role="capture-file"\]'\)\.click\(\)/u,
  );
  assert.match(
    contentScript,
    /querySelector\('\[data-role="capture-file"\]'\)\.addEventListener\("change", importCaptureFromFile\)/u,
  );

  const importCaptureStart = contentScript.indexOf("async function importCaptureFromFile(event)");
  const importPlanStart = contentScript.indexOf("async function importPlanFromFile(event)");
  assert.notEqual(importCaptureStart, -1);
  assert.notEqual(importPlanStart, -1);

  const importCaptureFunction = contentScript.slice(importCaptureStart, importPlanStart);
  assert.match(importCaptureFunction, /const capture = normalizeCaptureForHelper\(payload\)/u);
  assert.match(importCaptureFunction, /state\.lastCapture = capture/u);
  assert.match(importCaptureFunction, /state\.currentFolderName = capture\.folderName \?\? null/u);
  assert.match(importCaptureFunction, /window\.__capture115AllPages = capture/u);
  assert.match(importCaptureFunction, /state\.importedPlan = null/u);
  assert.match(importCaptureFunction, /state\.planBundle = null/u);
  assert.match(importCaptureFunction, /state\.lastGeneratedPlan = null/u);
  assert.match(importCaptureFunction, /state\.report = null/u);
  assert.match(importCaptureFunction, /resetApplyRuntime\(\)/u);
  assert.doesNotMatch(importCaptureFunction, /normalizePlanForHelper/u);
  assert.doesNotMatch(importCaptureFunction, /generatePlanFromLastCapture\(\)/u);

  assert.match(contentScript, /function normalizeCaptureForHelper\(capture\)/u);
  assert.match(contentScript, /这是 plan，不是采集结果/u);
  assert.match(contentScript, /请使用“导入计划”/u);
  assert.match(contentScript, /采集 JSON 缺少 entries 数组/u);
  assert.match(contentScript, /采集 JSON 缺少 cid/u);
});

test("页面助手预览入口保留无 plan 提示和采集 JSON 误导入提示", async () => {
  const contentScript = await fs.readFile(path.join("snippets", "organize-115-media-helper.user.js"), "utf8");

  assert.match(
    contentScript,
    /function previewPlan\(\) \{[\s\S]*?if \(!state\.importedPlan\) \{[\s\S]*?window\.alert\("请先导入 plan JSON。"\);/u,
  );
  assert.match(contentScript, /这是采集结果，不是 plan/u);
  assert.match(contentScript, /请使用“生成计划”生成 plan/u);
  assert.doesNotMatch(contentScript, /请使用“递归整理当前目录”生成 plan/u);
});
