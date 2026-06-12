// Followup form rendering and prognosis state management.
// Loaded as plain browser script; globals shared across client scripts.
function renderFollowupFields(disease) {
  console.log("[followup] renderFollowupFields called with disease:", disease);
  disease = normalizeCareDisease(disease);
  console.log("[followup] normalized disease:", disease);
  const isInternal = internalMedicineDiseases.indexOf(disease) > -1;
  console.log("[followup] isInternal:", isInternal);
  const fields = isInternal ? followupFieldsInternal : followupFieldsNonInternal;
  console.log("[followup] fields count:", fields.length, "prognosis type:", fields[0][2]);
  const html = fields.map(function (field) {
    const hint = field[0] === "death_days" ? '<div class="hint">预后为1时填写距离入院时天数；预后为0时系统默认28天。</div>' : '';
    const input = field[2] === "select"
      ? '<select class="followup-input" data-field="' + field[0] + '" onchange="updateFollowupPrognosisState()"><option value="">请选择</option><option value="1">死亡</option><option value="0">生存</option></select>'
      : '<input class="followup-input" data-field="' + field[0] + '" type="' + field[2] + '" placeholder="' + field[1] + '">';
    const control = field[3] ? '<div class="input-with-unit">' + input + '<span>' + field[3] + '</span></div>' : input;
    return '<div class="form-field"><label>' + field[1] + ' *</label>' + control + hint + '</div>';
  }).join("");
  $("#followDynamicFields").html(html);
  console.log("[followup] DOM injected, calling updateFollowupPrognosisState");
  updateFollowupPrognosisState();
  setMsg("followMsg", "以下信息均为必填。提交前会提示尚未完成的前置步骤；提交后不能修改。");
}

function updateFollowupPrognosisState() {
  console.log("[followup] updateFollowupPrognosisState FIRED");
  const prognosisEl = $("#followDynamicFields .followup-input[data-field=prognosis]");
  console.log("[followup] prognosis element found:", prognosisEl.length, "tag:", prognosisEl.prop("tagName"));
  const prognosis = prognosisEl.val();
  console.log("[followup] prognosis value:", prognosis);
  const deathDays = $("#followDynamicFields .followup-input[data-field=death_days]");
  console.log("[followup] deathDays found:", deathDays.length);
  if (!deathDays.length) { console.log("[followup] no deathDays, returning"); return; }
  const disabledFields = $("#followDynamicFields .followup-input").not("[data-field=prognosis], [data-field=death_days]");
  console.log("[followup] disabledFields count:", disabledFields.length);
  const shouldDisable = prognosis === "1";
  console.log("[followup] shouldDisable:", shouldDisable);
  disabledFields.prop("disabled", shouldDisable).attr("disabled", shouldDisable ? "disabled" : null);
  disabledFields.toggleClass("followup-disabled-input", shouldDisable);
  disabledFields.closest(".form-field").toggleClass("followup-disabled-field", shouldDisable);
  if (prognosis === "1") {
    console.log("[followup] DEATH mode: clearing disabled fields, enabling deathDays");
    disabledFields.val("");
    deathDays.prop("disabled", false).val(deathDays.val() === "28" ? "" : deathDays.val());
  } else if (prognosis === "0") {
    console.log("[followup] SURVIVAL mode: setting deathDays to 28 and disabling");
    deathDays.val("28").prop("disabled", true);
  } else {
    console.log("[followup] NO SELECTION: disabling deathDays");
    deathDays.val("").prop("disabled", true);
  }
}
