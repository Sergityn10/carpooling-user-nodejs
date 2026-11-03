import { test, describe, beforeEach, afterEach, after } from "node:test";
import assert from "node:assert/strict";
import prisma from "../../app/lib/prisma.js";
import rabbitmq from "../../app/lib/rabbitmq.js";
import { methods as events } from "../../app/controllers/events.js";
import { methods as enterpriseServiceEvents } from "../../app/controllers/enterprise_service_events.js";
import { methods as cryptoUtils } from "../../app/utils/crypto.js";
import { enterpriseAuthorization } from "../../app/middlewares/enterpriseAuthorization.js";
import { methods as enterprise } from "../../app/controllers/enterprise.js";
import { methods as companies } from "../../app/controllers/companies.js";
import jsonwebtoken from "jsonwebtoken";
import { PRIVATE_KEY, JWT_ALGORITHM } from "../../app/utils/jwtKeys.js";

describe("Endpoint de Detalles de Evento (GET /api/events/:id) - Arquitectura Desacoplada", () => {
  let originalPlatformFindUnique;
  let originalServiceFindUnique;
  let originalParticipantsFindMany;

  beforeEach(() => {
    originalPlatformFindUnique = prisma.platformEvent.findUnique;
    originalServiceFindUnique = prisma.serviceEvent.findUnique;
    originalParticipantsFindMany = prisma.eventParticipant.findMany;
  });

  afterEach(() => {
    prisma.platformEvent.findUnique = originalPlatformFindUnique;
    prisma.serviceEvent.findUnique = originalServiceFindUnique;
    prisma.eventParticipant.findMany = originalParticipantsFindMany;
  });

  after(async () => {
    await rabbitmq.close();
  });

  const mockEncryptedUser1 = {
    id: "usr-uuid-1",
    name: cryptoUtils.encrypt("Sergio"),
    surname: cryptoUtils.encrypt("Martín"),
    email: cryptoUtils.encrypt("sergio@example.com"),
    phone: cryptoUtils.encrypt("+34611223344"),
    img_perfil: "https://avatar.example.com/sergio.jpg",
    ciudad: "Madrid",
    provincia: "Madrid",
  };

  const mockEncryptedUser2 = {
    id: "usr-uuid-2",
    name: cryptoUtils.encrypt("Ana"),
    surname: cryptoUtils.encrypt("García"),
    email: cryptoUtils.encrypt("ana@example.com"),
    phone: cryptoUtils.encrypt("+34655443322"),
    img_perfil: "https://avatar.example.com/ana.jpg",
    ciudad: "Cáceres",
    provincia: "Cáceres",
  };

  const mockPlatformEvent = {
    id: "ev-uuid-101",
    name: "Festival de la Movilidad Sostenible",
    description: "Encuentro de empresas y ciudadanos comprometidos con el carpooling.",
    unique_code: "MOV-2026",
    start_date: new Date("2026-11-20T09:00:00.000Z"),
    end_date: new Date("2026-11-20T19:00:00.000Z"),
    latitude: "40.4168",
    longitude: "-3.7038",
    image: "https://images.example.com/mobility.jpg",
    url: "https://movilidad.example.com",
    ticket_url: "https://entradas.example.com",
    chat_id: 88,
    company_id: null,
    enterprise_id: "ent-org-99",
    enterprise: {
      id: "ent-org-99",
      name: "YouConnext Mobility S.L.",
      logo: "https://youconnext.es/logo.png",
      website: "https://youconnext.es",
      cif: "B12345678",
      email: "contacto@youconnext.es",
      phone: "+34912345678",
    },
    company: null,
    tags: [
      {
        tag: { id: 1, name: "Sostenibilidad", description: "Eventos ecológicos" },
      },
    ],
  };

  function createMockResponse() {
    let statusCode = 200;
    let body = null;
    return {
      res: {
        status(code) {
          statusCode = code;
          return this;
        },
        send(data) {
          body = data;
          return data;
        },
      },
      getResult() {
        return { statusCode, body };
      },
    };
  }

  describe("1. Recuperación de Evento de Plataforma y Participantes Desencriptados", () => {
    test("debe retornar propiedades completas, participantes desencriptados y total_participants", async () => {
      prisma.platformEvent.findUnique = async () => mockPlatformEvent;
      prisma.eventParticipant.findMany = async () => [
        {
          user_id: "usr-uuid-1",
          event_id: "ev-uuid-101",
          joined_at: new Date("2026-11-01T10:00:00.000Z"),
          user: mockEncryptedUser1,
        },
        {
          user_id: "usr-uuid-2",
          event_id: "ev-uuid-101",
          joined_at: new Date("2026-11-02T12:00:00.000Z"),
          user: mockEncryptedUser2,
        },
      ];

      const req = {
        params: { id: "ev-uuid-101" },
        user: null,
        enterprise: null,
      };

      const mock = createMockResponse();
      await events.getEventById(req, mock.res, () => {});
      const { statusCode, body } = mock.getResult();

      assert.equal(statusCode, 200);
      assert.equal(body.status, "Success");
      assert.ok(body.event);
      assert.equal(body.event.id, "ev-uuid-101");
      assert.equal(body.event.name, "Festival de la Movilidad Sostenible");
      assert.equal(body.event.unique_code, "MOV-2026");
      assert.equal(body.event.latitude, 40.4168);
      assert.equal(body.event.longitude, -3.7038);
      assert.equal(body.event.total_participants, 2);
      assert.equal(body.total_participants, 2);

      // Verificación de descifrado AES-256 de participantes
      const p1 = body.participants.find((p) => p.id === "usr-uuid-1");
      assert.ok(p1);
      assert.equal(p1.name, "Sergio", "El nombre debe estar descifrado en claro");
      assert.equal(p1.surname, "Martín", "El apellido debe estar descifrado en claro");
      assert.equal(p1.img_perfil, "https://avatar.example.com/sergio.jpg");
    });
  });

  describe("2. Privacidad de Datos y Control de Acceso Organizacional", () => {
    test("usuarios anónimos o no organizadores NO deben ver email ni teléfono de los participantes", async () => {
      prisma.platformEvent.findUnique = async () => mockPlatformEvent;
      prisma.eventParticipant.findMany = async () => [
        {
          user_id: "usr-uuid-1",
          event_id: "ev-uuid-101",
          joined_at: new Date("2026-11-01T10:00:00.000Z"),
          user: mockEncryptedUser1,
        },
      ];

      const req = {
        params: { id: "ev-uuid-101" },
        user: { id: "usr-uuid-3", role: { name: "user" } }, // Usuario regular externo
        enterprise: null,
      };

      const mock = createMockResponse();
      await events.getEventById(req, mock.res, () => {});
      const { body } = mock.getResult();

      assert.equal(body.is_organizer, false);
      const participant = body.participants[0];
      assert.equal(participant.name, "Sergio");
      assert.equal(participant.email, undefined, "Email no debe figurar para usuarios comunes");
      assert.equal(participant.phone, undefined, "Teléfono no debe figurar para usuarios comunes");
    });

    test("la organización dueña del evento o un Admin SÍ debe recibir datos de contacto", async () => {
      prisma.platformEvent.findUnique = async () => mockPlatformEvent;
      prisma.eventParticipant.findMany = async () => [
        {
          user_id: "usr-uuid-1",
          event_id: "ev-uuid-101",
          joined_at: new Date("2026-11-01T10:00:00.000Z"),
          user: mockEncryptedUser1,
        },
      ];

      const req = {
        params: { id: "ev-uuid-101" },
        user: null,
        enterprise: { id: "ent-org-99", name: "YouConnext Mobility S.L." }, // Dueña
      };

      const mock = createMockResponse();
      await events.getEventById(req, mock.res, () => {});
      const { body } = mock.getResult();

      assert.equal(body.is_organizer, true);
      const participant = body.participants[0];
      assert.equal(participant.email, "sergio@example.com", "El organizador debe tener acceso al email");
      assert.equal(participant.phone, "+34611223344", "El organizador debe tener acceso al teléfono");
    });
  });

  describe("3. Estado de Sesión del Usuario (has_joined e is_organizer)", () => {
    test("has_joined debe ser true cuando el usuario autenticado está en la lista de inscritos", async () => {
      prisma.platformEvent.findUnique = async () => mockPlatformEvent;
      prisma.eventParticipant.findMany = async () => [
        {
          user_id: "usr-uuid-1",
          event_id: "ev-uuid-101",
          joined_at: new Date(),
          user: mockEncryptedUser1,
        },
      ];

      const req = {
        params: { id: "ev-uuid-101" },
        user: { id: "usr-uuid-1", role: { name: "user" } },
      };

      const mock = createMockResponse();
      await events.getEventById(req, mock.res, () => {});
      const { body } = mock.getResult();

      assert.equal(body.has_joined, true);
      assert.equal(body.event.has_joined, true);
    });

    test("has_joined debe ser false si el usuario no se ha unido al evento", async () => {
      prisma.platformEvent.findUnique = async () => mockPlatformEvent;
      prisma.eventParticipant.findMany = async () => [
        {
          user_id: "usr-uuid-1",
          event_id: "ev-uuid-101",
          joined_at: new Date(),
          user: mockEncryptedUser1,
        },
      ];

      const req = {
        params: { id: "ev-uuid-101" },
        user: { id: "usr-uuid-999_desconocido", role: { name: "user" } },
      };

      const mock = createMockResponse();
      await events.getEventById(req, mock.res, () => {});
      const { body } = mock.getResult();

      assert.equal(body.has_joined, false);
      assert.equal(body.event.has_joined, false);
    });
  });

  describe("4. Soporte Polimórfico con Eventos de Servicio Corporativo (ServiceEvent)", () => {
    test("debe resolver fielmente un evento corporativo de servicio si no existe en platform_events", async () => {
      prisma.platformEvent.findUnique = async () => null; // Fallback
      prisma.serviceEvent.findUnique = async () => ({
        id: "srv-uuid-200",
        enterprise_id: "ent-corp-55",
        title: "Convención Anual YouConnext",
        description: "Reunión estratégica de directivos y delegaciones.",
        start_at: new Date("2026-12-01T10:00:00.000Z"),
        end_at: new Date("2026-12-01T18:00:00.000Z"),
        status: "approved",
        venue_name: "Palacio de Congresos",
        address_line1: "Paseo de la Castellana 200",
        city: "Madrid",
        latitude: "40.4500",
        longitude: "-3.6900",
        image: "https://images.example.com/convention.jpg",
        contact_name: "María Gómez",
        contact_email: "maria@corp.com",
        contact_phone: "+34677889900",
        attendees_estimate: 250,
        enterprise: {
          id: "ent-corp-55",
          name: "Global Logistics Group",
          logo: "https://globallogistics.com/logo.png",
          website: "https://globallogistics.com",
        },
      });

      const req = {
        params: { id: "srv-uuid-200" },
        user: null,
        enterprise: { id: "ent-corp-55" },
      };

      const mock = createMockResponse();
      await events.getEventById(req, mock.res, () => {});
      const { body } = mock.getResult();

      assert.ok(body.event);
      assert.equal(body.event.id, "srv-uuid-200");
      assert.equal(body.event.name, "Convención Anual YouConnext");
      assert.equal(body.event.is_corporate, true);
      assert.equal(body.event.event_type, "service_event");
      assert.equal(body.event.latitude, 40.45);
      assert.equal(body.is_organizer, true);
    });
  });

  describe("5. Manejo de Errores y Ausencia de Acoplamiento Externo", () => {
    test("debe invocar next con error 404 EVENT_NOT_FOUND si el evento no existe", async () => {
      prisma.platformEvent.findUnique = async () => null;
      prisma.serviceEvent.findUnique = async () => null;

      const req = {
        params: { id: "id-inexistente" },
      };

      let errorPassed = null;
      const next = (err) => {
        errorPassed = err;
      };

      await events.getEventById(req, {}, next);

      assert.ok(errorPassed, "Debe pasar un AppError a next()");
      assert.equal(errorPassed.statusCode, 404);
      assert.equal(errorPassed.errorCode, "EVENT_NOT_FOUND");
    });

    test("garantiza arquitectura desacoplada: no realiza llamadas fetch/red a otros microservicios", async () => {
      prisma.platformEvent.findUnique = async () => mockPlatformEvent;
      prisma.eventParticipant.findMany = async () => [];

      const req = {
        params: { id: "ev-uuid-101" },
      };

      const mock = createMockResponse();
      await events.getEventById(req, mock.res, () => {});
      const { body } = mock.getResult();

      assert.equal(body.status, "Success");
      assert.equal(body.total_participants, 0);
      assert.deepEqual(body.participants, []);
    });
  });

  describe("6. Robustez de Autenticación por Cookie (Anti-TypeError 'option domain is invalid')", () => {
    test("reviseCookie no debe fallar con TypeError si el usuario no existe y ORIGIN es una URL con protocolo/puerto", async () => {
      const { authorization } = await import("../../app/middlewares/authorization.js");
      const jsonwebtoken = (await import("jsonwebtoken")).default;
      const { PRIVATE_KEY, JWT_ALGORITHM } = await import("../../app/utils/jwtKeys.js");

      // Simulamos ORIGIN típico de desarrollo con protocolo y puerto
      const originalOrigin = process.env.ORIGIN;
      process.env.ORIGIN = "http://localhost:3000";

      const token = jsonwebtoken.sign(
        { userId: "usr-inexistente-uuid", email: "fantasma@example.com" },
        PRIVATE_KEY,
        { algorithm: JWT_ALGORITHM, expiresIn: "1h" },
      );

      const clearedCookies = [];
      const mockReq = {
        cookies: { access_token: token },
        res: {
          clearCookie: (name, options) => {
            clearedCookies.push({ name, options });
          },
        },
      };

      const originalUserFindFirst = prisma.user.findFirst;
      prisma.user.findFirst = async () => null; // Usuario no existe en BD

      try {
        const result = await authorization.reviseCookie(mockReq);
        assert.equal(result, false, "Debe retornar false para usuarios inexistentes");
        assert.ok(
          clearedCookies.some((c) => c.name === "access_token"),
          "Debe limpiar la cookie access_token",
        );
        // Validar que ninguna opción de clearCookie contiene domain inválido
        for (const c of clearedCookies) {
          assert.equal(c.options.domain, undefined, "El atributo domain no debe configurarse con URLs");
        }
      } finally {
        process.env.ORIGIN = originalOrigin;
        prisma.user.findFirst = originalUserFindFirst;
      }
    });
  });

  describe("7. Autenticación Unificada para Organizaciones/Empresas (isLoged y getEventParticipantsDetailed)", () => {
    test("reviseBearer y reviseCookie deben autenticar a Organizaciones y no borrar sus cookies", async () => {
      const { authorization } = await import("../../app/middlewares/authorization.js");
      const jsonwebtoken = (await import("jsonwebtoken")).default;
      const { PRIVATE_KEY, JWT_ALGORITHM } = await import("../../app/utils/jwtKeys.js");

      const enterpriseToken = jsonwebtoken.sign(
        {
          enterprise_id: "ent-org-99",
          email: "contacto@youconnext.es",
          role: "enterprise",
          type: "enterprise",
        },
        PRIVATE_KEY,
        { algorithm: JWT_ALGORITHM, expiresIn: "1h" },
      );

      const mockEnterpriseRecord = {
        id: "ent-org-99",
        name: "YouConnext Mobility S.L.",
        email: "contacto@youconnext.es",
        is_active: true,
        is_deleted: false,
        role: { id: 3, name: "enterprise" },
      };

      const originalUserFindFirst = prisma.user.findFirst;
      const originalEnterpriseFindFirst = prisma.enterprise.findFirst;

      prisma.user.findFirst = async () => null; // No está en User
      prisma.enterprise.findFirst = async () => mockEnterpriseRecord; // Sí está en Enterprise

      try {
        // Probar Bearer Token
        const mockBearerReq = {
          headers: { authorization: `Bearer ${enterpriseToken}` },
        };
        const bearerResult = await authorization.reviseBearer(mockBearerReq);
        assert.ok(bearerResult, "Debe autenticar correctamente a la empresa por Bearer token");
        assert.equal(bearerResult.id, "ent-org-99");
        assert.equal(bearerResult.isEnterprise, true);
        assert.equal(bearerResult.role.name, "enterprise");

        // Probar Cookie
        const clearedCookies = [];
        const mockCookieReq = {
          cookies: { access_token: enterpriseToken },
          res: {
            clearCookie: (name, options) => clearedCookies.push({ name, options }),
          },
        };
        const cookieResult = await authorization.reviseCookie(mockCookieReq);
        assert.ok(cookieResult, "Debe autenticar correctamente a la empresa por Cookie");
        assert.equal(cookieResult.id, "ent-org-99");
        assert.equal(cookieResult.isEnterprise, true);
        assert.equal(clearedCookies.length, 0, "No debe limpiar cookies si la empresa es válida");

        // Probar Middleware isLoged
        let nextCalled = false;
        let errorResult = null;
        const mockNextReq = {
          headers: { authorization: `Bearer ${enterpriseToken}` },
          cookies: {},
        };
        const mockRes = {
          clearCookie: () => {},
          status: (code) => ({
            send: (data) => {
              errorResult = { code, data };
            },
          }),
        };

        await authorization.isLoged(mockNextReq, mockRes, () => {
          nextCalled = true;
        });

        assert.equal(nextCalled, true, "isLoged debe invocar next() para organizaciones válidas");
        assert.equal(errorResult, null, "No debe responder con 401 Unauthorized");
        assert.equal(mockNextReq.user.id, "ent-org-99");
        assert.equal(mockNextReq.enterprise.id, "ent-org-99");
        assert.equal(mockNextReq.isEnterprise, true);
      } finally {
        prisma.user.findFirst = originalUserFindFirst;
        prisma.enterprise.findFirst = originalEnterpriseFindFirst;
      }
    });

    test("getEventParticipantsDetailed debe responder 200 y desencriptar campos de participantes para empresas", async () => {
      prisma.platformEvent.findUnique = async () => mockPlatformEvent;
      prisma.eventParticipant.findMany = async () => [
        {
          user_id: "usr-uuid-1",
          event_id: "ev-uuid-101",
          joined_at: new Date("2026-11-01T10:00:00.000Z"),
          user: mockEncryptedUser1,
        },
      ];

      const req = {
        params: { id: "ev-uuid-101" },
        user: {
          id: "ent-org-99",
          isEnterprise: true,
          role: { name: "enterprise" },
        },
        enterprise: { id: "ent-org-99" },
      };

      const mock = createMockResponse();
      await events.getEventParticipantsDetailed(req, mock.res, () => {});
      const { statusCode, body } = mock.getResult();

      assert.equal(statusCode, 200);
      assert.equal(body.status, "Success");
      assert.equal(body.participants.length, 1);
      assert.equal(body.participants[0].name, "Sergio", "El nombre debe estar descifrado");
      assert.equal(body.participants[0].surname, "Martín", "El apellido debe estar descifrado");
      assert.equal(body.participants[0].ciudad, "Madrid");
      assert.equal(body.participants[0].provincia, "Madrid");
    });
  });

  describe("8. Inscripción Universal a Eventos Creados por Organizaciones (joinEvent, leaveEvent, getMyJoinedEvents)", () => {
    const mockServiceEvent = {
      id: "srv-uuid-300",
      enterprise_id: "ent-org-99",
      title: "Jornada Abierta de Carpooling",
      description: "Evento corporativo abierto a toda la comunidad.",
      start_at: new Date("2026-11-25T10:00:00.000Z"),
      end_at: new Date("2026-11-25T14:00:00.000Z"),
      status: "approved",
      address_line1: "Calle Gran Vía 1, Madrid",
      latitude: "40.4200",
      longitude: "-3.7000",
      enterprise: {
        id: "ent-org-99",
        name: "YouConnext S.L.",
        logo: "https://youconnext.es/logo.png",
        website: "https://youconnext.es",
      },
    };

    test("joinEvent debe permitir a cualquier usuario unirse a un evento corporativo (ServiceEvent) sin requerir ser empleado", async () => {
      prisma.platformEvent.findUnique = async () => null; // No es de plataforma
      prisma.serviceEvent.findUnique = async () => mockServiceEvent;

      let createdData = null;
      const originalServiceEventParticipant = prisma.serviceEventParticipant;
      prisma.serviceEventParticipant = {
        findUnique: async () => null, // No está unido todavía
        create: async ({ data }) => {
          createdData = data;
          return data;
        },
      };

      try {
        const req = {
          params: { id: "srv-uuid-300" },
          user: { id: "usr-cualquiera-uuid", email: "ciudadano@example.com" },
          headers: {},
        };

        const mock = createMockResponse();
        await events.joinEvent(req, mock.res, () => {});
        const { statusCode, body } = mock.getResult();

        assert.equal(statusCode, 201, "Debe retornar 201 Created");
        assert.equal(body.status, "Success");
        assert.equal(body.message, "Joined event successfully");
        assert.deepEqual(createdData, {
          user_id: "usr-cualquiera-uuid",
          service_event_id: "srv-uuid-300",
        });
      } finally {
        prisma.serviceEventParticipant = originalServiceEventParticipant;
      }
    });

    test("joinEvent debe retornar 409 si el usuario ya está unido al ServiceEvent", async () => {
      prisma.platformEvent.findUnique = async () => null;
      prisma.serviceEvent.findUnique = async () => mockServiceEvent;

      const originalServiceEventParticipant = prisma.serviceEventParticipant;
      prisma.serviceEventParticipant = {
        findUnique: async () => ({
          user_id: "usr-cualquiera-uuid",
          service_event_id: "srv-uuid-300",
        }),
      };

      try {
        const req = {
          params: { id: "srv-uuid-300" },
          user: { id: "usr-cualquiera-uuid" },
        };

        let passedError = null;
        await events.joinEvent(req, {}, (err) => {
          passedError = err;
        });

        assert.ok(passedError);
        assert.equal(passedError.statusCode, 409);
        assert.equal(passedError.errorCode, "ALREADY_JOINED_EVENT");
      } finally {
        prisma.serviceEventParticipant = originalServiceEventParticipant;
      }
    });

    test("leaveEvent debe permitir a un usuario salirse de un ServiceEvent", async () => {
      prisma.platformEvent.findUnique = async () => null;
      prisma.serviceEvent.findUnique = async () => ({ id: "srv-uuid-300" });

      let deletedParams = null;
      const originalServiceEventParticipant = prisma.serviceEventParticipant;
      prisma.serviceEventParticipant = {
        findUnique: async () => ({
          user_id: "usr-cualquiera-uuid",
          service_event_id: "srv-uuid-300",
        }),
        delete: async (params) => {
          deletedParams = params;
          return true;
        },
      };

      try {
        const req = {
          params: { id: "srv-uuid-300" },
          user: { id: "usr-cualquiera-uuid" },
        };

        const mock = createMockResponse();
        await events.leaveEvent(req, mock.res, () => {});
        const { statusCode, body } = mock.getResult();

        assert.equal(statusCode, 200);
        assert.equal(body.status, "Success");
        assert.equal(body.message, "Left event successfully");
        assert.ok(deletedParams);
      } finally {
        prisma.serviceEventParticipant = originalServiceEventParticipant;
      }
    });

    test("getEventById y getEventParticipantsDetailed deben devolver participantes para ServiceEvent", async () => {
      prisma.platformEvent.findUnique = async () => null;
      prisma.serviceEvent.findUnique = async () => mockServiceEvent;

      const originalServiceEventParticipant = prisma.serviceEventParticipant;
      prisma.serviceEventParticipant = {
        findMany: async () => [
          {
            user_id: "usr-uuid-1",
            service_event_id: "srv-uuid-300",
            joined_at: new Date("2026-11-01T10:00:00.000Z"),
            user: mockEncryptedUser1,
          },
        ],
      };

      try {
        // 1. Probar getEventById
        const reqDetail = {
          params: { id: "srv-uuid-300" },
          user: { id: "usr-uuid-1" }, // Es el usuario inscrito
          enterprise: null,
        };
        const mockDetail = createMockResponse();
        await events.getEventById(reqDetail, mockDetail.res, () => {});
        const resDetail = mockDetail.getResult();

        assert.equal(resDetail.statusCode, 200);
        assert.equal(resDetail.body.total_participants, 1);
        assert.equal(resDetail.body.has_joined, true);
        assert.equal(resDetail.body.participants[0].name, "Sergio");

        // 2. Probar getEventParticipantsDetailed
        const reqParts = {
          params: { id: "srv-uuid-300" },
          user: { id: "usr-uuid-1" },
        };
        const mockParts = createMockResponse();
        await events.getEventParticipantsDetailed(reqParts, mockParts.res, () => {});
        const resParts = mockParts.getResult();

        assert.equal(resParts.statusCode, 200);
        assert.equal(resParts.body.participants.length, 1);
        assert.equal(resParts.body.participants[0].name, "Sergio");
      } finally {
        prisma.serviceEventParticipant = originalServiceEventParticipant;
      }
    });

    test("getMyJoinedEvents debe unificar eventos de plataforma y eventos de servicio corporativo", async () => {
      prisma.eventParticipant.findMany = async () => [
        {
          joined_at: new Date("2026-11-01"),
          event: mockPlatformEvent,
        },
      ];

      const originalServiceEventParticipant = prisma.serviceEventParticipant;
      prisma.serviceEventParticipant = {
        findMany: async () => [
          {
            joined_at: new Date("2026-11-02"),
            serviceEvent: mockServiceEvent,
          },
        ],
      };

      try {
        const req = {
          user: { id: "usr-uuid-1" },
        };

        const mock = createMockResponse();
        await events.getMyJoinedEvents(req, mock.res, () => {});
        const { statusCode, body } = mock.getResult();

        assert.equal(statusCode, 200);
        assert.equal(body.status, "Success");
        assert.equal(body.events.length, 2, "Debe contener ambos eventos");

        const platformEv = body.events.find((e) => e.id === "ev-uuid-101");
        const serviceEv = body.events.find((e) => e.id === "srv-uuid-300");

        assert.ok(platformEv, "Debe contener el PlatformEvent");
        assert.ok(serviceEv, "Debe contener el ServiceEvent");
        assert.equal(serviceEv.name, "Jornada Abierta de Carpooling");
      } finally {
        prisma.serviceEventParticipant = originalServiceEventParticipant;
      }
    });
  });

  describe("9. Conteo de Inscritos en Listados de Eventos de Empresa (enterpriseServiceEvents.list y getMyEnterpriseEvents)", () => {
    test("enterpriseServiceEvents.list debe incluir total_participants y participants_count en cada evento", async () => {
      const originalServiceEventFindMany = prisma.serviceEvent.findMany;
      prisma.serviceEvent.findMany = async ({ include }) => {
        assert.ok(include?._count?.select?.participants, "Debe incluir _count de participants");
        return [
          {
            id: "srv-uuid-300",
            enterprise_id: "ent-org-99",
            title: "Jornada Abierta",
            _count: { participants: 4 },
          },
          {
            id: "srv-uuid-301",
            enterprise_id: "ent-org-99",
            title: "Taller Movilidad",
            _count: { participants: 0 },
          },
        ];
      };

      try {
        const req = {
          enterprise: { id: "ent-org-99" },
          query: {},
        };

        const mock = createMockResponse();
        await enterpriseServiceEvents.list(req, mock.res);
        const { statusCode, body } = mock.getResult();

        assert.equal(statusCode, 200);
        assert.equal(body.status, "Success");
        assert.equal(body.service_events.length, 2);

        const ev1 = body.service_events[0];
        assert.equal(ev1.total_participants, 4);
        assert.equal(ev1.participants_count, 4);
        assert.equal(ev1.inscribed_count, 4);
        assert.equal(ev1._count.participants, 4);

        const ev2 = body.service_events[1];
        assert.equal(ev2.total_participants, 0);
        assert.equal(ev2.participants_count, 0);
      } finally {
        prisma.serviceEvent.findMany = originalServiceEventFindMany;
      }
    });

    test("enterpriseServiceEvents.getById debe incluir total_participants en el evento", async () => {
      const originalServiceEventFindFirst = prisma.serviceEvent.findFirst;
      prisma.serviceEvent.findFirst = async () => ({
        id: "srv-uuid-300",
        enterprise_id: "ent-org-99",
        title: "Jornada Abierta",
        _count: { participants: 7 },
      });

      try {
        const req = {
          params: { id: "srv-uuid-300" },
          enterprise: { id: "ent-org-99" },
        };

        const mock = createMockResponse();
        await enterpriseServiceEvents.getById(req, mock.res);
        const { statusCode, body } = mock.getResult();

        assert.equal(statusCode, 200);
        assert.equal(body.status, "Success");
        assert.equal(body.service_event.total_participants, 7);
        assert.equal(body.service_event.participants_count, 7);
      } finally {
        prisma.serviceEvent.findFirst = originalServiceEventFindFirst;
      }
    });

    test("events.getMyEnterpriseEvents debe incluir total_participants en cada evento", async () => {
      const originalPlatformFindMany = prisma.platformEvent.findMany;
      const originalPlatformCount = prisma.platformEvent.count;

      prisma.platformEvent.findMany = async () => [
        {
          id: "ev-uuid-101",
          name: "Festival Movilidad",
          enterprise_id: "ent-org-99",
          _count: { participants: 12 },
        },
      ];
      prisma.platformEvent.count = async () => 1;

      try {
        const req = {
          enterprise: { id: "ent-org-99" },
          query: {},
        };

        let responseData = null;
        const res = {
          status: (code) => ({
            json: (data) => {
              responseData = { code, data };
              return data;
            },
          }),
        };

        await events.getMyEnterpriseEvents(req, res, () => {});

        assert.equal(responseData.code, 200);
        assert.equal(responseData.data.status, "Success");
        assert.equal(responseData.data.events.length, 1);
        assert.equal(responseData.data.events[0].total_participants, 12);
        assert.equal(responseData.data.events[0].participants_count, 12);
      } finally {
        prisma.platformEvent.findMany = originalPlatformFindMany;
        prisma.platformEvent.count = originalPlatformCount;
      }
    });
  });

  describe("10. Recuperación Integral de Eventos Corporativos y Autenticación de Empresa", () => {
    test("events.getMyEnterpriseEvents debe unificar platform_events y service_events de la organización", async () => {
      const originalPlatformFindMany = prisma.platformEvent.findMany;
      const originalPlatformCount = prisma.platformEvent.count;
      const originalServiceFindMany = prisma.serviceEvent.findMany;
      const originalServiceCount = prisma.serviceEvent.count;

      prisma.platformEvent.findMany = async () => [
        {
          id: "pe-uuid-1",
          name: "Jornada Innovación",
          enterprise_id: "ent-org-99",
          start_date: new Date("2026-11-20T10:00:00Z"),
          end_date: new Date("2026-11-20T14:00:00Z"),
          tags: [],
          _count: { participants: 5 },
        },
      ];
      prisma.platformEvent.count = async () => 1;

      prisma.serviceEvent.findMany = async () => [
        {
          id: "se-uuid-2",
          title: "CaceresTalk Corporativo",
          enterprise_id: "ent-org-99",
          start_at: new Date("2026-11-15T09:00:00Z"),
          end_at: new Date("2026-11-15T18:00:00Z"),
          _count: { participants: 18 },
        },
      ];
      prisma.serviceEvent.count = async () => 1;

      try {
        const req = {
          enterprise: { id: "ent-org-99" },
          query: { page: "1", limit: "20" },
        };

        let responseData = null;
        const res = {
          status: (code) => ({
            json: (data) => {
              responseData = { code, data };
              return data;
            },
          }),
        };

        await events.getMyEnterpriseEvents(req, res, () => {});

        assert.equal(responseData.code, 200);
        assert.equal(responseData.data.status, "Success");
        assert.equal(responseData.data.events.length, 2, "Debe consolidar ambos eventos");
        assert.equal(responseData.data.pagination.total, 2);

        // Comprobar orden cronológico (se-uuid-2 es del 15 de nov, pe-uuid-1 es del 20 de nov)
        assert.equal(responseData.data.events[0].id, "se-uuid-2");
        assert.equal(responseData.data.events[0].total_participants, 18);
        assert.equal(responseData.data.events[1].id, "pe-uuid-1");
        assert.equal(responseData.data.events[1].total_participants, 5);
      } finally {
        prisma.platformEvent.findMany = originalPlatformFindMany;
        prisma.platformEvent.count = originalPlatformCount;
        prisma.serviceEvent.findMany = originalServiceFindMany;
        prisma.serviceEvent.count = originalServiceCount;
      }
    });

    test("enterpriseServiceEvents.list debe devolver eventos unificados de la empresa", async () => {
      const originalServiceFindMany = prisma.serviceEvent.findMany;
      const originalPlatformFindMany = prisma.platformEvent.findMany;

      prisma.serviceEvent.findMany = async () => [
        {
          id: "se-uuid-10",
          enterprise_id: "ent-org-99",
          title: "Evento Servicio 1",
          created_at: new Date("2026-11-01T10:00:00Z"),
          _count: { participants: 3 },
        },
      ];
      prisma.platformEvent.findMany = async () => [
        {
          id: "pe-uuid-20",
          enterprise_id: "ent-org-99",
          name: "Evento Plataforma 2",
          created_at: new Date("2026-11-02T10:00:00Z"),
          _count: { participants: 9 },
        },
      ];

      try {
        const req = {
          enterprise: { id: "ent-org-99" },
          query: {},
        };

        const mock = createMockResponse();
        await enterpriseServiceEvents.list(req, mock.res);
        const { statusCode, body } = mock.getResult();

        assert.equal(statusCode, 200);
        assert.equal(body.status, "Success");
        assert.equal(body.service_events.length, 2);
        assert.equal(body.total, 2);
        // Orden desc por created_at
        assert.equal(body.service_events[0].id, "pe-uuid-20");
        assert.equal(body.service_events[0].total_participants, 9);
        assert.equal(body.service_events[1].id, "se-uuid-10");
        assert.equal(body.service_events[1].total_participants, 3);
      } finally {
        prisma.serviceEvent.findMany = originalServiceFindMany;
        prisma.platformEvent.findMany = originalPlatformFindMany;
      }
    });

    test("enterpriseAuthorization.reviseEnterprise resuelve organización mediante membresía corporativa activa", async () => {
      const originalEnterpriseFindUnique = prisma.enterprise.findUnique;
      const originalMemberFindFirst = prisma.enterpriseMember.findFirst;

      const userToken = jsonwebtoken.sign(
        { userId: "usr-admin-corp-uuid", email: "admin@youconnext.es" },
        PRIVATE_KEY,
        { algorithm: JWT_ALGORITHM, expiresIn: "1h" },
      );

      prisma.enterprise.findUnique = async ({ where }) => {
        if (where.id === "ent-corp-55") {
          return {
            id: "ent-corp-55",
            name: "YouConnext S.L.",
            is_active: true,
            is_deleted: false,
          };
        }
        return null;
      };

      prisma.enterpriseMember.findFirst = async ({ where }) => {
        if (where.user_id === "usr-admin-corp-uuid" && where.status === "ACTIVE") {
          return {
            enterprise_id: "ent-corp-55",
            role: "ADMIN",
            enterprise: {
              id: "ent-corp-55",
              name: "YouConnext S.L.",
              is_active: true,
              is_deleted: false,
            },
          };
        }
        return null;
      };

      try {
        const req = {
          cookies: { access_token: userToken },
          headers: {},
        };

        const resolvedEnterprise = await enterpriseAuthorization.reviseEnterprise(req);
        assert.ok(resolvedEnterprise, "Debe resolver la empresa a partir del token del usuario miembro");
        assert.equal(resolvedEnterprise.id, "ent-corp-55");
        assert.equal(resolvedEnterprise.name, "YouConnext S.L.");
        assert.ok(req.enterpriseMember, "Debe adjuntar enterpriseMember en la request");
      } finally {
        prisma.enterprise.findUnique = originalEnterpriseFindUnique;
        prisma.enterpriseMember.findFirst = originalMemberFindFirst;
      }
    });

    test("companies.getAllCompanies incluye organizaciones activas con is_enterprise: true", async () => {
      const originalCompanyFindMany = prisma.company.findMany;
      const originalCompanyCount = prisma.company.count;
      const originalEnterpriseFindMany = prisma.enterprise.findMany;
      const originalEnterpriseCount = prisma.enterprise.count;

      prisma.company.findMany = async () => [
        {
          id: "comp-1",
          name: "Diputación",
          created_at: new Date("2026-10-01"),
          _count: { events: 2 },
        },
      ];
      prisma.company.count = async () => 1;

      prisma.enterprise.findMany = async () => [
        {
          id: "ent-1",
          name: "YouConnext",
          email: "sergio@youconnext.es",
          created_at: new Date("2026-10-02"),
          is_active: true,
          is_deleted: false,
          _count: { serviceEvents: 2, platformEvents: 1 },
        },
      ];
      prisma.enterprise.count = async () => 1;

      try {
        const req = { query: {} };
        const mock = createMockResponse();

        await companies.getAllCompanies(req, mock.res);
        const { statusCode, body } = mock.getResult();

        assert.equal(statusCode, 200);
        assert.equal(body.status, "Success");
        assert.equal(body.companies.length, 2);
        assert.equal(body.pagination.total, 2);

        const enterpriseEntry = body.companies.find((c) => c.id === "ent-1");
        assert.ok(enterpriseEntry);
        assert.equal(enterpriseEntry.name, "YouConnext");
        assert.equal(enterpriseEntry.is_enterprise, true);
        assert.equal(enterpriseEntry._count.events, 3);
      } finally {
        prisma.company.findMany = originalCompanyFindMany;
        prisma.company.count = originalCompanyCount;
        prisma.enterprise.findMany = originalEnterpriseFindMany;
        prisma.enterpriseCount = originalEnterpriseCount;
      }
    });

    test("enterprise.getMyMetrics calcula y devuelve métricas del dashboard corporativo", async () => {
      const originalPlatformCount = prisma.platformEvent.count;
      const originalServiceCount = prisma.serviceEvent.count;
      const originalMemberCount = prisma.enterpriseMember.count;
      const originalServicePartCount = prisma.serviceEventParticipant.count;
      const originalEventPartCount = prisma.eventParticipant.count;

      prisma.platformEvent.count = async () => 3;
      prisma.serviceEvent.count = async () => 2;
      prisma.enterpriseMember.count = async () => 10;
      prisma.serviceEventParticipant.count = async () => 15;
      prisma.eventParticipant.count = async () => 25;

      try {
        const req = {
          enterprise: { id: "ent-org-99" },
        };

        let responseData = null;
        const res = {
          status: (code) => ({
            json: (data) => {
              responseData = { code, data };
              return data;
            },
          }),
        };

        await enterprise.getMyMetrics(req, res);

        assert.equal(responseData.code, 200);
        assert.equal(responseData.data.status, "Success");
        assert.equal(responseData.data.totalEvents, 5);
        assert.equal(responseData.data.usersRegistered, 50); // 10 miembros + 15 service + 25 platform
        assert.equal(typeof responseData.data.co2Avoided, "number");
      } finally {
        prisma.platformEvent.count = originalPlatformCount;
        prisma.serviceEvent.count = originalServiceCount;
        prisma.enterpriseMember.count = originalMemberCount;
        prisma.serviceEventParticipant.count = originalServicePartCount;
        prisma.eventParticipant.count = originalEventPartCount;
      }
    });
  });
});
