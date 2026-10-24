import unittest

from app.services.export_filter import filter_export_rows
from app.services.export_privacy import anonymize_export_rows, export_identity_map


class ExportFilterTests(unittest.TestCase):
    def test_selected_disease_excludes_unrelated_records_in_all_sheets(self):
        patients = [{"id": 1, "name": "张三", "last_disease_id": 2, "diagnosis": "另一种疾病"}]
        diagnosis = [
            {"id": 10, "patient_id": 1, "diagnosis_disease": "肺炎"},
            {"id": 11, "patient_id": 1, "diagnosis_disease": "中毒"},
        ]
        selected = filter_export_rows("diagnosis_records", diagnosis, 1, "肺炎", set())
        diagnosis_ids = {row["id"] for row in selected}
        self.assertEqual(diagnosis_ids, {10})
        self.assertEqual([row["id"] for row in filter_export_rows("lab_records", [
            {"id": 20, "patient_id": 1, "disease_id": 1},
            {"id": 21, "patient_id": 1, "disease_id": 2},
        ], 1, "肺炎", diagnosis_ids)], [20])
        self.assertEqual([row["id"] for row in filter_export_rows("lab_records_72h", [
            {"id": 22, "patient_id": 1, "disease_id": 2},
        ], 1, "肺炎", diagnosis_ids)], [])
        for table in ("assessments", "treatments", "followups"):
            rows = [{"id": 30, "patient_id": 1, "diagnosis_record_id": 10},
                    {"id": 31, "patient_id": 1, "diagnosis_record_id": 11},
                    {"id": 32, "patient_id": 1, "diagnosis_record_id": None}]
            filtered = filter_export_rows(table, rows, 1, "肺炎", diagnosis_ids)
            self.assertEqual([row["id"] for row in filtered], [30])

        patient = filter_export_rows("patients", patients, 1, "肺炎", diagnosis_ids)[0]
        self.assertIsNone(patient["last_disease_id"])
        self.assertIsNone(patient["diagnosis"])
        self.assertEqual(patients[0]["diagnosis"], "另一种疾病")
        aliases, identities = export_identity_map(patients)
        safe = anonymize_export_rows("patients", [patient], aliases, identities, {})[0]
        self.assertIsNone(safe["name"])

    def test_no_selection_keeps_previous_export_behavior(self):
        rows = [{"id": 1, "diagnosis_record_id": None}]
        self.assertIs(filter_export_rows("treatments", rows, None, None, set()), rows)


if __name__ == "__main__":
    unittest.main()
