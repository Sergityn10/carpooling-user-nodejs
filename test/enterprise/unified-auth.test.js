import { test, describe } from "node:test";
import assert from "node:assert/strict";

// Dominio OOP
import { BaseUser } from "../../app/domain/BaseUser.js";
import { RegularUser } from "../../app/domain/RegularUser.js";
import { EnterpriseUser } from "../../app/domain/EnterpriseUser.js";
import { EnterpriseEmployee } from "../../app/domain/EnterpriseEmployee.js";
import { EnterpriseManager } from "../../app/domain/EnterpriseManager.js";
import { EnterpriseAdmin } from "../../app/domain/EnterpriseAdmin.js";
import { IdentityFactory } from "../../app/domain/IdentityFactory.js";

// Esquema Zod
import { UnifiedAuthSchemas } from "../../app/schemas/unified_auth.js";

describe("Autenticación Unificada y Estandarización de Identidades (OOP & Zod)", () => {
  const mockEnterpriseData = {
    id: "ent-uuid-001",
    name: "Iberdrola S.A.",
    email: "movilidad@iberdrola.com",
    cif: "A48010611",
    sector: "Energía y Sostenibilidad",
    location: "Bilbao / Madrid",
    description: "Líder global en energías renovables y movilidad sostenible",
    phone: "+34910000000",
    website: "https://www.iberdrola.com",
    logo: "https://iberdrola.com/logo.png",
    verified: true,
    is_active: true,
    is_deleted: false,
  };

  const mockUserData = {
    id: "usr-uuid-001",
    name: "Carlos",
    surname: "Gómez",
    email: "carlos.gomez@empresa.com",
    dni: "12345678Z",
    phone: "+34600112233",
    img_perfil: "https://youconnext.es/avatars/carlos.jpg",
    is_active: true,
    is_deleted: false,
    cars: [{ id_coche: 1 }],
  };

  describe("1. Clasificación de Persona Jurídica (EnterpriseUser)", () => {
    test("debe clasificar a una organización como LEGAL_ENTITY y ORGANIZATION", () => {
      const enterprise = IdentityFactory.createFromEnterprise(mockEnterpriseData);

      assert.ok(enterprise instanceof EnterpriseUser);
      assert.ok(enterprise instanceof BaseUser);

      assert.equal(enterprise.getIdentityType(), "LEGAL_ENTITY");
      assert.equal(enterprise.getClassification(), "ORGANIZATION");
      assert.equal(enterprise.getInitialMode(), "enterprise");

      const permissions = enterprise.getPermissions();
      assert.equal(permissions.can_access_personal_mode, false);
      assert.equal(permissions.can_access_corporate_mode, true);
      assert.equal(permissions.can_manage_enterprise, true);
      assert.equal(permissions.can_switch_dashboard, false); // Es pura empresa, no viaja a nivel personal
      assert.equal(permissions.can_create_corporate_events, true);
      assert.equal(permissions.can_view_cae_metrics, true);
    });

    test("toUnifiedAuthResponse debe formatear la salida estándar para Persona Jurídica", () => {
      const enterprise = IdentityFactory.createFromEnterprise(mockEnterpriseData);
      const response = enterprise.toUnifiedAuthResponse({
        token: "jwt-test-token-enterprise",
      });

      assert.equal(response.status, "Success");
      assert.equal(response.token, "jwt-test-token-enterprise");
      assert.equal(response.initial_mode, "enterprise");

      // Identidad
      assert.equal(response.identity.type, "LEGAL_ENTITY");
      assert.equal(response.identity.classification, "ORGANIZATION");
      assert.equal(response.identity.user_id, mockEnterpriseData.id);
      assert.equal(response.identity.display_name, "Iberdrola S.A.");
      assert.equal(response.identity.avatar, mockEnterpriseData.logo);

      // Entidad legal presente
      assert.ok(response.legal_entity);
      assert.equal(response.legal_entity.cif, "A48010611");
      assert.equal(response.legal_entity.name, "Iberdrola S.A.");

      // Persona física nula
      assert.equal(response.natural_person, null);
    });
  });

  describe("2. Clasificación de Persona Física Particular (RegularUser)", () => {
    test("debe clasificar a un usuario particular sin empresa como NATURAL_PERSON y REGULAR_USER", () => {
      const user = IdentityFactory.createFromUser(mockUserData, []);

      assert.ok(user instanceof RegularUser);
      assert.equal(user.getIdentityType(), "NATURAL_PERSON");
      assert.equal(user.getClassification(), "REGULAR_USER");
      assert.equal(user.getInitialMode(), "personal");

      const permissions = user.getPermissions();
      assert.equal(permissions.can_access_personal_mode, true);
      assert.equal(permissions.can_access_corporate_mode, false);
      assert.equal(permissions.can_switch_dashboard, false);
      assert.equal(permissions.can_manage_enterprise, false);
      assert.equal(permissions.can_create_corporate_events, false);
    });

    test("toUnifiedAuthResponse debe formatear la salida estándar para usuario particular", () => {
      const user = IdentityFactory.createFromUser(mockUserData, []);
      const response = user.toUnifiedAuthResponse({
        token: "jwt-test-token-user",
      });

      assert.equal(response.identity.type, "NATURAL_PERSON");
      assert.equal(response.identity.classification, "REGULAR_USER");
      assert.equal(response.identity.display_name, "Carlos Gómez");
      assert.equal(response.legal_entity, null);

      assert.ok(response.natural_person);
      assert.equal(response.natural_person.dni, "12345678Z");
      assert.equal(response.natural_person.is_corporate_member, false);
      assert.equal(response.natural_person.primary_membership, null);
      assert.equal(response.natural_person.memberships.length, 0);
      assert.equal(response.natural_person.is_driver, true);
      assert.equal(response.permissions.can_switch_dashboard, false);
    });
  });

  describe("3. Clasificación y Jerarquía de Empleados y Gestores Corporativos", () => {
    const mockMemberships = [
      {
        id: "mem-1",
        enterprise_id: mockEnterpriseData.id,
        role: "MANAGER",
        department: "Sostenibilidad y RSC",
        employee_code: "IB-902",
        status: "ACTIVE",
        enterprise: mockEnterpriseData,
      },
    ];

    test("IdentityFactory debe instanciar EnterpriseManager si tiene rol MANAGER", () => {
      const manager = IdentityFactory.createFromUser(mockUserData, mockMemberships);

      assert.ok(manager instanceof EnterpriseManager);
      assert.ok(manager instanceof EnterpriseEmployee);
      assert.ok(manager instanceof RegularUser);

      assert.equal(manager.getIdentityType(), "NATURAL_PERSON");
      assert.equal(manager.getClassification(), "ENTERPRISE_MANAGER");
      assert.equal(manager.getCorporateRoleTitle(), "Gestor de Movilidad");

      const permissions = manager.getPermissions();
      assert.equal(permissions.can_access_personal_mode, true);
      assert.equal(permissions.can_access_corporate_mode, true);
      assert.equal(permissions.can_switch_dashboard, true); // Puede alternar dashboard en app móvil
      assert.equal(permissions.can_create_corporate_events, true);
      assert.equal(permissions.can_view_cae_metrics, true);
      assert.equal(permissions.can_manage_enterprise, false); // Solo Admin puede gestionar miembros
    });

    test("IdentityFactory debe priorizar ADMIN si el usuario tiene múltiples roles", () => {
      const multiMemberships = [
        {
          id: "mem-emp",
          enterprise_id: "other-ent",
          role: "EMPLOYEE",
          status: "ACTIVE",
          enterprise: { name: "Empresa Secundaria" },
        },
        {
          id: "mem-adm",
          enterprise_id: mockEnterpriseData.id,
          role: "ADMIN",
          department: "Dirección",
          status: "ACTIVE",
          enterprise: mockEnterpriseData,
        },
      ];

      const admin = IdentityFactory.createFromUser(mockUserData, multiMemberships);

      assert.ok(admin instanceof EnterpriseAdmin);
      assert.equal(admin.getClassification(), "ENTERPRISE_ADMIN");
      assert.equal(admin.getCorporateRoleTitle(), "Administrador de Empresa");

      const permissions = admin.getPermissions();
      assert.equal(permissions.can_manage_enterprise, true);
      assert.equal(permissions.can_invite_members, true);
      assert.equal(permissions.can_switch_dashboard, true);

      const response = admin.toUnifiedAuthResponse({
        token: "jwt-test-token-admin",
        allMemberships: admin.allMemberships,
      });

      assert.equal(response.identity.classification, "ENTERPRISE_ADMIN");
      assert.equal(response.natural_person.is_corporate_member, true);
      assert.equal(
        response.natural_person.primary_membership.enterprise_name,
        "Iberdrola S.A.",
      );
      assert.equal(response.natural_person.primary_membership.corporate_role, "ADMIN");
      assert.equal(response.natural_person.memberships.length, 2);
    });

    test("EnterpriseEmployee base debe tener acceso a rutas pero no a crear eventos", () => {
      const employeeMembership = [
        {
          id: "mem-emp",
          enterprise_id: mockEnterpriseData.id,
          role: "EMPLOYEE",
          department: "Desarrollo",
          status: "ACTIVE",
          enterprise: mockEnterpriseData,
        },
      ];

      const employee = IdentityFactory.createFromUser(mockUserData, employeeMembership);

      assert.ok(employee instanceof EnterpriseEmployee);
      assert.equal(employee.getClassification(), "ENTERPRISE_EMPLOYEE");
      assert.equal(employee.getCorporateRoleTitle(), "Empleado");

      const permissions = employee.getPermissions();
      assert.equal(permissions.can_access_corporate_routes, true);
      assert.equal(permissions.can_switch_dashboard, true);
      assert.equal(permissions.can_create_corporate_events, false);
      assert.equal(permissions.can_manage_enterprise, false);
    });
  });

  describe("4. Validaciones de Entrada (UnifiedAuthSchemas)", () => {
    test("debe aceptar credenciales de email y contraseña", () => {
      const valid = UnifiedAuthSchemas.validateUnifiedLogin({
        email: "Usuario@Dominio.Com",
        password: "MyPassword123",
      });

      assert.ok(valid.success);
      assert.equal(valid.data.email, "usuario@dominio.com");
      assert.equal(valid.data.password, "MyPassword123");
      assert.equal(valid.data.auth_type, "auto");
    });

    test("debe aceptar token social de Google (id_token)", () => {
      const validGoogle = UnifiedAuthSchemas.validateUnifiedLogin({
        id_token: "mock-google-jwt-id-token-xyz-1234567890",
      });

      assert.ok(validGoogle.success);
      assert.equal(validGoogle.data.id_token, "mock-google-jwt-id-token-xyz-1234567890");
    });

    test("debe rechazar payload sin credenciales y sin token de Google", () => {
      const invalid = UnifiedAuthSchemas.validateUnifiedLogin({});
      assert.equal(invalid.success, false);
      const msg =
        invalid.error.issues?.[0]?.message ||
        invalid.error.errors?.[0]?.message ||
        "";
      assert.ok(
        msg.includes(
          "Debes proporcionar email y contraseña o un token válido de Google",
        ),
      );
    });
  });
});
