// Record & lab events: save record, disease buttons, lab upload, photo file select.
// Loaded as plain browser script; globals shared across client scripts.
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

$(document).on("click", "#retryBtn", function () {
  if (selectedFile) {
    autoRecognize();
  }
});

$(document).on("click", "#confirmUploadBtn", function () {
  autoRecognize();
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
      loadPatientDetail(savedPatientId, "lab");
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
