import os

import requests


AMAP_GEOCODE_URL = "https://restapi.amap.com/v3/geocode/geo"


def _amap_key():
    return os.getenv("AMAP_KEY", "7664d46797f834fff821cd384c6a79b6")


def check_hospital_exact_match(hospital_name, city=None):
    params = {"key": _amap_key(), "address": hospital_name}
    if city:
        params["city"] = city

    response = requests.get(AMAP_GEOCODE_URL, params=params, timeout=10)
    data = response.json()

    if data.get("status") != "1" or int(data.get("count", 0)) == 0:
        return False

    for geocode in data.get("geocodes", []):
        if geocode.get("formatted_address") == hospital_name:
            return True
        if geocode.get("name") == hospital_name:
            return True

    return False
