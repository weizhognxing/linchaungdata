// Assessment form rendering and dynamic value calculation.
// Loaded as plain browser script; globals shared across client scripts.
function renderAssessmentFields(disease) {
  disease = normalizeCareDisease(disease);
  const fields = assessmentFieldsByDisease[disease] || [];
  const html = fields.map(function (field) {
    const readonly = field[3] ? ' readonly' : '';
    if (field[5] === "oxygen_dual_unit") {
      return '<div class="form-field"><label>' + field[1] + ' *</label><div class="input-with-unit"><input class="assessment-input assessment-mmhg-input" data-field="oxygen_partial_pressure" type="number" placeholder="氧分压"><span>mmHg</span></div><div class="input-with-unit"><input class="assessment-kpa-input" type="number" placeholder="氧分压"><span>kPa</span></div></div>';
    }
    const input = '<input class="assessment-input" data-field="' + field[0] + '" type="' + field[2] + '" placeholder="' + field[1] + '"' + readonly + '>';
    const control = field[4] ? '<div class="input-with-unit">' + input + '<span>' + field[4] + '</span></div>' : input;
    return '<div class="form-field"><label>' + field[1] + ' *</label>' + control + '</div>';
  }).join("");
  $("#assessmentDynamicFields").html(html || '<div class="detail-item">该疾病暂无评估字段配置</div>');
  setMsg("assessmentMsg", fields.length ? "当前选择为" + disease + "评估表单" : "该疾病暂无评估字段配置", !fields.length);
}

function updateAssessmentShockIndex() {
  const shockInput = document.querySelector("#assessmentDynamicFields .assessment-input[data-field=shock_index]");
  if (!shockInput || !shockInput.hasAttribute("readonly")) return;
  const systolic = Number($("#assessmentDynamicFields .assessment-input[data-field=systolic_bp]").val());
  const heartRate = Number($("#assessmentDynamicFields .assessment-input[data-field=heart_rate]").val());
  const shockIndex = systolic > 0 && heartRate > 0 ? (heartRate / systolic).toFixed(2) : "";
  shockInput.value = shockIndex;
}

function updateAssessmentOxygenFromKpa() {
  const kpa = Number($("#assessmentDynamicFields .assessment-kpa-input").val());
  if (kpa > 0) {
    $("#assessmentDynamicFields .assessment-input[data-field=oxygen_partial_pressure]").val((kpa * 7.5).toFixed(1));
  } else {
    $("#assessmentDynamicFields .assessment-input[data-field=oxygen_partial_pressure]").val("");
  }
}

function updateAssessmentOxygenFromMmhg() {
  const mmhg = Number($("#assessmentDynamicFields .assessment-input[data-field=oxygen_partial_pressure]").val());
  if (mmhg > 0) {
    $("#assessmentDynamicFields .assessment-kpa-input").val((mmhg / 7.5).toFixed(1));
  } else {
    $("#assessmentDynamicFields .assessment-kpa-input").val("");
  }
}
