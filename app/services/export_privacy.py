"""Remove direct identifiers from case export copies, not database records."""
import re
import secrets


PRIVATE_COLUMNS = {
    "user_id", "hospital_id", "phone", "id_number", "case_number",
    "registration_number", "plasma_number", "plasma_number_72h",
    "paxgene_number", "photo_path", "ai_raw", "remark",
}
PRIVATE_COLUMN_PARTS = ("phone", "mobile", "email", "address", "contact", "wechat", "id_card", "id_number", "photo", "path")
NUMBER_PATTERN = re.compile(r"(?<!\d)\d{7,}(?:[Xx])?(?!\d)")
EMAIL_PATTERN = re.compile(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}")


def export_identity_map(patient_rows):
    aliases = {row["id"]: "P-" + secrets.token_hex(8) for row in patient_rows}
    identities = set()
    for row in patient_rows:
        for key in ("name", "phone", "id_number", "case_number", "registration_number",
                    "plasma_number", "plasma_number_72h", "paxgene_number"):
            value = str(row.get(key) or "").strip()
            if len(value) >= (2 if key == "name" else 4):
                identities.add(value)
    return aliases, sorted(identities, key=len, reverse=True)


def anonymize_export_rows(table_name, rows, aliases, identities, diagnosis_aliases):
    result = []
    for row in rows:
        patient_id = row["id"] if table_name == "patients" else row["patient_id"]
        cleaned = {}
        for key, value in row.items():
            lower = key.lower()
            if key == "patient_id" or (table_name == "patients" and key == "id"):
                cleaned[key] = aliases[patient_id]
            elif key == "id":
                cleaned[key] = diagnosis_aliases.get(value) if table_name == "diagnosis_records" else None
            elif key == "diagnosis_record_id":
                cleaned[key] = diagnosis_aliases.get(value)
            elif (lower in PRIVATE_COLUMNS or any(part in lower for part in PRIVATE_COLUMN_PARTS)
                  or (table_name == "patients" and (lower == "name" or lower.endswith("_name") or lower.endswith("_number")
                                                    or lower.endswith("_no")))):
                cleaned[key] = None
            elif isinstance(value, str):
                for identity in identities:
                    value = value.replace(identity, "[已脱敏]")
                cleaned[key] = EMAIL_PATTERN.sub("[已脱敏]", NUMBER_PATTERN.sub("[已脱敏]", value))
            else:
                cleaned[key] = value
        result.append(cleaned)
    return result
