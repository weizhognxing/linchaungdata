// Treatment form rendering: choice groups, time/text inputs, and field generation.
// Loaded as plain browser script; globals shared across client scripts.
function renderTreatmentChoiceGroup(field, title, options, defaultNone, inputType, detailFields) {
  inputType = inputType || "checkbox";
  const html = options.map(function (option) {
    const checked = defaultNone && option === "无" ? " checked" : "";
    const extras = option === "无" ? "" : (detailFields || []).map(function (detail) {
      const detailField = detail[0];
      const detailLabel = detail[1];
      const detailType = detail[2] === "time" ? "datetime-local" : detail[2];
      return '<div class="treatment-extra-field"><input class="treatment-option-extra" data-field="' + field + '" data-option="' + attrValue(option) + '" data-detail-field="' + detailField + '" type="' + detailType + '" placeholder="' + detailLabel + '"><span class="treatment-extra-placeholder">' + detailLabel + '</span></div>';
    }).join("");
    return '<div class="treatment-option-row"><label><input type="' + inputType + '" class="treatment-choice" name="treatment_' + field + '" data-field="' + field + '" value="' + attrValue(option) + '"' + checked + '>' + option + '</label><div class="treatment-option-extras">' + extras + '</div></div>';
  }).join("");
  return '<div class="treatment-section"><button type="button" class="treatment-section-toggle" data-toggle-treatment-section><span>' + title + '</span><span class="treatment-toggle-indicator">展开</span></button><div class="radio-grid hidden" data-treatment-section-body>' + html + '</div></div>';
}

function renderTreatmentTimeInput(field, label) {
  return '<div class="form-field"><label>' + label + '</label><input class="treatment-input" data-field="' + field + '" type="datetime-local" placeholder="' + label + '"></div>';
}

function renderTreatmentTextInput(field, label, type) {
  return '<div class="form-field"><label>' + label + '</label><input class="treatment-input" data-field="' + field + '" type="' + (type || 'text') + '" placeholder="' + label + '"></div>';
}

function renderTreatmentFields(disease) {
  const normalizedDisease = normalizeTreatmentDisease(disease);
  const config = treatmentConfigs[normalizedDisease] || [];
  if (!config.length) {
    $("#treatDynamicFields").html('<div class="detail-item">该疾病暂无治疗表单配置</div>');
    setMsg("treatMsg", "该疾病暂无治疗表单配置", true);
    return;
  }
  let index = 0;
  const blocks = [];
  while (index < config.length) {
    const item = config[index];
    const field = item[0];
    const label = item[1];
    const kind = item[2];
    if (treatmentOptionSets[kind]) {
      const detailFields = [];
      let nextIndex = index + 1;
      while (nextIndex < config.length && !treatmentOptionSets[config[nextIndex][2]]) {
        detailFields.push(config[nextIndex]);
        nextIndex += 1;
      }
      blocks.push(renderTreatmentChoiceGroup(field, label, treatmentOptionSets[kind], !!item[3], item[4], detailFields));
      index = nextIndex;
      continue;
    }
    if (kind === "time") blocks.push('<div class="grid two">' + renderTreatmentTimeInput(field, label) + '</div>');
    else blocks.push('<div class="grid two">' + renderTreatmentTextInput(field, label, kind) + '</div>');
    index += 1;
  }
  const html = blocks.join("");
  $("#treatDynamicFields").html(html);
  const firstSection = document.querySelector("#treatDynamicFields [data-treatment-section-body]");
  const firstToggle = document.querySelector("#treatDynamicFields [data-toggle-treatment-section]");
  if (firstSection && firstToggle) {
    firstSection.classList.remove("hidden");
    const indicator = firstToggle.querySelector(".treatment-toggle-indicator");
    if (indicator) indicator.textContent = "收起";
  }
  setMsg("treatMsg", "当前选择为" + normalizedDisease + "治疗表单");
}

function normalizeTreatmentChoice(changedInput) {
  const field = changedInput.getAttribute("data-field");
  const choices = Array.from(document.querySelectorAll('.treatment-choice[data-field="' + field + '"]'));
  const noneChoice = choices.find(function (input) { return input.value === "无"; });
  if (!noneChoice) return;
  if (changedInput.value === "无" && changedInput.checked) {
    choices.forEach(function (input) { input.checked = input.value === "无"; });
    return;
  }
  const selectedOthers = choices.filter(function (input) { return input.value !== "无" && input.checked; });
  noneChoice.checked = selectedOthers.length === 0;
}
