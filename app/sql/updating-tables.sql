-- Update script to align existing database with latest schema changes
USE carpooling;
-- Add `img_perfil` column to `users` table if it does not already exist
ALTER TABLE users
ADD COLUMN img_perfil MEDIUMTEXT NULL AFTER password;

  ALTER TABLE users
  ADD COLUMN  name VARCHAR(100) NULL BEFORE username;

ALTER TABLE `users`
  ADD COLUMN name VARCHAR(100) NULL,
  ADD COLUMN phone VARCHAR(20) NULL,
  ADD COLUMN fecha_nacimiento DATE NOT NULL DEFAULT '1970-01-01',
  ADD COLUMN DNI CHAR(9) NOT NULL,
  ADD COLUMN genero ENUM('Masculino','Femenino','Otro') NOT NULL,
  ADD COLUMN stripe_account VARCHAR(255) NULL;


-- 2) Forzar tipos y tamaños finales (puede fallar si hay datos incompatibles)
ALTER TABLE `users`
  MODIFY COLUMN `img_perfil` MEDIUMTEXT NULL,
  MODIFY COLUMN `fecha_nacimiento` DATE NOT NULL,
  MODIFY COLUMN `DNI` CHAR(9) NULL,
  MODIFY COLUMN `genero` ENUM('Masculino','Femenino','Otro') NULL,
  MODIFY COLUMN `stripe_account` VARCHAR(255) NULL;

-- Migración idempotente de `users` acorde a app/schemas/user.js
-- Requiere MySQL 8.0+

USE `carpooling`;

-- 0) Crear la tabla base si no existe con la estructura final deseada
CREATE TABLE `users` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `username` VARCHAR(50) NOT NULL,
  `email` VARCHAR(50) NOT NULL,
  `password` VARCHAR(255) NOT NULL,
  `img_perfil` MEDIUMTEXT NULL,
  `name` VARCHAR(100) NULL,
  `phone` VARCHAR(20) NULL,
  `fecha_nacimiento` DATE NOT NULL,
  `DNI` CHAR(9) NOT NULL,
  `genero` ENUM('Masculino','Femenino','Otro') NOT NULL,
  `stripe_account` VARCHAR(255) NULL,
  `stripe_customer_account` VARCHAR(255) NULL,
  `ciudad` VARCHAR(100) NOT NULL,
  `provincia` VARCHAR(100) NOT NULL,
  `codigo_postal` VARCHAR(10) NOT NULL,
  `direccion` VARCHAR(255) NOT NULL,
  `onboarding_ended` BOOLEAN NOT NULL DEFAULT FALSE,
  `about_me` VARCHAR(255) NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ux_users_username` (`username`),
  UNIQUE KEY `ux_users_email` (`email`),
  UNIQUE KEY `ux_users_dni` (`dni`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 1) Renombrar columna `DNI`->`dni` si existe el antiguo nombre y no existe la nueva en esta instancia
SET @db := DATABASE();
SET @has_dni := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA=@db AND TABLE_NAME='users' AND COLUMN_NAME='dni'
);
SET @has_DNI := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA=@db AND TABLE_NAME='users' AND COLUMN_NAME='DNI'
);
SET @sql := IF(@has_dni=0 AND @has_DNI>0,
  'ALTER TABLE `users` CHANGE COLUMN `DNI` `dni` CHAR(9) NOT NULL',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 2) Asegurar existencia de columnas nuevas (como NULL primero si serán NOT NULL)
ALTER TABLE `users`
ALTER TABLE carpooling.users
  ADD COLUMN `ciudad` VARCHAR(100) NULL,
  ADD COLUMN `provincia` VARCHAR(100) NULL,
  ADD COLUMN `codigo_postal` VARCHAR(10) NULL,
  ADD COLUMN `direccion` VARCHAR(255) NULL;
  ADD COLUMN telefono VARCHAR(11) NULL;

ALTER TABLE carpooling.users
  MODIFY COLUMN fecha_nacimiento DATE NOT NULL DEFAULT '1970-01-01';

ALTER TABLE carpooling.users
  MODIFY COLUMN `DNI` CHAR(9) NULL
-- 3) Crear índices únicos si no existen (evita error si ya están creados)
SET @db := DATABASE();

-- username
SET @exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'users'
    AND INDEX_NAME = 'ux_users_username'
);
SET @sql := IF(@exists = 0, 'ALTER TABLE `users` ADD UNIQUE KEY `ux_users_username` (`username`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- email
SET @exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'users'
    AND INDEX_NAME = 'ux_users_email'
);
SET @sql := IF(@exists = 0, 'ALTER TABLE `users` ADD UNIQUE KEY `ux_users_email` (`email`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- DNI
SET @exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'users'
    AND INDEX_NAME = 'ux_users_dni'
);
SET @sql := IF(@exists = 0, 'ALTER TABLE `users` ADD UNIQUE KEY `ux_users_dni` (`DNI`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


ALTER TABLE carpooling.events
  ADD COLUMN `event_id` VARCHAR(100) NOT NULL;

ALTER TABLE carpooling.accounts
  ADD COLUMN `default_account` BOOLEAN DEFAULT FALSE ;

ALTER TABLE carpooling.events
ADD PRIMARY KEY (event_id);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS onboarding_ended TIMESTAMP NULL;

UPDATE users
SET onboarding_end = NOW()
WHERE id = ?; -- Reemplaza ? con el ID del usuario que deseas actualizar
