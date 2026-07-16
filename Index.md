# Index.md · 项目索引（P2）

## 目录结构（简图）

```text
企业工单系统文件/          ← 仓库根目录
├── Agent.md / Memory.md / Index.md / README.md
├── .ai/devlog.md
├── .cursor/ / .githooks/ / .gitignore   ← 工具目录（无法并入 md）
└── 恒慧管项目/                          ← 全部业务与资源
    ├── 恒慧管.html / 滚动大屏.html
    ├── scripts/
    └── server/
        ├── src/ miniapp/ docs/ releases/ data/
        └── 恒慧管/   # 钉钉样例，非主业务
```

## 模块归属

| 路径 | 归属 |
|------|------|
| `恒慧管项目/恒慧管.html` | H5 主业务 |
| `恒慧管项目/滚动大屏.html` | 会议室大屏 |
| `恒慧管项目/server/src/` | API、鉴权、同步、权限工具 |
| `恒慧管项目/server/miniapp/` | 正式钉钉小程序 |
| `恒慧管项目/server/恒慧管/` | 钉钉样例/演示（**AI 默认勿改**） |
| `恒慧管项目/server/docs/` | 操作手册与钉钉配置指南 |
| `恒慧管项目/server/releases/` | 正式版本 json 与 `_pending.json` |
| `恒慧管项目/server/data/` | 业务库、备份、上传（运行时） |
| `恒慧管项目/scripts/` | 仓库级工具（如 `check-secrets.js`） |
| `恒慧管项目/恒慧管-需求整理.md` | 已实现 / 待落地需求对照 |

## AI 禁止行为

**文件体系：**

- 禁止在标准目录结构外新增文件（业务与资源只落在 `恒慧管项目/` 及上方简图所列路径）
- 禁止修改文件体系而不通知负责人（改目录/搬迁前先说明并征得确认）
- 禁止删除已有目录或文件（除非用户明确要求；业务数据须先说明备份）
- 禁止将配置硬编码到代码中

**安全与流程：**

- 将密钥、`.env`、`config.js`、真实 seed、`server/data/` 写入 Git 或文档正文
- 用户未确认发版时运行 `publish-release`
- 大范围重写无关模块或「顺手」重构
- 默认改动 `恒慧管项目/server/恒慧管/` 样例目录
- 主动实现需求池中用户未提出的条目
