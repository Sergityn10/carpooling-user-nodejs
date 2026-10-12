# Planificación: Optimización Geoespacial de Recuperación de Eventos

## 1. Contexto y Objetivos
- **Problema previo:** El endpoint `GET /api/events/nearby` cargaba hasta 500 registros a memoria y calculaba la fórmula de Haversine en el hilo de JavaScript (Node.js). Esto provocaba cuellos de botella de CPU, falta de escalabilidad ante alto volumen de datos y posibilidad de omitir eventos cercanos si la base de datos tenía muchos registros históricos.
- **Objetivo:** Optimizar la recuperación de eventos cercanos usando coordenadas (`lat` y `lng`) mediante tipos espaciales `POINT`, clases Value Object, índice espacial **R-Tree** nativo de MySQL y consultas SQL optimizadas.

---

## 2. Decisiones Técnicas y Arquitectura
1. **Clase `GeoPoint` (Domain Value Object):**
   - Archivo: `app/utils/geoPoint.js`.
   - Validación estricta de rangos de coordenadas: latitud `[-90, 90]` y longitud `[-180, 180]`.
   - Cálculo de Bounding Box (caja delimitadora) para pre-filtrado indexado.
   - **Nuevo:** Generación de polígono envolvente WKT (`toEnvelopePolygonWKT`) para activar el índice R-Tree mediante `MBRWithin`.
   - Conversión a formatos estándar: WKT (`POINT(lng lat)`), GeoJSON y cálculo de distancia esférica Haversine.

2. **Capa de Base de Datos (MySQL 8.0+):**
   - Columna espacial `location POINT NOT NULL SRID 4326` poblada desde `latitude`/`longitude` existentes.
   - Índice **SPATIAL INDEX (R-Tree)** `idx_platform_events_location` para búsquedas espaciales en $O(\log N)$.
   - Índice compuesto B-Tree `idx_platform_events_end_date` para filtros de fecha combinados.
   - Script de migración idempotente: `scripts/migrate-spatial.js` (ejecutable con `npm run migrate:spatial`).

3. **Capa de Servicios (`app/services/geoSpatialService.js`):**
   - Servicio desacoplado y reutilizable para consultas geoespaciales nativas.
   - Enfoque de **dos fases** para máxima precisión y rendimiento:
     1. **Fase R-Tree (índice espacial):** `MBRWithin(location, ST_GeomFromText(envelopePolygon, 4326))` — filtra candidatos usando el índice R-Tree.
     2. **Fase esférica precisa:** `ST_Distance_Sphere(location, targetPoint) <= radioMetros` — calcula distancia exacta sobre el conjunto reducido.
   - Soporta paginación nativa (`LIMIT`/`OFFSET`), conteo total optimizado, joins con `Company` y agregación de `Tags`.
   - Extensible a otras entidades geoespaciales (`ServiceEvent`, trayectos, etc.).

4. **Capa de Controladores (`app/controllers/events.js`):**
   - Refactorización de `getNearbyEvents` para delegar en `geoSpatialService.findNearbyPlatformEvents`.
   - **Zero Breaking Changes:** Contrato de entrada (`lat`, `lng`, `radius`, `tag`, `limit`, `page`) y JSON de salida idénticos.
   - Validación de entrada robusta mediante `GeoPoint`.

---

## 3. Estado de Ejecución de Tareas

- [x] **Definición de Arquitectura y Planificación**: Documento inicial y análisis técnico.
- [x] **Fase 1 - Creación del Value Object `GeoPoint`**: `app/utils/geoPoint.js` con `toEnvelopePolygonWKT`.
- [x] **Fase 2 - Migración Espacial MySQL (R-Tree)**: Script idempotente `scripts/migrate-spatial.js` ejecutado con éxito.
- [x] **Fase 3 - Servicio Geoespacial Reutilizable**: `app/services/geoSpatialService.js` con consulta SQL nativa de dos fases.
- [x] **Fase 4 - Refactorización de Controlador**: `getNearbyEvents` en `app/controllers/events.js` delega en el servicio espacial.
- [x] **Fase 5 - Validación**: Sintaxis verificada, migración aplicada en MySQL, índices R-Tree creados.

---

## 4. Cómo Ejecutar la Migración (Producción / Staging / Desarrollo)

```bash
# Aplica la columna espacial, índice R-Tree e índice en end_date
npm run migrate:spatial
```

El script es **idempotente**: se puede ejecutar múltiples veces sin errores. Verifica existencia de columna e índices en `information_schema` antes de crear.

---

## 5. Verificación del Índice R-Tree en MySQL

Para confirmar que el optimizador usa el índice espacial, ejecuta en MySQL:

```sql
EXPLAIN FORMAT=TREE
SELECT * FROM platform_events
WHERE MBRWithin(location, ST_GeomFromText('POLYGON((...))', 4326))
  AND ST_Distance_Sphere(location, ST_SRID(POINT(-3.7038, 40.4168), 4326)) <= 50000;
```

La salida debe mostrar `Index Range Scan` sobre `idx_platform_events_location`.

---

## 6. Registro de Cambios y Mejoras
- **Fecha:** Octubre 2026
- **Detalle:** Implementada optimización geoespacial completa con:
  - Value Object `GeoPoint` (validación, WKT, Envelope Polygon, Haversine).
  - Índice espacial R-Tree nativo en MySQL via migración idempotente.
  - Servicio geoespacial desacoplado con patrón de dos fases (R-Tree + esférico).
  - Controlador limpio y paginación real.
  - Compatibilidad 100% hacia atrás en API pública.