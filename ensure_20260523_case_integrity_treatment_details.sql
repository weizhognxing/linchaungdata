-- Consolidated migration for 2026-05-23 case completeness and treatment item details.
-- Run on target database: picco
-- Safe to run multiple times; existing columns are not changed.

SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'patients'
    AND COLUMN_NAME = 'case_status'
);
SET @sql := IF(@col_exists = 0,
  "ALTER TABLE patients ADD COLUMN `case_status` varchar(20) NOT NULL DEFAULT 'draft' AFTER `id_number`",
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'patients'
    AND COLUMN_NAME = 'case_integrity'
);
SET @sql := IF(@col_exists = 0,
  "ALTER TABLE patients ADD COLUMN `case_integrity` varchar(20) NOT NULL DEFAULT 'draft' AFTER `case_status`",
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'patients'
    AND COLUMN_NAME = 'last_disease_id'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE patients ADD COLUMN `last_disease_id` int(11) DEFAULT NULL AFTER `case_integrity`',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'lab_records'
    AND COLUMN_NAME = 'record_category'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE lab_records ADD COLUMN `record_category` varchar(50) DEFAULT NULL AFTER `disease_id`',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'treatments'
    AND COLUMN_NAME = 'detail_json'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE treatments ADD COLUMN `detail_json` longtext DEFAULT NULL AFTER `treatment_method`',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE patients
SET case_integrity = CASE WHEN case_status = 'submitted' THEN 'complete' ELSE 'draft' END
WHERE case_integrity IS NULL
   OR case_integrity = ''
   OR case_integrity = 'submitted';
