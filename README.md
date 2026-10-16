# IINA WebDAV

IINA 1.4+ 插件：打开管理窗口，连接 WebDAV（群晖 / nginx dav / rclone 等），浏览媒体，并把文件或整个目录加入当前播放列表。

## 功能

- 插件菜单 **WebDAV 浏览器**，快捷键 `⌥⌘D`
- 填写协议、主机、端口、路径；支持把完整 URL 粘贴到主机栏
- HTTP Basic 认证，密码进钥匙串，播放列表 URL 不含账密
- 浏览文件夹，双击播放，多选加入播放列表
- 将整个目录加入播放列表（默认可含子文件夹，窗口里可关掉）
- 没有播放窗口时自动新建一个

## 要求

- IINA 1.4 或更高
- 服务器支持 WebDAV `PROPFIND`（Depth: 1）和 HTTP Range 播放

## 安装

IINA 1.4+：**设置 → 插件 → 从 GitHub 安装**，填入：

```
qydxyx/iina-webdav
```

或打开仓库发布的 `.iinaplgz`。安装后重启 IINA。

### 本地开发

```bash
npm install
npm test
npm run build
/Applications/IINA.app/Contents/MacOS/iina-plugin link .
```

改完 TypeScript 后重新 `npm run build`，再在 IINA 里 **插件 → 重新加载所有插件**。

## 使用

1. 打开 **插件 → WebDAV 浏览器**
2. 填写主机 / 端口 / 路径（例如群晖 `5006` + `/webdav`，或 Nextcloud `/remote.php/dav/files/用户名/`）
3. 点连接
4. 双击文件播放，或用底栏把当前目录加入播放列表

自签证书勾选「允许自签证书」。列目录走系统 `curl -k`，播放时对匹配的 WebDAV 地址关闭 mpv TLS 校验。

## 权限

| 权限 | 用途 |
|------|------|
| `network-request` | 访问任意 WebDAV 主机 |
| `file-system` | 调用 `/usr/bin/curl` 发 PROPFIND |
| `show-osd` | 加入播放列表后的提示 |
| `show-alert` | 必要时弹窗 |

## 结构

```
Info.json          插件清单
src/index.ts       播放器入口：播放列表 + Basic Auth hook
src/global.ts      全局入口：菜单、窗口、PROPFIND、路由
src/webdav.ts      curl PROPFIND 与递归收集
ui/window.html     管理窗口
```

## 限制

- 递归深度 8，单次最多 2000 个媒体文件
- 仅 HTTP Basic
- 不支持上传 / 删除 / 重命名
- 播放列表显示文件名；IINA 探测时长时可能对未带鉴权的 HTTP 地址报 401，不影响播放
