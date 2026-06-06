const internalMedicineDiseases = ["脓毒症", "重症肺炎", "ARDS", "心肺复苏后", "急性坏死性胰腺炎", "消化道出血", "中毒", "心源性休克/心衰", "脑卒中", "热射病"];

const assessmentCommonFields = [
  ["temperature", "体温", "number", false, "℃"],
  ["respiration", "呼吸", "number", false, "次/分"],
  ["systolic_bp", "收缩压", "number", false, "mmHg"],
  ["diastolic_bp", "舒张压", "number", false, "mmHg"],
  ["heart_rate", "心率", "number", false, "次/分"],
  ["shock_index", "休克指数（自动计算心率/收缩压）", "number", true]
];
const assessmentMultipleTraumaFields = [
  ["temperature", "体温", "number", false, "℃"],
  ["respiration", "呼吸", "number", false, "次/分"],
  ["systolic_bp", "收缩压", "number", false, "mmHg"],
  ["diastolic_bp", "舒张压", "number", false, "mmHg"],
  ["heart_rate", "心率", "number", false, "次/分"],
  ["shock_index", "休克指数", "number"]
];
const assessmentMedicalFields = assessmentCommonFields.concat([
  ["oxygen_partial_pressure", "氧分压", "number", false, "mmHg", "oxygen_dual_unit"],
  ["oxygen_concentration", "氧浓度", "number", false, "%"],
  ["sofa_score", "SOFA评分", "number"],
  ["apache_ii_score", "APACHEⅡ评分", "number"],
  ["barthel_score", "barthel评分", "number"],
  ["mods_score", "MODS评分", "number"],
  ["gcs_score", "GCS评分", "number"]
]);
const assessmentFieldsByDisease = {
  "脓毒症": assessmentMedicalFields,
  "重症肺炎": assessmentMedicalFields,
  "ARDS": assessmentMedicalFields,
  "心肺复苏后": assessmentMedicalFields,
  "急性坏死性胰腺炎": assessmentMedicalFields,
  "消化道出血": assessmentMedicalFields,
  "心源性休克/心衰": assessmentMedicalFields,
  "中毒": assessmentMedicalFields,
  "热射病": assessmentMedicalFields,
  "脑卒中": assessmentMedicalFields.concat([
    ["nihss_score", "NIHSS评分", "number"],
    ["cerebral_hernia", "脑疝", "number"]
  ]),
  "颅脑损伤": assessmentMedicalFields.concat([
    ["nihss_score", "NIHSS评分", "number"],
    ["cerebral_hernia", "脑疝", "number"]
  ]),
  "胸部损伤": assessmentCommonFields.concat([
    ["oxygen_saturation", "氧饱和度", "number"],
    ["ais_score", "AIS评分", "number"],
    ["pain_score", "疼痛评分", "number"]
  ]),
  "多发伤": assessmentMultipleTraumaFields.concat([
    ["oxygen_saturation", "氧饱和度", "number"],
    ["iss_score", "ISS评分", "number"],
    ["gcs_score", "GCS评分", "number"]
  ])
};

const treatmentOptionSets = {
  antibiotics: ["无", "左氧氟沙星", "哌拉西林/他唑巴坦", "头孢曲松", "万古霉素", "美罗培南", "头孢哌酮/舒巴坦", "甲硝唑", "亚胺培南/西司他丁", "阿奇霉素", "环丙沙星", "氟康唑", "阿米卡星", "复方新诺明", "阿莫西林/克拉维酸", "利奈唑胺", "莫西沙星", "头孢他啶", "克拉霉素", "克林霉素"],
  vasoactive_drugs: ["无", "肾上腺素（ug/kg/min）", "多巴酚丁胺（ug/kg/min）", "加压素（ug/kg/min）", "多巴胺（ug/kg/min）", "去氧肾上腺素（ug/kg/min）", "亚甲蓝（mg/kg）", "去甲肾上腺素（ug/kg/min）"],
  vasoactive_drugs_with_levosimendan: ["无", "肾上腺素（ug/kg/min）", "多巴酚丁胺（ug/kg/min）", "加压素（ug/kg/min）", "多巴胺（ug/kg/min）", "去氧肾上腺素（ug/kg/min）", "去甲肾上腺素（ug/kg/min）", "左西孟旦（ug/kg/min）"],
  volume_management: ["晶体液（ml）", "白蛋白（g）", "人工胶体（ml）", "血浆（ml）"],
  respiratory_support: ["无", "高流量吸氧", "无创通气", "有创通气", "支纤镜+肺泡灌洗"],
  respiratory_support_without_lavage: ["无", "高流量吸氧", "无创通气", "有创通气"],
  immunomodulators: ["无", "乌司他丁", "西维来司他纳", "氢化可的松", "IL1抑制剂", "抗IL-6", "TLR4拮抗剂", "干扰素-γ", "粒细胞-巨噬细胞集落刺激因子", "IL7", "阻断PD-1/PDL-1", "免疫球蛋白", "胸腺肽", "胸腺肽α1", "血必净", "黄芪注射液", "清瘟败毒饮", "黄连解毒汤", "犀角地黄汤", "八位败毒散", "仙方活命饮", "独参汤", "补中益气汤", "温肾护脉汤", "左金方"],
  blood_purification: ["无", "CRRT", "IRRT", "血液灌流", "血浆置换", "血液/血浆吸附"],
  traditional_chinese_medicine: ["无", "清胰汤", "大承气汤类", "柴芩承气汤", "活血清胰汤", "大黄附子汤", "复方丹参", "清营汤", "温脾汤", "清胰陷胸汤", "针灸"],
  digestive_secretion_drugs: ["无", "生长抑素", "奥曲肽", "乌司他丁", "加贝酯", "抑肽酶", "奥美拉唑"],
  cardiac_treatment_methods: ["ECMO", "介入手术", "IABP", "电除颤", "临时起搏器", "心肺复苏"],
  sodium_channel_blockers: ["无", "利多卡因", "美西率", "苯妥英钠", "普罗帕酮", "氟卡尼", "莫雷西嗪"],
  beta_blockers: ["无", "美托洛尔", "普萘洛尔", "艾司洛尔", "比索洛尔"],
  potassium_channel_blockers: ["无", "胺碘酮", "索他洛尔", "多菲利特", "伊布利特", "维纳卡兰"],
  calcium_channel_blockers: ["无", "维拉帕米", "地尔硫卓"],
  other_cardiac_drugs: ["无", "腺苷", "地高辛", "硫酸镁"],
  poisoning_other_drugs: ["活性炭", "vit K", "阿托品", "长托林", "解磷定"],
  intracranial_pressure_reduction: ["甘露醇", "浓氯化钠", "白蛋白", "利尿剂"],
  surgical_treatment: ["无", "去骨瓣减压", "转孔引流术", "血肿清除术", "介入手术"],
  mild_hypothermia: ["无", "冰毯冰帽", "经食道降温", "经尿道降温"],
  brain_protection_drugs: ["无", "依达拉奉", "胞磷胆碱", "神经节苷脂", "促红细胞生成素", "镁剂", "乙酰半胱氨酸", "米诺环素", "吡拉西坦", "奥拉西坦", "醒脑静", "复方麝香注射液", "安宫牛黄丸"],
  antiepileptic_drugs: ["无", "丙戊酸钠", "左乙拉西坦"],
  chest_surgery_methods: ["无", "确定性急诊手术", "损伤控制手术（1小时内）", "介入手术", "胸腔闭式引流术"],
  trauma_surgery_methods: ["无", "确定性急诊手术", "损伤控制手术（1小时内）", "介入止血手术"],
  chest_fixation: ["无", "负压固定", "常规固定"],
  airway_control: ["无", "喉罩", "气管插管", "气管切开"],
  oxygen_support: ["吸氧", "高流量吸氧", "无创通气", "呼吸机"],
  blood_transfusion: ["无", "红悬（U)", "血浆(ml)", "血小板（U）", "纤维蛋白原(g)"],
  temperature_management: ["无", "加温加压仪", "温毯机"]
};

const treatmentConfigs = {
  "脓毒症部位": [
    ["antibiotics", "抗生素（默认为0，可以多选，选中为1）", "antibiotics", true],
    ["antibiotics_start_time", "具体开始使用时间", "time"],
    ["vasoactive_drugs", "血管活性药物", "vasoactive_drugs", true],
    ["vasoactive_start_time", "具体开始使用时间", "time"],
    ["vasoactive_concentration", "具体使用浓度", "text"],
    ["volume_management", "血容量管理", "volume_management", false],
    ["volume_total_ml", "总量", "number"],
    ["respiratory_support", "辅助呼吸（1/0）", "respiratory_support", true],
    ["respiratory_start_time", "具体开始使用时间", "time"],
    ["immunomodulators", "免疫调节药物", "immunomodulators", true],
    ["immunomodulator_start_time", "具体开始使用时间", "time"],
    ["blood_purification", "血液净化（可以多选）", "blood_purification", true],
    ["blood_purification_start_time", "具体开始使用时间", "time"]
  ],
  "重症胰腺炎": [
    ["antibiotics", "抗生素（默认为0，可以多选，选中为1）", "antibiotics", true], ["antibiotics_start_time", "具体开始使用时间", "time"],
    ["vasoactive_drugs", "血管活性药物", "vasoactive_drugs", true], ["vasoactive_start_time", "具体开始使用时间", "time"], ["vasoactive_concentration", "具体使用浓度", "text"],
    ["volume_management", "血容量管理", "volume_management", false], ["volume_total_ml", "总量", "number"],
    ["respiratory_support", "辅助呼吸（1/0）", "respiratory_support", true], ["respiratory_start_time", "具体开始使用时间", "time"],
    ["traditional_chinese_medicine", "中医中药", "traditional_chinese_medicine", true], ["traditional_chinese_medicine_start_time", "具体开始使用时间", "time"],
    ["blood_purification", "血液净化（可以多选）", "blood_purification", true], ["blood_purification_start_time", "具体开始使用时间", "time"],
    ["digestive_secretion_drugs", "消化液分泌（可以多选）", "digestive_secretion_drugs", true], ["digestive_secretion_drugs_start_time", "具体开始使用时间", "time"]
  ],
  "心源性休克/心脏骤停": [
    ["respiratory_support", "辅助呼吸（1/0）", "respiratory_support_without_lavage", true], ["respiratory_start_time", "具体开始使用时间", "time"],
    ["vasoactive_drugs", "血管活性药物", "vasoactive_drugs_with_levosimendan", true], ["vasoactive_start_time", "具体开始使用时间", "time"],
    ["cardiac_treatment_methods", "治疗手段", "cardiac_treatment_methods", false], ["cardiac_treatment_start_time", "具体开始使用时间", "time"],
    ["sodium_channel_blockers", "钠通道阻滞药物", "sodium_channel_blockers", true], ["sodium_channel_blocker_start_time", "具体开始使用时间", "time"],
    ["beta_blockers", "β受体阻滞药", "beta_blockers", true], ["beta_blocker_start_time", "具体开始使用时间", "time"],
    ["potassium_channel_blockers", "钾通道阻滞药", "potassium_channel_blockers", true], ["potassium_channel_blocker_start_time", "具体开始使用时间", "time"],
    ["calcium_channel_blockers", "钙通道阻滞药物", "calcium_channel_blockers", true], ["calcium_channel_blocker_start_time", "具体开始使用时间", "time"],
    ["other_cardiac_drugs", "其他药物", "other_cardiac_drugs", true], ["other_cardiac_drugs_start_time", "具体开始使用时间", "time"]
  ],
  "中毒": [
    ["vasoactive_drugs", "血管活性药物", "vasoactive_drugs", true], ["vasoactive_start_time", "具体开始使用时间", "time"],
    ["respiratory_support", "辅助呼吸（1/0）", "respiratory_support", true], ["respiratory_start_time", "具体开始使用时间", "time"],
    ["blood_purification", "血液净化（可以多选）", "blood_purification", true], ["blood_purification_start_time", "具体开始使用时间", "time"],
    ["poisoning_other_drugs", "其他药物（可多选）", "poisoning_other_drugs", false], ["poisoning_other_drugs_start_time", "具体开始使用时间", "time"]
  ],
  "脑损伤": [
    ["intracranial_pressure_reduction", "降颅压", "intracranial_pressure_reduction", false], ["intracranial_pressure_start_time", "开始使用时间", "time"],
    ["vasoactive_drugs", "血管活性药物", "vasoactive_drugs_with_levosimendan", true], ["vasoactive_start_time", "具体开始使用时间", "time"],
    ["surgical_treatment", "手术治疗", "surgical_treatment", true], ["surgical_treatment_start_time", "具体开始使用时间", "time"],
    ["mild_hypothermia", "亚低温治疗", "mild_hypothermia", true], ["mild_hypothermia_start_time", "具体开始使用时间", "time"],
    ["brain_protection_drugs", "脑功能保护药物（可多选）", "brain_protection_drugs", true], ["brain_protection_start_time", "具体开始使用时间", "time"],
    ["antiepileptic_drugs", "抗癫痫", "antiepileptic_drugs", true], ["antiepileptic_start_time", "具体开始使用时间", "time"],
    ["antibiotics", "抗生素（默认为0，可以多选）", "antibiotics", true], ["antibiotics_start_time", "具体开始使用时间", "time"]
  ],
  "胸部创伤": [
    ["respiratory_support", "辅助呼吸（1/0）", "respiratory_support_without_lavage", true], ["respiratory_start_time", "具体开始使用时间", "time"],
    ["vasoactive_drugs", "血管活性药物", "vasoactive_drugs_with_levosimendan", true], ["vasoactive_start_time", "具体开始使用时间", "time"],
    ["surgery_methods", "手术方式", "chest_surgery_methods", true], ["surgery_start_time", "具体开始使用时间", "time"],
    ["chest_fixation", "胸部固定方式（单选）", "chest_fixation", true, "radio"], ["chest_fixation_start_time", "具体开始使用时间", "time"],
    ["volume_management", "血容量管理", "volume_management", false], ["volume_total_ml", "总量", "number"]
  ],
  "多发伤": [
    ["respiratory_support", "辅助呼吸（1/0）", "respiratory_support_without_lavage", true], ["respiratory_start_time", "具体开始使用时间", "time"],
    ["vasoactive_drugs", "血管活性药物", "vasoactive_drugs_with_levosimendan", true], ["vasoactive_start_time", "具体开始使用时间", "time"],
    ["surgery_methods", "手术方式", "trauma_surgery_methods", true], ["surgery_start_time", "具体开始使用时间", "time"],
    ["chest_fixation", "胸部固定方式（单选）", "chest_fixation", true, "radio"], ["chest_fixation_start_time", "具体开始使用时间", "time"],
    ["volume_management", "血容量管理", "volume_management", false], ["volume_total_ml", "总量", "number"],
    ["airway_control", "气道控制", "airway_control", true], ["airway_control_start_time", "具体开始使用时间", "time"],
    ["oxygen_support", "吸氧支持", "oxygen_support", false], ["oxygen_support_start_time", "具体开始使用时间", "time"],
    ["blood_transfusion", "输血", "blood_transfusion", true], ["blood_transfusion_start_time", "具体开始使用时间", "time"], ["blood_transfusion_total", "总量", "text"],
    ["temperature_management", "体温管理", "temperature_management", true], ["temperature_management_start_time", "具体开始使用时间", "time"]
  ]
};

const treatmentDiseaseAliases = {
  "脓毒症": "脓毒症部位",
  "重症肺炎": "脓毒症部位",
  "ARDS": "脓毒症部位",
  "心肺复苏后": "心源性休克/心脏骤停",
  "急性坏死性胰腺炎": "重症胰腺炎",
  "心源性休克/心衰": "心源性休克/心脏骤停",
  "脑卒中": "脑损伤",
  "颅脑损伤": "脑损伤",
  "热射病": "脑损伤",
  "胸部损伤": "胸部创伤"
};

const followupFieldsInternal = [
  ["prognosis", "预后（死亡1/生存0）", "number"],
  ["death_days", "死亡天数（距离入院时天数）", "number"],
  ["barthel_28d", "barthel评分（28天时）", "number"],
  ["ventilator_days", "28天内呼吸机天数", "number"],
  ["tracheotomy", "28天内气管切开（是1/否0）", "number"],
  ["blood_purification", "28天内血液净化（1/0）", "number"],
  ["total_cost", "总费用", "number", "元"],
  ["mods", "MODS（是否发生1/0）", "number"]
];
const followupFieldsNonInternal = [
  ["prognosis", "预后（死亡1/生存0）", "number"],
  ["death_days", "死亡天数（距离入院时天数）", "number"],
  ["barthel_28d", "barthel评分（28天时）", "number"],
  ["ventilator_days", "28天内呼吸机天数", "number"],
  ["tracheotomy", "28天内气管切开（1/0）", "number"],
  ["blood_purification", "28天内血液净化（1/0）", "number"],
  ["total_cost", "总费用", "number", "元"],
  ["sepsis", "脓毒症（1/0）", "number"],
  ["pulmonary_infection", "肺部感染（1/0）", "number"],
  ["icu_days", "ICU天数", "number"],
  ["mods", "MODS（是否发生1/0）", "number"]
];

function renderFollowupFields(disease) {
  disease = normalizeCareDisease(disease);
  const isInternal = internalMedicineDiseases.indexOf(disease) > -1;
  const fields = isInternal ? followupFieldsInternal : followupFieldsNonInternal;
  const html = fields.map(function (field) {
    const hint = field[0] === "death_days" ? '<div class="hint">预后为1时填写距离入院时天数；预后为0时系统默认28天。</div>' : '';
    const input = '<input class="followup-input" data-field="' + field[0] + '" type="' + field[2] + '" placeholder="' + field[1] + '">';
    const control = field[3] ? '<div class="input-with-unit">' + input + '<span>' + field[3] + '</span></div>' : input;
    return '<div class="form-field"><label>' + field[1] + ' *</label>' + control + hint + '</div>';
  }).join("");
  $("#followDynamicFields").html(html);
  updateFollowupPrognosisState();
  setMsg("followMsg", "以下信息均为必填。提交前会提示尚未完成的前置步骤；提交后不能修改。");
}

function renderTreatmentChoiceGroup(field, title, options, defaultNone, inputType, detailFields) {
  inputType = inputType || "checkbox";
  const html = options.map(function (option) {
    const checked = defaultNone && option === "无" ? " checked" : "";
    const extras = option === "无" ? "" : (detailFields || []).map(function (detail) {
      const detailField = detail[0];
      const detailLabel = detail[1];
      const detailType = detail[2] === "time" ? "datetime-local" : detail[2];
      return '<div class="treatment-extra-field"><input class="treatment-option-extra" data-field="' + field + '" data-option="' + attrValue(option) + '" data-detail-field="' + detailField + '" type="' + detailType + '" placeholder="' + detailLabel + '"><span class="treatment-extra-placeholder">' + detailLabel + '</span></div>';
    }).join("");
    return '<div class="treatment-option-row"><label><input type="' + inputType + '" class="treatment-choice" name="treatment_' + field + '" data-field="' + field + '" value="' + attrValue(option) + '"' + checked + '>' + option + '</label><div class="treatment-option-extras">' + extras + '</div></div>';
  }).join("");
  return '<div class="treatment-section"><button type="button" class="treatment-section-toggle" data-toggle-treatment-section><span>' + title + '</span><span class="treatment-toggle-indicator">展开</span></button><div class="radio-grid hidden" data-treatment-section-body>' + html + '</div></div>';
}

function renderTreatmentTimeInput(field, label) {
  return '<div class="form-field"><label>' + label + '</label><input class="treatment-input" data-field="' + field + '" type="datetime-local" placeholder="' + label + '"></div>';
}

function renderTreatmentTextInput(field, label, type) {
  return '<div class="form-field"><label>' + label + '</label><input class="treatment-input" data-field="' + field + '" type="' + (type || 'text') + '" placeholder="' + label + '"></div>';
}

function normalizeTreatmentDisease(disease) {
  disease = String(disease || "").trim();
  if (disease.indexOf("脓毒症") > -1) return "脓毒症部位";
  return treatmentDiseaseAliases[disease] || disease;
}

function normalizeCareDisease(disease) {
  disease = String(disease || "").trim();
  if (disease.indexOf("脓毒症") > -1) return "脓毒症";
  const reverseAliases = {
    "脓毒症部位": "脓毒症",
    "重症胰腺炎": "急性坏死性胰腺炎",
    "心源性休克/心脏骤停": "心源性休克/心衰",
    "脑损伤": "颅脑损伤",
    "胸部创伤": "胸部损伤"
  };
  return reverseAliases[disease] || disease;
}

function getDiagnosisOptionDisease(input) {
  if (!input) return "";
  const dataDisease = input.getAttribute("data-disease") || "";
  if (dataDisease) return dataDisease;
  const label = input.closest ? input.closest(".diagnosis-record-option") : null;
  const strong = label ? label.querySelector("strong") : null;
  return strong ? strong.textContent.trim() : "";
}

function renderTreatmentFields(disease) {
  const normalizedDisease = normalizeTreatmentDisease(disease);
  const config = treatmentConfigs[normalizedDisease] || [];
  if (!config.length) {
    $("#treatDynamicFields").html('<div class="detail-item">该疾病暂无治疗表单配置</div>');
    setMsg("treatMsg", "该疾病暂无治疗表单配置", true);
    return;
  }
  let index = 0;
  const blocks = [];
  while (index < config.length) {
    const item = config[index];
    const field = item[0];
    const label = item[1];
    const kind = item[2];
    if (treatmentOptionSets[kind]) {
      const detailFields = [];
      let nextIndex = index + 1;
      while (nextIndex < config.length && !treatmentOptionSets[config[nextIndex][2]]) {
        detailFields.push(config[nextIndex]);
        nextIndex += 1;
      }
      blocks.push(renderTreatmentChoiceGroup(field, label, treatmentOptionSets[kind], !!item[3], item[4], detailFields));
      index = nextIndex;
      continue;
    }
    if (kind === "time") blocks.push('<div class="grid two">' + renderTreatmentTimeInput(field, label) + '</div>');
    else blocks.push('<div class="grid two">' + renderTreatmentTextInput(field, label, kind) + '</div>');
    index += 1;
  }
  const html = blocks.join("");
  $("#treatDynamicFields").html(html);
  const firstSection = document.querySelector("#treatDynamicFields [data-treatment-section-body]");
  const firstToggle = document.querySelector("#treatDynamicFields [data-toggle-treatment-section]");
  if (firstSection && firstToggle) {
    firstSection.classList.remove("hidden");
    const indicator = firstToggle.querySelector(".treatment-toggle-indicator");
    if (indicator) indicator.textContent = "收起";
  }
  setMsg("treatMsg", "当前选择为" + normalizedDisease + "治疗表单");
}

function normalizeTreatmentChoice(changedInput) {
  const field = changedInput.getAttribute("data-field");
  const choices = Array.from(document.querySelectorAll('.treatment-choice[data-field="' + field + '"]'));
  const noneChoice = choices.find(function (input) { return input.value === "无"; });
  if (!noneChoice) return;
  if (changedInput.value === "无" && changedInput.checked) {
    choices.forEach(function (input) { input.checked = input.value === "无"; });
    return;
  }
  const selectedOthers = choices.filter(function (input) { return input.value !== "无" && input.checked; });
  noneChoice.checked = selectedOthers.length === 0;
}

function renderAssessmentFields(disease) {
  disease = normalizeCareDisease(disease);
  const fields = assessmentFieldsByDisease[disease] || [];
  const html = fields.map(function (field) {
    const readonly = field[3] ? ' readonly' : '';
    if (field[5] === "oxygen_dual_unit") {
      return '<div class="form-field"><label>' + field[1] + ' *</label><div class="input-with-unit"><input class="assessment-input assessment-mmhg-input" data-field="oxygen_partial_pressure" type="number" placeholder="氧分压"><span>mmHg</span></div><div class="input-with-unit"><input class="assessment-kpa-input" type="number" placeholder="氧分压"><span>kPa</span></div></div>';
    }
    const input = '<input class="assessment-input" data-field="' + field[0] + '" type="' + field[2] + '" placeholder="' + field[1] + '"' + readonly + '>';
    const control = field[4] ? '<div class="input-with-unit">' + input + '<span>' + field[4] + '</span></div>' : input;
    return '<div class="form-field"><label>' + field[1] + ' *</label>' + control + '</div>';
  }).join("");
  $("#assessmentDynamicFields").html(html || '<div class="detail-item">该疾病暂无评估字段配置</div>');
  setMsg("assessmentMsg", fields.length ? "当前选择为" + disease + "评估表单" : "该疾病暂无评估字段配置", !fields.length);
}

function updateAssessmentShockIndex() {
  const shockInput = document.querySelector("#assessmentDynamicFields .assessment-input[data-field=shock_index]");
  if (!shockInput || !shockInput.hasAttribute("readonly")) return;
  const systolic = Number($("#assessmentDynamicFields .assessment-input[data-field=systolic_bp]").val());
  const heartRate = Number($("#assessmentDynamicFields .assessment-input[data-field=heart_rate]").val());
  const shockIndex = systolic > 0 && heartRate > 0 ? (heartRate / systolic).toFixed(2) : "";
  shockInput.value = shockIndex;
}

function updateAssessmentOxygenFromKpa() {
  const kpa = Number($("#assessmentDynamicFields .assessment-kpa-input").val());
  if (kpa > 0) {
    $("#assessmentDynamicFields .assessment-input[data-field=oxygen_partial_pressure]").val((kpa * 7.5).toFixed(1));
  } else {
    $("#assessmentDynamicFields .assessment-input[data-field=oxygen_partial_pressure]").val("");
  }
}

function updateAssessmentOxygenFromMmhg() {
  const mmhg = Number($("#assessmentDynamicFields .assessment-input[data-field=oxygen_partial_pressure]").val());
  if (mmhg > 0) {
    $("#assessmentDynamicFields .assessment-kpa-input").val((mmhg / 7.5).toFixed(1));
  } else {
    $("#assessmentDynamicFields .assessment-kpa-input").val("");
  }
}

function updateFollowupPrognosisState() {
  const prognosis = $("#followDynamicFields .followup-input[data-field=prognosis]").val();
  const deathDays = $("#followDynamicFields .followup-input[data-field=death_days]");
  if (!deathDays.length) return;
  $("#followDynamicFields .followup-input").not("[data-field=prognosis], [data-field=death_days]").prop("disabled", prognosis === "1");
  if (prognosis === "1") {
    deathDays.prop("disabled", false).val(deathDays.val() === "28" ? "" : deathDays.val());
  } else if (prognosis === "0") {
    deathDays.val("28").prop("disabled", true);
  } else {
    deathDays.val("").prop("disabled", true);
  }
}
