import {
  isUsableConnection,
  loadConnection,
  loadPassword,
  saveConnection,
  savePassword,
  sanitize,
  snapshotConnection,
} from "./connections";
import { debug, describeConn, error as logError, warn } from "./debug";
import { allStrings, pluginLang, t } from "./i18n";
import { formatModified, formatSize, isMediaFile } from "./media";
import { basename, collectionUrl, mediaUrl, normalizePath, originOf, parentPath, parsePastedLocation, titleFromUrl } from "./paths";
import { collectMedia, listDirectory, WebDavError } from "./webdav";
import type { ConnectionConfig, DavItem, PlaylistEntry } from "./types";

const { global, menu, standaloneWindow } = iina;

interface PlayerHello {
  at: number;
}

const players = new Map<string, number>();
let active: ConnectionConfig | null = null;
let activePassword = "";
let currentPath = "/";

function send(name: string, data?: unknown): void {
  standaloneWindow.postMessage(name, data);
}

function playerLabel(value: unknown): string | null {
  if (value == null || value === "") return null;
  return String(value);
}

function rememberPlayer(id: string): void {
  players.set(id, Date.now());
}

function pickPlayer(): string | null {
  let best: string | null = null;
  let latest = 0;
  players.forEach((at, id) => {
    if (at >= latest) {
      latest = at;
      best = id;
    }
  });
  return best;
}

function waitForNewPlayer(since: number, timeoutMs = 8000): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      let found: string | null = null;
      players.forEach((at, id) => {
        if (at >= since - 50) found = id;
      });
      if (found) {
        clearInterval(timer);
        resolve(found);
      } else if (Date.now() - since > timeoutMs) {
        clearInterval(timer);
        reject(new Error(t("playerTimeout")));
      }
    }, 80);
  });
}

function postToPlayer(target: string, name: string, data: unknown): void {
  // IINA routes string targets by PlayerCore.label ("0", "1", …).
  // Numeric IDs only reach windows created by createPlayerInstance.
  global.postMessage(target, name, data);
}

function connectionMessage(cfg: ConnectionConfig): ConnectionConfig & { password: string } {
  return { ...snapshotConnection(cfg), password: activePassword || loadPassword(cfg) };
}

function toEntries(urls: string[]): PlaylistEntry[] {
  return urls.map((url) => ({ url, title: titleFromUrl(url) }));
}

function playMessage(items: PlaylistEntry[], mode: "play" | "append", cfg: ConnectionConfig | null) {
  return {
    items,
    mode,
    connection: cfg ? snapshotConnection(cfg) : undefined,
    password: cfg ? activePassword || loadPassword(cfg) : "",
  };
}

function broadcastConnection(cfg: ConnectionConfig): void {
  if (!isUsableConnection(cfg)) return;
  // null (all players) is the path that actually delivers a usable config.
  global.postMessage(null, "set-connection", connectionMessage(cfg));
}

async function dispatchPlay(items: PlaylistEntry[], mode: "play" | "append"): Promise<void> {
  if (items.length === 0) throw new Error(t("noPlayableMedia"));

  const cfg = isUsableConnection(active) ? active : loadConnection();
  if (isUsableConnection(cfg)) broadcastConnection(cfg);

  let target = pickPlayer();
  debug("dispatchPlay", mode, items.length, items[0].title, "player", target);
  if (target == null) {
    const started = Date.now();
    const created = global.createPlayerInstance({
      enablePlugins: true,
      disableWindowAnimation: false,
    });
    debug("created player", created);
    try {
      target = await waitForNewPlayer(started);
      debug("player ready", target);
    } catch (error) {
      warn(String(error));
      target = pickPlayer();
    }
    if (isUsableConnection(cfg)) {
      broadcastConnection(cfg);
      if (target) postToPlayer(target, "set-connection", connectionMessage(cfg));
      global.postMessage(created, "set-connection", connectionMessage(cfg));
    }
    const payload = playMessage(items, "play", cfg);
    if (target) postToPlayer(target, "play", payload);
    global.postMessage(created, "play", payload);
    return;
  }

  postToPlayer(target, mode === "play" ? "play" : "add-to-playlist", playMessage(items, mode, cfg));
}

function serializeItems(items: DavItem[]) {
  return items.map((item) => ({
    path: item.path,
    name: item.name,
    isDir: item.isDir,
    isMedia: !item.isDir && isMediaFile(item.name),
    size: formatSize(item.size),
    modified: formatModified(item.modified),
  }));
}

async function browse(path: string): Promise<void> {
  if (!active) throw new Error(t("notConnected"));
  const listed = normalizePath(path);
  send("status", { text: t("listing"), error: false, loading: true });
  const items = await listDirectory(active, listed, activePassword);
  currentPath = listed;
  send("listing", {
    path: listed,
    parent: listed === "/" ? null : parentPath(listed),
    origin: originOf(active),
    items: serializeItems(items),
  });
  send("status", {
    text: t("itemCount", { count: items.length, where: `${originOf(active)}${listed === "/" ? "/" : listed}` }),
    error: false,
    loading: false,
  });
}

function applyForm(data: Partial<ConnectionConfig> & { password?: string }): ConnectionConfig {
  const pasted = parsePastedLocation(data.host || "");
  const merged = sanitize({
    ...active,
    ...data,
    ...(pasted || {}),
  });
  if (!merged.host) throw new Error(t("hostRequired"));
  return merged;
}

function errorText(error: unknown): string {
  return error instanceof WebDavError || error instanceof Error ? error.message : String(error);
}

function attachWindowHandlers(): void {
  standaloneWindow.onMessage("ready", () => {
    const saved = loadConnection();
    debug("window ready", describeConn(saved));
    send("init", {
      connection: saved,
      hasPassword: saved ? Boolean(loadPassword(saved)) : false,
      lang: pluginLang(),
      strings: allStrings(),
    });
  });

  standaloneWindow.onMessage("debug-log", (data: { args?: unknown[] }) => {
    debug("ui", ...((data && data.args) || []));
  });

  standaloneWindow.onMessage("connect", async (data: Partial<ConnectionConfig> & { password?: string }) => {
    try {
      const cfg = applyForm(data);
      const password = data.password != null && data.password !== "" ? data.password : loadPassword(cfg);
      debug("connect", describeConn(cfg), password ? "password=yes" : "password=no");
      send("status", { text: t("connecting"), error: false, loading: true });
      const listed = normalizePath(cfg.path);
      const items = await listDirectory(cfg, listed, password);
      debug("listed ok", listed, items.length);
      active = cfg;
      activePassword = password;
      currentPath = listed;
      try {
        saveConnection(cfg);
        debug("connection saved");
      } catch (error) {
        warn("saveConnection", errorText(error));
      }
      if (cfg.username) {
        try {
          savePassword(cfg, password);
          debug("password saved");
        } catch (error) {
          warn("savePassword", errorText(error));
        }
      }
      broadcastConnection(cfg);
      send("connected", { connection: cfg, url: collectionUrl(cfg, listed) });
      send("listing", {
        path: listed,
        parent: listed === "/" ? null : parentPath(listed),
        origin: originOf(cfg),
        items: serializeItems(items),
      });
      send("status", {
        text: t("itemCount", { count: items.length, where: `${originOf(cfg)}${listed === "/" ? "/" : listed}` }),
        error: false,
        loading: false,
      });
      debug("connected", describeConn(cfg), items.length);
    } catch (error) {
      const message = errorText(error);
      logError("connect failed", message);
      send("status", { text: message, error: true, loading: false });
    }
  });

  standaloneWindow.onMessage("list", async (data: { path?: string }) => {
    try {
      debug("list", data && data.path ? data.path : currentPath);
      await browse(data && data.path ? data.path : currentPath);
    } catch (error) {
      logError("list failed", errorText(error));
      send("status", { text: errorText(error), error: true, loading: false });
    }
  });

  standaloneWindow.onMessage("play-item", async (data: { path: string; isDir: boolean }) => {
    try {
      if (!active) throw new Error(t("notConnected"));
      if (data.isDir) {
        await browse(data.path);
        return;
      }
      debug("play-item", data.path);
      await dispatchPlay([{ url: mediaUrl(active, data.path), title: basename(data.path) }], "play");
      send("status", { text: t("playbackStarted"), error: false, loading: false });
    } catch (error) {
      logError("play-item failed", errorText(error));
      send("status", { text: errorText(error), error: true, loading: false });
    }
  });

  standaloneWindow.onMessage("add-items", async (data: { paths: string[] }) => {
    try {
      if (!active) throw new Error(t("notConnected"));
      const paths = data.paths || [];
      if (paths.length === 0) {
        send("status", { text: t("noPlayableMedia"), error: true, loading: false });
        return;
      }
      const items = paths.map((path) => ({
        url: mediaUrl(active as ConnectionConfig, path),
        title: basename(path),
      }));
      debug("add-items", items.length);
      await dispatchPlay(items, "append");
      send("status", {
        text: t("addedItems", { count: items.length, title: items[0] ? items[0].title : "" }),
        error: false,
        loading: false,
      });
    } catch (error) {
      logError("add-items failed", errorText(error));
      send("status", { text: errorText(error), error: true, loading: false });
    }
  });

  standaloneWindow.onMessage("add-folder", async (data: { path?: string; recursive?: boolean }) => {
    try {
      if (!active) throw new Error(t("notConnected"));
      const target = normalizePath(data.path || currentPath);
      send("status", {
        text: data.recursive ? t("scanningSubfolders") : t("collectingMedia"),
        error: false,
        loading: true,
      });
      debug("add-folder", target, data.recursive ? "recursive" : "flat");
      const { urls, truncated } = await collectMedia(active, target, activePassword, Boolean(data.recursive));
      if (urls.length === 0) {
        send("status", { text: t("noPlayableMedia"), error: true, loading: false });
        return;
      }
      const entries = toEntries(urls);
      await dispatchPlay(entries, "append");
      send("status", {
        text: t(truncated ? "addedItemsTruncated" : "addedItems", {
          count: entries.length,
          title: entries[0] ? entries[0].title : "",
        }),
        error: false,
        loading: false,
      });
    } catch (error) {
      logError("add-folder failed", errorText(error));
      send("status", { text: errorText(error), error: true, loading: false });
    }
  });
}

let handlersAttached = false;

function openWindow(): void {
  debug("open window");
  standaloneWindow.loadFile("ui/window.html");
  if (!handlersAttached) {
    attachWindowHandlers();
    handlersAttached = true;
  }
  standaloneWindow.setProperty({ title: "WebDAV", resizable: true });
  standaloneWindow.setFrame(840, 620);
  standaloneWindow.open();
}

menu.addItem(
  menu.item(
    t("menuBrowser"),
    () => {
      openWindow();
    },
    { keyBinding: "Opt+Meta+D" },
  ),
);

global.onMessage("player-hello", (_data: PlayerHello, playerID?: string) => {
  const label = playerLabel(playerID);
  debug("player-hello", playerID, "label", label);
  if (label) rememberPlayer(label);
  if (isUsableConnection(active)) broadcastConnection(active);
});

global.onMessage("player-gone", (_data: unknown, playerID?: string) => {
  const label = playerLabel(playerID);
  debug("player-gone", playerID);
  if (label) players.delete(label);
});

debug("global entry loaded", describeConn(loadConnection()));
