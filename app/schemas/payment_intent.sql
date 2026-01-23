

CREATE TABLE IF NOT EXISTS `payment_intents` (
 `payment_id` VARCHAR(255) NOT NULL,
 `amount` INT UNSIGNED NOT NULL,
 `currency` ENUM('eur', 'usd', 'gbp', 'jpy', 'aud') NOT NULL DEFAULT 'eur',
 `description` VARCHAR(255) NULL,
 `destination_account` VARCHAR(255) NULL,
 `sender_account` VARCHAR(255) NULL,
 `state` ENUM('pending','succeeded','canceled','pending-confirmation','failed','requires_payment_method') NOT NULL DEFAULT 'pending',
 'client_secret' TEXT NULL,
 `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
 `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 PRIMARY KEY (`payment_id`),
 KEY `idx_payment_intents_state` (`state`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `payment_intents`
MODIFY COLUMN `state` ENUM('pending', 'succeeded', 'canceled', 'pending-confirmation', 'failed', 'requires_payment_method') NOT NULL DEFAULT 'pending';

ALTER TABLE `payment_intents`
ADD COLUMN `currency` ENUM('eur', 'usd', 'gbp', 'jpy', 'aud') NOT NULL DEFAULT 'eur';


CREATE TABLE IF NOT EXISTS `payment_intents` (
    `payment_id` TEXT NOT NULL,
    `amount` INTEGER NOT NULL,
    -- SQLite no tiene ENUM, usamos CHECK para validar los valores
    `currency` TEXT NOT NULL DEFAULT 'eur' CHECK (`currency` IN ('eur', 'usd', 'gbp', 'jpy', 'aud')),
    `description` TEXT NULL,
    `destination_account` TEXT NULL,
    `sender_account` TEXT NULL,
    -- Usamos CHECK para replicar el comportamiento del ENUM 'state'
    `state` TEXT NOT NULL DEFAULT 'pending' CHECK (`state` IN ('pending','succeeded','canceled','pending-confirmation','failed','requires_payment_method')),
    `client_secret` TEXT NULL,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`payment_id`)
);