// Shared client state, navigation, disease selection, and small utilities.
// Loaded as a plain browser script; globals are shared across client scripts.
let selectedDiseaseId = null;
let uploadedPhotoPath = null;
let selectedFile = null;
let canReviewMembers = false;
let currentPatientId = null;
let currentUploadMode = "intake";
let currentUploadPatientId = null;
let currentRecordCategory = null;
let currentCategoryLabel = "";
let pendingLabUploadPatientId = null;
let pendingLabUploadCategory = "";
let pendingLabUploadLabel = "";
let diseaseSelectionPurpose = "";
const saveRecordButtonText = "保存信息";
const photoTargetBytes = 100 * 1024;
const photoTargetMaxBytes = 115 * 1024;
let fileSelectToken = 0;

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
    $("#photoPanelTitle").text("上传检验图片");
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
    if ((id === "recordPanel" || id === "photoPanel") && currentUploadMode === "intake") {
      $(".nav-item[data-nav='newCase']").addClass("active");
    }
    if ((id === "recordPanel" || id === "photoPanel") && currentUploadMode !== "intake") {
      $(".nav-item[data-nav='caseListPanel']").addClass("active");
    }
    if (id === "diseasePanel" && isDiseasePanelLabMode()) {
      $(".nav-item[data-nav='caseListPanel']").addClass("active");
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
  if (id === "diseasePanel") {
    loadDiseases();
  }
  if (id === "caseListPanel") {
    loadCaseList();
  }
}

function setMsg(id, text, error) {
  $("#" + id).text(text).toggleClass("error", !!error);
}

function saveLabUploadContext(patientId, categoryKey, categoryLabel) {
  localStorage.setItem("labUploadContext", JSON.stringify({
    patientId: patientId || "",
    categoryKey: categoryKey || "",
    categoryLabel: categoryLabel || "检验"
  }));
}

function loadLabUploadContext() {
  try {
    return JSON.parse(localStorage.getItem("labUploadContext") || "{}") || {};
  } catch (e) {
    return {};
  }
}

function clearLabUploadContext() {
  localStorage.removeItem("labUploadContext");
}

function isDiseasePanelLabMode() {
  const labContext = loadLabUploadContext();
  return diseaseSelectionPurpose === "labUpload" || currentUploadMode === "lab" || !!labContext.patientId;
}

function clearDiseaseSelectionContext() {
  pendingLabUploadPatientId = null;
  pendingLabUploadCategory = "";
  pendingLabUploadLabel = "";
  diseaseSelectionPurpose = "";
  clearLabUploadContext();
}

function resolveLabUploadContextFromButton(btn) {
  const directContext = {
    patientId: btn.getAttribute("data-patient-id") || "",
    category: btn.getAttribute("data-category") || "",
    label: btn.getAttribute("data-label") || "检验"
  };
  const labContext = loadLabUploadContext();
  const backupContext = {
    patientId: labContext.patientId || pendingLabUploadPatientId || currentUploadPatientId || "",
    category: labContext.categoryKey || pendingLabUploadCategory || currentRecordCategory || "",
    label: labContext.categoryLabel || pendingLabUploadLabel || currentCategoryLabel || "检验"
  };
  return {
    patientId: directContext.patientId || backupContext.patientId,
    category: directContext.category || backupContext.category,
    label: directContext.label || backupContext.label
  };
}

function getActiveLabUploadContext() {
  const labContext = loadLabUploadContext();
  const patientId = labContext.patientId || pendingLabUploadPatientId || currentUploadPatientId;
  if (!patientId) return null;
  if (!isDiseasePanelLabMode() && currentUploadMode !== "lab") return null;
  return {
    patientId: patientId,
    category: labContext.categoryKey || pendingLabUploadCategory || currentRecordCategory || "",
    label: labContext.categoryLabel || pendingLabUploadLabel || currentCategoryLabel || "检验"
  };
}

function finishLabDiseaseSelection(diseaseId, labContext) {
  if (!diseaseId || !labContext || !labContext.patientId) return false;
  selectedDiseaseId = diseaseId;
  localStorage.setItem("selectedDiseaseId", selectedDiseaseId);
  clearDiseaseSelectionContext();
  startLabCategoryUpload(labContext.patientId, labContext.category, labContext.label);
  return true;
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
    const labContext = loadLabUploadContext();
    const isLabUploadSelection = isDiseasePanelLabMode();
    $("#diseaseTotalCount").text(`总共录入${total}人`);
    const html = diseases.map(function (d) {
      const count = Number(d.patient_count || 0);
      const buttonClass = isLabUploadSelection ? "lab-upload-disease-item" : "disease-item";
      const patientId = labContext.patientId || pendingLabUploadPatientId || currentUploadPatientId || "";
      const category = labContext.categoryKey || pendingLabUploadCategory || currentRecordCategory || "";
      const label = labContext.categoryLabel || pendingLabUploadLabel || currentCategoryLabel || "检验";
      const uploadAttrs = isLabUploadSelection
        ? ` data-patient-id="${patientId}" data-category="${category}" data-label="${label}"`
        : "";
      return `<button type="button" class="${buttonClass}" data-id="${d.id}"${uploadAttrs}><span class="disease-name">${d.name}</span><span class="disease-count">已录入${count}人</span></button>`;
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
      $("#caseDraftList").html(renderCaseCards(groups.draft, "暂无暂存病例"));
      $("#caseCompleteList").html(renderCaseCards(groups.complete || groups.submitted, "暂无完整病例"));
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
  currentUploadMode = "intake";
  currentUploadPatientId = null;
  currentRecordCategory = null;
  currentCategoryLabel = "";
  clearDiseaseSelectionContext();
  uploadedPhotoPath = null;
  selectedFile = null;
  selectedDiseaseId = null;
  localStorage.removeItem("selectedDiseaseId");
  resetRecordForm();
  $("#recordPanelTitle").text("新建病例");
  $("#recordPanelHint").text("请填写姓名、性别、年龄。系统会根据姓名、性别、年龄判断是否重复添加病例。");
  $("#labFieldsSection").addClass("hidden");
  $("[name=patient_phone], [name=patient_id_number]").addClass("hidden");
  $("#saveRecordBtn").text("保存信息");
  showPanel("recordPanel");
}

function openDiseaseSelectionForLabUpload(patientId, categoryKey, categoryLabel) {
  diseaseSelectionPurpose = "labUpload";
  pendingLabUploadPatientId = patientId;
  pendingLabUploadCategory = categoryKey || "";
  pendingLabUploadLabel = categoryLabel || "检验";
  saveLabUploadContext(patientId, categoryKey, categoryLabel);
  currentUploadMode = "lab";
  currentUploadPatientId = patientId;
  currentRecordCategory = categoryKey || "";
  currentCategoryLabel = pendingLabUploadLabel;
  selectedDiseaseId = null;
  localStorage.removeItem("selectedDiseaseId");
  $("#diseasePanel h2").html('选择疾病 <span id="diseaseTotalCount" class="disease-total">总共录入0人</span>');
  $("#diseasePanel .hint").text("请选择本次检验对应的疾病，系统会按所选疾病表单展示识别结果。选择后再拍照或上传图片。");
  showPanel("diseasePanel");
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
      '<button type="button" class="btn-sm secondary delete-diagnosis-btn" data-id="' + record.id + '">删除</button>' +
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
    if (currentUploadMode === "intake" && !uploadedPhotoPath) showPanel("caseListPanel");
    else showPanel("photoPanel");
    return;
  }
  if (currentPanelId === "photoPanel") {
    if (currentUploadMode === "lab" && currentUploadPatientId) loadPatientDetail(currentUploadPatientId, "lab");
    else showPanel("diseasePanel");
    return;
  }
  showPanel("caseListPanel");
}
