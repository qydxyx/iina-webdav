const PREFIX = "[webdav]";
const LOG_FILE = "@data/debug.log";
const MAX_BYTES = 400000;

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
  try {
    const prev = iina.file.read(LOG_FILE) || "";
    const next =
      prev.length > MAX_BYTES
        ? `${prev.slice(-Math.floor(MAX_BYTES / 2))}\n--- truncated ---\n${line}\n`
        : `${prev}${prev && !prev.endsWith("\n") ? "\n" : ""}${line}\n`;
    iina.file.write(LOG_FILE, next);
  } catch {
    // ignore missing file API
  }
}

function stamp(level: string, args: unknown[]): string {
  return `${new Date().toISOString()} ${PREFIX} [${level}] ${args.map(stringify).join(" ")}`;
}

export function debug(...args: unknown[]): void {
  const line = stamp("d", args);
  iina.console.log(line);
  append(line);
}

export function warn(...args: unknown[]): void {
  const line = stamp("w", args);
  iina.console.warn(line);
  append(line);
}

export function error(...args: unknown[]): void {
  const line = stamp("e", args);
  iina.console.error(line);
  append(line);
}

export function describeConn(cfg: { scheme?: string; host?: string; port?: string; path?: string; username?: string; insecure?: boolean } | null): string {
  if (!cfg) return "<none>";
  const port = cfg.port ? `:${cfg.port}` : "";
  const user = cfg.username ? `${cfg.username}@` : "";
  return `${cfg.scheme || "https"}://${user}${cfg.host || ""}${port}${cfg.path || "/"}${cfg.insecure ? " insecure" : ""}`;
}
