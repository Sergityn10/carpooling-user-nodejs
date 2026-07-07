# Carpooling User API

Backend para la gestión de usuarios de la plataforma YouConnext. Incluye autenticación con JWT, roles de usuario (user/admin), integración con Stripe, OAuth de Google, y persistencia con MySQL mediante Prisma ORM.

## Requisitos

- Node.js >= 18
- MySQL 8.0
- Docker y Docker Compose (recomendado)
- Cuenta de Stripe (para pagos)
- Cuenta de Google OAuth (para login social)

## Variables de entorno

Crea un archivo `.env` en la raíz del proyecto con las siguientes variables:

```env
# Base de datos
DATABASE_URL=mysql://root:password@localhost:3306/app_usuarios

# Servidor
PORT=4000
NODE_ENV=production
ORIGIN=https://tudominio.com
MY_ORIGIN=https://api.tudominio.com/
TRAYECTOS_ORIGIN=https://trayectos.tudominio.com
MESSSAGES_ORIGIN=https://mensajes.tudominio.com

# JWT
PRIVATE_KEY=tu_clave_privada_rsa
PUBLIC_KEY=tu_clave_publica_rsa
EXPIRATION_TIME=15m
JWT_COOKIES_EXPIRATION_TIME=15
ACCESS_COOKIE_MINUTES=15

# Google OAuth
GOOGLE_CLIENT_ID=tu_client_id
GOOGLE_OAUTH=tu_secret_id

# Stripe
STRIPE_SECRET_KEY=tu_stripe_secret_key
STRIPE_WEBHOOK_SECRET=tu_webhook_secret

# Encriptación
CRYPTO_SECRET=tu_secreto_de_encriptacion

# Admin por defecto (opcional, para el seed)
ADMIN_EMAIL=admin@youconnext.com
ADMIN_PASSWORD=Admin12345!
```

## Instalación local

```bash
# Clonar el repositorio
git clone https://github.com/Sergityn10/carpooling-user-nodejs.git
cd carpooling-user-nodejs

# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env  # o crea el .env manualmente

# Generar el cliente de Prisma
npm run prisma:generate

# Sincronizar el schema con la base de datos
npm run prisma:push

# Ejecutar el seed (crea roles y usuario admin por defecto)
npm run prisma:seed

# Iniciar el servidor
npm run dev
```

## Despliegue en VPS

### 1. Clonar e instalar

```bash
cd /home/sergityn/proyectos
git clone https://github.com/Sergityn10/carpooling-user-nodejs.git
cd carpooling-user-nodejs
git checkout feature/migration  # o la rama correspondiente
npm install

docker exec -it mysql-carpooling2 mysql -u viajes_app -p # Entrar como usuario "viajes_app" y poder establecer script de MySQL.
```

### 2. Configurar `.env`

Crea el archivo `.env` en la raíz del proyecto con todas las variables listadas arriba.

### 3. Base de datos

Si usas MySQL con Docker:

```bash
docker compose up -d mysql
```

Sincroniza el schema y ejecuta el seed:

```bash
npm run prisma:generate
npm run prisma:push
npm run prisma:seed
```

### 4. Iniciar la aplicación

Con PM2 (recomendado para producción):

```bash
npm install -g pm2
pm2 start app/index.js --name carpooling-user
pm2 save
pm2 startup  # para que arranque al reiniciar el VPS
```

Sin PM2:

```bash
node app/index.js
```

### 5. Actualizar el código en el VPS

Cada vez que hagas un push nuevo:

```bash
git pull
npm install
npm run prisma:generate
npm run prisma:push
npm run prisma:seed
pm2 restart carpooling-user
```

## Despliegue con Docker

### Docker Compose (recomendado)

Levanta MySQL y la app juntos en la misma red:

```bash
docker compose up -d --build
```

El `docker-compose.yml` incluye:
- **mysql**: MySQL 8.0 con volumen persistente
- **app**: La API Node.js que depende de MySQL

> **Importante**: En el `.env`, usa `mysql` como host en `DATABASE_URL` (no `localhost`):
> ```
> DATABASE_URL=mysql://root:password@mysql:3306/app_usuarios
> ```

### Docker manual

```bash
# Construir la imagen
docker build -t carpooling-user .

# Ejecutar con variables de entorno externas
docker run --rm -d \
  --name carpooling-user \
  -p 4000:4000 \
  --env-file .env \
  carpooling-user
```

> **Importante**: El `.env` no se incluye en la imagen Docker por seguridad. Se inyecta en runtime con `--env-file`.

## Scripts disponibles

| Script                    | Descripción                            |
| ------------------------- | -------------------------------------- |
| `npm run dev`             | Inicia el servidor con nodemon         |
| `npm run prisma:generate` | Genera el cliente de Prisma            |
| `npm run prisma:push`     | Sincroniza el schema con la BD         |
| `npm run prisma:seed`     | Crea roles y usuario admin por defecto |
| `npm run prisma:studio`   | Abre Prisma Studio (GUI para la BD)    |
| `npm run buildDocker`     | Construye la imagen Docker             |
| `npm run runDocker`       | Ejecuta el contenedor Docker           |

## Sistema de roles

- **user** (id=1): Rol por defecto para todos los usuarios nuevos.
- **admin** (id=2): Rol de administrador. Solo un admin puede crear otros admins.

El usuario admin por defecto se crea con el seed:
- Email: `admin@youconnext.com` (o `ADMIN_EMAIL` del `.env`)
- Password: `Admin12345!` (o `ADMIN_PASSWORD` del `.env`)

El role se incluye en el JWT payload y en todas las respuestas de autenticación.

## Autenticación y tokens

- **Access token**: JWT con expiración corta (configurable via `EXPIRATION_TIME`, por defecto 15m). Incluye `userId`, `email` y `role` en el payload.
- **Refresh token**: Token aleatorio de 40 bytes almacenado en BD con expiración de 30 días. Se envía como cookie `httpOnly`.
- **Rotación de refresh token**: Cada vez que se renueva el access token, el refresh token anterior se elimina y se emite uno nuevo.
- **Refresh proactivo**: Si el access token es válido pero expira en menos de 5 minutos, se renueva silenciosamente sin que el cliente reciba un 401.
- **Endpoints de autenticación**:
  - `POST /api/auth/login` — Login con email/password
  - `POST /api/auth/register` — Registro con email/password
  - `GET /api/auth/oauth/google?method=login|register` — Login/registro con Google
  - `POST /api/auth/refresh` — Renovar access token
  - `GET /api/auth/validate` — Validar token y obtener datos del usuario
  - `POST /api/auth/logout` — Cerrar sesión

## Integración con Stripe

- **Cuenta Stripe Connect Express**: Se crea automáticamente al registrar un usuario. El ID se guarda en `users.stripe_account`.
- **Onboarding de Stripe**: El usuario completa sus datos bancarios y verificación a través de un link generado por la API.
  - `GET /api/payment/stripe-connect-link` — Genera link de onboarding. Parámetros opcionales: `return_url` y `refresh_url` (por defecto `ORIGIN`).
  - `POST /api/payment/stripe-connect` — Crea cuenta Stripe Connect si no existe.
  - `GET /api/payment/stripe-connect` — Obtiene el estado de la cuenta Stripe Connect.
- **Webhook de Stripe**: Recibe notificaciones de Stripe y marca `onboarding_ended: true` cuando el onboarding se completa.

## Estructura del proyecto

```
carpooling-user/
├── app/
│   ├── controllers/      # Controladores (auth, user, payment, webhook)
│   ├── middlewares/      # Middlewares (authorization, autenticación)
│   ├── schemas/          # Validaciones con Zod
│   ├── utils/            # Utilidades (db, crypto, hashing)
│   ├── providers/        # Proveedores externos (Stripe, Google Maps)
│   └── index.js          # Punto de entrada
├── prisma/
│   ├── schema.prisma     # Schema de la base de datos
│   ├── seed.js           # Seed de roles y admin
├── .dockerignore
├── Dockerfile
├── docker-compose.yml
└── package.json
```
