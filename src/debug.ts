const PREFIX = "[webdav]";
const LOG_FILE = "@data/debug.log";
const MAX_BYTES = 200000;
const RECENT_LIMIT = 50;

export const recentLogs: string[] = [];

function recordRecent(line: string): void {
  recentLogs.push(line);
  if (recentLogs.length > RECENT_LIMIT) {
    recentLogs.shift();
  }
}

function stringify(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.message;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function append(line: string): void {
  recordRecent(line);
  try {
    if (typeof iina === "undefined" || !iina.file) return;

    const entry = `${line}\n`;

    // Incremental append without reading the file from disk
    if (typeof iina.file.handle === "function") {
      if (!iina.file.exists(LOG_FILE)) {
        iina.file.write(LOG_FILE, entry);
        return;
      }
      const handle = iina.file.handle(LOG_FILE, "write");
      if (handle) {
        handle.seekToEnd();
        const currentSize = handle.offset();
        if (currentSize > MAX_BYTES) {
          handle.close();
          iina.file.write(LOG_FILE, `--- log rotated ---\n${entry}`);
          return;
        }
        handle.write(entry);
        handle.close();
        return;
      }
    }
  } catch {
    // Logging failures must never interrupt application execution
  }
}

function stamp(level: string, args: unknown[]): string {
  return `${new Date().toISOString()} ${PREFIX} [${level}] ${args.map(stringify).join(" ")}`;
}

export function debug(...args: unknown[]): void {
  const line = stamp("d", args);
  if (typeof iina !== "undefined" && iina.console && typeof iina.console.log === "function") {
    iina.console.log(line);
  }
  append(line);
}

export function warn(...args: unknown[]): void {
  const line = stamp("w", args);
  if (typeof iina !== "undefined" && iina.console && typeof iina.console.warn === "function") {
    iina.console.warn(line);
  }
  append(line);
}

export function error(...args: unknown[]): void {
  const line = stamp("e", args);
  if (typeof iina !== "undefined" && iina.console && typeof iina.console.error === "function") {
    iina.console.error(line);
  }
  append(line);
}

export function describeConn(cfg: { scheme?: string; host?: string; port?: string; path?: string; username?: string; insecure?: boolean } | null): string {
  if (!cfg) return "<none>";
  const port = cfg.port ? `:${cfg.port}` : "";
  const user = cfg.username ? `${cfg.username}@` : "";
  return `${cfg.scheme || "https"}://${user}${cfg.host || ""}${port}${cfg.path || "/"}${cfg.insecure ? " insecure" : ""}`;
}
