# Admin Accounts API

Gestión de cuentas de Stripe Connect (modelo `Account`) desde el panel de administrador.

## Modelo de datos

| Campo               | Tipo    | Descripción                               |
| ------------------- | ------- | ----------------------------------------- |
| `stripe_account_id` | String  | ID de la cuenta de Stripe Connect (PK)    |
| `user_id`           | String  | ID del usuario asociado                   |
| `charges_enabled`   | Boolean | Si la cuenta puede recibir cobros         |
| `transfers_enabled` | Boolean | Si la cuenta puede recibir transferencias |
| `details_submitted` | Boolean | Si el onboarding de Stripe está completo  |
| `default_account`   | Boolean | Si es la cuenta por defecto del usuario   |

## Endpoints

Todos los endpoints requieren autenticación con rol **admin** (`Authorization: Bearer <token>`).

---

### Listar cuentas

```
GET /api/admin/accounts
```

**Query params (opcionales):**

| Param               | Tipo    | Descripción                                    |
| ------------------- | ------- | ---------------------------------------------- |
| `limit`             | Number  | Cantidad de resultados (default: 50, max: 200) |
| `offset`            | Number  | Desplazamiento para paginación (default: 0)    |
| `charges_enabled`   | Boolean | Filtrar por `charges_enabled`                  |
| `transfers_enabled` | Boolean | Filtrar por `transfers_enabled`                |
| `details_submitted` | Boolean | Filtrar por `details_submitted`                |
| `user_id`           | String  | Filtrar por usuario                            |

**Respuesta 200:**

```json
{
  "status": "Success",
  "accounts": [
    {
      "stripe_account_id": "acct_1U23be1fnbBo0bch",
      "user_id": "e7971494-60b5-4e70-bd3c-cb0871fc1ae1",
      "charges_enabled": true,
      "transfers_enabled": true,
      "details_submitted": true,
      "default_account": false,
      "user": {
        "id": "e7971494-60b5-4e70-bd3c-cb0871fc1ae1",
        "email": "user@example.com",
        "name": "John",
        "surname": "Doe"
      }
    }
  ],
  "total": 1,
  "limit": 50,
  "offset": 0
}
```

---

### Obtener una cuenta

```
GET /api/admin/accounts/:stripeAccountId
```

**Respuesta 200:**

```json
{
  "status": "Success",
  "account": {
    "stripe_account_id": "acct_1U23be1fnbBo0bch",
    "user_id": "e7971494-60b5-4e70-bd3c-cb0871fc1ae1",
    "charges_enabled": true,
    "transfers_enabled": true,
    "details_submitted": true,
    "default_account": false,
    "user": {
      "id": "e7971494-60b5-4e70-bd3c-cb0871fc1ae1",
      "email": "user@example.com",
      "name": "John",
      "surname": "Doe"
    }
  }
}
```

**Errores:**

| Status | errorCode           | Descripción         |
| ------ | ------------------- | ------------------- |
| 404    | `ACCOUNT_NOT_FOUND` | La cuenta no existe |

---

### Crear una cuenta

```
POST /api/admin/accounts
```

**Body:**

```json
{
  "stripe_account_id": "acct_1U23be1fnbBo0bch",
  "user_id": "e7971494-60b5-4e70-bd3c-cb0871fc1ae1",
  "charges_enabled": false,
  "transfers_enabled": false,
  "details_submitted": false,
  "default_account": false
}
```

`charges_enabled`, `transfers_enabled`, `details_submitted` y `default_account` son opcionales (default: `false`).

**Respuesta 201:**

```json
{
  "status": "Success",
  "message": "Cuenta creada correctamente.",
  "account": { ... }
}
```

**Errores:**

| Status | errorCode                | Descripción                     |
| ------ | ------------------------ | ------------------------------- |
| 400    | `VALIDATION_ERROR`       | Datos inválidos                 |
| 404    | `USER_NOT_FOUND`         | El usuario no existe            |
| 409    | `ACCOUNT_ALREADY_EXISTS` | Ya existe una cuenta con ese ID |

---

### Actualizar una cuenta

```
PATCH /api/admin/accounts/:stripeAccountId
```

Actualiza únicamente los campos enviados. No se puede modificar `stripe_account_id` ni `user_id`.

**Body:**

```json
{
  "charges_enabled": true,
  "transfers_enabled": true,
  "details_submitted": true,
  "default_account": false
}
```

Todos los campos son opcionales.

**Respuesta 200:**

```json
{
  "status": "Success",
  "message": "Cuenta actualizada correctamente.",
  "account": { ... }
}
```

**Errores:**

| Status | errorCode           | Descripción         |
| ------ | ------------------- | ------------------- |
| 400    | `VALIDATION_ERROR`  | Datos inválidos     |
| 404    | `ACCOUNT_NOT_FOUND` | La cuenta no existe |

---

### Eliminar una cuenta

```
DELETE /api/admin/accounts/:stripeAccountId
```

Elimina el registro de la base de datos. **No elimina la cuenta en Stripe**.

**Respuesta 200:**

```json
{
  "status": "Success",
  "message": "Cuenta eliminada correctamente."
}
```

**Errores:**

| Status | errorCode           | Descripción         |
| ------ | ------------------- | ------------------- |
| 404    | `ACCOUNT_NOT_FOUND` | La cuenta no existe |

---

### Sincronizar cuenta desde Stripe

```
POST /api/admin/accounts/sync/:userId
```

Si el webhook `account.updated` falló y la BD no se actualizó, este endpoint obtiene el estado actual de la cuenta directamente desde la API de Stripe y actualiza (o crea) el registro en la base de datos.

**Lógica:**
1. Busca el usuario en la BD y obtiene su `stripe_account`.
2. Llama a `stripe.accounts.retrieve(stripe_account)` para obtener el estado actual.
3. Extrae `charges_enabled`, `transfers_enabled` (desde `capabilities.transfers === "active"`) y `details_submitted`.
4. Hace `upsert` del registro `Account` en la BD.

**Respuesta 200:**

```json
{
  "status": "Success",
  "message": "Cuenta sincronizada correctamente desde Stripe.",
  "account": {
    "stripe_account_id": "acct_1U23be1fnbBo0bch",
    "user_id": "e7971494-60b5-4e70-bd3c-cb0871fc1ae1",
    "charges_enabled": true,
    "transfers_enabled": true,
    "details_submitted": true,
    "default_account": false,
    "user": { ... }
  },
  "stripe_data": {
    "charges_enabled": true,
    "transfers_enabled": true,
    "details_submitted": true,
    "capabilities": {
      "transfers": "active",
      "card_payments": "active"
    }
  }
}
```

**Errores:**

| Status | errorCode                | Descripción                                  |
| ------ | ------------------------ | -------------------------------------------- |
| 400    | `STRIPE_ACCOUNT_MISSING` | El usuario no tiene cuenta de Stripe Connect |
| 402    | `STRIPE_ERROR`           | Error al consultar la API de Stripe          |
| 404    | `USER_NOT_FOUND`         | El usuario no existe                         |

---

## Notas

- Los registros de `Account` se crean automáticamente cuando un usuario completa el onboarding de Stripe Connect (webhook `account.updated`).
- Estos endpoints permiten al admin gestionar manualmente los estados de las cuentas (por ejemplo, forzar `charges_enabled` o `transfers_enabled` sin esperar al webhook).
- El endpoint `/sync` es útil cuando el webhook falla y la BD no refleja el estado real de la cuenta en Stripe.
- La eliminación solo afecta al registro local; la cuenta de Stripe Connect permanece activa.
