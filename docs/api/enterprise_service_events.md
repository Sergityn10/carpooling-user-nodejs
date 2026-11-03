# Eventos de Servicio de Empresa (`/api/enterprise/service-events`)

Endpoints CRUD para gestionar eventos de servicio solicitados por empresas. Todos requieren autenticación de empresa.

---

## 1. Crear evento de servicio

**URL:** `POST /api/enterprise/service-events`

**Autenticación:** Requerida (`isEnterpriseLoged`).

**Descripción:** Crea un nuevo evento de servicio asociado a la empresa autenticada. Si no se proporcionan coordenadas, se geocodifica la dirección usando Google Maps. El estado inicial es `requested`.

**Entrada (body JSON):**
```json
{
  "name": "string (requerido)",
  "description": "string (opcional)",
  "startDate": "ISO datetime (requerido)",
  "endDate": "ISO datetime (opcional)",
  "location": "string (requerido, dirección del evento)",
  "latitude": "number (opcional)",
  "longitude": "number (opcional)"
}
```

**Salida (201):**
```json
{
  "status": "Success",
  "message": "Service event created",
  "service_event": {
    "id": 1,
    "enterprise_id": 1,
    "title": "Evento de transporte",
    "description": "Descripción del evento",
    "start_at": "2024-06-01T10:00:00Z",
    "end_at": "2024-06-01T18:00:00Z",
    "status": "requested",
    "address_line1": "Calle Mayor 1, Madrid",
    "city": "",
    "country": "ES",
    "latitude": 40.4168,
    "longitude": -3.7038,
    "created_at": "2024-01-01T00:00:00Z"
  }
}
```

**Errores:**
- `400` — Validación fallida, empresa no encontrada, o error de geocodificación.
- `403` — Acceso denegado (no es empresa).
- `500` — Error al crear el evento.

---

## 2. Listar eventos de servicio

**URL:** `GET /api/enterprise/service-events`

**Autenticación:** Requerida (`isEnterpriseLoged`).

**Descripción:** Devuelve los eventos de servicio de la empresa autenticada, ordenados por fecha de creación descendente. Soporta paginación e incluye el **número total de usuarios inscritos** en cada evento.

**Query params:**
- `limit` — Número de resultados (default: 50, máx: 200).
- `offset` — Desplazamiento (default: 0).

**Propiedades de Conteo de Asistentes / Inscritos en cada evento:**
- `total_participants` (`number`) — Conteo consolidado de personas inscritas al evento.
- `participants_count` (`number`) — Alias para integración en frontend.
- `inscribed_count` (`number`) — Alias para compatibilidad.
- `_count.participants` (`number`) — Estructura relacional de Prisma.

**Salida (200):**
```json
{
  "status": "Success",
  "service_events": [
    {
      "id": "bd32480c-3e7e-4e62-8721-9e254933e8f1",
      "enterprise_id": "515a81fe-208c-4e1c-a5a9-1eefa7e91d71",
      "title": "CaceresTall",
      "description": "Jornada de Movilidad Compartida",
      "start_at": "2026-11-12T08:45:57.999Z",
      "end_at": "2026-11-12T12:45:57.999Z",
      "status": "requested",
      "address_line1": "Biblioteca Pública de Cáceres",
      "city": "Cáceres",
      "country": "ES",
      "latitude": 39.4753,
      "longitude": -6.3723,
      "total_participants": 5,
      "participants_count": 5,
      "inscribed_count": 5,
      "_count": {
        "participants": 5
      },
      "created_at": "2026-11-02T08:50:18.400Z"
    }
  ],
  "limit": 50,
  "offset": 0
}
```

---

## 3. Obtener evento por ID

**URL:** `GET /api/enterprise/service-events/:id`

**Autenticación:** Requerida (`isEnterpriseLoged`).

**Descripción:** Devuelve un evento de servicio específico de la empresa autenticada, incluyendo sus métricas y número de usuarios inscritos.

**Parámetros de URL:**
- `id` — UUID o identificador del evento.

**Salida (200):**
```json
{
  "status": "Success",
  "service_event": {
    "id": "bd32480c-3e7e-4e62-8721-9e254933e8f1",
    "enterprise_id": "515a81fe-208c-4e1c-a5a9-1eefa7e91d71",
    "title": "CaceresTall",
    "description": "Jornada de Movilidad Compartida",
    "start_at": "2026-11-12T08:45:57.999Z",
    "end_at": "2026-11-12T12:45:57.999Z",
    "status": "requested",
    "address_line1": "Biblioteca Pública de Cáceres",
    "city": "Cáceres",
    "country": "ES",
    "latitude": 39.4753,
    "longitude": -6.3723,
    "total_participants": 5,
    "participants_count": 5,
    "inscribed_count": 5,
    "_count": {
      "participants": 5
    },
    "created_at": "2026-11-02T08:50:18.400Z"
  }
}
```

**Errores:**
- `400` — ID inválido.
- `404` — Evento no encontrado.

---

## 4. Actualizar evento (PATCH)

**URL:** `PATCH /api/enterprise/service-events/:id`

**Autenticación:** Requerida (`isEnterpriseLoged`).

**Descripción:** Actualiza parcialmente un evento de servicio. No permite modificar `id` ni `enterprise_id`.

**Parámetros de URL:**
- `id` — ID numérico del evento.

**Entrada (body JSON, campos opcionales):**
```json
{
  "title": "string",
  "description": "string",
  "startDate": "ISO datetime",
  "endDate": "ISO datetime",
  "status": "draft | requested | approved | rejected | canceled | completed",
  "location": "string",
  ...
}
```

**Salida (200):**
```json
{
  "status": "Success",
  "message": "Service event updated",
  "service_event": { ... }
}
```

**Errores:**
- `400` — Validación fallida o no hay campos.
- `404` — Evento no encontrado.

---

## 5. Eliminar evento

**URL:** `DELETE /api/enterprise/service-events/:id`

**Autenticación:** Requerida (`isEnterpriseLoged`).

**Descripción:** Elimina un evento de servicio de la empresa autenticada.

**Parámetros de URL:**
- `id` — ID numérico del evento.

**Salida (200):**
```json
{
  "status": "Success",
  "message": "Service event removed"
}
```

**Errores:**
- `400` — ID inválido.
- `404` — Evento no encontrado.

---

## Estados de un evento de servicio

| Estado | Descripción |
|---|---|
| `draft` | Borrador, no enviado |
| `requested` | Solicitado (estado inicial al crear) |
| `approved` | Aprobado |
| `rejected` | Rechazado |
| `canceled` | Cancelado |
| `completed` | Completado |

---

## Indexación Espacial y Búsqueda Pública de Eventos Corporativos

Los eventos de servicio en estado `requested` o `approved` cuentan con indexación espacial automática y se integran de forma transparente en la experiencia de usuario de la plataforma:

1. **Indexación Espacial R-Tree:** El backend sincroniza la coordenada en la columna `location POINT SRID 4326` indexada mediante el índice espacial `idx_service_events_location`.
2. **Visibilidad en Búsqueda Global:**
   - Aparecen en `GET /api/events` (búsqueda multi-campo por título, descripción, recinto, dirección, ciudad y nombre de la empresa).
   - Aparecen ordenados por cercanía geográfica en `GET /api/events/nearby` junto con su cálculo de `distance_km`.
   - Se pueden consultar individualmente mediante `GET /api/events/:id` o `GET /api/events/code/:code` (códigos predictivos con prefijo `ORG-XXXXXXXX`).
3. **Respuesta Polimórfica Normalizada:**
   - El evento se devuelve adaptado con las mismas propiedades que un evento de plataforma estándar (`is_corporate: true`, `unique_code`, `start_date`, `end_date`, `latitude`, `longitude`, y el objeto `company` mapeado desde los datos de la empresa organizadora).
   - Para más detalles, consulta la [Documentación de Eventos](events.md).
