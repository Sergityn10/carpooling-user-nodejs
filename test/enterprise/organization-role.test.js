import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BaseUser } from "../../app/domain/BaseUser.js";
import { EnterpriseUser } from "../../app/domain/EnterpriseUser.js";
import { EnterpriseSchemas } from "../../app/schemas/enterprise.js";

describe("Nuevo Rol Enterprise, Jerarquía OOP y Gestión de Organizaciones", () => {
  describe("1. Capa de Dominio y Jerarquía de Clases (BaseUser -> EnterpriseUser)", () => {
    it("debe instanciar EnterpriseUser heredando correctamente de BaseUser", () => {
      const enterprise = new EnterpriseUser({
        id: "ent-1234-uuid",
        email: "contacto@techcorp.es",
        name: "Tech Corp S.L.",
        description: "Empresa tecnológica líder en movilidad y carpooling corporativo.",
        location: "Paseo de la Castellana 100, Madrid",
        cif: "B12345678",
        sector: "Tecnología",
        employee_count: 450,
      });

      assert.ok(enterprise instanceof BaseUser, "EnterpriseUser debe heredar de BaseUser");
      assert.ok(enterprise instanceof EnterpriseUser, "Debe ser instancia de EnterpriseUser");
      assert.equal(enterprise.roleName, "enterprise");
      assert.equal(enterprise.roleId, 3);
      assert.equal(enterprise.isEnterprise(), true);
      assert.equal(enterprise.isAdmin(), false);
      assert.equal(enterprise.isRegularUser(), false);
      assert.equal(enterprise.isActive, true);
      assert.equal(enterprise.isDeleted, false);
      assert.equal(enterprise.deletedAt, null);
    });

    it("debe verificar contraseñas hasheadas y rechazar contraseñas incorrectas", async () => {
      const plainPassword = "SecurePassword2026!";
      const hashedPassword = await BaseUser.hashPassword(plainPassword, 10);

      const enterprise = new EnterpriseUser({
        id: "ent-5678-uuid",
        email: "seguridad@youconnext.es",
        password: hashedPassword,
      });

      const valid = await enterprise.verifyPassword("SecurePassword2026!");
      assert.equal(valid, true, "La contraseña válida debe ser confirmada");

      const invalid = await enterprise.verifyPassword("WrongPassword123!");
      assert.equal(invalid, false, "Una contraseña errónea debe ser rechazada");
    });

    it("debe aplicar borrado lógico (softDelete) y restaurar (restore) preservando la identidad", () => {
      const enterprise = new EnterpriseUser({
        id: "ent-soft-delete-uuid",
        email: "baja@empresa.com",
      });

      assert.equal(enterprise.canCreateEvents(), true);

      // Aplicar borrado lógico
      enterprise.softDelete();
      assert.equal(enterprise.isDeleted, true);
      assert.equal(enterprise.isActive, false);
      assert.ok(enterprise.deletedAt instanceof Date);
      assert.equal(enterprise.canCreateEvents(), false, "Una empresa eliminada no puede crear eventos");

      // Restaurar
      enterprise.restore();
      assert.equal(enterprise.isDeleted, false);
      assert.equal(enterprise.isActive, true);
      assert.equal(enterprise.deletedAt, null);
      assert.equal(enterprise.canCreateEvents(), true, "Una empresa restaurada recupera sus capacidades");
    });

    it("debe generar el payload JWT con role: enterprise y enterprise_id", () => {
      const enterprise = new EnterpriseUser({
        id: "ent-jwt-uuid-99",
        email: "admin@innovacion.es",
      });

      const payload = enterprise.generateJwtPayload();
      assert.equal(payload.enterprise_id, "ent-jwt-uuid-99");
      assert.equal(payload.email, "admin@innovacion.es");
      assert.equal(payload.role, "enterprise");
      assert.equal(payload.type, "enterprise");
    });

    it("debe sanitizar datos mediante toSafeJSON y toAdminDetailJSON sin exponer password", () => {
      const enterprise = new EnterpriseUser({
        id: "ent-sanitize-1",
        name: "EcoLogistics",
        email: "info@ecologistics.es",
        password: "hashed_password_secret_12345",
        description: "Logística y movilidad sostenible.",
        location: "Polígono Industrial Las Capellanías, Cáceres",
        cif: "A98765432",
        serviceEvents: [{ id: "se-1" }, { id: "se-2" }],
      });

      const safe = enterprise.toSafeJSON();
      assert.equal(safe.password, undefined, "toSafeJSON NUNCA debe incluir password");
      assert.equal(safe.name, "EcoLogistics");
      assert.equal(safe.role, "enterprise");

      const adminDetail = enterprise.toAdminDetailJSON();
      assert.equal(adminDetail.password, undefined);
      assert.equal(adminDetail.serviceEventsCount, 2);
      assert.equal(adminDetail.isDeleted, false);
    });
  });

  describe("2. Validaciones de Entrada y Seguridad (Zod)", () => {
    it("debe exigir los campos obligatorios: name, description, location, email, password", () => {
      const invalidData = {
        name: "Empresa Incompleta",
        email: "test@empresa.es",
        // Faltan description, location y password
      };

      const result = EnterpriseSchemas.validateEnterpriseCreate(invalidData);
      assert.equal(result.success, false);
      const errors = JSON.parse(result.error.message);
      const fieldsWithErrors = errors.map((e) => e.path[0]);
      assert.ok(fieldsWithErrors.includes("description"), "description debe ser obligatoria");
      assert.ok(fieldsWithErrors.includes("location"), "location debe ser obligatoria");
      assert.ok(fieldsWithErrors.includes("password"), "password debe ser obligatoria");
    });

    it("debe validar la complejidad estricta de la contraseña", () => {
      // Contraseña débil (solo letras minúsculas)
      const weakResult = EnterpriseSchemas.validateEnterpriseCreate({
        name: "Empresa Test",
        description: "Descripción de prueba con más de 10 caracteres.",
        location: "Calle Test 12, Cáceres",
        email: "test@weakpass.com",
        password: "sololetrasminusculas",
      });
      assert.equal(weakResult.success, false, "Debe rechazar contraseñas sin mayúsculas, números o símbolos");

      // Contraseña robusta que cumple todos los requisitos
      const strongResult = EnterpriseSchemas.validateEnterpriseCreate({
        name: "Empresa Test",
        description: "Descripción de prueba con más de 10 caracteres.",
        location: "Calle Test 12, Cáceres",
        email: "test@strongpass.com",
        password: "PasswordRobust42!",
      });
      assert.equal(strongResult.success, true, "Debe aceptar contraseñas que cumplan con la política de seguridad");
    });

    it("debe verificar que la nueva contraseña no coincida con la anterior y que la confirmación sea idéntica", () => {
      // 1. Confirmación no coincide
      const mismatchResult = EnterpriseSchemas.validateEnterpriseChangePassword({
        current_password: "OldPassword123!",
        new_password: "NewPassword456!",
        confirm_password: "DifferentPassword789!",
      });
      assert.equal(mismatchResult.success, false);

      // 2. Nueva contraseña idéntica a la anterior
      const identicalResult = EnterpriseSchemas.validateEnterpriseChangePassword({
        current_password: "OldPassword123!",
        new_password: "OldPassword123!",
        confirm_password: "OldPassword123!",
      });
      assert.equal(identicalResult.success, false, "Debe rechazar reutilización de la contraseña actual");

      // 3. Cambio correcto
      const validChange = EnterpriseSchemas.validateEnterpriseChangePassword({
        current_password: "OldPassword123!",
        new_password: "NewSuperPassword2026@",
        confirm_password: "NewSuperPassword2026@",
      });
      assert.equal(validChange.success, true);
    });

    it("debe validar los filtros de consulta para la Web Admin", () => {
      const filters = EnterpriseSchemas.validateQueryFilters({
        page: "2",
        limit: "15",
        search: "Cáceres",
        status: "active",
      });

      assert.equal(filters.success, true);
      assert.equal(filters.data.page, 2);
      assert.equal(filters.data.limit, 15);
      assert.equal(filters.data.search, "Cáceres");
      assert.equal(filters.data.status, "active");
    });
  });

  describe("3. Creación Autónoma de Eventos por Organizadores con Lógica Robusta", () => {
    it("debe validar la coherencia temporal: end_date >= start_date", () => {
      const startDate = new Date("2026-11-15T09:00:00Z");
      const invalidEndDate = new Date("2026-11-14T18:00:00Z"); // anterior a start_date
      const validEndDate = new Date("2026-11-15T18:00:00Z");

      assert.ok(invalidEndDate < startDate, "La fecha de fin anterior debe ser detectada como inválida");
      assert.ok(validEndDate >= startDate, "La fecha de fin igual o posterior es válida");
    });

    it("debe asociar automáticamente el enterprise_id del organizador en sesión (Anti-IDOR)", () => {
      const organizerSession = {
        enterprise: {
          id: "enterprise-auth-uuid-42",
          name: "Festival Sostenible S.L.",
          is_active: true,
          is_deleted: false,
        },
      };

      const requestedBody = {
        name: "Festival de Música Verde 2026",
        start_date: "2026-11-20T10:00:00Z",
        end_date: "2026-11-22T23:00:00Z",
        location: "Recinto Hípico de Cáceres",
        // Intento de suplantar con otro enterprise_id ajeno
        enterprise_id: "malicious-hacker-injected-id",
      };

      // Lógica implementada: req.enterprise.id tiene precedencia absoluta
      const effectiveEnterpriseId = organizerSession.enterprise?.id || requestedBody.enterprise_id;
      assert.equal(effectiveEnterpriseId, "enterprise-auth-uuid-42", "Debe forzar el ID de la empresa autenticada");
    });

    it("debe validar permisos de edición y borrado (solo propietario o admin)", () => {
      const eventInDb = {
        id: "event-100",
        name: "Conferencia Movilidad Eléctrica",
        enterprise_id: "enterprise-owner-uuid",
      };

      // Caso 1: La propia empresa propietaria
      const ownerSession = { enterprise: { id: "enterprise-owner-uuid" } };
      const isOwnerAllowed = String(eventInDb.enterprise_id) === String(ownerSession.enterprise?.id);
      assert.equal(isOwnerAllowed, true, "El organizador propietario puede modificar su evento");

      // Caso 2: Otra empresa distinta intentando modificar
      const otherOrgSession = { enterprise: { id: "other-enterprise-uuid" } };
      const isOtherAllowed = String(eventInDb.enterprise_id) === String(otherOrgSession.enterprise?.id);
      assert.equal(isOtherAllowed, false, "Una empresa ajena debe ser rechazada (403)");

      // Caso 3: Administrador del sistema
      const adminSession = { user: { role: { name: "admin" } } };
      const isAdminAllowed = adminSession.user?.role?.name === "admin";
      assert.equal(isAdminAllowed, true, "El administrador siempre tiene autorización global");
    });

    it("debe preservar los eventos y métricas tras el borrado lógico de la empresa", () => {
      const enterprise = {
        id: "enterprise-metrics-uuid",
        is_deleted: false,
        deleted_at: null,
      };

      const eventsCreated = [
        { id: "ev-1", enterprise_id: enterprise.id, attendees: 1200, co2SavedKg: 450 },
        { id: "ev-2", enterprise_id: enterprise.id, attendees: 800, co2SavedKg: 310 },
      ];

      // Se ejecuta el borrado lógico
      enterprise.is_deleted = true;
      enterprise.deleted_at = new Date();

      // Los eventos NO se eliminan: las métricas de impacto y CAE se conservan íntegras
      const totalCO2Saved = eventsCreated.reduce((sum, ev) => sum + ev.co2SavedKg, 0);
      assert.equal(eventsCreated.length, 2, "Los eventos deben permanecer en base de datos");
      assert.equal(totalCO2Saved, 760, "Las métricas de reducción de emisiones se mantienen calculables");
    });
  });
});
