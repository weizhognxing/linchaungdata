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
  labDraftValues = {};
  $("[name=patient_name], [name=patient_age], [name=patient_phone], [name=patient_id_number]").val("");
  document.querySelectorAll("[name=patient_gender]").forEach(function (input) {
    input.checked = false;
  });
  $("#dynamicFields").html("");
  populateLabCategorySelect();
  $("#recordPanelHint").text("");
  setMsg("recordMsg", "", false);
  setSaveRecordButtonSaving(false);
}

function populateLabCategorySelect(selectedKey) {
  const select = document.getElementById("labTestName");
  if (!select) return;
  const html = (labCategories || []).filter(c => c.enabled).map(function (category) {
    return '<option value="' + escapeHtml(category.key) + '">' + escapeHtml(category.label) + '</option>';
  }).join("");
  select.innerHTML = html;
  const targets = normalizeLabCategoryKeys(selectedKey !== undefined ? selectedKey : (currentRecordCategory || currentCategoryLabel));
  Array.prototype.forEach.call(select.options, function (option) {
    option.selected = targets.indexOf(option.value) > -1;
  });
  renderLabCategoryPicker(targets);
  updateSelectedLabCategorySummary();
}

function renderLabCategoryPicker(selectedKeys) {
  const target = document.getElementById("labCategoryCheckboxes");
  if (!target) return;
  const selected = selectedKeys || [];
  target.innerHTML = (labCategories || []).filter(c => c.enabled).map(function (category) {
    const active = selected.indexOf(category.key) > -1;
    return '<button type="button" class="lab-category-choice' + (active ? ' active' : '') + '" data-key="' + escapeHtml(category.key) + '" aria-pressed="' + (active ? 'true' : 'false') + '" onclick="toggleLabCategoryChoice(this)">' + escapeHtml(category.label) + '</button>';
  }).join("");
}

function setLabCategoryButtonState(button, active) {
  button.classList.toggle("active", active);
  button.setAttribute("aria-pressed", active ? "true" : "false");
}

function refreshSelectedLabCategoryState() {
  const selectedLabCategories = syncLabCategorySelectFromPicker();
  currentRecordCategory = selectedLabCategories.join(",");
  currentCategoryLabel = getLabCategoryLabels(selectedLabCategories).join("+");
  updateSelectedLabCategorySummary(selectedLabCategories);
  renderCategoryLabFields();
  return selectedLabCategories;
}

document.addEventListener("click", function (event) {
  const button = event.target && event.target.closest ? event.target.closest(".lab-category-choice") : null;
  if (!button) return;
  event.preventDefault();
  toggleLabCategoryChoice(button);
});

function toggleLabCategoryChoice(button) {
  if (!button || button.__labCategoryHandled) return;
  button.__labCategoryHandled = true;
  setLabCategoryButtonState(button, button.getAttribute("aria-pressed") !== "true");
  refreshSelectedLabCategoryState();
  setTimeout(function () { button.__labCategoryHandled = false; }, 0);
}

function syncLabCategorySelectFromPicker() {
  const keys = [];
  document.querySelectorAll(".lab-category-choice").forEach(function (button) {
    if (button.getAttribute("aria-pressed") !== "true") return;
    const key = button.getAttribute("data-key") || "";
    if (key && keys.indexOf(key) === -1) keys.push(key);
  });
  const select = document.getElementById("labTestName");
  if (select) {
    Array.prototype.forEach.call(select.options, function (option) {
      option.selected = keys.indexOf(option.value) > -1;
    });
  }
  return keys;
}

function updateSelectedLabCategorySummary(selectedKeys) {
  const target = document.getElementById("labCategorySelectedSummary");
  if (!target) return;
  const labels = getLabCategoryLabels(selectedKeys || getSelectedLabCategoryKeys());
  if (!labels.length) {
    target.innerHTML = '未选择检验类别';
    target.classList.add("empty");
    return;
  }
  target.classList.remove("empty");
  target.innerHTML = '<span>已选择：</span>' + labels.map(function (label) {
    return '<span class="selected-lab-category-chip">' + escapeHtml(label) + '</span>';
  }).join("");
}

function setSaveRecordButtonSaving(saving) {
  const button = document.getElementById("saveRecordBtn");
  if (!button) return;
  button.disabled = !!saving;
  button.textContent = saving ? "保存中" : (typeof saveRecordButtonText === "undefined" ? "保存信息" : saveRecordButtonText);
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

function startLabCategoryUpload(patientId, categoryKey, categoryLabel, timepoint) {
  currentEditingLabRecordId = null;
  currentLabReportName = '';
  labDraftValues = {};
  currentUploadMode = "lab";
  currentLabTimepoint = timepoint || '0h';
  currentUploadPatientId = patientId;
  currentRecordCategory = categoryKey || "";
  currentCategoryLabel = categoryLabel || "检验";
  initPhotoPanel();
  initPhotoButtons();
  $("#photoPanelTitle").text("上传检验单(" + currentLabTimepoint + ")");
  setMsg("photoMsg", "检验时间点：" + currentLabTimepoint + "；对应血浆编号：" + (currentPlasmaNumbers[currentLabTimepoint] || "未填写（可在基础信息补录）") + "。请选择图片，系统将按指标匹配类别，结果可人工补填和修改。", false);
  $.getJSON('/api/lab-catalog').done(function (res) {
    labCategories = res.data.categories || [];
    showPanel("photoPanel");
  }).fail(function () { alert('检验类别加载失败，请重试'); });
}

function triggerPhotoChooser() {
  const targetInput = isMobile() ? document.getElementById("photoInputCamera") : document.getElementById("photoInputFile");
  if (!targetInput) return;
  targetInput.click();
}

function normalizeLabCategoryName(value) {
  const keys = normalizeLabCategoryKeys(value);
  return keys[0] || "";
}

function normalizeLabCategoryKeys(value) {
  if (Array.isArray(value)) {
    const listKeys = [];
    value.forEach(function (item) {
      normalizeLabCategoryKeys(item).forEach(function (key) {
        if (listKeys.indexOf(key) === -1) listKeys.push(key);
      });
    });
    return listKeys;
  }
  const rawValue = String(value || "").trim();
  const exact = labCategories.find(c => c.key === rawValue || c.label === rawValue);
  if (exact) return [exact.key];
  if (/[，,;；|]/.test(rawValue)) {
    const splitKeys = [];
    rawValue.split(/[，,;；|]+/).forEach(function (item) {
      normalizeLabCategoryKeys(item).forEach(function (key) {
        if (splitKeys.indexOf(key) === -1) splitKeys.push(key);
      });
    });
    return splitKeys;
  }
  value = rawValue.toLowerCase().replace(/[\s\-_]+/g, "");
  if (!value) return [];
  const keys = [];
  const addKey = function (key) {
    if (keys.indexOf(key) === -1) keys.push(key);
  };
  if (rawValue === "blood_crp" || rawValue === "blood_routine" || value.indexOf("血细胞分析") > -1 || value.indexOf("血" + "常规") > -1) addKey("blood_crp");
  if (rawValue === "dic" || rawValue === "dic7" || value.indexOf("dic") > -1 || value.indexOf("凝血") > -1) addKey("dic");
  if (rawValue === "biochemistry" || value.indexOf("生化") > -1) addKey("biochemistry");
  if (rawValue === "electrolytes" || value.indexOf("电解质") > -1) addKey("electrolytes");
  if (rawValue === "blood_gas" || value.indexOf("血气") > -1 || value.indexOf("气血") > -1) addKey("blood_gas");
  if (rawValue === "pct" || value.indexOf("pct") > -1 || value.indexOf("降钙素原") > -1) addKey("pct");
  if (rawValue === "lactate" || value.indexOf("乳酸") > -1 || value === "lac" || value === "la") addKey("lactate");
  if (rawValue === "bnp" || value.indexOf("bnp") > -1 || value.indexOf("b型钠尿肽") > -1 || value.indexOf("ntpro") > -1 || value.indexOf("脑钠肽") > -1) addKey("bnp");
  if (rawValue === "myocardial_injury" || value.indexOf("心肌损伤") > -1 || value.indexOf("肌钙蛋白") > -1 || value.indexOf("肌红蛋白") > -1 || value.indexOf("ckmb") > -1 || value.indexOf("ctnt") > -1 || value.indexOf("ctni") > -1) addKey("myocardial_injury");
  if (rawValue === "cytokine_12" || value.indexOf("细胞因子") > -1) addKey("cytokine_12");
  if (rawValue === "amylase" || value.indexOf("淀粉酶") > -1 || value.indexOf("amy") > -1) addKey("amylase");
  return keys.filter(key => labCategories.some(c => c.key === key));
}

function getUploadedLabCategoryKeys(records) {
  const keys = [];
  (records || []).forEach(function (record) {
    const candidates = [record.record_category, record.lab_test_name];
    candidates.forEach(function (candidate) {
      normalizeLabCategoryKeys(candidate).forEach(function (key) {
        if (key && keys.indexOf(key) === -1) keys.push(key);
      });
    });
  });
  return keys;
}

function renderLabCategoryActions(patient, progress, diagnosisRecords, timepoint) {
  const suffix = timepoint === '72h' ? '72h' : '0h';
  const primaryDiagnosisDisease = (diagnosisRecords && diagnosisRecords[0] && diagnosisRecords[0].diagnosis_disease) || patient.diagnosis_disease || "";
  const uploadDiseaseAttrs = ' data-disease-id="' + attrValue(patient.last_disease_id || '') + '" data-diagnosis-disease="' + attrValue(primaryDiagnosisDisease) + '"';
  const statuses = progress.categories || [];
  const required = statuses.filter(c => c.required);
  let summary = '已完成 ' + required.filter(c => c.complete).length + '/' + required.length + ' 个必查类别（必填项填齐才计入）。';
  if (progress.legacy) summary = '历史已提交病例：保留原完成状态，未按新规则重新判定。';
  else if (progress.frozen) summary += ' 当前显示提交时的完成快照。';
  else if (!progress.has_diagnosis) summary = '请先添加诊断，系统将显示疾病必查类别。';
  if ((progress.unconfigured_diseases || []).length) summary += ' 尚未配置必查类别：' + progress.unconfigured_diseases.join('、');
  const plasmaNumber = patient[timepoint === '72h' ? 'plasma_number_72h' : 'plasma_number'];
  $("#labCategorySummary" + suffix).html('<div class="detail-item">对应血浆编号(' + suffix + ')：' + escapeHtml(plasmaNumber || '未填写，请到基础信息页填写') + '</div><div class="detail-item">' + escapeHtml(summary) + '</div>' + statuses.map(c => {
    const state = c.complete ? '已完成' : (!c.configured ? '待管理员配置必填指标' : '待补全：' + c.missing.map(f => f.label).join('、'));
    const edit = !progress.frozen && !c.complete && c.record_id ? '<button class="btn-sm edit-lab-record-btn" data-id="' + c.record_id + '" data-timepoint="' + suffix + '">补全这条记录</button>' : '';
    return '<div class="detail-item"><strong>' + escapeHtml(c.label) + (c.required ? '（必查）' : '（额外）') + '</strong><p>' + escapeHtml(state) + '</p>' + edit + '</div>';
  }).join(''));
  const buttons = labCategories.filter(c => c.enabled).map(c => '<button class="btn-sm lab-category-upload-btn" data-timepoint="' + suffix + '" data-patient-id="' + patient.id + '" data-category="' + escapeHtml(c.key) + '" data-label="' + escapeHtml(c.label) + '"' + uploadDiseaseAttrs + '>录入' + escapeHtml(c.label) + '</button>').join('');
  $("#labCategoryActions" + suffix).html('<button class="btn-sm lab-category-upload-btn" data-timepoint="' + suffix + '" data-patient-id="' + patient.id + '" data-category="" data-label="检验"' + uploadDiseaseAttrs + '>上传其他／多类别报告</button>' + buttons);
}

function getLabCategoryLabel(categoryKey) {
  const found = labCategories.find(function (item) { return item.key === categoryKey; });
  return found ? found.label : categoryKey;
}

function getLabCategoryLabels(categoryKeys) {
  return normalizeLabCategoryKeys(categoryKeys).map(function (key) {
    return getLabCategoryLabel(key);
  }).filter(Boolean);
}

function getLabCategoryDisplayName(record) {
  const labels = getLabCategoryLabels(record && record.record_category);
  if (labels.length) return labels.join("+");
  return (record && record.lab_test_name) || "-";
}

function getSelectedLabCategoryKeys() {
  const pickerButtons = document.querySelectorAll(".lab-category-choice");
  if (pickerButtons.length) {
    return syncLabCategorySelectFromPicker();
  }
  const value = $("#labTestName").val() || [];
  return normalizeLabCategoryKeys(Array.isArray(value) ? value : [value]);
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
      var inputs = document.querySelectorAll("[name=" + fieldName + "]");
      if (inputs.length && inputs[0].type === "radio") {
        inputs.forEach(function (input) {
          input.checked = input.value === String(value);
        });
      } else {
        $("[name=" + fieldName + "]").val(value);
      }
    }
  });
}

function renderCategoryLabFields() {
  $('#dynamicFields input').each(function () { labDraftValues[this.name] = this.value; });
  const keys = getSelectedLabCategoryKeys();
  const fields = new Map();
  labCategories.filter(c => c.enabled && keys.includes(c.key)).forEach(c => {
    c.fields.filter(f => f.available).forEach(f => {
      if (!fields.has(f.field_name)) fields.set(f.field_name, Object.assign({}, f));
      else if (f.required) fields.get(f.field_name).required = true;
    });
  });
  $('#dynamicFields').html(Array.from(fields.values()).map(f => {
    const label = f.form_label || f.field_name;
    const value = labDraftValues[f.field_name] ?? '';
    const type = f.data_type === 'date' ? 'date' : (f.data_type === 'datetime' ? 'datetime-local' : 'text');
    const numeric = ['int', 'decimal'].includes(f.data_type) ? ' inputmode="decimal"' : '';
    return '<div class="form-field"><label>' + escapeHtml(label) + (f.required ? ' *' : '') + (f.unit ? '（' + escapeHtml(f.unit) + '）' : '') + '</label>' +
      '<input name="' + escapeHtml(f.field_name) + '" type="' + type + '"' + numeric + ' data-required="' + (f.required ? '1' : '0') + '" value="' + escapeHtml(value) + '" placeholder="' + escapeHtml(label) + '"></div>';
  }).join('') || '<div class="detail-item">请选择已配置指标的类别；未配置的类别请联系管理员。</div>');
  const outside = Object.keys(labDraftValues).filter(name => !fields.has(name) && labDraftValues[name] !== null && String(labDraftValues[name]).trim() !== '');
  const names = new Map();
  labCategories.forEach(c => c.fields.forEach(f => names.set(f.field_name, f.form_label)));
  $('#labUnassignedHint').text(outside.length ? '以下已识别／暂存指标不属于当前所选类别，本次不会提交；请补选类别后核对：' + outside.map(name => names.get(name) || name).join('、') : '');
}

function editLabRecord(recordId, timepoint) {
  timepoint = timepoint || '0h';
  $.getJSON('/api/lab-catalog').done(function (catalogResponse) {
    labCategories = catalogResponse.data.categories || [];
    $.getJSON('/api/records/' + recordId, { timepoint: timepoint }).done(function (res) {
      if (!res.data.editable) { alert('已提交病例不能修改'); return; }
      const record = res.data.record;
      const keys = normalizeLabCategoryKeys(record.record_category);
      if (keys.some(key => !labCategories.find(c => c.key === key && c.enabled))) {
        alert('记录含已停用类别，请联系管理员恢复类别后补全'); return;
      }
      currentUploadMode = 'lab';
      currentUploadPatientId = record.patient_id;
      currentPatientId = record.patient_id;
      selectedDiseaseId = record.disease_id;
      currentRecordCategory = keys.join(',');
      currentEditingLabRecordId = recordId;
      currentLabTimepoint = timepoint;
      currentLabReportName = record.lab_test_name || '';
      uploadedPhotoPath = record.photo_path;
      resetRecordForm();
      labDraftValues = {};
      (res.data.items || []).forEach(item => { labDraftValues[item.field_name] = item.value; });
      fillPatientForm({ name: record.patient_name, gender: record.gender, age: record.age, phone: record.phone, id_number: record.id_number });
      populateLabCategorySelect(keys);
      renderCategoryLabFields();
      $('#labFieldsSection').removeClass('hidden');
      $('#recordPanelTitle').text('补全检验记录(' + timepoint + ')');
      $('#recordPanelHint').text('* 为类别必填项。请根据本条原始报告补全，勿将不同时间报告的结果混填。');
      showPanel('recordPanel');
    }).fail(function (xhr) { alert(xhr.responseJSON?.message || '记录加载失败'); });
  }).fail(function () { alert('类别加载失败'); });
}

$(document).on('click', '.edit-lab-record-btn', function () { editLabRecord($(this).data('id'), $(this).attr('data-timepoint')); });

function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
      var fillStep = "准备填充";
      try {
        showRecognizeProgress(3, 3, "识别完成，正在填充表单...");
        fillStep = "读取接口数据";
        var data = res && res.data ? res.data : {};
        uploadedPhotoPath = data.photo_path || null;
        fillStep = "重置表单";
        resetRecordForm();
        fillStep = "填充病患信息";
        fillPatientForm(data.patient || {});

        fillStep = "生成检验字段";
        var recognizedValues = data.values && typeof data.values === "object" ? data.values : {};
        labDraftValues = Object.assign({}, recognizedValues);
        currentLabReportName = data.lab_test_name || '';
        var responseFields = Array.isArray(data.fields) ? data.fields : [];
        var recognizedFields = responseFields.filter(function (f) {
          if (!f || !f.field_name) return false;
          var value = recognizedValues[f.field_name];
          return value !== null && value !== undefined && String(value).trim() !== "";
        });
        var html = recognizedFields.map(function(f) {
          var fieldName = String(f.field_name || "");
          var value = recognizedValues[fieldName];
          var label = typeof getLabDisplayLabel === "function" ? getLabDisplayLabel(f.form_label, fieldName) : (f.form_label || fieldName);
          return '<div class="form-field"><label>' + escapeHtml(label) + '</label><input name="' + escapeHtml(fieldName) + '" value="' + escapeHtml(value) + '" placeholder="' + escapeHtml(label) + '"></div>';
        }).join("");
        $("#dynamicFields").html(html || '<div class="detail-item">未识别到检验指标</div>');

        fillStep = "设置页面状态";
        if (currentUploadMode === "intake") {
          $("#recordPanelTitle").text("确认基础信息");
          $("#recordPanelHint").text("当前步骤仅提取姓名、性别、年龄，确认后会创建暂存病例。后续请在病例中继续补录基础信息、诊断、检验、评估、治疗和随访。");
          $("#labFieldsSection").addClass("hidden");
          $("[name=patient_phone], [name=patient_id_number]").addClass("hidden");
          $("#saveRecordBtn").text("保存信息");
        } else {
          $("[name=patient_phone], [name=patient_id_number]").removeClass("hidden");
          labCategories = data.lab_categories || labCategories;
          var recognizedCategory = (data.category_inference && data.category_inference.selected) || [];
          populateLabCategorySelect(recognizedCategory);
          $("#dynamicFields").empty();
          renderCategoryLabFields();
          var selectedCategories = getSelectedLabCategoryKeys();
          currentRecordCategory = selectedCategories.join(",");
          currentCategoryLabel = getLabCategoryLabels(selectedCategories).join("+");
          $("#recordPanelTitle").text("校对" + (currentCategoryLabel || "检验指标") + "(" + currentLabTimepoint + ")");
          var uncertain = (data.category_inference && data.category_inference.ambiguous) || [];
          var classificationHint = uncertain.length ? '部分指标为多个类别共用，请核对并手动选择：' + getLabCategoryLabels(uncertain).join('、') + '。' : (recognizedCategory.length ? '已根据检验指标匹配类别，请核对。' : '现有指标不足以确定类别，请手动选择。');
          $("#recordPanelHint").text('检验时间点：' + currentLabTimepoint + '；对应血浆编号：' + (currentPlasmaNumbers[currentLabTimepoint] || '未填写') + '。' + classificationHint + ' 所选类别的全部指标均可人工填写和修改，未识别结果留空。* 为必填项，未填齐可暂存但不计为完成。');
          $("#labFieldsSection").removeClass("hidden");
          $("#saveRecordBtn").text("保存信息");
        }

        fillStep = "跳转校对页";
        setTimeout(function() {
          showPanel("recordPanel");
        }, 500);
      } catch (err) {
        console.error("Recognition form fill failed", err, res);
        $("#recognizeProgress").addClass("hidden");
        $("#photoActions").removeClass("hidden");
        $("#previewContainer").removeClass("hidden");
        $("#retryBtn").removeClass("hidden");
        var detail = err && err.message ? "（" + fillStep + "：" + err.message + "）" : "";
        setMsg("photoMsg", "识别已返回，但填充表单失败" + detail + "，请刷新后重试。", true);
      }
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
