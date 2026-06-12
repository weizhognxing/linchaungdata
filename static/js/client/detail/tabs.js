// Patient detail tab switching: sub-tab visibility, diagnosis form helpers.
// Loaded as plain browser script; globals shared across client scripts.
function updatePatientDetailNotice(tab, isCompleteCase) {
  const message = isCompleteCase ? "当前病例为完整记录，提交后不能修改。" : (patientDetailNotices[tab || "base"] || patientDetailNotices.base);
  setMsg("patientDetailMsg", message, false);
}

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

function showLabSubTab(tab) {
  tab = tab || "list";
  document.querySelectorAll("#detailLabTab .inner-tab").forEach(function (button) {
    button.classList.toggle("active", button.getAttribute("data-lab-tab") === tab);
  });
  $("#labListPanel").toggleClass("hidden", tab !== "list");
  $("#labAddPanel").toggleClass("hidden", tab !== "add");
}

function showCaseSubTab(tab) {
  tab = tab || "draft";
  document.querySelectorAll("#caseListPanel .inner-tab").forEach(function (button) {
    button.classList.toggle("active", button.getAttribute("data-case-tab") === tab);
  });
  $("#caseDraftPanel").toggleClass("hidden", tab !== "draft");
  $("#caseCompletePanel").toggleClass("hidden", tab !== "complete");
}

function showDiagnosisSubTab(tab) {
  tab = tab || "list";
  document.querySelectorAll("#detailDiagnosisTab .inner-tab").forEach(function (button) {
    button.classList.toggle("active", button.getAttribute("data-diagnosis-tab") === tab);
  });
  $("#diagnosisListPanel").toggleClass("hidden", tab !== "list");
  $("#diagnosisAddPanel").toggleClass("hidden", tab !== "add");
}

function renderCaseCards(items, emptyText) {
  return (items || []).map(function (item) {
    const disease = item.disease_name ? ' ｜ 疾病：' + item.disease_name : '';
    const isComplete = getCaseIntegrity(item) === 'complete';
    const status = isComplete ? '完整记录' : '暂存记录';
    const actionText = isComplete ? '查看' : '继续完善';
    const statusClass = isComplete ? 'case-badge-complete' : 'case-badge-draft';
    return '<div class="case-item" data-id="' + item.id + '">' +
      '<div class="case-head"><strong>' + (item.name || '-') + '</strong><span class="case-badge ' + statusClass + '">' + status + '</span><button class="btn-sm view-case-btn" data-id="' + item.id + '">' + actionText + '</button></div>' +
      '<div class="case-meta">性别：' + (item.gender || '-') + ' ｜ 年龄：' + (item.age || '-') + ' ｜ 登记号：' + (item.id_number || '-') + disease + '</div>' +
      '<div class="case-meta">记录完整性：' + status + ' ｜ 已录入 ' + Number(item.record_count || 0) + ' 条检验记录</div>' +
      '</div>';
  }).join('') || '<div class="detail-item">' + emptyText + '</div>';
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

function normalizeDateTimeLocalValue(value) {
  value = String(value || "").trim();
  if (!value) return "";
  return value.replace(" ", "T").slice(0, 16);
}

function resolveBaseInfoInputType(field) {
  const fieldName = String(field.field_name || "").toLowerCase();
  const label = String(field.form_label || "");
  const dataType = String(field.data_type || field.type || "").toLowerCase();
  if (label === "入院时间" || fieldName.indexOf("admission") > -1 || dataType === "datetime") return "datetime-local";
  if (dataType === "date") return "date";
  if (dataType === "int" || dataType === "decimal" || dataType === "number") return "number";
  return field.type || "text";
}

function resolveBaseInfoValue(field) {
  const value = field.value;
  const inputType = resolveBaseInfoInputType(field);
  if (inputType === "datetime-local") return normalizeDateTimeLocalValue(value);
  return value;
}
