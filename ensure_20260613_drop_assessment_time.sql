-- Remove the obsolete assessment_time field from assessments.
-- Assessment records now use created_at for ordering and no longer require a separate assessment time.
-- Run on target database: picco

SET @db_name := DATABASE();

SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'assessments'
    AND COLUMN_NAME = 'assessment_time'
);

SET @sql := IF(
  @col_exists > 0,
  'ALTER TABLE assessments DROP COLUMN assessment_time',
  'SELECT ''assessments.assessment_time already removed'' AS info'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
