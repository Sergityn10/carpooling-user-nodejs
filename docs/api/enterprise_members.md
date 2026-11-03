# Miembros de Organizaciones e Invitaciones (`/api/enterprise`, `/api/user`)

Documentación técnica de los endpoints para la gestión de miembros corporativos, empleados, asignación de roles y ciclo de vida de invitaciones por correo electrónico mediante RabbitMQ.

---

## Índice de Endpoints

| Método | Endpoint | Permiso requerido | Descripción |
|---|---|---|---|
| `POST` | `/api/enterprise/:enterpriseId/members/invite` | Enterprise `ADMIN` | Invita a un nuevo miembro enviando correo electrónico asíncrono. |
| `GET` | `/api/enterprise/invitations/validate?token=...` | Público | Valida un token de invitación y obtiene información pública de la empresa. |
| `POST` | `/api/enterprise/invitations/accept` | Usuario autenticado (`isLoged`) | Acepta la invitación y vincula la cuenta del usuario a la empresa. |
| `GET` | `/api/enterprise/:enterpriseId/members` | Enterprise `MANAGER` o `ADMIN` | Lista los miembros de la empresa con búsqueda, filtros y paginación. |
| `PATCH` | `/api/enterprise/:enterpriseId/members/:memberId/role` | Enterprise `ADMIN` | Actualiza el rol corporativo o departamento con salvaguarda anti-orfandad. |
| `DELETE` | `/api/enterprise/:enterpriseId/members/:memberId` | Enterprise `ADMIN` | Desvincula a un miembro preservando su cuenta personal de YouConnext. |
| `GET` | `/api/enterprise/:enterpriseId/invitations` | Enterprise `ADMIN` | Lista todas las invitaciones pendientes de la empresa. |
| `DELETE` | `/api/enterprise/:enterpriseId/invitations/:invitationId` | Enterprise `ADMIN` | Revoca y cancela una invitación pendiente. |
| `GET` | `/api/user/my-organizations` | Usuario autenticado (`isLoged`) | Lista las organizaciones a las que pertenece el usuario autenticado. |

---

## 1. Invitar Miembro a la Organización

**URL:** `POST /api/enterprise/:enterpriseId/members/invite`

**Autenticación:** Requerida (`requireEnterpriseRole("ADMIN")`). Puede ser ejecutado por la cuenta de la empresa o por un miembro con rol corporativo `ADMIN`.

**Descripción:** Genera una invitación corporativa con un token criptográfico seguro de 64 caracteres hexadecimales (válido por 7 días) y publica un evento en RabbitMQ (`ENTERPRISE_MEMBER_INVITED`) para que el microservicio de notificaciones (`carpooling-notiifications`) envíe el correo con el enlace de aceptación.

### Parámetros de Ruta:
- `enterpriseId` (UUID o string) — Identificador de la empresa.

### Entrada (Body JSON):
```json
{
  "email": "carlos.gomez@empresa.com",
  "role": "EMPLOYEE",
  "department": "Tecnología e Innovación",
  "employee_code": "EMP-042"
}
```

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `email` | String | Sí | Correo corporativo del empleado a invitar |
| `role` | Enum | Sí | Rol corporativo: `"ADMIN"`, `"MANAGER"` o `"EMPLOYEE"` |
| `department` | String | No | Departamento o área funcional |
| `employee_code` | String | No | Código interno de empleado |

### Salida (201 Created):
```json
{
  "status": "Success",
  "message": "Invitación enviada con éxito a carlos.gomez@empresa.com.",
  "invitation": {
    "id": "inv-uuid-1234",
    "email": "carlos.gomez@empresa.com",
    "role": "EMPLOYEE",
    "department": "Tecnología e Innovación",
    "employee_code": "EMP-042",
    "expires_at": "2026-11-09T18:00:00.000Z",
    "invitation_link": "https://app.youconnext.es/enterprise/invitation/accept?token=a8f9c1b34..."
  }
}
```

### Errores Comunes:
- `400 Bad Request` — Datos inválidos o el usuario ya es miembro activo de esta empresa.
- `403 Forbidden` — El usuario autenticado no tiene permisos de administrador corporativo.
- `404 Not Found` — La organización no existe o está inactiva/eliminada.

---

## 2. Validar Token de Invitación (Público)

**URL:** `GET /api/enterprise/invitations/validate`

**Autenticación:** Pública (No requerida).

**Descripción:** Endpoint consultado por la pantalla de aterrizaje de invitación del frontend (`/enterprise/invitation/accept?token=...`). Valida la integridad del token, su caducidad y devuelve los datos públicos de la organización para presentárselos al usuario antes de aceptar.

### Parámetros de Consulta (Query):
- `token` (String, requerido) — Token hexadecimal de la invitación recibido por correo.

### Salida (200 OK):
```json
{
  "status": "Success",
  "invitation": {
    "id": "inv-uuid-1234",
    "email": "carlos.gomez@empresa.com",
    "role": "EMPLOYEE",
    "department": "Tecnología e Innovación",
    "employee_code": "EMP-042",
    "expires_at": "2026-11-09T18:00:00.000Z",
    "enterprise": {
      "id": "ent-uuid-999",
      "name": "Iberdrola S.A.",
      "logo": "https://youconnext.es/logos/iberdrola.png",
      "sector": "Energía y Sostenibilidad",
      "location": "Bilbao / Madrid",
      "description": "Líder global en sostenibilidad y movilidad limpia",
      "is_active": true,
      "is_deleted": false
    }
  }
}
```

### Errores Comunes:
- `400 Bad Request` — Token expirado, ya aceptado previamente o empresa inactiva.
- `404 Not Found` — Token no encontrado en la base de datos.

---

## 3. Aceptar Invitación Corporativa

**URL:** `POST /api/enterprise/invitations/accept`

**Autenticación:** Requerida (`authorization.isLoged`). El usuario debe haber iniciado sesión con su cuenta personal (Persona Física) de YouConnext.

**Descripción:** Vincula la cuenta personal de YouConnext con la organización bajo el rol asignado en la invitación. Ejecuta una transacción atómica que crea o reactiva la membresía (`EnterpriseMember`), marca la invitación como consumida (`accepted_at`), y publica el evento en RabbitMQ (`ENTERPRISE_MEMBER_JOINED`).

### Entrada (Body JSON):
```json
{
  "token": "a8f9c1b34e56..."
}
```

### Salida (200 OK):
```json
{
  "status": "Success",
  "message": "¡Te has unido exitosamente a Iberdrola S.A.!",
  "badge": {
    "userId": "usr-uuid-1234",
    "fullName": "Carlos Gómez",
    "email": "carlos.gomez@empresa.com",
    "enterpriseId": "ent-uuid-999",
    "enterpriseName": "Iberdrola S.A.",
    "roleInOrg": "EMPLOYEE",
    "department": "Tecnología e Innovación",
    "employeeCode": "EMP-042",
    "status": "ACTIVE",
    "joinedAt": "2026-11-02T19:00:00.000Z"
  },
  "member": {
    "id": "mem-uuid-5678",
    "enterprise_id": "ent-uuid-999",
    "user_id": "usr-uuid-1234",
    "role": "EMPLOYEE",
    "department": "Tecnología e Innovación",
    "employee_code": "EMP-042",
    "status": "ACTIVE",
    "joined_at": "2026-11-02T19:00:00.000Z"
  }
}
```

### Errores Comunes:
- `400 Bad Request` — La invitación ha caducado, ya fue aceptada, o el usuario ya pertenece activamente a la empresa.
- `401 Unauthorized` — El usuario no ha iniciado sesión en YouConnext.
- `404 Not Found` — Token no encontrado.

---

## 4. Listar Miembros de la Organización

**URL:** `GET /api/enterprise/:enterpriseId/members`

**Autenticación:** Requerida (`requireEnterpriseRole("MANAGER")`). Accesible por Gestores (`MANAGER`) y Administradores (`ADMIN`).

**Descripción:** Devuelve la lista paginada de empleados y colaboradores pertenecientes a la empresa, con filtros por texto, rol corporativo, departamento y estado de la membresía.

### Parámetros de Consulta (Query):
- `search` (String, opcional) — Búsqueda en nombre, apellidos, email, departamento o código de empleado.
- `role` (Enum, opcional) — `"ADMIN"`, `"MANAGER"`, `"EMPLOYEE"`, o `"all"` (default: `"all"`).
- `department` (String, opcional) — Filtrar por coincidencia en departamento.
- `status` (Enum, opcional) — `"ACTIVE"`, `"INACTIVE"`, `"SUSPENDED"`, o `"all"` (default: `"all"`).
- `page` (Int, opcional) — Página actual (default: 1).
- `limit` (Int, opcional) — Elementos por página (default: 20, máx: 100).

### Salida (200 OK):
```json
{
  "status": "Success",
  "data": [
    {
      "id": "mem-uuid-5678",
      "enterprise_id": "ent-uuid-999",
      "user_id": "usr-uuid-1234",
      "role": "EMPLOYEE",
      "status": "ACTIVE",
      "department": "Tecnología e Innovación",
      "employee_code": "EMP-042",
      "joined_at": "2026-11-02T19:00:00.000Z",
      "user": {
        "id": "usr-uuid-1234",
        "name": "Carlos",
        "surname": "Gómez",
        "email": "carlos.gomez@empresa.com",
        "dni": "12345678Z",
        "phone": "+34600112233",
        "photo": "https://youconnext.es/avatars/carlos.jpg"
      },
      "permissions": {
        "canInviteMembers": false,
        "canRemoveMembers": false,
        "canChangeMemberRole": false,
        "canCreateCorporateEvents": false,
        "canViewCAEMetrics": false
      }
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

## 5. Cambiar Rol Corporativo de un Miembro

**URL:** `PATCH /api/enterprise/:enterpriseId/members/:memberId/role`

**Autenticación:** Requerida (`requireEnterpriseRole("ADMIN")`).

**Descripción:** Actualiza el rol corporativo (`ADMIN`, `MANAGER` o `EMPLOYEE`) y opcionalmente el departamento de un empleado.

> **Salvaguarda anti-orfandad:** Si se intenta degradar a un usuario con rol `ADMIN` a `MANAGER` o `EMPLOYEE`, el sistema verifica que exista al menos otro administrador activo en la organización. Si es el último, la solicitud se rechaza con error `400`.

### Parámetros de Ruta:
- `enterpriseId` (UUID) — Identificador de la empresa.
- `memberId` (UUID) — Identificador de la membresía (`id` de `enterprise_members`).

### Entrada (Body JSON):
```json
{
  "role": "MANAGER",
  "department": "Operaciones y Movilidad"
}
```

### Salida (200 OK):
```json
{
  "status": "Success",
  "message": "Rol actualizado con éxito a MANAGER.",
  "member": {
    "id": "mem-uuid-5678",
    "role": "MANAGER",
    "department": "Operaciones y Movilidad",
    "user": {
      "id": "usr-uuid-1234",
      "name": "Carlos",
      "surname": "Gómez",
      "email": "carlos.gomez@empresa.com"
    }
  }
}
```

### Errores Comunes:
- `400 Bad Request` — Rol no permitido o intento de degradar al único administrador activo.
- `404 Not Found` — Miembro no encontrado en la organización.

---

## 6. Desvincular Miembro de la Organización

**URL:** `DELETE /api/enterprise/:enterpriseId/members/:memberId`

**Autenticación:** Requerida (`requireEnterpriseRole("ADMIN")`).

**Descripción:** Elimina el vínculo corporativo entre el empleado y la organización.

> **Preservación de Cuenta Personal:** La eliminación **únicamente borra el registro de `enterprise_members`**. La cuenta personal del usuario en YouConnext (sus trayectos personales, valoraciones, vehículo registrado y monedero de Stripe) permanece **100% intacta**.
>
> **Salvaguarda anti-orfandad:** No se permite desvincular al último administrador activo de la organización sin antes haber nombrado o asignado a otro.

### Parámetros de Ruta:
- `enterpriseId` (UUID) — Identificador de la empresa.
- `memberId` (UUID) — Identificador de la membresía.

### Salida (200 OK):
```json
{
  "status": "Success",
  "message": "Miembro desvinculado de la organización con éxito. La cuenta personal de YouConnext no ha sido afectada."
}
```

---

## 7. Consultar Invitaciones Pendientes

**URL:** `GET /api/enterprise/:enterpriseId/invitations`

**Autenticación:** Requerida (`requireEnterpriseRole("ADMIN")`).

**Descripción:** Lista las invitaciones emitidas por la empresa que aún no han sido aceptadas, indicando si han caducado (`is_expired: true/false`).

### Salida (200 OK):
```json
{
  "status": "Success",
  "invitations": [
    {
      "id": "inv-uuid-1234",
      "enterprise_id": "ent-uuid-999",
      "email": "laura.martin@empresa.com",
      "role": "EMPLOYEE",
      "department": "Recursos Humanos",
      "employee_code": "EMP-099",
      "token": "7a8b9c...",
      "expires_at": "2026-11-09T18:00:00.000Z",
      "accepted_at": null,
      "created_at": "2026-11-02T18:00:00.000Z",
      "is_expired": false,
      "invitation_link": "https://app.youconnext.es/enterprise/invitation/accept?token=7a8b9c..."
    }
  ]
}
```

---

## 8. Revocar Invitación

**URL:** `DELETE /api/enterprise/:enterpriseId/invitations/:invitationId`

**Autenticación:** Requerida (`requireEnterpriseRole("ADMIN")`).

**Descripción:** Cancela y elimina una invitación pendiente, invalidando de inmediato el enlace enviado por correo electrónico.

### Salida (200 OK):
```json
{
  "status": "Success",
  "message": "Invitación revocada con éxito."
}
```

---

## 9. Mis Membresías Corporativas (Usuario en Sesión)

**URL:** `GET /api/user/my-organizations`

**Autenticación:** Requerida (`authorization.isLoged`).

**Descripción:** Permite a una Persona Física obtener el listado de todas las organizaciones a las que pertenece activamente, con su correspondiente rol corporativo, permisos y badge de identidad. Permite al frontend determinar si debe mostrar el selector o switch de Dashboard Corporativo en la barra superior o drawer de navegación.

### Salida (200 OK):
```json
{
  "status": "Success",
  "memberships": [
    {
      "membership_id": "mem-uuid-5678",
      "role": "MANAGER",
      "department": "Sostenibilidad y Movilidad",
      "employee_code": "IB-902",
      "joined_at": "2026-10-29T10:00:00.000Z",
      "enterprise": {
        "id": "ent-uuid-999",
        "name": "Iberdrola S.A.",
        "email": "movilidad@iberdrola.com",
        "logo": "https://youconnext.es/logos/iberdrola.png",
        "sector": "Energía y Sostenibilidad",
        "location": "Bilbao / Madrid",
        "description": "Líder global en sostenibilidad"
      },
      "badge": {
        "userId": "usr-uuid-1234",
        "fullName": "Carlos Gómez",
        "email": "carlos.gomez@empresa.com",
        "enterpriseId": "ent-uuid-999",
        "enterpriseName": "Iberdrola S.A.",
        "roleInOrg": "MANAGER",
        "department": "Sostenibilidad y Movilidad",
        "employeeCode": "IB-902",
        "status": "ACTIVE",
        "joinedAt": "2026-10-29T10:00:00.000Z"
      },
      "permissions": {
        "canInviteMembers": false,
        "canRemoveMembers": false,
        "canChangeMemberRole": false,
        "canCreateCorporateEvents": true,
        "canViewCAEMetrics": true
      }
    }
  ]
}
```
