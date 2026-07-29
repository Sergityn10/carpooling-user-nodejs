# Gestión de Errores y Códigos Estandarizados

## Índice

- [Arquitectura de Errores](#arquitectura-de-errores)
- [Estructura de Respuesta](#estructura-de-respuesta)
- [Entornos](#entornos-development-vs-production)
- [Catálogo de ErrorCodes](#catálogo-de-errorcodes)
  - [Errores de Validación (400)](#errores-de-validación-400)
  - [Errores de Autenticación (401)](#errores-de-autenticación-401)
  - [Errores de Autorización (403)](#errores-de-autorización-403)
  - [Errores de Recurso No Encontrado (404)](#errores-de-recurso-no-encontrado-404)
  - [Errores de Conflicto (409)](#errores-de-conflicto-409)
  - [Errores de Servidor (500)](#errores-de-servidor-500)
- [Errores de Prisma (Base de Datos)](#errores-de-prisma-base-de-datos)
- [Guía para el Frontend](#guía-para-el-frontend)

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

| Campo | Development | Production |
|---|---|---|
| `status` | ✅ | ✅ |
| `errorCode` | ✅ | ✅ |
| `message` | ✅ | ✅ (solo operacionales) |
| `error` (objeto completo) | ✅ | ❌ |
| `stack` (traza) | ✅ | ❌ |

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

| errorCode | Mensaje del Backend | Descripción |
|---|---|---|
| `VALIDATION_ERROR` | Los datos proporcionados no son válidos. | Falló la validación de Zod en el schema |
| `NO_FIELDS_TO_UPDATE` | No se han enviado campos para actualizar. | PATCH sin campos válidos en el body |
| `ADMIN_SELF_DELETE` | Un administrador no puede eliminarse a sí mismo. | Intento de auto-eliminación por admin |
| `INVALID_LOCATION` | Ubicación no válida: {detalle} | La ubicación no se pudo geocodificar o no tiene componente 'locality' |

### Errores de Autenticación (401)

| errorCode | Mensaje del Backend | Descripción |
|---|---|---|
| `UNAUTHORIZED` | No se ha podido identificar tu sesión. Inicia sesión de nuevo. | No hay usuario en `req.user` o cookie inválida |

### Errores de Autorización (403)

| errorCode | Mensaje del Backend | Descripción |
|---|---|---|
| `FORBIDDEN` | No tienes permiso para modificar este usuario. / No tienes permisos para eliminar a este usuario. | El usuario autenticado intenta operar sobre un recurso ajeno sin ser admin |

### Errores de Recurso No Encontrado (404)

| errorCode | Mensaje del Backend | Descripción |
|---|---|---|
| `USER_NOT_FOUND` | El usuario no existe. / User not found | El ID de usuario no existe en la base de datos |
| `ROUTE_NOT_FOUND` | No se puede encontrar la ruta {path} en este servidor | La URL solicitada no corresponde a ninguna ruta registrada |

### Errores de Conflicto (409)

| errorCode | Mensaje del Backend | Descripción |
|---|---|---|
| `DNI_DUPLICATE` | Ya existe un usuario registrado con este DNI/NIE. | El DNI/NIE ya está en uso por otro usuario |
| `DUPLICATE_ENTRY` | Ya existe un registro con alguno de los datos proporcionados (email, DNI, etc.). | Error de unique constraint de Prisma (P2002) |

### Errores de Servidor (500)

| errorCode | Mensaje del Backend | Descripción |
|---|---|---|
| `HASH_ERROR` | No se pudo procesar la contraseña. Inténtalo de nuevo. | Falló el hashing de bcrypt |
| `ENCRYPT_ERROR` | No se pudieron procesar los datos. Inténtalo de nuevo. | Falló el cifrado de campos sensibles |
| `DNI_CHECK_ERROR` | No se pudo verificar el DNI/NIE. Inténtalo de nuevo. | Error al consultar DNIs existentes |
| `SERVER_ERROR` | Algo salió mal. Por favor, inténtalo de nuevo más tarde. | Error genérico no operacional (solo en producción) |
| `INTERNAL_ERROR` | (default) | Código por defecto si no se especifica errorCode |

---

## Errores de Prisma (Base de Datos)

El `errorHandler` detecta automáticamente los errores de Prisma y los convierte en
`AppError` con códigos estandarizados. No es necesario lanzarlos manualmente.

| Código Prisma | errorCode | statusCode | Mensaje |
|---|---|---|---|
| `P2002` | `DUPLICATE_ENTRY` | 409 | Ya existe un registro con alguno de los datos proporcionados (email, DNI, etc.). |
| `P2025` | `NOT_FOUND` | 404 | El registro no fue encontrado. |
| `P2003` | `FOREIGN_KEY_CONSTRAINT` | 400 | Violación de clave foránea: el recurso relacionado no existe. |
| Otros `P2xxx` | `DATABASE_ERROR` | 500 | Error de base de datos: {code} |
| Validation | `DB_VALIDATION_ERROR` | 400 | Error de validación en la consulta a la base de datos. |

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
  VALIDATION_ERROR: "Por favor, revisa los datos introducidos.",
  NO_FIELDS_TO_UPDATE: "No has modificado ningún campo.",
  UNAUTHORIZED: "Tu sesión ha expirado. Por favor, inicia sesión de nuevo.",
  FORBIDDEN: "No tienes permisos para realizar esta acción.",
  USER_NOT_FOUND: "El usuario no existe.",
  ROUTE_NOT_FOUND: "La página solicitada no existe.",
  DNI_DUPLICATE: "Este DNI/NIE ya está registrado por otro usuario.",
  DUPLICATE_ENTRY: "Ya existe un registro con estos datos.",
  ADMIN_SELF_DELETE: "No puedes eliminar tu propia cuenta de administrador.",
  INVALID_LOCATION: "La ubicación no es válida. Prueba con otra ciudad.",
  HASH_ERROR: "No se pudo procesar la contraseña. Inténtalo de nuevo.",
  ENCRYPT_ERROR: "Error al procesar los datos. Inténtalo de nuevo.",
  DNI_CHECK_ERROR: "No se pudo verificar el DNI. Inténtalo de nuevo.",
  SERVER_ERROR: "Algo salió mal. Inténtalo más tarde.",
  INTERNAL_ERROR: "Error inesperado. Contacta con soporte.",
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
