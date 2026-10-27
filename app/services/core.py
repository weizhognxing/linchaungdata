import base64
import json
import mimetypes
import os
import re
import time

import requests

import ai_config
from app.common import DISEASES
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
                "patients",
                "plasma_number_72h",
                "ALTER TABLE patients ADD COLUMN `plasma_number_72h` varchar(1000) DEFAULT NULL AFTER `plasma_number`",
            )
            cur.execute(
                "UPDATE patient_field_settings SET form_label=%s WHERE field_name=%s AND form_label=%s",
                ("血浆编号(0h)", "plasma_number", "血浆编号"),
            )
            cur.execute(
                "INSERT IGNORE INTO patient_field_settings (field_name,data_type,form_label) VALUES (%s,%s,%s)",
                ("plasma_number_72h", "varchar", "血浆编号(72h)"),
            )
            _ensure_column(
                cur,
                "patients",
                "case_reject_reason",
                "ALTER TABLE patients ADD COLUMN `case_reject_reason` text DEFAULT NULL AFTER `case_status`",
            )
            _ensure_column(
                cur,
                "lab_records",
                "record_category",
                "ALTER TABLE lab_records ADD COLUMN `record_category` varchar(255) DEFAULT NULL AFTER `disease_id`",
            )
            cur.execute("SHOW COLUMNS FROM `lab_records` LIKE 'record_category'")
            record_category_column = cur.fetchone() or {}
            if "varchar(50)" in str(record_category_column.get("Type") or "").lower():
                cur.execute("ALTER TABLE lab_records MODIFY COLUMN `record_category` varchar(255) DEFAULT NULL")
            _ensure_column(
                cur,
                "lab_records",
                "lab_test_name",
                "ALTER TABLE lab_records ADD COLUMN `lab_test_name` varchar(120) DEFAULT NULL AFTER `record_category`",
            )
            cur.execute("CREATE TABLE IF NOT EXISTS lab_records_72h LIKE lab_records")
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
                _ensure_column(
                    cur,
                    "assessments",
                    "procalcitonin",
                    "ALTER TABLE assessments ADD COLUMN `procalcitonin` decimal(8,2) DEFAULT NULL AFTER `shock_index`",
                )
            _ensure_index(
                cur,
                "patients",
                "uniq_patient_identity",
                "ALTER TABLE patients ADD UNIQUE KEY `uniq_patient_identity` (`name`,`gender`,`age`)",
            )
            _ensure_system_settings(cur)
            _ensure_disease_catalog(cur)
        conn.commit()
    finally:
        conn.close()


def _ensure_system_settings(cur):
    cur.execute(
        """CREATE TABLE IF NOT EXISTS system_settings (
            id int(11) NOT NULL AUTO_INCREMENT PRIMARY KEY,
            doctor_download_multiplier int(11) NOT NULL DEFAULT 1
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"""
    )
    cur.execute("SELECT COUNT(*) AS total FROM system_settings")
    if (cur.fetchone() or {}).get("total", 0) == 0:
        cur.execute("INSERT INTO system_settings (doctor_download_multiplier) VALUES (1)")


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


def _ensure_index(cur, table_name, index_name, sql):
    cur.execute(f"SHOW INDEX FROM `{table_name}` WHERE Key_name=%s", (index_name,))
    if not cur.fetchone():
        cur.execute(sql)


def get_fields_for_disease(disease_id):
    conn = db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT f.id, f.field_name, f.data_type, f.comment_text, f.form_label,
                       f.unit, f.reference_range, f.test_method
                FROM disease_lab_categories dc
                JOIN lab_categories c ON c.id=dc.category_id AND c.enabled=1
                JOIN lab_category_fields s ON s.category_id=c.id
                JOIN field_settings f ON f.id=s.field_id
                WHERE dc.disease_id=%s AND f.enabled=1
                GROUP BY f.id
                ORDER BY f.id
                """,
                (disease_id,),
            )
            return cur.fetchall()
    finally:
        conn.close()


def recognize_image(image_path, prompt_text=None):
    with open(image_path, "rb") as f:
        image_data = base64.b64encode(f.read()).decode("utf-8")
    image_mime_type = _guess_image_mime_type(image_path)

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

    payload = _build_ai_payload(
        prompt,
        image_data=image_data,
        image_mime_type=image_mime_type,
        max_tokens=max(int(ai_config.AI_MAX_TOKENS or 0), 4000),
    )

    last_error = "AI识别接口暂无返回"
    for attempt in range(3):
        retry_delay = 3 * (attempt + 1)
        try:
            response = requests.post(ai_config.AI_API_URL, headers=headers, json=payload, timeout=360)
        except requests.Timeout:
            last_error = "AI识别接口超时，请稍后重试"
            _log_ai_recognition_failure(last_error, attempt)
        except requests.RequestException as e:
            last_error = f"AI识别接口请求失败：{e}"
            _log_ai_recognition_failure(last_error, attempt)
        else:
            if response.status_code == 200:
                try:
                    content = _extract_ai_content(response.json())
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
            _log_ai_recognition_failure(last_error, attempt)
        if attempt < 2:
            time.sleep(retry_delay)
    raise AIRecognitionError(last_error)


def _log_ai_recognition_failure(message, attempt):
    print(
        "AI recognition upstream failure: "
        f"attempt={attempt + 1}, model={ai_config.AI_MODEL}, url={ai_config.AI_API_URL}, error={message}",
        flush=True,
    )


def ask_ai_yes_no(prompt_text, timeout=60):
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {ai_config.AI_API_KEY}",
    }
    payload = _build_ai_payload(prompt_text, max_tokens=10)
    response = requests.post(ai_config.AI_API_URL, headers=headers, json=payload, timeout=timeout)
    if response.status_code != 200:
        return False
    content = _extract_ai_content(response.json())
    return content.startswith("是")


def _uses_responses_api():
    return str(ai_config.AI_API_URL or "").rstrip("/").endswith("/responses")


def _guess_image_mime_type(image_path):
    mime_type = mimetypes.guess_type(image_path)[0]
    if mime_type in {"image/jpeg", "image/png", "image/webp", "image/gif"}:
        return mime_type
    return "image/jpeg"


def _build_ai_payload(prompt_text, image_data=None, image_mime_type="image/jpeg", max_tokens=2000):
    if _uses_responses_api():
        content = [{"type": "input_text", "text": prompt_text}]
        if image_data:
            content.append({"type": "input_image", "image_url": f"data:{image_mime_type};base64,{image_data}"})
        return {
            "model": ai_config.AI_MODEL,
            "input": [{"role": "user", "content": content}],
            "max_output_tokens": max_tokens,
        }

    content = [{"type": "text", "text": prompt_text}]
    if image_data:
        content.append({"type": "image_url", "image_url": {"url": f"data:{image_mime_type};base64,{image_data}"}})
    return {
        "model": ai_config.AI_MODEL,
        "messages": [{"role": "user", "content": content}],
        "temperature": float(getattr(ai_config, "AI_TEMPERATURE", 0.7)),
        "max_tokens": max_tokens,
        "stream": False,
    }


def _extract_ai_content(body):
    if not _uses_responses_api():
        return str(body["choices"][0]["message"].get("content") or "").strip()

    output_text = body.get("output_text")
    if output_text:
        return str(output_text).strip()

    text_parts = []
    for item in body.get("output") or []:
        for content in item.get("content") or []:
            if content.get("type") in {"output_text", "text"}:
                text = content.get("text")
                if text:
                    text_parts.append(str(text))
    return "".join(text_parts).strip()


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
    normalized_field_map = {
        _normalize_lab_code(field_name): field_name
        for field_name in field_map
        if _normalize_lab_code(field_name)
    }
    label_field_map = _build_lab_label_field_map(fields)

    result = {}
    for item in items:
        code = item.get("code", "").lower()
        name = item.get("name", "")
        normalized_code = _normalize_lab_code(code)
        raw_code_alias = _alias_field_for_raw_code(code, normalized_code, field_map)
        alias_field = _alias_field_for_code(normalized_code, field_map)
        label_field = _label_field_for_item(code, name, label_field_map)
        value = item.get("value", "")
        if code in field_map:
            result[code] = value
        elif raw_code_alias:
            result[raw_code_alias] = value
        elif alias_field:
            result[alias_field] = value
        elif normalized_code in normalized_field_map:
            result[normalized_field_map[normalized_code]] = value
        elif label_field:
            result[label_field] = value
        else:
            for field_name in field_map:
                normalized_field = _normalize_lab_code(field_name)
                if len(normalized_code) >= 3 and len(normalized_field) >= 3 and normalized_code in normalized_field:
                    result[field_name] = value
                    break
    return {
        field_name: value
        for field_name, value in result.items()
        if field_name not in HIDDEN_LAB_FIELD_NAMES
    }


HIDDEN_LAB_FIELD_NAMES = {"hemo", "icte", "lipe"}


LAB_CODE_ALIASES = {
    "ckmb": ["ck_mb_stat", "ckmb"],
    "ckmbmass": ["ck_mb_stat", "ckmb"],
    "myo": ["myo_stat", "myo"],
    "hsctnt": ["hs_ctnt_stat", "hs_ctni_stat"],
    "ctnt": ["hs_ctnt_stat", "hs_ctni_stat"],
    "hstni": ["hs_ctni_stat", "hs_ctnt_stat"],
    "ctni": ["hs_ctni_stat", "hs_ctnt_stat"],
    "tni": ["hs_ctni_stat", "hs_ctnt_stat"],
}

LAB_RAW_CODE_ALIASES = {
    "pt%": ["pta"],
    "pt-%": ["pta"],
    "pt-%activity": ["pta"],
    "ptactivity": ["pta"],
}

LAB_PERCENT_CODE_ALIASES = {
    "neu": "neu_r",
    "neut": "neu_r",
    "gran": "neu_r",
    "lym": "lym_r",
    "lymph": "lym_r",
    "mono": "mono_r",
    "mon": "mono_r",
    "eos": "eos_r",
    "baso": "baso_r",
    "bas": "baso_r",
}

LAB_NAME_ALIASES = {
    "白细胞": ["wbc"],
    "白细胞计数": ["wbc"],
    "白细胞数": ["wbc"],
    "中性粒细胞": ["neu"],
    "中性粒细胞计数": ["neu"],
    "中性粒细胞数": ["neu"],
    "淋巴细胞": ["lym"],
    "淋巴细胞计数": ["lym"],
    "淋巴细胞数": ["lym"],
    "单核细胞": ["mono"],
    "单核细胞计数": ["mono"],
    "单核细胞数": ["mono"],
    "嗜酸性粒细胞": ["eos"],
    "嗜酸性粒细胞计数": ["eos"],
    "嗜酸性粒细胞数": ["eos"],
    "嗜碱性粒细胞": ["baso"],
    "嗜碱性粒细胞计数": ["baso"],
    "嗜碱性粒细胞数": ["baso"],
    "中性粒细胞百分比": ["neu_r"],
    "中性粒细胞率": ["neu_r"],
    "淋巴细胞百分比": ["lym_r"],
    "淋巴细胞率": ["lym_r"],
    "单核细胞百分比": ["mono_r"],
    "单核细胞率": ["mono_r"],
    "嗜酸性粒细胞百分比": ["eos_r"],
    "嗜酸性粒细胞率": ["eos_r"],
    "嗜碱性粒细胞百分比": ["baso_r"],
    "嗜碱性粒细胞率": ["baso_r"],
    "红细胞": ["rbc"],
    "红细胞计数": ["rbc"],
    "血红蛋白": ["hgb"],
    "血小板": ["plt"],
    "血小板计数": ["plt"],
    "C反应蛋白": ["crp", "hscrp"],
    "超敏C反应蛋白": ["hscrp", "crp"],
    "高敏C反应蛋白": ["hscrp", "crp"],
    "降钙素原": ["pct"],
    "乳酸": ["lactate", "lac_la"],
    "肌酐": ["crea", "creatinine"],
    "谷丙转氨酶": ["alt"],
    "丙氨酸氨基转移酶": ["alt"],
    "谷草转氨酶": ["ast"],
    "天门冬氨酸氨基转移酶": ["ast"],
    "钾": ["k"],
    "钠": ["na"],
    "氯": ["cl"],
    "钙": ["ca", "ca__"],
    "葡萄糖": ["glu"],
    "凝血酶原时间": ["pt"],
    "国际标准化比值": ["pt_inr"],
    "凝血酶原时间比率": ["pt_ratio"],
    "凝血酶原时间活动度": ["pta"],
    "凝血酶原活动度": ["pta"],
    "活化部分凝血酶时间": ["aptt"],
    "活化部分凝血活酶时间": ["aptt"],
    "部分凝血活酶时间": ["aptt"],
    "APTT比值": ["aptt_r"],
    "凝血酶时间": ["tt"],
    "纤维蛋白原": ["fib"],
    "D二聚体": ["d_di"],
    "D-二聚体": ["d_di"],
    "纤维蛋白原降解产物": ["fdp"],
    "抗凝血酶III": ["at3"],
    "抗凝血活酶III": ["at3"],
    "抗凝血酶-III": ["at3"],
    "抗凝血活酶-III": ["at3"],
}


def _alias_field_for_code(normalized_code, field_map):
    for field_name in LAB_CODE_ALIASES.get(normalized_code, []):
        if field_name in field_map:
            return field_name
    return ""


def _alias_field_for_raw_code(code, normalized_code, field_map):
    raw_code = _normalize_lab_raw_code(code)
    for field_name in LAB_RAW_CODE_ALIASES.get(raw_code, []):
        if field_name in field_map:
            return field_name
    if "%" in raw_code:
        field_name = LAB_PERCENT_CODE_ALIASES.get(normalized_code)
        if field_name in field_map:
            return field_name
    return ""


def _build_lab_label_field_map(fields):
    label_map = {}
    for field in fields:
        field_name = field.get("field_name")
        if not field_name:
            continue
        for value in (field.get("form_label"), field.get("comment_text"), field_name):
            normalized_label = _normalize_lab_label(value)
            if normalized_label and normalized_label not in label_map:
                label_map[normalized_label] = field_name
    return label_map


def _label_field_for_item(code, name, label_field_map):
    for value in (code, name):
        normalized_label = _normalize_lab_label(value)
        if not normalized_label:
            continue
        field_name = label_field_map.get(normalized_label)
        if field_name:
            return field_name
        for alias_label, alias_fields in LAB_NAME_ALIASES.items():
            if normalized_label != _normalize_lab_label(alias_label):
                continue
            for alias_field in alias_fields:
                if alias_field in label_field_map.values():
                    return alias_field
    return ""


def _normalize_lab_code(value):
    return re.sub(r"[^a-z0-9]+", "", str(value or "").lower())


def _normalize_lab_raw_code(value):
    code = str(value or "").strip().lower().replace("％", "%")
    return re.sub(r"[\s\u3000_]+", "", code)


def _normalize_lab_label(value):
    return re.sub(r"[\s\u3000（）()\[\]【】,，.。:：;；、/\\\-_+＋%％]+", "", str(value or "").strip().lower())


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
