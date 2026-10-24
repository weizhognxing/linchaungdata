import unittest

from app.services.export_wide import build_wide_export


class ExportWideTests(unittest.TestCase):
    def build(self):
        patients = [
            {
                "id": "P-1", "gender": "男", "age": 50, "height": 170, "weight": 60,
                "admission_time": "2026-01-01 10:00:00", "time_of_onset": "2026-01-01 08:00:00",
                "diagnosis": "脓毒症", "last_disease_id": 1,
                "preliminary_diagnosis": "肺炎", "medical_history": "无",
            },
            {
                "id": "P-2", "gender": "女", "age": 40, "height": 160, "weight": 55,
                "admission_time": "2026-01-02 10:00:00", "time_of_onset": "2026-01-02 08:00:00",
                "diagnosis": None, "last_disease_id": None,
                "preliminary_diagnosis": None, "medical_history": None,
            },
        ]
        diagnosis = [
            {
                "patient_id": "P-1", "diagnosis_disease": "脓毒症",
                "diagnosis_time": "2026-01-01 09:00:00",
                "preliminary_diagnosis": "肺炎", "medical_history": "无",
            }
        ]
        lab = [
            {
                "patient_id": "P-1", "created_at": "2026-01-01 11:00:00",
                "record_category": "血常规", "lab_test_name": "血常规", "wbc": 10, "pct": 1.2,
            },
            {
                "patient_id": "P-1", "created_at": "2026-01-01 12:00:00",
                "record_category": "血常规", "lab_test_name": "血常规", "wbc": 12, "pct": None,
            },
        ]
        assessment = [
            {"patient_id": "P-1", "assessment_time": "2026-01-01 12:00:00", "temperature": 36.5, "sofa_score": 3}
        ]
        treatment = [
            {
                "patient_id": "P-1", "antibiotics": "美罗培南,哌拉西林/他唑巴坦",
                "vasoactive_drugs": "无", "antibiotics_start_time": "2026-01-01 10:30:00",
            }
        ]
        followup = [
            {"patient_id": "P-1", "follow_time": "2026-01-28 10:00:00", "prognosis": 0, "death_days": 28}
        ]
        lab_fields = [
            {"field_name": "wbc", "form_label": "白细胞数", "unit": "10^9/L", "reference_range": "3.5-9.5"},
            {"field_name": "pct", "form_label": "降钙素原", "unit": "ng/ml", "reference_range": ""},
        ]
        lab_columns = ["created_at", "record_category", "lab_test_name", "wbc", "pct"]
        assessment_columns = ["assessment_time", "temperature", "sofa_score", "created_at", "id", "patient_id"]
        treatment_columns = ["antibiotics", "vasoactive_drugs", "antibiotics_start_time", "detail_json", "id", "patient_id"]
        followup_columns = ["follow_time", "prognosis", "death_days", "created_at", "id", "patient_id"]
        return build_wide_export(
            patient_rows=patients,
            diagnosis_rows=diagnosis,
            lab_rows=lab,
            lab72_rows=[],
            assessment_rows=assessment,
            treatment_rows=treatment,
            followup_rows=followup,
            lab_fields=lab_fields,
            lab_columns=lab_columns,
            lab72_columns=lab_columns,
            assessment_columns=assessment_columns,
            treatment_columns=treatment_columns,
            followup_columns=followup_columns,
            disease_names={1: "脓毒症"},
        )

    def test_one_row_per_patient_and_latest_lab_value(self):
        headers, rows, _ = self.build()
        self.assertEqual(len(rows), 2)
        self.assertIn("患者编号", headers)
        self.assertIn("0h_白细胞数(10^9/L)", headers)
        self.assertIn("0h_降钙素原(ng/ml)", headers)
        self.assertEqual(rows[0]["0h_白细胞数(10^9/L)"], 12)
        self.assertEqual(rows[0]["0h_降钙素原(ng/ml)"], 1.2)

    def test_name_is_anonymized(self):
        _, rows, _ = self.build()
        self.assertEqual(rows[0]["姓名"], "[已脱敏]")
        self.assertEqual(rows[0]["患者编号"], "P-1")

    def test_treatment_options_are_numeric_with_header_comment(self):
        headers, rows, comments = self.build()
        self.assertIn("治疗_抗生素", headers)
        self.assertEqual(rows[0]["治疗_抗生素"], "5,2")
        self.assertEqual(rows[0]["治疗_血管活性药物"], "0")
        comment = comments["治疗_抗生素"]
        self.assertIn("5=美罗培南", comment)
        self.assertIn("2=哌拉西林/他唑巴坦", comment)

    def test_assessment_and_followup_columns(self):
        headers, rows, _ = self.build()
        self.assertIn("评估_体温(℃)", headers)
        self.assertIn("随访_预后(死亡1/生存0)", headers)
        self.assertEqual(rows[0]["评估_体温(℃)"], 36.5)
        self.assertEqual(rows[0]["随访_预后(死亡1/生存0)"], 0)


if __name__ == "__main__":
    unittest.main()
