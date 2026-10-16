import { warn } from "./debug";
import { normalizePath } from "./paths";
import type { ConnectionConfig, Scheme } from "./types";

const KEYCHAIN_SERVICE = "webdav";
const PREF_KEY = "lastConnection";

export function accountName(cfg: ConnectionConfig): string {
  const user = cfg.username || "anonymous";
  const port = (cfg.port || "").trim() || (cfg.scheme === "https" ? "443" : "80");
  return `${user}@${cfg.host}:${port}`;
}

export function savePassword(cfg: ConnectionConfig, password: string): boolean {
  const utils = iina.utils as any;
  const service = KEYCHAIN_SERVICE;
  const name = accountName(cfg);
  const secret = String(password);
  try {
    if (utils.keychainWrite) return Boolean(utils.keychainWrite(service, name, secret));
    if (utils.keyChainWrite) return Boolean(utils.keyChainWrite(service, name, secret));
  } catch (error) {
    warn("keychain write failed", String(error));
  }
  return false;
}

export function loadPassword(cfg: ConnectionConfig): string {
  const utils = iina.utils as any;
  const service = KEYCHAIN_SERVICE;
  const name = accountName(cfg);
  try {
    let value: unknown;
    if (utils.keychainRead) value = utils.keychainRead(service, name);
    else if (utils.keyChainRead) value = utils.keyChainRead(service, name);
    return typeof value === "string" ? value : "";
  } catch (error) {
    warn("keychain read failed", String(error));
    return "";
  }
}

export function saveConnection(cfg: ConnectionConfig): void {
  try {
    iina.preferences.set(PREF_KEY, JSON.stringify(sanitize(cfg)));
    iina.preferences.sync();
  } catch (error) {
    warn("save connection failed", String(error));
  }
}

export function loadConnection(): ConnectionConfig | null {
  try {
    const raw = iina.preferences.get(PREF_KEY);
    if (!raw || typeof raw !== "string") return null;
    return sanitize(JSON.parse(raw) as Partial<ConnectionConfig>);
  } catch (error) {
    warn("load connection failed", String(error));
    return null;
  }
}

export function sanitize(input: Partial<ConnectionConfig> | ConnectionConfig): ConnectionConfig {
  const scheme: Scheme = input.scheme === "http" ? "http" : "https";
  return {
    scheme,
    host: (input.host || "").trim(),
    port: (input.port || "").trim(),
    path: normalizePath(input.path || "/"),
    username: (input.username || "").trim(),
    insecure: Boolean(input.insecure),
  };
}

export function isUsableConnection(cfg: ConnectionConfig | null | undefined): cfg is ConnectionConfig {
  return Boolean(cfg && cfg.host);
}

/** Fresh plain object so IINA's postMessage JSON bridge cannot reuse a wrapped value. */
export function snapshotConnection(cfg: ConnectionConfig): ConnectionConfig {
  const clean = sanitize(cfg);
  return {
    scheme: clean.scheme,
    host: String(clean.host),
    port: String(clean.port),
    path: String(clean.path),
    username: String(clean.username),
    insecure: Boolean(clean.insecure),
  };
}
