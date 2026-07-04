-- MySQL dump 10.14  Distrib 5.5.68-MariaDB, for Linux (x86_64)
--
-- Host: localhost    Database: picco
-- ------------------------------------------------------
-- Server version	5.5.68-MariaDB

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `admins`
--

DROP TABLE IF EXISTS `admins`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `admins` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `username` varchar(50) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `assessments`
--

DROP TABLE IF EXISTS `assessments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `assessments` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `patient_id` int(11) NOT NULL,
  `user_id` int(11) DEFAULT NULL,
  `diagnosis_record_id` int(11) DEFAULT NULL,
  `assessment_time` datetime NOT NULL,
  `temperature` decimal(6,2) DEFAULT NULL,
  `respiration` decimal(6,2) DEFAULT NULL,
  `systolic_bp` decimal(6,2) DEFAULT NULL,
  `diastolic_bp` decimal(6,2) DEFAULT NULL,
  `heart_rate` decimal(6,2) DEFAULT NULL,
  `shock_index` decimal(8,2) DEFAULT NULL,
  `oxygen_partial_pressure` decimal(8,2) DEFAULT NULL,
  `oxygen_concentration` decimal(8,2) DEFAULT NULL,
  `sofa_score` decimal(8,2) DEFAULT NULL,
  `apache_ii_score` decimal(8,2) DEFAULT NULL,
  `barthel_score` decimal(8,2) DEFAULT NULL,
  `mods_score` decimal(8,2) DEFAULT NULL,
  `gcs_score` decimal(8,2) DEFAULT NULL,
  `gbs_score` decimal(8,2) DEFAULT NULL,
  `killip_score` decimal(8,2) DEFAULT NULL,
  `nihss_score` decimal(8,2) DEFAULT NULL,
  `cerebral_hernia` tinyint(1) DEFAULT NULL,
  `oxygen_saturation` decimal(8,2) DEFAULT NULL,
  `ais_score` decimal(8,2) DEFAULT NULL,
  `pain_score` decimal(8,2) DEFAULT NULL,
  `iss_score` decimal(8,2) DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_assessment_patient` (`patient_id`),
  KEY `idx_assessment_diagnosis` (`diagnosis_record_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `diagnosis_records`
--

DROP TABLE IF EXISTS `diagnosis_records`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `diagnosis_records` (
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
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `diseases`
--

DROP TABLE IF EXISTS `diseases`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `diseases` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(80) NOT NULL,
  `sort_order` int(11) NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=10180 DEFAULT CHARSET=utf8mb4;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `field_settings`
--

DROP TABLE IF EXISTS `field_settings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `field_settings` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `field_name` varchar(64) NOT NULL,
  `data_type` varchar(30) NOT NULL,
  `unit` varchar(50) DEFAULT NULL,
  `reference_range` varchar(100) DEFAULT NULL,
  `test_method` varchar(100) DEFAULT NULL,
  `comment_text` varchar(255) DEFAULT NULL,
  `form_label` varchar(120) NOT NULL,
  `enabled` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `field_name` (`field_name`)
) ENGINE=InnoDB AUTO_INCREMENT=7463 DEFAULT CHARSET=utf8mb4;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `followups`
--

DROP TABLE IF EXISTS `followups`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `followups` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `patient_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `diagnosis_record_id` int(11) DEFAULT NULL,
  `follow_time` datetime NOT NULL,
  `follow_result` text NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `prognosis` tinyint(1) DEFAULT NULL,
  `death_days` int(11) DEFAULT NULL,
  `barthel_28d` int(11) DEFAULT NULL,
  `ventilator_days` int(11) DEFAULT NULL,
  `tracheotomy` tinyint(1) DEFAULT NULL,
  `blood_purification` tinyint(1) DEFAULT NULL,
  `total_cost` decimal(12,2) DEFAULT NULL,
  `mods` tinyint(1) DEFAULT NULL,
  `sepsis` tinyint(1) DEFAULT NULL,
  `pulmonary_infection` tinyint(1) DEFAULT NULL,
  `icu_days` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_follow_patient_time` (`patient_id`,`follow_time`),
  KEY `idx_follow_diagnosis` (`diagnosis_record_id`),
  CONSTRAINT `fk_follow_patient` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `form_settings`
--

DROP TABLE IF EXISTS `form_settings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `form_settings` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `disease_id` int(11) NOT NULL,
  `field_id` int(11) NOT NULL,
  `sort_order` int(11) NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_disease_field` (`disease_id`,`field_id`),
  KEY `fk_setting_field` (`field_id`),
  CONSTRAINT `fk_setting_disease` FOREIGN KEY (`disease_id`) REFERENCES `diseases` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_setting_field` FOREIGN KEY (`field_id`) REFERENCES `field_settings` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=84507 DEFAULT CHARSET=utf8mb4;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `hospitals`
--

DROP TABLE IF EXISTS `hospitals`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `hospitals` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(160) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_hospital_name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `lab_records`
--

DROP TABLE IF EXISTS `lab_records`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `lab_records` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `patient_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `disease_id` int(11) NOT NULL,
  `record_category` varchar(50) DEFAULT NULL,
  `lab_test_name` varchar(120) DEFAULT NULL,
  `photo_path` varchar(255) DEFAULT NULL,
  `ai_raw` text,
  `wbc` decimal(10,2) DEFAULT NULL COMMENT '白细胞',
  `crp` decimal(10,2) DEFAULT NULL COMMENT 'C反应蛋白',
  `pct` decimal(10,2) DEFAULT NULL COMMENT '降钙素原',
  `lactate` decimal(10,2) DEFAULT NULL COMMENT '乳酸',
  `creatinine` decimal(10,2) DEFAULT NULL COMMENT '肌酐',
  `alt` decimal(10,2) DEFAULT NULL COMMENT '谷丙转氨酶',
  `ast` decimal(10,2) DEFAULT NULL COMMENT '谷草转氨酶',
  `remark` text COMMENT '备注',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `baixibao` int(11) DEFAULT NULL COMMENT '白细胞个数',
  `neu` decimal(10,2) DEFAULT NULL COMMENT '10^9/L',
  `lym` decimal(10,2) DEFAULT NULL COMMENT '10^9/L',
  `mono` decimal(10,2) DEFAULT NULL COMMENT '10^9/L',
  `eos` decimal(10,2) DEFAULT NULL COMMENT '10^9/L',
  `baso` decimal(10,2) DEFAULT NULL COMMENT '10^9/L',
  `neu_r` decimal(10,2) DEFAULT NULL COMMENT '%',
  `lym_r` decimal(10,2) DEFAULT NULL COMMENT '%',
  `mono_r` decimal(10,2) DEFAULT NULL COMMENT '%',
  `eos_r` decimal(10,2) DEFAULT NULL COMMENT '%',
  `baso_r` decimal(10,2) DEFAULT NULL COMMENT '%',
  `rbc` decimal(10,2) DEFAULT NULL COMMENT '10^12/L',
  `hgb` int(11) DEFAULT NULL COMMENT 'g/L',
  `hct` decimal(10,2) DEFAULT NULL COMMENT '-',
  `mcv` decimal(10,2) DEFAULT NULL COMMENT 'fl',
  `mch` decimal(10,2) DEFAULT NULL COMMENT 'pg',
  `mchc` int(11) DEFAULT NULL COMMENT 'g/L',
  `rdw_sd` decimal(10,2) DEFAULT NULL COMMENT 'fl',
  `rdw_cv` decimal(10,2) DEFAULT NULL COMMENT '%',
  `plt` int(11) DEFAULT NULL COMMENT '10^9/L',
  `mpv` decimal(10,2) DEFAULT NULL COMMENT 'fl',
  `pdw` decimal(10,2) DEFAULT NULL COMMENT '%',
  `p_lcr` decimal(10,2) DEFAULT NULL COMMENT '%',
  `hscrp` decimal(10,2) DEFAULT NULL COMMENT 'mg/L',
  `ast_alt` decimal(10,2) DEFAULT NULL COMMENT '-',
  `tp` decimal(10,2) DEFAULT NULL COMMENT 'g/L',
  `alb` decimal(10,2) DEFAULT NULL COMMENT 'g/L',
  `glo` decimal(10,2) DEFAULT NULL COMMENT 'g/L',
  `a_g` decimal(10,2) DEFAULT NULL COMMENT '-',
  `tbil` decimal(10,2) DEFAULT NULL COMMENT 'μmol/L',
  `dbil` decimal(10,2) DEFAULT NULL COMMENT 'μmol/L',
  `ibil` decimal(10,2) DEFAULT NULL COMMENT 'μmol/L',
  `tba` decimal(10,2) DEFAULT NULL COMMENT 'μmol/L',
  `ggt` decimal(10,2) DEFAULT NULL COMMENT 'U/L',
  `alp` decimal(10,2) DEFAULT NULL COMMENT 'U/L',
  `pa` decimal(10,2) DEFAULT NULL COMMENT 'mg/L',
  `urea` decimal(10,2) DEFAULT NULL COMMENT 'mmol/L',
  `ua` decimal(10,2) DEFAULT NULL COMMENT 'μmol/L',
  `crea` decimal(10,2) DEFAULT NULL COMMENT 'μmol/L',
  `k` decimal(10,2) DEFAULT NULL COMMENT 'mmol/L',
  `na` decimal(10,2) DEFAULT NULL COMMENT 'mmol/L',
  `cl` decimal(10,2) DEFAULT NULL COMMENT 'mmol/L',
  `ca` decimal(10,2) DEFAULT NULL COMMENT 'mmol/L',
  `co2` decimal(10,2) DEFAULT NULL COMMENT 'mmol/l',
  `p` decimal(10,2) DEFAULT NULL COMMENT 'mmol/L',
  `mg` decimal(10,2) DEFAULT NULL COMMENT 'mmol/L',
  `fe` decimal(10,2) DEFAULT NULL COMMENT 'umol/L',
  `gfr` decimal(10,2) DEFAULT NULL COMMENT 'mL/min',
  `ag` decimal(10,2) DEFAULT NULL COMMENT 'mmol/L',
  `hemo` decimal(10,2) DEFAULT NULL COMMENT '-',
  `icte` decimal(10,2) DEFAULT NULL COMMENT '-',
  `lipe` decimal(10,2) DEFAULT NULL COMMENT '-',
  `ph` decimal(10,2) DEFAULT NULL COMMENT '-',
  `pco2` decimal(10,2) DEFAULT NULL COMMENT 'mmHg',
  `po2` decimal(10,2) DEFAULT NULL COMMENT 'mmHg',
  `ca__` decimal(10,2) DEFAULT NULL COMMENT 'mmol/L',
  `glu` decimal(10,2) DEFAULT NULL COMMENT 'mmol/L',
  `lac_la` decimal(10,2) DEFAULT NULL COMMENT 'mmol/L',
  `thb` decimal(10,2) DEFAULT NULL COMMENT 'g/dl',
  `so2` decimal(10,2) DEFAULT NULL COMMENT '%',
  `o2hb` decimal(10,2) DEFAULT NULL COMMENT '%',
  `pt` decimal(10,2) DEFAULT NULL COMMENT 's',
  `pt_inr` decimal(10,2) DEFAULT NULL COMMENT 'INR',
  `pt_ratio` decimal(10,2) DEFAULT NULL COMMENT '比率',
  `pta` decimal(10,2) DEFAULT NULL COMMENT '%',
  `aptt` decimal(10,2) DEFAULT NULL COMMENT 's',
  `aptt_r` decimal(10,2) DEFAULT NULL COMMENT '-',
  `tt` decimal(10,2) DEFAULT NULL COMMENT 's',
  `fib` decimal(10,2) DEFAULT NULL COMMENT 'g/L',
  `d_di` decimal(10,2) DEFAULT NULL COMMENT 'ug/ml',
  `fdp` decimal(10,2) DEFAULT NULL COMMENT 'ug/ml',
  `at3` decimal(10,2) DEFAULT NULL COMMENT '%',
  `nt_probnp` decimal(10,2) DEFAULT NULL COMMENT 'pg/ml',
  `hs_ctnt_stat` decimal(10,2) DEFAULT NULL COMMENT 'ng/ml',
  `myo_stat` decimal(10,2) DEFAULT NULL COMMENT 'ng/ml',
  `ck_mb_stat` decimal(10,2) DEFAULT NULL COMMENT 'ng/ml',
  `hbalc` decimal(10,2) DEFAULT NULL COMMENT '%',
  `hbao` decimal(10,2) DEFAULT NULL COMMENT '%',
  `hbala` decimal(10,2) DEFAULT NULL COMMENT '%',
  `hbalb` decimal(10,2) DEFAULT NULL COMMENT '%',
  `laic_1` decimal(10,2) DEFAULT NULL COMMENT '%',
  `hbf` decimal(10,2) DEFAULT NULL COMMENT '%',
  `spn` varchar(1000) DEFAULT NULL COMMENT '-',
  `sau` varchar(1000) DEFAULT NULL COMMENT '-',
  `mrs` varchar(1000) DEFAULT NULL COMMENT '-',
  `kpn` varchar(1000) DEFAULT NULL COMMENT '-',
  `pae` varchar(1000) DEFAULT NULL COMMENT '-',
  `aba` varchar(1000) DEFAULT NULL COMMENT '-',
  `sma` varchar(1000) DEFAULT NULL COMMENT '-',
  `hin` varchar(1000) DEFAULT NULL COMMENT '-',
  PRIMARY KEY (`id`),
  KEY `fk_lab_patient` (`patient_id`),
  KEY `fk_lab_user` (`user_id`),
  KEY `fk_lab_disease` (`disease_id`),
  CONSTRAINT `fk_lab_disease` FOREIGN KEY (`disease_id`) REFERENCES `diseases` (`id`),
  CONSTRAINT `fk_lab_patient` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`id`),
  CONSTRAINT `fk_lab_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `patient_field_settings`
--

DROP TABLE IF EXISTS `patient_field_settings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `patient_field_settings` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `field_name` varchar(64) NOT NULL,
  `data_type` enum('varchar','text','int','decimal','date','datetime') NOT NULL,
  `form_label` varchar(120) NOT NULL,
  `enabled` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_patient_field_name` (`field_name`)
) ENGINE=InnoDB AUTO_INCREMENT=19 DEFAULT CHARSET=utf8mb4;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `patients`
--

DROP TABLE IF EXISTS `patients`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `patients` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `hospital_id` int(11) DEFAULT NULL,
  `user_id` int(11) DEFAULT NULL,
  `name` varchar(80) NOT NULL,
  `gender` varchar(20) DEFAULT NULL,
  `age` int(11) DEFAULT NULL,
  `phone` varchar(30) DEFAULT NULL,
  `id_number` varchar(40) DEFAULT NULL,
  `case_status` varchar(20) NOT NULL DEFAULT 'draft',
  `case_integrity` varchar(20) NOT NULL DEFAULT 'draft',
  `last_disease_id` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT '0000-00-00 00:00:00',
  `case_number` varchar(1000) DEFAULT NULL,
  `plasma_number` varchar(1000) DEFAULT NULL,
  `registration_number` varchar(1000) DEFAULT NULL,
  `height` int(11) DEFAULT NULL,
  `weight` int(11) DEFAULT NULL,
  `paxgene_number` varchar(1000) DEFAULT NULL,
  `admission_time` datetime DEFAULT NULL,
  `time_of_onset` decimal(10,2) DEFAULT NULL,
  `diagnosis` varchar(1000) DEFAULT NULL,
  `medical_history` varchar(1000) DEFAULT NULL,
  `diagnosis_disease` varchar(100) DEFAULT NULL,
  `preliminary_diagnosis` text,
  PRIMARY KEY (`id`),
  KEY `idx_patient_lookup` (`name`,`phone`,`id_number`),
  KEY `idx_patient_hospital` (`hospital_id`,`id`),
  KEY `idx_patient_user` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `treatments`
--

DROP TABLE IF EXISTS `treatments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `treatments` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `patient_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `diagnosis_record_id` int(11) DEFAULT NULL,
  `treat_time` datetime NOT NULL,
  `treatment_method` text NOT NULL,
  `detail_json` longtext,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `antibiotics` text,
  `antibiotics_start_time` datetime DEFAULT NULL,
  `vasoactive_drugs` text,
  `vasoactive_start_time` datetime DEFAULT NULL,
  `vasoactive_concentration` varchar(255) DEFAULT NULL,
  `volume_management` text,
  `volume_total_ml` decimal(12,2) DEFAULT NULL,
  `respiratory_support` text,
  `respiratory_start_time` datetime DEFAULT NULL,
  `immunomodulators` text,
  `immunomodulator_start_time` datetime DEFAULT NULL,
  `blood_purification` text,
  `blood_purification_start_time` datetime DEFAULT NULL,
  `traditional_chinese_medicine` text,
  `traditional_chinese_medicine_start_time` datetime DEFAULT NULL,
  `digestive_secretion_drugs` text,
  `digestive_secretion_drugs_start_time` datetime DEFAULT NULL,
  `cardiac_treatment_methods` text,
  `cardiac_treatment_start_time` datetime DEFAULT NULL,
  `sodium_channel_blockers` text,
  `sodium_channel_blocker_start_time` datetime DEFAULT NULL,
  `beta_blockers` text,
  `beta_blocker_start_time` datetime DEFAULT NULL,
  `potassium_channel_blockers` text,
  `potassium_channel_blocker_start_time` datetime DEFAULT NULL,
  `calcium_channel_blockers` text,
  `calcium_channel_blocker_start_time` datetime DEFAULT NULL,
  `other_cardiac_drugs` text,
  `other_cardiac_drugs_start_time` datetime DEFAULT NULL,
  `poisoning_other_drugs` text,
  `poisoning_other_drugs_start_time` datetime DEFAULT NULL,
  `intracranial_pressure_reduction` text,
  `intracranial_pressure_start_time` datetime DEFAULT NULL,
  `surgical_treatment` text,
  `surgical_treatment_start_time` datetime DEFAULT NULL,
  `mild_hypothermia` text,
  `mild_hypothermia_start_time` datetime DEFAULT NULL,
  `brain_protection_drugs` text,
  `brain_protection_start_time` datetime DEFAULT NULL,
  `antiepileptic_drugs` text,
  `antiepileptic_start_time` datetime DEFAULT NULL,
  `surgery_methods` text,
  `surgery_start_time` datetime DEFAULT NULL,
  `chest_fixation` varchar(255) DEFAULT NULL,
  `chest_fixation_start_time` datetime DEFAULT NULL,
  `airway_control` text,
  `airway_control_start_time` datetime DEFAULT NULL,
  `oxygen_support` text,
  `oxygen_support_start_time` datetime DEFAULT NULL,
  `blood_transfusion` text,
  `blood_transfusion_start_time` datetime DEFAULT NULL,
  `blood_transfusion_total` varchar(255) DEFAULT NULL,
  `temperature_management` text,
  `temperature_management_start_time` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_treat_patient_time` (`patient_id`,`treat_time`),
  KEY `idx_treatment_diagnosis` (`diagnosis_record_id`),
  CONSTRAINT `fk_treat_patient` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(80) NOT NULL,
  `email` varchar(120) NOT NULL,
  `phone` varchar(30) NOT NULL,
  `province` varchar(60) NOT NULL,
  `city` varchar(60) NOT NULL,
  `hospital_id` int(11) NOT NULL,
  `parent_id` int(11) NOT NULL DEFAULT '0',
  `department` varchar(100) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `status` enum('pending','approved','disabled') NOT NULL DEFAULT 'pending',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT '0000-00-00 00:00:00',
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  UNIQUE KEY `phone` (`phone`),
  KEY `idx_users_hospital_id` (`hospital_id`),
  KEY `idx_users_parent_id` (`parent_id`),
  KEY `idx_users_hospital_parent` (`hospital_id`,`parent_id`),
  CONSTRAINT `fk_users_hospital` FOREIGN KEY (`hospital_id`) REFERENCES `hospitals` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping events for database 'picco'
--

--
-- Dumping routines for database 'picco'
--
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-06-12 16:45:26
