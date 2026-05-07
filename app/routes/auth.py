from flask import Blueprint, session
from werkzeug.security import check_password_hash, generate_password_hash

from app.common import fail, ok, payload, required
from app.db import db
from app.services.map_service import check_hospital_exact_match


auth_bp = Blueprint("auth", __name__)


@auth_bp.post("/api/register")
def register():
    data = payload()
    missing = required(data, ["name", "email", "phone", "province", "city", "organization", "department", "password"])
    if missing:
        return fail("缺少字段：" + ", ".join(missing))

    organization = data["organization"].strip()

    conn = db()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE email=%s OR phone=%s", (data["email"], data["phone"]))
            if cur.fetchone():
                return fail("邮箱或手机号码已注册")

            hospital_id = None
            parent_id = 0
            cur.execute("SELECT id FROM hospitals WHERE name=%s", (organization,))
            hospital = cur.fetchone()
            if hospital:
                hospital_id = hospital["id"]
                cur.execute(
                    "SELECT id FROM users WHERE hospital_id=%s AND parent_id=0 ORDER BY id LIMIT 1",
                    (hospital_id,),
                )
                owner = cur.fetchone()
                if owner:
                    parent_id = owner["id"]
            else:
                exists = check_hospital_exact_match(organization, data.get("city"))
                if not exists:
                    return fail("该医院不存在，如有问题，请联系管理员：18282595851")
                cur.execute("INSERT INTO hospitals (name) VALUES (%s)", (organization,))
                hospital_id = cur.lastrowid
                parent_id = 0

            cur.execute(
                """
                INSERT INTO users
                (name,email,phone,province,city,hospital_id,parent_id,department,password_hash,status)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,'pending')
                """,
                (
                    data["name"],
                    data["email"],
                    data["phone"],
                    data["province"],
                    data["city"],
                    hospital_id,
                    parent_id,
                    data["department"],
                    generate_password_hash(data["password"]),
                ),
            )
        conn.commit()
        return ok(message="注册成功，请等待管理员审核")
    finally:
        conn.close()


@auth_bp.post("/api/login")
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
        session["hospital_id"] = user.get("hospital_id")
        session["parent_id"] = user.get("parent_id", 0)
        return ok(
            {
                "name": user["name"],
                "hospital_id": user.get("hospital_id"),
                "parent_id": user.get("parent_id", 0),
                "status": user.get("status"),
            },
            "登录成功",
        )
    finally:
        conn.close()


@auth_bp.post("/api/logout")
def logout():
    session.clear()
    return ok(message="已退出")


@auth_bp.get("/api/user/check")
def user_check():
    if session.get("user_id"):
        return ok(
            {
                "name": session.get("user_name"),
                "user_id": session.get("user_id"),
                "hospital_id": session.get("hospital_id"),
                "parent_id": session.get("parent_id", 0),
            }
        )
    return fail("未登录", 401)


@auth_bp.post("/api/password/sms")
def send_sms_code():
    data = payload()
    phone = data.get("phone")
    if not phone:
        return fail("请输入手机号码")
    session["sms_phone"] = phone
    session["sms_code"] = "123456"
    return ok({"debug_code": "123456"}, "短信验证码已生成，开发环境固定为 123456")


@auth_bp.post("/api/password/reset")
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


@auth_bp.post("/api/admin/login")
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


@auth_bp.get("/api/admin/check")
def admin_check():
    if session.get("admin_id"):
        return ok({"username": session.get("admin_name")})
    return fail("未登录", 401)
