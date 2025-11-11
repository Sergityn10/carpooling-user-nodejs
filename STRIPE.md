🛠️ Objetos Clave de la API de Stripe para Marketplace de Trayectos

Un marketplace que requiere un "monedero virtual" para los vendedores (drivers/proveedores) y la retención de fondos hasta la confirmación de la fecha del servicio debe usar Stripe Connect. Utilizaremos el flujo de Cuentas Conectadas Custom para un máximo control.

Objeto API

URL de la API

Definición y Cometido

Campos Esenciales para el Envío

1. Connected Account

/v1/accounts

Representa al vendedor o conductor (la persona que recibe el pago). Es el "monedero virtual" donde se retiene el dinero del trayecto. Stripe se encarga de todo el cumplimiento regulatorio (KYC) asociado a esta cuenta.

type: custom (para control total de la plataforma). country: Código de país (ej. ES). email: Correo electrónico del vendedor. capabilities: Objeto que define las funcionalidades (ej. card_payments y transfers).

2. Customer

/v1/customers

Representa al comprador o pasajero. Este objeto almacena los datos de la tarjeta de crédito (de forma segura con Stripe) para no tener que solicitarlos de nuevo en futuras compras.

email: Correo electrónico del cliente. name: Nombre completo del cliente. description: Una descripción de la cuenta (ej. "Pasajero de trayecto").

3. Payment Intent

/v1/payment_intents

Objeto que gestiona el ciclo completo de pago del cliente. Es crucial porque permite autorizar el pago (reservar el dinero) pero no cargarlo (capturarlo) inmediatamente. Esto es clave para la lógica de pagos diferidos (escrow).

amount: Cantidad total del trayecto (en la unidad más pequeña, ej. céntimos). currency: Divisa (ej. eur). capture_method: manual (IMPORTANTE para diferir la captura). application_fee_amount: La comisión de la plataforma. transfer_data

$$destination$$

: ID del monedero (acct_...) del vendedor.

4. Setup Intent

/v1/setup_intents

Objeto que se utiliza para configurar un método de pago para uso futuro sin realizar un pago inmediato. Es útil para el onboarding de clientes que deseen guardar su tarjeta antes de elegir un trayecto.

usage: off_session. customer: ID del Cliente (cus_...) al que se asociará el método de pago.

5. Capture (on Payment Intent)

/v1/payment_intents/{PI_ID}/capture

Esta acción se realiza sobre un Payment Intent que previamente fue creado con capture_method: 'manual'. Su cometido es ejecutar el cobro real y, a su vez, transferir el dinero al monedero virtual del vendedor, deduciendo la comisión de la plataforma.

amount_to_capture: (Opcional) La cantidad exacta a capturar (si es menor al autorizado). No se necesitan campos si se captura el total.

6. Transfer

/v1/transfers

Objeto que mueve fondos de un balance a otro. Es esencial para realizar un pago desde el saldo de un monedero virtual (Connected Account) a la cuenta de la plataforma o de otro vendedor/proveedor (Transferencia Saliente / Pago con Balance).

amount: Cantidad a transferir. currency: Divisa. destination: ID de la cuenta a la que se envían los fondos. source_type: balance (IMPORTANTE: Indica que el origen es el saldo de la Connected Account).

7. Payout

/v1/payouts

Este objeto se utiliza para que el vendedor o conductor retire el dinero acumulado en su monedero virtual de Stripe a su cuenta bancaria externa (la que proporcionó durante el onboarding de la Cuenta Conectada).

amount: Cantidad a pagar. currency: Divisa (ej. eur). destination: ID de la Cuenta Conectada (acct_...) de la que se saca el dinero (o se usa como destino si se inicia desde la plataforma). method: (Opcional) instant o standard.

Flujo de Pagos Clave para la Retención de Fondos

Reserva del Trayecto: Se crea un Payment Intent con capture_method: 'manual', se cobra la tarjeta del cliente, y el dinero queda reservado pero aún no se carga.

Confirmación/Fecha Límite: Una vez que el vendedor confirma o se cumple la fecha/hora del servicio, tu sistema llama al endpoint de Capture en ese mismo Payment Intent.

Liberación: La acción de capture hace tres cosas a la vez:
a. Carga el dinero en la tarjeta del cliente.
b. Deduce automáticamente la application_fee (tu comisión).
c. Envía el resto del dinero al Connected Account (el monedero virtual) del vendedor.

Retiro (Payout): El vendedor, desde el dashboard de tu aplicación, solicita un Payout para transferir los fondos de su monedero de Stripe a su cuenta bancaria.

Flujo Adicional: Pago con Saldo del Monedero (Transferencia Saliente)

Este flujo permite que el vendedor (que tiene saldo) utilice los fondos que ha acumulado en su Connected Account (monedero virtual) para pagar por un servicio dentro del marketplace (ej. pagar una cuota o un nuevo trayecto a otro conductor).

Activación: La plataforma (tú) inicia una Transferencia (Transfer) usando la clave API del vendedor (a través del encabezado Stripe-Account: acct_XXXX).

Origen de Fondos: Se indica explícitamente que los fondos deben provenir del saldo del monedero del vendedor, utilizando el parámetro source_type: 'balance'.

Destino: Los fondos se envían a la cuenta de destino (por ejemplo, la cuenta principal de la plataforma o la cuenta conectada de otro proveedor).

Resultado: El saldo disponible en el monedero del vendedor se debita por la cantidad del pago.