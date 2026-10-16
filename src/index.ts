import { base64Encode } from "./base64";
import { isUsableConnection, loadConnection, loadPassword, sanitize } from "./connections";
import { debug, describeConn, error as logError, warn } from "./debug";
import { t } from "./i18n";
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

const FAST_START_OPTIONS: ReadonlyArray<[string, string]> = [
  ["ytdl", "no"],
  ["cache-pause-initial", "no"],
  ["stream-lavf-o", "seekable=1,multiple_requests=1,reconnect=1,reconnect_streamed=1,reconnect_delay_max=2"],
  ["demuxer-lavf-o", "fflags=+ignidx"],
  ["demuxer-lavf-buffersize", "262144"],
  ["demuxer-lavf-probesize", "1048576"],
  ["demuxer-lavf-analyzeduration", "1"],
  ["demuxer-mkv-subtitle-preroll", "no"],
];

function preferFastStart(): void {
  // A seekable HTTP stream makes lavf walk every moof/mdat in a fragmented
  // MP4 before the first frame. That walk is the whole file, so a 100MB
  // open takes as long as the download and a 2GB open takes minutes.
  // fflags=+ignidx returns after the first fragment. seekable=1 still lets
  // a single mdat-then-moov file jump to the index with one Range request.
  // Do not set force-seekable; it forces that full walk.
  for (const [key, value] of FAST_START_OPTIONS) {
    try {
      mpv.set(key, value);
    } catch (error) {
      warn(`set ${key} failed: ${error}`);
    }
  }
}

function applyAuthHeaders(cfg: ConnectionConfig, secret: string): void {
  allowPlaylistStreams();
  preferFastStart();
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
  for (const [key, value] of FAST_START_OPTIONS) {
    try {
      mpv.set(key, value);
      mpv.set(`file-local-options/${key}`, value);
    } catch (error) {
      warn(`on_load option ${key} failed: ${error}`);
    }
  }
  try {
    mpv.set("file-local-options/force-media-title", title);
  } catch (error) {
    warn(`on_load force-media-title failed: ${error}`);
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

function appendEntries(items: PlaylistEntry[]): void {
  const m3u = writeM3U(items);
  debug("playlist m3u append", items.length, items[0] ? items[0].title : "");
  try {
    mpv.command("loadlist", [m3u, "append"]);
  } catch (error) {
    warn(`loadlist failed: ${error}`);
    for (const item of items) {
      try {
        playlist.add(item.url);
      } catch (addError) {
        logError(`playlist.add failed: ${addError}`);
      }
    }
  }
}

function nothingPlaying(): boolean {
  try {
    if (core.status.idle) return true;
  } catch (error) {
    warn(`idle check failed: ${error}`);
  }
  return playlist.count() === 0;
}

function loadEntries(items: PlaylistEntry[], mode: "play" | "append"): void {
  if (items.length === 0) return;
  const start = mode === "play" || nothingPlaying();
  debug("playlist m3u", mode, start ? "open" : "append", items.length, items[0].title);
  // Idle players reject playlist.add. core.open replaces the list and starts item 0,
  // which also closes IINA's welcome window.
  if (start) {
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
  core.osd(t("osdPlaying", { count: items.length }));
});

global.onMessage("add-to-playlist", (data: PlayRequest) => {
  const items = takePlayRequest(data);
  if (items.length === 0) return;
  debug("add-to-playlist", items.length, items[0].title);
  loadEntries(items, "append");
  debug("playlist count", playlist.count());
  core.osd(t("osdAdded", { count: items.length }));
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
if (isUsableConnection(connection)) {
  applyAuthHeaders(connection, currentPassword(connection));
} else {
  preferFastStart();
}
hello();
event.on("iina.window-loaded", hello);
event.on("iina.window-main.changed", (status) => {
  if (status) hello();
});
event.on("iina.window-did-close", () => {
  global.postMessage("player-gone", {});
});
