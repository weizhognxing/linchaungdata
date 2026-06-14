// Case/disease state management: lab upload context, disease/case loading,
// new case form, diagnosis record list rendering and navigation helpers.
// Loaded as plain browser script; globals shared across client scripts.

// --- Lab upload context ---
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
  labContext = labContext || getActiveLabUploadContext() || {};
  labContext.patientId = labContext.patientId || currentUploadPatientId || currentPatientId;
  if (!diseaseId || !labContext.patientId) return false;
  selectedDiseaseId = diseaseId;
  localStorage.setItem("selectedDiseaseId", selectedDiseaseId);
  clearDiseaseSelectionContext();
  startLabCategoryUpload(labContext.patientId, labContext.category, labContext.label);
  return true;
}

// --- Disease selection ---
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
      const buttonClass = isLabUploadSelection ? "disease-item lab-upload-disease-item" : "disease-item";
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

// --- Case list ---
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

function renderNewCaseResearchNotice() {
  return '<ol class="research-notice-list">' +
    '<li>尊敬的教授：该PICCO平台为西南医科大学附属医院急诊联盟内部科研合作共享平台。平台内数据填报要求真实、可以溯源。填报数据未完成提交前只能自己看见患者个人信息，后续平台对于下载数据要对患者个人信息脱敏处理。联盟内部数据严格保密，不得买卖、不得泄露。如有疑问或建议请与胡迎春（15228232720）联系。</li>' +
    '<li>本平台专注于急诊EICU常见危重病；为多中心、前瞻性、真实世界队列研究，非干预性研究。主要采集入院24小时内的临床信息与血液标本、28天预后。基因测序样本需要统一采用PAXgene管收集；血浆样本需要离心后只保存血浆；并请本院保存于-80℃</li>' +
    '<li>各种疾病纳入标准诊断依据临床医学客观事实。入组时需要排除诊断：肿瘤患者、HIV患者、怀孕患者、免疫性疾病患者；因为各种因素签字退出研究的患者。</li>' +
    '<li>请PI自行提前按照国家要求完成临床IIT研究的相关流程。</li>' +
    '</ol>';
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
  $("#recordPanelHint").html(renderNewCaseResearchNotice());
  $("#labFieldsSection").addClass("hidden");
  $("[name=patient_phone], [name=patient_id_number]").addClass("hidden");
  $("#saveRecordBtn").text("保存信息");
  showPanel("recordPanel");
}

function openDiseaseSelectionForLabUpload(patientId, categoryKey, categoryLabel) {
  patientId = patientId || currentPatientId;
  if (!patientId) {
    setMsg("patientDetailMsg", "请先进入病例详情后再上传检验单。", true);
    showPanel("caseListPanel");
    return;
  }
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

// --- Diagnosis record list & helpers ---
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
  if (currentPanelId === "labReportPanel" || currentPanelId === "careReportPanel") {
    if (currentPatientId) loadPatientDetail(currentPatientId, currentPanelId === "careReportPanel" ? (currentCareDetailTab || "treat") : "lab");
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
