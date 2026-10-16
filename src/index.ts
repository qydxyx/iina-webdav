import { base64Encode } from "./base64";
import { isUsableConnection, loadConnection, loadPassword, sanitize } from "./connections";
import { debug, describeConn, error as logError, warn } from "./debug";
import { authenticatedStreamUrl, stripPlaybackWrapper, titleFromUrl, urlBelongsTo } from "./paths";
import type { ConnectionConfig, PlaylistEntry, PlayRequest } from "./types";

const { core, event, file, global, mpv, playlist, utils } = iina;

let connection: ConnectionConfig | null = loadConnection();
let password = connection ? loadPassword(connection) : "";

function incomingKeys(value: unknown): string {
  if (!value || typeof value !== "object") return typeof value;
  return Object.keys(value as object).join(",");
}

function applyConnection(cfg: unknown, secret?: unknown): void {
  if (!cfg || typeof cfg !== "object") {
    debug("set-connection ignored", incomingKeys(cfg));
    return;
  }
  const next = sanitize(cfg as Partial<ConnectionConfig>);
  if (!isUsableConnection(next)) {
    debug("set-connection ignored empty host", incomingKeys(cfg));
    return;
  }
  connection = next;
  if (typeof secret === "string") password = secret;
  else if (typeof (cfg as { password?: unknown }).password === "string") {
    password = (cfg as { password: string }).password;
  } else if (!password) {
    password = loadPassword(next);
  }
  debug("set-connection", describeConn(connection));
  applyAuthHeaders(next, password);
}

function currentPassword(cfg: ConnectionConfig, explicit?: string): string {
  if (typeof explicit === "string" && explicit !== "") return explicit;
  if (password) return password;
  return loadPassword(cfg);
}

function allowPlaylistStreams(): void {
  try {
    mpv.set("load-unsafe-playlists", "yes");
  } catch (error) {
    warn(`set load-unsafe-playlists failed: ${error}`);
  }
}

function applyAuthHeaders(cfg: ConnectionConfig, secret: string): void {
  allowPlaylistStreams();
  try {
    mpv.set("ytdl", "no");
  } catch (error) {
    warn(`set ytdl=no failed: ${error}`);
  }
  if (cfg.insecure) {
    try {
      mpv.set("tls-verify", "no");
    } catch (error) {
      warn(`set tls-verify failed: ${error}`);
    }
  }
  if (!cfg.username) return;
  const token = base64Encode(`${cfg.username}:${secret}`);
  const header = `Authorization: Basic ${token}`;
  try {
    mpv.set("http-header-fields", header);
    mpv.set("file-local-options/http-header-fields", header);
  } catch (error) {
    warn(`set http-header-fields failed: ${error}`);
  }
}

function injectAuthForUrl(url: string): void {
  const cfg = isUsableConnection(connection) ? connection : loadConnection();
  if (!isUsableConnection(cfg) || !urlBelongsTo(url, cfg)) {
    debug("on_load skip", stripPlaybackWrapper(url), describeConn(cfg));
    return;
  }
  const secret = currentPassword(cfg);
  const publicUrl = stripPlaybackWrapper(url);
  const title = titleFromUrl(publicUrl);
  debug("on_load match", publicUrl, describeConn(cfg));
  try {
    mpv.set("ytdl", "no");
    mpv.set("file-local-options/ytdl", "no");
    mpv.set("file-local-options/force-seekable", "yes");
    mpv.set("file-local-options/force-media-title", title);
  } catch (error) {
    warn(`on_load options failed: ${error}`);
  }
  if (cfg.insecure) {
    mpv.set("file-local-options/tls-verify", "no");
  }
  if (cfg.username) {
    const token = base64Encode(`${cfg.username}:${secret}`);
    mpv.set("file-local-options/http-header-fields", `Authorization: Basic ${token}`);
    debug("on_load injected basic auth", cfg.username, secret ? "password=yes" : "password=empty");
  }
  const stream = authenticatedStreamUrl(publicUrl, cfg, secret);
  if (stream !== url) {
    mpv.set("stream-open-filename", stream);
    debug("on_load stream authed", title);
  }
}

function writeM3U(items: PlaylistEntry[]): string {
  const lines = ["#EXTM3U"];
  for (const item of items) {
    const title = String(item.title || titleFromUrl(item.url)).replace(/[\r\n]/g, " ");
    lines.push(`#EXTINF:-1,${title}`);
    lines.push(item.url);
  }
  const virt = `@tmp/webdav-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.m3u`;
  file.write(virt, `${lines.join("\n")}\n`);
  return utils.resolvePath(virt);
}

function entriesFrom(data: PlayRequest): PlaylistEntry[] {
  const items = (data && data.items) || [];
  return items.filter((item) => item && item.url).map((item) => ({
    url: item.url,
    title: item.title || titleFromUrl(item.url),
  }));
}

function takePlayRequest(data: PlayRequest): PlaylistEntry[] {
  if (data && data.connection) applyConnection(data.connection, data.password);
  const cfg = isUsableConnection(connection) ? connection : loadConnection();
  const secret = cfg ? currentPassword(cfg, data && data.password) : "";
  if (isUsableConnection(cfg)) applyAuthHeaders(cfg, secret);
  return entriesFrom(data);
}

function mpvPlaylistCount(): number {
  try {
    const n = mpv.getNumber("playlist-count");
    return typeof n === "number" && isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function playlistAdd(urls: string[]): boolean {
  if (urls.length === 0) return true;
  const api = playlist as unknown as { add: (url: string | string[], at?: number) => unknown };
  try {
    const result = api.add(urls.length === 1 ? urls[0] : urls, -1);
    debug("playlist.add", urls.length, "result", result);
    return result !== false;
  } catch (error) {
    warn(`playlist.add batch failed: ${error}`);
    let ok = true;
    for (const url of urls) {
      try {
        if (api.add(url, -1) === false) ok = false;
      } catch (itemError) {
        logError(`playlist.add failed: ${itemError}`);
        ok = false;
      }
    }
    return ok;
  }
}

function appendEntries(items: PlaylistEntry[]): void {
  const urls = items.map((item) => item.url);
  const iinaBefore = playlist.count();
  const mpvBefore = mpvPlaylistCount();
  const m3u = writeM3U(items);
  debug("playlist m3u", "append", items.length, items[0].title, "iina", iinaBefore, "mpv", mpvBefore);
  try {
    mpv.command("loadlist", [m3u, "append"]);
  } catch (error) {
    warn(`loadlist failed: ${error}`);
  }
  const mpvAfter = mpvPlaylistCount();
  debug("mpv playlist after loadlist", mpvAfter);

  // loadlist updates mpv (and M3U titles) but IINA's sidebar keeps a snapshot
  // until playlist.add runs getPlaylist().
  const synced = playlistAdd([urls[0]]);
  const iinaAfter = playlist.count();
  debug("playlist after sync", iinaAfter, "synced", synced);

  if (mpvAfter >= mpvBefore + items.length && iinaAfter >= mpvBefore + items.length + 1) {
    try {
      playlist.remove(iinaAfter - 1);
    } catch (error) {
      warn(`remove duplicate failed: ${error}`);
    }
  } else if (iinaAfter <= iinaBefore) {
    playlistAdd(urls);
  } else if (iinaAfter < iinaBefore + items.length) {
    playlistAdd(urls.slice(iinaAfter - iinaBefore));
  }
}

function loadEntries(items: PlaylistEntry[], mode: "play" | "append"): void {
  if (items.length === 0) return;
  debug("playlist m3u", mode, items.length, items[0].title);
  if (mode === "play" || playlist.count() === 0) {
    core.open(writeM3U(items));
    return;
  }
  appendEntries(items);
}

global.onMessage("set-connection", (data: ConnectionConfig & { password?: string }) => {
  applyConnection(data, data && data.password);
});

global.onMessage("play", (data: PlayRequest) => {
  const items = takePlayRequest(data);
  debug("play", items.length, items[0] ? items[0].title : "");
  if (items.length === 0) return;
  loadEntries(items, "play");
  core.osd(`WebDAV：播放 ${items.length} 项`);
});

global.onMessage("add-to-playlist", (data: PlayRequest) => {
  const items = takePlayRequest(data);
  if (items.length === 0) return;
  debug("add-to-playlist", items.length, items[0].title);
  loadEntries(items, "append");
  debug("playlist count", playlist.count());
  core.osd(`WebDAV：已加入 ${items.length} 项`);
});

// Sync hook: do not take or call `next`. IINA treats a 1-arg callback as async
// and also continues on return, which raises "invalid hook API usage".
mpv.addHook("on_load", 50, () => {
  try {
    injectAuthForUrl(mpv.getString("stream-open-filename") || "");
  } catch (error) {
    logError(`auth hook failed: ${error}`);
  }
});

function hello(): void {
  debug("player hello", describeConn(isUsableConnection(connection) ? connection : loadConnection()));
  global.postMessage("player-hello", { at: Date.now() });
}

debug("main entry loaded", describeConn(connection));
allowPlaylistStreams();
hello();
event.on("iina.window-loaded", hello);
event.on("iina.window-main.changed", (status) => {
  if (status) hello();
});
event.on("iina.window-did-close", () => {
  global.postMessage("player-gone", {});
});
