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
  `auth_method` ENUM('password', 'google', 'other') NOT NULL DEFAULT 'password' AFTER `password`,
  `google_id` VARCHAR(255) NULL AFTER `auth_method`,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ux_users_username` (`username`),
  UNIQUE KEY `ux_users_email` (`email`),
  UNIQUE KEY `ux_users_dni` (`dni`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `users` 
ADD COLUMN `auth_method` ENUM('password', 'google', 'other') NOT NULL DEFAULT 'password' AFTER `password`,
ADD COLUMN `google_id` VARCHAR(255) NULL AFTER `auth_method`,

ADD UNIQUE KEY `ux_users_google_id` (`google_id`);
ALTER TABLE carpooling.users
ADD COLUMN stripe_customer_account VARCHAR(100) NULL

ALTER TABLE carpooling.users
ADD COLUMN onboarding_ended BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE carpooling.users
ADD COLUMN about_me VARCHAR(255) NULL
ALTER TABLE `users` MODIFY `password` VARCHAR(255) NULL;

/*TABLA PARA MYSQL LITE */
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password TEXT NULL,
    img_perfil TEXT,
    name TEXT,
    phone TEXT,
    fecha_nacimiento TEXT NULL, -- store as ISO string (YYYY-MM-DD)
    dni TEXT NULL UNIQUE,
    genero TEXT NULL CHECK (genero IN ('Masculino','Femenino','Otro')),
    stripe_account TEXT,
    stripe_customer_account TEXT,
    ciudad TEXT NULL,
    provincia TEXT NULL,
    codigo_postal TEXT NULL,
    direccion TEXT NULL ,
    onboarding_ended INTEGER NOT NULL DEFAULT 0, -- 0/1 boolean
    about_me TEXT,
    auth_method TEXT CHECK (auth_method IN ('password', 'google', 'other')) NOT NULL DEFAULT 'password',
    google_id TEXT NULL,
    created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
    updated_at TEXT DEFAULT (CURRENT_TIMESTAMP)
  );
ALTER TABLE users
ALTER COLUMN password DROP NOT NULL;


