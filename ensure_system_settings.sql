-- Ensure global system settings table exists.
-- Run on target database: picco

CREATE TABLE IF NOT EXISTS `system_settings` (
  `doctor_download_multiplier` int(11) NOT NULL DEFAULT '1'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO `system_settings` (`doctor_download_multiplier`)
SELECT 1 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `system_settings` LIMIT 1);
