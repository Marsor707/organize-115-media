import {
  TMDB_NORMALIZE_MODE,
  buildPlan,
  normalizePlanMode,
} from "./organize115.js";
import { buildTmdbNormalizePlan } from "./tmdb-normalize.js";

export async function buildPlanAsync(entries, options = {}) {
  const mode = normalizePlanMode(options.mode);

  if (mode === TMDB_NORMALIZE_MODE) {
    return buildTmdbNormalizePlan(entries, options);
  }

  return buildPlan(entries, options);
}
