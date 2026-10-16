# IINA WebDAV

An IINA 1.4+ plugin that opens a browser window, connects to a WebDAV server (Synology, nginx dav, rclone, and similar), lists media, and adds files or whole folders to the current playlist.

## Features

- Plugin menu **WebDAV Browser**, shortcut `⌥⌘D`
- Scheme, host, port, and path fields; paste a full URL into the host field
- HTTP Basic auth; password stored in Keychain; playlist URLs do not include credentials
- Browse folders, double-click to play, multi-select to add to the playlist
- Add the current folder to the playlist (includes subfolders by default; can be turned off in the window)
- Opens a new player window when none is open
- Follows IINA’s language: Chinese UI when IINA is Chinese, English otherwise

## Requirements

- IINA 1.4 or later
- Server support for WebDAV `PROPFIND` (Depth: 1) and HTTP Range playback

## Install

In IINA 1.4+: **Settings → Plugins → Install from GitHub**, then enter:

```
qydxyx/iina-webdav
```

You can also open the `.iinaplgz` from [Releases](https://github.com/qydxyx/iina-webdav/releases). Quit IINA completely (⌘Q) after installing.

### Local development

```bash
npm install
npm test
npm run build
/Applications/IINA.app/Contents/MacOS/iina-plugin link .
```

After TypeScript changes, run `npm run build` again, then **Plugins → Reload All Plugins** in IINA.

## Usage

1. Open **Plugins → WebDAV Browser**
2. Fill in host / port / path (for example Synology `5006` + `/webdav`, or Nextcloud `/remote.php/dav/files/USERNAME/`)
3. Connect
4. Double-click a file to play, or use the bottom bar to add the current folder to the playlist

For self-signed certificates, enable **Allow self-signed certificates**. Directory listing uses system `curl -k`; playback disables mpv TLS verification for matching WebDAV URLs.

## Permissions

| Permission | Use |
|------|------|
| `network-request` | Reach any WebDAV host |
| `file-system` | Run `/usr/bin/curl` for PROPFIND |
| `show-osd` | OSD after adding items to the playlist |
| `show-alert` | Alerts when needed |

## Layout

```
Info.json          Plugin manifest
src/index.ts       Player entry: playlist + Basic Auth hook
src/global.ts      Global entry: menu, window, PROPFIND, routing
src/webdav.ts      curl PROPFIND and recursive collection
ui/window.html     Browser window
```

## Limits

- Recursion depth 8, at most 2000 media files per add
- HTTP Basic only
- No upload, delete, or rename
- The playlist shows file names; IINA may log 401 when probing duration on unauthenticated HTTP URLs. Playback is unaffected.
