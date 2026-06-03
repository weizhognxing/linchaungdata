-- Ensure patient table supports creating draft cases before lab records exist.
-- Run this on the target database, for example: USE picco;

SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'patients'
    AND COLUMN_NAME = 'hospital_id'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE patients ADD COLUMN `hospital_id` int(11) DEFAULT NULL AFTER `id`',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'patients'
    AND COLUMN_NAME = 'user_id'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE patients ADD COLUMN `user_id` int(11) DEFAULT NULL AFTER `hospital_id`',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

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

SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'patients'
    AND INDEX_NAME = 'idx_patient_hospital'
);
SET @sql := IF(@idx_exists = 0,
  'ALTER TABLE patients ADD KEY `idx_patient_hospital` (`hospital_id`,`id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'patients'
    AND INDEX_NAME = 'idx_patient_user'
);
SET @sql := IF(@idx_exists = 0,
  'ALTER TABLE patients ADD KEY `idx_patient_user` (`user_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE patients
SET case_integrity = CASE WHEN case_status = 'submitted' THEN 'complete' ELSE 'draft' END
WHERE case_integrity IS NULL
   OR case_integrity = ''
   OR case_integrity = 'submitted';
