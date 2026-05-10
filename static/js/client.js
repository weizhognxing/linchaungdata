let selectedDiseaseId = null;
let uploadedPhotoPath = null;
let selectedFile = null;
let canReviewMembers = false;
let currentPatientId = null;

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

function showPanel(id) {
  $(".panel").addClass("hidden");
  $("#" + id).removeClass("hidden");
  localStorage.setItem("clientPanel", id);
  // 登录后的页面显示底部导航
  if (authPanels.indexOf(id) === -1) {
    $("#bottomNav").removeClass("hidden");
    $(".nav-item").removeClass("active");
    $(".nav-item[data-nav='" + id + "']").addClass("active");
    if (id === "recordPanel" || id === "photoPanel") {
      $(".nav-item[data-nav='diseasePanel']").addClass("active");
    }
    if (id === "patientDetailPanel") {
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
      return `<button class="disease-item" data-id="${d.id}"><span class="disease-name">${d.name}</span><span class="disease-count">已录入${count}人</span></button>`;
    }).join("");
    $("#diseaseList").html(html);
  });
}

function loadCaseList() {
  $.getJSON("/api/cases")
    .done(function (res) {
      if (!res.success) {
        setMsg("caseListMsg", "病例加载失败", true);
        return;
      }
      if (!res.data.length) {
        $("#caseList").html('<div class="detail-item">暂无病例</div>');
        return;
      }
      const html = res.data.map(function (item) {
        return '<div class="case-item">' +
          '<div class="case-head"><strong>' + (item.name || '-') + '</strong><button class="btn-sm view-case-btn" data-id="' + item.id + '">查看</button></div>' +
          '<div class="case-meta">' +
          '性别：' + (item.gender || '-') + ' ｜ 年龄：' + (item.age || '-') + ' ｜ 病历号：' + (item.id_number || '-') +
          '</div>' +
          '<div class="case-meta">已录入 ' + Number(item.record_count || 0) + ' 条检验记录</div>' +
          '</div>';
      }).join('');
      $("#caseList").html(html);
    })
    .fail(function (xhr) {
      setMsg("caseListMsg", xhr.responseJSON?.message || "病例加载失败", true);
    });
}

function loadPatientDetail(patientId, activeTab) {
  activeTab = activeTab || "base";
  $.getJSON("/api/patients/" + patientId)
    .done(function (res) {
      if (!res.success) {
        alert("加载病人详情失败");
        return;
      }
      currentPatientId = patientId;
      const patient = res.data.patient || {};
      const patientFields = res.data.patient_fields || [];
      $("#patientProfile").html(
        '<div><strong>' + (patient.name || '-') + '</strong></div>' +
        '<div class="case-meta">性别：' + (patient.gender || '-') + ' ｜ 年龄：' + (patient.age || '-') + ' ｜ 病历号：' + (patient.id_number || '-') + '</div>'
      );

      const baseFields = [{ form_label: '联系电话', value: patient.phone }].concat(patientFields);
      const baseHtml = baseFields.map(function (f) {
        return '<div class="detail-item"><strong>' + f.form_label + '</strong><br>' + (f.value || '-') + '</div>';
      }).join('') || '<div class="detail-item">暂无基础信息</div>';
      $("#baseInfoList").html(baseHtml);

      const labHtml = (res.data.lab_records || []).map(function (r) {
        return '<div class="detail-item">' + (r.created_at || '-') + ' ｜ ' + (r.disease_name || '-') + ' ｜ 录入人：' + (r.operator_name || '-') + '</div>';
      }).join('') || '<div class="detail-item">暂无检验记录</div>';
      $("#labRecordList").html(labHtml);

      const treatHtml = (res.data.treatments || []).map(function (r) {
        return '<div class="detail-item">' + (r.treat_time || '-') + '<br>' + (r.treatment_method || '-') + '</div>';
      }).join('') || '<div class="detail-item">暂无诊疗记录</div>';
      $("#treatList").html(treatHtml);

      const followHtml = (res.data.followups || []).map(function (r) {
        return '<div class="detail-item">' + (r.follow_time || '-') + '<br>' + (r.follow_result || '-') + '</div>';
      }).join('') || '<div class="detail-item">暂无随访记录</div>';
      $("#followList").html(followHtml);
      $("#treatFormPanel").addClass("hidden");
      $("#followFormPanel").addClass("hidden");

      $(".detail-tab").removeClass("active");
      $(".detail-tab[data-detail-tab='" + activeTab + "']").addClass("active");
      $(".detail-tab-page").addClass("hidden");
      if (activeTab === "base") $("#detailBaseTab").removeClass("hidden");
      if (activeTab === "lab") $("#detailLabTab").removeClass("hidden");
      if (activeTab === "treat") $("#detailTreatTab").removeClass("hidden");
      if (activeTab === "follow") $("#detailFollowTab").removeClass("hidden");
      showPanel("patientDetailPanel");
    })
    .fail(function (xhr) {
      alert(xhr.responseJSON?.message || "加载病人详情失败");
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
  $("#previewContainer").addClass("hidden");
  $("#retryBtn").addClass("hidden");
  $("#photoMsg").text("");

  var data = new FormData();
  data.append("disease_id", selectedDiseaseId);
  data.append("photo", selectedFile);

  showRecognizeProgress(2, 3, "正在调用AI识别...");

  $.ajax({ url: "/api/recognize", method: "POST", data, processData: false, contentType: false })
    .done(function (res) {
      showRecognizeProgress(3, 3, "识别完成，正在填充表单...");
      uploadedPhotoPath = res.data.photo_path;
      fillPatientForm(res.data.patient);

      // 用识别结果填充表单
      var html = res.data.fields.map(function(f) {
        var value = res.data.values[f.field_name] || '';
        return '<div class="form-field"><label>' + f.form_label + '</label><input name="' + f.field_name + '" value="' + value + '" placeholder="' + f.form_label + '"></div>';
      }).join("");
      $("#dynamicFields").html(html);

      // 延迟跳转到表单页面
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

// 选择疾病后
$(document).on("click", ".disease-item", function () {
  selectedDiseaseId = $(this).data("id");
  localStorage.setItem("selectedDiseaseId", selectedDiseaseId);
  showPanel("photoPanel");
  initPhotoPanel();
  initPhotoButtons();
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
    autoRecognize();
  }
}

// 重新识别按钮
$(document).on("click", "#retryBtn", function () {
  if (selectedFile) {
    autoRecognize();
  }
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
  const values = {};
  $("#dynamicFields input").each(function () { values[this.name] = $(this).val(); });
  $.ajax({
    url: "/api/records",
    method: "POST",
    contentType: "application/json",
    data: JSON.stringify({ disease_id: selectedDiseaseId, patient, values, photo_path: uploadedPhotoPath })
  }).done(function (res) {
    setMsg("recordMsg", `${res.message}，记录ID：${res.data.record_id}`);
    loadCaseList();
  }).fail(function (xhr) { setMsg("recordMsg", xhr.responseJSON?.message || "保存失败", true); });
});

$(document).on("click", ".view-case-btn", function () {
  loadPatientDetail($(this).data("id"));
});

$(document).on("click", ".detail-tab", function () {
  const tab = this.getAttribute("data-detail-tab");
  $(".detail-tab").removeClass("active");
  $(this).addClass("active");
  $(".detail-tab-page").addClass("hidden");
  if (tab === "base") $("#detailBaseTab").removeClass("hidden");
  if (tab === "lab") $("#detailLabTab").removeClass("hidden");
  if (tab === "treat") $("#detailTreatTab").removeClass("hidden");
  if (tab === "follow") $("#detailFollowTab").removeClass("hidden");
});

$(document).on("click", "#showTreatFormBtn", function () {
  $("#treatFormPanel").removeClass("hidden");
});

$(document).on("click", "#showFollowFormBtn", function () {
  $("#followFormPanel").removeClass("hidden");
});

$("#addTreatBtn").on("click", function () {
  if (!currentPatientId) return;
  $.post("/api/patients/" + currentPatientId + "/treatments", {
    treat_time: $("#treatTime").val(),
    treatment_method: $("#treatMethod").val()
  }).done(function (res) {
    setMsg("treatMsg", res.message || "已保存");
    $("#treatTime").val("");
    $("#treatMethod").val("");
    loadPatientDetail(currentPatientId, "treat");
  }).fail(function (xhr) {
    setMsg("treatMsg", xhr.responseJSON?.message || "保存失败", true);
  });
});

$("#addFollowBtn").on("click", function () {
  if (!currentPatientId) return;
  $.post("/api/patients/" + currentPatientId + "/followups", {
    follow_time: $("#followTime").val(),
    follow_result: $("#followResult").val()
  }).done(function (res) {
    setMsg("followMsg", res.message || "已保存");
    $("#followTime").val("");
    $("#followResult").val("");
    loadPatientDetail(currentPatientId, "follow");
  }).fail(function (xhr) {
    setMsg("followMsg", xhr.responseJSON?.message || "保存失败", true);
  });
});
