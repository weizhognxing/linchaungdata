from functools import wraps

from .common import fail, is_admin_logged_in, is_user_logged_in


def require_user(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not is_user_logged_in():
            return fail("请先登录", 401)
        return fn(*args, **kwargs)

    return wrapper


def require_admin(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not is_admin_logged_in():
            return fail("请先登录管理员后台", 401)
        return fn(*args, **kwargs)

    return wrapper
