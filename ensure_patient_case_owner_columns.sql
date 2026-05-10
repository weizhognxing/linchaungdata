-- Ensure patients can be listed before any lab record is added.
-- Run on target database: picco

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
