// Initial page bootstrap; load this after all helpers and event bindings.
// Loaded as a plain browser script; globals are shared across client scripts.
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
      var savedLabContext = loadLabUploadContext();
      if (saved && saved !== "loginPanel" && saved !== "registerPanel" && saved !== "resetPanel") {
        if (saved === "memberReviewPanel" && !canReviewMembers) {
          openNewCaseForm();
        } else if (saved === "labReportPanel") {
          showPanel("caseListPanel");
        } else if (saved === "diseasePanel" && savedLabContext.patientId) {
          openDiseaseSelectionForLabUpload(savedLabContext.patientId, savedLabContext.categoryKey, savedLabContext.categoryLabel);
        } else if (saved === "diseasePanel" || saved === "photoPanel" || saved === "recordPanel") {
          openNewCaseForm();
        } else {
          showPanel(saved);
        }
      } else {
        openNewCaseForm();
      }
    }
  }).fail(function() {
    localStorage.removeItem("clientPanel");
    localStorage.removeItem("selectedDiseaseId");
    showPanel("loginPanel");
  });
});
