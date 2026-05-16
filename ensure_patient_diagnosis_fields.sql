-- Ensure patient diagnosis fields exist and are available in patient field settings.
-- Run on target database: picco

SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'patients'
    AND COLUMN_NAME = 'diagnosis_disease'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE patients ADD COLUMN `diagnosis_disease` varchar(100) DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'patients'
    AND COLUMN_NAME = 'medical_history'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE patients ADD COLUMN `medical_history` varchar(1000) DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'patients'
    AND COLUMN_NAME = 'preliminary_diagnosis'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE patients ADD COLUMN `preliminary_diagnosis` text DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

INSERT INTO `patient_field_settings` (`field_name`, `data_type`, `form_label`, `enabled`)
VALUES
  ('diagnosis_disease', 'varchar', '疾病选项', 1),
  ('medical_history', 'varchar', '既往史', 1),
  ('preliminary_diagnosis', 'text', '初步诊断', 1)
ON DUPLICATE KEY UPDATE
  `data_type` = VALUES(`data_type`),
  `form_label` = VALUES(`form_label`),
  `enabled` = VALUES(`enabled`);
