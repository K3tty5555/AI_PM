from __future__ import annotations

import importlib.util
from pathlib import Path
import unittest


REPO = Path(__file__).resolve().parents[1]
SKILL = REPO / ".claude/skills/ai-pm-deck"


def load_module(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"无法加载模块: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class DeckContractTests(unittest.TestCase):
    def test_main_facade_and_permissions_dispatch_deck(self):
        facade = (REPO / ".claude/skills/ai-pm/SKILL.md").read_text(encoding="utf-8")
        settings = (REPO / ".claude/settings.json").read_text(encoding="utf-8")
        self.assertIn("Skill(ai-pm-deck)", facade)
        self.assertIn('"Skill(ai-pm-deck)"', settings)

    def test_skeleton_has_multiple_slides_and_accessible_controls(self):
        html = (SKILL / "templates/deck-skeleton.html").read_text(encoding="utf-8")
        self.assertGreaterEqual(html.count('class="slide'), 2)
        self.assertIn('id="prev" aria-label="上一页"', html)
        self.assertIn('id="next" aria-label="下一页"', html)
        self.assertIn('id="fullscreen" aria-label="全屏播放"', html)

    def test_checker_counts_blockers_and_has_navigation_fallback(self):
        checker = load_module(SKILL / "scripts/check_deck.py", "deck_checker")
        report = {
            "viewports": {
                checker.DEFAULT_VIEWPORTS[0][0]: [
                    {"out": 0, "burst": 0, "overlap": 0, "minFont": 13.0},
                ],
            },
            "language": {"deny_hits": ["内部代号"], "dashes": 0},
        }
        self.assertEqual(checker.blocking_count(report, 14.0), 2)
        source = (SKILL / "scripts/check_deck.py").read_text(encoding="utf-8")
        self.assertIn("slides.forEach", source)


if __name__ == "__main__":
    unittest.main()
