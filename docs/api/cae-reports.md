# Informes CAE - Exportación Excel (`/api/cae-reports`)

Endpoint para que los administradores generen un archivo Excel con los datos de los viajes requeridos por el **Anexo III: Criterios Antifraude** para la correcta contabilidad y registro de los viajes.

---

## 1. Exportar informe CAE en Excel

**URL:** `GET /api/cae-reports/export`

**Autenticación:** Requerida (`onlyAdmin`).

**Descripción:** Genera un archivo Excel (`.xlsx`) con todos los informes CAE y los datos asociados a cada viaje, cumpliendo con los criterios antifraude del Anexo III. El Excel contiene 5 hojas:

### Hojas del Excel

| Hoja | Descripción |
| --- | --- |
| **Resumen** | Métricas globales: total de informes, KM recorridos, KM con pasajeros, kWh generados, EUR generados, y conteo por estado. |
| **Viajes** | Un registro por viaje/informe CAE con datos del trayecto, conductor (nombre, DNI/NIE, teléfono, email), vehículo (matrícula, marca, modelo, combustible, plazas) y métricas (KM, kWh, EUR). |
| **Viajeros** | Un registro por viajero (conductor + pasajeros) por viaje, con DNI/NIE, nombre, teléfono, matrícula del vehículo, estado de reserva y confirmación del viaje. |
| **Trazado** | Puntos de geolocalización registrados durante cada viaje (latitud, longitud, dirección, timestamp). |
| **Criterios Antifraude** | Checklist de los 7 criterios del Anexo III con columnas de estado y observaciones para cumplimentar manualmente. |

### Query params

| Parámetro | Tipo   | Requerido | Descripción                                                                 |
| --------- | ------ | --------- | --------------------------------------------------------------------------- |
| `status`  | string | No        | Filtra por estado del CAE: `pending`, `in_review`, `completed`, `canceled`. Si se omite, devuelve todos. |

### Respuesta 200

Devuelve un archivo binario `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` con el nombre `cae_report_YYYY-MM-DD.xlsx`.

### Errores

- `401` — No autenticado.
- `403` — El usuario no es admin.
- `404` — No se encontraron informes CAE con los criterios especificados.
- `502` — Error al comunicarse con el microservicio de trayectos.

---

## Criterios Antifraude (Anexo III)

El Excel incluye una hoja con los siguientes criterios para revisión manual:

1. **Listado de viajeros** (conductor y pasajeros) con identificación (DNI/NIE, nombre completo y teléfono) y matrícula del coche.
2. **Identificación asociada de cada viaje:** comprobación mediante geolocalización de la ubicación y tiempos de inicio, trazado y fin del trayecto.
3. **Confirmación activa** por parte de cada viajero del inicio y fin del trayecto acordado.
4. **Verificación** de que el trayecto compartido se realiza en coche y no en otro medio de transporte.
5. **Verificación** de que el trayecto se ha realizado en un vehículo únicamente y que todos los viajeros van en dicho vehículo.
6. **DNI/NIE asociado** a cada cuenta de usuario.
7. **No duplicación:** los viajes realizados en la plataforma no pueden registrarse de nuevo en esa ni en otra plataforma similar.

---

## Datos incluidos por hoja

### Hoja "Viajes"

| Columna | Descripción |
| --- | --- |
| ID CAE | UUID del informe CAE |
| ID Trayecto | UUID del trayecto |
| Origen | Punto de origen del trayecto |
| Destino | Punto de destino del trayecto |
| Fecha/Hora | Fecha y hora de inicio del trayecto |
| Estado CAE | `pending`, `in_review`, `completed`, `canceled` |
| Conductor ID | UUID del conductor |
| Conductor Nombre | Nombre completo (descifrado) |
| Conductor DNI/NIE | DNI o NIE (descifrado) |
| Conductor Teléfono | Teléfono (descifrado) |
| Conductor Email | Email del conductor |
| Matrícula | Matrícula del vehículo del conductor |
| Marca / Modelo / Color | Datos del vehículo |
| Combustible | Tipo de combustible |
| Num. Plazas / Año | Capacidad y año del vehículo |
| KM Recorridos | Kilómetros totales del trayecto |
| KM con Pasajeros | Kilómetros recorridos con pasajeros a bordo |
| kWh Generados | Energía generada |
| EUR Generados | Dinero generado |
| CAE Creado / Actualizado | Timestamps del informe |

### Hoja "Viajeros"

| Columna | Descripción |
| --- | --- |
| ID Trayecto | UUID del trayecto |
| Fecha/Hora Viaje | Fecha y hora del trayecto |
| Origen / Destino | Puntos del trayecto |
| Usuario ID | UUID del usuario |
| Nombre | Nombre completo (descifrado) |
| DNI/NIE | DNI o NIE (descifrado) |
| Teléfono | Teléfono (descifrado) |
| Rol | `Conductor` o `Pasajero` |
| Matrícula | Matrícula del vehículo |
| Estado Reserva | Estado de la reserva del pasajero |
| Confirmación Viaje | `success`, `pending`, `issue` |
| ID Reserva | UUID de la reserva |

### Hoja "Trazado"

| Columna | Descripción |
| --- | --- |
| ID Trayecto | UUID del trayecto |
| Usuario ID | UUID del usuario que registró el punto |
| Latitud / Longitud | Coordenadas GPS |
| Dirección | Dirección legible |
| Timestamp | Momento exacto del registro |

---

## Notas técnicas

- **Descifrado:** Los campos sensibles (`name`, `phone`, `dni`) se descifran antes de incluirlos en el Excel.
- **Paginación de llamadas:** Las peticiones al microservicio de trayectos se hacen en lotes de 5 viajes en paralelo para evitar sobrecarga.
- **Vehículo:** Se incluye el primer vehículo registrado del conductor (si tiene varios, se muestra el primero).
- **Token de admin:** Se reenvía el token JWT del admin al microservicio de trayectos para autenticar las llamadas.
