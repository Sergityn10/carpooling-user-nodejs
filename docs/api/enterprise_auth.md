# Autenticación de Empresas (`/api/enterprise/auth`)

Endpoints para gestión de cuentas de organización/empresa (`role_id: 3`, rol `"enterprise"`), auto-registro corporativo público, autenticación, cambio de contraseñas y compatibilidad con el inicio de sesión unificado.

> **Nota de Arquitectura:**
> - Las organizaciones disponen de un flujo de acceso y registro totalmente separado e independiente al de los usuarios particulares:
>   - Registro web: `/enterprise/register`
>   - Inicio de sesión web: `/enterprise/login`
>   - Onboarding corporativo: `/enterprise/onboarding`
> - Para gestionar a los empleados, colaboradores e invitaciones corporativas de la organización, consulta [Gestión de Miembros e Invitaciones](enterprise_members.md).
> - Para la implementación en la Webapp y App Móvil, consulta la [Guía de Integración Frontend para Empresas](../frontend-enterprise-guide.md).

---

## 1. Auto-Registro Público de Organización / Empresa

**URL:** `POST /api/enterprise/auth/register`

**Autenticación:** No requerida (Pública).

**Descripción:** Da de alta una nueva organización corporativa en la plataforma de forma ágil. Para maximizar la facilidad de registro, únicamente se exige **correo corporativo** y **contraseña** (el nombre es opcional en esta fase y puede asignarse en el Onboarding). 
Tras crearse en base de datos con `onboarding_ended: false`, el servidor inicia sesión inmediatamente, emite el JWT correspondiente y establece la cookie segura `enterprise_access_token`.

**Entrada (body JSON):**
```json
{
  "email": "movilidad@empresa.com",
  "password": "Password123!#",
  "name": "Empresa Opcional S.L."
}
```

*Nota sobre campos:*
- `email`: Obligatorio. Formato email corporativo válido y único en el sistema.
- `password`: Obligatorio. Mínimo 8 caracteres, al menos una mayúscula, una minúscula, un número y un símbolo especial (`@$!%*?&_-#`).
- `name`: Opcional. Si se omite, se asigna temporalmente el alias del correo hasta que la empresa complete el onboarding.

**Salida (201 Created):**
```json
{
  "status": "Success",
  "message": "Organización registrada exitosamente.",
  "token": "<JWT_access_token>",
  "role": "enterprise",
  "enterprise": {
    "id": "ent-uuid-999",
    "name": "Empresa Opcional S.L.",
    "email": "movilidad@empresa.com",
    "description": null,
    "location": null,
    "phone": null,
    "cif": null,
    "website": null,
    "logo": null,
    "contactPerson": null,
    "sector": null,
    "employeeCount": null,
    "country": "ES",
    "verified": false,
    "onboarding_ended": false,
    "isActive": true,
    "role": "enterprise",
    "createdAt": "2026-11-06T08:30:00.000Z"
  }
}
```

**Cookies establecidas:** `enterprise_access_token` (`httpOnly`, `path: /`).

**Errores:**
- `400` — Validación de esquema fallida (contraseña débil o formato de email incorrecto).
- `409` — Ya existe una empresa registrada con ese correo electrónico.

---

## 2. Login Directo de Empresa

**URL:** `POST /api/enterprise/auth/login`

**Autenticación:** No requerida.

**Descripción:** Autentica una empresa con email y contraseña corporativa. Valida que la empresa no haya sido eliminada lógicamente (`is_deleted: false`) y que esté activa (`is_active: true`). Emite un JWT con `role: "enterprise"` y establece la cookie `enterprise_access_token`.

**Entrada (body JSON):**
```json
{
  "email": "movilidad@empresa.com",
  "password": "Password123!#"
}
```

**Salida (200 OK):**
```json
{
  "status": "Success",
  "message": "Inicio de sesión correcto.",
  "token": "<JWT_access_token>",
  "role": "enterprise",
  "enterprise": {
    "id": "ent-uuid-999",
    "name": "Iberdrola S.A.",
    "email": "movilidad@empresa.com",
    "sector": "Energía",
    "location": "Bilbao / Madrid",
    "onboarding_ended": true,
    "role": "enterprise",
    "isActive": true
  }
}
```

**Regla de Redirección Frontend:**
- Si `enterprise.onboarding_ended === false` ➔ Redirigir inmediatamente a `/enterprise/onboarding`.
- Si `enterprise.onboarding_ended === true` ➔ Redirigir al panel principal `/enterprise/dashboard`.

**Errores:**
- `400` — Validación de esquema fallida.
- `401` — Credenciales incorrectas.
- `403` — Organización dada de baja o suspendida temporalmente.

---

## 3. Alta Administrativa de Empresas (Solo SuperAdmin)

**URL:** `POST /api/admin/enterprises`

**Autenticación:** Requerida (Solo Super Administrador de la plataforma con token Bearer o cookie de admin).

**Descripción:** Permite a los administradores de YouConnext crear directamente entidades completas y pre-configuradas con datos de sede, CIF y auditoría.

**Entrada (body JSON):**
```json
{
  "name": "Iberdrola S.A.",
  "email": "movilidad@iberdrola.com",
  "password": "Password123!#",
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

**Salida (201 Created):** Retorna la entidad creada con código 201.

---

## 4. Cambio de Contraseña de Empresa

**URL:** `PATCH /api/enterprise/auth/change-password`

**Autenticación:** Requerida (`isEnterpriseLoged`).

**Descripción:** Permite a la propia organización actualizar su clave corporativa en sesión. Valida la contraseña actual, exige complejidad de seguridad y previene reutilización inmediata.

**Entrada (body JSON):**
```json
{
  "current_password": "OldPassword123!#",
  "new_password": "NewStrongPassword2026@",
  "confirm_password": "NewStrongPassword2026@"
}
```

**Salida (200 OK):**
```json
{
  "status": "Success",
  "message": "Contraseña modificada correctamente con las directivas de seguridad requeridas."
}
```

---

## 5. Logout de Empresa

**URL:** `GET /api/enterprise/auth/logout`

**Autenticación:** No requerida.

**Descripción:** Cierra la sesión corporativa eliminando la cookie `enterprise_access_token`.

**Salida (200 OK):**
```json
{
  "status": "Success",
  "message": "Sesión cerrada correctamente."
}
```

---

## 6. Validar Token de Empresa

**URL:** `GET /api/enterprise/auth/validate`

**Autenticación:** Bearer Token o Cookie `enterprise_access_token` requerida.

**Descripción:** Valida la sesión activa de la empresa y devuelve los datos corporativos actualizados, incluyendo el estado de `onboarding_ended`.

**Salida (200 OK):**
```json
{
  "status": "Success",
  "message": "Token válido.",
  "token": "<JWT>",
  "role": "enterprise",
  "enterprise": {
    "id": "ent-uuid-999",
    "name": "Mi Empresa S.L.",
    "email": "info@empresa.com",
    "cif": "B12345678",
    "website": "https://miempresa.com",
    "description": "Compromiso con el carpooling corporativo",
    "location": "Cáceres",
    "onboarding_ended": true,
    "role": "enterprise"
  }
}
```

**Errores:**
- `401` — Token no válido, expirado o cuenta inactiva.

---

## 7. Flujo de Redirección Web con Google OAuth (Navegador)

Permite a los usuarios corporativos autorizar el acceso a través de la interfaz web estándar de Google mediante OAuth 2.0 Authorization Code Grant.

### 7.1. Generar URL de Autorización Google

**URL:** `POST /api/enterprise/auth/oauth`

**Autenticación:** No requerida.

**Query / Parámetros:**
- `method`: Obligatorio (`login` o `register`).

**Salida (200 OK):**
```json
{
  "status": "Success",
  "url": "https://accounts.google.com/o/oauth2/v2/auth?access_type=offline&scope=profile%20openid%20email&prompt=consent&response_type=code&client_id=...&redirect_uri=..."
}
```

El frontend debe redirigir al navegador a esta URL:
```javascript
const response = await fetch('/api/enterprise/auth/oauth?method=login', { method: 'POST' });
const data = await response.json();
window.location.href = data.url;
```

---

### 7.2. Callback de Registro con Google

**URL:** `GET /api/enterprise/auth/oauth/register?code=<authorization_code>`

**Comportamiento del Servidor:**
1. Intercambia el código temporal de Google por un token de acceso y consulta el perfil del usuario (`userinfo`).
2. Verifica si ya existe una empresa con ese correo electrónico en la base de datos:
   - Si ya existe: redirige a `${FRONTEND_URL}enterprise/register?error=enterprise_exists`.
3. Si no existe:
   - Crea la entidad en `Enterprise` con:
     - `name`: Nombre reportado por la cuenta de Google (o alias del correo).
     - `email`: Correo verificado por Google.
     - `password`: Hash criptográfico seguro y aleatorio.
     - `verified`: `true`.
     - `onboarding_ended`: `false` (requiere cumplimentar el onboarding corporativo).
     - `role_id`: 3 (`enterprise`).
     - `is_active`: `true`.
   - Genera un token JWT corporativo (`EnterpriseUser.generateJwtToken()`).
   - Establece la cookie `enterprise_access_token`.
   - Redirige al frontend:
     `${FRONTEND_URL}enterprise/onboarding?token=<JWT>&enterpriseId=<id>`

---

### 7.3. Callback de Login con Google

**URL:** `GET /api/enterprise/auth/oauth/login?code=<authorization_code>`

**Comportamiento del Servidor:**
1. Intercambia el código por tokens y recupera el correo verificado de Google.
2. Busca la organización en la base de datos:
   - Si no existe: redirige a `${FRONTEND_URL}enterprise/login?error=enterprise_not_found`.
   - Si fue dada de baja (`is_deleted: true`): redirige a `${FRONTEND_URL}enterprise/login?error=enterprise_deleted`.
   - Si está temporalmente inactiva (`is_active: false`): redirige a `${FRONTEND_URL}enterprise/login?error=enterprise_inactive`.
3. Genera el token JWT corporativo y establece la cookie `enterprise_access_token`.
4. Ruteo inteligente:
   - Si `enterprise.onboarding_ended === true`: Redirige al panel corporativo `${FRONTEND_URL}enterprise/dashboard?token=<JWT>`.
   - Si `enterprise.onboarding_ended === false`: Redirige al onboarding corporativo `${FRONTEND_URL}enterprise/onboarding?token=<JWT>&enterpriseId=<id>`.

---

## 8. Autenticación Directa por ID Token de Google (One-Tap / React SDK)

Ideal para botones nativos en Webapp (React / Vue) y aplicaciones móviles donde la autenticación con Google ocurre localmente en el cliente mediante Google Identity Services (`@react-oauth/google`).

**URL:** `POST /api/enterprise/auth/google` (o alias `POST /api/enterprise/auth/oauth/google`)

**Autenticación:** No requerida.

**Entrada (body JSON):**
```json
{
  "id_token": "eyJhbGciOiJSUzI1NiIsImtpZCI6...",
  "method": "auto"
}
```

*Parámetros:*
- `id_token`: Obligatorio. JWT firmado emitido directamente por Google Identity Services.
- `method`: Opcional (`"auto"`, `"login"` o `"register"`). Por defecto es `"auto"`.
  - `"auto"`: Si la empresa existe, inicia sesión; si no existe, la registra automáticamente.
  - `"login"`: Exige que la empresa exista previamente (de lo contrario devuelve `404`).
  - `"register"`: Exige que la empresa no exista previamente (de lo contrario devuelve `409`).

**Salida - Registro Exitoso (201 Created):**
```json
{
  "status": "Success",
  "message": "Organización registrada exitosamente mediante Google.",
  "token": "<JWT_Token>",
  "role": "enterprise",
  "is_new": true,
  "enterprise": {
    "id": "ent-uuid-999",
    "name": "Acme Mobility S.L.",
    "email": "corp@acme.com",
    "verified": true,
    "onboarding_ended": false,
    "isActive": true,
    "role": "enterprise"
  }
}
```

**Salida - Login Exitoso (200 OK):**
```json
{
  "status": "Success",
  "message": "Inicio de sesión corporativo con Google exitoso.",
  "token": "<JWT_Token>",
  "role": "enterprise",
  "is_new": false,
  "enterprise": {
    "id": "ent-uuid-999",
    "name": "Acme Mobility S.L.",
    "email": "corp@acme.com",
    "verified": true,
    "onboarding_ended": true,
    "isActive": true,
    "role": "enterprise"
  }
}
```

**Cookies establecidas:** `enterprise_access_token` (`httpOnly`, `secure`, `sameSite`, `path: /`).

**Errores:**
- `400` — `id_token` ausente o inválido, o no se pudo extraer el email de Google.
- `401` — Token de Google expirado o con firma no válida (`GOOGLE_TOKEN_INVALID`).
- `403` — Organización dada de baja o suspendida.
- `404` — Organización no encontrada (cuando se especifica `method: "login"`).
- `409` — Organización ya existente (cuando se especifica `method: "register"`).

---

## 9. Login Unificado con Google (`POST /api/auth/unified-login`)

El endpoint unificado de la plataforma también admite la autenticación corporativa mediante Google ID Token indicando `auth_type: "enterprise"`.

**Entrada (body JSON):**
```json
{
  "id_token": "eyJhbGciOiJSUzI1NiIs...",
  "auth_type": "enterprise"
}
```

**Salida (200 OK):**
Retorna la estructura unificada `toUnifiedAuthResponse` con `type: "LEGAL_ENTITY"`, `classification: "ORGANIZATION"`, roles, permisos corporativos y ambas cookies (`enterprise_access_token` y `access_token`).
