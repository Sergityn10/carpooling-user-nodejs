CREATE TABLE IF NOT EXISTS service_events (
   id INTEGER PRIMARY KEY AUTOINCREMENT,
   enterprise_id INTEGER NOT NULL,
   title TEXT NOT NULL,
   description TEXT NULL,
   start_at TEXT NOT NULL,
   end_at TEXT NULL,
   status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('draft','requested','approved','rejected','canceled','completed')),
   venue_name TEXT NULL,
   address_line1 TEXT NOT NULL,
   address_line2 TEXT NULL,
   city TEXT NOT NULL,
   province TEXT NULL,
   postal_code TEXT NULL,
   country TEXT NOT NULL DEFAULT 'ES',
   latitude REAL NULL,
   longitude REAL NULL,
   contact_name TEXT NULL,
   contact_email TEXT NULL,
   contact_phone TEXT NULL,
   attendees_estimate INTEGER NULL CHECK (attendees_estimate IS NULL OR attendees_estimate >= 0),
   notes TEXT NULL,
   created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
   updated_at TEXT DEFAULT (CURRENT_TIMESTAMP),
   FOREIGN KEY (enterprise_id) REFERENCES enterprises(id) ON DELETE CASCADE ON UPDATE CASCADE
);


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