USE carpooling;

CREATE TABLE `enterprises` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(255) NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `password` VARCHAR(255) NOT NULL,
  `phone` VARCHAR(30) NULL,
  `cif` VARCHAR(50) NULL,
  `website` VARCHAR(255) NULL,
  `address_line1` VARCHAR(255) NULL,
  `address_line2` VARCHAR(255) NULL,
  `city` VARCHAR(120) NULL,
  `province` VARCHAR(120) NULL,
  `postal_code` VARCHAR(20) NULL,
  `country` CHAR(2) NOT NULL DEFAULT 'ES',
  `verified` BOOLEAN NOT NULL DEFAULT FALSE,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ux_enterprises_email` (`email`),
  UNIQUE KEY `ux_enterprises_cif` (`cif`),
  KEY `idx_enterprises_verified` (`verified`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
