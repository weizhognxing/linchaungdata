import base64
import json
import os
import re
import time

import requests
from werkzeug.security import generate_password_hash

import ai_config
from app.common import DEFAULT_FIELDS, DISEASES
from app.db import db


class AIRecognitionError(Exception):
    pass


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
            if _table_exists(cur, "assessments"):
                _ensure_column(
                    cur,
                    "assessments",
                    "gbs_score",
                    "ALTER TABLE assessments ADD COLUMN `gbs_score` decimal(8,2) DEFAULT NULL AFTER `gcs_score`",
                )
                _ensure_column(
                    cur,
                    "assessments",
                    "killip_score",
                    "ALTER TABLE assessments ADD COLUMN `killip_score` decimal(8,2) DEFAULT NULL AFTER `gbs_score`",
                )
            _ensure_disease_catalog(cur)
        conn.commit()
    finally:
        conn.close()


def _ensure_disease_catalog(cur):
    for index, name in enumerate(DISEASES, start=1):
        cur.execute(
            "INSERT IGNORE INTO diseases (name, sort_order) VALUES (%s,%s)",
            (name, index),
        )
        cur.execute("UPDATE diseases SET sort_order=%s WHERE name=%s", (index, name))

    disease_templates = {
        "ARDS": "重症肺炎",
        "热射病": "颅脑损伤",
    }
    for target_name, source_name in disease_templates.items():
        cur.execute(
            """
            INSERT IGNORE INTO form_settings (disease_id, field_id, sort_order)
            SELECT target.id, source_settings.field_id, source_settings.sort_order
            FROM diseases target
            JOIN diseases source ON source.name=%s
            JOIN form_settings source_settings ON source_settings.disease_id=source.id
            WHERE target.name=%s
            """,
            (source_name, target_name),
        )


def _table_exists(cur, table_name):
    cur.execute("SHOW TABLES LIKE %s", (table_name,))
    return cur.fetchone() is not None


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

    prompt = prompt_text or """请识别这张检验报告图片，提取患者信息、图片上的实际检验名称和所有检验指标结果。
不要把检验名称强行归类为血细胞分析、生化电解质、血气分析、DIC7项、BNP、乳酸、PCT 其中之一；如果图片显示的是糖化血红蛋白、心肌标志物、尿常规、肝功能、肾功能、凝血功能等其他名称，请按图片原文或最接近的报告标题填写。
lab_test_name 只能填写检验项目/报告名称本身，必须去掉前面的套餐编号、医嘱编号、条码编号、内部代码和序号，例如 JY243.血淀粉酶+P-AMY 应返回 血淀粉酶+P-AMY，A001-血细胞分析 应返回 血细胞分析。
如果图片没有明确报告标题，请根据检验指标内容概括一个简短检验名称。
请严格按照以下JSON格式返回，只返回JSON，不要其他内容：
{
  "lab_test_name": "图片上的实际检验名称，例如糖化血红蛋白、心肌标志物、尿常规、肝功能、血细胞分析等",
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
        "max_tokens": max(int(ai_config.AI_MAX_TOKENS or 0), 4000),
    }

    last_error = "AI识别接口暂无返回"
    for attempt in range(3):
        retry_delay = 3 * (attempt + 1)
        try:
            response = requests.post(ai_config.AI_API_URL, headers=headers, json=payload, timeout=360)
        except requests.Timeout:
            last_error = "AI识别接口超时，请稍后重试"
        except requests.RequestException as e:
            last_error = f"AI识别接口请求失败：{e}"
        else:
            if response.status_code == 200:
                try:
                    content = str(response.json()["choices"][0]["message"].get("content") or "").strip()
                except (KeyError, IndexError, TypeError, ValueError) as e:
                    raise AIRecognitionError(f"AI识别接口返回格式异常：{e}")
                if content:
                    return content
                last_error = "AI识别接口返回内容为空，请重新上传或稍后重试"
                continue
            detail = ""
            try:
                body = response.json()
                detail = ((body.get("error") or {}).get("message") or "").strip()
            except ValueError:
                detail = response.text[:200].strip()
            if response.status_code == 429:
                last_error = "AI识别接口请求过快，请稍后重试"
                retry_delay = 60 * (attempt + 1)
            else:
                last_error = f"AI识别接口返回异常：HTTP {response.status_code}"
            if detail:
                last_error += f"，{detail}"
        if attempt < 2:
            time.sleep(retry_delay)
    raise AIRecognitionError(last_error)


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

    return clean_lab_test_name(ai_data.get("lab_test_name") or ai_data.get("test_name") or ai_data.get("category") or "")


def clean_lab_test_name(value):
    name = str(value or "").strip()
    if not name:
        return ""
    name = re.sub(r"^[A-Za-z]{1,8}\d{1,8}\s*[.．、:：\-_]+\s*", "", name).strip()
    name = re.sub(r"^\d{1,8}\s*[.．、:：\-_]+\s*", "", name).strip()
    return name


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

    field_map = {field.get("field_name"): field for field in fields}
    ordered = []
    used = set()
    for field_name, value in values.items():
        if value is None or str(value).strip() == "":
            continue
        field = field_map.get(field_name)
        if field:
            ordered.append(field)
            used.add(field_name)

    without_values = []
    for field in fields:
        field_name = field.get("field_name")
        if field_name not in used:
            without_values.append(field)
    return ordered + without_values
