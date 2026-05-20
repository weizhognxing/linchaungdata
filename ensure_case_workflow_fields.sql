-- Ensure draft/submitted case workflow fields exist.
-- Run on target database: picco

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='patients' AND COLUMN_NAME='case_status');
SET @sql := IF(@col_exists = 0, "ALTER TABLE patients ADD COLUMN `case_status` varchar(20) NOT NULL DEFAULT 'draft' AFTER `id_number`", 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='patients' AND COLUMN_NAME='last_disease_id');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE patients ADD COLUMN `last_disease_id` int(11) DEFAULT NULL AFTER `case_status`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='lab_records' AND COLUMN_NAME='record_category');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE lab_records ADD COLUMN `record_category` varchar(50) DEFAULT NULL AFTER `disease_id`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='treatments' AND COLUMN_NAME='detail_json');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE treatments ADD COLUMN `detail_json` longtext DEFAULT NULL AFTER `treatment_method`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='treatments' AND COLUMN_NAME='digestive_secretion_drugs_start_time');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE treatments ADD COLUMN `digestive_secretion_drugs_start_time` datetime DEFAULT NULL AFTER `digestive_secretion_drugs`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='treatments' AND COLUMN_NAME='other_cardiac_drugs_start_time');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE treatments ADD COLUMN `other_cardiac_drugs_start_time` datetime DEFAULT NULL AFTER `other_cardiac_drugs`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='treatments' AND COLUMN_NAME='poisoning_other_drugs_start_time');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE treatments ADD COLUMN `poisoning_other_drugs_start_time` datetime DEFAULT NULL AFTER `poisoning_other_drugs`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='treatments' AND COLUMN_NAME='temperature_management_start_time');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE treatments ADD COLUMN `temperature_management_start_time` datetime DEFAULT NULL AFTER `temperature_management`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
