// Patient detail rendering, lab lists, diagnosis helpers, and report display.
// Loaded as a plain browser script; globals are shared across client scripts.
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

function updatePatientDetailNotice(tab, isCompleteCase) {
  const message = isCompleteCase ? "当前病例为完整记录，提交后不能修改。" : (patientDetailNotices[tab || "base"] || patientDetailNotices.base);
  setMsg("patientDetailMsg", message, false);
}

function showTreatSubTab(tab) {
  tab = tab || "list";
  document.querySelectorAll("#detailTreatTab .inner-tab").forEach(function (button) {
    button.classList.toggle("active", button.getAttribute("data-treat-tab") === tab);
  });
  $("#treatListPanel").toggleClass("hidden", tab !== "list");
  $("#treatAddPanel").toggleClass("hidden", tab !== "add");
  if (tab !== "add") {
    $("#treatFormPanel").addClass("hidden");
  }
  if (tab === "add") {
    const selectedDiagnosis = document.querySelector("[name=selectedDiagnosisRecordTreat]:checked");
    if (selectedDiagnosis) {
      $("#treatFormPanel").removeClass("hidden");
      renderTreatmentFields(getDiagnosisOptionDisease(selectedDiagnosis));
    }
  }
}

function showFollowSubTab(tab) {
  tab = tab || "list";
  document.querySelectorAll("#detailFollowTab .inner-tab").forEach(function (button) {
    button.classList.toggle("active", button.getAttribute("data-follow-tab") === tab);
  });
  $("#followListPanel").toggleClass("hidden", tab !== "list");
  $("#followAddPanel").toggleClass("hidden", tab !== "add");
  if (tab !== "add") {
    $("#followFormPanel").addClass("hidden");
  }
  if (tab === "add") {
    const selectedDiagnosis = document.querySelector("[name=selectedDiagnosisRecordFollow]:checked");
    if (selectedDiagnosis) {
      $("#followFormPanel").removeClass("hidden");
      renderFollowupFields(selectedDiagnosis.getAttribute("data-disease") || "");
    }
  }
}

function showAssessmentSubTab(tab) {
  tab = tab || "list";
  document.querySelectorAll("#detailAssessmentTab .inner-tab").forEach(function (button) {
    button.classList.toggle("active", button.getAttribute("data-assessment-tab") === tab);
  });
  $("#assessmentListPanel").toggleClass("hidden", tab !== "list");
  $("#assessmentAddPanel").toggleClass("hidden", tab !== "add");
  if (tab !== "add") {
    $("#assessmentFormPanel").addClass("hidden");
  }
  if (tab === "add") {
    const selectedDiagnosis = document.querySelector("[name=selectedDiagnosisRecordAssessment]:checked");
    if (selectedDiagnosis) {
      $("#assessmentFormPanel").removeClass("hidden");
      renderAssessmentFields(selectedDiagnosis.getAttribute("data-disease") || "");
    }
  }
}

function renderCaseCards(items, emptyText) {
  return (items || []).map(function (item) {
    const disease = item.disease_name ? ' ｜ 疾病：' + item.disease_name : '';
    const isComplete = getCaseIntegrity(item) === 'complete';
    const status = isComplete ? '完整记录' : '暂存记录';
    const actionText = isComplete ? '查看' : '继续完善';
    const statusClass = isComplete ? 'case-badge-complete' : 'case-badge-draft';
    return '<div class="case-item" data-id="' + item.id + '">' +
      '<div class="case-head"><strong>' + (item.name || '-') + '</strong><span class="case-badge ' + statusClass + '">' + status + '</span><button class="btn-sm view-case-btn" data-id="' + item.id + '">' + actionText + '</button></div>' +
      '<div class="case-meta">性别：' + (item.gender || '-') + ' ｜ 年龄：' + (item.age || '-') + ' ｜ 登记号：' + (item.id_number || '-') + disease + '</div>' +
      '<div class="case-meta">记录完整性：' + status + ' ｜ 已录入 ' + Number(item.record_count || 0) + ' 条检验记录</div>' +
      '</div>';
  }).join('') || '<div class="detail-item">' + emptyText + '</div>';
}

function showCaseSubTab(tab) {
  tab = tab || "draft";
  document.querySelectorAll("#caseListPanel .inner-tab").forEach(function (button) {
    button.classList.toggle("active", button.getAttribute("data-case-tab") === tab);
  });
  $("#caseDraftPanel").toggleClass("hidden", tab !== "draft");
  $("#caseCompletePanel").toggleClass("hidden", tab !== "complete");
}

function showLabSubTab(tab) {
  tab = tab || "list";
  document.querySelectorAll("#detailLabTab .inner-tab").forEach(function (button) {
    button.classList.toggle("active", button.getAttribute("data-lab-tab") === tab);
  });
  $("#labListPanel").toggleClass("hidden", tab !== "list");
  $("#labAddPanel").toggleClass("hidden", tab !== "add");
}

function normalizeDateTimeLocalValue(value) {
  value = String(value || "").trim();
  if (!value) return "";
  return value.replace(" ", "T").slice(0, 16);
}

function resolveBaseInfoInputType(field) {
  const fieldName = String(field.field_name || "").toLowerCase();
  const label = String(field.form_label || "");
  const dataType = String(field.data_type || field.type || "").toLowerCase();
  if (label === "入院时间" || fieldName.indexOf("admission") > -1 || dataType === "datetime") return "datetime-local";
  if (dataType === "date") return "date";
  if (dataType === "int" || dataType === "decimal" || dataType === "number") return "number";
  return field.type || "text";
}

function resolveBaseInfoValue(field) {
  const value = field.value;
  const inputType = resolveBaseInfoInputType(field);
  if (inputType === "datetime-local") return normalizeDateTimeLocalValue(value);
  return value;
}

function showDiagnosisSubTab(tab) {
  tab = tab || "list";
  document.querySelectorAll("#detailDiagnosisTab .inner-tab").forEach(function (button) {
    button.classList.toggle("active", button.getAttribute("data-diagnosis-tab") === tab);
  });
  $("#diagnosisListPanel").toggleClass("hidden", tab !== "list");
  $("#diagnosisAddPanel").toggleClass("hidden", tab !== "add");
}

function fillDiagnosisForm(patient) {
  resetDiagnosisDiseaseSelection();

  const history = String(patient.medical_history || "无").split(",").map(function (item) { return item.trim(); }).filter(Boolean);
  const selectedHistory = history.length ? history : ["无"];
  document.querySelectorAll(".medical-history-checkbox").forEach(function (input) {
    input.checked = selectedHistory.indexOf(input.value) > -1;
  });
  normalizeMedicalHistorySelection();
  setMsg("diagnosisMsg", "", false);
}

function getDiagnosisSubcategoryInputType(disease) {
  return disease === "多发伤" ? "checkbox" : "radio";
}

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

function loadPatientDetail(patientId, activeTab, subTab) {
  activeTab = activeTab || "base";
  $.getJSON("/api/patients/" + patientId)
    .done(function (res) {
      if (!res.success) {
        alert("加载病人详情失败");
        return;
      }
      const patient = res.data.patient || {};
      currentPatientId = patientId;
      if (patient.last_disease_id) {
        selectedDiseaseId = patient.last_disease_id;
        localStorage.setItem("selectedDiseaseId", selectedDiseaseId);
      }
      const patientFields = res.data.patient_fields || [];
      renderDiagnosisRecordLists(res.data.diagnosis_records || []);
      fillDiagnosisForm(patient);
      $("#patientProfile").html(
        '<div><strong>' + (patient.name || '-') + '</strong></div>' +
        '<div class="case-meta">性别：' + (patient.gender || '-') + ' ｜ 年龄：' + (patient.age || '-') + ' ｜ 登记号：' + (patient.id_number || '-') + ' ｜ 记录完整性：' + (getCaseIntegrity(patient) === 'complete' ? '完整记录' : '暂存记录') + '</div>'
      );
      $("#labCategoryActions").toggleClass("hidden", getCaseIntegrity(patient) === 'complete');
      const isCompleteCase = getCaseIntegrity(patient) === 'complete';
      currentPatientIsComplete = isCompleteCase;
      $("#saveBaseInfoBtn, #saveDiagnosisBtn, #addAssessmentBtn, #addTreatBtn, #addFollowBtn").toggleClass("hidden", isCompleteCase);
      $("#detailLabTab .inner-tab[data-lab-tab=add], #detailAssessmentTab .inner-tab[data-assessment-tab=add], #detailTreatTab .inner-tab[data-treat-tab=add], #detailFollowTab .inner-tab[data-follow-tab=add], #detailDiagnosisTab .inner-tab[data-diagnosis-tab=add]").toggleClass("hidden", isCompleteCase);
      $(".delete-diagnosis-btn").toggleClass("hidden", isCompleteCase);
      updatePatientDetailNotice(activeTab, isCompleteCase);

      const baseFields = [
        { field_name: 'name', form_label: '姓名', value: patient.name, required: true },
        { field_name: 'gender', form_label: '性别', value: patient.gender, required: true },
        { field_name: 'age', form_label: '年龄', value: patient.age, required: true, type: 'number' },
        { field_name: 'id_number', form_label: '登记号', value: patient.id_number, required: false }
      ].concat(patientFields.filter(function (f) {
        const duplicateLabels = ["登记号", "病历号", "联系电话", "电话", "手机号码"];
        return diagnosisFieldNames.indexOf(f.field_name) === -1 && duplicateLabels.indexOf(f.form_label) === -1;
      }).map(function (f) { f.required = true; return f; }));
      const baseHtml = baseFields.map(function (f) {
        return '<div class="form-field"><label>' + f.form_label + (f.required ? ' *' : '') + '</label>' +
          '<input class="base-info-input" data-field="' + f.field_name + '" type="' + resolveBaseInfoInputType(f) + '" value="' + attrValue(resolveBaseInfoValue(f)) + '" placeholder="' + f.form_label + '"' + (isCompleteCase ? ' disabled' : '') + '></div>';
      }).join('') || '<div class="detail-item">暂无基础信息</div>';
      $("#baseInfoList").html(baseHtml);
      setMsg("baseInfoMsg", "", false);

      const labHtml = (res.data.lab_records || []).map(function (r) {
        const categoryName = r.lab_test_name || getLabCategoryLabel(r.record_category) || '-';
        const diseaseText = r.disease_name ? ' ｜ 疾病：' + r.disease_name : '';
        return '<div class="detail-item lab-record-item" data-record-id="' + r.id + '">' +
          '<strong>' + categoryName + '</strong>' + diseaseText + ' ｜ 录入人：' + (r.operator_name || '-') +
          '<div class="case-meta">点击查看检验详情</div>' +
          '</div>';
      }).join('') || '<div class="detail-item">暂无检验记录</div>';
      $("#labRecordList").html(labHtml);
      renderLabCategoryActions(patient, res.data.lab_records || []);

      const treatHtml = (res.data.treatments || []).map(function (r) {
        const details = [];
        if (r.diagnosis_disease) details.push('疾病：' + r.diagnosis_disease);
        if (r.antibiotics) details.push('抗生素：' + formatTreatmentDetail(r, 'antibiotics', r.antibiotics));
        if (r.vasoactive_drugs) details.push('血管活性药物：' + formatTreatmentDetail(r, 'vasoactive_drugs', r.vasoactive_drugs));
        if (r.volume_management) details.push('血容量管理：' + formatTreatmentDetail(r, 'volume_management', r.volume_management));
        if (r.respiratory_support) details.push('辅助呼吸：' + r.respiratory_support);
        if (r.immunomodulators) details.push('免疫调节药物：' + r.immunomodulators);
        if (r.blood_purification) details.push('血液净化：' + r.blood_purification);
        if (r.traditional_chinese_medicine) details.push('中医中药：' + r.traditional_chinese_medicine);
        if (r.digestive_secretion_drugs) details.push('消化液分泌：' + r.digestive_secretion_drugs);
        if (r.cardiac_treatment_methods) details.push('治疗手段：' + r.cardiac_treatment_methods);
        if (r.poisoning_other_drugs) details.push('其他药物：' + r.poisoning_other_drugs);
        if (r.intracranial_pressure_reduction) details.push('降颅压：' + r.intracranial_pressure_reduction);
        if (r.surgical_treatment) details.push('手术治疗：' + r.surgical_treatment);
        if (r.surgery_methods) details.push('手术方式：' + r.surgery_methods);
        if (r.chest_fixation) details.push('胸部固定：' + r.chest_fixation);
        if (r.airway_control) details.push('气道控制：' + r.airway_control);
        if (r.blood_transfusion) details.push('输血：' + r.blood_transfusion);
        return '<div class="detail-item">' + (r.treat_time || '-') + '<br>' + (r.treatment_method || '-') +
          (details.length ? '<div class="case-meta">' + details.join(' ｜ ') + '</div>' : '') + '</div>';
      }).join('') || '<div class="detail-item">暂无治疗记录</div>';
      $("#treatList").html(treatHtml);

      const followHtml = (res.data.followups || []).map(function (r) {
        return '<div class="detail-item">' + (r.follow_time || '-') + '<br>' + (r.follow_result || '-') + '</div>';
      }).join('') || '<div class="detail-item">暂无随访记录</div>';
      $("#followList").html(followHtml);
      const assessmentHtml = (res.data.assessments || []).map(function (r) {
        return '<div class="detail-item">' + (r.assessment_time || '-') + '<br>' + (r.diagnosis_disease || '-') + ' ｜ 休克指数：' + (r.shock_index || '-') + '</div>';
      }).join('') || '<div class="detail-item">暂无评估记录</div>';
      $("#assessmentList").html(assessmentHtml);
      $("#treatDynamicFields").html("");
      showTreatSubTab("list");
      showLabSubTab("list");
      $("#followDynamicFields").html("");
      $("#assessmentDynamicFields").html("");
      showFollowSubTab("list");
      showAssessmentSubTab("list");

      $(".detail-tab").removeClass("active");
      $(".detail-tab[data-detail-tab='" + activeTab + "']").addClass("active");
      $(".detail-tab-page").addClass("hidden");
      if (activeTab === "base") $("#detailBaseTab").removeClass("hidden");
      if (activeTab === "diagnosis") {
        $("#detailDiagnosisTab").removeClass("hidden");
        showDiagnosisSubTab(subTab || "list");
      }
      if (activeTab === "lab") {
        $("#detailLabTab").removeClass("hidden");
        showLabSubTab(subTab || "list");
      }
      if (activeTab === "assessment") $("#detailAssessmentTab").removeClass("hidden");
      if (activeTab === "treat") $("#detailTreatTab").removeClass("hidden");
      if (activeTab === "follow") $("#detailFollowTab").removeClass("hidden");
      showPanel("patientDetailPanel");
    })
    .fail(function (xhr) {
      alert(xhr.responseJSON?.message || "加载病人详情失败");
    });
}

function loadLabRecordDetail(recordId) {
  setMsg("labReportMsg", "", false);
  $.getJSON("/api/records/" + recordId)
    .done(function (res) {
      if (!res.success) {
        setMsg("labReportMsg", "检验详情加载失败", true);
        showPanel("labReportPanel");
        return;
      }
      const record = res.data.record || {};
      currentPatientId = record.patient_id || currentPatientId;
      $("#labReportMeta").html(
        '<div><strong>' + (record.patient_name || '-') + '</strong></div>' +
        '<div class="case-meta">性别：' + (record.gender || '-') + ' ｜ 年龄：' + (record.age || '-') + ' ｜ 登记号：' + (record.id_number || '-') + '</div>' +
        '<div class="case-meta">疾病：' + (record.disease_name || '-') + ' ｜ 检验类别：' + (record.lab_test_name || '-') + ' ｜ 录入人：' + (record.operator_name || '-') + '</div>' +
        '<div class="case-meta">检验时间：' + (record.created_at || '-') + '</div>'
      );
      const items = res.data.items || [];
      const html = items.map(function (item) {
        const value = item.value === null || item.value === undefined || String(item.value).trim() === "" ? '-' : item.value;
        const unit = item.unit ? ' ' + item.unit : '';
        const extras = [];
        if (item.reference_range) extras.push('参考区间：' + item.reference_range);
        if (item.test_method) extras.push('实验方法：' + item.test_method);
        return '<div class="report-item">' +
          '<div class="report-item-head"><span>' + (item.form_label || item.field_name) + '</span><span class="report-value">' + value + unit + '</span></div>' +
          (extras.length ? '<div class="report-extra">' + extras.join(' ｜ ') + '</div>' : '') +
          '</div>';
      }).join('') || '<div class="detail-item">暂无检验指标</div>';
      $("#labReportItems").html(html);
      showPanel("labReportPanel");
    })
    .fail(function (xhr) {
      setMsg("labReportMsg", xhr.responseJSON?.message || "检验详情加载失败", true);
      showPanel("labReportPanel");
    });
}
