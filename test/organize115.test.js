import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPlan,
  buildTitle,
  extractEpisode,
  extractSeason,
  renderPlanSummary,
} from "../src/organize115.js";

test("buildTitle 会清理重复后缀、空括号和 release group", () => {
  assert.equal(buildTitle("Rick And Morty(1)"), "Rick And Morty");
  assert.equal(buildTitle("Foundation (2023)"), "Foundation");
  assert.equal(buildTitle("Warrior Nun NTG"), "Warrior Nun");
  assert.equal(
    buildTitle("纸牌屋 [全13集][简繁英字幕] House of Cards V2"),
    "纸牌屋 House of Cards",
  );
  assert.equal(
    buildTitle("[BD ]Arcane 网飞版无删减 全9集 HD1080P 国英双语 中英双字"),
    "Arcane",
  );
  assert.equal(
    buildTitle("七王国的骑士 [全6集][简繁英字幕] 1 H 264"),
    "七王国的骑士 1",
  );
  assert.equal(
    buildTitle("大明王朝1566 EP01 HD1080P Mandarin BDE4"),
    "大明王朝1566",
  );
});

test("extractSeason/extractEpisode 会识别下划线后缀和单独 E01", () => {
  assert.equal(extractSeason("Alien.Earth_S01E07_Emergence"), 1);
  assert.equal(extractEpisode("Alien.Earth_S01E07_Emergence", "series"), 7);
  assert.equal(extractEpisode("Chinese.Paladin.2005.E01.1080p", "series"), 1);
});

test("extractEpisode/buildTitle 会识别动漫松散单集并继续排除批量与特典标记", () => {
  assert.equal(
    extractEpisode("[LoliHouse] Mashle - 02 [WebRip 1080p HEVC-10bit AAC SRTx2]", "anime"),
    2,
  );
  assert.equal(
    extractEpisode("[LoliHouse] Mashle - 02v2 [WebRip 1080p HEVC-10bit AAC SRTx2]", "anime"),
    2,
  );
  assert.equal(extractEpisode("物理魔法使马修 第02話", "anime"), 2);
  assert.equal(extractEpisode("Mashle 01v2", "anime"), 1);
  assert.equal(
    extractEpisode("[LoliHouse] Mashle - 06.5 [WebRip 1080p HEVC-10bit AAC SRTx2]", "anime"),
    null,
  );
  assert.equal(
    extractEpisode("[LoliHouse] Mashle - SP [WebRip 1080p HEVC-10bit AAC SRTx2]", "anime"),
    null,
  );
  assert.equal(
    extractEpisode("[LoliHouse] Mashle - NCOP [WebRip 1080p HEVC-10bit AAC SRTx2]", "anime"),
    null,
  );
  assert.equal(
    extractEpisode("[LoliHouse] Mashle - Music [WebRip 1080p HEVC-10bit AAC SRTx2]", "anime"),
    null,
  );
  assert.equal(extractEpisode("Mashle 01-12", "anime"), null);
  assert.equal(extractEpisode("Mashle [01 12]", "anime"), null);
  assert.equal(buildTitle("[LoliHouse] Mashle - 02v2 [WebRip 1080p HEVC-10bit AAC SRTx2]"), "Mashle");
  assert.equal(buildTitle("[LoliHouse] Mashle - 02 END [WebRip 1080p HEVC-10bit AAC SRTx2]"), "Mashle");
  assert.equal(buildTitle("[LoliHouse] Mashle - 06.5 [WebRip 1080p HEVC-10bit AAC SRTx2]"), "Mashle");
  assert.equal(buildTitle("Mashle [01 12]"), "Mashle");
});

test("extractEpisode 会识别最后一个安全方括号集号并继续排除非单集方括号", () => {
  assert.equal(
    extractEpisode("[A.I.R.nesSub&TxxZ][JoJo's_Bizarre_Adventure_SC][03][BDRIP][1920x1080][HEVC_Ma10P_DTSMA]", "anime"),
    3,
  );
  assert.equal(
    extractEpisode("[KitaujiSub] Mushoku Tensei - S2 [01][WebRip][HEVC_AAC][CHS&CHT]", "series"),
    1,
  );
  assert.equal(
    extractEpisode("[Kamigami] JoJo's Bizarre Adventure - Stone Ocean - 02 [Web 1080p x265 Ma10p E-AC3]", "anime"),
    2,
  );
  assert.equal(extractEpisode("[JOJO&UHA-WING] JoJo's Bizarre Adventure [BDRIP][1920x1080]", "anime"), null);
  assert.equal(extractEpisode("JoJo's Bizarre Adventure [1080p]", "anime"), null);
  assert.equal(extractEpisode("JoJo's Bizarre Adventure [Multiple Subtitle]", "anime"), null);
  assert.equal(extractEpisode("JoJo's Bizarre Adventure [CHS&CHT]", "anime"), null);
  assert.equal(extractEpisode("JoJo's Bizarre Adventure [01 12]", "anime"), null);
  assert.equal(extractEpisode("JoJo's Bizarre Adventure [01-12]", "anime"), null);
  assert.equal(extractEpisode("JoJo's Bizarre Adventure [NCOP]", "anime"), null);
  assert.equal(extractEpisode("JoJo's Bizarre Adventure [NCED]", "anime"), null);
  assert.equal(extractEpisode("JoJo's Bizarre Adventure [SP]", "anime"), null);
  assert.equal(extractEpisode("JoJo's Bizarre Adventure [Music]", "anime"), null);
});

test("flatten-wrapper-dir 只迁移视频并生成删除目录计划", () => {
  const plan = buildPlan(
    [
      {
        source:
          "The.Mandalorian.S02E08.Chapter.16.The.Rescue.1080p.WEBRip.DDP5.1.Atmos.x264-MZABI[rarbg]",
        cid: "dir-1",
        isDir: true,
      },
      {
        source:
          "The.Mandalorian.S02E08.Chapter.16.The.Rescue.1080p.WEBRip.DDP5.1.Atmos.x264-MZABI[rarbg]/The.Mandalorian.S02E08.Chapter.16.The.Rescue.1080p.WEBRip.DDP5.1.Atmos.x264-MZABI.mkv",
        fid: "file-1",
      },
      {
        source:
          "The.Mandalorian.S02E08.Chapter.16.The.Rescue.1080p.WEBRip.DDP5.1.Atmos.x264-MZABI[rarbg]/The.Mandalorian.S02E08.Chapter.16.The.Rescue.1080p.WEBRip.DDP5.1.Atmos.x264-MZABI.srt",
        fid: "file-2",
      },
    ],
    {
      mode: "flatten-wrapper-dir",
      rootPath: "Season 02",
    },
  );

  assert.equal(plan.mode, "flatten-wrapper-dir");
  assert.equal(plan.moves.length, 1);
  assert.equal(plan.deletes.length, 1);
  assert.equal(plan.summary.moveCount, 1);
  assert.equal(plan.summary.deleteCount, 1);
  assert.equal(plan.summary.reviewCount, 0);
  assert.deepEqual(plan.moves.map((item) => item.targetPath), [
    "The.Mandalorian.S02E08.Chapter.16.The.Rescue.1080p.WEBRip.DDP5.1.Atmos.x264-MZABI.mkv",
  ]);
  assert.deepEqual(plan.deletes, [
    {
      wrapperDir:
        "The.Mandalorian.S02E08.Chapter.16.The.Rescue.1080p.WEBRip.DDP5.1.Atmos.x264-MZABI[rarbg]",
      wrapperDirCid: "dir-1",
      moveCount: 1,
      strategy: "delete-wrapper-dir",
      reason: "视频迁移完成后删除多余包裹目录",
    },
  ]);
  assert.match(renderPlanSummary(plan), /待删除条目: 1/u);
});

test("classify 会剪枝已在目标路径的 no-op，并保护已占用目标路径", () => {
  const plan = buildPlan(
    [
      {
        source: "Movie Release (2024)/Movie Release (2024).mkv",
        fid: "movie-noop-1",
      },
      {
        source: "Movie.Release.2024.mkv",
        fid: "movie-old-1",
      },
    ],
    {
      rootPath: "电影",
    },
  );

  assert.equal(plan.moves.length, 0);
  assert.equal(plan.reviews.length, 1);
  assert.equal(plan.reviews[0].source, "Movie.Release.2024.mkv");
  assert.equal(plan.reviews[0].reviewReason, "collision");
  assert.equal(plan.summary.moveCount, 0);
  assert.equal(plan.summary.reviewCount, 1);
  assert.equal(plan.summary.collisionCount, 1);
  assert.deepEqual(plan.collisions[0].sources.sort(), [
    "Movie Release (2024)/Movie Release (2024).mkv",
    "Movie.Release.2024.mkv",
  ]);
});

test("flatten-wrapper-dir 会处理电影根目录下的一层包裹目录", () => {
  const plan = buildPlan(
    [
      {
        source: "Movie.Release.2024",
        cid: "dir-1",
        isDir: true,
      },
      {
        source: "Movie.Release.2024/Movie.Release.2024.mkv",
        fid: "file-1",
      },
      {
        source: "Movie.Release.2024/Movie.Release.2024.nfo",
        fid: "file-2",
      },
    ],
    {
      mode: "flatten-wrapper-dir",
      rootPath: "电影",
    },
  );

  assert.equal(plan.moves.length, 1);
  assert.equal(plan.deletes.length, 1);
  assert.equal(plan.summary.reviewCount, 0);
  assert.deepEqual(plan.moves.map((item) => item.targetPath), ["Movie.Release.2024.mkv"]);
  assert.equal(plan.deletes[0].wrapperDir, "Movie.Release.2024");
});

test("flatten-wrapper-dir 遇到一层字幕目录时只迁移视频并删除 wrapper", () => {
  const plan = buildPlan(
    [
      {
        source: "Release.Dir",
        cid: "dir-1",
        isDir: true,
      },
      {
        source: "Release.Dir/video.mkv",
        fid: "file-1",
      },
      {
        source: "Release.Dir/Subs",
        cid: "dir-2",
        isDir: true,
      },
      {
        source: "Release.Dir/Subs/video.zh.srt",
        fid: "file-2",
      },
      {
        source: "Release.Dir/Subtitles",
        cid: "dir-3",
        isDir: true,
      },
      {
        source: "Release.Dir/Subtitles/video.zh.ass",
        fid: "file-3",
      },
      {
        source: "Release.Dir/Subtitles/poster.jpg",
        fid: "file-4",
      },
    ],
    {
      mode: "flatten-wrapper-dir",
      rootPath: "Season 02",
    },
  );

  assert.equal(plan.moves.length, 1);
  assert.equal(plan.deletes.length, 1);
  assert.equal(plan.summary.reviewCount, 0);
  assert.deepEqual(plan.moves.map((item) => item.targetPath), ["video.mkv"]);
  assert.equal(plan.deletes[0].wrapperDir, "Release.Dir");
});

test("flatten-wrapper-dir 会允许一层 media bundle 目录并删除外层 wrapper", () => {
  const plan = buildPlan(
    [
      {
        source: "Release.Dir",
        cid: "dir-1",
        isDir: true,
      },
      {
        source: "Release.Dir/Release.Bundle",
        cid: "dir-2",
        isDir: true,
      },
      {
        source: "Release.Dir/release.nfo",
        fid: "file-1",
      },
      {
        source: "Release.Dir/Release.Bundle/Release.Bundle.mkv",
        fid: "file-2",
      },
    ],
    {
      mode: "flatten-wrapper-dir",
      rootPath: "Season 02",
    },
  );

  assert.equal(plan.moves.length, 1);
  assert.equal(plan.deletes.length, 1);
  assert.equal(plan.summary.reviewCount, 0);
  assert.deepEqual(plan.moves.map((item) => item.targetPath), ["Release.Bundle.mkv"]);
  assert.equal(plan.deletes[0].wrapperDirCid, "dir-1");
});

test("flatten-wrapper-dir 遇到多视频目录时会跳过并进入 review", () => {
  const plan = buildPlan(
    [
      {
        source: "Release.Dir/episode-01.mkv",
        fid: "file-1",
      },
      {
        source: "Release.Dir/episode-02.mkv",
        fid: "file-2",
      },
    ],
    {
      mode: "flatten-wrapper-dir",
      rootPath: "Season 02",
    },
  );

  assert.equal(plan.moves.length, 0);
  assert.equal(plan.deletes.length, 0);
  assert.equal(plan.summary.reviewCount, 1);
  assert.equal(plan.reviews[0].reviewType, "multi-video");
  assert.deepEqual(plan.reviews[0].reviewSources.sort(), [
    "Release.Dir/episode-01.mkv",
    "Release.Dir/episode-02.mkv",
  ]);
});

test("flatten-wrapper-dir 遇到侧车目录里包视频时继续进入 review", () => {
  const plan = buildPlan(
    [
      {
        source: "Release.Dir/Subs",
        cid: "dir-1",
        isDir: true,
      },
      {
        source: "Release.Dir/Subs/video.mkv",
        fid: "file-1",
      },
    ],
    {
      mode: "flatten-wrapper-dir",
      rootPath: "Season 02",
    },
  );

  assert.equal(plan.moves.length, 0);
  assert.equal(plan.deletes.length, 0);
  assert.equal(plan.summary.reviewCount, 1);
  assert.equal(plan.reviews[0].reviewType, "nested-sidecar-dir");
  assert.match(plan.reviews[0].reason, /无法自动拍平/u);
});

test("flatten-wrapper-dir 遇到超过一层嵌套时会进入 review", () => {
  const plan = buildPlan(
    [
      {
        source: "Release.Dir",
        cid: "dir-1",
        isDir: true,
      },
      {
        source: "Release.Dir/video.mkv",
        fid: "file-1",
      },
      {
        source: "Release.Dir/Subs",
        cid: "dir-2",
        isDir: true,
      },
      {
        source: "Release.Dir/Subs/More",
        cid: "dir-3",
        isDir: true,
      },
      {
        source: "Release.Dir/Subs/More/video.zh.srt",
        fid: "file-2",
      },
    ],
    {
      mode: "flatten-wrapper-dir",
      rootPath: "Season 02",
    },
  );

  assert.equal(plan.moves.length, 0);
  assert.equal(plan.deletes.length, 0);
  assert.equal(plan.summary.reviewCount, 1);
  assert.equal(plan.reviews[0].reviewType, "nested-sidecar-dir");
  assert.match(plan.reviews[0].reason, /超过 1 层嵌套/u);
});

test("flatten-wrapper-dir 遇到杂项文件时不阻塞视频迁移", () => {
  const plan = buildPlan(
    [
      {
        source: "Release.Dir",
        cid: "dir-1",
        isDir: true,
      },
      {
        source: "Release.Dir/video.mkv",
        fid: "file-1",
      },
      {
        source: "Release.Dir/extra.txt",
        fid: "file-2",
      },
    ],
    {
      mode: "flatten-wrapper-dir",
      rootPath: "Season 02",
    },
  );

  assert.equal(plan.moves.length, 1);
  assert.equal(plan.deletes.length, 1);
  assert.equal(plan.summary.reviewCount, 0);
  assert.deepEqual(plan.moves.map((item) => item.targetPath), ["video.mkv"]);
});

test("flatten-wrapper-dir 对纯字幕目录不生成 move 或 delete", () => {
  const plan = buildPlan(
    [
      {
        source: "Season 01/Subs",
        cid: "dir-0",
        isDir: true,
      },
      {
        source: "Season 01/Subs/Episode.01",
        cid: "dir-1",
        isDir: true,
      },
      {
        source: "Season 01/Subs/Episode.02",
        cid: "dir-2",
        isDir: true,
      },
      {
        source: "Season 01/Subs/Episode.01/2_English.srt",
        fid: "file-1",
      },
      {
        source: "Season 01/Subs/Episode.02/2_English.srt",
        fid: "file-2",
      },
    ],
    {
      mode: "flatten-wrapper-dir",
      rootPath: "剧集",
    },
  );

  assert.equal(plan.moves.length, 0);
  assert.equal(plan.deletes.length, 0);
  assert.equal(plan.summary.reviewCount, 0);
  assert.equal(plan.summary.collisionCount, 0);
});

test("flatten-wrapper-dir 会处理 Season/Subs 下的分集包裹目录", () => {
  const plan = buildPlan(
    [
      {
        source: "Season 01/Subs",
        cid: "dir-0",
        isDir: true,
      },
      {
        source: "Season 01/Subs/Episode.01",
        cid: "dir-1",
        isDir: true,
      },
      {
        source: "Season 01/Subs/Episode.02",
        cid: "dir-2",
        isDir: true,
      },
      {
        source: "Season 01/Subs/Episode.01/Episode.01.mp4",
        fid: "file-1",
      },
      {
        source: "Season 01/Subs/Episode.01/2_English.srt",
        fid: "file-2",
      },
      {
        source: "Season 01/Subs/Episode.02/Episode.02.mp4",
        fid: "file-3",
      },
      {
        source: "Season 01/Subs/Episode.02/2_English.srt",
        fid: "file-4",
      },
    ],
    {
      mode: "flatten-wrapper-dir",
      rootPath: "剧集",
    },
  );

  assert.equal(plan.moves.length, 2);
  assert.equal(plan.deletes.length, 1);
  assert.equal(plan.summary.reviewCount, 0);
  assert.deepEqual(plan.moves.map((item) => item.targetPath).sort(), [
    "Season 01/Episode.01.mp4",
    "Season 01/Episode.02.mp4",
  ]);
  assert.equal(plan.deletes[0].wrapperDir, "Season 01/Subs");
  assert.equal(plan.deletes[0].moveCount, 2);
});
