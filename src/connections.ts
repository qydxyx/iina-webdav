import { warn } from "./debug";
import { effectivePort, normalizePath } from "./paths";
import type { ConnectionConfig, SavedConnection, Scheme } from "./types";

const KEYCHAIN_SERVICE = "webdav";
const PREF_KEY = "lastConnection";
const SAVED_KEY = "savedConnections";
export const MAX_SAVED_CONNECTIONS = 20;

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

/** Identity of a reusable server: scheme, host, effective port, exact username. */
export function connectionId(
  cfg: Pick<ConnectionConfig, "scheme" | "host" | "port" | "username">,
): string {
  const scheme: Scheme = cfg.scheme === "http" ? "http" : "https";
  const host = (cfg.host || "").trim().toLowerCase();
  const user = (cfg.username || "").trim();
  return `${scheme}://${user}@${host}:${effectivePort({ scheme, port: cfg.port })}`;
}

export function serverLabel(entry: Pick<ConnectionConfig, "scheme" | "host" | "port" | "path" | "username">): string {
  const scheme: Scheme = entry.scheme === "http" ? "http" : "https";
  const user = (entry.username || "").trim();
  const host = (entry.host || "").trim();
  const path = normalizePath(entry.path || "/");
  return `${scheme}://${user ? `${user}@` : ""}${host}:${effectivePort({ scheme, port: entry.port })}${path}`;
}

export function parseSavedConnections(raw: unknown): SavedConnection[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    warn("parse saved connections failed", String(error));
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const entries: SavedConnection[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const candidate = item as Partial<SavedConnection>;
    if (typeof candidate.host !== "string" || !candidate.host.trim()) continue;
    const clean = sanitize(candidate);
    const at = Number(candidate.lastUsed);
    entries.push({ ...clean, lastUsed: Number.isFinite(at) && at > 0 ? at : 0 });
  }
  entries.sort((a, b) => b.lastUsed - a.lastUsed);
  const seen = new Set<string>();
  const unique: SavedConnection[] = [];
  for (const entry of entries) {
    const id = connectionId(entry);
    if (seen.has(id)) continue;
    seen.add(id);
    unique.push(entry);
    if (unique.length >= MAX_SAVED_CONNECTIONS) break;
  }
  return unique;
}

export function serializeSavedConnections(list: SavedConnection[]): string {
  return JSON.stringify(list);
}

export function upsertSavedConnection(
  list: SavedConnection[],
  cfg: ConnectionConfig,
  now: number,
): SavedConnection[] {
  const clean = sanitize(cfg);
  const entry: SavedConnection = { ...clean, lastUsed: now };
  const id = connectionId(entry);
  const next = list.filter((item) => connectionId(item) !== id);
  next.push(entry);
  next.sort((a, b) => b.lastUsed - a.lastUsed);
  return next.slice(0, MAX_SAVED_CONNECTIONS);
}

export function removeSavedConnection(list: SavedConnection[], id: string): SavedConnection[] {
  return list.filter((item) => connectionId(item) !== id);
}

export function loadSavedConnections(): SavedConnection[] {
  let raw: unknown;
  try {
    raw = iina.preferences.get(SAVED_KEY);
  } catch (error) {
    warn("load saved connections failed", String(error));
    return [];
  }
  // An unset or empty-string preference migrates the legacy last connection.
  if (typeof raw === "string" && raw.trim()) return parseSavedConnections(raw);
  const legacy = loadConnection();
  return legacy ? [{ ...legacy, lastUsed: 0 }] : [];
}

function persistSavedConnections(list: SavedConnection[]): void {
  iina.preferences.set(SAVED_KEY, serializeSavedConnections(list));
  iina.preferences.sync();
}

export function rememberSavedConnection(cfg: ConnectionConfig): SavedConnection[] {
  const list = upsertSavedConnection(loadSavedConnections(), cfg, Date.now());
  try {
    persistSavedConnections(list);
  } catch (error) {
    warn("save connections failed", String(error));
  }
  return list;
}

export function forgetSavedConnection(id: string): SavedConnection[] {
  const list = removeSavedConnection(loadSavedConnections(), id);
  try {
    persistSavedConnections(list);
    const last = loadConnection();
    if (last && connectionId(last) === id) clearLastConnection();
  } catch (error) {
    warn("forget connection failed", String(error));
  }
  return list;
}

function clearLastConnection(): void {
  iina.preferences.set(PREF_KEY, "");
  iina.preferences.sync();
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
