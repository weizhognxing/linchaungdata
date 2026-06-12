# Diagnosis cleanup, completion checks, treatment, follow-up, and assessment routes.
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


@records_bp.delete("/api/patients/<int:patient_id>/diagnosis-records/<int:diagnosis_record_id>")
@require_user
def delete_diagnosis_record(patient_id, diagnosis_record_id):
    conn = db()
    try:
        with conn.cursor() as cur:
            current_user = _current_user_scope(cur)
            if not current_user:
                return fail("用户不存在", 404)
            if not _patient_is_accessible(cur, patient_id, current_user):
                return fail("病人不存在", 404)
            if _patient_is_complete(cur, patient_id):
                return fail("完整记录已提交，不能修改")
            if not _table_exists(cur, "diagnosis_records"):
                return fail("诊断记录表不存在", 404)
            cur.execute("SELECT id FROM diagnosis_records WHERE id=%s AND patient_id=%s LIMIT 1", (diagnosis_record_id, patient_id))
            if not cur.fetchone():
                return fail("诊断记录不存在", 404)

            related_tables = [("treatments", "治疗"), ("followups", "随访"), ("assessments", "评估"), ("lab_records", "检验")]
            blocked = []
            for table_name, label in related_tables:
                if not _table_exists(cur, table_name):
                    continue
                cur.execute(f"SHOW COLUMNS FROM `{table_name}`")
                columns = {row["Field"] for row in cur.fetchall()}
                if "diagnosis_record_id" not in columns:
                    if table_name == "lab_records" and "patient_id" in columns:
                        cur.execute(f"SELECT COUNT(*) AS total FROM `{table_name}` WHERE patient_id=%s", (patient_id,))
                        if int((cur.fetchone() or {}).get("total") or 0) > 0:
                            blocked.append(label)
                    continue
                cur.execute(f"SELECT COUNT(*) AS total FROM `{table_name}` WHERE diagnosis_record_id=%s", (diagnosis_record_id,))
                if int((cur.fetchone() or {}).get("total") or 0) > 0:
                    blocked.append(label)
            if blocked:
                return fail("该诊断已有对应的" + "、".join(blocked) + "数据，不能删除")
            cur.execute("DELETE FROM diagnosis_records WHERE id=%s AND patient_id=%s", (diagnosis_record_id, patient_id))
        conn.commit()
        return ok(message="诊断记录已删除")
    finally:
        conn.close()


@records_bp.get("/api/patients/<int:patient_id>/completion-missing")
@require_user
def case_completion_missing(patient_id):
    conn = db()
    try:
        with conn.cursor() as cur:
            current_user = _current_user_scope(cur)
            if not current_user:
                return fail("用户不存在", 404)
            if not _patient_is_accessible(cur, patient_id, current_user):
                return fail("病人不存在", 404)
            if _patient_is_complete(cur, patient_id):
                return fail("完整记录已提交，不能修改")
            return ok({"missing": _missing_case_completion_items(cur, patient_id)})
    finally:
        conn.close()


@records_bp.post("/api/patients/<int:patient_id>/treatments")
@require_user
def add_treatment(patient_id):
    payload = request.get_json(silent=True) or request.form.to_dict()
    treat_time = (payload.get("treat_time") or "").strip()
    diagnosis_record_id = payload.get("diagnosis_record_id")
    if not diagnosis_record_id:
        return fail("请选择诊断记录")
    if not treat_time:
        treat_time = datetime.now().strftime("%Y-%m-%dT%H:%M")

    conn = db()
    try:
        with conn.cursor() as cur:
            current_user = _current_user_scope(cur)
            if not current_user:
                return fail("用户不存在", 404)
            if not _patient_is_accessible(cur, patient_id, current_user):
                return fail("病人不存在", 404)
            if _patient_is_complete(cur, patient_id):
                return fail("完整记录已提交，不能修改")
            if not _table_exists(cur, "diagnosis_records"):
                return fail("诊断记录表不存在，请先执行 ensure_diagnosis_records.sql")

            cur.execute(
                "SELECT diagnosis_disease FROM diagnosis_records WHERE id=%s AND patient_id=%s LIMIT 1",
                (diagnosis_record_id, patient_id),
            )
            diagnosis = cur.fetchone()
            if not diagnosis:
                return fail("请选择有效的诊断记录")

            cur.execute("SHOW COLUMNS FROM treatments")
            treatment_columns = {row["Field"] for row in cur.fetchall()}
            values = {
                "patient_id": patient_id,
                "user_id": session.get("user_id"),
                "diagnosis_record_id": diagnosis_record_id,
                "treat_time": _optional_datetime(treat_time),
                "treatment_method": "结构化治疗记录",
                "detail_json": json.dumps(payload, ensure_ascii=False),
                "antibiotics": (payload.get("antibiotics") or "").strip() or None,
                "antibiotics_start_time": _optional_datetime(payload.get("antibiotics_start_time")),
                "vasoactive_drugs": (payload.get("vasoactive_drugs") or "").strip() or None,
                "vasoactive_start_time": _optional_datetime(payload.get("vasoactive_start_time")),
                "vasoactive_concentration": (payload.get("vasoactive_concentration") or "").strip() or None,
                "volume_management": (payload.get("volume_management") or "").strip() or None,
                "volume_total_ml": _optional_decimal(payload.get("volume_total_ml")),
                "respiratory_support": (payload.get("respiratory_support") or "").strip() or None,
                "respiratory_start_time": _optional_datetime(payload.get("respiratory_start_time")),
                "immunomodulators": (payload.get("immunomodulators") or "").strip() or None,
                "immunomodulator_start_time": _optional_datetime(payload.get("immunomodulator_start_time")),
                "blood_purification": (payload.get("blood_purification") or "").strip() or None,
                "blood_purification_start_time": _optional_datetime(payload.get("blood_purification_start_time")),
                "traditional_chinese_medicine": (payload.get("traditional_chinese_medicine") or "").strip() or None,
                "traditional_chinese_medicine_start_time": _optional_datetime(payload.get("traditional_chinese_medicine_start_time")),
                "digestive_secretion_drugs": (payload.get("digestive_secretion_drugs") or "").strip() or None,
                "digestive_secretion_drugs_start_time": _optional_datetime(payload.get("digestive_secretion_drugs_start_time")),
                "cardiac_treatment_methods": (payload.get("cardiac_treatment_methods") or "").strip() or None,
                "cardiac_treatment_start_time": _optional_datetime(payload.get("cardiac_treatment_start_time")),
                "sodium_channel_blockers": (payload.get("sodium_channel_blockers") or "").strip() or None,
                "sodium_channel_blocker_start_time": _optional_datetime(payload.get("sodium_channel_blocker_start_time")),
                "beta_blockers": (payload.get("beta_blockers") or "").strip() or None,
                "beta_blocker_start_time": _optional_datetime(payload.get("beta_blocker_start_time")),
                "potassium_channel_blockers": (payload.get("potassium_channel_blockers") or "").strip() or None,
                "potassium_channel_blocker_start_time": _optional_datetime(payload.get("potassium_channel_blocker_start_time")),
                "calcium_channel_blockers": (payload.get("calcium_channel_blockers") or "").strip() or None,
                "calcium_channel_blocker_start_time": _optional_datetime(payload.get("calcium_channel_blocker_start_time")),
                "other_cardiac_drugs": (payload.get("other_cardiac_drugs") or "").strip() or None,
                "other_cardiac_drugs_start_time": _optional_datetime(payload.get("other_cardiac_drugs_start_time")),
                "poisoning_other_drugs": (payload.get("poisoning_other_drugs") or "").strip() or None,
                "poisoning_other_drugs_start_time": _optional_datetime(payload.get("poisoning_other_drugs_start_time")),
                "intracranial_pressure_reduction": (payload.get("intracranial_pressure_reduction") or "").strip() or None,
                "intracranial_pressure_start_time": _optional_datetime(payload.get("intracranial_pressure_start_time")),
                "surgical_treatment": (payload.get("surgical_treatment") or "").strip() or None,
                "surgical_treatment_start_time": _optional_datetime(payload.get("surgical_treatment_start_time")),
                "mild_hypothermia": (payload.get("mild_hypothermia") or "").strip() or None,
                "mild_hypothermia_start_time": _optional_datetime(payload.get("mild_hypothermia_start_time")),
                "brain_protection_drugs": (payload.get("brain_protection_drugs") or "").strip() or None,
                "brain_protection_start_time": _optional_datetime(payload.get("brain_protection_start_time")),
                "antiepileptic_drugs": (payload.get("antiepileptic_drugs") or "").strip() or None,
                "antiepileptic_start_time": _optional_datetime(payload.get("antiepileptic_start_time")),
                "surgery_methods": (payload.get("surgery_methods") or "").strip() or None,
                "surgery_start_time": _optional_datetime(payload.get("surgery_start_time")),
                "chest_fixation": (payload.get("chest_fixation") or "").strip() or None,
                "chest_fixation_start_time": _optional_datetime(payload.get("chest_fixation_start_time")),
                "airway_control": (payload.get("airway_control") or "").strip() or None,
                "airway_control_start_time": _optional_datetime(payload.get("airway_control_start_time")),
                "oxygen_support": (payload.get("oxygen_support") or "").strip() or None,
                "oxygen_support_start_time": _optional_datetime(payload.get("oxygen_support_start_time")),
                "blood_transfusion": (payload.get("blood_transfusion") or "").strip() or None,
                "blood_transfusion_start_time": _optional_datetime(payload.get("blood_transfusion_start_time")),
                "blood_transfusion_total": (payload.get("blood_transfusion_total") or "").strip() or None,
                "temperature_management": (payload.get("temperature_management") or "").strip() or None,
                "temperature_management_start_time": _optional_datetime(payload.get("temperature_management_start_time")),
            }
            columns = [column for column in values.keys() if column in treatment_columns]
            placeholders = ",".join(["%s"] * len(columns))

            cur.execute(
                f"INSERT INTO treatments ({','.join(columns)}) VALUES ({placeholders})",
                [values[column] for column in columns],
            )
            completed_now = _mark_case_complete_if_ready(cur, patient_id)
        conn.commit()
        return ok({"completed_now": completed_now}, "治疗记录已添加" + ("，已自动转为完整记录" if completed_now else ""))
    finally:
        conn.close()


@records_bp.post("/api/patients/<int:patient_id>/followups")
@require_user
def add_followup(patient_id):
    payload = request.get_json(silent=True) or request.form.to_dict()
    follow_time = (payload.get("follow_time") or "").strip()
    diagnosis_record_id = payload.get("diagnosis_record_id")
    if not diagnosis_record_id:
        return fail("请选择诊断记录")
    if not follow_time:
        follow_time = datetime.now().strftime("%Y-%m-%dT%H:%M")

    conn = db()
    try:
        with conn.cursor() as cur:
            current_user = _current_user_scope(cur)
            if not current_user:
                return fail("用户不存在", 404)
            if not _patient_is_accessible(cur, patient_id, current_user):
                return fail("病人不存在", 404)
            if _patient_is_complete(cur, patient_id):
                return fail("完整记录已提交，不能修改")

            missing_before_followup = [
                item for item in _missing_case_completion_items(cur, patient_id)
                if item != "随访"
            ]
            if missing_before_followup:
                return fail("请先完善以下信息，再提交随访记录：" + "、".join(missing_before_followup))

            if _table_exists(cur, "diagnosis_records"):
                cur.execute(
                    "SELECT diagnosis_disease FROM diagnosis_records WHERE id=%s AND patient_id=%s LIMIT 1",
                    (diagnosis_record_id, patient_id),
                )
                diagnosis = cur.fetchone()
                if not diagnosis:
                    return fail("请选择有效的诊断记录")

            cur.execute("SHOW COLUMNS FROM followups")
            followup_columns = {row["Field"] for row in cur.fetchall()}
            values = {
                "patient_id": patient_id,
                "user_id": session.get("user_id"),
                "diagnosis_record_id": diagnosis_record_id,
                "follow_time": _optional_datetime(follow_time),
                "follow_result": "结构化随访记录",
                "prognosis": _optional_number(payload.get("prognosis")),
                "death_days": _optional_number(payload.get("death_days")),
                "barthel_28d": _optional_number(payload.get("barthel_28d")),
                "ventilator_days": _optional_number(payload.get("ventilator_days")),
                "tracheotomy": _optional_number(payload.get("tracheotomy")),
                "blood_purification": _optional_number(payload.get("blood_purification")),
                "total_cost": _optional_number(payload.get("total_cost")),
                "mods": _optional_number(payload.get("mods")),
                "sepsis": _optional_number(payload.get("sepsis")),
                "pulmonary_infection": _optional_number(payload.get("pulmonary_infection")),
                "icu_days": _optional_number(payload.get("icu_days")),
            }
            columns = [column for column in values.keys() if column in followup_columns]
            placeholders = ",".join(["%s"] * len(columns))

            cur.execute(
                f"INSERT INTO followups ({','.join(columns)}) VALUES ({placeholders})",
                [values[column] for column in columns],
            )
            completed_now = _mark_case_complete_if_ready(cur, patient_id)
        conn.commit()
        return ok({"completed_now": completed_now}, "随访记录已添加" + ("，已自动转为完整记录" if completed_now else ""))
    finally:
        conn.close()


@records_bp.post("/api/patients/<int:patient_id>/assessments")
@require_user
def add_assessment(patient_id):
    payload = request.get_json(silent=True) or request.form.to_dict()
    assessment_time = (payload.get("assessment_time") or "").strip()
    diagnosis_record_id = payload.get("diagnosis_record_id")
    if not assessment_time or not diagnosis_record_id:
        return fail("请选择诊断记录并填写评估时间")

    conn = db()
    try:
        with conn.cursor() as cur:
            current_user = _current_user_scope(cur)
            if not current_user:
                return fail("用户不存在", 404)
            if not _patient_is_accessible(cur, patient_id, current_user):
                return fail("病人不存在", 404)
            if not _table_exists(cur, "assessments"):
                return fail("评估记录表不存在，请先执行 ensure_assessment_fields.sql")

            cur.execute(
                "SELECT diagnosis_disease FROM diagnosis_records WHERE id=%s AND patient_id=%s LIMIT 1",
                (diagnosis_record_id, patient_id),
            )
            if not cur.fetchone():
                return fail("请选择有效的诊断记录")

            cur.execute("SHOW COLUMNS FROM assessments")
            assessment_columns = {row["Field"] for row in cur.fetchall()}
            values = {
                "patient_id": patient_id,
                "user_id": session.get("user_id"),
                "diagnosis_record_id": diagnosis_record_id,
                "assessment_time": _optional_datetime(assessment_time),
                "temperature": _optional_decimal(payload.get("temperature")),
                "respiration": _optional_decimal(payload.get("respiration")),
                "systolic_bp": _optional_decimal(payload.get("systolic_bp")),
                "diastolic_bp": _optional_decimal(payload.get("diastolic_bp")),
                "heart_rate": _optional_decimal(payload.get("heart_rate")),
                "shock_index": _optional_decimal(payload.get("shock_index")),
                "oxygen_partial_pressure": _optional_decimal(payload.get("oxygen_partial_pressure")),
                "oxygen_concentration": _optional_decimal(payload.get("oxygen_concentration")),
                "sofa_score": _optional_decimal(payload.get("sofa_score")),
                "apache_ii_score": _optional_decimal(payload.get("apache_ii_score")),
                "barthel_score": _optional_decimal(payload.get("barthel_score")),
                "mods_score": _optional_decimal(payload.get("mods_score")),
                "gcs_score": _optional_decimal(payload.get("gcs_score")),
                "gbs_score": _optional_decimal(payload.get("gbs_score")),
                "killip_score": _optional_decimal(payload.get("killip_score")),
                "nihss_score": _optional_decimal(payload.get("nihss_score")),
                "cerebral_hernia": _optional_number(payload.get("cerebral_hernia")),
                "oxygen_saturation": _optional_decimal(payload.get("oxygen_saturation")),
                "ais_score": _optional_decimal(payload.get("ais_score")),
                "pain_score": _optional_decimal(payload.get("pain_score")),
                "iss_score": _optional_decimal(payload.get("iss_score")),
                "created_at": datetime.now(),
            }
            columns = [column for column in values.keys() if column in assessment_columns]
            placeholders = ",".join(["%s"] * len(columns))

            cur.execute(
                f"INSERT INTO assessments ({','.join(columns)}) VALUES ({placeholders})",
                [values[column] for column in columns],
            )
            completed_now = _mark_case_complete_if_ready(cur, patient_id)
        conn.commit()
        return ok({"completed_now": completed_now}, "评估记录已添加" + ("，已自动转为完整记录" if completed_now else ""))
    finally:
        conn.close()
