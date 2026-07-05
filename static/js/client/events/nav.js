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

document.addEventListener("click", function (event) {
  const newCaseNav = event.target && event.target.closest ? event.target.closest(".nav-item[data-nav='newCase']") : null;
  if (!newCaseNav) return;
  event.preventDefault();
  if (typeof openNewCaseForm === "function") {
    openNewCaseForm();
  }
});

$(document).on("click", "#innerBackBtn", function () {
  backFromInnerPage();
});

async function downloadCaseExportToDirectory(filename) {
  if (!window.showDirectoryPicker) {
    throw new Error("当前浏览器不支持选择下载目录，请使用最新版 Chrome 或 Edge，并通过 HTTPS 访问系统。");
  }
  const directoryHandle = await window.showDirectoryPicker({ mode: "readwrite" });
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
  const fileHandle = await directoryHandle.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
}

function downloadCaseExportWithAndroid(filename) {
  return new Promise(function (resolve, reject) {
    if (!window.AndroidExport || typeof window.AndroidExport.saveExportFile !== "function") {
      reject(new Error("安卓导出接口不可用"));
      return;
    }
    window.onAndroidExportResult = function (success, message) {
      window.onAndroidExportResult = null;
      if (success) {
        resolve(message || "完整记录数据已导出到选择的目录。");
      } else if (message === "已取消导出") {
        const error = new Error(message);
        error.name = "AbortError";
        reject(error);
      } else {
        reject(new Error(message || "导出失败"));
      }
    };
    window.AndroidExport.saveExportFile("/api/cases/export", filename);
  });
}

$(document).on("click", "#exportCasesBtn", async function () {
  const button = this;
  button.disabled = true;
  button.textContent = "导出中";
  const filename = "case_export_" + Date.now() + ".zip";
  setMsg("caseListMsg", "请选择导出目录...", false);
  try {
    const message = window.AndroidExport
      ? await downloadCaseExportWithAndroid(filename)
      : (await downloadCaseExportToDirectory(filename), "完整记录数据已导出到选择的目录。");
    setMsg("caseListMsg", message, false);
  } catch (e) {
    if (e && e.name === "AbortError") {
      setMsg("caseListMsg", "已取消导出。", false);
    } else {
      setMsg("caseListMsg", e.message || "导出失败", true);
    }
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
