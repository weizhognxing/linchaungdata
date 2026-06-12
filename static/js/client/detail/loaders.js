// Patient detail data loading: loadPatientDetail, loadLabRecordDetail.
// Loaded as plain browser script; globals shared across client scripts.
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
      renderLabCategoryActions(patient, res.data.lab_records || [], res.data.diagnosis_records || []);

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
