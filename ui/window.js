(function () {
  "use strict";

  var form = document.getElementById("connect-form");
  var schemeEl = document.getElementById("scheme");
  var hostEl = document.getElementById("host");
  var portEl = document.getElementById("port");
  var pathEl = document.getElementById("path");
  var userEl = document.getElementById("username");
  var passEl = document.getElementById("password");
  var insecureEl = document.getElementById("insecure");
  var connectBtn = document.getElementById("connect-btn");
  var serverSelectEl = document.getElementById("server-select");
  var forgetBtn = document.getElementById("forget-btn");
  var refreshBtn = document.getElementById("refresh-btn");
  var crumbsEl = document.getElementById("crumbs-path");
  var listEl = document.getElementById("list");
  var statusEl = document.getElementById("status");
  var progressEl = document.getElementById("progress");
  var addSelectedBtn = document.getElementById("add-selected-btn");
  var addFolderBtn = document.getElementById("add-folder-btn");
  var recursiveEl = document.getElementById("recursive");

  var connected = false;
  var currentPath = "/";
  var parentPath = null;
  var items = [];
  var selected = [];
  var anchorIndex = 0;
  var hasSavedPassword = false;
  var servers = [];
  var lang = "en";
  var strings = {
    scheme: "Scheme",
    host: "Host",
    hostPlaceholder: "nas.local or full URL",
    port: "Port",
    path: "Path",
    connect: "Connect",
    user: "User",
    optional: "optional",
    password: "Password",
    allowInsecure: "Allow self-signed certificates",
    currentLocation: "Current location",
    refresh: "Refresh",
    directoryContents: "Directory contents",
    name: "Name",
    size: "Size",
    modified: "Modified",
    emptyHint1: "Enter a host, port, and path, then connect.",
    emptyHint2: "You can also paste a full WebDAV URL into the host field.",
    emptyFolder: "This folder has no visible items.",
    includeSubfolders: "Include subfolders",
    addSelected: "Add selected",
    addFolder: "Add this folder to playlist",
    root: "Root",
    savedPassword: "saved",
    remembered: "Last connection remembered. Click Connect to continue.",
    server: "Server",
    newServer: "New server…",
    forgetServer: "Forget",
    serverForgotten: "Removed from saved servers.",
    notConnectedStatus: "Not connected",
    hostRequired: "Enter a host.",
  };

  function applyI18n() {
    document.documentElement.lang = lang === "zh" ? "zh-Hans" : "en";
    var nodes = document.querySelectorAll("[data-i18n]");
    for (var i = 0; i < nodes.length; i++) {
      var key = nodes[i].getAttribute("data-i18n");
      if (strings[key]) nodes[i].textContent = strings[key];
    }
    var placeholders = document.querySelectorAll("[data-i18n-placeholder]");
    for (var p = 0; p < placeholders.length; p++) {
      var phKey = placeholders[p].getAttribute("data-i18n-placeholder");
      if (strings[phKey]) placeholders[p].setAttribute("placeholder", strings[phKey]);
    }
    var arias = document.querySelectorAll("[data-i18n-aria]");
    for (var a = 0; a < arias.length; a++) {
      var ariaKey = arias[a].getAttribute("data-i18n-aria");
      if (strings[ariaKey]) arias[a].setAttribute("aria-label", strings[ariaKey]);
    }
  }

  function bridge() {
    return typeof iina !== "undefined" && iina && typeof iina.postMessage === "function" ? iina : null;
  }

  function post(name, data) {
    var api = bridge();
    if (api) api.postMessage(name, data);
  }

  function log() {
    var args = [];
    for (var i = 0; i < arguments.length; i++) args.push(arguments[i]);
    post("debug-log", { args: args });
  }

  function onMessage(name, handler) {
    var api = bridge();
    if (api) api.onMessage(name, handler);
  }

  function setStatus(text, isError, loading) {
    statusEl.textContent = text || "";
    statusEl.classList.toggle("error", Boolean(isError));
    progressEl.hidden = !loading;
    document.body.classList.toggle("loading", Boolean(loading));
    connectBtn.disabled = Boolean(loading);
  }

  function formData() {
    return {
      scheme: schemeEl.value === "http" ? "http" : "https",
      host: hostEl.value.trim(),
      port: portEl.value.trim(),
      path: pathEl.value.trim() || "/",
      username: userEl.value.trim(),
      password: passEl.value,
      insecure: insecureEl.checked,
    };
  }

  function applyConnection(cfg) {
    if (!cfg) return;
    schemeEl.value = cfg.scheme === "http" ? "http" : "https";
    hostEl.value = cfg.host || "";
    portEl.value = cfg.port || "";
    pathEl.value = cfg.path || "/";
    userEl.value = cfg.username || "";
    insecureEl.checked = Boolean(cfg.insecure);
  }

  function applyPasswordHint(has) {
    hasSavedPassword = Boolean(has);
    if (!passEl.value) passEl.placeholder = hasSavedPassword ? strings.savedPassword : strings.optional;
  }

  function serverById(id) {
    for (var i = 0; i < servers.length; i++) {
      if (servers[i].id === id) return servers[i];
    }
    return null;
  }

  function renderServers(list, selectedId) {
    servers = list || [];
    serverSelectEl.innerHTML = "";
    var placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = strings.newServer;
    serverSelectEl.appendChild(placeholder);
    var found = false;
    for (var i = 0; i < servers.length; i++) {
      var option = document.createElement("option");
      option.value = servers[i].id;
      option.textContent = servers[i].label;
      serverSelectEl.appendChild(option);
      if (servers[i].id === selectedId) found = true;
    }
    serverSelectEl.value = found ? selectedId : "";
    forgetBtn.disabled = !found;
  }

  function clearForm() {
    schemeEl.value = "https";
    hostEl.value = "";
    portEl.value = "";
    pathEl.value = "";
    userEl.value = "";
    passEl.value = "";
    insecureEl.checked = false;
    applyPasswordHint(false);
  }

  function selectServer(id) {
    var entry = serverById(id);
    if (!entry) {
      clearForm();
      hostEl.focus();
      return;
    }
    applyConnection(entry);
    passEl.value = "";
    applyPasswordHint(Boolean(entry.username));
    forgetBtn.disabled = false;
  }

  function deselectServer() {
    serverSelectEl.value = "";
    forgetBtn.disabled = true;
    hasSavedPassword = false;
    passEl.placeholder = strings.optional;
  }

  function iconSvg(isDir, isMedia) {
    if (isDir) {
      return '<svg class="kind" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M2.5 3.5h4.2l.8 1H13.5a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z"/></svg>';
    }
    if (isMedia) {
      return '<svg class="kind" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M3 3.5h10a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1zm3.2 2.1v5l4.6-2.5-4.6-2.5z"/></svg>';
    }
    return '<svg class="kind muted" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M4 2.5h5.2L13 6.3V13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1z"/></svg>';
  }

  function renderCrumbs(path) {
    crumbsEl.innerHTML = "";
    var parts = (path || "/").split("/").filter(Boolean);
    var acc = "";
    function addCrumb(label, target, isCurrent) {
      if (crumbsEl.childNodes.length) {
        var sep = document.createElement("span");
        sep.className = "sep";
        sep.textContent = "/";
        crumbsEl.appendChild(sep);
      }
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "crumb" + (isCurrent ? " current" : "");
      btn.textContent = label;
      btn.title = target;
      if (!isCurrent) {
        btn.addEventListener("click", function () {
          post("list", { path: target });
        });
      }
      crumbsEl.appendChild(btn);
    }
    addCrumb(strings.root || "Root", "/", parts.length === 0);
    for (var i = 0; i < parts.length; i++) {
      acc += "/" + parts[i];
      addCrumb(parts[i], acc, i === parts.length - 1);
    }
  }

  function isSelected(path) {
    return selected.indexOf(path) !== -1;
  }

  function syncButtons() {
    refreshBtn.disabled = !connected;
    addFolderBtn.disabled = !connected;
    var canAdd = false;
    for (var i = 0; i < selected.length; i++) {
      var item = itemByPath(selected[i]);
      if (item && (item.isDir || item.isMedia)) {
        canAdd = true;
        break;
      }
    }
    addSelectedBtn.disabled = !connected || !canAdd;
  }

  function itemByPath(path) {
    for (var i = 0; i < items.length; i++) {
      if (items[i].path === path) return items[i];
    }
    return null;
  }

  function paintSelection() {
    var rows = listEl.querySelectorAll(".row-item");
    for (var i = 0; i < rows.length; i++) {
      var path = rows[i].getAttribute("data-path");
      rows[i].classList.toggle("selected", isSelected(path));
      rows[i].setAttribute("aria-selected", isSelected(path) ? "true" : "false");
    }
    syncButtons();
  }

  function selectOnly(index) {
    var item = items[index];
    selected = item ? [item.path] : [];
    anchorIndex = index;
    paintSelection();
  }

  function toggleSelect(index) {
    var item = items[index];
    if (!item) return;
    var pos = selected.indexOf(item.path);
    if (pos >= 0) selected.splice(pos, 1);
    else selected.push(item.path);
    anchorIndex = index;
    paintSelection();
  }

  function selectRange(index) {
    var start = Math.min(anchorIndex, index);
    var end = Math.max(anchorIndex, index);
    selected = [];
    for (var i = start; i <= end; i++) selected.push(items[i].path);
    paintSelection();
  }

  function openItem(item) {
    if (!item) return;
    if (item.isDir) post("list", { path: item.path });
    else post("play-item", { path: item.path, isDir: false });
  }

  function renderList(nextItems) {
    items = nextItems || [];
    selected = selected.filter(function (path) {
      return itemByPath(path);
    });
    listEl.innerHTML = "";
    if (!items.length) {
      var empty = document.createElement("div");
      empty.className = "empty";
      empty.id = "empty";
      if (connected) {
        empty.textContent = strings.emptyFolder;
      } else {
        empty.innerHTML =
          "<span>" +
          strings.emptyHint1 +
          "</span><br /><span>" +
          strings.emptyHint2 +
          "</span>";
      }
      listEl.appendChild(empty);
      syncButtons();
      return;
    }
    for (var i = 0; i < items.length; i++) {
      (function (item, index) {
        var row = document.createElement("div");
        row.className = "row-item";
        row.setAttribute("role", "option");
        row.setAttribute("data-path", item.path);
        row.setAttribute("data-index", String(index));
        row.innerHTML =
          '<div class="col name">' +
          iconSvg(item.isDir, item.isMedia) +
          '<span class="filename"></span></div>' +
          '<div class="col size muted"></div>' +
          '<div class="col modified muted"></div>';
        row.querySelector(".filename").textContent = item.name;
        row.querySelector(".size").textContent = item.isDir ? "—" : item.size || "—";
        row.querySelector(".modified").textContent = item.modified || "—";
        row.addEventListener("mousedown", function (event) {
          if (event.shiftKey) selectRange(index);
          else if (event.metaKey || event.ctrlKey) toggleSelect(index);
          else selectOnly(index);
        });
        row.addEventListener("dblclick", function (event) {
          event.preventDefault();
          openItem(item);
        });
        listEl.appendChild(row);
      })(items[i], i);
    }
    paintSelection();
  }

  function addSelected() {
    var files = [];
    var dirs = [];
    for (var i = 0; i < selected.length; i++) {
      var item = itemByPath(selected[i]);
      if (!item) continue;
      if (item.isDir) dirs.push(item.path);
      else if (item.isMedia) files.push(item.path);
    }
    if (files.length) post("add-items", { paths: files });
    for (var d = 0; d < dirs.length; d++) {
      post("add-folder", { path: dirs[d], recursive: recursiveEl.checked });
    }
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var data = formData();
    if (!data.host) {
      setStatus(strings.hostRequired, true, false);
      hostEl.focus();
      return;
    }
    log("connect submit", data.scheme, data.host, data.port, data.path, data.username ? "user" : "anon");
    post("connect", data);
  });

  serverSelectEl.addEventListener("change", function () {
    selectServer(serverSelectEl.value);
  });

  forgetBtn.addEventListener("click", function () {
    var id = serverSelectEl.value;
    if (!id) return;
    forgetBtn.disabled = true;
    post("forget-server", { id: id });
  });

  function identityEdited() {
    deselectServer();
  }

  schemeEl.addEventListener("change", identityEdited);
  hostEl.addEventListener("input", identityEdited);
  portEl.addEventListener("input", identityEdited);
  userEl.addEventListener("input", identityEdited);

  refreshBtn.addEventListener("click", function () {
    post("list", { path: currentPath });
  });

  addSelectedBtn.addEventListener("click", addSelected);
  addFolderBtn.addEventListener("click", function () {
    post("add-folder", { path: currentPath, recursive: recursiveEl.checked });
  });

  listEl.addEventListener("keydown", function (event) {
    if (!items.length) return;
    var current = 0;
    if (selected.length) {
      for (var i = 0; i < items.length; i++) {
        if (items[i].path === selected[selected.length - 1]) current = i;
      }
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      var next = Math.min(items.length - 1, current + 1);
      if (event.shiftKey) selectRange(next);
      else selectOnly(next);
      var row = listEl.querySelector('[data-index="' + next + '"]');
      if (row) row.scrollIntoView({ block: "nearest" });
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      var prev = Math.max(0, current - 1);
      if (event.shiftKey) selectRange(prev);
      else selectOnly(prev);
      var prevRow = listEl.querySelector('[data-index="' + prev + '"]');
      if (prevRow) prevRow.scrollIntoView({ block: "nearest" });
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (selected.length === 1) openItem(itemByPath(selected[0]));
      else addSelected();
    } else if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      if (parentPath) post("list", { path: parentPath });
    } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
      event.preventDefault();
      selected = items.map(function (item) {
        return item.path;
      });
      paintSelection();
    } else if (event.key === "Escape") {
      selected = [];
      paintSelection();
    }
  });

  document.addEventListener("keydown", function (event) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "r") {
      event.preventDefault();
      if (connected) post("list", { path: currentPath });
    }
  });

  onMessage("init", function (data) {
    log("init", data && data.connection && data.connection.host);
    if (data && data.lang) lang = data.lang;
    if (data && data.strings) {
      for (var key in data.strings) {
        if (Object.prototype.hasOwnProperty.call(data.strings, key)) strings[key] = data.strings[key];
      }
    }
    applyI18n();
    renderServers(data && data.servers, data && data.selectedId);
    if (data && data.connection) applyConnection(data.connection);
    applyPasswordHint(data && data.hasPassword);
    setStatus(data && data.connection ? strings.remembered : strings.notConnectedStatus, false, false);
  });

  onMessage("connected", function (data) {
    connected = true;
    if (data && data.connection) applyConnection(data.connection);
    renderServers(data && data.servers, data && data.serverId);
    applyPasswordHint(Boolean(data && data.connection && data.connection.username));
    syncButtons();
  });

  onMessage("saved-servers", function (data) {
    renderServers(data && data.servers, "");
    applyPasswordHint(false);
  });

  onMessage("listing", function (data) {
    connected = true;
    currentPath = (data && data.path) || "/";
    parentPath = data && data.parent;
    pathEl.value = currentPath;
    renderCrumbs(currentPath);
    renderList((data && data.items) || []);
    syncButtons();
    listEl.focus();
  });

  onMessage("status", function (data) {
    setStatus((data && data.text) || "", Boolean(data && data.error), Boolean(data && data.loading));
  });

  log("window script loaded", bridge() ? "iina" : "browser");
  applyI18n();
  post("ready");

  if (!bridge()) {
    connected = true;
    currentPath = "/Movies";
    parentPath = "/";
    renderCrumbs(currentPath);
    renderList([
      { path: "/Movies/Shows", name: "Shows", isDir: true, isMedia: false, size: "—", modified: "2024-11-02 21:10" },
      { path: "/Movies/Dune.mkv", name: "Dune.mkv", isDir: false, isMedia: true, size: "12.4 GB", modified: "2024-08-18 09:41" },
      { path: "/Movies/Score.flac", name: "Score.flac", isDir: false, isMedia: true, size: "312 MB", modified: "2023-12-01 18:02" },
    ]);
    setStatus("Browser preview · 3 items · https://nas.local/Movies", false, false);
  }
})();
