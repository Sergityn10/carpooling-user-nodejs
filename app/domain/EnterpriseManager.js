import { EnterpriseEmployee } from "./EnterpriseEmployee.js";

/**
 * Entidad de dominio para Gestores / Coordinadores de Movilidad de una organización.
 * Hereda de EnterpriseEmployee y añade capacidades operativas de eventos y métricas CAE.
 */
export class EnterpriseManager extends EnterpriseEmployee {
  constructor(userData = {}, membershipData = {}) {
    super(userData, {
      ...membershipData,
      role: membershipData.role || "MANAGER",
    });
  }

  canCreateCorporateEvents() {
    return this.isCorporateActive();
  }

  canViewCAEMetrics() {
    return this.isCorporateActive();
  }

  canModerateEventChats() {
    return this.isCorporateActive();
  }

  getClassification() {
    return "ENTERPRISE_MANAGER";
  }

  getPermissions() {
    return {
      ...super.getPermissions(),
      can_create_corporate_events: this.canCreateCorporateEvents(),
      can_view_cae_metrics: this.canViewCAEMetrics(),
    };
  }
}
