-- Safe sync for server database after ensure_patient_create_required_columns.sql.
-- Target database: picco
-- Compatible with MySQL/MariaDB 5.5: no ADD COLUMN IF NOT EXISTS is used.

CREATE TABLE IF NOT EXISTS assessments (
  id int(11) NOT NULL AUTO_INCREMENT,
  patient_id int(11) NOT NULL,
  user_id int(11) DEFAULT NULL,
  diagnosis_record_id int(11) DEFAULT NULL,
  assessment_time datetime NOT NULL,
  temperature decimal(6,2) DEFAULT NULL,
  respiration decimal(6,2) DEFAULT NULL,
  systolic_bp decimal(6,2) DEFAULT NULL,
  diastolic_bp decimal(6,2) DEFAULT NULL,
  heart_rate decimal(6,2) DEFAULT NULL,
  shock_index decimal(8,2) DEFAULT NULL,
  oxygen_partial_pressure decimal(8,2) DEFAULT NULL,
  oxygen_concentration decimal(8,2) DEFAULT NULL,
  sofa_score decimal(8,2) DEFAULT NULL,
  apache_ii_score decimal(8,2) DEFAULT NULL,
  barthel_score decimal(8,2) DEFAULT NULL,
  mods_score decimal(8,2) DEFAULT NULL,
  gcs_score decimal(8,2) DEFAULT NULL,
  gbs_score decimal(8,2) DEFAULT NULL,
  killip_score decimal(8,2) DEFAULT NULL,
  nihss_score decimal(8,2) DEFAULT NULL,
  cerebral_hernia tinyint(1) DEFAULT NULL,
  oxygen_saturation decimal(8,2) DEFAULT NULL,
  ais_score decimal(8,2) DEFAULT NULL,
  pain_score decimal(8,2) DEFAULT NULL,
  iss_score decimal(8,2) DEFAULT NULL,
  created_at datetime DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_assessment_patient (patient_id),
  KEY idx_assessment_diagnosis (diagnosis_record_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

SET @db_name := DATABASE();

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='assessments' AND COLUMN_NAME='gbs_score') = 0,
  'ALTER TABLE assessments ADD COLUMN gbs_score decimal(8,2) DEFAULT NULL AFTER gcs_score',
  'SELECT ''assessments.gbs_score already exists'' AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='assessments' AND COLUMN_NAME='killip_score') = 0,
  'ALTER TABLE assessments ADD COLUMN killip_score decimal(8,2) DEFAULT NULL AFTER gbs_score',
  'SELECT ''assessments.killip_score already exists'' AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

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
