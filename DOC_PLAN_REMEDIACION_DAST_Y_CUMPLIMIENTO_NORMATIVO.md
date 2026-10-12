# PLAN INTEGRAL DE REMEDIACIÓN DAST Y CUMPLIMIENTO NORMATIVO
## Plataforma YouConnext (Carpooling)

---

**Versión del Plan:** 1.0.0  
**Fecha de Emisión:** Octubre 2026  
**Auditoría de Origen:** Informe de Seguridad DAST — Pre-producción (11 de octubre de 2026)  
**Clasificación:** Confidencial / Seguridad Corporativa  
**Estado:** Aprobado para Implementación Técnica  

---

## ÍNDICE GENERAL

1. [Resumen Ejecutivo y Estado Actual](#1-resumen-ejecutivo-y-estado-actual)
2. [Inventario y Análisis Detallado de Vulnerabilidades](#2-inventario-y-análisis-detallado-de-vulnerabilidades)
   - 2.1. Vulnerabilidades Críticas (CVSS 8.6 – 9.8)
   - 2.2. Vulnerabilidades de Severidad Alta (CVSS 7.0 – 8.6)
   - 2.3. Vulnerabilidades de Severidad Media (CVSS 4.0 – 6.9)
   - 2.4. Vulnerabilidades de Severidad Baja e Informativas
   - 2.5. Vulnerabilidades en Aplicación Móvil (React Native / Expo)
3. [Pilares Arquitectónicos: Seguro, Reutilizable, Escalable y Mantenible](#3-pilares-arquitectónicos)
   - 3.1. Arquitectura de Seguridad (Zero Trust & Defense in Depth)
   - 3.2. Arquitectura Reutilizable (Shared Security Core)
   - 3.3. Arquitectura Escalable y Resiliente (Asincronía & Backpressure)
   - 3.4. Arquitectura Mantenible (Data Contracts & Zod Schemas)
4. [Marco de Cumplimiento Normativo Legal y Técnico](#4-marco-de-cumplimiento-normativo)
   - 4.1. RGPD (Reglamento General de Protección de Datos - UE 2016/679)
   - 4.2. PSD2 / RTS on SCA (Directiva UE 2015/2366 de Servicios de Pago)
   - 4.3. OWASP API Security Top 10 (2023) & OWASP Mobile Top 10
   - 4.4. Esquema Nacional de Seguridad (ENS) e ISO/IEC 27001:2022
5. [Plan de Acción por Fases y Cronograma de Ejecución](#5-plan-de-acción-por-fases)
   - 5.1. Fase 1: Bloqueantes de Producción (Prioridad P0 — Días 1 y 2)
   - 5.2. Fase 2: Privacidad, IDOR y Móvil (Prioridad P1 — Días 3 a 5)
   - 5.3. Fase 3: Hardening, Rate Limiting y Resiliencia (Prioridad P2 — Días 6 a 10)
   - 5.4. Fase 4: Cabeceras, Banners y Gobernanza (Prioridad P3 — Días 11 a 14)
6. [Guía Técnica de Implementación con Código Reutilizable](#6-guía-técnica-de-implementación)
   - 6.1. Middleware de Autenticación Centralizado (RS256 Estricto)
   - 6.2. Middleware Fábrica de Ownership y Autorización ABAC
   - 6.3. Serializadores y DTOs de Salida (Cierre de Fuga de Datos)
   - 6.4. Control de Tasa (Rate Limiting) Multinivel
   - 6.5. Patrón Asíncrono de Resiliencia para Notificaciones Push (RabbitMQ)
   - 6.6. Almacenamiento Cifrado en Móvil (`expo-secure-store`)
   - 6.7. Hardening de Nginx / Ingress (HSTS, CSP y Banners)
7. [Protocolo de Pruebas, Re-test DAST y Criterios de Aceptación](#7-protocolo-de-pruebas-y-re-test)

---

## 1. RESUMEN EJECUTIVO Y ESTADO ACTUAL

La auditoría de seguridad dinámica (DAST) ejecutada sobre la plataforma **YouConnext** (servicios de carpooling) cubrió la totalidad de la superficie expuesta: autenticación, usuarios, viajes/reservas, monedero/pagos Stripe, notificaciones push, mensajería y la aplicación móvil Expo React Native.

### Veredicto del Auditor:
La plataforma **NO es apta para su despliegue en producción**. Se identificaron un total de **27 vulnerabilidades únicas confirmadas** (distribuidas en 80 incidencias de escaneo), que representan riesgos inaceptables para la privacidad de los usuarios, la integridad financiera de las transacciones y la disponibilidad del servicio:

```
+-------------------------------------------------------------------------------+
| TOTAL HALLAZGOS: 80 | VULNERABILIDADES ÚNICAS: 27                             |
| [CRÍTICO]: 4 (15%)  | [ALTO]: 17 (21%) | [MEDIO]: 24 (30%) | [BAJO/INFO]: 35  |
+-------------------------------------------------------------------------------+
```

### Factores Críticos Identificados:
1. **Quiebra Absoluta de Autenticación**: Aceptación de tokens JWT con algoritmo `none`, permitiendo a cualquier actor malicioso forjar tokens válidos sin firma y suplantar la identidad de cualquier usuario o administrador del sistema.
2. **Fuga Masiva de Datos de Carácter Personal (Exfiltración RGPD)**: El endpoint `GET /api/users` devuelve a cualquier usuario autenticado la totalidad del censo de usuarios con hashes de contraseñas (bcrypt), números de DNI/NIE, cuentas bancarias de Stripe, números de teléfono y correos electrónicos.
3. **Falta de Autenticación en Endpoints Financieros**: Los endpoints de monedero y saldo (`wallet-balance`, `wallet-transactions`, `cash-balance`) están desprotegidos y operando en **modo producción (`livemode: true`)**, exponiendo fondos y transacciones monetarias reales.
4. **Denegación de Servicio Inmediata en Notificaciones**: El microservicio de notificaciones push colapsa con tan solo 10 peticiones concurrentes y no se recupera automáticamente tras la saturación, dejando el servicio inoperativo.

---

## 2. INVENTARIO Y ANÁLISIS DETALLADO DE VULNERABILIDADES

### 2.1. Vulnerabilidades Críticas (CVSS 8.6 – 9.8)

#### [CRIT-01] JWT Acepta Algoritmo `none` — Bypass Total de Autenticación
- **CVSS v3.1:** 9.8 (Crítico) | **OWASP API:** API2:2023 Broken Authentication
- **Endpoints Afectados:** `POST /api/users/info`, microservicios con validación laxa de JWT.
- **Descripción:** El verificador de tokens no impone una lista blanca estricta de algoritmos criptográficos. Si el atacante envía un token con la cabecera `{"alg": "none"}` y firma vacía, el servidor lo considera legítimo.
- **Impacto:** Bypass total del control de acceso. Un atacante puede autenticarse con privilegios de administrador o de cualquier cliente sin conocer la clave privada ni la contraseña.

#### [CRIT-02] JWT con `userId` Falsificado es Aceptado — Suplantación de Identidad
- **CVSS v3.1:** 9.8 (Crítico) | **OWASP API:** API2:2023 Broken Authentication
- **Endpoints Afectados:** `GET /api/users/info`, `GET /api/users/:id`.
- **Descripción:** Derivado de la falta de validación íntegra de la firma, el sistema asume como verídico el claim `userId` contenido en el payload sin cotejo criptográfico estricto.
- **Impacto:** Acceso no autorizado a perfiles, saldos, reservas y datos fiscales de terceras personas.

#### [CRIT-03] Servidor de Notificaciones Colapsa con 10 Peticiones Concurrentes
- **CVSS v3.1:** 9.1 (Crítico) | **OWASP API:** API4:2023 Unrestricted Resource Consumption
- **Endpoint Afectado:** `POST /api/push/send` (`notifications.youconnext.es`).
- **Descripción:** Ausencia total de colas de mensajes, rate limiting o control de concurrencia en la recepción de solicitudes push hacia Firebase Cloud Messaging (FCM). Al someterlo a 10 solicitudes simultáneas, el servidor reporta un 100% de tasa de error.
- **Impacto:** DoS trivial con herramientas de mínimo consumo de ancho de banda. Puede paralizar el envío de alertas de viajes en tiempo real y comprometer la infraestructura compartida.

#### [CRIT-04] Servidor de Notificaciones No se Recupera tras Sobrecarga
- **CVSS v3.1:** 8.6 (Crítico) | **OWASP API:** API4:2023 Unrestricted Resource Consumption
- **Endpoint Afectado:** `POST /api/push/send` (`notifications.youconnext.es`).
- **Descripción:** Una vez saturado el proceso de Node.js, este no cuenta con un orquestador ni gestor de procesos (systemd, PM2 en cluster o Pod Autoscaling de Kubernetes) que reinicie automáticamente el servicio ante fallos no recuperables.
- **Impacto:** Indisponibilidad indefinida tras una ráfaga de tráfico puntual o ataque, requiriendo intervención manual del equipo de operaciones.

---

### 2.2. Vulnerabilidades de Severidad Alta (CVSS 7.0 – 8.6)

#### [HIGH-01] Fuga Masiva de Datos — `GET /api/users` Expone Toda la Base de Datos
- **CVSS v3.1:** 8.6 (Alta) | **OWASP API:** API1:2023 BOLA / API3:2023 BOPLA
- **Endpoint Afectado:** `GET /api/users` (`usuarios.youconnext.es`).
- **Código en Repositorio:** `carpooling-user/app/index.js` (líneas 123–142).
- **Descripción:** Cualquier usuario registrado con rol `user` puede invocar este endpoint y recibir una lista JSON con la totalidad de los usuarios registrados, incluyendo: `password` (hash bcrypt), `dni`, `phone`, `email`, `stripe_account` y `stripe_customer_account`.
- **Impacto:** Violación flagrante del RGPD (Sanciones de hasta 20 M€ o 4% de la facturación anual). Riesgo extremo de ataques de descifrado offline sobre contraseñas bcrypt y fraude de suplantación bancaria.

#### [HIGH-02 a HIGH-05] Endpoints Financieros y de Perfil sin Autenticación
- **CVSS v3.1:** 8.2 (Alta) | **OWASP API:** API2:2023 Broken Authentication
- **Endpoints Afectados:**
  - `HIGH-02`: `GET /api/users/info` (datos privados sin autenticar en ciertas rutas).
  - `HIGH-03`: `GET /api/payment/wallet-balance` (saldo de monedero y certificados energéticos CAE).
  - `HIGH-04`: `GET /api/payment/wallet-transactions` (histórico de pagos y transacciones).
  - `HIGH-05`: `GET /api/payment/cash-balance` (balance Stripe real en `livemode: true`).
- **Impacto:** Cualquier atacante anónimo en internet puede espiar movimientos monetarios, datos de facturación e información patrimonial sin enviar token alguno.

#### [HIGH-06] IDOR en Perfil de Usuario con Exposición de Atributos Sensibles
- **CVSS v3.1:** 7.5 (Alta) | **OWASP API:** API1:2023 BOLA
- **Endpoint Afectado:** `GET /api/users/:id` (`usuarios.youconnext.es`).
- **Descripción:** El servidor no comprueba si `req.user.id === req.params.id`. Un usuario autenticado puede solicitar el UUID de cualquier otro usuario y recibir sus credenciales, DNI y cuenta de Stripe.

#### [HIGH-07] IDOR en Perfil de Reservas con Datos de Certificados Energéticos CAE
- **CVSS v3.1:** 7.2 (Alta) | **OWASP API:** API1:2023 BOLA
- **Endpoint Afectado:** `GET /api/reserva/profile/:userId` (`travels.youconnext.es`).
- **Descripción:** Visualización indebida de trayectos, historiales, pasajeros transportados y certificados energéticos (kWh y euros devengados) de otros conductores.

#### [HIGH-08 a HIGH-11] Endpoints de Notificaciones Push sin Autenticación
- **CVSS v3.1:** 7.5 (Alta) | **OWASP API:** API5:2023 Broken Function Level Authorization
- **Endpoints Afectados:** `POST /api/push/send`, `POST /api/push/send/user`, `POST /api/push/send/topic`, `POST /api/push/send/multicast`.
- **Código en Repositorio:** `carpooling-notiifications/src/routes/pushRoutes.js`.
- **Descripción:** Los routers carecen de middleware `requireAuth`. Confirmado el envío de notificaciones push arbitrarias reales a dispositivos móviles de usuarios YouConnext desde clientes no autenticados.

#### [HIGH-12] Clave de Google Maps sin Restricción
- **CVSS v3.1:** 7.0 (Alta) | **OWASP API:** API8:2023 Security Misconfiguration
- **Clave Expuesta:** `AIzaSyBtz5pxS6ZVcVBA9jdbQn7bQPC72c81BT8`.
- **Descripción:** La clave no cuenta con restricciones de Application ID (Android/iOS package name) ni de dirección IP/dominio, ni límites presupuestarios diarios en Google Cloud Console.

#### [ALTO-13 a ALTO-17] Ausencia Total de Rate Limiting en Flujos Críticos
- **CVSS v3.1:** 7.5 (Alta) | **OWASP API:** API4:2023 Unrestricted Resource Consumption
- **Endpoints Afectados:**
  - `ALTO-13`: `POST /api/auth/login` (fuerza bruta de contraseñas).
  - `ALTO-14`: `POST /api/auth/register` (creación masiva de cuentas falsas).
  - `ALTO-15`: `POST /api/auth/forgot-password` (bombardeo de correos electrónicos y SMS).
  - `ALTO-16`: `POST /api/payment/recharge` (abuso y validación de tarjetas robadas).
  - `ALTO-17`: `POST /api/payment/payout` (solicitudes masivas de retiro monetario).

---

### 2.3. Vulnerabilidades de Severidad Media (CVSS 4.0 – 6.9)

- **[MED-01 a MED-04] Falta de HSTS (`Strict-Transport-Security`):** Los microservicios de usuarios, travels, notifications y messages no envían la cabecera HSTS, permitiendo ataques de SSL-strip y degradación a HTTP en redes WiFi públicas.
- **[MED-05] Login sin Límite de Intentos:** 60 solicitudes consecutivas erróneas procesadas sin bloqueo temporal ni CAPTCHA.
- **[MED-06 y MED-07] IDOR en Coches y Trayectos:** `GET /api/cars/user/:userId` y `GET /api/trayecto/conductor/:userId` permiten ver vehículos y rutas de cualquier usuario sin verificar permisos.
- **[MED-08 y MED-09] Envío Masivo Push Accesible por Usuario Estándar (BFLA):** Un usuario normal puede solicitar `/api/push/send/topic` y `/multicast` sin ser bloqueado por rol administrativo.
- **[MED-10 a MED-22] Falta de Rate Limiting en 11 Endpoints de Datos:** Endpoints de consultas generales (`/api/users`, `/api/reserva`, `/api/messages`, etc.) expuestos a scraping masivo.
- **[MED-23 a MED-25] Servidores sin Control de Concurrencia Bajo Carga:** Pruebas de 500 peticiones concurrentes sin que se active una sola respuesta `429 Too Many Requests`.

---

### 2.4. Vulnerabilidades de Severidad Baja e Informativas

- **[LOW-01 a LOW-13] Cabeceras de Seguridad Faltantes:** Ausencia de `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` y `Content-Security-Policy`.
- **[Banners] Fuga de Versiones de Software:** Respuestas HTTP revelando `Server: nginx/1.28.3` y cabecera `X-Powered-By: Express`.
- **[LOW-14] Enumeración de Usuarios en Login:** El servidor responde `404 EMAIL_NOT_REGISTERED` si el correo no existe, y `401 INVALID_CREDENTIALS` si la contraseña falla, permitiendo catalogar correos registrados.
- **[Informativo] DNS No Resuelto:** El subdominio `tracking.youconnext.es` no resuelve en DNS.

---

### 2.5. Vulnerabilidades en Aplicación Móvil (React Native / Expo)

- **[FRONT-01] Almacenamiento Inseguro de JWT:** Uso de `@react-native-async-storage/async-storage` (`api.js` línea 33) almacenando tokens en texto plano en la memoria flash del dispositivo, accesible en terminales rooteados o vía copias de seguridad ADB.
- **[FRONT-02] Ausencia de SSL/Certificate Pinning:** La aplicación móvil no valida la huella digital del certificado TLS del servidor, permitiendo ataques Man-in-the-Middle (MitM) mediante instalación de certificados raíz no confiables.
- **[FRONT-03] Google Maps API Key Embebida en APK:** La clave está visible en los assets de la compilación Hermes sin ofuscación.
- **[FRONT-04] Socket.io sin Autenticación en Handshake:** El servidor de WebSocket no verifica el JWT antes de asociar el socket al usuario.

---

## 3. PILARES ARQUITECTÓNICOS

Para garantizar una solución **segura, reutilizable, escalable y mantenible**, se adopta un enfoque de diseño modular:

```
                        PETICIÓN CLIENTE
                               │
                               ▼
        ┌─────────────────────────────────────────────┐
        │   PERÍMETRO DE RED / INGRESS / NGINX        │
        │   - HSTS preload, TLS 1.3                   │
        │   - Security Headers (nosniff, DENY, CSP)   │
        │   - Ocultación Banners (server_tokens off)  │
        └──────────────────────┬──────────────────────┘
                               │
                               ▼
        ┌─────────────────────────────────────────────┐
        │   CAPA DE PROTECCIÓN TRANSVERSAL (SHARED)   │
        │   - Distributed Rate Limiter (Redis)        │
        │   - Helmet & CORS Restrictivo               │
        │   - Token Signature Verification (RS256)    │
        └──────────────────────┬──────────────────────┘
                               │
                               ▼
        ┌─────────────────────────────────────────────┐
        │   AUTORIZACIÓN Y CONTROL DE ACCESO          │
        │   - RBAC: requireRole('admin' | 'user')     │
        │   - ABAC: verifyOwnership(resourceId)       │
        └──────────────────────┬──────────────────────┘
                               │
                               ▼
        ┌─────────────────────────────────────────────┐
        │   CONTROLADOR Y LÓGICA DE NEGOCIO           │
        │   - Validación de entrada con Zod           │
        │   - Notificaciones asíncronas vía RabbitMQ  │
        └──────────────────────┬──────────────────────┘
                               │
                               ▼
        ┌─────────────────────────────────────────────┐
        │   SERIALIZACIÓN DE SALIDA (DATA CONTRACTS)  │
        │   - UserPublicDTO / UserPrivateDTO          │
        │   - Eliminación estricta de campos críticos │
        └─────────────────────────────────────────────┘
```

### 3.1. Arquitectura de Seguridad (Zero Trust & Defense in Depth)
- **Firma Asimétrica Obligatoria:** Clave privada en posesión exclusiva del servicio de identidad (`carpooling-user`); todos los microservicios satélite verifican con la clave pública en formato PEM mediante el algoritmo `RS256` inmutable.
- **Autorización a Nivel de Objeto (Anti-BOLA/IDOR):** Ninguna consulta a base de datos basada en un identificador externo se procesa sin validar previamente la titularidad del solicitante.
- **Sanitización de Respuestas:** El acceso a la capa de datos no se expone directamente a los clientes HTTP; cada entidad pasa por un transformador DTO que actúa como cortafuegos contra fugas de información.

### 3.2. Arquitectura Reutilizable (Shared Security Core)
- En lugar de replicar lógica de autenticación en 5 microservicios diferentes, se diseña un módulo común (`shared/security`) que estandariza:
  - Middleware de verificación JWT (`requireAuth`).
  - Middleware de control de roles (`requireRole`).
  - Middleware de verificación de propiedad (`requireOwnership`).
  - Fábrica de limitadores de tasa (`createRateLimiter`).
  - Sanitizador de respuestas (`dtoSanitizer`).

### 3.3. Arquitectura Escalable y Resiliente (Asincronía & Backpressure)
- **Desacoplamiento de Notificaciones Push:** El endpoint HTTP `POST /api/push/send` no invoca FCM de forma síncrona. Encola un evento ligero en RabbitMQ (`push_notifications_queue`) y responde inmediatamente `202 Accepted`.
- **Workers Autónomos con Circuit Breaker:** Los workers procesan la cola con límite de concurrencia y retroceso exponencial (exponential backoff) ante fallos en los servidores de Google FCM o Apple APNs.
- **Supervisión de Procesos:** Configuración de reinicio automático y clusterización con PM2 (`instances: "max"`, `exec_mode: "cluster"`) o Kubernetes (`readinessProbe` y `livenessProbe` apuntando a `/health`).

### 3.4. Arquitectura Mantenible (Data Contracts & Zod Schemas)
- Centralización de definiciones de esquemas con **Zod** para entradas y salidas.
- Comprobación estricta de variables de entorno al arranque: el servicio aborta su inicio inmediatamente si `JWT_PUBLIC_KEY` no es un certificado PEM válido o si las credenciales de Stripe operan en livemode dentro de entornos de desarrollo.

---

## 4. MARCO DE CUMPLIMIENTO NORMATIVO LEGAL Y TÉCNICO

La remediación de estas vulnerabilidades es indispensable para cumplir con el marco regulatorio vigente:

### 4.1. RGPD (Reglamento General de Protección de Datos — UE 2016/679)
- **Artículo 5.1.c (Minimización de Datos):** Los datos personales deben ser adecuados, pertinentes y limitados a lo necesario en relación con los fines.  
  *Acción YouConnext:* Supresión total de contraseñas, DNIs y cuentas bancarias en endpoints públicos y listados de usuarios (`HIGH-01`, `HIGH-06`).
- **Artículo 5.1.f (Integridad y Confidencialidad):** Garantía de protección contra tratamiento no autorizado o ilícito y contra su pérdida o destrucción mediante medidas técnicas adecuadas.  
  *Acción YouConnext:* Cifrado de tokens en reposo móvil con `expo-secure-store` (`FRONT-01`) y firma criptográfica asimétrica inmutable (`CRIT-01`, `CRIT-02`).
- **Artículo 25 (Protección de Datos desde el Diseño y por Defecto):** Implementación de DTOs y controles de acceso nativos en cada capa de la aplicación.
- **Artículo 32 (Seguridad del Tratamiento):** Obligación de implantar medidas como la seudonimización y el cifrado de datos, y capacidad de garantizar la resiliencia continuada de los sistemas (`CRIT-03`, `CRIT-04`).
- **Artículos 33 y 34 (Notificación de Violaciones de Seguridad):** Un fallo del calibre de `HIGH-01` en producción obligaría a notificar a la Agencia Española de Protección de Datos (AEPD) en un plazo máximo de 72 horas y a todos los usuarios afectados. Corregirlo antes del paso a producción evita sanciones catastróficas.

### 4.2. PSD2 / RTS on SCA (Directiva UE 2015/2366 de Servicios de Pago)
- **Artículo 97 (Autenticación Reforzada de Clientes - SCA):** Exige autenticación robusta al acceder a cuentas de pago e iniciar operaciones de pago electrónico.  
  *Acción YouConnext:* Aplicación de autenticación obligatoria y validación estricta de sesión en `wallet-balance`, `wallet-transactions`, `recharge` y `payout` (`HIGH-02` a `HIGH-05`).
- **RTS (Normas Técnicas de Regulación) - Integridad de Transacciones:** Obligación de proteger los identificadores y credenciales de pago contra alteración.  
  *Acción YouConnext:* Desactivación inmediata del modo de dinero real (`livemode: true`) en entornos de prueba y separación estricta de claves API de Stripe.

### 4.3. OWASP API Security Top 10 (2023)
| Categoría OWASP                                      | Hallazgo DAST                                                 | Medida Técnica Implementada                                                                                  |
| :--------------------------------------------------- | :------------------------------------------------------------ | :----------------------------------------------------------------------------------------------------------- |
| **API1: Broken Object Level Authorization (BOLA)**   | `HIGH-01`, `HIGH-06`, `HIGH-07`, `MED-06`, `MED-07`           | Middleware `verifyOwnership` que valida el identificador de sesión frente al recurso solicitado en DB.       |
| **API2: Broken Authentication**                      | `CRIT-01`, `CRIT-02`, `HIGH-02`–`05`                          | Forzado de `algorithms: ['RS256']`, prohibición de `alg: none` y autenticación universal en rutas privadas.  |
| **API3: Broken Object Property Level Auth**          | `HIGH-01`, `HIGH-06`                                          | Serializadores DTO de usuario con filtrado whitelist de propiedades exportables.                             |
| **API4: Unrestricted Resource Consumption**          | `CRIT-03`, `CRIT-04`, `ALTO-13`–`17`, `MED-05`, `MED-10`–`25` | Rate limiting con `express-rate-limit`, desacoplamiento con colas RabbitMQ y circuit breaker.                |
| **API5: Broken Function Level Authorization (BFLA)** | `HIGH-08`–`11`, `MED-08`, `MED-09`                            | Middleware `requireRole('admin')` en rutas administrativas y de difusión masiva de notificaciones.           |
| **API8: Security Misconfiguration**                  | `HIGH-12`, `MED-01`–`04`, `LOW-01`–`13`, Banners              | Restricción de Google API Keys en GCP Console, cabecera HSTS en Nginx, Helmet y supresión de Server Banners. |

### 4.4. Esquema Nacional de Seguridad (ENS) e ISO/IEC 27001:2022
- **Control A.9 (Control de Accesos):** Política de contraseñas, prevención de enumeración de cuentas (`LOW-14`) y control de acceso basado en roles y atributos.
- **Control A.12 (Seguridad en las Operaciones):** Protección contra código malicioso, copias de seguridad, registro de eventos (sin volcar tokens ni datos bancarios en logs) y gestión de vulnerabilidades técnicas.
- **Control A.14 (Seguridad en el Desarrollo y Soporte):** Principio de desarrollo seguro, separación estricta de entornos de desarrollo, pruebas y producción.

---

## 5. PLAN DE ACCIÓN POR FASES Y CRONOGRAMA DE EJECUCIÓN

```
+─────────────────────────────────────────────────────────────────────────────+
| CRONOGRAMA DE REMEDIACIÓN TÉCNICA                                           |
|                                                                             |
| DÍAS 1-2:   FASE 1 - P0: Bloqueantes de Producción (JWT, Fuga Datos, Auth)  |
| DÍAS 3-5:   FASE 2 - P1: Privacidad, BOLA/IDOR y Seguridad Móvil            |
| DÍAS 6-10:  FASE 3 - P2: Rate Limiting, Resiliencia Push y Anti-Bruteforce  |
| DÍAS 11-14: FASE 4 - P3: Hardening Web/Nginx, Banners, Retest y Auditoría    |
+─────────────────────────────────────────────────────────────────────────────+
```

### 5.1. FASE 1: Bloqueantes de Producción (Prioridad P0 — Días 1 y 2)
*Cualquier despliegue a producción debe estar estrictamente paralizado hasta culminar esta fase.*

1. **Blindaje Criptográfico de Tokens JWT (`CRIT-01`, `CRIT-02`):**
   - Actualizar `app/middlewares/authorization.js` en todos los microservicios.
   - Forzar validación explícita con `algorithms: ['RS256']` en `jwt.verify()`.
   - Rechazar de forma fulminante cualquier token sin firma o con `alg: none`.
   - Garantizar que los controladores nunca tomen el `userId` de la petición sin cotejar que coincida con `req.user.id`.
2. **Cierre Inmediato de la Fuga Masiva de Datos (`HIGH-01`):**
   - Modificar la ruta `GET /api/users` en `carpooling-user/app/index.js` para exigir rol `admin` (`authorization.onlyAdmin`).
   - Implementar `UserSerializer.toPublic()` eliminando de raíz `password`, `dni`, `stripe_account` y `stripe_customer_account`.
3. **Protección de Endpoints Financieros y Configuración Stripe (`HIGH-02` a `HIGH-05`):**
   - Añadir middleware `authorization.isLoged` a todos los endpoints de `/api/payment/*` y `/api/users/info`.
   - Configurar variables de entorno en staging para usar claves de prueba de Stripe (`sk_test_...`), asegurando `livemode: false`.
4. **Protección Básica en Notificaciones Push (`HIGH-08` a `HIGH-11`):**
   - Aplicar `requireAuth` y `requireAdmin` en `carpooling-notiifications/src/routes/pushRoutes.js`.

---

### 5.2. FASE 2: Privacidad, IDOR y Móvil (Prioridad P1 — Días 3 a 5)

1. **Remediación Integral de IDOR / BOLA (`HIGH-06`, `HIGH-07`, `MED-06`, `MED-07`, `MED-13`):**
   - `GET /api/users/:id`: Si `req.user.id !== req.params.id` y no es admin, redirigir internamente o responder exclusivamente con el DTO público (`name`, `avatar`, `rating`).
   - `GET /api/reserva/profile/:userId`: Validar `req.user.id === req.params.userId`.
   - `GET /api/cars/user/:userId`: Validar `req.user.id === req.params.userId` para edición; restringir a datos públicos en caso de reserva.
   - `GET /api/trayecto/conductor/:userId`: Devolver únicamente trayectos públicos activos, suprimiendo datos personales privados.
2. **Migración a Almacenamiento Seguro en la App Móvil (`FRONT-01`):**
   - Reemplazar `@react-native-async-storage/async-storage` por `expo-secure-store` en `carpooling-mobile/YouConnextApp/src/services/api.js`.
3. **Restricción de Google Maps API Key (`HIGH-12`, `FRONT-03`):**
   - Acceder a Google Cloud Console.
   - Restringir la clave `AIzaSyBtz5pxS6ZVcVBA9jdbQn7bQPC72c81BT8` por:
     - Nombre de paquete Android (`com.youconnext.app`) y huella SHA-1.
     - Bundle ID de iOS.
     - APIs habilitadas exclusivamente: Maps SDK for Android, Maps SDK for iOS, Geocoding API.
     - Cuota máxima de gasto diario (budget alert).
4. **Protección de WebSockets (`FRONT-04`):**
   - Implementar middleware en Socket.io para verificar el token JWT con RS256 en el handshake previo a la conexión.

---

### 5.3. FASE 3: Hardening, Rate Limiting y Resiliencia (Prioridad P2 — Días 6 a 10)

1. **Implementación de Rate Limiting Diferenciado (`ALTO-13` a `ALTO-17`, `MED-05`, `MED-10` a `MED-25`):**
   - Instalar `express-rate-limit` y `rate-limit-redis`.
   - Configurar límites estrictos:
     - **Auth (Login/Registro/Forgot):** Máximo 5 peticiones cada 15 minutos por IP.
     - **Pagos y Monedero (Recharge/Payout):** Máximo 10 peticiones por minuto por usuario/IP.
     - **API General:** Máximo 100 peticiones por minuto por token/IP.
2. **Mitigación de Enumeración de Cuentas (`LOW-14`):**
   - Modificar `carpooling-user/app/controllers/authentication.js` para unificar respuestas de error en login.
   - Retornar siempre `401 Unauthorized` con el mensaje: `"Correo electrónico o contraseña incorrectos"`, tanto si el usuario no existe como si la clave es errónea.
3. **Resiliencia y Worker de Notificaciones Push (`CRIT-03`, `CRIT-04`):**
   - Desacoplar el envío mediante la cola RabbitMQ existente en la infraestructura.
   - Configurar PM2 en modo clúster con auto-reinicio por memoria y fallos no controlados (`max_memory_restart: "300M"`, `instances: 2`).
   - Implementar circuit breaker con la librería `opossum` para llamadas a Firebase FCM.

---

### 5.4. FASE 4: Cabeceras, Banners y Gobernanza (Prioridad P3 — Días 11 a 14)

1. **Hardening de Cabeceras HTTP y Nginx (`MED-01` a `MED-04`, `LOW-01` a `LOW-13`, Banners):**
   - Incorporar `helmet` en todas las aplicaciones Node.js/Express.
   - Desactivar cabecera Express: `app.disable('x-powered-by')`.
   - Añadir directivas en la configuración de Nginx / Kubernetes Ingress:
     ```nginx
     add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
     add_header X-Content-Type-Options "nosniff" always;
     add_header X-Frame-Options "DENY" always;
     add_header Content-Security-Policy "default-src 'self'" always;
     server_tokens off;
     proxy_hide_header X-Powered-By;
     ```
2. **Certificate Pinning en Cliente Móvil (`FRONT-02`):**
   - Configurar Network Security Config en Android y TrustKit en iOS o utilizar `react-native-ssl-pinning`.
3. **Saneamiento de Dominio DNS:**
   - Corregir el registro DNS para `tracking.youconnext.es` o desmantelar su referencia en configuración.

---

## 6. GUÍA TÉCNICA DE IMPLEMENTACIÓN CON CÓDIGO REUTILIZABLE

### 6.1. Middleware de Autenticación Centralizado (RS256 Estricto)
*Ubicación recomendada:* `app/middlewares/authorization.js`

```javascript
import jsonwebtoken from "jsonwebtoken";
import { PUBLIC_KEY, JWT_ALGORITHM } from "../utils/jwtKeys.js";

// Lista blanca estricta de algoritmos permitidos (prohíbe 'none' y simétricos)
const ALLOWED_ALGORITHMS = ["RS256"];

export function extractBearerToken(req) {
  const authHeader = req.headers.authorization || req.headers.authentication;
  if (!authHeader || typeof authHeader !== "string") return null;

  const [scheme, token] = authHeader.split(" ");
  if (!scheme || !token || scheme.toLowerCase() !== "bearer") return null;

  return token.trim();
}

export function verifyStrictToken(token) {
  if (!token) throw new Error("TOKEN_MISSING");
  
  // Verificación con lista blanca explícita
  return jsonwebtoken.verify(token, PUBLIC_KEY, {
    algorithms: ALLOWED_ALGORITHMS,
    complete: false // Retorna exclusivamente el payload verificado
  });
}

export async function isLoged(req, res, next) {
  try {
    const token = extractBearerToken(req) || req.cookies?.access_token;
    if (!token) {
      return res.status(401).json({
        status: "Error",
        code: "UNAUTHORIZED",
        message: "Se requiere autenticación para acceder a este recurso."
      });
    }

    const payload = verifyStrictToken(token);
    
    // Asignación segura del contexto de usuario derivado de la firma
    req.user = {
      id: String(payload.userId),
      email: payload.email,
      role: payload.role || "user"
    };

    next();
  } catch (error) {
    return res.status(401).json({
      status: "Error",
      code: "INVALID_TOKEN",
      message: "Token inválido o expirado."
    });
  }
}

export function requireRole(allowedRoles = []) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        status: "Error",
        code: "FORBIDDEN",
        message: "No tienes los privilegios necesarios para realizar esta acción."
      });
    }
    next();
  };
}
```

---

### 6.2. Middleware Fábrica de Ownership y Autorización ABAC
*Evita vulnerabilidades de BOLA/IDOR de manera estandarizada:*

```javascript
export function requireOwnership(getOwnerIdFromRequest) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ status: "Error", message: "No autenticado" });
    }

    // Los administradores disponen de acceso de supervisión
    if (req.user.role === "admin") {
      return next();
    }

    const targetOwnerId = String(getOwnerIdFromRequest(req));
    const currentUserId = String(req.user.id);

    if (targetOwnerId !== currentUserId) {
      return res.status(403).json({
        status: "Error",
        code: "ACCESS_DENIED",
        message: "No tienes autorización para acceder a los datos de este usuario."
      });
    }

    next();
  };
}

// Ejemplo de uso directo en rutas:
// app.get('/api/users/:id', isLoged, requireOwnership(req => req.params.id), userController.getUser);
// app.get('/api/reserva/profile/:userId', isLoged, requireOwnership(req => req.params.userId), reservaController.getProfile);
```

---

### 6.3. Serializadores y DTOs de Salida (Cierre de Fuga de Datos)
*Ubicación:* `app/dto/userDto.js`

```javascript
export class UserDTO {
  // Proyección pública: Visible por otros usuarios en reservas o búsquedas
  static toPublic(user) {
    if (!user) return null;
    return {
      id: user.id,
      name: user.name,
      avatar: user.avatar || user.foto || null,
      rating: user.rating || 5.0,
      createdAt: user.createdAt
    };
  }

  // Proyección privada: Solo accesible por el propio usuario o admin
  static toPrivate(user) {
    if (!user) return null;
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone || null,
      birthDate: user.fecha_nacimiento || null,
      role: user.role?.name || user.role || "user",
      avatar: user.avatar || null,
      preferences: user.preferences || {},
      onboardingCompleted: Boolean(user.onboarding_ended)
      // NUNCA incluir: password, dni, stripe_account_id, stripe_customer_account
    };
  }
}
```

---

### 6.4. Control de Tasa (Rate Limiting) Multinivel
*Instalación:* `npm install express-rate-limit`

```javascript
import rateLimit from "express-rate-limit";

// Rate limiting para autenticación (Anti Fuerza Bruta)
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // 5 intentos por IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: "Error",
    code: "TOO_MANY_REQUESTS",
    message: "Demasiados intentos de acceso fallidos. Por favor, inténtalo de nuevo en 15 minutos."
  }
});

// Rate limiting para transacciones financieras
export const paymentRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 10, // 10 solicitudes por minuto
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: {
    status: "Error",
    code: "RATE_LIMIT_EXCEEDED",
    message: "Límite de operaciones por minuto superado. Espera un momento."
  }
});

// Rate limiting general
export const generalApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false
});
```

---

### 6.5. Patrón Asíncrono de Resiliencia para Push Notifications (RabbitMQ)

```javascript
// En el controlador HTTP (Respuesta Inmediata - Non Blocking):
export async function queuePushNotification(req, res, next) {
  const { userId, title, body, data } = req.body;
  
  if (!userId || !title || !body) {
    return res.status(400).json({ error: "Faltan campos obligatorios" });
  }

  const messagePayload = {
    userId,
    title,
    body,
    data,
    queuedAt: new Date().toISOString()
  };

  // Publicación en cola duradera de RabbitMQ
  await rabbitmq.sendToQueue("push_notifications_queue", messagePayload);

  return res.status(202).json({
    status: "Accepted",
    message: "Notificación push encolada satisfactoriamente para su procesamiento."
  });
}

// En el Worker Autónomo (Consumidor desacoplado con control de flujo):
// El worker extrae mensajes a una tasa máxima (ej. 50/segundo), evitando sobrecarga de sockets.
```

---

### 6.6. Almacenamiento Cifrado en Móvil (`expo-secure-store`)
*Modificación en `carpooling-mobile/YouConnextApp/src/services/api.js`:*

```javascript
import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "youconnext_access_token";
const REFRESH_TOKEN_KEY = "youconnext_refresh_token";

class ApiService {
  async loadTokens() {
    try {
      this.accessToken = await SecureStore.getItemAsync(TOKEN_KEY);
      this.refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
    } catch (error) {
      console.error("Error al cargar credenciales cifradas:", error);
    }
  }

  async saveTokens(accessToken, refreshToken) {
    try {
      this.accessToken = accessToken;
      this.refreshToken = refreshToken;
      await SecureStore.setItemAsync(TOKEN_KEY, accessToken, {
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK
      });
      await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken, {
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK
      });
    } catch (error) {
      console.error("Error al guardar credenciales en SecureStore:", error);
    }
  }

  async clearTokens() {
    try {
      this.accessToken = null;
      this.refreshToken = null;
      await SecureStore.deleteItemAsync(TOKEN_KEY);
      await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    } catch (error) {
      console.error("Error al eliminar credenciales:", error);
    }
  }
}
```

---

### 6.7. Hardening de Nginx / Ingress (HSTS, CSP y Banners)

```nginx
# Añadir en bloque http o server de Nginx / Ingress Controller:
server {
    listen 443 ssl http2;
    server_name usuarios.youconnext.es travels.youconnext.es notifications.youconnext.es;

    # Ocultar banners de servidor
    server_tokens off;
    proxy_hide_header X-Powered-By;

    # HSTS (Strict-Transport-Security) - Preload habilitado para 1 año
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;

    # Cabeceras de protección MIME y Clickjacking
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Content-Security-Policy "default-src 'self'; frame-ancestors 'none';" always;

    # Configuración de buffers contra ataques Slowloris / Buffer Overflow
    client_body_buffer_size 128k;
    client_max_body_size 10M;
    client_header_buffer_size 1k;
    large_client_header_buffers 4 4k;
}
```

---

## 7. PROTOCOLO DE PRUEBAS, RE-TEST DAST Y CRITERIOS DE ACEPTACIÓN

Para dar por concluida la remediación técnica y autorizar el pase a producción, se ejecutarán las siguientes fases de verificación:

### 7.1. Batería de Pruebas Unitarias e Integración (CI/CD)
1. **Test de Bypass JWT:** Envío de payload con `{"alg": "none"}` a todos los endpoints protegidos. El test debe arrojar código `401 Unauthorized` en el 100% de los casos.
2. **Test de Falsificación de Identidad:** Token válido para el Usuario A solicitando recursos del Usuario B. El test debe arrojar código `403 Forbidden`.
3. **Test de Enumeración en Login:** Envío de credenciales con email inexistente y con contraseña errónea; ambas respuestas deben devolver el mismo código de estado (`401`) y el mismo mensaje en tiempos equivalentes (±50ms).
4. **Test de Serialización:** Inspección de respuestas JSON de usuario comprobando que las claves `password`, `dni` y `stripe_account` nunca figuren en el payload devuelto.

### 7.2. Prueba de Carga y Resiliencia (Stress Test)
- Utilización de herramientas como `k6` o `autocannon`:
  ```bash
  # Simular 50 usuarios concurrentes en /api/push/send durante 30 segundos
  k6 run --vus 50 --duration 30s load_push_test.js
  ```
- **Criterio de éxito:** Tasa de error < 1%, tiempo de respuesta p95 < 500ms, activación correcta de códigos `429 Too Many Requests` sin caída del servicio.

### 7.3. Criterio de Aceptación Final (Definition of Done)
1. **0 Vulnerabilidades Críticas** (0 de 4).
2. **0 Vulnerabilidades Altas** (0 de 17).
3. **Reducción de Vulnerabilidades Medias > 90%** (resolución de rate-limiting, HSTS y banners).
4. **Informe de Re-test DAST Favorable** firmado por el responsable de seguridad.
5. **Certificación de Conformidad con RGPD y PSD2** incorporada en el expediente técnico de la aplicación.

---

## 8. REGISTRO Y AUDITORÍA DE IMPLEMENTACIONES TÉCNICAS REALIZADAS (CHANGELOG DE REMEDIACIÓN)

En respuesta a los requerimientos prioritarios y para blindar la aplicación antes de cualquier despliegue, se han desarrollado e integrado los siguientes componentes en el microservicio `carpooling-user`:

### 8.1. Control de Acceso por Nivel Reutilizable (`app/middlewares/accessControl.js`)
- **`verifyStrictToken(token)`:** Verifica la firma criptográfica obligatoriamente con el algoritmo RS256, rechazando tokens con `alg: none` o claves no autorizadas (`CRIT-01`, `CRIT-02`).
- **`requireAuth`:** Extrae el token Bearer o cookie y valida la integridad de los claims antes de otorgar acceso.
- **`requireRole(...roles)`:** Middleware RBAC reutilizable para limitar endpoints por rol (`admin`, `user`, etc.).
- **`requireOwnership(getOwnerIdFn, options)`:** Middleware ABAC reutilizable que previene IDOR/BOLA (`HIGH-06`, `HIGH-07`, `MED-06`) verificando `req.user.id === targetOwnerId || req.user.role === 'admin'`.
- **`optionalAuth`:** Permite autenticación condicional para endpoints con contenido público/privado mixto.

### 8.2. Serialización Obligatoria Mediante DTOs (`app/dto/userDto.js`, `app/dto/walletDto.js`)
- **`UserDTO.toPublic(user)`:** Filtra y expone exclusivamente datos inocuos (`userId`, `name`, `surname`, `img_perfil`, `averageRating`, `numOpinions`, `about_me`, `preferences`).
- **`UserDTO.toPrivate(user)`:** Para el propio usuario o admin; omite estrictamente hashes de contraseñas (`password`).
- **`UserDTO.toAdminList(users)`:** Utilizado en `GET /api/users`. Resuelve la fuga masiva de datos (`HIGH-01`) suprimiendo hashes de contraseñas, DNIs y cuentas bancarias de Stripe.
- **`WalletDTO`:** Estandariza y sanitiza la salida de balances y transacciones del monedero (`HIGH-03`, `HIGH-04`, `HIGH-05`).

### 8.3. Limitadores de Rate Limit Diferenciados (`app/middlewares/rateLimiter.js`)
- **`authLimiter`:** Máximo 10 intentos por ventana de 15 minutos por IP en rutas de autenticación (`/api/auth/login`, `/api/auth/register`). Mitiga fuerza bruta (`ALTO-13`, `ALTO-14`, `MED-05`).
- **`paymentLimiter`:** Máximo 15 operaciones por minuto por usuario/IP en recargas y retiros (`/api/payment/recharge`, `/api/payment/payout`, `/api/payment/wallet-payout`). Mitiga `ALTO-16` y `ALTO-17`.
- **`generalApiLimiter`:** 120 peticiones por minuto por IP para toda la API (`/api/*`), mitigando scraping y abuso de recursos (`MED-10` a `MED-25`).
- **`pushLimiter`:** Máximo 20 solicitudes por minuto para evitar sobrecarga del motor de notificaciones (`CRIT-03`).

### 8.4. Configuración de Reinicio Automático y Resiliencia (`ecosystem.config.cjs` y `/health`)
- **PM2 Clúster:** Archivo `ecosystem.config.cjs` configurado con `instances: 2`, `exec_mode: "cluster"`, `autorestart: true`, `max_memory_restart: "350M"` y backoff exponencial para garantizar disponibilidad continua (`CRIT-04`).
- **Healthcheck Endpoint (`GET /health`):** Retorna `status: "ok"`, tiempo de actividad (`uptime`) y telemetría de memoria para Kubernetes Liveness/Readiness Probes y monitores de Uptime.

### 8.5. Esquemas Zod de Validación Declarativa (`app/middlewares/validateRequest.js`)
- **`validateRequest(schema, source)`:** Middleware declarativo para validación de datos de entrada (`body`, `query`, `params`).
- **`uuidParamSchema`:** Validación de parámetros UUID en URLs para evitar inyecciones e identificadores malformados.
- **`rechargeWalletSchema` y `payoutWalletSchema`:** Validación estricta de importes y divisas antes de ejecutar transferencias Stripe.

### 8.6. Validación Temprana de Variables de Entorno al Inicio (`app/config/env.js`)
- **Fail-Fast Startup:** Comprobación de todas las variables críticas (`NODE_ENV`, `PORT`, `JWT_ALGORITHM`, `STRIPE_SECRET_KEY`) al arrancar el servidor Node.js.
- **Salvaguarda PSD2:** Emite una alerta crítica inmediata si detecta una clave de producción de Stripe (`sk_live_...`) operando en entornos que no sean de producción real.

### 8.7. Hardening Adicional Aplicado
- **Cierre de Fuga en `GET /api/users` (`HIGH-01`):** Modificado a `authorization.onlyAdmin` con `UserDTO.toAdminList`.
- **Protección de `GET /api/users/:id` (`HIGH-06`):** Validación de titularidad (`isOwnerOrAdmin`) y salida saneada con `UserDTO.toPrivate`.
- **Protección en `/api/users/:id/info` (`HIGH-02`):** Bifurcación entre perfil privado y público seguro.
- **Anti-Enumeración en Login (`LOW-14`):** Respuestas unificadas con `401 INVALID_CREDENTIALS` tanto si el correo no existe como si la contraseña es errónea.
- **Hardening de Cabeceras:** Inclusión de `helmet({ crossOriginResourcePolicy: false })` y `app.disable("x-powered-by")`.

---
*Fin del Documento Técnico de Planificación y Remediación YouConnext.*
