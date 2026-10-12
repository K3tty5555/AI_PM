# AI_PM 更新日志

## v0.6.4  (2026-10-12)

自 `v0.6.3` 起共 6 次改动。

- 2026-10-12 `3e7d1e7` feat(hooks): 解压安装的 AI_PM 开场显示当前版本
- 2026-10-12 `f3451fa` merge: 开场显示当前版本并入 main
- 2026-10-12 `6cae3cc` docs(changelog): 补 v0.6.4 版本块（开场显示当前版本）
- 2026-10-12 `2294138` merge: v0.6.4 更新日志并入 main
- 2026-10-12 `2f83921` fix(hooks): 版本行改用 systemMessage 显示给用户，其余开场提示仍交给 Claude
- 2026-10-12 `8962eba` merge: 开场版本行对用户可见并入 main

## v0.6.3  (2026-10-12)

自 `v0.6.2` 起共 2 次改动。

- 2026-10-12 `3961a06` feat(package): 私有包携带个人目录技能与 Playwright MCP 配置
- 2026-10-12 `e16de1d` merge: 私有包携带个人目录技能与 Playwright MCP 配置并入 main

## v0.6.2  (2026-10-12)

自 `v0.6.1` 起共 9 次改动。

- 2026-10-12 `2de9b3d` feat(package): 分发包改为平铺 AI_PM.zip，升级材料收进 .aipm-dist/
- 2026-10-12 `c0c0e6d` feat(package): 打包守门——工作区须干净、私有缺失即失败、不覆盖、路径预检、条目属性显式化
- 2026-10-12 `ce5a671` feat(package): 校验器改读 zip——zip 层/路径层/kind 内容检查，读坏不崩，规则从打包器导入
- 2026-10-12 `1de49ca` test(package): 解压验收——ditto/unzip 实解，核对根下即 AI_PM、执行位、中文名、历史原件搜不到
- 2026-10-12 `b2bebca` feat(update): 升级改用新包文件夹——阶段 0 读新规则、合并前护栏、base 按文件推进与续跑、.aipm-dist 切换与回滚
- 2026-10-12 `93ce7ec` fix(update): 回滚优先取中断标记的备份、中断检查前移、留痕先于挪标记、按文件推进的报告措辞
- 2026-10-12 `4edf0f3` fix(package): 校验器坏文件名编码与非字符串 probe_paths 不再崩、打包前拦大小写/Unicode 重名、私有输入缺席报 N/A
- 2026-10-12 `4e0fa73` fix(update): 前缀按路径段比、覆盖检查改比留痕 to_commit 并前移、保守路径标 held 不续跑、受管清单取 manifest、回滚留痕跳过已退轮次
- 2026-10-12 `7306d46` merge: 分发包改为解压即可用的 AI_PM.zip 并入 main

## v0.6.1  (2026-10-12)

自 `6ef8f84` 起共 43 次改动。

- 2026-10-08 `89d95bc` feat(update): 报告与对账格式契约
- 2026-10-08 `797e1f0` fix(package): file_count 与 tar 条目对齐，kind 非法即报错
- 2026-10-08 `d8c9faa` fix(update): changelog 补幂等闸、版本块定位与 tag 取日
- 2026-10-08 `9f97363` feat(update): 升级 skill 主入口与命令路由登记
- 2026-10-08 `19550ca` feat(package): 分发包安全线校验器
- 2026-10-08 `45c8beb` fix(update): 对账闸断言锁定字段与规则方向
- 2026-10-08 `dd6d915` feat(package): 补内容寻址 history 与公共包历史安全线
- 2026-10-08 `f5968bc` test(update): 接入升级打包回归与忽略分发产物
- 2026-10-08 `b0ade2a` fix(package): 历史范围严格对齐受管白名单与索引路径
- 2026-10-08 `be7bb0a` fix(update): 补整版历史快照供 base 识别
- 2026-10-09 `0e38cc4` fix(update): 补注册表登记与 update 命令路由接线
- 2026-10-09 `ee3d170` test(package): 打包器测试对私有输入环境敏感，修 fresh-clone 假绿
- 2026-10-09 `27b1c4e` merge: AI_PM 版本升级能力（aipm-update）并入 main
- 2026-10-09 `ca62b18` feat(intake): 只读扫描器——排除表/分类/哈希去重/凭证/可注入撞名检测/簇聚合/报告
- 2026-10-09 `44ae3fc` fix(intake): _skill_collisions 默认含用户级目录，() 为测试固定空面
- 2026-10-09 `5ecea7a` feat(intake): 写侧执行器——路径传参/多簇合并/三分支幂等/子路径保留/装载复查
- 2026-10-09 `9462acb` fix(intake): finish 按簇去重计待处理、active_prd 校验前移、续传不重复记 skip
- 2026-10-09 `9e6cd04` feat(intake): skill 本体——三阶段编排/stage置位/巨型簇下钻/claims提炼
- 2026-10-09 `f35bd7b` fix(intake): SKILL.md 盘点命令补 scan 子命令
- 2026-10-09 `22f264d` feat(intake): 主控路由/白名单/registry/速查表接线，补 update 速查表历史漏
- 2026-10-09 `881dffb` test(intake): 契约测试锁定三件套，接入回归与fresh-clone白名单
- 2026-10-09 `c856478` fix(intake): 恢复路由表 [路径] 参数，契约断言改前缀匹配
- 2026-10-09 `ca3580f` test(intake): 端到端往返——结构/契约/claims gate/假仓validate/审计留痕
- 2026-10-09 `e5fc9fe` fix(intake): 自适应切簇，全盘扫描可导出单个项目（C1）
- 2026-10-09 `85ecdec` fix(intake): 凭证防线补隐藏文件/未归类/探测面，不可读文件不再崩扫描（C2 C3）
- 2026-10-09 `16ea99a` fix(intake): skill --path 认 manifest 候选并做越界检查，active_prd 复制后核存在（I1 I2）
- 2026-10-09 `1207581` fix(intake): verify 子命令把契约与 validate 纳入完成判定，stage/decide 子命令替代手工 Edit manifest（I3 I4）
- 2026-10-09 `971026b` fix(intake): scandir 枚举，补 macOS 包目录/依赖目录排除，iCloud 占位不读，只对迁移候选算哈希（I5）
- 2026-10-09 `0220dd6` fix(intake): SKILL.md 补 claims/sources 结构与 stage/decide/verify 流程，报告补撞名/超大/重复明细，同秒重试 id 对齐（I6 顺手修）
- 2026-10-09 `af98cd0` feat(intake): 扫描器按内容认项目根 + 内容标题 + manifest schema v2
- 2026-10-09 `8c28830` fix(intake): apply 测试按扫描 schema v2 最小适配
- 2026-10-09 `7894284` refactor(intake): 内容标题抽取拆到 aipm_intake_titles.py（Ruling 24，行为不变）
- 2026-10-09 `1508248` fix(intake): 部件目录下的扁平子目录并回父项目（Ruling 20）+ 版本目录第三条件单测（Ruling 23）
- 2026-10-09 `db4019a` feat(intake): 执行侧按文件集落位——--include/--reason/--allow-dup、文件级 exclude + skip-cluster、按文件对账
- 2026-10-09 `5c15496` docs(intake): SKILL.md 同步深层扫描语义（§8），契约测试锁住；spec §3/§4 本机同步
- 2026-10-10 `2c35ac9` fix(intake): decide skip 落地并删 rename、copied 短路提示被排除文件
- 2026-10-10 `8a46104` merge: /ai-pm intake 外部工作区整合并入 main
- 2026-10-10 `85d3f49` fix(package): 分发形态 git 守卫——私有包剔除嵌套 .git + verify 禁令 + doctor 检查项 32
- 2026-10-11 `188fb5a` fix(package): 分发包校验器加固——拦路径穿越/重复成员/tree 内链接，核对 file_count 与历史 blob 哈希
- 2026-10-11 `6e137d0` fix(intake): 外部 skill 只登记到本机注册表，不再写入库文件（Ruling 13）
- 2026-10-11 `a2679fb` merge: intake 外部 skill 登记改本机注册表（Ruling 13）并入 main
- 2026-10-11 `b62f9cd` fix(intake): 清理延后 minor——报告防目录名注入、决策文件半行容错、标题抽取纠错
- 2026-10-11 `14b4de8` merge: intake 延后 minor 清理并入 main

## v0.6.0  (2026-10-08)

自 `v0.5.3` 起共 114 次改动。

- 2026-06-09 `a7bbe40` feat(ai-pm-knowledge): 新增 chains 牵动链分类 + 接入 suggest 主动推送
- 2026-06-09 `9b5caa0` feat(ai-pm): 新增 ai-pm-acceptance 验收技能 + 验收模板
- 2026-06-09 `5ce7e6c` feat(ai-pm): 开工前关联扫描机制(related-scan) + 修 session-start 中文项目名乱码
- 2026-06-10 `b23d792` feat(ai-pm): pm-agent 写时反射(命名/重述)+ 判断卡 §9.0bis 概念回源 + driver 概念落地 lint
- 2026-06-10 `6825df5` feat(ai-pm): driver/pm-agent 防御性保证密度检测（lint 兜底）
- 2026-06-11 `1056733` feat(ai-pm): 决策评审七必答项+行话黑名单机械化，WS0扎根双脚本接线
- 2026-06-11 `513f0ae` feat(ai-pm): 竞品研究skill升级:登录态实探+决策级对位+增量轮
- 2026-06-15 `e8f625d` feat(ai-pm): pm-agent 调用前置扎根闸 + 章节编号合规自检
- 2026-06-15 `3667c25` chore: gitignore 本地专属 skill xfchat-wiki
- 2026-06-17 `64a813e` feat(ai-pm): 决策评审八条必答项 + 约定包 live 回写 + 教程中心/自检对齐 v5
- 2026-06-23 `f1e6662` feat(ai-pm): PRD 文件名解耦段一 — resolver 唯一权威源 + 去硬编码默认名
- 2026-06-24 `f25776d` feat(ai-pm): 需求文档分型 + 迭代PRD强制走完整模板（doctype机读字段 + 骨架强制）
- 2026-06-24 `3bebcf8` fix(ai-pm): 收 PM 评审 5 项 + 修脚本多字节坑
- 2026-06-24 `cc2499e` Merge feature/prd-doctype-enforcement-0624: 需求文档分型 + 迭代PRD强制走完整模板 doctype机读字段+骨架强制
- 2026-06-25 `e4f4140` chore(ai-pm): 治理 templates 模板库（doctype 选型引导 + 示例品牌色脱敏 + README 修正）
- 2026-06-25 `a05a17b` chore(ai-pm): 加 pre-commit 护栏——doctype 骨架回归(路径过滤,改相关文件才跑)
- 2026-06-29 `f65d770` feat(ai-pm): 详设格内容分类反射 + hook PreCompact/SessionEnd 放行
- 2026-06-29 `b5d22f8` feat(ai-pm): 云文档增强 profile — output_profile gate + callout/红字/表格注释 emit
- 2026-06-29 `9771fce` feat(ai-pm): 判断卡 §二#9 生产端 vs 下游消费方 + pm-agent 反射/自检
- 2026-06-30 `ee0362a` feat(ai-pm): 云文档增强 v2 语义调色板 — §十 red-only→红/灰/核心黄底 + phase-5/模板对齐
- 2026-06-30 `de5b6cb` feat(ai-pm): 云文档能力可插拔化 — 渲染器契约 + 探测 + 逐特性 gate（§八）
- 2026-06-30 `1bb0dba` feat(ai-pm): 云文档增强渐进披露规则
- 2026-07-02 `d269a42` feat(ai-pm): 原型示意 cell 四态协议 + 校验器收窄 + 正则防漂移
- 2026-07-06 `0fc8b25` feat(ai-pm): Stage3/4 落地——鲜度自省+回归+发布器脚本 + 判断卡/模板收敛
- 2026-07-10 `6e385b3` chore(privacy): 内部名示例改通用占位（7 文件）+ 资源副本同步
- 2026-07-10 `9e6aa32` chore(freeze): 波0A 分发与隐私止血——README冻结横幅/release改手动/skill打包fail-closed/raw快照默认停/clippy修复
- 2026-07-12 `369562e` fix(0B-1): P0规则打架修复——修订日志判断句化/命名文件夹制单源36处/review-modify退役并回/500硬门对齐豁免/死命令三处/review-stale复活+created哨兵/回归五分类基线
- 2026-07-12 `b0d4b5e` fix(0B-2): 同步与接线——pm-agent三分法/段首结论/prototype-agent验证铁律/humanizer颗粒度对齐/参考读取块单源化/tmp通用名6处/pre-commit挂规则漂移/settings接线修正/prd_publish兜底/TOC三份/静默降级显式化
- 2026-07-12 `64621d4` docs(judgment-card): 内容批——§十推送落地纪律段(07-09翻车复盘)+行话黑名单「原生」负排除回填(06-15误杀教训)
- 2026-07-12 `198c398` fix(0B-3): 清账与门面——LICENSE补齐/双语README同步+docs幽灵注/教程中心strategy+计数/模板README对齐实况/visual-anchor表格修复/A4约定包回写挂点两处
- 2026-07-12 `79a8b48` refactor(0bis): 判断卡结构手术——§九子节编号转正(9.0/bis/ter→9.1-9.5)全仓引用同步/§七拆7.1-7.3/对照表9条列全/尾注校正/头部目录；一条规则未删
- 2026-07-12 `5740abb` feat(波1): 云文档最后一公里——prd_publish v2(render-manifest对账+标记残留检查+清尾gate真机双项目验证)/prd_pull人改回收(内容层diff·标记层本地为源·真机预览验证)/B4重渲盘点工具
- 2026-07-12 `5a90c36` feat(波1.5): ai-pm-strategy-verify 战略求证侦察兵 v0.1——骨架7条焊死+留判断4条+evidence ledger/盲审红队/影响×不确定性排序/停止四判据+保险丝；只建侦察兵不替拍板；沙盘可选handoff；计数27
- 2026-07-12 `b623d4e` feat(波2): 信任与写时——验收命门3真跑留痕(台账三列+trace+三边界,并入AI造假复盘)/D1写时三件套(复述确认+只减不增+新词泛化)/driver --preflight(上游对齐+冷读收编)/C1决策表固化/N4语言闸/D3评审交换协议+反馈回灌台账
- 2026-07-12 `26173b2` chore(波3-退役): brainstorm归档/_core+_prompts移除/openai.yaml删/doctor改机器直查/strategy存储协议重写(拍板4全清)
- 2026-07-12 `eab138d` feat(波3): 最小契约三件——status schema v1+迁移器(16/16合规·推断收窄防误判·原子写读回)/阶段registry机读单源/battlecard机读结论层(写时报年龄锚点)/A4登录态交接协议+双技能接线
- 2026-07-12 `e2b498c` refactor(波4-G4): CLAUDE.md 温和瘦身——4组重复对下沉指针(视觉锚点包流程/.ai-shared表/修订日志/文档分型),铁律表保留;234→211行
- 2026-07-12 `469afb1` feat(波4): 治理——docs INDEX+5份被取代头标+docs仓外备份(89份)/计划债机读台账17条进whats-next/资产盘点dry-run报告/2.8G探索目录zip归档+索引对齐/知识卡超龄清单/hook端到端留痕步/raw清单与保留策略
- 2026-07-12 `0ca45a2` fix(review轮): 27候选20实修——prd_pull正本保护(有损往返高危节只报不写)/publish标题口径+残留豁免+ImportError区分/退役残渣三处(verify-release+drift清单+ai-pm/_core真删)/回归恒真句改真对账/直觉撞号14-16/墓碑映射/lifecycle首批消费者(whats-next+staleness)/migrate-validate对称+枚举单源/共享正则模块_prd_common/存储树乱码/manifest分块哈希/追踪矩阵落地
- 2026-07-12 `348bac2` fix(codex复验): P0全清——README事实对齐(留包勿装)/云文档三方合并+content_hash人改保护+基线快照+DocApiError根修(插件0a3bb20)/schema驱动校验器(抓出4存量违规已修)+registry对齐实况+phases值校验/pull与migrate selftest进套件/freshness双态/staleness--all/计数26/trace保留期/hook-JSONL/资产报告重算
- 2026-07-12 `3656ce2` fix(cloud-doc/status): Codex 二轮复验返修——content_hash 真生效 + 删除 fail-closed + pull 纯三方算法 + 契约两轴 + observed 遥测
- 2026-07-12 `4727632` fix(cloud-doc): Codex 三轮复验返修——存量守门+adopt 采纳流程 + pull 远端事实前置 + not-found 收窄 + 首行 H1 元数据化
- 2026-07-12 `cecd6af` fix(cloud-doc): Codex 四轮复验返修——_intro 前言盲区 + adopt 有损闸 + 读取一致性括号 + fresh-clone selftest
- 2026-07-12 `fd9bc4a` fix(regression/cloud-doc): Codex 五轮收口——fresh-clone 两残口 N/A 语义 + tracked-only 验收 + revision 分支测试 + 降级双读
- 2026-07-13 `bf2bee7` fix(regression): Codex 六轮收口——runner 透出 N/A 不吞 PASS + fresh-clone 机械断言 + git apply 叠加
- 2026-07-13 `ffb247d` docs(教程中心): 补战略沙盘/战略求证两张技能卡与现状对齐（23→25 卡），页脚口径同步
- 2026-07-13 `9f37d5c` fix(cloud-doc): V4 真机首用抓出的 callout 正则 bug + 六族往返噪音归一（真实失败最小修复）
- 2026-07-13 `27d6c0c` fix(hook): 知识沉淀 stop hook 改静默排队制——不再 block 主对话刷屏（用户拍板）
- 2026-07-13 `7a5fd8b` feat(hook): 知识沉淀后台无头消费终稿——排队+headless 消费+单飞行员锁+账本迁出配置域
- 2026-07-13 `0064ae0` fix(cloud-doc): 存量批量武装实测第七/八族往返噪音——行内代码反引号 + 换行位置折叠
- 2026-07-14 `9bd7106` feat(strategy): 智囊团质询模式落地——方法论卡+决策评审模板主动提议+沙盘三处接线
- 2026-07-14 `9ef0164` fix(scripts): git quotepath 中文文件名四连修——复盘文档迁入 references 触发
- 2026-07-15 `6d911b1` feat(pm-skill): 决策评审精简规范 + 云文档可读性三手法 + 字数三档硬线
- 2026-07-16 `1cdb44f` feat(judgment-card): 行话黑名单补英文黑话分区 + 内部通用词豁免
- 2026-07-17 `9418588` feat(judgment-card): 新增闸5指针纪律——正文禁疯狂甩附录裸编号
- 2026-07-17 `dd3911c` chore(client): 桌面客户端整体退役——删 app/ 及发布链路，统一目录编号单一事实源
- 2026-07-17 `d71e004` fix(prd-publish): count_headings_for_push 跳过 doctype 注释头再认首行 H1
- 2026-07-17 `2056109` docs(strategy): 智囊团质询卡补 2026-07-17 首考记录，第二样本跑通、earn-it 闸达标
- 2026-07-17 `22ae126` refactor(template): 决策评审模板必答①-⑧机读锚点合并为单行
- 2026-07-20 `707c8e9` fix(ai-pm): close reconciliation reliability gaps
- 2026-07-20 `dd767da` chore(shared): ignore local avatar assets
- 2026-07-21 `194b94a` fix(ai-sync): use conversation activity for freshness
- 2026-07-30 `f3975a3` feat: add experience-sharing article workflow
- 2026-07-31 `6422dd5` feat(sharing): add experience article voice guide
- 2026-08-14 `8a65d67` feat: add stateful work modes and lifecycle contracts
- 2026-08-17 `4591f61` feat(ai-sync): add monthly voice profile hook
- 2026-08-27 `88feac9` docs: improve project skill discovery rules
- 2026-09-01 `efefb68` feat(prototype): add collaborative review loop
- 2026-09-02 `2a81bbf` feat(prototype): harden review workflow and tag deletion
- 2026-09-02 `90f7181` feat(prototype): add source evidence and unified acceptance
- 2026-09-02 `eac632c` chore: record business knowledge and critique artifacts
- 2026-09-06 `42821a1` fix(prototype): preserve inspection-first desktop proportions
- 2026-09-06 `508d273` docs(weekly): organize reports by reporting period
- 2026-09-07 `a239ada` feat(prototype): refresh collaboration workbench visual system
- 2026-09-09 `121e4ef` feat(skill): 新增 ai-pm-deck，补上演讲材料这块空白
- 2026-09-10 `51f528d` feat: 完善协作工作台与演讲材料闭环
- 2026-09-14 `ec232c7` feat(ai-sync): 云文档目录漂移检查 + 每周后台核对
- 2026-09-17 `220c916` feat(decision-review): 八条必答项扩到十条——分诊驱动类型 + 收尾向前看
- 2026-09-17 `e08a485` feat(prose): 文档文字质量闸——人类语料立基线 + 自动化检查
- 2026-09-17 `1b7aed1` feat(prose): 吸收 de-ai-flavor 方法论 + 同义复述提示项
- 2026-09-17 `9e5f372` fix(decision-review): 十条必答项同步到 lint 入口 + 模板正文补前提闸分叉
- 2026-09-17 `3de7d73` fix(prose): 基线缺失时降级为词项检查 + 语料内部名外置
- 2026-09-17 `f489acb` fix(prose): 词表按外部语料实测密度拆两档 + 豁免人类正本快照
- 2026-09-17 `247464d` chore: gitignore 忽略 .workbuddy 会话数据目录
- 2026-09-18 `fdcd5be` merge: 文字质量闸（prose-quality-gate）并入 main
- 2026-09-22 `32d5246` feat(prototype): 原型协作闭环加固，把翻车点变成强制动作
- 2026-09-22 `e37d3eb` fix(ai-sync): 索引漂移跨目录登记误报 + 已完成项目不再催下一步
- 2026-09-22 `64fcfae` chore: 忽略 D2C/MasterGo 本机物料与 SDD 工作区
- 2026-09-22 `58963b5` feat(design-ingest): MasterGo 客户端与 URL 解析
- 2026-09-22 `6695576` fix(design-ingest): 补 4 类错误路径测试覆盖
- 2026-09-22 `18153bf` feat(design-ingest): DSL 与 CSS 合并成扁平 structure
- 2026-09-22 `6fcb27e` feat(design-ingest): token 抽取按色值归并别名
- 2026-09-22 `eeb9383` feat(design-ingest): 按绝对坐标几何还原 HTML
- 2026-09-22 `d1645a0` feat(design-ingest): ingest-design 子命令与产物落盘
- 2026-09-22 `50e4287` fix(design-ingest): design-tokens.json 不再持久化签名 URL
- 2026-09-22 `0d4796f` feat(visual-anchor): 校验器识别 mastergo 来源
- 2026-09-22 `41f81cd` feat(visual-anchor): 视觉指纹加实测值层
- 2026-09-22 `2cd4a30` docs(visual-anchor): 视觉锚点包改为双来源
- 2026-09-22 `67af604` feat(png-diff): 纯 stdlib PNG 解码器
- 2026-09-22 `a1feb4f` feat(png-diff): 按区块出偏差榜
- 2026-09-22 `2780dfc` feat(accept): 并入设计稿还原度区块偏差榜
- 2026-09-22 `ff7e605` feat(distill): 产品级 token 蒸馏只出建议不写入
- 2026-09-22 `c0e39d6` fix(visual-anchor): designSource 只认 provider=mastergo，降级包下一步指回 ingest-design
- 2026-09-22 `753feb1` fix(design-ingest): 截图失败产可验收的降级包；cssCode 转义+剔远程 URL；page_id 消歧
- 2026-09-22 `2c7236d` fix(png-diff): 短 IHDR 抛 PngError；测试常数钉死 Paeth c 分支
- 2026-09-26 `b8bbcda` fix(whats-next): lifecycle=paused 的项目归入挂起档
- 2026-10-07 `846c41c` feat(prd): PRD 落盘前强制文字润色，闸 0 新增防质疑句
- 2026-10-08 `44dcb15` feat(update): 受管范围与三方合并协议
- 2026-10-08 `8db4b6e` fix(update): 补齐判定表情形与显式白名单语义
- 2026-10-08 `7b60302` fix(update): 契约测试改结构性断言，堵住假绿
- 2026-10-08 `69f4c75` feat(package): 公共/私有双版打包器，按 git ls-files 收集
- 2026-10-08 `75fa7e2` test(update): 升级产物往返/幂等/阴性三组自测
- 2026-10-08 `fac5e60` feat(package): changelog 生成器与首版更新日志
- 2026-10-08 `6ef8f84` fix(update): 幂等组改用基线推进版，补 base 推进硬约束
