import type { ConnectionConfig, Scheme } from "./types";

export function effectivePort(cfg: Pick<ConnectionConfig, "scheme" | "port">): string {
  const trimmed = (cfg.port || "").trim();
  if (trimmed) return trimmed;
  return cfg.scheme === "https" ? "443" : "80";
}

export function originOf(cfg: Pick<ConnectionConfig, "scheme" | "host" | "port">): string {
  return `${cfg.scheme}://${cfg.host}:${effectivePort(cfg)}`;
}

export function normalizePath(input: string): string {
  let path = (input || "/").trim() || "/";
  if (!path.startsWith("/")) path = `/${path}`;
  path = path.replace(/\/{2,}/g, "/");
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  return path || "/";
}

export function encodePath(path: string): string {
  const normalized = normalizePath(path);
  return normalized
    .split("/")
    .map((segment) => (segment ? encodeURIComponent(segment) : ""))
    .join("/");
}

export function joinPath(base: string, name: string): string {
  const parent = normalizePath(base);
  const child = name.replace(/^\/+/, "");
  return parent === "/" ? `/${child}` : `${parent}/${child}`;
}

export function parentPath(path: string): string {
  const normalized = normalizePath(path);
  if (normalized === "/") return "/";
  const idx = normalized.lastIndexOf("/");
  return idx <= 0 ? "/" : normalized.slice(0, idx);
}

export function basename(path: string): string {
  const normalized = normalizePath(path);
  if (normalized === "/") return "/";
  return decodeURIComponent(normalized.slice(normalized.lastIndexOf("/") + 1));
}

export function hrefToPath(href: string, origin: string): string {
  let value = (href || "").trim();
  if (!value) return "/";
  value = value.split("?")[0].split("#")[0];
  if (/^https?:\/\//i.test(value)) {
    try {
      const url = parseUrl(value);
      value = url.pathname || "/";
    } catch {
      const idx = value.indexOf("/", value.indexOf("://") + 3);
      value = idx >= 0 ? value.slice(idx) : "/";
    }
  }
  try {
    value = decodeURIComponent(value);
  } catch {
    // keep encoded path if it is malformed
  }
  void origin;
  return normalizePath(value);
}

export function mediaUrl(cfg: ConnectionConfig, path: string): string {
  return `${originOf(cfg)}${encodePath(path)}`;
}

export function collectionUrl(cfg: ConnectionConfig, path: string): string {
  const encoded = encodePath(path);
  return `${originOf(cfg)}${encoded === "/" ? "/" : `${encoded}/`}`;
}

const FFMPEG_PREFIX = "ffmpeg://";

/** Drop ffmpeg:// and user:pass@ so matching and titles use the public URL. */
export function stripPlaybackWrapper(url: string): string {
  let value = url || "";
  if (value.toLowerCase().startsWith(FFMPEG_PREFIX)) value = value.slice(FFMPEG_PREFIX.length);
  return value.replace(/^(https?:\/\/)[^/?#]*@/i, "$1");
}

export function titleFromUrl(url: string): string {
  const clean = stripPlaybackWrapper(url).split("?")[0].split("#")[0];
  const parts = clean.split("/").filter(Boolean);
  const last = parts[parts.length - 1] || clean;
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

/**
 * Put Basic auth in the URL so the first HTTP request succeeds.
 * Keep the http(s) scheme: mpv refuses ffmpeg:// when the item came from an M3U.
 */
export function authenticatedStreamUrl(url: string, cfg: ConnectionConfig, secret: string): string {
  const raw = stripPlaybackWrapper(url);
  if (!/^https?:\/\//i.test(raw)) return raw;
  if (!cfg.username) return raw;
  const userinfo = `${encodeURIComponent(cfg.username)}:${encodeURIComponent(secret || "")}`;
  return raw.replace(/^(https?:\/\/)/i, `$1${userinfo}@`);
}

export function urlBelongsTo(url: string, cfg: ConnectionConfig): boolean {
  const origin = originOf(cfg).toLowerCase();
  const alt = `${cfg.scheme}://${cfg.host}`.toLowerCase();
  const lower = stripPlaybackWrapper(url).toLowerCase();
  return lower.startsWith(origin) || lower.startsWith(`${alt}/`) || lower === alt;
}

export function parsePastedLocation(raw: string): Partial<ConnectionConfig> | null {
  const text = raw.trim();
  if (!/^https?:\/\//i.test(text)) return null;
  try {
    const url = parseUrl(text);
    const scheme = (url.protocol.replace(":", "") || "https") as Scheme;
    return {
      scheme: scheme === "http" ? "http" : "https",
      host: url.hostname,
      port: url.port || "",
      path: normalizePath(url.pathname || "/"),
    };
  } catch {
    return null;
  }
}

function parseUrl(value: string): { protocol: string; hostname: string; port: string; pathname: string } {
  const match = value.match(/^(https?):\/\/([^/?#]+)(\/[^?#]*)?/i);
  if (!match) throw new Error("invalid url");
  const hostport = match[2];
  let hostname = hostport;
  let port = "";
  if (hostport.startsWith("[")) {
    const end = hostport.indexOf("]");
    hostname = hostport.slice(0, end + 1);
    if (hostport[end + 1] === ":") port = hostport.slice(end + 2);
  } else if (hostport.includes(":")) {
    const idx = hostport.lastIndexOf(":");
    hostname = hostport.slice(0, idx);
    port = hostport.slice(idx + 1);
  }
  return {
    protocol: `${match[1].toLowerCase()}:`,
    hostname,
    port,
    pathname: match[3] || "/",
  };
}
