-- Ensure diagnosis records table exists.
-- Run on target database: picco

CREATE TABLE IF NOT EXISTS `diagnosis_records` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `patient_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `diagnosis_time` datetime NOT NULL,
  `diagnosis_disease` varchar(100) NOT NULL,
  `preliminary_diagnosis` varchar(1000) DEFAULT NULL,
  `medical_history` varchar(1000) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_diagnosis_patient_time` (`patient_id`,`diagnosis_time`),
  KEY `idx_diagnosis_user` (`user_id`),
  CONSTRAINT `fk_diagnosis_patient` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`id`),
  CONSTRAINT `fk_diagnosis_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
