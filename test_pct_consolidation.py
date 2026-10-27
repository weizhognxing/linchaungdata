import json
import unittest

from app.common import DEFAULT_FIELDS
from app.routes.record_helpers import LAB_CATEGORY_DEFINITIONS
from app.services.core import LAB_NAME_ALIASES, parse_ai_result


class PctConsolidationTests(unittest.TestCase):
    def setUp(self):
        self.fields = [{"field_name": "pct", "form_label": "降钙素原", "comment_text": "降钙素原"}]

    def run_item(self, item):
        return parse_ai_result(json.dumps({"items": [item]}), self.fields)

    def test_pct_abbreviation_maps_to_procalcitonin(self):
        self.assertEqual(self.run_item({"name": "降钙素原", "code": "PCT", "value": "0.5"}), {"pct": "0.5"})

    def test_pct_without_code_maps_by_chinese_label(self):
        self.assertEqual(self.run_item({"name": "降钙素原", "code": "", "value": "1.1"}), {"pct": "1.1"})

    def test_blood_routine_does_not_capture_plateletcrit(self):
        # A blood-count report still prints 血小板压积 as PCT; with the blood-count
        # field set (which no longer contains any PCT field) it must be ignored.
        blood_fields = [{"field_name": "wbc", "form_label": "白细胞数"}, {"field_name": "plt", "form_label": "血小板数"}]
        result = parse_ai_result(json.dumps({"items": [{"name": "血小板压积", "code": "PCT", "value": "0.27"}]}), blood_fields)
        self.assertEqual(result, {})

    def test_canonical_definitions_reference_single_pct_field(self):
        self.assertEqual(LAB_CATEGORY_DEFINITIONS["pct"]["fields"], ["pct"])
        self.assertEqual(LAB_CATEGORY_DEFINITIONS["pct"]["label"], "PCT")
        self.assertEqual(LAB_NAME_ALIASES["降钙素原"], ["pct"])
        self.assertIn(("pct", "decimal", "降钙素原", "降钙素原"), DEFAULT_FIELDS)

    def test_source_has_no_plateletcrit_references(self):
        import pathlib

        root = pathlib.Path(__file__).resolve().parent
        allowed = {"app/services/lab_catalog.py"}  # the cleanup migration documents the removed metric
        offenders = []
        for path in list((root / "app").rglob("*.py")) + list((root / "static" / "js").rglob("*.js")):
            rel = str(path.relative_to(root))
            if rel not in allowed and "血小板压积" in path.read_text(encoding="utf-8"):
                offenders.append(rel)
        self.assertEqual(offenders, [], "leftover plateletcrit references: " + ", ".join(offenders))


if __name__ == "__main__":
    unittest.main()
