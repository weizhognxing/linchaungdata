// Treatment detail formatters and option detail collection.
// Loaded as plain browser script; globals shared across client scripts.
function formatTreatmentDetail(row, field, fallback) {
  const payload = parseTreatmentDetailJson(row);
  let details = payload[field + "_details"] || [];
  if (typeof details === "string") {
    try { details = JSON.parse(details) || []; } catch (e) { details = []; }
  }
  if (!Array.isArray(details) || !details.length) return fallback;
  return details.map(function (item) {
    const extras = [];
    Object.keys(item.details || {}).forEach(function (key) {
      const value = item.details[key];
      if (value) extras.push(value);
    });
    return item.option + (extras.length ? '（' + extras.join('，') + '）' : '');
  }).join('，');
}

function collectTreatmentOptionDetails(field, selected) {
  return selected.map(function (option) {
    const details = {};
    Array.from(document.querySelectorAll('.treatment-option-extra[data-field="' + field + '"]')).filter(function (input) {
      return input.getAttribute("data-option") === option;
    }).forEach(function (input) {
      details[input.getAttribute("data-detail-field")] = input.value;
    });
    return { option: option, details: details };
  });
}
