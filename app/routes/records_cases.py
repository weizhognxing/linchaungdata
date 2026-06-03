# Case export, case list, patient create/detail/update routes.
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


@records_bp.get("/api/cases/export")
@require_user
def export_cases():
    conn = db()
    try:
        with conn.cursor() as cur:
            current_user = _current_user_scope(cur)
            if not current_user:
                return fail("用户不存在", 404)

            multiplier = 1
            if _table_exists(cur, "system_settings"):
                cur.execute("SELECT doctor_download_multiplier FROM system_settings LIMIT 1")
                settings = cur.fetchone() or {}
                try:
                    multiplier = max(int(settings.get("doctor_download_multiplier", 1)), 0)
                except (TypeError, ValueError):
                    multiplier = 1

            patient_columns = _patient_columns(cur)
            own_conditions = ["r.user_id=%s"]
            own_params = [current_user["id"]]
            if "user_id" in patient_columns:
                own_conditions.append("p.user_id=%s")
                own_params.append(current_user["id"])

            cur.execute(
                f"""
                SELECT DISTINCT p.id
                FROM patients p
                LEFT JOIN lab_records r ON r.patient_id=p.id
                WHERE {' OR '.join(own_conditions)}
                """,
                own_params,
            )
            own_patient_ids = [row["id"] for row in cur.fetchall()]
            other_limit = len(own_patient_ids) * multiplier

            other_patient_ids = []
            if other_limit > 0:
                exclude_placeholders = ",".join(["%s"] * len(own_patient_ids))
                exclude_sql = f"AND p.id NOT IN ({exclude_placeholders})" if own_patient_ids else ""
                other_conditions = ["r.user_id IS NOT NULL AND r.user_id<>%s"]
                other_params = [current_user["id"]]
                if "user_id" in patient_columns:
                    other_conditions.append("p.user_id IS NOT NULL AND p.user_id<>%s")
                    other_params.append(current_user["id"])
                cur.execute(
                    f"""
                    SELECT DISTINCT p.id
                    FROM patients p
                    LEFT JOIN lab_records r ON r.patient_id=p.id
                    WHERE ({' OR '.join(other_conditions)}) {exclude_sql}
                    ORDER BY RAND()
                    LIMIT {int(other_limit)}
                    """,
                    other_params + own_patient_ids,
                )
                other_patient_ids = [row["id"] for row in cur.fetchall()]

            patient_ids = own_patient_ids + other_patient_ids
            export_tables = [
                ("01_病患信息.xlsx", "病患信息", "patients", "id"),
                ("02_诊断记录.xlsx", "诊断记录", "diagnosis_records", "patient_id"),
                ("03_检验记录.xlsx", "检验记录", "lab_records", "patient_id"),
                ("04_评估记录.xlsx", "评估记录", "assessments", "patient_id"),
                ("05_治疗记录.xlsx", "治疗记录", "treatments", "patient_id"),
                ("06_随访记录.xlsx", "随访记录", "followups", "patient_id"),
            ]

            output = BytesIO()
            with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
                for filename, sheet_title, table_name, patient_column in export_tables:
                    rows, headers = _fetch_rows_for_patients(cur, table_name, patient_ids, patient_column)
                    archive.writestr(filename, _build_single_sheet_workbook(sheet_title, rows, headers))
            output.seek(0)
            filename = f"case_export_{int(time.time())}.zip"
            return send_file(
                output,
                as_attachment=True,
                download_name=filename,
                mimetype="application/zip",
            )
    finally:
        conn.close()


@records_bp.get("/api/cases")
@require_user
def cases():
    conn = db()
    try:
        with conn.cursor() as cur:
            current_user = _current_user_scope(cur)
            if not current_user:
                return fail("用户不存在", 404)

            patient_columns = _patient_columns(cur)
            status_expr = "IFNULL(p.case_status, 'draft')" if "case_status" in patient_columns else "'draft'"
            integrity_expr = "IFNULL(p.case_integrity, IFNULL(p.case_status, 'draft'))" if "case_integrity" in patient_columns and "case_status" in patient_columns else ("IFNULL(p.case_integrity, 'draft')" if "case_integrity" in patient_columns else status_expr)
            disease_join = "LEFT JOIN diseases d ON d.id=p.last_disease_id" if "last_disease_id" in patient_columns else ""
            disease_select = ", d.name AS disease_name" if "last_disease_id" in patient_columns else ", NULL AS disease_name"

            if "hospital_id" in patient_columns:
                cur.execute(
                    """
                    SELECT p.id, p.name, p.gender, p.age, p.phone, p.id_number,
                           COUNT(r.id) AS record_count,
                           MAX(r.created_at) AS latest_record_at,
                           {status_expr} AS case_status,
                           {integrity_expr} AS case_integrity
                           {disease_select}
                    FROM patients p
                    LEFT JOIN lab_records r ON r.patient_id=p.id
                    LEFT JOIN users u ON u.id=r.user_id
                    {disease_join}
                    WHERE p.hospital_id=%s OR u.hospital_id=%s
                    GROUP BY p.id, p.name, p.gender, p.age, p.phone, p.id_number, p.created_at, case_status, case_integrity, disease_name
                    ORDER BY IFNULL(MAX(r.created_at), p.created_at) DESC, p.id DESC
                    """.format(status_expr=status_expr, integrity_expr=integrity_expr, disease_select=disease_select, disease_join=disease_join),
                    (current_user["hospital_id"], current_user["hospital_id"]),
                )
            else:
                cur.execute(
                    """
                    SELECT p.id, p.name, p.gender, p.age, p.phone, p.id_number,
                           COUNT(r.id) AS record_count,
                           MAX(r.created_at) AS latest_record_at,
                           {status_expr} AS case_status,
                           {integrity_expr} AS case_integrity
                           {disease_select}
                    FROM patients p
                    JOIN lab_records r ON r.patient_id=p.id
                    JOIN users u ON u.id=r.user_id
                    {disease_join}
                    WHERE u.hospital_id=%s
                    GROUP BY p.id, p.name, p.gender, p.age, p.phone, p.id_number, case_status, case_integrity, disease_name
                    ORDER BY latest_record_at DESC, p.id DESC
                    """.format(status_expr=status_expr, integrity_expr=integrity_expr, disease_select=disease_select, disease_join=disease_join),
                    (current_user["hospital_id"],),
                )
            rows = cur.fetchall()
            return ok({
                "draft": [row for row in rows if row.get("case_integrity") not in {"complete", "submitted"}],
                "complete": [row for row in rows if row.get("case_integrity") in {"complete", "submitted"}],
            })
    finally:
        conn.close()


@records_bp.post("/api/patients")
@require_user
def create_patient():
    data = request.get_json(silent=True) or request.form.to_dict()
    patient = {
        "name": (data.get("name") or "").strip(),
        "gender": (data.get("gender") or "").strip(),
        "age": data.get("age") or None,
        "phone": (data.get("phone") or "").strip(),
        "id_number": (data.get("id_number") or "").strip(),
    }
    if required(patient, ["name", "gender", "age"]):
        return fail("请填写姓名、性别、年龄")

    conn = db()
    try:
        with conn.cursor() as cur:
            current_user = _current_user_scope(cur)
            if not current_user:
                return fail("用户不存在", 404)

            patient_columns = _patient_columns(cur)
            if "hospital_id" not in patient_columns:
                return fail("请先执行 ensure_patient_case_owner_columns.sql 后再新增病例")
            if "hospital_id" in patient_columns:
                cur.execute(
                    """
                    SELECT id FROM patients
                    WHERE hospital_id=%s AND name=%s AND IFNULL(gender,'')=%s AND IFNULL(age,'')=%s
                    LIMIT 1
                    """,
                    (current_user["hospital_id"], patient["name"], patient["gender"], str(patient["age"] or "")),
                )
            else:
                cur.execute(
                    """
                    SELECT id FROM patients
                    WHERE name=%s AND IFNULL(gender,'')=%s AND IFNULL(age,'')=%s
                    LIMIT 1
                    """,
                    (patient["name"], patient["gender"], str(patient["age"] or "")),
                )
            existing = cur.fetchone()
            last_disease_id = data.get("last_disease_id") or None
            case_status = (data.get("case_status") or "draft").strip() or "draft"
            case_integrity = (data.get("case_integrity") or "draft").strip() or "draft"
            if existing:
                return fail("这个病人在系统里面已经存在了，不能重复添加病例", 409)

            patient_insert = dict(patient)
            if "hospital_id" in patient_columns:
                patient_insert["hospital_id"] = current_user["hospital_id"]
            if "user_id" in patient_columns:
                patient_insert["user_id"] = current_user["id"]
            if "case_status" in patient_columns:
                patient_insert["case_status"] = case_status
            if "case_integrity" in patient_columns:
                patient_insert["case_integrity"] = case_integrity
            if "last_disease_id" in patient_columns and last_disease_id:
                patient_insert["last_disease_id"] = last_disease_id

            columns = list(patient_insert.keys())
            placeholders = ",".join(["%s"] * len(columns))
            cur.execute(
                f"INSERT INTO patients ({','.join(columns)}) VALUES ({placeholders})",
                list(patient_insert.values()),
            )
            patient_id = cur.lastrowid
        conn.commit()
        return ok({"patient_id": patient_id}, "病例已新增")
    finally:
        conn.close()


@records_bp.get("/api/patients/<int:patient_id>")
@require_user
def patient_detail(patient_id):
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
                    SELECT p.*
                    FROM patients p
                    LEFT JOIN lab_records r ON r.patient_id=p.id
                    LEFT JOIN users u ON u.id=r.user_id
                    WHERE p.id=%s AND (p.hospital_id=%s OR u.hospital_id=%s)
                    LIMIT 1
                    """,
                    (patient_id, current_user["hospital_id"], current_user["hospital_id"]),
                )
            else:
                cur.execute(
                    """
                    SELECT p.*
                    FROM patients p
                    JOIN lab_records r ON r.patient_id=p.id
                    JOIN users u ON u.id=r.user_id
                    WHERE p.id=%s AND u.hospital_id=%s
                    LIMIT 1
                    """,
                    (patient_id, current_user["hospital_id"]),
                )
            patient = cur.fetchone()
            if not patient:
                return fail("病人不存在", 404)

            cur.execute(
                """
                SELECT r.id, r.created_at, r.record_category, r.lab_test_name, d.name AS disease_name, u.name AS operator_name
                FROM lab_records r
                LEFT JOIN diseases d ON d.id=r.disease_id
                LEFT JOIN users u ON u.id=r.user_id
                WHERE r.patient_id=%s
                ORDER BY r.created_at DESC, r.id DESC
                """,
                (patient_id,),
            )
            lab_records = cur.fetchall()

            cur.execute("SHOW COLUMNS FROM treatments")
            treatment_columns = {row["Field"] for row in cur.fetchall()}
            if "diagnosis_record_id" in treatment_columns and _table_exists(cur, "diagnosis_records"):
                cur.execute(
                    """
                    SELECT t.*, dr.diagnosis_disease, dr.preliminary_diagnosis
                    FROM treatments t
                    LEFT JOIN diagnosis_records dr ON dr.id=t.diagnosis_record_id
                    WHERE t.patient_id=%s
                    ORDER BY t.treat_time DESC, t.id DESC
                    """,
                    (patient_id,),
                )
            else:
                cur.execute(
                    """
                    SELECT *
                    FROM treatments
                    WHERE patient_id=%s
                    ORDER BY treat_time DESC, id DESC
                    """,
                    (patient_id,),
                )
            treatments = cur.fetchall()

            cur.execute(
                """
                SELECT f.*, dr.diagnosis_disease, dr.preliminary_diagnosis
                FROM followups f
                LEFT JOIN diagnosis_records dr ON dr.id=f.diagnosis_record_id
                WHERE f.patient_id=%s
                ORDER BY f.follow_time DESC, f.id DESC
                """,
                (patient_id,),
            )
            followups = cur.fetchall()

            assessments = []
            if _table_exists(cur, "assessments"):
                cur.execute(
                    """
                    SELECT a.*, dr.diagnosis_disease, dr.preliminary_diagnosis
                    FROM assessments a
                    LEFT JOIN diagnosis_records dr ON dr.id=a.diagnosis_record_id
                    WHERE a.patient_id=%s
                    ORDER BY a.assessment_time DESC, a.id DESC
                    """,
                    (patient_id,),
                )
                assessments = cur.fetchall()

            diagnosis_records = []
            if _table_exists(cur, "diagnosis_records"):
                cur.execute(
                    """
                    SELECT dr.id, dr.diagnosis_time, dr.diagnosis_disease,
                           dr.preliminary_diagnosis, dr.medical_history, u.name AS operator_name
                    FROM diagnosis_records dr
                    LEFT JOIN users u ON u.id=dr.user_id
                    WHERE dr.patient_id=%s
                    ORDER BY dr.diagnosis_time DESC, dr.id DESC
                    """,
                    (patient_id,),
                )
                diagnosis_records = cur.fetchall()

            base_fields = {
                "id", "hospital_id", "user_id", "name", "gender", "age", "phone", "id_number",
                "diagnosis", "diagnosis_disease", "medical_history", "preliminary_diagnosis",
                "case_integrity", "created_at", "updated_at",
            }
            cur.execute("SELECT field_name, form_label FROM patient_field_settings WHERE enabled=1 ORDER BY created_at DESC")
            patient_meta = []
            for field in cur.fetchall():
                field_name = field["field_name"]
                if field_name in patient_columns and field_name not in base_fields:
                    patient_meta.append({
                        "field_name": field_name,
                        "form_label": field["form_label"],
                        "value": patient.get(field_name),
                    })

            return ok({
                "patient": patient,
                "lab_records": lab_records,
                "treatments": treatments,
                "followups": followups,
                "assessments": assessments,
                "diagnosis_records": diagnosis_records,
                "patient_fields": patient_meta,
                "lab_categories": [
                    {"key": key, "label": value["label"]}
                    for key, value in LAB_CATEGORY_DEFINITIONS.items()
                ],
            })
    finally:
        conn.close()


@records_bp.post("/api/patients/<int:patient_id>")
@require_user
def update_patient(patient_id):
    data = request.get_json(silent=True) or request.form.to_dict()
    is_diagnosis_update = any(
        field in data for field in {"diagnosis_disease", "medical_history", "preliminary_diagnosis"}
    )
    if not is_diagnosis_update:
        required_fields = ["name", "gender", "age"]
        if required(data, required_fields):
            return fail("请填写姓名、性别、年龄")

    conn = db()
    try:
        with conn.cursor() as cur:
            current_user = _current_user_scope(cur)
            if not current_user:
                return fail("用户不存在", 404)

            patient_columns = _patient_columns(cur)
            if not _patient_is_accessible(cur, patient_id, current_user, patient_columns):
                return fail("病人不存在", 404)
            if _patient_is_complete(cur, patient_id, patient_columns):
                return fail("完整记录已提交，不能修改")

            allowed_fields = {"name", "gender", "age", "phone", "id_number"}
            cur.execute("SELECT field_name FROM patient_field_settings WHERE enabled=1")
            allowed_fields.update(
                row["field_name"] for row in cur.fetchall() if row["field_name"] in patient_columns
            )
            allowed_fields = [field for field in allowed_fields if field in patient_columns]

            if "diagnosis_disease" in data:
                diagnosis_disease = (data.get("diagnosis_disease") or "").strip()
                if is_diagnosis_update and not diagnosis_disease:
                    return fail("请选择本次诊断疾病")
                if diagnosis_disease and diagnosis_disease not in DIAGNOSIS_DISEASE_OPTIONS:
                    return fail("疾病选项不合法")
                data["diagnosis_disease"] = diagnosis_disease
            if "medical_history" in data:
                data["medical_history"] = _normalize_medical_history(data.get("medical_history"))
            if "preliminary_diagnosis" in data:
                data["preliminary_diagnosis"] = _normalize_preliminary_diagnosis(
                    data.get("diagnosis_disease", ""),
                    data.get("preliminary_diagnosis"),
                )

            updates = []
            params = []
            for field in allowed_fields:
                if field not in data:
                    continue
                value = data.get(field)
                if field == "age":
                    value = value or None
                updates.append(f"`{field.replace('`', '``')}`=%s")
                params.append(value)

            if not updates:
                return fail("没有可保存的基础信息")
            if "updated_at" in patient_columns:
                updates.append("updated_at=NOW()")
            params.append(patient_id)
            cur.execute(f"UPDATE patients SET {','.join(updates)} WHERE id=%s", params)

            diagnosis_disease = (data.get("diagnosis_disease") or "").strip()
            if is_diagnosis_update and diagnosis_disease and _table_exists(cur, "diagnosis_records"):
                cur.execute(
                    """
                    INSERT INTO diagnosis_records
                      (patient_id, user_id, diagnosis_time, diagnosis_disease, preliminary_diagnosis, medical_history)
                    VALUES (%s,%s,NOW(),%s,%s,%s)
                    """,
                    (
                        patient_id,
                        current_user["id"],
                        diagnosis_disease,
                        data.get("preliminary_diagnosis") or None,
                        data.get("medical_history") or "无",
                    ),
                )
            completed_now = _mark_case_complete_if_ready(cur, patient_id, patient_columns)
        conn.commit()
        message = "诊断信息已保存" if is_diagnosis_update else "基础信息已保存"
        if completed_now:
            message += "，已自动转为完整记录"
        return ok({"patient_id": patient_id, "completed_now": completed_now}, message)
    finally:
        conn.close()


