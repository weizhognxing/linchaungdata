from flask import Blueprint, request

from app.common import ALLOWED_FIELD_TYPES, FIELD_NAME_RE, fail, ok, payload
from app.db import db
from app.decorators import require_admin


admin_bp = Blueprint("admin", __name__)


def _list_fields(table_name, page, per_page, search):
    offset = (page - 1) * per_page
    where = ""
    params = []
    if search:
        where = "WHERE form_label LIKE %s"
        params.append(f"%{search}%")

    conn = db()
    try:
        with conn.cursor() as cur:
            cur.execute(f"SELECT COUNT(*) as total FROM {table_name} {where}", params)
            total = cur.fetchone()["total"]
            cur.execute(
                f"SELECT * FROM {table_name} {where} ORDER BY created_at DESC LIMIT %s OFFSET %s",
                params + [per_page, offset],
            )
            return {"list": cur.fetchall(), "total": total, "page": page, "per_page": per_page}
    finally:
        conn.close()


@admin_bp.get("/api/admin/users")
@require_admin
def admin_users():
    conn = db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT u.id,u.name,u.email,u.phone,u.province,u.city,
                       h.name AS organization,
                       u.department,u.status,u.created_at,
                       u.hospital_id,u.parent_id
                FROM users u
                LEFT JOIN hospitals h ON h.id=u.hospital_id
                ORDER BY u.id DESC
                """
            )
            return ok(cur.fetchall())
    finally:
        conn.close()


@admin_bp.post("/api/admin/users/<int:user_id>/status")
@require_admin
def admin_user_status(user_id):
    status = payload().get("status")
    if status not in {"approved", "disabled", "pending"}:
        return fail("状态不合法")
    conn = db()
    try:
        with conn.cursor() as cur:
            cur.execute("UPDATE users SET status=%s WHERE id=%s", (status, user_id))
        conn.commit()
        return ok(message="状态已更新")
    finally:
        conn.close()


@admin_bp.get("/api/admin/fields")
@require_admin
def admin_fields():
    page = int(request.args.get("page", 1))
    per_page = int(request.args.get("per_page", 8))
    search = request.args.get("search", "").strip()
    return ok(_list_fields("field_settings", page, per_page, search))


@admin_bp.post("/api/admin/fields")
@require_admin
def admin_add_field():
    data = payload()
    field_name = (data.get("field_name") or "").strip()
    data_type = (data.get("data_type") or "").strip()
    form_label = (data.get("form_label") or "").strip()
    unit = (data.get("unit") or "").strip()
    reference_range = (data.get("reference_range") or "").strip()
    test_method = (data.get("test_method") or "").strip()
    if not FIELD_NAME_RE.match(field_name):
        return fail("字段名必须以小写字母开头，只能包含小写字母、数字、下划线，长度 2-63")
    if data_type not in ALLOWED_FIELD_TYPES:
        return fail("数据类型不支持")
    if not form_label:
        return fail("请填写网页表单显示名称")

    conn = db()
    try:
        with conn.cursor() as cur:
            cur.execute("SHOW COLUMNS FROM lab_records LIKE %s", (field_name,))
            if cur.fetchone():
                return fail("检验记录表中已存在该字段")
            sql_type = ALLOWED_FIELD_TYPES[data_type]
            cur.execute(f"ALTER TABLE lab_records ADD COLUMN `{field_name}` {sql_type} COMMENT '{unit}'")
            cur.execute(
                "INSERT INTO field_settings (field_name,data_type,unit,reference_range,test_method,form_label) VALUES (%s,%s,%s,%s,%s,%s)",
                (field_name, data_type, unit, reference_range, test_method, form_label),
            )
        conn.commit()
        return ok(message="字段已新增")
    finally:
        conn.close()


@admin_bp.get("/api/admin/patient-fields")
@require_admin
def admin_patient_fields():
    page = int(request.args.get("page", 1))
    per_page = int(request.args.get("per_page", 8))
    search = request.args.get("search", "").strip()
    return ok(_list_fields("patient_field_settings", page, per_page, search))


@admin_bp.post("/api/admin/patient-fields")
@require_admin
def admin_add_patient_field():
    data = payload()
    field_name = (data.get("field_name") or "").strip()
    data_type = (data.get("data_type") or "").strip()
    form_label = (data.get("form_label") or "").strip()

    if not FIELD_NAME_RE.match(field_name):
        return fail("字段名必须以小写字母开头，只能包含小写字母、数字、下划线，长度 2-63")
    if data_type not in ALLOWED_FIELD_TYPES:
        return fail("数据类型不支持")
    if not form_label:
        return fail("请填写网页表单显示名称")

    conn = db()
    try:
        with conn.cursor() as cur:
            cur.execute("SHOW COLUMNS FROM patients LIKE %s", (field_name,))
            if cur.fetchone():
                return fail("病患表中已存在该字段")
            sql_type = ALLOWED_FIELD_TYPES[data_type]
            cur.execute(f"ALTER TABLE patients ADD COLUMN `{field_name}` {sql_type}")
            cur.execute(
                "INSERT INTO patient_field_settings (field_name,data_type,form_label) VALUES (%s,%s,%s)",
                (field_name, data_type, form_label),
            )
        conn.commit()
        return ok(message="病患字段已新增")
    finally:
        conn.close()


@admin_bp.get("/api/admin/diseases")
@require_admin
def admin_diseases():
    conn = db()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id,name FROM diseases ORDER BY sort_order,id")
            return ok(cur.fetchall())
    finally:
        conn.close()


@admin_bp.get("/api/admin/form-settings/<int:disease_id>")
@require_admin
def admin_form_setting(disease_id):
    conn = db()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM field_settings WHERE enabled=1 ORDER BY id")
            fields = cur.fetchall()
            cur.execute("SELECT field_id, sort_order FROM form_settings WHERE disease_id=%s", (disease_id,))
            selected = {row["field_id"]: row["sort_order"] for row in cur.fetchall()}
            return ok({"fields": fields, "selected": selected})
    finally:
        conn.close()


@admin_bp.post("/api/admin/form-settings/<int:disease_id>")
@require_admin
def admin_save_form_setting(disease_id):
    data = request.get_json(silent=True) or {}
    field_ids = data.get("field_ids") or []
    conn = db()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM form_settings WHERE disease_id=%s", (disease_id,))
            for index, field_id in enumerate(field_ids, start=1):
                cur.execute(
                    "INSERT INTO form_settings (disease_id,field_id,sort_order) VALUES (%s,%s,%s)",
                    (disease_id, int(field_id), index),
                )
        conn.commit()
        return ok(message="表单配置已保存")
    finally:
        conn.close()


@admin_bp.get("/api/admin/settings")
@require_admin
def admin_settings():
    conn = db()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT doctor_download_multiplier FROM system_settings LIMIT 1")
            settings = cur.fetchone() or {"doctor_download_multiplier": 1}
            return ok(settings)
    finally:
        conn.close()


@admin_bp.post("/api/admin/settings")
@require_admin
def admin_save_settings():
    data = payload()
    raw_multiplier = data.get("doctor_download_multiplier")
    try:
        multiplier = int(raw_multiplier)
    except (TypeError, ValueError):
        return fail("下载倍数必须是整数")
    if multiplier < 0:
        return fail("下载倍数不能小于 0")

    conn = db()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM system_settings")
            cur.execute(
                "INSERT INTO system_settings (doctor_download_multiplier) VALUES (%s)",
                (multiplier,),
            )
        conn.commit()
        return ok({"doctor_download_multiplier": multiplier}, "系统设置已保存")
    finally:
        conn.close()
