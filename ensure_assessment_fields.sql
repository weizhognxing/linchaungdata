-- Ensure assessment records table exists for disease-specific structured forms.
-- Run on target database: picco

CREATE TABLE IF NOT EXISTS assessments (
  id int(11) NOT NULL AUTO_INCREMENT,
  patient_id int(11) NOT NULL,
  user_id int(11) DEFAULT NULL,
  diagnosis_record_id int(11) DEFAULT NULL,
  assessment_time datetime NOT NULL,
  temperature decimal(6,2) DEFAULT NULL,
  respiration decimal(6,2) DEFAULT NULL,
  systolic_bp decimal(6,2) DEFAULT NULL,
  diastolic_bp decimal(6,2) DEFAULT NULL,
  heart_rate decimal(6,2) DEFAULT NULL,
  shock_index decimal(8,2) DEFAULT NULL,
  oxygen_partial_pressure decimal(8,2) DEFAULT NULL,
  oxygen_concentration decimal(8,2) DEFAULT NULL,
  sofa_score decimal(8,2) DEFAULT NULL,
  apache_ii_score decimal(8,2) DEFAULT NULL,
  barthel_score decimal(8,2) DEFAULT NULL,
  mods_score decimal(8,2) DEFAULT NULL,
  gcs_score decimal(8,2) DEFAULT NULL,
  nihss_score decimal(8,2) DEFAULT NULL,
  cerebral_hernia tinyint(1) DEFAULT NULL,
  oxygen_saturation decimal(8,2) DEFAULT NULL,
  ais_score decimal(8,2) DEFAULT NULL,
  pain_score decimal(8,2) DEFAULT NULL,
  iss_score decimal(8,2) DEFAULT NULL,
  created_at datetime DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_assessment_patient (patient_id),
  KEY idx_assessment_diagnosis (diagnosis_record_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
