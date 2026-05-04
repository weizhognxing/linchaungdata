import os
import re
import time
import base64
import json
from functools import wraps

import pymysql
import requests
from flask import Flask, jsonify, redirect, render_template, request, session
from werkzeug.security import check_password_hash, generate_password_hash
from werkzeug.utils import secure_filename

import config
import ai_config


app = Flask(__name__)
app.config["SECRET_KEY"] = config.SECRET_KEY
app.config["UPLOAD_FOLDER"] = config.UPLOAD_FOLDER

FIELD_NAME_RE = re.compile(r"^[a-z][a-z0-9_]{1,62}$")
ALLOWED_FIELD_TYPES = {
    "varchar": "VARCHAR(1000) NULL",
    "text": "TEXT NULL",
    "int": "INT NULL",
    "decimal": "DECIMAL(10,2) NULL",
    "date": "DATE NULL",
    "datetime": "DATETIME NULL",
}

DISEASES = [
    "脓毒症",
    "重症肺炎",
    "心肺复苏后",
    "急性坏死性胰腺炎",
    "消化道出血",
    "中毒",
    "心源性休克/心衰",
    "脑卒中",
    "多发伤",
    "颅脑损伤",
    "胸部损伤",
]

DEFAULT_FIELDS = [
    ("wbc", "decimal", "白细胞", "白细胞"),
    ("crp", "decimal", "C反应蛋白", "C反应蛋白"),
    ("pct", "decimal", "降钙素原", "降钙素原"),
    ("lactate", "decimal", "乳酸", "乳酸"),
    ("creatinine", "decimal", "肌酐", "肌酐"),
    ("alt", "decimal", "谷丙转氨酶", "谷丙转氨酶"),
    ("ast", "decimal", "谷草转氨酶", "谷草转氨酶"),
    ("remark", "text", "备注", "备注"),
]


def db(database=True):
    return pymysql.connect(
        host=config.DB_HOST,
        port=config.DB_PORT,
        user=config.DB_USER,
        password=config.DB_PASSWORD,
        database=config.DB_NAME if database else None,
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=False,
    )


def ok(data=None, message="ok"):
    return jsonify({"success": True, "message": message, "data": data})


def fail(message, status=400):
    return jsonify({"success": False, "message": message}), status


def require_user(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not session.get("user_id"):
            return fail("请先登录", 401)
        return fn(*args, **kwargs)

    return wrapper


def require_admin(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not session.get("admin_id"):
            return fail("请先登录管理员后台", 401)
        return fn(*args, **kwargs)

    return wrapper


def payload():
    return request.get_json(silent=True) or request.form.to_dict()


def required(data, names):
    missing = [name for name in names if not str(data.get(name, "")).strip()]
    return missing


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

    conn = db()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM admins WHERE username=%s", ("admin",))
            if not cur.fetchone():
                cur.execute(
                    "INSERT INTO admins (username, password_hash) VALUES (%s,%s)",
                    ("admin", generate_password_hash("admin123")),
                )

            for index, name in enumerate(DISEASES, start=1):
                cur.execute(
                    "INSERT IGNORE INTO diseases (name, sort_order) VALUES (%s,%s)",
                    (name, index),
                )

            for index, item in enumerate(DEFAULT_FIELDS, start=1):
                field_name, data_type, comment_text, form_label = item
                cur.execute(
                    """
                    INSERT IGNORE INTO field_settings
                    (field_name, data_type, comment_text, form_label)
                    VALUES (%s,%s,%s,%s)
                    """,
                    (field_name, data_type, comment_text, form_label),
                )
                cur.execute("SELECT id FROM field_settings WHERE field_name=%s", (field_name,))
                field = cur.fetchone()
                cur.execute("SELECT id FROM diseases")
                for disease in cur.fetchall():
                    cur.execute(
                        """
                        INSERT IGNORE INTO form_settings (disease_id, field_id, sort_order)
                        VALUES (%s,%s,%s)
                        """,
                        (disease["id"], field["id"], index),
                    )
        conn.commit()
    finally:
        conn.close()


@app.cli.command("init-db")
def init_db_command():
    init_database()
    print("PICCO database initialized. Admin: admin / admin123")


@app.route("/")
def index():
    return redirect("/app")


@app.route("/app")
def app_page():
    return render_template("client.html")


@app.route("/admin")
def admin_page():
    return render_template("admin.html")


@app.post("/api/register")
def register():
    data = payload()
    missing = required(data, ["name", "email", "phone", "province", "city", "organization", "department", "password"])
    if missing:
        return fail("缺少字段：" + ", ".join(missing))

    conn = db()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE email=%s OR phone=%s", (data["email"], data["phone"]))
            if cur.fetchone():
                return fail("邮箱或手机号码已注册")
            cur.execute(
                """
                INSERT INTO users
                (name,email,phone,province,city,organization,department,password_hash,status)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,'pending')
                """,
                (
                    data["name"],
                    data["email"],
                    data["phone"],
                    data["province"],
                    data["city"],
                    data["organization"],
                    data["department"],
                    generate_password_hash(data["password"]),
                ),
            )
        conn.commit()
        return ok(message="注册成功，请等待管理员审核")
    finally:
        conn.close()


@app.post("/api/login")
def login():
    data = payload()
    account = data.get("account", "")
    password = data.get("password", "")
    conn = db()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM users WHERE email=%s OR phone=%s", (account, account))
            user = cur.fetchone()
        if not user or not check_password_hash(user["password_hash"], password):
            return fail("账号或密码错误", 401)
        if user["status"] == "pending":
            return fail("管理员正在审核，请审核通过后再登录", 403)
        if user["status"] == "disabled":
            return fail("账号已被禁用", 403)
        session.clear()
        session["user_id"] = user["id"]
        session["user_name"] = user["name"]
        return ok({"name": user["name"]}, "登录成功")
    finally:
        conn.close()


@app.post("/api/logout")
def logout():
    session.clear()
    return ok(message="已退出")


@app.get("/api/user/check")
def user_check():
    if session.get("user_id"):
        return ok({"name": session.get("user_name")})
    return fail("未登录", 401)


@app.post("/api/password/sms")
def send_sms_code():
    data = payload()
    phone = data.get("phone")
    if not phone:
        return fail("请输入手机号码")
    session["sms_phone"] = phone
    session["sms_code"] = "123456"
    return ok({"debug_code": "123456"}, "短信验证码已生成，开发环境固定为 123456")


@app.post("/api/password/reset")
def reset_password():
    data = payload()
    if data.get("phone") != session.get("sms_phone") or data.get("code") != session.get("sms_code"):
        return fail("验证码错误")
    if not data.get("password"):
        return fail("请输入新密码")
    conn = db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE users SET password_hash=%s WHERE phone=%s",
                (generate_password_hash(data["password"]), data["phone"]),
            )
            if cur.rowcount == 0:
                return fail("手机号不存在")
        conn.commit()
        return ok(message="密码已重置")
    finally:
        conn.close()


@app.post("/api/admin/login")
def admin_login():
    data = payload()
    conn = db()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM admins WHERE username=%s", (data.get("username"),))
            admin = cur.fetchone()
        if not admin or not check_password_hash(admin["password_hash"], data.get("password", "")):
            return fail("管理员账号或密码错误", 401)
        session.clear()
        session["admin_id"] = admin["id"]
        session["admin_name"] = admin["username"]
        return ok({"username": admin["username"]}, "登录成功")
    finally:
        conn.close()


@app.get("/api/admin/check")
def admin_check():
    if session.get("admin_id"):
        return ok({"username": session.get("admin_name")})
    return fail("未登录", 401)


@app.get("/api/diseases")
@require_user
def diseases():
    conn = db()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id, name FROM diseases ORDER BY sort_order, id")
            return ok(cur.fetchall())
    finally:
        conn.close()


@app.get("/api/forms/<int:disease_id>")
@require_user
def form_fields(disease_id):
    return ok(get_fields_for_disease(disease_id))


def get_fields_for_disease(disease_id):
    conn = db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT f.id, f.field_name, f.data_type, f.comment_text, f.form_label
                FROM form_settings s
                JOIN field_settings f ON f.id=s.field_id
                WHERE s.disease_id=%s AND f.enabled=1
                ORDER BY s.sort_order, f.id
                """,
                (disease_id,),
            )
            return cur.fetchall()
    finally:
        conn.close()


def recognize_image(image_path):
    """调用 AI API 识别图片，返回 JSON 格式的检验结果"""
    with open(image_path, "rb") as f:
        image_data = base64.b64encode(f.read()).decode("utf-8")

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {ai_config.AI_API_KEY}"
    }

    prompt = """请识别这张检验报告图片，提取所有检验项目的结果。
请严格按照以下JSON格式返回，只返回JSON，不要其他内容：
{
  "items": [
    {"name": "中文名称", "code": "英文缩写", "value": "结果值", "unit": "单位", "reference": "参考区间", "abnormal": "↑/↓/正常"}
  ]
}"""

    payload = {
        "model": ai_config.AI_MODEL,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_data}"}}
                ]
            }
        ],
        "max_tokens": ai_config.AI_MAX_TOKENS
    }

    response = requests.post(ai_config.AI_API_URL, headers=headers, json=payload, timeout=60)
    if response.status_code == 200:
        return response.json()["choices"][0]["message"]["content"]
    return None


def parse_ai_result(ai_text, fields):
    """解析 AI 返回的 JSON，与数据库字段匹配"""
    if not ai_text:
        return {}

    json_match = re.search(r'\{.*\}', ai_text, re.DOTALL)
    if not json_match:
        return {}

    try:
        ai_data = json.loads(json_match.group())
    except json.JSONDecodeError:
        return {}

    items = ai_data.get("items", [])
    field_map = {f["field_name"].lower(): f for f in fields}

    result = {}
    for item in items:
        code = item.get("code", "").lower()
        value = item.get("value", "")

        if code in field_map:
            result[code] = value
        else:
            for field_name in field_map:
                if code in field_name or field_name in code:
                    result[field_name] = value
                    break

    return result


@app.post("/api/recognize")
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
        os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)
        filename = f"{int(time.time())}_{secure_filename(photo.filename)}"
        path = os.path.join(app.config["UPLOAD_FOLDER"], filename)
        photo.save(path)
        photo_path = path.replace("\\", "/")

    # 先获取疾病关联的字段，如果没有则获取所有字段
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


@app.post("/api/records")
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


@app.get("/api/admin/users")
@require_admin
def admin_users():
    conn = db()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id,name,email,phone,province,city,organization,department,status,created_at FROM users ORDER BY id DESC")
            return ok(cur.fetchall())
    finally:
        conn.close()


@app.post("/api/admin/users/<int:user_id>/status")
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


@app.get("/api/admin/fields")
@require_admin
def admin_fields():
    page = int(request.args.get("page", 1))
    per_page = int(request.args.get("per_page", 8))
    search = request.args.get("search", "").strip()
    offset = (page - 1) * per_page
    conn = db()
    try:
        with conn.cursor() as cur:
            where = ""
            params = []
            if search:
                where = "WHERE form_label LIKE %s"
                params.append(f"%{search}%")
            cur.execute(f"SELECT COUNT(*) as total FROM field_settings {where}", params)
            total = cur.fetchone()["total"]
            cur.execute(f"SELECT * FROM field_settings {where} ORDER BY created_at DESC LIMIT %s OFFSET %s", params + [per_page, offset])
            return ok({"list": cur.fetchall(), "total": total, "page": page, "per_page": per_page})
    finally:
        conn.close()


@app.post("/api/admin/fields")
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


@app.get("/api/admin/diseases")
@require_admin
def admin_diseases():
    conn = db()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id,name FROM diseases ORDER BY sort_order,id")
            return ok(cur.fetchall())
    finally:
        conn.close()


@app.get("/api/admin/form-settings/<int:disease_id>")
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


@app.post("/api/admin/form-settings/<int:disease_id>")
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


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
