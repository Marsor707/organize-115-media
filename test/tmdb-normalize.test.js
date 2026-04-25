import test from "node:test";
import assert from "node:assert/strict";

import { buildPlanAsync } from "../src/build-115-plan.js";
import { renderPlanSummary } from "../src/organize115.js";

process.env.CODEX_HOME = `/tmp/organize-115-media-no-codex-${process.pid}`;

function createFakeTmdbClient({
  movieResults = {},
  tvResults = {},
  movieDetails = {},
  tvDetails = {},
} = {}) {
  const calls = [];
  const resolveResults = (resultMap, query) => {
    const directMatch = resultMap[query];
    if (directMatch) {
      return directMatch;
    }

    const normalizedQuery = String(query).toLowerCase();
    const matchedKey = Object.keys(resultMap).find((key) => key.toLowerCase() === normalizedQuery);
    return matchedKey ? resultMap[matchedKey] : [];
  };

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
    async getMovieDetails(tmdbId) {
      return movieDetails[tmdbId] ?? null;
    },
    async getTvDetails(tmdbId) {
      return tvDetails[tmdbId] ?? null;
    },
  };
}

function createTmdbHttpError(status, message) {
  const error = new Error(`TMDB 请求失败: ${status} /search/tv ${message}`);
  error.status = status;
  return error;
}

function createScriptedTmdbClient({
  movieScripts = {},
  tvScripts = {},
  movieDetails = {},
  tvDetails = {},
} = {}) {
  const calls = [];
  const indices = new Map();

  const resolveScriptedValue = async (scriptMap, query) => {
    const directMatch = scriptMap[query];
    const normalizedQuery = String(query).toLowerCase();
    const matchedKey =
      directMatch !== undefined
        ? query
        : Object.keys(scriptMap).find((key) => key.toLowerCase() === normalizedQuery);
    const script = matchedKey ? scriptMap[matchedKey] : [];
    const items = Array.isArray(script) ? script : [script];
    const currentIndex = indices.get(matchedKey ?? normalizedQuery) ?? 0;
    const current = items[Math.min(currentIndex, Math.max(items.length - 1, 0))] ?? [];
    indices.set(matchedKey ?? normalizedQuery, currentIndex + 1);

    if (current instanceof Error) {
      throw current;
    }

    return current;
  };

  return {
    calls,
    async searchMovie(query, extra = {}) {
      calls.push({ type: "movie", query, extra });
      return resolveScriptedValue(movieScripts, query);
    },
    async searchTv(query, extra = {}) {
      calls.push({ type: "tv", query, extra });
      return resolveScriptedValue(tvScripts, query);
    },
    async getMovieDetails(tmdbId) {
      return movieDetails[tmdbId] ?? null;
    },
    async getTvDetails(tmdbId) {
      return tvDetails[tmdbId] ?? null;
    },
  };
}

test("tmdb-normalize 会清洗脏电影名并输出中英双语电影命名", async () => {
  const tmdbClient = createFakeTmdbClient({
    movieResults: {
      "Spirited Away": [
        {
          id: 129,
          title: "千与千寻",
          original_title: "Spirited Away",
          release_date: "2001-07-20",
          popularity: 50,
        },
      ],
    },
    movieDetails: {
      129: {
        original_title: "Spirited Away",
        translations: {
          translations: [
            {
              iso_639_1: "en",
              data: {
                title: "Spirited Away",
              },
            },
          ],
        },
      },
    },
  });

  const plan = await buildPlanAsync(
    [
      {
        source: "【高清影视之家发布 www.BBQDDQ.com】Spirited.Away.2001.1080p.BluRay.x265.mkv",
        fid: "movie-1",
      },
    ],
    {
      mode: "tmdb-normalize",
      tmdbClient,
    },
  );

  assert.equal(plan.mode, "tmdb-normalize");
  assert.equal(plan.moves.length, 1);
  assert.equal(plan.reviews.length, 0);
  assert.equal(tmdbClient.calls[0].type, "movie");
  assert.equal(tmdbClient.calls[0].query, "Spirited Away");
  assert.equal(plan.moves[0].targetDir, "电影/千与千寻.Spirited.Away (2001)");
  assert.equal(plan.moves[0].targetName, "千与千寻.Spirited.Away.mkv");
  assert.equal(plan.moves[0].matchSource, "tmdb");
  assert.equal(plan.moves[0].tmdbType, "movie");
  assert.equal(plan.moves[0].tmdbId, 129);
  assert.equal(plan.moves[0].canonicalTitleZh, "千与千寻");
  assert.equal(plan.moves[0].canonicalTitleEn, "Spirited Away");
});

test("tmdb-normalize 会优先使用电影强力清洗后的核心 query", async () => {
  const tmdbClient = createFakeTmdbClient({
    movieResults: {
      "The Fifth Element": [
        {
          id: 18,
          title: "第五元素",
          original_title: "The Fifth Element",
          original_language: "en",
          release_date: "1997-05-02",
          popularity: 50,
        },
      ],
      Tenet: [
        {
          id: 577922,
          title: "信条",
          original_title: "Tenet",
          original_language: "en",
          release_date: "2020-08-22",
          popularity: 50,
        },
      ],
      "Hello Mr. Billionaire": [
        {
          id: 533985,
          title: "西虹市首富",
          original_title: "西虹市首富",
          original_language: "zh",
          release_date: "2018-07-27",
          popularity: 20,
        },
      ],
      "City of God": [
        {
          id: 598,
          title: "上帝之城",
          original_title: "Cidade de Deus",
          original_language: "pt",
          release_date: "2002-08-30",
          popularity: 35,
        },
      ],
      "Memories of Murder": [
        {
          id: 11423,
          title: "杀人回忆",
          original_title: "살인의 추억",
          original_language: "ko",
          release_date: "2003-05-02",
          popularity: 30,
        },
      ],
    },
    movieDetails: {
      18: { title: "第五元素", original_title: "The Fifth Element", original_language: "en" },
      577922: { title: "信条", original_title: "Tenet", original_language: "en" },
      533985: {
        title: "西虹市首富",
        original_title: "西虹市首富",
        original_language: "zh",
        alternative_titles: {
          titles: [{ iso_3166_1: "US", title: "Hello Mr. Billionaire", type: "" }],
        },
      },
      598: {
        title: "上帝之城",
        original_title: "Cidade de Deus",
        original_language: "pt",
        alternative_titles: {
          titles: [{ iso_3166_1: "US", title: "City of God", type: "" }],
        },
      },
      11423: {
        title: "杀人回忆",
        original_title: "살인의 추억",
        original_language: "ko",
        alternative_titles: {
          titles: [{ iso_3166_1: "US", title: "Memories of Murder", type: "" }],
        },
      },
    },
  });

  const plan = await buildPlanAsync(
    [
      { source: "The Fifth Element REMASTERED (1997)", cid: "movie-clean-1", isDir: true },
      { source: "Tenet HDRip AAC2 0 (2020)", cid: "movie-clean-2", isDir: true },
      { source: "Hello Mr Billionaire CHINESE (2018)", cid: "movie-clean-3", isDir: true },
      { source: "City Of God PORTUGUESE (2002)", cid: "movie-clean-4", isDir: true },
      {
        source: "Memories Of Murder ( ) [KOREAN] [5 1] [YTS MX] (2003)",
        cid: "movie-clean-5",
        isDir: true,
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "电影",
      tmdbClient,
      tmdbQueryIntervalMs: 0,
    },
  );

  const queries = tmdbClient.calls.map((item) => item.query);
  const moveBySource = new Map(plan.moves.map((item) => [item.source, item]));

  assert.equal(plan.reviews.length, 0);
  assert.deepEqual(
    [
      moveBySource.get("The Fifth Element REMASTERED (1997)").targetPath,
      moveBySource.get("Tenet HDRip AAC2 0 (2020)").targetPath,
      moveBySource.get("Hello Mr Billionaire CHINESE (2018)").targetPath,
      moveBySource.get("City Of God PORTUGUESE (2002)").targetPath,
      moveBySource.get("Memories Of Murder ( ) [KOREAN] [5 1] [YTS MX] (2003)").targetPath,
    ],
    [
      "电影/第五元素.The.Fifth.Element (1997)",
      "电影/信条.Tenet (2020)",
      "电影/西虹市首富.Hello.Mr.Billionaire (2018)",
      "电影/上帝之城.City.of.God (2002)",
      "电影/杀人回忆.Memories.of.Murder (2003)",
    ],
  );
  assert.ok(queries.includes("The Fifth Element"));
  assert.ok(queries.includes("Tenet"));
  assert.ok(queries.includes("Hello Mr. Billionaire"));
  assert.ok(queries.includes("City of God"));
  assert.ok(queries.includes("Memories of Murder"));
});

test("tmdb-normalize 会让电影根下的明确剧集和动漫跨分类落位", async () => {
  const plan = await buildPlanAsync(
    [
      { source: "黑袍纠察队3", cid: "movie-tv-1", isDir: true },
      { source: "欧比旺", cid: "movie-tv-2", isDir: true },
      { source: "鬼灭之刃 无限列车篇 Kimetsu No Yaiba", cid: "movie-anime-1", isDir: true },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "电影",
      tmdbQueryIntervalMs: 0,
      tmdbClient: createFakeTmdbClient({
        tvResults: {
          "The Boys": [
            {
              id: 76479,
              name: "黑袍纠察队",
              original_name: "The Boys",
              first_air_date: "2019-07-25",
              popularity: 90,
            },
          ],
          "Obi-Wan Kenobi": [
            {
              id: 92830,
              name: "欧比旺",
              original_name: "Obi-Wan Kenobi",
              first_air_date: "2022-05-26",
              popularity: 80,
            },
          ],
          鬼灭之刃: [
            {
              id: 85937,
              name: "鬼灭之刃",
              original_name: "鬼滅の刃",
              original_language: "ja",
              first_air_date: "2019-04-06",
              popularity: 85,
            },
          ],
        },
      }),
    },
  );

  const moveBySource = new Map(plan.moves.map((item) => [item.source, item]));

  assert.equal(plan.reviews.length, 0);
  assert.equal(moveBySource.get("黑袍纠察队3").targetPath, "剧集/黑袍纠察队");
  assert.equal(moveBySource.get("欧比旺").targetPath, "剧集/欧比旺");
  assert.equal(moveBySource.get("鬼灭之刃 无限列车篇 Kimetsu No Yaiba").targetPath, "动漫/鬼灭之刃");
});

test("tmdb-normalize 会对待人工确认资源包先做 LLM 路由再走 TMDB 命名", async () => {
  const resourceRoot = "[DBD-Raws][Re：从零开始的异世界生活 S03][01-16TV全集+SP]";
  const mainSource = `${resourceRoot}/Re.Zero.S03E01.1080p.mkv`;
  const supplementSources = [
    `${resourceRoot}/PV/Re.Zero.PV.05.mkv`,
    `${resourceRoot}/menu/menu01.mkv`,
    `${resourceRoot}/NCOP/NCOP.mkv`,
    `${resourceRoot}/迷你动画/Re.Zero.Break.Time.05.mkv`,
    `${resourceRoot}/Scans`,
  ];
  const fontSource = `${resourceRoot}/Fonts/font.ttf`;
  let routingContext = null;

  const llmResolver = async (context) => {
    if (context.task === "media-routing") {
      routingContext = context;
      return {
        routes: [
          {
            rootSource: resourceRoot,
            category: "anime",
            confidence: 0.93,
            reason: "日漫资源包，含 S03 正片和 PV/NCOP 附属目录",
          },
        ],
      };
    }

    return {
      classifications: [],
    };
  };

  const plan = await buildPlanAsync(
    [
      { source: mainSource, fid: "rezero-main-1", size: 1_500_000_000 },
      ...supplementSources.map((source, index) => ({
        source,
        fid: source.endsWith("/Scans") ? undefined : `rezero-extra-${index + 1}`,
        cid: source.endsWith("/Scans") ? "rezero-scans-dir" : undefined,
        isDir: source.endsWith("/Scans"),
        size: 80_000_000 + index,
      })),
      { source: `${resourceRoot}/Fonts`, cid: "rezero-fonts-dir", isDir: true },
      { source: fontSource, fid: "rezero-font-1", size: 12_000 },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "待人工确认",
      tmdbQueryIntervalMs: 0,
      tmdbClient: createFakeTmdbClient({
        tvResults: {
          "Re Zero": [
            {
              id: 65942,
              name: "Re Zero",
              original_name: "Re:ZERO -Starting Life in Another World-",
              original_language: "ja",
              genre_ids: [16],
              first_air_date: "2016-04-04",
              popularity: 90,
            },
          ],
        },
        tvDetails: {
          65942: {
            id: 65942,
            name: "Re：从零开始的异世界生活",
            original_name: "Re:ZERO -Starting Life in Another World-",
            original_language: "ja",
            genres: [{ id: 16, name: "Animation" }],
          },
        },
      }),
      llmResolver,
    },
  );

  const moveBySource = new Map(plan.moves.map((item) => [item.source, item]));
  const deleteSourceSet = new Set(plan.deletes.map((item) => item.wrapperDir));

  assert.equal(routingContext.task, "media-routing");
  assert.equal(routingContext.resourcePackages[0].rootSource, resourceRoot);
  assert.equal(plan.reviews.length, 0);
  assert.equal(
    moveBySource.get(mainSource).targetPath,
    "动漫/Re：从零开始的异世界生活/Re：从零开始的异世界生活.S03/Re：从零开始的异世界生活.S03E01.mkv",
  );
  assert.equal(moveBySource.get(mainSource).routingSource, "llm");
  assert.equal(moveBySource.get(mainSource).routingCategory, "anime");
  assert.equal(moveBySource.get(mainSource).routingConfidence, 0.93);
  assert.ok(
    supplementSources
      .filter((source) => !source.endsWith("/Scans"))
      .every((source) =>
        moveBySource.get(source)?.targetPath.startsWith("整理保留区/附属资料/"),
      ),
  );
  assert.ok(!moveBySource.get(`${resourceRoot}/Scans`)?.targetPath.startsWith("动漫/"));
  assert.equal(deleteSourceSet.has(fontSource), true);
  assert.equal(plan.mediaRoutingSummary.highConfidenceCount, 1);
  assert.equal(plan.summary.mediaRouting.categoryCounts.anime, 1);
});

test("tmdb-normalize 待人工确认路由为剧集和电影时分别落到对应媒体根", async () => {
  const seriesSource = "The.Last.of.Us.S01E01.1080p.WEB-DL.mkv";
  const movieSource = "Spirited.Away.2001.1080p.BluRay.x265.mkv";

  const plan = await buildPlanAsync(
    [
      { source: seriesSource, fid: "pending-series-1" },
      { source: movieSource, fid: "pending-movie-1" },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "待人工确认",
      tmdbQueryIntervalMs: 0,
      tmdbClient: createFakeTmdbClient({
        tvResults: {
          "The Last of Us": [
            {
              id: 100088,
              name: "最后生还者",
              original_name: "The Last of Us",
              first_air_date: "2023-01-15",
              popularity: 80,
            },
          ],
        },
        movieResults: {
          "Spirited Away": [
            {
              id: 129,
              title: "千与千寻",
              original_title: "Spirited Away",
              release_date: "2001-07-20",
              popularity: 50,
            },
          ],
        },
        movieDetails: {
          129: {
            original_title: "Spirited Away",
            translations: {
              translations: [
                {
                  iso_639_1: "en",
                  data: { title: "Spirited Away" },
                },
              ],
            },
          },
        },
      }),
      llmResolver: async (context) => {
        if (context.task !== "media-routing") {
          return { resolved: false };
        }

        return {
          routes: [
            {
              rootSource: seriesSource,
              category: "series",
              confidence: 0.91,
              reason: "S01E01 真人剧集",
            },
            {
              rootSource: movieSource,
              category: "movie",
              confidence: 0.9,
              reason: "电影文件名带上映年份",
            },
          ],
        };
      },
    },
  );

  const moveBySource = new Map(plan.moves.map((item) => [item.source, item]));

  assert.equal(plan.reviews.length, 0);
  assert.equal(
    moveBySource.get(seriesSource).targetPath,
    "剧集/最后生还者/最后生还者.S01/最后生还者.S01E01.mkv",
  );
  assert.equal(
    moveBySource.get(movieSource).targetPath,
    "电影/千与千寻.Spirited.Away (2001)/千与千寻.Spirited.Away.mkv",
  );
  assert.equal(plan.summary.mediaRouting.categoryCounts.series, 1);
  assert.equal(plan.summary.mediaRouting.categoryCounts.movie, 1);
});

test("tmdb-normalize 待人工确认 LLM 低置信时不会把 tv 命中强制落到剧集", async () => {
  const source = "The.Last.of.Us.S01E01.1080p.WEB-DL.mkv";
  const tmdbClient = createFakeTmdbClient({
    tvResults: {
      "The Last of Us": [
        {
          id: 100088,
          name: "最后生还者",
          original_name: "The Last of Us",
          first_air_date: "2023-01-15",
          popularity: 80,
        },
      ],
    },
  });

  const plan = await buildPlanAsync(
    [{ source, fid: "pending-low-confidence-1" }],
    {
      mode: "tmdb-normalize",
      rootPath: "待人工确认",
      tmdbQueryIntervalMs: 0,
      tmdbClient,
      llmResolver: async (context) => {
        if (context.task !== "media-routing") {
          return { classifications: [] };
        }

        return {
          routes: [
            {
              rootSource: source,
              category: "series",
              confidence: 0.4,
              reason: "低置信测试",
            },
          ],
        };
      },
    },
  );

  assert.equal(plan.reviews.length, 0);
  assert.equal(plan.moves.length, 1);
  assert.equal(plan.moves[0].matchSource, "zero-review-finalizer");
  assert.equal(plan.moves[0].targetPath, `整理保留区/未识别媒体/${source}`);
  assert.equal(plan.summary.reviewReasonCounts["media-routing-unknown"], 1);
  assert.equal(plan.mediaRoutingSummary.lowConfidenceCount, 1);
  assert.equal(plan.mediaRoutingSummary.highConfidenceCount, 0);
  assert.ok(tmdbClient.calls.some((item) => item.type === "tv"));
});

test("tmdb-normalize 待人工确认 LLM 失败时可用 TMDB 动画证据安全提升为动漫", async () => {
  const source = "Re.Zero.S03E01.1080p.mkv";

  const plan = await buildPlanAsync(
    [{ source, fid: "pending-anime-fallback-1" }],
    {
      mode: "tmdb-normalize",
      rootPath: "待人工确认",
      tmdbQueryIntervalMs: 0,
      tmdbClient: createFakeTmdbClient({
        tvResults: {
          "Re Zero": [
            {
              id: 65942,
              name: "Re Zero",
              original_name: "Re:ZERO -Starting Life in Another World-",
              original_language: "ja",
              genre_ids: [16],
              first_air_date: "2016-04-04",
              popularity: 90,
            },
          ],
        },
        tvDetails: {
          65942: {
            id: 65942,
            name: "Re：从零开始的异世界生活",
            original_name: "Re:ZERO -Starting Life in Another World-",
            original_language: "ja",
            genres: [{ id: 16, name: "Animation" }],
          },
        },
      }),
      llmResolver: async (context) => {
        if (context.task === "media-routing") {
          throw new Error("408 Request Timeout");
        }
        return { classifications: [] };
      },
    },
  );

  assert.equal(plan.reviews.length, 0);
  assert.equal(plan.moves.length, 1);
  assert.equal(plan.moves[0].category, "anime");
  assert.equal(
    plan.moves[0].targetPath,
    "动漫/Re：从零开始的异世界生活/Re：从零开始的异世界生活.S03/Re：从零开始的异世界生活.S03E01.mkv",
  );
  assert.equal(plan.moves[0].routingSource, "llm-error");
  assert.equal(plan.mediaRoutingSummary.failureCount, 1);
  assert.equal(plan.mediaRoutingSummary.errorReasonCounts["408 Request Timeout"], 1);
});

test("tmdb-normalize 会把电影根下可识别的单集目录吸收为剧集 move", async () => {
  const plan = await buildPlanAsync(
    [
      {
        source: "黑袍纠察队3/The.Boys.S03E01.1080p.WEB.H264-CAKES[rarbg]",
        cid: "movie-wrapper-1",
        isDir: true,
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "电影",
      tmdbQueryIntervalMs: 0,
      tmdbClient: createFakeTmdbClient({
        tvResults: {
          "The Boys": [
            {
              id: 76479,
              name: "黑袍纠察队",
              original_name: "The Boys",
              first_air_date: "2019-07-25",
              popularity: 90,
            },
          ],
        },
      }),
    },
  );

  assert.equal(plan.reviews.length, 0);
  assert.equal(plan.moves.length, 1);
  assert.equal(
    plan.moves[0].targetPath,
    "剧集/黑袍纠察队/黑袍纠察队.S03/黑袍纠察队.S03E01",
  );
  assert.equal(plan.summary.reviewReasonCounts["nested-sidecar-dir"] ?? 0, 0);
});

test("tmdb-normalize 会让电影根下单集包裹目录里的字幕跟随主视频迁移", async () => {
  const wrapperSource = "黑袍纠察队3/The.Boys.S03E01.1080p.WEB.H264-CAKES[rarbg]";
  const plan = await buildPlanAsync(
    [
      { source: wrapperSource, cid: "movie-wrapper-dir-1", isDir: true },
      {
        source: `${wrapperSource}/The.Boys.S03E01.1080p.WEB.H264-CAKES.mkv`,
        fid: "movie-wrapper-video-1",
      },
      {
        source: `${wrapperSource}/The.Boys.S03E01.1080p.WEB.H264-CAKES.zh.srt`,
        fid: "movie-wrapper-subtitle-1",
      },
      {
        source: `${wrapperSource}/The.Boys.S03E01.1080p.WEB.H264-CAKES.nfo`,
        fid: "movie-wrapper-nfo-1",
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "电影",
      tmdbQueryIntervalMs: 0,
      tmdbClient: createFakeTmdbClient({
        tvResults: {
          "The Boys": [
            {
              id: 76479,
              name: "黑袍纠察队",
              original_name: "The Boys",
              first_air_date: "2019-07-25",
              popularity: 90,
            },
          ],
        },
      }),
    },
  );

  assert.equal(plan.reviews.length, 0);
  assert.deepEqual(
    plan.moves.map((item) => item.targetPath).sort(),
    [
      "剧集/黑袍纠察队/黑袍纠察队.S03/The.Boys.S03E01.1080p.WEB.H264-CAKES.zh.srt",
      "剧集/黑袍纠察队/黑袍纠察队.S03/黑袍纠察队.S03E01.mkv",
    ],
  );
  assert.deepEqual(
    plan.deletes.map((item) => item.wrapperDir).sort(),
    [
      "黑袍纠察队3/The.Boys.S03E01.1080p.WEB.H264-CAKES[rarbg]",
      "黑袍纠察队3/The.Boys.S03E01.1080p.WEB.H264-CAKES[rarbg]/The.Boys.S03E01.1080p.WEB.H264-CAKES.nfo",
    ],
  );
});

test("tmdb-normalize 会用高置信电影 alias 压缩待 review", async () => {
  const tmdbClient = createFakeTmdbClient({
    movieResults: {
      "Yonimo Kimyouna Monogatari 20 Aki no SP": [
        {
          id: 900001,
          title: "世界奇妙物语 2020秋季特别篇",
          original_title: "Yonimo Kimyouna Monogatari 20 Aki no SP",
          original_language: "ja",
          release_date: "2020-11-14",
          popularity: 12,
        },
      ],
      "Yonimo Kimyouna Monogatari 20 Natsu no SP": [
        {
          id: 900002,
          title: "世界奇妙物语 2020夏季特别篇",
          original_title: "Yonimo Kimyouna Monogatari 20 Natsu no SP",
          original_language: "ja",
          release_date: "2020-07-11",
          popularity: 12,
        },
      ],
      "Escape Room": [
        {
          id: 522681,
          title: "密室逃生",
          original_title: "Escape Room",
          original_language: "en",
          release_date: "2019-01-03",
          popularity: 35,
        },
      ],
      "我是大哥大 电影版": [
        {
          id: 682110,
          title: "我是大哥大 电影版",
          original_title: "今日から俺は!!劇場版",
          original_language: "ja",
          release_date: "2020-07-17",
          popularity: 10,
        },
      ],
      "Wonder Woman 1984": [
        {
          id: 464052,
          title: "神奇女侠1984",
          original_title: "Wonder Woman 1984",
          original_language: "en",
          release_date: "2020-12-16",
          popularity: 50,
        },
      ],
      深海: [
        {
          id: 667538,
          title: "深海",
          original_title: "深海",
          original_language: "zh",
          release_date: "2023-01-22",
          popularity: 24,
        },
      ],
      阳光灿烂的日子: [
        {
          id: 11845,
          title: "阳光灿烂的日子",
          original_title: "阳光灿烂的日子",
          original_language: "zh",
          release_date: "1994-09-09",
          popularity: 16,
        },
      ],
      Her: [
        {
          id: 152601,
          title: "她",
          original_title: "Her",
          original_language: "en",
          release_date: "2013-12-18",
          popularity: 42,
        },
      ],
      "一一 Yi Yi 2000": [
        {
          id: 25538,
          title: "一一",
          original_title: "一一",
          original_language: "zh",
          release_date: "2000-09-20",
          popularity: 18,
        },
      ],
      妙先生: [
        {
          id: 700391,
          title: "妙先生",
          original_title: "妙先生",
          original_language: "zh",
          release_date: "2020-07-31",
          popularity: 8,
        },
      ],
      "Free Guy": [
        {
          id: 550988,
          title: "失控玩家",
          original_title: "Free Guy",
          original_language: "en",
          release_date: "2021-08-11",
          popularity: 45,
        },
      ],
      某种物质: [
        {
          id: 933260,
          title: "某种物质",
          original_title: "The Substance",
          original_language: "en",
          release_date: "2024-09-07",
          popularity: 55,
        },
      ],
    },
    movieDetails: {
      900001: {
        title: "世界奇妙物语 2020秋季特别篇",
        original_title: "Yonimo Kimyouna Monogatari 20 Aki no SP",
        original_language: "ja",
        alternative_titles: {
          titles: [
            { iso_3166_1: "US", title: "Yonimo Kimyouna Monogatari 20 Aki no SP", type: "" },
          ],
        },
      },
      900002: {
        title: "世界奇妙物语 2020夏季特别篇",
        original_title: "Yonimo Kimyouna Monogatari 20 Natsu no SP",
        original_language: "ja",
        alternative_titles: {
          titles: [
            { iso_3166_1: "US", title: "Yonimo Kimyouna Monogatari 20 Natsu no SP", type: "" },
          ],
        },
      },
      522681: { title: "密室逃生", original_title: "Escape Room", original_language: "en" },
      682110: { title: "我是大哥大 电影版", original_title: "今日から俺は!!劇場版", original_language: "ja" },
      464052: { title: "神奇女侠1984", original_title: "Wonder Woman 1984", original_language: "en" },
      667538: {
        title: "深海",
        original_title: "深海",
        original_language: "zh",
        alternative_titles: {
          titles: [{ iso_3166_1: "US", title: "Deep Sea", type: "" }],
        },
      },
      11845: {
        title: "阳光灿烂的日子",
        original_title: "阳光灿烂的日子",
        original_language: "zh",
        alternative_titles: {
          titles: [{ iso_3166_1: "US", title: "In the Heat of the Sun", type: "" }],
        },
      },
      152601: { title: "她", original_title: "Her", original_language: "en" },
      25538: {
        title: "一一",
        original_title: "一一",
        original_language: "zh",
        alternative_titles: {
          titles: [{ iso_3166_1: "US", title: "Yi Yi", type: "" }],
        },
      },
      700391: {
        title: "妙先生",
        original_title: "妙先生",
        original_language: "zh",
        alternative_titles: {
          titles: [{ iso_3166_1: "US", title: "Mr. Miao", type: "" }],
        },
      },
      550988: { title: "失控玩家", original_title: "Free Guy", original_language: "en" },
      933260: { title: "某种物质", original_title: "The Substance", original_language: "en" },
    },
  });

  const plan = await buildPlanAsync(
    [
      {
        source: "世界奇妙物语20秋季特别篇 Yonimo Kimyouna Monogatari 20 Aki no SP HD720p 日语中字",
        cid: "movie-alias-1",
        isDir: true,
      },
      {
        source: "世界奇妙物语20夏季特别篇 Yonimo Kimyouna Monogatari 20 Natsu no SP HD720p 日语中字",
        cid: "movie-alias-2",
        isDir: true,
      },
      {
        source: "[BD ]M室T生 Escape Room DD5 1 BD1080P 英国双语 特效中英双字 (2019)",
        cid: "movie-alias-3",
        isDir: true,
      },
      {
        source: "[BD ]我是大哥大 电影版 Kyo kara ore wa! BD1080P 日语中字 (2020)",
        cid: "movie-alias-4",
        isDir: true,
      },
      { source: "Wonder Woman WEB NAISU (2020)", cid: "movie-alias-5", isDir: true },
      { source: "Deep Sea Chinese 5 1 BONE Mkv (2023)", cid: "movie-alias-6", isDir: true },
      {
        source: "阳光灿烂的日子 未删减修复版 国语中字 LxyLab mkv (1994)",
        cid: "movie-alias-7",
        isDir: true,
      },
      { source: "她 BD1080P BTSJ6 (2013)", cid: "movie-alias-8", isDir: true },
      { source: "一一[国语音轨+中英字幕] Yi Yi (2000)", cid: "movie-alias-9", isDir: true },
      {
        source: "[国漫电影][妙先生][Miao Xian Sheng][Mr Miao][Movie] [GB] mp4",
        cid: "movie-alias-10",
        isDir: true,
      },
      { source: "[BD ]Free G uy BD1080P 中英双字 mp4 (2021)", cid: "movie-alias-11", isDir: true },
      {
        source: "某种物质 完美物质 惧裂",
        cid: "movie-alias-12",
        isDir: true,
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "电影",
      tmdbQueryIntervalMs: 0,
      tmdbClient,
      zeroReviewFinalizer: false,
    },
  );

  const moveBySource = new Map(plan.moves.map((item) => [item.source, item]));

  assert.equal(plan.reviews.length, 0);
  assert.equal(plan.moves.length, 12);
  assert.equal(moveBySource.get("Wonder Woman WEB NAISU (2020)").targetPath, "电影/神奇女侠1984.Wonder.Woman.1984 (2020)");
  assert.equal(moveBySource.get("Deep Sea Chinese 5 1 BONE Mkv (2023)").targetPath, "电影/深海.Deep.Sea (2023)");
  assert.equal(moveBySource.get("她 BD1080P BTSJ6 (2013)").targetPath, "电影/她.Her (2013)");
  assert.equal(moveBySource.get("某种物质 完美物质 惧裂").targetPath, "电影/某种物质.The.Substance (2024)");
  assert.ok(tmdbClient.calls.some((item) => item.query === "Yonimo Kimyouna Monogatari 20 Aki no SP"));
  assert.ok(tmdbClient.calls.some((item) => item.query === "Escape Room"));
  assert.ok(tmdbClient.calls.some((item) => item.query === "Free Guy"));
});

test("tmdb-normalize 会让 Stone Ocean 从电影根跨到动漫剧集", async () => {
  const plan = await buildPlanAsync(
    [
      {
        source: "'s Bizarre Adventure Stone Ocean",
        cid: "stone-ocean-1",
        isDir: true,
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "电影",
      tmdbQueryIntervalMs: 0,
      zeroReviewFinalizer: false,
      tmdbClient: createFakeTmdbClient({
        tvResults: {
          "JoJo Bizarre Adventure Stone Ocean": [
            {
              id: 120168,
              name: "JOJO的奇妙冒险 石之海",
              original_name: "JoJo's Bizarre Adventure: Stone Ocean",
              original_language: "ja",
              first_air_date: "2021-12-01",
              popularity: 40,
            },
          ],
        },
      }),
    },
  );

  assert.equal(plan.reviews.length, 0);
  assert.equal(plan.moves.length, 1);
  assert.equal(plan.moves[0].tmdbType, "tv");
  assert.equal(plan.moves[0].category, "anime");
  assert.equal(plan.moves[0].targetPath, "动漫/JOJO的奇妙冒险.石之海");
});

test("tmdb-normalize 会把已在目标路径的电影、动漫、纪录片条目剪枝为 no-op", async () => {
  const tmdbClient = createFakeTmdbClient({
    movieResults: {
      "Spirited Away": [
        {
          id: 129,
          title: "千与千寻",
          original_title: "Spirited Away",
          release_date: "2001-07-20",
          popularity: 50,
        },
      ],
    },
    tvResults: {
      JOJO的奇妙冒险: [
        {
          id: 111,
          name: "JOJO的奇妙冒险",
          original_name: "JoJo's Bizarre Adventure",
          first_air_date: "2012-10-06",
          popularity: 80,
        },
      ],
      绿色星球: [
        {
          id: 999,
          name: "绿色星球",
          original_name: "The Green Planet",
          first_air_date: "2022-01-09",
          popularity: 60,
        },
      ],
    },
  });

  const moviePlan = await buildPlanAsync(
    [
      {
        source: "千与千寻.Spirited.Away (2001)/千与千寻.Spirited.Away.mkv",
        fid: "noop-movie-1",
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "电影",
      tmdbClient,
      tmdbQueryIntervalMs: 0,
    },
  );
  const animePlan = await buildPlanAsync(
    [
      {
        source: "JOJO的奇妙冒险/JOJO的奇妙冒险.S01/JOJO的奇妙冒险.S01E01.mkv",
        fid: "noop-anime-1",
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "动漫",
      tmdbClient,
      tmdbQueryIntervalMs: 0,
      zeroReviewFinalizer: false,
    },
  );
  const documentaryPlan = await buildPlanAsync(
    [
      {
        source: "绿色星球/绿色星球.S01/绿色星球.S01E01.mkv",
        fid: "noop-documentary-1",
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "纪录片",
      tmdbClient,
      tmdbQueryIntervalMs: 0,
    },
  );

  assert.equal(moviePlan.summary.moveCount, 0);
  assert.equal(animePlan.summary.moveCount, 0);
  assert.equal(documentaryPlan.summary.moveCount, 0);
  assert.equal(moviePlan.reviews.length, 0);
  assert.equal(animePlan.reviews.length, 0);
  assert.equal(documentaryPlan.reviews.length, 0);
  assert.equal(moviePlan.deletes.length, 0);
  assert.equal(animePlan.deletes.length, 0);
  assert.equal(documentaryPlan.deletes.length, 0);
});

test("tmdb-normalize 会把 no-op 占用目标路径保护为 collision review", async () => {
  const plan = await buildPlanAsync(
    [
      {
        source: "绿色星球/绿色星球.S01/绿色星球.S01E01.mkv",
        fid: "green-noop-1",
      },
      {
        source: "The Green Planet NTb/Green.Planet.S01E01.mkv",
        fid: "green-old-1",
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "纪录片",
      tmdbQueryIntervalMs: 0,
      zeroReviewFinalizer: false,
      tmdbClient: createFakeTmdbClient({
        tvResults: {
          绿色星球: [
            {
              id: 999,
              name: "绿色星球",
              original_name: "The Green Planet",
              first_air_date: "2022-01-09",
              popularity: 60,
            },
          ],
          "Green Planet": [
            {
              id: 999,
              name: "绿色星球",
              original_name: "The Green Planet",
              first_air_date: "2022-01-09",
              popularity: 60,
            },
          ],
        },
      }),
    },
  );

  assert.equal(plan.moves.length, 0);
  assert.equal(plan.reviews.length, 1);
  assert.equal(plan.reviews[0].source, "The Green Planet NTb/Green.Planet.S01E01.mkv");
  assert.equal(plan.reviews[0].reviewReason, "collision");
  assert.equal(plan.collisions.length, 1);
  assert.deepEqual(plan.collisions[0].sources.sort(), [
    "The Green Planet NTb/Green.Planet.S01E01.mkv",
    "绿色星球/绿色星球.S01/绿色星球.S01E01.mkv",
  ]);
  assert.equal(plan.deletes.length, 0);
});

test("tmdb-normalize 会删除纪录片根下已无后代的同类空旧目录并保留 no-op 剪枝", async () => {
  const tmdbClient = createFakeTmdbClient({
    tvResults: {
      绿色星球: [
        {
          id: 999,
          name: "绿色星球",
          original_name: "The Green Planet",
          first_air_date: "2022-01-09",
          popularity: 60,
        },
      ],
    },
  });

  const plan = await buildPlanAsync(
    [
      {
        source: "The Green Planet NTb",
        cid: "green-old-empty-dir",
        isDir: true,
      },
      {
        source: "The Green Planet NTb/Season 01",
        cid: "green-old-empty-season-dir",
        isDir: true,
      },
      {
        source: "绿色星球/绿色星球.S01/绿色星球.S01E01.mkv",
        fid: "green-noop-video-1",
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "纪录片",
      inputContext: {
        state: "done",
        pendingFolderCount: 0,
      },
      tmdbQueryIntervalMs: 0,
      tmdbClient,
      zeroReviewFinalizer: false,
    },
  );

  assert.equal(plan.summary.moveCount, 0);
  assert.equal(plan.summary.reviewCount, 0);
  assert.equal(plan.summary.deleteCount, 1);
  assert.equal(plan.summary.deleteStrategyCounts["empty-media-dir-delete"], 1);
  assert.deepEqual(
    plan.deletes.map((item) => item.wrapperDir),
    ["The Green Planet NTb"],
  );
  assert.equal(plan.deletes[0].wrapperDir, "The Green Planet NTb");
  assert.equal(plan.deletes[0].wrapperDirCid, "green-old-empty-dir");
  assert.equal(plan.deletes[0].strategy, "empty-media-dir-delete");
  assert.equal(tmdbClient.calls.some((item) => item.query === "The Green Planet NTb"), false);
  assert.equal(tmdbClient.calls.some((item) => item.query === "Season 01"), false);
});

test("tmdb-normalize 会把纪录片根下单独的同类空目录直接删除而不是 tmdb-miss review", async () => {
  const tmdbClient = createFakeTmdbClient();

  const plan = await buildPlanAsync(
    [
      {
        source: "The Green Planet NTb",
        cid: "green-empty-only-dir",
        isDir: true,
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "纪录片",
      inputContext: {
        state: "done",
        pendingFolderCount: 0,
      },
      tmdbClient,
    },
  );

  assert.equal(tmdbClient.calls.length, 0);
  assert.equal(plan.moves.length, 0);
  assert.equal(plan.reviews.length, 0);
  assert.deepEqual(plan.deletes, [
    {
      wrapperDir: "The Green Planet NTb",
      wrapperDirCid: "green-empty-only-dir",
      moveCount: 0,
      reason: "递归采集确认目录没有任何后代，按同类空媒体目录删除",
      strategy: "empty-media-dir-delete",
    },
  ]);
});

test("tmdb-normalize 在父目录存在真实文件时只删除可确认空的子目录", async () => {
  const plan = await buildPlanAsync(
    [
      {
        source: "The Green Planet NTb",
        cid: "green-nonempty-dir",
        isDir: true,
      },
      {
        source: "The Green Planet NTb/Season 01",
        cid: "green-empty-child-dir",
        isDir: true,
      },
      {
        source: "The Green Planet NTb/Green.Planet.S01E01.mkv",
        fid: "green-nonempty-video",
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "纪录片",
      inputContext: {
        state: "done",
        pendingFolderCount: 0,
      },
      tmdbQueryIntervalMs: 0,
      tmdbClient: createFakeTmdbClient(),
    },
  );

  assert.deepEqual(
    plan.deletes.map((item) => item.wrapperDir),
    ["The Green Planet NTb/Season 01"],
  );
  assert.equal(plan.summary.deleteStrategyCounts["empty-media-dir-delete"], 1);
});

test("tmdb-normalize 在采集 paused 时不会自动删除同类空目录", async () => {
  const tmdbClient = createFakeTmdbClient();

  const plan = await buildPlanAsync(
    [
      {
        source: "The Green Planet NTb",
        cid: "green-paused-empty-dir",
        isDir: true,
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "纪录片",
      inputContext: {
        state: "paused",
        pendingFolderCount: 1,
      },
      tmdbQueryIntervalMs: 0,
      tmdbClient,
      zeroReviewFinalizer: false,
    },
  );

  assert.equal(plan.deletes.length, 0);
  assert.equal(plan.reviews.length, 1);
  assert.equal(plan.reviews[0].source, "The Green Planet NTb");
  assert.equal(plan.reviews[0].reviewReason, "tmdb-miss");
  assert.ok(tmdbClient.calls.length > 0);
});

test("tmdb-normalize 在 pendingFolderCount 大于 0 时不会递归删除同类空目录", async () => {
  const tmdbClient = createFakeTmdbClient();

  const plan = await buildPlanAsync(
    [
      {
        source: "The Green Planet NTb",
        cid: "green-pending-empty-dir",
        isDir: true,
      },
      {
        source: "The Green Planet NTb/Season 01",
        cid: "green-pending-empty-season-dir",
        isDir: true,
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "纪录片",
      inputContext: {
        state: "done",
        pendingFolderCount: 2,
      },
      tmdbQueryIntervalMs: 0,
      tmdbClient,
    },
  );

  assert.equal(plan.deletes.length, 0);
  assert.equal(plan.summary.deleteStrategyCounts["empty-media-dir-delete"] ?? 0, 0);
  assert.ok(tmdbClient.calls.length > 0);
});

test("tmdb-normalize 会让纪录片根下的已知动漫别名跨到动漫", async () => {
  const plan = await buildPlanAsync(
    [
      {
        source: "JOJO的奇妙冒险/Season 01/JoJo.No.Kimyou.Na.Bouken.S01E01.mkv",
        fid: "jojo-doc-root-1",
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "纪录片",
      tmdbQueryIntervalMs: 0,
      tmdbClient: createFakeTmdbClient({
        tvResults: {
          "JoJo's Bizarre Adventure": [
            {
              id: 111,
              name: "JOJO的奇妙冒险",
              original_name: "JoJo's Bizarre Adventure",
              first_air_date: "2012-10-06",
              popularity: 80,
            },
          ],
        },
      }),
    },
  );

  assert.equal(plan.reviews.length, 0);
  assert.equal(plan.moves.length, 1);
  assert.equal(plan.moves[0].category, "anime");
  assert.equal(
    plan.moves[0].targetPath,
    "动漫/JOJO的奇妙冒险/JOJO的奇妙冒险.S01/JOJO的奇妙冒险.S01E01.mkv",
  );
});

test("tmdb-normalize 保留纪录片根下普通电影纪录片路径", async () => {
  const plan = await buildPlanAsync(
    [
      {
        source: "Free.Solo.2018.mkv",
        fid: "free-solo-doc-1",
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "纪录片",
      tmdbQueryIntervalMs: 0,
      tmdbClient: createFakeTmdbClient({
        movieResults: {
          "Free Solo": [
            {
              id: 515042,
              title: "徒手攀岩",
              original_title: "Free Solo",
              release_date: "2018-08-31",
              popularity: 40,
            },
          ],
        },
      }),
    },
  );

  assert.equal(plan.reviews.length, 0);
  assert.equal(plan.moves.length, 1);
  assert.equal(plan.moves[0].targetPath, "纪录片/徒手攀岩.Free.Solo (2018)/徒手攀岩.Free.Solo.mkv");
});

test("tmdb-normalize 会把 JOJO Season 05 的安全方括号集号落到 S05E03", async () => {
  const tmdbClient = createFakeTmdbClient({
    tvResults: {
      "JoJo's Bizarre Adventure: Stardust Crusaders": [
        {
          id: 111,
          name: "JOJO的奇妙冒险",
          original_name: "JoJo's Bizarre Adventure",
          first_air_date: "2012-10-06",
          popularity: 80,
        },
      ],
    },
  });

  const plan = await buildPlanAsync(
    [
      {
        source: "JOJO/Season 05/[A.I.R.nesSub&TxxZ][JoJo's_Bizarre_Adventure_SC][03][BDRIP][1920x1080][HEVC_Ma10P_DTSMA].mkv",
        fid: "jojo-s05-file-1",
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "动漫",
      tmdbClient,
      tmdbQueryIntervalMs: 0,
      llmResolverOptions: {
        apiKey: "",
      },
    },
  );

  assert.equal(plan.reviews.length, 0);
  assert.equal(plan.moves.length, 1);
  assert.ok(
    tmdbClient.calls.some((item) => item.query === "JoJo's Bizarre Adventure: Stardust Crusaders"),
  );
  assert.equal(plan.moves[0].season, 5);
  assert.equal(plan.moves[0].episode, 3);
  assert.equal(plan.moves[0].targetPath, "动漫/JOJO的奇妙冒险/JOJO的奇妙冒险.S05/JOJO的奇妙冒险.S05E03.mkv");
});

test("tmdb-normalize 会把 JOJO Creditless OP 放入附属资料保留区且不查询 TMDB", async () => {
  const tmdbClient = createFakeTmdbClient();

  const plan = await buildPlanAsync(
    [
      {
        source: "JOJO/Season 05/[LoliHouse] JoJo's Bizarre Adventure Golden Wind [Creditless OP1][WebRip 1080p].mkv",
        fid: "jojo-creditless-op-1",
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "动漫",
      tmdbClient,
      tmdbQueryIntervalMs: 0,
      llmResolverOptions: {
        apiKey: "",
      },
    },
  );

  assert.equal(tmdbClient.calls.length, 0);
  assert.equal(plan.reviews.length, 0);
  assert.equal(plan.deletes.length, 0);
  assert.equal(plan.moves.length, 1);
  assert.equal(plan.moves[0].source, "JOJO/Season 05/[LoliHouse] JoJo's Bizarre Adventure Golden Wind [Creditless OP1][WebRip 1080p].mkv");
  assert.equal(plan.moves[0].targetPath, "整理保留区/附属资料/JOJO/Season 05/[LoliHouse] JoJo's Bizarre Adventure Golden Wind [Creditless OP1][WebRip 1080p].mkv");
  assert.equal(plan.moves[0].matchSource, "delete-safety-rescue");
  assert.equal(plan.zeroReviewSummary.rescuedUnsafeDeleteCount, 1);
});

test("tmdb-normalize 会把 JOJO S02S03 的 flac rar 和 Music 目录当作非视频资源剥离", async () => {
  const tmdbClient = createFakeTmdbClient();

  const plan = await buildPlanAsync(
    [
      {
        source: "JOJO S02S03/[JOJO][25].flac",
        fid: "jojo-s02s03-flac-1",
      },
      {
        source: "JOJO S02S03/Music",
        cid: "jojo-s02s03-music-dir-1",
        isDir: true,
      },
      {
        source: "JOJO S02S03/Music/JOJO.Soundtrack.rar",
        fid: "jojo-s02s03-rar-1",
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "动漫",
      tmdbClient,
      tmdbQueryIntervalMs: 0,
      llmResolverOptions: {
        apiKey: "",
      },
    },
  );

  const deleteSourceSet = new Set(plan.deletes.map((item) => item.wrapperDir));

  assert.equal(tmdbClient.calls.length, 0);
  assert.equal(plan.moves.length, 0);
  assert.equal(plan.reviews.length, 0);
  assert.ok(deleteSourceSet.has("JOJO S02S03/[JOJO][25].flac"));
  assert.ok(deleteSourceSet.has("JOJO S02S03/Music/JOJO.Soundtrack.rar"));
  assert.ok(deleteSourceSet.has("JOJO S02S03/Music"));
  assert.ok(plan.moves.every((item) => !item.targetPath.startsWith("动漫/JOJO的奇妙冒险")));
});

test("tmdb-normalize 会把 JOJO 的 Creditless/PV 视频移入保留区，非视频附件仍剥离", async () => {
  const tmdbClient = createFakeTmdbClient();

  const plan = await buildPlanAsync(
    [
      {
        source: "JOJO/Season 05/[JOJO&UHA-WING&Kamigami][JoJo's Bizarre Adventure - Golden Wind][Creditless OP2][BDRIP 1920x1080][x264_DTS-HDMA].mkv",
        fid: "jojo-creditless-op2-1",
      },
      {
        source: "JOJO/Season 01/[A.I.R.nesSub&MYSUB][JoJo's_Bizarre_Adventure][SP][PV5][BDRIP][1080p][AVC_FLAC].mkv",
        fid: "jojo-pv5-1",
      },
      {
        source: "JOJO/Season 05/ASS.zip",
        fid: "jojo-ass-zip-1",
      },
      {
        source: "JOJO的奇妙冒险/[Kamigami] JoJo's Bizarre Adventure - Stone Ocean - Subtitles.zip",
        fid: "jojo-subtitles-zip-1",
      },
      {
        source: "JOJO的奇妙冒险/[Kamigami] JoJo's Bizarre Adventure - Stone Ocean - Fonts.zip",
        fid: "jojo-fonts-zip-1",
      },
      {
        source: "JOJO S02S03/[A.I.R.nesSub&TxxZ][JoJo's_Bizarre_Adventure_SC][01].md5",
        fid: "jojo-md5-1",
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "动漫",
      tmdbClient,
      tmdbQueryIntervalMs: 0,
      llmResolverOptions: {
        apiKey: "",
      },
    },
  );

  const deleteStrategyBySource = new Map(plan.deletes.map((item) => [item.wrapperDir, item.strategy]));
  const moveBySource = new Map(plan.moves.map((item) => [item.source, item]));

  assert.equal(tmdbClient.calls.length, 0);
  assert.equal(plan.reviews.length, 0);
  assert.equal(plan.moves.length, 2);
  assert.ok(
    moveBySource
      .get(
        "JOJO/Season 05/[JOJO&UHA-WING&Kamigami][JoJo's Bizarre Adventure - Golden Wind][Creditless OP2][BDRIP 1920x1080][x264_DTS-HDMA].mkv",
      )
      .targetPath.startsWith("整理保留区/附属资料/"),
  );
  assert.ok(
    moveBySource
      .get(
        "JOJO/Season 01/[A.I.R.nesSub&MYSUB][JoJo's_Bizarre_Adventure][SP][PV5][BDRIP][1080p][AVC_FLAC].mkv",
      )
      .targetPath.startsWith("整理保留区/附属资料/"),
  );
  assert.equal(deleteStrategyBySource.get("JOJO/Season 05/ASS.zip"), "sidecar-nonsub-delete");
  assert.equal(
    deleteStrategyBySource.get("JOJO的奇妙冒险/[Kamigami] JoJo's Bizarre Adventure - Stone Ocean - Subtitles.zip"),
    "sidecar-nonsub-delete",
  );
  assert.equal(
    deleteStrategyBySource.get("JOJO的奇妙冒险/[Kamigami] JoJo's Bizarre Adventure - Stone Ocean - Fonts.zip"),
    "sidecar-nonsub-delete",
  );
  assert.equal(
    deleteStrategyBySource.get("JOJO S02S03/[A.I.R.nesSub&TxxZ][JoJo's_Bizarre_Adventure_SC][01].md5"),
    "sidecar-nonsub-delete",
  );
});

test("tmdb-normalize 在 JOJO 根目录查询失败时会用组级 fallback 落到标准分集", async () => {
  const tmdbClient = createScriptedTmdbClient({
    tvScripts: {
      "JoJo's Bizarre Adventure: Stardust Crusaders": [createTmdbHttpError(504, "timeout")],
      "JoJo's Bizarre Adventure": [createTmdbHttpError(504, "timeout")],
      JOJO: [createTmdbHttpError(504, "timeout")],
      "JOJO的奇妙冒险": [createTmdbHttpError(504, "timeout")],
    },
  });

  const plan = await buildPlanAsync(
    [
      {
        source: "JOJO/Season 01/[A.I.R.nesSub&TxxZ][JoJo's_Bizarre_Adventure_SC][01][BDRIP][1920x1080][HEVC_Ma10P_DTSMA].mkv",
        fid: "jojo-fallback-file-1",
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "动漫",
      tmdbClient,
      tmdbQueryIntervalMs: 0,
      llmResolverOptions: {
        apiKey: "",
      },
    },
  );

  assert.equal(plan.reviews.length, 0);
  assert.equal(plan.moves.length, 1);
  assert.equal(plan.moves[0].matchSource, "llm-fallback");
  assert.equal(plan.moves[0].reason, "llm-fallback");
  assert.equal(plan.moves[0].targetPath, "动漫/JOJO的奇妙冒险/JOJO的奇妙冒险.S01/JOJO的奇妙冒险.S01E01.mkv");
});

test("tmdb-normalize 会把 Stone Ocean Part 2 的 hash 误判纠正为真实分集", async () => {
  const timeoutError = createTmdbHttpError(504, "timeout");
  const tmdbClient = createScriptedTmdbClient({
    tvScripts: {
      "JoJo Bizarre Adventure Stone Ocean": [timeoutError],
      "JoJo's Bizarre Adventure: Stone Ocean": [timeoutError],
      "JoJo's Bizarre Adventure": [timeoutError],
      "JOJO的奇妙冒险": [timeoutError],
    },
  });

  const plan = await buildPlanAsync(
    [
      {
        source: "JoJo No Kimyou Na Bouken Stone Ocean Part 2 ~ 12 [Multiple Subtitle]/[Erai-raws] JoJo no Kimyou na Bouken - Stone Ocean Part 2 - 06 [1080p][Multiple Subtitle][E433C33D].mkv",
        fid: "jojo-stone-ocean-part2-06",
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "动漫",
      tmdbClient,
      tmdbQueryIntervalMs: 0,
      llmResolverOptions: {
        apiKey: "",
      },
    },
  );

  assert.equal(plan.reviews.length, 0);
  assert.equal(plan.moves.length, 1);
  assert.equal(plan.moves[0].season, 1);
  assert.equal(plan.moves[0].episode, 6);
  assert.equal(plan.moves[0].canonicalTitleZh, "JOJO的奇妙冒险.石之海");
  assert.equal(plan.moves[0].matchSource, "llm-fallback");
  assert.equal(
    plan.moves[0].targetPath,
    "动漫/JOJO的奇妙冒险.石之海/JOJO的奇妙冒险.石之海.S01/JOJO的奇妙冒险.石之海.S01E06.mkv",
  );
});

test("tmdb-normalize 会把 Stone Ocean Part 2 01 到 12 固定落到石之海 S01 分集", async () => {
  const genericJojoResult = [
    {
      id: 45790,
      name: "JOJO的奇妙冒险",
      original_name: "JoJo's Bizarre Adventure",
      first_air_date: "2012-10-06",
      popularity: 80,
    },
  ];
  const timeoutError = createTmdbHttpError(504, "timeout");
  const tmdbClient = createScriptedTmdbClient({
    tvScripts: {
      "JoJo Bizarre Adventure Stone Ocean": [timeoutError],
      "JoJo's Bizarre Adventure: Stone Ocean": [timeoutError],
      "JoJo's Bizarre Adventure": [genericJojoResult],
      "JOJO的奇妙冒险": [genericJojoResult],
    },
  });

  const entries = Array.from({ length: 12 }, (_, index) => {
    const episode = String(index + 1).padStart(2, "0");
    const hash = [
      "C33D09A0",
      "F4F9FAE8",
      "4EE4C05D",
      "FF3444FE",
      "F4345914",
      "E433C33D",
      "806B801C",
      "4DEFC598",
      "D6E15739",
      "3853F872",
      "3CAF2F04",
      "60681325",
    ][index];

    return {
      source: `JoJo No Kimyou Na Bouken Stone Ocean Part 2 ~ 12 [Multiple Subtitle]/[Erai-raws] JoJo no Kimyou na Bouken - Stone Ocean Part 2 - ${episode} [1080p][Multiple Subtitle][${hash}].mkv`,
      fid: `jojo-stone-ocean-part2-${episode}`,
    };
  });

  const plan = await buildPlanAsync(entries, {
    mode: "tmdb-normalize",
    rootPath: "动漫",
    tmdbClient,
    tmdbQueryIntervalMs: 0,
    llmResolverOptions: {
      apiKey: "",
    },
  });

  const moveByEpisode = new Map(plan.moves.map((item) => [item.episode, item]));

  assert.equal(plan.reviews.length, 0);
  assert.equal(plan.moves.length, 12);
  assert.equal(plan.summary.mergeConflictReviewCount, 0);
  assert.equal(plan.summary.mergeConflictResolvedCount, 0);
  assert.equal(moveByEpisode.get(1).canonicalTitleZh, "JOJO的奇妙冒险.石之海");
  assert.equal(
    moveByEpisode.get(1).targetPath,
    "动漫/JOJO的奇妙冒险.石之海/JOJO的奇妙冒险.石之海.S01/JOJO的奇妙冒险.石之海.S01E01.mkv",
  );
  assert.equal(
    moveByEpisode.get(6).targetPath,
    "动漫/JOJO的奇妙冒险.石之海/JOJO的奇妙冒险.石之海.S01/JOJO的奇妙冒险.石之海.S01E06.mkv",
  );
  assert.equal(
    moveByEpisode.get(12).targetPath,
    "动漫/JOJO的奇妙冒险.石之海/JOJO的奇妙冒险.石之海.S01/JOJO的奇妙冒险.石之海.S01E12.mkv",
  );
});

test("tmdb-normalize 在 Nanatsu No Taizai 查询超时时会把正片安全回填到七大罪", async () => {
  const timeoutError = createTmdbHttpError(504, "timeout");
  const tmdbClient = createScriptedTmdbClient({
    tvScripts: {
      "七大罪": [timeoutError],
      "The Seven Deadly Sins": [timeoutError],
      "Nanatsu no Taizai": [timeoutError],
      "Nanatsu No Taizai": [timeoutError],
    },
  });

  const plan = await buildPlanAsync(
    [
      {
        source: "Nanatsu No Taizai/Nanatsu no Taizai 24 [BD 1920x1080 HEVC 10bit CHS].mkv",
        fid: "nanatsu-24",
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "动漫",
      tmdbClient,
      tmdbQueryIntervalMs: 0,
      llmResolver: async () => ({
        resolved: true,
        canonicalTitleZh: "七大罪",
        canonicalTitleEn: "The Seven Deadly Sins",
        confidence: 0.9,
        reason: "llm-fallback",
      }),
    },
  );

  assert.equal(plan.reviews.length, 0);
  assert.equal(plan.moves.length, 1);
  assert.equal(plan.moves[0].season, 1);
  assert.equal(plan.moves[0].episode, 24);
  assert.equal(plan.moves[0].canonicalTitleZh, "七大罪");
  assert.equal(plan.moves[0].matchSource, "llm-fallback");
  assert.equal(plan.moves[0].targetPath, "动漫/七大罪/七大罪.S01/七大罪.S01E24.mkv");
});

test("tmdb-normalize 会让四骑士优先命中独立 TMDB 标题且不再回落到七大罪", async () => {
  const fourKnightsResult = [
    {
      id: 218843,
      name: "七大罪：默示录的四骑士",
      original_name: "七つの大罪 黙示録の四騎士",
      first_air_date: "2023-10-08",
      popularity: 19,
    },
  ];
  const tmdbClient = createFakeTmdbClient({
    tvResults: {
      "七大罪：默示录的四骑士": fourKnightsResult,
      "The Seven Deadly Sins: Four Knights of the Apocalypse": fourKnightsResult,
      "Four Knights of the Apocalypse": fourKnightsResult,
    },
  });

  const source =
    "七大罪：默示录的四骑士 [全24集][简繁英字幕]/Season 01/The.Seven.Deadly.Sins.Four.Knights.of.the.Apocalypse.S01E01.2023.1080p.NF.WEB-DL.x264.DDP2.0-ZeroTV.mkv";
  const plan = await buildPlanAsync(
    [
      {
        source,
        fid: "nanatsu-four-knights-01",
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "动漫",
      tmdbClient,
      tmdbQueryIntervalMs: 0,
      zeroReviewFinalizer: false,
    },
  );

  assert.equal(plan.reviews.length, 0);
  assert.equal(plan.moves.length, 1);
  assert.equal(plan.moves[0].canonicalTitleZh, "七大罪：默示录的四骑士");
  assert.match(plan.moves[0].targetPath, /^动漫\/七大罪：默示录的四骑士\//u);
  assert.ok(!plan.moves[0].targetPath.startsWith("动漫/七大罪/"));
  assert.ok(tmdbClient.calls.some((item) => item.query === "七大罪：默示录的四骑士"));
  assert.ok(!tmdbClient.calls.some((item) => item.query === "七大罪"));
  assert.ok(!tmdbClient.calls.some((item) => item.query === "The Seven Deadly Sins"));
});

test("tmdb-normalize 会让 Nanatsu 原作和四骑士同批输入时落到不同 targetPath 且不再 collision", async () => {
  const nanatsuResult = [
    {
      id: 62104,
      name: "七大罪",
      original_name: "The Seven Deadly Sins",
      first_air_date: "2014-10-05",
      popularity: 58,
    },
  ];
  const fourKnightsResult = [
    {
      id: 218843,
      name: "七大罪：默示录的四骑士",
      original_name: "七つの大罪 黙示録の四騎士",
      first_air_date: "2023-10-08",
      popularity: 19,
    },
  ];
  const tmdbClient = createFakeTmdbClient({
    tvResults: {
      "七大罪": nanatsuResult,
      "The Seven Deadly Sins": nanatsuResult,
      "Nanatsu no Taizai": nanatsuResult,
      "七大罪：默示录的四骑士": fourKnightsResult,
      "The Seven Deadly Sins: Four Knights of the Apocalypse": fourKnightsResult,
      "Four Knights of the Apocalypse": fourKnightsResult,
    },
  });

  const originalSource = "Nanatsu No Taizai/Nanatsu no Taizai 01 [BD 1920x1080 HEVC 10bit CHS].mkv";
  const fourKnightsSource =
    "七大罪：默示录的四骑士 [全24集][简繁英字幕]/Season 01/The.Seven.Deadly.Sins.Four.Knights.of.the.Apocalypse.S01E01.2023.1080p.NF.WEB-DL.x264.DDP2.0-ZeroTV.mkv";
  const plan = await buildPlanAsync(
    [
      {
        source: originalSource,
        fid: "nanatsu-original-01",
      },
      {
        source: fourKnightsSource,
        fid: "nanatsu-four-knights-01",
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "动漫",
      tmdbClient,
      tmdbQueryIntervalMs: 0,
      zeroReviewFinalizer: false,
    },
  );

  const moveBySource = new Map(plan.moves.map((item) => [item.source, item]));

  assert.equal(plan.reviews.length, 0);
  assert.equal(plan.moves.length, 2);
  assert.equal(plan.collisions.length, 0);
  assert.equal(plan.summary.collisionCount, 0);
  assert.equal(
    moveBySource.get(originalSource).targetPath,
    "动漫/七大罪/七大罪.S01/七大罪.S01E01.mkv",
  );
  assert.match(moveBySource.get(fourKnightsSource).targetPath, /^动漫\/七大罪：默示录的四骑士\//u);
  assert.notEqual(
    moveBySource.get(originalSource).targetPath,
    moveBySource.get(fourKnightsSource).targetPath,
  );
});

test("tmdb-normalize 会让无职转生 S2 方括号包裹目录落到正确分集并避免 collision", async () => {
  const tmdbClient = createFakeTmdbClient({
    tvResults: {
      无职转生: [
        {
          id: 94664,
          name: "无职转生",
          original_name: "Mushoku Tensei",
          first_air_date: "2021-01-11",
          popularity: 85,
        },
      ],
    },
    tvDetails: {
      94664: {
        name: "无职转生～到了异世界就拿出真本事～",
        original_name: "Mushoku Tensei: Jobless Reincarnation",
      },
    },
  });

  const plan = await buildPlanAsync(
    [
      {
        source:
          "无职转生/Season 02/[KitaujiSub] Mushoku Tensei - S2 [01][WebRip][HEVC_AAC][CHS&CHT].mkv/[KitaujiSub] Mushoku Tensei - S2 [01][WebRip][HEVC_AAC][CHS&CHT].mkv",
        fid: "mushoku-s02-file-1",
      },
      {
        source:
          "无职转生/Season 02/[KitaujiSub] Mushoku Tensei - S2 [02][WebRip][HEVC_AAC][CHS&CHT].mkv/[KitaujiSub] Mushoku Tensei - S2 [02][WebRip][HEVC_AAC][CHS&CHT].mkv",
        fid: "mushoku-s02-file-2",
      },
      {
        source:
          "无职转生/Season 02/[KitaujiSub] Mushoku Tensei - S2 [03][WebRip][HEVC_AAC][CHS&CHT].mkv/[KitaujiSub] Mushoku Tensei - S2 [03][WebRip][HEVC_AAC][CHS&CHT].mkv",
        fid: "mushoku-s02-file-3",
      },
      {
        source:
          "无职转生/Season 02/[KitaujiSub] Mushoku Tensei - S2 [07][WebRip][HEVC_AAC][CHS&CHT].mkv/[KitaujiSub] Mushoku Tensei - S2 [07][WebRip][HEVC_AAC][CHS&CHT].mkv",
        fid: "mushoku-s02-file-4",
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "动漫",
      tmdbClient,
      tmdbQueryIntervalMs: 0,
      llmResolverOptions: {
        apiKey: "",
      },
    },
  );

  const moveBySource = new Map(plan.moves.map((item) => [item.source, item]));

  assert.equal(plan.reviews.length, 0);
  assert.equal(plan.collisions.length, 0);
  assert.equal(plan.summary.collisionCount, 0);
  assert.equal(
    moveBySource.get(
      "无职转生/Season 02/[KitaujiSub] Mushoku Tensei - S2 [01][WebRip][HEVC_AAC][CHS&CHT].mkv/[KitaujiSub] Mushoku Tensei - S2 [01][WebRip][HEVC_AAC][CHS&CHT].mkv",
    ).targetPath,
    "动漫/无职转生～到了异世界就拿出真本事～/无职转生～到了异世界就拿出真本事～.S02/无职转生～到了异世界就拿出真本事～.S02E01.mkv",
  );
  assert.equal(
    moveBySource.get(
      "无职转生/Season 02/[KitaujiSub] Mushoku Tensei - S2 [02][WebRip][HEVC_AAC][CHS&CHT].mkv/[KitaujiSub] Mushoku Tensei - S2 [02][WebRip][HEVC_AAC][CHS&CHT].mkv",
    ).targetPath,
    "动漫/无职转生～到了异世界就拿出真本事～/无职转生～到了异世界就拿出真本事～.S02/无职转生～到了异世界就拿出真本事～.S02E02.mkv",
  );
  assert.equal(
    moveBySource.get(
      "无职转生/Season 02/[KitaujiSub] Mushoku Tensei - S2 [03][WebRip][HEVC_AAC][CHS&CHT].mkv/[KitaujiSub] Mushoku Tensei - S2 [03][WebRip][HEVC_AAC][CHS&CHT].mkv",
    ).targetPath,
    "动漫/无职转生～到了异世界就拿出真本事～/无职转生～到了异世界就拿出真本事～.S02/无职转生～到了异世界就拿出真本事～.S02E03.mkv",
  );
  assert.equal(
    moveBySource.get(
      "无职转生/Season 02/[KitaujiSub] Mushoku Tensei - S2 [07][WebRip][HEVC_AAC][CHS&CHT].mkv/[KitaujiSub] Mushoku Tensei - S2 [07][WebRip][HEVC_AAC][CHS&CHT].mkv",
    ).targetPath,
    "动漫/无职转生～到了异世界就拿出真本事～/无职转生～到了异世界就拿出真本事～.S02/无职转生～到了异世界就拿出真本事～.S02E07.mkv",
  );
});

test("tmdb-normalize 不会把无职转生 S2 [00] 在 fallback 中误回退成 S02E02", async () => {
  const longResult = [
    {
      id: 94664,
      name: "无职转生～到了异世界就拿出真本事～",
      original_name: "Mushoku Tensei: Jobless Reincarnation",
      first_air_date: "2021-01-11",
      popularity: 85,
    },
  ];
  const tmdbClient = createFakeTmdbClient({
    tvResults: {
      无职转生: longResult,
      "KitaujiSub Mushoku Tensei": longResult,
    },
  });

  const plan = await buildPlanAsync(
    [
      {
        source:
          "无职转生/Season 02/[KitaujiSub] Mushoku Tensei - S2 [00][WebRip][HEVC_AAC][CHS&CHT].mkv/[KitaujiSub] Mushoku Tensei - S2 [00][WebRip][HEVC_AAC][CHS&CHT].mkv",
        fid: "mushoku-s02-00",
      },
      {
        source:
          "无职转生/Season 02/[KitaujiSub] Mushoku Tensei - S2 [02][WebRip][HEVC_AAC][CHS&CHT].mkv/[KitaujiSub] Mushoku Tensei - S2 [02][WebRip][HEVC_AAC][CHS&CHT].mkv",
        fid: "mushoku-s02-02",
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "动漫",
      tmdbClient,
      tmdbQueryIntervalMs: 0,
      zeroReviewFinalizer: false,
    },
  );

  assert.equal(plan.summary.collisionCount, 0);
  assert.equal(plan.collisions.length, 0);
  assert.equal(plan.moves.length, 1);
  assert.equal(plan.reviews.length, 1);
  assert.equal(
    plan.moves[0].targetPath,
    "动漫/无职转生～到了异世界就拿出真本事～/无职转生～到了异世界就拿出真本事～.S02/无职转生～到了异世界就拿出真本事～.S02E02.mkv",
  );
  assert.equal(
    plan.reviews[0].source,
    "无职转生/Season 02/[KitaujiSub] Mushoku Tensei - S2 [00][WebRip][HEVC_AAC][CHS&CHT].mkv/[KitaujiSub] Mushoku Tensei - S2 [00][WebRip][HEVC_AAC][CHS&CHT].mkv",
  );
  assert.notEqual(
    plan.reviews[0].targetPath,
    "动漫/无职转生～到了异世界就拿出真本事～/无职转生～到了异世界就拿出真本事～.S02/无职转生～到了异世界就拿出真本事～.S02E02.mkv",
  );
});

test("tmdb-normalize 对人工确认的 Crazy Love 和沙丘 alias 自动命中指定 TMDB", async () => {
  const tmdbClient = createFakeTmdbClient({
    movieResults: {
      蜜桃成熟时: [
        {
          id: 79871,
          title: "蜜桃成熟时",
          original_title: "Crazy Love",
          original_language: "zh",
          release_date: "1993-04-17",
          popularity: 30,
        },
      ],
      "Crazy Love": [
        {
          id: 79871,
          title: "蜜桃成熟时",
          original_title: "Crazy Love",
          original_language: "zh",
          release_date: "1993-04-17",
          popularity: 30,
        },
      ],
      Dune: [
        {
          id: 438631,
          title: "沙丘",
          original_title: "Dune",
          original_language: "en",
          release_date: "2021-09-15",
          popularity: 90,
        },
      ],
      沙丘: [
        {
          id: 438631,
          title: "沙丘",
          original_title: "Dune",
          original_language: "en",
          release_date: "2021-09-15",
          popularity: 90,
        },
      ],
    },
  });

  const plan = await buildPlanAsync(
    [
      { source: "Crazy Love HDMA5 1 (1993)", cid: "movie-risk-1", isDir: true },
      { source: "[4K HDR][沙丘] [中英外挂][FLAC][MKV]", cid: "movie-risk-2", isDir: true },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "电影",
      tmdbQueryIntervalMs: 0,
      tmdbClient,
    },
  );

  const moveBySource = new Map(plan.moves.map((item) => [item.source, item]));

  assert.equal(plan.reviews.length, 0);
  assert.equal(plan.moves.length, 2);
  assert.equal(
    moveBySource.get("Crazy Love HDMA5 1 (1993)").targetPath,
    "电影/蜜桃成熟时.Crazy.Love (1993)",
  );
  assert.equal(moveBySource.get("Crazy Love HDMA5 1 (1993)").tmdbId, 79871);
  assert.equal(
    moveBySource.get("[4K HDR][沙丘] [中英外挂][FLAC][MKV]").targetPath,
    "电影/沙丘.Dune (2021)",
  );
  assert.equal(moveBySource.get("[4K HDR][沙丘] [中英外挂][FLAC][MKV]").tmdbId, 438631);
  assert.ok(tmdbClient.calls.some((item) => item.query === "蜜桃成熟时"));
  assert.ok(tmdbClient.calls.some((item) => item.query === "Dune"));
});

test("tmdb-normalize 同 TMDB 身份同目标冲突会把有 cid 落败目录放进 delete", async () => {
  const plan = await buildPlanAsync(
    [
      {
        source: "[BD ]西虹 Hello Mr Billionaire HD1080P 国语中字 (2018)",
        cid: "hello-billionaire-1",
        isDir: true,
      },
      {
        source: "Hello Mr Billionaire CHINESE (2018)",
        cid: "hello-billionaire-2",
        isDir: true,
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "电影",
      tmdbQueryIntervalMs: 0,
      zeroReviewFinalizer: false,
      tmdbClient: createFakeTmdbClient({
        movieResults: {
          "Hello Mr. Billionaire": [
            {
              id: 538331,
              title: "西虹市首富",
              original_title: "西虹市首富",
              original_language: "zh",
              release_date: "2018-07-27",
              popularity: 20,
            },
          ],
        },
        movieDetails: {
          538331: {
            title: "西虹市首富",
            original_title: "西虹市首富",
            original_language: "zh",
            alternative_titles: {
              titles: [{ iso_3166_1: "US", title: "Hello Mr. Billionaire", type: "" }],
            },
          },
        },
      }),
    },
  );

  assert.equal(plan.moves.length, 1);
  assert.equal(plan.moves[0].source, "[BD ]西虹 Hello Mr Billionaire HD1080P 国语中字 (2018)");
  assert.equal(plan.moves[0].targetPath, "电影/西虹市首富.Hello.Mr.Billionaire (2018)");
  assert.equal(plan.reviews.length, 0);
  assert.equal(plan.collisions.length, 0);
  assert.equal(plan.summary.collisionCount, 0);
  assert.equal(plan.deletes.length, 1);
  assert.equal(plan.deletes[0].wrapperDir, "Hello Mr Billionaire CHINESE (2018)");
  assert.equal(plan.deletes[0].wrapperDirCid, "hello-billionaire-2");
  assert.equal(plan.deletes[0].moveCount, 0);
  assert.equal(plan.deletes[0].strategy, "duplicate-same-tmdb-target-delete");
  assert.equal(plan.summary.deleteStrategyCounts["duplicate-same-tmdb-target-delete"], 1);
});

test("tmdb-normalize 同目标冲突落败目录缺少 cid 时仍保留 collision review", async () => {
  const plan = await buildPlanAsync(
    [
      {
        source: "[BD ]西虹 Hello Mr Billionaire HD1080P 国语中字 (2018)",
        cid: "hello-billionaire-1",
        isDir: true,
      },
      {
        source: "Hello Mr Billionaire CHINESE (2018)",
        isDir: true,
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "电影",
      tmdbQueryIntervalMs: 0,
      zeroReviewFinalizer: false,
      tmdbClient: createFakeTmdbClient({
        movieResults: {
          "Hello Mr. Billionaire": [
            {
              id: 538331,
              title: "西虹市首富",
              original_title: "西虹市首富",
              original_language: "zh",
              release_date: "2018-07-27",
              popularity: 20,
            },
          ],
        },
        movieDetails: {
          538331: {
            title: "西虹市首富",
            original_title: "西虹市首富",
            original_language: "zh",
            alternative_titles: {
              titles: [{ iso_3166_1: "US", title: "Hello Mr. Billionaire", type: "" }],
            },
          },
        },
      }),
    },
  );

  assert.equal(plan.moves.length, 1);
  assert.equal(plan.reviews.length, 1);
  assert.equal(plan.reviews[0].source, "Hello Mr Billionaire CHINESE (2018)");
  assert.equal(plan.reviews[0].reviewReason, "collision");
  assert.equal(plan.collisions.length, 1);
  assert.equal(plan.summary.collisionCount, 1);
  assert.equal(plan.deletes.length, 0);
});

test("tmdb-normalize 不会把未拍板的 Dune 同目标目录扩大发到 duplicate delete", async () => {
  const plan = await buildPlanAsync(
    [
      {
        source: "[4K HDR][沙丘] [中英外挂][FLAC][MKV]",
        cid: "dune-4k",
        isDir: true,
      },
      {
        source: "[BD ]Dune 正式版 HD1080P 中英双字 mp4 (2021)",
        cid: "dune-bd",
        isDir: true,
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "电影",
      tmdbQueryIntervalMs: 0,
      tmdbClient: createFakeTmdbClient({
        movieResults: {
          Dune: [
            {
              id: 438631,
              title: "沙丘",
              original_title: "Dune",
              original_language: "en",
              release_date: "2021-09-15",
              popularity: 90,
            },
          ],
        },
      }),
    },
  );

  assert.equal(plan.moves.length, 1);
  assert.equal(plan.moves[0].source, "[4K HDR][沙丘] [中英外挂][FLAC][MKV]");
  assert.equal(plan.moves[0].targetPath, "电影/沙丘.Dune (2021)");
  assert.equal(plan.reviews.length, 0);
  assert.equal(plan.collisions.length, 0);
  assert.equal(plan.deletes.length, 0);
  assert.equal(plan.summary.deleteStrategyCounts["duplicate-same-tmdb-target-delete"] ?? 0, 0);
});

test("tmdb-normalize 命中剧集后会输出中文剧名和季集路径", async () => {
  const plan = await buildPlanAsync(
    [
      {
        source: "The.Last.of.Us.S01E01.1080p.WEB-DL.mkv",
        fid: "tv-1",
      },
    ],
    {
      mode: "tmdb-normalize",
      zeroReviewFinalizer: false,
      tmdbClient: createFakeTmdbClient({
        tvResults: {
          "The Last of Us": [
            {
              id: 100088,
              name: "最后生还者",
              original_name: "The Last of Us",
              first_air_date: "2023-01-15",
              popularity: 80,
            },
          ],
        },
      }),
    },
  );

  assert.equal(plan.moves.length, 1);
  assert.equal(plan.moves[0].category, "series");
  assert.equal(plan.moves[0].targetDir, "剧集/最后生还者/最后生还者.S01");
  assert.equal(plan.moves[0].targetName, "最后生还者.S01E01.mkv");
});

test("tmdb-normalize 在剧集根目录下会优先按 tv 处理顶层剧名目录", async () => {
  const tmdbClient = createFakeTmdbClient({
    tvResults: {
      "黑袍纠察队 The Boys": [
        {
          id: 76479,
          name: "黑袍纠察队",
          original_name: "The Boys",
          first_air_date: "2019-07-25",
          popularity: 90,
        },
      ],
    },
  });

  const plan = await buildPlanAsync(
    [
      {
        source: "黑袍纠察队 The Boys",
        cid: "tv-dir-1",
        isDir: true,
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "剧集",
      tmdbClient,
      zeroReviewFinalizer: false,
    },
  );

  assert.equal(tmdbClient.calls[0].type, "tv");
  assert.equal(plan.moves.length, 1);
  assert.equal(plan.moves[0].targetDir, "剧集/黑袍纠察队");
  assert.equal(plan.moves[0].targetPath, "剧集/黑袍纠察队");
});

test("tmdb-normalize 会用父目录标题标准化 Season 目录", async () => {
  const tmdbClient = createFakeTmdbClient({
    tvResults: {
      "洛基 Loki": [
        {
          id: 84958,
          name: "洛基",
          original_name: "Loki",
          first_air_date: "2021-06-09",
          popularity: 80,
        },
      ],
    },
  });

  const plan = await buildPlanAsync(
    [
      {
        source: "洛基 Loki/Season 01",
        cid: "season-dir-1",
        isDir: true,
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "剧集",
      tmdbClient,
    },
  );

  assert.equal(plan.moves.length, 1);
  assert.equal(plan.reviews.length, 0);
  assert.equal(plan.moves[0].targetDir, "剧集/洛基/洛基.S01");
  assert.equal(plan.moves[0].targetPath, "剧集/洛基/洛基.S01");
});

test("tmdb-normalize 会把无法挂靠的视频字幕直接放进 deletes，不发 TMDB 查询", async () => {
  const tmdbClient = createFakeTmdbClient();

  const plan = await buildPlanAsync(
    [
      {
        source: "WandaVision TOMMY/Season 01/WandaVision.S01E01.简体&英文.ass",
        fid: "sidecar-1",
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "剧集",
      tmdbClient,
    },
  );

  assert.equal(tmdbClient.calls.length, 0);
  assert.equal(plan.moves.length, 0);
  assert.equal(plan.reviews.length, 0);
  assert.deepEqual(plan.deletes.map((item) => item.wrapperDir), [
    "WandaVision TOMMY/Season 01/WandaVision.S01E01.简体&英文.ass",
  ]);
  assert.equal(plan.summary.deleteStrategyCounts["subtitle-unmatched-delete"] ?? 0, 1);
});

test("tmdb-normalize 不会把包含中文字幕的剧集目录误判成 sidecar 目录", async () => {
  const tmdbClient = createFakeTmdbClient({
    tvResults: {
      "仙剑奇侠传[全34集][国语配音+中文字幕] Chinese Paladin": [
        {
          id: 43761,
          name: "仙剑奇侠传",
          original_name: "Chinese Paladin",
          first_air_date: "2005-01-24",
          popularity: 40,
        },
      ],
    },
  });

  const plan = await buildPlanAsync(
    [
      {
        source: "仙剑奇侠传[全34集][国语配音+中文字幕] Chinese Paladin",
        cid: "show-dir-1",
        isDir: true,
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "剧集",
      tmdbClient,
    },
  );

  assert.equal(tmdbClient.calls[0].type, "tv");
  assert.equal(plan.reviews.filter((item) => item.reviewReason === "nested-sidecar-dir").length, 0);
  assert.equal(plan.moves.length + plan.reviews.length, 1);
});

test("tmdb-normalize 会把目录名像视频文件的空包裹目录直接清理，不再落 nested-sidecar-dir", async () => {
  const tmdbClient = createFakeTmdbClient();

  const plan = await buildPlanAsync(
    [
      {
        source: "葬送的芙莉莲/[ANi] 葬送的芙莉蓮 - 01 [1080P][Baha][WEB-DL][AAC AVC][CHT].mp4",
        cid: "frieren-empty-wrapper-1",
        isDir: true,
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "动漫",
      tmdbClient,
    },
  );

  assert.equal(tmdbClient.calls.length, 0);
  assert.equal(plan.moves.length, 0);
  assert.equal(plan.reviews.length, 0);
  assert.deepEqual(plan.deletes, [
    {
      wrapperDir: "葬送的芙莉莲/[ANi] 葬送的芙莉蓮 - 01 [1080P][Baha][WEB-DL][AAC AVC][CHT].mp4",
      wrapperDirCid: "frieren-empty-wrapper-1",
      moveCount: 0,
      reason: "目录内字幕/附件已迁移或删除，清理 sidecar 目录",
      strategy: "sidecar-dir",
    },
  ]);
});

test("tmdb-normalize 会把同级已有正片的空单集目录当作 helper dir 删除", async () => {
  const tmdbClient = createFakeTmdbClient({
    tvResults: {
      鬼灭之刃: [
        {
          id: 85937,
          name: "鬼灭之刃",
          original_name: "鬼滅の刃",
          original_language: "ja",
          first_air_date: "2019-04-06",
          popularity: 85,
        },
      ],
    },
  });

  const plan = await buildPlanAsync(
    [
      {
        source: "鬼灭之刃/鬼灭之刃.S01/鬼灭之刃.S01E55.mp4",
        fid: "kimetsu-video-55",
      },
      {
        source: "鬼灭之刃/鬼灭之刃.S01/鬼灭之刃.S01E55",
        cid: "kimetsu-empty-dir-55",
        isDir: true,
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "动漫",
      tmdbClient,
    },
  );

  assert.equal(plan.reviews.length, 0);
  assert.equal(plan.moves.length, 0);
  assert.equal(plan.summary.moveCount, 0);
  assert.deepEqual(plan.deletes, [
    {
      wrapperDir: "鬼灭之刃/鬼灭之刃.S01/鬼灭之刃.S01E55",
      wrapperDirCid: "kimetsu-empty-dir-55",
      moveCount: 0,
      reason: "目录内字幕/附件已迁移或删除，清理 sidecar 目录",
      strategy: "sidecar-dir",
    },
  ]);
});

test("tmdb-normalize 会优先命中本地 canonical override，而不是继续进入 tmdb-miss", async () => {
  const tmdbClient = createFakeTmdbClient();

  const plan = await buildPlanAsync(
    [
      {
        source: "進擊的巨人",
        cid: "aot-root-1",
        isDir: true,
      },
      {
        source: "進擊的巨人/進擊的巨人.S01",
        cid: "aot-season-1",
        isDir: true,
      },
      {
        source: "進擊的巨人/進擊的巨人.S01/進擊的巨人.S01E01.mp4",
        fid: "aot-episode-1",
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "动漫",
      tmdbClient,
      cleanupOverrides: {
        noiseKeywords: [],
        canonicalTitleOverrides: {
          "進擊的巨人::進擊的巨人": {
            sourceRoot: "進擊的巨人",
            sourceTitle: "進擊的巨人",
            canonicalTitleZh: "进击的巨人",
            canonicalTitleEn: "Attack on Titan",
            tmdbType: "tv",
            tmdbId: 1429,
          },
        },
      },
    },
  );

  const moveBySource = new Map(plan.moves.map((item) => [item.source, item]));

  assert.equal(tmdbClient.calls.length, 0);
  assert.equal(plan.reviews.length, 0);
  assert.equal(plan.moves.length, 3);
  assert.ok(plan.moves.every((item) => item.matchSource === "local-canonical-override"));
  assert.equal(moveBySource.get("進擊的巨人").targetPath, "动漫/进击的巨人");
  assert.equal(
    moveBySource.get("進擊的巨人/進擊的巨人.S01").targetPath,
    "动漫/进击的巨人/进击的巨人.S01",
  );
  assert.equal(
    moveBySource.get("進擊的巨人/進擊的巨人.S01/進擊的巨人.S01E01.mp4").targetPath,
    "动漫/进击的巨人/进击的巨人.S01/进击的巨人.S01E01.mp4",
  );
});

test("tmdb-normalize 会把广告附件直接放进 deletes，不发 TMDB 查询", async () => {
  const tmdbClient = createFakeTmdbClient();

  const plan = await buildPlanAsync(
    [
      {
        source: "辐射/Season 02/Downloaded From UIndex.txt",
        fid: "txt-1",
      },
      {
        source: "辐射/Season 02/官方Telegram交流群@bde4_com.url",
        fid: "url-1",
      },
      {
        source: "辐射/Season 02/5000T实时同步更新各类资源总链接文档.docx",
        fid: "docx-1",
      },
      {
        source: "辐射/Season 02/更多请关注公众号.png",
        fid: "png-1",
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "剧集",
      tmdbClient,
    },
  );

  assert.equal(tmdbClient.calls.length, 0);
  assert.equal(plan.moves.length, 0);
  assert.equal(plan.reviews.length, 0);
  assert.deepEqual(
    plan.deletes.map((item) => item.wrapperDir).sort(),
    [
      "辐射/Season 02/5000T实时同步更新各类资源总链接文档.docx",
      "辐射/Season 02/Downloaded From UIndex.txt",
      "辐射/Season 02/官方Telegram交流群@bde4_com.url",
      "辐射/Season 02/更多请关注公众号.png",
    ],
  );
});

test("tmdb-normalize 会把剧集目录里的广告视频文件直接放进 deletes，不发 TMDB 查询", async () => {
  const tmdbClient = createFakeTmdbClient();

  const plan = await buildPlanAsync(
    [
      {
        source:
          "三国演义[全84集][国语配音+中文字幕] The Romance of Three Kingdoms/Season 01/【更多高清剧集下载请访问 www.BPHDTV.com】【更多剧集打包下载请访问 www.BPHDTV.com】.mkv",
        fid: "series-ad-video-1",
      },
      {
        source:
          "三国演义[全84集][国语配音+中文字幕] The Romance of Three Kingdoms/Season 01/【更多电视剧集下载请访问 www.BPHDTV.com】【更多剧集打包下载请访问 www.BPHDTV.com】.MKV",
        fid: "series-ad-video-2",
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "剧集",
      tmdbClient,
    },
  );

  assert.equal(tmdbClient.calls.length, 0);
  assert.equal(plan.moves.length, 0);
  assert.equal(plan.reviews.length, 0);
  assert.deepEqual(
    plan.deletes.map((item) => item.wrapperDir).sort(),
    [
      "三国演义[全84集][国语配音+中文字幕] The Romance of Three Kingdoms/Season 01/【更多电视剧集下载请访问 www.BPHDTV.com】【更多剧集打包下载请访问 www.BPHDTV.com】.MKV",
      "三国演义[全84集][国语配音+中文字幕] The Romance of Three Kingdoms/Season 01/【更多高清剧集下载请访问 www.BPHDTV.com】【更多剧集打包下载请访问 www.BPHDTV.com】.mkv",
    ],
  );
});

test("tmdb-normalize 会自动拍平单集包裹目录，并让字幕跟随主视频迁移", async () => {
  const tmdbClient = createFakeTmdbClient({
    tvResults: {
      "Loki": [
        {
          id: 84958,
          name: "洛基",
          original_name: "Loki",
          first_air_date: "2021-06-09",
          popularity: 80,
        },
      ],
      "洛基 Loki": [
        {
          id: 84958,
          name: "洛基",
          original_name: "Loki",
          first_air_date: "2021-06-09",
          popularity: 80,
        },
      ],
    },
  });

  const plan = await buildPlanAsync(
    [
      {
        source: "洛基 Loki/Season 01/Subs/Loki.S01E02.1080p.WEBRip.x265-RARBG",
        cid: "wrapper-dir-1",
        isDir: true,
      },
      {
        source:
          "洛基 Loki/Season 01/Subs/Loki.S01E02.1080p.WEBRip.x265-RARBG/Loki.S01E02.1080p.WEBRip.x265-RARBG.mkv",
        fid: "wrapper-file-1",
      },
      {
        source:
          "洛基 Loki/Season 01/Subs/Loki.S01E02.1080p.WEBRip.x265-RARBG/Loki.S01E02.1080p.WEBRip.x265-RARBG.zh.ass",
        fid: "wrapper-file-2",
      },
      {
        source:
          "洛基 Loki/Season 01/Subs/Loki.S01E02.1080p.WEBRip.x265-RARBG/最新域名及域名找回.txt",
        fid: "wrapper-file-3",
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "剧集",
      tmdbClient,
    },
  );

  assert.equal(plan.reviews.length, 0);
  assert.equal(plan.collisions.length, 0);
  assert.deepEqual(
    plan.moves.map((item) => item.targetPath).sort(),
    [
      "剧集/洛基/洛基.S01/Loki.S01E02.1080p.WEBRip.x265-RARBG.zh.ass",
      "剧集/洛基/洛基.S01/洛基.S01E02.mkv",
    ],
  );
  assert.deepEqual(
    plan.deletes.map((item) => item.wrapperDir).sort(),
    [
      "洛基 Loki/Season 01/Subs/Loki.S01E02.1080p.WEBRip.x265-RARBG",
      "洛基 Loki/Season 01/Subs/Loki.S01E02.1080p.WEBRip.x265-RARBG/最新域名及域名找回.txt",
    ],
  );
  assert.equal(plan.summary.reviewReasonCounts["episode-wrapper-dir"] ?? 0, 0);
});

test("tmdb-normalize 会按祖先目录季集号迁移字幕，并删除 Subs 目录与非字幕附件", async () => {
  const tmdbClient = createFakeTmdbClient({
    tvResults: {
      "Loki": [
        {
          id: 84958,
          name: "洛基",
          original_name: "Loki",
          first_air_date: "2021-06-09",
          popularity: 80,
        },
      ],
      "洛基 Loki": [
        {
          id: 84958,
          name: "洛基",
          original_name: "Loki",
          first_air_date: "2021-06-09",
          popularity: 80,
        },
      ],
    },
  });

  const plan = await buildPlanAsync(
    [
      {
        source: "洛基 Loki/Season 01/Loki.S01E01.1080p.WEBRip.x265-RARBG.mkv",
        fid: "main-video-1",
      },
      {
        source: "洛基 Loki/Season 01/Subs",
        cid: "subs-root-1",
        isDir: true,
      },
      {
        source: "洛基 Loki/Season 01/Subs/Loki.S01E01.1080p.WEBRip.x265-RARBG",
        cid: "subs-bundle-1",
        isDir: true,
      },
      {
        source: "洛基 Loki/Season 01/Subs/Loki.S01E01.1080p.WEBRip.x265-RARBG/2_English.srt",
        fid: "subs-file-1",
      },
      {
        source: "洛基 Loki/Season 01/Subs/Loki.S01E01.1080p.WEBRip.x265-RARBG/poster.jpg",
        fid: "subs-file-2",
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "剧集",
      tmdbClient,
    },
  );

  assert.equal(plan.reviews.length, 0);
  assert.deepEqual(
    plan.moves.map((item) => item.targetPath).sort(),
    [
      "剧集/洛基/洛基.S01/洛基.S01E01.2_English.srt",
      "剧集/洛基/洛基.S01/洛基.S01E01.mkv",
    ],
  );
  assert.deepEqual(
    plan.deletes.map((item) => item.wrapperDir).sort(),
    [
      "洛基 Loki/Season 01/Subs",
      "洛基 Loki/Season 01/Subs/Loki.S01E01.1080p.WEBRip.x265-RARBG",
      "洛基 Loki/Season 01/Subs/Loki.S01E01.1080p.WEBRip.x265-RARBG/poster.jpg",
    ],
  );
  assert.equal(plan.summary.deleteStrategyCounts["sidecar-dir"] ?? 0, 2);
  assert.equal(plan.summary.deleteStrategyCounts["sidecar-nonsub-delete"] ?? 0, 1);
});

test("tmdb-normalize 会把 Fonts menu PV 特典映像 下的素材标记为 nested-sidecar-dir 且不查询 TMDB", async () => {
  const tmdbClient = createFakeTmdbClient();

  const plan = await buildPlanAsync(
    [
      {
        source: "[花束般的恋爱][正片+特典映像] [简繁外挂][FLAC][MKV]/Fonts",
        cid: "movie-sidecar-dir-1",
        isDir: true,
      },
      {
        source: "[花束般的恋爱][正片+特典映像] [简繁外挂][FLAC][MKV]/Fonts/Fonts.zip",
        fid: "movie-sidecar-file-1",
      },
      {
        source: "[花束般的恋爱][正片+特典映像] [简繁外挂][FLAC][MKV]/menu",
        cid: "movie-sidecar-dir-2",
        isDir: true,
      },
      {
        source: "[花束般的恋爱][正片+特典映像] [简繁外挂][FLAC][MKV]/menu/menu01.mkv",
        fid: "movie-sidecar-file-2",
      },
      {
        source: "[花束般的恋爱][正片+特典映像] [简繁外挂][FLAC][MKV]/PV",
        cid: "movie-sidecar-dir-3",
        isDir: true,
      },
      {
        source: "[花束般的恋爱][正片+特典映像] [简繁外挂][FLAC][MKV]/PV/pv01.mkv",
        fid: "movie-sidecar-file-3",
      },
      {
        source: "[花束般的恋爱][正片+特典映像] [简繁外挂][FLAC][MKV]/特典映像",
        cid: "movie-sidecar-dir-4",
        isDir: true,
      },
      {
        source: "[花束般的恋爱][正片+特典映像] [简繁外挂][FLAC][MKV]/特典映像/bonus01.mkv",
        fid: "movie-sidecar-file-4",
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "电影",
      tmdbClient,
      zeroReviewFinalizer: false,
    },
  );

  assert.equal(tmdbClient.calls.length, 0);
  assert.equal(plan.moves.length, 0);
  assert.equal(plan.reviews.length, 4);
  assert.deepEqual(
    plan.reviews.map((item) => item.reviewReason),
    ["nested-sidecar-dir", "nested-sidecar-dir", "nested-sidecar-dir", "nested-sidecar-dir"],
  );
});

test("tmdb-normalize 会忽略多集合集目录本身，并继续搬运子分集", async () => {
  const tmdbClient = createFakeTmdbClient({
    tvResults: {
      "Stranger Things": [
        {
          id: 66732,
          name: "怪奇物语",
          original_name: "Stranger Things",
          first_air_date: "2016-07-15",
          popularity: 95,
        },
      ],
    },
  });

  const wrapperSource =
    "Stranger Things Part 1 TBD/Season 04/[BD影视分享bd2020.com]Stranger.Things.S04E08-09.NF.AAC5.1.HD1080P.中英双字";
  const plan = await buildPlanAsync(
    [
      {
        source: "Stranger Things Part 1 TBD",
        cid: "multi-wrapper-root",
        isDir: true,
      },
      {
        source: "Stranger Things Part 1 TBD/Season 04",
        cid: "multi-wrapper-season",
        isDir: true,
      },
      {
        source: wrapperSource,
        cid: "multi-wrapper-dir",
        isDir: true,
      },
      {
        source: `${wrapperSource}/Stranger.Things.S04E08.NF.AAC5.1.HD1080P.中英双字[BD影视分享bd2020.com].mp4`,
        fid: "multi-wrapper-video-1",
      },
      {
        source: `${wrapperSource}/Stranger.Things.S04E09.NF.AAC5.1.HD1080P.中英双字[BD影视分享bd2020.com].mp4`,
        fid: "multi-wrapper-video-2",
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "剧集",
      tmdbClient,
    },
  );

  assert.equal(plan.reviews.find((item) => item.source === wrapperSource), undefined);
  assert.deepEqual(
    plan.moves
      .filter((item) => item.source.startsWith(`${wrapperSource}/`))
      .map((item) => item.targetPath)
      .sort(),
    [
      "剧集/怪奇物语/怪奇物语.S04/怪奇物语.S04E08.mp4",
      "剧集/怪奇物语/怪奇物语.S04/怪奇物语.S04E09.mp4",
    ],
  );
  assert.equal(plan.deletes.find((item) => item.wrapperDir === wrapperSource), undefined);
  assert.equal(plan.summary.reviewReasonCounts["episode-wrapper-dir"] ?? 0, 0);
});

test("tmdb-normalize 不会把 tv 条目的年份差异当成 year-conflict", async () => {
  const tmdbClient = createFakeTmdbClient({
    tvResults: {
      "The Witcher": [
        {
          id: 71912,
          name: "猎魔人",
          original_name: "The Witcher",
          first_air_date: "2019-12-20",
          popularity: 85,
        },
      ],
    },
  });

  const plan = await buildPlanAsync(
    [
      {
        source: "The.Witcher.S03E01.2023.1080p.NF.WEB-DL.mkv",
        fid: "tv-year-1",
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "剧集",
      tmdbClient,
    },
  );

  assert.equal(plan.moves.length, 1);
  assert.equal(plan.reviews.length, 0);
  assert.equal(plan.moves[0].targetPath, "剧集/猎魔人/猎魔人.S03/猎魔人.S03E01.mkv");
});

test("tmdb-normalize 命中动漫后仍按 tv 查询并落到动漫目录", async () => {
  const tmdbClient = createFakeTmdbClient({
    tvResults: {
      "Frieren": [
        {
          id: 209867,
          name: "葬送的芙莉莲",
          original_name: "Sousou no Frieren",
          first_air_date: "2023-09-29",
          original_language: "ja",
          popularity: 60,
        },
      ],
    },
  });

  const plan = await buildPlanAsync(
    [
      {
        source: "Frieren.S01E01.1080p.WEB-DL.mkv",
        fid: "anime-1",
      },
    ],
    {
      mode: "tmdb-normalize",
      tmdbClient,
    },
  );

  assert.equal(tmdbClient.calls[0].type, "tv");
  assert.equal(plan.moves[0].category, "anime");
  assert.equal(plan.moves[0].targetDir, "动漫/葬送的芙莉莲/葬送的芙莉莲.S01");
  assert.equal(plan.moves[0].targetName, "葬送的芙莉莲.S01E01.mkv");
});

test("tmdb-normalize 在纪录片根目录下会保留到 纪录片 目录", async () => {
  const tmdbClient = createFakeTmdbClient({
    movieResults: {
      "Free Solo": [
        {
          id: 515042,
          title: "徒手攀岩",
          original_title: "Free Solo",
          release_date: "2018-08-31",
          popularity: 40,
        },
      ],
    },
    movieDetails: {
      515042: {
        title: "徒手攀岩",
        original_title: "Free Solo",
      },
    },
  });

  const plan = await buildPlanAsync(
    [
      {
        source: "Free.Solo.2018.1080p.BluRay.mkv",
        fid: "documentary-1",
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "纪录片",
      tmdbClient,
    },
  );

  assert.equal(plan.moves.length, 1);
  assert.equal(plan.moves[0].category, "documentary");
  assert.equal(plan.moves[0].targetDir, "纪录片/徒手攀岩.Free.Solo (2018)");
  assert.equal(plan.moves[0].targetPath, "纪录片/徒手攀岩.Free.Solo (2018)/徒手攀岩.Free.Solo.mkv");
});

test("tmdb-normalize 电影英文名会优先 original_title 而不是 working former informal 别名", async () => {
  const tmdbClient = createFakeTmdbClient({
    movieResults: {
      "AI创世者": [
        {
          id: 670292,
          title: "AI创世者",
          original_title: "The Creator",
          original_language: "en",
          release_date: "2023-09-27",
          popularity: 50,
        },
      ],
      "雷神4：爱与雷霆": [
        {
          id: 616037,
          title: "雷神4：爱与雷霆",
          original_title: "Thor: Love and Thunder",
          original_language: "en",
          release_date: "2022-07-06",
          popularity: 50,
        },
      ],
      "银翼杀手": [
        {
          id: 335984,
          title: "银翼杀手2049",
          original_title: "Blade Runner 2049",
          original_language: "en",
          release_date: "2017-10-04",
          popularity: 50,
        },
      ],
    },
    movieDetails: {
      670292: {
        title: "AI创世者",
        original_title: "The Creator",
        original_language: "en",
        alternative_titles: {
          titles: [
            { iso_3166_1: "US", title: "True Love", type: "former title" },
          ],
        },
      },
      616037: {
        title: "雷神4：爱与雷霆",
        original_title: "Thor: Love and Thunder",
        original_language: "en",
        alternative_titles: {
          titles: [
            { iso_3166_1: "US", title: "Thor 4", type: "working title" },
          ],
        },
      },
      335984: {
        title: "银翼杀手2049",
        original_title: "Blade Runner 2049",
        original_language: "en",
        alternative_titles: {
          titles: [
            { iso_3166_1: "US", title: "Blade Runner 2", type: "informal English title" },
          ],
        },
      },
    },
  });

  const plan = await buildPlanAsync(
    [
      { source: "AI创世者 (2023)", cid: "movie-en-1", isDir: true },
      { source: "雷神4：爱与雷霆 (2022)", cid: "movie-en-2", isDir: true },
      { source: "银翼杀手 (2017)", cid: "movie-en-3", isDir: true },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "电影",
      tmdbClient,
    },
  );

  const moveBySource = new Map(plan.moves.map((item) => [item.source, item]));
  assert.equal(moveBySource.get("AI创世者 (2023)").canonicalTitleEn, "The Creator");
  assert.equal(moveBySource.get("雷神4：爱与雷霆 (2022)").canonicalTitleEn, "Thor: Love and Thunder");
  assert.equal(moveBySource.get("银翼杀手 (2017)").canonicalTitleEn, "Blade Runner 2049");
});

test("tmdb-normalize 非英语原片会优先 match.title 里的英文发行名", async () => {
  const tmdbClient = createFakeTmdbClient({
    movieResults: {
      "Love On Delivery": [
        {
          id: 53163,
          title: "Love on Delivery",
          original_title: "破壞之王",
          original_language: "cn",
          release_date: "1994-02-04",
          popularity: 50,
        },
      ],
    },
    movieDetails: {
      53163: {
        title: "破坏之王",
        original_title: "破壞之王",
        original_language: "cn",
        alternative_titles: {
          titles: [
            { iso_3166_1: "US", title: "King of Destruction", type: "" },
          ],
        },
      },
    },
  });

  const plan = await buildPlanAsync(
    [
      {
        source: "Love On Delivery (1994)",
        cid: "movie-foreign-1",
        isDir: true,
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "电影",
      tmdbClient,
    },
  );

  assert.equal(plan.moves.length, 1);
  assert.equal(plan.moves[0].canonicalTitleEn, "Love on Delivery");
});

test("tmdb-normalize 非英语原片在没有英文 match.title 时会回退到可信英区 alternative title", async () => {
  const tmdbClient = createFakeTmdbClient({
    movieResults: {
      "重庆森林 重慶森林": [
        {
          id: 11104,
          title: "重庆森林",
          original_title: "重慶森林",
          original_language: "cn",
          release_date: "1994-07-14",
          popularity: 50,
        },
      ],
    },
    movieDetails: {
      11104: {
        title: "重庆森林",
        original_title: "重慶森林",
        original_language: "cn",
        alternative_titles: {
          titles: [
            { iso_3166_1: "US", title: "Chungking Express", type: "Main Title" },
          ],
        },
      },
    },
  });

  const plan = await buildPlanAsync(
    [
      {
        source: "重庆森林 重慶森林 (1994)",
        cid: "movie-foreign-2",
        isDir: true,
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "电影",
      tmdbClient,
    },
  );

  assert.equal(plan.moves.length, 1);
  assert.equal(plan.moves[0].canonicalTitleEn, "Chungking Express");
});

test("tmdb-normalize 遇到多个接近候选时进入 review", async () => {
  const plan = await buildPlanAsync(
    [
      {
        source: "The.Great.Escape.mkv",
        fid: "movie-1",
      },
    ],
    {
      mode: "tmdb-normalize",
      zeroReviewFinalizer: false,
      tmdbClient: createFakeTmdbClient({
        movieResults: {
          "The Great Escape": [
            {
              id: 111,
              title: "大逃亡",
              original_title: "The Great Escape",
              release_date: "1963-07-04",
              popularity: 30,
            },
            {
              id: 222,
              title: "大逃亡",
              original_title: "The Great Escape",
              release_date: "2023-05-01",
              popularity: 29,
            },
          ],
        },
      }),
    },
  );

  assert.equal(plan.moves.length, 0);
  assert.equal(plan.reviews.length, 1);
  assert.equal(plan.reviews[0].reviewReason, "tmdb-ambiguous");
  assert.equal(plan.summary.tmdbAmbiguousCount, 1);
});

test("tmdb-normalize 在同名候选热度差距明显时自动接受更热门项", async () => {
  const plan = await buildPlanAsync(
    [
      {
        source: "House.of.Cards.S01E01.1080p.WEB-DL.mkv",
        fid: "tv-popularity-1",
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "剧集",
      tmdbClient: createFakeTmdbClient({
        tvResults: {
          "House Of Cards": [
            {
              id: 1425,
              name: "纸牌屋",
              original_name: "House of Cards",
              first_air_date: "2013-02-01",
              popularity: 27.3,
            },
            {
              id: 21720,
              name: "纸牌屋",
              original_name: "House of Cards",
              first_air_date: "1990-11-18",
              popularity: 2.8,
            },
          ],
        },
      }),
    },
  );

  assert.equal(plan.moves.length, 1);
  assert.equal(plan.reviews.length, 0);
  assert.equal(plan.moves[0].tmdbId, 1425);
  assert.equal(plan.moves[0].targetPath, "剧集/纸牌屋/纸牌屋.S01/纸牌屋.S01E01.mkv");
});

test("tmdb-normalize 对英文查询仅返回单个高热度结果时允许接受非英文标题候选", async () => {
  const plan = await buildPlanAsync(
    [
      {
        source: "The.Naked.Director.S02E01.1080p.WEB-DL.mkv",
        fid: "tv-single-result-1",
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "剧集",
      tmdbClient: createFakeTmdbClient({
        tvResults: {
          "The Naked Director": [
            {
              id: 90955,
              name: "全裸导演",
              original_name: "全裸監督",
              first_air_date: "2019-08-08",
              popularity: 22.5,
            },
          ],
        },
      }),
    },
  );

  assert.equal(plan.moves.length, 1);
  assert.equal(plan.reviews.length, 0);
  assert.equal(plan.moves[0].tmdbId, 90955);
  assert.equal(plan.moves[0].targetPath, "剧集/全裸导演/全裸导演.S02/全裸导演.S02E01.mkv");
});

test("tmdb-normalize 对纯英文剧名搜索会用详情回填中文剧名", async () => {
  const tmdbClient = createFakeTmdbClient({
    tvResults: {
      "Sweet Home": [
        {
          id: 96648,
          name: "Sweet Home",
          original_name: "스위트홈",
          first_air_date: "2020-12-18",
          popularity: 24.7,
        },
      ],
    },
    tvDetails: {
      96648: {
        name: "甜蜜家园",
        original_name: "스위트홈",
      },
    },
  });

  const plan = await buildPlanAsync(
    [
      {
        source: "Sweet.Home.S01E01.1080p.WEB-DL.mkv",
        fid: "tv-en-zh-1",
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "剧集",
      tmdbClient,
    },
  );

  assert.equal(plan.moves.length, 1);
  assert.equal(plan.reviews.length, 0);
  assert.equal(plan.moves[0].canonicalTitleZh, "甜蜜家园");
  assert.equal(plan.moves[0].targetPath, "剧集/甜蜜家园/甜蜜家园.S01/甜蜜家园.S01E01.mkv");
});

test("tmdb-normalize 对单结果但被判 ambiguous 的英文剧名会直接接受", async () => {
  const plan = await buildPlanAsync(
    [
      {
        source: "Love.Death.and.Robots.S03E01.1080p.WEB-DL.mkv",
        fid: "tv-single-ambiguous-1",
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "剧集",
      tmdbClient: createFakeTmdbClient({
        tvResults: {
          "Love Death And Robots": [
            {
              id: 86831,
              name: "Love, Death & Robots",
              original_name: "Love, Death & Robots",
              first_air_date: "2019-03-15",
              popularity: 23.8,
            },
          ],
        },
        tvDetails: {
          86831: {
            name: "爱，死亡和机器人",
            original_name: "Love, Death & Robots",
          },
        },
      }),
    },
  );

  assert.equal(plan.moves.length, 1);
  assert.equal(plan.reviews.length, 0);
  assert.equal(plan.moves[0].tmdbId, 86831);
  assert.equal(plan.moves[0].targetPath, "剧集/爱，死亡和机器人/爱，死亡和机器人.S03/爱，死亡和机器人.S03E01.mkv");
});

test("tmdb-normalize 会从详情 translations 回填中文剧名", async () => {
  const plan = await buildPlanAsync(
    [
      {
        source: "Love.Death.and.Robots.S03E01.1080p.WEB-DL.mkv",
        fid: "tv-translation-1",
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "剧集",
      tmdbClient: createFakeTmdbClient({
        tvResults: {
          "Love Death And Robots": [
            {
              id: 86831,
              name: "Love, Death & Robots",
              original_name: "Love, Death & Robots",
              first_air_date: "2019-03-15",
              popularity: 23.8,
            },
          ],
        },
        tvDetails: {
          86831: {
            name: "Love, Death & Robots",
            original_name: "Love, Death & Robots",
            translations: {
              translations: [
                {
                  iso_639_1: "zh",
                  iso_3166_1: "CN",
                  data: {
                    name: "爱，死亡和机器人",
                  },
                },
              ],
            },
          },
        },
      }),
    },
  );

  assert.equal(plan.moves.length, 1);
  assert.equal(plan.moves[0].canonicalTitleZh, "爱，死亡和机器人");
  assert.equal(plan.moves[0].targetPath, "剧集/爱，死亡和机器人/爱，死亡和机器人.S03/爱，死亡和机器人.S03E01.mkv");
});

test("tmdb-normalize 在详情没有中文标题时会调用 titleTranslator 补中文", async () => {
  const plan = await buildPlanAsync(
    [
      {
        source: "My.Untranslated.Show.S01E01.1080p.WEB-DL.mkv",
        fid: "tv-title-translator-1",
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "剧集",
      tmdbClient: createFakeTmdbClient({
        tvResults: {
          "My Untranslated Show": [
            {
              id: 910001,
              name: "My Untranslated Show",
              original_name: "My Untranslated Show",
              first_air_date: "2026-01-01",
              popularity: 8,
            },
          ],
        },
        tvDetails: {
          910001: {
            name: "My Untranslated Show",
            original_name: "My Untranslated Show",
          },
        },
      }),
      titleTranslator: async () => ({
        canonicalTitleZh: "我的未翻译剧",
      }),
    },
  );

  assert.equal(plan.moves.length, 1);
  assert.equal(plan.moves[0].canonicalTitleZh, "我的未翻译剧");
  assert.equal(plan.moves[0].targetPath, "剧集/我的未翻译剧/我的未翻译剧.S01/我的未翻译剧.S01E01.mkv");
});

test("tmdb-normalize 查无结果时进入 review", async () => {
  const plan = await buildPlanAsync(
    [
      {
        source: "Unknown.Movie.2024.mkv",
        fid: "movie-1",
      },
    ],
    {
      mode: "tmdb-normalize",
      zeroReviewFinalizer: false,
      tmdbClient: createFakeTmdbClient({
        movieResults: {
          "Unknown Movie": [],
        },
      }),
    },
  );

  assert.equal(plan.moves.length, 0);
  assert.equal(plan.reviews[0].reviewReason, "tmdb-miss");
  assert.equal(plan.summary.tmdbMissCount, 1);
});

test("tmdb-normalize 会把 empty-query 噪音目录直接放进 deletes", async () => {
  const tmdbClient = createFakeTmdbClient();

  const plan = await buildPlanAsync(
    [
      {
        source: "《怪奇物语 第5季_Stranger Things Season 5》【2025_tt18268644】7-8",
        cid: "empty-query-dir-1",
        isDir: true,
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "剧集",
      tmdbClient,
    },
  );

  assert.equal(tmdbClient.calls.length, 0);
  assert.equal(plan.moves.length, 0);
  assert.equal(plan.reviews.length, 0);
  assert.deepEqual(plan.deletes.map((item) => item.wrapperDir), [
    "《怪奇物语 第5季_Stranger Things Season 5》【2025_tt18268644】7-8",
  ]);
  assert.equal(plan.summary.deleteStrategyCounts["empty-query-delete"] ?? 0, 1);
});

test("tmdb-normalize 在查询任务全部失败时进入 tmdb-query-error，而不是 tmdb-miss", async () => {
  const plan = await buildPlanAsync(
    [
      {
        source: "The.Last.of.Us.S01E01.1080p.WEB-DL.mkv",
        fid: "tv-query-error-1",
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "剧集",
      tmdbClient: createScriptedTmdbClient({
        tvScripts: {
          "The Last of Us": [
            new Error("fetch failed"),
            new Error("fetch failed"),
            new Error("fetch failed"),
            new Error("fetch failed"),
          ],
        },
      }),
      tmdbQueryIntervalMs: 0,
      tmdbQueryBackoffBaseMs: 1,
      zeroReviewFinalizer: false,
    },
  );

  assert.equal(plan.moves.length, 0);
  assert.equal(plan.reviews.length, 1);
  assert.equal(plan.reviews[0].reviewReason, "tmdb-query-error");
  assert.equal(plan.summary.tmdbQueryErrorCount, 1);
  assert.equal(plan.summary.tmdbMissCount, 0);
  assert.ok((plan.summary.tmdbErrorAttemptCount ?? 0) >= 1);
  assert.ok((plan.summary.tmdbErrorMessageCounts?.["fetch failed"] ?? 0) >= 1);
  assert.match(renderPlanSummary(plan), /TMDB 请求失败: 1/u);
  assert.match(renderPlanSummary(plan), /TMDB 失败 message: .*fetch failed/u);
});

test("tmdb-normalize 在查询任务全部失败时若默认 llm resolver 可用则直接走 llm-fallback", async () => {
  const requests = [];
  const plan = await buildPlanAsync(
    [
      {
        source: "The.Last.of.Us.S01E01.1080p.WEB-DL.mkv",
        fid: "tv-query-error-llm-1",
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "剧集",
      tmdbClient: createScriptedTmdbClient({
        tvScripts: {
          "The Last of Us": [
            new Error("fetch failed"),
            new Error("fetch failed"),
            new Error("fetch failed"),
            new Error("fetch failed"),
          ],
        },
      }),
      llmResolverOptions: {
        apiKey: "test-key",
        baseUrl: "https://example.com/v1",
        model: "gpt-5.4-mini",
        fetchImpl: async (url, init) => {
          requests.push({
            url: String(url),
            init,
          });

          return new Response(
            JSON.stringify({
              output: [
                {
                  type: "message",
                  content: [
                    {
                      type: "output_text",
                      text: JSON.stringify({
                        resolved: true,
                        confidence: 0.91,
                        canonicalTitleZh: "最后生还者",
                        canonicalTitleEn: "The Last of Us",
                      }),
                    },
                  ],
                },
              ],
            }),
            {
              status: 200,
              headers: {
                "content-type": "application/json",
              },
            },
          );
        },
      },
      tmdbQueryIntervalMs: 0,
      tmdbQueryBackoffBaseMs: 1,
    },
  );

  assert.equal(plan.moves.length, 1);
  assert.equal(plan.reviews.length, 0);
  assert.equal(plan.moves[0].matchSource, "llm-fallback");
  assert.equal(plan.moves[0].reason, "llm-fallback");
  assert.equal(plan.moves[0].targetPath, "剧集/最后生还者/最后生还者.S01/最后生还者.S01E01.mkv");
  assert.equal(plan.summary.tmdbQueryErrorCount, 0);
  assert.equal(plan.summary.reviewCount, 0);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://example.com/v1/responses");
});

test("tmdb-normalize 不会把万万没想到外传里的噪音英文候选误接受成玛利亚韦恩", async () => {
  const plan = await buildPlanAsync(
    [
      {
        source: "万万没想到 1 3季全集+电影 影视魔王/外传-小兵过年/万万没想到之小兵过年 01：-神秘雪藏篇-请假ing.mkv",
        fid: "wanwan-special-1",
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "剧集",
      tmdbClient: createScriptedTmdbClient({
        tvScripts: {
          "万万没想到之小兵过年 01： 神秘雪藏篇 请假ing": [],
          "万万没想到之小兵过年 ： 神秘雪藏篇 请假": [],
          "01： ing": [
            {
              id: 51976,
              name: "玛利亚·韦恩",
              original_name: "Maria Wern",
              first_air_date: "2008-09-16",
              popularity: 4.2133,
            },
          ],
          "外传 小兵过年": [],
          "万万没想到 1 3季全集+电影": [],
        },
      }),
      tmdbQueryIntervalMs: 0,
      tmdbQueryBackoffBaseMs: 1,
    },
  );

  assert.equal(plan.reviews.length, 0);
  assert.equal(plan.moves.length, 1);
  assert.equal(plan.moves[0].matchSource, "llm-fallback");
  assert.equal(plan.moves[0].canonicalTitleZh, "万万没想到");
  assert.equal(plan.moves[0].targetPath, "剧集/万万没想到/外传-小兵过年/万万没想到之小兵过年 01：-神秘雪藏篇-请假ing.mkv");
});

test("tmdb-normalize 标题命中但年份冲突时进入 review", async () => {
  const plan = await buildPlanAsync(
    [
      {
        source: "Dune.2024.mkv",
        fid: "movie-1",
      },
    ],
    {
      mode: "tmdb-normalize",
      zeroReviewFinalizer: false,
      tmdbClient: createFakeTmdbClient({
        movieResults: {
          Dune: [
            {
              id: 438631,
              title: "沙丘",
              original_title: "Dune",
              release_date: "2021-09-15",
              popularity: 90,
            },
          ],
        },
      }),
    },
  );

  assert.equal(plan.moves.length, 0);
  assert.equal(plan.reviews[0].reviewReason, "year-conflict");
  assert.equal(plan.summary.yearConflictCount, 1);
});

test("tmdb-normalize 会对重复查询任务去重并输出查询统计", async () => {
  const tmdbClient = createFakeTmdbClient({
    tvResults: {
      "Sweet Home": [
        {
          id: 96648,
          name: "甜蜜家园",
          original_name: "Sweet Home",
          first_air_date: "2020-12-18",
          popularity: 24.7,
        },
      ],
    },
    tvDetails: {
      96648: {
        name: "甜蜜家园",
        original_name: "Sweet Home",
      },
    },
  });

  const plan = await buildPlanAsync(
    [
      {
        source: "Sweet.Home.S01E01.1080p.WEB-DL.mkv",
        fid: "sweet-home-1",
      },
      {
        source: "Sweet.Home.S01E02.1080p.WEB-DL.mkv",
        fid: "sweet-home-2",
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "剧集",
      tmdbClient,
    },
  );

  const sweetHomeTaskKeys = new Set(
    tmdbClient.calls
      .filter((item) => item.type === "tv" && item.query === "Sweet Home")
      .map((item) => `${item.query}:${item.extra.language}`),
  );

  assert.equal(plan.moves.length, 2);
  assert.equal(sweetHomeTaskKeys.size, 2);
  assert.equal(plan.summary.tmdbQueryTaskCount, 2);
  assert.equal(plan.summary.tmdbCacheHitCount, 2);
  assert.equal(plan.summary.tmdbRequestCount, 2);
  assert.equal(plan.summary.tmdbRetryCount, 0);
  assert.equal(plan.summary.tmdb429Count, 0);
});

test("tmdb-normalize 遇到 429 会按调度器重试并统计重试次数", async () => {
  const tmdbClient = createScriptedTmdbClient({
    tvScripts: {
      "The Last of Us": [
        createTmdbHttpError(429, "Too Many Requests"),
        [
          {
            id: 100088,
            name: "最后生还者",
            original_name: "The Last of Us",
            first_air_date: "2023-01-15",
            popularity: 80,
          },
        ],
      ],
    },
  });

  const plan = await buildPlanAsync(
    [
      {
        source: "The.Last.of.Us.S01E01.1080p.WEB-DL.mkv",
        fid: "last-of-us-retry-1",
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "剧集",
      tmdbClient,
      tmdbQueryIntervalMs: 0,
      tmdbQueryBackoffBaseMs: 1,
    },
  );

  assert.equal(plan.moves.length, 1);
  assert.equal(plan.summary.tmdbRequestCount, 3);
  assert.equal(plan.summary.tmdbRetryCount, 1);
  assert.equal(plan.summary.tmdb429Count, 1);
  assert.equal(plan.summary.tmdbErrorStatusCounts["429"] ?? 0, 1);
  assert.equal(plan.summary.tmdbErrorMessageCounts["Too Many Requests"] ?? 0, 1);
});

test("tmdb-normalize 在预取阶段会持续输出 tmdb 进度事件", async () => {
  const tmdbClient = createScriptedTmdbClient({
    tvScripts: {
      "The Last of Us": [
        createTmdbHttpError(429, "Too Many Requests"),
        [
          {
            id: 100088,
            name: "最后生还者",
            original_name: "The Last of Us",
            first_air_date: "2023-01-15",
            popularity: 80,
          },
        ],
      ],
    },
  });
  const progressEvents = [];

  const plan = await buildPlanAsync(
    [
      {
        source: "The.Last.of.Us.S01E01.1080p.WEB-DL.mkv",
        fid: "last-of-us-progress-1",
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "剧集",
      tmdbClient,
      tmdbQueryIntervalMs: 0,
      tmdbQueryBackoffBaseMs: 1,
      onProgress: (event) => {
        progressEvents.push(event);
      },
    },
  );

  assert.equal(plan.moves.length, 1);
  assert.ok(progressEvents.some((event) => event.type === "tmdb-prefetch-start"));
  assert.ok(progressEvents.some((event) => event.type === "tmdb-prefetch-progress"));
  assert.ok(
    progressEvents.some((event) => {
      return (
        event.type === "tmdb-prefetch-progress" &&
        event.retryCount >= 1 &&
        event.status429Count >= 1
      );
    }),
  );
  assert.ok(
    progressEvents.some((event) => {
      return event.type === "tmdb-prefetch-progress" && event.completedTasks >= 1;
    }),
  );
  assert.ok(progressEvents.some((event) => event.type === "tmdb-prefetch-complete"));
  assert.ok(progressEvents.some((event) => event.type === "tmdb-planning-start"));
});

test("tmdb-normalize 会把同剧别名目录内容合并到同一规范剧集树", async () => {
  const theBoysResult = [
    {
      id: 76479,
      name: "黑袍纠察队",
      original_name: "The Boys",
      first_air_date: "2019-07-25",
      popularity: 90,
    },
  ];
  const tmdbClient = createFakeTmdbClient({
    tvResults: {
      "黑袍纠察队 The Boys": theBoysResult,
      "黑袍纠察队": theBoysResult,
      "The Boys": theBoysResult,
    },
  });

  const plan = await buildPlanAsync(
    [
      {
        source: "黑袍纠察队 The Boys",
        cid: "boys-root-1",
        isDir: true,
      },
      {
        source: "黑袍纠察队",
        cid: "boys-root-2",
        isDir: true,
      },
      {
        source: "黑袍纠察队 The Boys/Season 01",
        cid: "boys-season-1",
        isDir: true,
      },
      {
        source: "黑袍纠察队/Season 01",
        cid: "boys-season-2",
        isDir: true,
      },
      {
        source: "黑袍纠察队 The Boys/Season 01/The.Boys.S01E01.1080p.WEB-DL.mkv",
        fid: "boys-file-1",
      },
      {
        source: "黑袍纠察队/Season 01/The.Boys.S01E02.1080p.WEB-DL.mkv",
        fid: "boys-file-2",
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "剧集",
      tmdbClient,
    },
  );

  assert.equal(plan.reviews.length, 0);
  assert.equal(plan.collisions.length, 0);
  assert.equal(plan.moves.length, 2);
  assert.ok(plan.moves.every((item) => item.targetPath.startsWith("剧集/黑袍纠察队/黑袍纠察队.S01/")));
  assert.deepEqual(
    plan.deletes.map((item) => item.wrapperDir).sort(),
    ["黑袍纠察队", "黑袍纠察队 The Boys"],
  );
  assert.equal(plan.summary.mergedSeriesGroupCount, 1);
  assert.equal(plan.summary.mergedEntryCount, 6);
  assert.equal(plan.summary.mergeConflictResolvedCount, 0);
  assert.equal(plan.summary.mergeConflictReviewCount, 0);
});

test("tmdb-normalize 会用剧集年份提示命中 2019 版阴阳魔界，并回填同组目录", async () => {
  const twilightResults = [
    {
      id: 6357,
      name: "阴阳魔界",
      original_name: "The Twilight Zone",
      first_air_date: "1959-10-02",
      popularity: 23.8209,
    },
    {
      id: 16399,
      name: "阴阳魔界",
      original_name: "The Twilight Zone",
      first_air_date: "2002-09-18",
      popularity: 11.2895,
    },
    {
      id: 83135,
      name: "新阴阳魔界",
      original_name: "The Twilight Zone",
      first_air_date: "2019-04-01",
      popularity: 10.0786,
    },
    {
      id: 1918,
      name: "迷离时空",
      original_name: "The Twilight Zone",
      first_air_date: "1985-09-27",
      popularity: 20.9858,
    },
  ];

  const plan = await buildPlanAsync(
    [
      {
        source: "The Twilight Zone NTb",
        cid: "tz-root-1",
        isDir: true,
      },
      {
        source: "The Twilight Zone NTb/Season 02",
        cid: "tz-season-1",
        isDir: true,
      },
      {
        source:
          "The Twilight Zone NTb/Season 02/The.Twilight.Zone.2019.S02E10.You.Might.Also.Like.1080p.AMZN.WEB-DL.DDP5.1.H.264-NTb.mkv",
        fid: "tz-episode-1",
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "剧集",
      tmdbClient: createFakeTmdbClient({
        tvResults: {
          "The Twilight Zone": twilightResults,
          "The Twilight Zone You Might Also Like": [],
        },
        tvDetails: {
          83135: {
            name: "新阴阳魔界",
            original_name: "The Twilight Zone",
          },
        },
      }),
    },
  );

  assert.equal(plan.reviews.length, 0);
  assert.equal(plan.collisions.length, 0);
  assert.deepEqual(
    plan.moves.map((item) => item.targetPath).sort(),
    [
      "剧集/新阴阳魔界",
      "剧集/新阴阳魔界/新阴阳魔界.S02",
      "剧集/新阴阳魔界/新阴阳魔界.S02/新阴阳魔界.S02E10.mkv",
    ],
  );
});

test("tmdb-normalize 会用同组唯一身份回填年少有为的根目录和中间目录", async () => {
  const plan = await buildPlanAsync(
    [
      {
        source: "N 年少有为 (2026) [更新15集/全26集][4K SDR 60帧][4K 杜比视界][FLAC-HIFI声]",
        cid: "nian-root-1",
        isDir: true,
      },
      {
        source: "N 年少有为 (2026) [更新15集/全26集][4K SDR 60帧][4K 杜比视界][FLAC-HIFI声]/年少有为 (2026) [4K 杜比视界][FLAC-HIFI声]",
        cid: "nian-inner-1",
        isDir: true,
      },
      {
        source: "N 年少有为 (2026) [更新15集/全26集][4K SDR 60帧][4K 杜比视界][FLAC-HIFI声]/年少有为 (2026) [4K 杜比视界][FLAC-HIFI声]/年少有为.S01E01.2026.2160p.WEB-DL.H265.DV.10bit.25fps.FLAC-HIFI 2.0.mkv",
        fid: "nian-file-1",
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "剧集",
      tmdbClient: createFakeTmdbClient({
        tvResults: {
          年少有为: [
            {
              id: 278882,
              name: "年少有为",
              original_name: "年少有为",
              first_air_date: "2026-01-01",
              popularity: 5,
            },
          ],
        },
        tvDetails: {
          278882: {
            name: "年少有为",
            original_name: "年少有为",
          },
        },
      }),
    },
  );

  assert.equal(plan.reviews.length, 0);
  assert.ok(
    plan.moves.some((item) => {
      return (
        item.source === "N 年少有为 (2026) [更新15集/全26集][4K SDR 60帧][4K 杜比视界][FLAC-HIFI声]" &&
        item.targetPath === "剧集/年少有为"
      );
    }),
  );
  assert.ok(
    plan.moves.some((item) => {
      return (
        item.source === "N 年少有为 (2026) [更新15集/全26集][4K SDR 60帧][4K 杜比视界][FLAC-HIFI声]/年少有为 (2026) [4K 杜比视界][FLAC-HIFI声]" &&
        item.targetPath === "剧集/年少有为/年少有为.S01"
      );
    }),
  );
});

test("tmdb-normalize 会让万万没想到千钧一发复用同组身份，不再停在 miss", async () => {
  const wanwanResults = [
    {
      id: 97936,
      name: "万万没想到",
      original_name: "万万没想到",
      first_air_date: "2013-08-06",
      popularity: 2.6265,
    },
  ];

  const plan = await buildPlanAsync(
    [
      {
        source: "万万没想到 1 3季全集+电影 影视魔王",
        cid: "wanwan-root-1",
        isDir: true,
      },
      {
        source: "万万没想到 1 3季全集+电影 影视魔王/万万没想到.mkv",
        fid: "wanwan-file-1",
      },
      {
        source: "万万没想到 1 3季全集+电影 影视魔王/万万没想到：千钧一发—电视剧.mkv",
        fid: "wanwan-file-2",
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "剧集",
      tmdbClient: createFakeTmdbClient({
        tvResults: {
          万万没想到: wanwanResults,
          "万万没想到：千钧一发—电视剧": [],
          "万万没想到 1 3季全集+电影": [],
        },
      }),
    },
  );

  assert.equal(plan.reviews.length, 0);
  assert.ok(
    plan.moves.some((item) => {
      return (
        item.source === "万万没想到 1 3季全集+电影 影视魔王/万万没想到：千钧一发—电视剧.mkv" &&
        item.targetPath === "剧集/万万没想到/万万没想到：千钧一发—电视剧.mkv" &&
        item.matchSource === "llm-fallback"
      );
    }),
  );
});

test("tmdb-normalize 会把 z国q谭 本地回填为 中国奇谭 并归到动漫目录", async () => {
  const plan = await buildPlanAsync(
    [
      {
        source: "z国q谭 EP8 HD1080p mp4/z国q谭.EP8.HD1080p.mp4",
        fid: "china-anime-1",
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "剧集",
      tmdbClient: createFakeTmdbClient({
        tvResults: {
          "z国q谭": [],
          "国 谭": [],
          "z q": [],
          "z国q谭 mp4": [],
          "z q mp4": [],
        },
      }),
    },
  );

  assert.equal(plan.reviews.length, 0);
  assert.equal(plan.moves.length, 1);
  assert.equal(plan.moves[0].matchSource, "llm-fallback");
  assert.equal(plan.moves[0].canonicalTitleZh, "中国奇谭");
  assert.equal(plan.moves[0].category, "anime");
  assert.equal(plan.moves[0].targetPath, "动漫/中国奇谭/中国奇谭.S01/中国奇谭.S01E08.mp4");
});

test("tmdb-normalize 会把动漫松散单集落到 S01E02 并消除同目录 collision", async () => {
  const mashleResult = [
    {
      id: 205715,
      name: "物理魔法使.马修",
      original_name: "Mashle",
      first_air_date: "2023-04-08",
      popularity: 70,
    },
  ];
  const tmdbClient = createFakeTmdbClient({
    tvResults: {
      Mashle: mashleResult,
    },
  });

  const plan = await buildPlanAsync(
    [
      {
        source: "Mashle [01 12]",
        cid: "mashle-root-1",
        isDir: true,
      },
      {
        source: "Mashle [01 12]/[LoliHouse] Mashle - 01 [WebRip 1080p HEVC-10bit AAC SRTx2].mkv",
        fid: "mashle-file-1",
      },
      {
        source: "Mashle [01 12]/[LoliHouse] Mashle - 02 [WebRip 1080p HEVC-10bit AAC SRTx2].mkv",
        fid: "mashle-file-2",
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "动漫",
      tmdbClient,
      tmdbQueryIntervalMs: 0,
      zeroReviewFinalizer: false,
    },
  );

  const moveBySource = new Map(plan.moves.map((item) => [item.source, item]));

  assert.equal(plan.reviews.length, 0);
  assert.equal(plan.collisions.length, 0);
  assert.equal(plan.summary.collisionCount, 0);
  assert.equal(
    moveBySource.get("Mashle [01 12]/[LoliHouse] Mashle - 01 [WebRip 1080p HEVC-10bit AAC SRTx2].mkv")
      .targetPath,
    "动漫/物理魔法使.马修/物理魔法使.马修.S01/物理魔法使.马修.S01E01.mkv",
  );
  assert.equal(
    moveBySource.get("Mashle [01 12]/[LoliHouse] Mashle - 02 [WebRip 1080p HEVC-10bit AAC SRTx2].mkv")
      .targetPath,
    "动漫/物理魔法使.马修/物理魔法使.马修.S01/物理魔法使.马修.S01E02.mkv",
  );
});

test("tmdb-normalize 会在动漫别名根目录下优先保留分集形态更标准的来源", async () => {
  const mashleResult = [
    {
      id: 205715,
      name: "物理魔法使.马修",
      original_name: "Mashle",
      first_air_date: "2023-04-08",
      popularity: 70,
    },
  ];
  const tmdbClient = createFakeTmdbClient({
    tvResults: {
      Mashle: mashleResult,
      "Mashle EN": mashleResult,
      "Mashle JP": mashleResult,
    },
  });

  const plan = await buildPlanAsync(
    [
      {
        source: "Mashle EN",
        cid: "mashle-merge-root-1",
        isDir: true,
      },
      {
        source: "Mashle JP",
        cid: "mashle-merge-root-2",
        isDir: true,
      },
      {
        source: "Mashle EN/Season 01",
        cid: "mashle-merge-season-1",
        isDir: true,
      },
      {
        source: "Mashle JP/Season 01",
        cid: "mashle-merge-season-2",
        isDir: true,
      },
      {
        source: "Mashle EN/Season 01/[LoliHouse] Mashle - 02 [WebRip 1080p HEVC-10bit AAC].mkv",
        fid: "mashle-merge-file-1",
      },
      {
        source: "Mashle JP/Season 01/[ANi] Mashle 第02話 [1080P].mkv",
        fid: "mashle-merge-file-2",
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "动漫",
      tmdbClient,
      tmdbQueryIntervalMs: 0,
      zeroReviewFinalizer: false,
    },
  );

  const mergeConflictReviews = plan.reviews.filter((item) => item.reviewReason === "merge-conflict");

  assert.equal(mergeConflictReviews.length, 0);
  assert.equal(plan.summary.mergeConflictResolvedCount, 1);
  assert.equal(plan.summary.mergeConflictReviewCount, 0);
  assert.equal(plan.moves.length, 1);
  assert.equal(
    plan.moves[0].source,
    "Mashle EN/Season 01/[LoliHouse] Mashle - 02 [WebRip 1080p HEVC-10bit AAC].mkv",
  );
  assert.equal(plan.moves[0].targetPath, "动漫/物理魔法使.马修/物理魔法使.马修.S01/物理魔法使.马修.S01E02.mkv");
});

test("tmdb-normalize 在动漫别名根目录下无法稳定择优时仍保留 merge-conflict review", async () => {
  const mashleResult = [
    {
      id: 205715,
      name: "物理魔法使.马修",
      original_name: "Mashle",
      first_air_date: "2023-04-08",
      popularity: 70,
    },
  ];
  const tmdbClient = createFakeTmdbClient({
    tvResults: {
      Mashle: mashleResult,
      "Mashle EN": mashleResult,
      "Mashle JP": mashleResult,
    },
  });

  const plan = await buildPlanAsync(
    [
      {
        source: "Mashle EN",
        cid: "mashle-conflict-root-1",
        isDir: true,
      },
      {
        source: "Mashle JP",
        cid: "mashle-conflict-root-2",
        isDir: true,
      },
      {
        source: "Mashle EN/Season 01",
        cid: "mashle-conflict-season-1",
        isDir: true,
      },
      {
        source: "Mashle JP/Season 01",
        cid: "mashle-conflict-season-2",
        isDir: true,
      },
      {
        source: "Mashle EN/Season 01/[LoliHouse] Mashle - 02 [WebRip 1080p HEVC-10bit AAC].mkv",
        fid: "mashle-conflict-file-1",
      },
      {
        source: "Mashle JP/Season 01/[LoliHouse] Mashle - 02 [WebRip 1080p HEVC-10bit AAC].mkv",
        fid: "mashle-conflict-file-2",
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "动漫",
      tmdbClient,
      tmdbQueryIntervalMs: 0,
      zeroReviewFinalizer: false,
    },
  );

  const mergeConflictReviews = plan.reviews.filter((item) => item.reviewReason === "merge-conflict");

  assert.equal(plan.moves.length, 0);
  assert.equal(mergeConflictReviews.length, 2);
  assert.deepEqual(
    mergeConflictReviews.map((item) => item.targetPath).sort(),
    [
      "动漫/物理魔法使.马修/物理魔法使.马修.S01/物理魔法使.马修.S01E02.mkv",
      "动漫/物理魔法使.马修/物理魔法使.马修.S01/物理魔法使.马修.S01E02.mkv",
    ],
  );
  assert.equal(plan.summary.mergeConflictResolvedCount, 0);
  assert.equal(plan.summary.mergeConflictReviewCount, 1);
});

test("tmdb-normalize 会在合并目录时按拍板规则保留 JOJO 黄金之风的 NanDesuKa 来源", async () => {
  const jojoResult = [
    {
      id: 45790,
      name: "JOJO的奇妙冒险",
      original_name: "JoJo's Bizarre Adventure",
      first_air_date: "2012-10-06",
      popularity: 80,
    },
  ];
  const tmdbClient = createFakeTmdbClient({
    tvResults: {
      "JoJo's Bizarre Adventure": jojoResult,
      "JoJo's Bizarre Adventure: Golden Wind": jojoResult,
      "JOJO的奇妙冒险": jojoResult,
    },
  });

  const preferredSource =
    "JoJo's Bizarre Adventure DUAL WEB H 264 NanDesuKa/Season 05/JoJo's Bizarre Adventure - S05E25 - DUAL 1080p WEB H.264 -NanDesuKa (NF).mkv";
  const alternateSource =
    "JOJO/Season 05/[JOJO&UHA-WING&Kamigami][JoJo's Bizarre Adventure - Golden Wind][25][BDRIP 1920x1080][x264_DTS-HDMA].mkv";
  const plan = await buildPlanAsync(
    [
      {
        source: "JoJo's Bizarre Adventure DUAL WEB H 264 NanDesuKa",
        cid: "jojo-golden-wind-root-1",
        isDir: true,
      },
      {
        source: "JOJO",
        cid: "jojo-golden-wind-root-2",
        isDir: true,
      },
      {
        source: "JoJo's Bizarre Adventure DUAL WEB H 264 NanDesuKa/Season 05",
        cid: "jojo-golden-wind-season-1",
        isDir: true,
      },
      {
        source: "JOJO/Season 05",
        cid: "jojo-golden-wind-season-2",
        isDir: true,
      },
      {
        source: preferredSource,
        fid: "jojo-golden-wind-file-1",
      },
      {
        source: alternateSource,
        fid: "jojo-golden-wind-file-2",
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "动漫",
      tmdbClient,
      tmdbQueryIntervalMs: 0,
    },
  );

  const mergeConflictReviews = plan.reviews.filter((item) => item.reviewReason === "merge-conflict");

  assert.equal(mergeConflictReviews.length, 0);
  assert.equal(plan.summary.mergeConflictResolvedCount, 1);
  assert.equal(plan.summary.mergeConflictReviewCount, 0);
  assert.equal(plan.moves.length, 1);
  assert.equal(plan.moves[0].source, preferredSource);
  assert.equal(plan.moves[0].targetPath, "动漫/JOJO的奇妙冒险/JOJO的奇妙冒险.S05/JOJO的奇妙冒险.S05E25.mkv");
});

test("tmdb-normalize 会对终末的女武神 S02 双源重复分集自动保留更干净的 Record of Ragnarok 来源", async () => {
  const ragnarokResult = [
    {
      id: 123456,
      name: "终末的女武神",
      original_name: "Record of Ragnarok",
      first_air_date: "2021-06-17",
      popularity: 75,
    },
  ];
  const tmdbClient = createFakeTmdbClient({
    tvResults: {
      "Record Of Ragnarok": ragnarokResult,
      "Record of Ragnarok II": ragnarokResult,
      "终末的女武神": ragnarokResult,
    },
  });

  const plan = await buildPlanAsync(
    [
      {
        source: "Record Of Ragnarok AAC2 0 H 264",
        cid: "ragnarok-root-1",
        isDir: true,
      },
      {
        source: "终末的女武神 [全10集][简繁英字幕] Record of Ragnarok II",
        cid: "ragnarok-root-2",
        isDir: true,
      },
      {
        source: "Record Of Ragnarok AAC2 0 H 264/Season 02",
        cid: "ragnarok-season-1",
        isDir: true,
      },
      {
        source: "终末的女武神 [全10集][简繁英字幕] Record of Ragnarok II/Season 02",
        cid: "ragnarok-season-2",
        isDir: true,
      },
      {
        source: "Record Of Ragnarok AAC2 0 H 264/Season 02/Record.of.Ragnarok.S02E01.Good.vs.Evil.1080p.NF.WEB-DL.AAC2.0.H.264-VARYG.mkv",
        fid: "ragnarok-file-1",
      },
      {
        source: "终末的女武神 [全10集][简繁英字幕] Record of Ragnarok II/Season 02/Record.of.Ragnarok.II.2023.S02E01.1080p.NF.WEB-DL.DDP2.0.x264-Huawei.mkv",
        fid: "ragnarok-file-2",
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "动漫",
      tmdbClient,
      tmdbQueryIntervalMs: 0,
    },
  );

  const mergeConflictReviews = plan.reviews.filter((item) => item.reviewReason === "merge-conflict");

  assert.equal(mergeConflictReviews.length, 0);
  assert.equal(plan.summary.mergeConflictResolvedCount, 1);
  assert.equal(plan.summary.mergeConflictReviewCount, 0);
  assert.equal(plan.moves.length, 1);
  assert.equal(
    plan.moves[0].source,
    "Record Of Ragnarok AAC2 0 H 264/Season 02/Record.of.Ragnarok.S02E01.Good.vs.Evil.1080p.NF.WEB-DL.AAC2.0.H.264-VARYG.mkv",
  );
  assert.equal(plan.moves[0].targetPath, "动漫/终末的女武神/终末的女武神.S02/终末的女武神.S02E01.mkv");
});

test("tmdb-normalize 会在最终 collision 阶段继续收敛终末的女武神 S02 双源重复分集", async () => {
  const ragnarokResult = [
    {
      id: 123456,
      name: "终末的女武神",
      original_name: "Record of Ragnarok",
      first_air_date: "2021-06-17",
      popularity: 75,
    },
  ];
  const preferredSource =
    "Record Of Ragnarok AAC2 0 H 264/Season 02/Record.of.Ragnarok.S02E01.Good.vs.Evil.1080p.NF.WEB-DL.AAC2.0.H.264-VARYG.mkv";
  const alternateSource =
    "终末的女武神 [全10集][简繁英字幕] Record of Ragnarok II/Season 02/Record.of.Ragnarok.II.2023.S02E01.1080p.NF.WEB-DL.DDP2.0.x264-Huawei.mkv";
  const tmdbClient = createFakeTmdbClient({
    tvResults: {
      "Record Of Ragnarok": ragnarokResult,
      "Record of Ragnarok II": ragnarokResult,
      "终末的女武神": ragnarokResult,
    },
  });

  const plan = await buildPlanAsync(
    [
      {
        source: preferredSource,
        fid: "ragnarok-collision-file-1",
      },
      {
        source: alternateSource,
        fid: "ragnarok-collision-file-2",
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "动漫",
      tmdbClient,
      tmdbQueryIntervalMs: 0,
    },
  );

  assert.equal(plan.reviews.length, 0);
  assert.equal(plan.moves.length, 1);
  assert.equal(plan.collisions.length, 0);
  assert.equal(plan.summary.collisionCount, 0);
  assert.equal(plan.moves[0].source, preferredSource);
  assert.equal(plan.moves[0].targetPath, "动漫/终末的女武神/终末的女武神.S02/终末的女武神.S02E01.mkv");
  assert.ok(plan.deletes.some((item) => item.wrapperDir === alternateSource));
});

test("tmdb-normalize 会在最终 collision 阶段按拍板规则保留 JOJO 石之海 Part 2 的 Kamigami 来源", async () => {
  const stoneOceanResult = [
    {
      id: 123117,
      name: "JOJO的奇妙冒险.石之海",
      original_name: "JoJo's Bizarre Adventure: Stone Ocean",
      first_air_date: "2021-12-01",
      popularity: 62,
    },
  ];
  const preferredSource =
    "JOJO的奇妙冒险/[Kamigami] JoJo's Bizarre Adventure - Stone Ocean - 06 [Web 1080p x265 Ma10p E-AC3].mkv";
  const alternateSource =
    "JoJo No Kimyou Na Bouken Stone Ocean Part 2 ~ 12 [Multiple Subtitle]/[Erai-raws] JoJo no Kimyou na Bouken - Stone Ocean Part 2 - 06 [1080p][Multiple Subtitle][E433C33D].mkv";
  const tmdbClient = createFakeTmdbClient({
    tvResults: {
      "JoJo Bizarre Adventure Stone Ocean": stoneOceanResult,
      "JoJo's Bizarre Adventure: Stone Ocean": stoneOceanResult,
      "JOJO的奇妙冒险": stoneOceanResult,
    },
  });

  const plan = await buildPlanAsync(
    [
      {
        source: preferredSource,
        fid: "jojo-stone-ocean-kamigami-06",
      },
      {
        source: alternateSource,
        fid: "jojo-stone-ocean-erai-06",
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "动漫",
      tmdbClient,
      tmdbQueryIntervalMs: 0,
    },
  );

  assert.equal(plan.reviews.length, 0);
  assert.equal(plan.moves.length, 1);
  assert.equal(plan.collisions.length, 0);
  assert.equal(plan.summary.collisionCount, 0);
  assert.equal(plan.moves[0].source, preferredSource);
  assert.equal(
    plan.moves[0].targetPath,
    "动漫/JOJO的奇妙冒险.石之海/JOJO的奇妙冒险.石之海.S01/JOJO的奇妙冒险.石之海.S01E06.mkv",
  );
  assert.ok(plan.deletes.some((item) => item.wrapperDir === alternateSource));
});

test("tmdb-normalize 在合并目录时会按最新来源优先自动择优重复分集", async () => {
  const theBoysResult = [
    {
      id: 76479,
      name: "黑袍纠察队",
      original_name: "The Boys",
      first_air_date: "2019-07-25",
      popularity: 90,
    },
  ];
  const tmdbClient = createFakeTmdbClient({
    tvResults: {
      "黑袍纠察队": theBoysResult,
      "The Boys": theBoysResult,
    },
  });

  const plan = await buildPlanAsync(
    [
      {
        source: "黑袍纠察队",
        cid: "boys-merge-root-1",
        isDir: true,
      },
      {
        source: "黑袍纠察队(1)",
        cid: "boys-merge-root-2",
        isDir: true,
      },
      {
        source: "黑袍纠察队/Season 01",
        cid: "boys-merge-season-1",
        isDir: true,
      },
      {
        source: "黑袍纠察队(1)/Season 01",
        cid: "boys-merge-season-2",
        isDir: true,
      },
      {
        source: "黑袍纠察队/Season 01/The.Boys.S01E01.1080p.WEB-DL.mkv",
        fid: "boys-merge-file-1",
      },
      {
        source: "黑袍纠察队(1)/Season 01/The.Boys.S01E01.1080p.WEB-DL.mkv",
        fid: "boys-merge-file-2",
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "剧集",
      tmdbClient,
      zeroReviewFinalizer: false,
    },
  );

  assert.equal(plan.reviews.length, 0);
  assert.equal(plan.moves.length, 1);
  assert.equal(plan.moves[0].source, "黑袍纠察队/Season 01/The.Boys.S01E01.1080p.WEB-DL.mkv");
  assert.equal(plan.summary.mergeConflictResolvedCount, 1);
  assert.equal(plan.summary.mergeConflictReviewCount, 0);
});

test("tmdb-normalize 在无法稳定择优时会回退 merge-conflict review", async () => {
  const theBoysResult = [
    {
      id: 76479,
      name: "黑袍纠察队",
      original_name: "The Boys",
      first_air_date: "2019-07-25",
      popularity: 90,
    },
  ];
  const tmdbClient = createFakeTmdbClient({
    tvResults: {
      "黑袍纠察队": theBoysResult,
      "The Boys": theBoysResult,
    },
  });

  const plan = await buildPlanAsync(
    [
      {
        source: "黑袍纠察队(1)",
        cid: "boys-conflict-root-1",
        isDir: true,
      },
      {
        source: "黑袍纠察队(2)",
        cid: "boys-conflict-root-2",
        isDir: true,
      },
      {
        source: "黑袍纠察队(1)/Season 01",
        cid: "boys-conflict-season-1",
        isDir: true,
      },
      {
        source: "黑袍纠察队(2)/Season 01",
        cid: "boys-conflict-season-2",
        isDir: true,
      },
      {
        source: "黑袍纠察队(1)/Season 01/The.Boys.S01E01.1080p.WEB-DL.mkv",
        fid: "boys-conflict-file-1",
      },
      {
        source: "黑袍纠察队(2)/Season 01/The.Boys.S01E01.1080p.WEB-DL.mkv",
        fid: "boys-conflict-file-2",
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "剧集",
      tmdbClient,
      zeroReviewFinalizer: false,
    },
  );

  const mergeConflictReviews = plan.reviews.filter((item) => item.reviewReason === "merge-conflict");

  assert.equal(plan.moves.length, 0);
  assert.equal(mergeConflictReviews.length, 2);
  assert.equal(plan.summary.mergeConflictResolvedCount, 0);
  assert.equal(plan.summary.mergeConflictReviewCount, 1);
});

test("tmdb-normalize 会用组内已命中的分集上下文回填 Snowpiercer 根目录 miss", async () => {
  const snowpiercerResults = [
    {
      id: 79680,
      name: "雪国列车",
      original_name: "Snowpiercer",
      first_air_date: "2020-05-17",
      popularity: 40,
    },
  ];
  const tmdbClient = createFakeTmdbClient({
    tvResults: {
      Snowpiercer: snowpiercerResults,
    },
  });

  const plan = await buildPlanAsync(
    [
      {
        source: "Snowpiercer The Universe Is Indifferent NTG",
        cid: "snow-root-1",
        isDir: true,
      },
      {
        source: "Snowpiercer The Universe Is Indifferent NTG/Season 01",
        cid: "snow-season-1",
        isDir: true,
      },
      {
        source: "Snowpiercer The Universe Is Indifferent NTG/Season 01/Snowpiercer.S01E07.The.Universe.Is.Indifferent.1080p.WEB-DL.mkv",
        fid: "snow-file-1",
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "剧集",
      tmdbClient,
    },
  );

  const rootMove = plan.moves.find((item) => item.source === "Snowpiercer The Universe Is Indifferent NTG");
  const seasonMove = plan.moves.find((item) => item.source === "Snowpiercer The Universe Is Indifferent NTG/Season 01");
  const episodeMove = plan.moves.find((item) => item.source.includes("S01E07"));

  assert.equal(plan.reviews.length, 0);
  assert.equal(plan.moves.length, 3);
  assert.equal(rootMove.matchSource, "llm-fallback");
  assert.equal(rootMove.reason, "llm-fallback");
  assert.equal(rootMove.targetPath, "剧集/雪国列车");
  assert.equal(seasonMove.matchSource, "llm-fallback");
  assert.equal(seasonMove.targetPath, "剧集/雪国列车/雪国列车.S01");
  assert.equal(episodeMove.matchSource, "tmdb");
});

test("tmdb-normalize 在 llm fallback 置信度足够高时会直接产出 moves", async () => {
  const llmResolver = async () => ({
    resolved: true,
    canonicalTitleZh: "万万没想到",
    canonicalTitleEn: "Unexpectedness",
    confidence: 0.9,
    reason: "llm-fallback",
  });
  Object.defineProperty(llmResolver, "llmFallbackMetadata", {
    value: {
      configured: true,
      model: "gpt-test",
      baseUrl: "https://example.test/v1",
    },
  });

  const plan = await buildPlanAsync(
    [
      {
        source: "万万没想到 1 3季全集+电影 影视魔王",
        cid: "wanwan-root-1",
        isDir: true,
      },
      {
        source: "万万没想到 1 3季全集+电影 影视魔王/S01",
        cid: "wanwan-season-1",
        isDir: true,
      },
      {
        source: "万万没想到 1 3季全集+电影 影视魔王/S01/万万没想到 01 低成本武侠篇.mkv",
        fid: "wanwan-file-1",
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "剧集",
      tmdbClient: createFakeTmdbClient(),
      llmResolver,
    },
  );

  assert.equal(plan.reviews.length, 0);
  assert.equal(plan.moves.length, 3);
  assert.ok(plan.moves.every((item) => item.matchSource === "llm-fallback"));
  assert.ok(plan.moves.every((item) => item.reason === "llm-fallback"));
  assert.equal(plan.llmFallbackSummary.enabled, true);
  assert.equal(plan.llmFallbackSummary.configured, true);
  assert.equal(plan.llmFallbackSummary.model, "gpt-test");
  assert.equal(plan.llmFallbackSummary.baseUrl, "https://example.test/v1");
  assert.equal(plan.llmFallbackSummary.callCount, 1);
  assert.equal(plan.llmFallbackSummary.resolvedCount, 1);
  assert.equal(plan.llmFallbackSummary.rejectedCount, 0);
  assert.equal(plan.llmFallbackSummary.errorCount, 0);
  assert.match(renderPlanSummary(plan), /LLM fallback: 已启用/u);
});

test("tmdb-normalize 在 llm fallback 置信度不足时会转入未识别媒体保留区", async () => {
  const plan = await buildPlanAsync(
    [
      {
        source: "万万没想到 1 3季全集+电影 影视魔王",
        cid: "wanwan-low-root-1",
        isDir: true,
      },
      {
        source: "万万没想到 1 3季全集+电影 影视魔王/S01",
        cid: "wanwan-low-season-1",
        isDir: true,
      },
      {
        source: "万万没想到 1 3季全集+电影 影视魔王/S01/万万没想到 01 低成本武侠篇.mkv",
        fid: "wanwan-low-file-1",
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "剧集",
      tmdbClient: createFakeTmdbClient(),
      llmResolver: async () => ({
        resolved: true,
        canonicalTitleZh: "万万没想到",
        canonicalTitleEn: "Unexpectedness",
        confidence: 0.84,
        reason: "llm-fallback",
      }),
    },
  );

  assert.equal(plan.moves.length, 3);
  assert.equal(plan.reviews.length, 0);
  assert.ok(plan.moves.every((item) => item.matchSource === "zero-review-finalizer"));
  assert.ok(plan.moves.every((item) => item.targetPath.startsWith("整理保留区/未识别媒体/")));
  assert.equal(plan.summary.reviewCount, 0);
  assert.equal(plan.summary.reviewReasonCounts["tmdb-miss"], 3);
  assert.equal(plan.zeroReviewSummary.inputReviewCount, 3);
  assert.equal(plan.zeroReviewSummary.quarantineCount, 3);
  assert.equal(plan.llmFallbackSummary.enabled, true);
  assert.equal(plan.llmFallbackSummary.callCount, 2);
  assert.equal(plan.llmFallbackSummary.resolvedCount, 0);
  assert.equal(plan.llmFallbackSummary.rejectedCount, 2);
  assert.equal(plan.llmFallbackSummary.errorCount, 0);
  assert.equal(plan.llmFallbackSummary.rejectedReasonCounts["low-confidence"], 2);
  assert.match(renderPlanSummary(plan), /LLM fallback 拒绝原因: low-confidence=2/u);
  assert.match(renderPlanSummary(plan), /零 Review finalizer: 已启用，review 3 -> 0，保留区 3/u);
});

test("tmdb-normalize 在 llm fallback 关闭时会写出未启用诊断且不调用", async () => {
  const plan = await buildPlanAsync(
    [
      {
        source: "万万没想到 1 3季全集+电影 影视魔王",
        cid: "wanwan-disabled-root-1",
        isDir: true,
      },
      {
        source: "万万没想到 1 3季全集+电影 影视魔王/S01",
        cid: "wanwan-disabled-season-1",
        isDir: true,
      },
      {
        source: "万万没想到 1 3季全集+电影 影视魔王/S01/万万没想到 01 低成本武侠篇.mkv",
        fid: "wanwan-disabled-file-1",
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "剧集",
      tmdbClient: createFakeTmdbClient(),
      llmResolver: null,
      llmResolverOptions: {
        apiKey: "",
      },
    },
  );

  assert.equal(plan.llmFallbackSummary.enabled, false);
  assert.equal(plan.llmFallbackSummary.configured, false);
  assert.equal(plan.llmFallbackSummary.callCount, 0);
  assert.equal(plan.llmFallbackSummary.resolvedCount, 0);
  assert.equal(plan.llmFallbackSummary.rejectedCount, 0);
  assert.equal(plan.llmFallbackSummary.errorCount, 0);
});

test("tmdb-normalize 在 llm fallback 抛错时会转入保留区并写出失败诊断", async () => {
  const plan = await buildPlanAsync(
    [
      {
        source: "万万没想到 1 3季全集+电影 影视魔王",
        cid: "wanwan-error-root-1",
        isDir: true,
      },
      {
        source: "万万没想到 1 3季全集+电影 影视魔王/S01",
        cid: "wanwan-error-season-1",
        isDir: true,
      },
      {
        source: "万万没想到 1 3季全集+电影 影视魔王/S01/万万没想到 01 低成本武侠篇.mkv",
        fid: "wanwan-error-file-1",
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "剧集",
      tmdbClient: createFakeTmdbClient(),
      llmResolver: async () => {
        throw new Error("resolver down");
      },
    },
  );

  assert.equal(plan.moves.length, 3);
  assert.equal(plan.reviews.length, 0);
  assert.ok(plan.moves.every((item) => item.matchSource === "zero-review-finalizer"));
  assert.ok(plan.moves.every((item) => item.targetPath.startsWith("整理保留区/未识别媒体/")));
  assert.equal(plan.summary.reviewCount, 0);
  assert.equal(plan.summary.reviewReasonCounts["tmdb-miss"], 3);
  assert.equal(plan.zeroReviewSummary.inputReviewCount, 3);
  assert.equal(plan.zeroReviewSummary.quarantineCount, 3);
  assert.equal(plan.llmFallbackSummary.enabled, true);
  assert.equal(plan.llmFallbackSummary.callCount, 2);
  assert.equal(plan.llmFallbackSummary.resolvedCount, 0);
  assert.equal(plan.llmFallbackSummary.rejectedCount, 0);
  assert.equal(plan.llmFallbackSummary.errorCount, 2);
  assert.equal(plan.llmFallbackSummary.errorReasonCounts["resolver down"], 2);
  assert.match(renderPlanSummary(plan), /LLM fallback 失败原因: resolver down=2/u);
});

test("tmdb-normalize 零 Review finalizer 会把附属资料、安装包和种子放入保留区", async () => {
  const plan = await buildPlanAsync(
    [
      {
        source: "某动画/Scans",
        cid: "scan-dir-1",
        isDir: true,
      },
      {
        source: "Parallels Desktop.dmg",
        fid: "software-file-1",
      },
      {
        source: "ubuntu.torrent",
        fid: "torrent-file-1",
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "动漫",
      tmdbClient: createFakeTmdbClient(),
    },
  );

  const targetBySource = new Map(plan.moves.map((item) => [item.source, item.targetPath]));

  assert.equal(plan.reviews.length, 0);
  assert.equal(plan.summary.reviewCount, 0);
  assert.equal(plan.zeroReviewSummary.inputReviewCount, 3);
  assert.equal(plan.zeroReviewSummary.quarantineCount, 3);
  assert.equal(plan.zeroReviewSummary.fallbackBucketCounts["附属资料"], 1);
  assert.equal(plan.zeroReviewSummary.fallbackBucketCounts["软件安装包"], 1);
  assert.equal(plan.zeroReviewSummary.fallbackBucketCounts["种子文件"], 1);
  assert.equal(targetBySource.get("某动画/Scans"), "整理保留区/附属资料/某动画/Scans");
  assert.equal(targetBySource.get("Parallels Desktop.dmg"), "整理保留区/软件安装包/Parallels Desktop.dmg");
  assert.equal(targetBySource.get("ubuntu.torrent"), "整理保留区/种子文件/ubuntu.torrent");
});

test("tmdb-normalize 零 Review finalizer 会接受 LLM 高置信影视身份", async () => {
  const llmResolver = async (context) => {
    assert.equal(context.task, "zero-review-finalizer");
    return {
      resolved: true,
      confidence: 0.92,
      classifications: [
        {
          source: "Unknown.Movie.2024.mkv",
          kind: "movie",
          confidence: 0.92,
          canonicalTitle: "未知电影",
          canonicalTitleEn: "Unknown Movie",
          tmdbType: "movie",
          tmdbId: 123,
        },
      ],
    };
  };

  const plan = await buildPlanAsync(
    [
      {
        source: "Unknown.Movie.2024.mkv",
        fid: "unknown-movie-1",
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "电影",
      tmdbClient: createFakeTmdbClient(),
      llmResolver,
    },
  );

  assert.equal(plan.reviews.length, 0);
  assert.equal(plan.moves.length, 1);
  assert.equal(plan.moves[0].matchSource, "llm-fallback");
  assert.equal(plan.moves[0].targetPath, "电影/未知电影.Unknown.Movie (2024)/未知电影.Unknown.Movie.mkv");
  assert.equal(plan.summary.reviewReasonCounts["tmdb-miss"], 1);
  assert.equal(plan.zeroReviewSummary.llmClassifiedCount, 1);
  assert.equal(plan.llmFallbackSummary.callCount, 1);
  assert.equal(plan.llmFallbackSummary.resolvedCount, 1);
});

test("tmdb-normalize 会用资源包上下文保护 01-16TV全集+SP 正片并保留附属视频", async () => {
  const resourceRoot = "[DBD-Raws][Re：从零开始的异世界生活 S03][01-16TV全集+SP]";
  const mainEpisodeSources = Array.from({ length: 16 }, (_, index) => {
    return `${resourceRoot}/[${String(index + 1).padStart(2, "0")}].mkv`;
  });
  const supplementalVideoSources = [
    `${resourceRoot}/NCOP&NCED/NCOP.mkv`,
    `${resourceRoot}/PV/[DBD-Raws][Re：从零开始的异世界生活][PV][05].mkv`,
    `${resourceRoot}/迷你动画/[DBD-Raws][Re：从零开始的异世界生活 Break Time][05].mkv`,
    `${resourceRoot}/menu/menu01.mkv`,
  ];
  let zeroReviewContext = null;

  const llmResolver = async (context) => {
    if (context.task !== "zero-review-finalizer") {
      return {
        resolved: false,
      };
    }

    zeroReviewContext = context;
    return {
      classifications: [
        ...mainEpisodeSources.map((source) => ({
          source,
          kind: "main_episode",
          confidence: 0.92,
          canonicalTitle: "Re：从零开始的异世界生活",
          canonicalTitleEn: "Re:ZERO -Starting Life in Another World-",
          tmdbType: "tv",
        })),
        ...supplementalVideoSources.map((source) => ({
          source,
          kind: source.includes("/迷你动画/")
            ? "mini_anime"
            : source.includes("/menu/")
              ? "menu"
              : source.includes("/PV/")
                ? "pv_cm"
                : "opening_ending",
          confidence: 0.95,
          targetBucket: "supplement",
        })),
      ],
    };
  };

  const plan = await buildPlanAsync(
    [
      ...mainEpisodeSources.map((source, index) => ({
        source,
        fid: `rezero-main-${index + 1}`,
        size: 1_500_000_000 + index,
      })),
      ...supplementalVideoSources.map((source, index) => ({
        source,
        fid: `rezero-extra-${index + 1}`,
        size: 80_000_000 + index,
      })),
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "动漫",
      tmdbClient: createFakeTmdbClient(),
      tmdbQueryIntervalMs: 0,
      llmResolver,
    },
  );

  const deleteSourceSet = new Set(plan.deletes.map((item) => item.wrapperDir));
  const targetBySource = new Map(plan.moves.map((item) => [item.source, item.targetPath]));
  const resourcePackage = zeroReviewContext.resourcePackages.find((item) => item.rootSource === resourceRoot);
  const episode08Context = resourcePackage.videoBatch.find((item) => item.source === `${resourceRoot}/[08].mkv`);
  const pvContext = resourcePackage.videoBatch.find((item) => item.source.includes("/PV/"));
  const miniAnimeContext = resourcePackage.videoBatch.find((item) => item.source.includes("/迷你动画/"));

  assert.equal(plan.summary.reviewCount, 0);
  assert.equal(plan.reviews.length, 0);
  assert.equal(deleteSourceSet.has(`${resourceRoot}/[08].mkv`), false);
  assert.ok(mainEpisodeSources.every((source) => !deleteSourceSet.has(source)));
  assert.ok(supplementalVideoSources.every((source) => !deleteSourceSet.has(source)));
  assert.ok(mainEpisodeSources.every((source, index) => targetBySource.get(source).endsWith(`S03E${String(index + 1).padStart(2, "0")}.mkv`)));
  assert.ok(supplementalVideoSources.every((source) => targetBySource.get(source).startsWith("整理保留区/附属资料/")));
  assert.ok(!targetBySource.get(`${resourceRoot}/迷你动画/[DBD-Raws][Re：从零开始的异世界生活 Break Time][05].mkv`).includes("S03E05"));
  assert.equal(plan.zeroReviewSummary.resourceBatchCount, 1);
  assert.equal(plan.zeroReviewSummary.llmBatchClassifiedCount, 20);
  assert.equal(plan.zeroReviewSummary.llmClassifiedCount, 16);
  assert.equal(plan.zeroReviewSummary.mainEpisodeProtectedCount, 16);
  assert.equal(resourcePackage.episodeRangeHint.mainEpisodeRange.start, 1);
  assert.equal(resourcePackage.episodeRangeHint.mainEpisodeRange.end, 16);
  assert.equal(resourcePackage.episodeRangeHint.specialEpisodeHint, true);
  assert.equal(resourcePackage.videoBatch.length, 20);
  assert.equal(episode08Context.protectedMainEpisode, true);
  assert.equal(episode08Context.fileLevelExtraMarker, false);
  assert.equal(episode08Context.rootSource, resourceRoot);
  assert.equal(episode08Context.parentDir, resourceRoot);
  assert.equal(episode08Context.size, 1_500_000_007);
  assert.equal(episode08Context.sizeRankInPackage, 9);
  assert.equal(pvContext.rootSource, resourceRoot);
  assert.equal(pvContext.parentDir, `${resourceRoot}/PV`);
  assert.equal(pvContext.size, 80_000_001);
  assert.equal(pvContext.explicitExtraDirectoryAncestor, true);
  assert.equal(miniAnimeContext.parentDir, `${resourceRoot}/迷你动画`);
  assert.equal(miniAnimeContext.size, 80_000_002);
  assert.equal(miniAnimeContext.explicitExtraDirectoryAncestor, true);
  assert.equal(episode08Context.ruleDiagnostics.includes("main-episode-protected-by-resource-range"), true);
});

test("tmdb-normalize 零 Review finalizer 会给保留区目标冲突追加短 hash", async () => {
  const plan = await buildPlanAsync(
    [
      {
        source: "Bad Name.mkv",
        fid: "bad-name-1",
      },
      {
        source: "Bad  Name.mkv",
        fid: "bad-name-2",
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "电影",
      tmdbClient: createFakeTmdbClient(),
    },
  );

  const targetPaths = plan.moves.map((item) => item.targetPath).sort();

  assert.equal(plan.reviews.length, 0);
  assert.equal(plan.collisions.length, 0);
  assert.equal(new Set(targetPaths).size, 2);
  assert.ok(targetPaths.includes("整理保留区/未识别媒体/Bad Name.mkv"));
  assert.ok(targetPaths.some((item) => /^整理保留区\/未识别媒体\/Bad Name\.[a-z0-9]{6}\.mkv$/u.test(item)));
});

test("tmdb-normalize 会让 万万没想到 的番外在同季保留原文件名，避免与正片撞号", async () => {
  const plan = await buildPlanAsync(
    [
      {
        source: "万万没想到 1 3季全集+电影 影视魔王",
        cid: "wanwan-season-root",
        isDir: true,
      },
      {
        source: "万万没想到 1 3季全集+电影 影视魔王/S01",
        cid: "wanwan-season-s01",
        isDir: true,
      },
      {
        source: "万万没想到 1 3季全集+电影 影视魔王/S01/万万没想到 01 低成本武侠篇.mkv",
        fid: "wanwan-season-main",
      },
      {
        source: "万万没想到 1 3季全集+电影 影视魔王/S01/《万万没想到》番外篇 第一话：导演外出了.mkv",
        fid: "wanwan-season-side",
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "剧集",
      tmdbClient: createFakeTmdbClient(),
    },
  );

  const moveBySource = new Map(plan.moves.map((item) => [item.source, item.targetPath]));

  assert.equal(plan.collisions.length, 0);
  assert.equal(
    moveBySource.get("万万没想到 1 3季全集+电影 影视魔王/S01/万万没想到 01 低成本武侠篇.mkv"),
    "剧集/万万没想到/万万没想到.S01/万万没想到.S01E01.mkv",
  );
  assert.equal(
    moveBySource.get("万万没想到 1 3季全集+电影 影视魔王/S01/《万万没想到》番外篇 第一话：导演外出了.mkv"),
    "剧集/万万没想到/万万没想到.S01/《万万没想到》番外篇 第一话：导演外出了.mkv",
  );
});

test("tmdb-normalize 会把 万万没想到 的广告附件删掉，并把外传目录并到同一剧集根目录", async () => {
  const plan = await buildPlanAsync(
    [
      {
        source: "万万没想到 1 3季全集+电影 影视魔王",
        cid: "wanwan-safe-root",
        isDir: true,
      },
      {
        source: "万万没想到 1 3季全集+电影 影视魔王/S01",
        cid: "wanwan-safe-season",
        isDir: true,
      },
      {
        source: "万万没想到 1 3季全集+电影 影视魔王/S01/万万没想到 01 低成本武侠篇.mkv",
        fid: "wanwan-safe-episode",
      },
      {
        source: "万万没想到 1 3季全集+电影 影视魔王/S01/5000T实时同步更新各类资源总链接文档.docx",
        fid: "wanwan-safe-docx",
      },
      {
        source: "万万没想到 1 3季全集+电影 影视魔王/外传-小兵过年",
        cid: "wanwan-safe-side-story",
        isDir: true,
      },
      {
        source: "万万没想到 1 3季全集+电影 影视魔王/外传-小兵过年/万万没想到之小兵过年 01：请假ing.mkv",
        fid: "wanwan-safe-side-story-episode",
      },
    ],
    {
      mode: "tmdb-normalize",
      rootPath: "剧集",
      tmdbClient: createFakeTmdbClient(),
    },
  );

  const llmFallbackMoves = plan.moves.filter((item) => item.matchSource === "llm-fallback");
  const moveBySource = new Map(plan.moves.map((item) => [item.source, item.targetPath]));

  assert.deepEqual(
    llmFallbackMoves.map((item) => item.source).sort(),
    [
      "万万没想到 1 3季全集+电影 影视魔王",
      "万万没想到 1 3季全集+电影 影视魔王/S01",
      "万万没想到 1 3季全集+电影 影视魔王/S01/万万没想到 01 低成本武侠篇.mkv",
      "万万没想到 1 3季全集+电影 影视魔王/外传-小兵过年",
      "万万没想到 1 3季全集+电影 影视魔王/外传-小兵过年/万万没想到之小兵过年 01：请假ing.mkv",
    ],
  );
  assert.equal(
    llmFallbackMoves.find((item) => item.source === "万万没想到 1 3季全集+电影 影视魔王").targetPath,
    "剧集/万万没想到",
  );
  assert.equal(
    llmFallbackMoves.find((item) => item.source === "万万没想到 1 3季全集+电影 影视魔王/S01").targetPath,
    "剧集/万万没想到/万万没想到.S01",
  );
  assert.equal(
    llmFallbackMoves.find((item) => item.source.endsWith("低成本武侠篇.mkv")).targetPath,
    "剧集/万万没想到/万万没想到.S01/万万没想到.S01E01.mkv",
  );
  assert.equal(
    moveBySource.get("万万没想到 1 3季全集+电影 影视魔王/外传-小兵过年"),
    "剧集/万万没想到/外传-小兵过年",
  );
  assert.equal(
    moveBySource.get("万万没想到 1 3季全集+电影 影视魔王/外传-小兵过年/万万没想到之小兵过年 01：请假ing.mkv"),
    "剧集/万万没想到/外传-小兵过年/万万没想到之小兵过年 01：请假ing.mkv",
  );
  assert.deepEqual(
    plan.deletes.map((item) => item.wrapperDir),
    ["万万没想到 1 3季全集+电影 影视魔王/S01/5000T实时同步更新各类资源总链接文档.docx"],
  );
  assert.equal(plan.reviews.length, 0);
});

test("tmdb-normalize 生成的 plan 摘要会保留命中和待确认信息", async () => {
  const plan = await buildPlanAsync(
    [
      {
        source: "Spirited.Away.2001.1080p.BluRay.x265.mkv",
        fid: "movie-1",
      },
      {
        source: "Unknown.Movie.2024.mkv",
        fid: "movie-2",
      },
    ],
    {
      mode: "tmdb-normalize",
      zeroReviewFinalizer: false,
      tmdbClient: createFakeTmdbClient({
        movieResults: {
          "Spirited Away": [
            {
              id: 129,
              title: "千与千寻",
              original_title: "Spirited Away",
              release_date: "2001-07-20",
              popularity: 50,
            },
          ],
          "Unknown Movie": [],
        },
        movieDetails: {
          129: {
            original_title: "Spirited Away",
            translations: {
              translations: [
                {
                  iso_639_1: "en",
                  data: {
                    title: "Spirited Away",
                  },
                },
              ],
            },
          },
        },
      }),
    },
  );

  assert.equal(plan.mode, "tmdb-normalize");
  assert.equal(plan.moves.length, 1);
  assert.equal(plan.moves[0].tmdbId, 129);
  assert.equal(plan.reviews.length, 1);
  assert.equal(plan.reviews[0].source, "Unknown.Movie.2024.mkv");

  const summary = renderPlanSummary(plan);
  assert.match(summary, /TMDB 命中: 1/u);
  assert.match(summary, /TMDB miss: 1/u);
  assert.match(summary, /待人工确认: 1/u);
});
