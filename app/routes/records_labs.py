# Lab record save and lab record detail routes.
# Routes in this file register on the shared records_bp blueprint.
import json
import os
import time
import zipfile
from io import BytesIO

from flask import current_app, request, send_file, session
from werkzeug.utils import secure_filename

from app.common import fail, ok, required
from app.db import db
from app.decorators import require_user
from app.routes.record_blueprint import records_bp
from app.routes.record_helpers import *  # noqa: F403 - shared route helpers
from app.services.core import AIRecognitionError, get_fields_for_disease, parse_ai_result, parse_lab_test_name, parse_patient_info, recognize_image, reorder_fields_by_values


@records_bp.post("/api/records")
@require_user
def save_record():
    data = request.get_json(silent=True) or {}
    patient_id = data.get("patient_id")
    raw_patient = data.get("patient") or {}
    patient = {
        "name": (raw_patient.get("name") or "").strip(),
        "gender": (raw_patient.get("gender") or "").strip(),
        "age": raw_patient.get("age"),
        "phone": (raw_patient.get("phone") or "").strip(),
        "id_number": (raw_patient.get("id_number") or "").strip(),
    }
    values = data.get("values") or {}
    disease_id = data.get("disease_id")
    record_category = (data.get("record_category") or "").strip() or None
    lab_test_name = (data.get("lab_test_name") or "").strip() or None
    if not disease_id:
        return fail("请先选择疾病")
    if not patient_id and required(patient, ["name"]):
        return fail("请填写病患姓名")

    allowed_fields = {field["field_name"] for field in get_fields_for_disease(int(disease_id))}

    conn = db()
    try:
        with conn.cursor() as cur:
            current_user = _current_user_scope(cur)
            if not current_user:
                return fail("用户不存在", 404)

            cur.execute("SHOW COLUMNS FROM lab_records")
            existing_columns = {row["Field"] for row in cur.fetchall()}
            patient_columns = _patient_columns(cur)

            # Only keep fields that are configured for the disease and already exist
            # in lab_records to avoid runtime SQL errors from stale field settings.
            skipped_fields = sorted(
                [key for key in values.keys() if key in allowed_fields and key not in existing_columns]
            )

            record_values = {
                key: value
                for key, value in values.items()
                if key in allowed_fields and key in existing_columns
            }

            if patient_id:
                patient_id = int(patient_id)
                if not _patient_is_accessible(cur, patient_id, current_user, patient_columns):
                    return fail("病人不存在", 404)
                if _patient_is_complete(cur, patient_id, patient_columns):
                    return fail("完整记录已提交，不能修改")
                updates = []
                params = []
                if patient.get("name"):
                    updates.append("name=%s")
                    params.append(patient.get("name"))
                if patient.get("gender"):
                    updates.append("gender=%s")
                    params.append(patient.get("gender"))
                if patient.get("age") not in (None, ""):
                    updates.append("age=%s")
                    params.append(patient.get("age") or None)
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
                cur.execute(f"UPDATE patients SET {','.join(updates)} WHERE id=%s", params)
            else:
                existing_patient_id = _find_existing_patient_for_lab(cur, current_user, patient, patient_columns)
                if existing_patient_id:
                    patient_id = existing_patient_id
                else:
                    patient_insert = {
                        "name": patient.get("name"),
                        "gender": patient.get("gender"),
                        "age": patient.get("age") or None,
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
                    cur.execute(
                        f"INSERT INTO patients ({','.join(patient_cols)}) VALUES ({patient_placeholders})",
                        list(patient_insert.values()),
                    )
                    patient_id = cur.lastrowid

            duplicate_record_id = _find_duplicate_lab_record(
                cur,
                patient_id,
                existing_columns,
                record_category,
                lab_test_name,
                data.get("photo_path"),
                record_values,
            )
            if duplicate_record_id:
                return ok({"record_id": duplicate_record_id, "patient_id": patient_id, "duplicate": True}, "本次检验指标已存在，未重复保存")

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
            cur.execute(f"INSERT INTO lab_records ({safe_columns}) VALUES ({placeholders})", params)
            record_id = cur.lastrowid
            completed_now = _mark_case_complete_if_ready(cur, patient_id, patient_columns)
        conn.commit()
        message = "保存成功，已自动转为完整记录" if completed_now else "保存成功"
        if skipped_fields:
            return ok(
                {"record_id": record_id, "patient_id": patient_id, "skipped_fields": skipped_fields, "completed_now": completed_now},
                message + "，部分字段未入库",
            )
        return ok({"record_id": record_id, "patient_id": patient_id, "completed_now": completed_now}, message)
    finally:
        conn.close()


@records_bp.get("/api/records/<int:record_id>")
@require_user
def record_detail(record_id):
    conn = db()
    try:
        with conn.cursor() as cur:
            current_user = _current_user_scope(cur)
            if not current_user:
                return fail("用户不存在", 404)

            patient_columns = _patient_columns(cur)
            if "hospital_id" in patient_columns:
                cur.execute(
                    """
                    SELECT r.*, p.name AS patient_name, p.gender, p.age, p.phone, p.id_number,
                           d.name AS disease_name, u.name AS operator_name
                    FROM lab_records r
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
                    """
                    SELECT r.*, p.name AS patient_name, p.gender, p.age, p.phone, p.id_number,
                           d.name AS disease_name, u.name AS operator_name
                    FROM lab_records r
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

            cur.execute("SHOW COLUMNS FROM lab_records")
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
                if field_name not in record_columns or field_name in system_fields:
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

            return ok({"record": record, "items": items})
    finally:
        conn.close()


