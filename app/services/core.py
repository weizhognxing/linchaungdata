import base64
import json
import os
import re

import requests
from werkzeug.security import generate_password_hash

import ai_config
from app.common import DEFAULT_FIELDS, DISEASES
from app.db import db


def init_database():
    with open("schema.sql", "r", encoding="utf-8") as f:
        sql_text = f.read()
    conn = db(database=False)
    try:
        with conn.cursor() as cur:
            for statement in [s.strip() for s in sql_text.split(";") if s.strip()]:
                cur.execute(statement)
        conn.commit()
    finally:
        conn.close()


def migrate_hospital_data_once():
    """
    One-time backfill for existing databases:
    - Create hospitals from users.organization
    - Fill users.hospital_id
    - Ensure one owner(parent_id=0) per hospital when possible
    """
    conn = db()
    try:
        with conn.cursor() as cur:
            cur.execute("SHOW COLUMNS FROM users LIKE 'organization'")
            has_org = cur.fetchone() is not None
            cur.execute("SHOW COLUMNS FROM users LIKE 'hospital_id'")
            has_hospital_id = cur.fetchone() is not None
            cur.execute("SHOW COLUMNS FROM users LIKE 'parent_id'")
            has_parent_id = cur.fetchone() is not None
            if not has_org or not has_hospital_id or not has_parent_id:
                return 0

            cur.execute("SELECT DISTINCT organization FROM users WHERE organization IS NOT NULL AND organization<>''")
            organizations = [row["organization"].strip() for row in cur.fetchall() if row.get("organization")]
            for org_name in organizations:
                cur.execute("INSERT IGNORE INTO hospitals (name) VALUES (%s)", (org_name,))

            cur.execute(
                """
                UPDATE users u
                JOIN hospitals h ON h.name=u.organization
                SET u.hospital_id=h.id
                WHERE (u.hospital_id IS NULL OR u.hospital_id=0)
                  AND u.organization IS NOT NULL
                  AND u.organization<>''
                """
            )

            cur.execute("SELECT id FROM hospitals")
            hospital_ids = [row["id"] for row in cur.fetchall()]
            updated = 0
            for hospital_id in hospital_ids:
                cur.execute("SELECT id FROM users WHERE hospital_id=%s AND parent_id=0 LIMIT 1", (hospital_id,))
                owner = cur.fetchone()
                if owner:
                    continue
                cur.execute("SELECT id FROM users WHERE hospital_id=%s ORDER BY id LIMIT 1", (hospital_id,))
                first_user = cur.fetchone()
                if first_user:
                    cur.execute("UPDATE users SET parent_id=0 WHERE id=%s", (first_user["id"],))
                    updated += 1

        conn.commit()
        return updated
    finally:
        conn.close()


def ensure_runtime_schema_once():
    conn = db()
    try:
        with conn.cursor() as cur:
            _ensure_column(
                cur,
                "patients",
                "case_status",
                "ALTER TABLE patients ADD COLUMN `case_status` varchar(20) NOT NULL DEFAULT 'draft' AFTER `id_number`",
            )
            _ensure_column(
                cur,
                "patients",
                "last_disease_id",
                "ALTER TABLE patients ADD COLUMN `last_disease_id` int(11) DEFAULT NULL AFTER `case_status`",
            )
            _ensure_column(
                cur,
                "lab_records",
                "record_category",
                "ALTER TABLE lab_records ADD COLUMN `record_category` varchar(50) DEFAULT NULL AFTER `disease_id`",
            )
            _ensure_column(
                cur,
                "lab_records",
                "lab_test_name",
                "ALTER TABLE lab_records ADD COLUMN `lab_test_name` varchar(120) DEFAULT NULL AFTER `record_category`",
            )
            _ensure_column(
                cur,
                "treatments",
                "detail_json",
                "ALTER TABLE treatments ADD COLUMN `detail_json` longtext DEFAULT NULL AFTER `treatment_method`",
            )
            _ensure_column(
                cur,
                "treatments",
                "digestive_secretion_drugs_start_time",
                "ALTER TABLE treatments ADD COLUMN `digestive_secretion_drugs_start_time` datetime DEFAULT NULL AFTER `digestive_secretion_drugs`",
            )
            _ensure_column(
                cur,
                "treatments",
                "other_cardiac_drugs_start_time",
                "ALTER TABLE treatments ADD COLUMN `other_cardiac_drugs_start_time` datetime DEFAULT NULL AFTER `other_cardiac_drugs`",
            )
            _ensure_column(
                cur,
                "treatments",
                "poisoning_other_drugs_start_time",
                "ALTER TABLE treatments ADD COLUMN `poisoning_other_drugs_start_time` datetime DEFAULT NULL AFTER `poisoning_other_drugs`",
            )
            _ensure_column(
                cur,
                "treatments",
                "temperature_management_start_time",
                "ALTER TABLE treatments ADD COLUMN `temperature_management_start_time` datetime DEFAULT NULL AFTER `temperature_management`",
            )
        conn.commit()
    finally:
        conn.close()


def _ensure_column(cur, table_name, column_name, sql):
    cur.execute(f"SHOW COLUMNS FROM `{table_name}` LIKE %s", (column_name,))
    if not cur.fetchone():
        cur.execute(sql)

    conn = db()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM admins WHERE username=%s", ("admin",))
            if not cur.fetchone():
                cur.execute(
                    "INSERT INTO admins (username, password_hash) VALUES (%s,%s)",
                    ("admin", generate_password_hash("admin123")),
                )

            for index, name in enumerate(DISEASES, start=1):
                cur.execute(
                    "INSERT IGNORE INTO diseases (name, sort_order) VALUES (%s,%s)",
                    (name, index),
                )

            for index, item in enumerate(DEFAULT_FIELDS, start=1):
                field_name, data_type, comment_text, form_label = item
                cur.execute(
                    """
                    INSERT IGNORE INTO field_settings
                    (field_name, data_type, comment_text, form_label)
                    VALUES (%s,%s,%s,%s)
                    """,
                    (field_name, data_type, comment_text, form_label),
                )
                cur.execute("SELECT id FROM field_settings WHERE field_name=%s", (field_name,))
                field = cur.fetchone()
                cur.execute("SELECT id FROM diseases")
                for disease in cur.fetchall():
                    cur.execute(
                        """
                        INSERT IGNORE INTO form_settings (disease_id, field_id, sort_order)
                        VALUES (%s,%s,%s)
                        """,
                        (disease["id"], field["id"], index),
                    )
        conn.commit()
    finally:
        conn.close()


def get_fields_for_disease(disease_id):
    conn = db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT f.id, f.field_name, f.data_type, f.comment_text, f.form_label
                FROM form_settings s
                JOIN field_settings f ON f.id=s.field_id
                WHERE s.disease_id=%s AND f.enabled=1
                ORDER BY s.sort_order, f.id
                """,
                (disease_id,),
            )
            return cur.fetchall()
    finally:
        conn.close()


def recognize_image(image_path, prompt_text=None):
    with open(image_path, "rb") as f:
        image_data = base64.b64encode(f.read()).decode("utf-8")

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {ai_config.AI_API_KEY}",
    }

    prompt = prompt_text or """请识别这张检验报告图片，提取患者信息和所有检验指标结果。
请严格按照以下JSON格式返回，只返回JSON，不要其他内容：
{
  "lab_test_name": "这张检验图片的检验类别，例如血常规、生化电解质、血气分析、DIC7项、BNP、乳酸、PCT、糖化血红蛋白等",
  "patient": {
    "name": "姓名",
    "gender": "性别",
    "age": "年龄",
    "phone": "电话",
    "id_number": "身份证号或住院号"
  },
  "items": [
    {"name": "检验指标中文名称", "code": "英文缩写", "value": "结果值", "unit": "单位", "reference": "参考区间", "abnormal": "↑/↓/正常"}
  ]
}"""

    payload = {
        "model": ai_config.AI_MODEL,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_data}"}},
                ],
            }
        ],
        "max_tokens": ai_config.AI_MAX_TOKENS,
    }

    response = requests.post(ai_config.AI_API_URL, headers=headers, json=payload, timeout=180)
    if response.status_code == 200:
        return response.json()["choices"][0]["message"]["content"]
    return None


def ask_ai_yes_no(prompt_text, timeout=60):
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {ai_config.AI_API_KEY}",
    }
    payload = {
        "model": ai_config.AI_MODEL,
        "messages": [
            {
                "role": "user",
                "content": [{"type": "text", "text": prompt_text}],
            }
        ],
        "max_tokens": 10,
    }
    response = requests.post(ai_config.AI_API_URL, headers=headers, json=payload, timeout=timeout)
    if response.status_code != 200:
        return False
    content = str(response.json()["choices"][0]["message"]["content"] or "").strip()
    return content.startswith("是")


def parse_ai_result(ai_text, fields):
    if not ai_text:
        return {}

    json_match = re.search(r"\{.*\}", ai_text, re.DOTALL)
    if not json_match:
        return {}

    try:
        ai_data = json.loads(json_match.group())
    except json.JSONDecodeError:
        return {}

    items = ai_data.get("items", [])
    field_map = {f["field_name"].lower(): f for f in fields}

    result = {}
    for item in items:
        code = item.get("code", "").lower()
        value = item.get("value", "")
        if code in field_map:
            result[code] = value
        else:
            for field_name in field_map:
                if code in field_name or field_name in code:
                    result[field_name] = value
                    break
    return result


def parse_lab_test_name(ai_text):
    if not ai_text:
        return ""

    json_match = re.search(r"\{.*\}", ai_text, re.DOTALL)
    if not json_match:
        return ""

    try:
        ai_data = json.loads(json_match.group())
    except json.JSONDecodeError:
        return ""

    return str(ai_data.get("lab_test_name") or ai_data.get("test_name") or ai_data.get("category") or "").strip()


def parse_patient_info(ai_text):
    if not ai_text:
        return {}

    json_match = re.search(r"\{.*\}", ai_text, re.DOTALL)
    if not json_match:
        return {}

    try:
        ai_data = json.loads(json_match.group())
    except json.JSONDecodeError:
        return {}

    patient = ai_data.get("patient") or {}
    if not isinstance(patient, dict):
        return {}

    age_raw = str(patient.get("age") or "").strip()
    age_match = re.search(r"\d+", age_raw)
    age = age_match.group(0) if age_match else ""

    return {
        "name": (patient.get("name") or "").strip(),
        "gender": (patient.get("gender") or "").strip(),
        "age": age,
        "phone": (patient.get("phone") or "").strip(),
        "id_number": (patient.get("id_number") or "").strip(),
    }


def reorder_fields_by_values(fields, values):
    if not fields:
        return fields
    if not values:
        return fields

    with_values = []
    without_values = []
    for field in fields:
        field_name = field.get("field_name")
        value = values.get(field_name)
        if value is not None and str(value).strip() != "":
            with_values.append(field)
        else:
            without_values.append(field)
    return with_values + without_values
