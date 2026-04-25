import { path } from "./path-posix.js";

import {
  TMDB_NORMALIZE_MODE,
  buildActualSourceRelativePath,
  buildTargetPath,
  buildTitle,
  detectCategory,
  detectRole,
  extractEpisode,
  extractSeason,
  extractYear,
  inferSourceRootRelativePath,
  isNoopPlannedMove,
  loadCleanupOverrides,
  normalizeEntrySize,
  normalizeSourcePath,
  sanitizePathSegment,
} from "./organize115.js";
import { createTmdbClient } from "./tmdb-client.js";
import {
  createTmdbSearchScheduler,
  TMDB_QUERY_SCHEDULER_DEFAULTS,
} from "./tmdb-query-scheduler.js";
import { createOpenAiLlmResolver } from "./openai-llm-resolver-client.js";

const AUTO_ACCEPT_SCORE = 0.78;
const AMBIGUOUS_SCORE_GAP = 0.06;
const MIN_TITLE_SCORE = 0.55;
const DEFAULT_TMDB_LANGUAGE = "zh-CN";
const ENGLISH_SEARCH_LANGUAGE = "en-US";
const LLM_FALLBACK_MIN_CONFIDENCE = 0.85;
const MEDIA_ROUTING_MIN_CONFIDENCE = 0.85;
const MEDIA_ROUTING_TASK = "media-routing";
const MERGE_DELETE_STRATEGY = "merge-series-root";
const MERGE_DELETE_REASON = "merged-series-root";
const MERGE_CONFLICT_SCORE_MIN_GAP = 6;
const ADVERTISING_SIDECAR_DELETE_STRATEGY = "advertising-sidecar";
const FLATTEN_WRAPPER_DELETE_STRATEGY = "flatten-wrapper-dir";
const SUBTITLE_UNMATCHED_DELETE_STRATEGY = "subtitle-unmatched-delete";
const NONSUB_SIDECAR_DELETE_STRATEGY = "sidecar-nonsub-delete";
const SIDECAR_DIR_DELETE_STRATEGY = "sidecar-dir";
const EMPTY_MEDIA_DIR_DELETE_STRATEGY = "empty-media-dir-delete";
const EMPTY_QUERY_DELETE_STRATEGY = "empty-query-delete";
const EPISODIC_EXTRA_DELETE_STRATEGY = "episodic-extra-delete";
const DUPLICATE_SAME_TMDB_TARGET_DELETE_STRATEGY = "duplicate-same-tmdb-target-delete";
const ZERO_REVIEW_FINALIZER_MATCH_SOURCE = "zero-review-finalizer";
const ZERO_REVIEW_FINALIZER_REASON = "zero-review-finalizer";
const ZERO_REVIEW_QUARANTINE_ROOT = "整理保留区";
const ZERO_REVIEW_SOFTWARE_BUCKET = "软件安装包";
const ZERO_REVIEW_TORRENT_BUCKET = "种子文件";
const ZERO_REVIEW_SUPPLEMENT_BUCKET = "附属资料";
const ZERO_REVIEW_UNKNOWN_MEDIA_BUCKET = "未识别媒体";
const ZERO_REVIEW_LLM_TASK = "zero-review-finalizer";
const ZERO_REVIEW_RESOURCE_BATCH_CONTEXT_MODE = "resource-batch-with-root-context";
const ZERO_REVIEW_SINGLE_CONTEXT_MODE = "single-with-root-context";
const LOCAL_CANONICAL_OVERRIDE_MATCH_SOURCE = "local-canonical-override";
const LOCAL_CANONICAL_OVERRIDE_REASON = "local-canonical-override";
const LOCAL_CANONICAL_OVERRIDE_SCORE = 0.99;
const WANWAN_TITLE_KEY = normalizeComparableTitle("万万没想到");
const JOJO_STONE_OCEAN_TITLE_ZH = "JOJO的奇妙冒险.石之海";
const JOJO_STONE_OCEAN_TITLE_EN = "JoJo's Bizarre Adventure: Stone Ocean";
const NANATSU_TITLE_ZH = "七大罪";
const NANATSU_TITLE_EN = "The Seven Deadly Sins";
const NANATSU_FOUR_KNIGHTS_KEY = "nanatsu-four-knights";
const NANATSU_FOUR_KNIGHTS_QUERY_TITLES = [
  "七大罪：默示录的四骑士",
  "The Seven Deadly Sins: Four Knights of the Apocalypse",
  "Four Knights of the Apocalypse",
];
const JOJO_ROOT_FALLBACK_PATTERNS = [
  /^\s*JOJO(?:\s*S\d{2}(?:S\d{2})?)?\s*$/iu,
  /^\s*JoJo(?:'s)?[ ._-]?Bizarre[ ._-]?Adventure\s*$/iu,
  /^\s*JoJo[ ._-]?No[ ._-]?Kimyou[ ._-]?Na[ ._-]?Bouken\s*$/iu,
  /^\s*JOJO的奇妙冒险\s*$/u,
];
const JOJO_STONE_OCEAN_SOURCE_PATTERNS = [
  /Stone[ ._-]?Ocean(?:[ ._-]?Part[ ._-]?\d+)?/iu,
  /石之海/u,
];
const NANATSU_FOUR_KNIGHTS_SOURCE_PATTERNS = [
  /默示录的四骑士/u,
  /Four[ ._-]?Knights[ ._-]?of[ ._-]?the[ ._-]?Apocalypse/iu,
];
const NANATSU_ORIGINAL_SOURCE_PATTERNS = [
  /七大罪(?![:：]?\s*默示录的四骑士)/u,
  /Nanatsu[ ._-]?no[ ._-]?Taizai(?!.*Four[ ._-]?Knights)/iu,
  /The[ ._-]?Seven[ ._-]?Deadly[ ._-]?Sins(?!.*(?:Four[ ._-]?Knights|默示录的四骑士|四骑士))/iu,
];
const RECORD_OF_RAGNAROK_PREFERRED_SOURCE_PATTERNS = [
  /^Record Of Ragnarok AAC2 0 H 264(?:\/|$)/iu,
  /Record\.of\.Ragnarok\.S\d{2}E\d{2}\./iu,
];
const RECORD_OF_RAGNAROK_ALTERNATE_SOURCE_PATTERNS = [
  /^终末的女武神\s+\[全10集\]\[简繁英字幕\]\s+Record of Ragnarok II(?:\/|$)/iu,
  /Record\.of\.Ragnarok\.II\.\d{4}\.S\d{2}E\d{2}\./iu,
];
const JOJO_GOLDEN_WIND_PREFERRED_SOURCE_PATTERNS = [
  /^JoJo(?:'s)? Bizarre Adventure DUAL WEB H 264 NanDesuKa\/Season 05\//iu,
  /-NanDesuKa\b/iu,
];
const JOJO_GOLDEN_WIND_ALTERNATE_SOURCE_PATTERNS = [
  /^JOJO\/Season 05\//u,
  /\[JOJO&UHA-WING&Kamigami\]/u,
  /Golden[ ._-]?Wind/iu,
];
const JOJO_STONE_OCEAN_PART2_PREFERRED_SOURCE_PATTERNS = [
  /^JOJO的奇妙冒险\//u,
  /\[Kamigami\]/u,
  /Stone[ ._-]?Ocean/iu,
];
const JOJO_STONE_OCEAN_PART2_ALTERNATE_SOURCE_PATTERNS = [
  /^JoJo No Kimyou Na Bouken Stone Ocean Part 2 ~ 12 \[Multiple Subtitle\]\//u,
  /\[Erai-raws\]/u,
  /Part[ ._-]?2/iu,
];
const TRUSTED_LOW_POPULARITY_SINGLE_RESULT_QUERY_KEYS = new Set([
  normalizeComparableTitle("Yonimo Kimyouna Monogatari 20 Aki no SP"),
  normalizeComparableTitle("Yonimo Kimyouna Monogatari 20 Natsu no SP"),
]);
const TRUSTED_EXACT_YEAR_MOVIE_ALIAS_KEYS = new Set([
  normalizeComparableTitle("深海"),
]);
const TRUSTED_EXACT_TMDB_MOVIE_ALIAS_RULES = [
  {
    patterns: [/Crazy[ ._-]?Love\s+HDMA\s*5\s*1/iu],
    requiredSourceYear: 1993,
    tmdbId: 79871,
    tmdbYear: 1993,
  },
  {
    patterns: [/\[4K\s+HDR\]\[沙丘\].*\[中英外挂\].*\[FLAC\].*\[MKV\]/iu],
    tmdbId: 438631,
    tmdbYear: 2021,
  },
];
const DUPLICATE_SAME_TMDB_TARGET_DELETE_SOURCE_RULES = [
  /\bHello[ ._-]?Mr[ ._-]?Billionaire[ ._-]?CHINESE\s*\(2018\)/iu,
];
const LOCALIZED_TITLE_OVERRIDES = new Map([
  [normalizeComparableTitle("Love, Death & Robots"), "爱，死亡和机器人"],
]);

const MOVIE_QUERY_ALIAS_RULES = [
  {
    patterns: [/世界奇妙物语20秋季特别篇/u, /Yonimo[ ._-]?Kimyouna[ ._-]?Monogatari[ ._-]?20[ ._-]?Aki[ ._-]?no[ ._-]?SP/iu],
    titles: ["Yonimo Kimyouna Monogatari 20 Aki no SP"],
  },
  {
    patterns: [/世界奇妙物语20夏季特别篇/u, /Yonimo[ ._-]?Kimyouna[ ._-]?Monogatari[ ._-]?20[ ._-]?Natsu[ ._-]?no[ ._-]?SP/iu],
    titles: ["Yonimo Kimyouna Monogatari 20 Natsu no SP"],
  },
  {
    patterns: [/M室T生.*Escape[ ._-]?Room/iu],
    titles: ["Escape Room"],
  },
  {
    patterns: [/我是大哥大.*电影版/u, /Kyo[ ._-]?kara[ ._-]?ore[ ._-]?wa/iu],
    titles: ["我是大哥大 电影版"],
  },
  {
    patterns: [/Wonder[ ._-]?Woman.*NAISU.*(?:2020)?/iu],
    titles: ["Wonder Woman 1984"],
  },
  {
    patterns: [/^Deep[ ._-]?Sea\b.*(?:Chinese|BONE|2023)/iu],
    titles: ["深海", "Deep Sea"],
  },
  {
    patterns: [/Crazy[ ._-]?Love\s+HDMA\s*5\s*1/iu],
    titles: ["蜜桃成熟时", "Crazy Love"],
  },
  {
    patterns: [/\[4K\s+HDR\]\[沙丘\].*\[中英外挂\].*\[FLAC\].*\[MKV\]/iu],
    titles: ["Dune", "沙丘"],
  },
  {
    patterns: [/阳光灿烂的日子/u],
    titles: ["阳光灿烂的日子"],
  },
  {
    patterns: [/^她(?:\s|[()[\]【】（]|$)/u],
    titles: ["Her"],
  },
  {
    patterns: [/^一一/u, /\bYi[ ._-]?Yi\b/iu],
    titles: ["一一 Yi Yi 2000", "Yi Yi"],
  },
  {
    patterns: [/妙先生/u, /Miao[ ._-]?Xian[ ._-]?Sheng/iu, /Mr[ ._-]?Miao/iu],
    titles: ["妙先生", "Mr. Miao"],
  },
  {
    patterns: [/Free[ ._-]?G[ ._-]?uy/iu],
    titles: ["Free Guy"],
  },
  {
    patterns: [/某种物质/u, /完美物质/u, /惧裂/u, /The[ ._-]?Substance/iu],
    titles: ["某种物质", "The Substance"],
  },
  {
    patterns: [/波西米亚狂想曲/u],
    titles: ["Bohemian Rhapsody"],
  },
  {
    patterns: [/\bThe[ ._-]?Fifth[ ._-]?Element\b/iu],
    titles: ["The Fifth Element"],
  },
  {
    patterns: [/\bTenet\b/iu],
    titles: ["Tenet"],
  },
  {
    patterns: [/\bHello[ ._-]?Mr[ ._-]?Billionaire\b/iu],
    titles: ["Hello Mr. Billionaire"],
  },
  {
    patterns: [/\bCity[ ._-]?Of[ ._-]?God\b/iu],
    titles: ["City of God"],
  },
  {
    patterns: [/\bThe[ ._-]?Ballad[ ._-]?Of[ ._-]?Buster[ ._-]?Scruggs\b/iu],
    titles: ["The Ballad of Buster Scruggs"],
  },
  {
    patterns: [/\bMemories[ ._-]?Of[ ._-]?Murder\b/iu],
    titles: ["Memories of Murder"],
  },
  {
    patterns: [/\bThe[ ._-]?Pig[ ._-]?The[ ._-]?Snake[ ._-]?And[ ._-]?The[ ._-]?Pigeon\b/iu],
    titles: ["The Pig, the Snake and the Pigeon"],
  },
];

const TV_QUERY_ALIAS_RULES = [
  {
    patterns: [/^黑袍纠察队\s*\d*$/u, /^The[ ._-]?Boys(?:[ ._-]?S\d{1,2}(?:E\d{1,3})?)?/iu],
    titles: ["The Boys", "黑袍纠察队"],
  },
  {
    patterns: [/^欧比旺$/u, /^Obi[ ._-]?Wan[ ._-]?Kenobi(?:[ ._-]?S\d{1,2}(?:E\d{1,3})?)?/iu],
    titles: ["Obi-Wan Kenobi", "欧比旺"],
  },
  {
    patterns: [/^波巴[·.]?费特之书$/u, /^The[ ._-]?Book[ ._-]?Of[ ._-]?Boba[ ._-]?Fett/iu],
    titles: ["The Book of Boba Fett", "波巴·费特之书"],
  },
];

const ANIME_QUERY_ALIAS_RULES = [
  {
    patterns: [
      /JoJo(?:'s)?[ ._-]?Bizarre[ ._-]?Adventure(?:[ ._-]?SC|[ ._-]?Stardust[ ._-]?Crusaders?)/iu,
      /JoJo['’]s_Bizarre_Adventure_SC/iu,
      /Stardust[ ._-]?Crusaders/iu,
      /星尘斗士/u,
    ],
    titles: ["JoJo's Bizarre Adventure: Stardust Crusaders", "JoJo's Bizarre Adventure"],
  },
  {
    patterns: [/Golden[ ._-]?Wind/iu, /Vento[ ._-]?Aureo/iu, /黄金之风/u],
    titles: ["JoJo's Bizarre Adventure: Golden Wind", "JoJo's Bizarre Adventure"],
  },
  {
    patterns: [
      /Bizarre[ ._-]?Adventure[ ._-]?Stone[ ._-]?Ocean(?:[ ._-]?Part[ ._-]?2)?/iu,
      /Stone[ ._-]?Ocean(?:[ ._-]?Part[ ._-]?2)?/iu,
      /石之海/u,
    ],
    titles: [
      "JoJo Bizarre Adventure Stone Ocean",
      "JoJo's Bizarre Adventure: Stone Ocean",
      "JoJo's Bizarre Adventure",
    ],
  },
  {
    patterns: NANATSU_FOUR_KNIGHTS_SOURCE_PATTERNS,
    titles: NANATSU_FOUR_KNIGHTS_QUERY_TITLES,
  },
  {
    patterns: NANATSU_ORIGINAL_SOURCE_PATTERNS,
    titles: [NANATSU_TITLE_ZH, NANATSU_TITLE_EN, "Nanatsu no Taizai"],
  },
  {
    patterns: [
      /\bJOJO\b/iu,
      /JoJo(?:'s)?[ ._-]?Bizarre[ ._-]?Adventure/iu,
      /JoJo[ ._-]?No[ ._-]?Kimyou[ ._-]?Na[ ._-]?Bouken/iu,
      /JOJO的奇妙冒险/u,
    ],
    titles: ["JoJo's Bizarre Adventure", "JOJO的奇妙冒险"],
  },
  {
    patterns: [/鬼灭之刃/u, /鬼滅之刃/u, /Kimetsu[ ._-]?No[ ._-]?Yaiba/iu, /Demon[ ._-]?Slayer/iu],
    titles: ["鬼灭之刃", "Demon Slayer: Kimetsu no Yaiba", "Kimetsu No Yaiba"],
  },
];

const MOVIE_RELEASE_TAG_PATTERNS = [
  /(?:^|\s)(?:YTS\s*MX|BTSJ6|AWKN|BONE|Hami|NAISU|LxyLab)(?=\s|$)/g,
  /(?:^|\s)@Movie丶徒(?=\s|$)/g,
];

const MOVIE_TECHNICAL_PATTERNS = [
  /\b(?:BD|HD)?(?:480|720|1080|2160)P\b/giu,
  /\b(?:HDRip|WEBRip|WEB[- .]?DL|WEB|BluRay|BDRip|BRRip|Remux|iTunes)\b/giu,
  /\bHDMA\s*5\s*1\b/giu,
  /\b(?:AAC|DD|DDP|AC3|DTS|TrueHD|Atmos)\s*\+?\s*\d(?:[ .]\d)?\b/giu,
  /\b(?:AAC|DD|DDP)\d[ .]?\d\b/giu,
  /\b(?:x264|x265|h[ ._-]?264|h[ ._-]?265|hevc|avc|FLAC|MKV|MP4)\b/giu,
  /\b(?:30|60|120)\s*fps\b/giu,
  /\bHQ\b/gu,
  /\d+\s*帧率版本/gu,
];

const MOVIE_EDITION_PATTERNS = [
  /\bREMASTERED\b/giu,
  /\bThe\s+Ultimate\s+Cut\b/giu,
  /导演剪辑版|终极剪辑版|韩版无删减|未删减修复版|未删减|修复版|正式版|正片|特典映像|高码版|修正字幕/gu,
];

const MOVIE_LANGUAGE_AND_SUBTITLE_PATTERNS = [
  /\b(?:CHINESE|PORTUGUESE|KOREAN|JAPANESE)\b/giu,
  /(?:英语|日语|韩语|法语|粤日双语|英国双语|国语配音|国语音轨|国语中字|法语中字|韩语特效中字|特效中英字幕|中英字幕|中英双字|英语双字|中文字幕|简繁英字幕|简繁字幕|简繁外挂|简繁内封|官方中字|高清中字|中字|双字|外挂|内封|字幕)/gu,
];

const ADVERTISING_SIDECAR_EXTENSIONS = new Set([".txt", ".url", ".doc", ".docx"]);
const ADVERTISING_IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const SUBTITLE_SIDECAR_EXTENSIONS = new Set([".srt", ".ass", ".ssa", ".sub", ".idx"]);
const COMMON_VIDEO_EXTENSIONS = new Set([
  ".mkv",
  ".mp4",
  ".avi",
  ".mov",
  ".ts",
  ".m2ts",
  ".webm",
  ".wmv",
  ".flv",
  ".rmvb",
  ".mpg",
  ".mpeg",
  ".iso",
]);
const NONSUB_SIDECAR_EXTENSIONS = new Set([
  ".7z",
  ".ape",
  ".cue",
  ".flac",
  ".m4a",
  ".mp3",
  ".nfo",
  ".ogg",
  ".otf",
  ".rar",
  ".ttf",
  ".wav",
  ".zip",
  ".md5",
]);
const ADVERTISING_VIDEO_STRONG_PATTERNS = [
  /更多高清剧集下载请访问/iu,
  /更多电视剧集下载请访问/iu,
  /更多剧集打包下载请访问/iu,
];
const EPISODIC_EXTRA_VIDEO_PATTERNS = [
  /Creditless[ ._-]?(?:OP|ED)\d*/iu,
  /(?:Mini[ ._-]?Anime|Break[ ._-]?Time|Petit)/iu,
  /(?:^|[^A-Za-z0-9])NCOP\d*(?=$|[^A-Za-z0-9])/iu,
  /(?:^|[^A-Za-z0-9])NCED\d*(?=$|[^A-Za-z0-9])/iu,
  /(?:^|[^A-Za-z0-9])PV\d*(?=$|[^A-Za-z0-9])/iu,
  /(?:^|[^A-Za-z0-9])SP\d*(?=$|[^A-Za-z0-9])/iu,
  /迷你动画/u,
];
const ZERO_REVIEW_SOFTWARE_EXTENSIONS = new Set([
  ".appimage",
  ".apk",
  ".deb",
  ".dmg",
  ".exe",
  ".ipa",
  ".msi",
  ".pkg",
  ".rpm",
]);
const ZERO_REVIEW_SOFTWARE_PATTERNS = [
  /\b(?:installer|setup|install|crack|keygen|patch)\b/iu,
  /安装包/u,
  /破解版/u,
  /激活/u,
  /Parallels/iu,
  /Toolbox/iu,
];
const ZERO_REVIEW_TORRENT_EXTENSIONS = new Set([".torrent", ".magnet"]);
const ZERO_REVIEW_TORRENT_PATTERNS = [
  /\b(?:torrent|magnet|ed2k)\b/iu,
  /种子/u,
  /磁力/u,
  /下载(?:链接|地址|描述|说明)/u,
];
const ZERO_REVIEW_SUPPLEMENT_EXTENSIONS = new Set([
  ".bmp",
  ".cue",
  ".flac",
  ".gif",
  ".jpeg",
  ".jpg",
  ".m4a",
  ".md5",
  ".mp3",
  ".nfo",
  ".ogg",
  ".otf",
  ".pdf",
  ".png",
  ".rar",
  ".ttf",
  ".wav",
  ".webp",
  ".zip",
]);
const ZERO_REVIEW_SUPPLEMENT_PATTERNS = [
  /\b(?:scans?|booklets?|disc[ ._-]?art|leaflets?|sleeves?|fonts?|menus?|extras?)\b/iu,
  /\b(?:NCOP|NCED|PV|SP|OVA|OAD|OP|ED)\d*\b/iu,
  /扫(?:图|描)/u,
  /小册子/u,
  /画册/u,
  /封面/u,
  /海报/u,
  /菜单/u,
  /迷你动画/u,
  /Break[ ._-]?Time/iu,
  /字体/u,
  /特典/u,
  /附属资料/u,
];

const ADVERTISING_SIDECAR_PATTERNS = [
  /最新域名及域名找回/iu,
  /请做种/iu,
  /跪求赞助/iu,
  /赞助/iu,
  /交流群/iu,
  /telegram/iu,
  /公众号/iu,
  /点击进入/iu,
  /下载方式/iu,
  /总链接文档/iu,
  /实时同步更新/iu,
  /更多请关注/iu,
  /收藏不迷路/iu,
  /域名/iu,
  /网址/iu,
  /影视魔王/iu,
  /^交流$/u,
  /哔嘀影视/iu,
  /高清影视/iu,
  /高清剧集/iu,
  /bd2020/iu,
  /bdys/iu,
  /bde4/iu,
  /2kandy/iu,
  /uindex/iu,
  /bbqddq/iu,
];

const WANWAN_SPECIAL_PATTERNS = [
  /番外/u,
  /外传/u,
  /特别篇/u,
];

export const TMDB_REVIEW_REASON_MISS = "tmdb-miss";
export const TMDB_REVIEW_REASON_QUERY_ERROR = "tmdb-query-error";
export const TMDB_REVIEW_REASON_AMBIGUOUS = "tmdb-ambiguous";
export const TMDB_REVIEW_REASON_YEAR_CONFLICT = "year-conflict";
export const TMDB_REVIEW_REASON_EMPTY_QUERY = "empty-query";
export const TMDB_REVIEW_REASON_COLLISION = "collision";
export const TMDB_REVIEW_REASON_MERGE_CONFLICT = "merge-conflict";
export const TMDB_REVIEW_REASON_SIDECAR_FILE = "sidecar-file";
export const TMDB_REVIEW_REASON_NESTED_SIDECAR_DIR = "nested-sidecar-dir";
export const TMDB_REVIEW_REASON_EPISODIC_EXTRA_VIDEO = "episodic-extra-video";
export const TMDB_REVIEW_REASON_EPISODE_WRAPPER_DIR = "episode-wrapper-dir";
export const TMDB_REVIEW_REASON_MEDIA_ROUTING_UNKNOWN = "media-routing-unknown";
export const TMDB_REVIEW_REASON_MEDIA_ROUTING_SUPPLEMENT = "media-routing-supplement";

const ROOT_PATH_CATEGORY_MAP = {
  剧集: "series",
  动漫: "anime",
  电影: "movie",
  纪录片: "documentary",
};
const MEDIA_CATEGORY_ROOT_NAMES = new Set(Object.keys(ROOT_PATH_CATEGORY_MAP));
const ROUTABLE_MEDIA_CATEGORIES = new Set(["anime", "series", "movie", "documentary"]);
const MEDIA_ROUTING_CATEGORIES = new Set([
  ...ROUTABLE_MEDIA_CATEGORIES,
  "supplement",
  "unknown",
]);

const NESTED_SIDECAR_DIR_KEYS = new Set([
  "sub",
  "subs",
  "subtitle",
  "subtitles",
  "font",
  "fonts",
  "menu",
  "menus",
  "ncop",
  "nced",
  "ncopnced",
  "creditless",
  "creditlessop",
  "creditlessed",
  "music",
  "ass",
  "pv",
  "caption",
  "captions",
  "attachment",
  "attachments",
  "extra",
  "extras",
  "cover",
  "covers",
  "image",
  "images",
  "poster",
  "posters",
  "字幕",
  "附件",
  "特典映像",
  "封面",
  "海报",
  "图片",
]);

const REVIEW_REASON_MESSAGES = {
  [TMDB_REVIEW_REASON_MISS]: "TMDB 未查到稳定命中，保留在待人工确认",
  [TMDB_REVIEW_REASON_QUERY_ERROR]: "TMDB 查询阶段存在请求失败或超时，本次结果不可信，保留在待人工确认",
  [TMDB_REVIEW_REASON_AMBIGUOUS]: "TMDB 存在多个接近候选，保留在待人工确认",
  [TMDB_REVIEW_REASON_YEAR_CONFLICT]: "TMDB 标题接近但年份冲突，保留在待人工确认",
  [TMDB_REVIEW_REASON_EMPTY_QUERY]: "标题清洗后为空，保留在待人工确认",
  [TMDB_REVIEW_REASON_COLLISION]: "标准化后目标路径冲突，保留在待人工确认",
  [TMDB_REVIEW_REASON_MERGE_CONFLICT]: "合并别名剧集后仍无法稳定择优，保留在待人工确认",
  [TMDB_REVIEW_REASON_SIDECAR_FILE]: "非广告附件暂不做 TMDB 自动标准化，保留人工处理",
  [TMDB_REVIEW_REASON_NESTED_SIDECAR_DIR]: "Subs 等附件目录暂不自动重命名，保留人工处理",
  [TMDB_REVIEW_REASON_EPISODE_WRAPPER_DIR]: "单集包裹目录无法安全自动拍平，保留人工处理",
  [TMDB_REVIEW_REASON_MEDIA_ROUTING_UNKNOWN]: "未知入口目录下资源包类型未高置信确认，保留到整理保留区",
  [TMDB_REVIEW_REASON_MEDIA_ROUTING_SUPPLEMENT]: "资源包被判定为附属资料，不进入 TMDB 正片标准化",
};

function inferRootCategory(rootPath) {
  return ROOT_PATH_CATEGORY_MAP[String(rootPath ?? "").trim()] ?? null;
}

function inferExplicitRootCategory(rootPath) {
  const normalizedRootPath = normalizeSourcePath(rootPath ?? "");
  const lastSegment = getLastPathSegment(normalizedRootPath);
  return ROOT_PATH_CATEGORY_MAP[normalizedRootPath] ?? ROOT_PATH_CATEGORY_MAP[lastSegment] ?? null;
}

function isSeasonLikePathSegment(value) {
  return (
    /\bSeason[ ._-]?\d{1,2}\b/i.test(value) ||
    /\bS\d{1,2}\b/i.test(value) ||
    /第\s*[0-9一二三四五六七八九十百零两]+\s*季/i.test(value)
  );
}

function isNestedSidecarDirectoryName(value) {
  const normalized = String(value ?? "")
    .toLowerCase()
    .replace(/[\s._-]+/g, "")
    .replace(/[^a-z\u4e00-\u9fff]/gu, "");

  return NESTED_SIDECAR_DIR_KEYS.has(normalized);
}

function normalizeExtraDirectoryKey(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[\s._&+\-]+/g, "")
    .replace(/[^a-z0-9\u4e00-\u9fff]/gu, "");
}

function isExplicitExtraDirectoryName(value) {
  const normalized = normalizeExtraDirectoryKey(value);

  return (
    [
      "menu",
      "menus",
      "extra",
      "extras",
      "minianime",
      "minianimation",
      "breaktime",
      "迷你动画",
      "特典",
      "特典映像",
      "scan",
      "scans",
      "booklet",
      "booklets",
      "扫图",
      "扫描",
    ].includes(normalized) ||
    /^pv\d*$/iu.test(normalized) ||
    /^ncop\d*$/iu.test(normalized) ||
    /^nced\d*$/iu.test(normalized) ||
    /^ncopnced\d*$/iu.test(normalized) ||
    /^creditless(?:op|ed)?\d*$/iu.test(normalized)
  );
}

function isRetainedSupplementDirectoryName(value) {
  return [
    "scan",
    "scans",
    "booklet",
    "booklets",
    "扫图",
    "扫描",
  ].includes(normalizeExtraDirectoryKey(value));
}

function hasNestedSidecarDirectoryAncestor(pathParts = []) {
  return pathParts.slice(0, -1).some((segment) => isNestedSidecarDirectoryName(segment));
}

function hasExplicitExtraDirectoryAncestor(pathParts = []) {
  return pathParts.slice(0, -1).some((segment) => isExplicitExtraDirectoryName(segment));
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

function isAdvertisingSidecar(parsedEntry) {
  if (parsedEntry.isDir) {
    return false;
  }

  const matchedText = [parsedEntry.stem, parsedEntry.name, parsedEntry.source]
    .filter(Boolean)
    .join(" ");

  if (ADVERTISING_SIDECAR_EXTENSIONS.has(parsedEntry.ext)) {
    return true;
  }

  if (
    parsedEntry.role === "video" &&
    ADVERTISING_VIDEO_STRONG_PATTERNS.some((pattern) => pattern.test(matchedText)) &&
    /(?:www\.|\b[a-z0-9-]+\.(?:com|net|org|cc|co)\b)/iu.test(matchedText) &&
    !parsedEntry.episode
  ) {
    return true;
  }

  if (!ADVERTISING_IMAGE_EXTENSIONS.has(parsedEntry.ext)) {
    return false;
  }

  return ADVERTISING_SIDECAR_PATTERNS.some((pattern) => pattern.test(matchedText));
}

function isSubtitleSidecar(parsedEntry) {
  return SUBTITLE_SIDECAR_EXTENSIONS.has(parsedEntry.ext);
}

function isNonsubSidecar(parsedEntry) {
  const canTreatAsAnimeSidecarExtension =
    NONSUB_SIDECAR_EXTENSIONS.has(parsedEntry.ext) && ["anime", "series"].includes(parsedEntry.rootCategory);

  return (
    !parsedEntry.isDir &&
    !isSubtitleSidecar(parsedEntry) &&
    (parsedEntry.role === "sidecar" || canTreatAsAnimeSidecarExtension)
  );
}

function isEpisodicExtraVideo(parsedEntry) {
  if (parsedEntry?.isDir || parsedEntry?.role !== "video") {
    return false;
  }

  if (!["anime", "series"].includes(parsedEntry.rootCategory) && !["anime", "series"].includes(parsedEntry.category)) {
    return false;
  }

  const fileText = [parsedEntry.name, parsedEntry.stem].filter(Boolean).join(" ");
  return (
    EPISODIC_EXTRA_VIDEO_PATTERNS.some((pattern) => pattern.test(fileText)) ||
    hasExplicitExtraDirectoryAncestor(parsedEntry.pathParts ?? [])
  );
}

function needsResourcePackageLlmClassification(parsedEntry) {
  return (
    parsedEntry?.role === "video" &&
    (hasFileLevelExtraVideoMarker(parsedEntry) || hasExplicitExtraDirectoryAncestor(parsedEntry.pathParts ?? []))
  );
}

function normalizeMediaBundleKey(value) {
  return String(value)
    .toLowerCase()
    .replace(/[._\-\s]+/g, "")
    .replace(/[^a-z0-9\u4e00-\u9fff]/gu, "");
}

function isSingleMediaBundleDirectory(dirName, fileName) {
  const directoryKey = normalizeMediaBundleKey(dirName);
  const fileKey = normalizeMediaBundleKey(path.posix.basename(fileName, path.posix.extname(fileName)));
  return directoryKey && fileKey && directoryKey === fileKey;
}

function buildEpisodeWrapperIdentityKey(entry) {
  const baseName = String(entry?.name ?? "");
  if (!baseName) {
    return "";
  }

  const stem = path.posix.basename(baseName, path.posix.extname(baseName));
  return normalizeMediaBundleKey(stem);
}

function resolveWrapperDirectoryFileLikeExt(wrapperEntry) {
  return path.posix.extname(String(wrapperEntry?.name ?? "")).toLowerCase();
}

function hasSiblingEpisodeVideoCompanion({
  wrapperEntry,
  directChildrenMap,
}) {
  const parentDir = path.posix.dirname(wrapperEntry.source);
  if (!parentDir || parentDir === ".") {
    return false;
  }

  const wrapperKey = buildEpisodeWrapperIdentityKey(wrapperEntry);
  if (!wrapperKey) {
    return false;
  }

  const siblings = directChildrenMap.get(parentDir) ?? [];
  return siblings.some((sibling) => {
    if (
      sibling.source === wrapperEntry.source ||
      sibling.isDir ||
      detectRole(sibling.ext, false) !== "video"
    ) {
      return false;
    }

    if (wrapperEntry.episode && sibling.episode && wrapperEntry.episode !== sibling.episode) {
      return false;
    }

    if (wrapperEntry.season && sibling.season && wrapperEntry.season !== sibling.season) {
      return false;
    }

    const siblingKey = buildEpisodeWrapperIdentityKey(sibling);
    if (!siblingKey) {
      return false;
    }

    return (
      siblingKey === wrapperKey ||
      siblingKey.startsWith(wrapperKey) ||
      wrapperKey.startsWith(siblingKey)
    );
  });
}

function canAutoCleanupEpisodeWrapperDirectory({
  wrapperEntry,
  directChildrenMap,
}) {
  if (!wrapperEntry?.isDir || !wrapperEntry?.episode) {
    return false;
  }

  if (detectRole(resolveWrapperDirectoryFileLikeExt(wrapperEntry), false) === "video") {
    return true;
  }

  return hasSiblingEpisodeVideoCompanion({
    wrapperEntry,
    directChildrenMap,
  });
}

function normalizeSubtitleAttachmentKey(value) {
  return normalizeComparableTitle(
    String(value ?? "")
      .replace(/\[[^\]]+\]/gu, " ")
      .replace(/\([^)]+\)/gu, " ")
      .replace(/【[^】]+】/gu, " ")
      .replace(/（[^）]+）/gu, " ")
      .replace(
        /\b(default|forced|sdh|cc|chs|cht|eng|english|jpn|japanese|kor|korean|subtitle|subtitles|subs|简体|繁体|简中|繁中|中字|字幕)\b/giu,
        " ",
      ),
  );
}

function canAttachSubtitleToVideo(sidecarEntry, videoEntry) {
  if (!isSubtitleSidecar(sidecarEntry)) {
    return false;
  }

  const sidecarSeason = sidecarEntry.season;
  const sidecarEpisode = sidecarEntry.episode;
  const videoSeason = videoEntry.season;
  const videoEpisode = videoEntry.episode;

  if (
    sidecarEpisode &&
    videoEpisode &&
    sidecarEpisode === videoEpisode &&
    (!sidecarSeason || !videoSeason || sidecarSeason === videoSeason)
  ) {
    return true;
  }

  const sidecarKey = normalizeSubtitleAttachmentKey(sidecarEntry.stem);
  const videoKey = normalizeSubtitleAttachmentKey(videoEntry.stem);

  if (!sidecarKey || !videoKey) {
    return false;
  }

  return sidecarKey.startsWith(videoKey) || videoKey.startsWith(sidecarKey);
}

function extractEpisodeFromPathParts(pathParts, category = "series") {
  for (let index = pathParts.length - 1; index >= 0; index -= 1) {
    const episode = extractEpisode(pathParts[index], category);
    if (episode) {
      return episode;
    }
  }

  return null;
}

function findNearestEpisodeAncestorName(parsedEntry) {
  const ancestorSegments = parsedEntry.pathParts.slice(0, -1);

  for (let index = ancestorSegments.length - 1; index >= 0; index -= 1) {
    const segment = ancestorSegments[index];
    if (extractEpisode(segment, parsedEntry.category) || /S\d{1,2}E\d{1,3}/iu.test(segment)) {
      return segment;
    }
  }

  return null;
}

function canAttachSidecarToVideo(sidecarEntry, videoEntry) {
  if (!isSubtitleSidecar(sidecarEntry)) {
    return false;
  }

  if (canAttachSubtitleToVideo(sidecarEntry, videoEntry)) {
    return true;
  }

  const inferredEpisode = extractEpisodeFromPathParts(sidecarEntry.pathParts.slice(0, -1), sidecarEntry.category);
  const inferredSeason = sidecarEntry.season ?? extractSeasonFromPathParts(sidecarEntry.pathParts.slice(0, -1));

  if (
    inferredEpisode &&
    videoEntry.episode &&
    inferredEpisode === videoEntry.episode &&
    (!inferredSeason || !videoEntry.season || inferredSeason === videoEntry.season)
  ) {
    return true;
  }

  const ancestorName = findNearestEpisodeAncestorName(sidecarEntry);
  const ancestorKey = normalizeSubtitleAttachmentKey(ancestorName);
  const videoKey = normalizeSubtitleAttachmentKey(videoEntry.stem);

  if (!ancestorKey || !videoKey) {
    return false;
  }

  return ancestorKey.startsWith(videoKey) || videoKey.startsWith(ancestorKey);
}

function shouldPrefixAttachedSidecarName(parsedEntry, videoMove) {
  if (!isSubtitleSidecar(parsedEntry)) {
    return false;
  }

  if (parsedEntry.episode || /S\d{1,2}E\d{1,3}|EP?\d{1,3}|第\s*[0-9一二三四五六七八九十百零两]+\s*[集话話]/iu.test(parsedEntry.stem)) {
    return false;
  }

  const sidecarKey = normalizeSubtitleAttachmentKey(parsedEntry.stem);
  const videoSourceStem = path.posix.basename(videoMove.source, path.posix.extname(videoMove.source));
  const videoKey = normalizeSubtitleAttachmentKey(videoSourceStem);

  if (sidecarKey && videoKey && (sidecarKey.startsWith(videoKey) || videoKey.startsWith(sidecarKey))) {
    return false;
  }

  return true;
}

function buildAttachedSidecarTargetName(parsedEntry, videoMove) {
  if (!shouldPrefixAttachedSidecarName(parsedEntry, videoMove)) {
    return sanitizePathSegment(parsedEntry.name);
  }

  const videoBaseName = path.posix.basename(videoMove.targetName, path.posix.extname(videoMove.targetName));
  return sanitizePathSegment(`${videoBaseName}.${parsedEntry.name}`);
}

function containsWanwanHint(parsedEntry) {
  const candidates = [
    getSourceRoot(parsedEntry.source),
    parsedEntry.title,
    parsedEntry.source,
    ...(parsedEntry.titleCandidates ?? []),
  ];

  return candidates.some((value) => normalizeComparableTitle(value).includes(WANWAN_TITLE_KEY));
}

function matchesWanwanSpecialMarker(value) {
  return WANWAN_SPECIAL_PATTERNS.some((pattern) => pattern.test(String(value ?? "")));
}

function getWanwanSpecialDirectoryName(parsedEntry) {
  if (!containsWanwanHint(parsedEntry)) {
    return null;
  }

  if (parsedEntry.isDir && !parsedEntry.season && matchesWanwanSpecialMarker(parsedEntry.name)) {
    return sanitizePathSegment(parsedEntry.name);
  }

  const ancestorSegments = parsedEntry.pathParts.slice(1, -1);
  for (let index = ancestorSegments.length - 1; index >= 0; index -= 1) {
    const segment = ancestorSegments[index];
    if (isSeasonLikePathSegment(segment)) {
      continue;
    }
    if (matchesWanwanSpecialMarker(segment)) {
      return sanitizePathSegment(segment);
    }
  }

  return null;
}

function shouldPreserveWanwanSeasonFileName(parsedEntry) {
  return (
    !parsedEntry.isDir &&
    containsWanwanHint(parsedEntry) &&
    Boolean(parsedEntry.season) &&
    matchesWanwanSpecialMarker(parsedEntry.name) &&
    !getWanwanSpecialDirectoryName(parsedEntry)
  );
}

function isWanwanSpecialFallbackEntry(parsedEntry) {
  return Boolean(getWanwanSpecialDirectoryName(parsedEntry) || shouldPreserveWanwanSeasonFileName(parsedEntry));
}

function analyzeEpisodeWrapperDirectory({ wrapperEntry, directChildrenMap }) {
  const children = directChildrenMap.get(wrapperEntry.source) ?? [];
  const videoEntries = [];
  const subtitleEntries = [];
  const nonsubSidecarEntries = [];
  const residualEntries = [];
  const suppressedSources = new Set([wrapperEntry.source]);
  const canAutoCleanupWrapper = canAutoCleanupEpisodeWrapperDirectory({
    wrapperEntry,
    directChildrenMap,
  });
  const nestedDirs = children.filter((child) => child.isDir);

  const classifyFile = (fileEntry) => {
    if (detectRole(fileEntry.ext, false) === "video") {
      videoEntries.push(fileEntry);
      return;
    }

    if (isAdvertisingSidecar(fileEntry)) {
      return;
    }

    if (isSubtitleSidecar(fileEntry)) {
      subtitleEntries.push(fileEntry);
      return;
    }

    if (isNonsubSidecar(fileEntry)) {
      nonsubSidecarEntries.push(fileEntry);
      return;
    }

    residualEntries.push(fileEntry);
  };

  for (const child of children.filter((item) => !item.isDir)) {
    classifyFile(child);
  }

  for (const nestedDir of nestedDirs) {
    const nestedChildren = directChildrenMap.get(nestedDir.source) ?? [];

    if (nestedChildren.some((child) => child.isDir)) {
      return {
        mode: "review",
        reviewReason: TMDB_REVIEW_REASON_EPISODE_WRAPPER_DIR,
      };
    }

    const nestedFiles = nestedChildren.filter((child) => !child.isDir);
    const nestedVideoFiles = nestedFiles.filter((child) => detectRole(child.ext, false) === "video");

    if (nestedVideoFiles.length > 1) {
      return {
        mode: "review",
        reviewReason: TMDB_REVIEW_REASON_EPISODE_WRAPPER_DIR,
      };
    }

    if (nestedVideoFiles.length === 0) {
      const nestedResidualFiles = nestedFiles.filter((child) => {
        return !isSubtitleSidecar(child) && !isNonsubSidecar(child) && !isAdvertisingSidecar(child);
      });

      if (nestedResidualFiles.length > 0 && !isNestedSidecarDirectoryName(nestedDir.name)) {
        return {
          mode: "review",
          reviewReason: TMDB_REVIEW_REASON_EPISODE_WRAPPER_DIR,
        };
      }

      suppressedSources.add(nestedDir.source);
      for (const nestedFile of nestedFiles) {
        classifyFile(nestedFile);
      }
      continue;
    }

    const nestedVideoFile = nestedVideoFiles[0];
    if (!isSingleMediaBundleDirectory(nestedDir.name, nestedVideoFile.name)) {
      return {
        mode: "review",
        reviewReason: TMDB_REVIEW_REASON_EPISODE_WRAPPER_DIR,
      };
    }

    suppressedSources.add(nestedDir.source);
    for (const nestedFile of nestedFiles) {
      classifyFile(nestedFile);
    }
  }

  if (videoEntries.length === 0) {
    if (
      wrapperEntry.rootCategory === "movie" &&
      wrapperEntry.episode &&
      inferKnownCrossCategory({
        rootCategory: wrapperEntry.rootCategory,
        stem: wrapperEntry.stem,
        pathParts: wrapperEntry.pathParts,
      })
    ) {
      return {
        mode: "direct-wrapper",
      };
    }

    if (
      residualEntries.length === 0 &&
      (subtitleEntries.length > 0 || nonsubSidecarEntries.length > 0 || canAutoCleanupWrapper)
    ) {
      return {
        mode: "sidecar-only",
        wrapperDir: wrapperEntry.source,
        wrapperDirCid: wrapperEntry.cid ?? null,
        suppressedSources,
      };
    }

    return {
      mode: "review",
      reviewReason: TMDB_REVIEW_REASON_NESTED_SIDECAR_DIR,
    };
  }

  if (videoEntries.length > 1) {
    return {
      mode: "ignore",
      suppressedSources,
    };
  }

  const primaryVideo = videoEntries[0];
  const attachableSubtitleEntries = subtitleEntries.filter((entry) => canAttachSubtitleToVideo(entry, primaryVideo));
  const unhandledSubtitleEntries = subtitleEntries.filter((entry) => !canAttachSubtitleToVideo(entry, primaryVideo));

  return {
    mode: "flatten",
    wrapperDir: wrapperEntry.source,
    wrapperDirCid: wrapperEntry.cid ?? null,
    primaryVideoSource: primaryVideo.source,
    attachableSubtitleSources: attachableSubtitleEntries.map((entry) => entry.source),
    suppressedSources,
    residualReviewSources: [
      ...unhandledSubtitleEntries.map((entry) => entry.source),
      ...residualEntries.map((entry) => entry.source),
    ],
  };
}

function buildDeleteEntry({
  source,
  itemId,
  moveCount = 0,
  reason,
  strategy,
}) {
  return {
    wrapperDir: source,
    wrapperDirCid: itemId ?? null,
    moveCount,
    reason,
    strategy,
  };
}

function dedupeStrings(values) {
  return [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))];
}

function patternMatches(pattern, value) {
  pattern.lastIndex = 0;
  return pattern.test(String(value ?? ""));
}

function anyPatternMatches(patterns, value) {
  return patterns.some((pattern) => patternMatches(pattern, value));
}

function anyValueMatches(patterns, values = []) {
  return values.some((value) => anyPatternMatches(patterns, value));
}

function matchesAllSourcePatterns(source = "", patterns = []) {
  return patterns.every((pattern) => patternMatches(pattern, source));
}

function buildKnownSourceValues({
  source = "",
  stem = "",
  pathParts = [],
  titleCandidates = [],
}) {
  return [source, stem, ...pathParts, ...titleCandidates].filter(Boolean);
}

function isAnimeLikeCategory(category, rootCategory) {
  return ["anime", "series"].includes(category) || ["anime", "series"].includes(rootCategory);
}

function resolveKnownCanonicalTitleHint({
  source = "",
  stem = "",
  pathParts = [],
  titleCandidates = [],
  category = null,
  rootCategory = null,
}) {
  if (!isAnimeLikeCategory(category, rootCategory)) {
    return null;
  }

  const values = buildKnownSourceValues({
    source,
    stem,
    pathParts,
    titleCandidates,
  });

  if (values.some((value) => anyPatternMatches(JOJO_STONE_OCEAN_SOURCE_PATTERNS, value))) {
    return {
      canonicalTitleZh: JOJO_STONE_OCEAN_TITLE_ZH,
      canonicalTitleEn: JOJO_STONE_OCEAN_TITLE_EN,
    };
  }

  // 四骑士必须先拦住，避免被宽匹配的七大罪 canonical override 吞回原作。
  if (anyValueMatches(NANATSU_FOUR_KNIGHTS_SOURCE_PATTERNS, values)) {
    return {
      knownSeriesKey: NANATSU_FOUR_KNIGHTS_KEY,
    };
  }

  if (anyValueMatches(NANATSU_ORIGINAL_SOURCE_PATTERNS, values)) {
    return {
      canonicalTitleZh: NANATSU_TITLE_ZH,
      canonicalTitleEn: NANATSU_TITLE_EN,
    };
  }

  return null;
}

function extractStoneOceanSafeEpisode(stem) {
  const matched = String(stem ?? "").match(
    /Stone[ ._-]?Ocean(?:[ ._-]?Part[ ._-]?\d+)?\s*-\s*(\d{1,3})(?=$|[\s\[【(（])/iu,
  );
  if (!matched) {
    return null;
  }

  return Number.parseInt(matched[1], 10);
}

function extractNanatsuSafeEpisode(stem) {
  if (anyPatternMatches(NANATSU_FOUR_KNIGHTS_SOURCE_PATTERNS, stem)) {
    return null;
  }

  const cleanedTitle = buildTitle(stem);
  const matched = String(cleanedTitle).match(
    /(?:Nanatsu[ ._-]?No[ ._-]?Taizai|The[ ._-]?Seven[ ._-]?Deadly[ ._-]?Sins|七大罪)\s+(\d{1,3})$/iu,
  );
  if (!matched) {
    return null;
  }

  return Number.parseInt(matched[1], 10);
}

function resolveKnownEpisodeOverride({
  source = "",
  stem = "",
  pathParts = [],
  category = null,
  rootCategory = null,
}) {
  if (!isAnimeLikeCategory(category, rootCategory)) {
    return null;
  }

  const knownTitleHint = resolveKnownCanonicalTitleHint({
    source,
    stem,
    pathParts,
    category,
    rootCategory,
  });

  if (!knownTitleHint) {
    return null;
  }

  if (knownTitleHint.canonicalTitleZh === JOJO_STONE_OCEAN_TITLE_ZH) {
    return extractStoneOceanSafeEpisode(stem);
  }

  if (knownTitleHint.canonicalTitleZh === NANATSU_TITLE_ZH) {
    return extractNanatsuSafeEpisode(stem);
  }

  return null;
}

function collectRuleTitles(rules, values) {
  const valueList = values.map((value) => String(value ?? "")).filter(Boolean);
  const titles = [];

  for (const rule of rules) {
    if (valueList.some((value) => anyPatternMatches(rule.patterns, value))) {
      titles.push(...rule.titles);
    }
  }

  return dedupeStrings(titles);
}

function normalizeMovieQuerySpacing(value) {
  return String(value ?? "")
    .replace(/\[\s*(?:\d\s*){1,4}\]/gu, " ")
    .replace(/\[\s*(?:YTS\s*MX|GB|x264\s+AAC|KOREAN|CHINESE|PORTUGUESE|MKV|MP4|FLAC)\s*\]/giu, " ")
    .replace(/[【】《》]/gu, " ")
    .replace(/[()[\]{}（）]/gu, " ")
    .replace(/[._-]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function removeMovieQueryNoise(value, patterns) {
  let working = String(value ?? "");
  for (const pattern of patterns) {
    working = working.replace(pattern, " ");
  }
  return normalizeMovieQuerySpacing(working);
}

function stripMovieTailNoise(value) {
  return normalizeMovieQuerySpacing(value)
    .replace(/\b(?:MKV|MP4|AVI|MOV|M2TS|ISO)\b$/iu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function isUsableQueryTitle(value) {
  const normalized = String(value ?? "").trim();
  if (!normalized || normalized === "未识别标题") {
    return false;
  }

  if (/^\d+$/u.test(normalized)) {
    return false;
  }

  return normalizeComparableTitle(normalized).length >= 2;
}

function expandMovieStrongQueryCandidates(title, rawValues = []) {
  const aliases = collectRuleTitles(MOVIE_QUERY_ALIAS_RULES, [title, ...rawValues]);
  const variants = [];

  const addVariant = (value) => {
    const normalized = normalizeMovieQuerySpacing(value);
    if (isUsableQueryTitle(normalized)) {
      variants.push(normalized);
    }
  };

  const base = normalizeMovieQuerySpacing(title);
  addVariant(base);

  const withoutReleaseTags = removeMovieQueryNoise(base, MOVIE_RELEASE_TAG_PATTERNS);
  addVariant(withoutReleaseTags);

  const withoutTechnical = removeMovieQueryNoise(withoutReleaseTags, MOVIE_TECHNICAL_PATTERNS);
  addVariant(withoutTechnical);

  const withoutEdition = removeMovieQueryNoise(withoutTechnical, MOVIE_EDITION_PATTERNS);
  addVariant(withoutEdition);

  const withoutLanguage = removeMovieQueryNoise(withoutEdition, MOVIE_LANGUAGE_AND_SUBTITLE_PATTERNS);
  addVariant(withoutLanguage);
  addVariant(stripMovieTailNoise(withoutLanguage));

  return dedupeStrings([
    ...aliases,
    ...variants.flatMap((item) => expandMixedLanguageTitleCandidates(item)),
  ]).filter(isUsableQueryTitle);
}

function collectKnownTvTitleCandidates(rawValues) {
  return collectRuleTitles(TV_QUERY_ALIAS_RULES, rawValues);
}

function collectKnownAnimeTitleCandidates(rawValues) {
  return collectRuleTitles(ANIME_QUERY_ALIAS_RULES, rawValues);
}

function inferKnownCrossCategory({ rootCategory, stem, pathParts }) {
  const rawValues = [stem, ...pathParts];

  if (collectKnownAnimeTitleCandidates(rawValues).length > 0) {
    return "anime";
  }

  if (rootCategory === "movie" && collectKnownTvTitleCandidates(rawValues).length > 0) {
    return "series";
  }

  return null;
}

function inferKnownAnimeBracketEpisode(stem, category) {
  if (category !== "anime" || collectKnownAnimeTitleCandidates([stem]).length === 0) {
    return null;
  }

  const bracketEpisodeMatch = String(stem ?? "").match(/\[(\d{1,3})\]/u);
  if (!bracketEpisodeMatch) {
    return null;
  }

  return Number.parseInt(bracketEpisodeMatch[1], 10);
}

function getSourceRoot(source) {
  return normalizeSourcePath(source).split("/").filter(Boolean)[0] ?? "";
}

function getSourceDepth(source) {
  return normalizeSourcePath(source).split("/").filter(Boolean).length;
}

function hasFileLevelExtraVideoMarker(parsedEntry) {
  const fileText = [parsedEntry?.name, parsedEntry?.stem].filter(Boolean).join(" ");
  return EPISODIC_EXTRA_VIDEO_PATTERNS.some((pattern) => pattern.test(fileText));
}

function parseMainEpisodeRangeHint(value) {
  const text = String(value ?? "").normalize("NFKC");
  const specialEpisodeHint =
    /(?:^|[^A-Za-z0-9])SP\d*(?=$|[^A-Za-z0-9])|OVA|OAD|番外|特别篇|特典/iu.test(text);
  const buildHint = (start, end) => {
    if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0 || end < start || end - start > 300) {
      return null;
    }

    return {
      mainEpisodeRange: {
        start,
        end,
      },
      mainEpisodeCount: end - start + 1,
      specialEpisodeHint,
      sourceSegment: value,
    };
  };

  const rangeMatch = text.match(/(\d{1,3})\s*[-~～—–_]\s*(\d{1,3})\s*(?:TV)?\s*(?:全集|全话|全話|集|话|話)?/iu);
  if (rangeMatch) {
    return buildHint(Number.parseInt(rangeMatch[1], 10), Number.parseInt(rangeMatch[2], 10));
  }

  const countMatch = text.match(/全\s*(\d{1,3})\s*(?:TV)?\s*(?:集|话|話|回|章)/u);
  if (countMatch) {
    return buildHint(1, Number.parseInt(countMatch[1], 10));
  }

  return null;
}

function findMainEpisodeRangeHint(pathParts = []) {
  // 从最靠近视频文件的父目录向上找，避免根目录里的发布组信息抢占资源包标题。
  for (let index = Math.max(0, pathParts.length - 2); index >= 0; index -= 1) {
    const hint = parseMainEpisodeRangeHint(pathParts[index]);
    if (hint) {
      return {
        ...hint,
        sourceSegmentIndex: index,
      };
    }
  }

  return null;
}

function getParentDirSource(source) {
  return path.posix.dirname(normalizeSourcePath(source)).replace(/^\.$/u, "");
}

function getParentTitle(parsedEntry) {
  const parts = parsedEntry?.pathParts ?? [];
  return parts.length >= 2 ? parts[parts.length - 2] : getSourceRoot(parsedEntry?.source);
}

function serializeResourceContextEntry(entry) {
  return {
    source: entry.source,
    name: entry.name,
    isDir: Boolean(entry.isDir),
    role: entry.role ?? null,
    ext: entry.ext ?? "",
    season: entry.season ?? null,
    episode: entry.episode ?? null,
    size: entry.size ?? null,
  };
}

function buildVideoSizeRankBySource(videos = []) {
  return new Map(
    videos
      .filter((video) => Number.isFinite(Number(video.size)))
      .slice()
      .sort((left, right) => Number(right.size) - Number(left.size))
      .map((video, index) => [video.source, index + 1]),
  );
}

function buildDirectoryTreeSummary(entries = []) {
  return entries
    .slice()
    .sort((left, right) => {
      const depthGap = getSourceDepth(left.source) - getSourceDepth(right.source);
      if (depthGap !== 0) {
        return depthGap;
      }

      return String(left.source).localeCompare(String(right.source), "zh-Hans-CN");
    })
    .slice(0, 80)
    .map((entry) => ({
      source: entry.source,
      depth: getSourceDepth(entry.source),
      isDir: Boolean(entry.isDir),
      role: entry.role ?? null,
      ext: entry.ext ?? "",
      size: entry.size ?? null,
    }));
}

function isProtectedMainEpisode(parsedEntry, resourceContext = null) {
  if (parsedEntry?.isDir || parsedEntry?.role !== "video" || !parsedEntry?.episode) {
    return false;
  }

  if (!["anime", "series"].includes(parsedEntry.rootCategory) && !["anime", "series"].includes(parsedEntry.category)) {
    return false;
  }

  if (hasFileLevelExtraVideoMarker(parsedEntry) || hasExplicitExtraDirectoryAncestor(parsedEntry.pathParts ?? [])) {
    return false;
  }

  const range = resourceContext?.mainEpisodeRange;
  return Boolean(range && parsedEntry.episode >= range.start && parsedEntry.episode <= range.end);
}

function collectResourcePackageContexts(parsedEntries, directChildrenMap) {
  const contextByRoot = new Map();
  const contextBySource = new Map();

  for (const entry of parsedEntries) {
    const rootSource = getSourceRoot(entry.source);
    if (!rootSource) {
      continue;
    }

    const context =
      contextByRoot.get(rootSource) ??
      {
        rootSource,
        entries: [],
        videos: [],
        subtitles: [],
        sidecarDirectories: [],
        parentTitles: [],
        mainEpisodeRange: null,
        mainEpisodeCount: 0,
        specialEpisodeHint: false,
        rangeSourceSegment: null,
        protectedMainEpisodeSourceSet: new Set(),
      };

    context.entries.push(entry);

    if (entry.role === "video") {
      context.videos.push(entry);
      context.parentTitles.push(getParentTitle(entry));
    }

    if (isSubtitleSidecar(entry)) {
      context.subtitles.push(entry);
    }

    if (entry.isDir && (isNestedSidecarDirectoryName(entry.name) || isExplicitExtraDirectoryName(entry.name))) {
      context.sidecarDirectories.push(entry);
    }

    const rangeHint = findMainEpisodeRangeHint(entry.pathParts ?? []);
    if (rangeHint && (!context.mainEpisodeRange || rangeHint.mainEpisodeCount > context.mainEpisodeCount)) {
      context.mainEpisodeRange = rangeHint.mainEpisodeRange;
      context.mainEpisodeCount = rangeHint.mainEpisodeCount;
      context.specialEpisodeHint = rangeHint.specialEpisodeHint;
      context.rangeSourceSegment = rangeHint.sourceSegment;
    }

    contextByRoot.set(rootSource, context);
  }

  for (const context of contextByRoot.values()) {
    context.parentTitles = dedupeStrings(context.parentTitles);
    context.rootChildren = directChildrenMap.get(context.rootSource) ?? [];
    context.directoryTreeSummary = buildDirectoryTreeSummary(context.entries);
    context.videoSizeRankBySource = buildVideoSizeRankBySource(context.videos);

    for (const video of context.videos) {
      if (isProtectedMainEpisode(video, context)) {
        context.protectedMainEpisodeSourceSet.add(video.source);
      }
    }

    for (const entry of context.entries) {
      contextBySource.set(entry.source, context);
    }
  }

  return {
    resourceContexts: [...contextByRoot.values()],
    resourceContextBySource: contextBySource,
  };
}

function collectProtectedMainEpisodeSourceSet(resourceContexts = []) {
  const sourceSet = new Set();

  for (const context of resourceContexts) {
    for (const source of context.protectedMainEpisodeSourceSet ?? []) {
      sourceSet.add(source);
    }
  }

  return sourceSet;
}

function getLastPathSegment(value) {
  const parts = normalizeSourcePath(value).split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

function shouldUseMediaRouting(rootPath) {
  const normalizedRootPath = normalizeSourcePath(rootPath ?? "");
  if (!normalizedRootPath) {
    return false;
  }

  return !inferExplicitRootCategory(normalizedRootPath);
}

function normalizeMediaRoutingCategory(value) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  if (!normalized) {
    return "unknown";
  }

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

  return MEDIA_ROUTING_CATEGORIES.has(normalized) ? normalized : "unknown";
}

function createMediaRoutingCountMap() {
  return Object.create(null);
}

function incrementMediaRoutingCount(counts, key) {
  const normalizedKey = sanitizeLlmDiagnosticValue(key) ?? "unknown";
  counts[normalizedKey] = (counts[normalizedKey] ?? 0) + 1;
}

function buildMediaRoutingContext({ rootPath, sourceRootRelativePath, resourceContexts }) {
  return {
    task: MEDIA_ROUTING_TASK,
    rootPath: normalizeSourcePath(rootPath ?? ""),
    sourceRootRelativePath: normalizeSourcePath(sourceRootRelativePath ?? ""),
    policy: {
      goal: "按顶层资源包判断最终媒体根；只做分类，不做命名",
      categories: "anime/series/movie/documentary/supplement/unknown",
      confidenceThreshold: MEDIA_ROUTING_MIN_CONFIDENCE,
      lowConfidence: "不确定时必须返回 unknown 或低置信，不能硬猜正片分类",
    },
    resourcePackages: resourceContexts.map((context) => ({
      rootSource: context.rootSource,
      parentTitles: context.parentTitles.slice(0, 12),
      videoCount: context.videos.length,
      subtitleCount: context.subtitles.length,
      sidecarDirectoryCount: context.sidecarDirectories.length,
      sameLevelEntries: (context.rootChildren ?? []).slice(0, 40).map(serializeResourceContextEntry),
      sidecarDirectories: context.sidecarDirectories.slice(0, 40).map(serializeResourceContextEntry),
      directoryTreeSummary: context.directoryTreeSummary,
      videos: context.videos.slice(0, 60).map((video) => ({
        ...serializeResourceContextEntry(video),
        rootSource: context.rootSource,
        parentDir: getParentDirSource(video.source),
        parentTitle: getParentTitle(video),
        sizeRankInPackage: context.videoSizeRankBySource?.get(video.source) ?? null,
        fileLevelExtraMarker: hasFileLevelExtraVideoMarker(video),
        explicitExtraDirectoryAncestor: hasExplicitExtraDirectoryAncestor(video.pathParts ?? []),
      })),
    })),
    outputRules: {
      routes: [
        {
          rootSource: "必须原样返回输入 resourcePackages[].rootSource",
          category: "anime/series/movie/documentary/supplement/unknown",
          confidence: "0 到 1；>= 0.85 才会作为高置信路由",
          reason: "简短理由，说明关键证据",
        },
      ],
    },
  };
}

function normalizeMediaRoutingResult(result, resourceContexts = []) {
  const rawRoutes = Array.isArray(result?.routes)
    ? result.routes
    : Array.isArray(result?.resourcePackages)
      ? result.resourcePackages
      : Array.isArray(result)
        ? result
        : [];
  const allowedRootSources = new Set(resourceContexts.map((context) => context.rootSource));
  const routes = [];

  for (const item of rawRoutes) {
    const rootSource = normalizeSourcePath(item?.rootSource ?? item?.source ?? "");
    if (!rootSource || !allowedRootSources.has(rootSource)) {
      continue;
    }

    const category = normalizeMediaRoutingCategory(item?.category ?? item?.type ?? item?.mediaType);
    const confidence = roundScore(item?.confidence ?? 0);
    const reason = sanitizeLlmDiagnosticValue(item?.reason) ?? null;

    routes.push({
      rootSource,
      category,
      confidence,
      reason,
    });
  }

  return routes;
}

async function resolveMediaRouting({
  enabled,
  rootPath,
  sourceRootRelativePath,
  resourceContexts,
  llmResolver,
}) {
  const routeByRootSource = new Map();
  const summary = {
    enabled: Boolean(enabled),
    configured: typeof llmResolver === "function",
    threshold: MEDIA_ROUTING_MIN_CONFIDENCE,
    packageCount: enabled ? resourceContexts.length : 0,
    callCount: 0,
    routedCount: 0,
    highConfidenceCount: 0,
    lowConfidenceCount: 0,
    unknownCount: 0,
    failureCount: 0,
    categoryCounts: createMediaRoutingCountMap(),
    sourceCounts: createMediaRoutingCountMap(),
    errorReasonCounts: createMediaRoutingCountMap(),
  };

  const setRoute = ({ rootSource, category, confidence = 0, reason = null, source }) => {
    const normalizedCategory = normalizeMediaRoutingCategory(category);
    const normalizedConfidence = roundScore(confidence);
    const highConfidence =
      normalizedCategory !== "unknown" &&
      normalizedConfidence >= MEDIA_ROUTING_MIN_CONFIDENCE;
    const routingSource = highConfidence ? "llm" : source;
    const route = {
      rootSource,
      category: normalizedCategory,
      confidence: normalizedConfidence,
      reason,
      source: routingSource,
      highConfidence,
    };

    routeByRootSource.set(rootSource, route);
    incrementMediaRoutingCount(summary.categoryCounts, normalizedCategory);
    incrementMediaRoutingCount(summary.sourceCounts, routingSource);

    if (highConfidence) {
      summary.highConfidenceCount += 1;
      summary.routedCount += 1;
    } else if (normalizedCategory === "unknown") {
      summary.unknownCount += 1;
    } else {
      summary.lowConfidenceCount += 1;
    }
  };

  if (!enabled || resourceContexts.length === 0) {
    return {
      routeByRootSource,
      summary,
    };
  }

  if (typeof llmResolver !== "function") {
    summary.failureCount = resourceContexts.length;
    incrementMediaRoutingCount(summary.errorReasonCounts, "llm-unavailable");
    for (const context of resourceContexts) {
      setRoute({
        rootSource: context.rootSource,
        category: "unknown",
        confidence: 0,
        reason: "llm-unavailable",
        source: "llm-unavailable",
      });
    }
    return {
      routeByRootSource,
      summary,
    };
  }

  summary.callCount += 1;

  try {
    const context = buildMediaRoutingContext({
      rootPath,
      sourceRootRelativePath,
      resourceContexts,
    });
    const result = await llmResolver(context);
    const routes = normalizeMediaRoutingResult(result, resourceContexts);
    const routeByRoot = new Map(routes.map((route) => [route.rootSource, route]));

    for (const resourceContext of resourceContexts) {
      const route = routeByRoot.get(resourceContext.rootSource);
      if (!route) {
        setRoute({
          rootSource: resourceContext.rootSource,
          category: "unknown",
          confidence: 0,
          reason: "missing-route",
          source: "llm-missing",
        });
        continue;
      }

      setRoute({
        ...route,
        source:
          route.confidence >= MEDIA_ROUTING_MIN_CONFIDENCE
            ? "llm"
            : "llm-low-confidence",
      });
    }
  } catch (error) {
    const reason = normalizeLlmErrorReason(error);
    summary.failureCount = resourceContexts.length;
    incrementMediaRoutingCount(summary.errorReasonCounts, reason);
    for (const context of resourceContexts) {
      setRoute({
        rootSource: context.rootSource,
        category: "unknown",
        confidence: 0,
        reason,
        source: "llm-error",
      });
    }
  }

  return {
    routeByRootSource,
    summary,
  };
}

function normalizeTmdbInputContext(options = {}) {
  const inputContext =
    options.inputContext && typeof options.inputContext === "object" ? options.inputContext : {};

  return {
    ...inputContext,
    state: inputContext.state ?? options.state,
    pendingFolderCount: inputContext.pendingFolderCount ?? options.pendingFolderCount,
  };
}

function canAutoDeleteEmptyMediaDirectories(inputContext = {}) {
  const state = String(inputContext.state ?? "").trim().toLowerCase();
  if (["paused", "error", "running"].includes(state)) {
    return false;
  }

  const pendingFolderCount = Number(inputContext.pendingFolderCount);
  if (Number.isFinite(pendingFolderCount) && pendingFolderCount > 0) {
    return false;
  }

  return state === "done" || (Number.isFinite(pendingFolderCount) && pendingFolderCount === 0);
}

function hasKnownFileDescendantSummary(parsedEntry) {
  const fileCount = Number(parsedEntry?.fileCount);
  return Number.isFinite(fileCount) && fileCount > 0;
}

function isCurrentScanRootEntry(parsedEntry, { rootPath, sourceRootRelativePath }) {
  const source = normalizeSourcePath(parsedEntry?.source ?? "");
  if (!source) {
    return true;
  }

  const normalizedRootPath = normalizeSourcePath(rootPath ?? "");
  const normalizedSourceRoot = normalizeSourcePath(sourceRootRelativePath ?? "");
  return Boolean(
    (normalizedRootPath && source === normalizedRootPath) ||
      (normalizedSourceRoot && source === normalizedSourceRoot),
  );
}

function isWithinMediaCategoryRoot(parsedEntry, { rootPath, sourceRootRelativePath }) {
  if (MEDIA_CATEGORY_ROOT_NAMES.has(getLastPathSegment(rootPath))) {
    return true;
  }

  if (MEDIA_CATEGORY_ROOT_NAMES.has(getLastPathSegment(sourceRootRelativePath))) {
    return true;
  }

  const [sourceRoot] = parsedEntry?.pathParts ?? [];
  return MEDIA_CATEGORY_ROOT_NAMES.has(sourceRoot);
}

function addDirectoryAncestorsToSet(source, targetSet) {
  let parentSource = path.posix.dirname(normalizeSourcePath(source));
  while (parentSource && parentSource !== "." && parentSource !== "/") {
    targetSet.add(parentSource);
    parentSource = path.posix.dirname(parentSource);
  }
}

function hasDirectoryAncestorInSet(source, sourceSet) {
  let parentSource = path.posix.dirname(normalizeSourcePath(source));
  while (parentSource && parentSource !== "." && parentSource !== "/") {
    if (sourceSet.has(parentSource)) {
      return true;
    }

    parentSource = path.posix.dirname(parentSource);
  }

  return false;
}

function isEmptyMediaDirectoryCandidate(parsedEntry, { rootPath, sourceRootRelativePath }) {
  if (!parsedEntry.isDir || !parsedEntry.cid || !parsedEntry.source) {
    return false;
  }

  if (isCurrentScanRootEntry(parsedEntry, { rootPath, sourceRootRelativePath })) {
    return false;
  }

  if (!isWithinMediaCategoryRoot(parsedEntry, { rootPath, sourceRootRelativePath })) {
    return false;
  }

  return !hasKnownFileDescendantSummary(parsedEntry);
}

function buildEmptyDirectorySourceSet(
  parsedEntries,
  { rootPath, sourceRootRelativePath, inputContext } = {},
) {
  if (!canAutoDeleteEmptyMediaDirectories(inputContext)) {
    return new Set();
  }

  const entryBySource = new Map(parsedEntries.filter((entry) => entry.source).map((entry) => [entry.source, entry]));
  const directChildrenMap = buildDirectChildrenMap(parsedEntries);
  const fileDescendantAncestorSet = new Set();

  for (const entry of parsedEntries) {
    if (entry.source && !entry.isDir) {
      addDirectoryAncestorsToSet(entry.source, fileDescendantAncestorSet);
    }
  }

  const candidateSourceSet = new Set(
    parsedEntries
      .filter((entry) => isEmptyMediaDirectoryCandidate(entry, { rootPath, sourceRootRelativePath }))
      .map((entry) => entry.source),
  );
  const emptyDirectorySourceSet = new Set();
  const memo = new Map();

  const isRecursivelyEmptyDirectory = (source) => {
    if (memo.has(source)) {
      return memo.get(source);
    }

    const entry = entryBySource.get(source);
    if (!entry || !candidateSourceSet.has(source) || fileDescendantAncestorSet.has(source)) {
      memo.set(source, false);
      return false;
    }

    const children = directChildrenMap.get(source) ?? [];
    if (children.some((child) => !child.isDir)) {
      memo.set(source, false);
      return false;
    }

    // 递归收敛：只有全部子目录也确认为空时，父目录才允许被提升为删除目标。
    const allChildDirectoriesEmpty = children.every((child) => isRecursivelyEmptyDirectory(child.source));
    memo.set(source, allChildDirectoriesEmpty);
    return allChildDirectoriesEmpty;
  };

  for (const source of candidateSourceSet) {
    if (isRecursivelyEmptyDirectory(source)) {
      emptyDirectorySourceSet.add(source);
    }
  }

  return emptyDirectorySourceSet;
}

function buildEpisodicDirectorySourceSet(parsedEntries) {
  const directorySources = parsedEntries
    .filter((entry) => entry.isDir && entry.source)
    .map((entry) => entry.source)
    .sort((left, right) => getSourceDepth(right) - getSourceDepth(left));
  const episodicDirectorySources = new Set();

  for (const entry of parsedEntries) {
    if (!entry.source || (!entry.season && !entry.episode)) {
      continue;
    }

    for (const directorySource of directorySources) {
      if (entry.source === directorySource || entry.source.startsWith(`${directorySource}/`)) {
        episodicDirectorySources.add(directorySource);
      }
    }
  }

  return episodicDirectorySources;
}

function hasLatinLetters(value) {
  return /[A-Za-z]/u.test(String(value ?? ""));
}

function roundScore(value) {
  return Number(Math.max(0, Math.min(0.99, value)).toFixed(2));
}

function expandTrailingNoiseTitleCandidates(title) {
  const value = String(title ?? "").trim();
  const variants = [value];
  const trimmedNumericTail = value.replace(/\s+\d{1,2}$/u, "").trim();

  if (trimmedNumericTail && trimmedNumericTail !== value) {
    variants.push(trimmedNumericTail);
  }

  return dedupeStrings(variants);
}

function expandMixedLanguageTitleCandidates(title) {
  const value = String(title ?? "").trim();
  const variants = [value];

  if (/[\u4e00-\u9fff]/u.test(value) && /[A-Za-z]/u.test(value)) {
    variants.push(
      value.replace(/[A-Za-z0-9 .&'"“”‘’:/_-]+/gu, " ").replace(/\s+/g, " ").trim(),
      value.replace(/[\u4e00-\u9fff【】《》()（）]+/gu, " ").replace(/\s+/g, " ").trim(),
    );
  }

  return dedupeStrings(variants.flatMap((item) => expandTrailingNoiseTitleCandidates(item)));
}

function extractSeasonFromPathParts(pathParts) {
  for (let index = pathParts.length - 1; index >= 0; index -= 1) {
    const season = extractSeason(pathParts[index]);
    if (season) {
      return season;
    }
  }

  return null;
}

function hasTvSeriesYearHint(parsedEntry) {
  if (!parsedEntry?.year) {
    return false;
  }

  const stem = String(parsedEntry.stem ?? "");
  const yearMatch = stem.match(/\b(19[3-9]\d|20[0-4]\d)\b/u);
  if (!yearMatch || yearMatch.index === undefined) {
    return parsedEntry.isDir && getSourceDepth(parsedEntry.source) <= 2;
  }

  const seasonOrEpisodeIndex = stem.search(
    /(?:^|[^A-Za-z0-9])S\d{1,2}E\d{1,3}(?=$|[^0-9])|(?:^|[^A-Za-z0-9])S\d{1,2}(?=$|[^0-9])|(?:^|[^A-Za-z0-9])EP?\d{1,3}(?=$|[^0-9])|第\s*[0-9一二三四五六七八九十百零两]+\s*[集话話季]|\bSeason[ ._-]?\d{1,2}\b/iu,
  );

  if (seasonOrEpisodeIndex === -1) {
    return parsedEntry.isDir && getSourceDepth(parsedEntry.source) <= 2;
  }

  return yearMatch.index < seasonOrEpisodeIndex;
}

function resolveParsedCategory({ detectedCategory, rootCategory, routedCategory = null }) {
  if (ROUTABLE_MEDIA_CATEGORIES.has(routedCategory)) {
    return routedCategory;
  }

  if (!rootCategory) {
    return detectedCategory;
  }

  if (["documentary", "variety", "anime"].includes(detectedCategory)) {
    return detectedCategory;
  }

  if (rootCategory === "anime") {
    return ["movie", "review"].includes(detectedCategory) ? "anime" : detectedCategory;
  }

  if (rootCategory === "series") {
    return ["movie", "review"].includes(detectedCategory) ? "series" : detectedCategory;
  }

  return detectedCategory;
}

function extractPrefixBeforeBracketEpisodeToken(stem, category) {
  if (!["anime", "series"].includes(category)) {
    return null;
  }

  const normalizedStem = String(stem ?? "");
  if (
    !normalizedStem ||
    /\b\d{1,3}\s*-\s*\d{1,3}\b/u.test(normalizedStem) ||
    /\[\s*\d{1,3}\s+\d{1,3}\s*\]/u.test(normalizedStem) ||
    /合集/u.test(normalizedStem) ||
    /(?:^|[^A-Za-z0-9])(?:SP|NCOP|NCED|CD\d*|Music)(?=$|[^A-Za-z0-9])/iu.test(normalizedStem)
  ) {
    return null;
  }

  const bracketMatches = [...normalizedStem.matchAll(/\[([^\]]+)\]/gu)];

  // 与 episode 抽取保持一致：只认最后一个纯数字方括号，并裁掉其后的技术尾巴。
  for (let index = bracketMatches.length - 1; index >= 0; index -= 1) {
    const content = String(bracketMatches[index]?.[1] ?? "").trim();
    if (!/^\d{1,3}$/u.test(content)) {
      continue;
    }

    const episode = Number.parseInt(content, 10);
    if (!Number.isFinite(episode) || episode <= 0) {
      continue;
    }

    const prefix = normalizedStem.slice(0, bracketMatches[index].index).trim();
    if (!prefix) {
      return null;
    }

    const candidate = buildTitle(prefix);
    if (candidate && candidate !== "未识别标题") {
      return candidate;
    }
  }

  return null;
}

function extractPrefixBeforeEpisodeToken(stem, category) {
  const patterns = [
    /^(.*?)(?:^|[^A-Za-z0-9])S\d{1,2}E\d{1,3}(?=$|[^0-9])/i,
    /^(.*?)(?:^|[^A-Za-z0-9])EP?\d{1,3}(?=$|[^0-9])/i,
    /^(.*?)第\s*[0-9一二三四五六七八九十百零两]+\s*[集话話期]/i,
    /^(.*?)\s-\s*\d{1,3}(?:\.\d+)?(?:v\d+)?(?:\s*(?:END|FINAL))?(?=$|[\s\[【(（])/iu,
    /^(.*?)(?:^|\s)\d{1,3}v\d+(?=$|[\s\]】)）])/iu,
  ];

  for (const pattern of patterns) {
    const matched = String(stem ?? "").match(pattern);
    if (matched?.[1]) {
      const candidate = buildTitle(matched[1]);
      if (candidate && candidate !== "未识别标题") {
        return candidate;
      }
    }
  }

  const bracketEpisodePrefix = extractPrefixBeforeBracketEpisodeToken(stem, category);
  if (bracketEpisodePrefix) {
    return bracketEpisodePrefix;
  }

  return null;
}

function collectTitleCandidates({ pathParts, stem, category, rootCategory }) {
  const rawCandidates = [extractPrefixBeforeEpisodeToken(stem, category), stem, ...pathParts.slice(0, -1).reverse()];
  const normalizedCandidates = rawCandidates
    .filter((segment) => segment && !isSeasonLikePathSegment(segment))
    .filter((segment) => !isNestedSidecarDirectoryName(segment))
    .map((segment) => buildTitle(segment));
  const rawValues = [stem, ...pathParts, ...normalizedCandidates];

  if (category === "anime") {
    return dedupeStrings([
      ...collectKnownAnimeTitleCandidates(rawValues),
      ...normalizedCandidates.flatMap((title) => expandMovieStrongQueryCandidates(title, rawValues)),
    ]).filter(isUsableQueryTitle);
  }

  if (category === "series") {
    return dedupeStrings([
      ...collectKnownTvTitleCandidates(rawValues),
      ...normalizedCandidates.flatMap((title) => expandMovieStrongQueryCandidates(title, rawValues)),
    ]).filter(isUsableQueryTitle);
  }

  if (rootCategory === "movie" || category === "movie") {
    return dedupeStrings(
      normalizedCandidates.flatMap((title) => expandMovieStrongQueryCandidates(title, rawValues)),
    ).filter(isUsableQueryTitle);
  }

  return dedupeStrings(
    normalizedCandidates
      .flatMap((title) => expandMixedLanguageTitleCandidates(title))
      .filter(isUsableQueryTitle),
  );
}

export function parseTmdbNormalizeEntry(entry, options = {}) {
  const source = normalizeSourcePath(entry.source ?? "");
  const sourceRootRelativePath = inferSourceRootRelativePath(options);
  const pathParts = source.split("/").filter(Boolean);
  const name = path.posix.basename(source);
  const ext = entry.isDir ? "" : path.posix.extname(name).toLowerCase();
  const stem = ext ? name.slice(0, -ext.length) : name;
  const role = detectRole(ext, entry.isDir);
  const size = normalizeEntrySize(entry);
  const explicitRootCategory = inferExplicitRootCategory(options.rootPath);
  const routing = options.mediaRouting && typeof options.mediaRouting === "object" ? options.mediaRouting : null;
  const routingCategory = normalizeMediaRoutingCategory(routing?.category);
  const routedRootCategory =
    routing?.highConfidence && ROUTABLE_MEDIA_CATEGORIES.has(routingCategory)
      ? routingCategory
      : null;
  const rootCategory = routedRootCategory ?? explicitRootCategory;
  const detectedCategory = detectCategory(stem, role);
  const knownCrossCategory = inferKnownCrossCategory({ rootCategory, stem, pathParts });
  const category = resolveParsedCategory({
    detectedCategory: knownCrossCategory ?? detectedCategory,
    rootCategory,
    routedCategory: routedRootCategory,
  });
  const year = extractYear(stem);
  const knownEpisodeOverride = resolveKnownEpisodeOverride({
    source,
    stem,
    pathParts,
    category,
    rootCategory,
  });
  const episode = knownEpisodeOverride ?? extractEpisode(stem, category) ?? inferKnownAnimeBracketEpisode(stem, category);
  const season =
    extractSeason(stem) ??
    extractSeasonFromPathParts(pathParts.slice(0, -1)) ??
    ((rootCategory === "series" || rootCategory === "anime" || category === "series" || category === "anime") && episode
      ? 1
      : null);
  const titleCandidates = collectTitleCandidates({ pathParts, stem, category, rootCategory });
  const title = titleCandidates[0] ?? "未识别标题";
  const knownCanonicalTitle = resolveKnownCanonicalTitleHint({
    source,
    stem,
    pathParts,
    titleCandidates,
    category,
    rootCategory,
  });

  return {
    ...entry,
    source,
    sourceRootRelativePath,
    actualSourceRelativePath: buildActualSourceRelativePath(source, sourceRootRelativePath),
    pathParts,
    name,
    ext,
    stem,
    role,
    size,
    explicitRootCategory,
    rootCategory,
    category,
    routingSource: routing?.source ?? null,
    routingCategory: routing?.category ?? null,
    routingConfidence: routing ? roundScore(routing.confidence ?? 0) : null,
    routingReason: routing?.reason ?? null,
    routingHighConfidence: Boolean(routing?.highConfidence),
    mediaRoutingEnabled: Boolean(options.mediaRoutingEnabled),
    year,
    season,
    episode,
    title,
    titleCandidates,
    knownCanonicalTitleZh: knownCanonicalTitle?.canonicalTitleZh ?? null,
    knownCanonicalTitleEn: knownCanonicalTitle?.canonicalTitleEn ?? null,
    isDir: Boolean(entry.isDir),
    fid: entry.fid ?? null,
    cid: entry.cid ?? null,
  };
}

export function inferTmdbSearchType(parsedEntry) {
  if (parsedEntry.isDir && parsedEntry.hasEpisodicDescendant) {
    return "tv";
  }

  if (parsedEntry.rootCategory === "anime" || parsedEntry.rootCategory === "series") {
    return "tv";
  }

  if (parsedEntry.category === "anime" || parsedEntry.category === "series") {
    return "tv";
  }

  if (parsedEntry.season || parsedEntry.episode) {
    return "tv";
  }

  return "movie";
}

export function normalizeComparableTitle(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[._\-/:：'"“”‘’`~!?,，。&(){}\[\]【】《》\s]+/g, "")
    .trim();
}

export function buildCanonicalOverrideRootKey(source = "") {
  return normalizeComparableTitle(getSourceRoot(source));
}

export function buildCanonicalOverrideTitleKey(value = "") {
  return normalizeComparableTitle(value);
}

function buildCanonicalOverrideCompoundKey({ rootKey, titleKey }) {
  if (!rootKey || !titleKey) {
    return "";
  }

  return `${rootKey}::${titleKey}`;
}

function normalizeCanonicalOverrideEntry(value = {}) {
  const canonicalTitleZh = String(value?.canonicalTitleZh ?? "").trim();
  const canonicalTitleEn = String(value?.canonicalTitleEn ?? "").trim();
  const tmdbType = value?.tmdbType === "movie" ? "movie" : value?.tmdbType === "tv" ? "tv" : null;
  const tmdbId =
    value?.tmdbId === undefined || value?.tmdbId === null || value?.tmdbId === ""
      ? null
      : value.tmdbId;

  if (!canonicalTitleZh || !tmdbType) {
    return null;
  }

  return {
    sourceRoot: String(value?.sourceRoot ?? "").trim() || null,
    sourceTitle: String(value?.sourceTitle ?? value?.titleKey ?? "").trim() || null,
    canonicalTitleZh,
    canonicalTitleEn: canonicalTitleEn || null,
    tmdbType,
    tmdbId,
  };
}

function buildCanonicalTitleOverrideMap(cleanupOverrides = {}) {
  const rawEntries = cleanupOverrides?.canonicalTitleOverrides;
  if (!rawEntries || typeof rawEntries !== "object") {
    return new Map();
  }

  const map = new Map();

  for (const [rawKey, rawValue] of Object.entries(rawEntries)) {
    const entry = normalizeCanonicalOverrideEntry(rawValue);
    if (!entry) {
      continue;
    }

    const normalizedKey = String(rawKey ?? "").includes("::")
      ? String(rawKey).trim()
      : buildCanonicalOverrideCompoundKey({
          rootKey: buildCanonicalOverrideRootKey(entry.sourceRoot),
          titleKey: buildCanonicalOverrideTitleKey(entry.sourceTitle),
        });

    if (!normalizedKey) {
      continue;
    }

    map.set(normalizedKey, entry);
  }

  return map;
}

function collectCanonicalOverrideMatchKeys(parsedEntry) {
  const rootKey = buildCanonicalOverrideRootKey(parsedEntry?.source);
  if (!rootKey) {
    return [];
  }

  const titleKeys = dedupeStrings([
    parsedEntry?.title ?? "",
    ...(parsedEntry?.titleCandidates ?? []),
    parsedEntry?.knownCanonicalTitleZh ?? "",
    parsedEntry?.knownCanonicalTitleEn ?? "",
    getSourceRoot(parsedEntry?.source),
  ])
    .map((value) => buildCanonicalOverrideTitleKey(value))
    .filter(Boolean);

  return titleKeys.map((titleKey) => {
    return buildCanonicalOverrideCompoundKey({
      rootKey,
      titleKey,
    });
  });
}

function resolveCanonicalTitleOverrideMatch(parsedEntry, canonicalTitleOverrideMap) {
  if (!canonicalTitleOverrideMap || canonicalTitleOverrideMap.size === 0) {
    return null;
  }

  for (const key of collectCanonicalOverrideMatchKeys(parsedEntry)) {
    const matched = canonicalTitleOverrideMap.get(key);
    if (matched) {
      return matched;
    }
  }

  return null;
}

function buildTitleBigrams(value) {
  if (value.length < 2) {
    return [value];
  }

  const grams = [];
  for (let index = 0; index < value.length - 1; index += 1) {
    grams.push(value.slice(index, index + 2));
  }
  return grams;
}

export function calculateTitleSimilarity(left, right) {
  const normalizedLeft = normalizeComparableTitle(left);
  const normalizedRight = normalizeComparableTitle(right);

  if (!normalizedLeft || !normalizedRight) {
    return 0;
  }

  if (normalizedLeft === normalizedRight) {
    return 1;
  }

  if (
    normalizedLeft.length >= 4 &&
    normalizedRight.length >= 4 &&
    (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft))
  ) {
    const lengthGap = Math.abs(normalizedLeft.length - normalizedRight.length);
    return roundScore(Math.max(0.88, 0.96 - lengthGap * 0.03));
  }

  const leftBigrams = buildTitleBigrams(normalizedLeft);
  const rightBigrams = buildTitleBigrams(normalizedRight);
  const rightBag = new Map();

  for (const gram of rightBigrams) {
    rightBag.set(gram, (rightBag.get(gram) ?? 0) + 1);
  }

  let overlap = 0;
  for (const gram of leftBigrams) {
    const remaining = rightBag.get(gram) ?? 0;
    if (remaining > 0) {
      overlap += 1;
      rightBag.set(gram, remaining - 1);
    }
  }

  return roundScore((2 * overlap) / (leftBigrams.length + rightBigrams.length));
}

function hasStrongPopularityLead(top, second) {
  if (!top || !second) {
    return false;
  }

  const topPopularity = Number(top.candidate.popularity ?? 0);
  const secondPopularity = Number(second.candidate.popularity ?? 0);
  if (topPopularity < 5) {
    return false;
  }

  const popularityGap = topPopularity - secondPopularity;
  const popularityRatio =
    secondPopularity > 0 ? topPopularity / secondPopularity : Number.POSITIVE_INFINITY;

  return popularityGap >= 8 || popularityRatio >= 2.5;
}

function extractCandidateTitles(candidate, searchType) {
  const values =
    searchType === "movie"
      ? [candidate.title, candidate.original_title]
      : [candidate.name, candidate.original_name];

  return [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))];
}

function extractCandidateYear(candidate, searchType) {
  const dateValue = searchType === "movie" ? candidate.release_date : candidate.first_air_date;
  const yearMatch = String(dateValue ?? "").match(/^(\d{4})/u);
  return yearMatch ? Number.parseInt(yearMatch[1], 10) : null;
}

export function scoreTmdbCandidate({ parsedEntry, candidate, searchType }) {
  const candidateTitles = extractCandidateTitles(candidate, searchType);
  const titleScore = Math.max(
    ...parsedEntry.titleCandidates.flatMap((queryTitle) => {
      return candidateTitles.map((title) => calculateTitleSimilarity(queryTitle, title));
    }),
    0,
  );
  const candidateYear = extractCandidateYear(candidate, searchType);
  let score = titleScore * 0.88;
  let yearConflict = false;

  if (searchType === "movie" && parsedEntry.year && candidateYear) {
    const yearGap = Math.abs(parsedEntry.year - candidateYear);
    if (yearGap === 0) {
      score += 0.1;
    } else if (yearGap === 1) {
      score += 0.05;
    } else {
      score -= 0.18;
      yearConflict = true;
    }
  } else if (searchType === "movie" && !parsedEntry.year && candidateYear) {
    score += 0.02;
  }

  if (searchType === "tv" && parsedEntry.category === "anime" && candidate.original_language === "ja") {
    score += 0.02;
  }

  if (searchType === "tv" && hasTvSeriesYearHint(parsedEntry) && parsedEntry.year && candidateYear) {
    if (candidateYear === parsedEntry.year) {
      score += 0.08;
    } else if (Math.abs(candidateYear - parsedEntry.year) === 1) {
      score += 0.01;
    }
  }

  return {
    candidate,
    candidateTitles,
    candidateYear,
    titleScore: roundScore(titleScore),
    score: roundScore(score),
    yearConflict,
  };
}

export function selectTmdbCandidate({ parsedEntry, searchType, searchResults }) {
  const ranked = searchResults
    .map((candidate) => scoreTmdbCandidate({ parsedEntry, candidate, searchType }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      const rightPopularity = Number(right.candidate.popularity ?? 0);
      const leftPopularity = Number(left.candidate.popularity ?? 0);
      return rightPopularity - leftPopularity;
    });
  const trustedExactTmdbAlias =
    searchType === "movie"
      ? findTrustedExactTmdbMovieAliasMatch({ parsedEntry, ranked })
      : { rule: null, match: null };

  if (trustedExactTmdbAlias.match) {
    return {
      matched: true,
      confidence: Math.max(AUTO_ACCEPT_SCORE, trustedExactTmdbAlias.match.score),
      ranked,
      match: trustedExactTmdbAlias.match.candidate,
      trustedExactTmdbOnly: true,
    };
  }

  if (trustedExactTmdbAlias.rule) {
    return {
      matched: false,
      reviewReason: TMDB_REVIEW_REASON_MISS,
      confidence: ranked[0]?.score ?? 0,
      ranked,
      trustedExactTmdbOnly: true,
    };
  }

  const top = ranked[0];
  if (!top || top.titleScore < MIN_TITLE_SCORE) {
    return {
      matched: false,
      reviewReason: TMDB_REVIEW_REASON_MISS,
      confidence: 0,
      ranked,
    };
  }

  if (searchType === "movie" && parsedEntry.year && top.yearConflict) {
    return {
      matched: false,
      reviewReason: TMDB_REVIEW_REASON_YEAR_CONFLICT,
      confidence: top.score,
      ranked,
    };
  }

  const second = ranked[1];
  const closeSecondCandidate =
    second &&
    second.titleScore >= AUTO_ACCEPT_SCORE - 0.03 &&
    top.score - second.score < AMBIGUOUS_SCORE_GAP;

  if (
    top.score < AUTO_ACCEPT_SCORE ||
    (closeSecondCandidate && !hasStrongPopularityLead(top, second))
  ) {
    return {
      matched: false,
      reviewReason: TMDB_REVIEW_REASON_AMBIGUOUS,
      confidence: top.score,
      ranked,
    };
  }

  return {
    matched: true,
    confidence: top.score,
    ranked,
    match: top.candidate,
  };
}

function canAcceptSingleSearchResult({ matchedQueryTitle, selection }) {
  if (!matchedQueryTitle || !selection?.candidate) {
    return false;
  }

  const normalizedQuery = String(matchedQueryTitle).trim();
  if (!normalizedQuery || !hasLatinLetters(normalizedQuery) || /[\u4e00-\u9fff]/u.test(normalizedQuery)) {
    return false;
  }

  if (
    TRUSTED_LOW_POPULARITY_SINGLE_RESULT_QUERY_KEYS.has(normalizeComparableTitle(normalizedQuery))
  ) {
    return true;
  }

  const latinTokens = (normalizedQuery.match(/[A-Za-z]+/gu) ?? []).filter((token) => token.length >= 3);
  const totalLetters = latinTokens.reduce((sum, token) => sum + token.length, 0);
  if (totalLetters < 6) {
    return false;
  }

  if (latinTokens.length === 1 && latinTokens[0].length < 6) {
    return false;
  }

  return Number(selection.candidate.popularity ?? 0) >= 3;
}

function sanitizeDisplayTitle(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function hasChineseCharacters(value) {
  return /[\u4e00-\u9fff]/u.test(String(value ?? ""));
}

function formatCanonicalSegment(value) {
  return sanitizePathSegment(
    sanitizeDisplayTitle(value)
      .replace(/[&]/g, " and ")
      .replace(/[·•]/g, " ")
      .replace(/[,:;!?'"“”‘’`~]/g, " ")
      .replace(/[._/\-\s]+/g, ".")
      .replace(/\.+/g, ".")
      .replace(/^\.+|\.+$/g, ""),
  );
}

const MOVIE_ENGLISH_ALT_REGION_ORDER = ["US", "GB", "AU", "NZ", "IE"];
const MOVIE_ENGLISH_ALT_REJECTED_TYPE_PATTERNS = [
  /\bworking\b/i,
  /\bformer\b/i,
  /\binformal\b/i,
  /\bpromotional?\b/i,
  /\b3d\b/i,
];
const MOVIE_ENGLISH_ALT_PREFERRED_TYPE_PATTERNS = [
  /\bmain title\b/i,
  /\binternational title\b/i,
  /\balternative title\b/i,
  /\btranslation title\b/i,
  /\bliteral title\b/i,
];

function collectEnglishTitlesFromDetails(details) {
  const values = [];

  for (const item of details?.translations?.translations ?? []) {
    if (item?.iso_639_1 !== "en") {
      continue;
    }

    const translatedTitle = item?.data?.title ?? item?.data?.name ?? null;
    if (translatedTitle) {
      values.push(translatedTitle);
    }
  }

  return values;
}

function rankMovieAlternativeTitle(item) {
  const region = String(item?.iso_3166_1 ?? "").toUpperCase();
  const regionIndex = MOVIE_ENGLISH_ALT_REGION_ORDER.indexOf(region);
  if (regionIndex === -1) {
    return null;
  }

  const title = sanitizeDisplayTitle(item?.title);
  if (!title || !hasLatinLetters(title) || hasChineseCharacters(title)) {
    return null;
  }

  const type = sanitizeDisplayTitle(item?.type).toLowerCase();
  if (MOVIE_ENGLISH_ALT_REJECTED_TYPE_PATTERNS.some((pattern) => pattern.test(type))) {
    return null;
  }

  const typePriority =
    !type || MOVIE_ENGLISH_ALT_PREFERRED_TYPE_PATTERNS.some((pattern) => pattern.test(type)) ? 0 : 1;

  return regionIndex * 10 + typePriority;
}

function collectPreferredEnglishAlternativeTitles(details) {
  return [...(details?.alternative_titles?.titles ?? [])]
    .map((item) => {
      return {
        title: sanitizeDisplayTitle(item?.title),
        priority: rankMovieAlternativeTitle(item),
      };
    })
    .filter((item) => item.priority !== null && item.title)
    .sort((left, right) => left.priority - right.priority)
    .map((item) => item.title);
}

function collectChineseTitlesFromDetails(details, searchType) {
  const primaryTitle = searchType === "movie" ? details?.title : details?.name;
  const values = [];

  if (hasChineseCharacters(primaryTitle)) {
    values.push(primaryTitle);
  }

  const prioritizedTranslations = [...(details?.translations?.translations ?? [])]
    .filter((item) => String(item?.iso_639_1 ?? "").toLowerCase() === "zh")
    .sort((left, right) => {
      const regionOrder = ["CN", "SG", "HK", "TW"];
      const leftRegion = String(left?.iso_3166_1 ?? "");
      const rightRegion = String(right?.iso_3166_1 ?? "");
      const leftIndex = regionOrder.indexOf(leftRegion);
      const rightIndex = regionOrder.indexOf(rightRegion);
      const normalizedLeftIndex = leftIndex === -1 ? regionOrder.length : leftIndex;
      const normalizedRightIndex = rightIndex === -1 ? regionOrder.length : rightIndex;
      return normalizedLeftIndex - normalizedRightIndex;
    });

  for (const item of prioritizedTranslations) {
    const translatedTitle = item?.data?.title ?? item?.data?.name ?? null;
    if (hasChineseCharacters(translatedTitle)) {
      values.push(translatedTitle);
    }
  }

  return values
    .map((value) => sanitizeDisplayTitle(value))
    .filter(Boolean)
    .filter((value, index, list) => list.indexOf(value) === index);
}

function collectChineseTitlesFromMatch(match, searchType) {
  const values =
    searchType === "movie"
      ? [match?.title, match?.original_title]
      : [match?.name, match?.original_name];

  return values
    .filter((value) => hasChineseCharacters(value))
    .map((value) => sanitizeDisplayTitle(value))
    .filter(Boolean)
    .filter((value, index, list) => list.indexOf(value) === index);
}

function shouldResolveLocalizedChineseTitle(canonicalTitleZh, originalTitle) {
  const normalizedCanonicalTitle = sanitizeDisplayTitle(canonicalTitleZh);
  if (!normalizedCanonicalTitle) {
    return true;
  }

  if (hasChineseCharacters(normalizedCanonicalTitle)) {
    return false;
  }

  if (!hasLatinLetters(normalizedCanonicalTitle)) {
    return false;
  }

  if (
    originalTitle &&
    normalizeComparableTitle(normalizedCanonicalTitle) === normalizeComparableTitle(originalTitle)
  ) {
    return true;
  }

  return true;
}

function resolveLocalizedTitleOverride({ parsedEntry, canonicalTitleZh, originalTitle, match, details }) {
  const candidates = [
    canonicalTitleZh,
    originalTitle,
    details?.name,
    details?.title,
    details?.original_name,
    details?.original_title,
    match?.name,
    match?.title,
    match?.original_name,
    match?.original_title,
    ...(parsedEntry?.titleCandidates ?? []),
  ]
    .map((value) => normalizeComparableTitle(value))
    .filter(Boolean);

  for (const candidate of candidates) {
    const translatedTitle = LOCALIZED_TITLE_OVERRIDES.get(candidate);
    if (translatedTitle) {
      return translatedTitle;
    }
  }

  return null;
}

async function resolveLocalizedChineseTitle({
  parsedEntry,
  searchType,
  match,
  details,
  canonicalTitleZh,
  originalTitle,
  titleTranslator,
}) {
  const detailsTitle = collectChineseTitlesFromDetails(details, searchType)[0];
  if (detailsTitle) {
    return detailsTitle;
  }

  const matchedTitle = collectChineseTitlesFromMatch(match, searchType)[0];
  if (matchedTitle) {
    return matchedTitle;
  }

  const localizedOverride = resolveLocalizedTitleOverride({
    parsedEntry,
    canonicalTitleZh,
    originalTitle,
    match,
    details,
  });
  if (localizedOverride) {
    return localizedOverride;
  }

  if (typeof titleTranslator === "function") {
    const translated = await titleTranslator({
      parsedEntry,
      searchType,
      match,
      details,
      canonicalTitleZh,
      originalTitle,
    });
    const translatedTitle =
      typeof translated === "string" ? translated : translated?.canonicalTitleZh ?? null;
    const normalizedTranslatedTitle = sanitizeDisplayTitle(translatedTitle);
    if (normalizedTranslatedTitle) {
      return normalizedTranslatedTitle;
    }
  }

  return canonicalTitleZh;
}

async function resolveCanonicalTitles({
  parsedEntry,
  searchType,
  match,
  tmdbClient,
  detailsCache,
  titleTranslator,
}) {
  let details = null;
  const getDetails = searchType === "movie" ? tmdbClient.getMovieDetails : tmdbClient.getTvDetails;
  const detailsCacheKey = `${searchType}:${match.id}`;

  if (typeof getDetails === "function") {
    if (!detailsCache.has(detailsCacheKey)) {
      detailsCache.set(
        detailsCacheKey,
        Promise.resolve()
          .then(() => getDetails.call(tmdbClient, match.id))
          .catch(() => null),
      );
    }

    details = await detailsCache.get(detailsCacheKey);
  }

  let canonicalTitleZh =
    sanitizeDisplayTitle(searchType === "movie" ? details?.title ?? match.title : details?.name ?? match.name) ||
    parsedEntry.title;
  const originalTitle = sanitizeDisplayTitle(
    searchType === "movie"
      ? details?.original_title ?? match.original_title ?? null
      : details?.original_name ?? match.original_name ?? null,
  );

  if (shouldResolveLocalizedChineseTitle(canonicalTitleZh, originalTitle)) {
    canonicalTitleZh = await resolveLocalizedChineseTitle({
      parsedEntry,
      searchType,
      match,
      details,
      canonicalTitleZh,
      originalTitle,
      titleTranslator,
    });
  }

  if (searchType !== "movie") {
    return {
      canonicalTitleZh,
      canonicalTitleEn: originalTitle,
      details,
    };
  }

  const normalizedCanonicalTitleZh = normalizeComparableTitle(canonicalTitleZh);
  const originalLanguage = String(details?.original_language ?? match?.original_language ?? "").toLowerCase();
  const englishCandidates = [];
  const englishCandidateSet = new Set();
  const addEnglishCandidate = (value) => {
    const normalizedValue = normalizeComparableTitle(value);
    if (!normalizedValue || englishCandidateSet.has(normalizedValue)) {
      return;
    }

    const title = sanitizeDisplayTitle(value);
    if (!title || !hasLatinLetters(title) || hasChineseCharacters(title)) {
      return;
    }

    if (normalizedValue === normalizedCanonicalTitleZh) {
      return;
    }

    englishCandidateSet.add(normalizedValue);
    englishCandidates.push(title);
  };

  const originalTitleCandidates =
    originalLanguage === "en"
      ? [details?.original_title, match.original_title]
      : [];
  const translatedEnglishCandidates = collectEnglishTitlesFromDetails(details);
  const matchEnglishCandidates = [match?.title];
  const alternativeEnglishCandidates = collectPreferredEnglishAlternativeTitles(details);
  const parsedEnglishCandidates = [hasLatinLetters(parsedEntry.title) ? parsedEntry.title : null];
  const fallbackOriginalCandidates =
    originalLanguage === "en" ? [] : [details?.original_title, match.original_title];

  for (const value of originalTitleCandidates) {
    addEnglishCandidate(value);
  }
  for (const value of translatedEnglishCandidates) {
    addEnglishCandidate(value);
  }
  for (const value of matchEnglishCandidates) {
    addEnglishCandidate(value);
  }
  for (const value of alternativeEnglishCandidates) {
    addEnglishCandidate(value);
  }
  for (const value of parsedEnglishCandidates) {
    addEnglishCandidate(value);
  }
  for (const value of fallbackOriginalCandidates) {
    addEnglishCandidate(value);
  }

  return {
    canonicalTitleZh,
    canonicalTitleEn: englishCandidates[0] ?? null,
    details,
  };
}

function buildMovieTitle({ canonicalTitleZh, canonicalTitleEn }) {
  const parts = [formatCanonicalSegment(canonicalTitleZh)];

  if (canonicalTitleEn) {
    const englishPart = formatCanonicalSegment(canonicalTitleEn);
    if (englishPart && normalizeComparableTitle(englishPart) !== normalizeComparableTitle(parts[0])) {
      parts.push(englishPart);
    }
  }

  return parts.filter(Boolean).join(".");
}

function buildSeriesTitle(canonicalTitleZh) {
  return formatCanonicalSegment(canonicalTitleZh);
}

function resolveCategoryRoot(canonicalCategory, tmdbType) {
  if (canonicalCategory === "anime") {
    return "动漫";
  }

  if (canonicalCategory === "series") {
    return "剧集";
  }

  if (canonicalCategory === "documentary") {
    return "纪录片";
  }

  if (canonicalCategory === "movie") {
    return "电影";
  }

  return tmdbType === "movie" ? "电影" : "剧集";
}

function hasTmdbAnimationGenre(match, details) {
  const genreIds = [
    ...(Array.isArray(match?.genre_ids) ? match.genre_ids : []),
    ...(Array.isArray(details?.genre_ids) ? details.genre_ids : []),
    ...(Array.isArray(details?.genres) ? details.genres.map((item) => item?.id) : []),
  ];
  if (genreIds.some((id) => Number(id) === 16)) {
    return true;
  }

  return (details?.genres ?? []).some((item) => {
    const name = String(item?.name ?? "").toLowerCase();
    return name === "animation" || name === "动画";
  });
}

function hasAnimeLikeSourceShape(parsedEntry) {
  const text = [
    parsedEntry?.source,
    parsedEntry?.stem,
    parsedEntry?.title,
    ...(parsedEntry?.titleCandidates ?? []),
  ]
    .filter(Boolean)
    .join(" ");

  return [
    /从零开始的异世界生活/u,
    /Re[:：]?\s*ZERO/iu,
    /\b(?:ANi|DBD[ ._-]?Raws?|LoliHouse|Erai[ ._-]?raws|Baha|KitaujiSub|SweetSub|Sakurato)\b/iu,
    /異世界|魔法|番剧|迷你动画/u,
    /[\u3040-\u30ff]/u,
  ].some((pattern) => pattern.test(text));
}

function canPromoteUnclearRootTvMatchToAnime({ parsedEntry, match, details }) {
  if (!parsedEntry?.mediaRoutingEnabled || parsedEntry.explicitRootCategory) {
    return false;
  }

  if (parsedEntry.routingHighConfidence && parsedEntry.routingCategory !== "series") {
    return false;
  }

  const originalLanguage = String(
    details?.original_language ?? match?.original_language ?? "",
  ).toLowerCase();

  return (
    originalLanguage === "ja" &&
    hasTmdbAnimationGenre(match, details) &&
    hasAnimeLikeSourceShape(parsedEntry)
  );
}

function resolveMatchedCanonicalCategory(parsedEntry, searchType, match = null, details = null) {
  if (parsedEntry.rootCategory === "anime" || parsedEntry.category === "anime") {
    return "anime";
  }

  if (parsedEntry.rootCategory === "documentary" || parsedEntry.category === "documentary") {
    return "documentary";
  }

  if (
    searchType === "tv" &&
    canPromoteUnclearRootTvMatchToAnime({
      parsedEntry,
      match,
      details,
    })
  ) {
    return "anime";
  }

  return searchType === "movie" ? "movie" : "series";
}

function buildMatchedTarget({
  parsedEntry,
  canonicalCategory,
  canonicalTitleZh,
  canonicalTitleEn,
  tmdbType,
  tmdbYear,
}) {
  const categoryRoot = resolveCategoryRoot(canonicalCategory, tmdbType);

  if (tmdbType === "movie") {
    const movieBaseName = buildMovieTitle({
      canonicalTitleZh,
      canonicalTitleEn,
    });
    const targetDir = tmdbYear
      ? `${categoryRoot}/${movieBaseName} (${tmdbYear})`
      : `${categoryRoot}/${movieBaseName}`;
    const targetName = parsedEntry.isDir ? path.posix.basename(targetDir) : `${movieBaseName}${parsedEntry.ext}`;

    return {
      targetDir,
      targetName,
      targetPath: buildTargetPath({
        role: parsedEntry.role,
        targetDir,
        targetName,
      }),
    };
  }

  const seriesTitle = buildSeriesTitle(canonicalTitleZh);
  const isWanwanSeries = normalizeComparableTitle(canonicalTitleZh) === WANWAN_TITLE_KEY;
  const wanwanSpecialDirectoryName = isWanwanSeries ? getWanwanSpecialDirectoryName(parsedEntry) : null;

  if (wanwanSpecialDirectoryName) {
    const targetDir = `${categoryRoot}/${seriesTitle}/${wanwanSpecialDirectoryName}`;
    const targetName = parsedEntry.isDir
      ? wanwanSpecialDirectoryName
      : sanitizePathSegment(parsedEntry.name);

    return {
      targetDir,
      targetName,
      targetPath: buildTargetPath({
        role: parsedEntry.role,
        targetDir,
        targetName,
      }),
    };
  }

  if (isWanwanSeries && shouldPreserveWanwanSeasonFileName(parsedEntry) && parsedEntry.season) {
    const targetDir = `${categoryRoot}/${seriesTitle}/${seriesTitle}.S${String(parsedEntry.season).padStart(2, "0")}`;
    const targetName = sanitizePathSegment(parsedEntry.name);

    return {
      targetDir,
      targetName,
      targetPath: buildTargetPath({
        role: parsedEntry.role,
        targetDir,
        targetName,
      }),
    };
  }

  if (isWanwanSeries && !parsedEntry.isDir && !parsedEntry.season && !parsedEntry.episode) {
    const targetDir = `${categoryRoot}/${seriesTitle}`;
    const targetName = sanitizePathSegment(parsedEntry.name);

    return {
      targetDir,
      targetName,
      targetPath: buildTargetPath({
        role: parsedEntry.role,
        targetDir,
        targetName,
      }),
    };
  }

  if (parsedEntry.season && parsedEntry.episode) {
    const seasonSegment = `${seriesTitle}.S${String(parsedEntry.season).padStart(2, "0")}`;
    const episodeSegment = `${seasonSegment}E${String(parsedEntry.episode).padStart(2, "0")}`;
    const seasonDir = `${categoryRoot}/${seriesTitle}/${seasonSegment}`;
    const targetDir = parsedEntry.isDir ? `${seasonDir}/${episodeSegment}` : seasonDir;
    const targetName = parsedEntry.isDir ? episodeSegment : `${episodeSegment}${parsedEntry.ext}`;
    return {
      targetDir,
      targetName,
      targetPath: buildTargetPath({
        role: parsedEntry.role,
        targetDir,
        targetName,
      }),
    };
  }

  if (parsedEntry.isDir && parsedEntry.season) {
    const targetDir = `${categoryRoot}/${seriesTitle}/${seriesTitle}.S${String(parsedEntry.season).padStart(2, "0")}`;
    return {
      targetDir,
      targetName: path.posix.basename(targetDir),
      targetPath: targetDir,
    };
  }

  if (parsedEntry.season) {
    const targetDir = `${categoryRoot}/${seriesTitle}/${seriesTitle}.S${String(parsedEntry.season).padStart(2, "0")}`;
    const targetName = parsedEntry.isDir ? path.posix.basename(targetDir) : `${seriesTitle}.S${String(parsedEntry.season).padStart(2, "0")}${parsedEntry.ext}`;
    return {
      targetDir,
      targetName,
      targetPath: buildTargetPath({
        role: parsedEntry.role,
        targetDir,
        targetName,
      }),
    };
  }

  const targetDir = `${categoryRoot}/${seriesTitle}`;
  const targetName = parsedEntry.isDir ? seriesTitle : `${seriesTitle}${parsedEntry.ext}`;
  return {
    targetDir,
    targetName,
    targetPath: buildTargetPath({
      role: parsedEntry.role,
      targetDir,
      targetName,
    }),
  };
}

function buildRoutingFields(parsedEntry, fallbackEntry = null) {
  return {
    routingSource: parsedEntry?.routingSource ?? fallbackEntry?.routingSource ?? null,
    routingCategory: parsedEntry?.routingCategory ?? fallbackEntry?.routingCategory ?? null,
    routingConfidence:
      parsedEntry?.routingConfidence ?? fallbackEntry?.routingConfidence ?? null,
    routingReason: parsedEntry?.routingReason ?? fallbackEntry?.routingReason ?? null,
  };
}

function buildCanonicalMove({
  parsedEntry,
  canonicalCategory,
  canonicalTitleZh,
  canonicalTitleEn,
  tmdbType,
  tmdbId = null,
  tmdbYear = null,
  matchSource = "tmdb",
  matchConfidence = 0,
  reason = null,
  wrapperDir = null,
  wrapperDirCid = null,
}) {
  const effectiveCanonicalTitleZh = parsedEntry.knownCanonicalTitleZh ?? canonicalTitleZh;
  const effectiveCanonicalTitleEn = parsedEntry.knownCanonicalTitleEn ?? canonicalTitleEn;
  const target = buildMatchedTarget({
    parsedEntry,
    canonicalCategory,
    canonicalTitleZh: effectiveCanonicalTitleZh,
    canonicalTitleEn: effectiveCanonicalTitleEn,
    tmdbType,
    tmdbYear,
  });
  const reasons = [
    `mode=${TMDB_NORMALIZE_MODE}`,
    `searchType=${tmdbType}`,
    `matchSource=${matchSource}`,
    `matchConfidence=${roundScore(matchConfidence)}`,
  ];

  if (tmdbId) {
    reasons.push(`tmdbId=${tmdbId}`);
  }

  if (reason) {
    reasons.push(`reason=${reason}`);
  }

  if (parsedEntry.routingSource) {
    reasons.push(`routingSource=${parsedEntry.routingSource}`);
    reasons.push(`routingCategory=${parsedEntry.routingCategory ?? "unknown"}`);
    reasons.push(`routingConfidence=${roundScore(parsedEntry.routingConfidence ?? 0)}`);
  }

  return {
    source: parsedEntry.source,
    sourceRootRelativePath: parsedEntry.sourceRootRelativePath ?? "",
    actualSourceRelativePath: parsedEntry.actualSourceRelativePath ?? parsedEntry.source,
    name: parsedEntry.name,
    ext: parsedEntry.ext,
    fid: parsedEntry.fid,
    cid: parsedEntry.cid,
    isDir: parsedEntry.isDir,
    role: parsedEntry.role,
    category: canonicalCategory,
    title: canonicalTitleZh,
    year: tmdbType === "movie" ? tmdbYear ?? parsedEntry.year : parsedEntry.year,
    season: parsedEntry.season,
    episode: parsedEntry.episode,
    confidence: roundScore(matchConfidence),
    needsReview: false,
    reasons,
    strategy: TMDB_NORMALIZE_MODE,
    matchSource,
    tmdbType,
    tmdbId,
    canonicalTitleZh: effectiveCanonicalTitleZh,
    canonicalTitleEn: effectiveCanonicalTitleEn,
    matchConfidence: roundScore(matchConfidence),
    reviewReason: null,
    reviewType: null,
    reason,
    wrapperDir,
    wrapperDirCid,
    ...buildRoutingFields(parsedEntry),
    ...target,
  };
}

function buildMatchedMove({
  parsedEntry,
  selection,
  canonicalTitles,
  searchType,
  wrapperContext = null,
}) {
  const canonicalCategory = resolveMatchedCanonicalCategory(
    parsedEntry,
    searchType,
    selection.match,
    canonicalTitles.details,
  );
  const tmdbYear = extractCandidateYear(selection.match, searchType) ?? parsedEntry.year;

  return buildCanonicalMove({
    parsedEntry,
    canonicalCategory,
    canonicalTitleZh: canonicalTitles.canonicalTitleZh,
    canonicalTitleEn: canonicalTitles.canonicalTitleEn,
    tmdbType: searchType,
    tmdbId: selection.match.id ?? null,
    tmdbYear,
    matchSource: "tmdb",
    matchConfidence: selection.confidence,
    wrapperDir: wrapperContext?.wrapperDir ?? null,
    wrapperDirCid: wrapperContext?.wrapperDirCid ?? null,
  });
}

function buildFallbackMove({
  parsedEntry,
  identity,
  wrapperContext = null,
}) {
  const inferredCategory = detectCategory(identity.canonicalTitleZh ?? parsedEntry.title, parsedEntry.role);
  const canonicalCategory =
    parsedEntry.category === "anime" || parsedEntry.rootCategory === "anime" || inferredCategory === "anime"
      ? "anime"
      : parsedEntry.rootCategory === "documentary" || parsedEntry.category === "documentary"
        ? "documentary"
        : "series";

  return buildCanonicalMove({
    parsedEntry,
    canonicalCategory,
    canonicalTitleZh: identity.canonicalTitleZh,
    canonicalTitleEn: identity.canonicalTitleEn,
    tmdbType: "tv",
    tmdbId: identity.tmdbId ?? null,
    matchSource: "llm-fallback",
    matchConfidence: identity.confidence,
    reason: "llm-fallback",
    wrapperDir: wrapperContext?.wrapperDir ?? null,
    wrapperDirCid: wrapperContext?.wrapperDirCid ?? null,
  });
}

function buildCanonicalOverrideMove({
  parsedEntry,
  overrideEntry,
  wrapperContext = null,
}) {
  const canonicalCategory = resolveMatchedCanonicalCategory(parsedEntry, overrideEntry.tmdbType);

  return buildCanonicalMove({
    parsedEntry,
    canonicalCategory,
    canonicalTitleZh: overrideEntry.canonicalTitleZh,
    canonicalTitleEn: overrideEntry.canonicalTitleEn,
    tmdbType: overrideEntry.tmdbType,
    tmdbId: overrideEntry.tmdbId ?? null,
    matchSource: LOCAL_CANONICAL_OVERRIDE_MATCH_SOURCE,
    matchConfidence: LOCAL_CANONICAL_OVERRIDE_SCORE,
    reason: LOCAL_CANONICAL_OVERRIDE_REASON,
    wrapperDir: wrapperContext?.wrapperDir ?? null,
    wrapperDirCid: wrapperContext?.wrapperDirCid ?? null,
  });
}

function buildAttachedSidecarMove({
  parsedEntry,
  videoMove,
  reason = "sidecar-follow-video",
  reasonTag = "sidecar=follow-video",
}) {
  const targetName = buildAttachedSidecarTargetName(parsedEntry, videoMove);

  return {
    source: parsedEntry.source,
    sourceRootRelativePath: parsedEntry.sourceRootRelativePath ?? "",
    actualSourceRelativePath: parsedEntry.actualSourceRelativePath ?? parsedEntry.source,
    name: parsedEntry.name,
    ext: parsedEntry.ext,
    fid: parsedEntry.fid,
    cid: parsedEntry.cid,
    isDir: parsedEntry.isDir,
    role: parsedEntry.role,
    category: videoMove.category,
    title: videoMove.title,
    year: videoMove.year,
    season: videoMove.season,
    episode: videoMove.episode,
    confidence: videoMove.confidence,
    needsReview: false,
    reasons: [...(videoMove.reasons ?? []), reasonTag],
    strategy: TMDB_NORMALIZE_MODE,
    matchSource: videoMove.matchSource,
    tmdbType: videoMove.tmdbType,
    tmdbId: videoMove.tmdbId,
    canonicalTitleZh: videoMove.canonicalTitleZh,
    canonicalTitleEn: videoMove.canonicalTitleEn,
    matchConfidence: videoMove.matchConfidence,
    reviewReason: null,
    reviewType: null,
    reason,
    wrapperDir: videoMove.wrapperDir ?? null,
    wrapperDirCid: videoMove.wrapperDirCid ?? null,
    ...buildRoutingFields(parsedEntry, videoMove),
    targetDir: videoMove.targetDir,
    targetName,
    targetPath: buildTargetPath({
      role: parsedEntry.role,
      targetDir: videoMove.targetDir,
      targetName,
    }),
  };
}

function buildReviewEntry({
  parsedEntry,
  searchType,
  reviewReason,
  confidence,
  matchedEntry = null,
  tmdbCandidates = [],
}) {
  return {
    source: parsedEntry.source,
    sourceRootRelativePath: parsedEntry.sourceRootRelativePath ?? "",
    actualSourceRelativePath: parsedEntry.actualSourceRelativePath ?? parsedEntry.source,
    name: parsedEntry.name,
    ext: parsedEntry.ext,
    fid: parsedEntry.fid,
    cid: parsedEntry.cid,
    isDir: parsedEntry.isDir,
    role: parsedEntry.role,
    category: matchedEntry?.category ?? "review",
    title: matchedEntry?.title ?? parsedEntry.title,
    year: matchedEntry?.year ?? parsedEntry.year,
    season: parsedEntry.season,
    episode: parsedEntry.episode,
    confidence: roundScore(confidence ?? 0),
    needsReview: true,
    reasons: [
      `mode=${TMDB_NORMALIZE_MODE}`,
      `searchType=${searchType}`,
      `reviewReason=${reviewReason}`,
    ],
    strategy: TMDB_NORMALIZE_MODE,
    matchSource: matchedEntry?.matchSource ?? "local-fallback",
    tmdbType: matchedEntry?.tmdbType ?? searchType,
    tmdbId: matchedEntry?.tmdbId ?? null,
    canonicalTitleZh: matchedEntry?.canonicalTitleZh ?? null,
    canonicalTitleEn: matchedEntry?.canonicalTitleEn ?? null,
    matchConfidence: roundScore(confidence ?? 0),
    reviewReason,
    reviewType: reviewReason,
    reason: REVIEW_REASON_MESSAGES[reviewReason] ?? reviewReason,
    tmdbCandidates,
    targetDir: matchedEntry?.targetDir ?? path.posix.dirname(parsedEntry.source).replace(/^\.$/u, ""),
    targetName: matchedEntry?.targetName ?? parsedEntry.name,
    targetPath: matchedEntry?.targetPath ?? parsedEntry.source,
    wrapperDir: matchedEntry?.wrapperDir ?? null,
    wrapperDirCid: matchedEntry?.wrapperDirCid ?? null,
    ...buildRoutingFields(parsedEntry, matchedEntry),
  };
}

function serializeTmdbCandidates(ranked = [], limit = 5) {
  if (!Array.isArray(ranked)) {
    return [];
  }

  return ranked.slice(0, limit).map((item) => {
    const candidate = item?.candidate ?? item ?? {};
    return {
      id: candidate.id ?? null,
      title: candidate.title ?? candidate.name ?? null,
      originalTitle: candidate.original_title ?? candidate.original_name ?? null,
      year: item?.candidateYear ?? extractCandidateYear(candidate, item?.searchType ?? "movie"),
      score: roundScore(item?.score ?? 0),
      titleScore: roundScore(item?.titleScore ?? 0),
      popularity: Number(candidate.popularity ?? 0),
    };
  });
}

function createStableShortHash(value) {
  let hash = 2166136261;
  const input = String(value ?? "");

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36).padStart(6, "0").slice(0, 6);
}

function appendHashToPathSegment(segment, hash) {
  const parsed = path.posix.parse(segment);
  if (parsed.ext && parsed.name) {
    return `${parsed.name}.${hash}${parsed.ext}`;
  }

  return `${segment}.${hash}`;
}

function applyTargetPathHash(move, hash) {
  if (move.role === "directory") {
    const parentDir = path.posix.dirname(move.targetDir);
    const nextBaseName = appendHashToPathSegment(path.posix.basename(move.targetDir), hash);
    const nextTargetDir =
      parentDir && parentDir !== "."
        ? path.posix.join(parentDir, nextBaseName)
        : nextBaseName;

    return {
      ...move,
      targetDir: nextTargetDir,
      targetName: nextBaseName,
      targetPath: nextTargetDir,
    };
  }

  const nextTargetName = appendHashToPathSegment(move.targetName, hash);
  return {
    ...move,
    targetName: nextTargetName,
    targetPath: buildTargetPath({
      role: move.role,
      targetDir: move.targetDir,
      targetName: nextTargetName,
    }),
  };
}

function makeMoveTargetPathUnique(move, occupiedTargetPaths) {
  if (!occupiedTargetPaths.has(move.targetPath)) {
    occupiedTargetPaths.add(move.targetPath);
    return move;
  }

  for (let attempt = 1; attempt <= 20; attempt += 1) {
    const hash = createStableShortHash(`${move.source}:${move.targetPath}:${attempt}`);
    const candidate = applyTargetPathHash(move, hash);
    if (!occupiedTargetPaths.has(candidate.targetPath)) {
      occupiedTargetPaths.add(candidate.targetPath);
      return candidate;
    }
  }

  const fallbackHash = createStableShortHash(`${move.source}:${Date.now()}:${Math.random()}`);
  const fallback = applyTargetPathHash(move, fallbackHash);
  occupiedTargetPaths.add(fallback.targetPath);
  return fallback;
}

function normalizeZeroReviewBucket(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (
    normalized === ZERO_REVIEW_SOFTWARE_BUCKET.toLowerCase() ||
    ["software", "installer", "package", "app"].includes(normalized)
  ) {
    return ZERO_REVIEW_SOFTWARE_BUCKET;
  }

  if (
    normalized === ZERO_REVIEW_TORRENT_BUCKET.toLowerCase() ||
    ["torrent", "magnet", "download"].includes(normalized)
  ) {
    return ZERO_REVIEW_TORRENT_BUCKET;
  }

  if (
    normalized === ZERO_REVIEW_SUPPLEMENT_BUCKET.toLowerCase() ||
    [
      "supplement",
      "sidecar",
      "extra",
      "extras",
      "artwork",
      "booklet",
      "special_episode",
      "opening_ending",
      "pv_cm",
      "menu",
      "mini_anime",
    ].includes(normalized)
  ) {
    return ZERO_REVIEW_SUPPLEMENT_BUCKET;
  }

  if (
    normalized === ZERO_REVIEW_UNKNOWN_MEDIA_BUCKET.toLowerCase() ||
    ["unknown", "unknown-media", "unrecognized", "media-quarantine"].includes(normalized)
  ) {
    return ZERO_REVIEW_UNKNOWN_MEDIA_BUCKET;
  }

  return null;
}

function getZeroReviewClassificationKind(classification = {}) {
  return String(
    classification?.kind ??
      classification?.classification ??
      classification?.videoClassification ??
      classification?.mediaClass ??
      classification?.type ??
      "",
  )
    .trim()
    .toLowerCase();
}

function normalizeZeroReviewKind(value) {
  return String(value ?? "").trim().toLowerCase();
}

function isZeroReviewSupplementalVideoKind(kind) {
  return ["special_episode", "opening_ending", "pv_cm", "menu", "mini_anime", "supplement"].includes(
    normalizeZeroReviewKind(kind),
  );
}

function normalizeZeroReviewTmdbType(classification = {}) {
  classification = classification ?? {};

  if (classification.tmdbType === "movie") {
    return "movie";
  }

  if (classification.tmdbType === "tv") {
    return "tv";
  }

  const kind = getZeroReviewClassificationKind(classification);
  if (kind === "movie") {
    return "movie";
  }

  if (["tv", "series", "anime", "documentary", "main_episode"].includes(kind)) {
    return "tv";
  }

  return null;
}

function getZeroReviewCanonicalTitleZh(classification = {}) {
  classification = classification ?? {};

  return sanitizeLlmDiagnosticValue(
    classification.canonicalTitleZh ??
      classification.canonicalTitle ??
      classification.title ??
      classification.name,
  );
}

function getZeroReviewCanonicalTitleEn(classification = {}) {
  classification = classification ?? {};

  return sanitizeLlmDiagnosticValue(classification.canonicalTitleEn ?? classification.englishTitle);
}

function isHighConfidenceZeroReviewMediaClassification(classification = {}, parsedEntry = null) {
  classification = classification ?? {};

  const confidence = Number(classification.confidence ?? 0);
  const tmdbType = normalizeZeroReviewTmdbType(classification);
  const canonicalTitleZh = getZeroReviewCanonicalTitleZh(classification);
  const kind = getZeroReviewClassificationKind(classification);

  if (isZeroReviewSupplementalVideoKind(kind)) {
    return false;
  }

  if (parsedEntry?.role === "video") {
    const hasExtraFileMarker = hasFileLevelExtraVideoMarker(parsedEntry);
    const hasExtraDirectory = hasExplicitExtraDirectoryAncestor(parsedEntry.pathParts ?? []);

    if ((hasExtraFileMarker || hasExtraDirectory) && kind !== "main_episode") {
      return false;
    }

    if (hasExtraDirectory && kind === "main_episode") {
      return false;
    }
  }

  return (
    Number.isFinite(confidence) &&
    confidence >= LLM_FALLBACK_MIN_CONFIDENCE &&
    Boolean(tmdbType) &&
    Boolean(canonicalTitleZh)
  );
}

function normalizeZeroReviewClassifications(result, reviews = []) {
  const rawItems = Array.isArray(result?.classifications)
    ? result.classifications
    : Array.isArray(result?.items)
      ? result.items
      : Array.isArray(result?.reviews)
        ? result.reviews
        : [];
  const items =
    rawItems.length === 0 && reviews.length === 1 && result && typeof result === "object"
      ? [{ ...result, source: reviews[0].source }]
      : rawItems;
  const map = new Map();

  for (const item of items) {
    const source = normalizeSourcePath(item?.source ?? item?.reviewSource ?? "");
    if (!source) {
      continue;
    }

    map.set(source, item);
  }

  return map;
}

function isZeroReviewSoftwarePackage(parsedEntry) {
  const values = [parsedEntry.name, parsedEntry.stem, parsedEntry.source].filter(Boolean);
  return (
    ZERO_REVIEW_SOFTWARE_EXTENSIONS.has(parsedEntry.ext) ||
    anyValueMatches(ZERO_REVIEW_SOFTWARE_PATTERNS, values)
  );
}

function isZeroReviewTorrentFile(parsedEntry) {
  const values = [parsedEntry.name, parsedEntry.stem, parsedEntry.source].filter(Boolean);
  return (
    ZERO_REVIEW_TORRENT_EXTENSIONS.has(parsedEntry.ext) ||
    anyValueMatches(ZERO_REVIEW_TORRENT_PATTERNS, values)
  );
}

function isZeroReviewSupplementalMaterial(parsedEntry, review) {
  const values = [
    parsedEntry.name,
    parsedEntry.stem,
    parsedEntry.source,
    ...(parsedEntry.pathParts ?? []),
  ].filter(Boolean);

  return (
    review?.reviewReason === TMDB_REVIEW_REASON_NESTED_SIDECAR_DIR ||
    review?.reviewReason === TMDB_REVIEW_REASON_SIDECAR_FILE ||
    review?.reviewReason === TMDB_REVIEW_REASON_MEDIA_ROUTING_SUPPLEMENT ||
    hasNestedSidecarDirectoryAncestor(parsedEntry.pathParts ?? []) ||
    parsedEntry.pathParts?.some((segment) => isNestedSidecarDirectoryName(segment)) ||
    ZERO_REVIEW_SUPPLEMENT_EXTENSIONS.has(parsedEntry.ext) ||
    anyValueMatches(ZERO_REVIEW_SUPPLEMENT_PATTERNS, values)
  );
}

function resolveZeroReviewFallbackBucket({ review, parsedEntry, classification }) {
  const confidence = Number(classification?.confidence ?? 0);
  const llmBucket =
    confidence >= LLM_FALLBACK_MIN_CONFIDENCE
      ? normalizeZeroReviewBucket(
          classification?.targetBucket ?? classification?.bucket ?? getZeroReviewClassificationKind(classification),
        )
      : null;

  if (llmBucket && llmBucket !== ZERO_REVIEW_UNKNOWN_MEDIA_BUCKET) {
    return llmBucket;
  }

  if (isZeroReviewSoftwarePackage(parsedEntry)) {
    return ZERO_REVIEW_SOFTWARE_BUCKET;
  }

  if (isZeroReviewTorrentFile(parsedEntry)) {
    return ZERO_REVIEW_TORRENT_BUCKET;
  }

  if (isZeroReviewSupplementalMaterial(parsedEntry, review)) {
    return ZERO_REVIEW_SUPPLEMENT_BUCKET;
  }

  return ZERO_REVIEW_UNKNOWN_MEDIA_BUCKET;
}

function buildZeroReviewQuarantineTarget(parsedEntry, bucket) {
  const sourcePath = normalizeSourcePath(parsedEntry.source);
  const rawParts = sourcePath ? sourcePath.split("/").filter(Boolean) : [parsedEntry.name || "未识别来源"];
  const safeParts = rawParts
    .map((segment) => sanitizePathSegment(segment))
    .filter(Boolean);
  const relativePath = safeParts.length > 0 ? safeParts.join("/") : sanitizePathSegment(parsedEntry.name || "未识别来源");
  const bucketRoot = path.posix.join(ZERO_REVIEW_QUARANTINE_ROOT, bucket);
  const targetPath = path.posix.join(bucketRoot, relativePath);

  if (parsedEntry.role === "directory") {
    return {
      targetDir: targetPath,
      targetName: path.posix.basename(targetPath),
      targetPath,
    };
  }

  const targetDir = path.posix.dirname(targetPath).replace(/^\.$/u, "");
  const targetName = path.posix.basename(targetPath);

  return {
    targetDir,
    targetName,
    targetPath: buildTargetPath({
      role: parsedEntry.role,
      targetDir,
      targetName,
    }),
  };
}

function buildZeroReviewQuarantineMove({
  review,
  parsedEntry,
  bucket,
  classification = null,
}) {
  const target = buildZeroReviewQuarantineTarget(parsedEntry, bucket);
  const reason = `zero-review-quarantine:${bucket}`;

  return {
    source: parsedEntry.source,
    sourceRootRelativePath: parsedEntry.sourceRootRelativePath ?? review.sourceRootRelativePath ?? "",
    actualSourceRelativePath:
      parsedEntry.actualSourceRelativePath ?? review.actualSourceRelativePath ?? parsedEntry.source,
    name: parsedEntry.name,
    ext: parsedEntry.ext,
    fid: parsedEntry.fid,
    cid: parsedEntry.cid,
    isDir: parsedEntry.isDir,
    role: parsedEntry.role,
    category: "quarantine",
    title: review.title ?? parsedEntry.title,
    year: review.year ?? parsedEntry.year,
    season: parsedEntry.season,
    episode: parsedEntry.episode,
    confidence: roundScore(classification?.confidence ?? 0),
    needsReview: false,
    reasons: [
      `mode=${TMDB_NORMALIZE_MODE}`,
      `matchSource=${ZERO_REVIEW_FINALIZER_MATCH_SOURCE}`,
      `originalReviewReason=${review.reviewReason ?? "unknown"}`,
      `targetBucket=${bucket}`,
    ],
    strategy: TMDB_NORMALIZE_MODE,
    matchSource: ZERO_REVIEW_FINALIZER_MATCH_SOURCE,
    tmdbType: review.tmdbType ?? null,
    tmdbId: review.tmdbId ?? null,
    canonicalTitleZh: review.canonicalTitleZh ?? null,
    canonicalTitleEn: review.canonicalTitleEn ?? null,
    matchConfidence: roundScore(classification?.confidence ?? 0),
    reviewReason: null,
    reviewType: null,
    reason,
    originalReviewReason: review.reviewReason ?? null,
    zeroReviewBucket: bucket,
    wrapperDir: review.wrapperDir ?? null,
    wrapperDirCid: review.wrapperDirCid ?? null,
    ...buildRoutingFields(parsedEntry, review),
    ...target,
  };
}

function buildZeroReviewLlmMove({
  review,
  parsedEntry,
  classification,
}) {
  const tmdbType = normalizeZeroReviewTmdbType(classification);
  const canonicalCategory = resolveMatchedCanonicalCategory(parsedEntry, tmdbType);

  return {
    ...buildCanonicalMove({
      parsedEntry,
      canonicalCategory,
      canonicalTitleZh: getZeroReviewCanonicalTitleZh(classification),
      canonicalTitleEn: getZeroReviewCanonicalTitleEn(classification),
      tmdbType,
      tmdbId: classification.tmdbId ?? null,
      tmdbYear: tmdbType === "movie" ? parsedEntry.year : null,
      matchSource: "llm-fallback",
      matchConfidence: classification.confidence,
      reason: "llm-fallback",
      wrapperDir: review.wrapperDir ?? null,
      wrapperDirCid: review.wrapperDirCid ?? null,
    }),
    originalReviewReason: review.reviewReason ?? null,
  };
}

function buildRuleDiagnosticsForVideo({ video, resourceContext, reviewBySource }) {
  const diagnostics = [];

  if (isProtectedMainEpisode(video, resourceContext)) {
    diagnostics.push("main-episode-protected-by-resource-range");
  }

  if (hasFileLevelExtraVideoMarker(video)) {
    diagnostics.push("file-level-extra-marker");
  }

  if (hasExplicitExtraDirectoryAncestor(video.pathParts ?? [])) {
    diagnostics.push("explicit-extra-directory-ancestor");
  }

  if (reviewBySource.has(video.source)) {
    diagnostics.push(`current-review=${reviewBySource.get(video.source)?.reviewReason ?? "unknown"}`);
  }

  if (isEpisodicExtraVideo(video)) {
    diagnostics.push("episodic-extra-video");
  }

  return diagnostics;
}

function buildSiblingContextEntries(source, directChildrenMap) {
  const parentDir = getParentDirSource(source);
  return (directChildrenMap.get(parentDir) ?? [])
    .filter((entry) => entry.source !== source)
    .slice(0, 20)
    .map(serializeResourceContextEntry);
}

function buildResourcePackageLlmContext({
  resourceContext,
  reviewBySource,
  directChildrenMap,
}) {
  const reviewSourceSet = new Set(reviewBySource.keys());
  const mode =
    resourceContext.videos.length <= 1
      ? ZERO_REVIEW_SINGLE_CONTEXT_MODE
      : ZERO_REVIEW_RESOURCE_BATCH_CONTEXT_MODE;

  return {
    rootSource: resourceContext.rootSource,
    contextMode: mode,
    currentReviewSources: resourceContext.entries
      .map((entry) => entry.source)
      .filter((source) => reviewSourceSet.has(source)),
    parentTitles: resourceContext.parentTitles,
    episodeRangeHint: resourceContext.mainEpisodeRange
      ? {
          mainEpisodeRange: resourceContext.mainEpisodeRange,
          mainEpisodeCount: resourceContext.mainEpisodeCount,
          specialEpisodeHint: resourceContext.specialEpisodeHint,
          sourceSegment: resourceContext.rangeSourceSegment,
        }
      : null,
    directoryTreeSummary: resourceContext.directoryTreeSummary,
    sameLevelEntries: (resourceContext.rootChildren ?? []).slice(0, 40).map(serializeResourceContextEntry),
    subtitles: resourceContext.subtitles.slice(0, 40).map(serializeResourceContextEntry),
    sidecarDirectories: resourceContext.sidecarDirectories.slice(0, 40).map(serializeResourceContextEntry),
    videoBatch: resourceContext.videos.map((video) => ({
      ...serializeResourceContextEntry(video),
      rootSource: resourceContext.rootSource,
      parentDir: getParentDirSource(video.source),
      parentTitle: getParentTitle(video),
      sizeRankInPackage: resourceContext.videoSizeRankBySource?.get(video.source) ?? null,
      isCurrentReview: reviewSourceSet.has(video.source),
      tmdbCandidates: Array.isArray(reviewBySource.get(video.source)?.tmdbCandidates)
        ? reviewBySource.get(video.source).tmdbCandidates.slice(0, 5)
        : [],
      fileLevelExtraMarker: hasFileLevelExtraVideoMarker(video),
      explicitExtraDirectoryAncestor: hasExplicitExtraDirectoryAncestor(video.pathParts ?? []),
      protectedMainEpisode: isProtectedMainEpisode(video, resourceContext),
      siblings: buildSiblingContextEntries(video.source, directChildrenMap),
      ruleDiagnostics: buildRuleDiagnosticsForVideo({
        video,
        resourceContext,
        reviewBySource,
      }),
    })),
  };
}

function buildZeroReviewLlmContext({
  reviews,
  parsedEntryBySource,
  directChildrenMap,
  resourceContextBySource,
}) {
  const rootMap = new Map();
  const resourceContextMap = new Map();
  const reviewBySource = new Map(reviews.map((review) => [review.source, review]));

  for (const review of reviews) {
    const parsedEntry = parsedEntryBySource.get(review.source) ?? review;
    const rootSource = getSourceRoot(parsedEntry.source);
    const current = rootMap.get(rootSource) ?? [];
    current.push(review.source);
    rootMap.set(rootSource, current);

    const resourceContext = resourceContextBySource.get(parsedEntry.source);
    if (resourceContext) {
      resourceContextMap.set(resourceContext.rootSource, resourceContext);
    }
  }

  return {
    task: ZERO_REVIEW_LLM_TASK,
    policy: {
      goal: "按资源包上下文把残余 review 和同包视频分类成可执行 move；不能返回删除动作",
      lowConfidence: "低置信或无法判断时进入整理保留区/未识别媒体",
      deletion: "禁止返回 delete/remove；只能返回分类、置信度、理由和可选规范标题",
    },
    roots: [...rootMap.entries()].map(([rootSource, sources]) => ({
      rootSource,
      sources,
    })),
    resourcePackages: [...resourceContextMap.values()].map((resourceContext) =>
      buildResourcePackageLlmContext({
        resourceContext,
        reviewBySource,
        directChildrenMap,
      }),
    ),
    reviews: reviews.map((review) => {
      const parsedEntry = parsedEntryBySource.get(review.source) ?? review;
      const parentDir = path.posix.dirname(parsedEntry.source);
      const siblingEntries = directChildrenMap.get(parentDir) ?? [];
      const resourceContext = resourceContextBySource.get(parsedEntry.source) ?? null;

      return {
        source: review.source,
        rootSource: getSourceRoot(parsedEntry.source),
        contextMode:
          resourceContext && resourceContext.videos.length <= 1
            ? ZERO_REVIEW_SINGLE_CONTEXT_MODE
            : ZERO_REVIEW_RESOURCE_BATCH_CONTEXT_MODE,
        reviewReason: review.reviewReason ?? null,
        isDir: Boolean(parsedEntry.isDir),
        role: parsedEntry.role ?? null,
        ext: parsedEntry.ext ?? "",
        parentDir,
        parentTitle: getParentTitle(parsedEntry),
        size: parsedEntry.size ?? null,
        sizeRankInPackage: resourceContext?.videoSizeRankBySource?.get(parsedEntry.source) ?? null,
        pathParts: parsedEntry.pathParts ?? [],
        episodeRangeHint: resourceContext?.mainEpisodeRange
          ? {
              mainEpisodeRange: resourceContext.mainEpisodeRange,
              mainEpisodeCount: resourceContext.mainEpisodeCount,
              specialEpisodeHint: resourceContext.specialEpisodeHint,
              sourceSegment: resourceContext.rangeSourceSegment,
            }
          : null,
        protectedMainEpisode: isProtectedMainEpisode(parsedEntry, resourceContext),
        titleCandidates: parsedEntry.titleCandidates ?? [],
        tmdbType: review.tmdbType ?? null,
        tmdbCandidates: Array.isArray(review.tmdbCandidates) ? review.tmdbCandidates : [],
        siblings: siblingEntries
          .filter((entry) => entry.source !== parsedEntry.source)
          .slice(0, 12)
          .map((entry) => ({
            source: entry.source,
            isDir: Boolean(entry.isDir),
            ext: entry.ext ?? "",
            role: entry.role ?? null,
            size: entry.size ?? null,
          })),
      };
    }),
    outputRules: {
      classifications: [
        {
          source: "必须原样返回输入 reviews[].source",
          kind: "main_episode/special_episode/opening_ending/pv_cm/menu/mini_anime/movie/tv/anime/series/software/torrent/supplement/unknown",
          confidence: "0 到 1 之间；影视标准归档建议 >= 0.85",
          targetBucket: "software/torrent/supplement/unknown 之一；影视标准归档可省略",
          canonicalTitle: "仅影视标准归档需要；只能是作品标题",
          canonicalTitleEn: "可选；不确定返回 null",
          tmdbType: "movie 或 tv；仅影视标准归档需要",
          tmdbId: "可选；不确定返回 null",
          reason: "简短分类理由",
        },
      ],
    },
  };
}

async function applyZeroReviewFinalizer({
  reviews,
  moves,
  llmResolver,
  parsedEntryBySource,
  directChildrenMap,
  resourceContextBySource = new Map(),
  rootPath,
}) {
  const inputReviewCount = reviews.length;
  const fallbackBucketCounts = {};
  const finalizerMoves = [];
  const occupiedTargetPaths = new Set(moves.map((move) => move.targetPath).filter(Boolean));
  const llmContext =
    inputReviewCount > 0
      ? buildZeroReviewLlmContext({
          reviews,
          parsedEntryBySource,
          directChildrenMap,
          resourceContextBySource,
        })
      : null;
  let llmClassificationMap = new Map();
  let llmClassifiedCount = 0;
  let llmBatchClassifiedCount = 0;

  if (inputReviewCount > 0 && typeof llmResolver === "function") {
    const llmResult = await llmResolver(llmContext);
    llmClassificationMap = normalizeZeroReviewClassifications(llmResult, reviews);
    llmBatchClassifiedCount = llmClassificationMap.size;
  }

  for (const review of reviews) {
    const parsedEntry =
      parsedEntryBySource.get(review.source) ??
      parseTmdbNormalizeEntry(review, {
        rootPath,
      });
    const classification = llmClassificationMap.get(review.source) ?? null;
    let move;

    if (isHighConfidenceZeroReviewMediaClassification(classification, parsedEntry)) {
      move = buildZeroReviewLlmMove({
        review,
        parsedEntry,
        classification,
      });
      llmClassifiedCount += 1;
    } else {
      const bucket = resolveZeroReviewFallbackBucket({
        review,
        parsedEntry,
        classification,
      });
      fallbackBucketCounts[bucket] = (fallbackBucketCounts[bucket] ?? 0) + 1;
      move = buildZeroReviewQuarantineMove({
        review,
        parsedEntry,
        bucket,
        classification,
      });
    }

    finalizerMoves.push(makeMoveTargetPathUnique(move, occupiedTargetPaths));
  }

  return {
    moves: moves.concat(finalizerMoves),
    reviews: [],
    collisionGroups: [],
    zeroReviewSummary: {
      enabled: true,
      inputReviewCount,
      resolvedToMoveCount: finalizerMoves.length,
      resolvedToDeleteCount: 0,
      quarantineCount: finalizerMoves.length - llmClassifiedCount,
      llmClassifiedCount,
      llmBatchClassifiedCount,
      resourceBatchCount: llmContext?.resourcePackages?.length ?? 0,
      rescuedUnsafeDeleteCount: 0,
      mainEpisodeProtectedCount: 0,
      fallbackBucketCounts,
    },
  };
}

function collectCollisionGroups(entries) {
  const pathMap = new Map();

  for (const entry of entries) {
    const current = pathMap.get(entry.targetPath) ?? [];
    current.push(entry);
    pathMap.set(entry.targetPath, current);
  }

  return [...pathMap.entries()]
    .filter(([, items]) => items.length > 1)
    .map(([targetPath, items]) => ({
      targetPath,
      sources: items.map((item) => item.source),
      items,
    }));
}

function pruneNoopTmdbMoves({
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
      collisionGroups: [],
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
  const collisionGroups = [];

  for (const [targetPath, targetMoves] of activeTargetMap.entries()) {
    const occupiedMoves = occupiedTargetMap.get(targetPath) ?? [];
    collisionGroups.push({
      targetPath,
      sources: dedupeStrings([
        ...occupiedMoves.map((item) => item.source),
        ...targetMoves.map((item) => item.source),
      ]),
      items: targetMoves,
      occupiedItems: occupiedMoves,
    });

    for (const move of targetMoves) {
      reviewSourceSet.add(move.source);
      reviews.push(buildNoopOccupiedTmdbReview({
        move,
        occupiedMoves,
      }));
    }
  }

  return {
    moves: activeMoves.filter((move) => !reviewSourceSet.has(move.source)),
    reviews,
    collisionGroups,
    noopMoves,
  };
}

function buildNoopOccupiedTmdbReview({
  move,
  occupiedMoves,
}) {
  return {
    ...move,
    category: "review",
    needsReview: true,
    reviewReason: TMDB_REVIEW_REASON_COLLISION,
    reviewType: TMDB_REVIEW_REASON_COLLISION,
    reason: "目标路径已被当前位置相同的已整理条目占用，跳过自动迁移",
    occupiedTargetSources: occupiedMoves.map((item) => item.source),
  };
}

function filterDeletesBlockedByNoopMoves({
  deletes,
  noopMoves,
}) {
  if (!noopMoves || noopMoves.length === 0) {
    return deletes;
  }

  return deletes.filter((deleteEntry) => {
    const wrapperDir = normalizeSourcePath(deleteEntry.wrapperDir ?? "");
    if (!wrapperDir) {
      return true;
    }

    return !noopMoves.some((move) => {
      const source = normalizeSourcePath(move.source ?? "");
      return source === wrapperDir || source.startsWith(`${wrapperDir}/`);
    });
  });
}

function countChineseCharacters(value) {
  return String(value ?? "").match(/[\u4e00-\u9fff]/gu)?.length ?? 0;
}

function countMeaningfulTitleTokens(value) {
  return (
    String(value ?? "")
      .match(/[A-Za-z]{2,}|[\u4e00-\u9fff]{2,}|\d{4}/gu)
      ?.filter((token) => !/^(?:BD|HD|WEB|HDR|AAC|DD|DDP|DTS|MKV|MP4)$/iu.test(token)).length ?? 0
  );
}

function normalizeEpisodeIdentityValue(value) {
  return value == null ? null : Number(value);
}

function hasConsistentEpisodeIdentity(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return false;
  }

  const first = items[0];
  const firstSeason = normalizeEpisodeIdentityValue(first?.season);
  const firstEpisode = normalizeEpisodeIdentityValue(first?.episode);

  return items.every((item) => {
    return (
      item?.targetPath === first?.targetPath &&
      item?.tmdbType === first?.tmdbType &&
      item?.tmdbId === first?.tmdbId &&
      normalizeEpisodeIdentityValue(item?.season) === firstSeason &&
      normalizeEpisodeIdentityValue(item?.episode) === firstEpisode
    );
  });
}

function buildEpisodeTokenSpecificityScore(source) {
  const baseName = path.posix.basename(String(source ?? ""));

  if (/S\d{1,2}E\d{1,3}(?=$|[^0-9])/iu.test(baseName)) {
    return 40;
  }

  if (/\s-\s*\d{1,3}(?:v\d+)?(?:\s*(?:END|FINAL))?(?=$|[\s\[【(（])/iu.test(baseName)) {
    return 28;
  }

  if (/(?:^|[^A-Za-z0-9])EP?\d{1,3}(?=$|[^0-9])/iu.test(baseName)) {
    return 24;
  }

  if (/第\s*[0-9一二三四五六七八九十百零两]+\s*[集话話期]/iu.test(baseName)) {
    return 22;
  }

  if (/(?:^|[^A-Za-z0-9])\d{1,3}v\d+(?=$|[^A-Za-z0-9])/iu.test(baseName)) {
    return 18;
  }

  return 0;
}

function isPlainJoJoRootSource(value) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return false;
  }

  return JOJO_ROOT_FALLBACK_PATTERNS.some((pattern) => patternMatches(pattern, raw));
}

function buildSameIdentityCollisionPriority(item) {
  const source = String(item?.source ?? "");
  const basename = path.posix.basename(source);
  let score = 0;

  // 同一 TMDB 身份 + 同一目标路径时，优先保留源名信息更完整的一份。
  // 有明确画质标识的来源优先级更高，避免 4K/HDR 被 1080P 版本压掉。
  if (/(?:^|[^A-Za-z0-9])(?:4K|2160P)(?=$|[^A-Za-z0-9])/iu.test(basename)) {
    score += 18;
  }

  if (/(?:^|[^A-Za-z0-9])HDR(?=$|[^A-Za-z0-9])/iu.test(basename)) {
    score += 6;
  }

  score += countChineseCharacters(basename) * 4;
  score += countMeaningfulTitleTokens(basename) * 3;

  if (hasChineseCharacters(basename)) {
    score += 10;
  }

  if (hasLatinLetters(basename)) {
    score += 4;
  }

  if (item.year && basename.includes(String(item.year))) {
    score += 3;
  }

  if (!hasDuplicateNoise(basename)) {
    score += 2;
  }

  score += buildEpisodeTokenSpecificityScore(source);

  return score;
}

function canDeleteSameTmdbTargetDuplicate(item) {
  if (!item?.isDir || !item?.cid) {
    return false;
  }

  return DUPLICATE_SAME_TMDB_TARGET_DELETE_SOURCE_RULES.some((pattern) => {
    return patternMatches(pattern, item.source);
  });
}

function resolveSameIdentityCollisionGroup(items) {
  if (!Array.isArray(items) || items.length < 2) {
    return {
      resolved: false,
    };
  }

  const first = items[0];
  if (!first?.targetPath || !first?.tmdbType || !first?.tmdbId) {
    return {
      resolved: false,
    };
  }

  const sameIdentity = items.every((item) => {
    return (
      item.targetPath === first.targetPath &&
      item.tmdbType === first.tmdbType &&
      item.tmdbId === first.tmdbId &&
      item.tmdbId
    );
  });

  if (!sameIdentity || !hasConsistentEpisodeIdentity(items)) {
    return {
      resolved: false,
    };
  }

  const knownAnimeResolution = resolveKnownAnimeMergeConflict(items);
  if (knownAnimeResolution.resolved && knownAnimeResolution.winner) {
    return {
      resolved: true,
      winner: knownAnimeResolution.winner,
      losers: items.filter((item) => item.source !== knownAnimeResolution.winner.source),
      deleteLosers: true,
    };
  }

  const ranked = items
    .map((item) => ({
      item,
      priority: buildSameIdentityCollisionPriority(item),
    }))
    .sort((left, right) => {
      if (right.priority !== left.priority) {
        return right.priority - left.priority;
      }

      return String(left.item.source).localeCompare(String(right.item.source), "zh-Hans-CN");
    });

  return {
    resolved: true,
    winner: ranked[0].item,
    losers: ranked.slice(1).map(({ item }) => item),
    deleteLosers: false,
  };
}

function resolveKnownAnimeMergeConflict(entries) {
  if (!Array.isArray(entries) || entries.length !== 2 || !hasConsistentEpisodeIdentity(entries)) {
    return {
      resolved: false,
    };
  }

  // 这里只收敛已拍板的双源对，不把 JOJO 扩展成全仓通用 winner 规则。
  const jojoGoldenWindPreferredItems = entries.filter((item) => {
    return matchesAllSourcePatterns(item.source, JOJO_GOLDEN_WIND_PREFERRED_SOURCE_PATTERNS);
  });
  const jojoGoldenWindAlternateItems = entries.filter((item) => {
    return matchesAllSourcePatterns(item.source, JOJO_GOLDEN_WIND_ALTERNATE_SOURCE_PATTERNS);
  });

  if (jojoGoldenWindPreferredItems.length === 1 && jojoGoldenWindAlternateItems.length === 1) {
    return {
      resolved: true,
      winner: jojoGoldenWindPreferredItems[0],
    };
  }

  const jojoStoneOceanPreferredItems = entries.filter((item) => {
    return matchesAllSourcePatterns(item.source, JOJO_STONE_OCEAN_PART2_PREFERRED_SOURCE_PATTERNS);
  });
  const jojoStoneOceanAlternateItems = entries.filter((item) => {
    return matchesAllSourcePatterns(item.source, JOJO_STONE_OCEAN_PART2_ALTERNATE_SOURCE_PATTERNS);
  });

  if (jojoStoneOceanPreferredItems.length === 1 && jojoStoneOceanAlternateItems.length === 1) {
    return {
      resolved: true,
      winner: jojoStoneOceanPreferredItems[0],
    };
  }

  const preferredItems = entries.filter((item) => {
    return RECORD_OF_RAGNAROK_PREFERRED_SOURCE_PATTERNS.some((pattern) => patternMatches(pattern, item.source));
  });
  const alternateItems = entries.filter((item) => {
    return RECORD_OF_RAGNAROK_ALTERNATE_SOURCE_PATTERNS.some((pattern) => patternMatches(pattern, item.source));
  });

  if (preferredItems.length === 1 && alternateItems.length === 1) {
    return {
      resolved: true,
      winner: preferredItems[0],
    };
  }

  return {
    resolved: false,
  };
}

function findTrustedExactTmdbMovieAliasRule(parsedEntry) {
  if (parsedEntry?.rootCategory !== "movie") {
    return null;
  }

  const values = [
    parsedEntry.source,
    parsedEntry.stem,
    parsedEntry.title,
    ...(parsedEntry.titleCandidates ?? []),
  ];

  return TRUSTED_EXACT_TMDB_MOVIE_ALIAS_RULES.find((rule) => {
    if (rule.requiredSourceYear && parsedEntry.year !== rule.requiredSourceYear) {
      return false;
    }

    return values.some((value) => anyPatternMatches(rule.patterns, value));
  }) ?? null;
}

function findTrustedExactTmdbMovieAliasMatch({ parsedEntry, ranked }) {
  const rule = findTrustedExactTmdbMovieAliasRule(parsedEntry);
  if (!rule) {
    return {
      rule: null,
      match: null,
    };
  }

  const match = (ranked ?? []).find((item) => {
    return (
      String(item?.candidate?.id ?? "") === String(rule.tmdbId) &&
      item.candidateYear === rule.tmdbYear
    );
  }) ?? null;

  return {
    rule,
    match,
  };
}

function findTrustedExactYearMovieAliasMatch({ parsedEntry, ranked }) {
  if (!parsedEntry?.year || !Array.isArray(ranked) || ranked.length === 0) {
    return null;
  }

  const hasTrustedAlias = (parsedEntry.titleCandidates ?? []).some((title) => {
    return TRUSTED_EXACT_YEAR_MOVIE_ALIAS_KEYS.has(normalizeComparableTitle(title));
  });

  if (!hasTrustedAlias) {
    return null;
  }

  const exactYearMatches = ranked.filter((item) => {
    return item.candidateYear === parsedEntry.year && item.titleScore >= AUTO_ACCEPT_SCORE;
  });

  return exactYearMatches.length === 1 ? exactYearMatches[0] : null;
}

function resolveLocalReviewReason(parsedEntry) {
  if (isAdvertisingSidecar(parsedEntry)) {
    return null;
  }

  if (hasNestedSidecarDirectoryAncestor(parsedEntry.pathParts) && !parsedEntry.episode) {
    return TMDB_REVIEW_REASON_NESTED_SIDECAR_DIR;
  }

  if (parsedEntry.role === "sidecar") {
    return TMDB_REVIEW_REASON_SIDECAR_FILE;
  }

  if (parsedEntry.isDir && isRetainedSupplementDirectoryName(parsedEntry.name)) {
    return TMDB_REVIEW_REASON_SIDECAR_FILE;
  }

  if (parsedEntry.isDir && isNestedSidecarDirectoryName(parsedEntry.name)) {
    return TMDB_REVIEW_REASON_NESTED_SIDECAR_DIR;
  }

  return null;
}

function buildQueryTaskKey({ searchType, queryLanguage, queryTitle }) {
  return `${searchType}:${queryLanguage}:${queryTitle}`;
}

function buildQueryLanguages(queryTitle, language = DEFAULT_TMDB_LANGUAGE) {
  return dedupeStrings(
    hasLatinLetters(queryTitle) && !/[\u4e00-\u9fff]/u.test(queryTitle)
      ? [ENGLISH_SEARCH_LANGUAGE, language]
      : [language],
  );
}

function hasExplicitSeasonInStem(stem) {
  return (
    /(?:^|[^A-Za-z0-9])S\d{1,2}E\d{1,3}(?=$|[^0-9])/i.test(String(stem ?? "")) ||
    /第\s*[0-9一二三四五六七八九十百零两]+\s*季/i.test(String(stem ?? "")) ||
    /(?:^|[^A-Za-z0-9])S\d{1,2}(?=$|[^0-9])/i.test(String(stem ?? ""))
  );
}

function isFallbackEligible(parsedEntry) {
  if (parsedEntry.role === "sidecar" || (parsedEntry.role === "other" && !isAdvertisingSidecar(parsedEntry))) {
    return false;
  }

  if (parsedEntry.isDir) {
    return (
      getSourceDepth(parsedEntry.source) === 1 ||
      Boolean(parsedEntry.season) ||
      isWanwanSpecialFallbackEntry(parsedEntry)
    );
  }

  if (parsedEntry.role !== "video") {
    return false;
  }

  return Boolean(inferFallbackEpisode(parsedEntry) || isWanwanSpecialFallbackEntry(parsedEntry));
}

function createTmdbQueryTaskRegistry() {
  const taskMap = new Map();
  let cacheHitCount = 0;

  return {
    register(task) {
      if (taskMap.has(task.key)) {
        cacheHitCount += 1;
        return taskMap.get(task.key);
      }

      taskMap.set(task.key, task);
      return task;
    },
    values() {
      return [...taskMap.values()];
    },
    getStats() {
      return {
        taskCount: taskMap.size,
        cacheHitCount,
      };
    },
  };
}

function buildQueryPlanFromTitles({
  searchType,
  queryTitles,
  language = DEFAULT_TMDB_LANGUAGE,
  taskRegistry,
}) {
  const tasks = [];

  for (const queryTitle of dedupeStrings(queryTitles)) {
    for (const queryLanguage of buildQueryLanguages(queryTitle, language)) {
      const task = taskRegistry.register({
        key: buildQueryTaskKey({
          searchType,
          queryLanguage,
          queryTitle,
        }),
        searchType,
        queryLanguage,
        queryTitle,
      });
      tasks.push(task);
    }
  }

  return tasks;
}

async function searchTmdbByTaskPlan({
  queryPlan,
  scheduler,
}) {
  const firstQueryTitle = queryPlan[0]?.queryTitle ?? "";
  let hadRejectedTask = false;

  for (const task of queryPlan) {
    const outcome = await scheduler.get(task);
    if (outcome?.status === "fulfilled" && Array.isArray(outcome.results) && outcome.results.length > 0) {
      return {
        queryTitle: task.queryTitle,
        results: outcome.results,
        hadRejectedTask,
      };
    }

    if (outcome?.status === "rejected") {
      hadRejectedTask = true;
    }
  }

  return {
    queryTitle: firstQueryTitle,
    results: [],
    hadRejectedTask,
  };
}

function resolveLocalFallbackIdentity(groupStates) {
  const rawRoots = dedupeStrings(groupStates.map((state) => getSourceRoot(state.parsedEntry.source)));
  const knownCanonicalTitle = resolveKnownCanonicalTitleHint({
    source: groupStates.map((state) => state.parsedEntry.source).join(" "),
    pathParts: rawRoots,
    titleCandidates: groupStates.flatMap((state) => state.parsedEntry.titleCandidates ?? []),
    category: groupStates[0]?.parsedEntry?.category ?? null,
    rootCategory: groupStates[0]?.parsedEntry?.rootCategory ?? null,
  });

  if (knownCanonicalTitle?.canonicalTitleZh === JOJO_STONE_OCEAN_TITLE_ZH) {
    return {
      resolved: true,
      canonicalTitleZh: JOJO_STONE_OCEAN_TITLE_ZH,
      canonicalTitleEn: JOJO_STONE_OCEAN_TITLE_EN,
      confidence: 0.9,
      reason: "llm-fallback",
    };
  }

  if (knownCanonicalTitle?.canonicalTitleZh === NANATSU_TITLE_ZH) {
    return {
      resolved: true,
      canonicalTitleZh: NANATSU_TITLE_ZH,
      canonicalTitleEn: NANATSU_TITLE_EN,
      confidence: 0.9,
      reason: "llm-fallback",
    };
  }

  if (rawRoots.length > 0 && rawRoots.every((value) => isPlainJoJoRootSource(value))) {
    return {
      resolved: true,
      canonicalTitleZh: "JOJO的奇妙冒险",
      canonicalTitleEn: "JoJo's Bizarre Adventure",
      confidence: 0.9,
      reason: "llm-fallback",
    };
  }

  const normalizedRoots = new Set(
    groupStates
      .map((state) => getSourceRoot(state.parsedEntry.source))
      .map((value) => normalizeComparableTitle(value))
      .filter(Boolean),
  );
  const normalizedTitles = new Set(
    groupStates
      .flatMap((state) => state.parsedEntry.titleCandidates)
      .map((value) => normalizeComparableTitle(value))
      .filter(Boolean),
  );
  const candidates = new Set([...normalizedRoots, ...normalizedTitles]);

  if ([...candidates].some((value) => value.includes(normalizeComparableTitle("万万没想到")))) {
    return {
      resolved: true,
      canonicalTitleZh: "万万没想到",
      canonicalTitleEn: null,
      confidence: 0.9,
      reason: "llm-fallback",
    };
  }

  if (
    [...candidates].some((value) => {
      return (
        value.includes(normalizeComparableTitle("弥留之国的爱丽丝")) ||
        value.includes(normalizeComparableTitle("Alice in Borderland")) ||
        value.includes(normalizeComparableTitle("今際の国のアリス"))
      );
    })
  ) {
    return {
      resolved: true,
      canonicalTitleZh: "弥留之国的爱丽丝",
      canonicalTitleEn: "Alice in Borderland",
      confidence: 0.9,
      reason: "llm-fallback",
    };
  }

  if (
    [...candidates].some((value) => {
      return (
        value.includes(normalizeComparableTitle("龙之家族")) ||
        value.includes(normalizeComparableTitle("House of the Dragon"))
      );
    })
  ) {
    return {
      resolved: true,
      canonicalTitleZh: "龙之家族",
      canonicalTitleEn: "House of the Dragon",
      confidence: 0.9,
      reason: "llm-fallback",
    };
  }

  if (
    [...candidates].some((value) => {
      return (
        value.includes(normalizeComparableTitle("中国奇谭")) ||
        value.includes(normalizeComparableTitle("z国q谭"))
      );
    })
  ) {
    return {
      resolved: true,
      canonicalTitleZh: "中国奇谭",
      canonicalTitleEn: null,
      confidence: 0.9,
      reason: "llm-fallback",
    };
  }

  return {
    resolved: false,
  };
}

function shouldPreferLocalFallbackIdentity(identity) {
  const normalizedTitle = normalizeComparableTitle(identity?.canonicalTitleZh);
  return new Set([
    normalizeComparableTitle("JOJO的奇妙冒险"),
    normalizeComparableTitle(JOJO_STONE_OCEAN_TITLE_ZH),
    normalizeComparableTitle(NANATSU_TITLE_ZH),
  ]).has(normalizedTitle);
}

function collectMatchedTvIdentities(groupStates) {
  const identityMap = new Map();

  for (const state of groupStates) {
    if (!state.move || state.move.tmdbType !== "tv" || !state.move.tmdbId) {
      continue;
    }

    const key = String(state.move.tmdbId);
    const current = identityMap.get(key) ?? {
      tmdbId: state.move.tmdbId,
      canonicalTitleZh: state.move.canonicalTitleZh,
      canonicalTitleEn: state.move.canonicalTitleEn,
      confidence: 0,
      count: 0,
    };

    current.confidence = Math.max(current.confidence, Number(state.move.matchConfidence ?? 0));
    current.count += 1;
    identityMap.set(key, current);
  }

  return [...identityMap.values()].sort((left, right) => {
    if (right.count !== left.count) {
      return right.count - left.count;
    }
    return right.confidence - left.confidence;
  });
}

function inferFallbackEpisode(parsedEntry) {
  if (parsedEntry.episode) {
    return parsedEntry.episode;
  }

  const knownEpisodeOverride = resolveKnownEpisodeOverride({
    source: parsedEntry.source,
    stem: parsedEntry.stem,
    pathParts: parsedEntry.pathParts,
    category: parsedEntry.category,
    rootCategory: parsedEntry.rootCategory,
  });
  if (knownEpisodeOverride) {
    return knownEpisodeOverride;
  }

  if (
    parsedEntry.role !== "video" ||
    !parsedEntry.pathParts.slice(0, -1).some((segment) => isSeasonLikePathSegment(segment))
  ) {
    return null;
  }

  const stem = String(parsedEntry.stem ?? "")
    // fallback 只兜真正的集号，先剥掉季号，避免把 `S2 [00]` 误回退成 `E02`。
    .replace(/\bS\d{1,2}\b/gi, " ")
    .replace(/\bSeason[ ._-]?\d{1,2}\b/gi, " ")
    .replace(/第\s*[0-9一二三四五六七八九十百零两]+\s*季/giu, " ")
    .replace(/\b(19[3-9]\d|20[0-4]\d)\b/g, " ")
    .replace(/\b(480|720|1080|2160)\b/gi, " ");
  const looseEpisodeMatch = stem.match(/(?:^|[^0-9])(\d{1,2})(?=$|[^0-9])/u);
  return looseEpisodeMatch ? Number.parseInt(looseEpisodeMatch[1], 10) : null;
}

function inferFallbackDirectorySeason({
  parsedEntry,
  groupStates,
}) {
  if (!parsedEntry?.isDir) {
    return parsedEntry?.season ?? null;
  }

  if (parsedEntry.season) {
    return parsedEntry.season;
  }

  const currentDepth = getSourceDepth(parsedEntry.source);
  const groupRootDepth = Math.min(
    ...groupStates.map((state) => getSourceDepth(state.parsedEntry.source)),
  );

  if (!Number.isFinite(groupRootDepth) || currentDepth <= groupRootDepth) {
    return null;
  }

  const descendantSeasons = dedupeStrings(
    groupStates
      .map((state) => state.move)
      .filter(Boolean)
      .filter((move) => String(move.source ?? "").startsWith(`${parsedEntry.source}/`))
      .map((move) => (move.season ? String(move.season) : ""))
      .filter(Boolean),
  ).map((value) => Number.parseInt(value, 10));

  return descendantSeasons.length === 1 ? descendantSeasons[0] : null;
}

async function resolveFallbackIdentity({
  rootSource,
  missStates,
  groupStates,
  llmResolver,
}) {
  const matchedTvIdentities = collectMatchedTvIdentities(groupStates);
  if (matchedTvIdentities.length === 1) {
    const identity = matchedTvIdentities[0];
    return {
      resolved: true,
      tmdbId: identity.tmdbId,
      canonicalTitleZh: identity.canonicalTitleZh,
      canonicalTitleEn: identity.canonicalTitleEn,
      confidence: Math.max(LLM_FALLBACK_MIN_CONFIDENCE, roundScore(identity.confidence)),
      reason: "llm-fallback",
    };
  }

  const localFallbackIdentity = resolveLocalFallbackIdentity(groupStates);
  if (localFallbackIdentity.resolved && shouldPreferLocalFallbackIdentity(localFallbackIdentity)) {
    return localFallbackIdentity;
  }

  if (typeof llmResolver === "function") {
    const llmResult = await llmResolver({
      rootSource,
      entries: groupStates.map((state) => ({
        source: state.parsedEntry.source,
        rootSource: getSourceRoot(state.parsedEntry.source),
        parentDir: getParentDirSource(state.parsedEntry.source),
        isDir: state.parsedEntry.isDir,
        season: state.parsedEntry.season,
        episode: state.parsedEntry.episode,
        size: state.parsedEntry.size ?? null,
        titleCandidates: state.parsedEntry.titleCandidates,
        tmdbType: state.move?.tmdbType ?? state.searchType,
        tmdbId: state.move?.tmdbId ?? null,
        canonicalTitleZh: state.move?.canonicalTitleZh ?? null,
        canonicalTitleEn: state.move?.canonicalTitleEn ?? null,
      })),
      missSources: missStates.map((state) => state.parsedEntry.source),
    });

    if (llmResult?.resolved && Number(llmResult.confidence ?? 0) >= LLM_FALLBACK_MIN_CONFIDENCE) {
      return {
        resolved: true,
        tmdbId: llmResult.tmdbId ?? null,
        canonicalTitleZh: llmResult.canonicalTitleZh,
        canonicalTitleEn: llmResult.canonicalTitleEn ?? null,
        confidence: roundScore(llmResult.confidence),
        reason: "llm-fallback",
      };
    }

    return {
      resolved: false,
    };
  }

  if (localFallbackIdentity.resolved) {
    return localFallbackIdentity;
  }

  return {
    resolved: false,
  };
}

function sanitizeLlmDiagnosticValue(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).replace(/\s+/gu, " ").trim();
  return normalized || null;
}

function getLlmResolverMetadata(llmResolver) {
  const metadata = llmResolver?.llmFallbackMetadata;
  return metadata && typeof metadata === "object" ? metadata : {};
}

function createCountMap() {
  return Object.create(null);
}

function incrementCount(map, key) {
  const normalizedKey = sanitizeLlmDiagnosticValue(key) ?? "unknown";
  map[normalizedKey] = (map[normalizedKey] ?? 0) + 1;
}

function normalizeLlmErrorReason(error) {
  const rawMessage = error instanceof Error ? error.message : error;
  return sanitizeLlmDiagnosticValue(rawMessage)?.slice(0, 160) ?? "unknown-error";
}

function resolveLlmRejectedReason(result) {
  if (result?.resolved === true && Number(result.confidence ?? 0) < LLM_FALLBACK_MIN_CONFIDENCE) {
    return "low-confidence";
  }

  if (result?.resolved === true && !sanitizeLlmDiagnosticValue(result.canonicalTitleZh)) {
    return "missing-canonical-title";
  }

  return (
    sanitizeLlmDiagnosticValue(result?.rejectedReason) ??
    sanitizeLlmDiagnosticValue(result?.errorReason) ??
    sanitizeLlmDiagnosticValue(result?.reason) ??
    "not-resolved"
  );
}

function createLlmFallbackDiagnostics({ llmResolver, llmResolverOptions = {} } = {}) {
  const enabled = typeof llmResolver === "function";
  const metadata = enabled ? getLlmResolverMetadata(llmResolver) : {};
  const summary = {
    enabled,
    configured: enabled ? metadata.configured !== false : false,
    model: sanitizeLlmDiagnosticValue(metadata.model ?? llmResolverOptions.model),
    baseUrl: sanitizeLlmDiagnosticValue(metadata.baseUrl ?? llmResolverOptions.baseUrl),
    callCount: 0,
    resolvedCount: 0,
    rejectedCount: 0,
    errorCount: 0,
    rejectedReasonCounts: createCountMap(),
    errorReasonCounts: createCountMap(),
  };

  const snapshot = () => ({
    ...summary,
    rejectedReasonCounts: { ...summary.rejectedReasonCounts },
    errorReasonCounts: { ...summary.errorReasonCounts },
  });

  if (!enabled) {
    return {
      resolver: null,
      snapshot,
    };
  }

  // LLM 是外部 I/O，必须把异常收敛成 review，不能让整份 plan 失败。
  const resolver = async (context) => {
    summary.callCount += 1;

    try {
      const result = await llmResolver(context);
      if (result?.resolved === true && Number(result.confidence ?? 0) >= LLM_FALLBACK_MIN_CONFIDENCE) {
        summary.resolvedCount += 1;
        return result;
      }

      summary.rejectedCount += 1;
      incrementCount(summary.rejectedReasonCounts, resolveLlmRejectedReason(result));
      return result ?? { resolved: false };
    } catch (error) {
      const reason = normalizeLlmErrorReason(error);
      summary.errorCount += 1;
      incrementCount(summary.errorReasonCounts, reason);
      return {
        resolved: false,
        errorReason: reason,
      };
    }
  };

  Object.defineProperty(resolver, "llmFallbackMetadata", {
    value: {
      enabled: true,
      configured: summary.configured,
      model: summary.model,
      baseUrl: summary.baseUrl,
    },
  });

  return {
    resolver,
    snapshot,
  };
}

async function applyLlmFallbackToTvReviews({
  allStates,
  tvFallbackStates,
  tmdbClient,
  scheduler,
  taskRegistry,
  detailsCache,
  language = DEFAULT_TMDB_LANGUAGE,
  llmResolver,
  wrapperContextBySource,
}) {
  const fallbackMoves = [];
  const fallbackReviews = [];
  const groupStateMap = new Map();

  for (const state of allStates) {
    if (state.searchType !== "tv") {
      continue;
    }

    const rootSource = getSourceRoot(state.parsedEntry.source);
    const current = groupStateMap.get(rootSource) ?? [];
    current.push(state);
    groupStateMap.set(rootSource, current);
  }

  const fallbackGroupMap = new Map();
  for (const state of tvFallbackStates) {
    const unresolvedReviewReason = state.reviewReason ?? TMDB_REVIEW_REASON_MISS;
    const rootSource = getSourceRoot(state.parsedEntry.source);
    const groupStates = groupStateMap.get(rootSource) ?? [state];
    const resourcePackageReviewReason = needsResourcePackageLlmClassification(state.parsedEntry)
      ? TMDB_REVIEW_REASON_EPISODIC_EXTRA_VIDEO
      : null;
    const canUseDirectoryGroupFallback =
      state.parsedEntry.isDir && collectMatchedTvIdentities(groupStates).length === 1;
    const canUseWanwanVideoGroupFallback =
      !state.parsedEntry.isDir &&
      state.parsedEntry.role === "video" &&
      containsWanwanHint(state.parsedEntry) &&
      collectMatchedTvIdentities(groupStates).length === 1;

    if (resourcePackageReviewReason) {
      fallbackReviews.push(
        buildReviewEntry({
          parsedEntry: state.parsedEntry,
          searchType: state.searchType,
          reviewReason: resourcePackageReviewReason,
          confidence: state.confidence,
          tmdbCandidates: state.tmdbCandidates,
        }),
      );
      continue;
    }

    if (
      !isFallbackEligible(state.parsedEntry) &&
      !canUseDirectoryGroupFallback &&
      !canUseWanwanVideoGroupFallback
    ) {
      fallbackReviews.push(
        buildReviewEntry({
          parsedEntry: state.parsedEntry,
          searchType: state.searchType,
          reviewReason: unresolvedReviewReason,
          confidence: state.confidence,
          tmdbCandidates: state.tmdbCandidates,
        }),
      );
      continue;
    }

    const current = fallbackGroupMap.get(rootSource) ?? [];
    current.push(state);
    fallbackGroupMap.set(rootSource, current);
  }

  for (const [rootSource, unresolvedStates] of fallbackGroupMap.entries()) {
    const groupStates = groupStateMap.get(rootSource) ?? unresolvedStates;
    const identity = await resolveFallbackIdentity({
      rootSource,
      missStates: unresolvedStates,
      groupStates,
      llmResolver,
    });

    if (!identity?.resolved) {
      fallbackReviews.push(
        ...unresolvedStates.map((state) => {
          return buildReviewEntry({
            parsedEntry: state.parsedEntry,
            searchType: state.searchType,
            reviewReason: state.reviewReason ?? TMDB_REVIEW_REASON_MISS,
            confidence: state.confidence,
            tmdbCandidates: state.tmdbCandidates,
          });
        }),
      );
      continue;
    }

    for (const state of unresolvedStates) {
      const fallbackEpisode = inferFallbackEpisode(state.parsedEntry);
      const fallbackSeason = inferFallbackDirectorySeason({
        parsedEntry: state.parsedEntry,
        groupStates,
      });
      const allowOriginalNameFallback =
        isWanwanSpecialFallbackEntry(state.parsedEntry) || containsWanwanHint(state.parsedEntry);

      if (state.parsedEntry.role === "video" && !fallbackEpisode && !allowOriginalNameFallback) {
        fallbackReviews.push(
          buildReviewEntry({
            parsedEntry: state.parsedEntry,
            searchType: state.searchType,
            reviewReason: state.reviewReason ?? TMDB_REVIEW_REASON_MISS,
            confidence: state.confidence,
            tmdbCandidates: state.tmdbCandidates,
          }),
        );
        continue;
      }

      const fallbackMove = buildFallbackMove({
        parsedEntry: {
          ...state.parsedEntry,
          season: fallbackSeason ?? state.parsedEntry.season,
          episode: fallbackEpisode ?? state.parsedEntry.episode,
        },
        identity,
        wrapperContext: wrapperContextBySource.get(state.parsedEntry.source) ?? null,
      });

      if (shouldBlockMatchedMoveByMediaRouting(state.parsedEntry, fallbackMove)) {
        fallbackReviews.push(
          buildReviewEntry({
            parsedEntry: state.parsedEntry,
            searchType: state.searchType,
            reviewReason: TMDB_REVIEW_REASON_MEDIA_ROUTING_UNKNOWN,
            confidence: state.confidence,
            matchedEntry: fallbackMove,
            tmdbCandidates: state.tmdbCandidates,
          }),
        );
        continue;
      }

      fallbackMoves.push(fallbackMove);
    }
  }

  return {
    fallbackMoves,
    fallbackReviews,
  };
}

function hasPreferredSeasonDirectory(source) {
  return /(?:^|\/)(?:Season[ ._-]?\d{1,2}|S\d{1,2})(?:\/|$)/i.test(source);
}

function hasDuplicateNoise(source) {
  return /\(\d+\)|\bV\d+\b|\bcopy\b/i.test(source);
}

function hasReleaseGarbage(source) {
  return /(TGx|rarbg|SMURF|MIXED|NTb|NTG|TEPES|TOMMY|LAMBiC|GGWP|GGEZ|GLHF|SuccessfulCrab)/i.test(
    source,
  );
}

function buildMergeCandidateMetrics(item) {
  const source = String(item.source ?? "");
  const baseName = path.posix.basename(source);
  const depth = getSourceDepth(source);
  let qualityScore = 0;

  if (hasPreferredSeasonDirectory(source)) {
    qualityScore += 14;
  }

  if (item.episode && /S\d{1,2}E\d{1,3}/i.test(baseName)) {
    qualityScore += 12;
  }

  if (!hasDuplicateNoise(source)) {
    qualityScore += 6;
  } else {
    qualityScore -= 18;
  }

  if (!hasReleaseGarbage(source)) {
    qualityScore += 4;
  } else {
    qualityScore -= 8;
  }

  const extraDepthPenalty = Math.max(0, depth - (item.episode ? 3 : 2));
  qualityScore -= extraDepthPenalty * 8;

  const stabilityScore =
    (/S\d{1,2}E\d{1,3}/i.test(baseName) ? 8 : 0) +
    (/[.]/.test(baseName) ? 2 : 0) +
    (!/[\[\]()]/.test(baseName) ? 2 : 0);
  const episodeTokenScore = buildEpisodeTokenSpecificityScore(source);

  return {
    qualityScore,
    depth,
    stabilityScore,
    episodeTokenScore,
  };
}

function resolveMergeConflict(entries) {
  if (!hasConsistentEpisodeIdentity(entries)) {
    return {
      resolved: false,
    };
  }

  const knownAnimeResolution = resolveKnownAnimeMergeConflict(entries);
  if (knownAnimeResolution.resolved && knownAnimeResolution.winner) {
    return knownAnimeResolution;
  }

  const ranked = [...entries]
    .map((entry) => ({
      entry,
      metrics: buildMergeCandidateMetrics(entry),
    }))
    .sort((left, right) => {
      if (right.metrics.qualityScore !== left.metrics.qualityScore) {
        return right.metrics.qualityScore - left.metrics.qualityScore;
      }

      if (left.metrics.depth !== right.metrics.depth) {
        return left.metrics.depth - right.metrics.depth;
      }

      if (right.metrics.stabilityScore !== left.metrics.stabilityScore) {
        return right.metrics.stabilityScore - left.metrics.stabilityScore;
      }

      if (right.metrics.episodeTokenScore !== left.metrics.episodeTokenScore) {
        return right.metrics.episodeTokenScore - left.metrics.episodeTokenScore;
      }

      return String(left.entry.source).localeCompare(String(right.entry.source), "zh-Hans-CN");
    });

  const top = ranked[0];
  const second = ranked[1];
  if (!top) {
    return {
      resolved: false,
    };
  }

  if (!second) {
    return {
      resolved: true,
      winner: top.entry,
    };
  }

  if (top.metrics.qualityScore - second.metrics.qualityScore >= MERGE_CONFLICT_SCORE_MIN_GAP) {
    return {
      resolved: true,
      winner: top.entry,
    };
  }

  if (top.metrics.depth < second.metrics.depth) {
    return {
      resolved: true,
      winner: top.entry,
    };
  }

  if (top.metrics.stabilityScore > second.metrics.stabilityScore) {
    return {
      resolved: true,
      winner: top.entry,
    };
  }

  if (top.metrics.episodeTokenScore > second.metrics.episodeTokenScore) {
    return {
      resolved: true,
      winner: top.entry,
    };
  }

  return {
    resolved: false,
  };
}

function collectMergeableSeriesGroups(moves) {
  const groupMap = new Map();

  for (const move of moves) {
    if (
      move.tmdbType !== "tv" ||
      !move.isDir ||
      getSourceDepth(move.source) !== 1 ||
      move.season ||
      move.episode ||
      !move.tmdbId
    ) {
      continue;
    }

    const key = `${move.tmdbId}:${move.targetPath}`;
    const current = groupMap.get(key) ?? {
      tmdbId: move.tmdbId,
      targetPath: move.targetPath,
      items: [],
    };
    current.items.push(move);
    groupMap.set(key, current);
  }

  return [...groupMap.values()].filter((group) => group.items.length > 1);
}

function mergeSeriesAliasGroups(moves) {
  const mergeGroups = collectMergeableSeriesGroups(moves);
  if (mergeGroups.length === 0) {
    return {
      moves,
      reviews: [],
      mergeRootInfos: [],
      stats: {
        mergedSeriesGroupCount: 0,
        mergedEntryCount: 0,
        mergeConflictResolvedCount: 0,
        mergeConflictReviewCount: 0,
      },
    };
  }

  const mergeRootMap = new Map();
  for (const group of mergeGroups) {
    for (const rootMove of group.items) {
      mergeRootMap.set(getSourceRoot(rootMove.source), {
        rootSource: getSourceRoot(rootMove.source),
        rootCid: rootMove.cid ?? null,
        targetPath: group.targetPath,
        tmdbId: group.tmdbId,
      });
    }
  }

  const preservedMoves = [];
  const mergeCandidateMoves = [];
  let mergedEntryCount = 0;

  for (const move of moves) {
    const rootSource = getSourceRoot(move.source);
    const mergeRootInfo = mergeRootMap.get(rootSource);

    if (!mergeRootInfo) {
      preservedMoves.push(move);
      continue;
    }

    mergedEntryCount += 1;

    if (move.isDir) {
      continue;
    }

    mergeCandidateMoves.push({
      ...move,
      wrapperDir: rootSource,
      wrapperDirCid: mergeRootInfo.rootCid,
    });
  }

  const mergeConflictReviews = [];
  let mergeConflictResolvedCount = 0;
  let mergeConflictReviewCount = 0;
  const targetPathMap = new Map();

  for (const move of mergeCandidateMoves) {
    const current = targetPathMap.get(move.targetPath) ?? [];
    current.push(move);
    targetPathMap.set(move.targetPath, current);
  }

  for (const items of targetPathMap.values()) {
    if (items.length === 1) {
      preservedMoves.push(items[0]);
      continue;
    }

    const resolved = resolveMergeConflict(items);
    if (resolved.resolved && resolved.winner) {
      preservedMoves.push(resolved.winner);
      mergeConflictResolvedCount += 1;
      continue;
    }

    mergeConflictReviewCount += 1;
    for (const item of items) {
      const parsedEntry = parseTmdbNormalizeEntry(item);
      mergeConflictReviews.push(
        buildReviewEntry({
          parsedEntry,
          searchType: "tv",
          reviewReason: TMDB_REVIEW_REASON_MERGE_CONFLICT,
          confidence: item.matchConfidence ?? item.confidence,
          matchedEntry: item,
        }),
      );
    }
  }

  return {
    moves: preservedMoves,
    reviews: mergeConflictReviews,
    mergeRootInfos: [...mergeRootMap.values()],
    stats: {
      mergedSeriesGroupCount: mergeGroups.length,
      mergedEntryCount,
      mergeConflictResolvedCount,
      mergeConflictReviewCount,
    },
  };
}

function buildMergedRootDeletes({
  mergeRootInfos,
  moves,
  reviews,
}) {
  if (!mergeRootInfos || mergeRootInfos.length === 0) {
    return [];
  }

  return mergeRootInfos.flatMap((mergeRootInfo) => {
    const wrappedMoves = moves.filter((move) => move.wrapperDir === mergeRootInfo.rootSource);
    if (wrappedMoves.length === 0 || !mergeRootInfo.rootCid) {
      return [];
    }

    const hasResidualReview = reviews.some((review) => {
      return (
        review.source === mergeRootInfo.rootSource ||
        review.source.startsWith(`${mergeRootInfo.rootSource}/`)
      );
    });

    if (hasResidualReview) {
      return [];
    }

    return [
      {
        wrapperDir: mergeRootInfo.rootSource,
        wrapperDirCid: mergeRootInfo.rootCid,
        moveCount: wrappedMoves.length,
        reason: `${MERGE_DELETE_REASON}:${mergeRootInfo.targetPath}`,
        strategy: MERGE_DELETE_STRATEGY,
      },
    ];
  });
}

function buildWrapperDeletes({
  wrapperAnalyses,
  moves,
  reviews,
}) {
  if (!wrapperAnalyses || wrapperAnalyses.length === 0) {
    return [];
  }

  return wrapperAnalyses.flatMap((analysis) => {
    const primaryVideoMove = moves.find((move) => move.source === analysis.primaryVideoSource);
    if (!primaryVideoMove || primaryVideoMove.wrapperDir !== analysis.wrapperDir || !analysis.wrapperDirCid) {
      return [];
    }

    const moveCount = moves.filter((move) => move.wrapperDir === analysis.wrapperDir).length;
    if (moveCount === 0) {
      return [];
    }

    const hasResidualReview = reviews.some((review) => {
      return review.source === analysis.wrapperDir || review.source.startsWith(`${analysis.wrapperDir}/`);
    });

    if (hasResidualReview) {
      return [];
    }

    return [
      buildDeleteEntry({
        source: analysis.wrapperDir,
        itemId: analysis.wrapperDirCid,
        moveCount,
        reason: "视频与可挂靠字幕已迁出，删除单集包裹目录",
        strategy: FLATTEN_WRAPPER_DELETE_STRATEGY,
      }),
    ];
  });
}

function buildSidecarDirectoryDeletes({
  sidecarDirectoryInfos,
  parsedEntries,
  moves,
  reviews,
  existingDeletes,
}) {
  if (!sidecarDirectoryInfos || sidecarDirectoryInfos.length === 0) {
    return [];
  }

  const moveSourceSet = new Set(moves.map((item) => item.source));
  const reviewSourceSet = new Set(reviews.map((item) => item.source));
  const pendingDeleteSet = new Set(existingDeletes.map((item) => item.wrapperDir));

  return [...sidecarDirectoryInfos]
    .sort((left, right) => {
      const depthGap = getSourceDepth(right.source) - getSourceDepth(left.source);
      if (depthGap !== 0) {
        return depthGap;
      }

      return String(left.source).localeCompare(String(right.source), "zh-Hans-CN");
    })
    .flatMap((directoryInfo) => {
      const descendants = parsedEntries.filter((entry) => entry.source.startsWith(`${directoryInfo.source}/`));

      if (reviewSourceSet.has(directoryInfo.source) || descendants.some((entry) => reviewSourceSet.has(entry.source))) {
        return [];
      }

      const allHandled = descendants.every((entry) => {
        return moveSourceSet.has(entry.source) || pendingDeleteSet.has(entry.source);
      });

      if (!allHandled) {
        return [];
      }

      const moveCount = descendants.filter((entry) => moveSourceSet.has(entry.source)).length;
      const deleteEntry = buildDeleteEntry({
        source: directoryInfo.source,
        itemId: directoryInfo.cid ?? null,
        moveCount,
        reason: "目录内字幕/附件已迁移或删除，清理 sidecar 目录",
        strategy: SIDECAR_DIR_DELETE_STRATEGY,
      });
      pendingDeleteSet.add(directoryInfo.source);
      return [deleteEntry];
    });
}

function resolveLocalDeleteStrategy(parsedEntry, resourceContext = null) {
  if (isProtectedMainEpisode(parsedEntry, resourceContext)) {
    return null;
  }

  if (isEpisodicExtraVideo(parsedEntry)) {
    return EPISODIC_EXTRA_DELETE_STRATEGY;
  }

  if (!parsedEntry.title || parsedEntry.title === "未识别标题") {
    return EMPTY_QUERY_DELETE_STRATEGY;
  }

  return null;
}

function buildLocalDeleteReason(parsedEntry, strategy) {
  if (strategy === EPISODIC_EXTRA_DELETE_STRATEGY) {
    return "识别为 Creditless/PV/SP 等非正片素材，按噪音条目删除";
  }

  if (strategy === EMPTY_QUERY_DELETE_STRATEGY) {
    return "标题清洗后为空，按噪音条目删除";
  }

  return `按策略 ${strategy} 删除`;
}

function shouldRescueUnsafeDelete({
  deleteEntry,
  parsedEntry,
  protectedMainEpisodeSourceSet,
}) {
  if (
    !parsedEntry ||
    parsedEntry.isDir ||
    parsedEntry.role !== "video" ||
    !COMMON_VIDEO_EXTENSIONS.has(parsedEntry.ext)
  ) {
    return false;
  }

  if (deleteEntry.strategy === EPISODIC_EXTRA_DELETE_STRATEGY) {
    return true;
  }

  return Boolean(deleteEntry.strategy === EMPTY_QUERY_DELETE_STRATEGY && parsedEntry.episode);
}

function resolveUnsafeDeleteRescueBucket(parsedEntry) {
  if (
    hasFileLevelExtraVideoMarker(parsedEntry) ||
    hasExplicitExtraDirectoryAncestor(parsedEntry.pathParts ?? []) ||
    isZeroReviewSupplementalMaterial(parsedEntry, null)
  ) {
    return ZERO_REVIEW_SUPPLEMENT_BUCKET;
  }

  return ZERO_REVIEW_UNKNOWN_MEDIA_BUCKET;
}

function buildUnsafeDeleteRescueMove({ deleteEntry, parsedEntry }) {
  const bucket = resolveUnsafeDeleteRescueBucket(parsedEntry);
  const move = buildZeroReviewQuarantineMove({
    review: {
      source: parsedEntry.source,
      sourceRootRelativePath: parsedEntry.sourceRootRelativePath ?? "",
      actualSourceRelativePath: parsedEntry.actualSourceRelativePath ?? parsedEntry.source,
      title: parsedEntry.title,
      year: parsedEntry.year,
      reviewReason: deleteEntry.strategy ?? "unsafe-delete",
      wrapperDir: deleteEntry.wrapperDir ?? null,
      wrapperDirCid: deleteEntry.wrapperDirCid ?? null,
    },
    parsedEntry,
    bucket,
    classification: {
      confidence: 1,
    },
  });

  return {
    ...move,
    matchSource: "delete-safety-rescue",
    matchConfidence: 1,
    confidence: 1,
    reason: `delete-safety-rescue:${deleteEntry.strategy ?? "unknown"}`,
    rescuedFromDeleteStrategy: deleteEntry.strategy ?? null,
    rescuedFromDeleteReason: deleteEntry.reason ?? null,
  };
}

function rescueUnsafeDeletesToQuarantine({
  deletes,
  moves,
  parsedEntryBySource,
  protectedMainEpisodeSourceSet,
}) {
  const occupiedTargetPaths = new Set(moves.map((move) => move.targetPath).filter(Boolean));
  const safeDeletes = [];
  const rescuedMoves = [];

  for (const deleteEntry of deletes) {
    const parsedEntry = parsedEntryBySource.get(normalizeSourcePath(deleteEntry.wrapperDir ?? ""));

    if (
      shouldRescueUnsafeDelete({
        deleteEntry,
        parsedEntry,
        protectedMainEpisodeSourceSet,
      })
    ) {
      rescuedMoves.push(
        makeMoveTargetPathUnique(
          buildUnsafeDeleteRescueMove({ deleteEntry, parsedEntry }),
          occupiedTargetPaths,
        ),
      );
      continue;
    }

    safeDeletes.push(deleteEntry);
  }

  return {
    deletes: safeDeletes,
    moves: moves.concat(rescuedMoves),
    rescuedUnsafeDeleteCount: rescuedMoves.length,
  };
}

function buildTmdbSummary({
  totalEntries,
  moves,
  reviews,
  deletes,
  collisionGroups,
  matchedCount,
  queryStats,
  mergeStats,
  diagnosticReviewReasonCounts = null,
  finalActionCounts = null,
  mediaRoutingSummary = null,
}) {
  const allEntries = [...moves, ...reviews];
  const byCategory = allEntries.reduce((acc, entry) => {
    acc[entry.category] = (acc[entry.category] ?? 0) + 1;
    return acc;
  }, {});
  const reviewReasonCounts =
    diagnosticReviewReasonCounts ??
    reviews.reduce((acc, entry) => {
      const key = entry.reviewReason || "unknown";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
  const deleteStrategyCounts = deletes.reduce((acc, entry) => {
    const key = entry.strategy || "unknown";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  return {
    totalEntries,
    moveCount: moves.length,
    reviewCount: reviews.length,
    deleteCount: deletes.length,
    collisionCount: collisionGroups.length,
    tmdbMatchedCount: matchedCount,
    tmdbMissCount: reviewReasonCounts[TMDB_REVIEW_REASON_MISS] ?? 0,
    tmdbQueryErrorCount: reviewReasonCounts[TMDB_REVIEW_REASON_QUERY_ERROR] ?? 0,
    tmdbAmbiguousCount: reviewReasonCounts[TMDB_REVIEW_REASON_AMBIGUOUS] ?? 0,
    yearConflictCount: reviewReasonCounts[TMDB_REVIEW_REASON_YEAR_CONFLICT] ?? 0,
    tmdbQueryTaskCount: queryStats.taskCount,
    tmdbCacheHitCount: queryStats.cacheHitCount,
    tmdbRequestCount: queryStats.requestCount,
    tmdbRetryCount: queryStats.retryCount,
    tmdb429Count: queryStats.status429Count,
    tmdbErrorAttemptCount: queryStats.errorAttemptCount ?? 0,
    tmdbErrorCodeCounts: { ...(queryStats.errorCodeCounts ?? {}) },
    tmdbErrorStatusCounts: { ...(queryStats.errorStatusCounts ?? {}) },
    tmdbErrorMessageCounts: { ...(queryStats.errorMessageCounts ?? {}) },
    mergedSeriesGroupCount: mergeStats.mergedSeriesGroupCount,
    mergedEntryCount: mergeStats.mergedEntryCount,
    mergeConflictResolvedCount: mergeStats.mergeConflictResolvedCount,
    mergeConflictReviewCount: mergeStats.mergeConflictReviewCount,
    deleteStrategyCounts,
    reviewReasonCounts,
    finalActionCounts: finalActionCounts ?? {
      move: moves.length,
      delete: deletes.length,
      review: reviews.length,
    },
    mediaRouting: mediaRoutingSummary,
    byCategory,
  };
}

function resolveMediaRoutingReviewReason(parsedEntry) {
  if (!parsedEntry?.mediaRoutingEnabled || parsedEntry.explicitRootCategory) {
    return null;
  }

  if (parsedEntry.routingCategory === "supplement") {
    return TMDB_REVIEW_REASON_MEDIA_ROUTING_SUPPLEMENT;
  }

  return null;
}

function shouldBlockMatchedMoveByMediaRouting(parsedEntry, move) {
  if (!parsedEntry?.mediaRoutingEnabled || parsedEntry.explicitRootCategory) {
    return false;
  }

  if (parsedEntry.routingHighConfidence && ROUTABLE_MEDIA_CATEGORIES.has(parsedEntry.routingCategory)) {
    return false;
  }

  // 未知根目录下，只有安全识别出的动漫例外放行；普通 tv/movie 命中仍回保留区。
  return move?.category !== "anime";
}

export async function buildTmdbNormalizePlan(entries, options = {}) {
  const tmdbClient = options.tmdbClient ?? createTmdbClient();
  const rootPath = options.rootPath ?? "";
  const inputContext = normalizeTmdbInputContext(options);
  const sourceRootContext =
    options.sourceRootRelativePath === undefined
      ? { rootPath }
      : { rootPath, sourceRootRelativePath: options.sourceRootRelativePath };
  const sourceRootRelativePath = inferSourceRootRelativePath(sourceRootContext);
  const executionRootPath = options.executionRootPath ?? "";
  const language = options.language ?? DEFAULT_TMDB_LANGUAGE;
  const cleanupOverrides =
    options.cleanupOverrides && typeof options.cleanupOverrides === "object"
      ? options.cleanupOverrides
      : loadCleanupOverrides();
  const titleTranslator = typeof options.titleTranslator === "function" ? options.titleTranslator : null;
  const baseLlmResolver =
    typeof options.llmResolver === "function"
      ? options.llmResolver
      : createOpenAiLlmResolver(options.llmResolverOptions ?? {});
  const llmFallbackDiagnostics = createLlmFallbackDiagnostics({
    llmResolver: baseLlmResolver,
    llmResolverOptions: options.llmResolverOptions ?? {},
  });
  const llmResolver = llmFallbackDiagnostics.resolver;
  const onProgress = typeof options.onProgress === "function" ? options.onProgress : null;
  const detailsCache = new Map();
  const taskRegistry = createTmdbQueryTaskRegistry();
  const mediaRoutingEnabled = shouldUseMediaRouting(rootPath);
  const initialParsedEntries = entries.map((entry) => {
    return parseTmdbNormalizeEntry(entry, {
      rootPath,
      sourceRootRelativePath,
      mediaRoutingEnabled,
    });
  });
  const initialDirectChildrenMap = buildDirectChildrenMap(initialParsedEntries);
  const { resourceContexts: initialResourceContexts } = collectResourcePackageContexts(
    initialParsedEntries,
    initialDirectChildrenMap,
  );
  const mediaRoutingResult = await resolveMediaRouting({
    enabled: mediaRoutingEnabled,
    rootPath,
    sourceRootRelativePath,
    resourceContexts: initialResourceContexts,
    llmResolver: baseLlmResolver,
  });
  const mediaRoutingByRootSource = mediaRoutingResult.routeByRootSource;
  const parsedEntries = entries.map((entry) => {
    const source = normalizeSourcePath(entry.source ?? "");
    return parseTmdbNormalizeEntry(entry, {
      rootPath,
      sourceRootRelativePath,
      mediaRoutingEnabled,
      mediaRouting: mediaRoutingByRootSource.get(getSourceRoot(source)) ?? null,
    });
  });
  const episodicDirectorySourceSet = buildEpisodicDirectorySourceSet(parsedEntries);
  for (const parsedEntry of parsedEntries) {
    parsedEntry.hasEpisodicDescendant = episodicDirectorySourceSet.has(parsedEntry.source);
  }
  const emptyDirectorySourceSet = buildEmptyDirectorySourceSet(parsedEntries, {
    rootPath,
    sourceRootRelativePath,
    inputContext,
  });
  const entryBySource = new Map(parsedEntries.map((entry) => [entry.source, entry]));
  const canonicalTitleOverrideMap = buildCanonicalTitleOverrideMap(cleanupOverrides);
  const directChildrenMap = buildDirectChildrenMap(parsedEntries);
  const { resourceContexts, resourceContextBySource } = collectResourcePackageContexts(parsedEntries, directChildrenMap);
  const protectedMainEpisodeSourceSet = collectProtectedMainEpisodeSourceSet(resourceContexts);
  const deleteEntryMap = new Map();
  const skipSourceSet = new Set();
  const sidecarFileSourceSet = new Set();
  const sidecarDirectoryInfoBySource = new Map();
  const wrapperAnalyses = [];
  const wrapperAnalysisBySource = new Map();
  const wrapperContextBySource = new Map();
  const subtitleAttachmentContextBySource = new Map();

  const addDelete = (deleteEntry) => {
    const key = `${deleteEntry.strategy}:${deleteEntry.wrapperDir}`;
    if (!deleteEntryMap.has(key)) {
      deleteEntryMap.set(key, deleteEntry);
    }
  };

  const registerSidecarDirectory = (parsedEntry) => {
    if (!parsedEntry?.isDir || !parsedEntry.source) {
      return;
    }

    if (!sidecarDirectoryInfoBySource.has(parsedEntry.source)) {
      sidecarDirectoryInfoBySource.set(parsedEntry.source, {
        source: parsedEntry.source,
        cid: parsedEntry.cid ?? null,
      });
    }
  };

  for (const parsedEntry of parsedEntries) {
    if (isAdvertisingSidecar(parsedEntry)) {
      addDelete(
        buildDeleteEntry({
          source: parsedEntry.source,
          itemId: parsedEntry.fid ?? parsedEntry.cid ?? null,
          reason: "识别为广告附件，直接删除",
          strategy: ADVERTISING_SIDECAR_DELETE_STRATEGY,
        }),
      );
      skipSourceSet.add(parsedEntry.source);
      continue;
    }

    if (isSubtitleSidecar(parsedEntry) || isNonsubSidecar(parsedEntry)) {
      sidecarFileSourceSet.add(parsedEntry.source);
      skipSourceSet.add(parsedEntry.source);
      continue;
    }

    if (parsedEntry.isDir && isNestedSidecarDirectoryName(parsedEntry.name)) {
      registerSidecarDirectory(parsedEntry);
      skipSourceSet.add(parsedEntry.source);
    }
  }

  for (const parsedEntry of parsedEntries) {
    if (skipSourceSet.has(parsedEntry.source) || !parsedEntry.isDir || !parsedEntry.episode) {
      continue;
    }

    const analysis = analyzeEpisodeWrapperDirectory({
      wrapperEntry: parsedEntry,
      directChildrenMap,
    });
    wrapperAnalysisBySource.set(parsedEntry.source, analysis);

    if (analysis.mode === "ignore") {
      for (const source of analysis.suppressedSources ?? [parsedEntry.source]) {
        skipSourceSet.add(source);
      }
      continue;
    }

    if (analysis.mode === "sidecar-only") {
      registerSidecarDirectory({
        source: analysis.wrapperDir,
        cid: analysis.wrapperDirCid,
        isDir: true,
      });
      for (const source of analysis.suppressedSources ?? [parsedEntry.source]) {
        skipSourceSet.add(source);
      }
      continue;
    }

    if (analysis.mode !== "flatten") {
      continue;
    }

    wrapperAnalyses.push(analysis);
    for (const source of analysis.suppressedSources) {
      skipSourceSet.add(source);
    }

    wrapperContextBySource.set(analysis.primaryVideoSource, {
      wrapperDir: analysis.wrapperDir,
      wrapperDirCid: analysis.wrapperDirCid,
    });

    for (const source of analysis.attachableSubtitleSources) {
      skipSourceSet.add(source);
      subtitleAttachmentContextBySource.set(source, {
        primaryVideoSource: analysis.primaryVideoSource,
      });
    }
  }

  for (const parsedEntry of parsedEntries) {
    if (!emptyDirectorySourceSet.has(parsedEntry.source)) {
      continue;
    }

    const alreadySkipped = skipSourceSet.has(parsedEntry.source);
    skipSourceSet.add(parsedEntry.source);

    if (alreadySkipped || hasDirectoryAncestorInSet(parsedEntry.source, emptyDirectorySourceSet)) {
      continue;
    }

    addDelete(
      buildDeleteEntry({
        source: parsedEntry.source,
        itemId: parsedEntry.cid,
        moveCount: 0,
        reason: "递归采集确认目录没有任何后代，按同类空媒体目录删除",
        strategy: EMPTY_MEDIA_DIR_DELETE_STRATEGY,
      }),
    );
  }

  const scheduler = createTmdbSearchScheduler({
    tmdbClient,
    concurrency: options.tmdbQueryConcurrency ?? TMDB_QUERY_SCHEDULER_DEFAULTS.concurrency,
    minIntervalMs: options.tmdbQueryIntervalMs ?? TMDB_QUERY_SCHEDULER_DEFAULTS.minIntervalMs,
    maxRetries: options.tmdbQueryMaxRetries ?? TMDB_QUERY_SCHEDULER_DEFAULTS.maxRetries,
    backoffBaseMs: options.tmdbQueryBackoffBaseMs ?? TMDB_QUERY_SCHEDULER_DEFAULTS.backoffBaseMs,
    timeoutMs: options.tmdbQueryTimeoutMs ?? TMDB_QUERY_SCHEDULER_DEFAULTS.timeoutMs,
    onProgress: (snapshot) => {
      onProgress?.({
        type: "tmdb-prefetch-progress",
        stage: "prefetch",
        ...snapshot,
      });
    },
  });

  const planningStates = parsedEntries.map((parsedEntry) => {
    const searchType = inferTmdbSearchType(parsedEntry);
    const wrapperAnalysis = wrapperAnalysisBySource.get(parsedEntry.source);
    const skipPlanning = skipSourceSet.has(parsedEntry.source);
    const mediaRoutingReviewReason = !skipPlanning
      ? resolveMediaRoutingReviewReason(parsedEntry)
      : null;
    const resourcePackageLlmReviewReason =
      !skipPlanning && typeof llmResolver === "function" && needsResourcePackageLlmClassification(parsedEntry)
        ? TMDB_REVIEW_REASON_EPISODIC_EXTRA_VIDEO
        : null;
    const localReviewReason =
      wrapperAnalysis?.mode === "review"
        ? wrapperAnalysis.reviewReason
        : skipPlanning
          ? null
          : mediaRoutingReviewReason ?? resourcePackageLlmReviewReason ?? resolveLocalReviewReason(parsedEntry);
    const localDeleteStrategy =
      !skipPlanning && !localReviewReason
        ? resolveLocalDeleteStrategy(parsedEntry, resourceContextBySource.get(parsedEntry.source) ?? null)
        : null;
    const localCanonicalOverride =
      !skipPlanning && !localReviewReason && !localDeleteStrategy
        ? resolveCanonicalTitleOverrideMatch(parsedEntry, canonicalTitleOverrideMap)
        : null;
    const queryPlan =
      !skipPlanning &&
      !localReviewReason &&
      !localDeleteStrategy &&
      !localCanonicalOverride &&
      parsedEntry.title &&
      parsedEntry.title !== "未识别标题"
        ? buildQueryPlanFromTitles({
            searchType,
            queryTitles: parsedEntry.titleCandidates,
            language,
            taskRegistry,
          })
        : [];

    return {
      entry: parsedEntry,
      parsedEntry,
      searchType,
      skipPlanning,
      localReviewReason,
      localDeleteStrategy,
      localCanonicalOverride,
      queryPlan,
      move: null,
      reviewReason: null,
      confidence: 0,
      tmdbCandidates: [],
    };
  });

  const queryTasks = taskRegistry.values();
  const plannedEntries = planningStates.filter((state) => {
    return state.queryPlan.length > 0 || Boolean(state.localCanonicalOverride);
  }).length;
  const reviewOnlyEntries = planningStates.filter((state) => {
    return (
      !state.skipPlanning &&
      !state.localCanonicalOverride &&
      (state.localReviewReason || (state.queryPlan.length === 0 && !state.localDeleteStrategy))
    );
  }).length;
  const skippedEntries = planningStates.filter((state) => state.skipPlanning).length;

  onProgress?.({
    type: "tmdb-prefetch-start",
    stage: "prefetch",
    totalTasks: queryTasks.length,
    completedTasks: 0,
  });
  await scheduler.prefetch(queryTasks);
  onProgress?.({
    type: "tmdb-prefetch-complete",
    stage: "prefetch",
    ...scheduler.getProgressSnapshot(),
  });
  onProgress?.({
    type: "tmdb-planning-start",
    stage: "planning",
    totalEntries: planningStates.length,
    plannedEntries,
    reviewOnlyEntries,
    skippedEntries,
  });

  const terminalReviews = [];
  const tvFallbackStates = [];
  let matchedCount = 0;

  for (const state of planningStates) {
    const parsedEntry = state.parsedEntry;

    if (state.skipPlanning) {
      continue;
    }

    if (state.localReviewReason) {
      terminalReviews.push(
        buildReviewEntry({
          parsedEntry,
          searchType: state.searchType,
          reviewReason: state.localReviewReason,
          confidence: 0,
        }),
      );
      continue;
    }

    if (state.localDeleteStrategy) {
      addDelete(
        buildDeleteEntry({
          source: parsedEntry.source,
          itemId: parsedEntry.fid ?? parsedEntry.cid ?? null,
          reason: buildLocalDeleteReason(parsedEntry, state.localDeleteStrategy),
          strategy: state.localDeleteStrategy,
        }),
      );
      continue;
    }

    if (state.localCanonicalOverride) {
      state.move = buildCanonicalOverrideMove({
        parsedEntry,
        overrideEntry: state.localCanonicalOverride,
        wrapperContext: wrapperContextBySource.get(parsedEntry.source) ?? null,
      });
      if (shouldBlockMatchedMoveByMediaRouting(parsedEntry, state.move)) {
        terminalReviews.push(
          buildReviewEntry({
            parsedEntry,
            searchType: state.searchType,
            reviewReason: TMDB_REVIEW_REASON_MEDIA_ROUTING_UNKNOWN,
            confidence: state.move.matchConfidence ?? 0,
            matchedEntry: state.move,
          }),
        );
        state.move = null;
        continue;
      }
      matchedCount += 1;
      continue;
    }

    const searchResults = await searchTmdbByTaskPlan({
      queryPlan: state.queryPlan,
      scheduler,
    });
    let selection = selectTmdbCandidate({
      parsedEntry,
      searchType: state.searchType,
      searchResults: searchResults.results,
    });

    if (
      !selection.matched &&
      selection.reviewReason === TMDB_REVIEW_REASON_MISS &&
      searchResults.hadRejectedTask
    ) {
      selection = {
        ...selection,
        reviewReason: TMDB_REVIEW_REASON_QUERY_ERROR,
      };
    }

    if (
      !selection.matched &&
      [TMDB_REVIEW_REASON_MISS, TMDB_REVIEW_REASON_AMBIGUOUS].includes(selection.reviewReason) &&
      !selection.trustedExactTmdbOnly &&
      searchResults.results.length === 1 &&
      canAcceptSingleSearchResult({
        matchedQueryTitle: searchResults.queryTitle,
        selection: selection.ranked[0],
      })
    ) {
      selection = {
        matched: true,
        confidence: AUTO_ACCEPT_SCORE,
        match: selection.ranked[0].candidate,
      };
    }

    if (
      !selection.matched &&
      state.searchType === "movie" &&
      selection.reviewReason === TMDB_REVIEW_REASON_AMBIGUOUS &&
      !selection.trustedExactTmdbOnly
    ) {
      const trustedAliasMatch = findTrustedExactYearMovieAliasMatch({
        parsedEntry,
        ranked: selection.ranked,
      });

      if (trustedAliasMatch) {
        selection = {
          matched: true,
          confidence: trustedAliasMatch.score,
          match: trustedAliasMatch.candidate,
        };
      }
    }

    if (!selection.matched) {
      state.reviewReason = selection.reviewReason;
      state.confidence = selection.confidence;
      state.tmdbCandidates = serializeTmdbCandidates(selection.ranked);

      if (
        [TMDB_REVIEW_REASON_MISS, TMDB_REVIEW_REASON_AMBIGUOUS, TMDB_REVIEW_REASON_QUERY_ERROR].includes(
          selection.reviewReason,
        ) &&
        state.searchType === "tv"
      ) {
        tvFallbackStates.push(state);
      } else {
        terminalReviews.push(
          buildReviewEntry({
            parsedEntry,
            searchType: state.searchType,
            reviewReason: selection.reviewReason,
            confidence: selection.confidence,
            tmdbCandidates: state.tmdbCandidates,
          }),
        );
      }
      continue;
    }

    const canonicalTitles = await resolveCanonicalTitles({
      parsedEntry,
      searchType: state.searchType,
      match: selection.match,
      tmdbClient,
      detailsCache,
      titleTranslator,
    });
    state.move = buildMatchedMove({
      parsedEntry,
      selection,
      canonicalTitles,
      searchType: state.searchType,
      wrapperContext: wrapperContextBySource.get(parsedEntry.source) ?? null,
    });

    if (shouldBlockMatchedMoveByMediaRouting(parsedEntry, state.move)) {
      state.reviewReason = TMDB_REVIEW_REASON_MEDIA_ROUTING_UNKNOWN;
      state.confidence = selection.confidence;
      state.tmdbCandidates = serializeTmdbCandidates(selection.ranked);
      terminalReviews.push(
        buildReviewEntry({
          parsedEntry,
          searchType: state.searchType,
          reviewReason: TMDB_REVIEW_REASON_MEDIA_ROUTING_UNKNOWN,
          confidence: selection.confidence,
          matchedEntry: state.move,
          tmdbCandidates: state.tmdbCandidates,
        }),
      );
      state.move = null;
      continue;
    }

    matchedCount += 1;
  }

  const { fallbackMoves, fallbackReviews } = await applyLlmFallbackToTvReviews({
    allStates: planningStates,
    tvFallbackStates,
    tmdbClient,
    scheduler,
    taskRegistry,
    detailsCache,
    language,
    llmResolver,
    wrapperContextBySource,
  });

  matchedCount += fallbackMoves.length;

  const matchedMoves = planningStates
    .map((state) => state.move)
    .filter(Boolean)
    .concat(fallbackMoves);

  let reviews = [...terminalReviews, ...fallbackReviews];
  const mergeResult = mergeSeriesAliasGroups(matchedMoves);
  let moves = mergeResult.moves;
  reviews.push(...mergeResult.reviews);

  const sidecarMoves = [];
  const handledSidecarSources = new Set();
  const videoMoves = moves.filter((move) => move.role === "video");
  const moveBySource = new Map(videoMoves.map((move) => [move.source, move]));

  for (const [source, attachmentContext] of subtitleAttachmentContextBySource.entries()) {
    const parsedEntry = entryBySource.get(source);
    if (!parsedEntry) {
      continue;
    }

    const videoMove = moveBySource.get(attachmentContext.primaryVideoSource);
    if (!videoMove) {
      addDelete(
        buildDeleteEntry({
          source: parsedEntry.source,
          itemId: parsedEntry.fid ?? parsedEntry.cid ?? null,
          reason: "字幕无法稳定挂靠到目标视频，按口径直接删除",
          strategy: SUBTITLE_UNMATCHED_DELETE_STRATEGY,
        }),
      );
      handledSidecarSources.add(source);
      continue;
    }

    sidecarMoves.push(
      buildAttachedSidecarMove({
        parsedEntry,
        videoMove,
        reason: "wrapper-subtitle-follow-video",
        reasonTag: "wrapperSidecar=subtitle-follow-video",
      }),
    );
    handledSidecarSources.add(source);
  }

  for (const source of sidecarFileSourceSet) {
    if (handledSidecarSources.has(source)) {
      continue;
    }

    const parsedEntry = entryBySource.get(source);
    if (!parsedEntry) {
      continue;
    }

    if (!isSubtitleSidecar(parsedEntry)) {
      addDelete(
        buildDeleteEntry({
          source: parsedEntry.source,
          itemId: parsedEntry.fid ?? parsedEntry.cid ?? null,
          reason: "非字幕附件按口径直接删除",
          strategy: NONSUB_SIDECAR_DELETE_STRATEGY,
        }),
      );
      handledSidecarSources.add(source);
      continue;
    }

    const candidateVideoMoves = videoMoves.filter((videoMove) => {
      return (
        getSourceRoot(videoMove.source) === getSourceRoot(parsedEntry.source) &&
        canAttachSidecarToVideo(parsedEntry, videoMove)
      );
    });

    if (candidateVideoMoves.length === 1) {
      sidecarMoves.push(
        buildAttachedSidecarMove({
          parsedEntry,
          videoMove: candidateVideoMoves[0],
          reason: "sidecar-follow-video",
          reasonTag: "sidecar=follow-video",
        }),
      );
    } else {
      addDelete(
        buildDeleteEntry({
          source: parsedEntry.source,
          itemId: parsedEntry.fid ?? parsedEntry.cid ?? null,
          reason: "字幕无法稳定挂靠到目标视频，按口径直接删除",
          strategy: SUBTITLE_UNMATCHED_DELETE_STRATEGY,
        }),
      );
    }

    handledSidecarSources.add(source);
  }

  moves = moves.concat(sidecarMoves);

  const noopPruneResult = pruneNoopTmdbMoves({
    moves,
    sourceRootRelativePath,
  });
  moves = noopPruneResult.moves;
  reviews.push(...noopPruneResult.reviews);

  let collisionGroups = collectCollisionGroups(moves);
  if (collisionGroups.length > 0) {
    const collidedSourceSet = new Set(collisionGroups.flatMap((group) => group.items.map((item) => item.source)));
    const safeMoves = moves.filter((item) => !collidedSourceSet.has(item.source));
    const resolvedCollisionMoves = [];
    const collisionReviewItems = [];
    const unresolvedCollisionGroups = [];

    for (const group of collisionGroups) {
      const resolved = resolveSameIdentityCollisionGroup(group.items);
      if (resolved.resolved && resolved.winner) {
        resolvedCollisionMoves.push(resolved.winner);
        const unresolvedLosers = [];

        for (const loser of resolved.losers) {
          if (resolved.deleteLosers || canDeleteSameTmdbTargetDuplicate(loser)) {
            addDelete(
              buildDeleteEntry({
                source: loser.source,
                itemId: loser.cid ?? loser.fid ?? null,
                reason: "同 TMDB 身份且目标路径一致，保留最优来源后删除重复条目",
                strategy: DUPLICATE_SAME_TMDB_TARGET_DELETE_STRATEGY,
              }),
            );
            continue;
          }

          // delete 只开放给用户已拍板的局部重复项，避免把同 TMDB 的其他版本也批量删除。
          if (loser.isDir && loser.cid) {
            continue;
          }

          collisionReviewItems.push(loser);
          unresolvedLosers.push(loser);
        }

        if (unresolvedLosers.length > 0) {
          const unresolvedItems = [resolved.winner, ...unresolvedLosers];
          unresolvedCollisionGroups.push({
            ...group,
            sources: unresolvedItems.map((item) => item.source),
            items: unresolvedItems,
          });
        }
        continue;
      }

      collisionReviewItems.push(...group.items);
      unresolvedCollisionGroups.push(group);
    }

    const collisionReviews = collisionReviewItems.map((item) => {
        const parsedEntry = parseTmdbNormalizeEntry(item, { rootPath });
        return buildReviewEntry({
          parsedEntry,
          searchType: item.tmdbType ?? inferTmdbSearchType(parsedEntry),
          reviewReason: TMDB_REVIEW_REASON_COLLISION,
          confidence: item.matchConfidence ?? item.confidence,
          matchedEntry: item,
        });
    });

    moves = safeMoves.concat(resolvedCollisionMoves);
    reviews.push(...collisionReviews);
    collisionGroups = unresolvedCollisionGroups;
  }

  collisionGroups = [...noopPruneResult.collisionGroups, ...collisionGroups];

  for (const deleteEntry of buildWrapperDeletes({
    wrapperAnalyses,
    moves,
    reviews,
  })) {
    addDelete(deleteEntry);
  }

  for (const deleteEntry of buildMergedRootDeletes({
    mergeRootInfos: mergeResult.mergeRootInfos,
    moves,
    reviews,
  })) {
    addDelete(deleteEntry);
  }

  for (const deleteEntry of buildSidecarDirectoryDeletes({
    sidecarDirectoryInfos: [...sidecarDirectoryInfoBySource.values()],
    parsedEntries,
    moves,
    reviews,
    existingDeletes: [...deleteEntryMap.values()],
  })) {
    addDelete(deleteEntry);
  }

  let deletes = filterDeletesBlockedByNoopMoves({
    deletes: [...deleteEntryMap.values()],
    noopMoves: noopPruneResult.noopMoves,
  });
  const diagnosticReviewReasonCounts = reviews.reduce((acc, entry) => {
    const key = entry.reviewReason || "unknown";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  let zeroReviewSummary = {
    enabled: false,
    inputReviewCount: reviews.length,
    resolvedToMoveCount: 0,
    resolvedToDeleteCount: 0,
    quarantineCount: 0,
    llmClassifiedCount: 0,
    llmBatchClassifiedCount: 0,
    resourceBatchCount: 0,
    rescuedUnsafeDeleteCount: 0,
    mainEpisodeProtectedCount: protectedMainEpisodeSourceSet.size,
    fallbackBucketCounts: {},
  };

  if (options.zeroReviewFinalizer !== false) {
    const finalizerResult = await applyZeroReviewFinalizer({
      reviews,
      moves,
      llmResolver,
      parsedEntryBySource: entryBySource,
      directChildrenMap,
      resourceContextBySource,
      rootPath,
    });

    moves = finalizerResult.moves;
    reviews = finalizerResult.reviews;
    collisionGroups = finalizerResult.collisionGroups;
    zeroReviewSummary = finalizerResult.zeroReviewSummary;
    matchedCount += zeroReviewSummary.llmClassifiedCount;
  }

  const safetyResult = rescueUnsafeDeletesToQuarantine({
    deletes,
    moves,
    parsedEntryBySource: entryBySource,
    protectedMainEpisodeSourceSet,
  });
  moves = safetyResult.moves;
  deletes = safetyResult.deletes;
  zeroReviewSummary = {
    ...zeroReviewSummary,
    rescuedUnsafeDeleteCount: safetyResult.rescuedUnsafeDeleteCount,
    mainEpisodeProtectedCount: protectedMainEpisodeSourceSet.size,
  };

  const finalActionCounts = {
    move: moves.length,
    delete: deletes.length,
    review: reviews.length,
    quarantine: moves.filter((move) => move.matchSource === ZERO_REVIEW_FINALIZER_MATCH_SOURCE).length,
    llmFallbackMove: moves.filter((move) => move.matchSource === "llm-fallback").length,
    rescuedToQuarantine: safetyResult.rescuedUnsafeDeleteCount,
    protectedMainEpisode: protectedMainEpisodeSourceSet.size,
  };

  const summary = buildTmdbSummary({
    totalEntries: entries.length,
    moves,
    reviews,
    deletes,
    collisionGroups,
    matchedCount,
    queryStats: {
      ...taskRegistry.getStats(),
      ...scheduler.stats,
    },
    mergeStats: mergeResult.stats,
    diagnosticReviewReasonCounts,
    finalActionCounts,
    mediaRoutingSummary: mediaRoutingResult.summary,
  });

  return {
    generatedAt: new Date().toISOString(),
    mode: TMDB_NORMALIZE_MODE,
    executionRootPath,
    llmFallbackSummary: llmFallbackDiagnostics.snapshot(),
    mediaRoutingSummary: mediaRoutingResult.summary,
    zeroReviewSummary,
    summary,
    collisions: collisionGroups.map((group) => ({
      targetPath: group.targetPath,
      sources: group.sources,
    })),
    reviews,
    moves,
    deletes,
  };
}
