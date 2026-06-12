// Diagnosis configuration: subcategory options, field names, and selection helpers.
// Loaded as plain browser script; globals shared across client scripts.
const diagnosisFieldNames = ["diagnosis", "diagnosis_disease", "medical_history", "preliminary_diagnosis"];
const diagnosisSubcategoryOptions = {
  "脓毒症": ["呼吸系统", "消化系统", "循环系统", "泌尿系", "神经系统", "软组织", "不详"],
  "重症肺炎": [],
  "ARDS": [],
  "心肺复苏后": [],
  "急性坏死性胰腺炎": [],
  "消化道出血": [],
  "中毒": ["有机磷中毒", "CO中毒", "蘑菇中毒", "其他农药", "药物中毒", "鼠药中毒", "蜂毒中毒"],
  "心源性休克/心衰": ["急性冠脉综合征", "心力衰竭", "心肌炎", "心脏瓣膜病变", "心律失常"],
  "脑卒中": ["脑梗死", "基底节出血", "小脑出血", "蛛网膜下腔出血", "脑干出血"],
  "多发伤": ["颅脑损伤", "胸部损伤", "腹部损伤", "四肢损伤", "脊柱损伤"],
  "颅脑损伤": ["大脑挫裂伤", "缺氧缺血性脑病", "弥漫性轴索损伤", "中毒性脑病"],
  "胸部损伤": ["连枷胸", "开放性气胸", "三根以上肋骨骨折", "开放性血气胸"],
  "热射病": []
};

const patientDetailNotices = {
  base: "当前病例为暂存记录，请于24小时内完成患者采血并记录号PAXgene管编号与血浆管编号。标本管于-80℃冻存。",
  diagnosis: "当前病例为暂存记录，请继续补录诊断信息。所有基础信息均需真实填写。",
  lab: "请在填报前提前完成下列检验，并收集好数据再填报。上传、识别时请耐心等待！",
  assessment: "请在填报前提前了解下列字段，并收集好数据、计算出APACHEⅡ等相关评估分值再填报。",
  treat: "请按照每个不同的治疗字段分别选择其实施的具体时间。血管活性物下面的药物需要填报使用24小时内主要的长时间维持浓度（单位为ug/kg/min）",
  follow: "请提交入院28天内的患者预后数据。如果患者死亡（1），只需要提交入院后第几天死亡，其余不用填。如果患者28天内存活（0），默认填报均为28天；需要提前准备好其他填报数据：barthel评分；呼吸机支持天数；ICU天数；总住院费用；是否发生MODS（1表示发生；0未发生）。如果医生没有放弃，而家属确实因为没有钱治疗签字离院导致死亡的病例要删除记录。"
};

function applyDiagnosisDiseaseSelection(disease, savedSubcategories) {
  const selected = disease && diagnosisSubcategoryOptions[disease];
  document.querySelectorAll(".diagnosis-disease-label").forEach(function (label) {
    const input = label.querySelector("input");
    label.classList.toggle("hidden", !!selected && input.value !== disease);
  });
  if (!selected) {
    $("#diagnosisSubcategoryPanel").addClass("hidden");
    $("#diagnosisSubcategoryOptions").html("");
    return;
  }

  if (!selected.length) {
    $("#selectedDiagnosisDisease").text(disease);
    $("#diagnosisSubcategoryPanel").addClass("hidden");
    $("#diagnosisSubcategoryOptions").html("");
    $("#diagnosisSubcategoryHint").text("");
    return;
  }

  const inputType = getDiagnosisSubcategoryInputType(disease);
  const selectedValues = String(savedSubcategories || "").split(",").map(function (item) { return item.trim(); }).filter(Boolean);
  const html = diagnosisSubcategoryOptions[disease].map(function (item) {
    const checked = selectedValues.indexOf(item) > -1 ? " checked" : "";
    return '<label><input type="' + inputType + '" class="diagnosis-subcategory-input" name="diagnosisSubcategory" value="' + attrValue(item) + '"' + checked + '>' + item + '</label>';
  }).join("");
  $("#selectedDiagnosisDisease").text(disease);
  $("#diagnosisSubcategoryOptions").html(html);
  $("#diagnosisSubcategoryHint").text(disease === "多发伤" ? "多发伤最多可同时选择 3 项" : "请选择 1 项子分类");
  $("#diagnosisSubcategoryPanel").removeClass("hidden");
}

function getDiagnosisSubcategoryInputType(disease) {
  return disease === "多发伤" ? "checkbox" : "radio";
}

function resetDiagnosisDiseaseSelection() {
  document.querySelectorAll("[name=diagnosisDisease]").forEach(function (input) { input.checked = false; });
  document.querySelectorAll(".diagnosis-disease-label").forEach(function (label) { label.classList.remove("hidden"); });
  $("#diagnosisSubcategoryPanel").addClass("hidden");
  $("#diagnosisSubcategoryOptions").html("");
  setMsg("diagnosisMsg", "", false);
}

function enforceMultipleTraumaLimit(changedInput) {
  const selectedDisease = document.querySelector("[name=diagnosisDisease]:checked");
  if (!selectedDisease || selectedDisease.value !== "多发伤") return;
  const selected = Array.from(document.querySelectorAll(".diagnosis-subcategory-input")).filter(function (input) { return input.checked; });
  if (selected.length > 3) {
    changedInput.checked = false;
    setMsg("diagnosisMsg", "多发伤子分类最多只能选择 3 项", true);
  } else {
    setMsg("diagnosisMsg", "", false);
  }
}

function normalizeMedicalHistorySelection(changedValue) {
  const boxes = Array.from(document.querySelectorAll(".medical-history-checkbox"));
  const noneBox = boxes.find(function (box) { return box.value === "无"; });
  if (!noneBox) return;
  const selectedOthers = boxes.filter(function (box) { return box.value !== "无" && box.checked; });
  if (changedValue === "无" && noneBox.checked) {
    boxes.forEach(function (box) { box.checked = box.value === "无"; });
    return;
  }
  if (selectedOthers.length > 0) {
    noneBox.checked = false;
  } else {
    noneBox.checked = true;
  }
}
