<!-- doctype: full -->
# [测试·反例] 某功能小迭代（bullet-bad fixture）

> 回归 fixture·**反例**：故意做成精简 bullet 版（无承重骨架），driver/pm-agent lint 应吐 `STRUCTURE_HINT: missing_skeleton`。请勿当真实 PRD 用。

## 改动点
- 现状：X 功能现在只能 A
- 本期改动：支持 B
- 现状：Y 入口藏得深
- 本期改动：挪到首屏
- 现状：Z 列表不能筛
- 本期改动：加筛选
