-- Ensure follow-up records can link to diagnoses and store structured follow-up fields.
-- Run on target database: picco

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='followups' AND COLUMN_NAME='diagnosis_record_id');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE followups ADD COLUMN `diagnosis_record_id` int(11) DEFAULT NULL AFTER `user_id`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='followups' AND COLUMN_NAME='prognosis');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE followups ADD COLUMN `prognosis` tinyint(1) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='followups' AND COLUMN_NAME='death_days');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE followups ADD COLUMN `death_days` int(11) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='followups' AND COLUMN_NAME='barthel_28d');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE followups ADD COLUMN `barthel_28d` int(11) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='followups' AND COLUMN_NAME='ventilator_days');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE followups ADD COLUMN `ventilator_days` int(11) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='followups' AND COLUMN_NAME='tracheotomy');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE followups ADD COLUMN `tracheotomy` tinyint(1) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='followups' AND COLUMN_NAME='blood_purification');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE followups ADD COLUMN `blood_purification` tinyint(1) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='followups' AND COLUMN_NAME='total_cost');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE followups ADD COLUMN `total_cost` decimal(12,2) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='followups' AND COLUMN_NAME='mods');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE followups ADD COLUMN `mods` tinyint(1) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='followups' AND COLUMN_NAME='sepsis');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE followups ADD COLUMN `sepsis` tinyint(1) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='followups' AND COLUMN_NAME='pulmonary_infection');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE followups ADD COLUMN `pulmonary_infection` tinyint(1) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='followups' AND COLUMN_NAME='icu_days');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE followups ADD COLUMN `icu_days` int(11) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='followups' AND INDEX_NAME='idx_follow_diagnosis');
SET @sql := IF(@idx_exists = 0, 'ALTER TABLE followups ADD KEY `idx_follow_diagnosis` (`diagnosis_record_id`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
