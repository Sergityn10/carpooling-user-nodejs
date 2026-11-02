import { EnterpriseEmployee } from "./EnterpriseEmployee.js";
import { EnterpriseManager } from "./EnterpriseManager.js";
import { EnterpriseAdmin } from "./EnterpriseAdmin.js";

/**
 * Factoría polimórfica para instanciar la clase de dominio adecuada
 * según el rol interno asignado en la organización.
 */
export class EnterpriseMemberFactory {
  static create(userData = {}, membershipData = {}) {
    const role = (membershipData.role || "EMPLOYEE").toUpperCase();

    switch (role) {
      case "ADMIN":
        return new EnterpriseAdmin(userData, membershipData);
      case "MANAGER":
        return new EnterpriseManager(userData, membershipData);
      case "EMPLOYEE":
      default:
        return new EnterpriseEmployee(userData, membershipData);
    }
  }
}
