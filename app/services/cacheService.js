/**
 * Cache Service
 * Provee almacenamiento en caché en memoria con TTL de alta velocidad (<0.1ms)
 * compatible con la interfaz habitual de Redis (get, set, del).
 */

class CacheService {
  constructor() {
    this.store = new Map();
    this.userAccountIndex = new Map(); // stripeAccountId -> userId

    // Timer periódico de barrido de claves expiradas cada 60s
    this.sweepTimer = setInterval(() => {
      this._sweepExpired();
    }, 60000);

    if (typeof this.sweepTimer.unref === "function") {
      this.sweepTimer.unref();
    }
  }

  _sweepExpired() {
    const now = Date.now();
    for (const [key, item] of this.store.entries()) {
      if (item.expiresAt && item.expiresAt <= now) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Obtiene un valor de la caché.
   * @param {string} key
   * @returns {Promise<string | null>}
   */
  async get(key) {
    if (!key) return null;
    const item = this.store.get(key);
    if (!item) return null;

    if (item.expiresAt && item.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }

    return item.value;
  }

  /**
   * Almacena un valor en la caché con tiempo de expiración.
   * Compatible con:
   *  set(key, value, 'EX', 60)
   *  set(key, value, 60)
   * @param {string} key
   * @param {string} value
   * @param {string|number} modeOrTtl
   * @param {number} [ttl]
   * @returns {Promise<'OK'>}
   */
  async set(key, value, modeOrTtl, ttl) {
    if (!key) return "OK";

    let ttlSeconds = 60;
    if (typeof modeOrTtl === "number") {
      ttlSeconds = modeOrTtl;
    } else if (
      typeof modeOrTtl === "string" &&
      modeOrTtl.toUpperCase() === "EX" &&
      typeof ttl === "number"
    ) {
      ttlSeconds = ttl;
    } else if (modeOrTtl === null || modeOrTtl === undefined) {
      ttlSeconds = null;
    }

    const expiresAt =
      typeof ttlSeconds === "number" ? Date.now() + ttlSeconds * 1000 : null;

    this.store.set(key, {
      value: String(value),
      expiresAt,
    });

    return "OK";
  }

  /**
   * Elimina una clave de la caché.
   * @param {string} key
   * @returns {Promise<number>} 1 si se eliminó, 0 si no existía
   */
  async del(key) {
    if (!key) return 0;
    const deleted = this.store.delete(key);
    return deleted ? 1 : 0;
  }

  /**
   * Vincula una cuenta de Stripe Connect a un usuario para permitir
   * invalidación bidireccional por userId o por stripeAccountId.
   * @param {string} stripeAccountId
   * @param {string} userId
   */
  registerUserAccount(stripeAccountId, userId) {
    if (stripeAccountId && userId) {
      this.userAccountIndex.set(stripeAccountId, String(userId));
    }
  }

  /**
   * Invalida la caché del balance de un usuario.
   * Acepta userId, stripeAccountId o ambos.
   * @param {Object} params
   * @param {string} [params.userId]
   * @param {string} [params.stripeAccountId]
   */
  async invalidateBalance({ userId, stripeAccountId } = {}) {
    let targetUserId = userId ? String(userId) : null;

    if (!targetUserId && stripeAccountId) {
      targetUserId = this.userAccountIndex.get(stripeAccountId) ?? null;
    }

    if (targetUserId) {
      await this.del(`stripe:balance:${targetUserId}`);
      console.log(
        `[cacheService] Invalidad caché para stripe:balance:${targetUserId}`,
      );
    }

    if (stripeAccountId) {
      await this.del(`stripe:balance:${stripeAccountId}`);
      console.log(
        `[cacheService] Invalidad caché para stripe:balance:${stripeAccountId}`,
      );
    }
  }

  /**
   * Vacía toda la caché (para tests y reinicios).
   */
  async clear() {
    this.store.clear();
    this.userAccountIndex.clear();
  }

  /**
   * Cierra el timer de limpieza de la caché.
   */
  destroy() {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
  }
}

export const cacheService = new CacheService();
export default cacheService;
