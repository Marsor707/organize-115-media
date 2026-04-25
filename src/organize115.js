import { path } from "./path-posix.js";

const VIDEO_EXTENSIONS = new Set([
  ".mp4",
  ".mkv",
  ".avi",
  ".mov",
  ".wmv",
  ".flv",
  ".rmvb",
  ".ts",
  ".m2ts",
  ".webm",
  ".mpg",
  ".mpeg",
  ".iso",
]);

const SIDECAR_EXTENSIONS = new Set([
  ".srt",
  ".ass",
  ".ssa",
  ".sub",
  ".idx",
  ".nfo",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
]);

export const CATEGORY_LABELS = {
  movie: "电影",
  series: "剧集",
  anime: "动漫",
  variety: "综艺",
  documentary: "纪录片",
  review: "待人工确认",
  quarantine: "整理保留区",
};

export const DEFAULT_PLAN_MODE = "classify";
export const FLATTEN_WRAPPER_DIR_MODE = "flatten-wrapper-dir";
export const TMDB_NORMALIZE_MODE = "tmdb-normalize";
const REVIEW_TYPE_NESTED_SIDECAR_DIR = "nested-sidecar-dir";
const REVIEW_TYPE_NON_SIDECAR_FILE = "non-sidecar-file";
const REVIEW_TYPE_MULTI_VIDEO = "multi-video";
const FLATTEN_ALLOWED_ROOT_DIR_NAMES = new Set(["动漫", "电影", "纪录片"]);
const MEDIA_CATEGORY_ROOT_DIR_NAMES = new Set(["动漫", "电影", "剧集", "纪录片"]);

const NESTED_SIDECAR_DIR_PATTERNS = [
  /\bsubs?\b/i,
  /\bsubtitles?\b/i,
  /\bcaptions?\b/i,
  /\battachments?\b/i,
  /\bextras?\b/i,
  /\bcovers?\b/i,
  /\bimages?\b/i,
  /\bposters?\b/i,
  /字幕/u,
  /附件/u,
  /封面/u,
  /海报/u,
  /图片/u,
];

const SERIES_PATTERNS = [
  /(?:^|[^A-Za-z0-9])S(\d{1,2})E(\d{1,3})(?=$|[^0-9])/i,
  /(?:^|[^A-Za-z0-9])S(\d{1,2})(?=$|[^0-9])/i,
  /(?:^|[^A-Za-z0-9])E(P)?(\d{1,3})(?=$|[^0-9])/i,
  /第\s*([0-9一二三四五六七八九十百零两]+)\s*[集话話]/i,
  /第\s*([0-9一二三四五六七八九十百零两]+)\s*季/i,
  /\bSeason[ ._-]?(\d{1,2})\b/i,
  /\bComplete\b/i,
  /全集/i,
  /全\d+[集话話季]/i,
];

const DOCUMENTARY_PATTERNS = [
  /纪录片/i,
  /\bDocumentary\b/i,
  /\bBBC\b/i,
  /国家地理/i,
  /National[ ._-]?Geographic/i,
  /\bNHK\b/i,
  /Green[ ._-]?Planet/i,
];

const ANIME_PATTERNS = [
  /动漫/i,
  /\bAnime\b/i,
  /\[ANi\]/i,
  /链锯人/i,
  /チェンソーマン/i,
  /鬼滅之刃/i,
  /鬼灭之刃/i,
  /\bJoJo\b/i,
  /\bJOJO\b/i,
  /\bBLEACH\b/i,
  /\bMashle\b/i,
  /\bFate\b/i,
  /Hunter[ ._-]?X[ ._-]?Hunter/i,
  /Sword[ ._-]?Art[ ._-]?Online/i,
  /進擊的巨人/i,
  /终末的女武神/i,
  /Record[ ._-]?of[ ._-]?Ragnarok/i,
  /七大罪/i,
  /Nanatsu[ ._-]?no[ ._-]?Taizai/i,
  /来自深渊/i,
  /Made[ ._-]?in[ ._-]?Abyss/i,
  /一拳超人/i,
  /咒术回战/i,
  /Jujutsu[ ._-]?Kaisen/i,
  /葬送的芙莉莲/i,
  /Frieren/i,
  /无职转生/i,
  /中国奇谭/i,
  /天国大魔境/i,
  /Chainsaw[ ._-]?Man/i,
  /Cyberpunk[ ._-]?Edgerunners/i,
  /柱訓練篇/i,
  /\bOVA\b/i,
  /\bOAD\b/i,
  /剧场版/i,
  /番剧/i,
];

const VARIETY_PATTERNS = [
  /综艺/i,
  /第\s*\d+\s*期/i,
  /纯享版/i,
  /加更版/i,
  /花絮/i,
  /舞台/i,
];

const METADATA_PATTERNS = [
  /\b(480p|720p|1080p|2160p|4k|8k)\b/gi,
  /\b(BluRay|BDRip|BRRip|WEB[- .]?DL|WEBRip|WEB|HDTV|Remux|DVDRip|UHD)\b/gi,
  /\b(x264|x265|h[ ._-]?264|h[ ._-]?265|h264|h265|hevc|avc|vc-1)\b/gi,
  /\b(AAC|AC3|DTS|TrueHD|Atmos|DDP\d?(\.\d)?)\b/gi,
  /\b\d+Audio\b/gi,
  /\b(10bit|8bit|HDR10\+?|HDR|DV|DoVi)\b/gi,
  /\b(CHS|CHT|ENG|JPN|KOR|双语|中字|内封中字|中文字幕|简中|繁中|国粤英)\b/gi,
  /\b(JAPANESE|KOREAN)\b/gi,
  /\b(NF|AMZN|AppleTV|DSNP|HMAX)\b/gi,
  /\b(PROPER|REPACK|EXTENDED|UNCUT|Complete)\b/gi,
];

const BRACKET_PAIR_PATTERNS = [
  /\[[^\]]+\]/g,
  /\([^)]+\)/g,
  /【[^】]+】/g,
  /（[^）]+）/g,
];

const BRACKET_METADATA_PATTERNS = [
  /www\./i,
  /发布/i,
  /tt\d+/i,
  /\bANi\b/i,
  /\bBaha\b/i,
  /DBD-Raws/i,
  /BeanSub/i,
  /FZSD/i,
  /LoliHouse/i,
  /Mabors/i,
  /Erai-raws/i,
  /Kamigami/i,
  /SweetSub/i,
  /orion origin/i,
  /GM-Team/i,
  /TGx/i,
  /rarbg/i,
  /rartv/i,
];

const BRACKET_DROP_PATTERNS = [
  /全\s*\d+\s*[集话話季]/u,
  /\d+\s*集全/u,
  /字幕/u,
  /音轨/u,
  /配音/u,
  /无删减/u,
  /高码版/u,
  /官方中字/u,
  /\b(BD|WEB|4K|1080P|2160P|HD)\b/i,
];

const RELEASE_GROUP_PATTERNS = [
  /-[A-Za-z0-9]+$/g,
  /\b(UUMp4|DreamHD|BlackTV|ZerTV|SONYHD|MiniHD|GPTHD|SSDSSE|NTG|NTb|TEPES|SMURF|TOMMY|AGLET|GGWP|LAMBiC|MIXED|SuccessfulCrab|TBD)\b/gi,
];

const TITLE_NOISE_PATTERNS = [
  /全\s*\d+\s*[集话話季]/gi,
  /\d+\s*集全/gi,
  /网飞版无删减/gi,
  /官方中字/gi,
  /高码版/gi,
  /国语配音/gi,
  /国英多音轨/gi,
  /国英双语/gi,
  /简繁英字幕/gi,
  /简繁字幕/gi,
  /中文字幕/gi,
  /中英双字/gi,
  /影视魔王/gi,
  /高清中字/gi,
  /\bHD\d{3,4}P\b/gi,
  /\bMandarin\b/gi,
  /\bDUAL\b/gi,
  /Apple\s*TV\+?/gi,
  /\bATVP\b/gi,
  /\bAmazon\b/gi,
  /\bV\d+\b/gi,
  /\bHQ\b/gi,
  /\bBDE4\b/gi,
  /\bDD\+?\s*5\.?1\b/gi,
  /\bEP?\d{1,3}\b/gi,
];

const NOISE_TEXT_PATTERNS = [
  /6v电影/gi,
  /地址发布页/gi,
  /收藏不迷路/gi,
  /高清MP4电影/gi,
  /阳光电影/gi,
  /影视分享/gi,
  /高清影视之家/gi,
  /高清剧集网/gi,
  /BD影视分享/gi,
  /首发于/gi,
  /更多高清剧集下载请访问/gi,
  /梦幻天堂·龙网/gi,
  /bd2020\.com/gi,
  /bd2020\.co/gi,
  /bdys\.me/gi,
  /bdys\.co/gi,
  /bde4\.com/gi,
  /mp4vod\.com/gi,
  /domp4\.com/gi,
  /ygdy8\.com/gi,
  /dygod\.org/gi,
  /\bwww\b/gi,
  /www\.[A-Za-z0-9.-]+/gi,
  /\b[A-Za-z0-9-]+\.(com|net|org|cc|co)\b/gi,
];

const SOFTWARE_PATTERNS = [
  /\.dmg$/i,
  /Parallels/i,
  /Toolbox/i,
  /mac-torrents/i,
  /种子文件/i,
];

const LOOSE_SINGLE_EPISODE_CATEGORIES = new Set(["anime", "series"]);
const LOOSE_SINGLE_EPISODE_EXCLUDE_PATTERNS = [
  /\b\d{1,3}\s*-\s*\d{1,3}\b/u,
  /\[\s*\d{1,3}\s+\d{1,3}\s*\]/u,
  /合集/u,
  /(?:^|[^A-Za-z0-9])(?:SP|NCOP|NCED|CD\d*|Music)(?=$|[^A-Za-z0-9])/iu,
];
const LOOSE_SINGLE_EPISODE_PATTERNS = [
  /(?:^|[^A-Za-z0-9])-\s*(\d{1,3})(?:v\d+)?(?:\s*(?:END|FINAL))?(?=$|[\s\]】）)])|(?:^|[^A-Za-z0-9])(\d{1,3})v\d+(?=$|[^A-Za-z0-9])/iu,
];

const ENTRY_SIZE_FIELD_NAMES = ["size", "fileSize", "file_size", "fs", "s"];

const GENERIC_SIDECAR_NAMES = new Set([
  "readme",
  "cover",
  "poster",
  "sample",
  "proof",
  "trailer",
  "folder",
]);

export function parseInputPayload(raw, extname = "") {
  const normalizedExt = extname.toLowerCase();

  if (normalizedExt === ".json") {
    const data = JSON.parse(raw);
    const capturedEntries = extractEntriesFromKnownJsonShapes(data);

    if (capturedEntries.length > 0) {
      return capturedEntries.map(normalizeEntryValue);
    }

    if (Array.isArray(data)) {
      return data.map(normalizeEntryValue);
    }
    if (Array.isArray(data.entries)) {
      return data.entries.map(normalizeEntryValue);
    }
    throw new Error("json 输入必须是数组，或包含 entries 数组");
  }

  return raw
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(normalizeEntryValue);
}

export function extractInputContext(raw, extname = "") {
  const normalizedExt = extname.toLowerCase();

  if (normalizedExt !== ".json") {
    return {};
  }

  const data = JSON.parse(raw);
  return extractContextFromKnownJsonShapes(data);
}

export function normalizeEntrySize(item) {
  if (!item || typeof item !== "object") {
    return null;
  }

  for (const fieldName of ENTRY_SIZE_FIELD_NAMES) {
    if (!Object.hasOwn(item, fieldName)) {
      continue;
    }

    const rawValue = item[fieldName];
    if (rawValue === null || rawValue === undefined || rawValue === "") {
      continue;
    }

    const numericValue =
      typeof rawValue === "number"
        ? rawValue
        : Number.parseFloat(String(rawValue).replace(/[,\s]/gu, ""));

    if (Number.isFinite(numericValue) && numericValue >= 0) {
      return numericValue;
    }
  }

  return null;
}

function withNormalizedEntrySize(entry) {
  return {
    ...entry,
    size: normalizeEntrySize(entry),
  };
}

function normalizeEntryValue(item) {
  if (typeof item === "string") {
    return { source: item, size: null };
  }

  if (item && typeof item === "object" && typeof item.source === "string") {
    return withNormalizedEntrySize(item);
  }

  if (item && typeof item === "object" && typeof item.path === "string") {
    return withNormalizedEntrySize({
      source: item.path,
      ...item,
    });
  }

  if (item && typeof item === "object" && typeof item.name === "string") {
    return withNormalizedEntrySize({ source: item.name, ...item });
  }

  if (item && typeof item === "object" && typeof item.n === "string") {
    return withNormalizedEntrySize({
      source: item.n,
      isDir: !item.fid && Boolean(item.cid),
      ...item,
    });
  }

  throw new Error(`无法识别的输入项: ${JSON.stringify(item)}`);
}

function extractContextFromKnownJsonShapes(data) {
  if (!data || typeof data !== "object") {
    return {};
  }

  const buildContext = (rootPath) => {
    const context = {};
    const normalizedRootPath = normalizeSourcePath(rootPath ?? "");
    if (normalizedRootPath) {
      context.rootPath = normalizedRootPath;
    }

    if (Object.hasOwn(data, "sourceRootRelativePath")) {
      context.sourceRootRelativePath = normalizeSourcePath(data.sourceRootRelativePath ?? "");
    }

    appendCaptureStateContext(context, data);
    return context;
  };

  if (typeof data.rootPath === "string" && data.rootPath.trim()) {
    return buildContext(data.rootPath);
  }

  if (typeof data.folderName === "string" && data.folderName.trim()) {
    return buildContext(data.folderName);
  }

  if (Array.isArray(data.path) && data.path.length > 0) {
    const lastPathNode = data.path[data.path.length - 1];
    if (lastPathNode && typeof lastPathNode.name === "string" && lastPathNode.name.trim()) {
      return buildContext(lastPathNode.name);
    }
  }

  if (Array.isArray(data.responses)) {
    for (const response of data.responses) {
      const context = extractContextFromKnownJsonShapes(response?.data);
      if (context.rootPath) {
        return context;
      }
    }
  }

  return {};
}

function appendCaptureStateContext(context, data) {
  if (!data || typeof data !== "object") {
    return;
  }

  if (Object.hasOwn(data, "state")) {
    context.state = String(data.state ?? "").trim();
  }

  if (Object.hasOwn(data, "pendingFolderCount")) {
    const pendingFolderCount = Number(data.pendingFolderCount);
    if (Number.isFinite(pendingFolderCount)) {
      context.pendingFolderCount = pendingFolderCount;
    }
  }

  if (Object.hasOwn(data, "folderFetchCount")) {
    const folderFetchCount = Number(data.folderFetchCount);
    if (Number.isFinite(folderFetchCount)) {
      context.folderFetchCount = folderFetchCount;
    }
  }

  if (Object.hasOwn(data, "entryCount")) {
    const entryCount = Number(data.entryCount);
    if (Number.isFinite(entryCount)) {
      context.entryCount = entryCount;
    }
  }

  if (Object.hasOwn(data, "pausedReason")) {
    context.pausedReason = data.pausedReason ?? null;
  }
}

function extractEntriesFromKnownJsonShapes(data) {
  if (!data || typeof data !== "object") {
    return [];
  }

  if (Array.isArray(data.data) && data.cid !== undefined) {
    return data.data;
  }

  if (Array.isArray(data.responses)) {
    return data.responses
      .filter((response) => {
        if (!response || typeof response !== "object") {
          return false;
        }

        const responseUrl = typeof response.url === "string" ? response.url : "";
        return (
          responseUrl.includes("webapi.115.com/files") &&
          response.data &&
          Array.isArray(response.data.data)
        );
      })
      .flatMap((response) => response.data.data);
  }

  const folderSummaryEntries = extractEntriesFromFolderSummaries(data);

  if (Array.isArray(data.entries)) {
    // slow-safe tree 采集偶发只保留极少量 entries，但 folders 仍然完整。
    // 目录级 planner 至少要能回退到 folders.relativePath，避免再次依赖临时的 folders-only 快照文件。
    if (folderSummaryEntries.length > data.entries.length && data.entries.length <= 1) {
      return folderSummaryEntries;
    }

    return data.entries;
  }

  if (folderSummaryEntries.length > 0) {
    return folderSummaryEntries;
  }

  return [];
}

function extractEntriesFromFolderSummaries(data) {
  if (!Array.isArray(data.folders) || data.folders.length === 0) {
    return [];
  }

  const rootCid = data.cid === undefined || data.cid === null ? null : String(data.cid);

  return data.folders
    .filter((item) => item && typeof item.relativePath === "string")
    .map((item) => {
      const relativePath = item.relativePath.trim();
      if (!relativePath) {
        return null;
      }

      return {
        source: relativePath,
        name: path.posix.basename(relativePath),
        cid: item.cid === undefined || item.cid === null ? null : String(item.cid),
        pid: rootCid,
        isDir: true,
        count: Number.isFinite(Number(item.count)) ? Number(item.count) : undefined,
        fileCount: Number.isFinite(Number(item.fileCount)) ? Number(item.fileCount) : undefined,
        folderCount: Number.isFinite(Number(item.folderCount)) ? Number(item.folderCount) : undefined,
      };
    })
    .filter(Boolean);
}

export function buildPlan(entries, options = {}) {
  const mode = normalizePlanMode(options.mode);
  const sourceRootRelativePath = inferSourceRootRelativePath(options);

  if (mode === FLATTEN_WRAPPER_DIR_MODE) {
    return buildFlattenWrapperPlan(entries, {
      ...options,
      sourceRootRelativePath,
    });
  }

  if (mode === TMDB_NORMALIZE_MODE) {
    throw new Error("tmdb-normalize 模式需要使用异步 planner 入口");
  }

  const plannedEntries = entries.map((entry) => planEntry(entry, options));
  const pruneResult = pruneNoopPlannedMoves({
    moves: plannedEntries,
    sourceRootRelativePath,
  });
  const moveCollisions = collectCollisions(pruneResult.moves);
  const collisions = [...pruneResult.collisions, ...moveCollisions];
  const reviews = pruneResult.reviews;
  const summary = buildSummary({
    moves: pruneResult.moves,
    reviews,
    collisions,
    totalEntries: plannedEntries.length,
  });

  return {
    generatedAt: new Date().toISOString(),
    mode,
    summary,
    collisions,
    reviews,
    moves: pruneResult.moves,
  };
}

export function normalizePlanMode(mode) {
  if (!mode) {
    return DEFAULT_PLAN_MODE;
  }

  if (
    mode !== DEFAULT_PLAN_MODE &&
    mode !== FLATTEN_WRAPPER_DIR_MODE &&
    mode !== TMDB_NORMALIZE_MODE
  ) {
    throw new Error(`不支持的整理模式: ${mode}`);
  }

  return mode;
}

function buildFlattenWrapperPlan(entries, options = {}) {
  const normalizedEntries = entries.map((entry) => {
    const source = normalizeSourcePath(entry.source ?? "");
    const name = path.posix.basename(source);
    const ext = entry.isDir ? "" : path.posix.extname(name).toLowerCase();

    return {
      ...entry,
      source,
      name,
      ext,
      isDir: Boolean(entry.isDir),
    };
  });

  const directChildrenMap = buildDirectChildrenMap(normalizedEntries);
  const entryBySource = new Map(normalizedEntries.map((entry) => [entry.source, entry]));
  const rootPath = normalizeSourcePath(options.rootPath ?? "");
  const reviews = [];
  const moves = [];
  const deletes = [];
  let flattenCandidateCount = 0;

  for (const [wrapperDir, children] of directChildrenMap.entries()) {
    const targetDir = resolveFlattenTargetDir(wrapperDir, rootPath);
    if (targetDir === null) {
      continue;
    }

    flattenCandidateCount += 1;
    const seasonPath = targetDir || rootPath;

    const evaluation = evaluateWrapperDirectory({
      wrapperDir,
      children,
      directChildrenMap,
    });

    if (!evaluation.ok) {
      reviews.push(buildFlattenReview(wrapperDir, evaluation, children));
      continue;
    }

    const wrapperDirEntry = entryBySource.get(wrapperDir);
    const wrapperMoves = evaluation.filesToMove.map((child) => {
      return buildFlattenMove(child, {
        targetDir,
        seasonPath,
        wrapperDir,
        wrapperDirCid: wrapperDirEntry?.cid ?? null,
      });
    });

    if (wrapperMoves.length === 0) {
      continue;
    }

    const wrapperCollisions = collectCollisions(wrapperMoves);

    if (wrapperCollisions.length > 0) {
      reviews.push({
        wrapperDir,
        reason: "一层嵌套拍平后会产生同名目标文件冲突，跳过拍平",
        reviewType: REVIEW_TYPE_NESTED_SIDECAR_DIR,
        reviewSources: dedupeSources(
          wrapperCollisions.flatMap((collision) => collision.sources),
        ),
        sources: dedupeSources(
          wrapperCollisions.flatMap((collision) => collision.sources),
        ),
      });
      continue;
    }

    moves.push(...wrapperMoves);
    deletes.push(
      buildFlattenDelete({
        wrapperDir,
        wrapperDirCid: wrapperDirEntry?.cid ?? null,
        moveCount: wrapperMoves.length,
      }),
    );
  }

  const pruneResult = pruneNoopPlannedMoves({
    moves,
    sourceRootRelativePath: options.sourceRootRelativePath,
  });
  const activeWrapperMoveCounts = pruneResult.moves.reduce((counts, move) => {
    if (!move.wrapperDir) {
      return counts;
    }

    counts.set(move.wrapperDir, (counts.get(move.wrapperDir) ?? 0) + 1);
    return counts;
  }, new Map());
  const activeDeletes = deletes
    .map((deleteEntry) => ({
      ...deleteEntry,
      moveCount: activeWrapperMoveCounts.get(deleteEntry.wrapperDir) ?? 0,
    }))
    .filter((deleteEntry) => deleteEntry.moveCount > 0);
  reviews.push(...pruneResult.reviews);

  const moveCollisions = collectCollisions(pruneResult.moves);
  const collisions = [...pruneResult.collisions, ...moveCollisions];
  const byCategory = [...pruneResult.moves, ...reviews].reduce((acc, entry) => {
    acc[entry.category] = (acc[entry.category] ?? 0) + 1;
    return acc;
  }, {});
  const summary = {
    totalEntries: moves.length,
    moveCount: pruneResult.moves.length,
    deleteCount: activeDeletes.length,
    reviewCount: reviews.length,
    collisionCount: collisions.length,
    flattenCandidateCount,
    flattenReviewCount: reviews.length,
    byCategory,
  };

  return {
    generatedAt: new Date().toISOString(),
    mode: FLATTEN_WRAPPER_DIR_MODE,
    summary,
    collisions,
    reviews,
    moves: pruneResult.moves,
    deletes: activeDeletes,
  };
}

export function normalizeSourcePath(value) {
  return String(value)
    .replace(/\\/g, "/")
    .replace(/^\/+/u, "")
    .replace(/\/+/g, "/")
    .replace(/\/$/u, "")
    .trim();
}

export function inferSourceRootRelativePath(context = {}) {
  if (Object.hasOwn(context, "sourceRootRelativePath")) {
    return normalizeSourcePath(context.sourceRootRelativePath ?? "");
  }

  const rootPath = normalizeSourcePath(context.rootPath ?? "");
  return MEDIA_CATEGORY_ROOT_DIR_NAMES.has(rootPath) ? rootPath : "";
}

export function buildActualSourceRelativePath(source, sourceRootRelativePath = "") {
  const normalizedSource = normalizeSourcePath(source ?? "");
  const normalizedRoot = normalizeSourcePath(sourceRootRelativePath ?? "");

  if (!normalizedRoot || !normalizedSource) {
    return normalizedSource;
  }

  // 兼容历史采集：有些 source 已经包含分类根，避免重复拼成 纪录片/纪录片/...
  if (normalizedSource === normalizedRoot || normalizedSource.startsWith(`${normalizedRoot}/`)) {
    return normalizedSource;
  }

  return `${normalizedRoot}/${normalizedSource}`;
}

export function isNoopPlannedMove(move, sourceRootRelativePath = "") {
  const actualPath = buildActualSourceRelativePath(
    move?.source,
    move?.sourceRootRelativePath ?? sourceRootRelativePath,
  );
  const targetPath = normalizeSourcePath(move?.targetPath ?? "");
  return Boolean(actualPath && targetPath && actualPath === targetPath);
}

function buildDirectChildrenMap(entries) {
  const map = new Map();

  for (const entry of entries) {
    if (!entry.source) {
      continue;
    }

    const parentDir = path.posix.dirname(entry.source);
    if (!parentDir || parentDir === ".") {
      continue;
    }

    const current = map.get(parentDir) ?? [];
    current.push(entry);
    map.set(parentDir, current);
  }

  return map;
}

function resolveFlattenTargetDir(wrapperDir, rootPath) {
  const seasonDir = path.posix.dirname(wrapperDir);
  const seasonDirName = path.posix.basename(seasonDir);

  if (seasonDir !== "." && isSeasonDirectoryName(seasonDirName)) {
    return seasonDir;
  }

  if ((seasonDir === "." || !seasonDir) && isFlattenRootDirectoryName(path.posix.basename(rootPath))) {
    return "";
  }

  return null;
}

function isFlattenRootDirectoryName(value) {
  if (!value) {
    return false;
  }

  return isSeasonDirectoryName(value) || FLATTEN_ALLOWED_ROOT_DIR_NAMES.has(String(value).trim());
}

function isSeasonDirectoryName(value) {
  if (!value) {
    return false;
  }

  return (
    /\bSeason[ ._-]?\d{1,2}\b/i.test(value) ||
    /\bS\d{1,2}\b/i.test(value) ||
    /第\s*[0-9一二三四五六七八九十百零两]+\s*季/i.test(value)
  );
}

function buildFlattenReview(wrapperDir, evaluation, children) {
  const reviewSources = dedupeSources(
    evaluation.reviewSources?.length
      ? evaluation.reviewSources
      : children.map((child) => child.source),
  );

  return {
    wrapperDir,
    reason: evaluation.reason,
    reviewType: evaluation.reviewType ?? REVIEW_TYPE_NESTED_SIDECAR_DIR,
    reviewSources,
    sources: reviewSources,
  };
}

function evaluateWrapperDirectory({ wrapperDir, children, directChildrenMap }) {
  const files = children.filter((child) => !child.isDir);
  const nestedDirs = children.filter((child) => child.isDir);
  const videoFiles = files.filter((child) => detectRole(child.ext, false) === "video");

  const nestedEvaluation = evaluateNestedDirectories({
    nestedDirs,
    directChildrenMap,
  });

  if (!nestedEvaluation.ok) {
    return nestedEvaluation;
  }

  const nestedVideoSources = nestedEvaluation.videoSources ?? [];
  const allVideoSources = [
    ...videoFiles.map((entry) => entry.source),
    ...nestedVideoSources,
  ];

  if (nestedEvaluation.mediaBundleDirCount > 0 && videoFiles.length > 0) {
    return {
      ok: false,
      reason: "目录内视频文件超过 1 个，跳过拍平",
      reviewType: REVIEW_TYPE_MULTI_VIDEO,
      reviewSources: allVideoSources,
    };
  }

  const isSidecarWrapperDir = isNestedSidecarDirectoryName(path.posix.basename(wrapperDir));

  if (!isSidecarWrapperDir && nestedEvaluation.mediaBundleDirCount > 1) {
    return {
      ok: false,
      reason: "目录内视频文件超过 1 个，跳过拍平",
      reviewType: REVIEW_TYPE_MULTI_VIDEO,
      reviewSources: allVideoSources,
    };
  }

  if (videoFiles.length > 1) {
    return {
      ok: false,
      reason: "目录内视频文件超过 1 个，跳过拍平",
      reviewType: REVIEW_TYPE_MULTI_VIDEO,
      reviewSources: videoFiles.map((entry) => entry.source),
    };
  }

  return {
    ok: true,
    filesToMove: [...videoFiles, ...nestedEvaluation.filesToMove],
  };
}

function evaluateNestedDirectories({ nestedDirs, directChildrenMap }) {
  const filesToMove = [];
  const videoSources = [];
  let mediaBundleDirCount = 0;

  for (const nestedDir of nestedDirs) {
    const nestedChildren = directChildrenMap.get(nestedDir.source) ?? [];

    if (nestedChildren.length === 0) {
      continue;
    }

    if (nestedChildren.some((child) => child.isDir)) {
      return {
        ok: false,
        reason: "目录内存在超过 1 层嵌套，跳过拍平",
        reviewType: REVIEW_TYPE_NESTED_SIDECAR_DIR,
        reviewSources: [
          nestedDir.source,
          ...nestedChildren.map((child) => child.source),
        ],
      };
    }

    const nestedFiles = nestedChildren.filter((child) => !child.isDir);
    const nestedVideoFiles = nestedFiles.filter(
      (child) => detectRole(child.ext, false) === "video",
    );

    if (nestedVideoFiles.length > 1) {
      return {
        ok: false,
        reason: "目录内视频文件超过 1 个，跳过拍平",
        reviewType: REVIEW_TYPE_MULTI_VIDEO,
        reviewSources: nestedVideoFiles.map((entry) => entry.source),
      };
    }

    if (nestedVideoFiles.length === 0) {
      continue;
    }

    const videoFile = nestedVideoFiles[0];
    if (!isSingleMediaBundleDirectory(nestedDir.name, videoFile.name)) {
      return {
        ok: false,
        reason: "目录内存在无法自动拍平的一层嵌套子目录，跳过拍平",
        reviewType: REVIEW_TYPE_NESTED_SIDECAR_DIR,
        reviewSources: [nestedDir.source, ...nestedFiles.map((entry) => entry.source)],
      };
    }

    mediaBundleDirCount += 1;
    videoSources.push(videoFile.source);
    filesToMove.push(videoFile);
  }

  return {
    ok: true,
    filesToMove,
    videoSources,
    mediaBundleDirCount,
  };
}

function isNestedSidecarDirectoryName(value) {
  return NESTED_SIDECAR_DIR_PATTERNS.some((pattern) => pattern.test(value));
}

function isSingleMediaBundleDirectory(dirName, fileName) {
  const directoryKey = normalizeMediaBundleKey(dirName);
  const fileKey = normalizeMediaBundleKey(path.posix.basename(fileName, path.posix.extname(fileName)));
  return directoryKey && fileKey && directoryKey === fileKey;
}

function normalizeMediaBundleKey(value) {
  return String(value)
    .toLowerCase()
    .replace(/[._\-\s]+/g, "")
    .replace(/[^a-z0-9\u4e00-\u9fff]/gu, "");
}

function dedupeSources(values) {
  return [...new Set(values.filter(Boolean))];
}

function buildFlattenMove(entry, { targetDir, seasonPath, wrapperDir, wrapperDirCid }) {
  const role = detectRole(entry.ext, entry.isDir);
  const targetName = entry.name;
  const targetPath = buildTargetPath({
    role,
    targetDir,
    targetName,
  });

  return {
    source: entry.source,
    name: entry.name,
    ext: entry.ext,
    fid: entry.fid ?? null,
    cid: entry.cid ?? null,
    isDir: false,
    role,
    category: "series",
    title: path.posix.basename(wrapperDir),
    year: null,
    season: extractSeason(path.posix.basename(seasonPath || wrapperDir)),
    episode: extractEpisode(entry.name, "series"),
    confidence: 0.95,
    needsReview: false,
    reasons: [
      "mode=flatten-wrapper-dir",
      "wrapper=single-video",
      `wrapperDir=${wrapperDir}`,
    ],
    strategy: FLATTEN_WRAPPER_DIR_MODE,
    wrapperDir,
    wrapperDirCid,
    targetDir,
    targetName,
    targetPath,
  };
}

function buildFlattenDelete({ wrapperDir, wrapperDirCid, moveCount }) {
  return {
    wrapperDir,
    wrapperDirCid,
    moveCount,
    strategy: "delete-wrapper-dir",
    reason: "视频迁移完成后删除多余包裹目录",
  };
}

function planEntry(entry, options = {}) {
  const source = entry.source.trim();
  const normalizedSource = source.replace(/\\/g, "/");
  const name = path.posix.basename(normalizedSource);
  const ext = entry.isDir ? "" : path.posix.extname(name).toLowerCase();
  const stem = ext ? name.slice(0, -ext.length) : name;
  const role = detectRole(ext, entry.isDir);
  const category = detectCategory(stem, role);
  const year = extractYear(stem);
  const season = extractSeason(stem);
  const episode = extractEpisode(stem, category);
  const title = buildTitle(stem, {
    cleanupOverrides: options.cleanupOverrides,
  });
  const confidence = buildConfidence({
    role,
    category,
    title,
    year,
    season,
    episode,
  });
  const reasons = buildReasons({ role, category, year, season, episode });
  const targetDir = buildTargetDir({
    category,
    title,
    year,
    season,
  });
  const targetName = buildTargetName({
    role,
    category,
    title,
    year,
    season,
    episode,
    ext,
    targetDir,
  });
  const targetPath = buildTargetPath({
    role,
    targetDir,
    targetName,
  });

  return {
    source,
    name,
    ext,
    fid: entry.fid ?? null,
    cid: entry.cid ?? null,
    isDir: Boolean(entry.isDir),
    role,
    category,
    title,
    year,
    season,
    episode,
    confidence,
    needsReview: confidence < 0.7 || category === "review",
    reasons,
    targetDir,
    targetName,
    targetPath,
  };
}

export function detectRole(ext, isDir = false) {
  if (isDir) {
    return "directory";
  }
  if (VIDEO_EXTENSIONS.has(ext)) {
    return "video";
  }
  if (SIDECAR_EXTENSIONS.has(ext)) {
    return "sidecar";
  }
  if (!ext) {
    return "unknown";
  }
  return "other";
}

export function detectCategory(stem, role) {
  if (matchesAny(stem, SOFTWARE_PATTERNS)) {
    return "review";
  }
  if (matchesAny(stem, DOCUMENTARY_PATTERNS)) {
    return "documentary";
  }
  if (matchesAny(stem, ANIME_PATTERNS)) {
    return "anime";
  }
  if (matchesAny(stem, VARIETY_PATTERNS)) {
    return "variety";
  }
  if (role === "sidecar" && isGenericSidecarName(stem)) {
    return "review";
  }
  if (role === "video" || role === "directory") {
    if (matchesAny(stem, SERIES_PATTERNS)) {
      return "series";
    }
    return "movie";
  }
  if (role === "sidecar") {
    if (matchesAny(stem, SERIES_PATTERNS)) {
      return "series";
    }
    return extractYear(stem) ? "movie" : "review";
  }
  return "review";
}

function matchesAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

export function extractYear(stem) {
  const matches = stem.match(/\b(19[3-9]\d|20[0-4]\d)\b/g);
  if (!matches || matches.length === 0) {
    const taggedYearMatch = stem.match(/(19[3-9]\d|20[0-4]\d)(?=[^0-9]*tt\d+)/i);
    if (taggedYearMatch) {
      return Number.parseInt(taggedYearMatch[1], 10);
    }
    return null;
  }
  const lastYear = matches[matches.length - 1];
  return Number.parseInt(lastYear, 10);
}

export function extractSeason(stem) {
  const seasonMatch = stem.match(/(?:^|[^A-Za-z0-9])S(\d{1,2})E\d{1,3}(?=$|[^0-9])/i);
  if (seasonMatch) {
    return Number.parseInt(seasonMatch[1], 10);
  }

  const shortSeasonMatch = stem.match(/(?:^|[^A-Za-z0-9])S(\d{1,2})(?=$|[^0-9])/i);
  if (shortSeasonMatch) {
    return Number.parseInt(shortSeasonMatch[1], 10);
  }

  const seasonWordMatch = stem.match(/\bSeason[ ._-]?(\d{1,2})\b/i);
  if (seasonWordMatch) {
    return Number.parseInt(seasonWordMatch[1], 10);
  }

  const chineseSeasonMatch = stem.match(/第\s*([0-9一二三四五六七八九十百零两]+)\s*季/i);
  if (chineseSeasonMatch) {
    return parseChineseNumber(chineseSeasonMatch[1]);
  }

  return null;
}

export function extractEpisode(stem, category) {
  if (category === "movie") {
    return null;
  }

  const episodeMatch = stem.match(/(?:^|[^A-Za-z0-9])S\d{1,2}E(\d{1,3})(?=$|[^0-9])/i);
  if (episodeMatch) {
    return Number.parseInt(episodeMatch[1], 10);
  }

  const episodeOnlyMatch = stem.match(/(?:^|[^A-Za-z0-9])EP?(\d{1,3})(?=$|[^0-9])/i);
  if (episodeOnlyMatch) {
    return Number.parseInt(episodeOnlyMatch[1], 10);
  }

  const chineseEpisodeMatch = stem.match(/第\s*([0-9一二三四五六七八九十百零两]+)\s*[集话話期]/i);
  if (chineseEpisodeMatch) {
    return parseChineseNumber(chineseEpisodeMatch[1]);
  }

  const looseEpisode = extractLooseSingleEpisode(stem, category);
  if (looseEpisode) {
    return looseEpisode;
  }

  return null;
}

export function buildTitle(stem, options = {}) {
  let working = stem;
  const customNoisePatterns = buildCustomNoisePatterns(options.cleanupOverrides);

  for (const pattern of BRACKET_PAIR_PATTERNS) {
    working = working.replace(pattern, (segment) => {
      return shouldDropBracketSegment(segment) ? " " : segment;
    });
  }

  working = working
    .replace(/\bS\d{1,2}E\d{1,3}\b/gi, " ")
    .replace(/\bS\d{1,2}\b/gi, " ")
    .replace(/\bSeason[ ._-]?\d{1,2}\b/gi, " ")
    .replace(/\s-\s*\d{1,3}(?:\.\d+)?(?:v\d+)?(?:\s*(?:END|FINAL))?(?=$|[\s\[【(（])/gi, " ")
    .replace(/(?:^|\s)\d{1,3}v\d+(?=$|[\s\]】)）])/gi, " ")
    .replace(/第\s*[0-9一二三四五六七八九十百零两]+\s*季/gi, " ")
    .replace(/第\s*[0-9一二三四五六七八九十百零两]+\s*[集话話期]/gi, " ");

  for (const pattern of METADATA_PATTERNS) {
    working = working.replace(pattern, " ");
  }

  for (const pattern of NOISE_TEXT_PATTERNS) {
    working = working.replace(pattern, " ");
  }

  for (const pattern of customNoisePatterns) {
    working = working.replace(pattern, " ");
  }

  for (const pattern of TITLE_NOISE_PATTERNS) {
    working = working.replace(pattern, " ");
  }

  for (const pattern of RELEASE_GROUP_PATTERNS) {
    working = working.replace(pattern, " ");
  }

  working = working
    .replace(/[《》]/g, " ")
    .replace(/\b(19[3-9]\d|20[0-4]\d)\b/g, " ")
    .replace(/\b\d{1,3}\s*-\s*\d{1,3}\b/g, " ")
    .replace(/\bPart\s+\d+\b/gi, " ")
    .replace(/\(\s*\)/g, " ")
    .replace(/（\s*）/g, " ")
    .replace(/[._]+/g, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!working) {
    return "未识别标题";
  }

  return toTitleCaseIfEnglish(working);
}

function looksLikeMetadata(segment) {
  return METADATA_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(segment);
  });
}

function shouldDropBracketSegment(segment) {
  return (
    isNumericOnlyBracketSegment(segment) ||
    BRACKET_DROP_PATTERNS.some((pattern) => pattern.test(segment)) ||
    looksLikeMetadata(segment) ||
    BRACKET_METADATA_PATTERNS.some((pattern) => pattern.test(segment))
  );
}

function isNumericOnlyBracketSegment(segment) {
  const content = String(segment)
    .replace(/^[\[({【（\s]+/u, "")
    .replace(/[\])}】）\s]+$/u, "")
    .trim();

  return /^\d{1,3}$/u.test(content) || /^\d{1,3}(?:\s*-\s*|\s+)\d{1,3}$/u.test(content);
}

function extractLooseSingleEpisode(stem, category) {
  if (!LOOSE_SINGLE_EPISODE_CATEGORIES.has(category)) {
    return null;
  }

  const normalizedStem = String(stem ?? "");
  if (
    !normalizedStem ||
    LOOSE_SINGLE_EPISODE_EXCLUDE_PATTERNS.some((pattern) => {
      return pattern.test(normalizedStem);
    })
  ) {
    return null;
  }

  const bracketEpisode = extractLooseBracketEpisode(normalizedStem);
  if (bracketEpisode !== null) {
    return bracketEpisode;
  }

  for (const pattern of LOOSE_SINGLE_EPISODE_PATTERNS) {
    const matched = normalizedStem.match(pattern);
    if (!matched) {
      continue;
    }

    const episodeValue = matched[1] ?? matched[2];
    if (episodeValue) {
      return Number.parseInt(episodeValue, 10);
    }
  }

  return null;
}

function extractLooseBracketEpisode(stem) {
  const bracketMatches = [...String(stem ?? "").matchAll(/\[([^\]]+)\]/gu)];

  // 从右向左只吃最后一个纯数字方括号，避免误把发布组、清晰度等括号当作集号。
  for (let index = bracketMatches.length - 1; index >= 0; index -= 1) {
    const content = String(bracketMatches[index]?.[1] ?? "").trim();
    if (!/^\d{1,3}$/u.test(content)) {
      continue;
    }

    const episode = Number.parseInt(content, 10);
    if (Number.isFinite(episode) && episode > 0) {
      return episode;
    }
  }

  return null;
}

function toTitleCaseIfEnglish(text) {
  if (/[\u4e00-\u9fff]/u.test(text)) {
    return text;
  }

  return text
    .split(" ")
    .filter(Boolean)
    .map((word) => {
      if (word === word.toUpperCase()) {
        return word;
      }
      return `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`;
    })
    .join(" ");
}

function buildConfidence({ role, category, title, year, season, episode }) {
  let score = 0.4;

  if (role === "video") {
    score += 0.2;
  }
  if (role === "directory") {
    score += 0.1;
  }
  if (role === "sidecar") {
    score += 0.1;
  }
  if (role === "directory" && (year || season)) {
    score += 0.1;
  }
  if (year) {
    score += 0.15;
  }
  if (season) {
    score += 0.15;
  }
  if (episode) {
    score += 0.1;
  }
  if (category === "anime" || category === "variety" || category === "documentary") {
    score += 0.05;
  }
  if (title === "未识别标题") {
    score = 0.2;
  }

  return Number(Math.min(score, 0.99).toFixed(2));
}

function buildReasons({ role, category, year, season, episode }) {
  const reasons = [`role=${role}`, `category=${CATEGORY_LABELS[category]}`];

  if (year) {
    reasons.push(`year=${year}`);
  }
  if (season) {
    reasons.push(`season=${season}`);
  }
  if (episode) {
    reasons.push(`episode=${episode}`);
  }

  return reasons;
}

function buildTargetDir({ category, title, year, season }) {
  const rootDir = CATEGORY_LABELS[category] ?? CATEGORY_LABELS.review;
  const safeTitle = sanitizePathSegment(title);

  if (category === "movie" || category === "review") {
    const movieFolder = year ? `${safeTitle} (${year})` : safeTitle;
    return `${rootDir}/${movieFolder}`;
  }

  if (season) {
    return `${rootDir}/${safeTitle}/Season ${String(season).padStart(2, "0")}`;
  }

  return `${rootDir}/${safeTitle}`;
}

function buildTargetName({ role, category, title, year, season, episode, ext, targetDir }) {
  if (role === "directory") {
    return path.posix.basename(targetDir);
  }

  const safeTitle = sanitizePathSegment(title);

  if (category === "movie" || category === "documentary" || category === "review") {
    const movieName = year ? `${safeTitle} (${year})` : safeTitle;
    return `${movieName}${ext}`;
  }

  if (season && episode) {
    return `${safeTitle} - S${String(season).padStart(2, "0")}E${String(episode).padStart(2, "0")}${ext}`;
  }

  if (season) {
    return `${safeTitle} - Season ${String(season).padStart(2, "0")}${ext}`;
  }

  return `${safeTitle}${ext}`;
}

export function buildTargetPath({ role, targetDir, targetName }) {
  if (role === "directory") {
    return targetDir;
  }

  if (!targetDir) {
    return targetName;
  }

  return `${targetDir}/${targetName}`;
}

export function sanitizePathSegment(value) {
  return value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim();
}

export function loadCleanupOverrides() {
  return {};
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildCustomNoisePatterns(cleanupOverrides = {}) {
  return (cleanupOverrides?.noiseKeywords ?? [])
    .filter((keyword) => String(keyword ?? "").trim())
    .map((keyword) => new RegExp(escapeRegex(String(keyword).trim()), "gi"));
}

function buildSummary({
  moves,
  reviews = [],
  collisions,
  totalEntries = moves.length + reviews.length,
}) {
  const byCategory = [...moves, ...reviews].reduce((acc, entry) => {
    acc[entry.category] = (acc[entry.category] ?? 0) + 1;
    return acc;
  }, {});

  const reviewCount = reviews.length + moves.filter((entry) => entry.needsReview).length;

  return {
    totalEntries,
    moveCount: moves.length,
    reviewCount,
    collisionCount: collisions.length,
    byCategory,
  };
}

function collectCollisions(entries) {
  const map = new Map();

  for (const entry of entries) {
    const current = map.get(entry.targetPath) ?? [];
    current.push(entry.source);
    map.set(entry.targetPath, current);
  }

  return [...map.entries()]
    .filter(([, sources]) => sources.length > 1)
    .map(([targetPath, sources]) => ({ targetPath, sources }));
}

function pruneNoopPlannedMoves({
  moves,
  sourceRootRelativePath = "",
}) {
  const noopMoves = [];
  const activeMoves = [];

  for (const move of moves) {
    if (isNoopPlannedMove(move, sourceRootRelativePath)) {
      noopMoves.push(move);
    } else {
      activeMoves.push(move);
    }
  }

  if (noopMoves.length === 0) {
    return {
      moves: activeMoves,
      reviews: [],
      collisions: [],
      noopMoves,
    };
  }

  const occupiedTargetMap = new Map();
  for (const noopMove of noopMoves) {
    const current = occupiedTargetMap.get(noopMove.targetPath) ?? [];
    current.push(noopMove);
    occupiedTargetMap.set(noopMove.targetPath, current);
  }

  const activeTargetMap = new Map();
  for (const move of activeMoves) {
    if (!occupiedTargetMap.has(move.targetPath)) {
      continue;
    }

    const current = activeTargetMap.get(move.targetPath) ?? [];
    current.push(move);
    activeTargetMap.set(move.targetPath, current);
  }

  const reviewSourceSet = new Set();
  const reviews = [];
  const collisions = [];

  for (const [targetPath, targetMoves] of activeTargetMap.entries()) {
    const occupiedMoves = occupiedTargetMap.get(targetPath) ?? [];
    collisions.push({
      targetPath,
      sources: dedupeSources([
        ...occupiedMoves.map((move) => move.source),
        ...targetMoves.map((move) => move.source),
      ]),
    });

    for (const move of targetMoves) {
      reviewSourceSet.add(move.source);
      reviews.push(buildNoopOccupiedReview({
        move,
        occupiedMoves,
      }));
    }
  }

  return {
    moves: activeMoves.filter((move) => !reviewSourceSet.has(move.source)),
    reviews,
    collisions,
    noopMoves,
  };
}

function buildNoopOccupiedReview({
  move,
  occupiedMoves,
}) {
  return {
    ...move,
    category: "review",
    needsReview: true,
    reviewReason: "collision",
    reviewType: "collision",
    reason: "目标路径已被当前位置相同的已整理条目占用，跳过自动迁移",
    occupiedTargetSources: occupiedMoves.map((item) => item.source),
  };
}

function isGenericSidecarName(stem) {
  return GENERIC_SIDECAR_NAMES.has(stem.trim().toLowerCase());
}

function parseChineseNumber(text) {
  if (/^\d+$/u.test(text)) {
    return Number.parseInt(text, 10);
  }

  const digits = {
    零: 0,
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };
  const units = {
    十: 10,
    百: 100,
  };

  let result = 0;
  let current = 0;

  for (const char of text) {
    if (digits[char] !== undefined) {
      current = digits[char];
      continue;
    }

    if (units[char]) {
      const unitValue = units[char];
      result += (current || 1) * unitValue;
      current = 0;
    }
  }

  return result + current;
}

export function renderPlanSummary(plan) {
  const formatTopCountEntries = (counts = {}, limit = 3) => {
    const entries = Object.entries(counts)
      .filter(([, count]) => Number(count) > 0)
      .sort((left, right) => {
        if (right[1] !== left[1]) {
          return right[1] - left[1];
        }

        return left[0].localeCompare(right[0], "zh-Hans-CN");
      });

    if (entries.length === 0) {
      return "";
    }

    const visibleEntries = entries.slice(0, limit).map(([key, count]) => `${key}=${count}`);
    if (entries.length > limit) {
      visibleEntries.push(`...(+${entries.length - limit})`);
    }

    return visibleEntries.join(", ");
  };

  const formatLlmFallbackSummary = (summary) => {
    if (!summary || typeof summary !== "object") {
      return "";
    }

    const status = summary.enabled ? "已启用" : "未启用";
    const baseLine =
      `- LLM fallback: ${status} / configured=${summary.configured === true}` +
      ` / model=${summary.model ?? "-"}` +
      ` / baseUrl=${summary.baseUrl ?? "-"}` +
      ` / calls/resolved/rejected/errors=${summary.callCount ?? 0}/${summary.resolvedCount ?? 0}/${summary.rejectedCount ?? 0}/${summary.errorCount ?? 0}`;
    const rejectedReasons = formatTopCountEntries(summary.rejectedReasonCounts, 5);
    const errorReasons = formatTopCountEntries(summary.errorReasonCounts, 5);

    return [
      baseLine,
      rejectedReasons ? `- LLM fallback 拒绝原因: ${rejectedReasons}` : "",
      errorReasons ? `- LLM fallback 失败原因: ${errorReasons}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  };

  const formatZeroReviewSummary = (summary) => {
    if (!summary || typeof summary !== "object") {
      return "";
    }

    const status = summary.enabled ? "已启用" : "未启用";
    const bucketCounts = formatTopCountEntries(summary.fallbackBucketCounts, 5);
    const baseLine =
      `- 零 Review finalizer: ${status}，review ${summary.inputReviewCount ?? 0} -> ${plan.summary.reviewCount ?? 0}` +
      `，保留区 ${summary.quarantineCount ?? 0}` +
      `，资源包 ${summary.resourceBatchCount ?? 0}` +
      `，batch分类 ${summary.llmBatchClassifiedCount ?? 0}` +
      `，正片保护 ${summary.mainEpisodeProtectedCount ?? 0}` +
      `，delete rescue ${summary.rescuedUnsafeDeleteCount ?? 0}`;

    return [
      baseLine,
      bucketCounts ? `- 零 Review 保留区分布: ${bucketCounts}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  };

  const formatMediaRoutingSummary = (summary) => {
    if (!summary || typeof summary !== "object" || !summary.enabled) {
      return "";
    }

    const categoryCounts = formatTopCountEntries(summary.categoryCounts, 6);
    const baseLine =
      `- 资源包路由: ${summary.configured ? "已启用" : "未配置"}` +
      `，packages=${summary.packageCount ?? 0}` +
      `，high/low/unknown/fail=${summary.highConfidenceCount ?? 0}/${summary.lowConfidenceCount ?? 0}/${summary.unknownCount ?? 0}/${summary.failureCount ?? 0}`;

    return [
      baseLine,
      categoryCounts ? `- 路由分类统计: ${categoryCounts}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  };

  const categoryLines = Object.entries(plan.summary.byCategory)
    .map(([category, count]) => `- ${CATEGORY_LABELS[category] ?? category}: ${count}`)
    .join("\n");

  const reviewExamples =
    Array.isArray(plan.reviews) && plan.reviews.length > 0
      ? plan.reviews
          .slice(0, 5)
          .map((entry) => {
            const sourceLabel = entry.wrapperDir ?? entry.source ?? entry.targetPath ?? "unknown";
            const reasonLabel = entry.reason ?? entry.reviewReason ?? "需要人工确认";
            return `- ${sourceLabel}: ${reasonLabel}`;
          })
          .join("\n")
      : plan.moves
          .filter((entry) => entry.needsReview)
          .slice(0, 5)
          .map((entry) => `- ${entry.source} -> ${entry.targetDir}`)
          .join("\n");

  return [
    "整理计划摘要",
    `- 模式: ${plan.mode ?? DEFAULT_PLAN_MODE}`,
    `- 输入条目: ${plan.summary.totalEntries}`,
    plan.summary.moveCount !== undefined ? `- 待执行条目: ${plan.summary.moveCount}` : "",
    plan.summary.tmdbMatchedCount !== undefined ? `- TMDB 命中: ${plan.summary.tmdbMatchedCount}` : "",
    plan.summary.tmdbQueryTaskCount !== undefined
      ? `- TMDB 查询任务/缓存命中: ${plan.summary.tmdbQueryTaskCount}/${plan.summary.tmdbCacheHitCount ?? 0}`
      : "",
    plan.summary.tmdbRequestCount !== undefined
      ? `- TMDB 请求/重试/429: ${plan.summary.tmdbRequestCount}/${plan.summary.tmdbRetryCount ?? 0}/${plan.summary.tmdb429Count ?? 0}`
      : "",
    plan.summary.tmdbErrorAttemptCount !== undefined
      ? `- TMDB 失败尝试: ${plan.summary.tmdbErrorAttemptCount}`
      : "",
    `- 待人工确认: ${plan.summary.reviewCount}`,
    `- 目标路径冲突: ${plan.summary.collisionCount}`,
    plan.summary.tmdbMissCount !== undefined ? `- TMDB miss: ${plan.summary.tmdbMissCount}` : "",
    plan.summary.tmdbQueryErrorCount !== undefined
      ? `- TMDB 请求失败: ${plan.summary.tmdbQueryErrorCount}`
      : "",
    formatTopCountEntries(plan.summary.tmdbErrorCodeCounts)
      ? `- TMDB 失败 code: ${formatTopCountEntries(plan.summary.tmdbErrorCodeCounts)}`
      : "",
    formatTopCountEntries(plan.summary.tmdbErrorStatusCounts)
      ? `- TMDB 失败 status: ${formatTopCountEntries(plan.summary.tmdbErrorStatusCounts)}`
      : "",
    formatTopCountEntries(plan.summary.tmdbErrorMessageCounts)
      ? `- TMDB 失败 message: ${formatTopCountEntries(plan.summary.tmdbErrorMessageCounts)}`
      : "",
    formatLlmFallbackSummary(plan.llmFallbackSummary),
    formatMediaRoutingSummary(plan.mediaRoutingSummary ?? plan.summary.mediaRouting),
    formatZeroReviewSummary(plan.zeroReviewSummary),
    plan.summary.tmdbAmbiguousCount !== undefined
      ? `- 多候选冲突: ${plan.summary.tmdbAmbiguousCount}`
      : "",
    plan.summary.yearConflictCount !== undefined
      ? `- 年份冲突: ${plan.summary.yearConflictCount}`
      : "",
    plan.summary.mergedSeriesGroupCount !== undefined
      ? `- 剧集合并组/条目: ${plan.summary.mergedSeriesGroupCount}/${plan.summary.mergedEntryCount ?? 0}`
      : "",
    plan.summary.mergeConflictResolvedCount !== undefined
      ? `- 合并冲突 自动/待确认: ${plan.summary.mergeConflictResolvedCount}/${plan.summary.mergeConflictReviewCount ?? 0}`
      : "",
    formatTopCountEntries(plan.summary.deleteStrategyCounts, 5)
      ? `- 删除策略: ${formatTopCountEntries(plan.summary.deleteStrategyCounts, 5)}`
      : "",
    plan.summary.deleteCount !== undefined
      ? `- 待删除条目: ${plan.summary.deleteCount}`
      : "",
    plan.summary.flattenCandidateCount !== undefined
      ? `- 包裹目录候选: ${plan.summary.flattenCandidateCount}`
      : "",
    "- 分类统计:",
    categoryLines || "- 无",
    reviewExamples ? "- 待确认示例:\n" + reviewExamples : "",
  ]
    .filter(Boolean)
    .join("\n");
}
