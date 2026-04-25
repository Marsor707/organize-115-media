function normalizePath(value) {
  return String(value ?? "").replace(/\\/g, "/");
}

function stripTrailingSlashes(value) {
  const normalized = normalizePath(value);
  if (normalized === "/") {
    return normalized;
  }

  return normalized.replace(/\/+$/u, "");
}

function basename(value, suffix = "") {
  const normalized = stripTrailingSlashes(value);
  if (!normalized || normalized === "/") {
    return normalized;
  }

  const index = normalized.lastIndexOf("/");
  const base = index < 0 ? normalized : normalized.slice(index + 1);
  const normalizedSuffix = String(suffix ?? "");

  if (normalizedSuffix && base.endsWith(normalizedSuffix)) {
    return base.slice(0, -normalizedSuffix.length);
  }

  return base;
}

function dirname(value) {
  const normalized = stripTrailingSlashes(value);
  if (!normalized || normalized === ".") {
    return ".";
  }

  const index = normalized.lastIndexOf("/");
  if (index < 0) {
    return ".";
  }

  if (index === 0) {
    return "/";
  }

  return normalized.slice(0, index);
}

function extname(value) {
  const base = basename(value);
  const index = base.lastIndexOf(".");

  if (index <= 0) {
    return "";
  }

  return base.slice(index);
}

function join(...parts) {
  return parts
    .map((part) => normalizePath(part).replace(/^\/+|\/+$/gu, ""))
    .filter(Boolean)
    .join("/");
}

function parse(value) {
  const dir = dirname(value);
  const base = basename(value);
  const ext = extname(base);
  const name = ext ? base.slice(0, -ext.length) : base;

  return {
    root: normalizePath(value).startsWith("/") ? "/" : "",
    dir: dir === "." ? "" : dir,
    base,
    ext,
    name,
  };
}

export const path = Object.freeze({
  posix: Object.freeze({
    basename,
    dirname,
    extname,
    join,
    parse,
  }),
});

export const posixPath = path.posix;
