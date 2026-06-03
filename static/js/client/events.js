// All user event bindings after helper functions have been defined.
// Loaded as a plain browser script; globals are shared across client scripts.
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
      openNewCaseForm();
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
  const labUploadDiseaseButton = event.target && event.target.closest ? event.target.closest(".lab-upload-disease-item") : null;
  if (labUploadDiseaseButton) {
    event.preventDefault();
    const labContext = resolveLabUploadContextFromButton(labUploadDiseaseButton);
    if (!finishLabDiseaseSelection(labUploadDiseaseButton.getAttribute("data-id"), labContext)) {
      clearDiseaseSelectionContext();
      setMsg("caseListMsg", "请先从病例详情的检验添加入口上传检验单。", true);
      showPanel("caseListPanel");
    }
    return;
  }

  const diseaseButton = event.target && event.target.closest ? event.target.closest(".disease-item") : null;
  if (!diseaseButton) return;
  if (diseaseButton.classList.contains("lab-upload-disease-item")) return;
  event.preventDefault();
  const activeLabContext = getActiveLabUploadContext();
  if (finishLabDiseaseSelection(diseaseButton.getAttribute("data-id"), activeLabContext)) {
    return;
  }
  if (activeLabContext) {
    clearDiseaseSelectionContext();
  }
  selectedDiseaseId = diseaseButton.getAttribute("data-id");
  localStorage.setItem("selectedDiseaseId", selectedDiseaseId);
  setMsg("caseListMsg", "请从病例详情的检验添加入口上传检验单。", true);
  showPanel("caseListPanel");
});

// 拍照/上传：点击按钮触发隐藏的 file input
// 文件选择变化时自动识别
function bindFileInputs() {
  document.getElementById("photoInputCamera").addEventListener("change", handleFileSelect);
  document.getElementById("photoInputFile").addEventListener("change", handleFileSelect);
}

async function handleFileSelect(e) {
  if (!selectedDiseaseId || selectedDiseaseId === "null") {
    alert("请先选择疾病");
    if (currentUploadMode === "lab" && currentUploadPatientId) {
      openDiseaseSelectionForLabUpload(currentUploadPatientId, currentRecordCategory, currentCategoryLabel);
    } else {
      showPanel("caseListPanel");
    }
    return;
  }
  if (e.target.files && e.target.files[0]) {
    const originalFile = e.target.files[0];
    const token = ++fileSelectToken;
    selectedFile = null;
    $("#confirmUploadBtn").addClass("hidden");
    $("#previewContainer").addClass("hidden");
    setMsg("photoMsg", "正在检查并压缩图片，请稍候...", false);

    try {
      const compressedFile = await compressImageToTarget(originalFile);
      if (token !== fileSelectToken) return;
      selectedFile = compressedFile;
      showPreview(selectedFile);
      const sizeText = formatFileSize(originalFile.size) + " -> " + formatFileSize(selectedFile.size);
      setMsg("photoMsg", "图片已检查并压缩（" + sizeText + "），请点击确定开始上传识别。", false);
      $("#confirmUploadBtn").removeClass("hidden");
    } catch (err) {
      if (token !== fileSelectToken) return;
      selectedFile = null;
      setMsg("photoMsg", "图片压缩失败，请重新选择图片。", true);
    }
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
  if (this.disabled) return;
  const patient = {
    name: $("[name=patient_name]").val(),
    gender: $("[name=patient_gender]").val(),
    age: $("[name=patient_age]").val(),
    phone: $("[name=patient_phone]").val(),
    id_number: $("[name=patient_id_number]").val()
  };
  if (!currentUploadPatientId && !patient.name) {
    setMsg("recordMsg", "请先确认姓名", true);
    return;
  }
  if (currentUploadMode === "intake" && (!patient.name || !patient.gender || !patient.age)) {
    setMsg("recordMsg", "请先确认姓名、性别、年龄", true);
    return;
  }
  setSaveRecordButtonSaving(true);
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
        require_age: 1,
        require_id_number: 0
      })
    }).done(function (res) {
      setMsg("recordMsg", "暂存病例已创建");
      loadCaseList();
      if (res.data && res.data.patient_id) {
        currentUploadPatientId = res.data.patient_id;
        loadPatientDetail(res.data.patient_id, "base");
      }
    }).fail(function (xhr) {
      setMsg("recordMsg", xhr.responseJSON?.message || "创建暂存病例失败", true);
      setSaveRecordButtonSaving(false);
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
    loadDiseases();
    loadCaseList();
    const savedPatientId = (res.data && res.data.patient_id) || currentUploadPatientId;
    if (savedPatientId) {
      currentUploadPatientId = savedPatientId;
      loadPatientDetail(savedPatientId, "lab", "add");
    }
  }).fail(function (xhr) {
    setMsg("recordMsg", xhr.responseJSON?.message || "保存失败", true);
    setSaveRecordButtonSaving(false);
  });
});

$(document).on("click", ".case-item", function () {
  loadPatientDetail($(this).data("id"));
});

$(document).on("click", ".view-case-btn", function (event) {
  event.stopPropagation();
  loadPatientDetail($(this).data("id"));
});

$(document).on("click", ".lab-category-upload-btn", function (event) {
  event.preventDefault();
  event.stopPropagation();
  const patientId = this.getAttribute("data-patient-id") || currentPatientId;
  const category = this.getAttribute("data-category") || "";
  const label = this.getAttribute("data-label") || "检验";
  openDiseaseSelectionForLabUpload(patientId, category, label);
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

$(document).on("click", "#innerBackBtn", function () {
  backFromInnerPage();
});

$(document).on("click", "#exportCasesBtn", function () {
  const button = this;
  button.disabled = true;
  button.textContent = "导出中";
  setMsg("caseListMsg", "正在准备导出文件，请稍候...", false);
  window.location.href = "/api/cases/export";
  setTimeout(function () {
    button.disabled = false;
    button.textContent = "导出数据";
    setMsg("caseListMsg", "", false);
  }, 3000);
});

$(document).on("click", "#caseListPanel .inner-tab", function () {
  showCaseSubTab(this.getAttribute("data-case-tab"));
});

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

$(document).on("input", "#assessmentDynamicFields .assessment-kpa-input", function () {
  updateAssessmentOxygenFromKpa();
});

$(document).on("input", "#followDynamicFields .followup-input[data-field=prognosis]", function () {
  updateFollowupPrognosisState();
});

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

function updateTreatmentExtraPlaceholder(input) {
  const wrapper = input && input.parentNode;
  if (wrapper) wrapper.classList.toggle("has-value", !!input.value);
}

$(document).on("click", ".detail-tab", function () {
  const tab = this.getAttribute("data-detail-tab");
  $(".detail-tab").removeClass("active");
  $(this).addClass("active");
  $(".detail-tab-page").addClass("hidden");
  if (tab === "base") $("#detailBaseTab").removeClass("hidden");
  if (tab === "diagnosis") $("#detailDiagnosisTab").removeClass("hidden");
  if (tab === "lab") {
    $("#detailLabTab").removeClass("hidden");
    showLabSubTab("list");
  }
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

$(document).on("click", "#detailLabTab .inner-tab", function () {
  showLabSubTab(this.getAttribute("data-lab-tab"));
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
  const payload = { diagnosis_record_id: selectedDiagnosis.value };
  let missing = [];
  $("#followDynamicFields .followup-input").each(function () {
    payload[this.getAttribute("data-field")] = $(this).val();
    if (!this.disabled && !$(this).val()) missing.push($(this).closest(".form-field").querySelector("label").textContent.replace(" *", ""));
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
  updateAssessmentOxygenFromKpa();
  const payload = {
    diagnosis_record_id: selectedDiagnosis.value,
    assessment_time: $("#assessmentTime").val() || new Date().toISOString().slice(0, 16)
  };
  let assessmentMissing = [];
  $("#assessmentDynamicFields .assessment-input").each(function () {
    payload[this.getAttribute("data-field")] = $(this).val();
    if (!$(this).val()) assessmentMissing.push($(this).closest(".form-field").querySelector("label").textContent.replace(" *", ""));
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
