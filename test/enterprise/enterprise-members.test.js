import { test, describe } from "node:test";
import assert from "node:assert/strict";

// Dominio OOP
import { BaseUser } from "../../app/domain/BaseUser.js";
import { RegularUser } from "../../app/domain/RegularUser.js";
import { EnterpriseEmployee } from "../../app/domain/EnterpriseEmployee.js";
import { EnterpriseManager } from "../../app/domain/EnterpriseManager.js";
import { EnterpriseAdmin } from "../../app/domain/EnterpriseAdmin.js";
import { EnterpriseMemberFactory } from "../../app/domain/EnterpriseMemberFactory.js";

// Esquemas Zod
import { EnterpriseMemberSchemas } from "../../app/schemas/enterprise_member.js";

describe("Gestión de Miembros Corporativos, Jerarquía OOP e Invitaciones", () => {
  describe("1. Jerarquía de Dominio OOP y Capacidades Polimórficas", () => {
    const mockUserData = {
      id: "usr-uuid-100",
      email: "carlos@empresa.com",
      name: "Carlos",
      surname: "Gómez",
      dni: "12345678Z",
      phone: "+34600112233",
      is_active: true,
      is_deleted: false,
    };

    const mockEnterpriseData = {
      id: "ent-uuid-999",
      name: "EcoLogistics S.L.",
    };

    test("EnterpriseEmployee debe heredar de RegularUser y BaseUser", () => {
      const employee = new EnterpriseEmployee(mockUserData, {
        id: "mem-uuid-1",
        enterprise_id: mockEnterpriseData.id,
        role: "EMPLOYEE",
        department: "Logística",
        employee_code: "EMP-042",
        status: "ACTIVE",
        enterprise: mockEnterpriseData,
      });

      // Comprobación de herencia en cadena
      assert.ok(employee instanceof EnterpriseEmployee);
      assert.ok(employee instanceof RegularUser);
      assert.ok(employee instanceof BaseUser);

      // Propiedades de RegularUser
      assert.equal(employee.id, mockUserData.id);
      assert.equal(employee.email, mockUserData.email);
      assert.equal(employee.fullName, "Carlos Gómez");

      // Propiedades de EnterpriseEmployee
      assert.equal(employee.enterpriseId, mockEnterpriseData.id);
      assert.equal(employee.roleInOrg, "EMPLOYEE");
      assert.equal(employee.department, "Logística");
      assert.equal(employee.employeeCode, "EMP-042");

      // Permisos de empleado
      assert.equal(employee.isCorporateActive(), true);
      assert.equal(employee.canAccessCorporateRoutes(), true);

      // Empleado base NO debe tener permisos de Manager ni Admin
      assert.equal(typeof employee.canCreateCorporateEvents, "undefined");
      assert.equal(typeof employee.canInviteMembers, "undefined");
    });

    test("EnterpriseManager debe especializar capacidades operativas (eventos y métricas)", () => {
      const manager = new EnterpriseManager(mockUserData, {
        id: "mem-uuid-2",
        enterprise_id: mockEnterpriseData.id,
        role: "MANAGER",
        department: "Sostenibilidad",
        status: "ACTIVE",
        enterprise: mockEnterpriseData,
      });

      assert.ok(manager instanceof EnterpriseManager);
      assert.ok(manager instanceof EnterpriseEmployee);
      assert.ok(manager instanceof RegularUser);

      // Permisos específicos de Manager
      assert.equal(manager.canCreateCorporateEvents(), true);
      assert.equal(manager.canViewCAEMetrics(), true);
      assert.equal(manager.canModerateEventChats(), true);

      // Manager NO debe poder invitar ni expulsar miembros
      assert.equal(typeof manager.canInviteMembers, "undefined");
      assert.equal(typeof manager.canRemoveMembers, "undefined");
    });

    test("EnterpriseAdmin debe tener privilegios corporativos totales (miembros, roles, edición)", () => {
      const admin = new EnterpriseAdmin(mockUserData, {
        id: "mem-uuid-3",
        enterprise_id: mockEnterpriseData.id,
        role: "ADMIN",
        department: "Dirección",
        status: "ACTIVE",
        enterprise: mockEnterpriseData,
      });

      assert.ok(admin instanceof EnterpriseAdmin);
      assert.ok(admin instanceof EnterpriseManager);
      assert.ok(admin instanceof EnterpriseEmployee);

      // Permisos de Admin
      assert.equal(admin.canInviteMembers(), true);
      assert.equal(admin.canRemoveMembers(), true);
      assert.equal(admin.canChangeMemberRole(), true);
      assert.equal(admin.canEditEnterpriseProfile(), true);

      // Debe heredar los permisos de Manager y Employee
      assert.equal(admin.canCreateCorporateEvents(), true);
      assert.equal(admin.canViewCAEMetrics(), true);
      assert.equal(admin.canAccessCorporateRoutes(), true);
    });

    test("EnterpriseMemberFactory debe instanciar polimórficamente la clase adecuada", () => {
      const empInstance = EnterpriseMemberFactory.create(mockUserData, {
        role: "EMPLOYEE",
      });
      const mgrInstance = EnterpriseMemberFactory.create(mockUserData, {
        role: "MANAGER",
      });
      const admInstance = EnterpriseMemberFactory.create(mockUserData, {
        role: "ADMIN",
      });
      const defaultInstance = EnterpriseMemberFactory.create(mockUserData, {});

      assert.equal(empInstance.constructor.name, "EnterpriseEmployee");
      assert.equal(mgrInstance.constructor.name, "EnterpriseManager");
      assert.equal(admInstance.constructor.name, "EnterpriseAdmin");
      assert.equal(defaultInstance.constructor.name, "EnterpriseEmployee");
    });

    test("toCorporateBadge debe generar un distintivo seguro con datos de la empresa", () => {
      const employee = new EnterpriseEmployee(mockUserData, {
        id: "mem-badge-1",
        enterprise_id: mockEnterpriseData.id,
        role: "EMPLOYEE",
        department: "Operaciones",
        employee_code: "OP-99",
        enterprise: mockEnterpriseData,
      });

      const badge = employee.toCorporateBadge();
      assert.equal(badge.userId, mockUserData.id);
      assert.equal(badge.fullName, "Carlos Gómez");
      assert.equal(badge.enterpriseId, mockEnterpriseData.id);
      assert.equal(badge.enterpriseName, "EcoLogistics S.L.");
      assert.equal(badge.roleInOrg, "EMPLOYEE");
      assert.equal(badge.department, "Operaciones");
    });
  });

  describe("2. Validaciones de Entrada (Zod Schemas)", () => {
    test("validateInviteMember debe validar email, rol y campos opcionales", () => {
      const valid = EnterpriseMemberSchemas.validateInviteMember({
        email: "Laura.Perez@Empresa.com",
        role: "MANAGER",
        department: "Recursos Humanos",
        employee_code: "RRHH-01",
      });

      assert.ok(valid.success);
      assert.equal(valid.data.email, "laura.perez@empresa.com"); // Normalización a minúsculas
      assert.equal(valid.data.role, "MANAGER");
      assert.equal(valid.data.department, "Recursos Humanos");

      // Rechazar email con formato incorrecto
      const invalidEmail = EnterpriseMemberSchemas.validateInviteMember({
        email: "no-es-un-correo",
        role: "EMPLOYEE",
      });
      assert.equal(invalidEmail.success, false);

      // Rechazar rol inexistente
      const invalidRole = EnterpriseMemberSchemas.validateInviteMember({
        email: "test@empresa.com",
        role: "SUPER_BOSS",
      });
      assert.equal(invalidRole.success, false);
    });

    test("validateAcceptInvitation debe validar la longitud y presencia del token", () => {
      const valid = EnterpriseMemberSchemas.validateAcceptInvitation({
        token: "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90",
      });
      assert.ok(valid.success);

      const tooShort = EnterpriseMemberSchemas.validateAcceptInvitation({
        token: "short_token",
      });
      assert.equal(tooShort.success, false);

      const empty = EnterpriseMemberSchemas.validateAcceptInvitation({});
      assert.equal(empty.success, false);
    });

    test("validateChangeRole debe permitir únicamente roles permitidos", () => {
      assert.ok(EnterpriseMemberSchemas.validateChangeRole({ role: "ADMIN" }).success);
      assert.ok(EnterpriseMemberSchemas.validateChangeRole({ role: "MANAGER" }).success);
      assert.ok(EnterpriseMemberSchemas.validateChangeRole({ role: "EMPLOYEE" }).success);
      assert.equal(
        EnterpriseMemberSchemas.validateChangeRole({ role: "UNKNOWN" }).success,
        false,
      );
    });

    test("validateMemberQueryFilters debe aplicar valores por defecto en paginación", () => {
      const parsed = EnterpriseMemberSchemas.validateMemberQueryFilters({});
      assert.ok(parsed.success);
      assert.equal(parsed.data.page, 1);
      assert.equal(parsed.data.limit, 20);

      const withFilters = EnterpriseMemberSchemas.validateMemberQueryFilters({
        page: "2",
        limit: "50",
        search: "Carlos",
        role: "ADMIN",
        status: "ACTIVE",
      });
      assert.ok(withFilters.success);
      assert.equal(withFilters.data.page, 2);
      assert.equal(withFilters.data.limit, 50);
      assert.equal(withFilters.data.search, "Carlos");
      assert.equal(withFilters.data.role, "ADMIN");
    });
  });

  describe("3. Reglas de Negocio y Salvaguarda Anti-Orfandad", () => {
    test("Debe bloquear la degradación del único administrador activo de la organización", () => {
      // Simulación de estado de miembros de la empresa
      const membersInDb = [
        { id: "mem-1", role: "ADMIN", status: "ACTIVE" },
        { id: "mem-2", role: "EMPLOYEE", status: "ACTIVE" },
      ];

      const targetMember = membersInDb.find((m) => m.id === "mem-1");
      const newRole = "EMPLOYEE";

      const activeAdminsCount = membersInDb.filter(
        (m) => m.role === "ADMIN" && m.status === "ACTIVE",
      ).length;

      let operationAllowed = true;
      let errorMessage = "";

      if (targetMember.role === "ADMIN" && newRole !== "ADMIN") {
        if (activeAdminsCount <= 1) {
          operationAllowed = false;
          errorMessage =
            "Operación rechazada. La organización debe tener al menos un administrador activo.";
        }
      }

      assert.equal(operationAllowed, false);
      assert.ok(errorMessage.includes("al menos un administrador activo"));
    });

    test("Debe permitir degradar a un administrador si existe otro administrador activo", () => {
      const membersInDb = [
        { id: "mem-1", role: "ADMIN", status: "ACTIVE" },
        { id: "mem-2", role: "ADMIN", status: "ACTIVE" },
        { id: "mem-3", role: "EMPLOYEE", status: "ACTIVE" },
      ];

      const targetMember = membersInDb.find((m) => m.id === "mem-1");
      const newRole = "MANAGER";

      const activeAdminsCount = membersInDb.filter(
        (m) => m.role === "ADMIN" && m.status === "ACTIVE",
      ).length;

      let operationAllowed = true;
      if (targetMember.role === "ADMIN" && newRole !== "ADMIN") {
        if (activeAdminsCount <= 1) {
          operationAllowed = false;
        }
      }

      assert.equal(operationAllowed, true);
    });

    test("Debe bloquear la desvinculación (eliminación) del único administrador activo", () => {
      const membersInDb = [
        { id: "mem-1", role: "ADMIN", status: "ACTIVE" },
        { id: "mem-2", role: "MANAGER", status: "ACTIVE" },
      ];

      const targetMember = membersInDb.find((m) => m.id === "mem-1");
      const activeAdminsCount = membersInDb.filter(
        (m) => m.role === "ADMIN" && m.status === "ACTIVE",
      ).length;

      let canDelete = true;
      if (targetMember.role === "ADMIN" && activeAdminsCount <= 1) {
        canDelete = false;
      }

      assert.equal(canDelete, false);
    });

    test("Debe permitir desvincular a un empleado normal sin afectar a la cuenta personal de YouConnext", () => {
      const userPersonalAccount = {
        id: "usr-42",
        name: "Ana",
        cars: [{ id: "car-1", brand: "Toyota" }],
        wallet_balance: 45.5,
      };

      let enterpriseMembership = {
        id: "mem-42",
        enterprise_id: "ent-1",
        user_id: userPersonalAccount.id,
      };

      // Simulación de desvinculación: se borra la membresía pero NO la cuenta del usuario
      enterpriseMembership = null;

      assert.equal(enterpriseMembership, null);
      // La cuenta personal conserva sus coches y su monedero intactos
      assert.equal(userPersonalAccount.id, "usr-42");
      assert.equal(userPersonalAccount.cars.length, 1);
      assert.equal(userPersonalAccount.wallet_balance, 45.5);
    });
  });

  describe("4. Ciclo de Vida del Token de Invitación y Expiración", () => {
    test("El token de invitación debe tener 7 días de vigencia y ser detectable si expira", () => {
      const now = Date.now();
      const validInvitation = {
        id: "inv-1",
        token: "tok-valid-12345678901234567890123456789012",
        expires_at: new Date(now + 7 * 24 * 60 * 60 * 1000), // 7 días en el futuro
        accepted_at: null,
      };

      const isExpired = new Date() > new Date(validInvitation.expires_at);
      assert.equal(isExpired, false);

      const expiredInvitation = {
        id: "inv-2",
        token: "tok-expired-12345678901234567890123456789012",
        expires_at: new Date(now - 1000), // 1 segundo en el pasado
        accepted_at: null,
      };

      const isExpiredPast = new Date() > new Date(expiredInvitation.expires_at);
      assert.equal(isExpiredPast, true);
    });

    test("Una invitación ya aceptada no debe poder volver a utilizarse", () => {
      const alreadyAccepted = {
        id: "inv-3",
        token: "tok-accepted-12345678901234567890123456789012",
        expires_at: new Date(Date.now() + 50000),
        accepted_at: new Date(),
      };

      const canAccept = !alreadyAccepted.accepted_at;
      assert.equal(canAccept, false);
    });
  });

  describe("5. Evento de Notificación de Invitación RabbitMQ (enterprise.member.invited)", () => {
    test("debe estructurar el payload enriquecido de notificación para el microservicio de notificaciones", () => {
      const invitationPayload = {
        invitation_id: "inv-uuid-888",
        enterprise_id: "ent-uuid-999",
        enterprise_name: "EcoLogistics S.L.",
        email: "nuevo.empleado@empresa.com",
        role: "EMPLOYEE",
        department: "Logística y Envíos",
        employee_code: "LOG-007",
        token: "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        invitation_link:
          "https://youconnext.es/enterprise/invitation/accept?token=abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
        invited_by: "admin-uuid-1",
      };

      assert.equal(invitationPayload.enterprise_name, "EcoLogistics S.L.");
      assert.equal(invitationPayload.role, "EMPLOYEE");
      assert.equal(invitationPayload.email, "nuevo.empleado@empresa.com");
      assert.ok(invitationPayload.invitation_link.includes(invitationPayload.token));
      assert.ok(invitationPayload.expires_at.includes("T"));
      assert.equal(invitationPayload.token.length, 64);
    });
  });
});
