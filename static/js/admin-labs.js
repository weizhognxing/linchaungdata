let adminLabCatalog = { categories: [], fields: [] };

function loadAdminLabCategories(selectedId) {
  const previous = selectedId || $('#adminCategorySelect').val();
  return $.getJSON('/api/admin/lab-categories').done(function (res) {
    adminLabCatalog = res.data;
    $('#adminCategorySelect').html(adminLabCatalog.categories.map(c =>
      '<option value="' + c.id + '">' + escapeHtml(c.label) + (c.enabled ? '' : '（已停用）') + '</option>'
    ).join(''));
    if (previous) $('#adminCategorySelect').val(String(previous));
    renderAdminCategory();
  }).fail(function (xhr) { adminMsg('categoryConfigMsg', xhr.responseJSON?.message || '类别加载失败', true); });
}

function renderAdminCategory() {
  const category = adminLabCatalog.categories.find(c => String(c.id) === $('#adminCategorySelect').val());
  if (!category) return;
  $('#editCategoryLabel').val(category.label);
  $('#editCategoryOrder').val(category.sort_order);
  $('#editCategoryEnabled').val(String(category.enabled));
  const selected = {};
  category.fields.forEach(f => { selected[f.id] = f; });
  const fields = adminLabCatalog.fields.slice().sort((a, b) => {
    if (!!selected[a.id] !== !!selected[b.id]) return selected[a.id] ? -1 : 1;
    return (selected[a.id]?.sort_order || 0) - (selected[b.id]?.sort_order || 0) || a.id - b.id;
  });
  $('#categoryFieldRows').html(fields.map((f, index) => {
    const mapping = selected[f.id];
    return '<tr data-id="' + f.id + '"><td><input type="checkbox" class="category-field-selected" aria-label="选用' + escapeHtml(f.form_label) + '"' + (mapping ? ' checked' : '') + '></td>' +
      '<td><input type="checkbox" class="category-field-required" aria-label="必填' + escapeHtml(f.form_label) + '"' + (mapping?.required ? ' checked' : '') + '></td>' +
      '<td>' + escapeHtml(f.form_label) + '</td><td>' + escapeHtml(f.field_name) + '</td><td>' + escapeHtml(f.unit) + '</td>' +
      '<td><input type="number" class="category-field-order" aria-label="指标顺序" value="' + (mapping ? mapping.sort_order : index) + '"></td></tr>';
  }).join(''));
  $('#categoryFieldSearch').val('');
  const assigned = new Set(adminLabCatalog.categories.flatMap(c => c.fields.map(f => f.id)));
  const unassigned = adminLabCatalog.fields.filter(f => !assigned.has(f.id));
  $('#categoryConfigHint').text('当前必填 ' + category.fields.filter(f => f.required).length + ' 项。未归类指标共 ' + unassigned.length + ' 项：' + unassigned.map(f => f.form_label).join('、'));
}

function postLabConfig(url, data, callback, messageId = 'categoryConfigMsg') {
  return $.ajax({ url, method: 'POST', contentType: 'application/json', data: JSON.stringify(data) })
    .done(function (res) { adminMsg(messageId, res.message || '保存成功'); callback(res); })
    .fail(function (xhr) { adminMsg(messageId, xhr.responseJSON?.message || '保存失败', true); });
}

$('#adminCategorySelect').on('change', function () {
  adminMsg('categoryInfoMsg', '');
  renderAdminCategory();
});
$('#categoryFieldSearch').on('input', function () {
  const search = this.value.trim().toLowerCase();
  $('#categoryFieldRows tr').each(function () { $(this).toggle($(this).text().toLowerCase().includes(search)); });
});
$(document).on('change', '.category-field-required', function () {
  if (this.checked) $(this).closest('tr').find('.category-field-selected').prop('checked', true);
});
$(document).on('change', '.category-field-selected', function () {
  if (!this.checked) $(this).closest('tr').find('.category-field-required').prop('checked', false);
});
$('#createCategoryBtn').on('click', function () {
  postLabConfig('/api/admin/lab-categories', { key: $('#newCategoryKey').val(), label: $('#newCategoryLabel').val() }, function (res) {
    $('#newCategoryKey, #newCategoryLabel').val('');
    loadAdminLabCategories(res.data.id);
    loadFormSetting();
  });
});
$('#saveCategoryBtn').on('click', function () {
  const id = $('#adminCategorySelect').val();
  if (!id) {
    adminMsg('categoryInfoMsg', '请先选择类别或新增类别', true);
    return;
  }
  adminMsg('categoryInfoMsg', '正在保存...');
  postLabConfig('/api/admin/lab-categories/' + id, { label: $('#editCategoryLabel').val(), sort_order: $('#editCategoryOrder').val(), enabled: $('#editCategoryEnabled').val() }, function () {
    loadAdminLabCategories(id);
    loadFormSetting();
  }, 'categoryInfoMsg');
});
$('#saveCategoryFieldsBtn').on('click', function () {
  const id = $('#adminCategorySelect').val();
  if (!id) return;
  const fields = [];
  $('#categoryFieldRows tr').each(function () {
    if (!$(this).find('.category-field-selected').prop('checked')) return;
    fields.push({ field_id: Number($(this).data('id')), required: $(this).find('.category-field-required').prop('checked') ? 1 : 0, order: Number($(this).find('.category-field-order').val()) });
  });
  fields.sort((a, b) => a.order - b.order);
  postLabConfig('/api/admin/lab-categories/' + id + '/fields', { fields }, function () {
    loadAdminLabCategories(id);
    loadFormSetting();
  });
});
