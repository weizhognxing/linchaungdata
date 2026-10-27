# Lab record save and lab record detail routes.
# Routes in this file register on the shared records_bp blueprint.
import json
import os
import re
import time
import zipfile
from io import BytesIO

from flask import current_app, request, send_file, session
from pymysql.err import IntegrityError
from werkzeug.utils import secure_filename

from app.common import fail, ok, required
from app.db import db
from app.decorators import require_user
from app.routes.record_blueprint import records_bp
from app.routes.record_helpers import *  # noqa: F403 - shared route helpers
from app.services.core import AIRecognitionError, HIDDEN_LAB_FIELD_NAMES, get_fields_for_disease, parse_ai_result, parse_lab_test_name, parse_patient_info, recognize_image, reorder_fields_by_values
from app.services.lab_catalog import catalog, fields_for_categories, parse_category_keys, patient_lab_progress, has_result


def _normalize_lab_field_value(value, data_type):
    raw_value = str(value if value is not None else "").strip()
    if raw_value == "":
        return None
    if data_type == "decimal":
        number = re.search(r"[-+]?\d+(?:,\d{3})*(?:\.\d+)?|[-+]?\.\d+", raw_value)
        return number.group(0).replace(",", "") if number else None
    if data_type == "int":
        number = re.search(r"[-+]?\d+", raw_value.replace(",", ""))
        return number.group(0) if number else None
    return raw_value


@records_bp.post("/api/records")
@records_bp.post("/api/records/<int:record_id>")
@require_user
def save_record(record_id=None):
    data = request.get_json(silent=True) or {}
    timepoint = data.get("timepoint", "0h")
    if timepoint not in ("0h", "72h"):
        return fail("检验时间点无效")
    record_table = "lab_records" if timepoint == "0h" else "lab_records_72h"
    category_table = "lab_record_categories" if timepoint == "0h" else "lab_record_categories_72h"
    patient_id = data.get("patient_id")
    if timepoint == "72h" and not (patient_id or record_id):
        return fail("请先选择病人，再录入72h检验")
    raw_patient = data.get("patient") or {}
    patient = {
        "name": (raw_patient.get("name") or "").strip(),
        "gender": (raw_patient.get("gender") or "").strip(),
        "age": raw_patient.get("age"),
        "phone": (raw_patient.get("phone") or "").strip(),
        "id_number": (raw_patient.get("id_number") or "").strip(),
    }
    identity = _normalize_patient_identity(patient)
    patient.update(identity)
    values = data.get("values") or {}
    disease_id = data.get("disease_id")
    record_category_keys = parse_category_keys(data.get("record_category"))
    if not record_category_keys:
        return fail("请选择检验类别")
    record_category = ",".join(record_category_keys)
    if len(record_category) > 255:
        return fail("所选类别过多，请分开录入")
    lab_test_name = str(data.get("lab_test_name") or "").strip()[:120] or None
    if not disease_id:
        return fail("请先选择疾病")
    if not record_id and not patient_id and _patient_identity_missing(patient):
        return fail("请填写姓名、性别、年龄")

    conn = db()
    try:
        with conn.cursor() as cur:
            categories = catalog(cur)
            active = {item["key"]: item for item in categories if item["enabled"]}
            if not set(record_category_keys).issubset(active):
                return fail("包含不存在或已停用的检验类别，请刷新后重试")
            if any(not active[key]["fields"] for key in record_category_keys):
                return fail("所选类别尚未配置指标，请联系管理员配置")
            field_types = {field["field_name"]: field.get("data_type") for field in fields_for_categories(categories, record_category_keys)}
            allowed_fields = set(field_types)
            if not isinstance(values, dict):
                return fail("指标结果格式无效")
            if any(key not in allowed_fields and has_result(value) for key, value in values.items()):
                return fail("包含所选类别之外的指标，配置可能已变更，请重新核对")
            current_user = _current_user_scope(cur)
            if not current_user:
                return fail("用户不存在", 404)

            cur.execute(f"SHOW COLUMNS FROM {record_table}")
            existing_columns = {row["Field"] for row in cur.fetchall()}
            patient_columns = _patient_columns(cur)
            existing_record = None
            if record_id:
                cur.execute(f"SELECT * FROM {record_table} WHERE id=%s FOR UPDATE", (record_id,))
                existing_record = cur.fetchone()
                if not existing_record:
                    return fail("检验记录不存在", 404)
                patient_id = existing_record["patient_id"]
                lab_test_name = lab_test_name or existing_record.get("lab_test_name")

            # Only keep fields that are configured for the disease and already exist
            # in lab_records to avoid runtime SQL errors from stale field settings.
            skipped_fields = sorted(
                [key for key in values.keys() if key in allowed_fields and key not in existing_columns]
            )

            record_values = {
                key: _normalize_lab_field_value(value, field_types.get(key))
                for key, value in values.items()
                if key in allowed_fields and key in existing_columns and key not in HIDDEN_LAB_FIELD_NAMES
            }
            if not any(has_result(value) for value in record_values.values()):
                return fail("请至少填写一个有效检验指标，空记录不能保存")
            cur.execute("SELECT id FROM diseases WHERE id=%s", (disease_id,))
            if not cur.fetchone():
                return fail("疾病不存在")

            if patient_id:
                patient_id = int(patient_id)
                if not _patient_is_accessible(cur, patient_id, current_user, patient_columns):
                    return fail("病人不存在", 404)
                if timepoint == "0h" and _patient_is_complete(cur, patient_id, patient_columns):
                    return fail("完整记录已提交，不能修改")
                updates = []
                params = []
                if timepoint == "0h":
                    if patient.get("name"):
                        updates.append("name=%s")
                        params.append(patient.get("name"))
                    if patient.get("gender"):
                        updates.append("gender=%s")
                        params.append(patient.get("gender"))
                    if patient.get("age") not in (None, ""):
                        updates.append("age=%s")
                        params.append(patient.get("age"))
                    if patient.get("phone") is not None:
                        updates.append("phone=%s")
                        params.append(patient.get("phone"))
                    if patient.get("id_number"):
                        updates.append("id_number=%s")
                        params.append(patient.get("id_number"))
                    if "last_disease_id" in patient_columns:
                        updates.append("last_disease_id=%s")
                        params.append(disease_id)
                    if "case_status" in patient_columns:
                        updates.append("case_status='draft'")
                    updates.append("updated_at=NOW()")
                    params.append(patient_id)
                    identity_updates = {
                        key: patient[key]
                        for key in ("name", "gender", "age")
                        if patient.get(key) not in (None, "")
                    }
                    if _patient_identity_conflicts(cur, patient_id, identity_updates):
                        return fail("这个病人在系统里面已经存在了，不能重复添加病例", 409)
                    try:
                        cur.execute(f"UPDATE patients SET {','.join(updates)} WHERE id=%s", params)
                    except IntegrityError as e:
                        if e.args and e.args[0] == 1062:
                            return fail("这个病人在系统里面已经存在了，不能重复添加病例", 409)
                        raise
            else:
                existing_patient_id = _find_existing_patient_for_lab(cur, current_user, patient, patient_columns)
                if existing_patient_id:
                    patient_id = existing_patient_id
                else:
                    patient_insert = {
                        "name": patient.get("name"),
                        "gender": patient.get("gender"),
                        "age": patient.get("age"),
                        "phone": patient.get("phone"),
                        "id_number": patient.get("id_number"),
                    }
                    if "hospital_id" in patient_columns:
                        patient_insert["hospital_id"] = current_user["hospital_id"]
                    if "user_id" in patient_columns:
                        patient_insert["user_id"] = current_user["id"]
                    if "case_status" in patient_columns:
                        patient_insert["case_status"] = "draft"
                    if "last_disease_id" in patient_columns:
                        patient_insert["last_disease_id"] = disease_id
                    patient_cols = list(patient_insert.keys())
                    patient_placeholders = ",".join(["%s"] * len(patient_cols))
                    try:
                        cur.execute(
                            f"INSERT INTO patients ({','.join(patient_cols)}) VALUES ({patient_placeholders})",
                            list(patient_insert.values()),
                        )
                    except IntegrityError as e:
                        if e.args and e.args[0] == 1062:
                            existing_patient_id = _find_existing_patient_for_lab(cur, current_user, patient, patient_columns)
                            if existing_patient_id:
                                patient_id = existing_patient_id
                            else:
                                return fail("这个病人在系统里面已经存在了，不能重复添加病例", 409)
                        else:
                            raise
                    if not patient_id:
                        patient_id = cur.lastrowid

            duplicate_record_id = None if record_id else _find_duplicate_lab_record(
                cur,
                patient_id,
                existing_columns,
                record_category,
                lab_test_name,
                data.get("photo_path"),
                record_values,
                record_table,
            )
            if duplicate_record_id:
                return ok({"record_id": duplicate_record_id, "patient_id": patient_id, "timepoint": timepoint, "duplicate": True}, "本次检验指标已存在，未重复保存")

            columns = ["patient_id", "user_id", "disease_id", "photo_path", "ai_raw"]
            params = [patient_id, session["user_id"], disease_id, data.get("photo_path"), data.get("ai_raw")]
            if "record_category" in existing_columns:
                columns.append("record_category")
                params.append(record_category)
            if "lab_test_name" in existing_columns:
                columns.append("lab_test_name")
                params.append(lab_test_name)
            columns.extend(list(record_values.keys()))
            params.extend(list(record_values.values()))
            placeholders = ",".join(["%s"] * len(columns))
            # PyMySQL uses Python '%' formatting internally; escape '%' in identifiers
            # to avoid '%`' formatting errors for legacy field names like 'xxx%'.
            safe_columns = ",".join([f"`{str(col).replace('`', '``').replace('%', '%%')}`" for col in columns])
            if record_id:
                update_values = dict(record_values, record_category=record_category,
                                     lab_test_name=lab_test_name, disease_id=disease_id)
                assignments = ','.join('`' + key.replace('`', '``').replace('%', '%%') + '`=%s' for key in update_values)
                cur.execute(f"UPDATE {record_table} SET {assignments} WHERE id=%s", list(update_values.values()) + [record_id])
                cur.execute(f"DELETE FROM {category_table} WHERE record_id=%s", (record_id,))
            else:
                cur.execute(f"INSERT INTO {record_table} ({safe_columns}) VALUES ({placeholders})", params)
                record_id = cur.lastrowid
            for key in record_category_keys:
                cur.execute(f"INSERT INTO {category_table}(record_id,category_id) VALUES (%s,%s)", (record_id, active[key]["id"]))
            completed_now = _mark_case_complete_if_ready(cur, patient_id, patient_columns) if timepoint == "0h" else False
            progress = patient_lab_progress(cur, patient_id, timepoint=timepoint)
        conn.commit()
        message = "保存成功，已自动转为完整记录" if completed_now else "保存成功"
        if skipped_fields:
            return ok(
                {"record_id": record_id, "patient_id": patient_id, "timepoint": timepoint, "skipped_fields": skipped_fields, "completed_now": completed_now},
                message + "，部分字段未入库",
            )
        return ok({"record_id": record_id, "patient_id": patient_id, "timepoint": timepoint, "completed_now": completed_now, "lab_progress": progress}, message)
    finally:
        conn.close()


@records_bp.get("/api/records/<int:record_id>")
@require_user
def record_detail(record_id):
    timepoint = request.args.get("timepoint", "0h")
    if timepoint not in ("0h", "72h"):
        return fail("检验时间点无效")
    record_table = "lab_records" if timepoint == "0h" else "lab_records_72h"
    category_table = "lab_record_categories" if timepoint == "0h" else "lab_record_categories_72h"
    conn = db()
    try:
        with conn.cursor() as cur:
            current_user = _current_user_scope(cur)
            if not current_user:
                return fail("用户不存在", 404)

            patient_columns = _patient_columns(cur)
            if "hospital_id" in patient_columns:
                cur.execute(
                    f"""
                    SELECT r.*, p.name AS patient_name, p.gender, p.age, p.phone, p.id_number,
                           p.plasma_number AS plasma_number_0h, p.plasma_number_72h,
                            d.name AS disease_name, u.name AS operator_name
                    FROM {record_table} r
                    JOIN patients p ON p.id=r.patient_id
                    LEFT JOIN diseases d ON d.id=r.disease_id
                    LEFT JOIN users u ON u.id=r.user_id
                    WHERE r.id=%s AND (p.hospital_id=%s OR u.hospital_id=%s)
                    LIMIT 1
                    """,
                    (record_id, current_user["hospital_id"], current_user["hospital_id"]),
                )
            else:
                cur.execute(
                    f"""
                    SELECT r.*, p.name AS patient_name, p.gender, p.age, p.phone, p.id_number,
                           p.plasma_number AS plasma_number_0h, p.plasma_number_72h,
                            d.name AS disease_name, u.name AS operator_name
                    FROM {record_table} r
                    JOIN patients p ON p.id=r.patient_id
                    JOIN users u ON u.id=r.user_id
                    LEFT JOIN diseases d ON d.id=r.disease_id
                    WHERE r.id=%s AND u.hospital_id=%s
                    LIMIT 1
                    """,
                    (record_id, current_user["hospital_id"]),
                )
            record = cur.fetchone()
            if not record:
                return fail("检验记录不存在", 404)
            cur.execute(f"""SELECT c.category_key FROM {category_table} rc
                           JOIN lab_categories c ON c.id=rc.category_id WHERE rc.record_id=%s ORDER BY c.sort_order,c.id""", (record_id,))
            record["record_category"] = ','.join(row["category_key"] for row in cur.fetchall()) or record.get("record_category")
            editable = timepoint == "72h" or not _patient_is_complete(cur, record["patient_id"], patient_columns)

            cur.execute(f"SHOW COLUMNS FROM {record_table}")
            record_columns = {row["Field"] for row in cur.fetchall()}
            cur.execute(
                """
                SELECT field_name, form_label, unit, reference_range, test_method
                FROM field_settings
                WHERE enabled=1
                ORDER BY id
                """
            )
            system_fields = {"id", "patient_id", "user_id", "disease_id", "record_category", "lab_test_name", "photo_path", "ai_raw", "created_at"}
            items = []
            for field in cur.fetchall():
                field_name = field["field_name"]
                if field_name not in record_columns or field_name in system_fields or field_name in HIDDEN_LAB_FIELD_NAMES:
                    continue
                value = record.get(field_name)
                if value is None or str(value).strip() == "":
                    continue
                items.append({
                    "field_name": field_name,
                    "form_label": field["form_label"],
                    "value": value,
                    "unit": field.get("unit"),
                    "reference_range": field.get("reference_range"),
                    "test_method": field.get("test_method"),
                })

            return ok({"record": record, "items": items, "editable": editable, "timepoint": timepoint})
    finally:
        conn.close()
