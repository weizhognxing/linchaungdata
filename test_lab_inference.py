import io
import json
import unittest
from unittest.mock import patch

from flask import Flask
from app.routes.record_blueprint import records_bp
from app.services.lab_catalog import infer_categories


def category(key, names, enabled=1):
    return {'id': key, 'key': key, 'label': key, 'enabled': enabled,
            'fields': [{'field_name': name, 'form_label': name, 'available': True,
                        'required': True} for name in names]}


CATALOG = [category('blood', ['wbc', 'hgb']),
           category('chemistry', ['alt', 'ast']),
           category('electrolytes', ['na', 'k']),
           category('gas', ['ph', 'na', 'k'])]


class LabInferenceTests(unittest.TestCase):
    def test_partial_and_unreadable_results_identify_category(self):
        self.assertEqual(infer_categories(CATALOG, {'wbc': None})['selected'], ['blood'])

    def test_multi_category_report(self):
        self.assertEqual(infer_categories(CATALOG, {'wbc': 0, 'alt': 5})['selected'], ['blood', 'chemistry'])

    def test_shared_indicators_need_confirmation(self):
        result = infer_categories(CATALOG, {'na': 140, 'k': 4})
        self.assertEqual(result['selected'], [])
        self.assertEqual(result['ambiguous'], ['electrolytes', 'gas'])

    def test_shared_indicators_do_not_add_redundant_category(self):
        result = infer_categories(CATALOG, {'ph': 7.4, 'na': 140})
        self.assertEqual(result['selected'], ['gas'])
        self.assertEqual(result['ambiguous'], [])

    def test_empty_and_disabled(self):
        self.assertEqual(infer_categories(CATALOG, {})['selected'], [])
        self.assertEqual(infer_categories([category('off', ['wbc'], 0)], {'wbc': 5})['selected'], [])

    def test_endpoint_ignores_title_and_upload_category_and_returns_all_fields(self):
        application = Flask(__name__)
        application.secret_key = 'test'
        application.config['UPLOAD_FOLDER'] = '/tmp/opencode'
        application.register_blueprint(records_bp)
        client = application.test_client()
        with client.session_transaction() as session:
            session['user_id'] = 1
        ai_result = json.dumps({'lab_test_name': 'chemistry', 'items': [{'code': 'wbc', 'name': 'wbc', 'value': None}]})
        with patch('app.routes.records_lookup.db') as database, \
                patch('app.routes.records_lookup.catalog', return_value=CATALOG), \
                patch('app.routes.records_lookup.recognize_image', return_value=ai_result), \
                patch('werkzeug.datastructures.FileStorage.save'):
            response = client.post('/api/recognize', data={
                'mode': 'lab', 'record_category': 'chemistry',
                'photo': (io.BytesIO(b'fake'), 'report.jpg')})
        self.assertEqual(response.status_code, 200)
        data = response.get_json()['data']
        self.assertEqual(data['record_category'], 'blood')
        self.assertEqual(data['lab_test_name'], 'chemistry')
        self.assertEqual([field['field_name'] for field in data['fields']], ['wbc', 'hgb'])
        self.assertIsNone(data['values']['wbc'])


if __name__ == '__main__':
    unittest.main()
