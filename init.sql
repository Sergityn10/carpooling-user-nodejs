CREATE DATABASE IF NOT EXISTS app_usuarios;
CREATE DATABASE IF NOT EXISTS app_viajes;
CREATE DATABASE IF NOT EXISTS app_messages;

-- 2. Crear usuarios específicos para cada microservicio
CREATE USER 'user_auth'@'%' IDENTIFIED BY 'userAuthentication';
CREATE USER 'viajes_app'@'%' IDENTIFIED BY 'travelsAuthentication';
CREATE USER 'messages_app'@'%' IDENTIFIED BY 'messagesAuthentication';

-- 3. Asignar permisos: Cada usuario SOLO puede ver su propia base de datos
GRANT ALL PRIVILEGES ON app_usuarios.* TO 'user_auth'@'%';
GRANT ALL PRIVILEGES ON app_viajes.* TO 'viajes_app'@'%';
GRANT ALL PRIVILEGES ON app_messages.* TO 'messages_app'@'%';

-- 4. Aplicar los cambios de privilegios
FLUSH PRIVILEGES;