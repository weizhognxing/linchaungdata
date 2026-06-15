// Navigation events: show panel, bottom nav, back button, detail/export tab clicks.
// Loaded as plain browser script; globals shared across client scripts.
$(document).on("click", "[data-show]", function () { showPanel($(this).data("show")); });

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

$(document).on("click", "#innerBackBtn", function () {
  backFromInnerPage();
});

async function downloadCaseExportWithPicker(filename) {
  let handle = null;
  if (window.showSaveFilePicker) {
    handle = await window.showSaveFilePicker({
      suggestedName: filename,
      types: [{ description: "ZIP压缩包", accept: { "application/zip": [".zip"] } }]
    });
  }
  const response = await fetch("/api/cases/export");
  if (!response.ok) {
    let message = "导出失败";
    try {
      const errorBody = await response.json();
      message = errorBody.message || message;
    } catch (e) {}
    throw new Error(message);
  }
  const blob = await response.blob();
  if (handle) {
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return "picked";
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  return "downloaded";
}

$(document).on("click", "#exportCasesBtn", async function () {
  const button = this;
  button.disabled = true;
  button.textContent = "导出中";
  const filename = "case_export_" + Date.now() + ".zip";
  const supportsPicker = !!window.showSaveFilePicker;
  setMsg("caseListMsg", supportsPicker ? "请选择导出文件保存位置..." : "正在准备导出文件，当前浏览器不支持网页内选择目录，将使用浏览器默认下载位置。", false);
  try {
    const mode = await downloadCaseExportWithPicker(filename);
    setMsg("caseListMsg", mode === "picked" ? "完整记录数据已导出到选择的位置。" : "完整记录数据已开始下载。", false);
  } catch (e) {
    setMsg("caseListMsg", e.message || "导出失败", true);
  } finally {
    button.disabled = false;
    button.textContent = "导出数据";
  }
});

$(document).on("click", "#caseListPanel .inner-tab", function () {
  showCaseSubTab(this.getAttribute("data-case-tab"));
});

$(document).on("click", ".detail-tab", function () {
  const tab = this.getAttribute("data-detail-tab");
  updatePatientDetailNotice(tab, currentPatientIsComplete);
  $(".detail-tab").removeClass("active");
  $(this).addClass("active");
  $(".detail-tab-page").addClass("hidden");
  if (tab === "base") $("#detailBaseTab").removeClass("hidden");
  if (tab === "diagnosis") {
    $("#detailDiagnosisTab").removeClass("hidden");
    showDiagnosisSubTab("list");
  }
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

$(document).on("click", "#detailDiagnosisTab .inner-tab", function () {
  showDiagnosisSubTab(this.getAttribute("data-diagnosis-tab"));
});

$(document).on("click", "#showNewCaseBtn", function () {
  openNewCaseForm();
});

$(document).on("click", "#backToLabListBtn", function () {
  if (currentPatientId) {
    loadPatientDetail(currentPatientId, "lab");
  } else {
    showPanel("caseListPanel");
  }
});
