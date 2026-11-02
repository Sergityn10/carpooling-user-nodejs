import { RegularUser } from "./RegularUser.js";

/**
 * Entidad de dominio para empleados de una organización.
 * Hereda de RegularUser (permitiéndole viajar y conducir en YouConnext)
 * y agrega el contexto corporativo de su empresa.
 */
export class EnterpriseEmployee extends RegularUser {
  constructor(userData = {}, membershipData = {}) {
    super(userData);

    this.membershipId = membershipData.id ?? null;
    this.enterpriseId = membershipData.enterprise_id ?? null;
    this.roleInOrg = membershipData.role || "EMPLOYEE";
    this.status = membershipData.status || "ACTIVE";
    this.department = membershipData.department ?? null;
    this.employeeCode = membershipData.employee_code ?? null;
    this.joinedAt = membershipData.joined_at
      ? new Date(membershipData.joined_at)
      : new Date();
    this.enterprise = membershipData.enterprise ?? null;
  }

  isCorporateActive() {
    return this.status === "ACTIVE" && this.canAuthenticate();
  }

  canAccessCorporateRoutes() {
    return this.isCorporateActive();
  }

  getClassification() {
    return "ENTERPRISE_EMPLOYEE";
  }

  getCorporateRoleTitle() {
    switch (this.roleInOrg) {
      case "ADMIN":
        return "Administrador de Empresa";
      case "MANAGER":
        return "Gestor de Movilidad";
      case "EMPLOYEE":
      default:
        return "Empleado";
    }
  }

  getPermissions() {
    return {
      can_access_personal_mode: true,
      can_access_corporate_mode: this.isCorporateActive(),
      can_switch_dashboard: this.isCorporateActive(),
      can_manage_enterprise: false,
      can_invite_members: false,
      can_remove_members: false,
      can_change_member_role: false,
      can_create_corporate_events: false,
      can_view_cae_metrics: false,
      can_access_corporate_routes: this.canAccessCorporateRoutes(),
    };
  }

  toUnifiedAuthResponse({ token, refreshToken = null, allMemberships = [] }) {
    const primaryMembership = {
      enterprise_id: this.enterpriseId,
      enterprise_name: this.enterprise?.name ?? null,
      corporate_role: this.roleInOrg,
      corporate_role_title: this.getCorporateRoleTitle(),
      department: this.department,
      employee_code: this.employeeCode,
      joined_at: this.joinedAt,
    };

    const membershipsList =
      Array.isArray(allMemberships) && allMemberships.length > 0
        ? allMemberships
        : [primaryMembership];

    return {
      status: "Success",
      message: "Autenticación exitosa",
      token,
      refreshToken,
      identity: {
        type: "NATURAL_PERSON",
        classification: this.getClassification(),
        user_id: this.id,
        email: this.email,
        display_name: this.fullName || this.name || "Usuario",
        avatar: this.profileImage ?? null,
        system_role: this.roleName || "user",
      },
      legal_entity: null,
      natural_person: {
        dni: this.dni ?? null,
        first_name: this.name ?? null,
        last_name: this.surname ?? null,
        phone: this.phone ?? null,
        is_driver: Array.isArray(this.cars) && this.cars.length > 0,
        cars_count: Array.isArray(this.cars) ? this.cars.length : 0,
        is_corporate_member: true,
        primary_membership: primaryMembership,
        memberships: membershipsList,
      },
      permissions: this.getPermissions(),
      initial_mode: this.getInitialMode(),
    };
  }

  toCorporateBadge() {
    return {
      userId: this.id,
      fullName: this.fullName,
      email: this.email,
      enterpriseId: this.enterpriseId,
      enterpriseName: this.enterprise?.name ?? null,
      roleInOrg: this.roleInOrg,
      department: this.department,
      employeeCode: this.employeeCode,
      status: this.status,
      joinedAt: this.joinedAt,
    };
  }

  toSafeJSON() {
    return {
      ...super.toSafeJSON(),
      corporate: this.toCorporateBadge(),
    };
  }
}
