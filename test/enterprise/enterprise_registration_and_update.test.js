import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EnterpriseSchemas } from "../../app/schemas/enterprise.js";
import { EnterpriseUser } from "../../app/domain/EnterpriseUser.js";

describe("Flujo de Auto-Registro Corporativo, Onboarding y Seguridad Anti-IDOR", () => {
  describe("1. Validaciones de Registro de Empresa (EnterpriseRegisterSchema)", () => {
    it("debe aceptar un registro válido únicamente con correo y contraseña robusta", () => {
      const valid = {
        email: "nueva_empresa@youconnext.com",
        password: "Password123!#",
      };
      const result = EnterpriseSchemas.validateEnterpriseRegister(valid);
      assert.equal(result.success, true);
      assert.equal(result.data.email, "nueva_empresa@youconnext.com");
    });

    it("debe aceptar el registro si opcionalmente incluye el nombre o razón social", () => {
      const withName = {
        name: "Corporación Movilidad S.L.",
        email: "contacto@corp.es",
        password: "Password123!#",
      };
      const result = EnterpriseSchemas.validateEnterpriseRegister(withName);
      assert.equal(result.success, true);
      assert.equal(result.data.name, "Corporación Movilidad S.L.");
    });

    it("debe rechazar contraseñas débiles que no cumplan la política corporativa", () => {
      const weak = {
        email: "test@corp.es",
        password: "passwordinsegura",
      };
      const result = EnterpriseSchemas.validateEnterpriseRegister(weak);
      assert.equal(result.success, false);
      const errors = JSON.parse(result.error.message);
      assert.ok(errors.some((e) => e.path.includes("password")));
    });

    it("debe rechazar correos con formato inválido", () => {
      const invalidEmail = {
        email: "correo_invalido_sin_arroba",
        password: "Password123!#",
      };
      const result = EnterpriseSchemas.validateEnterpriseRegister(invalidEmail);
      assert.equal(result.success, false);
    });
  });

  describe("2. Entidad EnterpriseUser y Flag de Onboarding", () => {
    it("una empresa recién creada debe tener onboarding_ended en false por defecto", () => {
      const rawEnterprise = {
        id: "ent-uuid-001",
        name: "EcoTech Global",
        email: "admin@ecotech.org",
        role_id: 3,
        onboarding_ended: false,
        verified: false,
        is_active: true,
      };

      const entity = new EnterpriseUser(rawEnterprise);
      assert.equal(entity.onboarding_ended, false);

      const safeJson = entity.toSafeJSON();
      assert.equal(safeJson.onboarding_ended, false);
      assert.equal(safeJson.id, "ent-uuid-001");
      assert.equal(safeJson.role, "enterprise");
    });

    it("debe reflejar onboarding_ended true cuando la organización completa el onboarding", () => {
      const completedEnterprise = {
        id: "ent-uuid-002",
        name: "EcoTech Global",
        email: "admin@ecotech.org",
        description: "Organización comprometida con los trayectos compartidos.",
        website: "https://ecotech.org",
        cif: "B12345678",
        location: "Parque Tecnológico, Madrid",
        role_id: 3,
        onboarding_ended: true,
        verified: false,
        is_active: true,
      };

      const entity = new EnterpriseUser(completedEnterprise);
      assert.equal(entity.onboarding_ended, true);

      const safeJson = entity.toSafeJSON();
      assert.equal(safeJson.onboarding_ended, true);
      assert.equal(safeJson.website, "https://ecotech.org");
      assert.equal(safeJson.cif, "B12345678");
    });
  });

  describe("3. Validación de Actualización Corporativa (EnterpriseUpdateSchema)", () => {
    it("debe validar correctamente los campos de onboarding corporativo con CIF opcional", () => {
      const onboardingData = {
        name: "Fundación Sostenible",
        description: "Entidad dedicada al fomento del transporte colaborativo y reducción de emisiones.",
        website: "https://fundacionsostenible.org",
        cif: "G87654321",
        phone: "+34 912 345 678",
        location: "Barcelona",
        sector: "Sostenibilidad y Movilidad",
        employee_count: 150,
        contact_person: "Marta Gómez",
        onboarding_ended: true,
      };

      const result = EnterpriseSchemas.validateEnterpriseUpdate(onboardingData);
      assert.equal(result.success, true);
      assert.equal(result.data.onboarding_ended, true);
      assert.equal(result.data.cif, "G87654321");
    });

    it("debe admitir que el CIF/NIF quede en blanco u omitido (opcional)", () => {
      const onboardingWithoutCif = {
        name: "Asociación Vecinal Verde",
        description: "Promovemos el carpooling interurbano entre los miembros de la comunidad.",
        website: "https://vecinosverdes.org",
        cif: "", // Campo vacío en el formulario
        location: "Valencia",
        onboarding_ended: true,
      };

      const result = EnterpriseSchemas.validateEnterpriseUpdate(onboardingWithoutCif);
      assert.equal(result.success, true);
    });
  });

  describe("4. Proyección y Persistencia de onboarding_ended", () => {
    it("EnterpriseUser debe proyectar onboarding_ended como true en toSafeJSON y toUnifiedAuthResponse", () => {
      const enterprise = new EnterpriseUser({
        id: "ent-test-proj",
        name: "Empresa Proyectada",
        email: "proj@test.com",
        onboarding_ended: true,
      });

      assert.equal(enterprise.onboarding_ended, true);
      assert.equal(enterprise.toSafeJSON().onboarding_ended, true);
      assert.equal(
        enterprise.toUnifiedAuthResponse({ token: "jwt-test-token" }).legal_entity.onboarding_ended,
        true
      );
    });

    it("EnterpriseUser debe tolerar onboarding_ended numérico (1 de MySQL)", () => {
      const enterprise = new EnterpriseUser({
        id: "ent-test-proj-num",
        name: "Empresa MySQL",
        email: "mysql@test.com",
        onboarding_ended: 1,
      });

      assert.equal(enterprise.onboarding_ended, true);
      assert.equal(enterprise.toSafeJSON().onboarding_ended, true);
    });
  });
});
