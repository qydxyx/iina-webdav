#!/usr/bin/env python3
"""Follow IINA session logs and the WebDAV plugin debug file."""
from __future__ import annotations

import os
import sys
import time
from pathlib import Path

IINA_LOGS = Path.home() / "Library/Logs/com.colliderli.iina"
PLUGIN_LOG = (
    Path.home()
    / "Library/Application Support/com.colliderli.iina/plugins/.data/com.qydxyx.iina-webdav/debug.log"
)
ALERT = (" [e] ", "[webdav] [e]", "[webdav] [w]", "failed", "TypeError", "connect failed", "curl failed")


def newest_iina_log() -> Path | None:
    if not IINA_LOGS.exists():
        return None
    candidates = sorted(IINA_LOGS.glob("*/iina.log"), key=lambda p: p.stat().st_mtime, reverse=True)
    return candidates[0] if candidates else None


def interesting(line: str) -> bool:
    return "[webdav]" in line or " - WebDAV]" in line


def is_alert(line: str) -> bool:
    return any(token in line for token in ALERT)


def follow():
    positions: dict[str, int] = {}
    current_iina: Path | None = None
    last_iina_switch = 0.0
    PLUGIN_LOG.parent.mkdir(parents=True, exist_ok=True)
    PLUGIN_LOG.touch(exist_ok=True)

    print("WATCHING IINA WebDAV logs", flush=True)
    print(f"plugin={PLUGIN_LOG}", flush=True)

    while True:
        now = time.time()
        if now - last_iina_switch > 2:
            latest = newest_iina_log()
            if latest and latest != current_iina:
                current_iina = latest
                last_iina_switch = now
                print(f"SESSION {current_iina.parent.name}", flush=True)
        paths = [PLUGIN_LOG]
        if current_iina:
            paths.append(current_iina)
        for path in paths:
            key = str(path)
            try:
                size = path.stat().st_size
            except FileNotFoundError:
                continue
            pos = positions.get(key, 0)
            if size < pos:
                pos = 0
            if size == pos:
                continue
            with path.open("r", encoding="utf-8", errors="replace") as fh:
                fh.seek(pos)
                chunk = fh.read()
                positions[key] = fh.tell()
            for raw in chunk.splitlines():
                line = raw.rstrip()
                if not line:
                    continue
                if path == PLUGIN_LOG or interesting(line):
                    print(line, flush=True)
        time.sleep(0.4)


if __name__ == "__main__":
    try:
        follow()
    except KeyboardInterrupt:
        sys.exit(0)
