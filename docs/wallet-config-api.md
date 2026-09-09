# Wallet Config API

## Descripción

API para que los administradores configuren el monedero virtual de cada usuario.
Permite activar/desactivar funcionalidades del monedero (recargas, pagos, retiros)
y establecer límites personalizados por usuario.

---

## Modelo de datos

### WalletConfig

| Campo                  | Tipo    | Default  | Descripción                                              |
|------------------------|---------|----------|----------------------------------------------------------|
| `wallet_enabled`       | Boolean | `true`   | Switch maestro. Si `false`, el monedero está desactivado. |
| `recharges_enabled`    | Boolean | `true`   | Permite recargas al monedero.                            |
| `payouts_enabled`      | Boolean | `true`   | Permite retiros desde el monedero.                       |
| `payments_enabled`     | Boolean | `true`   | Permite pagos de trayectos desde el monedero.            |
| `min_recharge_cents`   | Int     | `100`    | Recarga mínima en céntimos (1 EUR).                      |
| `max_recharge_cents`   | Int     | `500000` | Recarga máxima en céntimos (5000 EUR).                  |
| `max_daily_payout_cents` | Int   | `100000` | Retiro diario máximo en céntimos (1000 EUR).            |
| `updated_by`           | String? | `null`   | ID del admin que modificó la configuración.             |

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

El endpoint `GET /api/users/:id/info` ahora incluye `wallet_config` en la respuesta:

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
      ...
    }
  }
}
```

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
