# Wallet Config API

## Descripción

API para que los administradores configuren el monedero virtual de cada usuario.
Permite activar/desactivar funcionalidades del monedero (recargas, pagos, retiros)
y establecer límites personalizados por usuario.

---

## Modelo de datos

### WalletConfig

| Campo                    | Tipo    | Default  | Descripción                                               |
| ------------------------ | ------- | -------- | --------------------------------------------------------- |
| `wallet_enabled`         | Boolean | `true`   | Switch maestro. Si `false`, el monedero está desactivado. |
| `recharges_enabled`      | Boolean | `true`   | Permite recargas al monedero.                             |
| `payouts_enabled`        | Boolean | `true`   | Permite retiros desde el monedero.                        |
| `payments_enabled`       | Boolean | `true`   | Permite pagos de trayectos desde el monedero.             |
| `min_recharge_cents`     | Int     | `100`    | Recarga mínima en céntimos (1 EUR).                       |
| `max_recharge_cents`     | Int     | `500000` | Recarga máxima en céntimos (5000 EUR).                    |
| `max_daily_payout_cents` | Int     | `100000` | Retiro diario máximo en céntimos (1000 EUR).              |
| `updated_by`             | String? | `null`   | ID del admin que modificó la configuración.               |

Si un usuario no tiene registro en `wallet_configs`, se usan los valores por defecto.

---

## Endpoints (Admin)

### Listar configuraciones

```
GET /api/admin/wallet-config?limit=50&offset=0&wallet_enabled=true
```

**Auth**: `onlyAdmin`

**Query params**:
- `limit` (opcional, default 50, max 200)
- `offset` (opcional, default 0)
- `wallet_enabled` (opcional: `true` | `false`)

**Response 200**:
```json
{
  "status": "Success",
  "configs": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "wallet_enabled": true,
      "recharges_enabled": false,
      "payouts_enabled": true,
      "payments_enabled": true,
      "min_recharge_cents": 500,
      "max_recharge_cents": 100000,
      "max_daily_payout_cents": 50000,
      "updated_by": "admin-uuid",
      "created_at": "2026-09-01T...",
      "updated_at": "2026-09-01T...",
      "user": {
        "id": "uuid",
        "email": "user@example.com",
        "name": "encrypted",
        "surname": "encrypted"
      }
    }
  ],
  "total": 1,
  "limit": 50,
  "offset": 0
}
```

---

### Obtener configuración de un usuario

```
GET /api/admin/wallet-config/:userId
```

**Auth**: `onlyAdmin`

**Response 200**:
```json
{
  "status": "Success",
  "config": {
    "user_id": "uuid",
    "wallet_enabled": true,
    "recharges_enabled": true,
    "payouts_enabled": true,
    "payments_enabled": true,
    "min_recharge_cents": 100,
    "max_recharge_cents": 500000,
    "max_daily_payout_cents": 100000
  }
}
```

Si el usuario no tiene configuración personalizada, devuelve los valores por defecto.

---

### Crear o actualizar configuración

```
PUT /api/admin/wallet-config/:userId
```

**Auth**: `onlyAdmin`

**Body** (todos los campos son opcionales, se hace upsert):
```json
{
  "wallet_enabled": true,
  "recharges_enabled": false,
  "payouts_enabled": true,
  "payments_enabled": true,
  "min_recharge_cents": 500,
  "max_recharge_cents": 200000,
  "max_daily_payout_cents": 50000
}
```

**Validaciones**:
- `min_recharge_cents` no puede ser mayor que `max_recharge_cents`
- Todos los importes son en céntimos (enteros >= 0)

**Response 200**:
```json
{
  "status": "Success",
  "message": "Configuración del monedero actualizada correctamente.",
  "config": { ... }
}
```

---

### Activar/desactivar monedero (toggle)

```
PATCH /api/admin/wallet-config/:userId/toggle
```

**Auth**: `onlyAdmin`

**Body**:
```json
{
  "wallet_enabled": false
}
```

**Response 200**:
```json
{
  "status": "Success",
  "message": "Monedero desactivado correctamente.",
  "config": { ... }
}
```

---

### Restaurar valores por defecto

```
DELETE /api/admin/wallet-config/:userId
```

**Auth**: `onlyAdmin`

Elimina la configuración personalizada del usuario y restaura los valores por defecto.

**Response 200**:
```json
{
  "status": "Success",
  "message": "Configuración del monedero restaurada a valores por defecto.",
  "config": {
    "user_id": "uuid",
    "wallet_enabled": true,
    "recharges_enabled": true,
    "payouts_enabled": true,
    "payments_enabled": true,
    "min_recharge_cents": 100,
    "max_recharge_cents": 500000,
    "max_daily_payout_cents": 100000
  }
}
```

---

## Endpoints (Usuario)

### Obtener mi configuración

```
GET /api/wallet-config/me
```

**Auth**: `isLoged`

Devuelve la configuración del monedero del usuario autenticado.

**Response 200**:
```json
{
  "status": "Success",
  "config": {
    "user_id": "uuid",
    "wallet_enabled": true,
    "recharges_enabled": true,
    "payouts_enabled": true,
    "payments_enabled": true,
    "min_recharge_cents": 100,
    "max_recharge_cents": 500000,
    "max_daily_payout_cents": 100000
  }
}
```

---

## Integración con getUserInfo

El endpoint `GET /api/users/:id/info` ahora incluye `wallet_config` y `monedero` en la respuesta:

```json
{
  "data": {
    "userId": "uuid",
    "name": "...",
    "email": "...",
    "wallet_config": {
      "user_id": "uuid",
      "wallet_enabled": true,
      "recharges_enabled": true,
      "payouts_enabled": true,
      "payments_enabled": true,
      "min_recharge_cents": 100,
      "max_recharge_cents": 500000,
      "max_daily_payout_cents": 100000
    },
    "monedero": {
      "disponible": true,
      "stripe_account": true,
      "stripe_account_id": "acct_...",
      "stripe_customer_account": "cus_...",
      "onboarding_completado": true,
      "charges_enabled": true,
      "transfers_enabled": true,
      "details_submitted": true,
      "wallet_activa": true,
      "wallet_balance": 0
    }
  }
}
```

### Objeto `monedero`

| Campo                     | Tipo    | Descripción                                                  |
| ------------------------- | ------- | ------------------------------------------------------------ |
| `disponible`              | Boolean | `true` si `charges_enabled` y `transfers_enabled` son `true` |
| `stripe_account`          | Boolean | Si el usuario tiene cuenta Stripe Connect                    |
| `stripe_account_id`       | String? | ID de la cuenta Stripe Connect (`acct_...`)                  |
| `stripe_customer_account` | String? | ID del customer de Stripe (`cus_...`)                        |
| `onboarding_completado`   | Boolean | Si el onboarding de Stripe ha finalizado                     |
| `charges_enabled`         | Boolean | Si Stripe tiene cobros habilitados                           |
| `transfers_enabled`       | Boolean | Si Stripe tiene transferencias habilitadas                   |
| `details_submitted`       | Boolean | Si Stripe tiene los detalles enviados                        |
| `wallet_activa`           | Boolean | Si la `WalletAccount` está `active`                          |
| `wallet_balance`          | Int     | Balance del monedero en céntimos                             |
| `config`                  | Object  | Configuración del monedero (ver modelo `WalletConfig`)       |
| `mensaje`                 | String  | Mensaje descriptivo del estado del monedero                  |

### Campo `mensaje`

El campo `mensaje` sigue esta jerarquía:

1. No tiene `stripe_account` → `"No tienes cuenta Stripe Connect configurada."`
2. Tiene cuenta pero `onboarding_ended = false` → `"Completa el onboarding de Stripe para poder recibir ganancias."`
3. `charges_enabled = false` → `"Tu cuenta Stripe no tiene cobros habilitados."`
4. `transfers_enabled = false` → `"Tu cuenta Stripe no tiene transferencias habilitadas."`
5. Wallet bloqueada → `"Tu monedero está bloqueado. Contacta con soporte."`
6. Todo correcto → `"Tu monedero está disponible para recibir ganancias."`

---

## Integración con getMyUserInfo

El endpoint `GET /api/users/info` (propio usuario) incluye el objeto `monedero` con la configuración:

```json
{
  "status": "Success",
  "data": {
    "name": "...",
    "email": "...",
    ...
  },
  "completitud": { ... },
  "completitud_cae": { ... },
  "monedero": {
    "disponible": true,
    "stripe_account": true,
    "stripe_account_id": "acct_...",
    "stripe_customer_account": "cus_...",
    "onboarding_completado": true,
    "charges_enabled": true,
    "transfers_enabled": true,
    "details_submitted": true,
    "wallet_activa": true,
    "wallet_balance": 0,
    "config": {
      "user_id": "uuid",
      "wallet_enabled": true,
      "recharges_enabled": true,
      "payouts_enabled": true,
      "payments_enabled": true,
      "min_recharge_cents": 100,
      "max_recharge_cents": 500000,
      "max_daily_payout_cents": 100000
    },
    "mensaje": "Tu monedero está disponible para recibir ganancias."
  }
}
```

---

## Cómo usar la UI para mostrar el estado del monedero

### Caso 1: Usuario sin cuenta Stripe

```javascript
if (!monedero.stripe_account_id) {
  // Mostrar: "Configura tu cuenta de Stripe para activar el monedero"
  // Botón: "Configurar Stripe"
}
```

### Caso 2: Onboarding incompleto

```javascript
if (monedero.stripe_account_id && !monedero.onboarding_completado) {
  // Mostrar: "Completa el onboarding de Stripe"
  // Botón: "Completar onboarding"
}
```

### Caso 3: Stripe configurado pero sin cobros/transferencias

```javascript
if (monedero.stripe_account_id && monedero.onboarding_completado && !monedero.disponible) {
  // Mostrar: monedero.mensaje
  // "Tu cuenta Stripe no tiene cobros habilitados."
}
```

### Caso 4: Monedero desactivado por admin

```javascript
if (monedero.config && !monedero.config.wallet_enabled) {
  // Mostrar: "Tu monedero ha sido desactivado por el administrador."
}
```

### Caso 5: Todo correcto

```javascript
if (monedero.disponible && monedero.config?.wallet_enabled) {
  // Mostrar balance: monedero.wallet_balance / 100 + " EUR"
  // Mostrar: monedero.mensaje
}
```

---

## Admin Stripe Onboarding

El administrador puede gestionar el onboarding de Stripe Connect de cualquier usuario,
útil cuando el usuario tiene problemas para completarlo por sí mismo.

### Obtener estado de la cuenta Stripe

```
GET /api/admin/stripe-connect/:userId
```

**Auth**: `onlyAdmin`

Consulta en tiempo real la API de Stripe para obtener el estado de la cuenta.

**Response 200**:
```json
{
  "status": "Success",
  "account": {
    "id": "acct_...",
    "charges_enabled": true,
    "transfers_enabled": true,
    "details_submitted": true,
    "payouts_enabled": true,
    "capabilities": { ... },
    "requirements": { ... }
  },
  "onboarding_ended": true
}
```

**Errores**:
- `404 USER_NOT_FOUND` — El usuario no existe
- `404 STRIPE_ACCOUNT_NOT_FOUND` — El usuario no tiene cuenta Stripe

---

### Crear cuenta Stripe + link de onboarding

```
POST /api/admin/stripe-connect/:userId
```

**Auth**: `onlyAdmin`

Si el usuario no tiene cuenta Stripe, la crea y genera un link de onboarding.
Si ya tiene cuenta pero el onboarding está incompleto, regenera el link.

**Body**:
```json
{
  "return_url": "https://app.youconnext.com/stripe/return",
  "refresh_url": "https://app.youconnext.com/stripe/refresh"
}
```

**Response 200**:
```json
{
  "status": "Success",
  "message": "Stripe onboarding link created successfully",
  "accountLink": {
    "url": "https://connect.stripe.com/setup/...",
    "expires_at": 1234567890
  },
  "stripe_account_id": "acct_..."
}
```

**Errores**:
- `400 VALIDATION_ERROR` — Faltan `return_url` o `refresh_url`
- `400 STRIPE_ACCOUNT_EXISTS` — El usuario ya tiene cuenta y onboarding completado

**Notas**:
- La cuenta se crea con `type: "express"`, `country: "ES"`, `business_type: "individual"`
- Se añade `created_by_admin` en los metadata con el ID del admin
- El link expira (típicamente en 7 días según Stripe)

---

### Regenerar link de onboarding

```
POST /api/admin/stripe-connect/:userId/account-link
```

**Auth**: `onlyAdmin`

Genera un nuevo link de onboarding para un usuario que ya tiene cuenta Stripe
pero cuyo link anterior ha expirado o no fue completado.

**Body**:
```json
{
  "return_url": "https://app.youconnext.com/stripe/return",
  "refresh_url": "https://app.youconnext.com/stripe/refresh"
}
```

**Response 200**:
```json
{
  "status": "Success",
  "message": "Stripe onboarding link created successfully",
  "accountLink": {
    "url": "https://connect.stripe.com/setup/...",
    "expires_at": 1234567890
  }
}
```

**Errores**:
- `400 VALIDATION_ERROR` — Faltan `return_url` o `refresh_url`
- `404 USER_NOT_FOUND` — El usuario no existe
- `404 STRIPE_ACCOUNT_NOT_FOUND` — El usuario no tiene cuenta Stripe

---

### Generar link de acceso al dashboard

```
POST /api/admin/stripe-connect/:userId/login-link
```

**Auth**: `onlyAdmin`

Genera un link de acceso al dashboard de Stripe para un usuario que ya completó
el onboarding. Útil para que el admin revise o modifique la configuración bancaria.

**Body** (opcional):
```json
{
  "return_url": "https://app.youconnext.com/admin/users"
}
```

**Response 200**:
```json
{
  "status": "Success",
  "message": "Stripe login link created successfully",
  "loginLink": {
    "url": "https://connect.stripe.com/dashboard/...",
    "created": 1234567890
  }
}
```

**Errores**:
- `404 USER_NOT_FOUND` — El usuario no existe
- `404 STRIPE_ACCOUNT_NOT_FOUND` — El usuario no tiene cuenta Stripe
- `400 STRIPE_ONBOARDING_INCOMPLETE` — El onboarding no está completado

---

## Flujo de uso para el admin

### Caso 1: Usuario sin cuenta Stripe

1. **GET** `/api/admin/stripe-connect/:userId` → confirma que no tiene cuenta
2. **POST** `/api/admin/stripe-connect/:userId` con `{ return_url, refresh_url }` → obtiene `accountLink.url`
3. Abrir `accountLink.url` en el navegador para completar el onboarding

### Caso 2: Usuario con cuenta pero onboarding incompleto

1. **GET** `/api/admin/stripe-connect/:userId` → `onboarding_ended: false`
2. **POST** `/api/admin/stripe-connect/:userId/account-link` con `{ return_url, refresh_url }` → nuevo link
3. Abrir `accountLink.url` para completar el onboarding

### Caso 3: Usuario con onboarding completado, acceso al dashboard

1. **GET** `/api/admin/stripe-connect/:userId` → `onboarding_ended: true`
2. **POST** `/api/admin/stripe-connect/:userId/login-link` → obtiene `loginLink.url`
3. Abrir `loginLink.url` para acceder al dashboard de Stripe

### Caso 4: Verificar estado después del onboarding

1. **GET** `/api/admin/stripe-connect/:userId` → revisar `charges_enabled`, `transfers_enabled`, `details_submitted`
2. Si `charges_enabled` y `transfers_enabled` son `true`, el monedero está disponible

---

## Eventos RabbitMQ

### `wallet.config.updated`

Se publica cuando un admin actualiza, togglea o resetea la configuración del monedero.

```json
{
  "user_id": "uuid",
  "config": { ... },
  "updated_by": "admin-uuid"
}
```

---

## Aplicar la configuración

Para que la configuración tenga efecto en los flujos de pago existentes, se debe
verificar `walletConfig` antes de permitir recargas, pagos o retiros. Ejemplo de
guard en el controlador de payment:

```javascript
const config = await prisma.walletConfig.findUnique({
  where: { user_id: String(user.id) },
});

// Si no hay config, usar defaults (todo habilitado)
const walletEnabled = config?.wallet_enabled ?? true;
const rechargesEnabled = config?.recharges_enabled ?? true;

if (!walletEnabled) {
  return next(new AppError("Monedero desactivado.", 403, "WALLET_DISABLED"));
}
if (!rechargesEnabled) {
  return next(new AppError("Recargas desactivadas.", 403, "RECHARGES_DISABLED"));
}
```

---

## Migración

Después de añadir el modelo `WalletConfig` al schema de Prisma:

```bash
npx prisma db push
npx prisma generate
```
