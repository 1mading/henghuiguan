#!/usr/bin/env python3
"""One-off publish-release helper when node is unavailable."""
import json
import os
import shutil
from datetime import datetime

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE, "data", "henghuiguan.json")
RELEASES_DIR = os.path.join(BASE, "releases")
RELEASE_FILE = os.path.join(RELEASES_DIR, "1.2.0.json")


def normalize_entry(raw):
    version = raw.get("version")
    if not version:
        return None
    return {
        "id": raw.get("id") or f"SU-{version.replace('.', '')}",
        "version": version,
        "title": raw.get("title") or f"v{version} 更新",
        "releaseDate": raw.get("releaseDate") or datetime.now().strftime("%Y-%m-%d"),
        "summary": raw.get("summary") or "",
        "items": raw.get("items") or [],
        "createdAt": raw.get("createdAt") or datetime.now().isoformat(),
    }


def merge_release(store, entry):
    store.setdefault("systemUpdates", [])
    idx = next(
        (i for i, u in enumerate(store["systemUpdates"]) if u.get("version") == entry["version"]),
        -1,
    )
    if idx >= 0:
        store["systemUpdates"][idx] = {**store["systemUpdates"][idx], **entry}
    else:
        store["systemUpdates"].append(entry)
    return store


def main():
    with open(RELEASE_FILE, encoding="utf-8") as f:
        entry = json.load(f)

    with open(DB_PATH, encoding="utf-8") as f:
        store = json.load(f)

    merge_release(store, normalize_entry(entry))

    for fname in sorted(os.listdir(RELEASES_DIR)):
        if not fname.endswith(".json") or fname.startswith("_"):
            continue
        with open(os.path.join(RELEASES_DIR, fname), encoding="utf-8") as f:
            raw = json.load(f)
        normalized = normalize_entry(raw)
        if normalized:
            merge_release(store, normalized)

    backup = DB_PATH + ".bak." + datetime.now().strftime("%Y%m%d-%H%M%S")
    shutil.copy2(DB_PATH, backup)
    with open(DB_PATH, "w", encoding="utf-8") as f:
        json.dump(store, f, ensure_ascii=False, separators=(",", ":"))

    versions = sorted(
        [u["version"] for u in store["systemUpdates"]],
        key=lambda s: [int(x) for x in s.split(".")],
    )
    print(f"已发布系统更新 v{entry['version']}")
    print(f"已写入 {RELEASE_FILE}")
    print(f"数据库备份: {backup}")
    print("当前记录:", ", ".join(versions))
    print("1.2.0 变更项数:", len(entry.get("items", [])))


if __name__ == "__main__":
    main()
