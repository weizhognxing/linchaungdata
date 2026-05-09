-- Migration: case list/detail, treatment/followup, patient field settings, PTA field rename
-- Run on target database: picco

-- 1) Ensure lab_records has pta column
SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'lab_records'
    AND COLUMN_NAME = 'pta'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE lab_records ADD COLUMN `pta` DECIMAL(10,2) DEFAULT NULL COMMENT ''%''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2) Rename legacy field_settings key pt_% -> pta
UPDATE field_settings
SET field_name = 'pta'
WHERE field_name = 'pt_%';

-- 3) Treatments table
CREATE TABLE IF NOT EXISTS `treatments` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `patient_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `treat_time` datetime NOT NULL,
  `treatment_method` text NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_treat_patient_time` (`patient_id`,`treat_time`),
  CONSTRAINT `fk_treat_patient` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4) Followups table
CREATE TABLE IF NOT EXISTS `followups` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `patient_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `follow_time` datetime NOT NULL,
  `follow_result` text NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_follow_patient_time` (`patient_id`,`follow_time`),
  CONSTRAINT `fk_follow_patient` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5) Patient field settings table
CREATE TABLE IF NOT EXISTS `patient_field_settings` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `field_name` varchar(64) NOT NULL,
  `data_type` enum('varchar','text','int','decimal','date','datetime') NOT NULL,
  `form_label` varchar(120) NOT NULL,
  `enabled` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_patient_field_name` (`field_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
