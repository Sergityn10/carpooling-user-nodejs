CREATE TABLE `users` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `username` VARCHAR(50) NOT NULL,
  `email` VARCHAR(50) NOT NULL,
  `password` VARCHAR(255) NOT NULL,
  `name` VARCHAR(100) NULL,
  `phone` VARCHAR(20) NULL,
  `img_perfil` MEDIUMTEXT NULL,
  `about_me` VARCHAR(255) NULL,
  `fecha_nacimiento` DATE NOT NULL,
  `DNI` CHAR(9) NOT NULL,
  `genero` ENUM('Masculino','Femenino','Otro') NOT NULL,
  `stripe_account` VARCHAR(255) NULL,
  `stripe_customer_account` VARCHAR(255) NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ux_users_username` (`username`),
  UNIQUE KEY `ux_users_email` (`email`),
  UNIQUE KEY `ux_users_dni` (`DNI`)
) 

ALTER TABLE carpooling.users
ADD COLUMN stripe_customer_account VARCHAR(100) NULL

ALTER TABLE carpooling.users
ADD COLUMN about_me VARCHAR(255) NULL
