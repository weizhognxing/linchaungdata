-- Add lab test name storage for each uploaded lab report.
-- Run on target database: picco
-- Safe to run multiple times; existing columns are not changed.

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
    AND TABLE_NAME = 'lab_records'
    AND COLUMN_NAME = 'lab_test_name'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE lab_records ADD COLUMN `lab_test_name` varchar(120) DEFAULT NULL AFTER `record_category`',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
