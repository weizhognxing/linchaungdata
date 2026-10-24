"""Build a one-row-per-patient wide export from an anonymized case dataset.

Input rows must already be filtered for the selected disease and anonymized
(patient_id / id replaced with the export aliases). This module only reshapes
records into columns; it never reads or writes the database.
"""

import json


# ---------------------------------------------------------------------------
# Labels
# ---------------------------------------------------------------------------

ASSESSMENT_SKIP = {"id", "patient_id", "user_id", "diagnosis_record_id", "created_at"}
FOLLOWUP_SKIP = {"id", "patient_id", "user_id", "diagnosis_record_id", "created_at"}
TREATMENT_SKIP = {
    "id", "patient_id", "user_id", "diagnosis_record_id", "created_at",
    "detail_json",
}

ASSESSMENT_LABELS = {
    "assessment_time": "评估时间",
    "temperature": "体温(℃)",
    "respiration": "呼吸(次/分)",
    "systolic_bp": "收缩压(mmHg)",
    "diastolic_bp": "舒张压(mmHg)",
    "heart_rate": "心率(次/分)",
    "shock_index": "休克指数",
    "procalcitonin": "降钙素原(ng/ml)",
    "oxygen_partial_pressure": "氧分压(mmHg)",
    "oxygen_concentration": "氧浓度(%)",
    "sofa_score": "SOFA评分",
    "apache_ii_score": "APACHEⅡ评分",
    "barthel_score": "Barthel评分",
    "mods_score": "MODS评分",
    "gcs_score": "GCS评分",
    "gbs_score": "GBS评分",
    "killip_score": "KILLIP评分",
    "cerebral_hernia": "脑疝(1/0)",
    "oxygen_saturation": "氧饱和度(%)",
    "ais_score": "AIS评分",
    "pain_score": "疼痛评分",
    "iss_score": "ISS评分",
}

FOLLOWUP_LABELS = {
    "follow_time": "随访时间",
    "follow_result": "随访结果",
    "prognosis": "预后(死亡1/生存0)",
    "death_days": "生存天数",
    "barthel_28d": "Barthel评分(28天)",
    "ventilator_days": "28天内呼吸机天数",
    "tracheotomy": "28天内气管切开(1/0)",
    "blood_purification": "28天内血液净化(1/0)",
    "total_cost": "总费用(元)",
    "mods": "MODS(1/0)",
    "sepsis": "脓毒症(1/0)",
    "pulmonary_infection": "肺部感染(1/0)",
    "icu_days": "ICU天数",
}

TREATMENT_LABELS = {
    "treatment_method": "治疗方式",
    "treat_time": "治疗时间",
    "antibiotics": "抗生素",
    "vasoactive_drugs": "血管活性药物",
    "vasoactive_concentration": "血管活性药物浓度",
    "volume_management": "血容量管理",
    "volume_total_ml": "血容量总量(ml)",
    "respiratory_support": "辅助呼吸",
    "immunomodulators": "免疫调节药物",
    "blood_purification": "血液净化",
    "traditional_chinese_medicine": "中医中药",
    "digestive_secretion_drugs": "消化液分泌药物",
    "cardiac_treatment_methods": "心脏治疗手段",
    "sodium_channel_blockers": "钠通道阻滞药物",
    "beta_blockers": "β受体阻滞药",
    "potassium_channel_blockers": "钾通道阻滞药",
    "calcium_channel_blockers": "钙通道阻滞药物",
    "other_cardiac_drugs": "其他心脏药物",
    "poisoning_other_drugs": "中毒其他药物",
    "intracranial_pressure_reduction": "降颅压",
    "surgical_treatment": "手术治疗",
    "mild_hypothermia": "亚低温治疗",
    "brain_protection_drugs": "脑功能保护药物",
    "antiepileptic_drugs": "抗癫痫药物",
    "surgery_methods": "手术方式",
    "chest_fixation": "胸部固定方式",
    "airway_control": "气道控制",
    "oxygen_support": "吸氧支持",
    "blood_transfusion": "输血",
    "blood_transfusion_total": "输血总量",
    "temperature_management": "体温管理",
}

TREATMENT_START_LABELS = {
    "antibiotics_start_time": "抗生素开始时间",
    "vasoactive_start_time": "血管活性药物开始时间",
    "respiratory_start_time": "辅助呼吸开始时间",
    "immunomodulator_start_time": "免疫调节药物开始时间",
    "blood_purification_start_time": "血液净化开始时间",
    "traditional_chinese_medicine_start_time": "中医中药开始时间",
    "digestive_secretion_drugs_start_time": "消化液分泌药物开始时间",
    "cardiac_treatment_start_time": "心脏治疗手段开始时间",
    "sodium_channel_blocker_start_time": "钠通道阻滞药物开始时间",
    "beta_blocker_start_time": "β受体阻滞药开始时间",
    "potassium_channel_blocker_start_time": "钾通道阻滞药开始时间",
    "calcium_channel_blocker_start_time": "钙通道阻滞药物开始时间",
    "other_cardiac_drugs_start_time": "其他心脏药物开始时间",
    "poisoning_other_drugs_start_time": "中毒其他药物开始时间",
    "intracranial_pressure_start_time": "降颅压开始时间",
    "surgical_treatment_start_time": "手术治疗开始时间",
    "surgery_start_time": "手术方式开始时间",
    "mild_hypothermia_start_time": "亚低温治疗开始时间",
    "brain_protection_start_time": "脑功能保护药物开始时间",
    "antiepileptic_start_time": "抗癫痫药物开始时间",
    "chest_fixation_start_time": "胸部固定方式开始时间",
    "airway_control_start_time": "气道控制开始时间",
    "oxygen_support_start_time": "吸氧支持开始时间",
    "blood_transfusion_start_time": "输血开始时间",
    "temperature_management_start_time": "体温管理开始时间",
}


# ---------------------------------------------------------------------------
# Treatment option dictionaries (mirrors static/js/client/data/form-config.js)
# ---------------------------------------------------------------------------

_ANTIBIOTICS = [
    "无", "左氧氟沙星", "哌拉西林/他唑巴坦", "头孢曲松", "万古霉素", "美罗培南",
    "头孢哌酮/舒巴坦", "甲硝唑", "亚胺培南/西司他丁", "阿奇霉素", "环丙沙星",
    "氟康唑", "阿米卡星", "复方新诺明", "阿莫西林/克拉维酸", "利奈唑胺",
    "莫西沙星", "头孢他啶", "克拉霉素", "克林霉素",
]
_VASOACTIVE = [
    "无", "肾上腺素（ug/kg/min）", "多巴酚丁胺（ug/kg/min）", "加压素（ug/kg/min）",
    "多巴胺（ug/kg/min）", "去氧肾上腺素（ug/kg/min）", "去甲肾上腺素（ug/kg/min）",
    "左西孟旦（ug/kg/min）",
]
_VOLUME = ["晶体液（ml）", "白蛋白（g）", "人工胶体（ml）", "血浆（ml）"]
_RESPIRATORY = ["无", "高流量吸氧", "无创通气", "有创通气", "支纤镜+肺泡灌洗"]
_IMMUNOMODULATORS = [
    "无", "乌司他丁", "西维来司他纳", "氢化可的松", "IL1抑制剂", "抗IL-6",
    "TLR4拮抗剂", "干扰素-γ", "粒细胞-巨噬细胞集落刺激因子", "IL7",
    "阻断PD-1/PDL-1", "免疫球蛋白", "胸腺肽", "胸腺肽α1", "血必净", "黄芪注射液",
    "清瘟败毒饮", "黄连解毒汤", "犀角地黄汤", "八位败毒散", "仙方活命饮", "独参汤",
    "补中益气汤", "温肾护脉汤", "左金方",
]
_BLOOD_PURIFICATION = ["无", "CRRT", "IRRT", "血液灌流", "血浆置换", "血液/血浆吸附"]
_TCM = [
    "无", "清胰汤", "大承气汤类", "柴芩承气汤", "活血清胰汤", "大黄附子汤",
    "复方丹参", "清营汤", "温脾汤", "清胰陷胸汤", "针灸",
]
_DIGESTIVE = ["无", "生长抑素", "奥曲肽", "乌司他丁", "加贝酯", "抑肽酶", "奥美拉唑"]
_CARDIAC = ["ECMO", "介入手术", "IABP", "电除颤", "临时起搏器", "心肺复苏"]
_SODIUM = ["无", "利多卡因", "美西率", "苯妥英钠", "普罗帕酮", "氟卡尼", "莫雷西嗪"]
_BETA = ["无", "美托洛尔", "普萘洛尔", "艾司洛尔", "比索洛尔"]
_POTASSIUM = ["无", "胺碘酮", "索他洛尔", "多菲利特", "伊布利特", "维纳卡兰"]
_CALCIUM = ["无", "维拉帕米", "地尔硫卓"]
_OTHER_CARDIAC = ["无", "腺苷", "地高辛", "硫酸镁"]
_POISONING = ["活性炭", "vit K", "阿托品", "长托林", "解磷定"]
_ICP = ["甘露醇", "浓氯化钠", "白蛋白", "利尿剂"]
_SURGICAL = ["无", "去骨瓣减压", "转孔引流术", "血肿清除术", "介入手术"]
_MILD_HYPOTHERMIA = ["无", "冰毯冰帽", "经食道降温", "经尿道降温"]
_BRAIN = [
    "无", "依达拉奉", "胞磷胆碱", "神经节苷脂", "促红细胞生成素", "镁剂",
    "乙酰半胱氨酸", "米诺环素", "吡拉西坦", "奥拉西坦", "醒脑静",
    "复方麝香注射液", "安宫牛黄丸",
]
_ANTIEPILEPTIC = ["无", "丙戊酸钠", "左乙拉西坦"]
_CHEST_SURGERY = ["无", "确定性急诊手术", "损伤控制手术（1小时内）", "介入手术", "胸腔闭式引流术"]
_TRAUMA_SURGERY = ["无", "确定性急诊手术", "损伤控制手术（1小时内）", "介入止血手术"]
_SURGERY_METHODS = _CHEST_SURGERY + [x for x in _TRAUMA_SURGERY if x not in _CHEST_SURGERY]
_CHEST_FIXATION = ["无", "负压固定", "常规固定"]
_AIRWAY = ["无", "喉罩", "气管插管", "气管切开"]
_OXYGEN = ["吸氧", "高流量吸氧", "无创通气", "呼吸机"]
_BLOOD_TRANSFUSION = ["无", "红悬（U)", "血浆(ml)", "血小板（U）", "纤维蛋白原(g)"]
_TEMPERATURE = ["无", "加温加压仪", "温毯机"]

TREATMENT_OPTION_SETS = {
    "antibiotics": _ANTIBIOTICS,
    "vasoactive_drugs": _VASOACTIVE,
    "volume_management": _VOLUME,
    "respiratory_support": _RESPIRATORY,
    "immunomodulators": _IMMUNOMODULATORS,
    "blood_purification": _BLOOD_PURIFICATION,
    "traditional_chinese_medicine": _TCM,
    "digestive_secretion_drugs": _DIGESTIVE,
    "cardiac_treatment_methods": _CARDIAC,
    "sodium_channel_blockers": _SODIUM,
    "beta_blockers": _BETA,
    "potassium_channel_blockers": _POTASSIUM,
    "calcium_channel_blockers": _CALCIUM,
    "other_cardiac_drugs": _OTHER_CARDIAC,
    "poisoning_other_drugs": _POISONING,
    "intracranial_pressure_reduction": _ICP,
    "surgical_treatment": _SURGICAL,
    "mild_hypothermia": _MILD_HYPOTHERMIA,
    "brain_protection_drugs": _BRAIN,
    "antiepileptic_drugs": _ANTIEPILEPTIC,
    "surgery_methods": _SURGERY_METHODS,
    "chest_fixation": _CHEST_FIXATION,
    "airway_control": _AIRWAY,
    "oxygen_support": _OXYGEN,
    "blood_transfusion": _BLOOD_TRANSFUSION,
    "temperature_management": _TEMPERATURE,
}


def _build_option_map(options):
    mapping = {}
    next_code = 1
    for option in options:
        if option == "无":
            mapping[option] = 0
        else:
            mapping[option] = next_code
            next_code += 1
    return mapping


TREATMENT_OPTION_MAPS = {
    field: _build_option_map(options)
    for field, options in TREATMENT_OPTION_SETS.items()
}


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------

def _nonempty(value):
    if value is None:
        return False
    text = str(value).strip()
    return text != "" and text.lower() != "null"


def _as_int(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _unique_join(values, separator="；"):
    seen = []
    for value in values:
        if not _nonempty(value):
            continue
        text = str(value).strip()
        if text not in seen:
            seen.append(text)
    return separator.join(seen) if seen else None


def _latest(rows, key):
    value = None
    for row in rows:
        if _nonempty(row.get(key)):
            value = row.get(key)
    return value


def _group_by_patient(rows):
    grouped = {}
    for row in rows:
        patient_id = row.get("patient_id")
        if patient_id is None:
            continue
        grouped.setdefault(patient_id, []).append(row)
    return grouped


def _parse_options(value):
    if value is None:
        return []
    if isinstance(value, (list, tuple, set)):
        return [str(item).strip() for item in value if _nonempty(item)]
    text = str(value).strip()
    if not text or text.lower() == "null":
        return []
    if text.startswith("["):
        try:
            parsed = json.loads(text)
            if isinstance(parsed, list):
                return [str(item).strip() for item in parsed if _nonempty(item)]
        except (TypeError, ValueError):
            pass
    return [item.strip() for item in text.replace("，", ",").split(",") if item.strip()]


def _treatment_codes(field, rows):
    options = []
    for row in rows:
        for option in _parse_options(row.get(field)):
            if option not in options:
                options.append(option)
    if any(option != "无" for option in options):
        options = [option for option in options if option != "无"]

    mapping = dict(TREATMENT_OPTION_MAPS.get(field, {}))
    codes = []
    for option in options:
        if option not in mapping:
            mapping[option] = (max(mapping.values()) + 1) if mapping else 1
        code = mapping[option]
        if code not in codes:
            codes.append(code)
    return ",".join(str(code) for code in codes), mapping


def _treatment_comment(mapping):
    if not mapping:
        return None
    has_none = 0 in mapping.values()
    parts = []
    for option, code in sorted(mapping.items(), key=lambda item: item[1]):
        if code == 0:
            continue
        parts.append(f"{code}={option}")
    prefix = "数字编码：0=无/未记录；" if has_none else "数字编码：0=未记录；"
    return prefix + "；".join(parts)


# ---------------------------------------------------------------------------
# Summaries
# ---------------------------------------------------------------------------

def _lab_summary(rows, columns, fields):
    values = {}
    categories = []
    test_names = []
    latest_time = None
    for row in rows:
        if _nonempty(row.get("created_at")):
            latest_time = row.get("created_at")
        category = row.get("record_category")
        if _nonempty(category) and str(category) not in categories:
            categories.append(str(category))
        test_name = row.get("lab_test_name")
        if _nonempty(test_name) and str(test_name) not in test_names:
            test_names.append(str(test_name))
        for field in fields:
            key = field["field_name"]
            if key in columns and _nonempty(row.get(key)):
                values[key] = row.get(key)
    return {
        "created_at": latest_time,
        "record_category": _unique_join(categories),
        "lab_test_name": _unique_join(test_names),
        "values": values,
    }


def _latest_fields(rows, columns, skip):
    values = {}
    for row in rows:
        for column in columns:
            if column in skip:
                continue
            if _nonempty(row.get(column)):
                values[column] = row.get(column)
    return values


def _treatment_summary(rows, columns):
    option_values = {}
    scalar_values = {}
    for column in columns:
        if column in TREATMENT_SKIP:
            continue
        if column in TREATMENT_OPTION_SETS:
            codes, mapping = _treatment_codes(column, rows)
            option_values[column] = (codes, mapping)
        elif _nonempty(_latest(rows, column)):
            scalar_values[column] = _latest(rows, column)
    return option_values, scalar_values


# ---------------------------------------------------------------------------
# Main builder
# ---------------------------------------------------------------------------

def build_wide_export(
    patient_rows,
    diagnosis_rows,
    lab_rows,
    lab72_rows,
    assessment_rows,
    treatment_rows,
    followup_rows,
    lab_fields,
    lab_columns,
    lab72_columns,
    assessment_columns,
    treatment_columns,
    followup_columns,
    disease_names,
):
    lab_columns = set(lab_columns or [])
    lab72_columns = set(lab72_columns or [])
    assessment_columns = list(assessment_columns or [])
    treatment_columns = list(treatment_columns or [])
    followup_columns = list(followup_columns or [])

    diagnoses_by_patient = _group_by_patient(diagnosis_rows)
    labs_by_patient = _group_by_patient(lab_rows)
    labs72_by_patient = _group_by_patient(lab72_rows)
    assessments_by_patient = _group_by_patient(assessment_rows)
    treatments_by_patient = _group_by_patient(treatment_rows)
    followups_by_patient = _group_by_patient(followup_rows)

    headers = []
    comments = {}

    def add_header(label, key=None, comment=None):
        header = label
        if header in headers:
            header = f"{label} [{key or len(headers)}]"
        headers.append(header)
        if comment:
            comments[header] = comment
        return header

    # Patient columns.
    patient_columns = [
        ("患者编号", "id", lambda patient: patient.get("id")),
        ("姓名", "name", lambda patient: "[已脱敏]"),
        ("性别", "gender", lambda patient: patient.get("gender")),
        ("年龄", "age", lambda patient: patient.get("age")),
        ("身高(cm)", "height", lambda patient: patient.get("height")),
        ("体重(kg)", "weight", lambda patient: patient.get("weight")),
        ("入院时间", "admission_time", lambda patient: patient.get("admission_time")),
        ("发病时间", "time_of_onset", lambda patient: patient.get("time_of_onset")),
        ("诊断", "diagnosis", lambda patient: patient.get("diagnosis")),
        ("疾病", "last_disease_id", lambda patient: disease_names.get(_as_int(patient.get("last_disease_id")))),
        ("初步诊断", "preliminary_diagnosis", lambda patient: patient.get("preliminary_diagnosis")),
        ("既往史", "medical_history", lambda patient: patient.get("medical_history")),
    ]
    patient_headers = []
    for label, key, getter in patient_columns:
        patient_headers.append((add_header(label, key), getter))

    # Diagnosis columns.
    diagnosis_headers = []
    for label, key in (
        ("诊断疾病", "diagnosis_disease"),
        ("诊断时间", "diagnosis_time"),
        ("诊断_初步诊断", "preliminary_diagnosis"),
        ("诊断_既往史", "medical_history"),
    ):
        diagnosis_headers.append((add_header(label, key), key))

    # Lab columns: 0h then 72h.
    lab_defs = {}
    for prefix, columns in (("0h", lab_columns), ("72h", lab72_columns)):
        base = [("检验时间", "created_at"), ("检验类别", "record_category"), ("检验单名称", "lab_test_name")]
        defs = []
        for label, key in base:
            header = add_header(f"{prefix}_{label}", key)
            defs.append((header, key))
        seen_labels = set()
        for field in lab_fields:
            field_name = field.get("field_name")
            if field_name not in columns:
                continue
            label = field.get("form_label") or field_name
            if label in seen_labels:
                label = f"{label}[{field_name}]"
            seen_labels.add(label)
            unit = field.get("unit")
            header_label = f"{prefix}_{label}" + (f"({unit})" if _nonempty(unit) else "")
            comment = f"字段：{field_name}"
            if _nonempty(unit):
                comment += f"；单位：{unit}"
            if _nonempty(field.get("reference_range")):
                comment += f"；参考范围：{field['reference_range']}"
            header = add_header(header_label, field_name, comment)
            defs.append((header, field_name))
        lab_defs[prefix] = defs

    # Assessment columns.
    assessment_defs = []
    for key in assessment_columns:
        if key in ASSESSMENT_SKIP:
            continue
        label = ASSESSMENT_LABELS.get(key, key)
        header = add_header(f"评估_{label}", key)
        assessment_defs.append((header, key))

    # Treatment columns.
    treatment_defs = []
    for key in treatment_columns:
        if key in TREATMENT_SKIP:
            continue
        label = TREATMENT_LABELS.get(key) or TREATMENT_START_LABELS.get(key) or key
        comment = None
        if key in TREATMENT_OPTION_SETS:
            comment = _treatment_comment(TREATMENT_OPTION_MAPS[key])
        header = add_header(f"治疗_{label}", key, comment)
        treatment_defs.append((header, key))

    # Follow-up columns.
    followup_defs = []
    for key in followup_columns:
        if key in FOLLOWUP_SKIP:
            continue
        label = FOLLOWUP_LABELS.get(key, key)
        header = add_header(f"随访_{label}", key)
        followup_defs.append((header, key))

    rows = []
    for patient in patient_rows:
        patient_id = patient.get("id")
        diagnosis = diagnoses_by_patient.get(patient_id, [])
        lab = _lab_summary(labs_by_patient.get(patient_id, []), lab_columns, lab_fields)
        lab72 = _lab_summary(labs72_by_patient.get(patient_id, []), lab72_columns, lab_fields)
        assessment = _latest_fields(
            assessments_by_patient.get(patient_id, []), assessment_columns, ASSESSMENT_SKIP
        )
        treatment_options, treatment_scalars = _treatment_summary(
            treatments_by_patient.get(patient_id, []), treatment_columns
        )
        followup = _latest_fields(
            followups_by_patient.get(patient_id, []), followup_columns, FOLLOWUP_SKIP
        )

        row = {}
        for header, getter in patient_headers:
            row[header] = getter(patient)
        for header, key in diagnosis_headers:
            if key == "diagnosis_time":
                row[header] = _latest(diagnosis, key)
            else:
                row[header] = _unique_join([item.get(key) for item in diagnosis])
        for prefix, summary in (("0h", lab), ("72h", lab72)):
            for header, key in lab_defs[prefix]:
                row[header] = summary.get(key) if key in ("created_at", "record_category", "lab_test_name") else summary["values"].get(key)
        for header, key in assessment_defs:
            row[header] = assessment.get(key)
        for header, key in treatment_defs:
            if key in treatment_options:
                row[header] = treatment_options[key][0]
            else:
                row[header] = treatment_scalars.get(key)
        for header, key in followup_defs:
            row[header] = followup.get(key)
        rows.append(row)

    return headers, rows, comments
