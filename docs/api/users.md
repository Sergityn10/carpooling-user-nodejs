# Gestión de Usuarios (`/api/users`)

Endpoints para consultar, actualizar y eliminar usuarios. La mayoría requieren autenticación.

---

## 1. Test de API

**URL:** `GET /api/test`

**Autenticación:** Requerida (`isLoged`).

**Descripción:** Endpoint de prueba para verificar que la API funciona y el middleware de autenticación está activo.

**Salida (200):**
```json
{
  "status": "Success",
  "message": "API is working correctly"
}
```

---

## 2. Listar todos los usuarios

**URL:** `GET /api/users`

**Autenticación:** Requerida (`isLoged`).

**Descripción:** Devuelve todos los usuarios de la BD con los campos sensibles desencriptados (email, phone, dni, etc.).

**Salida (200):** Array de objetos usuario:
```json
[
  {
    "id": 1,
    "email": "user@example.com",
    "name": "Juan",
    "phone": "600123456",
    "img_perfil": "url",
    "ciudad": "Madrid",
    "onboarding_ended": 1,
    "auth_method": "password",
    ...
  }
]
```

**Errores:**
- `500` — Error al obtener usuarios.

---

## 3. Obtener mi información de usuario

**URL:** `GET /api/users/info`

**Autenticación:** Requerida (`isLoged`).

**Descripción:** Devuelve la información completa del usuario autenticado, incluyendo valoración media, número de opiniones, número de viajes, preferencias y un objeto `completitud` que indica el porcentaje de perfil completado y los campos faltantes.

**Salida (200):**
```json
{
  "status": "Success",
  "message": "User found successfully",
  "data": {
    "name": "Juan",
    "surname": "García",
    "phone": "600123456",
    "email": "user@example.com",
    "img_perfil": "url",
    "role": "user",
    "fecha_nacimiento": "1990-01-15",
    "genero": "Masculino",
    "averageRating": 8.5,
    "numOpinions": 10,
    "myNumOpinions": 5,
    "about_me": "Texto descriptivo",
    "viajes": 15,
    "preferences": {
      "smoking_allowed": "0",
      "pets_allowed": "0",
      "music": "1",
      "talk_level": "normal",
      "temperature": "templado",
      "luggage_size": "medio",
      "stops_allowed": "0",
      "max_detour_km": "0"
    }
  },
  "completitud": {
    "porcentaje_total": 50,
    "campos_faltantes": [
      {
        "campo": "dni",
        "porcentaje_otorga": 35,
        "mensaje_sugerido": "Añade tu DNI/NIE para poder realizar y recibir pagos."
      },
      {
        "campo": "coche",
        "porcentaje_otorga": 30,
        "mensaje_sugerido": "Registra al menos un coche con matrícula para poder ofrecer trayectos."
      },
      {
        "campo": "telefono",
        "porcentaje_otorga": 15,
        "mensaje_sugerido": "Añade tu teléfono para mejorar la seguridad de tu cuenta."
      }
    ]
  }
}
```

**Completitud del perfil:**

El objeto `completitud` evalúa los siguientes campos y pesos:

| Campo               | Peso | Criterio                    | Mensaje sugerido                                                       |
| ------------------- | ---- | --------------------------- | ---------------------------------------------------------------------- |
| `dni`               | 35%  | `user.dni` no null          | Añade tu DNI/NIE para poder realizar y recibir pagos.                  |
| `coche` (matrícula) | 30%  | Al menos 1 coche registrado | Registra al menos un coche con matrícula para poder ofrecer trayectos. |
| `telefono`          | 15%  | `user.phone` no null        | Añade tu teléfono para mejorar la seguridad de tu cuenta.              |
| `avatar`            | 10%  | `user.img_perfil` no null   | Sube una foto de perfil para que otros usuarios te reconozcan.         |
| `nombre`            | 5%   | `user.name` no null         | Añade tu nombre para personalizar tu perfil.                           |
| `apellidos`         | 5%   | `user.surname` no null      | Añade tus apellidos para completar tu perfil.                          |

El `porcentaje_total` es la suma de los pesos de los campos completados (máx. 100). `campos_faltantes` contiene únicamente los campos no completados, ordenados por peso descendente.

**Completitud para generar CAEs (`completitud_cae`):**

Evalúa si el usuario tiene la información necesaria para poder generar CAEs (Certificados de Ahorro de Energía) según los criterios del Anexo III antifraude (sin avatar):

| Campo               | Peso | Criterio                    | Mensaje sugerido                                                                   |
| ------------------- | ---- | --------------------------- | ---------------------------------------------------------------------------------- |
| `dni`               | 35%  | `user.dni` no null          | Añade tu DNI/NIE para poder generar CAEs (requerido por el Anexo III antifraude).  |
| `coche` (matrícula) | 30%  | Al menos 1 coche registrado | Registra al menos un coche con matrícula para poder generar CAEs de tus trayectos. |
| `telefono`          | 15%  | `user.phone` no null        | Añade tu teléfono para incluirlo en el listado de viajeros del CAE.                |
| `nombre`            | 10%  | `user.name` no null         | Añade tu nombre para incluirlo en el listado de viajeros del CAE.                  |
| `apellidos`         | 10%  | `user.surname` no null      | Añade tus apellidos para completar el listado de viajeros del CAE.                 |

**Disponibilidad del monedero (`monedero`):**

Indica si el usuario tiene todo configurado para recibir ganancias:

| Campo                   | Tipo    | Descripción                                               |
| ----------------------- | ------- | --------------------------------------------------------- |
| `disponible`            | Boolean | `true` si charges y transfers están habilitados           |
| `stripe_account`        | Boolean | `true` si tiene cuenta Stripe Connect                     |
| `onboarding_completado` | Boolean | `true` si el onboarding de Stripe ha finalizado           |
| `charges_enabled`       | Boolean | `true` si Stripe permite cobros                           |
| `transfers_enabled`     | Boolean | `true` si Stripe permite transferencias                   |
| `details_submitted`     | Boolean | `true` si los datos de la cuenta Stripe están verificados |
| `wallet_activa`         | Boolean | `true` si la wallet account está activa (no bloqueada)    |
| `wallet_balance`        | Number  | Balance actual del monedero en céntimos (EUR)             |
| `mensaje`               | String  | Mensaje explicativo del estado actual del monedero        |

---

## 4. Obtener usuario por ID

**URL:** `GET /api/users/:id`

**Autenticación:** Requerida (`isLoged`).

**Descripción:** Devuelve los datos de un usuario específico por su ID, con campos sensibles desencriptados.

**Parámetros de URL:**
- `id` — ID numérico del usuario.

**Salida (200):** Objeto usuario completo (mismo formato que listado pero un solo objeto).

**Errores:**
- `404` — Usuario no encontrado.
- `500` — Error al obtener usuario.

---

## 5. Obtener información pública de usuario por ID

**URL:** `GET /api/users/:id/info`

**Autenticación:** No requerida.

**Descripción:** Devuelve información de perfil pública de un usuario: nombre, email, imagen, valoración media, número de opiniones, número de viajes, sobre mí y preferencias.

**Parámetros de URL:**
- `id` — ID numérico del usuario.

**Salida (200):**
```json
{
  "status": "Success",
  "message": "User found successfully",
  "data": {
    "userId": 1,
    "name": "Juan",
    "surname": null,
    "phone": "600123456",
    "email": "user@example.com",
    "img_perfil": "url",
    "role": "user",
    "averageRating": 8.5,
    "numOpinions": 10,
    "myNumOpinions": 5,
    "about_me": "Texto",
    "viajes": 15,
    "preferences": { ... }
  }
}
```

**Errores:**
- `404` — Usuario no encontrado.

---

## 6. Actualizar usuario por ID (PATCH)

**URL:** `PATCH /api/users/:id`

**Autenticación:** Requerida (`isLoged`). El usuario autenticado debe ser el mismo que el `:id`.

**Descripción:** Actualiza parcialmente los datos de un usuario. La contraseña se hashea antes de guardar. El DNI se encripta y se verifica que no exista ya en otro usuario. Los campos sensibles (`name`, `surname`, `dni`, `phone`, `direccion`, `provincia`, `codigo_postal`, `fecha_nacimiento`) se encriptan antes de persistir. Adicionalmente, sincroniza los datos del perfil con la cuenta Stripe Connect del usuario y el Stripe Customer mediante `updateStripeAccountFromProfile`, de forma no bloqueante.

**Parámetros de URL:**
- `id` — ID numérico del usuario.

**Entrada (body JSON, campos opcionales):**
```json
{
  "name": "string",
  "surname": "string",
  "phone": "string",
  "password": "string (mín. 6)",
  "img_perfil": "url",
  "fecha_nacimiento": "YYYY-MM-DD",
  "dni": "string (8 dígitos + letra)",
  "genero": "Masculino | Femenino | Otro",
  "ciudad": "string",
  "provincia": "string",
  "codigo_postal": "string",
  "direccion": "string",
  "pais": "string",
  "about_me": "string"
}
```

**Salida (200):**
```json
{
  "status": "Success",
  "message": "Usuario actualizado correctamente."
}
```

**Errores:**
- `400` — Los datos proporcionados no son válidos / No se han enviado campos para actualizar.
- `401` — No tienes permiso para modificar este usuario.
- `404` — El usuario no existe.
- `409` — Ya existe un usuario registrado con este DNI/NIE / Constraint único (P2002).
- `500` — No se pudo procesar la contraseña / No se pudo verificar el DNI / No se pudieron procesar los datos / No se pudo actualizar el usuario / Error inesperado.

---

## 7. Actualizar mi usuario (PATCH)

**URL:** `PATCH /api/users`

**Autenticación:** Requerida (`isLoged`).

**Descripción:** Similar al endpoint anterior pero actualiza al usuario autenticado sin necesidad de especificar ID. Usa el email del token para identificar al usuario. También sincroniza los datos con Stripe Connect.

**Entrada:** Igual que `PATCH /api/users/:id`.

**Salida (200):**
```json
{
  "status": "Success",
  "message": "Usuario actualizado correctamente."
}
```

**Errores:** Igual que el anterior excepto `401` por ID mismatch.

---

## 8. Eliminar usuario

**URL:** `DELETE /api/users/:id`

**Autenticación:** Requerida (`isLoged`). El usuario autenticado debe ser el mismo que el `:id`.

**Descripción:** Elimina un usuario y todos sus datos relacionados en cascada (coches, trayectos, reservas, comentarios, cuentas Stripe, wallet, telegram_info, disponibilidad_semanal, etc.). Usa una transacción con borrado best-effort de FKs. Limpia la cookie `access_token` al finalizar.

**Parámetros de URL:**
- `id` — ID numérico del usuario.

**Salida (200):**
```json
{
  "status": "Success",
  "message": "User deleted successfully"
}
```

**Errores:**
- `401` — No autorizado.
- `404` — Usuario no encontrado.
- `409` — Eliminación bloqueada por registros relacionados.
- `500` — Error al eliminar.

---

## 9. Buscar usuarios únicos por ubicación

**URL:** `GET /api/users/unique-by-location`

**Autenticación:** No requerida.

**Descripción:** Geocodifica una ubicación usando Google Maps, extrae la ciudad y devuelve los usuarios únicos que tienen esa ciudad asignada. Útil para mostrar usuarios disponibles en una zona.

**Query params:**
- `location` — Texto de ubicación (mín. 2 caracteres).

**Salida (200):**
```json
{
  "status": "Success",
  "location": {
    "query": "Madrid",
    "normalized_city": "Madrid",
    "formatted_address": "Madrid, Spain",
    "place_id": "ChIJ8TwowIWMQg0RvGgYzS",
    "lat": 40.4168,
    "lng": -3.7038,
    "country": "ES"
  },
  "count": 5,
  "users": [
    {
      "id": 1,
      "name": "Juan",
      "surname": "García",
      "img_perfil": "url",
      "ciudad": "Madrid"
    }
  ]
}
```

**Errores:**
- `400` — Ubicación no válida o no se pudo geocodificar.
- `500` — Error al obtener usuarios.

---

## Notas generales

- **Campos sensibles encriptados:** `dni`, `name`, `surname`, `phone`, `direccion`, `provincia`, `codigo_postal`, `fecha_nacimiento` (definidos en `USER_SENSITIVE_FIELDS`). Los valores encriptados se almacenan como strings en la BD (formato `iv_hex:encrypted_hex`).
- **Sincronización con Stripe:** Al actualizar el perfil, se sincronizan automáticamente los datos con la cuenta Stripe Connect del usuario (`individual.first_name` ← `name`, `individual.last_name` ← `surname`, `individual.email`, `individual.phone`, `individual.address`, `individual.dob`, `individual.id_number` ← `dni`, `individual.gender` ← `genero`, `business_profile`) y con el Stripe Customer (`name`, `email`, `phone`). Para Express accounts, los campos `individual` solo se actualizan antes del onboarding; `business_profile` y `email` siempre se pueden actualizar.
- **Preferencias:** Se almacenan en la tabla `user_preferences` con claves definidas en `preference_definitions`.
- **Valoración media:** Calculada desde la tabla `comments` donde `user_id_trayect` = ID del usuario.

---

## 10. Obtener información pública básica de un usuario

**URL:** `GET /api/users/:id/public`

**Autenticación:** No requerida.

**Descripción:** Devuelve información pública mínima de un usuario: `id`, `name`, `surname` (descifrados) e `img_perfil`. Pensado para mostrar avatares y nombres en chats, listas de participantes, etc.

**Parámetros de URL:**
- `id` — UUID del usuario.

**Salida (200):**
```json
{
  "status": "Success",
  "user": {
    "id": "uuid",
    "name": "Juan",
    "surname": "García",
    "img_perfil": "base64... o null"
  }
}
```

**Errores:**
- `404` — Usuario no encontrado.

---

## 11. Obtener información pública de múltiples usuarios (batch)

**URL:** `POST /api/users/public/batch`

**Autenticación:** No requerida.

**Descripción:** Devuelve información pública básica (`id`, `name`, `surname` descifrados, `img_perfil`) para un conjunto de usuarios en una sola petición. Útil para chats y listas.

**Entrada (body JSON):**
```json
{
  "ids": ["uuid-1", "uuid-2", "uuid-3"]
}
```

**Salida (200):**
```json
{
  "status": "Success",
  "users": [
    { "id": "uuid-1", "name": "Juan", "surname": "García", "img_perfil": "base64..." },
    { "id": "uuid-2", "name": "María", "surname": "López", "img_perfil": null }
  ]
}
```

**Errores:**
- `400` — `ids` debe ser un array no vacío.

---

## 12. Obtener perfil público completo de un usuario

**URL:** `GET /api/users/:id/profile`

**Autenticación:** No requerida.

**Descripción:** Devuelve el perfil público completo de un usuario, incluyendo datos personales públicos, coches (sin matrícula), estadísticas (valoración media, total de comentarios, eventos a los que asiste, viajes realizados y energía generada) y los 5 comentarios más recientes recibidos. Las estadísticas de viajes y energía se obtienen del microservicio de trayectos.

**Parámetros de URL:**
- `id` — UUID del usuario.

**Salida (200):**
```json
{
  "status": "Success",
  "user": {
    "id": "uuid",
    "name": "Juan",
    "surname": "García",
    "img_perfil": "base64... o null",
    "about_me": "Texto descriptivo del usuario",
    "genero": "M",
    "fecha_nacimiento": "1990-01-15",
    "ciudad": "Madrid",
    "provincia": "Madrid",
    "pais": "España",
    "created_at": "2024-01-01T00:00:00.000Z",
    "cars": [
      {
        "id_coche": "uuid",
        "marca": "Toyota",
        "modelo": "Corolla",
        "color": "Rojo",
        "tipo_combustible": "GASOLINA",
        "num_plazas": 5,
        "year": 2022
      }
    ],
    "stats": {
      "avg_rating": 4.5,
      "total_comments": 12,
      "events_joined": 3,
      "completed_trips": 15,
      "kwh_generated": 59.64,
      "eur_generated": 3.41
    },
    "recent_comments": [
      {
        "id_comment": "uuid",
        "opinion": "Muy buen conductor",
        "rating": 5,
        "id_trayecto": "uuid-trayecto",
        "user_id_commentator": "uuid-comentarista",
        "created_at": "2025-07-10T12:00:00.000Z"
      }
    ]
  }
}
```

**Campos devueltos:**

| Campo                   | Tipo             | Descripción                            |
| ----------------------- | ---------------- | -------------------------------------- |
| `id`                    | UUID             | Identificador del usuario              |
| `name`                  | String           | Nombre (descifrado)                    |
| `surname`               | String\|null     | Apellidos (descifrado)                 |
| `img_perfil`            | MediumText\|null | Foto de perfil (base64)                |
| `about_me`              | Text\|null       | Biografía/descripción                  |
| `genero`                | Enum\|null       | Género (`M`, `F`, `O`)                 |
| `fecha_nacimiento`      | String\|null     | Fecha de nacimiento (descifrada)       |
| `ciudad`                | String\|null     | Ciudad                                 |
| `provincia`             | String\|null     | Provincia (descifrada)                 |
| `pais`                  | String\|null     | País                                   |
| `created_at`            | DateTime         | Fecha de registro                      |
| `cars`                  | Array            | Coches del usuario (sin matrícula)     |
| `stats.avg_rating`      | Number           | Media de valoraciones (0-5, 1 decimal) |
| `stats.total_comments`  | Number           | Total de comentarios recibidos         |
| `stats.events_joined`   | Number           | Total de eventos a los que asiste      |
| `stats.completed_trips` | Number           | Viajes finalizados como conductor      |
| `stats.kwh_generated`   | Number           | kWh totales generados (2 decimales)    |
| `stats.eur_generated`   | Number           | EUR totales generados (2 decimales)    |
| `recent_comments`       | Array            | Últimos 5 comentarios recibidos        |

**Campos sensibles excluidos:** `email`, `password`, `phone`, `dni`, `direccion`, `codigo_postal`, `stripe_account`, `stripe_customer_account`, `google_id`, `auth_method`, `role_id`, `onboarding_ended`.

**Errores:**
- `404` — Usuario no encontrado.
