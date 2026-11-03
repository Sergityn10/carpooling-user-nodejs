# Autenticación de Empresas (`/api/enterprise/auth`)

Endpoints para gestión de cuentas de organización/empresa (`role_id: 3`, rol `"enterprise"`), autenticación corporativa, cambio de contraseñas y compatibilidad con el inicio de sesión unificado.

> **Nota de Arquitectura:**
> - Las organizaciones también pueden autenticarse a través del endpoint unificado [`POST /api/auth/unified-login`](auth.md#1-inicio-de-sesion-unificado), el cual clasifica su identidad como `LEGAL_ENTITY` / `ORGANIZATION`.
> - Para gestionar a los empleados, colaboradores e invitaciones corporativas de la organización, consulta [Gestión de Miembros e Invitaciones](enterprise_members.md).
> - Para la implementación en la Webapp y App Móvil, consulta la [Guía de Integración Frontend para Empresas](../frontend-enterprise-guide.md).

---

## 1. Registro de Empresa (Exclusivo Administrador)

**URL:** `POST /api/enterprise/auth/register` (o `POST /api/admin/enterprises`)

**Autenticación:** Requerida (Solo Super Administrador de la plataforma).

**Descripción:** Da de alta una nueva organización corporativa en el sistema. Hashea la contraseña con bcrypt (10 rondas de salt). Registra la empresa con `role_id: 3` (`enterprise`), estado activo y borrado lógico habilitado (`is_deleted: false`).

**Entrada (body JSON):**
```json
{
  "name": "Iberdrola S.A.",
  "email": "movilidad@iberdrola.com",
  "password": "Password123#",
  "description": "Líder global en sostenibilidad y movilidad compartida",
  "location": "Bilbao / Madrid",
  "phone": "+34910000000",
  "cif": "A48010611",
  "website": "https://www.iberdrola.com",
  "sector": "Energía",
  "employee_count": 35000,
  "city": "Madrid",
  "province": "Madrid",
  "country": "ES"
}
```

**Salida (201):**
```json
{
  "status": "Success",
  "message": "Organización registrada exitosamente por el administrador.",
  "enterprise": {
    "id": "ent-uuid-999",
    "name": "Iberdrola S.A.",
    "email": "movilidad@iberdrola.com",
    "description": "Líder global en sostenibilidad y movilidad compartida",
    "location": "Bilbao / Madrid",
    "phone": "+34910000000",
    "cif": "A48010611",
    "website": "https://www.iberdrola.com",
    "sector": "Energía",
    "employeeCount": 35000,
    "role": "enterprise",
    "isActive": true,
    "verified": false,
    "createdAt": "2026-10-29T10:00:00.000Z"
  }
}
```

**Errores:**
- `400` — Validación de esquema fallida (campos obligatorios ausentes o formato inválido).
- `403` — Acceso denegado (el solicitante no es Super Administrador).
- `409` — Ya existe una empresa registrada con ese correo electrónico o CIF.

---

## 2. Login Directo de Empresa

**URL:** `POST /api/enterprise/auth/login`

**Autenticación:** No requerida.

**Descripción:** Autentica una empresa con email y contraseña corporativa. Valida que la empresa no haya sido eliminada lógicamente (`is_deleted: false`) y que esté activa (`is_active: true`). Emite un JWT con `role: "enterprise"` y establece la cookie `enterprise_access_token`.

**Entrada (body JSON):**
```json
{
  "email": "movilidad@iberdrola.com",
  "password": "Password123#"
}
```

**Salida (200):**
```json
{
  "status": "Success",
  "message": "Inicio de sesión correcto.",
  "token": "<JWT_access_token>",
  "role": "enterprise",
  "enterprise": {
    "id": "ent-uuid-999",
    "name": "Iberdrola S.A.",
    "email": "movilidad@iberdrola.com",
    "sector": "Energía",
    "location": "Bilbao / Madrid",
    "role": "enterprise",
    "isActive": true
  }
}
```

**Errores:**
- `400` — Validación de esquema fallida.
- `401` — Credenciales incorrectas.
- `403` — Organización dada de baja o suspendida temporalmente.

---

## 3. Cambio de Contraseña de Empresa

**URL:** `POST /api/enterprise/auth/change-password`

**Autenticación:** Requerida (`isEnterpriseLoged`).

**Descripción:** Permite a la organización actualizar su clave corporativa. Valida la contraseña actual, exige complejidad de seguridad y previene reutilización inmediata.

**Entrada (body JSON):**
```json
{
  "current_password": "OldPassword123#",
  "new_password": "NewStrongPassword2026@",
  "confirm_password": "NewStrongPassword2026@"
}
```

**Salida (200):**
```json
{
  "status": "Success",
  "message": "Contraseña actualizada exitosamente."
}
```

**Cookies establecidas:** `enterprise_access_token`.

---

## 3. Logout de Empresa

**URL:** `GET /api/enterprise/auth/logout`

**Autenticación:** No requerida.

**Descripción:** Cierra la sesión de la empresa eliminando la cookie `enterprise_access_token`.

**Salida (200):**
```json
{
  "status": "Success",
  "message": "Logout successful"
}
```

---

## 4. Validar Token de Empresa

**URL:** `GET /api/enterprise/auth/validate`

**Autenticación:** Cookie `enterprise_access_token` requerida.

**Descripción:** Valida el token JWT de la empresa. Devuelve los datos completos de la empresa si el token es válido.

**Salida (200):**
```json
{
  "status": "Success",
  "message": "Token is valid",
  "token": "<JWT>",
  "data": {
    "id": 1,
    "name": "Mi Empresa",
    "email": "info@empresa.com",
    "phone": null,
    "cif": null,
    "website": null,
    "address_line1": null,
    "address_line2": null,
    "city": null,
    "province": null,
    "postal_code": null,
    "country": "ES",
    "verified": 0,
    "type": "enterprise"
  }
}
```

**Errores:**
- `401` — No se proporcionó token o token inválido.

---

## Notas generales

- **Cookie:** `enterprise_access_token` — `httpOnly`, `secure` en producción, `sameSite: lax`.
- **Expiración:** `process.env.JWT_COOKIES_EXPIRATION_TIME` días.
- **JWT Payload:** `{ email, type: "enterprise", enterprise_id }`.
- **Middleware de protección:** `enterpriseAuthorization.isEnterpriseLoged` para endpoints que requieren sesión de empresa.
