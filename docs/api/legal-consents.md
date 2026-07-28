# Consentimientos Legales (`/api/legal-consents`)

Endpoints para la gestión y auditoría de consentimientos legales (RGPD/LOPDGDD). Permite a los administradores consultar qué usuarios han aceptado qué documentos legales, y a los usuarios consultar sus propios consentimientos.

Los consentimientos se registran automáticamente durante el registro de usuario (ver [`/api/auth/register`](auth.md#2-registro)) dentro de una transacción de base de datos, junto con la dirección IP y el User-Agent para auditoría.

---

## Modelo de datos

Tabla: `legal_consents`

| Campo             | Tipo              | Descripción                                          |
| ----------------- | ----------------- | ---------------------------------------------------- |
| `id`              | UUID              | Identificador único del registro                     |
| `userId`          | UUID              | ID del usuario que aceptó                            |
| `documentType`    | Enum              | `PRIVACY_POLICY`, `TERMS_OF_SERVICE` o `MARKETING`   |
| `documentVersion` | String            | Versión exacta del documento aceptado (ej. `"v1.0"`) |
| `acceptedAt`      | DateTime          | Timestamp de aceptación (vital para RGPD)            |
| `ipAddress`       | String (nullable) | IP desde la que se aceptó                            |
| `userAgent`       | String (nullable) | User-Agent del navegador/app                         |

> **Relación:** Si se elimina un usuario, sus consentimientos se eliminan automáticamente (`onDelete: Cascade`).

---

## 1. Listar todos los consentimientos

**URL:** `GET /api/legal-consents`

**Autenticación:** Admin (`role: admin`).

**Descripción:** Devuelve una lista paginada de todos los consentimientos registrados, con posibilidad de filtrar por tipo de documento y/o usuario.

**Query params (opcionales):**

| Parámetro      | Tipo   | Default | Descripción                                                         |
| -------------- | ------ | ------- | ------------------------------------------------------------------- |
| `documentType` | string | —       | Filtrar por tipo: `PRIVACY_POLICY`, `TERMS_OF_SERVICE`, `MARKETING` |
| `userId`       | string | —       | Filtrar por ID de usuario                                           |
| `page`         | int    | `1`     | Número de página                                                    |
| `limit`        | int    | `50`    | Elementos por página (máx. 200)                                     |

**Salida (200):**
```json
{
  "status": "Success",
  "data": [
    {
      "id": "uuid",
      "userId": "uuid",
      "documentType": "PRIVACY_POLICY",
      "documentVersion": "v1.0",
      "acceptedAt": "2026-07-28T07:00:00.000Z",
      "ipAddress": "192.168.1.1",
      "userAgent": "Mozilla/5.0...",
      "user": {
        "id": "uuid",
        "email": "user@example.com",
        "name": "Juan",
        "surname": "Pérez"
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 150,
    "totalPages": 3
  }
}
```

**Errores:**
- `401` — No autenticado.
- `403` — No es admin.
- `500` — Error interno.

---

## 2. Resumen global de consentimientos

**URL:** `GET /api/legal-consents/summary`

**Autenticación:** Admin (`role: admin`).

**Descripción:** Devuelve un resumen con el total de usuarios y cuántos han aceptado cada tipo de documento legal.

**Salida (200):**
```json
{
  "status": "Success",
  "data": {
    "totalUsers": 500,
    "privacy_policy": {
      "accepted": 480,
      "notAccepted": 20
    },
    "terms_of_service": {
      "accepted": 475,
      "notAccepted": 25
    },
    "marketing": {
      "accepted": 120,
      "notAccepted": 380
    }
  }
}
```

**Errores:**
- `401` — No autenticado.
- `403` — No es admin.
- `500` — Error interno.

---

## 3. Usuarios sin consentimiento de un tipo

**URL:** `GET /api/legal-consents/without/:documentType`

**Autenticación:** Admin (`role: admin`).

**Descripción:** Devuelve el listado de usuarios que **no** han aceptado un tipo concreto de documento legal.

**Parámetros de URL:**

| Parámetro      | Valores válidos                                   |
| -------------- | ------------------------------------------------- |
| `documentType` | `PRIVACY_POLICY`, `TERMS_OF_SERVICE`, `MARKETING` |

**Salida (200):**
```json
{
  "status": "Success",
  "documentType": "PRIVACY_POLICY",
  "count": 20,
  "data": [
    {
      "id": "uuid",
      "email": "user@example.com",
      "name": "Juan",
      "surname": "Pérez",
      "created_at": "2026-07-01T10:00:00.000Z"
    }
  ]
}
```

**Errores:**
- `400` — `documentType` no válido.
- `401` — No autenticado.
- `403` — No es admin.
- `500` — Error interno.

---

## 4. Consentimientos de un usuario concreto

**URL:** `GET /api/legal-consents/user/:userId`

**Autenticación:** Admin (`role: admin`).

**Descripción:** Devuelve todos los consentimientos registrados para un usuario específico, ordenados por fecha de aceptación (más reciente primero). Incluye un resumen con el consentimiento más reciente de cada tipo.

**Parámetros de URL:**

| Parámetro | Tipo | Descripción                |
| --------- | ---- | -------------------------- |
| `userId`  | UUID | ID del usuario a consultar |

**Salida (200):**
```json
{
  "status": "Success",
  "data": {
    "allConsents": [
      {
        "id": "uuid",
        "userId": "uuid",
        "documentType": "PRIVACY_POLICY",
        "documentVersion": "v1.0",
        "acceptedAt": "2026-07-28T07:00:00.000Z",
        "ipAddress": "192.168.1.1",
        "userAgent": "Mozilla/5.0..."
      },
      {
        "id": "uuid",
        "userId": "uuid",
        "documentType": "TERMS_OF_SERVICE",
        "documentVersion": "v1.0",
        "acceptedAt": "2026-07-28T07:00:00.000Z",
        "ipAddress": "192.168.1.1",
        "userAgent": "Mozilla/5.0..."
      }
    ],
    "latestByType": {
      "privacy_policy": {
        "id": "uuid",
        "documentType": "PRIVACY_POLICY",
        "documentVersion": "v1.0",
        "acceptedAt": "2026-07-28T07:00:00.000Z"
      },
      "terms_of_service": {
        "id": "uuid",
        "documentType": "TERMS_OF_SERVICE",
        "documentVersion": "v1.0",
        "acceptedAt": "2026-07-28T07:00:00.000Z"
      },
      "marketing": null
    }
  }
}
```

> **Nota:** `latestByType.marketing` es `null` si el usuario no aceptó marketing.

**Errores:**
- `401` — No autenticado.
- `403` — No es admin.
- `500` — Error interno.

---

## 5. Mis consentimientos

**URL:** `GET /api/legal-consents/me`

**Autenticación:** Usuario logueado (`isLoged`).

**Descripción:** Devuelve los consentimientos legales del usuario autenticado. Estructura idéntica al endpoint de admin pero filtrado al usuario propio.

**Salida (200):**
```json
{
  "status": "Success",
  "data": {
    "allConsents": [
      {
        "id": "uuid",
        "userId": "uuid",
        "documentType": "PRIVACY_POLICY",
        "documentVersion": "v1.0",
        "acceptedAt": "2026-07-28T07:00:00.000Z",
        "ipAddress": "192.168.1.1",
        "userAgent": "Mozilla/5.0..."
      }
    ],
    "latestByType": {
      "privacy_policy": { "...": "..." },
      "terms_of_service": { "...": "..." },
      "marketing": null
    }
  }
}
```

**Errores:**
- `401` — No autenticado.
- `500` — Error interno.

---

## Notas generales

- **Transacción atómica:** Los consentimientos se guardan dentro de la misma transacción que la creación del usuario y las preferencias. Si falla cualquier paso, no se guarda nada.
- **Auditoría RGPD:** Cada registro incluye `ipAddress` y `userAgent` capturados automáticamente de la petición HTTP (`x-forwarded-for` o `remoteAddress` para IP; header `User-Agent`).
- **Versionado de documentos:** Cada consentimiento registra la versión exacta del documento aceptado, permitiendo saber qué versión vio el usuario en el momento de la aceptación.
- **Eliminación en cascada:** Si se elimina un usuario de la BD, sus consentimientos se eliminan automáticamente.
- **Múltiples registros:** Un usuario puede tener múltiples registros del mismo tipo (ej. si se actualiza la política de privacidad y el usuario debe aceptar de nuevo). El campo `latestByType` muestra el más reciente.
