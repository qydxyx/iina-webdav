import { EN, ZH, resolveLang, t } from "../src/i18n";
import { base64Encode } from "../src/base64";
import { isUsableConnection, sanitize, snapshotConnection } from "../src/connections";
import { formatModified, formatSize, isHiddenName, isMediaFile } from "../src/media";
import { parsePropfindXml } from "../src/parse-propfind";
import {
  collectionUrl,
  encodePath,
  authenticatedStreamUrl,
  mediaUrl,
  normalizePath,
  parentPath,
  parsePastedLocation,
  stripPlaybackWrapper,
  titleFromUrl,
  urlBelongsTo,
} from "../src/paths";
import type { ConnectionConfig } from "../src/types";

let failed = 0;
let passed = 0;

function assert(cond: unknown, message: string): void {
  if (cond) {
    passed += 1;
    return;
  }
  failed += 1;
  console.error(`FAIL ${message}`);
}

function eq<T>(actual: T, expected: T, message: string): void {
  const same = JSON.stringify(actual) === JSON.stringify(expected);
  if (same) {
    passed += 1;
    return;
  }
  failed += 1;
  console.error(`FAIL ${message}\n  expected ${JSON.stringify(expected)}\n  actual   ${JSON.stringify(actual)}`);
}

eq(resolveLang([]), "en", "empty locales is english");
eq(resolveLang(["en"]), "en", "english");
eq(resolveLang(["ja", "zh-Hans"]), "en", "non-chinese first is english");
eq(resolveLang(["zh-Hans"]), "zh", "zh-Hans");
eq(resolveLang(["zh-Hant"]), "zh", "zh-Hant");
eq(resolveLang(["zh_CN"]), "zh", "zh_CN underscore");
eq(resolveLang(["zh"]), "zh", "zh");
eq(t("connect"), "Connect", "t defaults to english without IINA locale");
(Object.keys(EN) as (keyof typeof EN)[]).forEach((key) => {
  assert(typeof ZH[key] === "string" && ZH[key].length > 0, "zh has " + key);
});

eq(normalizePath(""), "/", "empty path");
eq(normalizePath("webdav"), "/webdav", "relative path");
eq(normalizePath("/webdav/"), "/webdav", "trim slash");
eq(normalizePath("//a///b/"), "/a/b", "collapse slashes");
eq(parentPath("/a/b/c"), "/a/b", "parent");
eq(parentPath("/a"), "/", "parent of top");
eq(encodePath("/电影/Dune.mkv"), "/%E7%94%B5%E5%BD%B1/Dune.mkv", "encode path");

const cfg: ConnectionConfig = {
  scheme: "https",
  host: "nas.local",
  port: "",
  path: "/webdav",
  username: "u",
  insecure: false,
};
eq(mediaUrl(cfg, "/webdav/a b.mkv"), "https://nas.local:443/webdav/a%20b.mkv", "media url");
eq(collectionUrl(cfg, "/webdav"), "https://nas.local:443/webdav/", "collection url");
assert(urlBelongsTo("https://nas.local:443/webdav/x.mkv", cfg), "url belongs with port");
assert(urlBelongsTo("https://nas.local/webdav/x.mkv", cfg), "url belongs without port");
eq(titleFromUrl("http://192.168.0.3:5005/Online%20College/7.%E6%B2%B9%E7%AE%A1.mp4"), "7.油管.mp4", "title from url");
eq(stripPlaybackWrapper("ffmpeg://http://u:p@nas.local:443/webdav/x.mkv"), "http://nas.local:443/webdav/x.mkv", "strip ffmpeg auth");
assert(urlBelongsTo("ffmpeg://https://u:p@nas.local:443/webdav/x.mkv", cfg), "url belongs ffmpeg");
eq(
  authenticatedStreamUrl("https://nas.local:443/webdav/x.mkv", cfg, "p@ss"),
  "https://u:p%40ss@nas.local:443/webdav/x.mkv",
  "authenticated stream url",
);
assert(isUsableConnection(cfg), "usable connection");
assert(!isUsableConnection(sanitize({ at: Date.now() } as Partial<ConnectionConfig>)), "hello payload is not usable");
eq(snapshotConnection(cfg).host, "nas.local", "snapshot host");

const pasted = parsePastedLocation("https://192.168.1.10:5006/webdav/Movies");
eq(pasted, { scheme: "https", host: "192.168.1.10", port: "5006", path: "/webdav/Movies" }, "paste url");

const v6 = parsePastedLocation("http://[::1]:8080/dav");
eq(v6 && v6.host, "[::1]", "ipv6 host");

assert(isMediaFile("Dune.mkv"), "mkv is media");
assert(isMediaFile("track.FLAC"), "flac is media");
assert(!isMediaFile("notes.txt"), "txt is not media");
assert(isHiddenName(".DS_Store"), "hidden");
eq(formatSize(0), "0 B", "size 0");
eq(formatSize(1536), "1.50 KB", "size kb");
eq(formatSize(null), "—", "size null");
assert(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(formatModified("Mon, 18 Aug 2024 01:41:00 GMT")), "modified date");

eq(base64Encode(""), "", "b64 empty");
eq(base64Encode("f"), "Zg==", "b64 1");
eq(base64Encode("fo"), "Zm8=", "b64 2");
eq(base64Encode("foo"), "Zm9v", "b64 3");
eq(base64Encode("user:päss"), Buffer.from("user:päss", "utf8").toString("base64"), "b64 utf8");
eq(base64Encode("😀"), Buffer.from("😀", "utf8").toString("base64"), "b64 emoji");

const apache = `<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="DAV:">
  <D:response>
    <D:href>/webdav/</D:href>
    <D:propstat>
      <D:prop>
        <D:displayname>webdav</D:displayname>
        <D:resourcetype><D:collection/></D:resourcetype>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
  <D:response>
    <D:href>/webdav/Shows/</D:href>
    <D:propstat>
      <D:prop>
        <D:displayname>Shows</D:displayname>
        <D:resourcetype><D:collection/></D:resourcetype>
        <D:getlastmodified>Mon, 02 Nov 2024 13:10:00 GMT</D:getlastmodified>
      </D:prop>
    </D:propstat>
  </D:response>
  <D:response>
    <D:href>/webdav/Dune.mkv</D:href>
    <D:propstat>
      <D:prop>
        <D:displayname>Dune.mkv</D:displayname>
        <D:getcontentlength>123456</D:getcontentlength>
        <D:getlastmodified>Sun, 18 Aug 2024 01:41:00 GMT</D:getlastmodified>
        <D:resourcetype/>
      </D:prop>
    </D:propstat>
  </D:response>
  <D:response>
    <D:href>/webdav/.hidden.mkv</D:href>
    <D:propstat>
      <D:prop>
        <D:displayname>.hidden.mkv</D:displayname>
        <D:getcontentlength>1</D:getcontentlength>
        <D:resourcetype/>
      </D:prop>
    </D:propstat>
  </D:response>
</D:multistatus>`;

const listed = parsePropfindXml(apache, "https://nas.local", "/webdav");
eq(listed.length, 2, "skip self and hidden");
assert(listed[0].isDir && listed[0].name === "Shows", "dirs first");
assert(!listed[1].isDir && listed[1].name === "Dune.mkv", "file after dir");
eq(listed[1].size, 123456, "content length");

const nginx = `<?xml version="1.0" encoding="utf-8"?>
<multistatus xmlns="DAV:">
  <response>
    <href>/dav/%E7%94%B5%E5%BD%B1/foo.mp4</href>
    <propstat>
      <prop>
        <displayname><![CDATA[foo.mp4]]></displayname>
        <getcontentlength>42</getcontentlength>
        <resourcetype/>
      </prop>
    </propstat>
  </response>
</multistatus>`;
const decoded = parsePropfindXml(nginx, "https://nas.local", "/dav/电影");
eq(decoded.length, 1, "namespaced-less xml");
eq(decoded[0].name, "foo.mp4", "cdata name");
eq(decoded[0].path, "/dav/电影/foo.mp4", "decoded href path");

console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
