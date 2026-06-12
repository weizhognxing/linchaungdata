// Detail save/edit events: base info, diagnosis, patient creation.
// Loaded as plain browser script; globals shared across client scripts.
function setBaseInfoButtonSaving(saving) {
  const button = document.getElementById("saveBaseInfoBtn");
  if (!button) return;
  button.disabled = !!saving;
  button.textContent = saving ? "保存中" : "保存基础信息";
}

$(document).on("click", "#saveBaseInfoBtn", function () {
  if (!currentPatientId) return;
  const payload = {};
  let missingFields = [];
  $("#baseInfoList .base-info-input").each(function () {
    payload[this.getAttribute("data-field")] = $(this).val();
    const fieldName = this.getAttribute("data-field");
    if (["name", "gender", "age"].indexOf(fieldName) > -1 && !$(this).val()) {
      missingFields.push($(this).prev("label").text().replace(" *", ""));
    }
  });
  if (missingFields.length) {
    setMsg("baseInfoMsg", "请填写：" + missingFields.join("、"), true);
    return;
  }
  setBaseInfoButtonSaving(true);
  $.post("/api/patients/" + currentPatientId, payload)
    .done(function (res) {
      setMsg("baseInfoMsg", res.message || "基础信息已保存");
      loadPatientDetail(currentPatientId, "base");
    })
    .fail(function (xhr) {
      setMsg("baseInfoMsg", xhr.responseJSON?.message || "基础信息保存失败", true);
    })
    .always(function () {
      setBaseInfoButtonSaving(false);
    });
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

$(document).on("click", ".delete-diagnosis-btn", function (event) {
  event.stopPropagation();
  if (!currentPatientId) return;
  const diagnosisId = this.getAttribute("data-id");
  if (!confirm("确认删除这条诊断记录？仅无对应检验、随访、治疗、评估数据时可删除。")) return;
  $.ajax({ url: "/api/patients/" + currentPatientId + "/diagnosis-records/" + diagnosisId, method: "DELETE" })
    .done(function (res) {
      setMsg("diagnosisMsg", res.message || "诊断记录已删除");
      loadPatientDetail(currentPatientId, "diagnosis");
    })
    .fail(function (xhr) {
      setMsg("diagnosisMsg", xhr.responseJSON?.message || "诊断记录删除失败", true);
    });
});
