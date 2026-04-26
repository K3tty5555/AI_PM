---
id: PATTERN-007
category: patterns
tags: [md2docx, 工程脚手架, 原型目录, manifest]
source-project: 教育超级智能体-20260425
created: 2026-04-25
confidence: high
---

# md2docx 截图路径用 manifest 推断 prototype 目录，不写死 06-prototype/

## 问题场景

一个项目有多个原型目录并存时（如 V1.1+V1.2 共用 `06-prototype/`、V1.3 独立 `06-prototype-v1.3/`），原 md2docx.py 写死了 `project_dir / '06-prototype' / s['screenshot']`，导致 V1.3 的 manifest label 全部解析失败——img_path 找不到，截图静默不嵌入。

具象表现：导出 V1.3 docx 时，"截图映射" 只 print 1 行（碰巧 `01-welcome.png` 在 V1.1 目录里也存在的那个），其余 4 个 label 全静默丢弃，docx 里只少 4 张图，不报错。

## 解决方案

### 路径解析改为从 manifest 推断

manifest 约定文件路径是 `<prototype>/screenshots/manifest.json`，所以 `manifest_path.parent.parent` 就是 prototype 目录。

```python
# 旧（硬编码）
img_path = project_dir / '06-prototype' / s['screenshot']

# 新（从 manifest 推断）
manifest_p = Path(manifest_path).resolve()
prototype_dir = manifest_p.parent.parent
img_path = (prototype_dir / s['screenshot']).resolve()
```

### 行为等价性

旧调用方传 `06-prototype/screenshots/manifest.json` 时，新代码 `manifest_p.parent.parent = project_dir/06-prototype`，等价于旧逻辑。所以**只新增能力，不破坏存量**。

### manifest 写法

每个原型目录维护自己的 manifest，screenshot 字段写相对于本原型的路径（`screenshots/xx.png`），不需要 `..` 跳级：

```json
// 06-prototype-v1.3/screenshots/manifest.json
{
  "sections": [
    { "label": "精准教学欢迎屏", "screenshot": "screenshots/01-welcome.png" },
    ...
  ]
}
```

## 验证

- 教育超级智能体项目 V1.1（10 张）/ V1.2（4 张）/ V1.3（5 张）三份 docx 全部正常嵌入截图
- V1.1 / V1.2 行为零变化（manifest 仍在 `06-prototype/` 下）
- V1.3 的 5 张全部映射成功（`prototype_dir = .../06-prototype-v1.3`）

## 适用场景

- 一个项目内有多个版本的原型目录共存（V1.x 老原型 + V2 新原型）
- 同时维护多个产品线的原型，路径前缀不一致
- 任何"原型目录不一定叫 06-prototype"的场景

## 反模式

- ❌ 在 manifest 里用 `../06-prototype-v1.3/screenshots/...` 跳级路径绕过硬编码——能 work 但不优雅，且其他工具（如直接读 manifest 的脚本）会再踩坑
- ❌ 把 V1.3 截图复制到 `06-prototype/` 下加 `v13-` 前缀——冗余，原型代码与截图脱节
- ❌ 在 SKILL.md / CLAUDE.md 里加一条"V1.3 原型必须放 06-prototype/"的约束——这是把工程问题转嫁给写作规范

## 关键原则

**约定路径优先用相对锚点（manifest 自身位置），不写死目录名**。manifest 是数据，prototype dir 是元数据，让数据自己描述自己的位置比硬编码强。

## 相关文件

- `.claude/skills/ai-pm-prd/md2docx.py` 第 480-491 行
- `templates/prd-styles/default/feishu-template.md`（原型示意行规范）
- `templates/configs/`（manifest 写法）
