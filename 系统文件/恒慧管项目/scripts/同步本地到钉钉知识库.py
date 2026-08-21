# -*- coding: utf-8 -*-
"""
本地 → 钉钉知识库 单向同步（以本地为准）。

规则：
- 本地有、钉钉没有 → 上传（upload 到对应 folder）
- 钉钉有、本地没有 → 删除（delete）
- 命名以本地为准：本地文件名是权威，钉钉里对不上的旧文件视为「多余」删除

用法：
  python 同步本地到钉钉知识库.py            # dry-run 预览（默认）
  python 同步本地到钉钉知识库.py --apply     # 实际执行
"""
import subprocess
import json
import os
import re
import sys

WORKSPACE = "dy0mV49LZoJkMz89"
LOCAL_ROOT = r"E:\项目管理\全新任务活动安排\WMS项目"


def dws_nodes(folder=None):
    cmd = ["dws", "wiki", "node", "list", "--workspace", WORKSPACE]
    if folder:
        cmd += ["--folder", folder]
    out = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", timeout=60)
    if out.returncode != 0:
        raise RuntimeError(f"dws 调用失败: {out.stderr[:200]}")
    return json.loads(out.stdout).get("nodes", [])


def collect_dingtalk():
    """返回 (folders, files)：folders=相对路径->nodeId；files=去扩展名key->[(nodeId, name, ext), ...]"""
    from collections import defaultdict
    folders = {}  # 相对路径(目录) -> nodeId
    files = defaultdict(list)  # "目录/去扩展名" -> [(nodeId, name, ext)]

    def walk(nodes, path):
        for n in nodes:
            name = n.get("name", "")
            nid = n.get("nodeId", "")
            cur = (path + "/" + name) if path else name
            if n.get("nodeType") == "folder":
                folders[cur] = nid
                walk(dws_nodes(nid), cur)
            else:
                ext = n.get("extension")
                files[cur].append((nid, name, ext))
    walk(dws_nodes(), "")
    return folders, files


def collect_local():
    """返回 { '目录/去扩展名' -> [(绝对路径, 原始文件名), ...] }，排除 .py 脚本"""
    from collections import defaultdict
    local = defaultdict(list)
    for root, dirs, fnames in os.walk(LOCAL_ROOT):
        for f in fnames:
            if f.lower().endswith(".py"):
                continue  # 排除本地工具脚本，不进知识库
            abs_path = os.path.join(root, f)
            rel = os.path.relpath(abs_path, LOCAL_ROOT).replace("\\", "/")
            stem = os.path.splitext(rel)[0]  # 去扩展名
            local[stem].append((abs_path, f))
    return local


def main():
    apply_mode = "--apply" in sys.argv

    folders, dd_files = collect_dingtalk()
    local_files = collect_local()

    # 按「去扩展名」key 对比
    local_keys = set(local_files.keys())
    dd_keys = set(dd_files.keys())

    # 上传：本地有、钉钉无
    to_upload = sorted(local_keys - dd_keys)
    # 删除：钉钉有、本地无
    to_delete = sorted(dd_keys - local_keys)

    print(f"本地文件 {len(local_keys)} | 钉钉文件 {len(dd_keys)}")
    print(f"待上传 {len(to_upload)} | 待删除 {len(to_delete)}")
    print("=" * 60)

    if to_upload:
        print("\n【待上传】（本地有、钉钉无）")
        for key in to_upload:
            for abs_path, fname in local_files[key]:
                print(f"  → {key}  ({fname})")

    if to_delete:
        print("\n【待删除】（钉钉有、本地无）")
        for key in to_delete:
            for nid, name, ext in dd_files[key]:
                print(f"  ✗ {key}  ({name}.{ext if ext else ''})")

    if not apply_mode:
        print("\n[DRY-RUN] 未执行任何操作。确认后用 --apply 实际执行。")
        return

    # 实际执行
    print("\n开始实际执行...")
    up_ok = up_fail = 0
    for key in to_upload:
        parent_rel = os.path.dirname(key).replace("\\", "/")
        parent_nid = folders.get(parent_rel)
        for abs_path, fname in local_files[key]:
            cmd = ["dws", "drive", "upload", "--file", abs_path, "--workspace", WORKSPACE]
            if parent_nid:
                cmd += ["--folder", parent_nid]
            cmd += ["--file-name", fname]
            r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", timeout=120)
            if r.returncode == 0:
                up_ok += 1
                print(f"  ↑ {key} ({fname})")
            else:
                up_fail += 1
                print(f"  ✗ 上传失败 {key} ({fname}): {r.stderr[:120]}")

    del_ok = del_fail = 0
    for key in to_delete:
        for nid, name, ext in dd_files[key]:
            r = subprocess.run(
                ["dws", "wiki", "node", "delete", "--workspace", WORKSPACE, "--node", nid, "--yes"],
                capture_output=True, text=True, encoding="utf-8", timeout=60)
            if r.returncode == 0:
                del_ok += 1
                print(f"  ✗ 已删除 {key} ({name}.{ext if ext else ''})")
            else:
                del_fail += 1
                print(f"  ✗ 删除失败 {key}: {r.stderr[:120]}")

    print(f"\n完成：上传成功 {up_ok} / 失败 {up_fail}；删除成功 {del_ok} / 失败 {del_fail}")


if __name__ == "__main__":
    main()
