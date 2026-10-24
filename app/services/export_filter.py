"""Limit exported records to the selected disease without touching stored data."""


def filter_export_rows(table_name, rows, disease_id, disease_name, diagnosis_ids):
    if disease_id is None:
        return rows
    if table_name == "patients":
        result = []
        for row in rows:
            copy = dict(row)
            for key in ("diagnosis", "diagnosis_disease", "preliminary_diagnosis", "medical_history"):
                if key in copy:
                    copy[key] = None
            if "last_disease_id" in copy and copy["last_disease_id"] != disease_id:
                copy["last_disease_id"] = None
            result.append(copy)
        return result
    if table_name == "diagnosis_records":
        return [row for row in rows if row.get("diagnosis_disease") == disease_name]
    if table_name in {"lab_records", "lab_records_72h"}:
        return [row for row in rows if row.get("disease_id") == disease_id]
    return [row for row in rows if row.get("diagnosis_record_id") in diagnosis_ids]
