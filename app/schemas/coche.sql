USE carpooling;

CREATE TABLE IF NOT EXISTS `cars` (
  `id_coche` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `matricula` CHAR(7) NOT NULL,
  `marca` VARCHAR(50) NOT NULL,
  `modelo` VARCHAR(50) NOT NULL,
  `color` VARCHAR(50) NULL,
  `tipo_combustible` ENUM('Gasolina','Diesel','Electrico','Hibrido') NOT NULL,
  `numero_plazas` TINYINT UNSIGNED NOT NULL,
  `user` VARCHAR(50) NOT NULL,
  `year` YEAR NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_coche`),
  UNIQUE KEY `ux_cars_matricula` (`matricula`),
  KEY `idx_cars_user` (`user`),
  CONSTRAINT `fk_cars_user_username`
    FOREIGN KEY (`user`) REFERENCES `users`(`username`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `chk_matricula_len` CHECK (CHAR_LENGTH(`matricula`) = 7),
  CONSTRAINT `chk_numero_plazas_range` CHECK (`numero_plazas` BETWEEN 1 AND 7),
  CONSTRAINT `chk_marca_length` CHECK (CHAR_LENGTH(`marca`) BETWEEN 3 AND 50),
  CONSTRAINT `chk_modelo_length` CHECK (CHAR_LENGTH(`modelo`) BETWEEN 3 AND 50),
  CONSTRAINT `chk_color_length` CHECK (`color` IS NULL OR CHAR_LENGTH(`color`) BETWEEN 3 AND 50)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `cars` ADD `year` YEAR NOT NULL;