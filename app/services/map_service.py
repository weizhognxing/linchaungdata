import os
import re

import requests


AMAP_GEOCODE_URL = "https://restapi.amap.com/v3/geocode/geo"


def _amap_key():
    return os.getenv("AMAP_KEY", "7664d46797f834fff821cd384c6a79b6")


def _normalize_name(text):
    if not text:
        return ""
    # Keep Chinese letters/numbers only, remove spaces and punctuation.
    value = re.sub(r"[^\u4e00-\u9fa5a-zA-Z0-9]", "", str(text)).lower()
    return value


def _is_same_hospital(input_name, amap_name):
    left = _normalize_name(input_name)
    right = _normalize_name(amap_name)
    if not left or not right:
        return False

    if left == right:
        return True

    if left in right and len(left) >= 6:
        return True
    if right in left and len(right) >= 6:
        return True

    # Accept prefix containment for slightly shortened names, e.g.
    # "西南医科大学附属医" -> "西南医科大学附属医院".
    if right.startswith(left) and len(left) >= 6:
        return True
    if left.startswith(right) and len(right) >= 6:
        return True
    return False


def check_hospital_exact_match(hospital_name, city=None):
    params = {"key": _amap_key(), "address": hospital_name}
    if city:
        params["city"] = city

    try:
        response = requests.get(AMAP_GEOCODE_URL, params=params, timeout=10)
        data = response.json()
    except Exception:
        return False

    if data.get("status") != "1" or int(data.get("count", 0)) == 0:
        return False

    for geocode in data.get("geocodes", []):
        if _is_same_hospital(hospital_name, geocode.get("formatted_address")):
            return True
        if _is_same_hospital(hospital_name, geocode.get("name")):
            return True

    return False
