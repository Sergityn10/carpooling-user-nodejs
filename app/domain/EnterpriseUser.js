import { BaseUser } from "./BaseUser.js";

/**
 * Entidad de Dominio para Organizaciones / Empresas en YouConnext.
 * Hereda de BaseUser e incorpora atributos corporativos, eventos y lógica de negocio.
 */
export class EnterpriseUser extends BaseUser {
  constructor(data = {}) {
    super({
      ...data,
      role: "enterprise",
      role_id: data.role_id ?? 3,
    });

    this.name = data.name;
    this.description = data.description ?? null;
    this.location = data.location ?? null;
    this.phone = data.phone ?? null;
    this.cif = data.cif ?? null;
    this.website = data.website ?? null;
    this.logo = data.logo ?? null;
    this.contactPerson = data.contact_person ?? null;
    this.sector = data.sector ?? null;
    this.employeeCount = data.employee_count ?? null;
    this.addressLine1 = data.address_line1 ?? null;
    this.addressLine2 = data.address_line2 ?? null;
    this.city = data.city ?? null;
    this.province = data.province ?? null;
    this.postalCode = data.postal_code ?? null;
    this.country = data.country ?? "ES";
    this.verified = Boolean(data.verified);
    this.onboarding_ended = Boolean(data.onboarding_ended);
    this.serviceEvents = data.serviceEvents ?? [];
    this.platformEvents = data.platformEvents ?? [];
  }

  get isOnboardingEnded() {
    return Boolean(this.onboarding_ended);
  }

  /**
   * Genera el payload específico para sesiones de organizaciones.
   * @returns {object}
   */
  generateJwtPayload() {
    return {
      enterprise_id: this.id,
      email: this.email,
      role: "enterprise",
      type: "enterprise",
    };
  }

  /**
   * Comprueba si la organización tiene permisos activos para publicar eventos.
   * @returns {boolean}
   */
  canCreateEvents() {
    return this.canAuthenticate();
  }

  getIdentityType() {
    return "LEGAL_ENTITY";
  }

  getClassification() {
    return "ORGANIZATION";
  }

  getInitialMode() {
    return "enterprise";
  }

  getPermissions() {
    return {
      can_access_personal_mode: false,
      can_access_corporate_mode: true,
      can_switch_dashboard: false,
      can_manage_enterprise: true,
      can_invite_members: true,
      can_remove_members: true,
      can_change_member_role: true,
      can_create_corporate_events: true,
      can_view_cae_metrics: true,
      can_access_corporate_routes: true,
    };
  }

  toUnifiedAuthResponse({ token, refreshToken = null }) {
    return {
      status: "Success",
      message: "Autenticación exitosa",
      token,
      refreshToken,
      identity: {
        type: "LEGAL_ENTITY",
        classification: "ORGANIZATION",
        user_id: this.id,
        email: this.email,
        display_name: this.name,
        avatar: this.logo ?? null,
        system_role: "enterprise",
      },
      legal_entity: {
        enterprise_id: this.id,
        cif: this.cif ?? null,
        name: this.name,
        sector: this.sector ?? null,
        location: this.location ?? null,
        description: this.description ?? null,
        phone: this.phone ?? null,
        website: this.website ?? null,
        verified: this.verified,
        onboarding_ended: this.onboarding_ended,
      },
      natural_person: null,
      permissions: this.getPermissions(),
      initial_mode: "enterprise",
    };
  }

  /**
   * Serialización segura para la propia organización o terceros autorizados.
   * Nunca expone el hash de contraseña.
   * @returns {object}
   */
  toSafeJSON() {
    return {
      id: this.id,
      name: this.name,
      email: this.email,
      description: this.description,
      location: this.location,
      phone: this.phone,
      cif: this.cif,
      website: this.website,
      logo: this.logo,
      contactPerson: this.contactPerson,
      sector: this.sector,
      employeeCount: this.employeeCount,
      addressLine1: this.addressLine1,
      city: this.city,
      province: this.province,
      postalCode: this.postalCode,
      country: this.country,
      verified: this.verified,
      onboarding_ended: this.onboarding_ended,
      isActive: this.isActive,
      role: "enterprise",
      createdAt: this.createdAt,
    };
  }

  /**
   * Serialización detallada para vistas y auditoría en la Web de Administración.
   * @returns {object}
   */
  toAdminDetailJSON() {
    return {
      ...this.toSafeJSON(),
      isDeleted: this.isDeleted,
      deletedAt: this.deletedAt,
      serviceEventsCount: this.serviceEvents?.length ?? 0,
      platformEventsCount: this.platformEvents?.length ?? 0,
      updatedAt: this.updatedAt,
    };
  }
}
