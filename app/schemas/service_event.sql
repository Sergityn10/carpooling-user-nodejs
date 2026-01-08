USE carpooling;

CREATE TABLE `service_events` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `enterprise_id` INT UNSIGNED NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `description` TEXT NULL,
  `start_at` DATETIME NOT NULL,
  `end_at` DATETIME NULL,
  `status` ENUM('draft','requested','approved','rejected','canceled','completed') NOT NULL DEFAULT 'requested',
  `venue_name` VARCHAR(255) NULL,
  `address_line1` VARCHAR(255) NOT NULL,
  `address_line2` VARCHAR(255) NULL,
  `city` VARCHAR(120) NOT NULL,
  `province` VARCHAR(120) NULL,
  `postal_code` VARCHAR(20) NULL,
  `country` CHAR(2) NOT NULL DEFAULT 'ES',
  `latitude` DECIMAL(10,7) NULL,
  `longitude` DECIMAL(10,7) NULL,
  `contact_name` VARCHAR(255) NULL,
  `contact_email` VARCHAR(255) NULL,
  `contact_phone` VARCHAR(30) NULL,
  `attendees_estimate` INT NULL,
  `notes` TEXT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_service_events_enterprise_id` (`enterprise_id`),
  KEY `idx_service_events_status` (`status`),
  KEY `idx_service_events_start_at` (`start_at`),
  CONSTRAINT `fk_service_events_enterprise_id`
    FOREIGN KEY (`enterprise_id`) REFERENCES `enterprises`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `chk_service_events_attendees` CHECK (`attendees_estimate` IS NULL OR `attendees_estimate` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
