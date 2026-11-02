import { BaseUser } from "./BaseUser.js";

/**
 * Entidad de dominio para usuarios particulares de la plataforma (viajeros / conductores).
 * Hereda de BaseUser e incorpora datos personales, vehículos y rutinas de movilidad.
 */
export class RegularUser extends BaseUser {
  constructor(data = {}) {
    super({
      ...data,
      role: data.role || "user",
      role_id: data.role_id ?? 1,
    });

    this.name = data.name ?? null;
    this.surname = data.surname ?? null;
    this.dni = data.dni ?? null;
    this.phone = data.phone ?? null;
    this.birthDate = data.fecha_nacimiento ?? null;
    this.gender = data.genero ?? null;
    this.city = data.ciudad ?? null;
    this.province = data.provincia ?? null;
    this.profileImage = data.img_perfil ?? null;
    this.aboutMe = data.about_me ?? null;
    this.stripeAccount = data.stripe_account ?? null;
    this.cars = data.cars ?? [];
    this.routines = data.routines ?? [];
  }

  get fullName() {
    return [this.name, this.surname].filter(Boolean).join(" ");
  }

  getIdentityType() {
    return "NATURAL_PERSON";
  }

  getClassification() {
    return this.isAdmin() ? "SUPER_ADMIN" : "REGULAR_USER";
  }

  getInitialMode() {
    return "personal";
  }

  getPermissions() {
    return {
      can_access_personal_mode: true,
      can_access_corporate_mode: false,
      can_switch_dashboard: false,
      can_manage_enterprise: false,
      can_invite_members: false,
      can_remove_members: false,
      can_change_member_role: false,
      can_create_corporate_events: false,
      can_view_cae_metrics: false,
      can_access_corporate_routes: false,
    };
  }

  toUnifiedAuthResponse({ token, refreshToken = null }) {
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
        is_corporate_member: false,
        primary_membership: null,
        memberships: [],
      },
      permissions: this.getPermissions(),
      initial_mode: this.getInitialMode(),
    };
  }

  /**
   * Serialización segura para la vista del propio usuario.
   */
  toSafeJSON() {
    return {
      id: this.id,
      email: this.email,
      name: this.name,
      surname: this.surname,
      fullName: this.fullName,
      phone: this.phone,
      city: this.city,
      province: this.province,
      profileImage: this.profileImage,
      aboutMe: this.aboutMe,
      role: this.roleName,
      isActive: this.isActive,
      isDeleted: this.isDeleted,
      createdAt: this.createdAt,
    };
  }
}
