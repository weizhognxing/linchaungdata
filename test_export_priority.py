import unittest

from app.routes.records_cases import _select_other_patient_ids


class FakeCursor:
    def __init__(self, priority_rows, fill_rows, hospital_id):
        self.priority_rows = priority_rows
        self.fill_rows = fill_rows
        self.hospital_id = hospital_id
        self.calls = []
        self._sql = ""

    def execute(self, sql, params=None):
        self._sql = sql
        self.calls.append((sql, list(params or [])))

    def fetchone(self):
        if "FROM hospitals" in self._sql:
            return {"id": self.hospital_id} if self.hospital_id else None
        return None

    def fetchall(self):
        limit = int(self._sql.strip().split("LIMIT")[-1].strip())
        rows = self.priority_rows if "hospital_id" in self._sql else self.fill_rows
        return [{"id": value} for value in rows[:limit]]


class ExportPriorityTests(unittest.TestCase):
    def run_select(self, other_limit, priority_rows, fill_rows, hospital_id=2):
        cur = FakeCursor(priority_rows, fill_rows, hospital_id)
        result = _select_other_patient_ids(
            cur, {"id": 9}, {"user_id", "hospital_id"},
            "(1=1)", "", [], [1, 2, 3], other_limit,
        )
        return cur, result

    def test_priority_hospital_filled_first_then_remaining_random(self):
        cur, result = self.run_select(3, [101, 102], [201])
        self.assertEqual(result, [101, 102, 201])
        priority_sql, priority_params = cur.calls[1]
        self.assertIn("hospital_id", priority_sql)
        self.assertEqual(priority_params, [9, 9, 2, 2, 1, 2, 3])  # other users + hospital + own excludes
        fill_sql, fill_params = cur.calls[2]
        self.assertNotIn("hospital_id", fill_sql)
        self.assertEqual(fill_params, [9, 9, 1, 2, 3, 101, 102])  # own + prior picks excluded

    def test_priority_hospital_can_fill_the_whole_quota(self):
        cur, result = self.run_select(1, [101, 102], [201])
        self.assertEqual(result, [101])
        self.assertEqual(len(cur.calls), 2)  # hospital lookup + priority query only

    def test_falls_back_to_random_when_no_priority_hospital(self):
        cur, result = self.run_select(2, [101, 102], [201, 202], hospital_id=None)
        self.assertEqual(result, [201, 202])
        self.assertTrue(all("hospital_id" not in sql for sql, _ in cur.calls))

    def test_zero_limit_returns_empty(self):
        _, result = self.run_select(0, [101], [201])
        self.assertEqual(result, [])


if __name__ == "__main__":
    unittest.main()
