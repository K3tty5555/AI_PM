import json
from pathlib import Path
import unittest


REPO = Path(__file__).resolve().parents[1]
SKILL = REPO / ".claude/skills/ai-pm-sharing/SKILL.md"
TEMPLATE = REPO / "templates/sharing/experience-article.md"
SOURCE_PATTERNS = (
    REPO / ".claude/skills/ai-pm-sharing/references/source-patterns.md"
)
ARTICLE_VOICE = (
    REPO / ".claude/skills/ai-pm-sharing/references/article-voice.md"
)
SKILL_SCENARIOS = REPO / "tests/fixtures/sharing/skill-scenarios.md"
OPENAI_YAML = REPO / ".claude/skills/ai-pm-sharing/agents/openai.yaml"
REGISTRY = REPO / ".claude/skills/ai-pm/references/output-containers.md"
REGISTRY_SCRIPT = REPO / "scripts/check-output-container-registry.py"
MAIN_SKILL = REPO / ".claude/skills/ai-pm/SKILL.md"
CLAUDE_MD = REPO / "CLAUDE.md"
DOCTOR = REPO / ".claude/skills/ai-pm/doctor.md"
PROJECT_INDEX = REPO / "templates/project-index/README.md"
SETTINGS = REPO / ".claude/settings.json"
README_EN = REPO / "README.md"
README_ZH = REPO / "README_zh-CN.md"
TUTORIAL = REPO / "AI_PM_教程中心.html"


class SharingContractTests(unittest.TestCase):
    def test_skill_frontmatter_has_only_name_and_description(self):
        text = SKILL.read_text(encoding="utf-8")
        _, frontmatter, _ = text.split("---", 2)
        keys = [
            line.split(":", 1)[0].strip()
            for line in frontmatter.splitlines()
            if line and not line.startswith((" ", "\t"))
        ]
        self.assertEqual(keys, ["name", "description"])
        self.assertIn("name: ai-pm-sharing", frontmatter)

    def test_skill_has_positive_and_negative_routing(self):
        text = SKILL.read_text(encoding="utf-8")
        for phrase in (
            "可独立阅读",
            "经验分享文章",
            "项目复盘",
            "知识库",
            "周报",
            "培训讲义",
        ):
            self.assertIn(phrase, text)

    def test_skill_keeps_private_and_publish_boundaries(self):
        text = SKILL.read_text(encoding="utf-8")
        self.assertIn("_private/", text)
        self.assertIn("publish/article.md", text)
        self.assertIn("_private/candidate.md", text)
        self.assertIn("不能跳过事实清单", text)

    def test_skill_references_template_sources_and_scripts(self):
        text = SKILL.read_text(encoding="utf-8")
        for path in (
            "templates/sharing/experience-article.md",
            ".claude/skills/ai-pm-sharing/references/source-patterns.md",
            "create_article_workspace.py",
            "check_article_ready.py",
        ):
            self.assertIn(path, text)

    def test_skill_reports_path_errors(self):
        text = SKILL.read_text(encoding="utf-8")
        for phrase in ("不存在", "不可读", "格式不支持", "符号链接"):
            self.assertIn(phrase, text)

    def test_humanizer_is_narrow_and_rechecked(self):
        text = SKILL.read_text(encoding="utf-8")
        self.assertIn("局部段落", text)
        self.assertIn("不要改动引用、数字、代码、表格", text)
        self.assertIn("校准后重新运行", text)

    def test_skill_defaults_to_product_circle_article_voice(self):
        text = SKILL.read_text(encoding="utf-8")
        self.assertTrue(ARTICLE_VOICE.is_file())
        self.assertIn(
            ".claude/skills/ai-pm-sharing/references/article-voice.md",
            text,
        )
        self.assertIn("产品圈经验长文", text)
        voice = ARTICLE_VOICE.read_text(encoding="utf-8")
        for phrase in (
            "网感不是网络梗",
            "具体矛盾",
            "标题要有判断",
            "短句",
            "强行金句",
        ):
            self.assertIn(phrase, voice)

    def test_template_and_scenarios_cover_internet_native_voice(self):
        template = TEMPLATE.read_text(encoding="utf-8")
        scenarios = SKILL_SCENARIOS.read_text(encoding="utf-8")
        self.assertIn("具体矛盾", template)
        self.assertIn("标题带判断", template)
        self.assertIn("产品圈经验长文", scenarios)
        self.assertIn("不堆网络梗", scenarios)

    def test_template_does_not_use_prd_skeleton(self):
        text = TEMPLATE.read_text(encoding="utf-8")
        for heading in (
            "文档概述",
            "需求分析",
            "功能清单",
            "详细功能设计",
            "验收标准",
        ):
            self.assertNotIn(heading, text)
        self.assertIn("适用边界", text)
        self.assertIn("可以直接拿走", text)

    def test_research_reference_records_all_selected_sources(self):
        text = SOURCE_PATTERNS.read_text(encoding="utf-8")
        for source in (
            "GitHub Docs",
            "知乎创作者手册",
            "Devpost",
            "The Carpentries",
        ):
            self.assertIn(source, text)
        self.assertIn("访问日期：2026-07-30", text)
        self.assertIn("不复制", text)

    def test_openai_metadata_is_present_without_runtime_dependency(self):
        text = OPENAI_YAML.read_text(encoding="utf-8")
        self.assertIn('display_name: "经验分享文章"', text)
        self.assertIn("$ai-pm-sharing", text)
        self.assertNotIn("dependencies:", text)


class SharingIntegrationTests(unittest.TestCase):
    def test_output_registry_lists_sharing(self):
        text = REGISTRY.read_text(encoding="utf-8")
        self.assertIn("`sharing/`", text)

    def test_policy_documents_point_to_single_registry(self):
        pointer = ".claude/skills/ai-pm/references/output-containers.md"
        for path in (CLAUDE_MD, DOCTOR, PROJECT_INDEX):
            self.assertIn(pointer, path.read_text(encoding="utf-8"))

    def test_main_skill_routes_sharing(self):
        text = MAIN_SKILL.read_text(encoding="utf-8")
        self.assertIn("/ai-pm sharing", text)
        self.assertIn("Skill(ai-pm-sharing)", text)
        self.assertIn("不解析当前项目", text)

    def test_registry_checker_is_repository_owned(self):
        text = REGISTRY_SCRIPT.read_text(encoding="utf-8")
        self.assertIn("def parse_registry", text)
        self.assertIn("def validate_registry", text)

    def test_shared_settings_allow_new_skill(self):
        settings = json.loads(SETTINGS.read_text(encoding="utf-8"))
        self.assertIn(
            "Skill(ai-pm-sharing)",
            settings["permissions"]["allow"],
        )


class SharingDocumentationTests(unittest.TestCase):
    def test_readmes_document_command_and_output(self):
        for path in (README_EN, README_ZH):
            text = path.read_text(encoding="utf-8")
            self.assertIn("/ai-pm sharing", text)
            self.assertIn("output/sharing/articles/", text)

    def test_tutorial_has_copyable_sharing_command(self):
        text = TUTORIAL.read_text(encoding="utf-8")
        self.assertIn('data-copy="/ai-pm sharing"', text)
        self.assertIn("/ai-pm-sharing", text)
        self.assertIn("经验分享文章", text)


class SharingAcceptanceMatrixTests(unittest.TestCase):
    def test_matrix_maps_all_fifteen_acceptance_items(self):
        matrix = (
            REPO / "tests/fixtures/sharing/acceptance-matrix.md"
        ).read_text(encoding="utf-8")
        for number in range(1, 16):
            self.assertIn(f"| {number}.", matrix)


if __name__ == "__main__":
    unittest.main()
