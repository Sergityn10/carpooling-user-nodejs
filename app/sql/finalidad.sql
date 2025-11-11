CREATE TABLE IF NOT EXISTS finalidades (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE, -- Ej: 'Trabajo', 'Entrenamiento de Tenis', 'Clases de Música'
    descripcion VARCHAR(255)
);

INSERT INTO finalidades (nombre, descripcion) VALUES
('Trabajo', 'Viaje para ir al trabajo'),
('Estudios', 'Viaje para tu universidad, biblioteca o escuela.');
