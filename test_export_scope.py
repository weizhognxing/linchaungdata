import unittest

from app.routes.records_cases import _scoped_user_ids


class FakeCursor:
    def __init__(self, children):
        self.children = children
        self.params = ()

    def execute(self, sql, params=None):
        self.params = tuple(params or ())

    def fetchall(self):
        return [{"id": child_id} for child_id in self.children.get(self.params, [])]


class ExportScopeTests(unittest.TestCase):
    def test_includes_transitive_descendants(self):
        cursor = FakeCursor({
            (2,): [3, 26],
            (3, 26): [],
        })
        self.assertEqual(_scoped_user_ids(cursor, 2), [2, 3, 26])

    def test_leaf_user_scope_is_self_only(self):
        cursor = FakeCursor({(26,): []})
        self.assertEqual(_scoped_user_ids(cursor, 26), [26])


if __name__ == "__main__":
    unittest.main()
