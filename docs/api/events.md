# Eventos y Etiquetas (`/api/events`, `/api/tags`, `/api/enterprise/events`)

Endpoints para gestión de eventos de plataforma, eventos de servicio de empresas, búsqueda espacial con R-Tree, etiquetas (tags) y participación de usuarios. Las operaciones de creación, actualización y eliminación están habilitadas tanto para el **Super Administrador** como para las **Organizaciones/Empresas** autenticadas (`isEnterpriseOrAdmin`). La lectura y búsqueda de eventos es accesible de forma pública y unificada.

---

## Modelos de datos

### PlatformEvent
| Campo         | Tipo          | Descripción                                          |
| ------------- | ------------- | ---------------------------------------------------- |
| `id`          | UUID          | Identificador único                                  |
| `name`        | String        | Nombre del evento                                    |
| `company_id`  | UUID (FK)?    | Empresa tradicional asociada al evento               |
| `enterprise_id`| UUID (FK)?   | Organización/Empresa propietaria del evento          |
| `latitude`    | Decimal(10,7) | Latitud de la ubicación                              |
| `longitude`   | Decimal(10,7) | Longitud de la ubicación                             |
| `location`    | Point (4326)  | Geometría espacial indexada con R-Tree (MySQL 8)     |
| `image`       | MediumText    | Imagen del evento (base64 o URL)                     |
| `unique_code` | String(20)    | Código único para unirse al evento (auto-generado)   |
| `description` | Text          | Descripción general del evento                       |
| `url`         | String(500)   | URL del evento                                       |
| `ticket_url`  | String(500)   | URL para comprar entradas                            |
| `start_date`  | DateTime      | Fecha de inicio del evento                           |
| `end_date`    | DateTime      | Fecha de finalización del evento                     |
| `chat_id`     | Int?          | ID del chat grupal asociado (microservicio mensajes) |
| `created_at`  | DateTime      | Fecha de creación                                    |
| `updated_at`  | DateTime      | Fecha de actualización                               |

### Tag
| Campo         | Tipo        | Descripción                 |
| ------------- | ----------- | --------------------------- |
| `id`          | Int (auto)  | Identificador único         |
| `name`        | String(50)  | Nombre único de la etiqueta |
| `description` | String(255) | Descripción de la etiqueta  |
| `created_at`  | DateTime    | Fecha de creación           |

### EventParticipant
| Campo       | Tipo      | Descripción                         |
| ----------- | --------- | ----------------------------------- |
| `user_id`   | UUID (FK) | ID del usuario que se une al evento |
| `event_id`  | UUID (FK) | ID del evento de plataforma         |
| `joined_at` | DateTime  | Fecha en la que el usuario se unió  |

> **Clave primaria compuesta:** `(user_id, event_id)` — un usuario no puede unirse dos veces al mismo evento.

### ServiceEventParticipant
| Campo              | Tipo      | Descripción                                |
| ------------------ | --------- | ------------------------------------------ |
| `user_id`          | UUID (FK) | ID del usuario que se une al evento        |
| `service_event_id` | UUID (FK) | ID del evento corporativo de servicio      |
| `joined_at`        | DateTime  | Fecha en la que el usuario se unió         |

> **Clave primaria compuesta:** `(user_id, service_event_id)` — permite a cualquier usuario registrado unirse a eventos corporativos sin restricción.

### Company
| Campo         | Tipo        | Descripción            |
| ------------- | ----------- | ---------------------- |
| `id`          | UUID        | Identificador único    |
| `name`        | String(255) | Nombre de la empresa   |
| `email`       | String(255) | Email único            |
| `phone`       | String(30)  | Teléfono               |
| `website`     | String(255) | Sitio web              |
| `logo`        | MediumText  | Logo de la empresa     |
| `description` | Text        | Descripción            |
| `created_at`  | DateTime    | Fecha de creación      |
| `updated_at`  | DateTime    | Fecha de actualización |

---

## Eventos

### 1. Listar y Buscar Eventos (Unificado: Plataforma + Empresas)

**URL:** `GET /api/events`

**Autenticación:** No requerida.

**Descripción:** Devuelve la lista unificada y paginada de todos los eventos futuros activos. Combina de forma transparente los eventos de plataforma (`platform_events`) y los eventos de servicio creados por organizaciones (`service_events`), normalizándolos con la misma estructura para que el frontend no requiera bifurcación de lógica.

**Búsqueda Multi-Campo (`search`):**
Cuando se proporciona el parámetro `search`, se realiza una búsqueda insensible a mayúsculas sobre:
- Nombre o título del evento
- Descripción
- Recinto o lugar de celebración (`venue_name`)
- Dirección física (`address_line1`)
- Ciudad (`city`)
- Nombre de la empresa u organización organizadora

**Query params (opcionales):**
- `search` — Término de búsqueda multi-campo.
- `tag` — Filtrar por nombre de etiqueta (ej: `musica`, `tecnologia`, `corporativo`).
- `page` — Número de página (default: 1).
- `limit` — Resultados por página (default: 20, máx: 100).

**Salida (200 OK):**
```json
{
  "status": "Success",
  "events": [
    {
      "id": "uuid-evento-1",
      "name": "Hackathon YouConnext 2026",
      "company_id": "uuid-empresa",
      "enterprise_id": null,
      "latitude": 40.416775,
      "longitude": -3.703790,
      "image": "https://youconnext.es/images/hackathon.jpg",
      "unique_code": "A1B2C3D4E5F6",
      "description": "Hackathon de movilidad compartida",
      "url": "https://evento.com",
      "ticket_url": "https://evento.com/entradas",
      "start_date": "2026-11-15T09:00:00.000Z",
      "end_date": "2026-11-15T20:00:00.000Z",
      "is_corporate": false,
      "company": {
        "id": "uuid-empresa",
        "name": "YouConnext",
        "logo": null,
        "website": "https://youconnext.es"
      },
      "tags": [
        { "tag": { "id": 1, "name": "tecnologia", "description": "Eventos tech" } }
      ]
    },
    {
      "id": "se-uuid-5555",
      "name": "Jornada de Sostenibilidad Corporativa",
      "company_id": null,
      "enterprise_id": "ent-uuid-999",
      "latitude": 40.418000,
      "longitude": -3.702000,
      "image": null,
      "unique_code": "ORG-SE5555",
      "description": "Jornada anual de movilidad baja en carbono para empleados y colaboradores",
      "url": null,
      "ticket_url": null,
      "start_date": "2026-11-20T10:00:00.000Z",
      "end_date": "2026-11-20T18:00:00.000Z",
      "is_corporate": true,
      "company": {
        "id": "ent-uuid-999",
        "name": "Iberdrola S.A.",
        "logo": "https://youconnext.es/logos/iberdrola.png",
        "website": "https://www.iberdrola.com"
      },
      "tags": [
        { "tag": { "id": 999, "name": "corporativo", "description": "Evento corporativo empresarial" } }
      ]
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 2,
    "totalPages": 1
  }
}
```
    "total": 50,
    "totalPages": 3
  }
}
```

---

### 2. Obtener Detalles de Evento (Polimórfico y Desacoplado)

**URLs:**
- `GET /api/events/:id`
- `GET /api/events/:id/details` (Alias explícito para vista de detalle)

**Autenticación:** Opcional (`authorization.tryAuthenticate`). Si se proporciona token o cookie de sesión, identifica si el usuario es participante (`has_joined`) o si es el organizador/administrador (`is_organizer`).

**Descripción:** Endpoint central para la pantalla de detalle de evento. Recupera las propiedades del evento (con soporte polimórfico en `platform_events` y fallback a `service_events`), la lista de participantes unidos (`participants`) con nombres descifrados mediante AES-256, y métricas para la organización.

> **Arquitectura Desacoplada:** Para evitar latencias y acoplamiento innecesario entre microservicios, la consulta de rutas y trayectos de carpooling asociados la realiza el frontend de forma independiente mediante `GET /api/trayecto/evento/:id` en el microservicio de viajes (`Carpooling-trayectos-express`).

**Control de Privacidad de Participantes:**
- **Público / Usuarios generales:** Se devuelven únicamente datos públicos del perfil (`id`, `name`, `surname`, `img_perfil`, `ciudad`, `provincia`, `joined_at`).
- **Organización Propietaria o Admin (`is_organizer: true`):** Se incluyen adicionalmente los datos de contacto corporativo (`email`, `phone`).

**Parámetros de URL:**
- `id` — UUID del evento (de plataforma o de servicio corporativo).

**Salida (200 OK) — evento encontrado:**
```json
{
  "status": "Success",
  "event": {
    "id": "uuid-evento",
    "name": "Hackathon YouConnext 2026",
    "title": "Hackathon YouConnext 2026",
    "company_id": "uuid-empresa",
    "enterprise_id": "uuid-organizacion",
    "latitude": 40.416775,
    "longitude": -3.703790,
    "image": "https://youconnext.es/images/hackathon.jpg",
    "unique_code": "A1B2C3D4E5F6",
    "description": "Descripción detallada del evento",
    "url": "https://evento.com",
    "ticket_url": "https://evento.com/entradas",
    "start_date": "2026-11-15T09:00:00.000Z",
    "end_date": "2026-11-15T20:00:00.000Z",
    "chat_id": 42,
    "is_corporate": false,
    "event_type": "platform_event",
    "has_joined": true,
    "is_organizer": false,
    "total_participants": 2,
    "company": {
      "id": "uuid-empresa",
      "name": "YouConnext",
      "logo": null,
      "website": "https://youconnext.es"
    },
    "enterprise": {
      "id": "uuid-organizacion",
      "name": "YouConnext Mobility S.L.",
      "logo": "https://youconnext.es/logo.png"
    },
    "tags": [
      { "tag": { "id": 1, "name": "tecnologia", "description": "..." } }
    ],
    "participants": [
      {
        "id": "uuid-usuario-1",
        "name": "Sergio",
        "surname": "Martín",
        "img_perfil": "https://avatar.example.com/sergio.jpg",
        "ciudad": "Madrid",
        "provincia": "Madrid",
        "joined_at": "2026-11-01T10:00:00.000Z"
      }
    ]
  },
  "participants": [
    {
      "id": "uuid-usuario-1",
      "name": "Sergio",
      "surname": "Martín",
      "img_perfil": "https://avatar.example.com/sergio.jpg",
      "ciudad": "Madrid",
      "provincia": "Madrid",
      "joined_at": "2026-11-01T10:00:00.000Z"
    }
  ],
  "total_participants": 2,
  "has_joined": true,
  "is_organizer": false
}
```

**Salida (404 Not Found) — evento no encontrado:**
```json
{
  "status": "fail",
  "message": "Event not found",
  "errorCode": "EVENT_NOT_FOUND"
}
```

---

### 3. Obtener Eventos Cercanos (Búsqueda Espacial R-Tree en 2 Fases)

**URL:** `GET /api/events/nearby`

**Autenticación:** No requerida.

**Descripción:** Búsqueda geoespacial de alto rendimiento que combina eventos de plataforma y eventos corporativos de servicio. Implementa una estrategia en **dos fases**:
1. **Filtro espacial R-Tree (`MBRWithin`):** Utiliza los índices espaciales R-Tree (`idx_platform_events_location` y `idx_service_events_location`) con un *Bounding Box* en coordenadas WGS84 (SRID 4326), reduciendo drásticamente las filas escaneadas en MySQL 8.
2. **Cálculo esférico exacto (`ST_Distance_Sphere`):** Filtra y calcula la distancia precisa en kilómetros a la posición del usuario (`distance_km`).

Soporta simultáneamente filtrado por texto libre (`search`), filtrado por etiqueta (`tag`) y paginación.

**Query params:**
- `lat` — Latitud del usuario (número entre -90 y 90, **requerido**).
- `lng` — Longitud del usuario (número entre -180 y 180, **requerido**).
- `radius` — Radio de búsqueda en kilómetros (default: 50, máx recomendado: 500).
- `search` — Filtro opcional multi-campo (título, descripción, ciudad, empresa).
- `tag` — Filtrar por nombre de etiqueta (opcional).
- `page` — Número de página (default: 1).
- `limit` — Resultados por página (default: 20, máx: 100).

**Ejemplo de Petición:**
```
GET /api/events/nearby?lat=40.416775&lng=-3.703790&radius=30&search=sostenibilidad&page=1&limit=10
```

**Salida (200 OK):**
```json
{
  "status": "Success",
  "events": [
    {
      "id": "se-uuid-5555",
      "name": "Jornada de Sostenibilidad Corporativa",
      "latitude": 40.418000,
      "longitude": -3.702000,
      "unique_code": "ORG-SE5555",
      "distance_km": 0.21,
      "is_corporate": true,
      "company": {
        "id": "ent-uuid-999",
        "name": "Iberdrola S.A.",
        "logo": "https://youconnext.es/logos/iberdrola.png",
        "website": "https://www.iberdrola.com"
      },
      "tags": [
        { "tag": { "id": 999, "name": "corporativo", "description": "Evento corporativo empresarial" } }
      ]
    },
    {
      "id": "uuid-evento-1",
      "name": "Hackathon YouConnext 2026",
      "latitude": 40.416775,
      "longitude": -3.703790,
      "unique_code": "A1B2C3D4E5F6",
      "distance_km": 0.51,
      "is_corporate": false,
      "company": {
        "id": "uuid-empresa",
        "name": "YouConnext",
        "logo": null,
        "website": "https://youconnext.es"
      },
      "tags": [
        { "tag": { "id": 1, "name": "tecnologia", "description": "..." } }
      ]
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 2,
    "totalPages": 1,
    "radius_km": 30
  }
}
```

**Errores:**
- `400 Bad Request` — Faltan coordenadas obligatorias (`lat` o `lng`) o los valores numéricos están fuera del rango geográfico válido (-90 a 90 para latitud, -180 a 180 para longitud).

---

### 4. Obtener Evento por Código Único (con Soporte para Organizaciones)

**URL:** `GET /api/events/code/:code`

**Autenticación:** Requerida (`isLoged`).

**Descripción:** Permite a los usuarios buscar un evento para unirse mediante un código alfanumérico. Admite:
1. Códigos estándar de 12 caracteres (ej: `A1B2C3D4E5F6`).
2. Códigos corporativos con prefijo (ej: `ORG-1A2B3C4D` o los primeros caracteres del UUID del evento de servicio).

Si no se encuentra en `platform_events`, se resuelve automáticamente sobre `service_events`.

**Parámetros de URL:**
- `code` — Código único o código corporativo del evento.

**Salida (200 OK):**
```json
{
  "status": "Success",
  "event": {
    "id": "se-uuid-5555",
    "name": "Jornada de Sostenibilidad Corporativa",
    "unique_code": "ORG-SE5555",
    "is_corporate": true,
    "company": {
      "id": "ent-uuid-999",
      "name": "Iberdrola S.A.",
      "logo": "https://youconnext.es/logos/iberdrola.png",
      "website": "https://www.iberdrola.com"
    },
    "tags": [
      { "tag": { "id": 999, "name": "corporativo", "description": "..." } }
    ]
  }
}
```

**Errores:**
- `404 Not Found` — Evento no encontrado.

---

### 5. Crear Evento (Admin o Empresa)

**URL:** `POST /api/events`

**Autenticación:** Requerida (`enterpriseAuthorization.isEnterpriseOrAdmin`). Puede ser ejecutado por el Super Administrador o por una **Empresa/Organización** autenticada.

**Descripción:** Crea un nuevo evento en la plataforma.
- **Si es creado por una Empresa:** No necesita proporcionar `company_id`; el backend asigna automáticamente el `enterprise_id` a partir de la sesión corporativa y sincroniza la columna espacial `location POINT SRID 4326`.
- **Si es creado por un Super Administrador:** Puede especificar `company_id` o `enterprise_id`.
- Se genera automáticamente el `unique_code` alfanumérico y, si el microservicio de mensajería está disponible, se crea la sala de chat grupal del evento (`chat_id`).

**Entrada (body JSON):**
```json
{
  "name": "Feria de Movilidad Urbana 2026",
  "description": "Encuentro de empresas comprometidas con la descarbonización",
  "start_date": "2026-12-01T09:00:00.000Z",
  "end_date": "2026-12-01T18:00:00.000Z",
  "latitude": 40.416775,
  "longitude": -3.703790,
  "address": "Paseo de la Castellana 100, Madrid",
  "image": "https://youconnext.es/images/feria.jpg",
  "url": "https://feria.youconnext.es",
  "ticket_url": "https://feria.youconnext.es/entradas",
  "tags": [1, 2]
}
```

**Salida (201 Created):**
```json
{
  "status": "Success",
  "message": "Event created successfully",
  "event": {
    "id": "uuid-nuevo-evento",
    "name": "Feria de Movilidad Urbana 2026",
    "enterprise_id": "ent-uuid-999",
    "unique_code": "E8F1A2C3D4B5",
    "chat_id": 42,
    "start_date": "2026-12-01T09:00:00.000Z",
    "end_date": "2026-12-01T18:00:00.000Z",
    "latitude": 40.416775,
    "longitude": -3.703790,
    "enterprise": {
      "id": "ent-uuid-999",
      "name": "Iberdrola S.A.",
      "logo": "https://youconnext.es/logos/iberdrola.png"
    },
    "tags": [
      { "tag": { "id": 1, "name": "tecnologia" } }
    ]
  }
}
```

**Errores:**
- `400 Bad Request` — Faltan campos obligatorios (`name`, `start_date`, `end_date`) o no se identifica la empresa/organización creadora.
- `403 Forbidden` — El usuario no tiene rol admin ni es una empresa autenticada.

---

### 6. Actualizar Evento

**URL:** `PATCH /api/events/:id`

**Autenticación:** Requerida (`enterpriseAuthorization.isEnterpriseOrAdmin`).

**Permisos:** Puede ser modificado por un Super Administrador o por la **Empresa propietaria** del evento (`existing.enterprise_id === req.enterprise.id`).

**Parámetros de URL:**
- `id` — UUID del evento.

**Entrada (body JSON, todos opcionales):**
```json
{
  "name": "Nuevo nombre del evento",
  "latitude": 40.4200,
  "longitude": -3.7050,
  "start_date": "2026-12-02T10:00:00.000Z",
  "end_date": "2026-12-02T19:00:00.000Z",
  "tags": [1, 3]
}
```

**Salida (200 OK):**
```json
{
  "status": "Success",
  "message": "Event updated successfully",
  "event": { ... }
}
```

**Errores:**
- `403 Forbidden` — El usuario o empresa no es el propietario del evento ni es admin.
- `404 Not Found` — Evento no encontrado.

---

### 7. Eliminar Evento

**URL:** `DELETE /api/events/:id`

**Autenticación:** Requerida (`enterpriseAuthorization.isEnterpriseOrAdmin`).

**Permisos:** Permitido para Super Administrador o la **Empresa propietaria** del evento.

**Salida (200 OK):**
```json
{
  "status": "Success",
  "message": "Event deleted successfully"
}
```

---

### 8. Mis Eventos de Organización (Empresa en Sesión)

**URL:** `GET /api/enterprise/events`

**Autenticación:** Requerida (`enterpriseAuthorization.isEnterpriseLoged`).

**Descripción:** Devuelve la lista paginada de todos los eventos creados por la empresa en sesión, incluyendo el número exacto de personas inscritas (`total_participants`, `participants_count`, `_count.participants`).

**Query params:**
- `page` — Número de página (default: 1).
- `limit` — Resultados por página (default: 20, máx: 100).

**Propiedades de Conteo de Inscritos:**
- `total_participants` (`number`) — Conteo total de usuarios apuntados.
- `participants_count` (`number`) — Alias para integración directa en frontend.
- `inscribed_count` (`number`) — Alias de compatibilidad.
- `_count.participants` (`number`) — Conteo nativo de Prisma.

**Salida (200 OK):**
```json
{
  "status": "Success",
  "events": [
    {
      "id": "uuid-evento-1",
      "name": "Feria de Movilidad Urbana 2026",
      "unique_code": "E8F1A2C3D4B5",
      "start_date": "2026-12-01T09:00:00.000Z",
      "end_date": "2026-12-01T18:00:00.000Z",
      "latitude": 40.416775,
      "longitude": -3.703790,
      "total_participants": 34,
      "participants_count": 34,
      "inscribed_count": 34,
      "_count": {
        "participants": 34
      },
      "tags": [
        { "tag": { "id": 1, "name": "tecnologia" } }
      ]
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

---

## Participación en eventos

### 8. Unirse a un evento

**URL:** `POST /api/events/:id/join`

**Autenticación:** Requerida (`isLoged`).

**Parámetros de URL:**
- `id` — UUID del evento (`PlatformEvent` o `ServiceEvent`).

**Descripción:** Cualquier usuario autenticado (`User`) puede unirse libremente a un evento creado en la plataforma o por una organización, sin requerir ser empleado ni pertenecer a dicha empresa.
- Si el evento es de plataforma (`platform_events`), se registra en `event_participants`.
- Si el evento es corporativo de servicio (`service_events`), se registra en `service_event_participants`.
- Si el evento tiene un chat asociado (`chat_id`), el usuario se añade automáticamente como participante del chat grupal en el microservicio de mensajes.
- Previene inscripciones duplicadas mediante clave primaria compuesta `(user_id, event_id)` retornando 409.

**Salida (201):**
```json
{
  "status": "Success",
  "message": "Joined event successfully"
}
```

**Errores:**
- `404` — Evento no encontrado.
- `409` — El usuario ya se había unido a este evento (`ALREADY_JOINED_EVENT`).

---

### 9. Salirse de un evento

**URL:** `DELETE /api/events/:id/join`

**Autenticación:** Requerida (`isLoged`).

**Parámetros de URL:**
- `id` — UUID del evento (`PlatformEvent` o `ServiceEvent`).

**Descripción:** El usuario autenticado abandona un evento al que estaba inscrito previamente (de plataforma o corporativo). Si el evento tiene un chat asociado (`chat_id`), el usuario se elimina del chat grupal en el microservicio de mensajes.

**Salida (200):**
```json
{
  "status": "Success",
  "message": "Left event successfully"
}
```

**Errores:**
- `404` — El usuario no estaba apuntado a este evento (`NOT_JOINED_EVENT`).

---

### 10. Listar participantes de un evento (público)

**URL:** `GET /api/events/:id/participants`

**Autenticación:** No requerida.

**Parámetros de URL:**
- `id` — UUID del evento.

**Descripción:** Devuelve la lista de usuarios apuntados a un evento, ordenados por fecha de unión (más recientes primero). Solo incluye información pública: `id`, `name`, `img_perfil` y `joined_at`.

**Salida (200):**
```json
{
  "status": "Success",
  "participants": [
    {
      "id": "uuid",
      "name": "Nombre del usuario",
      "img_perfil": "base64... o null",
      "joined_at": "2025-07-15T10:30:00.000Z"
    }
  ]
}
```

**Errores:**
- `404` — Evento no encontrado.

---

### 10b. Listar participantes de un evento (detallado)

**URL:** `GET /api/events/:id/participants/details`

**Autenticación:** Requerida (`isLoged`).

**Parámetros de URL:**
- `id` — UUID del evento.

**Descripción:** Igual que el endpoint público, pero añade `ciudad` y `provincia` de cada usuario (pueden ser `null` si no las ha informado).

**Salida (200):**
```json
{
  "status": "Success",
  "participants": [
    {
      "id": "uuid",
      "name": "Nombre del usuario",
      "img_perfil": "base64... o null",
      "ciudad": "Madrid o null",
      "provincia": "Madrid o null",
      "joined_at": "2025-07-15T10:30:00.000Z"
    }
  ]
}
```

**Errores:**
- `401` — No autenticado.
- `404` — Evento no encontrado.

---

### 11. Listar próximos eventos del usuario

**URL:** `GET /api/events/me/joined`

**Autenticación:** Requerida (`isLoged`).

**Descripción:** Devuelve los próximos eventos a los que el usuario autenticado se ha unido (excluye eventos ya finalizados, `end_date >= ahora`), unificando de forma transparente tanto eventos de plataforma como eventos corporativos de servicio (`service_events`), ordenados por fecha de inicio ascendente (los más cercanos primero). Incluye la información completa del evento normalizada junto con `joined_at`.

**Salida (200):**
```json
{
  "status": "Success",
  "events": [
    {
      "id": "uuid",
      "name": "Hackathon YouConnext 2025",
      "company_id": "uuid",
      "latitude": 40.416775,
      "longitude": -3.703790,
      "image": "base64...",
      "unique_code": "A1B2C3D4E5F6",
      "description": "Descripción del evento",
      "url": "https://evento.com",
      "ticket_url": "https://evento.com/entradas",
      "start_date": "2025-09-01T09:00:00Z",
      "end_date": "2025-09-01T18:00:00Z",
      "created_at": "2025-07-03T10:00:00Z",
      "updated_at": "2025-07-03T10:00:00Z",
      "joined_at": "2025-07-15T10:30:00.000Z",
      "company": { "id": "uuid", "name": "YouConnext", "logo": null },
      "tags": [
        { "tag": { "id": 1, "name": "programacion", "description": "..." } }
      ]
    }
  ]
}
```

---

## Etiquetas (Tags)

### 12. Listar etiquetas

**URL:** `GET /api/tags`

**Autenticación:** Requerida (`isLoged`).

**Query params:**

| Parámetro | Tipo   | Requerido | Descripción                                    |
| --------- | ------ | --------- | ---------------------------------------------- |
| `search`  | string | No        | Filtra etiquetas por nombre (búsqueda parcial) |

**Descripción:** Devuelve todas las etiquetas ordenadas alfabéticamente. Si se proporciona `search`, filtra por nombre (coincidencia parcial, case-insensitive).

**Salida (200):**
```json
{
  "status": "Success",
  "tags": [
    { "id": 1, "name": "programacion", "description": "Eventos de programación y desarrollo de software", "created_at": "..." },
    { "id": 2, "name": "tecnologia", "description": "Eventos tecnológicos generales", "created_at": "..." }
  ]
}
```

---

### 13. Crear etiqueta

**URL:** `POST /api/tags`

**Autenticación:** Requerida (`onlyAdmin`).

**Entrada (body JSON):**
```json
{
  "name": "nueva-etiqueta",
  "description": "Descripción de la etiqueta"
}
```

**Salida (201):**
```json
{
  "status": "Success",
  "message": "Tag created successfully",
  "tag": { "id": 16, "name": "nueva-etiqueta", "description": "..." }
}
```

**Errores:**
- `400` — Falta `name`.
- `409` — La etiqueta ya existe.
- `403` — No es admin.

---

### 14. Eliminar etiqueta

**URL:** `DELETE /api/tags/:id`

**Autenticación:** Requerida (`onlyAdmin`).

**Parámetros de URL:**
- `id` — ID numérico de la etiqueta.

**Salida (200):**
```json
{
  "status": "Success",
  "message": "Tag deleted successfully"
}
```

**Errores:**
- `404` — Etiqueta no encontrada.
- `403` — No es admin.

> **Nota:** Al eliminar una etiqueta, se eliminan en cascada todas sus relaciones con eventos (`event_tags`).

---

## Etiquetas por defecto (seed)

El seed crea automáticamente las siguientes etiquetas:

| ID  | Name                      | Descripción                                      |
| --- | ------------------------- | ------------------------------------------------ |
| 1   | `programacion`            | Eventos de programación y desarrollo de software |
| 2   | `tecnologia`              | Eventos tecnológicos generales                   |
| 3   | `inteligencia-artificial` | IA, machine learning y deep learning             |
| 4   | `ciberseguridad`          | Seguridad informática y ciberdefensa             |
| 5   | `diseño`                  | Diseño UX/UI, gráfico y producto                 |
| 6   | `marketing`               | Marketing digital y crecimiento                  |
| 7   | `networking`              | Eventos de networking profesional                |
| 8   | `startups`                | Emprendimiento y ecosistema startup              |
| 9   | `blockchain`              | Blockchain, crypto y Web3                        |
| 10  | `cloud-computing`         | Cloud, DevOps e infraestructura                  |
| 11  | `data-science`            | Ciencia de datos y analítica                     |
| 12  | `videojuegos`             | Game development y industria gamer               |
| 13  | `movilidad`               | Movilidad sostenible y transporte                |
| 14  | `sostenibilidad`          | Sostenibilidad y medio ambiente                  |
| 15  | `educacion`               | Educación tecnológica y formación                |

---

## Notas generales

- **Permisos:** Los endpoints de listado y búsqueda de eventos (`GET /api/events` y `GET /api/events/nearby`) son públicos. El resto de operaciones de lectura (`GET`) requieren autenticación (`isLoged`). Las operaciones de escritura (`POST`, `PATCH`, `DELETE`) requieren rol admin (`onlyAdmin`).
- **Código único:** Se genera automáticamente al crear un evento usando `crypto.randomBytes` (12 caracteres hexadecimales en mayúsculas).
- **Paginación:** Los endpoints de listado soportan paginación con `page` y `limit`.
- **Filtrado:** Se puede filtrar por nombre (`search`) y por etiqueta (`tag`) en `GET /api/events`.
- **Relaciones:** Al eliminar un evento o etiqueta, las relaciones en `event_tags` y `event_participants` se eliminan en cascada.
- **Participación:** Cualquier usuario autenticado puede unirse o salirse de un evento mediante `POST /api/events/:id/join` y `DELETE /api/events/:id/join`. Un usuario no puede unirse dos veces al mismo evento (clave primaria compuesta).
- **Orden de rutas:** `/api/events/nearby` y `/api/events/code/:code` están registradas antes de `/api/events/:id` para evitar conflictos de routing en Express.
- **Imagen en base64:** El campo `image` de `PlatformEvent` es de tipo `MediumText` y almacena la imagen codificada en base64 (igual que `img_perfil` en usuarios y `logo` en empresas).
- **Evento no encontrado:** `GET /api/events/:id` devuelve `200` con `event: null` en lugar de un error `404` cuando el evento no existe.
