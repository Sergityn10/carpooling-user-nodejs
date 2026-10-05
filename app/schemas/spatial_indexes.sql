-- ============================================================================
-- OPTIMIZACIÓN GEOESPACIAL: PLATFORM_EVENTS Y SERVICE_EVENTS (MySQL 8.0+)
-- ============================================================================

-- 1. Crear columna calculada espacial persistida (STORED) para PlatformEvent
-- SRID 4326 corresponde al estándar GPS WGS 84 (coordenadas geográficas estándar)
ALTER TABLE `platform_events`
ADD COLUMN `location` POINT NOT NULL SRID 4326 
GENERATED ALWAYS AS (
  ST_SRID(POINT(COALESCE(`longitude`, 0), COALESCE(`latitude`, 0)), 4326)
) STORED;

-- 2. Crear índice espacial (R-Tree) sobre platform_events
ALTER TABLE `platform_events` 
ADD SPATIAL INDEX `idx_platform_events_location` (`location`);

-- 3. Índices de aceleración combinada para fechas y coordenadas
ALTER TABLE `platform_events` 
ADD INDEX `idx_platform_events_end_date` (`end_date`),
ADD INDEX `idx_platform_events_coords` (`latitude`, `longitude`);

-- ----------------------------------------------------------------------------
-- 4. Opcional / Compatible: Aplicar misma optimización a service_events
-- ----------------------------------------------------------------------------
ALTER TABLE `service_events`
ADD COLUMN `location` POINT NOT NULL SRID 4326 
GENERATED ALWAYS AS (
  ST_SRID(POINT(COALESCE(`longitude`, 0), COALESCE(`latitude`, 0)), 4326)
) STORED;

ALTER TABLE `service_events` 
ADD SPATIAL INDEX `idx_service_events_location` (`location`);

ALTER TABLE `service_events` 
ADD INDEX `idx_service_events_coords` (`latitude`, `longitude`);
