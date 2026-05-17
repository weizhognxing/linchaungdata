-- Ensure treatment records can link to diagnoses and store structured sepsis treatment fields.
-- Run on target database: picco

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='treatments' AND COLUMN_NAME='diagnosis_record_id');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE treatments ADD COLUMN `diagnosis_record_id` int(11) DEFAULT NULL AFTER `user_id`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='treatments' AND COLUMN_NAME='antibiotics');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE treatments ADD COLUMN `antibiotics` text', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='treatments' AND COLUMN_NAME='antibiotics_start_time');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE treatments ADD COLUMN `antibiotics_start_time` datetime DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='treatments' AND COLUMN_NAME='vasoactive_drugs');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE treatments ADD COLUMN `vasoactive_drugs` text', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='treatments' AND COLUMN_NAME='vasoactive_start_time');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE treatments ADD COLUMN `vasoactive_start_time` datetime DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='treatments' AND COLUMN_NAME='vasoactive_concentration');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE treatments ADD COLUMN `vasoactive_concentration` varchar(255) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='treatments' AND COLUMN_NAME='volume_management');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE treatments ADD COLUMN `volume_management` text', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='treatments' AND COLUMN_NAME='volume_total_ml');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE treatments ADD COLUMN `volume_total_ml` decimal(12,2) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='treatments' AND COLUMN_NAME='respiratory_support');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE treatments ADD COLUMN `respiratory_support` text', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='treatments' AND COLUMN_NAME='respiratory_start_time');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE treatments ADD COLUMN `respiratory_start_time` datetime DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='treatments' AND COLUMN_NAME='immunomodulators');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE treatments ADD COLUMN `immunomodulators` text', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='treatments' AND COLUMN_NAME='immunomodulator_start_time');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE treatments ADD COLUMN `immunomodulator_start_time` datetime DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='treatments' AND COLUMN_NAME='blood_purification');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE treatments ADD COLUMN `blood_purification` text', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='treatments' AND COLUMN_NAME='blood_purification_start_time');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE treatments ADD COLUMN `blood_purification_start_time` datetime DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='treatments' AND COLUMN_NAME='traditional_chinese_medicine');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE treatments ADD COLUMN `traditional_chinese_medicine` text', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='treatments' AND COLUMN_NAME='traditional_chinese_medicine_start_time');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE treatments ADD COLUMN `traditional_chinese_medicine_start_time` datetime DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='treatments' AND COLUMN_NAME='digestive_secretion_drugs');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE treatments ADD COLUMN `digestive_secretion_drugs` text', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='treatments' AND COLUMN_NAME='cardiac_treatment_methods');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE treatments ADD COLUMN `cardiac_treatment_methods` text', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='treatments' AND COLUMN_NAME='cardiac_treatment_start_time');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE treatments ADD COLUMN `cardiac_treatment_start_time` datetime DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='treatments' AND COLUMN_NAME='sodium_channel_blockers');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE treatments ADD COLUMN `sodium_channel_blockers` text', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='treatments' AND COLUMN_NAME='sodium_channel_blocker_start_time');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE treatments ADD COLUMN `sodium_channel_blocker_start_time` datetime DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='treatments' AND COLUMN_NAME='beta_blockers');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE treatments ADD COLUMN `beta_blockers` text', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='treatments' AND COLUMN_NAME='beta_blocker_start_time');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE treatments ADD COLUMN `beta_blocker_start_time` datetime DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='treatments' AND COLUMN_NAME='potassium_channel_blockers');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE treatments ADD COLUMN `potassium_channel_blockers` text', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='treatments' AND COLUMN_NAME='potassium_channel_blocker_start_time');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE treatments ADD COLUMN `potassium_channel_blocker_start_time` datetime DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='treatments' AND COLUMN_NAME='calcium_channel_blockers');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE treatments ADD COLUMN `calcium_channel_blockers` text', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='treatments' AND COLUMN_NAME='calcium_channel_blocker_start_time');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE treatments ADD COLUMN `calcium_channel_blocker_start_time` datetime DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='treatments' AND COLUMN_NAME='other_cardiac_drugs');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE treatments ADD COLUMN `other_cardiac_drugs` text', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='treatments' AND COLUMN_NAME='poisoning_other_drugs');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE treatments ADD COLUMN `poisoning_other_drugs` text', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='treatments' AND COLUMN_NAME='intracranial_pressure_reduction');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE treatments ADD COLUMN `intracranial_pressure_reduction` text', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='treatments' AND COLUMN_NAME='intracranial_pressure_start_time');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE treatments ADD COLUMN `intracranial_pressure_start_time` datetime DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='treatments' AND COLUMN_NAME='surgical_treatment');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE treatments ADD COLUMN `surgical_treatment` text', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='treatments' AND COLUMN_NAME='surgical_treatment_start_time');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE treatments ADD COLUMN `surgical_treatment_start_time` datetime DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='treatments' AND COLUMN_NAME='mild_hypothermia');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE treatments ADD COLUMN `mild_hypothermia` text', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='treatments' AND COLUMN_NAME='mild_hypothermia_start_time');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE treatments ADD COLUMN `mild_hypothermia_start_time` datetime DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='treatments' AND COLUMN_NAME='brain_protection_drugs');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE treatments ADD COLUMN `brain_protection_drugs` text', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='treatments' AND COLUMN_NAME='brain_protection_start_time');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE treatments ADD COLUMN `brain_protection_start_time` datetime DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='treatments' AND COLUMN_NAME='antiepileptic_drugs');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE treatments ADD COLUMN `antiepileptic_drugs` text', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='treatments' AND COLUMN_NAME='antiepileptic_start_time');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE treatments ADD COLUMN `antiepileptic_start_time` datetime DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='treatments' AND COLUMN_NAME='surgery_methods');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE treatments ADD COLUMN `surgery_methods` text', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='treatments' AND COLUMN_NAME='surgery_start_time');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE treatments ADD COLUMN `surgery_start_time` datetime DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='treatments' AND COLUMN_NAME='chest_fixation');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE treatments ADD COLUMN `chest_fixation` varchar(255) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='treatments' AND COLUMN_NAME='chest_fixation_start_time');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE treatments ADD COLUMN `chest_fixation_start_time` datetime DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='treatments' AND COLUMN_NAME='airway_control');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE treatments ADD COLUMN `airway_control` text', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='treatments' AND COLUMN_NAME='airway_control_start_time');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE treatments ADD COLUMN `airway_control_start_time` datetime DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='treatments' AND COLUMN_NAME='oxygen_support');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE treatments ADD COLUMN `oxygen_support` text', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='treatments' AND COLUMN_NAME='oxygen_support_start_time');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE treatments ADD COLUMN `oxygen_support_start_time` datetime DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='treatments' AND COLUMN_NAME='blood_transfusion');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE treatments ADD COLUMN `blood_transfusion` text', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='treatments' AND COLUMN_NAME='blood_transfusion_start_time');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE treatments ADD COLUMN `blood_transfusion_start_time` datetime DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='treatments' AND COLUMN_NAME='blood_transfusion_total');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE treatments ADD COLUMN `blood_transfusion_total` varchar(255) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='treatments' AND COLUMN_NAME='temperature_management');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE treatments ADD COLUMN `temperature_management` text', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='treatments' AND INDEX_NAME='idx_treatment_diagnosis');
SET @sql := IF(@idx_exists = 0, 'ALTER TABLE treatments ADD KEY `idx_treatment_diagnosis` (`diagnosis_record_id`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
