-- Complete database initialization for Carpooling application
USE carpooling;

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    img_perfil MEDIUMTEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    CONSTRAINT chk_username_length CHECK (CHAR_LENGTH(username) >= 3 AND CHAR_LENGTH(username) <= 50),
    CONSTRAINT chk_password_length CHECK (CHAR_LENGTH(password) >= 6 AND CHAR_LENGTH(password) <= 100),
    CONSTRAINT chk_email_format CHECK (email REGEXP '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- 0) Crear la tabla si no existe (estructura base)
CREATE TABLE IF NOT EXISTS `users` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `username` VARCHAR(50) NOT NULL,
  `email` VARCHAR(50) NOT NULL,
  `password` VARCHAR(255) NOT NULL,
  `name` VARCHAR(100) NULL,
  `phone` VARCHAR(20) NULL,
  `img_perfil` MEDIUMTEXT NULL,
  `fecha_nacimiento` DATE NOT NULL,
  `DNI` CHAR(9) NOT NULL,
  `genero` ENUM('Masculino','Femenino','Otro') NOT NULL,
  `stripe_account` VARCHAR(255) NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ux_users_username` (`username`),
  UNIQUE KEY `ux_users_email` (`email`),
  UNIQUE KEY `ux_users_dni` (`DNI`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Telegram info table
CREATE TABLE IF NOT EXISTS telegram_info (
    id INT NOT NULL PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    telegram_username VARCHAR(255) NULL,
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255) NULL,
    chat_id BIGINT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT chk_username_length_telegram CHECK (CHAR_LENGTH(username) >= 3 AND CHAR_LENGTH(username) <= 50)
);

-- Indexes for better performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_telegram_username ON telegram_info(username);
CREATE INDEX idx_telegram_chat_id ON telegram_info(chat_id);

CREATE TABLE events (
  event_id STRING NOT NULL PRIMARY KEY,
  data JSON NOT NULL,
  source VARCHAR(255) NOT NULL,
  processing_error TEXT NULL,
  status VARCHAR(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE carpooling.accounts (
  `stripe_account_id` VARCHAR(255) NOT NULL,
  `default_account` BOOLEAN DEFAULT FALSE,
  `username` VARCHAR(255) NOT NULL,
  `charges_enabled` BOOLEAN NOT NULL DEFAULT false,
  `transfers_enabled` BOOLEAN NOT NULL DEFAULT false,
  `details_submitted` BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (`stripe_account_id`)
  FOREIGN KEY (username) REFERENCES carpooling.users(username) ON DELETE CASCADE ON UPDATE CASCADE,


) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;