// Followup form rendering and prognosis state management.
// Loaded as plain browser script; globals shared across client scripts.
function renderFollowupFields(disease) {
  disease = normalizeCareDisease(disease);
  const isInternal = internalMedicineDiseases.indexOf(disease) > -1;
  const fields = isInternal ? followupFieldsInternal : followupFieldsNonInternal;
  const html = fields.map(function (field) {
    const hint = field[0] === "death_days" ? '<div class="hint">预后为1时填写距离入院时天数；预后为0时系统默认28天。</div>' : '';
    const input = field[2] === "select"
      ? '<select class="followup-input" data-field="' + field[0] + '" onchange="updateFollowupPrognosisState()"><option value="">请选择</option><option value="1">死亡</option><option value="0">生存</option></select>'
      : '<input class="followup-input" data-field="' + field[0] + '" type="' + field[2] + '" placeholder="' + field[1] + '">';
    const control = field[3] ? '<div class="input-with-unit">' + input + '<span>' + field[3] + '</span></div>' : input;
    return '<div class="form-field"><label>' + field[1] + ' *</label>' + control + hint + '</div>';
  }).join("");
  $("#followDynamicFields").html(html);
  updateFollowupPrognosisState();
  setMsg("followMsg", "以下信息均为必填。提交前会提示尚未完成的前置步骤；提交后不能修改。");
}

function updateFollowupPrognosisState() {
  const prognosis = $("#followDynamicFields .followup-input[data-field=prognosis]").val();
  const deathDays = $("#followDynamicFields .followup-input[data-field=death_days]");
  if (!deathDays.length) return;
  const disabledFields = $("#followDynamicFields .followup-input").not("[data-field=prognosis], [data-field=death_days]");
  disabledFields.prop("disabled", prognosis === "1").attr("disabled", prognosis === "1" ? "disabled" : null);
  disabledFields.toggleClass("followup-disabled-input", prognosis === "1");
  disabledFields.closest(".form-field").toggleClass("followup-disabled-field", prognosis === "1");
  if (prognosis === "1") {
    disabledFields.val("");
    deathDays.prop("disabled", false).val(deathDays.val() === "28" ? "" : deathDays.val());
  } else if (prognosis === "0") {
    deathDays.val("28").prop("disabled", true);
  } else {
    deathDays.val("").prop("disabled", true);
  }
}
