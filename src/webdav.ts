import { base64Encode } from "./base64";
import { debug, error as logError, warn } from "./debug";
import { t } from "./i18n";
import { MAX_DIR_DEPTH, MAX_PLAYLIST_ITEMS, isMediaFile } from "./media";
import { collectionUrl, mediaUrl, normalizePath } from "./paths";
import { parsePropfindXml } from "./parse-propfind";
import type { ConnectionConfig, DavItem } from "./types";

const { file, utils } = iina;

const PROPFIND_BODY = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:displayname/>
    <d:getcontentlength/>
    <d:getlastmodified/>
    <d:resourcetype/>
  </d:prop>
</d:propfind>
`;

export class WebDavError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.status = status;
    this.name = "WebDavError";
  }
}

function curlArgs(cfg: ConnectionConfig, password: string, url: string, bodyPath: string): string[] {
  const args = [
    "-sS",
    "-g",
    "--max-time",
    "30",
    "-X",
    "PROPFIND",
    "-H",
    "Depth: 1",
    "-H",
    "Content-Type: application/xml; charset=utf-8",
    "--data-binary",
    `@${bodyPath}`,
    "-w",
    "\n__CURL_HTTP_CODE__:%{http_code}",
    url,
  ];
  if (cfg.insecure) args.unshift("-k");
  if (cfg.username) {
    args.splice(args.length - 1, 0, "-H", `Authorization: Basic ${base64Encode(`${cfg.username}:${password}`)}`);
  }
  return args;
}

function splitCurlOutput(stdout: string): { body: string; status: number } {
  const marker = "\n__CURL_HTTP_CODE__:";
  const idx = stdout.lastIndexOf(marker);
  if (idx < 0) {
    const fallback = stdout.match(/__CURL_HTTP_CODE__:(\d+)/);
    return { body: stdout, status: fallback ? parseInt(fallback[1], 10) : 0 };
  }
  const body = stdout.slice(0, idx);
  const status = parseInt(stdout.slice(idx + marker.length).trim(), 10);
  return { body, status: isNaN(status) ? 0 : status };
}

function describeFailure(status: number, stderr: string): string {
  if (status === 401) return t("err401");
  if (status === 403) return t("err403");
  if (status === 404) return t("err404");
  if (status === 405) return t("err405");
  if (/SSL|certificate|self signed/i.test(stderr)) return t("errCert");
  if (/Could not resolve host/i.test(stderr)) return t("errHost");
  if (/Connection refused|timed out|Timeout/i.test(stderr)) return t("errConnect");
  if (status) return t("errHttp", { status });
  return stderr.trim() || t("errFailed");
}

export async function listDirectory(
  cfg: ConnectionConfig,
  path: string,
  password: string,
): Promise<DavItem[]> {
  const listedPath = normalizePath(path);
  const url = collectionUrl(cfg, listedPath);
  const bodyFile = "@tmp/propfind.xml";
  file.write(bodyFile, PROPFIND_BODY);
  const bodyPath = utils.resolvePath(bodyFile);

  debug("PROPFIND", url, cfg.insecure ? "insecure" : "tls", cfg.username ? "basic" : "anon");
  const result = await utils.exec("/usr/bin/curl", curlArgs(cfg, password, url, bodyPath));
  if (result.status !== 0 && !result.stdout) {
    logError("curl failed", result.status, result.stderr);
    throw new WebDavError(describeFailure(0, result.stderr || t("curlExit", { status: result.status })));
  }

  const { body, status } = splitCurlOutput(result.stdout || "");
  debug("PROPFIND result", { url, curl: result.status, http: status, bytes: (body || "").length });
  if (status !== 207 && status !== 200) {
    warn("PROPFIND http", status, (result.stderr || body || "").slice(0, 300));
    throw new WebDavError(describeFailure(status, result.stderr || body), status);
  }

  const items = parsePropfindXml(body, collectionUrl(cfg, "/").replace(/\/$/, ""), listedPath);
  debug("listed", listedPath, items.length, "items");
  return items;
}

export async function collectMedia(
  cfg: ConnectionConfig,
  path: string,
  password: string,
  recursive: boolean,
): Promise<{ urls: string[]; truncated: boolean }> {
  const urls: string[] = [];
  let truncated = false;

  async function walk(dir: string, depth: number): Promise<void> {
    if (urls.length >= MAX_PLAYLIST_ITEMS) {
      truncated = true;
      return;
    }
    const items = await listDirectory(cfg, dir, password);
    const files = items.filter((item) => !item.isDir && isMediaFile(item.name));
    const dirs = items.filter((item) => item.isDir);

    files.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: "base" }));
    for (const fileItem of files) {
      if (urls.length >= MAX_PLAYLIST_ITEMS) {
        truncated = true;
        return;
      }
      urls.push(mediaUrl(cfg, fileItem.path));
    }

    if (!recursive || depth >= MAX_DIR_DEPTH) return;
    dirs.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: "base" }));
    for (const dirItem of dirs) {
      if (urls.length >= MAX_PLAYLIST_ITEMS) {
        truncated = true;
        return;
      }
      await walk(dirItem.path, depth + 1);
    }
  }

  debug("collectMedia start", path, recursive ? "recursive" : "flat");
  await walk(normalizePath(path), 1);
  debug("collectMedia done", urls.length, truncated ? "truncated" : "ok");
  return { urls, truncated };
}

export { mediaUrl };
