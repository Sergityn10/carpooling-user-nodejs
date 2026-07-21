# Informes CAE - Reportes y Exportación Excel (`/api/cae-reports`)

Gestión de reportes CAE para administradores. Los CAEs (Certificados de Ahorro de Energía) se agrupan en reportes que pueden exportarse a Excel con todos los datos del **Anexo III: Criterios Antifraude**.

El microservicio `carpooling-trayectos` gestiona los CAEs individuales y los reportes. Este microservicio (`carpooling-user`) actúa como proxy, enriqueciendo los datos con información descifrada de usuarios (DNI, teléfono, nombre) desde la base de datos local.

---

## Endpoints

| Método   | URL                           | Descripción                                       |
| -------- | ----------------------------- | ------------------------------------------------- |
| `GET`    | `/api/cae-reports/summary`    | Resumen del estado de CAEs y reportes             |
| `GET`    | `/api/cae-reports`            | Listar reportes CAE (paginado)                    |
| `POST`   | `/api/cae-reports`            | Crear nuevo reporte CAE                           |
| `GET`    | `/api/cae-reports/:id`        | Obtener datos completos de un reporte (Anexo III) |
| `PATCH`  | `/api/cae-reports/:id/status` | Cambiar estado de un reporte                      |
| `DELETE` | `/api/cae-reports/:id`        | Eliminar un reporte                               |
| `GET`    | `/api/cae-reports/:id/export` | Exportar reporte a Excel                          |

**Autenticación:** Todos los endpoints requieren rol admin (`onlyAdmin`).

---

## 1. Resumen de reportes CAE

**URL:** `GET /api/cae-reports/summary`

**Descripción:** Devuelve un resumen del estado de todos los CAEs y reportes.

**Respuesta 200:**

```json
{
  "status": "Success",
  "caes": {
    "pendientes_envio": 15,
    "enviados_sin_aprobar": 8,
    "completados": 30,
    "cancelados": 2
  },
  "kwh_acumulado_pendiente": 12500.5,
  "kwh_umbral_envio": 30000,
  "reportes_creados": 3
}
```

---

## 2. Listar reportes CAE

**URL:** `GET /api/cae-reports`

**Query params:**

| Parámetro | Tipo   | Requerido | Descripción                                      |
| --------- | ------ | --------- | ------------------------------------------------ |
| `status`  | string | No        | Filtrar por estado (`draft`, `sent`, `reviewed`) |
| `page`    | int    | No        | Página (por defecto 1)                           |
| `limit`   | int    | No        | Elementos por página (por defecto 50)            |

**Respuesta 200:**

```json
{
  "status": "Success",
  "items": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Reporte CAE 2026-07",
      "status": "draft",
      "total_kwh": 32000,
      "total_eur": 1280,
      "total_caes": 45,
      "file_url": null,
      "created_at": "2026-07-20T10:00:00.000Z",
      "updated_at": "2026-07-20T10:00:00.000Z"
    }
  ],
  "total": 3,
  "page": 1,
  "limit": 50
}
```

---

## 3. Crear reporte CAE

**URL:** `POST /api/cae-reports`

**Descripción:** Agrupa todos los CAEs en estado `in_review` sin reporte asignado en un nuevo reporte. Calcula los totales de kWh y euros.

**Body (JSON):**

```json
{
  "name": "Reporte CAE Julio 2026"
}
```

| Campo  | Tipo   | Requerido | Descripción                                             |
| ------ | ------ | --------- | ------------------------------------------------------- |
| `name` | string | No        | Nombre del reporte (auto-generado si no se proporciona) |

**Respuesta 201:**

```json
{
  "status": "Success",
  "report": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Reporte CAE Julio 2026",
    "status": "draft",
    "total_kwh": 32000,
    "total_eur": 1280,
    "total_caes": 45,
    "created_at": "2026-07-20T10:00:00.000Z"
  }
}
```

**Errores:**

- `400` — No hay CAEs pendientes de reporte.
- `403` — El usuario no es admin.

---

## 4. Obtener datos completos de un reporte (Anexo III)

**URL:** `GET /api/cae-reports/:id`

**Descripción:** Devuelve todos los datos del reporte y de cada CAE incluido, con la información del Anexo III. Los datos sensibles (DNI, teléfono, nombre) se descifran desde la base de datos local de usuarios.

**Path params:**

| Parámetro | Tipo          | Descripción        |
| --------- | ------------- | ------------------ |
| `id`      | string (UUID) | ID del reporte CAE |

**Respuesta 200:**

```json
{
  "status": "Success",
  "reporte": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Reporte CAE Julio 2026",
    "status": "draft",
    "total_kwh": 32000,
    "total_eur": 1280,
    "total_caes": 45,
    "file_url": null,
    "created_at": "2026-07-20T10:00:00.000Z",
    "updated_at": "2026-07-20T10:00:00.000Z"
  },
  "items": [
    {
      "cae_id": "660e8400-...",
      "trayecto_id": "770e8400-...",
      "estado": "in_review",
      "km_recorridos": 120.5,
      "km_with_company": 118.3,
      "kwh_generated": 82.81,
      "eur_generated": 3.31,
      "viaje": {
        "origen": "Madrid, Centro",
        "destino": "Toledo, Casco",
        "hora_inicio": "2026-07-15T10:00:00.000Z",
        "origen_coords": { "lat": 40.4168, "lng": -3.7038 },
        "destino_coords": { "lat": 39.8628, "lng": -4.0273 },
        "trazado": [
          { "lat": 40.4168, "lng": -3.7038, "address": "Calle Gran Vía 1", "timestamp": "2026-07-15T10:00:00.000Z" }
        ]
      },
      "conductor": {
        "user_id": "a1b2c3d4-...",
        "nombre": "Juan Pérez",
        "email": "juan@example.com",
        "dni": "12345678A",
        "phone": "+34600000000"
      },
      "vehiculo": {
        "id": "v1e2d3c4-...",
        "matricula": "1234ABC",
        "marca": "Toyota",
        "modelo": "Corolla"
      },
      "pasajeros": [
        {
          "user_id": "b2c3d4e5-...",
          "nombre": "Ana García",
          "email": "ana@example.com",
          "dni": "87654321B",
          "phone": "+34611111111",
          "confirmacion_inicio": "2026-07-15T10:03:00.000Z",
          "confirmacion_fin": "2026-07-15T11:30:00.000Z",
          "inicio_lat": 40.4150,
          "inicio_lng": -3.7100,
          "fin_lat": 39.8628,
          "fin_lng": -4.0273
        }
      ],
      "eventos_trayecto": [
        {
          "tipo": "comienzo",
          "user_id": "a1b2c3d4-...",
          "id_reserva": null,
          "lat": 40.4168,
          "lng": -3.7038,
          "timestamp": "2026-07-15T10:00:00.000Z"
        },
        {
          "tipo": "recogida",
          "user_id": "a1b2c3d4-...",
          "id_reserva": "r1e2d3c4-...",
          "lat": 40.4150,
          "lng": -3.7100,
          "timestamp": "2026-07-15T10:03:00.000Z"
        },
        {
          "tipo": "llegada_destino",
          "user_id": "a1b2c3d4-...",
          "id_reserva": "r1e2d3c4-...",
          "lat": 39.8628,
          "lng": -4.0273,
          "timestamp": "2026-07-15T11:30:00.000Z"
        },
        {
          "tipo": "finalizar",
          "user_id": "a1b2c3d4-...",
          "id_reserva": null,
          "lat": 39.8628,
          "lng": -4.0273,
          "timestamp": "2026-07-15T11:35:00.000Z"
        }
      ],
      "verificacion_unico_vehiculo": true
    }
  ]
}
```

**Datos incluidos del Anexo III:**

- ✅ Listado de viajeros (conductor y pasajeros) con DNI/NIE, nombre, teléfono y email
- ✅ Matrícula, marca y modelo del vehículo
- ✅ Geolocalización de inicio, trazado y fin del trayecto
- ✅ Tiempos de inicio y fin
- ✅ Confirmación activa de inicio y fin por cada pasajero (eventos de recogida y llegada_destino)
- ✅ Eventos completos del trayecto (comienzo, recogida, llegada_destino, finalizar) con geolocalización y timestamps
- ✅ Verificación de vehículo único (todos los viajeros en el mismo `vehiculo_id`)

**Errores:**

- `403` — El usuario no es admin.
- `502` — Error al comunicarse con el microservicio de trayectos.

---

## 5. Cambiar estado de un reporte

**URL:** `PATCH /api/cae-reports/:id/status`

**Descripción:** Cambia el estado de un reporte CAE. Los estados válidos son: `draft`, `sent`, `reviewed`.

**Body (JSON):**

```json
{
  "status": "sent"
}
```

| Campo    | Tipo   | Requerido | Descripción                                |
| -------- | ------ | --------- | ------------------------------------------ |
| `status` | string | Sí        | Nuevo estado: `draft`, `sent` o `reviewed` |

**Respuesta 200:**

```json
{
  "status": "Success",
  "report": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Reporte CAE Julio 2026",
    "status": "sent",
    "total_kwh": 32000,
    "total_eur": 1280,
    "total_caes": 45,
    "file_url": null,
    "created_at": "2026-07-20T10:00:00.000Z",
    "updated_at": "2026-07-21T08:00:00.000Z"
  }
}
```

**Errores:**

- `400` — Estado inválido o campo `status` faltante.
- `403` — El usuario no es admin.
- `502` — Error al comunicarse con el microservicio de trayectos.

---

## 6. Eliminar un reporte

**URL:** `DELETE /api/cae-reports/:id`

**Descripción:** Elimina un reporte CAE. Al eliminarlo, los CAEs asociados se desvinculan (`report_id` se establece a `null`), por lo que vuelven a estar disponibles para incluirse en un nuevo reporte. **No se eliminan los CAEs**, solo la relación con el reporte.

**Respuesta 200:**

```json
{
  "status": "Success",
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "deleted": true
}
```

**Errores:**

- `403` — El usuario no es admin.
- `502` — Error al comunicarse con el microservicio de trayectos.

---

## 7. Exportar reporte a Excel

**URL:** `GET /api/cae-reports/:id/export`

**Descripción:** Genera un archivo Excel (`.xlsx`) con todos los datos del reporte, cumpliendo con los criterios antifraude del Anexo III. El Excel contiene 6 hojas:

### Hojas del Excel

| Hoja                     | Descripción                                                                                                                                                                                  |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Resumen**              | Métricas del reporte: nombre, estado, total CAEs, total kWh, total EUR, y detalle por cada CAE.                                                                                              |
| **Viajes**               | Un registro por CAE con datos del trayecto, conductor (nombre, DNI/NIE, teléfono, email), vehículo (ID, matrícula, marca, modelo), métricas (KM, kWh, EUR) y verificación de vehículo único. |
| **Viajeros**             | Un registro por viajero (conductor + pasajeros) por viaje, con DNI/NIE, nombre, teléfono, email, matrícula, confirmaciones de inicio/fin y coordenadas de recogida/llegada.                  |
| **Trazado**              | Puntos de geolocalización GPS registrados durante cada viaje (latitud, longitud, dirección, timestamp).                                                                                      |
| **Eventos**              | Eventos del trayecto (comienzo, recogida, llegada_destino, finalizar) con usuario, reserva, coordenadas y timestamp.                                                                         |
| **Criterios Antifraude** | Checklist de los 7 criterios del Anexo III con columnas de estado y observaciones para cumplimentar manualmente.                                                                             |

**Respuesta 200:** Archivo binario `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` con el nombre del reporte como filename.

**Errores:**

- `403` — El usuario no es admin.
- `404` — El reporte no tiene CAEs.
- `502` — Error al comunicarse con el microservicio de trayectos.

---

## Criterios Antifraude (Anexo III)

El Excel incluye una hoja con los siguientes criterios para revisión manual:

1. **Listado de viajeros** (conductor y pasajeros) con identificación (DNI/NIE, nombre completo y teléfono) y matrícula del coche.
2. **Identificación asociada de cada viaje:** comprobación mediante geolocalización de la ubicación y tiempos de inicio, trazado y fin del trayecto.
3. **Confirmación activa** por parte de cada viajero del inicio y fin del trayecto acordado.
4. **Verificación** de que el trayecto compartido se realiza en coche y no en otro medio de transporte.
5. **Verificación** de que el trayecto se ha realizado en un vehículo únicamente y que todos los viajeros van en dicho vehículo.
6. **DNI/NIE asociado** a cada cuenta de usuario.
7. **No duplicación:** los viajes realizados en la plataforma no pueden registrarse de nuevo en esa ni en otra plataforma similar.

---

## Notas técnicas

- **Descifrado:** Los campos sensibles (`name`, `phone`, `dni`) se descifran desde la base de datos local antes de incluirlos en la respuesta JSON o el Excel.
- **Arquitectura:** El microservicio `carpooling-trayectos` proporciona los datos del reporte (viajes, trazado, pasajeros, vehículo, verificaciones). Este microservicio los enriquece con datos descifrados de usuarios.
- **Token de admin:** Se reenvía el token JWT del admin al microservicio de trayectos para autenticar las llamadas.
- **Nombre del archivo Excel:** Se genera a partir del nombre del reporte, sanitizando caracteres especiales.
