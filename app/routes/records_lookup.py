# Disease lookup, member review, form-field lookup, and AI recognition routes.
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


@records_bp.get("/api/diseases")
@require_user
def diseases():
    conn = db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT d.id, d.name, COUNT(DISTINCT r.patient_id) AS patient_count
                FROM diseases d
                LEFT JOIN lab_records r ON r.disease_id=d.id
                GROUP BY d.id, d.name, d.sort_order
                ORDER BY d.sort_order, d.id
                """
            )
            diseases = cur.fetchall()

            cur.execute("SELECT COUNT(DISTINCT patient_id) AS total_patients FROM lab_records")
            total_row = cur.fetchone() or {}
            total_patients = total_row.get("total_patients", 0) or 0

            return ok({"diseases": diseases, "total_patients": int(total_patients)})
    finally:
        conn.close()


@records_bp.get("/api/member-reviews")
@require_user
def member_reviews():
    user_id = session.get("user_id")
    conn = db()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id, hospital_id, parent_id FROM users WHERE id=%s", (user_id,))
            current_user = cur.fetchone()
            if not current_user:
                return fail("用户不存在", 404)
            if int(current_user.get("parent_id", 0)) != 0:
                return fail("无权限访问会员审核", 403)

            cur.execute(
                """
                SELECT id, name, phone, status
                FROM users
                WHERE hospital_id=%s AND id<>%s
                ORDER BY id DESC
                """,
                (current_user["hospital_id"], user_id),
            )
            return ok(cur.fetchall())
    finally:
        conn.close()


@records_bp.post("/api/member-reviews/<int:target_user_id>/approve")
@require_user
def approve_member(target_user_id):
    user_id = session.get("user_id")
    conn = db()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id, hospital_id, parent_id FROM users WHERE id=%s", (user_id,))
            current_user = cur.fetchone()
            if not current_user:
                return fail("用户不存在", 404)
            if int(current_user.get("parent_id", 0)) != 0:
                return fail("无权限操作", 403)

            cur.execute("SELECT id, hospital_id, status FROM users WHERE id=%s", (target_user_id,))
            target_user = cur.fetchone()
            if not target_user:
                return fail("目标会员不存在", 404)
            if target_user["hospital_id"] != current_user["hospital_id"]:
                return fail("仅可审核同医院成员", 403)

            if target_user["status"] != "pending":
                return fail("该会员不是未审核状态")

            cur.execute("UPDATE users SET status='approved' WHERE id=%s", (target_user_id,))
        conn.commit()
        return ok(message="审核通过")
    finally:
        conn.close()


@records_bp.get("/api/forms/<int:disease_id>")
@require_user
def form_fields(disease_id):
    return ok(get_fields_for_disease(disease_id))


@records_bp.post("/api/recognize")
@require_user
def recognize():
    raw_id = request.form.get("disease_id", "0")
    recognize_mode = (request.form.get("mode") or "lab").strip()
    record_category = (request.form.get("record_category") or "").strip()
    try:
        disease_id = int(raw_id)
    except (ValueError, TypeError):
        disease_id = 0

    photo = request.files.get("photo")
    photo_path = None
    if photo and photo.filename:
        os.makedirs(current_app.config["UPLOAD_FOLDER"], exist_ok=True)
        filename = f"{int(time.time())}_{secure_filename(photo.filename)}"
        path = os.path.join(current_app.config["UPLOAD_FOLDER"], filename)
        photo.save(path)
        photo_path = path.replace("\\", "/")

    fields = get_fields_for_disease(disease_id)
    if not fields:
        conn = db()
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT id, field_name, data_type, comment_text, form_label FROM field_settings WHERE enabled=1 ORDER BY id")
                fields = cur.fetchall()
        finally:
            conn.close()

    values = {}
    patient = {}
    lab_test_name = ""
    prompt_text = INTAKE_PROMPT if recognize_mode == "intake" else None
    if recognize_mode == "lab" and record_category:
        category_config = _lab_category_config(record_category)
        if category_config:
            prompt_text = _build_category_prompt(category_config)
    if photo_path:
        try:
            ai_text = recognize_image(photo_path, prompt_text=prompt_text)
            if not ai_text:
                return fail("AI识别接口返回内容为空，请重新上传或稍后重试", 502)
            values = {} if recognize_mode == "intake" else parse_ai_result(ai_text, fields)
            patient = parse_patient_info(ai_text)
            lab_test_name = parse_lab_test_name(ai_text)
            fields = reorder_fields_by_values(fields, values)
        except AIRecognitionError as e:
            return fail(str(e), 502)
        except Exception as e:
            print(f"AI recognition error: {e}")
            return fail("AI识别处理失败，请稍后重试", 500)

    return ok(
        {
            "photo_path": photo_path,
            "fields": fields,
            "values": values,
            "patient": patient,
            "mode": recognize_mode,
            "record_category": record_category or None,
            "category_label": (_lab_category_config(record_category) or {}).get("label") if record_category else None,
            "lab_test_name": lab_test_name,
        },
        "识别完成",
    )


