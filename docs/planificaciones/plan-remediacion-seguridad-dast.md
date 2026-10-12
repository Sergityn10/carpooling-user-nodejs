# Plan Integral de Remediación de Seguridad DAST — YouConnext
**Código de Documento:** SEC-PLAN-DAST-2026-01  
**Fecha de Emisión:** 12 de octubre de 2026  
**Auditoría de Referencia:** Informe de Seguridad DAST — YouConnext (Pre-producción, 11/10/2026)  
**Clasificación:** Confidencial / Ingeniería & Cumplimiento Normativo  
**Ámbito:** Arquitectura Backend (Microservicios Express/Node.js), Gateway/Nginx, Frontend Móvil (React Native/Expo)

---

## 1. Resumen Ejecutivo y Diagnóstico del Error

### 1.1 Diagnóstico Técnico del Error `ERR_ERL_KEY_GEN_IPV6`
Durante la implementación inicial de los controles de rate limiting en el microservicio `carpooling-user`, se produjo el siguiente error en tiempo de arranque:

```
ValidationError: Custom keyGenerator appears to use request IP without calling the ipKeyGenerator helper function for IPv6 addresses. This could allow IPv6 users to bypass limits. See https://express-rate-limit.github.io/ERR_ERL_KEY_GEN_IPV6/ for more information.
  code: 'ERR_ERL_KEY_GEN_IPV6'
```

#### Causa Raíz y Relación con las Vulnerabilidades del Informe DAST
1. **Origen en la Remediación:** Este error surgió directamente al intentar mitigar las vulnerabilidades **ALTO-13 a ALTO-17** y **MED-10 a MED-22** (ausencia de rate limiting en 16 endpoints críticos, incluyendo login, registro, payouts y recargas) mediante `express-rate-limit` en `app/middlewares/rateLimiter.js`.
2. **Fundamento Criptográfico y de Red IPv6:** En la configuración de `paymentLimiter`, se implementó:
   ```javascript
   keyGenerator: (req) => req.user?.id || req.ip
   ```
   En redes IPv6, los proveedores de servicios de internet (ISPs) asignan bloques completos (habitualmente subredes `/64` o `/56`) a cada cliente. Un dispositivo puede generar dinámicamente hasta $2^{64}$ direcciones IP individuales dentro del mismo prefijo.
   Si un mecanismo de limitación de tasa indexa por la dirección IP exacta (`req.ip`), un atacante con conectividad IPv6 puede rotar su dirección en cada petición, **eludiendo completamente el rate limiting y permitiendo ataques continuados de fuerza bruta y denegación de servicio (DoS)**.
3. **Mecanismo de Defensa de `express-rate-limit`:** La versión 7+ del paquete valida estáticamente que cualquier `keyGenerator` que evalúe IPs utilice obligatoriamente el helper `ipKeyGenerator(req.ip)`, el cual trunca y agrupa las direcciones IPv6 a nivel de subred `/56`.

#### Remediación Aplicada
Se corrigió `app/middlewares/rateLimiter.js` integrando `ipKeyGenerator` y aplicando prefijado de espacios de nombres para evitar colisiones entre identificadores de usuario y cadenas IP:
```javascript
import rateLimit, { ipKeyGenerator } from "express-rate-limit";

export const paymentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user?.id ? `usr_${req.user.id}` : ipKeyGenerator(req.ip)),
  message: {
    status: "Error",
    code: "PAYMENT_RATE_LIMIT",
    message: "Límite de operaciones financieras superado. Por favor, espere antes de continuar.",
  },
});
```

---

## 2. Marco Normativo de Obligado Cumplimiento

Las vulnerabilidades reportadas en el informe DAST impiden el despliegue a producción por infringir directamente marcos legales europeos y estándares de la industria:

### 2.1 Reglamento General de Protección de Datos (RGPD / GDPR - UE 2016/679)
* **Art. 5 (Principios relativos al tratamiento):** Principio de minimización de datos e integridad y confidencialidad. Violado por `HIGH-01` (`GET /api/users` expone DNIs, hashes bcrypt y teléfonos a terceros sin justificación).
* **Art. 25 (Protección de datos desde el diseño y por defecto):** Los sistemas deben incorporar filtros automáticos para que ningún dato personal sea accesible por defecto a personas no autorizadas.
* **Art. 32 (Seguridad del tratamiento):** Exige implementar medidas técnicas y organizativas apropiadas para garantizar un nivel de seguridad adecuado al riesgo (cifrado, confidencialidad, resiliencia y capacidad de restaurar la disponibilidad de datos ante incidentes). Violado por `CRIT-03` y `CRIT-04` (indisponibilidad de servicios ante sobrecargas leves).
* **Arts. 33 y 34 (Notificación de brechas de datos):** La exposición no autenticada de datos identificativos y contraseñas constituye una brecha notificable a la Agencia Española de Protección de Datos (AEPD) en un plazo máximo de 72 horas con sanciones de hasta 20 millones de euros o el 4% de la facturación global.

### 2.2 Directiva de Servicios de Pago (PSD2) y PCI-DSS
* **Autenticación Reforzada de Cliente (SCA):** Todos los endpoints que consultan balances (`/api/payment/wallet-balance`, `/api/payment/cash-balance`) o ejecutan movimientos de fondos (`/api/payment/recharge`, `/api/payment/payout`) deben exigir autenticación obligatoria y verificación estricta de titularidad.
* **Aislamiento de Entornos:** El informe DAST detectó que el endpoint `/api/payment/cash-balance` devolvía `livemode: true` en el entorno de pre-producción. Operar con credenciales de producción de Stripe en entornos de test/staging infringe gravemente las normativas financieras.

---

## 3. Matriz Consolidada de Hallazgos DAST

| ID | Severidad | Categoría OWASP API | Endpoint / Componente | Impacto Principal | Estado de Remediación |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **CRIT-01** | Crítico (9.8) | API2: Broken Authentication | `POST /api/users/info` | Bypass total de login mediante JWT con `alg: none`. | Mitigado en `authorization.js` (forzado `RS256`). Requerido auditoría integral en todos los microservicios. |
| **CRIT-02** | Crítico (9.8) | API2: Broken Authentication | `GET /api/users/info` | Suplantación de identidad arbitraria manipulando `userId`. | Mitigado al exigir firma asimétrica válida con clave pública. |
| **CRIT-03** | Crítico (9.1) | API4: Unrestricted Resource | `POST /api/push/send` | Colapso del servicio de notificaciones con 10 peticiones concurrentes. | **Pendiente de arquitectura de colas (Fase 3)**. |
| **CRIT-04** | Crítico (8.6) | API4: Unrestricted Resource | `notifications.youconnext.es` | Servicio no se recupera automáticamente tras caída (timeout prolongado). | **Pendiente de supervisión PM2/K8s y Circuit Breaker (Fase 3)**. |
| **HIGH-01** | Alto (8.6) | API1/API3: BOLA / Property Leak | `GET /api/users` | Fuga masiva de toda la BBDD (hashes bcrypt, DNIs, Stripe IDs, teléfonos). | Parcialmente corregido (`onlyAdmin` + `UserDTO`). Requiere purga de endpoints legados. |
| **HIGH-02** | Alto (8.2) | API2: Broken Authentication | `GET /api/users/info` | Consulta de perfil sensible sin autenticación. | Corregido con `authorization.isLoged`. |
| **HIGH-03** | Alto (8.2) | API2: Broken Authentication | `GET /api/payment/wallet-balance` | Saldo y datos energéticos CAE expuestos sin autenticación. | Corregido con `authorization.isLoged`. |
| **HIGH-04** | Alto (8.2) | API2: Broken Authentication | `GET /api/payment/wallet-transactions`| Historial financiero expuesto sin autenticación. | Corregido con `authorization.isLoged`. |
| **HIGH-05** | Alto (8.2) | API2: Broken Authentication | `GET /api/payment/cash-balance` | Balance de Stripe expuesto sin autenticación y en `livemode: true`. | Corregido con `authorization.isLoged`. Claves Stripe en test pendientes de validar. |
| **HIGH-06** | Alto (7.5) | API1: BOLA / IDOR | `GET /api/users/:id` | Visualización no autorizada del perfil de otros usuarios cambiando UUID. | Corregido con comprobación de titularidad `isOwnerOrAdmin` + `UserDTO.toPrivate()`. |
| **HIGH-07** | Alto (7.2) | API1: BOLA / IDOR | `GET /api/reserva/profile/:userId` | Exposición de historial de reservas y certificados de ahorro energético CAE de terceros. | **Pendiente en `Carpooling-trayectos-express`**. |
| **HIGH-08** | Alto (7.5) | API5: BFLA | `POST /api/push/send` | Envío de notificaciones push individuales sin autenticación. | **Pendiente en `carpooling-notiifications`**. |
| **HIGH-09** | Alto (7.5) | API5: BFLA | `POST /api/push/send/user` | Envío push arbitrario por `userId` sin autenticación. | **Pendiente en `carpooling-notiifications`**. |
| **HIGH-10** | Alto (7.5) | API5: BFLA | `POST /api/push/send/topic` | Envío push masivo por temática sin autenticación. | **Pendiente en `carpooling-notiifications`**. |
| **HIGH-11** | Alto (7.5) | API5: BFLA | `POST /api/push/send/multicast` | Difusión push masiva sin autenticación. | **Pendiente en `carpooling-notiifications`**. |
| **HIGH-12** | Alto (7.0) | API8: Security Misconfiguration| App / Google Maps API Key | Clave API sin restricciones de package ni huella SHA-1. | **Pendiente en Google Cloud Console**. |
| **ALTO-13** a **ALTO-17** | Alto (5.3) | API4: Unrestricted Resource | Rutas `/auth` y `/payment` | Ausencia total de limitación de tasa (fuerza bruta viable). | Corregido en `carpooling-user` (`authLimiter`, `paymentLimiter`). |
| **MED-01** a **MED-04** | Medio (5.3) | API8: Security Misconfiguration| 4 Microservicios | Ausencia de cabecera HSTS (`Strict-Transport-Security`). | **Pendiente en configuración Nginx**. |
| **MED-05** | Medio (6.5) | API4: Unrestricted Resource | `POST /api/auth/login` | Login sin límite de intentos. | Corregido con `authLimiter` (10 intentos / 15 min por subred IP). |
| **MED-06** / **MED-13** | Medio (5.3) | API1: BOLA / IDOR | `GET /api/cars/user/:userId` | Consulta cruzada de coches de otros usuarios. | **Corregido en `cars.js`** con comprobación de propiedad. |
| **MED-07** | Medio (5.3) | API1: BOLA / IDOR | `GET /api/trayecto/conductor/:userId` | Consulta cruzada de trayectos como conductor. | **Pendiente en `Carpooling-trayectos-express`**. |
| **MED-08** / **MED-09** | Medio (6.0) | API5: BFLA | `/api/push/send/multicast` y `topic`| Acceso permitido a usuarios convencionales sin rol admin. | **Pendiente en `carpooling-notiifications`**. |
| **MED-10** a **MED-22** | Medio (4.3) | API4: Unrestricted Resource | 11 Endpoints API general | Sin rate limiting general (scraping y DoS viables). | Corregido en `carpooling-user` con `generalApiLimiter`. |
| **MED-23** a **MED-25** | Medio (5.3) | API4: Unrestricted Resource | Test de estrés (500 req concurrentes)| Servidores no devuelven 429 bajo carga sostenida. | Extendido con rate limiters en capa de aplicación. |
| **LOW-01** a **LOW-13** | Bajo (3.0) | API8: Security Misconfiguration| Headers HTTP globales | Faltan cabeceras `CSP`, `X-Frame-Options`, `nosniff`, Server banner expuesto. | Requiere configuración en Nginx + Helmet. |
| **LOW-14** | Bajo (3.7) | API2: Broken Authentication | `/api/auth/login` y `/existEmail` | Enumeración de usuarios por respuestas diferenciales. | Login unificado a 401 genérico; `/existEmail` protegido con `authLimiter`. |
| **FRONT-01**| Alto (7.5) | M1: Insecure Data Storage | App Móvil (Expo/React Native) | Token JWT almacenado en texto plano en `AsyncStorage`. | **Pendiente en frontend móvil (migrar a SecureStore)**. |
| **FRONT-02**| Medio (5.9) | M3: Insecure Communication | App Móvil | Falta Certificate Pinning contra intercepción de tráfico MITM. | **Pendiente en frontend móvil**. |
| **FRONT-03**| Medio (5.0) | M7: Client Code Tampering | APK Hermes Bundle | API Key hardcodeada en el bundle cliente sin restringir. | **Pendiente en GCP**. |
| **FRONT-04**| Medio (6.1) | M3: Insecure Communication | Socket.io Client | Conexión WebSocket no autenticada en el handshake. | **Pendiente en `carpooling-messages`**. |

---

## 4. Plan de Remediación por Fases de Ejecución

Para garantizar una arquitectura **segura, reutilizable, escalable y mantenible**, la resolución se estructura en cuatro fases de ingeniería:

```mermaid
flowchart TD
    A["Fase 0: Desbloqueo y Contención Inmediata<br/>(RateLimiter IPv6 + IDOR Coches + Enumeración)"] --> B["Fase 1: Bloqueantes P0 de Producción<br/>(JWT RS256 + RBAC Auth Push/Pagos + DTOs)"]
    B --> C["Fase 2: Privacidad RGPD y Control BOLA/IDOR P1<br/>(Reservas CAE + SecureStore Móvil + GCP API Keys)"]
    C --> D["Fase 3: Resiliencia, Concurrencia y Escalabilidad P2<br/>(Colas RabbitMQ Push + Redis Rate Limiter + PM2 Cluster)"]
    D --> E["Fase 4: Hardening de Infraestructura P3<br/>(Nginx HSTS + Headers de Seguridad + Re-Test DAST)"]
```

---

### Fase 0: Desbloqueo y Contención Inmediata (Completada en Código)
1. **Normalización IPv6 en Limitadores de Tasa:**
   * Archivo: `app/middlewares/rateLimiter.js`.
   * Acción: Integración de `ipKeyGenerator` de `express-rate-limit` para evitar bypass por rotación de subredes IPv6 `/56`.
2. **Cierre de BOLA / IDOR en Gestión de Vehículos (MED-06 / MED-13):**
   * Archivo: `app/controllers/cars.js`.
   * Acción: Verificación estricta de titularidad en `getCarsByUserId`, `getCar`, `updateCar` y `removeCar`:
     ```javascript
     if (String(car.user_id) !== String(req.user.id) && req.user.role?.name !== "admin") {
       return res.status(403).json({ status: "Error", message: "Acceso denegado al recurso." });
     }
     ```
3. **Mitigación de Enumeración de Usuarios en Pre-registro (LOW-14):**
   * Archivo: `app/index.js`.
   * Acción: Aplicación inmediata de `authLimiter` a la ruta `GET /api/auth/register/email/:email`.

---

### Fase 1: Bloqueantes Críticos de Producción (P0 — 24 a 48 Horas)

#### Tarea 1.1: Forzar Verificación Criptográfica Centralizada de JWT (CRIT-01, CRIT-02)
* **Objetivo:** Impedir el algoritmo `none` y tokens con claves asimétricas falsificadas.
* **Diseño Seguro y Reutilizable:** Centralizar en un único módulo compartido entre todos los microservicios la verificación de tokens.
* **Implementación:**
  ```javascript
  // app/middlewares/authorization.js (Replicar en todos los microservicios)
  const decoded = jsonwebtoken.verify(token, PUBLIC_KEY, {
    algorithms: ["RS256"], // Lista blanca estricta; rechaza 'none', 'HS256', etc.
    issuer: "youconnext-auth", // Validar emisor
  });
  ```
* **Acción en Microservicios:**
  * `carpooling-user`: Ya utiliza `RS256` con `PUBLIC_KEY`.
  * `carpooling-notiifications`: Asegurar que `src/middleware/authMiddleware.js` utilice siempre `algorithms: ["RS256"]` contra la clave pública del servidor de autenticación.
  * `Carpooling-trayectos-express`: Verificar que el middleware de auth no acepte algoritmos alternativos.

#### Tarea 1.2: Sanitización de Salida y Eliminación de Fuga Masiva (HIGH-01)
* **Objetivo:** Proteger el Art. 5 y 32 del RGPD impidiendo que campos confidenciales (`password`, `dni`, `stripe_account`) viajen en las respuestas HTTP.
* **Patrón de Diseño (DTO Pattern):**
  * La entidad Prisma o modelo de base de datos **nunca** debe serializarse directamente en `res.json()`.
  * Todo endpoint debe devolver exclusivamente la representación filtrada a través de un DTO (Data Transfer Object):
  ```javascript
  // app/dto/userDto.js
  export class UserDTO {
    static toPublic(user) {
      return {
        id: user.id,
        name: user.name,
        surname: user.surname,
        img_perfil: user.img_perfil,
        averageRating: user.averageRating,
      };
    }

    static toPrivate(user) {
      return {
        id: user.id,
        name: user.name,
        surname: user.surname,
        email: user.email,
        phone: user.phone,
        ciudad: user.ciudad,
        img_perfil: user.img_perfil,
        role: user.role,
        // DNI, password hash y stripe_account NO se exponen sin máscara
      };
    }
  }
  ```

#### Tarea 1.3: Autenticación Obligatoria en Endpoints de Pago (HIGH-02 a HIGH-05)
* **Objetivo:** Ninguna operación de consulta de saldo, transacciones o cuentas vinculadas debe ser accesible públicamente.
* **Archivos Afectados:** `carpooling-user/app/index.js` y `Carpooling-trayectos-express/app/index.js`.
* **Acción:**
  * Verificar que todas las rutas bajo `/api/payment/*` y `/api/monedero/*` tengan `authorization.isLoged` como primer middleware.
  * Cambiar de inmediato las claves secretas de Stripe en el entorno de pre-producción (`.env`) por claves de prueba (`sk_test_...` y `pk_test_...`) para garantizar `livemode: false`.

#### Tarea 1.4: Protección de Rutas de Notificaciones Push (HIGH-08 a HIGH-11, MED-08, MED-09)
* **Objetivo:** Impedir el envío de notificaciones push no autenticadas o por parte de usuarios sin permisos administrativos.
* **Archivo Afectado:** `carpooling-notiifications/src/routes/pushRoutes.js`.
* **Implementación:**
  ```javascript
  const express = require("express");
  const router = express.Router();
  const pushController = require("../controllers/pushController");
  const { requireAuth, requireAdmin } = require("../middleware/authMiddleware");

  // Notificaciones de usuario: autenticadas
  router.post("/send", requireAuth, pushController.sendToToken);
  router.post("/send/user", requireAuth, pushController.sendToUser);
  router.post("/send/template/user", requireAuth, pushController.sendTemplatedToUser);

  // Notificaciones masivas: exclusivamente administradores (BFLA mitigation)
  router.post("/send/multicast", requireAuth, requireAdmin, pushController.sendToTokens);
  router.post("/send/topic", requireAuth, requireAdmin, pushController.sendToTopic);
  router.post("/topic/subscribe", requireAuth, requireAdmin, pushController.subscribeToTopic);
  router.post("/topic/unsubscribe", requireAuth, requireAdmin, pushController.unsubscribeFromTopic);

  module.exports = router;
  ```

---

### Fase 2: Privacidad RGPD y Control de Autorización BOLA (P1 — 3 a 5 Días)

#### Tarea 2.1: Control de Autorización en Perfiles y Reservas CAE (HIGH-06, HIGH-07, MED-07)
* **Problema:** Un usuario autenticado puede solicitar `/api/reserva/profile/:userId` o `/api/trayecto/conductor/:userId` cambiando el parámetro en la URL.
* **Solución Reutilizable (Middleware de Propiedad):**
  Crear una factoría de middleware para verificar que el usuario autenticado coincida con el parámetro de la petición o sea administrador:
  ```javascript
  export function requireOwnershipOrAdmin(paramName = "userId") {
    return (req, res, next) => {
      const targetId = req.params[paramName] || req.params.id;
      if (!req.user) {
        return res.status(401).json({ status: "Error", message: "No autenticado" });
      }
      if (String(req.user.id) === String(targetId) || req.user.role?.name === "admin") {
        return next();
      }
      return res.status(403).json({
        status: "Error",
        message: "Acceso denegado: no dispone de autorización sobre este recurso.",
      });
    };
  }
  ```
* **Aplicación en Rutas:**
  * `Carpooling-trayectos-express`: Proteger `/api/reserva/profile/:userId` con `requireOwnershipOrAdmin("userId")`.
  * `Carpooling-trayectos-express`: Proteger `/api/trayecto/conductor/:id` asegurando que devuelva únicamente datos públicos o requiera titularidad.

#### Tarea 2.2: Almacenamiento Seguro en la App Móvil (FRONT-01)
* **Problema:** `@react-native-async-storage/async-storage` guarda los JWT en texto plano en el almacenamiento de la app, accesible en dispositivos rooteados o mediante copias ADB.
* **Solución:**
  * Instalar `expo-secure-store`:
    ```bash
    npx expo install expo-secure-store
    ```
  * Crear un wrapper de almacenamiento seguro que reemplace las llamadas de `AsyncStorage`:
    ```typescript
    import * as SecureStore from 'expo-secure-store';

    export const TokenStorage = {
      async setToken(token: string): Promise<void> {
        await SecureStore.setItemAsync('user_session_token', token, {
          keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        });
      },
      async getToken(): Promise<string | null> {
        return await SecureStore.getItemAsync('user_session_token');
      },
      async removeToken(): Promise<void> {
        await SecureStore.deleteItemAsync('user_session_token');
      },
    };
    ```

#### Tarea 2.3: Restricción de Claves de Google Maps (HIGH-12, FRONT-03)
* **Problema:** La clave `AIzaSyBtz5pxS6ZVcVBA9jdbQn7bQPC72c81BT8` está sin restricciones de API ni de plataforma.
* **Acciones en Google Cloud Console:**
  1. **Restricción de Aplicación:**
     * Para Android: Limitar por Package Name (`es.youconnext.app`) y huella digital SHA-1 del certificado de firma (tanto de debug como de release).
     * Para iOS: Limitar por Bundle Identifier (`es.youconnext.app`).
  2. **Restricción de API:**
     * Habilitar únicamente: *Maps SDK for Android*, *Maps SDK for iOS* y *Directions API*.
  3. **Establecimiento de Cuotas:**
     * Configurar un límite diario de gasto y alertas automáticas de facturación.
  4. **Rotación:**
     * Generar un nuevo par de claves, actualizar los archivos de configuración y revocar la clave comprometida expuesta en la APK.

---

### Fase 3: Resiliencia, Concurrencia y Escalabilidad (P2 — 1 Semana)

#### Tarea 3.1: Arquitectura Asíncrona para Notificaciones Push (CRIT-03, CRIT-04)
* **Problema Identificado:** El microservicio `carpooling-notiifications` procesa peticiones concurrentes invocando directamente el SDK de Firebase en bucles síncronos `for...of`. Con 10 peticiones concurrentes, el hilo de eventos de Node.js se bloquea, agota conexiones y colapsa el proceso sin recuperación.
* **Solución Escalable (Message Queue & Worker Pattern):**
  Desacoplar la recepción HTTP del envío real mediante RabbitMQ o BullMQ (Redis):

```mermaid
sequenceDiagram
    autonumber
    actor Cliente as App / Microservicio
    participant API as API Notificaciones (Express)
    participant Cola as Cola de Mensajes (RabbitMQ/BullMQ)
    participant Worker as Push Worker Pool
    participant FCM as Firebase Cloud Messaging

    Cliente->>API: POST /api/push/send (con Token JWT)
    API->>API: Valida Auth + Rate Limiter
    API->>Cola: Encola payload {token, body, priority}
    API-->>Cliente: 202 Accepted {jobId: "abc-123"}
    Note over API,Cliente: Respuesta inmediata (<20ms), sin bloqueo
    Cola->>Worker: Dispatch con backpressure (concurrency: 5)
    Worker->>FCM: Envía notificación vía FCM con Circuit Breaker
    FCM-->>Worker: OK / Retryable Error
```

* **Supervisión de Procesos y Recuperación Automática (CRIT-04):**
  Configurar el entorno de ejecución con **PM2** en modo clúster o Kubernetes con políticas estrictas de auto-recuperación:
  ```json
  // ecosystem.config.js (carpooling-notiifications)
  module.exports = {
    apps: [{
      name: "youconnext-notifications",
      script: "./src/server.js",
      instances: 2,
      exec_mode: "cluster",
      max_memory_restart: "350M",
      restart_delay: 3000,
      exp_backoff_restart_delay: 100,
      env: {
        NODE_ENV: "production"
      }
    }]
  };
  ```

#### Tarea 3.2: Rate Limiting Distribuido con Redis (MED-10 a MED-25)
* **Problema:** El rate limiting basado en memoria local (`MemoryStore`) no escala horizontalmente si se despliegan varias réplicas o pods en Kubernetes (un atacante reparte la carga entre pods sin ser detectado).
* **Solución:** Emplear `rate-limit-redis`:
  ```javascript
  import { RedisStore } from "rate-limit-redis";
  import { createClient } from "redis";

  const redisClient = createClient({ url: process.env.REDIS_URL });
  await redisClient.connect();

  export const distributedRateLimiter = (max, windowMinutes) => rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    store: new RedisStore({
      sendCommand: (...args) => redisClient.sendCommand(args),
    }),
    keyGenerator: (req) => (req.user?.id ? `usr_${req.user.id}` : ipKeyGenerator(req.ip)),
  });
  ```

#### Tarea 3.3: Certificate Pinning y Seguridad en WebSocket (FRONT-02, FRONT-04)
1. **Certificate Pinning en React Native:**
   * Configurar `network_security_config.xml` en Android y `Info.plist` en iOS con los hashes SPKI (Subject Public Key Information) de los certificados TLS de `youconnext.es`.
2. **Autenticación en Socket.io:**
   * Archivo: `carpooling-messages/src/socket.js`.
   * Verificar el token JWT en el evento de conexión antes de aceptar cualquier socket:
     ```javascript
     io.use((socket, next) => {
       const token = socket.handshake.auth.token || socket.handshake.headers.authorization;
       if (!token) return next(new Error("Autenticación requerida para conectar WebSocket"));
       try {
         const decoded = jsonwebtoken.verify(token, PUBLIC_KEY, { algorithms: ["RS256"] });
         socket.user = decoded;
         next();
       } catch (err) {
         next(new Error("Token WebSocket inválido o expirado"));
       }
     });
     ```

---

### Fase 4: Hardening de Infraestructura y Cabeceras HTTP (P3 — 2 a 3 Días)

#### Tarea 4.1: Configuración Global en Nginx Reverse Proxy (MED-01 a MED-04, LOW-01 a LOW-13)
* **Archivo de Configuración:** `/etc/nginx/conf.d/youconnext.conf` (o en los Ingress Controllers de Kubernetes).
* **Directivas Obligatorias:**
  ```nginx
  # 1. HSTS (Strict-Transport-Security) con duración de 1 año e inclusión de subdominios
  add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;

  # 2. Protección contra MIME-sniffing
  add_header X-Content-Type-Options "nosniff" always;

  # 3. Protección contra Clickjacking
  add_header X-Frame-Options "DENY" always;

  # 4. Content Security Policy estricta
  add_header Content-Security-Policy "default-src 'self'; frame-ancestors 'none';" always;

  # 5. Ocultación de huellas digitales de software
  server_tokens off;
  proxy_hide_header X-Powered-By;
  ```

#### Tarea 4.2: Endurecimiento en Capa de Aplicación Express
* En todos los microservicios:
  ```javascript
  app.disable("x-powered-by");
  app.use(helmet({
    contentSecurityPolicy: true,
    crossOriginEmbedderPolicy: false,
  }));
  ```

---

## 5. Matriz de Cumplimiento Normativo (RGPD / PSD2)

| Requisito Normativo | Artículo / Norma | Vulnerabilidades Relacionadas | Acción Técnica de Mitigación | Estado |
| :--- | :--- | :--- | :--- | :--- |
| **Confidencialidad e Integridad** | RGPD Art. 5.1.f, Art. 32 | `HIGH-01`, `CRIT-01`, `CRIT-02` | Eliminación de hash de password y DNI en respuestas; forzado de RS256 en JWT. | ✅ En curso |
| **Protección desde el Diseño** | RGPD Art. 25 | `HIGH-06`, `HIGH-07`, `MED-06` | Implementación de DTOs y validación de propiedad (BOLA). | ✅ En curso |
| **Disponibilidad y Resiliencia** | RGPD Art. 32.1.b, Art. 32.1.c | `CRIT-03`, `CRIT-04`, `ALTO-13-17` | Cola asíncrona BullMQ/RabbitMQ, supervisión PM2 y Rate Limiting IPv6. | 🟡 Fase 3 |
| **Almacenamiento Seguro Móvil** | RGPD Art. 32 (Cifrado de datos) | `FRONT-01` | Migración de sesión a `expo-secure-store` (Keychain / EncryptedSharedPreferences). | 🟡 Fase 2 |
| **Transacciones Financieras Seguras**| PSD2 / RTS Art. 4 (SCA) | `HIGH-03`, `HIGH-04`, `HIGH-05` | Autenticación reforzada obligatoria en `/api/payment/*` y separación de Stripe a testmode. | ✅ Corregido |
| **Protección en Tránsito** | Directivas ENS / OWASP | `MED-01-04`, `FRONT-02` | HSTS obligatorio en Nginx y SSL Pinning en la app móvil. | 🟡 Fase 4 |

---

## 6. Procedimiento de Verificación y Re-Testing DAST

Antes de autorizar el paso a producción, el equipo de QA y Seguridad debe ejecutar la siguiente batería de pruebas automáticas:

1. **Test de Bypass JWT:**
   * Enviar peticiones a `/api/users/info` con JWT conteniendo `{"alg":"none"}` y comprobar que devuelven `401 Unauthorized`.
   * Enviar peticiones con `userId` ajeno firmado con clave simétrica aleatoria y comprobar rechazo `401`.
2. **Test de Fuga de Datos (Data Leakage):**
   * Realizar `GET /api/users` con un usuario estándar -> Debe devolver `403 Forbidden`.
   * Realizar `GET /api/users/:id` con usuario autenticado ajeno -> Debe devolver `403 Forbidden`.
   * Comprobar que en ninguna respuesta del sistema aparezcan las claves `"password"`, `"stripe_account"` ni `"dni"`.
3. **Test de Concurrencia y Resiliencia en Push:**
   * Ejecutar un test de carga con k6 o autocannon:
     ```bash
     k6 run --vus 50 --duration 30s test-push.js
     ```
   * El servicio debe responder `202 Accepted` o `429 Too Many Requests` sin que la tasa de error alcance el 100% ni se caiga el proceso Node.js.
4. **Test de Rate Limiting con IPv6:**
   * Lanzar ráfagas de 20 peticiones a `/api/auth/login` desde diferentes direcciones de una misma subred IPv6 -> Debe responder `429 Too Many Requests` a partir del 10º intento.
5. **Auditoría de Cabeceras HTTP:**
   * Ejecutar `curl -I https://usuarios.youconnext.es/health` y validar presencia de:
     * `strict-transport-security: max-age=31536000; includeSubDomains; preload`
     * `x-content-type-options: nosniff`
     * `x-frame-options: DENY`
     * Ausencia de `Server: nginx/...` y `x-powered-by: Express`.
