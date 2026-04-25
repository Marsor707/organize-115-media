const DEFAULT_QUERY_CONCURRENCY = 6;
const DEFAULT_QUERY_INTERVAL_MS = 120;
const DEFAULT_QUERY_MAX_RETRIES = 3;
const DEFAULT_QUERY_BACKOFF_BASE_MS = 250;
const DEFAULT_QUERY_TIMEOUT_MS = 10000;
const ERROR_MESSAGE_MAX_LENGTH = 120;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildSearchMethodName(searchType) {
  return searchType === "movie" ? "searchMovie" : "searchTv";
}

function withTimeout(promise, timeoutMs, task) {
  if (!timeoutMs || timeoutMs <= 0) {
    return promise;
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = new Error(
        `TMDB 查询超时: ${task.searchType}:${task.queryLanguage}:${task.queryTitle}`,
      );
      error.code = "TMDB_TIMEOUT";
      reject(error);
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function isStatusError(error, statusCode) {
  if (Number(error?.status) === statusCode || Number(error?.statusCode) === statusCode) {
    return true;
  }

  return new RegExp(`\\b${statusCode}\\b`, "u").test(String(error?.message ?? ""));
}

function isRetryableTmdbError(error) {
  if (isStatusError(error, 429)) {
    return true;
  }

  const message = String(error?.message ?? "").toLowerCase();
  const code = String(error?.code ?? "").toUpperCase();

  return (
    code === "TMDB_TIMEOUT" ||
    code === "ETIMEDOUT" ||
    code === "ECONNRESET" ||
    code === "ENOTFOUND" ||
    code === "EAI_AGAIN" ||
    message.includes("fetch failed") ||
    message.includes("network") ||
    message.includes("socket hang up") ||
    message.includes("timeout") ||
    error?.name === "AbortError"
  );
}

function incrementCount(target, key) {
  if (!key) {
    return;
  }

  target[key] = (target[key] ?? 0) + 1;
}

function normalizeErrorCode(error) {
  const code = String(error?.code ?? "")
    .trim()
    .toUpperCase();
  return code || null;
}

function normalizeErrorStatus(error) {
  const rawStatus = Number(error?.status ?? error?.statusCode);
  if (!Number.isFinite(rawStatus) || rawStatus <= 0) {
    return null;
  }

  return String(rawStatus);
}

function normalizeErrorMessage(error) {
  const code = normalizeErrorCode(error);
  const rawMessage = String(error?.message ?? "")
    .replace(/\s+/g, " ")
    .trim();

  if (!rawMessage) {
    return null;
  }

  const lowerMessage = rawMessage.toLowerCase();
  if (code === "TMDB_TIMEOUT" || rawMessage.startsWith("TMDB 查询超时:")) {
    return "TMDB 查询超时";
  }

  if (lowerMessage.includes("fetch failed")) {
    return "fetch failed";
  }

  if (lowerMessage.includes("socket hang up")) {
    return "socket hang up";
  }

  if (lowerMessage.includes("too many requests")) {
    return "Too Many Requests";
  }

  if (lowerMessage.includes("timeout")) {
    return "timeout";
  }

  if (rawMessage.length <= ERROR_MESSAGE_MAX_LENGTH) {
    return rawMessage;
  }

  return `${rawMessage.slice(0, ERROR_MESSAGE_MAX_LENGTH - 1)}…`;
}

function recordErrorStats(stats, error) {
  stats.errorAttemptCount += 1;
  incrementCount(stats.errorCodeCounts, normalizeErrorCode(error));
  incrementCount(stats.errorStatusCounts, normalizeErrorStatus(error));
  incrementCount(stats.errorMessageCounts, normalizeErrorMessage(error));
}

function createTaskQueue(concurrency) {
  const queue = [];
  let activeCount = 0;

  function pump() {
    while (activeCount < concurrency && queue.length > 0) {
      const current = queue.shift();
      activeCount += 1;
      current.onStart?.({
        task: current.metadata,
        activeCount,
        queueSize: queue.length,
        concurrency,
      });

      Promise.resolve()
        .then(current.task)
        .then(current.resolve, current.reject)
        .finally(() => {
          activeCount -= 1;
          current.onFinish?.({
            task: current.metadata,
            activeCount,
            queueSize: queue.length,
            concurrency,
          });
          pump();
        });
    }
  }

  return {
    enqueue(task, metadata = {}, hooks = {}) {
      return new Promise((resolve, reject) => {
        queue.push({
          task,
          resolve,
          reject,
          metadata,
          onStart: hooks.onStart,
          onFinish: hooks.onFinish,
        });
        hooks.onEnqueue?.({
          task: metadata,
          activeCount,
          queueSize: queue.length,
          concurrency,
        });
        pump();
      });
    },
    getActiveCount() {
      return activeCount;
    },
    getQueueSize() {
      return queue.length;
    },
  };
}

export function createTmdbSearchScheduler(options = {}) {
  const tmdbClient = options.tmdbClient;
  const concurrency = Math.max(1, Number(options.concurrency ?? DEFAULT_QUERY_CONCURRENCY));
  const minIntervalMs = Math.max(0, Number(options.minIntervalMs ?? DEFAULT_QUERY_INTERVAL_MS));
  const maxRetries = Math.max(0, Number(options.maxRetries ?? DEFAULT_QUERY_MAX_RETRIES));
  const backoffBaseMs = Math.max(50, Number(options.backoffBaseMs ?? DEFAULT_QUERY_BACKOFF_BASE_MS));
  const timeoutMs = Math.max(0, Number(options.timeoutMs ?? DEFAULT_QUERY_TIMEOUT_MS));
  const stats = options.stats ?? {
    requestCount: 0,
    retryCount: 0,
    status429Count: 0,
    errorAttemptCount: 0,
    errorCodeCounts: {},
    errorStatusCounts: {},
    errorMessageCounts: {},
  };
  const cache = options.cache ?? new Map();
  const onProgress = typeof options.onProgress === "function" ? options.onProgress : null;
  const queue = createTaskQueue(concurrency);
  const trackedTaskKeys = new Set();
  let nextAvailableAt = 0;
  const progressState = {
    totalTasks: 0,
    completedTasks: 0,
    lastTaskKey: null,
    recentQueryTitle: "",
    updatedAt: new Date().toISOString(),
  };

  if (!tmdbClient) {
    throw new Error("缺少 tmdbClient，无法创建查询调度器");
  }

  function updateRecentTask(task) {
    if (!task?.key) {
      return;
    }

    progressState.lastTaskKey = task.key;
    progressState.recentQueryTitle = task.queryTitle ?? progressState.recentQueryTitle;
  }

  function getProgressSnapshot(extra = {}) {
    return {
      totalTasks: progressState.totalTasks,
      completedTasks: progressState.completedTasks,
      pendingTasks: Math.max(0, progressState.totalTasks - progressState.completedTasks),
      queuedTasks: queue.getQueueSize(),
      runningTasks: queue.getActiveCount(),
      currentConcurrency: queue.getActiveCount(),
      requestCount: stats.requestCount,
      retryCount: stats.retryCount,
      status429Count: stats.status429Count,
      errorAttemptCount: stats.errorAttemptCount,
      errorCodeCounts: { ...(stats.errorCodeCounts ?? {}) },
      errorStatusCounts: { ...(stats.errorStatusCounts ?? {}) },
      errorMessageCounts: { ...(stats.errorMessageCounts ?? {}) },
      recentQueryTitle: progressState.recentQueryTitle,
      lastTaskKey: progressState.lastTaskKey,
      updatedAt: progressState.updatedAt,
      ...extra,
    };
  }

  function emitProgress(extra = {}) {
    if (!onProgress) {
      return;
    }

    progressState.updatedAt = new Date().toISOString();
    onProgress(getProgressSnapshot(extra));
  }

  function trackTask(task) {
    if (!task?.key || trackedTaskKeys.has(task.key)) {
      return;
    }

    trackedTaskKeys.add(task.key);
    progressState.totalTasks += 1;
    updateRecentTask(task);
  }

  async function reserveRequestSlot() {
    const now = Date.now();
    const waitMs = Math.max(0, nextAvailableAt - now);
    nextAvailableAt = Math.max(now, nextAvailableAt) + minIntervalMs;

    if (waitMs > 0) {
      await sleep(waitMs);
    }
  }

  async function executeTask(task) {
    const searchMethodName = buildSearchMethodName(task.searchType);
    const searchMethod = tmdbClient?.[searchMethodName];

    if (typeof searchMethod !== "function") {
      throw new Error(`tmdbClient 缺少方法 ${searchMethodName}`);
    }

    let attempt = 0;
    while (attempt <= maxRetries) {
      attempt += 1;

      try {
        await reserveRequestSlot();
        stats.requestCount += 1;
        updateRecentTask(task);
        emitProgress({
          event: "request",
        });
        const results = await withTimeout(
          searchMethod.call(tmdbClient, task.queryTitle, { language: task.queryLanguage }),
          timeoutMs,
          task,
        );
        return {
          status: "fulfilled",
          results: Array.isArray(results) ? results : [],
        };
      } catch (error) {
        recordErrorStats(stats, error);
        if (isStatusError(error, 429)) {
          stats.status429Count += 1;
          emitProgress({
            event: "status-429",
          });
        }

        const shouldRetry = attempt <= maxRetries && isRetryableTmdbError(error);
        if (!shouldRetry) {
          return {
            status: "rejected",
            error,
          };
        }

        stats.retryCount += 1;
        emitProgress({
          event: "retry",
        });
        await sleep(backoffBaseMs * 2 ** (attempt - 1));
      }
    }

    return {
      status: "rejected",
      error: new Error(`TMDB 查询失败: ${task.searchType}:${task.queryLanguage}:${task.queryTitle}`),
    };
  }

  function get(task) {
    if (!task?.key) {
      throw new Error("TMDB 查询任务缺少 key");
    }

    trackTask(task);
    if (!cache.has(task.key)) {
      cache.set(
        task.key,
        queue.enqueue(
          () => executeTask(task),
          task,
          {
            onStart: ({ task: currentTask }) => {
              updateRecentTask(currentTask);
              emitProgress({
                event: "started",
              });
            },
            onFinish: ({ task: currentTask }) => {
              progressState.completedTasks += 1;
              updateRecentTask(currentTask);
              emitProgress({
                event: "completed",
              });
            },
          },
        ),
      );
    }

    return cache.get(task.key);
  }

  async function prefetch(tasks) {
    const uniqueTasks = [];
    const seenKeys = new Set();

    for (const task of tasks) {
      if (!task?.key || seenKeys.has(task.key)) {
        continue;
      }

      seenKeys.add(task.key);
      uniqueTasks.push(task);
    }

    for (const task of uniqueTasks) {
      trackTask(task);
    }

    emitProgress({
      event: "prefetch-start",
    });
    await Promise.all(uniqueTasks.map((task) => get(task)));
    emitProgress({
      event: "prefetch-complete",
    });
  }

  return {
    get,
    prefetch,
    getProgressSnapshot,
    stats,
  };
}

export const TMDB_QUERY_SCHEDULER_DEFAULTS = Object.freeze({
  concurrency: DEFAULT_QUERY_CONCURRENCY,
  minIntervalMs: DEFAULT_QUERY_INTERVAL_MS,
  maxRetries: DEFAULT_QUERY_MAX_RETRIES,
  backoffBaseMs: DEFAULT_QUERY_BACKOFF_BASE_MS,
  timeoutMs: DEFAULT_QUERY_TIMEOUT_MS,
});
