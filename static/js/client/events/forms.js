// Form event bindings: treatment, followup, assessment selection & save, input handlers.
// Loaded as plain browser script; globals shared across client scripts.
$(document).on("change", "[name=selectedDiagnosisRecordFollow]", function () {
  $("#followFormPanel").removeClass("hidden");
  renderFollowupFields(this.getAttribute("data-disease") || "");
});

$(document).on("change", "[name=selectedDiagnosisRecordTreat]", function () {
  $("#treatFormPanel").removeClass("hidden");
  renderTreatmentFields(getDiagnosisOptionDisease(this));
});

$(document).on("change", "[name=selectedDiagnosisRecordAssessment]", function () {
  $("#assessmentFormPanel").removeClass("hidden");
  renderAssessmentFields(this.getAttribute("data-disease") || "");
});

document.addEventListener("change", function (event) {
  if (event.target && event.target.name === "selectedDiagnosisRecordTreat") {
    $("#treatFormPanel").removeClass("hidden");
    renderTreatmentFields(getDiagnosisOptionDisease(event.target));
  }
  if (event.target && event.target.name === "selectedDiagnosisRecordFollow") {
    $("#followFormPanel").removeClass("hidden");
    renderFollowupFields(event.target.getAttribute("data-disease") || "");
  }
  if (event.target && event.target.name === "selectedDiagnosisRecordAssessment") {
    $("#assessmentFormPanel").removeClass("hidden");
    renderAssessmentFields(event.target.getAttribute("data-disease") || "");
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

$(document).on("input", "#assessmentDynamicFields .assessment-input[data-field=systolic_bp], #assessmentDynamicFields .assessment-input[data-field=heart_rate]", function () {
  updateAssessmentShockIndex();
});

$(document).on("input", "#assessmentDynamicFields .assessment-kpa-input", function () {
  updateAssessmentOxygenFromKpa();
});

$(document).on("input", "#assessmentDynamicFields .assessment-input[data-field=oxygen_partial_pressure]", function () {
  updateAssessmentOxygenFromMmhg();
});

$(document).on("input change", "#followDynamicFields .followup-input[data-field=prognosis]", function () {
  updateFollowupPrognosisState();
});

function updateTreatmentExtraPlaceholder(input) {
  const wrapper = input && input.parentNode;
  if (wrapper) wrapper.classList.toggle("has-value", !!input.value);
}

$(document).on("change", ".treatment-choice", function () {
  normalizeTreatmentChoice(this);
});

$(document).on("input", ".treatment-option-extra", function () {
  updateTreatmentExtraPlaceholder(this);
});

$(document).on("change", ".treatment-option-extra", function () {
  updateTreatmentExtraPlaceholder(this);
});

$(document).on("click", "[data-toggle-treatment-section]", function () {
  const body = this.parentNode.querySelector("[data-treatment-section-body]");
  if (!body) return;
  body.classList.toggle("hidden");
  const indicator = this.querySelector(".treatment-toggle-indicator");
  if (indicator) indicator.textContent = body.classList.contains("hidden") ? "展开" : "收起";
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
    const details = collectTreatmentOptionDetails(field, selected);
    payload[field] = selected.join(",");
    payload[field + "_details"] = JSON.stringify(details);
    details.forEach(function (item) {
      Object.keys(item.details || {}).forEach(function (detailField) {
        if (!payload[detailField] && item.details[detailField]) payload[detailField] = item.details[detailField];
      });
    });
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
  const payload = { diagnosis_record_id: selectedDiagnosis.value };
  let missing = [];
  $("#followDynamicFields .followup-input").each(function () {
    payload[this.getAttribute("data-field")] = $(this).val();
    if (!this.disabled && !$(this).val()) {
      const field = this.closest(".form-field");
      const label = field ? field.querySelector("label") : null;
      missing.push(label ? label.textContent.replace(" *", "") : this.getAttribute("data-field"));
    }
  });
  if (missing.length) {
    setMsg("followMsg", "请填写：" + missing.join("、"), true);
    return;
  }
  $.getJSON("/api/patients/" + currentPatientId + "/completion-missing").always(function (res) {
    const data = res && res.responseJSON ? res.responseJSON : res;
    const missingSteps = ((data || {}).data || {}).missing || [];
    const beforeFollowMissing = missingSteps.filter(function (item) { return item !== "随访"; });
    const message = beforeFollowMissing.length
      ? "该记录还有以下步骤未完成：" + beforeFollowMissing.join("、") + "。随访提交后不能修改，是否继续提交？"
      : "前置步骤已完成。随访提交后不能修改，提交后符合完整条件会进入完整记录，是否继续提交？";
    if (!confirm(message)) return;
    $.post("/api/patients/" + currentPatientId + "/followups", payload).done(function (saveRes) {
      setMsg("followMsg", saveRes.message || "已保存");
      $("#followDynamicFields").html("");
      loadPatientDetail(currentPatientId, "follow");
      loadCaseList();
    }).fail(function (xhr) {
      setMsg("followMsg", xhr.responseJSON?.message || "保存失败", true);
    });
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
  if ($("#assessmentDynamicFields .assessment-kpa-input").val()) updateAssessmentOxygenFromKpa();
  else updateAssessmentOxygenFromMmhg();
  const payload = {
    diagnosis_record_id: selectedDiagnosis.value,
    assessment_time: $("#assessmentTime").val() || new Date().toISOString().slice(0, 16)
  };
  let assessmentMissing = [];
  $("#assessmentDynamicFields .assessment-input").each(function () {
    payload[this.getAttribute("data-field")] = $(this).val();
    if (!$(this).val()) {
      const field = this.closest(".form-field");
      const label = field ? field.querySelector("label") : null;
      assessmentMissing.push(label ? label.textContent.replace(" *", "") : this.getAttribute("data-field"));
    }
  });
  if (assessmentMissing.length) {
    setMsg("assessmentMsg", "请填写：" + assessmentMissing.join("、"), true);
    return;
  }
  $.post("/api/patients/" + currentPatientId + "/assessments", payload).done(function (res) {
    setMsg("assessmentMsg", res.message || "已保存");
    $("#assessmentTime").val("");
    $("#assessmentDynamicFields").html("");
    loadPatientDetail(currentPatientId, "assessment");
  }).fail(function (xhr) {
    setMsg("assessmentMsg", xhr.responseJSON?.message || "保存失败", true);
  });
});
