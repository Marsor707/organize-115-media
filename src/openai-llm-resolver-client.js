const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_OPENAI_MODEL = "gpt-5.4-mini";
const DEFAULT_OPENAI_TIMEOUT_MS = 20_000;

function ensureFetch(fetchImpl) {
  if (typeof fetchImpl !== "function") {
    throw new Error("当前环境缺少 fetch，无法调用 OpenAI");
  }

  return fetchImpl;
}

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || DEFAULT_OPENAI_BASE_URL).replace(/\/+$/u, "");
}

function createRequestId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `organize115-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function clampConfidence(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }

  return Math.max(0, Math.min(1, numeric));
}

function extractStructuredText(payload) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  for (const item of payload?.output ?? []) {
    for (const content of item?.content ?? []) {
      if (typeof content?.text === "string" && content.text.trim()) {
        return content.text.trim();
      }
    }
  }

  return "";
}

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractJsonObject(text) {
  const direct = tryParseJson(text);
  if (direct) {
    return direct;
  }

  const fencedMatch = String(text ?? "").match(/```(?:json)?\s*([\s\S]+?)\s*```/iu);
  if (fencedMatch?.[1]) {
    const fenced = tryParseJson(fencedMatch[1].trim());
    if (fenced) {
      return fenced;
    }
  }

  const raw = String(text ?? "");
  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null;
  }

  return tryParseJson(raw.slice(firstBrace, lastBrace + 1));
}

function normalizeResolverResult(value) {
  if (!value || value.resolved !== true) {
    return {
      resolved: false,
    };
  }

  const canonicalTitleZh = String(value.canonicalTitleZh ?? "").trim();
  const canonicalTitleEn = String(value.canonicalTitleEn ?? "").trim();
  const confidence = clampConfidence(value.confidence);

  if (!canonicalTitleZh || confidence <= 0) {
    return {
      resolved: false,
    };
  }

  return {
    resolved: true,
    canonicalTitleZh,
    canonicalTitleEn: canonicalTitleEn || null,
    confidence,
    tmdbId: null,
    reason: "llm-fallback",
  };
}

function buildResolverInstructions() {
  return [
    "你是 115 影视目录标准化助手，只做高置信度的剧集/动漫标题归并判断。",
    "如果无法高度确定 missSources 是否属于同一部连续内容，必须返回 resolved=false。",
    "判断时全路径 source、rootSource、parentDir 的优先级高于裸文件名里的数字。",
    "PV、迷你动画、NCOP、NCED、menu、SP、特典目录默认不是正片，不要仅因集号沿用主剧身份。",
    "若 group 内已有稳定命中的 canonicalTitleZh/canonicalTitleEn，应优先沿用，不要另起别名。",
    "canonicalTitleZh 和 canonicalTitleEn 只能填写作品标题本身，不能带季号、集号、字幕组、清晰度、年份、来源站点。",
    "如果英文标题没有把握，返回 null，不要猜。",
    "不要杜撰 tmdbId。",
    "只输出一个 JSON 对象，不要 Markdown，不要代码块，不要解释。",
  ].join("\n");
}

function buildResolverInput(context) {
  const entries = (context?.entries ?? []).map((entry) => ({
    source: entry.source,
    rootSource: entry.rootSource ?? context?.rootSource ?? "",
    parentDir: entry.parentDir ?? null,
    isDir: Boolean(entry.isDir),
    season: entry.season ?? null,
    episode: entry.episode ?? null,
    size: entry.size ?? null,
    tmdbType: entry.tmdbType ?? null,
    tmdbId: entry.tmdbId ?? null,
    canonicalTitleZh: entry.canonicalTitleZh ?? null,
    canonicalTitleEn: entry.canonicalTitleEn ?? null,
    titleCandidates: Array.isArray(entry.titleCandidates) ? entry.titleCandidates.slice(0, 6) : [],
  }));

  return {
    task: "判断 missSources 是否可以安全归并到同一部剧集/动漫，并输出规范标题",
    rootSource: context?.rootSource ?? "",
    missSources: Array.isArray(context?.missSources) ? context.missSources : [],
    entries,
    outputRules: {
      resolved: "只有在高度确定时才返回 true",
      confidence: "0 到 1 之间的小数，高置信建议 >= 0.85",
      canonicalTitleZh: "标准中文标题；不确定则在 resolved=false 时返回 null",
      canonicalTitleEn: "标准英文标题；不确定可返回 null",
    },
  };
}

function normalizeRoutingCategory(value) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  if (["anime", "animation", "动画", "动漫"].includes(normalized)) {
    return "anime";
  }
  if (["series", "tv", "show", "drama", "剧集", "电视剧"].includes(normalized)) {
    return "series";
  }
  if (["movie", "film", "电影"].includes(normalized)) {
    return "movie";
  }
  if (["documentary", "doc", "纪录片"].includes(normalized)) {
    return "documentary";
  }
  if (["supplement", "sidecar", "extra", "extras", "附属资料", "保留区"].includes(normalized)) {
    return "supplement";
  }
  return "unknown";
}

function normalizeMediaRoutingResult(value) {
  const rawRoutes = Array.isArray(value?.routes)
    ? value.routes
    : Array.isArray(value?.resourcePackages)
      ? value.resourcePackages
      : Array.isArray(value)
        ? value
        : [];

  return {
    routes: rawRoutes
      .map((item) => {
        const rootSource = String(item?.rootSource ?? item?.source ?? "").trim();
        const category = normalizeRoutingCategory(item?.category ?? item?.type ?? item?.mediaType);
        const confidence = clampConfidence(item?.confidence);
        const reason = String(item?.reason ?? "").trim();

        if (!rootSource || confidence <= 0) {
          return null;
        }

        return {
          rootSource,
          category,
          confidence,
          reason: reason || null,
        };
      })
      .filter(Boolean),
  };
}

function buildMediaRoutingInstructions() {
  return [
    "你是 115 影视目录资源包分类助手，只做资源包级分类，不做 TMDB 命名。",
    "输入来自待人工确认等非媒体根目录时，必须先判断每个 rootSource 应落到哪个媒体根。",
    "category 只能是 anime、series、movie、documentary、supplement、unknown。",
    "anime 表示日本动画/番剧/国漫等动画连续内容；series 表示真人剧集；movie 表示电影；documentary 表示纪录片。",
    "PV、menu、NCOP、NCED、Scans、Fonts、特典、字幕包等非正片资源包返回 supplement。",
    "低置信或无法判断必须返回 unknown 或 confidence < 0.85，不能硬猜。",
    "rootSource 必须原样复用输入 resourcePackages[].rootSource。",
    "只输出 JSON: {\"routes\":[...]}，不要 Markdown，不要解释。",
  ].join("\n");
}

function buildMediaRoutingInput(context) {
  return {
    task: "media-routing",
    rootPath: context?.rootPath ?? "",
    sourceRootRelativePath: context?.sourceRootRelativePath ?? "",
    policy: context?.policy ?? {},
    resourcePackages: (context?.resourcePackages ?? []).map((item) => ({
      rootSource: item.rootSource,
      parentTitles: Array.isArray(item.parentTitles) ? item.parentTitles.slice(0, 12) : [],
      videoCount: item.videoCount ?? 0,
      subtitleCount: item.subtitleCount ?? 0,
      sidecarDirectoryCount: item.sidecarDirectoryCount ?? 0,
      sameLevelEntries: Array.isArray(item.sameLevelEntries) ? item.sameLevelEntries.slice(0, 40) : [],
      sidecarDirectories: Array.isArray(item.sidecarDirectories) ? item.sidecarDirectories.slice(0, 40) : [],
      directoryTreeSummary: Array.isArray(item.directoryTreeSummary) ? item.directoryTreeSummary.slice(0, 80) : [],
      videos: Array.isArray(item.videos) ? item.videos.slice(0, 60) : [],
    })),
    outputRules: context?.outputRules ?? {
      routes: "逐个 rootSource 返回 category/confidence/reason",
    },
  };
}

function normalizeResidualMissMappingResult(value) {
  const rawMappings = Array.isArray(value?.mappings)
    ? value.mappings
    : Array.isArray(value)
      ? value
      : [];

  return {
    mappings: rawMappings
      .map((item) => {
        const titleKey = String(item?.titleKey ?? "").trim();
        const canonicalTitleZh = String(item?.canonicalTitleZh ?? "").trim();
        const canonicalTitleEn = String(item?.canonicalTitleEn ?? "").trim();
        const tmdbType = item?.tmdbType === "movie" ? "movie" : item?.tmdbType === "tv" ? "tv" : null;
        const confidence = clampConfidence(item?.confidence);
        const tmdbId =
          item?.tmdbId === undefined || item?.tmdbId === null || item?.tmdbId === ""
            ? null
            : item.tmdbId;

        if (!titleKey || !canonicalTitleZh || !tmdbType || confidence < 0.85) {
          return null;
        }

        return {
          titleKey,
          canonicalTitleZh,
          canonicalTitleEn: canonicalTitleEn || null,
          tmdbType,
          tmdbId,
          confidence,
        };
      })
      .filter(Boolean),
  };
}

function buildResidualMissMappingInstructions() {
  return [
    "你是 115 影视目录标准化助手，现在只处理 residual tmdb-miss 的本地 canonical override 生成。",
    "你会收到同一个 rootSource 下、仍然 tmdb-miss 的 titleGroups。",
    "只在高度确定时输出 mapping；没有把握的 titleKey 直接省略，不要猜。",
    "canonicalTitleZh/canonicalTitleEn 只能是作品标题本身，不能带季号、集号、字幕组、清晰度、年份、来源站点。",
    "tmdbType 只能是 movie 或 tv。",
    "confidence 低于 0.85 的 mapping 不要输出。",
    "只输出 JSON: {\"mappings\":[...]}，不要 Markdown，不要解释。",
  ].join("\n");
}

function buildResidualMissMappingInput(context) {
  return {
    task: "为 residual tmdb-miss 生成高置信本地 canonical override",
    rootSource: context?.rootSource ?? "",
    titleGroups: Array.isArray(context?.titleGroups) ? context.titleGroups : [],
    outputRules: {
      mappings: "仅输出高置信 mapping",
      titleKey: "必须原样返回输入 titleGroups[].titleKey",
      confidence: "0 到 1 之间的小数，必须 >= 0.85",
    },
  };
}

function normalizeZeroReviewClassificationResult(value) {
  const rawItems = Array.isArray(value?.classifications)
    ? value.classifications
    : Array.isArray(value?.items)
      ? value.items
      : [];

  const classifications = rawItems
    .map((item) => {
      const source = String(item?.source ?? "").trim();
      const kind = String(
        item?.kind ??
          item?.classification ??
          item?.videoClassification ??
          item?.mediaClass ??
          item?.type ??
          "",
      ).trim();
      const targetBucket = String(item?.targetBucket ?? item?.bucket ?? "").trim();
      const canonicalTitle = String(
        item?.canonicalTitle ?? item?.canonicalTitleZh ?? item?.title ?? "",
      ).trim();
      const canonicalTitleEn = String(item?.canonicalTitleEn ?? item?.englishTitle ?? "").trim();
      const tmdbType = item?.tmdbType === "movie" ? "movie" : item?.tmdbType === "tv" ? "tv" : null;
      const confidence = clampConfidence(item?.confidence);
      const tmdbId =
        item?.tmdbId === undefined || item?.tmdbId === null || item?.tmdbId === ""
          ? null
          : item.tmdbId;

      if (!source || !kind || confidence <= 0) {
        return null;
      }

      return {
        source,
        kind,
        confidence,
        targetBucket: targetBucket || null,
        canonicalTitle: canonicalTitle || null,
        canonicalTitleZh: canonicalTitle || null,
        canonicalTitleEn: canonicalTitleEn || null,
        tmdbType,
        tmdbId,
        reason: String(item?.reason ?? "").trim() || null,
      };
    })
    .filter(Boolean);

  const highConfidenceCount = classifications.filter((item) => item.confidence >= 0.85).length;

  return {
    resolved: highConfidenceCount > 0,
    confidence: highConfidenceCount > 0 ? Math.max(...classifications.map((item) => item.confidence)) : 0,
    classifications,
    rejectedReason: classifications.length === 0 ? "invalid-zero-review-classifications" : "low-confidence",
  };
}

function buildZeroReviewClassificationInstructions() {
  return [
    "你是 115 影视目录零 Review 分类助手。",
    "目标是把所有残余 review 分类成可执行 move；禁止输出删除动作。",
    "先按 resourcePackages[].videoBatch 做资源包级判断；当前资源根目录、完整 source、parentDir 的优先级高于裸文件名里的集号。",
    "视频 kind 可用 main_episode、special_episode、opening_ending、pv_cm、menu、mini_anime、unknown。",
    "PV、迷你动画、NCOP、NCED、menu、SP、特典目录默认不是正片；这些通常应归为 pv_cm/opening_ending/menu/mini_anime 或 unknown。",
    "资源包内明显小于主视频的一组视频更倾向附属资料；size 缺失时不能强推正片。",
    "只有高度确定为正片时才返回 kind=main_episode；非正片视频请给 targetBucket=supplement。",
    "影视条目只有高度确定时才给 canonicalTitle/tmdbType；否则 kind=unknown。",
    "软件安装包、种子/磁力、附属资料可以归入对应 targetBucket。",
    "低置信或无法判断必须返回 kind=unknown、targetBucket=unknown。",
    "source 必须原样复用输入 reviews[].source。",
    "只输出 JSON: {\"classifications\":[...]}，不要 Markdown，不要解释。",
  ].join("\n");
}

function buildZeroReviewClassificationInput(context) {
  return {
    task: "zero-review-finalizer",
    policy: context?.policy ?? {},
    roots: Array.isArray(context?.roots) ? context.roots : [],
    resourcePackages: (context?.resourcePackages ?? []).map((resourcePackage) => ({
      rootSource: resourcePackage.rootSource,
      contextMode: resourcePackage.contextMode,
      currentReviewSources: Array.isArray(resourcePackage.currentReviewSources)
        ? resourcePackage.currentReviewSources.slice(0, 80)
        : [],
      parentTitles: Array.isArray(resourcePackage.parentTitles)
        ? resourcePackage.parentTitles.slice(0, 12)
        : [],
      episodeRangeHint: resourcePackage.episodeRangeHint ?? null,
      sameLevelEntries: Array.isArray(resourcePackage.sameLevelEntries)
        ? resourcePackage.sameLevelEntries.slice(0, 40)
        : [],
      sidecarDirectories: Array.isArray(resourcePackage.sidecarDirectories)
        ? resourcePackage.sidecarDirectories.slice(0, 40)
        : [],
      directoryTreeSummary: Array.isArray(resourcePackage.directoryTreeSummary)
        ? resourcePackage.directoryTreeSummary.slice(0, 80)
        : [],
      videoBatch: (resourcePackage.videoBatch ?? []).map((video) => ({
        source: video.source,
        rootSource: video.rootSource ?? resourcePackage.rootSource ?? null,
        name: video.name,
        parentDir: video.parentDir,
        parentTitle: video.parentTitle,
        role: video.role ?? null,
        ext: video.ext ?? "",
        season: video.season ?? null,
        episode: video.episode ?? null,
        size: video.size ?? null,
        sizeRankInPackage: video.sizeRankInPackage ?? null,
        isCurrentReview: Boolean(video.isCurrentReview),
        fileLevelExtraMarker: Boolean(video.fileLevelExtraMarker),
        explicitExtraDirectoryAncestor: Boolean(video.explicitExtraDirectoryAncestor),
        protectedMainEpisode: Boolean(video.protectedMainEpisode),
        tmdbCandidates: Array.isArray(video.tmdbCandidates) ? video.tmdbCandidates.slice(0, 5) : [],
        siblings: Array.isArray(video.siblings) ? video.siblings.slice(0, 20) : [],
        ruleDiagnostics: Array.isArray(video.ruleDiagnostics) ? video.ruleDiagnostics.slice(0, 10) : [],
      })),
    })),
    reviews: (context?.reviews ?? []).map((review) => ({
      source: review.source,
      rootSource: review.rootSource ?? null,
      contextMode: review.contextMode ?? null,
      reviewReason: review.reviewReason ?? null,
      isDir: Boolean(review.isDir),
      role: review.role ?? null,
      ext: review.ext ?? "",
      parentDir: review.parentDir ?? null,
      parentTitle: review.parentTitle ?? null,
      size: review.size ?? null,
      sizeRankInPackage: review.sizeRankInPackage ?? null,
      episodeRangeHint: review.episodeRangeHint ?? null,
      protectedMainEpisode: Boolean(review.protectedMainEpisode),
      pathParts: Array.isArray(review.pathParts) ? review.pathParts.slice(0, 8) : [],
      titleCandidates: Array.isArray(review.titleCandidates) ? review.titleCandidates.slice(0, 6) : [],
      tmdbType: review.tmdbType ?? null,
      tmdbCandidates: Array.isArray(review.tmdbCandidates) ? review.tmdbCandidates.slice(0, 5) : [],
      siblings: Array.isArray(review.siblings) ? review.siblings.slice(0, 12) : [],
    })),
    outputRules: context?.outputRules ?? {
      classifications: "逐条返回 source/kind/confidence/targetBucket/canonicalTitle/tmdbType/reason",
    },
  };
}

function resolvePromptAndPayload(context) {
  if (context?.task === "media-routing") {
    return {
      systemPrompt: buildMediaRoutingInstructions(),
      userPayload: buildMediaRoutingInput(context),
      normalize: normalizeMediaRoutingResult,
    };
  }

  if (context?.task === "zero-review-finalizer") {
    return {
      systemPrompt: buildZeroReviewClassificationInstructions(),
      userPayload: buildZeroReviewClassificationInput(context),
      normalize: normalizeZeroReviewClassificationResult,
    };
  }

  return {
    systemPrompt: buildResolverInstructions(),
    userPayload: buildResolverInput(context),
    normalize: normalizeResolverResult,
  };
}

async function postResponses({
  apiKey,
  baseUrl,
  model,
  organization,
  project,
  timeoutMs,
  fetchImpl,
  systemPrompt,
  userPayload,
  throwOnError,
}) {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    Number.isFinite(timeoutMs) ? timeoutMs : DEFAULT_OPENAI_TIMEOUT_MS,
  );

  try {
    const response = await fetchImpl(`${baseUrl}/responses`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
        ...(organization ? { "OpenAI-Organization": organization } : {}),
        ...(project ? { "OpenAI-Project": project } : {}),
        "X-Client-Request-Id": createRequestId(),
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: JSON.stringify(userPayload, null, 2),
          },
        ],
      }),
    });
    const text = await response.text();
    let payload;

    try {
      payload = JSON.parse(text);
    } catch (error) {
      if (throwOnError) {
        throw new Error(`OpenAI 返回了非 JSON 响应: ${text.slice(0, 200)}`);
      }
      return null;
    }

    if (!response.ok) {
      const message = payload?.error?.message ?? payload?.message ?? text.slice(0, 200);
      if (throwOnError) {
        const error = new Error(`OpenAI 请求失败: ${response.status} ${message}`);
        error.status = response.status;
        throw error;
      }
      return null;
    }

    return payload;
  } catch (error) {
    if (throwOnError) {
      throw error;
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function buildRuntimeOptions(options = {}) {
  const apiKey = options.apiKey ?? "";
  if (!apiKey) {
    return null;
  }

  return {
    apiKey,
    baseUrl: normalizeBaseUrl(options.baseUrl),
    model: options.model ?? DEFAULT_OPENAI_MODEL,
    organization: options.organization ?? "",
    project: options.project ?? "",
    timeoutMs: Number.parseInt(String(options.timeoutMs ?? DEFAULT_OPENAI_TIMEOUT_MS), 10),
    fetchImpl: ensureFetch(options.fetchImpl ?? globalThis.fetch),
    throwOnError: options.throwOnError === true,
  };
}

export function createOpenAiLlmResolver(options = {}) {
  const runtime = buildRuntimeOptions(options);
  if (!runtime) {
    return null;
  }

  async function resolveWithOpenAi(context) {
    const prompt = resolvePromptAndPayload(context);
    const payload = await postResponses({
      ...runtime,
      systemPrompt: prompt.systemPrompt,
      userPayload: prompt.userPayload,
    });

    if (!payload) {
      return {
        resolved: false,
      };
    }

    const structuredText = extractStructuredText(payload);
    if (!structuredText) {
      return {
        resolved: false,
      };
    }

    const parsed = extractJsonObject(structuredText);
    if (!parsed) {
      return {
        resolved: false,
      };
    }

    return prompt.normalize(parsed);
  }

  Object.defineProperty(resolveWithOpenAi, "llmFallbackMetadata", {
    value: {
      enabled: true,
      configured: true,
      model: runtime.model,
      baseUrl: runtime.baseUrl,
    },
  });

  return resolveWithOpenAi;
}

export function createOpenAiResidualTmdbMissResolver(options = {}) {
  const runtime = buildRuntimeOptions(options);
  if (!runtime) {
    return null;
  }

  return async function resolveResidualTmdbMiss(context) {
    const payload = await postResponses({
      ...runtime,
      systemPrompt: buildResidualMissMappingInstructions(),
      userPayload: buildResidualMissMappingInput(context),
    });

    if (!payload) {
      return {
        mappings: [],
      };
    }

    const structuredText = extractStructuredText(payload);
    if (!structuredText) {
      return {
        mappings: [],
      };
    }

    const parsed = extractJsonObject(structuredText);
    if (!parsed) {
      return {
        mappings: [],
      };
    }

    return normalizeResidualMissMappingResult(parsed);
  };
}
