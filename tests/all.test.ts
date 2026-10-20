import { EN, ZH, resolveLang, t } from "../src/i18n";
import { base64Encode } from "../src/base64";
import {
  connectionId,
  isUsableConnection,
  MAX_SAVED_CONNECTIONS,
  parseSavedConnections,
  removeSavedConnection,
  sanitize,
  serverLabel,
  snapshotConnection,
  upsertSavedConnection,
} from "../src/connections";
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
import type { ConnectionConfig, SavedConnection } from "../src/types";

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

eq(connectionId(cfg), "https://u@nas.local:443", "connection id empty port");
eq(connectionId({ ...cfg, host: "NAS.Local", port: "443" }), "https://u@nas.local:443", "connection id casing and explicit port");
eq(connectionId({ ...cfg, scheme: "http" }), "http://u@nas.local:80", "connection id scheme");
eq(connectionId({ ...cfg, username: "v" }), "https://v@nas.local:443", "connection id username");

eq(serverLabel({ ...cfg, port: "5006" }), "https://u@nas.local:5006/webdav", "server label with user");
eq(
  serverLabel({ scheme: "http", host: "nas.local", port: "", path: "/", username: "", insecure: false }),
  "http://nas.local:80/",
  "server label anonymous root",
);

let savedList: SavedConnection[] = [];
savedList = upsertSavedConnection(savedList, cfg, 1000);
eq(savedList.length, 1, "first saved connection added");
eq(savedList[0].lastUsed, 1000, "lastUsed recorded");
savedList = upsertSavedConnection(savedList, { ...cfg, path: "/other" }, 2000);
eq(savedList.length, 1, "same identity updates instead of adding");
eq(savedList[0].path, "/other", "same identity path updated");
savedList = upsertSavedConnection(savedList, { ...cfg, username: "v" }, 3000);
eq(savedList.length, 2, "different username is a separate server");
eq(savedList[0].username, "v", "newest first");
savedList = upsertSavedConnection(savedList, cfg, 4000);
eq(savedList[0].username, "u", "reused server moves to front");
eq(savedList.length, 2, "reused server does not duplicate");

let many: SavedConnection[] = [];
for (let i = 0; i < 25; i++) {
  many = upsertSavedConnection(many, { ...cfg, username: `u${i}` }, i + 1);
}
eq(many.length, MAX_SAVED_CONNECTIONS, "saved connections capped");
eq(many[0].username, "u24", "newest saved first after cap");
eq(many[many.length - 1].username, "u5", "oldest saved evicted");

eq(removeSavedConnection(many, connectionId(many[many.length - 1])).length, 19, "remove matching saved connection");
eq(removeSavedConnection(many, "missing").length, 20, "remove unknown id keeps list");

eq(parseSavedConnections(""), [], "parse empty pref");
eq(parseSavedConnections("not json"), [], "parse invalid json");
eq(parseSavedConnections("{}"), [], "parse non-array");
eq(parseSavedConnections("[null,1,{\"host\":\"\"},{\"host\":\"  \"}]"), [], "parse junk entries");

const parsedDupes = parseSavedConnections(
  JSON.stringify([
    { ...cfg, path: "/old", lastUsed: 5 },
    { ...cfg, path: "/new", lastUsed: 9 },
  ]),
);
eq(parsedDupes.length, 1, "parse dedupes by identity");
eq(parsedDupes[0].path, "/new", "parse keeps newest duplicate");
eq(parsedDupes[0].lastUsed, 9, "parse keeps newest timestamp");

const parsedNoTime = parseSavedConnections(JSON.stringify([{ ...cfg, lastUsed: undefined }]));
eq(parsedNoTime.length, 1, "parse keeps entry without lastUsed");
eq(parsedNoTime[0].lastUsed, 0, "parse defaults missing lastUsed");
eq(parseSavedConnections(JSON.stringify([{ ...cfg, lastUsed: "soon" }]))[0].lastUsed, 0, "parse defaults invalid lastUsed");

eq(parseSavedConnections(JSON.stringify([{ host: "", lastUsed: 1 }])), [], "parse drops missing host");

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

import { debug, describeConn, error as logError, recentLogs, warn } from "../src/debug";

eq(describeConn(null), "<none>", "describeConn null");
eq(
  describeConn({ scheme: "http", host: "example.com", port: "8080", path: "/dav", username: "user", insecure: true }),
  "http://user@example.com:8080/dav insecure",
  "describeConn full",
);

// Test logging and recentLogs memory buffer
debug("test debug message");
warn("test warning message");
logError("test error message");
assert(recentLogs.length >= 3, "recentLogs records entries");
assert(recentLogs.some((l) => l.includes("[d]") && l.includes("test debug message")), "debug logged");
assert(recentLogs.some((l) => l.includes("[w]") && l.includes("test warning message")), "warn logged");
assert(recentLogs.some((l) => l.includes("[e]") && l.includes("test error message")), "error logged");

// Test that file logging never calls file.read
let readCalled = false;
let handleCalled = false;
let writeCalled = false;
let seekToEndCalled = false;
let closeCalled = false;
let handleWrittenData = "";

(globalThis as unknown as { iina: unknown }).iina = {
  console: {
    log: () => {},
    warn: () => {},
    error: () => {},
  },
  file: {
    exists: () => true,
    read: () => {
      readCalled = true;
      return "LARGE_FILE_CONTENT";
    },
    write: () => {
      writeCalled = true;
    },
    handle: () => {
      handleCalled = true;
      return {
        seekToEnd: () => {
          seekToEndCalled = true;
        },
        offset: () => 500,
        write: (data: string) => {
          handleWrittenData = data;
        },
        close: () => {
          closeCalled = true;
        },
      };
    },
  },
};

debug("append via handle test");
assert(!readCalled, "file.read is NEVER called during append");
assert(handleCalled, "file.handle is called during append");
assert(seekToEndCalled, "handle.seekToEnd is called");
assert(closeCalled, "handle.close is called");
assert(handleWrittenData.includes("append via handle test"), "data written via handle");

// Clean up global mock
delete (globalThis as unknown as { iina?: unknown }).iina;

console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
