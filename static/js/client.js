let selectedDiseaseId = null;
let uploadedPhotoPath = null;
let selectedFile = null;
let canReviewMembers = false;
let currentPatientId = null;

// 检测是否为移动设备
function isMobile() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// 初始化拍照面板按钮
function initPhotoButtons() {
  if (isMobile()) {
    $("#photoPanelTitle").text("拍照上传");
    $("#takePhotoBtn").removeClass("hidden");
    $("#uploadBtn").removeClass("hidden");
    $("#photoActions").removeClass("single-btn");
  } else {
    $("#photoPanelTitle").text("上传检验单");
    $("#takePhotoBtn").addClass("hidden");
    $("#uploadBtn").removeClass("hidden");
    $("#photoActions").addClass("single-btn");
  }
}

var authPanels = ["loginPanel", "registerPanel", "resetPanel"];

function showPanel(id) {
  $(".panel").addClass("hidden");
  $("#" + id).removeClass("hidden");
  localStorage.setItem("clientPanel", id);
  $("#clientHero").toggleClass("hidden", id === "labReportPanel");
  // 登录后的页面显示底部导航
  if (authPanels.indexOf(id) === -1) {
    $("#bottomNav").removeClass("hidden");
    $(".nav-item").removeClass("active");
    $(".nav-item[data-nav='" + id + "']").addClass("active");
    if (id === "recordPanel" || id === "photoPanel") {
      $(".nav-item[data-nav='diseasePanel']").addClass("active");
    }
    if (id === "patientDetailPanel" || id === "labReportPanel") {
      $(".nav-item[data-nav='caseListPanel']").addClass("active");
    }
  } else {
    $("#bottomNav").addClass("hidden");
  }

  if (id === "memberReviewPanel") {
    loadMemberReviews();
  }
  if (id === "caseListPanel") {
    loadCaseList();
  }
}

function setMsg(id, text, error) {
  $("#" + id).text(text).toggleClass("error", !!error);
}

function formDataFrom(panel) {
  const data = {};
  $(panel).find("input").each(function () { data[this.name] = $(this).val(); });
  return data;
}

function loadDiseases() {
  $.getJSON("/api/diseases", function (res) {
    if (!res.success) return;
    const payload = res.data || {};
    const diseases = payload.diseases || [];
    const total = Number(payload.total_patients || 0);
    $("#diseaseTotalCount").text(`总共录入${total}人`);
    const html = diseases.map(function (d) {
      const count = Number(d.patient_count || 0);
      return `<button class="disease-item" data-id="${d.id}"><span class="disease-name">${d.name}</span><span class="disease-count">已录入${count}人</span></button>`;
    }).join("");
    $("#diseaseList").html(html);
  });
}

function loadCaseList() {
  setMsg("caseListMsg", "", false);
  $.getJSON("/api/cases")
    .done(function (res) {
      if (!res.success) {
        setMsg("caseListMsg", "病例加载失败", true);
        return;
      }
      if (!res.data.length) {
        $("#caseList").html('<div class="detail-item">暂无病例</div>');
        return;
      }
      const html = res.data.map(function (item) {
        return '<div class="case-item">' +
          '<div class="case-head"><strong>' + (item.name || '-') + '</strong><button class="btn-sm view-case-btn" data-id="' + item.id + '">查看</button></div>' +
          '<div class="case-meta">' +
          '性别：' + (item.gender || '-') + ' ｜ 年龄：' + (item.age || '-') + ' ｜ 病历号：' + (item.id_number || '-') +
          '</div>' +
          '<div class="case-meta">已录入 ' + Number(item.record_count || 0) + ' 条检验记录</div>' +
          '</div>';
      }).join('');
      $("#caseList").html(html);
    })
    .fail(function (xhr) {
      setMsg("caseListMsg", xhr.responseJSON?.message || "病例加载失败", true);
    });
}

function resetNewCaseForm() {
  ["newCaseName", "newCaseGender", "newCaseAge", "newCasePhone", "newCaseIdNumber"].forEach(function (id) {
    $("#" + id).val("");
  });
  setMsg("newCaseMsg", "", false);
}

function renderDiagnosisRecordLists(records) {
  const diagnosisHtml = (records || []).map(function (record) {
    const detail = record.preliminary_diagnosis ? '<div class="case-meta">' + record.preliminary_diagnosis + '</div>' : '';
    return '<div class="detail-item">' +
      '<strong>' + (record.diagnosis_disease || '-') + '</strong>' +
      '<div class="case-meta">诊断时间：' + (record.diagnosis_time || '-') + '</div>' +
      detail +
      '</div>';
  }).join('') || '<div class="detail-item">暂无诊断记录</div>';
  $("#diagnosisRecordListDiagnosis").html(diagnosisHtml);

  ["Treat", "Follow", "Assessment"].forEach(function (suffix) {
    const radioHtml = (records || []).map(function (record) {
      const detail = record.preliminary_diagnosis ? '<div class="case-meta">' + record.preliminary_diagnosis + '</div>' : '';
      return '<label class="diagnosis-record-option">' +
        '<input type="radio" name="selectedDiagnosisRecord' + suffix + '" value="' + record.id + '" data-disease="' + attrValue(record.diagnosis_disease || '') + '">' +
        '<span><strong>' + (record.diagnosis_disease || '-') + '</strong>' +
        '<div class="case-meta">诊断时间：' + (record.diagnosis_time || '-') + '</div>' + detail + '</span>' +
        '</label>';
    }).join('') || '<div class="detail-item">暂无诊断记录</div>';
    $("#diagnosisRecordList" + suffix).html(radioHtml);
  });
}

function attrValue(value) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

const diagnosisFieldNames = ["diagnosis", "diagnosis_disease", "medical_history", "preliminary_diagnosis"];
const diagnosisSubcategoryOptions = {
  "脓毒症部位": ["肺部", "腹部", "心血管/血液", "泌尿系", "脑部", "软组织", "不详"],
  "重症胰腺炎": [],
  "心源性休克/心脏骤停": ["1心肌梗塞", "2心衰", "3.心肌炎", "4.急性瓣膜病变", "5电传导病变"],
  "中毒": ["有机磷中毒", "CO中毒", "蘑菇中毒", "杀虫剂/除草剂中毒", "药物中毒"],
  "脑损伤": ["大脑挫裂伤", "缺氧缺血性脑病", "弥漫性轴索损伤", "基底节出血", "小脑出血", "蛛网膜下腔出血", "脑梗塞", "脑干出血", "热射病"],
  "多发伤": ["颅脑损伤", "胸部创伤", "腹部创伤", "四肢损伤", "脊柱损伤"],
  "胸部创伤": ["连枷胸", "开放性气胸", "三根以上肋骨骨折", "开放性血气胸"]
};
const internalMedicineDiseases = ["脓毒症部位", "心源性休克/心脏骤停", "中毒", "脑损伤"];
const assessmentCommonFields = [
  ["temperature", "体温", "number"],
  ["respiration", "呼吸", "number"],
  ["systolic_bp", "收缩压", "number"],
  ["diastolic_bp", "舒张压", "number"],
  ["heart_rate", "心率", "number"],
  ["shock_index", "休克指数（自动计算心率/收缩压）", "number", true]
];
const assessmentMultipleTraumaFields = [
  ["temperature", "体温", "number"],
  ["respiration", "呼吸", "number"],
  ["systolic_bp", "收缩压", "number"],
  ["diastolic_bp", "舒张压", "number"],
  ["heart_rate", "心率", "number"],
  ["shock_index", "休克指数", "number"]
];
const assessmentMedicalFields = assessmentCommonFields.concat([
  ["oxygen_partial_pressure", "氧分压", "number"],
  ["oxygen_concentration", "氧浓度", "number"],
  ["sofa_score", "SOFA评分", "number"],
  ["apache_ii_score", "APACHEⅡ评分", "number"],
  ["barthel_score", "barthel评分", "number"],
  ["mods_score", "MODS评分", "number"],
  ["gcs_score", "GCS评分", "number"]
]);
const assessmentFieldsByDisease = {
  "脓毒症部位": assessmentMedicalFields,
  "重症胰腺炎": assessmentMedicalFields,
  "心源性休克/心脏骤停": assessmentMedicalFields,
  "中毒": assessmentMedicalFields,
  "脑损伤": assessmentMedicalFields.concat([
    ["nihss_score", "NIHSS评分", "number"],
    ["cerebral_hernia", "脑疝", "number"]
  ]),
  "胸部创伤": assessmentCommonFields.concat([
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
  vasoactive_drugs: ["无", "肾上腺素", "多巴酚丁胺", "加压素", "多巴胺", "去氧肾上腺素", "亚甲蓝", "去甲肾上腺素"],
  vasoactive_drugs_with_levosimendan: ["无", "肾上腺素", "多巴酚丁胺", "加压素", "多巴胺", "去氧肾上腺素", "去甲肾上腺素", "左西孟旦"],
  volume_management: ["晶体液", "白蛋白", "人工胶体", "血浆"],
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
    ["vasoactive_drugs", "血管活性物", "vasoactive_drugs", true],
    ["vasoactive_start_time", "具体开始使用时间", "time"],
    ["vasoactive_concentration", "具体使用浓度", "text"],
    ["volume_management", "血容量管理", "volume_management", false],
    ["volume_total_ml", "总量（ml）", "number"],
    ["respiratory_support", "辅助呼吸（1/0）", "respiratory_support", true],
    ["respiratory_start_time", "具体开始使用时间", "time"],
    ["immunomodulators", "免疫调节药物", "immunomodulators", true],
    ["immunomodulator_start_time", "具体开始使用时间", "time"],
    ["blood_purification", "血液净化（可以多选）", "blood_purification", true],
    ["blood_purification_start_time", "具体开始使用时间", "time"]
  ],
  "重症胰腺炎": [
    ["antibiotics", "抗生素（默认为0，可以多选，选中为1）", "antibiotics", true], ["antibiotics_start_time", "具体开始使用时间", "time"],
    ["vasoactive_drugs", "血管活性物", "vasoactive_drugs", true], ["vasoactive_start_time", "具体开始使用时间", "time"], ["vasoactive_concentration", "具体使用浓度", "text"],
    ["volume_management", "血容量管理", "volume_management", false], ["volume_total_ml", "总量（ml）", "number"],
    ["respiratory_support", "辅助呼吸（1/0）", "respiratory_support", true], ["respiratory_start_time", "具体开始使用时间", "time"],
    ["traditional_chinese_medicine", "中医中药", "traditional_chinese_medicine", true], ["traditional_chinese_medicine_start_time", "具体开始使用时间", "time"],
    ["blood_purification", "血液净化（可以多选）", "blood_purification", true], ["blood_purification_start_time", "具体开始使用时间", "time"],
    ["digestive_secretion_drugs", "消化液分泌（可以多选）", "digestive_secretion_drugs", true]
  ],
  "心源性休克/心脏骤停": [
    ["respiratory_support", "辅助呼吸（1/0）", "respiratory_support_without_lavage", true], ["respiratory_start_time", "具体开始使用时间", "time"],
    ["vasoactive_drugs", "血管活性物", "vasoactive_drugs_with_levosimendan", true], ["vasoactive_start_time", "具体开始使用时间", "time"],
    ["cardiac_treatment_methods", "治疗手段", "cardiac_treatment_methods", false], ["cardiac_treatment_start_time", "具体开始使用时间", "time"],
    ["sodium_channel_blockers", "钠通道阻滞药物", "sodium_channel_blockers", true], ["sodium_channel_blocker_start_time", "具体开始使用时间", "time"],
    ["beta_blockers", "β受体阻滞药", "beta_blockers", true], ["beta_blocker_start_time", "具体开始使用时间", "time"],
    ["potassium_channel_blockers", "钾通道阻滞药", "potassium_channel_blockers", true], ["potassium_channel_blocker_start_time", "具体开始使用时间", "time"],
    ["calcium_channel_blockers", "钙通道阻滞药物", "calcium_channel_blockers", true], ["calcium_channel_blocker_start_time", "具体开始使用时间", "time"],
    ["other_cardiac_drugs", "其他药物", "other_cardiac_drugs", true]
  ],
  "中毒": [
    ["vasoactive_drugs", "血管活性物", "vasoactive_drugs", true], ["vasoactive_start_time", "具体开始使用时间", "time"],
    ["respiratory_support", "辅助呼吸（1/0）", "respiratory_support", true], ["respiratory_start_time", "具体开始使用时间", "time"],
    ["blood_purification", "血液净化（可以多选）", "blood_purification", true], ["blood_purification_start_time", "具体开始使用时间", "time"],
    ["poisoning_other_drugs", "其他药物（可多选）", "poisoning_other_drugs", false]
  ],
  "脑损伤": [
    ["intracranial_pressure_reduction", "降颅压", "intracranial_pressure_reduction", false], ["intracranial_pressure_start_time", "开始使用时间", "time"],
    ["vasoactive_drugs", "血管活性物", "vasoactive_drugs_with_levosimendan", true], ["vasoactive_start_time", "具体开始使用时间", "time"],
    ["surgical_treatment", "手术治疗", "surgical_treatment", true], ["surgical_treatment_start_time", "具体开始使用时间", "time"],
    ["mild_hypothermia", "亚低温治疗", "mild_hypothermia", true], ["mild_hypothermia_start_time", "具体开始使用时间", "time"],
    ["brain_protection_drugs", "脑功能保护药物（可多选）", "brain_protection_drugs", true], ["brain_protection_start_time", "具体开始使用时间", "time"],
    ["antiepileptic_drugs", "抗癫痫", "antiepileptic_drugs", true], ["antiepileptic_start_time", "具体开始使用时间", "time"],
    ["antibiotics", "抗生素（默认为0，可以多选）", "antibiotics", true], ["antibiotics_start_time", "具体开始使用时间", "time"]
  ],
  "胸部创伤": [
    ["respiratory_support", "辅助呼吸（1/0）", "respiratory_support_without_lavage", true], ["respiratory_start_time", "具体开始使用时间", "time"],
    ["vasoactive_drugs", "血管活性物", "vasoactive_drugs_with_levosimendan", true], ["vasoactive_start_time", "具体开始使用时间", "time"],
    ["surgery_methods", "手术方式", "chest_surgery_methods", true], ["surgery_start_time", "具体开始使用时间", "time"],
    ["chest_fixation", "胸部固定方式（单选）", "chest_fixation", true, "radio"], ["chest_fixation_start_time", "具体开始使用时间", "time"],
    ["volume_management", "血容量管理", "volume_management", false], ["volume_total_ml", "总量（ml）", "number"]
  ],
  "多发伤": [
    ["respiratory_support", "辅助呼吸（1/0）", "respiratory_support_without_lavage", true], ["respiratory_start_time", "具体开始使用时间", "time"],
    ["vasoactive_drugs", "血管活性物", "vasoactive_drugs_with_levosimendan", true], ["vasoactive_start_time", "具体开始使用时间", "time"],
    ["surgery_methods", "手术方式", "trauma_surgery_methods", true], ["surgery_start_time", "具体开始使用时间", "time"],
    ["chest_fixation", "胸部固定方式（单选）", "chest_fixation", true, "radio"], ["chest_fixation_start_time", "具体开始使用时间", "time"],
    ["volume_management", "血容量管理", "volume_management", false], ["volume_total_ml", "总量（ml）", "number"],
    ["airway_control", "气道控制", "airway_control", true], ["airway_control_start_time", "具体开始使用时间", "time"],
    ["oxygen_support", "吸氧支持", "oxygen_support", false], ["oxygen_support_start_time", "具体开始使用时间", "time"],
    ["blood_transfusion", "输血", "blood_transfusion", true], ["blood_transfusion_start_time", "具体开始使用时间", "time"], ["blood_transfusion_total", "总量", "text"],
    ["temperature_management", "体温管理", "temperature_management", true]
  ]
};
const followupFieldsInternal = [
  ["prognosis", "预后（死亡1/生存0）", "number"],
  ["death_days", "死亡天数", "number"],
  ["barthel_28d", "barthel评分（28天时）", "number"],
  ["ventilator_days", "呼吸机治疗天数", "number"],
  ["tracheotomy", "气管切开(是1/否0）", "number"],
  ["blood_purification", "血液净化治疗(1/0)", "number"],
  ["total_cost", "总费用", "number"],
  ["mods", "MODS", "number"]
];
const followupFieldsNonInternal = [
  ["prognosis", "预后（死亡1/生存0）", "number"],
  ["death_days", "死亡天数", "number"],
  ["barthel_28d", "barthel评分（28天时）", "number"],
  ["ventilator_days", "呼吸机治疗天数", "number"],
  ["tracheotomy", "气管切开（1/0）", "number"],
  ["blood_purification", "血液净化治疗(1/0)", "number"],
  ["total_cost", "总费用", "number"],
  ["sepsis", "脓毒症（1/0）", "number"],
  ["pulmonary_infection", "肺部感染（1/0）", "number"],
  ["icu_days", "ICU天数", "number"],
  ["mods", "MODS（1/0）", "number"]
];

function renderFollowupFields(disease) {
  const isInternal = internalMedicineDiseases.indexOf(disease) > -1;
  const fields = isInternal ? followupFieldsInternal : followupFieldsNonInternal;
  const html = fields.map(function (field) {
    const hint = !isInternal && field[0] === "death_days" ? '<div class="hint">只有死亡患者可以填写，生存患者默认28天。</div>' : '';
    return '<div class="form-field"><label>' + field[1] + '</label><input class="followup-input" data-field="' + field[0] + '" type="' + field[2] + '" placeholder="' + field[1] + '">' + hint + '</div>';
  }).join("");
  $("#followDynamicFields").html(html);
  setMsg("followMsg", isInternal ? "当前选择为内科疾病随访表单" : "当前选择为非内科疾病随访表单");
}

function renderTreatmentChoiceGroup(field, title, options, defaultNone, inputType) {
  inputType = inputType || "checkbox";
  const html = options.map(function (option) {
    const checked = defaultNone && option === "无" ? " checked" : "";
    return '<label><input type="' + inputType + '" class="treatment-choice" name="treatment_' + field + '" data-field="' + field + '" value="' + attrValue(option) + '"' + checked + '>' + option + '</label>';
  }).join("");
  return '<div class="treatment-section"><div class="subhead">' + title + '</div><div class="radio-grid">' + html + '</div></div>';
}

function renderTreatmentTimeInput(field, label) {
  return '<div class="form-field"><label>' + label + '</label><input class="treatment-input" data-field="' + field + '" type="datetime-local" placeholder="' + label + '"></div>';
}

function renderTreatmentTextInput(field, label, type) {
  return '<div class="form-field"><label>' + label + '</label><input class="treatment-input" data-field="' + field + '" type="' + (type || 'text') + '" placeholder="' + label + '"></div>';
}

function renderTreatmentFields(disease) {
  const config = treatmentConfigs[disease] || [];
  if (!config.length) {
    $("#treatDynamicFields").html('<div class="detail-item">该疾病暂无治疗表单配置</div>');
    setMsg("treatMsg", "该疾病暂无治疗表单配置", true);
    return;
  }
  const html = config.map(function (item) {
    const field = item[0];
    const label = item[1];
    const kind = item[2];
    if (treatmentOptionSets[kind]) return renderTreatmentChoiceGroup(field, label, treatmentOptionSets[kind], !!item[3], item[4]);
    if (kind === "time") return '<div class="grid two">' + renderTreatmentTimeInput(field, label) + '</div>';
    return '<div class="grid two">' + renderTreatmentTextInput(field, label, kind) + '</div>';
  }).join("");
  $("#treatDynamicFields").html(html);
  setMsg("treatMsg", "当前选择为" + disease + "治疗表单");
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
  const fields = assessmentFieldsByDisease[disease] || [];
  const html = fields.map(function (field) {
    const readonly = field[3] ? ' readonly' : '';
    return '<div class="form-field"><label>' + field[1] + '</label><input class="assessment-input" data-field="' + field[0] + '" type="' + field[2] + '" placeholder="' + field[1] + '"' + readonly + '></div>';
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

function showTreatSubTab(tab) {
  tab = tab || "list";
  document.querySelectorAll("#detailTreatTab .inner-tab").forEach(function (button) {
    button.classList.toggle("active", button.getAttribute("data-treat-tab") === tab);
  });
  $("#treatListPanel").toggleClass("hidden", tab !== "list");
  $("#treatAddPanel").toggleClass("hidden", tab !== "add");
  if (tab === "add") {
    const selectedDiagnosis = document.querySelector("[name=selectedDiagnosisRecordTreat]:checked");
    if (selectedDiagnosis) renderTreatmentFields(selectedDiagnosis.getAttribute("data-disease") || "");
  }
}

function showFollowSubTab(tab) {
  tab = tab || "list";
  document.querySelectorAll("#detailFollowTab .inner-tab").forEach(function (button) {
    button.classList.toggle("active", button.getAttribute("data-follow-tab") === tab);
  });
  $("#followListPanel").toggleClass("hidden", tab !== "list");
  $("#followAddPanel").toggleClass("hidden", tab !== "add");
  if (tab === "add") {
    const selectedDiagnosis = document.querySelector("[name=selectedDiagnosisRecordFollow]:checked");
    if (selectedDiagnosis) renderFollowupFields(selectedDiagnosis.getAttribute("data-disease") || "");
  }
}

function showAssessmentSubTab(tab) {
  tab = tab || "list";
  document.querySelectorAll("#detailAssessmentTab .inner-tab").forEach(function (button) {
    button.classList.toggle("active", button.getAttribute("data-assessment-tab") === tab);
  });
  $("#assessmentListPanel").toggleClass("hidden", tab !== "list");
  $("#assessmentAddPanel").toggleClass("hidden", tab !== "add");
  if (tab === "add") {
    const selectedDiagnosis = document.querySelector("[name=selectedDiagnosisRecordAssessment]:checked");
    if (selectedDiagnosis) renderAssessmentFields(selectedDiagnosis.getAttribute("data-disease") || "");
  }
}

function fillDiagnosisForm(patient) {
  resetDiagnosisDiseaseSelection();

  const history = String(patient.medical_history || "无").split(",").map(function (item) { return item.trim(); }).filter(Boolean);
  const selectedHistory = history.length ? history : ["无"];
  document.querySelectorAll(".medical-history-checkbox").forEach(function (input) {
    input.checked = selectedHistory.indexOf(input.value) > -1;
  });
  normalizeMedicalHistorySelection();
  setMsg("diagnosisMsg", "", false);
}

function getDiagnosisSubcategoryInputType(disease) {
  return disease === "多发伤" ? "checkbox" : "radio";
}

function applyDiagnosisDiseaseSelection(disease, savedSubcategories) {
  const selected = disease && diagnosisSubcategoryOptions[disease];
  document.querySelectorAll(".diagnosis-disease-label").forEach(function (label) {
    const input = label.querySelector("input");
    label.classList.toggle("hidden", !!selected && input.value !== disease);
  });
  if (!selected) {
    $("#diagnosisSubcategoryPanel").addClass("hidden");
    $("#diagnosisSubcategoryOptions").html("");
    return;
  }

  if (!selected.length) {
    $("#selectedDiagnosisDisease").text(disease);
    $("#diagnosisSubcategoryPanel").addClass("hidden");
    $("#diagnosisSubcategoryOptions").html("");
    $("#diagnosisSubcategoryHint").text("");
    return;
  }

  const inputType = getDiagnosisSubcategoryInputType(disease);
  const selectedValues = String(savedSubcategories || "").split(",").map(function (item) { return item.trim(); }).filter(Boolean);
  const html = diagnosisSubcategoryOptions[disease].map(function (item) {
    const checked = selectedValues.indexOf(item) > -1 ? " checked" : "";
    return '<label><input type="' + inputType + '" class="diagnosis-subcategory-input" name="diagnosisSubcategory" value="' + attrValue(item) + '"' + checked + '>' + item + '</label>';
  }).join("");
  $("#selectedDiagnosisDisease").text(disease);
  $("#diagnosisSubcategoryOptions").html(html);
  $("#diagnosisSubcategoryHint").text(disease === "多发伤" ? "多发伤最多可同时选择 3 项" : "请选择 1 项子分类");
  $("#diagnosisSubcategoryPanel").removeClass("hidden");
}

function resetDiagnosisDiseaseSelection() {
  document.querySelectorAll("[name=diagnosisDisease]").forEach(function (input) { input.checked = false; });
  document.querySelectorAll(".diagnosis-disease-label").forEach(function (label) { label.classList.remove("hidden"); });
  $("#diagnosisSubcategoryPanel").addClass("hidden");
  $("#diagnosisSubcategoryOptions").html("");
  setMsg("diagnosisMsg", "", false);
}

function enforceMultipleTraumaLimit(changedInput) {
  const selectedDisease = document.querySelector("[name=diagnosisDisease]:checked");
  if (!selectedDisease || selectedDisease.value !== "多发伤") return;
  const selected = Array.from(document.querySelectorAll(".diagnosis-subcategory-input")).filter(function (input) { return input.checked; });
  if (selected.length > 3) {
    changedInput.checked = false;
    setMsg("diagnosisMsg", "多发伤子分类最多只能选择 3 项", true);
  } else {
    setMsg("diagnosisMsg", "", false);
  }
}

function normalizeMedicalHistorySelection(changedValue) {
  const boxes = Array.from(document.querySelectorAll(".medical-history-checkbox"));
  const noneBox = boxes.find(function (box) { return box.value === "无"; });
  if (!noneBox) return;
  const selectedOthers = boxes.filter(function (box) { return box.value !== "无" && box.checked; });
  if (changedValue === "无" && noneBox.checked) {
    boxes.forEach(function (box) { box.checked = box.value === "无"; });
    return;
  }
  if (selectedOthers.length > 0) {
    noneBox.checked = false;
  } else {
    noneBox.checked = true;
  }
}

function loadPatientDetail(patientId, activeTab) {
  activeTab = activeTab || "base";
  $.getJSON("/api/patients/" + patientId)
    .done(function (res) {
      if (!res.success) {
        alert("加载病人详情失败");
        return;
      }
      currentPatientId = patientId;
      const patient = res.data.patient || {};
      const patientFields = res.data.patient_fields || [];
      renderDiagnosisRecordLists(res.data.diagnosis_records || []);
      fillDiagnosisForm(patient);
      $("#patientProfile").html(
        '<div><strong>' + (patient.name || '-') + '</strong></div>' +
        '<div class="case-meta">性别：' + (patient.gender || '-') + ' ｜ 年龄：' + (patient.age || '-') + ' ｜ 病历号：' + (patient.id_number || '-') + '</div>'
      );

      const baseFields = [
        { field_name: 'name', form_label: '姓名', value: patient.name, required: true },
        { field_name: 'gender', form_label: '性别', value: patient.gender, required: true },
        { field_name: 'age', form_label: '年龄', value: patient.age, required: true, type: 'number' },
        { field_name: 'id_number', form_label: '病历号', value: patient.id_number, required: true },
        { field_name: 'phone', form_label: '联系电话', value: patient.phone }
      ].concat(patientFields.filter(function (f) { return diagnosisFieldNames.indexOf(f.field_name) === -1; }));
      const baseHtml = baseFields.map(function (f) {
        return '<div class="form-field"><label>' + f.form_label + (f.required ? ' *' : '') + '</label>' +
          '<input class="base-info-input" data-field="' + f.field_name + '" type="' + (f.type || 'text') + '" value="' + attrValue(f.value) + '" placeholder="' + f.form_label + '"></div>';
      }).join('') || '<div class="detail-item">暂无基础信息</div>';
      $("#baseInfoList").html(baseHtml);
      setMsg("baseInfoMsg", "", false);

      const labHtml = (res.data.lab_records || []).map(function (r) {
        return '<div class="detail-item lab-record-item" data-record-id="' + r.id + '">' +
          (r.created_at || '-') + ' ｜ ' + (r.disease_name || '-') + ' ｜ 录入人：' + (r.operator_name || '-') +
          '<div class="case-meta">点击查看检验单详情</div>' +
          '</div>';
      }).join('') || '<div class="detail-item">暂无检验记录</div>';
      $("#labRecordList").html(labHtml);

      const treatHtml = (res.data.treatments || []).map(function (r) {
        const details = [];
        if (r.diagnosis_disease) details.push('疾病：' + r.diagnosis_disease);
        if (r.antibiotics) details.push('抗生素：' + r.antibiotics);
        if (r.vasoactive_drugs) details.push('血管活性物：' + r.vasoactive_drugs);
        if (r.volume_management) details.push('血容量管理：' + r.volume_management);
        if (r.respiratory_support) details.push('辅助呼吸：' + r.respiratory_support);
        if (r.immunomodulators) details.push('免疫调节药物：' + r.immunomodulators);
        if (r.blood_purification) details.push('血液净化：' + r.blood_purification);
        if (r.traditional_chinese_medicine) details.push('中医中药：' + r.traditional_chinese_medicine);
        if (r.digestive_secretion_drugs) details.push('消化液分泌：' + r.digestive_secretion_drugs);
        if (r.cardiac_treatment_methods) details.push('治疗手段：' + r.cardiac_treatment_methods);
        if (r.poisoning_other_drugs) details.push('其他药物：' + r.poisoning_other_drugs);
        if (r.intracranial_pressure_reduction) details.push('降颅压：' + r.intracranial_pressure_reduction);
        if (r.surgical_treatment) details.push('手术治疗：' + r.surgical_treatment);
        if (r.surgery_methods) details.push('手术方式：' + r.surgery_methods);
        if (r.chest_fixation) details.push('胸部固定：' + r.chest_fixation);
        if (r.airway_control) details.push('气道控制：' + r.airway_control);
        if (r.blood_transfusion) details.push('输血：' + r.blood_transfusion);
        return '<div class="detail-item">' + (r.treat_time || '-') + '<br>' + (r.treatment_method || '-') +
          (details.length ? '<div class="case-meta">' + details.join(' ｜ ') + '</div>' : '') + '</div>';
      }).join('') || '<div class="detail-item">暂无治疗记录</div>';
      $("#treatList").html(treatHtml);

      const followHtml = (res.data.followups || []).map(function (r) {
        return '<div class="detail-item">' + (r.follow_time || '-') + '<br>' + (r.follow_result || '-') + '</div>';
      }).join('') || '<div class="detail-item">暂无随访记录</div>';
      $("#followList").html(followHtml);
      const assessmentHtml = (res.data.assessments || []).map(function (r) {
        return '<div class="detail-item">' + (r.assessment_time || '-') + '<br>' + (r.diagnosis_disease || '-') + ' ｜ 休克指数：' + (r.shock_index || '-') + '</div>';
      }).join('') || '<div class="detail-item">暂无评估记录</div>';
      $("#assessmentList").html(assessmentHtml);
      $("#treatDynamicFields").html("");
      showTreatSubTab("list");
      $("#followDynamicFields").html("");
      $("#assessmentDynamicFields").html("");
      showFollowSubTab("list");
      showAssessmentSubTab("list");

      $(".detail-tab").removeClass("active");
      $(".detail-tab[data-detail-tab='" + activeTab + "']").addClass("active");
      $(".detail-tab-page").addClass("hidden");
      if (activeTab === "base") $("#detailBaseTab").removeClass("hidden");
      if (activeTab === "diagnosis") $("#detailDiagnosisTab").removeClass("hidden");
      if (activeTab === "lab") $("#detailLabTab").removeClass("hidden");
      if (activeTab === "treat") $("#detailTreatTab").removeClass("hidden");
      if (activeTab === "follow") $("#detailFollowTab").removeClass("hidden");
      if (activeTab === "assessment") $("#detailAssessmentTab").removeClass("hidden");
      showPanel("patientDetailPanel");
    })
    .fail(function (xhr) {
      alert(xhr.responseJSON?.message || "加载病人详情失败");
    });
}

function loadLabRecordDetail(recordId) {
  setMsg("labReportMsg", "", false);
  $.getJSON("/api/records/" + recordId)
    .done(function (res) {
      if (!res.success) {
        setMsg("labReportMsg", "检验单加载失败", true);
        showPanel("labReportPanel");
        return;
      }
      const record = res.data.record || {};
      currentPatientId = record.patient_id || currentPatientId;
      $("#labReportMeta").html(
        '<div><strong>' + (record.patient_name || '-') + '</strong></div>' +
        '<div class="case-meta">性别：' + (record.gender || '-') + ' ｜ 年龄：' + (record.age || '-') + ' ｜ 病历号：' + (record.id_number || '-') + '</div>' +
        '<div class="case-meta">疾病：' + (record.disease_name || '-') + ' ｜ 录入人：' + (record.operator_name || '-') + '</div>' +
        '<div class="case-meta">检验时间：' + (record.created_at || '-') + '</div>'
      );
      const items = res.data.items || [];
      const html = items.map(function (item) {
        const value = item.value === null || item.value === undefined || String(item.value).trim() === "" ? '-' : item.value;
        const unit = item.unit ? ' ' + item.unit : '';
        const extras = [];
        if (item.reference_range) extras.push('参考区间：' + item.reference_range);
        if (item.test_method) extras.push('实验方法：' + item.test_method);
        return '<div class="report-item">' +
          '<div class="report-item-head"><span>' + (item.form_label || item.field_name) + '</span><span class="report-value">' + value + unit + '</span></div>' +
          (extras.length ? '<div class="report-extra">' + extras.join(' ｜ ') + '</div>' : '') +
          '</div>';
      }).join('') || '<div class="detail-item">暂无检验数据</div>';
      $("#labReportItems").html(html);
      showPanel("labReportPanel");
    })
    .fail(function (xhr) {
      setMsg("labReportMsg", xhr.responseJSON?.message || "检验单加载失败", true);
      showPanel("labReportPanel");
    });
}

// 页面加载时检查登录状态
$(function() {
  initPhotoButtons();
  bindFileInputs();
  // 恢复保存的疾病ID
  var savedDiseaseId = localStorage.getItem("selectedDiseaseId");
  if (savedDiseaseId && savedDiseaseId !== "null") {
    selectedDiseaseId = parseInt(savedDiseaseId);
  }
  $.getJSON("/api/user/check").done(function(res) {
    if (res.success) {
      canReviewMembers = Number(res.data.parent_id || 0) === 0;
      $("#memberReviewNav").toggleClass("hidden", !canReviewMembers);
      loadDiseases();
      var saved = localStorage.getItem("clientPanel");
      if (saved && saved !== "loginPanel" && saved !== "registerPanel" && saved !== "resetPanel") {
        if (saved === "memberReviewPanel" && !canReviewMembers) {
          showPanel("diseasePanel");
        } else if (saved === "labReportPanel") {
          showPanel("caseListPanel");
        } else {
          showPanel(saved);
        }
      } else {
        showPanel("diseasePanel");
      }
    }
  }).fail(function() {
    localStorage.removeItem("clientPanel");
    localStorage.removeItem("selectedDiseaseId");
    showPanel("loginPanel");
  });
});

// 初始化拍照面板
function initPhotoPanel() {
  selectedFile = null;
  $("#previewContainer").addClass("hidden");
  $("#photoActions").removeClass("hidden");
  $("#recognizeProgress").addClass("hidden");
  $("#retryBtn").addClass("hidden");
  $("#photoMsg").text("");
  $("#previewImage").attr("src", "");
  document.getElementById("photoInputCamera").value = "";
  document.getElementById("photoInputFile").value = "";
}

// 显示预览图片
function showPreview(file) {
  const reader = new FileReader();
  reader.onload = function(e) {
    $("#previewImage").attr("src", e.target.result);
    $("#previewContainer").removeClass("hidden");
  };
  reader.readAsDataURL(file);
}

function fillPatientForm(patient) {
  if (!patient) return;
  var normalizedAge = "";
  if (patient.age !== undefined && patient.age !== null) {
    var ageText = String(patient.age).trim();
    var ageMatch = ageText.match(/\d+/);
    normalizedAge = ageMatch ? ageMatch[0] : "";
  }
  const map = {
    patient_name: patient.name,
    patient_gender: patient.gender,
    patient_age: normalizedAge,
    patient_phone: patient.phone,
    patient_id_number: patient.id_number
  };
  Object.keys(map).forEach(function (fieldName) {
    const value = map[fieldName];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      $("[name=" + fieldName + "]").val(value);
    }
  });
}

// 显示识别进度
function showRecognizeProgress(step, total, message) {
  var percent = Math.round((step / total) * 100);
  var html = '<div class="progress-bar"><div class="progress-fill" style="width:' + percent + '%"></div></div>';
  html += '<p class="progress-text">' + message + '</p>';
  $("#recognizeProgress").html(html).removeClass("hidden");
}

// 自动识别函数
function autoRecognize() {
  if (!selectedFile) return;
  if (!selectedDiseaseId || selectedDiseaseId === "null") {
    alert("请先选择疾病");
    showPanel("diseasePanel");
    return;
  }

  // 显示识别中状态
  showRecognizeProgress(1, 3, "正在上传图片...");
  $("#photoActions").addClass("hidden");
  $("#previewContainer").addClass("hidden");
  $("#retryBtn").addClass("hidden");
  $("#photoMsg").text("");

  var data = new FormData();
  data.append("disease_id", selectedDiseaseId);
  data.append("photo", selectedFile);

  showRecognizeProgress(2, 3, "正在调用AI识别...");

  $.ajax({ url: "/api/recognize", method: "POST", data, processData: false, contentType: false })
    .done(function (res) {
      showRecognizeProgress(3, 3, "识别完成，正在填充表单...");
      uploadedPhotoPath = res.data.photo_path;
      fillPatientForm(res.data.patient);

      // 用识别结果填充表单
      var html = res.data.fields.map(function(f) {
        var value = res.data.values[f.field_name] || '';
        return '<div class="form-field"><label>' + f.form_label + '</label><input name="' + f.field_name + '" value="' + value + '" placeholder="' + f.form_label + '"></div>';
      }).join("");
      $("#dynamicFields").html(html);

      // 延迟跳转到表单页面
      setTimeout(function() {
        showPanel("recordPanel");
      }, 500);
    })
    .fail(function (xhr) {
      setMsg("photoMsg", xhr.responseJSON?.message || "识别失败", true);
      $("#recognizeProgress").addClass("hidden");
      $("#previewContainer").removeClass("hidden");
      $("#retryBtn").removeClass("hidden");
    });
}

$(document).on("click", "[data-show]", function () { showPanel($(this).data("show")); });

// 底部导航
$(document).on("click", ".nav-item", function () {
  var nav = $(this).data("nav");
  if (nav === "logout") {
    $.post("/api/logout").done(function () {
      localStorage.removeItem("clientPanel");
      showPanel("loginPanel");
    });
  } else {
    showPanel(nav);
  }
});

$("#loginBtn").on("click", function () {
  $.post("/api/login", { account: $("#loginAccount").val(), password: $("#loginPassword").val() })
    .done(function (res) {
      canReviewMembers = Number(res?.data?.parent_id || 0) === 0;
      $("#memberReviewNav").toggleClass("hidden", !canReviewMembers);
      loadDiseases();
      showPanel("diseasePanel");
    })
    .fail(function (xhr) { setMsg("loginMsg", xhr.responseJSON?.message || "登录失败", true); });
});

$("#registerBtn").on("click", function () {
  $.post("/api/register", formDataFrom("#registerPanel"))
    .done(function (res) { setMsg("registerMsg", res.message); })
    .fail(function (xhr) { setMsg("registerMsg", xhr.responseJSON?.message || "注册失败", true); });
});

$("#smsBtn").on("click", function () {
  $.post("/api/password/sms", { phone: $("#resetPhone").val() })
    .done(function (res) { setMsg("resetMsg", res.message); })
    .fail(function (xhr) { setMsg("resetMsg", xhr.responseJSON?.message || "发送失败", true); });
});

$("#resetBtn").on("click", function () {
  $.post("/api/password/reset", { phone: $("#resetPhone").val(), code: $("#resetCode").val(), password: $("#resetPassword").val() })
    .done(function (res) { setMsg("resetMsg", res.message); })
    .fail(function (xhr) { setMsg("resetMsg", xhr.responseJSON?.message || "重置失败", true); });
});

// 选择疾病后
$(document).on("click", ".disease-item", function () {
  selectedDiseaseId = $(this).data("id");
  localStorage.setItem("selectedDiseaseId", selectedDiseaseId);
  showPanel("photoPanel");
  initPhotoPanel();
  initPhotoButtons();
});

// 拍照/上传：点击按钮触发隐藏的 file input
// 文件选择变化时自动识别
function bindFileInputs() {
  document.getElementById("photoInputCamera").addEventListener("change", handleFileSelect);
  document.getElementById("photoInputFile").addEventListener("change", handleFileSelect);
}

function handleFileSelect(e) {
  if (!selectedDiseaseId || selectedDiseaseId === "null") {
    alert("请先选择疾病");
    showPanel("diseasePanel");
    return;
  }
  if (e.target.files && e.target.files[0]) {
    selectedFile = e.target.files[0];
    showPreview(selectedFile);
    autoRecognize();
  }
}

// 重新识别按钮
$(document).on("click", "#retryBtn", function () {
  if (selectedFile) {
    autoRecognize();
  }
});

function formatStatus(status) {
  if (status === "pending") return "未审核";
  if (status === "approved") return "已通过";
  if (status === "disabled") return "已禁用";
  return status || "-";
}

function loadMemberReviews() {
  if (!canReviewMembers) {
    $("#memberReviewBody").html('<tr><td colspan="4">无权限查看</td></tr>');
    return;
  }

  $.getJSON("/api/member-reviews")
    .done(function (res) {
      if (!res.success) {
        $("#memberReviewBody").html('<tr><td colspan="4">加载失败</td></tr>');
        return;
      }
      if (!res.data.length) {
        $("#memberReviewBody").html('<tr><td colspan="4">暂无可审核会员</td></tr>');
        return;
      }

      const html = res.data.map(function (user) {
        const action = user.status === "pending"
          ? '<button class="btn-sm approve-member-btn" data-id="' + user.id + '">通过</button>'
          : '-';
        return '<tr>' +
          '<td>' + (user.name || '-') + '</td>' +
          '<td>' + (user.phone || '-') + '</td>' +
          '<td>' + formatStatus(user.status) + '</td>' +
          '<td>' + action + '</td>' +
          '</tr>';
      }).join('');
      $("#memberReviewBody").html(html);
    })
    .fail(function (xhr) {
      $("#memberReviewBody").html('<tr><td colspan="4">加载失败</td></tr>');
      setMsg("memberReviewMsg", xhr.responseJSON?.message || "加载失败", true);
    });
}

$(document).on("click", ".approve-member-btn", function () {
  const targetUserId = $(this).data("id");
  $.post("/api/member-reviews/" + targetUserId + "/approve")
    .done(function (res) {
      setMsg("memberReviewMsg", res.message || "操作成功");
      loadMemberReviews();
    })
    .fail(function (xhr) {
      setMsg("memberReviewMsg", xhr.responseJSON?.message || "操作失败", true);
    });
});

$("#saveRecordBtn").on("click", function () {
  const patient = {
    name: $("[name=patient_name]").val(),
    gender: $("[name=patient_gender]").val(),
    age: $("[name=patient_age]").val(),
    phone: $("[name=patient_phone]").val(),
    id_number: $("[name=patient_id_number]").val()
  };
  const values = {};
  $("#dynamicFields input").each(function () { values[this.name] = $(this).val(); });
  $.ajax({
    url: "/api/records",
    method: "POST",
    contentType: "application/json",
    data: JSON.stringify({ disease_id: selectedDiseaseId, patient, values, photo_path: uploadedPhotoPath })
  }).done(function (res) {
    setMsg("recordMsg", `${res.message}，记录ID：${res.data.record_id}`);
    loadCaseList();
  }).fail(function (xhr) { setMsg("recordMsg", xhr.responseJSON?.message || "保存失败", true); });
});

$(document).on("click", ".view-case-btn", function () {
  loadPatientDetail($(this).data("id"));
});

$(document).on("click", ".lab-record-item", function () {
  loadLabRecordDetail(this.getAttribute("data-record-id"));
});

$(document).on("click", "#backToLabListBtn", function () {
  if (currentPatientId) {
    loadPatientDetail(currentPatientId, "lab");
  } else {
    showPanel("caseListPanel");
  }
});

$(document).on("click", "#showNewCaseBtn", function () {
  $("#newCasePanel").removeClass("hidden");
  setMsg("newCaseMsg", "", false);
});

$(document).on("click", "#exportCasesBtn", function () {
  window.location.href = "/api/cases/export";
});

$(document).on("click", "#saveBaseInfoBtn", function () {
  if (!currentPatientId) return;
  const payload = {};
  $("#baseInfoList .base-info-input").each(function () {
    payload[this.getAttribute("data-field")] = $(this).val();
  });
  if (!payload.name || !payload.gender || !payload.age || !payload.id_number) {
    setMsg("baseInfoMsg", "请填写姓名、性别、年龄、病历号", true);
    return;
  }
  $.post("/api/patients/" + currentPatientId, payload)
    .done(function (res) {
      setMsg("baseInfoMsg", res.message || "基础信息已保存");
      loadPatientDetail(currentPatientId, "base");
    })
    .fail(function (xhr) {
      setMsg("baseInfoMsg", xhr.responseJSON?.message || "基础信息保存失败", true);
    });
});

$(document).on("change", ".medical-history-checkbox", function () {
  normalizeMedicalHistorySelection(this.value);
});

$(document).on("change", "[name=diagnosisDisease]", function () {
  applyDiagnosisDiseaseSelection(this.value, "");
});

$(document).on("click", "#resetDiagnosisDiseaseBtn", function () {
  resetDiagnosisDiseaseSelection();
});

$(document).on("change", ".diagnosis-subcategory-input", function () {
  enforceMultipleTraumaLimit(this);
});

$(document).on("change", "[name=selectedDiagnosisRecordFollow]", function () {
  renderFollowupFields(this.getAttribute("data-disease") || "");
});

$(document).on("change", "[name=selectedDiagnosisRecordTreat]", function () {
  renderTreatmentFields(this.getAttribute("data-disease") || "");
});

$(document).on("change", "[name=selectedDiagnosisRecordAssessment]", function () {
  renderAssessmentFields(this.getAttribute("data-disease") || "");
});

$(document).on("input", "#assessmentDynamicFields .assessment-input[data-field=systolic_bp], #assessmentDynamicFields .assessment-input[data-field=heart_rate]", function () {
  updateAssessmentShockIndex();
});

$(document).on("change", ".treatment-choice", function () {
  normalizeTreatmentChoice(this);
});

$(document).on("click", "#saveDiagnosisBtn", function () {
  if (!currentPatientId) return;
  const history = Array.from(document.querySelectorAll(".medical-history-checkbox"))
    .filter(function (input) { return input.checked; })
    .map(function (input) { return input.value; });
  const selectedDisease = document.querySelector("[name=diagnosisDisease]:checked");
  const selectedSubcategories = Array.from(document.querySelectorAll(".diagnosis-subcategory-input"))
    .filter(function (input) { return input.checked; })
    .map(function (input) { return input.value; });
  if (!selectedDisease) {
    setMsg("diagnosisMsg", "请选择本次诊断疾病", true);
    return;
  }
  if (selectedDisease && (diagnosisSubcategoryOptions[selectedDisease.value] || []).length && !selectedSubcategories.length) {
    setMsg("diagnosisMsg", "请选择初步诊断子分类", true);
    return;
  }
  $.post("/api/patients/" + currentPatientId, {
    diagnosis_disease: selectedDisease ? selectedDisease.value : "",
    medical_history: history.length ? history.join(",") : "无",
    preliminary_diagnosis: selectedSubcategories.join(",")
  }).done(function (res) {
    setMsg("diagnosisMsg", res.message || "诊断信息已保存");
    loadPatientDetail(currentPatientId, "diagnosis");
  }).fail(function (xhr) {
    setMsg("diagnosisMsg", xhr.responseJSON?.message || "诊断信息保存失败", true);
  });
});

$(document).on("click", "#createCaseBtn", function () {
  if (!$("#newCaseName").val() || !$("#newCaseGender").val() || !$("#newCaseAge").val() || !$("#newCaseIdNumber").val()) {
    setMsg("newCaseMsg", "请填写姓名、性别、年龄、病历号", true);
    return;
  }
  $.post("/api/patients", {
    name: $("#newCaseName").val(),
    gender: $("#newCaseGender").val(),
    age: $("#newCaseAge").val(),
    phone: $("#newCasePhone").val(),
    id_number: $("#newCaseIdNumber").val()
  }).done(function (res) {
    resetNewCaseForm();
    $("#newCasePanel").addClass("hidden");
    loadCaseList();
    if (res.data && res.data.patient_id) {
      loadPatientDetail(res.data.patient_id);
    }
  }).fail(function (xhr) {
    setMsg("newCaseMsg", xhr.responseJSON?.message || "新增病例失败", true);
  });
});

$(document).on("click", ".detail-tab", function () {
  const tab = this.getAttribute("data-detail-tab");
  $(".detail-tab").removeClass("active");
  $(this).addClass("active");
  $(".detail-tab-page").addClass("hidden");
  if (tab === "base") $("#detailBaseTab").removeClass("hidden");
  if (tab === "diagnosis") $("#detailDiagnosisTab").removeClass("hidden");
  if (tab === "lab") $("#detailLabTab").removeClass("hidden");
  if (tab === "treat") {
    $("#detailTreatTab").removeClass("hidden");
    showTreatSubTab("list");
  }
  if (tab === "follow") {
    $("#detailFollowTab").removeClass("hidden");
    showFollowSubTab("list");
  }
  if (tab === "assessment") {
    $("#detailAssessmentTab").removeClass("hidden");
    showAssessmentSubTab("list");
  }
});

$(document).on("click", "#detailTreatTab .inner-tab", function () {
  showTreatSubTab(this.getAttribute("data-treat-tab"));
});

$(document).on("click", "#detailFollowTab .inner-tab", function () {
  showFollowSubTab(this.getAttribute("data-follow-tab"));
});

$(document).on("click", "#detailAssessmentTab .inner-tab", function () {
  showAssessmentSubTab(this.getAttribute("data-assessment-tab"));
});

$("#addTreatBtn").on("click", function () {
  if (!currentPatientId) return;
  const selectedDiagnosis = document.querySelector("[name=selectedDiagnosisRecordTreat]:checked");
  if (!selectedDiagnosis) {
    setMsg("treatMsg", "请选择本次治疗针对哪次诊断", true);
    return;
  }
  const payload = {
    diagnosis_record_id: selectedDiagnosis.value,
    treat_time: $("#treatTime").val()
  };
  $("#treatDynamicFields .treatment-input").each(function () {
    payload[this.getAttribute("data-field")] = $(this).val();
  });
  const choiceFields = [];
  Array.from(document.querySelectorAll("#treatDynamicFields .treatment-choice")).forEach(function (input) {
    const field = input.getAttribute("data-field");
    if (choiceFields.indexOf(field) === -1) choiceFields.push(field);
  });
  choiceFields.forEach(function (field) {
    const selected = Array.from(document.querySelectorAll('.treatment-choice[data-field="' + field + '"]'))
      .filter(function (input) { return input.checked; })
      .map(function (input) { return input.value; });
    payload[field] = selected.join(",");
  });
  $.post("/api/patients/" + currentPatientId + "/treatments", payload).done(function (res) {
    setMsg("treatMsg", res.message || "已保存");
    $("#treatTime").val("");
    $("#treatDynamicFields").html("");
    loadPatientDetail(currentPatientId, "treat");
  }).fail(function (xhr) {
    setMsg("treatMsg", xhr.responseJSON?.message || "保存失败", true);
  });
});

$("#addFollowBtn").on("click", function () {
  if (!currentPatientId) return;
  const selectedDiagnosis = document.querySelector("[name=selectedDiagnosisRecordFollow]:checked");
  if (!selectedDiagnosis) {
    setMsg("followMsg", "请选择本次随访针对哪次诊断", true);
    return;
  }
  const payload = {
    diagnosis_record_id: selectedDiagnosis.value,
    follow_time: $("#followTime").val()
  };
  $("#followDynamicFields .followup-input").each(function () {
    payload[this.getAttribute("data-field")] = $(this).val();
  });
  $.post("/api/patients/" + currentPatientId + "/followups", payload).done(function (res) {
    setMsg("followMsg", res.message || "已保存");
    $("#followTime").val("");
    $("#followDynamicFields").html("");
    loadPatientDetail(currentPatientId, "follow");
  }).fail(function (xhr) {
    setMsg("followMsg", xhr.responseJSON?.message || "保存失败", true);
  });
});

$("#addAssessmentBtn").on("click", function () {
  if (!currentPatientId) return;
  const selectedDiagnosis = document.querySelector("[name=selectedDiagnosisRecordAssessment]:checked");
  if (!selectedDiagnosis) {
    setMsg("assessmentMsg", "请选择本次评估针对哪次诊断", true);
    return;
  }
  updateAssessmentShockIndex();
  const payload = {
    diagnosis_record_id: selectedDiagnosis.value,
    assessment_time: $("#assessmentTime").val()
  };
  $("#assessmentDynamicFields .assessment-input").each(function () {
    payload[this.getAttribute("data-field")] = $(this).val();
  });
  $.post("/api/patients/" + currentPatientId + "/assessments", payload).done(function (res) {
    setMsg("assessmentMsg", res.message || "已保存");
    $("#assessmentTime").val("");
    $("#assessmentDynamicFields").html("");
    loadPatientDetail(currentPatientId, "assessment");
  }).fail(function (xhr) {
    setMsg("assessmentMsg", xhr.responseJSON?.message || "保存失败", true);
  });
});
