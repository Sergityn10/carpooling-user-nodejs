-- Complete database initialization for Carpooling application
USE carpooling;
-- 0) Crear la tabla si no existe (estructura base)
CREATE TABLE `users` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `email` VARCHAR(50) NOT NULL,
  `password` VARCHAR(255) NOT NULL,
  `img_perfil` MEDIUMTEXT NULL,
  `name` VARCHAR(100) NULL,
  `phone` VARCHAR(20) NULL,
  `fecha_nacimiento` DATE NOT NULL,
  `DNI` CHAR(9) NOT NULL,
  `genero` ENUM('Masculino','Femenino','Otro') NOT NULL,
  `stripe_account` VARCHAR(255) NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ux_users_email` (`email`),
  UNIQUE KEY `ux_users_dni` (`DNI`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Telegram info table
CREATE TABLE IF NOT EXISTS telegram_info (
    id INT NOT NULL PRIMARY KEY,
    user_id INT NOT NULL,
    telegram_username VARCHAR(255) NULL,
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255) NULL,
    chat_id BIGINT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT chk_username_length_telegram CHECK (CHAR_LENGTH(username) >= 3 AND CHAR_LENGTH(username) <= 50)
);

-- Indexes for better performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_telegram_username ON telegram_info(username);
CREATE INDEX idx_telegram_chat_id ON telegram_info(chat_id);

CREATE TABLE events (
  event_id VARCHAR(100) PRIMARY KEY NOT NULL UNIQUE,
  data JSON NOT NULL,
  source VARCHAR(255) NOT NULL,
  processing_error TEXT NULL,
  status VARCHAR(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE events (
  -- 1. Clave primaria con TEXT
  event_id TEXT PRIMARY KEY NOT NULL,
  
  -- 2. JSON se convierte a TEXT
  data TEXT NOT NULL,
  
  -- 3. Cadenas de texto
  source TEXT NOT NULL,
  processing_error TEXT NULL,
  status TEXT NOT NULL
  
  -- Nota: Las restricciones UNIQUE en la clave primaria son redundantes en SQLite
);

CREATE TABLE carpooling.accounts (
  `stripe_account_id` VARCHAR(255) NOT NULL,
  `default_account` BOOLEAN DEFAULT FALSE,
  `username` VARCHAR(255) NOT NULL,
  `charges_enabled` BOOLEAN NOT NULL DEFAULT false,
  `transfers_enabled` BOOLEAN NOT NULL DEFAULT false,
  `details_submitted` BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (`stripe_account_id`),
  FOREIGN KEY (username) REFERENCES carpooling.users(username) ON DELETE CASCADE ON UPDATE CASCADE


) ;
CREATE TABLE accounts (
  -- 1. Clave primaria TEXT (VARCHAR se convierte a TEXT)
  stripe_account_id TEXT PRIMARY KEY NOT NULL,
  
  -- 2. BOOLEAN se convierte a INTEGER (0 o 1)
  default_account INTEGER DEFAULT 0,
  
  -- 3. Campos de texto
  username TEXT NOT NULL,
  charges_enabled INTEGER NOT NULL DEFAULT 0,
  transfers_enabled INTEGER NOT NULL DEFAULT 0,
  details_submitted INTEGER NOT NULL DEFAULT 0,
  
  -- 4. Clave Foránea (El esquema 'carpooling' se omite en SQLite)
  FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE ON UPDATE CASCADE
);