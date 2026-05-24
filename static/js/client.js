let selectedDiseaseId = null;
let uploadedPhotoPath = null;
let selectedFile = null;
let canReviewMembers = false;
let currentPatientId = null;
let currentUploadMode = "intake";
let currentUploadPatientId = null;
let currentRecordCategory = null;
let currentCategoryLabel = "";

const labCategories = [
  { key: "blood_routine", label: "血常规" },
  { key: "biochemistry", label: "生化电解质" },
  { key: "blood_gas", label: "血气分析" },
  { key: "dic7", label: "DIC7项" },
  { key: "bnp", label: "BNP" },
  { key: "lactate", label: "乳酸" },
  { key: "pct", label: "PCT" }
];

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
var topPanels = ["diseasePanel", "caseListPanel", "memberReviewPanel"];
var currentPanelId = "";

function showPanel(id) {
  $(".panel").addClass("hidden");
  $("#" + id).removeClass("hidden");
  currentPanelId = id;
  localStorage.setItem("clientPanel", id);
  const isAuthPanel = authPanels.indexOf(id) > -1;
  const isTopPanel = topPanels.indexOf(id) > -1;
  $("#clientHero").toggleClass("hidden", !isAuthPanel && !isTopPanel);
  $("#innerBackBtn").toggleClass("hidden", isAuthPanel || isTopPanel);
  // 登录后的页面显示底部导航
  if (!isAuthPanel) {
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
      return `<button type="button" class="disease-item" data-id="${d.id}"><span class="disease-name">${d.name}</span><span class="disease-count">已录入${count}人</span></button>`;
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
      const groups = res.data || {};
      const renderGroup = function (title, items, emptyText) {
        const cards = (items || []).map(function (item) {
          const disease = item.disease_name ? ' ｜ 疾病：' + item.disease_name : '';
          const isComplete = getCaseIntegrity(item) === 'complete';
          const status = isComplete ? '完整记录' : '暂存记录';
          const actionText = isComplete ? '查看' : '继续完善';
          const statusClass = isComplete ? 'case-badge-complete' : 'case-badge-draft';
          return '<div class="case-item">' +
            '<div class="case-head"><strong>' + (item.name || '-') + '</strong><span class="case-badge ' + statusClass + '">' + status + '</span><button class="btn-sm view-case-btn" data-id="' + item.id + '">' + actionText + '</button></div>' +
            '<div class="case-meta">性别：' + (item.gender || '-') + ' ｜ 年龄：' + (item.age || '-') + ' ｜ 登记号：' + (item.id_number || '-') + disease + '</div>' +
            '<div class="case-meta">记录完整性：' + status + ' ｜ 已录入 ' + Number(item.record_count || 0) + ' 条检验记录</div>' +
            '</div>';
        }).join('') || '<div class="detail-item">' + emptyText + '</div>';
        return '<section class="case-group"><div class="case-group-title">' + title + '</div><div class="case-list">' + cards + '</div></section>';
      };
      $("#caseList").html(
        renderGroup("暂存记录", groups.draft, "暂无暂存病例") +
        renderGroup("完整记录", groups.complete || groups.submitted, "暂无完整病例")
      );
    })
    .fail(function (xhr) {
      setMsg("caseListMsg", xhr.responseJSON?.message || "病例加载失败", true);
    });
}

function getCaseIntegrity(item) {
  if (!item) return 'draft';
  if (item.case_integrity === 'complete' || item.case_integrity === 'submitted') return 'complete';
  if (item.case_integrity) return 'draft';
  return item.case_status === 'submitted' ? 'complete' : 'draft';
}

function openNewCaseForm() {
  showPanel("caseListPanel");
  $("#newCasePanel").removeClass("hidden");
  setMsg("newCaseMsg", "", false);
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

function parseTreatmentDetailJson(row) {
  if (!row || !row.detail_json) return {};
  try {
    return JSON.parse(row.detail_json) || {};
  } catch (e) {
    return {};
  }
}

function backFromInnerPage() {
  if (currentPanelId === "labReportPanel") {
    if (currentPatientId) loadPatientDetail(currentPatientId, "lab");
    else showPanel("caseListPanel");
    return;
  }
  if (currentPanelId === "patientDetailPanel") {
    showPanel("caseListPanel");
    return;
  }
  if (currentPanelId === "recordPanel") {
    showPanel("photoPanel");
    return;
  }
  if (currentPanelId === "photoPanel") {
    if (currentUploadMode === "lab" && currentUploadPatientId) loadPatientDetail(currentUploadPatientId, "lab");
    else showPanel("diseasePanel");
    return;
  }
  showPanel("caseListPanel");
}

function formatTreatmentDetail(row, field, fallback) {
  const payload = parseTreatmentDetailJson(row);
  let details = payload[field + "_details"] || [];
  if (typeof details === "string") {
    try { details = JSON.parse(details) || []; } catch (e) { details = []; }
  }
  if (!Array.isArray(details) || !details.length) return fallback;
  return details.map(function (item) {
    const extras = [];
    Object.keys(item.details || {}).forEach(function (key) {
      const value = item.details[key];
      if (value) extras.push(value);
    });
    return item.option + (extras.length ? '（' + extras.join('，') + '）' : '');
  }).join('，');
}

function collectTreatmentOptionDetails(field, selected) {
  return selected.map(function (option) {
    const details = {};
    Array.from(document.querySelectorAll('.treatment-option-extra[data-field="' + field + '"]')).filter(function (input) {
      return input.getAttribute("data-option") === option;
    }).forEach(function (input) {
      details[input.getAttribute("data-detail-field")] = input.value;
    });
    return { option: option, details: details };
  });
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
function showTreatSubTab(tab) {
  tab = tab || "list";
  document.querySelectorAll("#detailTreatTab .inner-tab").forEach(function (button) {
    button.classList.toggle("active", button.getAttribute("data-treat-tab") === tab);
  });
  $("#treatListPanel").toggleClass("hidden", tab !== "list");
  $("#treatAddPanel").toggleClass("hidden", tab !== "add");
  if (tab !== "add") {
    $("#treatFormPanel").addClass("hidden");
  }
  if (tab === "add") {
    const selectedDiagnosis = document.querySelector("[name=selectedDiagnosisRecordTreat]:checked");
    if (selectedDiagnosis) {
      $("#treatFormPanel").removeClass("hidden");
      renderTreatmentFields(getDiagnosisOptionDisease(selectedDiagnosis));
    }
  }
}

function showFollowSubTab(tab) {
  tab = tab || "list";
  document.querySelectorAll("#detailFollowTab .inner-tab").forEach(function (button) {
    button.classList.toggle("active", button.getAttribute("data-follow-tab") === tab);
  });
  $("#followListPanel").toggleClass("hidden", tab !== "list");
  $("#followAddPanel").toggleClass("hidden", tab !== "add");
  if (tab !== "add") {
    $("#followFormPanel").addClass("hidden");
  }
  if (tab === "add") {
    const selectedDiagnosis = document.querySelector("[name=selectedDiagnosisRecordFollow]:checked");
    if (selectedDiagnosis) {
      $("#followFormPanel").removeClass("hidden");
      renderFollowupFields(selectedDiagnosis.getAttribute("data-disease") || "");
    }
  }
}

function showAssessmentSubTab(tab) {
  tab = tab || "list";
  document.querySelectorAll("#detailAssessmentTab .inner-tab").forEach(function (button) {
    button.classList.toggle("active", button.getAttribute("data-assessment-tab") === tab);
  });
  $("#assessmentListPanel").toggleClass("hidden", tab !== "list");
  $("#assessmentAddPanel").toggleClass("hidden", tab !== "add");
  if (tab !== "add") {
    $("#assessmentFormPanel").addClass("hidden");
  }
  if (tab === "add") {
    const selectedDiagnosis = document.querySelector("[name=selectedDiagnosisRecordAssessment]:checked");
    if (selectedDiagnosis) {
      $("#assessmentFormPanel").removeClass("hidden");
      renderAssessmentFields(selectedDiagnosis.getAttribute("data-disease") || "");
    }
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
      const patient = res.data.patient || {};
      currentPatientId = patientId;
      if (patient.last_disease_id) {
        selectedDiseaseId = patient.last_disease_id;
        localStorage.setItem("selectedDiseaseId", selectedDiseaseId);
      }
      const patientFields = res.data.patient_fields || [];
      renderDiagnosisRecordLists(res.data.diagnosis_records || []);
      fillDiagnosisForm(patient);
      $("#patientProfile").html(
        '<div><strong>' + (patient.name || '-') + '</strong></div>' +
        '<div class="case-meta">性别：' + (patient.gender || '-') + ' ｜ 年龄：' + (patient.age || '-') + ' ｜ 登记号：' + (patient.id_number || '-') + ' ｜ 记录完整性：' + (getCaseIntegrity(patient) === 'complete' ? '完整记录' : '暂存记录') + '</div>'
      );
      $("#submitCaseBtn").toggleClass("hidden", getCaseIntegrity(patient) === 'complete');
      $("#labCategoryActions").toggleClass("hidden", getCaseIntegrity(patient) === 'complete');
      setMsg("patientDetailMsg", getCaseIntegrity(patient) === 'complete' ? '当前病例为完整记录。' : '当前病例为暂存记录，可继续补录检验、评估和治疗。', false);

      const baseFields = [
        { field_name: 'name', form_label: '姓名', value: patient.name, required: true },
        { field_name: 'gender', form_label: '性别', value: patient.gender, required: true },
        { field_name: 'age', form_label: '年龄', value: patient.age, required: true, type: 'number' },
        { field_name: 'id_number', form_label: '登记号', value: patient.id_number, required: true },
        { field_name: 'phone', form_label: '联系电话', value: patient.phone }
      ].concat(patientFields.filter(function (f) { return diagnosisFieldNames.indexOf(f.field_name) === -1; }));
      const baseHtml = baseFields.map(function (f) {
        return '<div class="form-field"><label>' + f.form_label + (f.required ? ' *' : '') + '</label>' +
          '<input class="base-info-input" data-field="' + f.field_name + '" type="' + (f.type || 'text') + '" value="' + attrValue(f.value) + '" placeholder="' + f.form_label + '"></div>';
      }).join('') || '<div class="detail-item">暂无基础信息</div>';
      $("#baseInfoList").html(baseHtml);
      setMsg("baseInfoMsg", "", false);

      const labHtml = (res.data.lab_records || []).map(function (r) {
        const categoryText = r.record_category ? ' ｜ 类别：' + getLabCategoryLabel(r.record_category) : '';
        const testNameText = r.lab_test_name ? ' ｜ 检验项目：' + r.lab_test_name : '';
        return '<div class="detail-item lab-record-item" data-record-id="' + r.id + '">' +
          (r.created_at || '-') + ' ｜ ' + (r.disease_name || '-') + categoryText + testNameText + ' ｜ 录入人：' + (r.operator_name || '-') +
          '<div class="case-meta">点击查看检验单详情</div>' +
          '</div>';
      }).join('') || '<div class="detail-item">暂无检验记录</div>';
      $("#labRecordList").html(labHtml);
      renderLabCategoryActions(patient);

      const treatHtml = (res.data.treatments || []).map(function (r) {
        const details = [];
        if (r.diagnosis_disease) details.push('疾病：' + r.diagnosis_disease);
        if (r.antibiotics) details.push('抗生素：' + formatTreatmentDetail(r, 'antibiotics', r.antibiotics));
        if (r.vasoactive_drugs) details.push('血管活性物：' + formatTreatmentDetail(r, 'vasoactive_drugs', r.vasoactive_drugs));
        if (r.volume_management) details.push('血容量管理：' + formatTreatmentDetail(r, 'volume_management', r.volume_management));
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
      if (activeTab === "assessment") $("#detailAssessmentTab").removeClass("hidden");
      if (activeTab === "treat") $("#detailTreatTab").removeClass("hidden");
      if (activeTab === "follow") $("#detailFollowTab").removeClass("hidden");
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
        '<div class="case-meta">性别：' + (record.gender || '-') + ' ｜ 年龄：' + (record.age || '-') + ' ｜ 登记号：' + (record.id_number || '-') + '</div>' +
        '<div class="case-meta">疾病：' + (record.disease_name || '-') + ' ｜ 检验项目：' + (record.lab_test_name || '-') + ' ｜ 录入人：' + (record.operator_name || '-') + '</div>' +
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
  $("#confirmUploadBtn").addClass("hidden");
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

function resetRecordForm() {
  $("[name=patient_name], [name=patient_gender], [name=patient_age], [name=patient_phone], [name=patient_id_number]").val("");
  $("#dynamicFields").html("");
  $("#recordPanelHint").text("");
  setMsg("recordMsg", "", false);
}

function openPhotoPanelForIntake() {
  currentUploadMode = "lab";
  currentUploadPatientId = null;
  currentRecordCategory = null;
  currentCategoryLabel = "检验";
  initPhotoPanel();
  initPhotoButtons();
  $("#photoPanelTitle").text("拍照上传检验单");
  setMsg("photoMsg", "选择图片后会同时识别患者基础信息和当前疾病需要填写的检验内容。", false);
  showPanel("photoPanel");
}

function startLabCategoryUpload(patientId, categoryKey, categoryLabel) {
  currentUploadMode = "lab";
  currentUploadPatientId = patientId;
  currentRecordCategory = categoryKey;
  currentCategoryLabel = categoryLabel || "检验";
  initPhotoPanel();
  initPhotoButtons();
  $("#photoPanelTitle").text("上传" + currentCategoryLabel);
  setMsg("photoMsg", "选择图片后点击确定，系统会只识别" + currentCategoryLabel + "。", false);
  showPanel("photoPanel");
}

function triggerPhotoChooser() {
  const targetInput = isMobile() ? document.getElementById("photoInputCamera") : document.getElementById("photoInputFile");
  if (!targetInput) return;
  targetInput.click();
}

function renderLabCategoryActions(patient) {
  const html = labCategories.map(function (category) {
    return '<button class="btn-sm lab-category-upload-btn" data-patient-id="' + patient.id + '" data-category="' + category.key + '" data-label="' + category.label + '">' + category.label + '</button>';
  }).join('');
  $("#labCategoryActions").html(html);
}

function getLabCategoryLabel(categoryKey) {
  const found = labCategories.find(function (item) { return item.key === categoryKey; });
  return found ? found.label : categoryKey;
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
  $("#confirmUploadBtn").addClass("hidden");
  $("#previewContainer").addClass("hidden");
  $("#retryBtn").addClass("hidden");
  $("#photoMsg").text("");

  var data = new FormData();
  data.append("disease_id", selectedDiseaseId);
  data.append("photo", selectedFile);
  data.append("mode", currentUploadMode);
  if (currentRecordCategory) data.append("record_category", currentRecordCategory);
  if (currentUploadPatientId) data.append("patient_id", currentUploadPatientId);

  showRecognizeProgress(2, 3, "正在调用AI识别...");

  $.ajax({ url: "/api/recognize", method: "POST", data, processData: false, contentType: false })
    .done(function (res) {
      showRecognizeProgress(3, 3, "识别完成，正在填充表单...");
      uploadedPhotoPath = res.data.photo_path;
      resetRecordForm();
      fillPatientForm(res.data.patient);

      var html = (res.data.fields || []).map(function(f) {
        var value = (res.data.values || {})[f.field_name] || '';
        return '<div class="form-field"><label>' + f.form_label + '</label><input name="' + f.field_name + '" value="' + value + '" placeholder="' + f.form_label + '"></div>';
      }).join("");
      $("#dynamicFields").html(html);

      if (currentUploadMode === "intake") {
        $("#recordPanelTitle").text("确认基础信息");
        $("#recordPanelHint").text("当前步骤仅提取患者基础信息，确认后会创建暂存病例。后续请在病例中继续上传各项检验内容。");
        $("#labFieldsSection").addClass("hidden");
        $("#saveRecordBtn").text("创建暂存病例");
      } else {
        $("#labTestName").val(res.data.lab_test_name || res.data.category_label || currentCategoryLabel || "");
        $("#recordPanelTitle").text("校对" + (currentCategoryLabel || "检验数据"));
        $("#recordPanelHint").text("确认无误后保存当前类别，保存成功会返回病例详情。")
        $("#labFieldsSection").removeClass("hidden");
        $("#saveRecordBtn").text("保存" + (currentCategoryLabel || "检验"));
      }

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
  } else if (nav === "newCase") {
    openNewCaseForm();
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

document.addEventListener("click", function (event) {
  const diseaseButton = event.target && event.target.closest ? event.target.closest(".disease-item") : null;
  if (!diseaseButton) return;
  event.preventDefault();
  selectedDiseaseId = diseaseButton.getAttribute("data-id");
  localStorage.setItem("selectedDiseaseId", selectedDiseaseId);
  openPhotoPanelForIntake();
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
    setMsg("photoMsg", "图片已选择，请点击确定开始上传识别。", false);
    $("#confirmUploadBtn").removeClass("hidden");
  }
}

// 重新识别按钮
$(document).on("click", "#retryBtn", function () {
  if (selectedFile) {
    autoRecognize();
  }
});

$(document).on("click", "#confirmUploadBtn", function () {
  autoRecognize();
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
  if (!patient.name || !patient.gender || !patient.id_number) {
    setMsg("recordMsg", "请先确认姓名、性别、登记号", true);
    return;
  }
  if (currentUploadMode === "intake") {
    $.ajax({
      url: "/api/patients",
      method: "POST",
      contentType: "application/json",
      data: JSON.stringify({
        name: patient.name,
        gender: patient.gender,
        age: patient.age,
        phone: patient.phone,
        id_number: patient.id_number,
        case_status: "draft",
        last_disease_id: selectedDiseaseId,
        require_age: patient.age ? 1 : 0
      })
    }).done(function (res) {
      setMsg("recordMsg", "暂存病例已创建");
      loadCaseList();
      if (res.data && res.data.patient_id) {
        currentUploadPatientId = res.data.patient_id;
        loadPatientDetail(res.data.patient_id, "lab");
      }
    }).fail(function (xhr) {
      setMsg("recordMsg", xhr.responseJSON?.message || "创建暂存病例失败", true);
    });
    return;
  }
  const values = {};
  $("#dynamicFields input").each(function () { values[this.name] = $(this).val(); });
  $.ajax({
    url: "/api/records",
    method: "POST",
    contentType: "application/json",
    data: JSON.stringify({
      patient_id: currentUploadPatientId,
      disease_id: selectedDiseaseId,
      patient,
      values,
      photo_path: uploadedPhotoPath,
      record_category: currentRecordCategory,
      lab_test_name: $("#labTestName").val()
    })
  }).done(function (res) {
    setMsg("recordMsg", ($("#labTestName").val() || currentCategoryLabel || "检验") + "上传成功");
    loadCaseList();
    const savedPatientId = (res.data && res.data.patient_id) || currentUploadPatientId;
    if (savedPatientId) {
      currentUploadPatientId = savedPatientId;
      loadPatientDetail(savedPatientId, "lab");
    }
  }).fail(function (xhr) { setMsg("recordMsg", xhr.responseJSON?.message || "保存失败", true); });
});

$(document).on("click", ".view-case-btn", function () {
  loadPatientDetail($(this).data("id"));
});

$(document).on("click", ".lab-category-upload-btn", function () {
  const patientId = $(this).data("patient-id");
  const category = $(this).data("category");
  const label = $(this).data("label");
  startLabCategoryUpload(patientId, category, label);
  triggerPhotoChooser();
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
  openNewCaseForm();
});

$(document).on("click", "#innerBackBtn", function () {
  backFromInnerPage();
});

$(document).on("click", "#submitCaseBtn", function () {
  if (!currentPatientId) return;
  $.post("/api/patients/" + currentPatientId + "/submit")
    .done(function (res) {
      setMsg("patientDetailMsg", res.message || "已标记为完整记录");
      loadCaseList();
      loadPatientDetail(currentPatientId, "base");
    })
    .fail(function (xhr) {
      setMsg("patientDetailMsg", xhr.responseJSON?.message || "提交失败", true);
    });
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
    setMsg("baseInfoMsg", "请填写姓名、性别、年龄、登记号", true);
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
  $("#followFormPanel").removeClass("hidden");
  renderFollowupFields(this.getAttribute("data-disease") || "");
});

$(document).on("change", "[name=selectedDiagnosisRecordTreat]", function () {
  $("#treatFormPanel").removeClass("hidden");
  renderTreatmentFields(getDiagnosisOptionDisease(this));
});

document.addEventListener("change", function (event) {
  if (event.target && event.target.name === "selectedDiagnosisRecordTreat") {
    $("#treatFormPanel").removeClass("hidden");
    renderTreatmentFields(getDiagnosisOptionDisease(event.target));
  }
});

document.addEventListener("click", function (event) {
  let input = event.target && event.target.closest ? event.target.closest("input[name=selectedDiagnosisRecordTreat]") : null;
  if (!input && event.target && event.target.closest) {
    const option = event.target.closest(".diagnosis-record-option");
    input = option ? option.querySelector("input[name=selectedDiagnosisRecordTreat]") : null;
  }
  if (input) {
    $("#treatFormPanel").removeClass("hidden");
    renderTreatmentFields(getDiagnosisOptionDisease(input));
  }

  let followInput = event.target && event.target.closest ? event.target.closest("input[name=selectedDiagnosisRecordFollow]") : null;
  if (!followInput && event.target && event.target.closest) {
    const followOption = event.target.closest(".diagnosis-record-option");
    followInput = followOption ? followOption.querySelector("input[name=selectedDiagnosisRecordFollow]") : null;
  }
  if (followInput) {
    $("#followFormPanel").removeClass("hidden");
    renderFollowupFields(followInput.getAttribute("data-disease") || "");
  }

  let assessmentInput = event.target && event.target.closest ? event.target.closest("input[name=selectedDiagnosisRecordAssessment]") : null;
  if (!assessmentInput && event.target && event.target.closest) {
    const assessmentOption = event.target.closest(".diagnosis-record-option");
    assessmentInput = assessmentOption ? assessmentOption.querySelector("input[name=selectedDiagnosisRecordAssessment]") : null;
  }
  if (assessmentInput) {
    $("#assessmentFormPanel").removeClass("hidden");
    renderAssessmentFields(assessmentInput.getAttribute("data-disease") || "");
  }
});

$(document).on("change", "[name=selectedDiagnosisRecordAssessment]", function () {
  $("#assessmentFormPanel").removeClass("hidden");
  renderAssessmentFields(this.getAttribute("data-disease") || "");
});

document.addEventListener("change", function (event) {
  if (event.target && event.target.name === "selectedDiagnosisRecordFollow") {
    $("#followFormPanel").removeClass("hidden");
    renderFollowupFields(event.target.getAttribute("data-disease") || "");
  }
  if (event.target && event.target.name === "selectedDiagnosisRecordAssessment") {
    $("#assessmentFormPanel").removeClass("hidden");
    renderAssessmentFields(event.target.getAttribute("data-disease") || "");
  }
});

$(document).on("input", "#assessmentDynamicFields .assessment-input[data-field=systolic_bp], #assessmentDynamicFields .assessment-input[data-field=heart_rate]", function () {
  updateAssessmentShockIndex();
});

$(document).on("change", ".treatment-choice", function () {
  normalizeTreatmentChoice(this);
});

$(document).on("click", "[data-toggle-treatment-section]", function () {
  const body = this.parentNode.querySelector("[data-treatment-section-body]");
  if (!body) return;
  body.classList.toggle("hidden");
  const indicator = this.querySelector(".treatment-toggle-indicator");
  if (indicator) indicator.textContent = body.classList.contains("hidden") ? "展开" : "收起";
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
    setMsg("newCaseMsg", "请填写姓名、性别、年龄、登记号", true);
    return;
  }
  $.post("/api/patients", {
    name: $("#newCaseName").val(),
    gender: $("#newCaseGender").val(),
    age: $("#newCaseAge").val(),
    phone: $("#newCasePhone").val(),
    id_number: $("#newCaseIdNumber").val(),
    case_status: "draft",
    case_integrity: "draft",
    last_disease_id: selectedDiseaseId || ""
  }).done(function (res) {
    resetNewCaseForm();
    $("#newCasePanel").addClass("hidden");
    loadCaseList();
    if (res.data && res.data.patient_id) {
      loadPatientDetail(res.data.patient_id);
    }
  }).fail(function (xhr) {
    setMsg("newCaseMsg", xhr.responseJSON?.message || "新建病例失败", true);
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
  if (tab === "assessment") {
    $("#detailAssessmentTab").removeClass("hidden");
    showAssessmentSubTab("list");
  }
  if (tab === "treat") {
    $("#detailTreatTab").removeClass("hidden");
    showTreatSubTab("list");
  }
  if (tab === "follow") {
    $("#detailFollowTab").removeClass("hidden");
    showFollowSubTab("list");
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
    diagnosis_record_id: selectedDiagnosis.value
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
    payload[field + "_details"] = JSON.stringify(collectTreatmentOptionDetails(field, selected));
  });
  $.post("/api/patients/" + currentPatientId + "/treatments", payload).done(function (res) {
    setMsg("treatMsg", res.message || "已保存");
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
