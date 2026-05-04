function adminMsg(id, text, error) { $("#" + id).text(text).toggleClass("error", !!error); }

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

var fieldPage = 1;
var fieldSearch = "";

function loadFields() {
  $.getJSON("/api/admin/fields", { page: fieldPage, per_page: 8, search: fieldSearch }, function (res) {
    const rows = res.data.list.map(f => `<tr><td>${f.form_label}</td><td>${f.field_name}</td><td>${f.data_type}</td><td>${f.unit || ''}</td><td>${f.reference_range || ''}</td><td>${f.test_method || ''}</td></tr>`).join("");
    $("#fieldRows").html(rows);
    renderPagination(res.data.total, res.data.page, res.data.per_page);
  });
}

function renderPagination(total, page, per_page) {
  var totalPages = Math.ceil(total / per_page);
  var html = '';
  html += '<button ' + (page <= 1 ? 'disabled' : '') + ' onclick="goFieldPage(' + (page - 1) + ')">上一页</button>';
  for (var i = 1; i <= totalPages; i++) {
    html += '<button class="' + (i === page ? 'active' : '') + '" onclick="goFieldPage(' + i + ')">' + i + '</button>';
  }
  html += '<button ' + (page >= totalPages ? 'disabled' : '') + ' onclick="goFieldPage(' + (page + 1) + ')">下一页</button>';
  $("#fieldPagination").html(html);
}

function goFieldPage(page) {
  fieldPage = page;
  loadFields();
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
    const html = res.data.fields.map(f => `<label><input type="checkbox" value="${f.id}" ${selected[f.id] ? 'checked' : ''}>${f.form_label} <span class="hint">${f.field_name}</span></label>`).join("");
    $("#formFieldChecks").html(html);
  });
}

function loadAll() { loadUsers(); loadFields(); loadDiseases(); }

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

$("#addFieldBtn").on("click", function () {
  $.post("/api/admin/fields", { field_name: $("#fieldName").val(), data_type: $("#fieldType").val(), form_label: $("#fieldLabel").val(), unit: $("#fieldUnit").val(), reference_range: $("#fieldRefRange").val(), test_method: $("#fieldTestMethod").val() })
    .done(function () { loadFields(); loadFormSetting(); alert("字段已新增"); })
    .fail(function (xhr) { alert(xhr.responseJSON?.message || "新增失败"); });
});

$("#diseaseSelect").on("change", loadFormSetting);

$("#saveFormSettingBtn").on("click", function () {
  const ids = $("#formFieldChecks input:checked").map(function () { return $(this).val(); }).get();
  $.ajax({ url: `/api/admin/form-settings/${$("#diseaseSelect").val()}`, method: "POST", contentType: "application/json", data: JSON.stringify({ field_ids: ids }) })
    .done(function (res) { adminMsg("formSettingMsg", res.message); })
    .fail(function (xhr) { adminMsg("formSettingMsg", xhr.responseJSON?.message || "保存失败", true); });
});
