// Photo selection, compression, AI recognition, and upload-mode transitions.
// Loaded as a plain browser script; globals are shared across client scripts.
function initPhotoPanel() {
  selectedFile = null;
  $("#previewContainer").addClass("hidden");
  $("#photoActions").removeClass("hidden");
  $("#recognizeProgress").addClass("hidden");
  $("#confirmUploadBtn").addClass("hidden");
  $("#retryBtn").addClass("hidden");
  $("#photoMsg").text("");
  $("#previewImage").attr("src", "");
  $("[name=patient_phone], [name=patient_id_number]").removeClass("hidden");
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

function formatFileSize(bytes) {
  if (!bytes && bytes !== 0) return "-";
  return Math.round(bytes / 1024) + "KB";
}

function canvasToBlob(canvas, quality) {
  return new Promise(function (resolve) {
    canvas.toBlob(resolve, "image/jpeg", quality);
  });
}

function loadImageFromFile(file) {
  return new Promise(function (resolve, reject) {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = function () {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = function () {
      URL.revokeObjectURL(url);
      reject(new Error("图片读取失败"));
    };
    image.src = url;
  });
}

function makeCompressedFile(blob, sourceFile) {
  const baseName = String(sourceFile.name || "lab-photo").replace(/\.[^.]+$/, "");
  try {
    return new File([blob], baseName + ".jpg", { type: "image/jpeg", lastModified: Date.now() });
  } catch (err) {
    blob.name = baseName + ".jpg";
    return blob;
  }
}

async function compressImageToTarget(file) {
  if (!file || !String(file.type || "").startsWith("image/")) return file;
  if (file.size <= photoTargetMaxBytes) return file;

  const image = await loadImageFromFile(file);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  if (!sourceWidth || !sourceHeight) return file;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const maxSide = Math.max(sourceWidth, sourceHeight);
  let bestBlob = null;

  for (let scale = 1; scale >= 0.35; scale -= 0.1) {
    const sideScale = Math.min(1, 1700 / maxSide) * scale;
    canvas.width = Math.max(1, Math.round(sourceWidth * sideScale));
    canvas.height = Math.max(1, Math.round(sourceHeight * sideScale));
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    let low = 0.45;
    let high = 0.92;
    let candidate = null;
    for (let i = 0; i < 7; i++) {
      const quality = (low + high) / 2;
      const blob = await canvasToBlob(canvas, quality);
      if (!blob) break;
      if (!bestBlob || Math.abs(blob.size - photoTargetBytes) < Math.abs(bestBlob.size - photoTargetBytes)) {
        bestBlob = blob;
      }
      if (blob.size > photoTargetMaxBytes) {
        high = quality;
      } else {
        candidate = blob;
        low = quality;
      }
    }
    if (candidate) return makeCompressedFile(candidate, file);
  }

  return bestBlob ? makeCompressedFile(bestBlob, file) : file;
}

function resetRecordForm() {
  $("[name=patient_name], [name=patient_gender], [name=patient_age], [name=patient_phone], [name=patient_id_number]").val("");
  $("#dynamicFields").html("");
  $("#recordPanelHint").text("");
  setMsg("recordMsg", "", false);
  setSaveRecordButtonSaving(false);
}

function setSaveRecordButtonSaving(saving) {
  const button = document.getElementById("saveRecordBtn");
  if (!button) return;
  button.disabled = !!saving;
  button.textContent = saving ? "保存中" : saveRecordButtonText;
}

function openPhotoPanelForIntake() {
  currentUploadMode = "intake";
  currentUploadPatientId = null;
  currentRecordCategory = null;
  currentCategoryLabel = "检验";
  initPhotoPanel();
  initPhotoButtons();
  $("#photoPanelTitle").text("拍照新建病例");
  setMsg("photoMsg", "选择图片后仅识别姓名、性别、年龄，用于新建暂存病例。", false);
  showPanel("photoPanel");
}

function startLabCategoryUpload(patientId, categoryKey, categoryLabel) {
  currentUploadMode = "lab";
  currentUploadPatientId = patientId;
  currentRecordCategory = categoryKey || "";
  currentCategoryLabel = categoryLabel || "检验";
  initPhotoPanel();
  initPhotoButtons();
  $("#photoPanelTitle").text("上传检验单");
  setMsg("photoMsg", "选择图片后点击确定，系统会提取图片上的实际检验名称和检验指标，不会强制归到七类检验。", false);
  showPanel("photoPanel");
}

function triggerPhotoChooser() {
  const targetInput = isMobile() ? document.getElementById("photoInputCamera") : document.getElementById("photoInputFile");
  if (!targetInput) return;
  targetInput.click();
}

function normalizeLabCategoryName(value) {
  value = String(value || "").trim().toLowerCase().replace(/\s+/g, "");
  if (!value) return "";
  if (value.indexOf("血细胞分析") > -1 || value.indexOf("血" + "常规") > -1 || value === "blood_routine") return "blood_routine";
  if (value.indexOf("生化") > -1 || value.indexOf("电解质") > -1 || value === "biochemistry") return "biochemistry";
  if (value.indexOf("血气") > -1 || value === "blood_gas") return "blood_gas";
  if (value.indexOf("dic") > -1 || value.indexOf("凝血") > -1 || value === "dic7") return "dic7";
  if (value.indexOf("bnp") > -1 || value.indexOf("b型钠尿肽") > -1 || value.indexOf("nt-pro") > -1) return "bnp";
  if (value.indexOf("乳酸") > -1 || value === "lactate" || value === "lac") return "lactate";
  if (value.indexOf("pct") > -1 || value.indexOf("降钙素原") > -1) return "pct";
  return "";
}

function getUploadedLabCategoryKeys(records) {
  const keys = [];
  (records || []).forEach(function (record) {
    const candidates = [record.record_category, record.lab_test_name];
    candidates.forEach(function (candidate) {
      const key = normalizeLabCategoryName(candidate);
      if (key && keys.indexOf(key) === -1) keys.push(key);
    });
  });
  return keys;
}

function renderLabCategoryActions(patient, records) {
  const uploadedKeys = getUploadedLabCategoryKeys(records);
  const missingCategories = labCategories.filter(function (category) {
    return uploadedKeys.indexOf(category.key) === -1;
  });
  const uploadedCount = labCategories.length - missingCategories.length;
  const summary = missingCategories.length
    ? '已上传 ' + uploadedCount + '/' + labCategories.length + ' 类检验类别，还缺 ' + missingCategories.length + ' 类：' + missingCategories.map(function (category) { return category.label; }).join('、')
    : '7类检验类别已全部上传。';
  $("#labCategorySummary").html('<div class="detail-item lab-missing-summary">' + summary + '</div>');
  const html = '<button class="btn-sm lab-category-upload-btn" data-patient-id="' + patient.id + '" data-category="" data-label="检验">上传检验单</button>';
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

function setRecognizeBlocking(blocked) {
  $("#recognizeBlockingOverlay").toggleClass("hidden", !blocked);
}

// 自动识别函数
function autoRecognize() {
  if (!selectedFile) return;
  if (currentUploadMode === "lab" && !currentUploadPatientId) {
    setMsg("photoMsg", "请先从病例详情进入上传检验单。", true);
    return;
  }
  if (!selectedDiseaseId || selectedDiseaseId === "null") {
    alert("请先选择疾病");
    if (currentUploadMode === "lab" && currentUploadPatientId) {
      openDiseaseSelectionForLabUpload(currentUploadPatientId, currentRecordCategory, currentCategoryLabel);
    } else {
      showPanel("caseListPanel");
    }
    return;
  }
  setRecognizeBlocking(true);

  // 显示识别中状态
  showRecognizeProgress(1, 3, "正在上传图片...");
  $("#photoActions").addClass("hidden");
  $("#confirmUploadBtn").addClass("hidden");
  $("#previewContainer").addClass("hidden");
  $("#retryBtn").addClass("hidden");
  $("#photoMsg").text("");

  var data = new FormData();
  data.append("disease_id", selectedDiseaseId);
  data.append("photo", selectedFile, selectedFile.name || "lab-photo.jpg");
  data.append("mode", currentUploadMode === "lab" ? "lab" : "intake");
  if (currentRecordCategory) data.append("record_category", currentRecordCategory);
  if (currentUploadPatientId) data.append("patient_id", currentUploadPatientId);

  showRecognizeProgress(2, 3, "正在调用AI识别...");

  $.ajax({ url: "/api/recognize", method: "POST", data, processData: false, contentType: false, timeout: 420000 })
    .done(function (res) {
      showRecognizeProgress(3, 3, "识别完成，正在填充表单...");
      uploadedPhotoPath = res.data.photo_path;
      resetRecordForm();
      fillPatientForm(res.data.patient);

      var recognizedValues = res.data.values || {};
      var recognizedFields = (res.data.fields || []).filter(function (f) {
        var value = recognizedValues[f.field_name];
        return value !== null && value !== undefined && String(value).trim() !== "";
      });
      var html = recognizedFields.map(function(f) {
        var value = recognizedValues[f.field_name];
        return '<div class="form-field"><label>' + f.form_label + '</label><input name="' + f.field_name + '" value="' + value + '" placeholder="' + f.form_label + '"></div>';
      }).join("");
      $("#dynamicFields").html(html || '<div class="detail-item">未识别到检验指标</div>');

      if (currentUploadMode === "intake") {
        $("#recordPanelTitle").text("确认基础信息");
        $("#recordPanelHint").text("当前步骤仅提取姓名、性别、年龄，确认后会创建暂存病例。后续请在病例中继续补录基础信息、诊断、检验、评估、治疗和随访。");
        $("#labFieldsSection").addClass("hidden");
        $("[name=patient_phone], [name=patient_id_number]").addClass("hidden");
        $("#saveRecordBtn").text("保存信息");
      } else {
        $("[name=patient_phone], [name=patient_id_number]").removeClass("hidden");
        $("#labTestName").val(res.data.lab_test_name || res.data.category_label || currentCategoryLabel || "");
        $("#recordPanelTitle").text("校对" + (currentCategoryLabel || "检验指标"));
        $("#recordPanelHint").text("确认无误后保存当前检验类别，保存成功会返回病例详情。")
        $("#labFieldsSection").removeClass("hidden");
        $("#saveRecordBtn").text("保存信息");
      }

      setTimeout(function() {
        showPanel("recordPanel");
      }, 500);
    })
    .fail(function (xhr) {
      setMsg("photoMsg", xhr.responseJSON?.message || "识别超时或失败，请重新上传识别", true);
      $("#recognizeProgress").addClass("hidden");
      $("#photoActions").removeClass("hidden");
      $("#previewContainer").removeClass("hidden");
      $("#retryBtn").removeClass("hidden");
    })
    .always(function () {
      setRecognizeBlocking(false);
    });
}
