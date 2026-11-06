# Gestión de Empresas (`/api/enterprise` y `/api/enterprises/:id`)

Endpoints para consultar, completar onboarding y actualizar la información corporativa de la organización en sesión.

> **Control de Seguridad Anti-IDOR:**
> El endpoint de actualización `PUT /api/enterprises/:id` (y su equivalente `PATCH`) cuenta con una salvaguarda estricta de propiedad: **una organización únicamente puede modificar los datos de su propia entidad** (`req.enterprise.id === req.params.id`). 
> Cualquier intento de enviar una petición hacia el identificador de otra organización será rechazado con `403 Forbidden`.

---

## 1. Actualización y Onboarding de la Organización (`PUT`)

**URL:** `PUT /api/enterprises/:id` (o `PATCH /api/enterprises/:id`)

**Autenticación:** Requerida (`enterpriseAuthorization.isEnterpriseOrAdmin`).

**Descripción:** Actualiza los atributos de la empresa. Es el endpoint utilizado por la vista de **Onboarding** (`/enterprise/onboarding`) para guardar la información concreta tras el registro inicial y establecer `onboarding_ended: true`. También es consumido por la pantalla **Perfil & Sede** (`/enterprise/profile`) para modificaciones posteriores.

**Tratamiento de campos opcionales y CIF:**
- El NIF/CIF (`cif`) es **opcional**. Si el usuario deja el campo vacío, el backend lo almacena como `null` para evitar colisiones con el índice de unicidad `UNIQUE` de la base de datos MySQL.
- Los campos vacíos (`""`) de `website`, `phone`, `logo`, `contact_person`, etc., son automáticamente sanitizados a `null`.

**Entrada (body JSON):**
```json
{
  "name": "EcoMovilidad Extremadura S.L.",
  "cif": "B12345678",
  "description": "Entidad colaboradora para el fomento de trayectos compartidos hacia el polígono industrial.",
  "location": "Cáceres",
  "website": "https://ecomovilidad.es",
  "phone": "+34 927 123 456",
  "contact_person": "Laura Sánchez (Dpto. RRHH)",
  "sector": "Logística y Transporte",
  "employee_count": 85,
  "address_line1": "Av. de la Innovación 4",
  "city": "Cáceres",
  "province": "Cáceres",
  "postal_code": "10004",
  "country": "ES",
  "onboarding_ended": true
}
```

*Restricciones de validación:*
- `name`: Obligatorio (mínimo 2 caracteres).
- `description`: Obligatorio en onboarding/perfil (mínimo 10 caracteres).
- `location`: Obligatorio (mínimo 2 caracteres).
- `cif`: Opcional (hasta 50 caracteres, único si está presente).
- `website`: Opcional (hasta 255 caracteres).
- `onboarding_ended`: Booleano opcional (`true` al finalizar el wizard).

**Salida (200 OK):**
```json
{
  "status": "Success",
  "message": "Organización actualizada correctamente.",
  "enterprise": {
    "id": "ent-uuid-999",
    "name": "EcoMovilidad Extremadura S.L.",
    "email": "movilidad@ecomovilidad.es",
    "description": "Entidad colaboradora para el fomento de trayectos compartidos hacia el polígono industrial.",
    "location": "Cáceres",
    "phone": "+34 927 123 456",
    "cif": "B12345678",
    "website": "https://ecomovilidad.es",
    "logo": null,
    "contactPerson": "Laura Sánchez (Dpto. RRHH)",
    "sector": "Logística y Transporte",
    "employeeCount": 85,
    "addressLine1": "Av. de la Innovación 4",
    "city": "Cáceres",
    "province": "Cáceres",
    "postalCode": "10004",
    "country": "ES",
    "verified": false,
    "onboarding_ended": true,
    "isActive": true,
    "role": "enterprise",
    "createdAt": "2026-11-06T08:30:00.000Z"
  }
}
```

**Errores:**
- `400` — Validación de esquema fallida (ej. descripción menor a 10 caracteres).
- `401` — No autenticado.
- `403` — Intento de IDOR: La empresa intenta modificar un `:id` que no es el suyo propio (`"No tienes permisos para acceder o modificar los datos de otra organización."`).
- `409` — El CIF o Email proporcionado ya pertenece a otra organización.

---

## 2. Obtener Perfil por ID

**URL:** `GET /api/enterprises/:id`

**Autenticación:** Requerida (`enterpriseAuthorization.isEnterpriseOrAdmin`).

**Descripción:** Devuelve la información detallada de la organización si el solicitante es el dueño de la cuenta o un Administrador de la plataforma.

**Salida (200 OK):**
```json
{
  "status": "Success",
  "enterprise": {
    "id": "ent-uuid-999",
    "name": "EcoMovilidad Extremadura S.L.",
    "email": "movilidad@ecomovilidad.es",
    "cif": "B12345678",
    "website": "https://ecomovilidad.es",
    "description": "Entidad colaboradora...",
    "location": "Cáceres",
    "onboarding_ended": true,
    "role": "enterprise"
  }
}
```

---

## 3. Consultar y Actualizar Perfil de Sesión (`/api/enterprise/me`)

**URLs:**
- `GET /api/enterprise/me` — Consulta el perfil propio sin necesidad de pasar el `:id`.
- `PATCH /api/enterprise/me` — Actualización parcial del perfil propio.

**Autenticación:** Requerida (`isEnterpriseLoged`).

**Salida (200 OK):** Devuelve la entidad con formato seguro `toSafeJSON()`.

---

## 4. Métricas de la Empresa en Sesión

**URL:** `GET /api/enterprise/metrics`

**Autenticación:** Requerida (`isEnterpriseLoged`).

**Descripción:** Devuelve los contadores de impacto y actividad para el Dashboard de la empresa (`users_registered`, `active_events`, `total_events`, `co2Avoided`).

---

## 5. Alta Administrativa de Organizaciones (SuperAdmin)

**URL:** `POST /api/admin/enterprises`

**Autenticación:** Requerida (`authorization.onlyAdmin`).

**Descripción:** Permite a los administradores de la plataforma dar de alta directamente una organización con todos sus datos corporativos completos, verificación inmediata y credenciales de acceso activas. A diferencia del auto-registro público, por defecto marca `onboarding_ended: true` y `verified: true` para que la empresa pueda operar inmediatamente sin requerir onboarding guiado manual.

**Tratamiento de campos opcionales:**
Los campos opcionales enviados como cadena vacía `""` (`cif`, `website`, `phone`, `logo`, `contact_person`, etc.) son automáticamente convertidos a `null` por el backend para prevenir colisiones de unicidad en la base de datos MySQL.

**Entrada (body JSON):**
```json
{
  "name": "Acme Logística Ibérica S.L.",
  "email": "contacto@acmelogistica.es",
  "password": "Password123!@",
  "description": "Compañía dedicada a la optimización de rutas y movilidad sostenible.",
  "location": "Madrid",
  "cif": "B87654321",
  "website": "https://acmelogistica.es",
  "phone": "+34 912 345 678",
  "logo": "https://acmelogistica.es/logo.png",
  "contact_person": "Ana Torres (Directora de Operaciones)",
  "sector": "Transporte y Logística",
  "employee_count": 120,
  "address_line1": "Calle Logística 12, Nave 4",
  "city": "Madrid",
  "province": "Madrid",
  "postal_code": "28022",
  "country": "ES",
  "verified": true,
  "is_active": true,
  "onboarding_ended": true
}
```

**Salida (201 Created):**
```json
{
  "status": "Success",
  "message": "Enterprise created by admin",
  "data": {
    "id": "ent-uuid-1234",
    "name": "Acme Logística Ibérica S.L.",
    "email": "contacto@acmelogistica.es",
    "description": "Compañía dedicada a la optimización de rutas y movilidad sostenible.",
    "location": "Madrid",
    "cif": "B87654321",
    "website": "https://acmelogistica.es",
    "phone": "+34 912 345 678",
    "logo": "https://acmelogistica.es/logo.png",
    "contactPerson": "Ana Torres (Directora de Operaciones)",
    "sector": "Transporte y Logística",
    "employeeCount": 120,
    "addressLine1": "Calle Logística 12, Nave 4",
    "city": "Madrid",
    "province": "Madrid",
    "postalCode": "28022",
    "country": "ES",
    "verified": true,
    "onboarding_ended": true,
    "isActive": true,
    "role": "enterprise",
    "createdAt": "2026-11-06T09:00:00.000Z"
  }
}
```

**Errores:**
- `400 Bad Request` — Falta alguno de los campos obligatorios (`name`, `email`, `password`, `description`, `location`).
- `401 Unauthorized` — Token no válido o ausente.
- `403 Forbidden` — El usuario autenticado no posee rol `admin` de plataforma.
- `409 Conflict` — El correo electrónico o el CIF ya se encuentran registrados en otra organización.
