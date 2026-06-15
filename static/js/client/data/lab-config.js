// Lab category definitions and disease-to-required-lab mappings.
// Loaded as plain browser script; globals shared across client scripts.
const labCategories = [
  { key: "blood_crp", label: "血细胞分析+CRP" },
  { key: "dic", label: "DIC" },
  { key: "biochemistry", label: "生化" },
  { key: "electrolytes", label: "电解质" },
  { key: "blood_gas", label: "血气分析" },
  { key: "pct", label: "PCT" },
  { key: "lactate", label: "乳酸" },
  { key: "myocardial_injury", label: "心肌损伤标志物" },
  { key: "cytokine_12", label: "细胞因子12" },
  { key: "pathogen", label: "病原学检查" },
  { key: "bnp", label: "BNP" },
  { key: "amylase", label: "血淀粉酶" },
  { key: "cholinesterase", label: "血清胆碱酯酶" },
  { key: "toxin_identification", label: "毒物鉴定" }
];

const commonRequiredLabKeys = ["blood_crp", "dic", "biochemistry", "electrolytes", "blood_gas", "pct", "lactate"];
const diseaseRequiredLabKeys = {
  "脓毒症": commonRequiredLabKeys.concat(["myocardial_injury", "cytokine_12", "pathogen"]),
  "重症肺炎": commonRequiredLabKeys.concat(["myocardial_injury", "cytokine_12", "pathogen"]),
  "ARDS": commonRequiredLabKeys.concat(["myocardial_injury", "cytokine_12", "pathogen"]),
  "心肺复苏后": commonRequiredLabKeys.concat(["myocardial_injury", "cytokine_12", "bnp"]),
  "急性坏死性胰腺炎": commonRequiredLabKeys.concat(["myocardial_injury", "cytokine_12", "amylase"]),
  "急性重症胰腺炎": commonRequiredLabKeys.concat(["myocardial_injury", "cytokine_12", "amylase"]),
  "消化道出血": commonRequiredLabKeys,
  "中毒": commonRequiredLabKeys.concat(["myocardial_injury", "toxin_identification"]),
  "心源性休克/心衰": commonRequiredLabKeys.concat(["myocardial_injury", "bnp"]),
  "心源性休克/心力衰竭": commonRequiredLabKeys.concat(["myocardial_injury", "bnp"]),
  "脑卒中": commonRequiredLabKeys.concat(["myocardial_injury"]),
  "多发伤": commonRequiredLabKeys.concat(["myocardial_injury"]),
  "颅脑损伤": commonRequiredLabKeys.concat(["myocardial_injury"]),
  "胸部损伤": commonRequiredLabKeys.concat(["myocardial_injury"]),
  "热射病": commonRequiredLabKeys.concat(["myocardial_injury", "cytokine_12"])
};

const labDisplayLabelOverrides = {
  "高敏肌钙蛋白T": "高敏心肌肌钙蛋白I",
  "hs_ctnt_stat": "高敏心肌肌钙蛋白I"
};

function getLabDisplayLabel(label, fieldName) {
  return labDisplayLabelOverrides[label] || labDisplayLabelOverrides[fieldName] || label || fieldName || "";
}
