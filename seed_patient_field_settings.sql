-- Seed patient field settings for existing patients table columns.
-- Run on target database: picco

INSERT INTO `patient_field_settings` (`field_name`, `data_type`, `form_label`, `enabled`)
VALUES
  ('name', 'varchar', '姓名', 1),
  ('gender', 'varchar', '性别', 1),
  ('age', 'int', '年龄', 1),
  ('phone', 'varchar', '联系电话', 1),
  ('id_number', 'varchar', '住院号', 1)
ON DUPLICATE KEY UPDATE
  `data_type` = VALUES(`data_type`),
  `form_label` = VALUES(`form_label`),
  `enabled` = VALUES(`enabled`);
