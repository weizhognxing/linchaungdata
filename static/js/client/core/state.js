// Global state, panel navigation, and basic utilities.
// Loaded as plain browser script; globals shared across client scripts.
let selectedDiseaseId = null;
let uploadedPhotoPath = null;
let selectedFile = null;
let canReviewMembers = false;
let currentPatientId = null;
let currentPatientIsComplete = false;
let currentUploadMode = "intake";
let currentUploadPatientId = null;
let currentRecordCategory = null;
let currentCategoryLabel = "";
let pendingLabUploadPatientId = null;
let pendingLabUploadCategory = "";
let pendingLabUploadLabel = "";
let diseaseSelectionPurpose = "";
const saveRecordButtonText = "保存信息";
const photoTargetBytes = 200 * 1024;
const photoTargetMaxBytes = 230 * 1024;
let fileSelectToken = 0;

function isMobile() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

function initPhotoButtons() {
  if (isMobile()) {
    $("#photoPanelTitle").text("拍照上传");
    $("#takePhotoBtn").removeClass("hidden");
    $("#uploadBtn").removeClass("hidden");
    $("#photoActions").removeClass("single-btn");
  } else {
    $("#photoPanelTitle").text("上传检验图片");
    $("#takePhotoBtn").addClass("hidden");
    $("#uploadBtn").removeClass("hidden");
    $("#photoActions").addClass("single-btn");
  }
}

var authPanels = ["loginPanel", "registerPanel", "resetPanel"];
var topPanels = ["diseasePanel", "caseListPanel", "memberReviewPanel"];
var currentPanelId = "";

function showPanel(id) {
  $(".panel").addClass("hidden");
  $("#" + id).removeClass("hidden");
  currentPanelId = id;
  localStorage.setItem("clientPanel", id);
  const isAuthPanel = authPanels.indexOf(id) > -1;
  const isTopPanel = topPanels.indexOf(id) > -1;
  $("#clientHero").toggleClass("hidden", !isAuthPanel && !isTopPanel);
  $("#innerBackBtn").toggleClass("hidden", isAuthPanel || isTopPanel);
  if (!isAuthPanel) {
    $("#bottomNav").removeClass("hidden");
    $(".nav-item").removeClass("active");
    $(".nav-item[data-nav='" + id + "']").addClass("active");
    if ((id === "recordPanel" || id === "photoPanel") && currentUploadMode === "intake") {
      $(".nav-item[data-nav='newCase']").addClass("active");
    }
    if ((id === "recordPanel" || id === "photoPanel") && currentUploadMode !== "intake") {
      $(".nav-item[data-nav='caseListPanel']").addClass("active");
    }
    if (id === "diseasePanel" && isDiseasePanelLabMode()) {
      $(".nav-item[data-nav='caseListPanel']").addClass("active");
    }
    if (id === "patientDetailPanel" || id === "labReportPanel") {
      $(".nav-item[data-nav='caseListPanel']").addClass("active");
    }
  } else {
    $("#bottomNav").addClass("hidden");
  }

  if (id === "memberReviewPanel") {
    loadMemberReviews();
  }
  if (id === "diseasePanel") {
    loadDiseases();
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
