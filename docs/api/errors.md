# Gestión de Errores y Códigos Estandarizados

## Índice

- [Gestión de Errores y Códigos Estandarizados](#gestión-de-errores-y-códigos-estandarizados)
  - [Índice](#índice)
  - [Arquitectura de Errores](#arquitectura-de-errores)
    - [1. `AppError` (`app/utils/appError.js`)](#1-apperror-apputilsapperrorjs)
    - [2. `catchAsync` (`app/utils/catchAsync.js`)](#2-catchasync-apputilscatchasyncjs)
    - [3. `errorHandler` (`app/middlewares/errorHandler.js`)](#3-errorhandler-appmiddlewareserrorhandlerjs)
  - [Estructura de Respuesta](#estructura-de-respuesta)
    - [Error Operacional (4xx)](#error-operacional-4xx)
    - [Error de Servidor (5xx) — Producción](#error-de-servidor-5xx--producción)
    - [Error en Desarrollo](#error-en-desarrollo)
    - [Respuesta de Éxito (referencia)](#respuesta-de-éxito-referencia)
  - [Entornos: Development vs Production](#entornos-development-vs-production)
  - [Catálogo de ErrorCodes](#catálogo-de-errorcodes)
    - [Errores de Validación (400)](#errores-de-validación-400)
    - [Errores de Autenticación (401)](#errores-de-autenticación-401)
    - [Errores de Autorización (403)](#errores-de-autorización-403)
    - [Errores de Recurso No Encontrado (404)](#errores-de-recurso-no-encontrado-404)
    - [Errores de Conflicto (409)](#errores-de-conflicto-409)
    - [Errores de Servidor (500)](#errores-de-servidor-500)
    - [Errores de Servicio Externo (502)](#errores-de-servicio-externo-502)
  - [Errores de Prisma (Base de Datos)](#errores-de-prisma-base-de-datos)
  - [Guía para el Frontend](#guía-para-el-frontend)
    - [Recomendación: Usar `errorCode` para personalizar mensajes](#recomendación-usar-errorcode-para-personalizar-mensajes)
    - [Ejemplo de mapeo en el frontend](#ejemplo-de-mapeo-en-el-frontend)
    - [Ejemplo de interceptor (Axios / Fetch)](#ejemplo-de-interceptor-axios--fetch)
    - [Estructura de respuesta para el frontend](#estructura-de-respuesta-para-el-frontend)
    - [Flujo de errores](#flujo-de-errores)

---

## Arquitectura de Errores

El backend utiliza un sistema centralizado de manejo de errores con tres componentes principales:

### 1. `AppError` (`app/utils/appError.js`)

Clase personalizada para errores operacionales (predecibles y controlados).

```js
class AppError extends Error {
  constructor(message, statusCode, errorCode = "INTERNAL_ERROR") {
    super(message);
    this.statusCode = statusCode;       // HTTP status code (400, 404, 500, etc.)
    this.status = `${statusCode}`.startsWith("4") ? "fail" : "error";
    this.errorCode = errorCode;         // Código estandarizado para el frontend
    this.isOperational = true;          // Indica que es un error controlado
    Error.captureStackTrace(this, this.constructor);
  }
}
```

### 2. `catchAsync` (`app/utils/catchAsync.js`)

Wrapper que elimina la necesidad de `try/catch` en cada controlador. Cualquier error
no capturado se pasa automáticamente al middleware central de errores vía `next()`.

```js
const controller = catchAsync(async (req, res, next) => {
  // Si algo falla aquí, catchAsync lo captura y llama a next(err)
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    return next(new AppError("Usuario no encontrado", 404, "USER_NOT_FOUND"));
  }
  res.status(200).send({ status: "Success", data: user });
});
```

### 3. `errorHandler` (`app/middlewares/errorHandler.js`)

Middleware central que procesa **todos** los errores de la aplicación. Se registra
como último middleware en Express.

Funciones:
- Formatea la respuesta según el entorno (dev/prod).
- Convierte errores de Prisma a `AppError` con códigos legibles.
- En producción, oculta detalles sensibles de errores no operacionales.

---

## Estructura de Respuesta

### Error Operacional (4xx)

Errores lanzados intencionalmente con `AppError`. Siempre incluyen `errorCode`.

```json
{
  "status": "fail",
  "errorCode": "VALIDATION_ERROR",
  "message": "Los datos proporcionados no son válidos."
}
```

### Error de Servidor (5xx) — Producción

Errores no controlados (bugs, caída de BD, etc.). El mensaje real se oculta
por seguridad.

```json
{
  "status": "error",
  "errorCode": "SERVER_ERROR",
  "message": "Algo salió mal. Por favor, inténtalo de nuevo más tarde."
}
```

### Error en Desarrollo

En desarrollo (`NODE_ENV=development`), **todos** los errores incluyen información
completa para debugging:

```json
{
  "status": "fail",
  "errorCode": "VALIDATION_ERROR",
  "error": {
    "statusCode": 400,
    "status": "fail",
    "errorCode": "VALIDATION_ERROR",
    "isOperational": true
  },
  "message": "Los datos proporcionados no son válidos.",
  "stack": "AppError: Los datos proporcionados no son válidos.\n    at ..."
}
```

### Respuesta de Éxito (referencia)

```json
{
  "status": "Success",
  "message": "Usuario actualizado correctamente.",
  "data": { ... }
}
```

---

## Entornos: Development vs Production

| Campo                     | Development | Production             |
| ------------------------- | ----------- | ---------------------- |
| `status`                  | ✅           | ✅                      |
| `errorCode`               | ✅           | ✅                      |
| `message`                 | ✅           | ✅ (solo operacionales) |
| `error` (objeto completo) | ✅           | ❌                      |
| `stack` (traza)           | ✅           | ❌                      |

En producción, los errores **no operacionales** (bugs) devuelven siempre:
```json
{
  "status": "error",
  "errorCode": "SERVER_ERROR",
  "message": "Algo salió mal. Por favor, inténtalo de nuevo más tarde."
}
```

---

## Catálogo de ErrorCodes

### Errores de Validación (400)

| errorCode                      | Mensaje del Backend                                                                              | Descripción                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `VALIDATION_ERROR`             | Los datos proporcionados no son válidos.                                                         | Falló la validación de Zod en el schema                               |
| `NO_FIELDS_TO_UPDATE`          | No se han enviado campos para actualizar.                                                        | PATCH sin campos válidos en el body                                   |
| `ADMIN_SELF_DELETE`            | Un administrador no puede eliminarse a sí mismo.                                                 | Intento de auto-eliminación por admin                                 |
| `INVALID_LOCATION`             | Ubicación no válida: {detalle}                                                                   | La ubicación no se pudo geocodificar o no tiene componente 'locality' |
| `CONSENTS_REQUIRED`            | Debes aceptar la Política de Privacidad y los Términos de Servicio para registrarte.             | Faltan consents obligatorios en el registro                           |
| `INVALID_OAUTH_METHOD`         | Método no válido. Debe ser 'login' o 'register'.                                                 | Parámetro `method` inválido en OAuth                                  |
| `GOOGLE_TOKEN_MISSING`         | Falta el token de Google (id_token). No se puede verificar la identidad.                         | No se envió `id_token` en OAuth Android                               |
| `GOOGLE_NO_EMAIL`              | Tu cuenta de Google no tiene un correo asociado. Revisa la configuración de tu cuenta de Google. | La cuenta de Google no tiene email                                    |
| `WRONG_AUTH_METHOD`            | Esta cuenta fue creada con Google. / Esta cuenta no fue creada con Google.                       | Intento de login con método distinto al del registro                  |
| `STRIPE_CUSTOMER_MISSING`      | Sender does not have a Stripe customer account                                                   | El usuario no tiene cuenta de cliente en Stripe                       |
| `STRIPE_CONNECT_MISSING`       | Recipient does not have a Stripe Connect account                                                 | El destinatario no tiene cuenta Connect en Stripe                     |
| `STRIPE_ONBOARDING_INCOMPLETE` | Recipient has not completed Stripe onboarding... / Onboarding not completed...                   | El onboarding de Stripe no ha sido completado                         |
| `STRIPE_ACCOUNT_EXISTS`        | You already have an account                                                                      | El usuario ya tiene una cuenta de Stripe Connect                      |
| `STRIPE_CUSTOMER_EXISTS`       | You already have an account                                                                      | El usuario ya tiene una cuenta de cliente en Stripe                   |
| `STRIPE_BALANCE_INSUFFICIENT`  | No tienes suficiente dinero para retirar                                                         | Saldo insuficiente en Stripe para crear un payout                     |
| `PAYMENT_CANCEL_FAILED`        | El pago ha sido ya realizado y no se puede cancelar.                                             | No se pudo cancelar el payment intent en Stripe                       |
| `INSUFFICIENT_BALANCE`         | Insufficient wallet balance                                                                      | Saldo insuficiente en el monedero para el payout                      |
| `STRIPE_PAYOUT_FAILED`         | Payout creation failed                                                                           | Falló la creación del payout en Stripe (saldo insuficiente u otro)    |

### Errores de Autenticación (401)

| errorCode                | Mensaje del Backend                                                                          | Descripción                                     |
| ------------------------ | -------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `UNAUTHORIZED`           | No se ha podido identificar tu sesión. Inicia sesión de nuevo.                               | No hay usuario en `req.user` o cookie inválida  |
| `INVALID_CREDENTIALS`    | La contraseña introducida no es correcta. Inténtalo de nuevo.                                | Password incorrecta en login                    |
| `GOOGLE_TOKEN_INVALID`   | El token de Google no es válido o ha expirado. Cierra sesión en Google e inténtalo de nuevo. | Verificación de `id_token` de Google fallida    |
| `GOOGLE_PAYLOAD_MISSING` | No se pudo obtener la información de tu cuenta de Google. Inténtalo de nuevo.                | Google no devolvió payload tras verificar token |
| `NO_REFRESH_TOKEN`       | No hay sesión activa. Inicia sesión de nuevo.                                                | No hay cookie `refresh_token`                   |
| `REFRESH_TOKEN_INVALID`  | La sesión ha expirado o no es válida. Inicia sesión de nuevo.                                | Refresh token no encontrado o revocado          |
| `REFRESH_TOKEN_EXPIRED`  | Tu sesión ha expirado. Inicia sesión de nuevo para continuar.                                | Refresh token expirado                          |
| `TOKEN_MISSING`          | No se ha proporcionado ningún token de autenticación.                                        | No hay Bearer token ni cookie `access_token`    |
| `TOKEN_EXPIRED`          | El token de acceso ha expirado o no es válido. Inicia sesión de nuevo.                       | JWT verification fallida                        |
| `TOKEN_USER_NOT_FOUND`   | El usuario asociado a este token ya no existe.                                               | Usuario del token/refresh token no existe en BD |

### Errores de Autorización (403)

| errorCode        | Mensaje del Backend                                                                               | Descripción                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `FORBIDDEN`      | No tienes permiso para modificar este usuario. / No tienes permisos para eliminar a este usuario. | El usuario autenticado intenta operar sobre un recurso ajeno sin ser admin |
| `WALLET_BLOCKED` | Wallet blocked                                                                                    | La cuenta del monedero está bloqueada                                      |

### Errores de Recurso No Encontrado (404)

| errorCode                   | Mensaje del Backend                                                               | Descripción                                                |
| --------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `USER_NOT_FOUND`            | El usuario no existe. / User not found                                            | El ID de usuario no existe en la base de datos             |
| `EMAIL_NOT_REGISTERED`      | No existe ninguna cuenta con este correo electrónico. ¿Te has registrado ya?      | Email no registrado al intentar login                      |
| `EVENT_NOT_FOUND`           | Event not found                                                                   | El evento no existe o fue eliminado                        |
| `COMPANY_NOT_FOUND`         | Company not found                                                                 | La empresa no existe al crear/actualizar un evento         |
| `TAG_NOT_FOUND`             | Tag not found                                                                     | El tag no existe al intentar eliminar                      |
| `NOT_JOINED_EVENT`          | Not joined this event                                                             | El usuario no está inscrito al evento al intentar salir    |
| `SUGGESTION_NOT_FOUND`      | Suggestion not found                                                              | La sugerencia no existe o fue eliminada                    |
| `PAYMENT_INTENT_NOT_FOUND`  | No payment intent found for this reservation / Payment intent not found in Stripe | No se encontró el payment intent en la BD o en Stripe      |
| `STRIPE_ACCOUNT_NOT_FOUND`  | You dont have an account / El usuario no tiene cuenta de Stripe                   | El usuario no tiene cuenta de Stripe Connect               |
| `STRIPE_CUSTOMER_NOT_FOUND` | You dont have an account                                                          | El usuario no tiene cuenta de cliente en Stripe            |
| `REPORT_EMPTY`              | No CAEs found in this report                                                      | El reporte CAE no contiene items para exportar             |
| `ROUTE_NOT_FOUND`           | No se puede encontrar la ruta {path} en este servidor                             | La URL solicitada no corresponde a ninguna ruta registrada |

### Errores de Conflicto (409)

| errorCode                          | Mensaje del Backend                                                                                 | Descripción                                       |
| ---------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `DNI_DUPLICATE`                    | Ya existe un usuario registrado con este DNI/NIE.                                                   | El DNI/NIE ya está en uso por otro usuario        |
| `EMAIL_ALREADY_REGISTERED`         | Ya existe una cuenta registrada con este correo electrónico.                                        | Email ya existe al registrar o comprobar          |
| `DUPLICATE_ENTRY`                  | Ya existe un registro con alguno de los datos proporcionados (email, DNI, etc.).                    | Error de unique constraint de Prisma (P2002)      |
| `TAG_ALREADY_EXISTS`               | Tag already exists                                                                                  | El tag ya existe al intentar crear                |
| `ALREADY_JOINED_EVENT`             | Already joined this event                                                                           | El usuario ya está inscrito en el evento          |
| `SUGGESTION_EMAIL_DUPLICATE`       | A suggestion with this email already exists / Email already exists                                  | El email ya está en uso en otra sugerencia        |
| `SUGGESTION_ALREADY_ACCEPTED`      | Suggestion already accepted                                                                         | La sugerencia ya fue aceptada                     |
| `COMPANY_EMAIL_DUPLICATE`          | A company with this email already exists                                                            | Ya existe una empresa con ese email               |
| `PAYMENT_INTENT_ALREADY_COMPLETED` | Payment intent is already succeeded/canceled / El pago ha sido ya realizado y no se puede cancelar. | El payment intent ya está completado o cancelado  |
| `WALLET_BALANCE_CHANGED`           | Balance changed, try again                                                                          | El saldo cambió durante la transacción, reintenta |

### Errores de Servidor (500)

| errorCode                  | Mensaje del Backend                                             | Descripción                                        |
| -------------------------- | --------------------------------------------------------------- | -------------------------------------------------- |
| `HASH_ERROR`               | No se pudo procesar la contraseña. Inténtalo de nuevo.          | Falló el hashing de bcrypt                         |
| `ENCRYPT_ERROR`            | No se pudieron procesar los datos. Inténtalo de nuevo.          | Falló el cifrado de campos sensibles               |
| `DNI_CHECK_ERROR`          | No se pudo verificar el DNI/NIE. Inténtalo de nuevo.            | Error al consultar DNIs existentes                 |
| `REGISTRATION_FAILED`      | No se pudo completar el registro. Inténtalo de nuevo más tarde. | Fallo al crear usuario en OAuth Android            |
| `SERVER_ERROR`             | Algo salió mal. Por favor, inténtalo de nuevo más tarde.        | Error genérico no operacional (solo en producción) |
| `INTERNAL_ERROR`           | (default)                                                       | Código por defecto si no se especifica errorCode   |
| `WALLET_ACCOUNT_NOT_FOUND` | Wallet account not found                                        | No se encontró la cuenta del monedero en la BD     |
| `WALLET_PAYOUT_FAILED`     | (mensaje dinámico)                                              | Fallo genérico al procesar un payout del monedero  |

### Errores de Servicio Externo (502)

| errorCode                       | Mensaje del Backend                                              | Descripción                                                |
| ------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------- |
| `TRAYECTOS_SERVICE_UNAVAILABLE` | Error fetching/creating/updating/deleting from trayectos service | El microservicio de trayectos no respondió o devolvió null |
| `STRIPE_PAYOUT_FAILED`          | Stripe payout failed                                             | Falló la creación del payout en Stripe                     |

---

## Errores de Prisma (Base de Datos)

El `errorHandler` detecta automáticamente los errores de Prisma y los convierte en
`AppError` con códigos estandarizados. No es necesario lanzarlos manualmente.

| Código Prisma | errorCode                | statusCode | Mensaje                                                                          |
| ------------- | ------------------------ | ---------- | -------------------------------------------------------------------------------- |
| `P2002`       | `DUPLICATE_ENTRY`        | 409        | Ya existe un registro con alguno de los datos proporcionados (email, DNI, etc.). |
| `P2025`       | `NOT_FOUND`              | 404        | El registro no fue encontrado.                                                   |
| `P2003`       | `FOREIGN_KEY_CONSTRAINT` | 400        | Violación de clave foránea: el recurso relacionado no existe.                    |
| Otros `P2xxx` | `DATABASE_ERROR`         | 500        | Error de base de datos: {code}                                                   |
| Validation    | `DB_VALIDATION_ERROR`    | 400        | Error de validación en la consulta a la base de datos.                           |

---

## Guía para el Frontend

### Recomendación: Usar `errorCode` para personalizar mensajes

El campo `message` del backend está en español y puede usarse directamente, pero
se recomienda usar `errorCode` para mostrar mensajes personalizados en el frontend,
ya que:

1. **El `errorCode` es estable** — no cambia entre versiones, el `message` sí.
2. **Permite internacionalización (i18n)** — el frontend puede traducir cada código.
3. **Permite UX personalizada** — algunos errores pueden mostrar modales, otros
   inline, otros redirigir, etc.

### Ejemplo de mapeo en el frontend

```typescript
const ERROR_MESSAGES: Record<string, string> = {
  // Validación (400)
  VALIDATION_ERROR: "Por favor, revisa los datos introducidos.",
  NO_FIELDS_TO_UPDATE: "No has modificado ningún campo.",
  ADMIN_SELF_DELETE: "No puedes eliminar tu propia cuenta de administrador.",
  INVALID_LOCATION: "La ubicación no es válida. Prueba con otra ciudad.",
  CONSENTS_REQUIRED: "Debes aceptar la política de privacidad y los términos de servicio.",
  INVALID_OAUTH_METHOD: "Método de OAuth no válido.",
  GOOGLE_TOKEN_MISSING: "Falta el token de Google. Inténtalo de nuevo.",
  GOOGLE_NO_EMAIL: "Tu cuenta de Google no tiene email asociado.",
  WRONG_AUTH_METHOD: "Esta cuenta usa otro método de inicio de sesión.",
  STRIPE_CUSTOMER_MISSING: "No tienes cuenta de cliente en Stripe. Configúrala primero.",
  STRIPE_CONNECT_MISSING: "El destinatario no tiene cuenta de Stripe Connect.",
  STRIPE_ONBOARDING_INCOMPLETE: "El onboarding de Stripe no está completado.",
  STRIPE_ACCOUNT_EXISTS: "Ya tienes una cuenta de Stripe configurada.",
  STRIPE_CUSTOMER_EXISTS: "Ya tienes una cuenta de cliente en Stripe.",
  STRIPE_BALANCE_INSUFFICIENT: "No tienes suficiente saldo en Stripe para retirar.",
  PAYMENT_CANCEL_FAILED: "No se pudo cancelar el pago. Es posible que ya se haya procesado.",
  INSUFFICIENT_BALANCE: "Saldo insuficiente en el monedero.",
  STRIPE_PAYOUT_FAILED: "No se pudo procesar el pago en Stripe. Inténtalo más tarde.",
  // Autenticación (401)
  UNAUTHORIZED: "Tu sesión ha expirado. Por favor, inicia sesión de nuevo.",
  INVALID_CREDENTIALS: "La contraseña no es correcta. Inténtalo de nuevo.",
  GOOGLE_TOKEN_INVALID: "El token de Google no es válido. Cierra sesión en Google e inténtalo de nuevo.",
  GOOGLE_PAYLOAD_MISSING: "No se pudo obtener tu información de Google. Inténtalo de nuevo.",
  NO_REFRESH_TOKEN: "No hay sesión activa. Inicia sesión de nuevo.",
  REFRESH_TOKEN_INVALID: "Tu sesión no es válida. Inicia sesión de nuevo.",
  REFRESH_TOKEN_EXPIRED: "Tu sesión ha expirado. Inicia sesión de nuevo.",
  TOKEN_MISSING: "No se ha proporcionado token de autenticación.",
  TOKEN_EXPIRED: "Tu sesión ha expirado. Inicia sesión de nuevo.",
  TOKEN_USER_NOT_FOUND: "El usuario asociado a esta sesión ya no existe.",
  // Autorización (403)
  FORBIDDEN: "No tienes permisos para realizar esta acción.",
  WALLET_BLOCKED: "Tu monedero está bloqueado. Contacta con soporte.",
  // No encontrado (404)
  USER_NOT_FOUND: "El usuario no existe.",
  EMAIL_NOT_REGISTERED: "No existe ninguna cuenta con este correo.",
  EVENT_NOT_FOUND: "El evento no existe o ha sido eliminado.",
  COMPANY_NOT_FOUND: "La empresa no existe.",
  TAG_NOT_FOUND: "El tag no existe.",
  NOT_JOINED_EVENT: "No estás inscrito en este evento.",
  SUGGESTION_NOT_FOUND: "La sugerencia no existe.",
  PAYMENT_INTENT_NOT_FOUND: "No se encontró el pago asociado.",
  STRIPE_ACCOUNT_NOT_FOUND: "No tienes cuenta de Stripe configurada.",
  STRIPE_CUSTOMER_NOT_FOUND: "No tienes cuenta de cliente en Stripe.",
  REPORT_EMPTY: "Este reporte no contiene CAEs para exportar.",
  ROUTE_NOT_FOUND: "La página solicitada no existe.",
  // Conflicto (409)
  DNI_DUPLICATE: "Este DNI/NIE ya está registrado por otro usuario.",
  EMAIL_ALREADY_REGISTERED: "Ya existe una cuenta con este correo electrónico.",
  DUPLICATE_ENTRY: "Ya existe un registro con estos datos.",
  TAG_ALREADY_EXISTS: "Este tag ya existe.",
  ALREADY_JOINED_EVENT: "Ya estás inscrito en este evento.",
  SUGGESTION_EMAIL_DUPLICATE: "Ya existe una sugerencia con este email.",
  SUGGESTION_ALREADY_ACCEPTED: "Esta sugerencia ya fue aceptada.",
  COMPANY_EMAIL_DUPLICATE: "Ya existe una empresa con este email.",
  PAYMENT_INTENT_ALREADY_COMPLETED: "Este pago ya fue completado o cancelado.",
  WALLET_BALANCE_CHANGED: "El saldo cambió. Inténtalo de nuevo.",
  // Servidor (500)
  HASH_ERROR: "No se pudo procesar la contraseña. Inténtalo de nuevo.",
  ENCRYPT_ERROR: "Error al procesar los datos. Inténtalo de nuevo.",
  DNI_CHECK_ERROR: "No se pudo verificar el DNI. Inténtalo de nuevo.",
  REGISTRATION_FAILED: "No se pudo completar el registro. Inténtalo más tarde.",
  SERVER_ERROR: "Algo salió mal. Inténtalo más tarde.",
  INTERNAL_ERROR: "Error inesperado. Contacta con soporte.",
  WALLET_ACCOUNT_NOT_FOUND: "No se encontró la cuenta del monedero.",
  WALLET_PAYOUT_FAILED: "No se pudo procesar el pago del monedero.",
  // Servicio externo (502)
  TRAYECTOS_SERVICE_UNAVAILABLE: "El servicio de trayectos no está disponible. Inténtalo más tarde.",
  STRIPE_PAYOUT_FAILED: "No se pudo procesar el pago en Stripe. Inténtalo más tarde.",
  // Prisma
  NOT_FOUND: "El recurso solicitado no fue encontrado.",
  FOREIGN_KEY_CONSTRAINT: "No se puede completar la operación porque falta un recurso relacionado.",
  DATABASE_ERROR: "Error en la base de datos. Contacta con soporte.",
  DB_VALIDATION_ERROR: "Los datos enviados no son válidos para la base de datos.",
};

function getErrorMessage(errorCode: string, fallbackMessage: string): string {
  return ERROR_MESSAGES[errorCode] ?? fallbackMessage ?? "Error desconocido.";
}
```

### Ejemplo de interceptor (Axios / Fetch)

```typescript
// Axios interceptor
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      const { status, errorCode, message } = error.response.data;

      // Personalizar según errorCode
      switch (errorCode) {
        case "UNAUTHORIZED":
          // Redirigir al login
          window.location.href = "/login";
          break;
        case "ROUTE_NOT_FOUND":
          // Redirigir a 404
          window.location.href = "/404";
          break;
        case "FORBIDDEN":
          // Mostrar modal de permisos
          showForbiddenModal();
          break;
        default:
          // Mostrar toast con mensaje personalizado
          showToast(getErrorMessage(errorCode, message));
      }
    }
    return Promise.reject(error);
  }
);
```

### Estructura de respuesta para el frontend

```typescript
interface ErrorResponse {
  status: "fail" | "error";
  errorCode: string;
  message: string;
  // Solo en desarrollo:
  error?: AppError;
  stack?: string;
}

interface SuccessResponse {
  status: "Success";
  message?: string;
  data?: unknown;
}
```

### Flujo de errores

```
Request → catchAsync(controller) → error?
  ├── No error → res.status(200).send({ status: "Success", ... })
  └── Error → next(err) → errorHandler
                              ├── Prisma error? → Convertir a AppError
                              ├── NODE_ENV=development → Respuesta completa con stack
                              └── NODE_ENV=production
                                    ├── isOperational → Respuesta con errorCode y message
                                    └── No operacional → Respuesta genérica SERVER_ERROR
```
