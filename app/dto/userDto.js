/**
 * Data Transfer Objects (DTOs) para Usuarios.
 * Implementa Principio de Minimización de Datos (RGPD Art. 5.1.c),
 * Privacidad desde el Diseño y por Defecto (RGPD Art. 25)
 * y Seguridad del Tratamiento (RGPD Art. 32).
 *
 * Capa DTO obligatoria: Elimina irreversiblemente password, dni y stripe_account
 * antes de la serialización JSON hacia el cliente.
 */

export class UserDTO {
  /**
   * Elimina irreversiblemente cualquier campo sensible de un objeto de usuario
   * antes de emitir la serialización JSON.
   * @param {Object|Array} user - Objeto de usuario o array de usuarios
   * @returns {Object|Array|null} Objeto saneado sin password, dni ni stripe_account
   */
  static sanitize(user) {
    if (!user) return null;
    if (Array.isArray(user)) {
      return user.map((u) => UserDTO.sanitize(u));
    }
    const clean = { ...user };
    delete clean.password;
    delete clean.dni;
    delete clean.stripe_account;
    delete clean.stripe_account_id;
    delete clean.stripe_customer_account;
    if (clean.monedero && typeof clean.monedero === "object") {
      clean.monedero = { ...clean.monedero };
      delete clean.monedero.stripe_account_id;
      delete clean.monedero.stripe_customer_account;
    }
    return clean;
  }

  /**
   * Proyección pública: Datos visibles por terceros en búsquedas, trayectos y perfiles públicos.
   * Excluye irreversiblemente cualquier dato privado, credencial o identificador bancario.
   */
  static toPublic(user) {
    if (!user) return null;
    return {
      userId: user.id || user.userId,
      name: user.name ?? null,
      surname: user.surname ?? null,
      img_perfil: user.img_perfil ?? null,
      role: typeof user.role === "string" ? user.role : user.role?.name ?? "user",
      averageRating: user.averageRating ?? 5.0,
      numOpinions: user.numOpinions ?? 0,
      about_me: user.about_me ?? null,
      preferences: user.preferences ?? {},
    };
  }

  /**
   * Proyección privada: Datos accesibles únicamente por el propio usuario autenticado o admin.
   * NUNCA incluye hashes de contraseñas, DNI ni identificadores internos de Stripe (RGPD y PSD2).
   */
  static toPrivate(user) {
    if (!user) return null;
    const sanitizedMonedero = user.monedero
      ? {
          disponible: Boolean(user.monedero.disponible),
          stripe_account: Boolean(user.monedero.stripe_account || user.stripe_account),
          onboarding_completado: Boolean(user.monedero.onboarding_completado),
          charges_enabled: Boolean(user.monedero.charges_enabled),
          transfers_enabled: Boolean(user.monedero.transfers_enabled),
          details_submitted: Boolean(user.monedero.details_submitted),
          wallet_activa: Boolean(user.monedero.wallet_activa),
          wallet_balance: user.monedero.wallet_balance ?? 0,
          config: user.monedero.config ?? undefined,
          mensaje: user.monedero.mensaje ?? undefined,
        }
      : null;

    return {
      userId: user.id || user.userId,
      name: user.name ?? null,
      surname: user.surname ?? null,
      email: user.email ?? null,
      phone: user.phone ?? null,
      img_perfil: user.img_perfil ?? null,
      role: typeof user.role === "string" ? user.role : user.role?.name ?? "user",
      fecha_nacimiento: user.fecha_nacimiento ?? null,
      genero: user.genero ?? null,
      ciudad: user.ciudad ?? null,
      provincia: user.provincia ?? null,
      codigo_postal: user.codigo_postal ?? null,
      direccion: user.direccion ?? null,
      pais: user.pais ?? null,
      averageRating: user.averageRating ?? 5.0,
      numOpinions: user.numOpinions ?? 0,
      myNumOpinions: user.myNumOpinions ?? 0,
      about_me: user.about_me ?? null,
      preferences: user.preferences ?? {},
      wallet_config: user.wallet_config ?? null,
      monedero: sanitizedMonedero,
    };
  }

  /**
   * Proyección administrativa para listado global de usuarios (GET /api/users).
   * Elimina contraseñas, DNIs y cuentas de Stripe para evitar exfiltraciones masivas (HIGH-01).
   */
  static toAdminList(users) {
    if (!Array.isArray(users)) return [];
    return users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name ?? null,
      surname: u.surname ?? null,
      phone: u.phone ?? null,
      role: typeof u.role === "string" ? u.role : u.role?.name ?? "user",
      onboarding_ended: Boolean(u.onboarding_ended),
      created_at: u.created_at ?? null,
      email_verified: Boolean(u.email_verified),
    }));
  }
}

export default UserDTO;
