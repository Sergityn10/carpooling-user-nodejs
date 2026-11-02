import bcrypt from "bcrypt";
import jsonwebtoken from "jsonwebtoken";
import { PRIVATE_KEY, JWT_ALGORITHM } from "../utils/jwtKeys.js";

/**
 * Clase base de Dominio para entidades de usuario y cuentas en YouConnext.
 * Proporciona lógica común de autenticación, verificación de contraseñas,
 * generación de JWT, borrado lógico y control de roles.
 */
export class BaseUser {
  constructor({
    id,
    email,
    password,
    role_id,
    role,
    is_active = true,
    is_deleted = false,
    deleted_at = null,
    created_at = new Date(),
    updated_at = new Date(),
  }) {
    this.id = id;
    this.email = email;
    this.password = password;
    this.roleId = role_id;
    this.roleName = typeof role === "object" ? role?.name : role;
    this.isActive = Boolean(is_active);
    this.isDeleted = Boolean(is_deleted);
    this.deletedAt = deleted_at ? new Date(deleted_at) : null;
    this.createdAt = created_at ? new Date(created_at) : new Date();
    this.updatedAt = updated_at ? new Date(updated_at) : new Date();
  }

  /**
   * Verifica la contraseña del usuario contra el hash almacenado en base de datos.
   * @param {string} candidatePassword - Contraseña en texto plano a verificar.
   * @returns {Promise<boolean>}
   */
  async verifyPassword(candidatePassword) {
    if (!this.password || !candidatePassword) return false;
    return bcrypt.compare(candidatePassword, this.password);
  }

  /**
   * Hashea una contraseña usando bcrypt con 10 rondas de salt por defecto.
   * @param {string} plainPassword 
   * @param {number} saltRounds 
   * @returns {Promise<string>}
   */
  static async hashPassword(plainPassword, saltRounds = 10) {
    return bcrypt.hash(plainPassword, saltRounds);
  }

  /**
   * Genera el payload estándar para el token JWT.
   * @returns {object}
   */
  generateJwtPayload() {
    return {
      userId: this.id,
      email: this.email,
      role: this.roleName || "user",
    };
  }

  /**
   * Emite un token JWT firmado para la sesión.
   * @param {string} expiresIn 
   * @returns {string}
   */
  generateJwtToken(expiresIn = process.env.EXPIRATION_TIME || "15m") {
    return jsonwebtoken.sign(this.generateJwtPayload(), PRIVATE_KEY, {
      expiresIn,
      algorithm: JWT_ALGORITHM,
    });
  }

  isEnterprise() {
    return this.roleName === "enterprise";
  }

  isAdmin() {
    return this.roleName === "admin";
  }

  isRegularUser() {
    return this.roleName === "user";
  }

  canAuthenticate() {
    return this.isActive && !this.isDeleted;
  }

  softDelete() {
    this.isDeleted = true;
    this.deletedAt = new Date();
    this.isActive = false;
  }

  restore() {
    this.isDeleted = false;
    this.deletedAt = null;
    this.isActive = true;
  }

  getIdentityType() {
    return this.isEnterprise() ? "LEGAL_ENTITY" : "NATURAL_PERSON";
  }

  getClassification() {
    if (this.isEnterprise()) return "ORGANIZATION";
    if (this.isAdmin()) return "SUPER_ADMIN";
    return "REGULAR_USER";
  }

  getInitialMode() {
    return this.isEnterprise() ? "enterprise" : "personal";
  }

  getPermissions() {
    const isEnt = this.isEnterprise();
    return {
      can_access_personal_mode: !isEnt,
      can_access_corporate_mode: isEnt,
      can_switch_dashboard: false,
      can_manage_enterprise: isEnt,
      can_invite_members: isEnt,
      can_remove_members: isEnt,
      can_change_member_role: isEnt,
      can_create_corporate_events: isEnt,
      can_view_cae_metrics: isEnt,
      can_access_corporate_routes: isEnt,
    };
  }

  toUnifiedAuthResponse({ token, refreshToken = null }) {
    return {
      status: "Success",
      message: "Autenticación exitosa",
      token,
      refreshToken,
      identity: {
        type: this.getIdentityType(),
        classification: this.getClassification(),
        user_id: this.id,
        email: this.email,
        display_name: this.email,
        avatar: null,
        system_role: this.roleName || "user",
      },
      legal_entity: null,
      natural_person: null,
      permissions: this.getPermissions(),
      initial_mode: this.getInitialMode(),
    };
  }

  toSafeJSON() {
    return {
      id: this.id,
      email: this.email,
      role: this.roleName,
      isActive: this.isActive,
      isDeleted: this.isDeleted,
      createdAt: this.createdAt,
    };
  }
}
