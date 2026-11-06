import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EnterpriseSchemas } from "../../app/schemas/enterprise.js";
import { EnterpriseUser } from "../../app/domain/EnterpriseUser.js";
import { methods as enterpriseAuth } from "../../app/controllers/enterprise_authentication.js";

describe("Google OAuth para Organizaciones / Empresas", () => {
  describe("1. Validaciones de Esquema (EnterpriseGoogleAuthSchema)", () => {
    it("debe validar correctamente un id_token con método 'auto' por defecto", () => {
      const payload = { id_token: "eyJhbGciOiJSUzI1NiIs..." };
      const result = EnterpriseSchemas.validateEnterpriseGoogleAuth(payload);
      assert.equal(result.success, true);
      assert.equal(result.data.id_token, "eyJhbGciOiJSUzI1NiIs...");
      assert.equal(result.data.method, "auto");
    });

    it("debe aceptar métodos explícitos 'login' y 'register'", () => {
      const loginPayload = {
        id_token: "token-google-login",
        method: "login",
      };
      const registerPayload = {
        id_token: "token-google-register",
        method: "register",
      };

      const loginRes = EnterpriseSchemas.validateEnterpriseGoogleAuth(loginPayload);
      const regRes = EnterpriseSchemas.validateEnterpriseGoogleAuth(registerPayload);

      assert.equal(loginRes.success, true);
      assert.equal(loginRes.data.method, "login");
      assert.equal(regRes.success, true);
      assert.equal(regRes.data.method, "register");
    });

    it("debe rechazar si falta el id_token o es cadena vacía", () => {
      const emptyPayload = { id_token: "" };
      const missingPayload = { method: "login" };

      const emptyRes = EnterpriseSchemas.validateEnterpriseGoogleAuth(emptyPayload);
      const missingRes = EnterpriseSchemas.validateEnterpriseGoogleAuth(missingPayload);

      assert.equal(emptyRes.success, false);
      assert.equal(missingRes.success, false);
    });

    it("debe rechazar un método desconocido", () => {
      const invalidMethod = {
        id_token: "token-google",
        method: "superuser_login",
      };
      const result = EnterpriseSchemas.validateEnterpriseGoogleAuth(invalidMethod);
      assert.equal(result.success, false);
    });
  });

  describe("2. Construcción de URLs OAuth para Empresas (oauthGoogle)", () => {
    it("debe generar URL de autorización para el método login", async () => {
      let statusCalled = null;
      let jsonCalled = null;

      const req = {
        query: { method: "login" },
      };
      const res = {
        status: (code) => {
          statusCalled = code;
          return {
            json: (data) => {
              jsonCalled = data;
            },
          };
        },
      };

      await enterpriseAuth.oauthGoogle(req, res, () => {});
      assert.equal(statusCalled, 200);
      assert.equal(jsonCalled.status, "Success");
      assert.ok(jsonCalled.url.includes("accounts.google.com"));
      assert.ok(jsonCalled.url.includes("api%2Fenterprise%2Fauth%2Foauth%2Flogin"));
    });

    it("debe generar URL de autorización para el método register", async () => {
      let statusCalled = null;
      let jsonCalled = null;

      const req = {
        query: { method: "register" },
      };
      const res = {
        status: (code) => {
          statusCalled = code;
          return {
            json: (data) => {
              jsonCalled = data;
            },
          };
        },
      };

      await enterpriseAuth.oauthGoogle(req, res, () => {});
      assert.equal(statusCalled, 200);
      assert.equal(jsonCalled.status, "Success");
      assert.ok(jsonCalled.url.includes("accounts.google.com"));
      assert.ok(jsonCalled.url.includes("api%2Fenterprise%2Fauth%2Foauth%2Fregister"));
    });

    it("debe rechazar métodos inválidos con error 400", async () => {
      let errorThrown = null;

      const req = {
        query: { method: "unknown" },
      };
      const res = {};
      const next = (err) => {
        errorThrown = err;
      };

      await enterpriseAuth.oauthGoogle(req, res, next);
      assert.ok(errorThrown);
      assert.equal(errorThrown.statusCode, 400);
      assert.equal(errorThrown.errorCode, "INVALID_OAUTH_METHOD");
    });
  });

  describe("3. Redirección y Ruteo Inteligente Post-Autenticación", () => {
    it("una empresa autenticada sin onboarding completado debe ser dirigida a /enterprise/onboarding", () => {
      const enterprisePending = {
        id: "ent-pending-123",
        name: "StartUp Movilidad",
        email: "founders@startup.io",
        onboarding_ended: false,
        is_active: true,
        is_deleted: false,
        role: { id: 3, name: "enterprise" },
      };

      const domain = new EnterpriseUser(enterprisePending);
      const token = domain.generateJwtToken();

      const frontendUrl = "http://localhost:5173/";
      const destination = domain.isOnboardingEnded
        ? `${frontendUrl}enterprise/dashboard?token=${token}`
        : `${frontendUrl}enterprise/onboarding?token=${token}&enterpriseId=${encodeURIComponent(
            enterprisePending.id,
          )}`;

      assert.ok(destination.includes("enterprise/onboarding"));
      assert.ok(destination.includes(`enterpriseId=${enterprisePending.id}`));
      assert.ok(destination.includes(`token=${token}`));
    });

    it("una empresa que completó su onboarding debe ser dirigida a /enterprise/dashboard", () => {
      const enterpriseComplete = {
        id: "ent-complete-456",
        name: "Iberdrola S.A.",
        email: "movilidad@iberdrola.com",
        onboarding_ended: true,
        is_active: true,
        is_deleted: false,
        role: { id: 3, name: "enterprise" },
      };

      const domain = new EnterpriseUser(enterpriseComplete);
      const token = domain.generateJwtToken();

      const frontendUrl = "http://localhost:5173/";
      const destination = domain.isOnboardingEnded
        ? `${frontendUrl}enterprise/dashboard?token=${token}`
        : `${frontendUrl}enterprise/onboarding?token=${token}&enterpriseId=${encodeURIComponent(
            enterpriseComplete.id,
          )}`;

      assert.ok(destination.includes("enterprise/dashboard"));
      assert.ok(!destination.includes("enterprise/onboarding"));
      assert.ok(destination.includes(`token=${token}`));
    });

    it("EnterpriseUser debe proyectar correctamente el token corporativo y cookies requeridas", () => {
      const enterprise = {
        id: "ent-789",
        name: "Renfe Operadora",
        email: "renfe@corporativo.es",
        onboarding_ended: true,
        role: { id: 3, name: "enterprise" },
      };

      const domain = new EnterpriseUser(enterprise);
      const token = domain.generateJwtToken();
      assert.ok(token);

      const cookieOpts = enterpriseAuth.getEnterpriseCookieOptions();
      assert.equal(cookieOpts.httpOnly, true);
      assert.equal(cookieOpts.path, "/");
      assert.ok(cookieOpts.maxAge > 0);
    });
  });

  describe("4. Resiliencia y Control de Estados Corporativos", () => {
    it("debe detectar empresas eliminadas lógicamente (is_deleted: true)", () => {
      const deletedEnterprise = {
        id: "ent-del-1",
        name: "Empresa Antigua",
        email: "baja@empresa.com",
        is_deleted: true,
        is_active: true,
        role: { id: 3, name: "enterprise" },
      };
      const domain = new EnterpriseUser(deletedEnterprise);
      assert.equal(domain.isDeleted, true);
    });

    it("debe detectar empresas suspendidas/inactivas (is_active: false)", () => {
      const inactiveEnterprise = {
        id: "ent-inact-1",
        name: "Empresa Inactiva",
        email: "inactiva@empresa.com",
        is_deleted: false,
        is_active: false,
        role: { id: 3, name: "enterprise" },
      };
      const domain = new EnterpriseUser(inactiveEnterprise);
      assert.equal(domain.isActive, false);
    });
  });
});
