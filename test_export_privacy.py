import unittest
import zipfile
from io import BytesIO

from openpyxl import load_workbook

from app.routes.record_helpers import _build_single_sheet_workbook
from app.services.export_privacy import anonymize_export_rows, export_identity_map


class ExportPrivacyTests(unittest.TestCase):
    def test_patient_identifiers_removed_without_mutating_source(self):
        source = [{
            "id": 123, "name": "张三", "gender": "男", "age": 40,
            "phone": "13812345678", "id_number": "110101199001011234",
            "hospital_id": 7, "user_id": 8, "case_number": "CASE00123456",
            "registration_number": "987654321", "plasma_number": "A1234567",
            "preliminary_diagnosis": "张三联系电话13812345678，邮箱test@example.com，诊断肺炎。",
        }]
        aliases, identities = export_identity_map(source)
        rows = anonymize_export_rows("patients", source, aliases, identities, {})
        row = rows[0]
        self.assertTrue(row["id"].startswith("P-"))
        self.assertNotEqual(row["id"], "123")
        for key in ("name", "phone", "id_number", "hospital_id", "user_id",
                    "case_number", "registration_number", "plasma_number"):
            self.assertIsNone(row[key])
        for sensitive in ("张三", "13812345678", "test@example.com"):
            self.assertNotIn(sensitive, row["preliminary_diagnosis"])
        self.assertIn("肺炎", row["preliminary_diagnosis"])
        self.assertEqual(source[0]["name"], "张三")

    def test_related_sheets_share_anonymous_patient_and_diagnosis_ids(self):
        patients = [{"id": 123, "name": "张三"}, {"id": 456, "name": "李四"}]
        aliases, identities = export_identity_map(patients)
        diagnosis = {55: "D-1"}
        diagnosis_row = anonymize_export_rows("diagnosis_records", [
            {"id": 55, "patient_id": 123, "user_id": 9, "diagnosis_disease": "肺炎"}
        ], aliases, identities, diagnosis)[0]
        lab_row = anonymize_export_rows("lab_records", [
            {"id": 88, "patient_id": 123, "user_id": 9, "photo_path": "uploads/张三.jpg",
             "ai_raw": "张三", "remark": "13812345678", "wbc": 10.5}
        ], aliases, identities, diagnosis)[0]
        followup_row = anonymize_export_rows("followups", [
            {"id": 99, "patient_id": 123, "diagnosis_record_id": 55,
             "follow_result": "李四邮箱a@example.com，联系电话13812345678，病情稳定"}
        ], aliases, identities, diagnosis)[0]
        self.assertEqual(diagnosis_row["patient_id"], aliases[123])
        self.assertEqual(lab_row["patient_id"], aliases[123])
        self.assertEqual(followup_row["patient_id"], aliases[123])
        self.assertNotEqual(aliases[123], aliases[456])
        self.assertEqual(diagnosis_row["id"], followup_row["diagnosis_record_id"])
        self.assertIsNone(lab_row["id"])
        self.assertIsNone(lab_row["photo_path"])
        self.assertIsNone(lab_row["ai_raw"])
        self.assertIsNone(lab_row["remark"])
        self.assertEqual(lab_row["wbc"], 10.5)
        self.assertNotIn("李四", followup_row["follow_result"])
        self.assertNotIn("a@example.com", followup_row["follow_result"])
        self.assertNotIn("13812345678", followup_row["follow_result"])

    def test_export_workbooks_contain_only_anonymized_values(self):
        patients = [{"id": 1, "name": "王明", "phone": "13912345678", "id_number": "110101199001011234"}]
        aliases, identities = export_identity_map(patients)
        lab = [{"id": 5, "patient_id": 1, "user_id": 4, "ai_raw": "王明", "wbc": 8}]
        archive_bytes = BytesIO()
        with zipfile.ZipFile(archive_bytes, "w") as archive:
            for table, rows in (("patients", patients), ("lab_records", lab)):
                headers = list(rows[0])
                safe_rows = anonymize_export_rows(table, rows, aliases, identities, {})
                archive.writestr(table + ".xlsx", _build_single_sheet_workbook(table, safe_rows, headers))
        with zipfile.ZipFile(archive_bytes) as archive:
            cells = {}
            for table in ("patients", "lab_records"):
                sheet = load_workbook(BytesIO(archive.read(table + ".xlsx")), read_only=True).active
                headers, values = list(sheet.values)
                cells[table] = dict(zip(headers, values))
        self.assertEqual(cells["patients"]["id"], cells["lab_records"]["patient_id"])
        self.assertEqual(cells["lab_records"]["wbc"], 8)
        self.assertIsNone(cells["patients"]["name"])
        self.assertIsNone(cells["patients"]["phone"])
        self.assertIsNone(cells["patients"]["id_number"])
        self.assertIsNone(cells["lab_records"]["ai_raw"])


if __name__ == "__main__":
    unittest.main()
