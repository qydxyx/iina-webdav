import type { DavItem } from "./types";
import { basename, hrefToPath, normalizePath } from "./paths";
import { isHiddenName } from "./media";

function decodeEntities(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)));
}

function innerTag(xml: string, local: string): string | null {
  const re = new RegExp(`<(?:[\\w.-]+:)?${local}\\b[^>]*>([\\s\\S]*?)</(?:[\\w.-]+:)?${local}\\s*>`, "i");
  const match = xml.match(re);
  return match ? decodeEntities(match[1].trim()) : null;
}

function hasCollection(xml: string): boolean {
  return /<(?:[\w.-]+:)?collection\b/i.test(xml);
}

function extractResponses(xml: string): string[] {
  const re = /<(?:[\w.-]+:)?response\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?response\s*>/gi;
  const out: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml))) {
    out.push(match[1]);
  }
  return out;
}

export function parsePropfindXml(xml: string, origin: string, listedPath: string): DavItem[] {
  const current = normalizePath(listedPath);
  const items: DavItem[] = [];
  const seen = new Set<string>();

  for (const block of extractResponses(xml)) {
    const href = innerTag(block, "href");
    if (!href) continue;
    const path = hrefToPath(href, origin);
    if (normalizePath(path) === current) continue;

    const display = innerTag(block, "displayname");
    const name = (display && display.trim()) || basename(path);
    if (isHiddenName(name) || name === current) continue;

    const lengthText = innerTag(block, "getcontentlength");
    const size = lengthText && /^-?\d+$/.test(lengthText) ? parseInt(lengthText, 10) : null;
    const modified = innerTag(block, "getlastmodified");
    const isDir = hasCollection(block);
    const key = `${isDir ? "d" : "f"}:${path}`;
    if (seen.has(key)) continue;
    seen.add(key);

    items.push({
      href,
      path,
      name,
      isDir,
      size: isDir ? null : size,
      modified,
    });
  }

  items.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
  });
  return items;
}
