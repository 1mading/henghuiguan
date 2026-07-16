# -*- coding: utf-8 -*-
"""覆盖 MES点检表1.0版本上线 项目任务（删除旧任务并写入压缩版 15 条）。"""
from __future__ import annotations

import json
import random
import string
from copy import deepcopy
from datetime import datetime
from pathlib import Path

DB = Path(__file__).resolve().parent.parent / "server" / "data" / "henghuiguan.json"
BACKUP_DIR = DB.parent / "backups"
PROJ_NAME = "MES点检表1.0版本上线"

WYB = "王元斌 Martin"
HY = "黄艳-信息中心"
LY = "刘易"
WZW = "吴志伟"


def gen_id(prefix: str) -> str:
    return f"{prefix}-{''.join(random.choices(string.ascii_uppercase + string.digits, k=4))}"


def collab_entries(names: list[str], assignee: str) -> list[dict]:
    out = []
    for name in names:
        name = (name or "").strip()
        if not name or name == assignee:
            continue
        out.append({
            "id": gen_id("COL"),
            "userName": name,
            "type": "inform",
            "status": "active",
        })
    return out


def make_task(
    *,
    project_id: str,
    parent_id: str | None,
    title: str,
    desc: str,
    assignee: str,
    collaborators: list[str],
    priority: str,
    hours: float,
    start: str,
    due: str,
    task_type: str = "normal",
    status: str = "todo",
    progress: int = 0,
) -> dict:
    entries = collab_entries(collaborators, assignee)
    return {
        "id": gen_id("T"),
        "projectId": project_id,
        "parentId": parent_id,
        "title": title,
        "desc": desc,
        "assignee": assignee,
        "collaboratorEntries": entries,
        "collaborators": [e["userName"] for e in entries],
        "creator": WYB,
        "status": status,
        "priority": priority,
        "type": task_type,
        "dueDate": due,
        "progress": progress,
        "estimatedHours": hours,
        "actualHours": 0,
        "dailyHours": None,
        "planStartDate": start,
        "actualStartDate": None,
        "actualEndDate": None,
        "createdAt": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "dependencyMeta": {},
    }


def main() -> None:
    data = json.loads(DB.read_text(encoding="utf-8"))
    project = next((p for p in data["projects"] if p.get("name") == PROJ_NAME), None)
    if not project:
        raise SystemExit(f"未找到项目：{PROJ_NAME}")

    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup = BACKUP_DIR / f"henghuiguan.before-mes-overwrite-{stamp}.json"
    backup.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    pid = project["id"]
    old_ids = {t["id"] for t in data["tasks"] if t.get("projectId") == pid}

    # 清理依赖
    deps = data.get("taskDependencies") or []
    data["taskDependencies"] = [
        d for d in deps
        if d.get("fromTaskId") not in old_ids
        and d.get("toTaskId") not in old_ids
        and d.get("taskId") not in old_ids
        and d.get("dependsOnTaskId") not in old_ids
        and d.get("sourceTaskId") not in old_ids
        and d.get("targetTaskId") not in old_ids
    ]

    # 删除旧任务
    data["tasks"] = [t for t in data["tasks"] if t.get("projectId") != pid]

    # 覆盖项目元数据
    project["desc"] = "MES点检模块；初版已交付现场推进；目标2026-08-15验收关闭"
    project["dept"] = "实施交付部"
    project["manager"] = WYB
    project["status"] = "active"
    project["startDate"] = "2026-06-01"
    project["endDate"] = "2026-08-15"
    project["archived"] = False
    if "teamMembers" not in project:
        project["teamMembers"] = []
    for name in (LY, WZW, HY):
        if name not in project["teamMembers"] and name != project["manager"]:
            project["teamMembers"].append(name)

    new_tasks: list[dict] = []

    def add_phase(title: str, desc: str, assignee: str, collabs: list[str], start: str, due: str) -> dict:
        t = make_task(
            project_id=pid, parent_id=None, title=title, desc=desc,
            assignee=assignee, collaborators=collabs, priority="urgent",
            hours=0, start=start, due=due, status="todo",
        )
        new_tasks.append(t)
        return t

    def add_leaf(
        parent: dict, title: str, desc: str, assignee: str, collabs: list[str],
        priority: str, hours: float, start: str, due: str,
        task_type: str = "normal", status: str = "todo", progress: int = 0,
    ) -> dict:
        t = make_task(
            project_id=pid, parent_id=parent["id"], title=title, desc=desc,
            assignee=assignee, collaborators=collabs, priority=priority,
            hours=hours, start=start, due=due, task_type=task_type,
            status=status, progress=progress,
        )
        new_tasks.append(t)
        return t

    # 1 已完成留痕
    p1 = add_phase("已完成留痕", "需求/开发/现场交付已完成，仅留痕", WYB, [HY], "2026-06-01", "2026-07-15")
    add_leaf(p1, "需求整理与范围确认", "【已完成】业务需求、1.0边界、验收标准初稿",
             WYB, [], "important", 24, "2026-06-01", "2026-06-18", status="done", progress=100)
    add_leaf(p1, "初版开发与交付包", "【已完成】核心功能开发、联调自测、交付包准备",
             WZW, [WYB], "urgent", 52, "2026-06-10", "2026-07-10", status="done", progress=100)
    add_leaf(p1, "初版现场接收与启动推进", "【已完成】现场部署开通、对接产线班组启动试用",
             LY, [HY], "urgent", 12, "2026-07-08", "2026-07-15", status="done", progress=100)

    # 2 现场闭环
    p2 = add_phase("现场试运行与问题闭环", "试运行、问题闭环；M1=07-22清单冻结，M2=08-05试点稳定",
                   LY, [HY, WZW], "2026-07-16", "2026-08-05")
    add_leaf(p2, "试点推进与问题收集", "明确试点范围；日常督促执行；收集卡点/体验/数据问题；周同步",
             LY, [HY], "urgent", 24, "2026-07-16", "2026-07-31")
    add_leaf(p2, "问题清单分级与冻结", "【M1·07-22】汇总台账、分级归类、冻结1.0必修项并确认排期责任",
             WYB, [HY], "urgent", 8, "2026-07-18", "2026-07-23")
    add_leaf(p2, "缺陷修复与改版发布", "阻塞/重要问题修复，发布现场可用版本并出变更说明",
             WZW, [WYB], "urgent", 23, "2026-07-20", "2026-07-31")
    add_leaf(p2, "现场回归与台账回写", "逐条验证必修项；关闭/重开/降级回写问题台账",
             LY, [HY], "urgent", 11, "2026-07-23", "2026-08-02")
    add_leaf(p2, "试点稳定运行", "【M2·08-05】主流程连续跑通；完成率/异常抽查；确认可正式启用",
             LY, [WZW, HY], "urgent", 14, "2026-07-25", "2026-08-05")

    # 3 培训上线
    p3 = add_phase("培训与正式启用", "【M3·08-10】培训与正式切换", LY, [HY, WZW], "2026-08-01", "2026-08-15")
    add_leaf(p3, "操作指引与FAQ", "操作工/班长指引 + 常见问题FAQ",
             WYB, [HY], "important", 8, "2026-08-01", "2026-08-05")
    add_leaf(p3, "分角色培训", "场次安排、操作工/班长培训、答疑补训",
             LY, [HY], "important", 10, "2026-08-04", "2026-08-08")
    add_leaf(p3, "正式切换启用", "【M3·08-10】切换方案确认、生产环境检查、正式切换宣布与执行",
             LY, [WZW, HY], "urgent", 7, "2026-08-07", "2026-08-10")
    add_leaf(p3, "上线首周支持", "日清分派、现场保障、紧急快修、首周运行小结",
             LY, [WZW, HY], "urgent", 18, "2026-08-08", "2026-08-15")

    # 4 验收收尾
    p4 = add_phase("验收与收尾", "【M4·08-15】验收签字与移交", WYB, [HY, LY], "2026-08-10", "2026-08-15")
    add_leaf(p4, "上线验收", "【M4·08-15】验收材料、对照标准走查、签字确认",
             WYB, [LY, HY], "urgent", 6, "2026-08-10", "2026-08-15")
    add_leaf(p4, "移交与总结", "1.1遗留清单、运维移交说明、项目总结纪要",
             WYB, [HY], "normal", 6, "2026-08-13", "2026-08-15")

    # 5 临时
    p5 = add_phase("临时支持", "范围外临时诉求，不挤占主路径", WYB, [HY], "2026-07-16", "2026-08-15")
    add_leaf(p5, "客户临时需求支持", "范围外诉求单独记工时；评估是否影响8/15验收",
             WYB, [WZW, LY, HY], "urgent", 4, "2026-07-16", "2026-08-15", task_type="temp")

    # 自检：禁止 parentId 自引用
    for t in new_tasks:
        if t["parentId"] == t["id"]:
            raise SystemExit(f"自引用 parentId: {t['id']} {t['title']}")

    data["tasks"].extend(new_tasks)
    DB.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    roots = [t for t in new_tasks if not t["parentId"]]
    leaves = [t for t in new_tasks if t["parentId"]]
    print(f"backup: {backup}")
    print(f"project: {pid} {PROJ_NAME}")
    print(f"removed_old_tasks: {len(old_ids)}")
    print(f"new_tasks: {len(new_tasks)} (roots={len(roots)}, leaves={len(leaves)})")
    print(f"dates: {project['startDate']} ~ {project['endDate']}")


if __name__ == "__main__":
    main()
