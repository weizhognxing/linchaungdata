import os
import time

from flask import Blueprint, current_app, request, session
from werkzeug.utils import secure_filename

from app.common import fail, ok, required
from app.db import db
from app.decorators import require_user
from app.services.core import get_fields_for_disease, parse_ai_result, recognize_image


records_bp = Blueprint("records", __name__)


@records_bp.get("/api/diseases")
@require_user
def diseases():
    conn = db()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id, name FROM diseases ORDER BY sort_order, id")
            return ok(cur.fetchall())
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
    if photo_path:
        try:
            ai_text = recognize_image(photo_path)
            values = parse_ai_result(ai_text, fields)
        except Exception as e:
            print(f"AI recognition error: {e}")

    return ok({"photo_path": photo_path, "fields": fields, "values": values}, "识别完成")


@records_bp.post("/api/records")
@require_user
def save_record():
    data = request.get_json(silent=True) or {}
    patient = data.get("patient") or {}
    values = data.get("values") or {}
    disease_id = data.get("disease_id")
    missing = required(patient, ["name"])
    if missing or not disease_id:
        return fail("请填写病患姓名并选择疾病")

    allowed_fields = {field["field_name"] for field in get_fields_for_disease(int(disease_id))}
    record_values = {key: value for key, value in values.items() if key in allowed_fields}

    conn = db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id FROM patients
                WHERE name=%s AND IFNULL(phone,'')=%s AND IFNULL(id_number,'')=%s
                LIMIT 1
                """,
                (patient.get("name"), patient.get("phone", ""), patient.get("id_number", "")),
            )
            row = cur.fetchone()
            if row:
                patient_id = row["id"]
                cur.execute(
                    "UPDATE patients SET gender=%s, age=%s, updated_at=NOW() WHERE id=%s",
                    (patient.get("gender"), patient.get("age") or None, patient_id),
                )
            else:
                cur.execute(
                    """
                    INSERT INTO patients (name, gender, age, phone, id_number)
                    VALUES (%s,%s,%s,%s,%s)
                    """,
                    (
                        patient.get("name"),
                        patient.get("gender"),
                        patient.get("age") or None,
                        patient.get("phone"),
                        patient.get("id_number"),
                    ),
                )
                patient_id = cur.lastrowid

            columns = ["patient_id", "user_id", "disease_id", "photo_path", "ai_raw"] + list(record_values.keys())
            params = [patient_id, session["user_id"], disease_id, data.get("photo_path"), data.get("ai_raw")] + list(record_values.values())
            placeholders = ",".join(["%s"] * len(columns))
            safe_columns = ",".join([f"`{col}`" for col in columns])
            cur.execute(f"INSERT INTO lab_records ({safe_columns}) VALUES ({placeholders})", params)
            record_id = cur.lastrowid
        conn.commit()
        return ok({"record_id": record_id, "patient_id": patient_id}, "保存成功")
    finally:
        conn.close()
