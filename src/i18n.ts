export type MessageKey = keyof typeof EN;

export const EN = {
  menuBrowser: "WebDAV Browser",
  hostRequired: "Enter a host.",
  notConnected: "Not connected.",
  notConnectedStatus: "Not connected",
  connecting: "Connecting…",
  listing: "Listing folder…",
  itemCount: "{count} items · {where}",
  playbackStarted: "Playback started",
  addedItems: "Added {count} items to the playlist",
  addedItemsTruncated: "Added {count} items to the playlist (stopped at the 2000-item limit)",
  scanningSubfolders: "Scanning subfolders…",
  collectingMedia: "Collecting media…",
  noPlayableMedia: "No playable media at this location.",
  playerTimeout: "Timed out waiting for a player window.",
  osdPlaying: "WebDAV: playing {count} items",
  osdAdded: "WebDAV: added {count} items",
  err401: "Authentication failed. Check the username and password.",
  err403: "The server refused access to this path.",
  err404: "The path does not exist.",
  err405: "The server does not support WebDAV PROPFIND.",
  errCert:
    "Certificate verification failed. For a self-signed certificate, enable Allow self-signed certificates.",
  errHost: "Could not resolve the host name.",
  errConnect: "Could not reach the server. Check the address and port.",
  errHttp: "The server returned HTTP {status}.",
  errFailed: "Connection failed.",
  curlExit: "curl exit code {status}",
  scheme: "Scheme",
  host: "Host",
  hostPlaceholder: "nas.local or full URL",
  port: "Port",
  path: "Path",
  connect: "Connect",
  user: "User",
  optional: "optional",
  password: "Password",
  allowInsecure: "Allow self-signed certificates",
  currentLocation: "Current location",
  refresh: "Refresh",
  directoryContents: "Directory contents",
  name: "Name",
  size: "Size",
  modified: "Modified",
  emptyHint1: "Enter a host, port, and path, then connect.",
  emptyHint2: "You can also paste a full WebDAV URL into the host field.",
  emptyFolder: "This folder has no visible items.",
  includeSubfolders: "Include subfolders",
  addSelected: "Add selected",
  addFolder: "Add this folder to playlist",
  root: "Root",
  savedPassword: "saved",
  remembered: "Last connection remembered. Click Connect to continue.",
} as const;

export const ZH: { [K in MessageKey]: string } = {
  menuBrowser: "WebDAV 浏览器",
  hostRequired: "请填写主机地址。",
  notConnected: "尚未连接。",
  notConnectedStatus: "尚未连接",
  connecting: "正在连接…",
  listing: "正在列出目录…",
  itemCount: "{count} 项 · {where}",
  playbackStarted: "已开始播放",
  addedItems: "已加入 {count} 项到播放列表",
  addedItemsTruncated: "已加入 {count} 项到播放列表（已达 2000 项上限，其余未加入）",
  scanningSubfolders: "正在扫描子文件夹…",
  collectingMedia: "正在收集媒体…",
  noPlayableMedia: "这个位置没有可播放的媒体文件。",
  playerTimeout: "等待播放器窗口超时",
  osdPlaying: "WebDAV：播放 {count} 项",
  osdAdded: "WebDAV：已加入 {count} 项",
  err401: "认证失败，请检查用户名和密码。",
  err403: "服务器拒绝访问该路径。",
  err404: "路径不存在。",
  err405: "服务器不支持 WebDAV PROPFIND。",
  errCert: "证书校验失败。若使用自签证书，请勾选「允许自签证书」。",
  errHost: "无法解析主机名。",
  errConnect: "无法连接服务器，请检查地址和端口。",
  errHttp: "服务器返回 HTTP {status}。",
  errFailed: "连接失败。",
  curlExit: "curl 退出码 {status}",
  scheme: "协议",
  host: "主机",
  hostPlaceholder: "nas.local 或完整 URL",
  port: "端口",
  path: "路径",
  connect: "连接",
  user: "用户",
  optional: "可选",
  password: "密码",
  allowInsecure: "允许自签证书",
  currentLocation: "当前位置",
  refresh: "刷新",
  directoryContents: "目录内容",
  name: "名称",
  size: "大小",
  modified: "修改时间",
  emptyHint1: "填写主机、端口和路径后点连接。",
  emptyHint2: "也可以把完整 WebDAV 地址粘贴到主机栏。",
  emptyFolder: "此目录没有可见项目",
  includeSubfolders: "包含子文件夹",
  addSelected: "加入选中",
  addFolder: "将此目录加入播放列表",
  root: "根目录",
  savedPassword: "已保存",
  remembered: "已记住上次连接，点连接即可继续。",
};

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  let out = template;
  for (const key of Object.keys(vars)) {
    out = out.split(`{${key}}`).join(String(vars[key]));
  }
  return out;
}

/** First IINA app localization; zh-* → Chinese, everything else → English. */
export function resolveLang(locales: string[]): "zh" | "en" {
  const first = String(locales[0] || "en")
    .toLowerCase()
    .replace(/_/g, "-");
  if (first === "zh" || first.startsWith("zh-")) return "zh";
  return "en";
}

export function readPreferredLocalizations(): string[] {
  try {
    const api = iina.utils as { preferredLocalizations?: () => unknown };
    const raw = api.preferredLocalizations ? api.preferredLocalizations() : [];
    if (Array.isArray(raw)) return raw.map((item) => String(item));
  } catch {
    // IINA 1.4 has no preferredLocalizations; keep English.
  }
  return [];
}

let cached: "zh" | "en" | null = null;

export function pluginLang(): "zh" | "en" {
  if (cached) return cached;
  cached = resolveLang(readPreferredLocalizations());
  return cached;
}

export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  const table = pluginLang() === "zh" ? ZH : EN;
  return interpolate(table[key] || EN[key], vars);
}

export function allStrings(): Record<MessageKey, string> {
  const table = pluginLang() === "zh" ? ZH : EN;
  const out = {} as Record<MessageKey, string>;
  (Object.keys(EN) as MessageKey[]).forEach((key) => {
    out[key] = table[key];
  });
  return out;
}
