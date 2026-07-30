# `output/` 顶层容器注册表

这是 `output/` 顶层容器的唯一完整注册表。其他规范文件只引用本文件或给出局部示例，不再各自维护完整白名单。

<!-- output-container-registry:start -->
| 类型 | 容器 | 规则 |
|---|---|---|
| 核心内容 | `projects/`、`assets/`、`sharing/` | 分别存放项目流程、产品级长期资产和独立分享内容 |
| 工具产出 | `weekly/`、`priority/`、`strategy-sandbox/` | 只由对应 Skill 创建，不进入正式项目列表 |
| 本机归档与维护 | `_prd-corpus/`、`_archive/`、`backups/`、`.kc_scratch/` | 不进入项目列表，不作为正式项目交付 |
<!-- output-container-registry:end -->

## 使用规则

- 新增任何顶层容器前必须先在本表登记，再修改对应 Skill 或脚本。
- `sharing/articles/` 首版只存放可独立阅读的经验分享文章；培训讲义、课程和幻灯片暂不进入。
- 项目阶段产物仍放在 `projects/{项目名}/`，不得借新增顶层容器绕过项目结构。
- 独立 Skill 只能写入它对应的已登记容器。
- `output/` 整体是本机产出，不纳入 Git 版本库。
- 本机归档与维护容器不代表可外发；每类内容仍遵守各自隐私和发布边界。

## 变更流程

1. 先说明新容器与现有容器不能合并的理由。
2. 更新本注册表。
3. 更新负责创建该容器的 Skill 与检查器。
4. 运行 `python3 scripts/check-output-container-registry.py`。

不要根据 README、历史目录或临时示例自行扩展顶层容器。
