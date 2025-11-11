

CREATE TABLE IF NOT EXISTS `payment_intents` (
 `payment_id` VARCHAR(255) NOT NULL,
 `amount` INT UNSIGNED NOT NULL,
 `description` VARCHAR(255) NULL,
 `destination_account` VARCHAR(255) NULL,
 `sender_account` VARCHAR(255) NULL,
 `state` ENUM('pending','succeeded','canceled','pending-confirmation','failed') NOT NULL DEFAULT 'pending',
 `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
 `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 PRIMARY KEY (`payment_id`),
 KEY `idx_payment_intents_state` (`state`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `payment_intents`
MODIFY COLUMN `state` ENUM('pending', 'succeeded', 'canceled', 'pending-confirmation', 'failed', 'requires_payment_method') NOT NULL DEFAULT 'pending';

ALTER TABLE `payment_intents`
ADD COLUMN `currency` ENUM('eur', 'usd', 'gbp', 'jpy', 'aud') NOT NULL DEFAULT 'eur';

