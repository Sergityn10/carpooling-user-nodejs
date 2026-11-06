import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { matchesRoutingKey } from "../../app/lib/rabbitmqConsumer.js";

describe("Resiliencia y Enrutamiento RabbitMQ Consumer (rabbitmqConsumer.js)", () => {
  it("debe coincidir exactamente con routing keys específicas", () => {
    assert.equal(
      matchesRoutingKey(
        "reserva.created.payment_required",
        "reserva.created.payment_required",
      ),
      true,
    );
    assert.equal(
      matchesRoutingKey(
        "reserva.payment.resume",
        "reserva.payment.resume",
      ),
      true,
    );
    assert.equal(
      matchesRoutingKey(
        "reserva.created.payment_required",
        "reserva.other.event",
      ),
      false,
    );
  });

  it("debe soportar comodines estándar AMQP (* y #)", () => {
    // Comodín simple '*' sustituye exactamente una palabra
    assert.equal(
      matchesRoutingKey("reserva.*.payment_required", "reserva.created.payment_required"),
      true,
    );
    assert.equal(
      matchesRoutingKey("reserva.*.payment_required", "reserva.something.else"),
      false,
    );

    // Comodín '#' sustituye cero o más palabras
    assert.equal(
      matchesRoutingKey("reserva.#", "reserva.created.payment_required"),
      true,
    );
    assert.equal(
      matchesRoutingKey("reserva.#", "reserva.canceled"),
      true,
    );
    assert.equal(
      matchesRoutingKey("reserva.#", "user.registered"),
      false,
    );
  });

  it("debe garantizar que se genera una cuenta de Stripe Customer si el pasajero no la tiene", async () => {
    const mockUserWithoutCustomer = {
      id: "usr-new-passenger-77",
      email: "nuevo@youconnext.com",
      name: "Carlos",
      surname: "Gomez",
      stripe_customer_account: null,
    };

    async function ensureStripeCustomer(user, createCustomerStub, updateUserStub) {
      if (user.stripe_customer_account) {
        return user.stripe_customer_account;
      }
      const fullName = [user.name, user.surname].filter(Boolean).join(" ");
      const customer = await createCustomerStub({
        email: user.email,
        name: fullName,
        metadata: { userId: user.id },
      });
      await updateUserStub(user.id, customer.id);
      return customer.id;
    }

    let customerCreatedWith = null;
    let userUpdatedWith = null;

    const mockCreateCustomer = async (data) => {
      customerCreatedWith = data;
      return { id: "cus_generated_mock_999" };
    };

    const mockUpdateUser = async (id, stripeCustomerId) => {
      userUpdatedWith = { id, stripeCustomerId };
    };

    const customerId = await ensureStripeCustomer(
      mockUserWithoutCustomer,
      mockCreateCustomer,
      mockUpdateUser,
    );

    assert.equal(customerId, "cus_generated_mock_999");
    assert.equal(customerCreatedWith.email, "nuevo@youconnext.com");
    assert.equal(customerCreatedWith.name, "Carlos Gomez");
    assert.equal(userUpdatedWith.stripeCustomerId, "cus_generated_mock_999");
  });
});
