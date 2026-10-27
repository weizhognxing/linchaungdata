"""Database-backed lab categories and shared completion rules."""
import json
import re

from app.db import db

HIDDEN_FIELDS = {"hemo", "icte", "lipe"}


def migrate_lab_catalog():
    # Seed only once: later starts must never overwrite administrator choices.
    from app.routes.record_helpers import (
        LAB_CATEGORY_DEFINITIONS, DISEASE_REQUIRED_LAB_KEYS,
        _normalize_lab_category_keys,
    )
    conn = db()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT GET_LOCK('picco_lab_catalog_v1', 30) AS acquired")
            if cur.fetchone()["acquired"] != 1:
                raise RuntimeError("Could not acquire lab migration lock")
            statements = [
                """CREATE TABLE IF NOT EXISTS lab_catalog_migrations (
                    version varchar(40) PRIMARY KEY, applied_at timestamp DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""",
                """CREATE TABLE IF NOT EXISTS lab_categories (
                    id int NOT NULL AUTO_INCREMENT PRIMARY KEY,
                    category_key varchar(63) NOT NULL UNIQUE,
                    label varchar(120) NOT NULL UNIQUE,
                    enabled tinyint NOT NULL DEFAULT 1,
                    sort_order int NOT NULL DEFAULT 0
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""",
                """CREATE TABLE IF NOT EXISTS lab_category_fields (
                    category_id int NOT NULL, field_id int NOT NULL,
                    required tinyint NOT NULL DEFAULT 1, sort_order int NOT NULL DEFAULT 0,
                    PRIMARY KEY(category_id, field_id), KEY(field_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""",
                """CREATE TABLE IF NOT EXISTS disease_lab_categories (
                    disease_id int NOT NULL, category_id int NOT NULL, sort_order int NOT NULL DEFAULT 0,
                    PRIMARY KEY(disease_id, category_id), KEY(category_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""",
                """CREATE TABLE IF NOT EXISTS lab_record_categories (
                    record_id int NOT NULL, category_id int NOT NULL,
                    PRIMARY KEY(record_id, category_id), KEY(category_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""",
                """CREATE TABLE IF NOT EXISTS lab_completion_snapshots (
                    patient_id int PRIMARY KEY, snapshot_json longtext NOT NULL,
                    created_at timestamp DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""",
            ]
            for statement in statements:
                cur.execute(statement)
            cur.execute('CREATE TABLE IF NOT EXISTS lab_record_categories_72h LIKE lab_record_categories')
            cur.execute("SELECT version FROM lab_catalog_migrations WHERE version='category_v1'")
            if cur.fetchone():
                return
            cur.execute("SELECT id, field_name FROM field_settings WHERE enabled=1")
            fields = {row["field_name"]: row["id"] for row in cur.fetchall()}
            cur.execute("SHOW COLUMNS FROM lab_records")
            columns = {row["Field"] for row in cur.fetchall()}
            categories = {}
            for index, (key, definition) in enumerate(LAB_CATEGORY_DEFINITIONS.items()):
                if key in {"blood_routine", "dic7"}:
                    continue
                cur.execute("INSERT INTO lab_categories(category_key,label,sort_order) VALUES (%s,%s,%s)",
                            (key, definition["label"], index))
                category_id = cur.lastrowid
                categories[key] = category_id
                names = definition["fields"]
                for position, name in enumerate(names):
                    if name in fields and name in columns and name not in HIDDEN_FIELDS:
                        cur.execute("INSERT INTO lab_category_fields(category_id,field_id,required,sort_order) VALUES (%s,%s,1,%s)",
                                    (category_id, fields[name], position))
            cur.execute("SELECT id, name FROM diseases")
            for disease in cur.fetchall():
                for position, key in enumerate(sorted(DISEASE_REQUIRED_LAB_KEYS.get(disease["name"], set()))):
                    if key in categories:
                        cur.execute("INSERT INTO disease_lab_categories(disease_id,category_id,sort_order) VALUES (%s,%s,%s)",
                                    (disease["id"], categories[key], position))
            cur.execute("SELECT id,record_category,lab_test_name FROM lab_records")
            for record in cur.fetchall():
                keys = _normalize_lab_category_keys(record["record_category"] or record["lab_test_name"])
                for key in keys:
                    if key in categories:
                        cur.execute("INSERT IGNORE INTO lab_record_categories(record_id,category_id) VALUES (%s,%s)",
                                    (record["id"], categories[key]))
            cur.execute("SELECT id FROM patients WHERE case_status IN ('submitted','approved') OR case_integrity IN ('complete','submitted')")
            for patient in cur.fetchall():
                cur.execute("INSERT IGNORE INTO lab_completion_snapshots(patient_id,snapshot_json) VALUES (%s,%s)",
                            (patient["id"], json.dumps({"legacy": True, "complete": True, "categories": []})))
            cur.execute("INSERT INTO lab_catalog_migrations(version) VALUES ('category_v1')")
        conn.commit()
    finally:
        conn.close()


def migrate_pct_single_field():
    """Consolidate the PCT abbreviation so it only ever means procalcitonin.

    Historically a mislabeled ``pct`` field stored plateletcrit (血小板压积) while
    a duplicate ``pct_`` field stored procalcitonin (降钙素原). Plateletcrit is no
    longer collected, so ``pct`` becomes the single procalcitonin field and the
    ``pct_`` field and columns are removed. Runs once, guarded by a version row.
    """
    conn = db()
    try:
        with conn.cursor() as cur:
            cur.execute("""CREATE TABLE IF NOT EXISTS lab_catalog_migrations (
                    version varchar(40) PRIMARY KEY, applied_at timestamp DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""")
            cur.execute("SELECT version FROM lab_catalog_migrations WHERE version='pct_single_field_v1'")
            if cur.fetchone():
                return
            for table in ("lab_records", "lab_records_72h"):
                cur.execute("""SELECT COUNT(*) AS total FROM information_schema.columns
                               WHERE table_schema=DATABASE() AND table_name=%s AND column_name='pct'""", (table,))
                if not cur.fetchone()["total"]:
                    continue
                cur.execute(f"UPDATE `{table}` SET pct=NULL WHERE pct IS NOT NULL")
                cur.execute("""SELECT COUNT(*) AS total FROM information_schema.columns
                               WHERE table_schema=DATABASE() AND table_name=%s AND column_name='pct_'""", (table,))
                if cur.fetchone()["total"]:
                    cur.execute(f"ALTER TABLE `{table}` DROP COLUMN `pct_`")
            cur.execute("DELETE FROM lab_category_fields WHERE field_id IN (SELECT id FROM field_settings WHERE field_name='pct_')")
            cur.execute("DELETE FROM form_settings WHERE field_id IN (SELECT id FROM field_settings WHERE field_name='pct_')")
            cur.execute("DELETE FROM field_settings WHERE field_name='pct_'")
            cur.execute("""UPDATE field_settings
                           SET form_label='降钙素原', comment_text='降钙素原', unit='ng/ml', data_type='decimal', enabled=1
                           WHERE field_name='pct'""")
            cur.execute("SELECT id FROM lab_categories WHERE category_key='pct'")
            category = cur.fetchone()
            cur.execute("SELECT id FROM field_settings WHERE field_name='pct'")
            field = cur.fetchone()
            if category and field:
                cur.execute("INSERT IGNORE INTO lab_category_fields(category_id,field_id,required,sort_order) VALUES (%s,%s,1,0)",
                            (category["id"], field["id"]))
            cur.execute("INSERT INTO lab_catalog_migrations(version) VALUES ('pct_single_field_v1')")
        conn.commit()
    finally:
        conn.close()


def catalog(cur, active_only=False):
    cur.execute("SELECT id,category_key AS `key`,label,enabled,sort_order FROM lab_categories " +
                ("WHERE enabled=1 " if active_only else "") + "ORDER BY sort_order,id")
    categories = list(cur.fetchall())
    cur.execute("""SELECT m.category_id,m.required,m.sort_order,f.*
                   FROM lab_category_fields m JOIN field_settings f ON f.id=m.field_id
                   ORDER BY m.sort_order,f.id""")
    by_category = {}
    for field in cur.fetchall():
        by_category.setdefault(field["category_id"], []).append(field)
    cur.execute("SHOW COLUMNS FROM lab_records")
    columns = {row["Field"] for row in cur.fetchall()}
    for category in categories:
        category["fields"] = by_category.get(category["id"], [])
        for field in category["fields"]:
            field["available"] = bool(field["enabled"] and field["field_name"] in columns and field["field_name"] not in HIDDEN_FIELDS)
    return categories


def fields_for_categories(categories, keys=None):
    selected = set(keys) if keys is not None else None
    result = {}
    for category in categories:
        if not category["enabled"] or (selected is not None and category["key"] not in selected):
            continue
        for field in category["fields"]:
            if not field["available"]:
                continue
            name = field["field_name"]
            if name not in result:
                result[name] = dict(field, required=bool(field["required"]), categories=[category["key"]])
            else:
                result[name]["required"] |= bool(field["required"])
                result[name]["categories"].append(category["key"])
    return list(result.values())


def get_category_fields(keys=None):
    conn = db()
    try:
        with conn.cursor() as cur:
            return fields_for_categories(catalog(cur), keys)
    finally:
        conn.close()


def parse_category_keys(value):
    if isinstance(value, list):
        return list(dict.fromkeys(str(item).strip() for item in value if str(item).strip()))
    return list(dict.fromkeys(item.strip() for item in str(value or "").split(",") if item.strip()))


def has_result(value):
    return value is not None and str(value).strip() not in {"", "-", "--", "未测", "未查"}


def infer_categories(categories, values):
    """Use matched indicator identities, including indicators with unreadable values.

    Shared indicators alone are ambiguous. Select categories with exclusive
    evidence, then explain remaining indicators without adding redundant panels.
    """
    observed = set(values)
    candidates = []
    for category in categories:
        if not category['enabled']:
            continue
        names = {f['field_name'] for f in category['fields'] if f['available']}
        matched = names & observed
        if matched:
            candidates.append((category, names, matched))
    selected = []
    covered = set()
    for category, names, matched in candidates:
        other_names = set().union(*(n for c, n, _ in candidates if c['key'] != category['key']))
        if matched - other_names:
            selected.append(category['key'])
            covered.update(matched)
    ambiguous = [c['key'] for c, _, matched in candidates
                 if c['key'] not in selected and matched - covered]
    return {'selected': selected, 'ambiguous': ambiguous,
            'matches': [{'key': c['key'], 'label': c['label'], 'fields': sorted(m)}
                        for c, _, m in candidates]}


def evaluate_category(category, records):
    required = [field for field in category["fields"] if field["required"]]
    configured = bool(required) and all(field["available"] for field in required)
    candidates = [record for record in records if category["id"] in record.get("category_ids", [])]
    missing = required
    matched_record = None
    # Do not combine results from different reports/times to fake a complete report.
    for record in candidates:
        absent = [field for field in required if not has_result(record.get(field["field_name"]))]
        if matched_record is None or len(absent) < len(missing):
            missing = absent
            matched_record = record["id"]
    complete = bool(configured and candidates and not missing)
    return {"id": category["id"], "key": category["key"], "label": category["label"],
            "enabled": category["enabled"], "configured": configured, "complete": complete,
            "record_id": matched_record, "required_count": len(required),
            "missing": [{"field_name": f["field_name"], "label": f["form_label"]} for f in missing]}


def patient_lab_progress(cur, patient_id, use_snapshot=True, timepoint='0h'):
    if timepoint not in ('0h', '72h'):
        raise ValueError('Invalid lab timepoint')
    record_table = 'lab_records' if timepoint == '0h' else 'lab_records_72h'
    category_table = 'lab_record_categories' if timepoint == '0h' else 'lab_record_categories_72h'
    if use_snapshot and timepoint == '0h':
        cur.execute("SELECT snapshot_json FROM lab_completion_snapshots WHERE patient_id=%s", (patient_id,))
        snapshot = cur.fetchone()
        if snapshot:
            return dict(json.loads(snapshot["snapshot_json"]), frozen=True)
    categories = catalog(cur)
    cur.execute("""SELECT DISTINCT dr.diagnosis_disease,d.id AS disease_id
                   FROM diagnosis_records dr LEFT JOIN diseases d ON d.name=dr.diagnosis_disease
                   WHERE dr.patient_id=%s""", (patient_id,))
    diagnoses = cur.fetchall()
    cur.execute("SELECT disease_id,category_id FROM disease_lab_categories")
    requirements = {}
    for row in cur.fetchall():
        requirements.setdefault(row["disease_id"], set()).add(row["category_id"])
    required_ids = set()
    unconfigured = []
    for diagnosis in diagnoses:
        required = requirements.get(diagnosis["disease_id"], set())
        required_ids.update(required)
        if not required:
            unconfigured.append(diagnosis["diagnosis_disease"])
    cur.execute(f"SELECT * FROM {record_table} WHERE patient_id=%s ORDER BY id DESC", (patient_id,))
    records = list(cur.fetchall())
    cur.execute(f"""SELECT rc.record_id,rc.category_id FROM {category_table} rc
                   JOIN {record_table} r ON r.id=rc.record_id WHERE r.patient_id=%s""", (patient_id,))
    associations = {}
    for row in cur.fetchall():
        associations.setdefault(row["record_id"], []).append(row["category_id"])
    for record in records:
        record["category_ids"] = associations.get(record["id"], [])
    statuses = [dict(evaluate_category(category, records), required=category["id"] in required_ids)
                for category in categories if category["id"] in required_ids or
                any(category["id"] in record["category_ids"] for record in records)]
    required_statuses = [item for item in statuses if item["required"]]
    complete = bool(diagnoses and required_statuses and not unconfigured and
                    all(item["complete"] for item in required_statuses))
    return {"complete": complete, "categories": statuses, "unconfigured_diseases": unconfigured,
            "has_diagnosis": bool(diagnoses), "frozen": False}


def snapshot_completion(cur, patient_id):
    progress = patient_lab_progress(cur, patient_id, use_snapshot=False)
    cur.execute("INSERT IGNORE INTO lab_completion_snapshots(patient_id,snapshot_json) VALUES (%s,%s)",
                (patient_id, json.dumps(progress, ensure_ascii=False)))
