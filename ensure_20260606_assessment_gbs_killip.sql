ALTER TABLE assessments ADD COLUMN gbs_score decimal(8,2) DEFAULT NULL AFTER gcs_score;
ALTER TABLE assessments ADD COLUMN killip_score decimal(8,2) DEFAULT NULL AFTER gbs_score;
