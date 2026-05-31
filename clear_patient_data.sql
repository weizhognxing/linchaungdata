-- Clear patient-related business data while preserving users, settings, diseases, and field configuration.
-- Usage: mysql -u root -p picco < clear_patient_data.sql

SET FOREIGN_KEY_CHECKS = 0;

DELETE FROM assessments;
DELETE FROM followups;
DELETE FROM treatments;
DELETE FROM diagnosis_records;
DELETE FROM lab_records;
DELETE FROM patients;

ALTER TABLE assessments AUTO_INCREMENT = 1;
ALTER TABLE followups AUTO_INCREMENT = 1;
ALTER TABLE treatments AUTO_INCREMENT = 1;
ALTER TABLE diagnosis_records AUTO_INCREMENT = 1;
ALTER TABLE lab_records AUTO_INCREMENT = 1;
ALTER TABLE patients AUTO_INCREMENT = 1;

SET FOREIGN_KEY_CHECKS = 1;
