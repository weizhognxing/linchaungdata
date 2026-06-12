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
