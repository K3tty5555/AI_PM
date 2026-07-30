# 经验分享文章首版验收映射

| 验收项 | 自动测试或人工证据 |
|---|---|
| 1. 正常素材生成 ready | `CandidatePublishTests.test_valid_candidate_is_promoted_then_marked_ready`；主控别名临时目录冒烟也生成 `ready` |
| 2. 只有主题保持 draft | `green-observations.md` 场景 B：仅给通用工作稿并声明素材边界 |
| 3. 直接写仍建事实清单 | `green-observations.md` 场景 B 与 `SharingContractTests.test_skill_keeps_private_and_publish_boundaries` |
| 4. 素材路径不存在或不可读 | `green-observations.md` 场景 E；`SharingContractTests.test_skill_reports_path_errors` |
| 5. 控制字符、超长、路径字符安全 | `CreateWorkspaceTests.test_control_characters_are_removed_and_length_is_capped`、`test_sanitize_topic_keeps_readable_chinese_and_removes_path_tokens` |
| 6. 同日同主题不覆盖 | `CreateWorkspaceTests.test_same_day_same_topic_never_overwrites` |
| 7. 既有文章必须显式替换 | `CandidatePublishTests.test_existing_publish_requires_replace_and_keeps_backup` |
| 8. 无证据数字不包装成事实 | `baseline-observations.md` 与 `green-observations.md` 场景 B 对照；主控别名冒烟未添加素材外数字 |
| 9. 内部名称和密钥阻断 | `CandidatePublishTests.test_denylist_uses_regex_and_invalid_regex_blocks`、`test_template_residue_prd_heading_and_secret_are_blocked` |
| 10. 可选模块和模板残留删除 | `CandidatePublishTests.test_template_residue_prd_heading_and_secret_are_blocked`；发布检查拦截 HTML 注释和示例标题 |
| 11. 不出现 PRD 骨架 | `SharingContractTests.test_template_does_not_use_prd_skeleton` 与候选稿 PRD 标题阻断测试 |
| 12. 附件链接、断链和逃逸处理 | `CandidatePublishTests.test_only_supported_local_asset_links_are_allowed`、`test_encoded_path_escape_and_candidate_symlink_are_blocked`、`test_query_string_and_broken_asset_are_blocked` |
| 13. 语言校准不改事实 | `green-observations.md` 的语言校准补充场景；`SharingContractTests.test_humanizer_is_narrow_and_rechecked` |
| 14. 相邻意图不误触发 | `green-observations.md` 场景 C 与 `/ai-pm sharing` 临时目录真实委派冒烟 |
| 15. fresh clone 无外部插件可校验 | `check-fresh-clone.sh --include-untracked ...` + `regression-suite.sh --full` |

主控别名冒烟使用通用需求评审笔记，在临时仓库根真实执行工作区创建、strict 检查和原子发布；确认没有读取或创建 `output/projects/`。
