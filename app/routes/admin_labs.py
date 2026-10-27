import re

from flask import request
from pymysql.err import IntegrityError

from app.common import fail, ok
from app.db import db
from app.decorators import require_admin
from app.routes.admin import admin_bp
from app.services.lab_catalog import HIDDEN_FIELDS, catalog


@admin_bp.get('/api/admin/lab-categories')
@require_admin
def admin_lab_categories():
    conn = db()
    try:
        with conn.cursor() as cur:
            categories = catalog(cur)
            cur.execute('SHOW COLUMNS FROM lab_records')
            columns = {row['Field'] for row in cur.fetchall()}
            cur.execute('SELECT * FROM field_settings WHERE enabled=1 ORDER BY id')
            fields = [row for row in cur.fetchall() if row['field_name'] in columns and row['field_name'] not in HIDDEN_FIELDS]
            return ok({'categories': categories, 'fields': fields})
    finally:
        conn.close()


@admin_bp.post('/api/admin/lab-categories')
@admin_bp.post('/api/admin/lab-categories/<int:category_id>')
@require_admin
def save_lab_category(category_id=None):
    data = request.get_json(silent=True) or {}
    label = str(data.get('label') or '').strip()
    key = str(data.get('key') or '').strip()
    try:
        sort_order = int(data.get('sort_order', 0))
        enabled = int(data.get('enabled', 1))
    except (ValueError, TypeError):
        return fail('排序或状态无效')
    if not label or len(label) > 120 or enabled not in (0, 1):
        return fail('请填写有效类别名称和状态')
    if category_id is None and not re.fullmatch(r'[a-z][a-z0-9_]{1,62}', key):
        return fail('类别编码须为2-63位小写字母、数字或下划线，以字母开头')
    conn = db()
    try:
        with conn.cursor() as cur:
            if category_id is None:
                cur.execute('INSERT INTO lab_categories(category_key,label,sort_order,enabled) VALUES (%s,%s,%s,%s)',
                            (key, label, sort_order, enabled))
                category_id = cur.lastrowid
            else:
                cur.execute('SELECT id FROM lab_categories WHERE id=%s FOR UPDATE', (category_id,))
                if not cur.fetchone():
                    return fail('类别不存在', 404)
                if not enabled:
                    cur.execute('SELECT disease_id FROM disease_lab_categories WHERE category_id=%s LIMIT 1', (category_id,))
                    if cur.fetchone():
                        return fail('该类别仍是疾病必查类别，请先调整疾病配置再停用')
                cur.execute('UPDATE lab_categories SET label=%s,sort_order=%s,enabled=%s WHERE id=%s',
                            (label, sort_order, enabled, category_id))
        conn.commit()
        return ok({'id': category_id}, '类别已保存')
    except IntegrityError:
        conn.rollback()
        return fail('类别编码或名称已存在')
    finally:
        conn.close()


@admin_bp.post('/api/admin/lab-categories/<int:category_id>/fields')
@require_admin
def save_category_fields(category_id):
    data = request.get_json(silent=True) or {}
    items = data.get('fields')
    if not isinstance(items, list):
        return fail('指标配置格式错误')
    try:
        fields = [(int(item['field_id']), int(item.get('required', 0))) for item in items]
    except (KeyError, ValueError, TypeError):
        return fail('指标配置格式错误')
    if len({item[0] for item in fields}) != len(fields) or any(item[1] not in (0, 1) for item in fields):
        return fail('指标重复或必填设置无效')
    if not fields or not any(item[1] for item in fields):
        return fail('每个类别至少配置一个必填指标')
    conn = db()
    try:
        with conn.cursor() as cur:
            cur.execute('SELECT id FROM lab_categories WHERE id=%s FOR UPDATE', (category_id,))
            if not cur.fetchone():
                return fail('类别不存在', 404)
            cur.execute('SHOW COLUMNS FROM lab_records')
            columns = {row['Field'] for row in cur.fetchall()}
            cur.execute('SELECT id,field_name FROM field_settings WHERE enabled=1')
            allowed = {row['id'] for row in cur.fetchall() if row['field_name'] in columns and row['field_name'] not in HIDDEN_FIELDS}
            if any(field_id not in allowed for field_id, _ in fields):
                return fail('包含不可用的指标，请刷新后重试')
            cur.execute('DELETE FROM lab_category_fields WHERE category_id=%s', (category_id,))
            for position, (field_id, required) in enumerate(fields):
                cur.execute('INSERT INTO lab_category_fields(category_id,field_id,required,sort_order) VALUES (%s,%s,%s,%s)',
                            (category_id, field_id, required, position))
        conn.commit()
        return ok(message='类别指标及必填设置已保存')
    finally:
        conn.close()


@admin_bp.get('/api/admin/disease-lab-categories/<int:disease_id>')
@require_admin
def disease_categories(disease_id):
    conn = db()
    try:
        with conn.cursor() as cur:
            categories = catalog(cur)
            cur.execute('SELECT category_id FROM disease_lab_categories WHERE disease_id=%s ORDER BY sort_order', (disease_id,))
            return ok({'categories': categories, 'selected': [row['category_id'] for row in cur.fetchall()]})
    finally:
        conn.close()


@admin_bp.post('/api/admin/disease-lab-categories/<int:disease_id>')
@require_admin
def save_disease_categories(disease_id):
    data = request.get_json(silent=True) or {}
    if not isinstance(data.get('category_ids'), list):
        return fail('类别配置格式错误')
    try:
        ids = list(dict.fromkeys(int(value) for value in data['category_ids']))
    except (ValueError, TypeError):
        return fail('类别配置格式错误')
    conn = db()
    try:
        with conn.cursor() as cur:
            cur.execute('SELECT id FROM diseases WHERE id=%s FOR UPDATE', (disease_id,))
            if not cur.fetchone():
                return fail('疾病不存在', 404)
            cur.execute('SELECT id FROM lab_categories WHERE enabled=1 FOR UPDATE')
            allowed = {row['id'] for row in cur.fetchall()}
            if not set(ids).issubset(allowed):
                return fail('包含已停用或不存在的类别')
            cur.execute('DELETE FROM disease_lab_categories WHERE disease_id=%s', (disease_id,))
            for position, category_id in enumerate(ids):
                cur.execute('INSERT INTO disease_lab_categories(disease_id,category_id,sort_order) VALUES (%s,%s,%s)',
                            (disease_id, category_id, position))
        conn.commit()
        return ok(message='疾病必查类别已保存' if ids else '已清空：该疾病将显示尚未配置，不能自动完成')
    finally:
        conn.close()
