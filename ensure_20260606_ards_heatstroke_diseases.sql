INSERT IGNORE INTO diseases (name, sort_order)
VALUES ('ARDS', 3), ('热射病', 13);

UPDATE diseases SET sort_order=3 WHERE name='ARDS';
UPDATE diseases SET sort_order=4 WHERE name='心肺复苏后';
UPDATE diseases SET sort_order=5 WHERE name='急性坏死性胰腺炎';
UPDATE diseases SET sort_order=6 WHERE name='消化道出血';
UPDATE diseases SET sort_order=7 WHERE name='中毒';
UPDATE diseases SET sort_order=8 WHERE name='心源性休克/心衰';
UPDATE diseases SET sort_order=9 WHERE name='脑卒中';
UPDATE diseases SET sort_order=10 WHERE name='多发伤';
UPDATE diseases SET sort_order=11 WHERE name='颅脑损伤';
UPDATE diseases SET sort_order=12 WHERE name='胸部损伤';
UPDATE diseases SET sort_order=13 WHERE name='热射病';

INSERT IGNORE INTO form_settings (disease_id, field_id, sort_order)
SELECT target.id, source_settings.field_id, source_settings.sort_order
FROM diseases target
JOIN diseases source ON source.name='重症肺炎'
JOIN form_settings source_settings ON source_settings.disease_id=source.id
WHERE target.name='ARDS';

INSERT IGNORE INTO form_settings (disease_id, field_id, sort_order)
SELECT target.id, source_settings.field_id, source_settings.sort_order
FROM diseases target
JOIN diseases source ON source.name='颅脑损伤'
JOIN form_settings source_settings ON source_settings.disease_id=source.id
WHERE target.name='热射病';
