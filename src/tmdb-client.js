const DEFAULT_TMDB_LANGUAGE = "zh-CN";
const DEFAULT_TMDB_BASE_URL = "https://api.themoviedb.org/3";

function ensureFetch(fetchImpl) {
  if (typeof fetchImpl !== "function") {
    throw new Error("当前 Node 环境缺少 fetch，无法调用 TMDB");
  }

  return fetchImpl;
}

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || DEFAULT_TMDB_BASE_URL).replace(/\/+$/u, "");
}

export function createTmdbClient(options = {}) {
  const env = typeof process === "undefined" ? {} : process.env ?? {};
  const apiKey = options.apiKey ?? env.TMDB_API_KEY ?? "";
  const fetchImpl = ensureFetch(options.fetchImpl ?? globalThis.fetch);
  const baseUrl = normalizeBaseUrl(options.baseUrl ?? env.TMDB_API_BASE_URL);
  const language = options.language ?? DEFAULT_TMDB_LANGUAGE;

  if (!apiKey) {
    throw new Error("缺少 TMDB_API_KEY，无法执行 tmdb-normalize");
  }

  async function requestJson(pathname, query = {}) {
    const url = new URL(`${baseUrl}${pathname}`);
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("language", language);

    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === "") {
        continue;
      }
      url.searchParams.set(key, String(value));
    }

    const response = await fetchImpl(url, {
      headers: {
        accept: "application/json",
      },
    });
    const text = await response.text();

    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error(`TMDB 返回了非 JSON 响应: ${url.pathname}`);
    }

    if (!response.ok) {
      const message = payload?.status_message ?? payload?.message ?? text.slice(0, 200);
      throw new Error(`TMDB 请求失败: ${response.status} ${url.pathname} ${message}`);
    }

    return payload;
  }

  async function searchMovie(query, extra = {}) {
    const payload = await requestJson("/search/movie", {
      query,
      include_adult: false,
      ...extra,
    });
    return payload.results ?? [];
  }

  async function searchTv(query, extra = {}) {
    const payload = await requestJson("/search/tv", {
      query,
      include_adult: false,
      ...extra,
    });
    return payload.results ?? [];
  }

  async function getMovieDetails(tmdbId) {
    return requestJson(`/movie/${tmdbId}`, {
      append_to_response: "alternative_titles,translations",
    });
  }

  async function getTvDetails(tmdbId) {
    return requestJson(`/tv/${tmdbId}`, {
      append_to_response: "alternative_titles,translations",
    });
  }

  return {
    searchMovie,
    searchTv,
    getMovieDetails,
    getTvDetails,
  };
}
