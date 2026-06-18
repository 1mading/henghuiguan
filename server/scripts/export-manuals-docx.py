#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""将恒慧管操作手册导出为 Word（总经理/管理员、部门经理）。"""

from __future__ import annotations

import re
import sys
from pathlib import Path

try:
    from docx import Document
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.oxml.ns import qn
    from docx.shared import Cm, Pt, RGBColor
except ImportError:
    print('请先安装: pip install python-docx', file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / 'docs' / '操作手册'
OUT_DIR = DOCS


def set_doc_style(doc: Document) -> None:
    style = doc.styles['Normal']
    style.font.name = '微软雅黑'
    style.font.size = Pt(11)
    style._element.rPr.rFonts.set(qn('w:eastAsia'), '微软雅黑')


def add_title(doc: Document, text: str, level: int = 0) -> None:
    if level == 0:
        p = doc.add_heading(text, level=0)
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        for run in p.runs:
            run.font.name = '微软雅黑'
            run._element.rPr.rFonts.set(qn('w:eastAsia'), '微软雅黑')
            run.font.color.rgb = RGBColor(0x1F, 0x29, 0x37)
    else:
        doc.add_heading(text, level=min(level, 3))


def add_paragraph(doc: Document, text: str, *, quote: bool = False, bold: bool = False) -> None:
    p = doc.add_paragraph()
    if quote:
        p.paragraph_format.left_indent = Cm(0.5)
        run = p.add_run(text)
        run.font.color.rgb = RGBColor(0x6B, 0x72, 0x80)
        run.italic = True
    elif bold:
        run = p.add_run(text)
        run.bold = True
    else:
        add_rich_text(p, text)


def add_rich_text(paragraph, text: str) -> None:
    """支持 **bold** 与 `code` 的简单行内格式。"""
    parts = re.split(r'(\*\*[^*]+\*\*|`[^`]+`)', text)
    for part in parts:
        if not part:
            continue
        if part.startswith('**') and part.endswith('**'):
            run = paragraph.add_run(part[2:-2])
            run.bold = True
        elif part.startswith('`') and part.endswith('`'):
            run = paragraph.add_run(part[1:-1])
            run.font.name = 'Consolas'
            run.font.size = Pt(10)
        else:
            paragraph.add_run(part)


def parse_table_rows(lines: list[str]) -> list[list[str]]:
    rows = []
    for line in lines:
        line = line.strip()
        if not line.startswith('|'):
            continue
        if re.match(r'^\|[\s\-:|]+\|$', line):
            continue
        cells = [c.strip() for c in line.strip('|').split('|')]
        rows.append(cells)
    return rows


def add_table(doc: Document, rows: list[list[str]]) -> None:
    if not rows:
        return
    cols = max(len(r) for r in rows)
    table = doc.add_table(rows=len(rows), cols=cols)
    table.style = 'Table Grid'
    for i, row in enumerate(rows):
        for j in range(cols):
            cell_text = row[j] if j < len(row) else ''
            cell = table.rows[i].cells[j]
            cell.text = ''
            p = cell.paragraphs[0]
            add_rich_text(p, cell_text)
            if i == 0:
                for run in p.runs:
                    run.bold = True


def md_to_docx(doc: Document, md_text: str) -> None:
    lines = md_text.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        if not stripped:
            i += 1
            continue

        if stripped == '---':
            doc.add_paragraph('')
            i += 1
            continue

        if stripped.startswith('#'):
            level = len(stripped) - len(stripped.lstrip('#'))
            title = stripped.lstrip('#').strip()
            add_title(doc, title, level)
            i += 1
            continue

        if stripped.startswith('>'):
            quote_lines = []
            while i < len(lines) and lines[i].strip().startswith('>'):
                quote_lines.append(lines[i].strip().lstrip('>').strip())
                i += 1
            add_paragraph(doc, ' '.join(quote_lines), quote=True)
            continue

        if stripped.startswith('|'):
            table_lines = []
            while i < len(lines) and lines[i].strip().startswith('|'):
                table_lines.append(lines[i])
                i += 1
            add_table(doc, parse_table_rows(table_lines))
            continue

        if re.match(r'^[-*]\s+', stripped):
            items = []
            while i < len(lines) and re.match(r'^[-*]\s+', lines[i].strip()):
                items.append(re.sub(r'^[-*]\s+', '', lines[i].strip()))
                i += 1
            for item in items:
                p = doc.add_paragraph(style='List Bullet')
                add_rich_text(p, item)
            continue

        if re.match(r'^\d+\.\s+', stripped):
            items = []
            while i < len(lines) and re.match(r'^\d+\.\s+', lines[i].strip()):
                items.append(re.sub(r'^\d+\.\s+', '', lines[i].strip()))
                i += 1
            for item in items:
                p = doc.add_paragraph(style='List Number')
                add_rich_text(p, item)
            continue

        if stripped.startswith('```'):
            i += 1
            code_lines = []
            while i < len(lines) and not lines[i].strip().startswith('```'):
                code_lines.append(lines[i])
                i += 1
            if i < len(lines):
                i += 1
            p = doc.add_paragraph()
            run = p.add_run('\n'.join(code_lines))
            run.font.name = 'Consolas'
            run.font.size = Pt(10)
            p.paragraph_format.left_indent = Cm(0.8)
            continue

        para_lines = [stripped]
        i += 1
        while i < len(lines):
            nxt = lines[i].strip()
            if not nxt or nxt.startswith('#') or nxt == '---' or nxt.startswith('|') or nxt.startswith('>') or re.match(r'^[-*]\s+', nxt) or re.match(r'^\d+\.\s+', nxt) or nxt.startswith('```'):
                break
            para_lines.append(nxt)
            i += 1
        add_paragraph(doc, ' '.join(para_lines))


SUPPLEMENT_GM = """
## 补充说明（2026-06 更新）

### 任务留言与 @ 提醒

- 任务详情 **留言讨论**：项目负责人、协办人、任务负责人及总经理/管理员可留言。
- 输入 **@** 弹出可选人员（负责人、协办人、项目负责人）；被 @ 且已绑定 userid 的人员会收到钉钉 **【恒慧管·留言提及】** 通知。
- 留言区 **Ctrl+V 粘贴图片**，发送前/发送后均可 **点击放大预览**。
- 任务 **附件区** 点击后 **Ctrl+V** 可粘贴截图（正式交付材料）。

### 团队饱和度

- 团队管理页的饱和度统计为 **当周** 预计/实际工时（按工作日历计算）。
"""

SUPPLEMENT_MANAGER = """
## 补充说明（2026-06 更新）

### 人员档案（部门经理）

- 部门经理可进入 **人员档案**，查看 **本部门** 人员。
- 可编辑本部门 **执行人员** 的职位、直属上级、标准周工时。
- **不可**：同步钉钉通讯录、添加人员、修改角色/部门/姓名。人员绑定请联系总经理/管理员。

### 任务留言与 @ 提醒

- 任务详情 **留言讨论**：项目负责人、协办人、任务负责人及本部门经理可留言。
- 输入 **@** 提及相关人员，对方会收到钉钉 **留言提及** 通知（需已绑定 userid）。
- 留言与任务附件均支持 **Ctrl+V 粘贴图片**；图片可点击放大预览。

### 团队饱和度

- 团队管理饱和度按 **当周** 工时统计。
"""


def read_md(name: str) -> str:
    path = DOCS / name
    if not path.exists():
        raise FileNotFoundError(path)
    return path.read_text(encoding='utf-8')


def build_gm_doc() -> Document:
    doc = Document()
    set_doc_style(doc)
    add_title(doc, '恒慧管 · 总经理 / 管理员 操作手册', 0)
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run('部门内部项目管控系统 · 正式环境从钉钉工作台打开\n访问地址：https://henghuiguan.handagroup.com/app')
    run.font.size = Pt(10)
    run.font.color.rgb = RGBColor(0x6B, 0x72, 0x80)
    doc.add_paragraph('')

    md_to_docx(doc, read_md('00-通用说明.md'))
    doc.add_page_break()
    md_to_docx(doc, read_md('01-总经理与管理员.md'))
    md_to_docx(doc, SUPPLEMENT_GM)
    return doc


def build_manager_doc() -> Document:
    doc = Document()
    set_doc_style(doc)
    add_title(doc, '恒慧管 · 部门经理 操作手册', 0)
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run('部门内部项目管控系统 · 正式环境从钉钉工作台打开\n访问地址：https://henghuiguan.handagroup.com/app')
    run.font.size = Pt(10)
    run.font.color.rgb = RGBColor(0x6B, 0x72, 0x80)
    doc.add_paragraph('')

    md_to_docx(doc, read_md('00-通用说明.md'))
    doc.add_page_break()
    md_to_docx(doc, read_md('02-部门经理.md'))
    md_to_docx(doc, SUPPLEMENT_MANAGER)
    return doc


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    gm_path = OUT_DIR / '恒慧管-总经理与管理员操作手册.docx'
    mgr_path = OUT_DIR / '恒慧管-部门经理操作手册.docx'

    build_gm_doc().save(str(gm_path))
    build_manager_doc().save(str(mgr_path))

    print(f'已生成: {gm_path}')
    print(f'已生成: {mgr_path}')


if __name__ == '__main__':
    main()
