-- ==========================================================
-- 1. Estructura de Usuarios (si no existe)
-- Se asume que esta tabla ya existe y tiene una clave primaria.
-- ==========================================================
/*
CREATE TABLE IF NOT EXISTS usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    ... otros campos de usuario
);
*/


-- ==========================================================
-- 2. Tabla para Almacenar la Disponibilidad Semanal
-- ==========================================================
CREATE TABLE IF NOT EXISTS disponibilidad_semanal (
    id INT AUTO_INCREMENT PRIMARY KEY,
    
    -- Columna para vincular con la tabla de usuarios
    usuario_id INT NOT NULL,
    
    -- Representa el día de la semana (1 = Lunes, 7 = Domingo)
    dia_semana ENUM('1', '2', '3', '4', '5', '6', '7') NOT NULL, 
    
    -- Franja horaria de inicio (e.g., '08:00:00')
    hora_inicio TIME NOT NULL, 
    
    -- Franja horaria de fin (e.g., '09:00:00')
    hora_fin TIME NOT NULL,

    transport_needed BOOLEAN NOT NULL,
    
    -- Puede ser un valor booleano o un estado (e.g., 'disponible', 'ocupado')
    estado ENUM('disponible', 'ocupado', 'prefiero_no') DEFAULT 'disponible' NOT NULL,

    finalidad VARCHAR(100) NOT NULL,    
    -- Clave foránea para asegurar la integridad referencial con la tabla de usuarios
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (finalidad) REFERENCES finalidades(nombre) ON DELETE CASCADE,
    
    -- Índice único: Un usuario no puede tener dos entradas que se solapen exactamente
    -- en el mismo día, hora de inicio y hora de fin.
    UNIQUE KEY idx_unique_slot (usuario_id, dia_semana, hora_inicio, hora_fin)
);

ALTER TABLE disponibilidad_semanal 
CHANGE usuario_id username VARCHAR(100) NOT NULL;
ALTER TABLE disponibilidad_semanal 
DROP FOREIGN KEY fk_usuario;

ALTER TABLE disponibilidad_semanal 
MODIFY COLUMN usuario_id INT NOT NULL;

ALTER TABLE disponibilidad_semanal 
ADD CONSTRAINT fk_usuario FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE;

ALTER TABLE disponibilidad_semanal 
MODIFY COLUMN dia_semana ENUM('Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo') NOT NULL;

ALTER TABLE disponibilidad_semanal 
ADD COLUMN origen VARCHAR(500) NOT NULL,
ADD COLUMN destino VARCHAR(500) NOT NULL,
ADD CONSTRAINT fk_ubicacion_origen FOREIGN KEY (origen) REFERENCES ubicaciones(address) ON DELETE CASCADE,
ADD CONSTRAINT fk_ubicacion_destino FOREIGN KEY (destino) REFERENCES ubicaciones(address) ON DELETE CASCADE;



