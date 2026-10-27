// Categories and required fields come from the server; never duplicate disease rules here.
let labCategories = [];
let currentLabProgress = {};
let labDraftValues = {};
let currentEditingLabRecordId = null;
let currentLabReportName = '';
let currentLabTimepoint = '0h';
let currentLabProgress72h = {};
let currentPlasmaNumbers = { '0h': '', '72h': '' };

const labDisplayLabelOverrides = {
  "高敏肌钙蛋白T": "高敏心肌肌钙蛋白I",
  "hs_ctnt_stat": "高敏心肌肌钙蛋白I"
};

function getLabDisplayLabel(label, fieldName) {
  return labDisplayLabelOverrides[label] || labDisplayLabelOverrides[fieldName] || label || fieldName || "";
}
