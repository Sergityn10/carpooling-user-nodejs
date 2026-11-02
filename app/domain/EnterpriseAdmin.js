import { EnterpriseManager } from "./EnterpriseManager.js";

/**
 * Entidad de dominio para Administradores de la Organización.
 * Hereda de EnterpriseManager y posee control total sobre miembros, roles y ajustes corporativos.
 */
export class EnterpriseAdmin extends EnterpriseManager {
  constructor(userData = {}, membershipData = {}) {
    super(userData, {
      ...membershipData,
      role: membershipData.role || "ADMIN",
    });
  }

  canInviteMembers() {
    return this.isCorporateActive();
  }

  canRemoveMembers() {
    return this.isCorporateActive();
  }

  canChangeMemberRole() {
    return this.isCorporateActive();
  }

  canEditEnterpriseProfile() {
    return this.isCorporateActive();
  }

  getClassification() {
    return "ENTERPRISE_ADMIN";
  }

  getPermissions() {
    return {
      ...super.getPermissions(),
      can_manage_enterprise: this.canEditEnterpriseProfile(),
      can_invite_members: this.canInviteMembers(),
      can_remove_members: this.canRemoveMembers(),
      can_change_member_role: this.canChangeMemberRole(),
    };
  }
}
