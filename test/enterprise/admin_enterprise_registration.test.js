import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EnterpriseSchemas } from "../../app/schemas/enterprise.js";
import { EnterpriseUser } from "../../app/domain/EnterpriseUser.js";

describe("Alta Administrativa de Organizaciones (SuperAdmin)", () => {
  describe("1. Validaciones de Entrada (EnterpriseCreateSchema)", () => {
    it("debe aceptar un alta administrativa con toda la información corporativa completa", () => {
      const fullData = {
        name: "Iberdrola España S.A.",
        email: "movilidad.admin@iberdrola.es",
        password: "Password123!#",
        description: "Líder global en sostenibilidad y carpooling para empleados.",
        location: "Bilbao / Madrid",
        phone: "+34 910 000 000",
        cif: "A48010611",
        website: "https://www.iberdrola.es",
        logo: "https://www.iberdrola.es/logo.png",
        contact_person: "Dpto. Movilidad Sostenible",
        sector: "Energía y Medio Ambiente",
        employee_count: 35000,
        address_line1: "Calle Tomás Redondo 1",
        address_line2: "Edificio 2",
        city: "Madrid",
        province: "Madrid",
        postal_code: "28033",
        country: "ES",
        verified: true,
        is_active: true,
        onboarding_ended: true,
      };

      const result = EnterpriseSchemas.validateEnterpriseCreate(fullData);
      assert.equal(result.success, true);
      assert.equal(result.data.name, "Iberdrola España S.A.");
      assert.equal(result.data.verified, true);
      assert.equal(result.data.onboarding_ended, true);
      assert.equal(result.data.employee_count, 35000);
    });

    it("debe exigir los campos esenciales (name, email, password, description, location)", () => {
      const incomplete = {
        name: "Empresa",
        email: "test@empresa.es",
        // Faltan password, description y location
      };

      const result = EnterpriseSchemas.validateEnterpriseCreate(incomplete);
      assert.equal(result.success, false);
      const errors = JSON.parse(result.error.message);
      const errorPaths = errors.map((e) => e.path[0]);
      assert.ok(errorPaths.includes("password"));
      assert.ok(errorPaths.includes("description"));
      assert.ok(errorPaths.includes("location"));
    });

    it("debe admitir que campos opcionales como CIF o Website se envíen vacíos", () => {
      const withEmptyOptionals = {
        name: "Asociación Cultural",
        email: "contacto@asoc-cultural.org",
        password: "Password123!#",
        description: "Entidad cultural sin ánimo de lucro y con fomento del transporte compartido.",
        location: "Sevilla",
        cif: "",
        website: "",
        phone: "",
      };

      const result = EnterpriseSchemas.validateEnterpriseCreate(withEmptyOptionals);
      assert.equal(result.success, true);
    });
  });

  describe("2. Serialización toAdminDetailJSON", () => {
    it("debe incluir propiedades completas para el panel de administración", () => {
      const rawEnterprise = {
        id: "ent-admin-uuid-001",
        name: "Fundación Movilidad",
        email: "admin@fundacion.org",
        description: "Promoción de trayectos interurbanos limpios.",
        location: "Valencia",
        phone: "961234567",
        cif: "G12345678",
        website: "https://fundacion.org",
        role_id: 3,
        verified: true,
        is_active: true,
        is_deleted: false,
        onboarding_ended: true,
      };

      const entity = new EnterpriseUser(rawEnterprise);
      const adminDetail = entity.toAdminDetailJSON();

      assert.equal(adminDetail.id, "ent-admin-uuid-001");
      assert.equal(adminDetail.verified, true);
      assert.equal(adminDetail.onboarding_ended, true);
      assert.equal(adminDetail.isDeleted, false);
      assert.equal(adminDetail.role, "enterprise");
    });
  });
});
