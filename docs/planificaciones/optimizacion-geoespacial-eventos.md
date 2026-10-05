# Planificación: Optimización Geoespacial de Recuperación de Eventos

## 1. Contexto y Objetivos
- **Problema previo:** El endpoint `GET /api/events/nearby` cargaba hasta 500 registros a memoria y calculaba la fórmula de Haversine en el hilo de JavaScript (Node.js). Esto provocaba cuellos de botella de CPU, falta de escalabilidad ante alto volumen de datos y posibilidad de omitir eventos cercanos si la base de datos tenía muchos registros históricos.
- **Objetivo:** Optimizar la recuperación de eventos cercanos usando coordenadas (`lat` y `lng`) mediante tipos espaciales `POINT`, clases Value Object y Bounding Box pre-filtrado con índices en MySQL/Prisma.

---

## 2. Decisiones Técnicas y Arquitectura
1. **Clase `GeoPoint` (Domain Value Object):**
   - Archivo: `app/utils/geoPoint.js`.
   - Validación de rangos de coordenadas: latitud `[-90, 90]` y longitud `[-180, 180]`.
   - Cálculo de Bounding Box (caja delimitadora) para pre-filtrado indexado a nivel de base de datos.
   - Conversión a formato WKT (`POINT(lng lat)`), GeoJSON y cálculo de distancia esférica Haversine.
2. **Capa de Base de Datos (MySQL):**
   - Archivo: `app/schemas/spatial_indexes.sql`.
   - Columna calculada persistida (`STORED GENERATED`) con tipo de dato `POINT SRID 4326`.
   - Índice `SPATIAL INDEX` (R-Tree) sobre `location`.
   - Índices compuestos en `(latitude, longitude)` y `end_date` para acelerar consultas combinadas.
3. **Capa de Controladores (Express / Prisma):**
   - Archivo: `app/controllers/events.js` (`getNearbyEvents`).
   - Uso de `GeoPoint` para validación de entrada y generación de Bounding Box.
   - Pre-filtrado en Prisma con `latitude` y `longitude` delimitadas para evaluar únicamente eventos candidatos y no escanear toda la tabla.
   - Paginación integrada con metadatos: `total`, `totalPages`, `page`, `limit` y `radius_km`.

---

## 3. Estado de Ejecución de Tareas

- [x] **Definición de Arquitectura y Planificación**: Documento inicial y análisis técnico.
- [x] **Fase 1 - Creación del Value Object `GeoPoint`**: `app/utils/geoPoint.js`.
- [x] **Fase 2 - Esquemas y Scripts de Migración SQL**: `app/schemas/spatial_indexes.sql`.
- [x] **Fase 3 - Refactorización de Controlador**: Actualizar `getNearbyEvents` en `app/controllers/events.js`.
- [x] **Fase 4 - Validación y Pruebas**: Verificación de sintaxis e importaciones completada.

---

## 4. Registro de Cambios y Mejoras
- **Fecha:** Octubre 2026
- **Detalle:** Implementada optimización geoespacial con pre-filtrado por Bounding Box, clase de dominio `GeoPoint`, script DDL para índices espaciales R-Tree en MySQL y paginación estructurada.
