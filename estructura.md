# Estructura de carpetas del proyecto

carpooling-user/                         # Raíz del proyecto Node.js del usuario de la app de carpooling
  .git/                                  # Metadatos de Git (control de versiones)
  app/                                   # Código fuente principal de la API (controladores, rutas, middlewares, utils, etc.)
    controllers/                         # Controladores HTTP: lógica de negocio (auth, usuarios, coches, pagos, telegram, webhooks)
    middlewares/                         # Middlewares personalizados (p.ej. autorización, rate-limiting, validación)
    pages/                               # Páginas HTML estáticas (404, login, etc.)
    public/                              # Recursos públicos (estilos, pruebas de API, etc.)
    routes/                              # Definiciones modulares de rutas Express agrupadas por recurso (/users, /enterprise, /admin, etc.)
    schemas/                             # Esquemas de datos y modelos (JS/SQL) usados por la app
      Telegram/                          # Esquemas específicos relacionados con integración de Telegram
    sql/                                 # Scripts SQL para creación y actualización de tablas
    utils/                               # Utilidades generales (por ejemplo funciones de hash)
  mysql_data/                            # Datos persistentes de MySQL (montados por Docker)
  node_modules/                          # Dependencias instaladas de Node.js (generado por npm)
