import re

from flask import jsonify, request, session

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


def ok(data=None, message="ok"):
    return jsonify({"success": True, "message": message, "data": data})


def fail(message, status=400):
    return jsonify({"success": False, "message": message}), status


def payload():
    return request.get_json(silent=True) or request.form.to_dict()


def required(data, names):
    return [name for name in names if not str(data.get(name, "")).strip()]


def is_user_logged_in():
    return bool(session.get("user_id"))


def is_admin_logged_in():
    return bool(session.get("admin_id"))
