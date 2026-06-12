// Followup form rendering and prognosis state management.
// Loaded as plain browser script; globals shared across client scripts.
function renderFollowupFields(disease) {
  disease = normalizeCareDisease(disease);
  var isInternal = internalMedicineDiseases.indexOf(disease) > -1;
  var fields = isInternal ? followupFieldsInternal : followupFieldsNonInternal;
  var html = fields.map(function (field) {
    var hint = field[0] === "death_days" ? '<div class="hint">预后为1时填写距离入院时天数；预后为0时系统默认28天。</div>' : '';
    var input = field[2] === "select"
      ? '<select class="followup-input" data-field="' + field[0] + '"><option value="">请选择</option><option value="1">死亡</option><option value="0">生存</option></select>'
      : '<input class="followup-input" data-field="' + field[0] + '" type="' + field[2] + '" placeholder="' + field[1] + '">';
    var control = field[3] ? '<div class="input-with-unit">' + input + '<span>' + field[3] + '</span></div>' : input;
    return '<div class="form-field"><label>' + field[1] + ' *</label>' + control + hint + '</div>';
  }).join("");
  $("#followDynamicFields").html(html);

  var sel = document.querySelector("#followDynamicFields select[data-field=prognosis]");
  if (sel) {
    sel.removeEventListener("change", updateFollowupPrognosisState);
    sel.addEventListener("change", updateFollowupPrognosisState);
  }

  updateFollowupPrognosisState();
  setMsg("followMsg", "以下信息均为必填。提交前会提示尚未完成的前置步骤；提交后不能修改。");
}

function updateFollowupPrognosisState() {
  var sel = document.querySelector("#followDynamicFields select[data-field=prognosis]");
  if (!sel) return;
  var prognosis = sel.value;

  var nodes = document.querySelectorAll("#followDynamicFields .followup-input");
  for (var i = 0; i < nodes.length; i++) {
    var el = nodes[i];
    var field = el.getAttribute("data-field");
    if (field === "prognosis") continue;

    if (field === "death_days") {
      if (prognosis === "1") {
        if (el.value === "28") el.value = "";
        el.disabled = false;
      } else if (prognosis === "0") {
        el.value = "28";
        el.disabled = true;
      } else {
        el.value = "";
        el.disabled = true;
      }
      continue;
    }

    var disable = prognosis === "1";
    el.disabled = disable;
    if (disable) el.value = "";
    if (disable) el.classList.add("followup-disabled-input");
    else el.classList.remove("followup-disabled-input");

    var wrapper = el.closest(".form-field");
    if (wrapper) {
      if (disable) wrapper.classList.add("followup-disabled-field");
      else wrapper.classList.remove("followup-disabled-field");
    }
  }
}
