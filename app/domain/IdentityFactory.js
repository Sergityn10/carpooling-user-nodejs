import { EnterpriseUser } from "./EnterpriseUser.js";
import { RegularUser } from "./RegularUser.js";
import { EnterpriseEmployee } from "./EnterpriseEmployee.js";
import { EnterpriseManager } from "./EnterpriseManager.js";
import { EnterpriseAdmin } from "./EnterpriseAdmin.js";

const ROLE_PRIORITY = {
  ADMIN: 3,
  MANAGER: 2,
  EMPLOYEE: 1,
};

function getCorporateRoleTitle(role) {
  switch (role) {
    case "ADMIN":
      return "Administrador de Empresa";
    case "MANAGER":
      return "Gestor de Movilidad";
    case "EMPLOYEE":
    default:
      return "Empleado";
  }
}

/**
 * Factoría unificada de Identidades de Dominio en YouConnext.
 * Resuelve e instancia polimórficamente la entidad adecuada
 * (Persona Jurídica vs. Persona Física, y rol corporativo del empleado).
 */
export class IdentityFactory {
  /**
   * Crea una instancia de Persona Jurídica (Organización / Empresa).
   * @param {object} enterpriseData 
   * @returns {EnterpriseUser}
   */
  static createFromEnterprise(enterpriseData) {
    return new EnterpriseUser(enterpriseData);
  }

  /**
   * Crea una instancia de Persona Física, resolviendo si es un Usuario Regular,
   * un Empleado, un Gestor de Movilidad o un Administrador de Empresa.
   * @param {object} userData 
   * @param {Array<object>} activeMemberships 
   * @returns {RegularUser | EnterpriseEmployee | EnterpriseManager | EnterpriseAdmin}
   */
  static createFromUser(userData, activeMemberships = []) {
    if (!activeMemberships || activeMemberships.length === 0) {
      return new RegularUser(userData);
    }

    // Ordenar membresías por jerarquía de rol (ADMIN > MANAGER > EMPLOYEE)
    const sortedMemberships = [...activeMemberships].sort((a, b) => {
      const weightA = ROLE_PRIORITY[a.role?.toUpperCase()] || 0;
      const weightB = ROLE_PRIORITY[b.role?.toUpperCase()] || 0;
      return weightB - weightA;
    });

    const primaryMembership = sortedMemberships[0];

    const formattedAllMemberships = sortedMemberships.map((m) => ({
      enterprise_id: m.enterprise_id,
      enterprise_name: m.enterprise?.name ?? null,
      corporate_role: m.role,
      corporate_role_title: getCorporateRoleTitle(m.role),
      department: m.department ?? null,
      employee_code: m.employee_code ?? null,
      joined_at: m.joined_at,
    }));

    const primaryRole = (primaryMembership.role || "EMPLOYEE").toUpperCase();

    let instance;
    switch (primaryRole) {
      case "ADMIN":
        instance = new EnterpriseAdmin(userData, primaryMembership);
        break;
      case "MANAGER":
        instance = new EnterpriseManager(userData, primaryMembership);
        break;
      case "EMPLOYEE":
      default:
        instance = new EnterpriseEmployee(userData, primaryMembership);
        break;
    }

    // Adjuntar lista completa de membresías formateadas
    instance.allMemberships = formattedAllMemberships;
    return instance;
  }
}
