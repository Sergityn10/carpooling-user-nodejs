# Empresas (`/api/companies`)

Endpoints para gestión de empresas que generan eventos en la plataforma. Las operaciones de creación, actualización y eliminación requieren rol **admin**. La lectura es accesible para usuarios autenticados.

---

## 1. Listar empresas

**URL:** `GET /api/companies`

**Autenticación:** Requerida (`isLoged`).

**Query params (opcionales):**
- `search` — Buscar por nombre de empresa.
- `page` — Número de página (default: 1).
- `limit` — Resultados por página (default: 20, máx: 100).

**Salida (200):**
```json
{
  "status": "Success",
  "companies": [
    {
      "id": "uuid",
      "name": "YouConnext",
      "email": "contact@youconnext.com",
      "phone": "+34 600 123 456",
      "website": "https://youconnext.com",
      "logo": "base64...",
      "description": "Plataforma de carpooling",
      "created_at": "2025-07-03T10:00:00Z",
      "updated_at": "2025-07-03T10:00:00Z",
      "_count": { "events": 5 }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 10,
    "totalPages": 1
  }
}
```

---

## 2. Obtener empresa por ID

**URL:** `GET /api/companies/:id`

**Autenticación:** Requerida (`isLoged`).

**Parámetros de URL:**
- `id` — UUID de la empresa.

**Salida (200):**
```json
{
  "status": "Success",
  "company": {
    "id": "uuid",
    "name": "YouConnext",
    "email": "contact@youconnext.com",
    "phone": "+34 600 123 456",
    "website": "https://youconnext.com",
    "logo": "base64...",
    "description": "Plataforma de carpooling",
    "created_at": "2025-07-03T10:00:00Z",
    "updated_at": "2025-07-03T10:00:00Z",
    "events": [
      {
        "id": "uuid",
        "name": "Hackathon YouConnext 2025",
        "unique_code": "A1B2C3D4E5F6",
        "tags": [
          { "tag": { "id": 1, "name": "programacion" } }
        ]
      }
    ]
  }
}
```

**Errores:**
- `404` — Empresa no encontrada.

---

## 3. Crear empresa

**URL:** `POST /api/companies`

**Autenticación:** Requerida (`onlyAdmin`).

**Entrada (body JSON):**
```json
{
  "name": "YouConnext",
  "email": "contact@youconnext.com",
  "phone": "+34 600 123 456",
  "website": "https://youconnext.com",
  "logo": "base64...",
  "description": "Plataforma de carpooling"
}
```

**Campos requeridos:** `name`, `email`.
**Campos opcionales:** `phone`, `website`, `logo`, `description`.

**Salida (201):**
```json
{
  "status": "Success",
  "message": "Company created successfully",
  "company": {
    "id": "uuid",
    "name": "YouConnext",
    "email": "contact@youconnext.com",
    "phone": "+34 600 123 456",
    "website": "https://youconnext.com",
    "logo": "base64...",
    "description": "Plataforma de carpooling",
    "created_at": "2025-07-03T10:00:00Z",
    "updated_at": "2025-07-03T10:00:00Z"
  }
}
```

**Errores:**
- `400` — Faltan `name` o `email`.
- `409` — El email ya existe.
- `403` — No es admin.

---

## 4. Actualizar empresa

**URL:** `PATCH /api/companies/:id`

**Autenticación:** Requerida (`onlyAdmin`).

**Parámetros de URL:**
- `id` — UUID de la empresa.

**Entrada (body JSON, todos opcionales):**
```json
{
  "name": "Nuevo nombre",
  "email": "nuevo@email.com",
  "phone": "+34 600 999 999",
  "website": "https://nueva-web.com",
  "logo": "base64...",
  "description": "Nueva descripción"
}
```

**Salida (200):**
```json
{
  "status": "Success",
  "message": "Company updated successfully",
  "company": { ... }
}
```

**Errores:**
- `404` — Empresa no encontrada.
- `409` — El email ya existe.
- `403` — No es admin.

---

## 5. Eliminar empresa

**URL:** `DELETE /api/companies/:id`

**Autenticación:** Requerida (`onlyAdmin`).

**Parámetros de URL:**
- `id` — UUID de la empresa.

**Salida (200):**
```json
{
  "status": "Success",
  "message": "Company deleted successfully"
}
```

**Errores:**
- `404` — Empresa no encontrada.
- `403` — No es admin.

> **Nota:** Al eliminar una empresa, se eliminan en cascada todos sus eventos y las relaciones de etiquetas de esos eventos.

---

## Notas generales

- **Permisos:** Las operaciones de lectura (`GET`) requieren autenticación (`isLoged`). Las operaciones de escritura (`POST`, `PATCH`, `DELETE`) requieren rol admin (`onlyAdmin`).
- **Email único:** El email de la empresa debe ser único en la plataforma.
- **Paginación:** El endpoint de listado soporta paginación con `page` y `limit`.
- **Eventos:** Al obtener una empresa por ID, se incluyen todos sus eventos con sus etiquetas.
- **Eliminación en cascada:** Al eliminar una empresa, se eliminan todos sus eventos y las relaciones de etiquetas asociadas.
