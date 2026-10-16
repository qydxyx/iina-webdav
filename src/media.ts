const MEDIA_EXT = new Set([
  "mkv",
  "mp4",
  "m4v",
  "mov",
  "avi",
  "webm",
  "ts",
  "m2ts",
  "mts",
  "wmv",
  "flv",
  "mpg",
  "mpeg",
  "m2v",
  "rmvb",
  "rm",
  "3gp",
  "ogv",
  "mp3",
  "flac",
  "m4a",
  "aac",
  "wav",
  "ogg",
  "opus",
  "wma",
  "ape",
  "aiff",
  "aif",
  "m3u",
  "m3u8",
]);

export const MAX_DIR_DEPTH = 8;
export const MAX_PLAYLIST_ITEMS = 2000;

export function extensionOf(name: string): string {
  const base = name.split("/").pop() || name;
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return "";
  return base.slice(dot + 1).toLowerCase();
}

export function isMediaFile(name: string): boolean {
  return MEDIA_EXT.has(extensionOf(name));
}

export function isHiddenName(name: string): boolean {
  return name.startsWith(".") || name === "";
}

export function compareNames(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

export function formatSize(bytes: number | null): string {
  if (bytes == null || !isFinite(bytes) || bytes < 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const digits = unit === 0 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${units[unit]}`;
}

export function formatModified(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (isNaN(date.getTime())) return value;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d} ${hh}:${mm}`;
}
