<!-- doctype: decision_review -->
# [测试·决策评审] 某能力路线决策（decision-review-good fixture）

> 回归 fixture：决策评审型（4 节骨架），driver/pm-agent lint 应**跳过骨架检查**、吐 `STRUCTURE_HINT: skipped_decision_review`（不得因"缺 §六详细功能设计"报 missing_skeleton）。

---

## 一、为什么要做

某场景现状 A，试点反馈 B（原话："……"），影响 N 个学校。

## 二、打算怎么做（推荐路线）

推荐路线一：维持现状以外，做最小闭环 X。

## 三、需要决策的内容

| 决策点 | 选项 A | 选项 B | 维持现状 | 推荐 |
|--------|--------|--------|---------|------|
| 走哪条路 | 快但浅 | 慢但全 | 不动 | A（理由：先验证） |

## 四、主要风险

- 风险一：依赖未定 → 缓解：先小范围。
