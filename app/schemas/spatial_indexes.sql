-- ============================================================================
-- OPTIMIZACIÓN GEOESPACIAL: PLATFORM_EVENTS (MySQL 8.0+)
-- ============================================================================

-- 1. Crear columna calculada espacial persistida (STORED) para platform_events
-- En MySQL 8.0 con SRID 4326 (WGS 84), el orden de ejes estándar es Latitud, Longitud (POINT(lat, lng))
ALTER TABLE `platform_events`
DROP COLUMN IF EXISTS `location`;

ALTER TABLE `platform_events`
ADD COLUMN `location` POINT NOT NULL SRID 4326 
GENERATED ALWAYS AS (
  ST_SRID(POINT(COALESCE(`latitude`, 0), COALESCE(`longitude`, 0)), 4326)
) STORED;

-- 2. Crear índice espacial (R-Tree) sobre platform_events
ALTER TABLE `platform_events` 
ADD SPATIAL INDEX `idx_platform_events_location` (`location`);

-- 3. Índice para filtrado temporal de eventos activos
ALTER TABLE `platform_events` 
ADD INDEX `idx_platform_events_end_date` (`end_date`);
