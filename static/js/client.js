let selectedDiseaseId = null;
let uploadedPhotoPath = null;
let selectedFile = null;
let canReviewMembers = false;

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
  } else {
    $("#bottomNav").addClass("hidden");
  }

  if (id === "memberReviewPanel") {
    loadMemberReviews();
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
  const map = {
    patient_name: patient.name,
    patient_gender: patient.gender,
    patient_age: patient.age,
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
  }).fail(function (xhr) { setMsg("recordMsg", xhr.responseJSON?.message || "保存失败", true); });
});
