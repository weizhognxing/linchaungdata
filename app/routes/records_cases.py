# Case export, case list, patient create/detail/update routes.
# Routes in this file register on the shared records_bp blueprint.
import json
import os
import time
from io import BytesIO

from flask import current_app, request, send_file, session
from pymysql.err import IntegrityError
from werkzeug.utils import secure_filename

from app.common import fail, ok, required
from app.db import db
from app.decorators import require_user
from app.routes.record_blueprint import records_bp
from app.routes.record_helpers import *  # noqa: F403 - shared route helpers
from app.services.core import AIRecognitionError, get_fields_for_disease, parse_ai_result, parse_lab_test_name, parse_patient_info, recognize_image, reorder_fields_by_values
from app.services.lab_catalog import catalog, patient_lab_progress
from app.services.export_privacy import anonymize_export_rows, export_identity_map
from app.services.export_filter import filter_export_rows
from app.services.export_wide import build_wide_export

# Data from this hospital is offered to the "other patients" sample first.
PRIORITY_HOSPITAL_NAME = "西南医科大学附属医院"


def _priority_hospital_id(cur, patient_columns):
    if "hospital_id" not in patient_columns:
        return None
    cur.execute("SELECT id FROM hospitals WHERE name=%s", (PRIORITY_HOSPITAL_NAME,))
    row = cur.fetchone()
    return row["id"] if row else None


def _select_other_patient_ids(cur, current_user, patient_columns, complete_sql, disease_sql,
                              disease_params, own_patient_ids, other_limit):
    """Pick other users' complete patients, preferring the priority hospital first."""
    if other_limit <= 0:
        return []
    other_conditions = ["r.user_id IS NOT NULL AND r.user_id<>%s"]
    other_params = [current_user["id"]]
    if "user_id" in patient_columns:
        other_conditions.append("p.user_id IS NOT NULL AND p.user_id<>%s")
        other_params.append(current_user["id"])

    def select(exclude_ids, limit, priority_sql="", priority_params=None):
        placeholders = ",".join(["%s"] * len(exclude_ids))
        exclude_sql = f"AND p.id NOT IN ({placeholders})" if exclude_ids else ""
        join_users = " LEFT JOIN users u ON u.id=r.user_id" if priority_sql else ""
        cur.execute(
            f"""
            SELECT DISTINCT p.id
            FROM patients p
            LEFT JOIN lab_records r ON r.patient_id=p.id{join_users}
            WHERE ({' OR '.join(other_conditions)}) AND {complete_sql}{disease_sql}{priority_sql} {exclude_sql}
            ORDER BY RAND()
            LIMIT {int(limit)}
            """,
            other_params + disease_params + (priority_params or []) + exclude_ids,
        )
        return [row["id"] for row in cur.fetchall()]

    priority_ids = []
    priority_hospital_id = _priority_hospital_id(cur, patient_columns)
    if priority_hospital_id:
        priority_ids = select(own_patient_ids, other_limit,
                              " AND (p.hospital_id=%s OR u.hospital_id=%s)",
                              [priority_hospital_id, priority_hospital_id])
    remaining = other_limit - len(priority_ids)
    if remaining <= 0:
        return priority_ids
    return priority_ids + select(own_patient_ids + priority_ids, remaining)


def _delete_patient_related_records(cur, patient_id):
    cur.execute("DELETE rc FROM lab_record_categories rc JOIN lab_records r ON r.id=rc.record_id WHERE r.patient_id=%s", (patient_id,))
    cur.execute("DELETE rc FROM lab_record_categories_72h rc JOIN lab_records_72h r ON r.id=rc.record_id WHERE r.patient_id=%s", (patient_id,))
    cur.execute("DELETE FROM lab_completion_snapshots WHERE patient_id=%s", (patient_id,))
    related_tables = ["lab_records", "lab_records_72h", "assessments", "treatments", "followups", "diagnosis_records"]
    for table_name in related_tables:
        if _table_exists(cur, table_name):
            cur.execute(f"DELETE FROM `{table_name}` WHERE patient_id=%s", (patient_id,))
    cur.execute("DELETE FROM patients WHERE id=%s", (patient_id,))


@records_bp.get("/api/cases/export")
@require_user
def export_cases():
    raw_disease_id = request.args.get("disease_id", "")
    try:
        disease_id = int(raw_disease_id) if raw_disease_id else None
    except ValueError:
        return fail("请选择有效的疾病", 400)
    if disease_id is not None and disease_id <= 0:
        return fail("请选择有效的疾病", 400)
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
            disease_name = None
            disease_sql = ""
            disease_params = []
            if disease_id is not None:
                cur.execute("SELECT name FROM diseases WHERE id=%s", (disease_id,))
                disease = cur.fetchone()
                if not disease:
                    return fail("疾病不存在", 400)
                disease_name = disease["name"]
                conditions = []
                if "last_disease_id" in patient_columns:
                    conditions.append("p.last_disease_id=%s")
                    disease_params.append(disease_id)
                if _table_exists(cur, "diagnosis_records"):
                    conditions.append("EXISTS (SELECT 1 FROM diagnosis_records dr WHERE dr.patient_id=p.id AND dr.diagnosis_disease=%s)")
                    disease_params.append(disease_name)
                conditions.append("EXISTS (SELECT 1 FROM lab_records lr WHERE lr.patient_id=p.id AND lr.disease_id=%s)")
                disease_params.append(disease_id)
                if _table_exists(cur, "lab_records_72h"):
                    conditions.append("EXISTS (SELECT 1 FROM lab_records_72h lr72 WHERE lr72.patient_id=p.id AND lr72.disease_id=%s)")
                    disease_params.append(disease_id)
                disease_sql = " AND (" + " OR ".join(conditions) + ")"
            complete_conditions = []
            if "case_integrity" in patient_columns:
                complete_conditions.append("p.case_integrity IN ('complete','submitted')")
            if "case_status" in patient_columns:
                complete_conditions.append("p.case_status IN ('submitted','approved')")
            if not complete_conditions:
                return fail("当前数据库缺少完整记录状态字段，无法导出完整记录", 400)
            complete_sql = "(" + " OR ".join(complete_conditions) + ")"
            own_conditions = ["r.user_id=%s"]
            own_params = [current_user["id"]]
            if "user_id" in patient_columns:
                own_conditions.append("p.user_id=%s")
                own_params.append(current_user["id"])

            # The download quota is based on all of the user's complete cases,
            # not only the cases matching the currently selected disease.
            cur.execute(
                f"""
                SELECT COUNT(DISTINCT p.id) AS total
                FROM patients p
                LEFT JOIN lab_records r ON r.patient_id=p.id
                WHERE ({' OR '.join(own_conditions)}) AND {complete_sql}
                """,
                own_params,
            )
            own_total_complete = int((cur.fetchone() or {}).get("total", 0) or 0)

            cur.execute(
                f"""
                SELECT DISTINCT p.id
                FROM patients p
                LEFT JOIN lab_records r ON r.patient_id=p.id
                WHERE ({' OR '.join(own_conditions)}) AND {complete_sql}{disease_sql}
                """,
                own_params + disease_params,
            )
            own_patient_ids = [row["id"] for row in cur.fetchall()]
            other_limit = own_total_complete * multiplier

            other_patient_ids = _select_other_patient_ids(
                cur, current_user, patient_columns, complete_sql, disease_sql, disease_params,
                own_patient_ids, other_limit,
            )

            patient_ids = own_patient_ids + other_patient_ids
            if not patient_ids:
                return fail("所选疾病暂无完整记录可导出" if disease_id is not None else "暂无完整记录可导出", 404)
            patient_rows, _ = _fetch_rows_for_patients(cur, "patients", patient_ids, "id")
            patient_rows.sort(key=lambda row: row.get("id") or 0)

            diagnosis_rows, _ = _fetch_rows_for_patients(cur, "diagnosis_records", patient_ids)
            diagnosis_rows = filter_export_rows("diagnosis_records", diagnosis_rows, disease_id, disease_name, set())
            diagnosis_ids = {row["id"] for row in diagnosis_rows}
            diagnosis_aliases = {row["id"]: "D-" + str(index) for index, row in enumerate(diagnosis_rows, 1)}

            patient_rows = filter_export_rows("patients", patient_rows, disease_id, disease_name, diagnosis_ids)
            aliases, identities = export_identity_map(patient_rows)

            table_rows = {}
            table_headers = {}
            for table_name in ("lab_records", "lab_records_72h", "assessments", "treatments", "followups"):
                rows, headers = _fetch_rows_for_patients(cur, table_name, patient_ids)
                rows = filter_export_rows(table_name, rows, disease_id, disease_name, diagnosis_ids)
                table_rows[table_name] = anonymize_export_rows(
                    table_name, rows, aliases, identities, diagnosis_aliases
                )
                table_headers[table_name] = headers

            safe_patients = anonymize_export_rows(
                "patients", patient_rows, aliases, identities, diagnosis_aliases
            )
            safe_diagnosis = anonymize_export_rows(
                "diagnosis_records", diagnosis_rows, aliases, identities, diagnosis_aliases
            )

            lab_fields = []
            if _table_exists(cur, "field_settings"):
                cur.execute(
                    "SELECT field_name, form_label, unit, reference_range "
                    "FROM field_settings WHERE enabled=1 ORDER BY id"
                )
                lab_fields = cur.fetchall()

            cur.execute("SELECT id, name FROM diseases")
            disease_names = {row["id"]: row["name"] for row in cur.fetchall()}

            headers, wide_rows, comments = build_wide_export(
                patient_rows=safe_patients,
                diagnosis_rows=safe_diagnosis,
                lab_rows=table_rows["lab_records"],
                lab72_rows=table_rows["lab_records_72h"],
                assessment_rows=table_rows["assessments"],
                treatment_rows=table_rows["treatments"],
                followup_rows=table_rows["followups"],
                lab_fields=lab_fields,
                lab_columns=table_headers["lab_records"],
                lab72_columns=table_headers["lab_records_72h"],
                assessment_columns=table_headers["assessments"],
                treatment_columns=table_headers["treatments"],
                followup_columns=table_headers["followups"],
                disease_names=disease_names,
            )
            output = BytesIO(_build_single_sheet_workbook("病例数据", wide_rows, headers, comments))
            filename = f"case_export_{int(time.time())}.xlsx"
            return send_file(
                output,
                as_attachment=True,
                download_name=filename,
                mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
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
                "draft": [row for row in rows if row.get("case_status") == "draft" and row.get("case_integrity") not in {"complete", "submitted"}],
                "complete": [row for row in rows if row.get("case_status") != "draft" or row.get("case_integrity") in {"complete", "submitted"}],
            })
    finally:
        conn.close()


@records_bp.delete("/api/patients/<int:patient_id>")
@require_user
def delete_patient(patient_id):
    conn = db()
    try:
        with conn.cursor() as cur:
            current_user = _current_user_scope(cur)
            if not current_user:
                return fail("用户不存在", 404)
            patient_columns = _patient_columns(cur)
            if not _patient_is_accessible(cur, patient_id, current_user, patient_columns):
                return fail("病人不存在", 404)
            _delete_patient_related_records(cur, patient_id)
        conn.commit()
        return ok(message="病例已删除")
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
    identity = _normalize_patient_identity(patient)
    patient.update(identity)
    if _patient_identity_missing(patient):
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
            existing_id = _find_existing_patient_identity(cur, patient)
            last_disease_id = data.get("last_disease_id") or None
            case_status = "draft"
            case_integrity = "draft"
            if existing_id:
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
            try:
                cur.execute(
                    f"INSERT INTO patients ({','.join(columns)}) VALUES ({placeholders})",
                    list(patient_insert.values()),
                )
            except IntegrityError as e:
                if e.args and e.args[0] == 1062:
                    return fail("这个病人在系统里面已经存在了，不能重复添加病例", 409)
                raise
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
            cur.execute(
                """SELECT r.id, r.created_at, r.record_category, r.lab_test_name,
                          d.name AS disease_name, u.name AS operator_name
                   FROM lab_records_72h r
                   LEFT JOIN diseases d ON d.id=r.disease_id
                   LEFT JOIN users u ON u.id=r.user_id
                   WHERE r.patient_id=%s ORDER BY r.created_at DESC, r.id DESC""",
                (patient_id,),
            )
            lab_records_72h = cur.fetchall()

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
                    ORDER BY a.created_at DESC, a.id DESC
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
            cur.execute("""SELECT field_name, data_type, form_label FROM patient_field_settings
                           WHERE enabled=1 ORDER BY CASE field_name
                             WHEN 'plasma_number' THEN -2
                             WHEN 'plasma_number_72h' THEN -1
                             ELSE 0 END, created_at DESC""")
            patient_meta = []
            for field in cur.fetchall():
                field_name = field["field_name"]
                if field_name in patient_columns and field_name not in base_fields:
                    value = patient.get(field_name)
                    if str(value or "").startswith("0000-00-00"):
                        value = ""
                    elif field.get("data_type") in {"datetime", "date"}:
                        value = _xlsx_value(value)
                    patient_meta.append({
                        "field_name": field_name,
                        "data_type": field.get("data_type"),
                        "form_label": field["form_label"],
                        "value": value,
                    })

            return ok({
                "patient": patient,
                "lab_records": lab_records,
                "lab_records_72h": lab_records_72h,
                "treatments": treatments,
                "followups": followups,
                "assessments": assessments,
                "diagnosis_records": diagnosis_records,
                "patient_fields": patient_meta,
                "lab_categories": catalog(cur),
                "lab_progress": patient_lab_progress(cur, patient_id),
                "lab_progress_72h": patient_lab_progress(cur, patient_id, timepoint='72h'),
            })
    finally:
        conn.close()


@records_bp.post("/api/patients/<int:patient_id>/plasma-number-72h")
@require_user
def update_plasma_number_72h(patient_id):
    number = str((request.get_json(silent=True) or {}).get("plasma_number_72h") or "").strip()
    if len(number) > 1000:
        return fail("72h血浆编号不能超过1000字")
    conn = db()
    try:
        with conn.cursor() as cur:
            current_user = _current_user_scope(cur)
            if not current_user or not _patient_is_accessible(cur, patient_id, current_user):
                return fail("病人不存在", 404)
            cur.execute("UPDATE patients SET plasma_number_72h=%s, updated_at=NOW() WHERE id=%s", (number or None, patient_id))
        conn.commit()
        return ok(message="72h血浆编号已保存")
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
            dynamic_field_types = {}
            cur.execute("SELECT field_name, data_type FROM patient_field_settings WHERE enabled=1")
            for row in cur.fetchall():
                field_name = row["field_name"]
                if field_name in patient_columns:
                    allowed_fields.add(field_name)
                    dynamic_field_types[field_name] = str(row.get("data_type") or "").lower()
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
            update_values = {}
            for field in allowed_fields:
                if field not in data:
                    continue
                value = data.get(field)
                field_type = dynamic_field_types.get(field, "")
                if field_type == "datetime":
                    value = _optional_datetime(value)
                elif field_type == "date":
                    value = str(value or "").strip() or None
                elif field_type in {"int", "decimal", "number"}:
                    value = _optional_decimal(value)
                elif field == "age":
                    value = _normalize_patient_identity({"age": value})["age"]
                elif field in {"name", "gender"}:
                    value = str(value or "").strip()
                updates.append(f"`{field.replace('`', '``')}`=%s")
                params.append(value)
                update_values[field] = value

            if not updates:
                return fail("没有可保存的基础信息")
            if _patient_identity_after_update_missing(cur, patient_id, update_values):
                return fail("请填写姓名、性别、年龄")
            if _patient_identity_conflicts(cur, patient_id, update_values):
                return fail("这个病人在系统里面已经存在了，不能重复添加病例", 409)
            if "updated_at" in patient_columns:
                updates.append("updated_at=NOW()")
            params.append(patient_id)
            try:
                cur.execute(f"UPDATE patients SET {','.join(updates)} WHERE id=%s", params)
            except IntegrityError as e:
                if e.args and e.args[0] == 1062:
                    return fail("这个病人在系统里面已经存在了，不能重复添加病例", 409)
                raise

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
