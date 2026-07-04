function adminMsg(id, text, error) { $("#" + id).text(text).toggleClass("error", !!error); }

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, function (char) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
  });
}

function showAdminPanel() {
  $("#adminLogin").addClass("hidden");
  $("#adminContent").removeClass("hidden");
  $("#adminSidebar").removeClass("hidden");
  $("#adminLayout").removeClass("login-mode");
  loadAll();
  var savedTab = localStorage.getItem("adminTab") || "members";
  $(".tab").removeClass("active");
  $(".tab[data-tab='" + savedTab + "']").addClass("active");
  $(".admin-tab-page").addClass("hidden");
  $("#" + savedTab).removeClass("hidden");
}

$(function() {
  $.getJSON("/api/admin/check").done(showAdminPanel).fail(function() {
    $("#adminLogin").removeClass("hidden");
  });
});

function loadUsers() {
  $.getJSON("/api/admin/users", function (res) {
    const statusMap = { pending: '待审核', approved: '已通过', disabled: '已禁用' };
    const rows = res.data.map(u => {
      const statusText = statusMap[u.status] || u.status;
      const statusClass = u.status === 'pending' ? 'status-pending' : u.status === 'approved' ? 'status-approved' : 'status-disabled';
      let actionBtns = '';
      if (u.status === 'pending') {
        actionBtns = `<button class="statusBtn btn-sm" data-id="${u.id}" data-status="approved">通过</button><button class="statusBtn secondary btn-sm" data-id="${u.id}" data-status="disabled">禁用</button>`;
      } else if (u.status === 'approved') {
        actionBtns = `<button class="statusBtn secondary btn-sm" data-id="${u.id}" data-status="disabled">禁用</button>`;
      } else if (u.status === 'disabled') {
        actionBtns = `<button class="statusBtn btn-sm" data-id="${u.id}" data-status="approved">启用</button>`;
      }
      return `<tr><td>${u.name}</td><td>${u.phone}</td><td>${u.organization}/${u.department}</td><td><span class="status-tag ${statusClass}">${statusText}</span></td><td>${actionBtns}</td></tr>`;
    }).join("");
    $("#userRows").html(rows);
  });
}

function adminCaseStatusLabel(status) {
  return { draft: "暂存", submitted: "完整", approved: "审核通过", rejected: "驳回" }[status] || status || "暂存";
}

function loadAdminCases() {
  $.getJSON("/api/admin/cases", function (res) {
    const rows = (res.data || []).map(c => {
      const actions = `<button class="viewAdminCaseBtn btn-sm" data-id="${c.id}">详情</button><button class="approveAdminCaseBtn btn-sm" data-id="${c.id}">通过</button><button class="rejectAdminCaseBtn secondary btn-sm" data-id="${c.id}">驳回</button>`;
      return `<tr><td>${escapeHtml(c.name)}</td><td>${escapeHtml(c.gender || '-')}/${escapeHtml(c.age || '-')}</td><td>${escapeHtml(c.disease_name || '-')}</td><td>${escapeHtml(c.hospital_name || '-')}/${escapeHtml(c.owner_name || '-')}</td><td>${escapeHtml(adminCaseStatusLabel(c.case_status))}</td><td>${Number(c.lab_count || 0)}</td><td>${actions}</td></tr>`;
    }).join("");
    $("#adminCaseRows").html(rows || '<tr><td colspan="7">暂无病例</td></tr>');
  });
}

function renderAdminTable(title, rows) {
  rows = rows || [];
  if (!rows.length) return `<h3>${escapeHtml(title)}</h3><div class="hint">暂无数据</div>`;
  const keys = [];
  rows.forEach(row => Object.keys(row || {}).forEach(key => { if (keys.indexOf(key) === -1) keys.push(key); }));
  const head = keys.map(key => `<th>${escapeHtml(key)}</th>`).join("");
  const body = rows.map(row => `<tr>${keys.map(key => `<td>${escapeHtml(row[key])}</td>`).join("")}</tr>`).join("");
  return `<h3>${escapeHtml(title)}</h3><div class="table-scroll"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function loadAdminCaseDetail(patientId) {
  $.getJSON(`/api/admin/cases/${patientId}`, function (res) {
    const data = res.data || {};
    const patient = data.patient || {};
    const patientRows = Object.keys(patient).map(key => ({ 字段: key, 值: patient[key] }));
    const html = `<h3>病例详情：${escapeHtml(patient.name || '-')}</h3>` +
      `<div class="case-actions"><button class="approveAdminCaseBtn btn-sm" data-id="${patient.id}">审核通过</button><button class="rejectAdminCaseBtn secondary btn-sm" data-id="${patient.id}">驳回</button></div>` +
      renderAdminTable("病患信息", patientRows) +
      renderAdminTable("诊断记录", data.diagnosis_records) +
      renderAdminTable("检验记录", data.lab_records) +
      renderAdminTable("评估记录", data.assessments) +
      renderAdminTable("治疗记录", data.treatments) +
      renderAdminTable("随访记录", data.followups);
    $("#adminCaseDetail").html(html).removeClass("hidden");
  }).fail(function (xhr) {
    alert(xhr.responseJSON?.message || "病例详情加载失败");
  });
}

var fieldPage = 1;
var fieldSearch = "";
var patientFieldPage = 1;
var patientFieldSearch = "";

function loadFields() {
  $.getJSON("/api/admin/fields", { page: fieldPage, per_page: 8, search: fieldSearch }, function (res) {
    const rows = res.data.list.map(f => `<tr><td><input class="fieldLabelInput" data-id="${f.id}" value="${escapeHtml(f.form_label)}"><button class="saveFieldLabelBtn btn-sm" data-id="${f.id}">保存</button></td><td>${escapeHtml(f.field_name)}</td><td>${escapeHtml(f.data_type)}</td><td>${escapeHtml(f.unit)}</td><td>${escapeHtml(f.reference_range)}</td><td>${escapeHtml(f.test_method)}</td></tr>`).join("");
    $("#fieldRows").html(rows);
    renderPagination("fieldPagination", res.data.total, res.data.page, res.data.per_page, goFieldPage);
  });
}

function loadPatientFields() {
  $.getJSON("/api/admin/patient-fields", { page: patientFieldPage, per_page: 8, search: patientFieldSearch }, function (res) {
    const rows = res.data.list.map(f => `<tr><td>${f.form_label}</td><td>${f.field_name}</td><td>${f.data_type}</td></tr>`).join("");
    $("#patientFieldRows").html(rows);
    renderPagination("patientFieldPagination", res.data.total, res.data.page, res.data.per_page, goPatientFieldPage);
  });
}

function renderPagination(containerId, total, page, per_page, onPageChange) {
  var totalPages = Math.ceil(total / per_page);
  var html = '';
  html += '<button ' + (page <= 1 ? 'disabled' : '') + ' data-page="' + (page - 1) + '">上一页</button>';
  for (var i = 1; i <= totalPages; i++) {
    html += '<button class="' + (i === page ? 'active' : '') + '" data-page="' + i + '">' + i + '</button>';
  }
  html += '<button ' + (page >= totalPages ? 'disabled' : '') + ' data-page="' + (page + 1) + '">下一页</button>';
  $("#" + containerId).html(html);
  $("#" + containerId + " button").on("click", function () {
    var target = Number($(this).data("page"));
    if (!target || target < 1 || target > totalPages || target === page) return;
    onPageChange(target);
  });
}

function goFieldPage(page) {
  fieldPage = page;
  loadFields();
}

function goPatientFieldPage(page) {
  patientFieldPage = page;
  loadPatientFields();
}

$("#fieldSearchBtn").on("click", function () {
  fieldSearch = $("#fieldSearch").val();
  fieldPage = 1;
  loadFields();
});

$("#fieldSearch").on("keypress", function (e) {
  if (e.which === 13) {
    fieldSearch = $(this).val();
    fieldPage = 1;
    loadFields();
  }
});

$("#patientFieldSearchBtn").on("click", function () {
  patientFieldSearch = $("#patientFieldSearch").val();
  patientFieldPage = 1;
  loadPatientFields();
});

$("#patientFieldSearch").on("keypress", function (e) {
  if (e.which === 13) {
    patientFieldSearch = $(this).val();
    patientFieldPage = 1;
    loadPatientFields();
  }
});

function loadDiseases() {
  $.getJSON("/api/admin/diseases", function (res) {
    $("#diseaseSelect").html(res.data.map(d => `<option value="${d.id}">${d.name}</option>`).join(""));
    loadFormSetting();
  });
}

function loadFormSetting() {
  const diseaseId = $("#diseaseSelect").val();
  if (!diseaseId) return;
  $.getJSON(`/api/admin/form-settings/${diseaseId}`, function (res) {
    const selected = res.data.selected || {};
    const available = [];
    const chosen = [];
    res.data.fields.forEach(f => {
      if (selected[f.id]) {
        chosen.push({ id: f.id, label: f.form_label, name: f.field_name, order: selected[f.id] });
      } else {
        available.push({ id: f.id, label: f.form_label, name: f.field_name });
      }
    });
    chosen.sort((a, b) => a.order - b.order);
    $("#availableFields").html(available.map(f => `<option value="${f.id}">${f.label} (${f.name})</option>`).join(""));
    $("#selectedFields").html(chosen.map(f => `<option value="${f.id}">${f.label} (${f.name})</option>`).join(""));
  });
}

function loadSettings() {
  $.getJSON("/api/admin/settings", function (res) {
    const settings = res.data || {};
    $("#doctorDownloadMultiplier").val(settings.doctor_download_multiplier ?? 1);
  }).fail(function (xhr) {
    adminMsg("settingsMsg", xhr.responseJSON?.message || "系统设置加载失败，请先导入 ensure_system_settings.sql", true);
  });
}

function loadAll() { loadUsers(); loadAdminCases(); loadFields(); loadPatientFields(); loadDiseases(); loadSettings(); }

$("#adminLoginBtn").on("click", function () {
  $.post("/api/admin/login", { username: $("#adminUser").val(), password: $("#adminPass").val() })
    .done(showAdminPanel)
    .fail(function (xhr) { adminMsg("adminLoginMsg", xhr.responseJSON?.message || "登录失败", true); });
});

$(".tab").on("click", function () {
  $(".tab").removeClass("active");
  $(this).addClass("active");
  $(".admin-tab-page").addClass("hidden");
  var tab = $(this).data("tab");
  $("#" + tab).removeClass("hidden");
  localStorage.setItem("adminTab", tab);
});

$(document).on("click", ".statusBtn", function () {
  $.post(`/api/admin/users/${$(this).data("id")}/status`, { status: $(this).data("status") }).done(loadUsers);
});

$(document).on("click", ".viewAdminCaseBtn", function () {
  loadAdminCaseDetail($(this).data("id"));
});

$(document).on("click", ".approveAdminCaseBtn", function () {
  $.post(`/api/admin/cases/${$(this).data("id")}/review`, { action: "approve" })
    .done(function (res) { alert(res.message || "审核通过"); loadAdminCases(); })
    .fail(function (xhr) { alert(xhr.responseJSON?.message || "操作失败"); });
});

$(document).on("click", ".rejectAdminCaseBtn", function () {
  const reason = prompt("请输入驳回原因");
  if (reason === null) return;
  $.post(`/api/admin/cases/${$(this).data("id")}/review`, { action: "reject", reason: reason })
    .done(function (res) { alert(res.message || "已驳回"); loadAdminCases(); })
    .fail(function (xhr) { alert(xhr.responseJSON?.message || "操作失败"); });
});

$("#addFieldBtn").on("click", function () {
  $.post("/api/admin/fields", { field_name: $("#fieldName").val(), data_type: $("#fieldType").val(), form_label: $("#fieldLabel").val(), unit: $("#fieldUnit").val(), reference_range: $("#fieldRefRange").val(), test_method: $("#fieldTestMethod").val() })
    .done(function () { loadFields(); loadFormSetting(); alert("字段已新增"); })
    .fail(function (xhr) { alert(xhr.responseJSON?.message || "新增失败"); });
});

$(document).on("click", ".saveFieldLabelBtn", function () {
  var fieldId = $(this).data("id");
  var formLabel = $(`.fieldLabelInput[data-id="${fieldId}"]`).val();
  $.post(`/api/admin/fields/${fieldId}`, { form_label: formLabel })
    .done(function () { loadFields(); loadFormSetting(); alert("表单名称已更新"); })
    .fail(function (xhr) { alert(xhr.responseJSON?.message || "更新失败"); });
});

$("#addPatientFieldBtn").on("click", function () {
  $.post("/api/admin/patient-fields", { field_name: $("#patientFieldName").val(), data_type: $("#patientFieldType").val(), form_label: $("#patientFieldLabel").val() })
    .done(function () { loadPatientFields(); alert("病患字段已新增"); })
    .fail(function (xhr) { alert(xhr.responseJSON?.message || "新增失败"); });
});

$("#diseaseSelect").on("change", loadFormSetting);

$("#moveToRight").on("click", function () {
  var from = document.getElementById("availableFields");
  var to = document.getElementById("selectedFields");
  for (var i = from.options.length - 1; i >= 0; i--) {
    if (from.options[i].selected) {
      to.appendChild(from.options[i]);
    }
  }
});

$("#moveToLeft").on("click", function () {
  var from = document.getElementById("selectedFields");
  var to = document.getElementById("availableFields");
  for (var i = from.options.length - 1; i >= 0; i--) {
    if (from.options[i].selected) {
      to.appendChild(from.options[i]);
    }
  }
});

$("#saveFormSettingBtn").on("click", function () {
  var opts = document.getElementById("selectedFields").options;
  var ids = [];
  for (var i = 0; i < opts.length; i++) {
    ids.push(opts[i].value);
  }
  $.ajax({ url: "/api/admin/form-settings/" + $("#diseaseSelect").val(), method: "POST", contentType: "application/json", data: JSON.stringify({ field_ids: ids }) })
    .done(function (res) { adminMsg("formSettingMsg", res.message); })
    .fail(function (xhr) { adminMsg("formSettingMsg", xhr.responseJSON?.message || "保存失败", true); });
});

$("#saveSettingsBtn").on("click", function () {
  $.post("/api/admin/settings", { doctor_download_multiplier: $("#doctorDownloadMultiplier").val() })
    .done(function (res) { adminMsg("settingsMsg", res.message || "系统设置已保存"); })
    .fail(function (xhr) { adminMsg("settingsMsg", xhr.responseJSON?.message || "保存失败", true); });
});
