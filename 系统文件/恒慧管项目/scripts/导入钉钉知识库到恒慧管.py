# -*- coding: utf-8 -*-
"""
通用：把钉钉知识库某空间，按「文件夹=里程碑/任务，文件=附件」规则导入恒慧管。

映射：
- 知识库根下 00~05 阶段文件夹 = 6 个里程碑（isMilestone）
- 阶段下的子文件夹 = 任务（挂里程碑），递归展开
- 文件 = 附件（source=dingtalk_wiki），挂到所属文件夹任务/里程碑下
- 自动带 M1~M7 门禁

用法：
  python 导入钉钉知识库到恒慧管.py <workspaceId> <项目名> <负责人> [输出文件]
"""
import subprocess
import json
import os
import re
import sys

DOC_URL_PREFIX = "https://alidocs.dingtalk.com/i/nodes/{nodeId}?utm_scene=team_space"

GATES = {
    "00": ["M1 厂商选型定标", "M2 采购合同+SLA签订"],
    "01": ["M3 项目启动会召开"],
    "02": ["M4 需求确认签字", "M5 实施计划审批"],
    "05": ["M6 验收签字", "M7 运维交接+复盘"],
}


def dws_nodes(workspace, folder=None):
    """调 dws 列出知识库节点（直接子节点）。"""
    cmd = ["dws", "wiki", "node", "list", "--workspace", workspace]
    if folder:
        cmd += ["--folder", folder]
    out = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", timeout=60)
    if out.returncode != 0:
        raise RuntimeError(f"dws 调用失败: {out.stderr[:200]}")
    data = json.loads(out.stdout)
    return data.get("nodes", [])


def wiki_attachment(name, node_id, workspace):
    return {
        "id": "ATT-" + node_id[:12],
        "source": "dingtalk_wiki",
        "nodeId": node_id,
        "workspaceId": workspace,
        "name": name,
        "url": DOC_URL_PREFIX.format(nodeId=node_id),
    }


def gen_task_id(project_id, node_id, seq):
    """基于 nodeId 后 8 位 + 全局序号生成唯一任务 id，避免冲突。"""
    tail = re.sub(r"[^A-Za-z0-9]", "", node_id[-8:])
    seq[0] += 1
    return f"{project_id}-T{tail}{seq[0]:03d}"


def build_node(workspace, project_id, manager, node, seq, is_milestone=False):
    """递归把单个 folder 节点构建成任务树（带临时 _children 字段）。"""
    name = node.get("name", "")
    nid = node.get("nodeId", "")
    tid = gen_task_id(project_id, nid, seq)
    children_nodes = dws_nodes(workspace, nid)
    task = {
        "id": tid,
        "title": name,
        "projectId": project_id,
        "parentId": None,
        "isMilestone": is_milestone,
        "type": "normal",
        "assignee": manager,
        "attachments": [],
    }
    kids = []
    for c in children_nodes:
        if c.get("nodeType") == "folder":
            kids.append(build_node(workspace, project_id, manager, c, seq))
        else:
            task["attachments"].append(wiki_attachment(c.get("name", ""), c.get("nodeId", ""), workspace))
    task["_children"] = kids
    return task


def flatten(task, parent_id, out):
    """把树拍平成带正确 parentId 的扁平列表。"""
    tid = task["id"]
    task["parentId"] = parent_id
    kids = task.pop("_children", [])
    out.append(task)
    for k in kids:
        flatten(k, tid, out)


def build_payload(workspace, project_name, manager, project_id=None):
    if not project_id:
        raw = re.sub(r"[^A-Za-z0-9]", "", project_name) or "PROJ"
        project_id = "PRJ-" + raw[:24]

    # 拉取知识库根节点
    roots = dws_nodes(workspace)

    projects = [{"id": project_id, "name": project_name, "manager": manager, "status": "active"}]
    tasks = []
    seq = [0]

    # 根下的 00~05 阶段文件夹 = 里程碑
    phase_milestones = {}  # phase_key -> milestone id
    milestone_trees = []  # (key, 里程碑任务树)
    for n in roots:
        name = n.get("name", "")
        nid = n.get("nodeId", "")
        ntype = n.get("nodeType", "")
        m = re.match(r"^(\d{2})-", name)
        if ntype == "folder" and m:
            key = m.group(1)
            mid = f"{project_id}-M{key}"
            phase_milestones[key] = mid
            # 直接构建里程碑树（isMilestone=True），内部递归挂子任务
            tree = build_node(workspace, project_id, manager, n, seq, is_milestone=True)
            tree["id"] = mid  # 里程碑用固定 id，便于门禁引用
            milestone_trees.append((key, tree))

    # 拍平里程碑树
    for key, tree in milestone_trees:
        flatten(tree, None, tasks)

    # M1~M7 门禁
    for key, gates in GATES.items():
        mid = phase_milestones.get(key)
        if not mid:
            continue
        for g in gates:
            tasks.append({
                "id": f"{project_id}-G-{key}-{g.split(' ')[0]}",
                "title": f"【里程碑】{g}",
                "projectId": project_id,
                "parentId": mid,
                "type": "normal",
                "assignee": manager,
                "priority": "important",
            })

    return {"withTemplate": False, "projects": projects, "tasks": tasks}


def main():
    workspace = sys.argv[1]
    project_name = sys.argv[2] if len(sys.argv) > 2 else "未命名项目"
    manager = sys.argv[3] if len(sys.argv) > 3 else "王元斌"
    out = sys.argv[4] if len(sys.argv) > 4 else os.path.join(os.getcwd(), "恒慧管导入payload.json")

    payload = build_payload(workspace, project_name, manager)

    with open(out, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    milestones = [t for t in payload["tasks"] if t.get("isMilestone")]
    normals = [t for t in payload["tasks"] if not t.get("isMilestone")]
    total_att = sum(len(t.get("attachments", [])) for t in payload["tasks"])
    print(f"项目: {project_name} ({payload['projects'][0]['id']})")
    print(f"里程碑: {len(milestones)} | 普通任务: {len(normals)} | 附件总数: {total_att}")
    print(f"输出: {out}")
    for m in milestones:
        def count_sub(t):
            c = len(t.get("attachments", []))
            return c
        print(f"  [{m['title']}] 附件 {len(m['attachments'])} 个")


if __name__ == "__main__":
    main()
