import os
import time
from datetime import date, datetime
from decimal import Decimal
from io import BytesIO

from flask import Blueprint, current_app, request, send_file, session
from openpyxl import Workbook
from werkzeug.utils import secure_filename

from app.common import fail, ok, required
from app.db import db
from app.decorators import require_user
from app.services.core import get_fields_for_disease, parse_ai_result, parse_patient_info, recognize_image, reorder_fields_by_values


records_bp = Blueprint("records", __name__)

DIAGNOSIS_DISEASE_OPTIONS = {"脓毒症部位", "重症胰腺炎", "心源性休克/心脏骤停", "中毒", "脑损伤", "多发伤", "胸部创伤"}
MEDICAL_HISTORY_OPTIONS = {"无", "糖尿病", "乙肝/肝硬化", "肾衰", "肝衰", "冠心病", "COPD", "高血压"}
DIAGNOSIS_SUBCATEGORY_OPTIONS = {
    "脓毒症部位": {"肺部", "腹部", "心血管/血液", "泌尿系", "脑部", "软组织", "不详"},
    "重症胰腺炎": set(),
    "心源性休克/心脏骤停": {"1心肌梗塞", "2心衰", "3.心肌炎", "4.急性瓣膜病变", "5电传导病变"},
    "中毒": {"有机磷中毒", "CO中毒", "蘑菇中毒", "杀虫剂/除草剂中毒", "药物中毒"},
    "脑损伤": {"大脑挫裂伤", "缺氧缺血性脑病", "弥漫性轴索损伤", "基底节出血", "小脑出血", "蛛网膜下腔出血", "脑梗塞", "脑干出血", "热射病"},
    "多发伤": {"颅脑损伤", "胸部创伤", "腹部创伤", "四肢损伤", "脊柱损伤"},
    "胸部创伤": {"连枷胸", "开放性气胸", "三根以上肋骨骨折", "开放性血气胸"},
}


def _current_user_scope(cur):
    user_id = session.get("user_id")
    cur.execute("SELECT id, hospital_id FROM users WHERE id=%s", (user_id,))
    return cur.fetchone()


def _patient_columns(cur):
    cur.execute("SHOW COLUMNS FROM patients")
    return {row["Field"] for row in cur.fetchall()}


def _table_exists(cur, table_name):
    cur.execute("SHOW TABLES LIKE %s", (table_name,))
    return cur.fetchone() is not None


def _xlsx_value(value):
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date)):
        return value.strftime("%Y-%m-%d %H:%M:%S") if isinstance(value, datetime) else value.strftime("%Y-%m-%d")
    return value


def _write_sheet(workbook, title, rows, headers):
    sheet = workbook.create_sheet(title=title)
    sheet.append(headers)
    for row in rows:
        sheet.append([_xlsx_value(row.get(header)) for header in headers])
    for column_cells in sheet.columns:
        max_length = max(len(str(cell.value or "")) for cell in column_cells)
        sheet.column_dimensions[column_cells[0].column_letter].width = min(max(max_length + 2, 10), 36)


def _fetch_rows_for_patients(cur, table_name, patient_ids, patient_column="patient_id"):
    if not _table_exists(cur, table_name):
        return [], []
    cur.execute(f"SHOW COLUMNS FROM `{table_name}`")
    headers = [row["Field"] for row in cur.fetchall()]
    if not patient_ids:
        return [], headers
    placeholders = ",".join(["%s"] * len(patient_ids))
    cur.execute(
        f"SELECT * FROM `{table_name}` WHERE `{patient_column}` IN ({placeholders}) ORDER BY `{patient_column}`, id",
        patient_ids,
    )
    return cur.fetchall(), headers


def _normalize_medical_history(raw_value):
    if isinstance(raw_value, list):
        items = raw_value
    else:
        items = str(raw_value or "无").split(",")
    selected = []
    for item in items:
        value = str(item).strip()
        if value in MEDICAL_HISTORY_OPTIONS and value not in selected:
            selected.append(value)
    if not selected or "无" in selected:
        return "无"
    return ",".join(selected)


def _normalize_preliminary_diagnosis(disease, raw_value):
    if not disease:
        return ""
    allowed = DIAGNOSIS_SUBCATEGORY_OPTIONS.get(disease, set())
    selected = []
    for item in str(raw_value or "").split(","):
        value = item.strip()
        if value in allowed and value not in selected:
            selected.append(value)
    if disease == "多发伤":
        selected = selected[:3]
    elif len(selected) > 1:
        selected = selected[:1]
    return ",".join(selected)


def _optional_number(value):
    value = str(value or "").strip()
    return value if value != "" else None


def _optional_decimal(value):
    value = str(value or "").strip()
    return value if value != "" else None


def _patient_is_accessible(cur, patient_id, current_user, patient_columns=None):
    patient_columns = patient_columns or _patient_columns(cur)
    if "hospital_id" in patient_columns:
        cur.execute(
            """
            SELECT p.id
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
            SELECT p.id
            FROM patients p
            JOIN lab_records r ON r.patient_id=p.id
            JOIN users u ON u.id=r.user_id
            WHERE p.id=%s AND u.hospital_id=%s
            LIMIT 1
            """,
            (patient_id, current_user["hospital_id"]),
        )
    return cur.fetchone() is not None


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
    if photo_path:
        try:
            ai_text = recognize_image(photo_path)
            values = parse_ai_result(ai_text, fields)
            patient = parse_patient_info(ai_text)
            fields = reorder_fields_by_values(fields, values)
        except Exception as e:
            print(f"AI recognition error: {e}")

    return ok({"photo_path": photo_path, "fields": fields, "values": values, "patient": patient}, "识别完成")


@records_bp.post("/api/records")
@require_user
def save_record():
    data = request.get_json(silent=True) or {}
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
    missing = required(patient, ["name"])
    if missing or not disease_id:
        return fail("请填写病患姓名并选择疾病")

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

            if "hospital_id" in patient_columns:
                cur.execute(
                    """
                    SELECT id FROM patients
                    WHERE hospital_id=%s AND name=%s AND IFNULL(phone,'')=%s AND IFNULL(id_number,'')=%s
                    LIMIT 1
                    """,
                    (current_user["hospital_id"], patient.get("name"), patient.get("phone", ""), patient.get("id_number", "")),
                )
            else:
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
                updates = ["gender=%s", "age=%s", "updated_at=NOW()"]
                params = [patient.get("gender"), patient.get("age") or None]
                if "hospital_id" in patient_columns:
                    updates.append("hospital_id=%s")
                    params.append(current_user["hospital_id"])
                if "user_id" in patient_columns:
                    updates.append("user_id=%s")
                    params.append(current_user["id"])
                params.append(patient_id)
                cur.execute(f"UPDATE patients SET {','.join(updates)} WHERE id=%s", params)
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
                patient_cols = list(patient_insert.keys())
                patient_placeholders = ",".join(["%s"] * len(patient_cols))
                cur.execute(
                    f"INSERT INTO patients ({','.join(patient_cols)}) VALUES ({patient_placeholders})",
                    list(patient_insert.values()),
                )
                patient_id = cur.lastrowid

            columns = ["patient_id", "user_id", "disease_id", "photo_path", "ai_raw"] + list(record_values.keys())
            params = [patient_id, session["user_id"], disease_id, data.get("photo_path"), data.get("ai_raw")] + list(record_values.values())
            placeholders = ",".join(["%s"] * len(columns))
            # PyMySQL uses Python '%' formatting internally; escape '%' in identifiers
            # to avoid '%`' formatting errors for legacy field names like 'xxx%'.
            safe_columns = ",".join([f"`{str(col).replace('`', '``').replace('%', '%%')}`" for col in columns])
            cur.execute(f"INSERT INTO lab_records ({safe_columns}) VALUES ({placeholders})", params)
            record_id = cur.lastrowid
        conn.commit()
        if skipped_fields:
            return ok(
                {"record_id": record_id, "patient_id": patient_id, "skipped_fields": skipped_fields},
                "保存成功，部分字段未入库",
            )
        return ok({"record_id": record_id, "patient_id": patient_id}, "保存成功")
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
            system_fields = {"id", "patient_id", "user_id", "disease_id", "photo_path", "ai_raw", "created_at"}
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
            patient_rows, patient_headers = _fetch_rows_for_patients(cur, "patients", patient_ids, "id")
            lab_rows, lab_headers = _fetch_rows_for_patients(cur, "lab_records", patient_ids)
            treatment_rows, treatment_headers = _fetch_rows_for_patients(cur, "treatments", patient_ids)
            followup_rows, followup_headers = _fetch_rows_for_patients(cur, "followups", patient_ids)

            workbook = Workbook()
            workbook.remove(workbook.active)
            _write_sheet(workbook, "病患信息", patient_rows, patient_headers)
            _write_sheet(workbook, "检验记录", lab_rows, lab_headers)
            _write_sheet(workbook, "诊疗记录", treatment_rows, treatment_headers)
            _write_sheet(workbook, "随访记录", followup_rows, followup_headers)

            output = BytesIO()
            workbook.save(output)
            output.seek(0)
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
            if "hospital_id" in patient_columns:
                cur.execute(
                    """
                    SELECT p.id, p.name, p.gender, p.age, p.phone, p.id_number,
                           COUNT(r.id) AS record_count,
                           MAX(r.created_at) AS latest_record_at
                    FROM patients p
                    LEFT JOIN lab_records r ON r.patient_id=p.id
                    LEFT JOIN users u ON u.id=r.user_id
                    WHERE p.hospital_id=%s OR u.hospital_id=%s
                    GROUP BY p.id, p.name, p.gender, p.age, p.phone, p.id_number, p.created_at
                    ORDER BY IFNULL(MAX(r.created_at), p.created_at) DESC, p.id DESC
                    """,
                    (current_user["hospital_id"], current_user["hospital_id"]),
                )
                return ok(cur.fetchall())

            cur.execute(
                """
                SELECT p.id, p.name, p.gender, p.age, p.phone, p.id_number,
                       COUNT(r.id) AS record_count,
                       MAX(r.created_at) AS latest_record_at
                FROM patients p
                JOIN lab_records r ON r.patient_id=p.id
                JOIN users u ON u.id=r.user_id
                WHERE u.hospital_id=%s
                GROUP BY p.id, p.name, p.gender, p.age, p.phone, p.id_number
                ORDER BY latest_record_at DESC, p.id DESC
                """,
                (current_user["hospital_id"],),
            )
            return ok(cur.fetchall())
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
    if required(patient, ["name", "gender", "age", "id_number"]):
        return fail("请填写姓名、性别、年龄、病历号")

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
                    WHERE hospital_id=%s AND name=%s AND IFNULL(phone,'')=%s AND IFNULL(id_number,'')=%s
                    LIMIT 1
                    """,
                    (current_user["hospital_id"], patient["name"], patient["phone"], patient["id_number"]),
                )
            else:
                cur.execute(
                    """
                    SELECT id FROM patients
                    WHERE name=%s AND IFNULL(phone,'')=%s AND IFNULL(id_number,'')=%s
                    LIMIT 1
                    """,
                    (patient["name"], patient["phone"], patient["id_number"]),
                )
            existing = cur.fetchone()
            if existing:
                return ok({"patient_id": existing["id"]}, "病例已存在")

            patient_insert = dict(patient)
            if "hospital_id" in patient_columns:
                patient_insert["hospital_id"] = current_user["hospital_id"]
            if "user_id" in patient_columns:
                patient_insert["user_id"] = current_user["id"]

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
                SELECT r.id, r.created_at, d.name AS disease_name, u.name AS operator_name
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
                "created_at", "updated_at",
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
            })
    finally:
        conn.close()


@records_bp.post("/api/patients/<int:patient_id>")
@require_user
def update_patient(patient_id):
    data = request.get_json(silent=True) or request.form.to_dict()
    required_fields = ["name", "gender", "age", "id_number"]
    if required(data, required_fields):
        return fail("请填写姓名、性别、年龄、病历号")

    conn = db()
    try:
        with conn.cursor() as cur:
            current_user = _current_user_scope(cur)
            if not current_user:
                return fail("用户不存在", 404)

            patient_columns = _patient_columns(cur)
            if not _patient_is_accessible(cur, patient_id, current_user, patient_columns):
                return fail("病人不存在", 404)

            is_diagnosis_update = any(
                field in data for field in {"diagnosis_disease", "medical_history", "preliminary_diagnosis"}
            )

            allowed_fields = {"name", "gender", "age", "phone", "id_number"}
            cur.execute("SELECT field_name FROM patient_field_settings WHERE enabled=1")
            allowed_fields.update(
                row["field_name"] for row in cur.fetchall() if row["field_name"] in patient_columns
            )
            allowed_fields = [field for field in allowed_fields if field in patient_columns]

            if "diagnosis_disease" in data:
                diagnosis_disease = (data.get("diagnosis_disease") or "").strip()
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
        conn.commit()
        return ok({"patient_id": patient_id}, "基础信息已保存")
    finally:
        conn.close()


@records_bp.post("/api/patients/<int:patient_id>/treatments")
@require_user
def add_treatment(patient_id):
    payload = request.get_json(silent=True) or request.form.to_dict()
    treat_time = (payload.get("treat_time") or "").strip()
    diagnosis_record_id = payload.get("diagnosis_record_id")
    if not treat_time or not diagnosis_record_id:
        return fail("请选择诊断记录并填写诊疗时间")

    conn = db()
    try:
        with conn.cursor() as cur:
            current_user = _current_user_scope(cur)
            if not current_user:
                return fail("用户不存在", 404)
            if not _patient_is_accessible(cur, patient_id, current_user):
                return fail("病人不存在", 404)
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
                "treat_time": treat_time,
                "treatment_method": "结构化治疗记录",
                "antibiotics": (payload.get("antibiotics") or "").strip() or None,
                "antibiotics_start_time": _optional_decimal(payload.get("antibiotics_start_time")),
                "vasoactive_drugs": (payload.get("vasoactive_drugs") or "").strip() or None,
                "vasoactive_start_time": _optional_decimal(payload.get("vasoactive_start_time")),
                "vasoactive_concentration": (payload.get("vasoactive_concentration") or "").strip() or None,
                "volume_management": (payload.get("volume_management") or "").strip() or None,
                "volume_total_ml": _optional_decimal(payload.get("volume_total_ml")),
                "respiratory_support": (payload.get("respiratory_support") or "").strip() or None,
                "respiratory_start_time": _optional_decimal(payload.get("respiratory_start_time")),
                "immunomodulators": (payload.get("immunomodulators") or "").strip() or None,
                "immunomodulator_start_time": _optional_decimal(payload.get("immunomodulator_start_time")),
                "blood_purification": (payload.get("blood_purification") or "").strip() or None,
                "blood_purification_start_time": _optional_decimal(payload.get("blood_purification_start_time")),
                "traditional_chinese_medicine": (payload.get("traditional_chinese_medicine") or "").strip() or None,
                "traditional_chinese_medicine_start_time": _optional_decimal(payload.get("traditional_chinese_medicine_start_time")),
                "digestive_secretion_drugs": (payload.get("digestive_secretion_drugs") or "").strip() or None,
                "cardiac_treatment_methods": (payload.get("cardiac_treatment_methods") or "").strip() or None,
                "cardiac_treatment_start_time": _optional_decimal(payload.get("cardiac_treatment_start_time")),
                "sodium_channel_blockers": (payload.get("sodium_channel_blockers") or "").strip() or None,
                "sodium_channel_blocker_start_time": _optional_decimal(payload.get("sodium_channel_blocker_start_time")),
                "beta_blockers": (payload.get("beta_blockers") or "").strip() or None,
                "beta_blocker_start_time": _optional_decimal(payload.get("beta_blocker_start_time")),
                "potassium_channel_blockers": (payload.get("potassium_channel_blockers") or "").strip() or None,
                "potassium_channel_blocker_start_time": _optional_decimal(payload.get("potassium_channel_blocker_start_time")),
                "calcium_channel_blockers": (payload.get("calcium_channel_blockers") or "").strip() or None,
                "calcium_channel_blocker_start_time": _optional_decimal(payload.get("calcium_channel_blocker_start_time")),
                "other_cardiac_drugs": (payload.get("other_cardiac_drugs") or "").strip() or None,
                "poisoning_other_drugs": (payload.get("poisoning_other_drugs") or "").strip() or None,
                "intracranial_pressure_reduction": (payload.get("intracranial_pressure_reduction") or "").strip() or None,
                "intracranial_pressure_start_time": _optional_decimal(payload.get("intracranial_pressure_start_time")),
                "surgical_treatment": (payload.get("surgical_treatment") or "").strip() or None,
                "surgical_treatment_start_time": _optional_decimal(payload.get("surgical_treatment_start_time")),
                "mild_hypothermia": (payload.get("mild_hypothermia") or "").strip() or None,
                "mild_hypothermia_start_time": _optional_decimal(payload.get("mild_hypothermia_start_time")),
                "brain_protection_drugs": (payload.get("brain_protection_drugs") or "").strip() or None,
                "brain_protection_start_time": _optional_decimal(payload.get("brain_protection_start_time")),
                "antiepileptic_drugs": (payload.get("antiepileptic_drugs") or "").strip() or None,
                "antiepileptic_start_time": _optional_decimal(payload.get("antiepileptic_start_time")),
                "surgery_methods": (payload.get("surgery_methods") or "").strip() or None,
                "surgery_start_time": _optional_decimal(payload.get("surgery_start_time")),
                "chest_fixation": (payload.get("chest_fixation") or "").strip() or None,
                "chest_fixation_start_time": _optional_decimal(payload.get("chest_fixation_start_time")),
                "airway_control": (payload.get("airway_control") or "").strip() or None,
                "airway_control_start_time": _optional_decimal(payload.get("airway_control_start_time")),
                "oxygen_support": (payload.get("oxygen_support") or "").strip() or None,
                "oxygen_support_start_time": _optional_decimal(payload.get("oxygen_support_start_time")),
                "blood_transfusion": (payload.get("blood_transfusion") or "").strip() or None,
                "blood_transfusion_start_time": _optional_decimal(payload.get("blood_transfusion_start_time")),
                "blood_transfusion_total": (payload.get("blood_transfusion_total") or "").strip() or None,
                "temperature_management": (payload.get("temperature_management") or "").strip() or None,
            }
            columns = [column for column in values.keys() if column in treatment_columns]
            placeholders = ",".join(["%s"] * len(columns))

            cur.execute(
                f"INSERT INTO treatments ({','.join(columns)}) VALUES ({placeholders})",
                [values[column] for column in columns],
            )
        conn.commit()
        return ok(message="诊疗记录已添加")
    finally:
        conn.close()


@records_bp.post("/api/patients/<int:patient_id>/followups")
@require_user
def add_followup(patient_id):
    payload = request.get_json(silent=True) or request.form.to_dict()
    follow_time = (payload.get("follow_time") or "").strip()
    diagnosis_record_id = payload.get("diagnosis_record_id")
    if not follow_time or not diagnosis_record_id:
        return fail("请选择诊断记录并填写随访时间")

    conn = db()
    try:
        with conn.cursor() as cur:
            current_user = _current_user_scope(cur)
            if not current_user:
                return fail("用户不存在", 404)
            if not _patient_is_accessible(cur, patient_id, current_user):
                return fail("病人不存在", 404)

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
                "follow_time": follow_time,
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
        conn.commit()
        return ok(message="随访记录已添加")
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
                "assessment_time": assessment_time,
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
        conn.commit()
        return ok(message="评估记录已添加")
    finally:
        conn.close()
