# Sugerencias de Empresas Promotoras (`/api/suggestions`)

Endpoints para gestionar sugerencias de empresas promotoras de eventos. Los usuarios pueden sugerir nuevas empresas cuando no encuentran la entidad promotora al crear un evento. Los administradores pueden revisar, aceptar (lo que crea una empresa) o rechazar las sugerencias.

---

## Modelo de datos

### SugerenciasPromotoras
| Campo          | Tipo        | Descripción                                              |
| -------------- | ----------- | -------------------------------------------------------- |
| `id`           | UUID        | Identificador único                                      |
| `name`         | String(255) | Nombre de la empresa sugerida                            |
| `email`        | String(255) | Email único de la empresa sugerida                       |
| `website`      | String(255) | Sitio web (opcional)                                     |
| `suggested_by` | UUID (FK)   | ID del usuario que hizo la sugerencia                    |
| `status`       | String(20)  | Estado: `pending` (pendiente) o `accepted` (aceptada)   |
| `created_at`   | DateTime    | Fecha de creación                                        |
| `updated_at`   | DateTime    | Fecha de actualización                                   |

> **Relaciones:** Cada sugerencia pertenece a un usuario (`suggested_by` → `User.id`). Al aceptarse, se crea una entidad `Company` con los datos de la sugerencia.

---

## Endpoints

### 1. Listar sugerencias

**URL:** `GET /api/suggestions`

**Autenticación:** Requerida (`onlyAdmin`).

**Query params (opcionales):**
- `status` — Filtrar por estado (`pending` o `accepted`).
- `page` — Número de página (default: 1).
- `limit` — Resultados por página (default: 20, máx: 100).

**Ejemplo:**
```
GET /api/suggestions?status=pending&page=1&limit=10
```

**Salida (200):**
```json
{
  "status": "Success",
  "suggestions": [
    {
      "id": "uuid",
      "name": "TechEvents S.L.",
      "email": "contact@techevents.com",
      "website": "https://techevents.com",
      "suggested_by": "uuid-usuario",
      "status": "pending",
      "created_at": "2025-07-16T09:00:00.000Z",
      "updated_at": "2025-07-16T09:00:00.000Z",
      "user": {
        "id": "uuid-usuario",
        "name": "Juan",
        "img_perfil": "base64... o null"
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 25,
    "totalPages": 3
  }
}
```

**Errores:**
- `500` — Error al obtener sugerencias.

---

### 2. Obtener sugerencia por ID

**URL:** `GET /api/suggestions/:id`

**Autenticación:** Requerida (`onlyAdmin`).

**Parámetros de URL:**
- `id` — UUID de la sugerencia.

**Salida (200):**
```json
{
  "status": "Success",
  "suggestion": {
    "id": "uuid",
    "name": "TechEvents S.L.",
    "email": "contact@techevents.com",
    "website": "https://techevents.com",
    "suggested_by": "uuid-usuario",
    "status": "pending",
    "created_at": "2025-07-16T09:00:00.000Z",
    "updated_at": "2025-07-16T09:00:00.000Z",
    "user": {
      "id": "uuid-usuario",
      "name": "Juan",
      "img_perfil": "base64... o null"
    }
  }
}
```

**Errores:**
- `404` — Sugerencia no encontrada.

---

### 3. Crear sugerencia

**URL:** `POST /api/suggestions`

**Autenticación:** Requerida (`isLoged`).

**Descripción:** Cualquier usuario autenticado puede sugerir una empresa promotora. El campo `suggested_by` se asigna automáticamente desde el JWT del usuario. El estado inicial es siempre `pending`.

**Entrada (body JSON):**
```json
{
  "name": "TechEvents S.L.",
  "email": "contact@techevents.com",
  "website": "https://techevents.com"
}
```

**Campos requeridos:** `name`, `email`.
**Campos opcionales:** `website`.

**Salida (201):**
```json
{
  "status": "Success",
  "message": "Suggestion created successfully",
  "suggestion": {
    "id": "uuid",
    "name": "TechEvents S.L.",
    "email": "contact@techevents.com",
    "website": "https://techevents.com",
    "suggested_by": "uuid-usuario",
    "status": "pending",
    "created_at": "2025-07-16T09:00:00.000Z",
    "updated_at": "2025-07-16T09:00:00.000Z"
  }
}
```

**Errores:**
- `400` — Faltan `name` o `email`.
- `401` — No autenticado.
- `409` — Ya existe una sugerencia con ese email.

---

### 4. Actualizar sugerencia

**URL:** `PATCH /api/suggestions/:id`

**Autenticación:** Requerida (`onlyAdmin`).

**Parámetros de URL:**
- `id` — UUID de la sugerencia.

**Entrada (body JSON, todos opcionales):**
```json
{
  "name": "Nuevo nombre",
  "email": "nuevo@email.com",
  "website": "https://nueva-web.com",
  "status": "pending"
}
```

**Salida (200):**
```json
{
  "status": "Success",
  "message": "Suggestion updated successfully",
  "suggestion": {
    "id": "uuid",
    "name": "Nuevo nombre",
    "email": "nuevo@email.com",
    "website": "https://nueva-web.com",
    "suggested_by": "uuid-usuario",
    "status": "pending",
    "created_at": "2025-07-16T09:00:00.000Z",
    "updated_at": "2025-07-16T09:30:00.000Z"
  }
}
```

**Errores:**
- `404` — Sugerencia no encontrada.
- `409` — El email ya existe en otra sugerencia.

---

### 5. Eliminar sugerencia

**URL:** `DELETE /api/suggestions/:id`

**Autenticación:** Requerida (`onlyAdmin`).

**Parámetros de URL:**
- `id` — UUID de la sugerencia.

**Salida (200):**
```json
{
  "status": "Success",
  "message": "Suggestion deleted successfully"
}
```

**Errores:**
- `404` — Sugerencia no encontrada.

---

### 6. Aceptar sugerencia

**URL:** `POST /api/suggestions/:id/accept`

**Autenticación:** Requerida (`onlyAdmin`).

**Descripción:** Acepta una sugerencia pendiente. Esto crea una nueva entidad `Company` con los datos de la sugerencia (`name`, `email`, `website`) y marca la sugerencia como `accepted`. Verifica que no exista ya una empresa con el mismo email.

**Parámetros de URL:**
- `id` — UUID de la sugerencia.

**Salida (201):**
```json
{
  "status": "Success",
  "message": "Suggestion accepted and company created",
  "company": {
    "id": "uuid",
    "name": "TechEvents S.L.",
    "email": "contact@techevents.com",
    "phone": null,
    "website": "https://techevents.com",
    "logo": null,
    "description": null,
    "created_at": "2025-07-16T10:00:00.000Z",
    "updated_at": "2025-07-16T10:00:00.000Z"
  }
}
```

**Errores:**
- `404` — Sugerencia no encontrada.
- `409` — La sugerencia ya fue aceptada, o ya existe una empresa con ese email.

---

## Notas generales

- **Estados:** Las sugerencias tienen dos estados: `pending` (pendiente de revisión) y `accepted` (aceptada, empresa ya creada).
- **Creación de empresa:** Al aceptar una sugerencia, se crea una `Company` con los campos `name`, `email` y `website`. Los campos `phone`, `logo` y `description` quedan vacíos y pueden completarse posteriormente via `PATCH /api/companies/:id`.
- **Unicidad de email:** El email debe ser único tanto en `sugerencias_promotoras` como en `companies`.
- **Permisos:** La creación de sugerencias está abierta a cualquier usuario autenticado (`isLoged`). La gestión (listar, ver, actualizar, eliminar, aceptar) requiere permisos de admin (`onlyAdmin`).
