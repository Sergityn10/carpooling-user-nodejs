const EARTH_RADIUS_KM = 6371;

export class GeoPoint {
  /**
   * @param {number|string} latitude
   * @param {number|string} longitude
   */
  constructor(latitude, longitude) {
    const lat = typeof latitude === "string" ? parseFloat(latitude) : Number(latitude);
    const lng = typeof longitude === "string" ? parseFloat(longitude) : Number(longitude);

    if (Number.isNaN(lat) || lat < -90 || lat > 90) {
      throw new Error(`Latitud inválida: ${latitude}. Debe estar entre -90 y 90.`);
    }

    if (Number.isNaN(lng) || lng < -180 || lng > 180) {
      throw new Error(`Longitud inválida: ${longitude}. Debe estar entre -180 y 180.`);
    }

    this.lat = lat;
    this.lng = lng;
  }

  /**
   * Genera el texto en formato WKT (Well-Known Text) para MySQL GIS: POINT(longitude latitude)
   * @returns {string}
   */
  toWKT() {
    return `POINT(${this.lng} ${this.lat})`;
  }

  /**
   * Genera un Bounding Box (caja delimitadora de coordenadas) según un radio en kilómetros.
   * Útil para filtros indexados antes de cálculos trigonométricos.
   * @param {number} radiusKm
   * @returns {{minLat: number, maxLat: number, minLng: number, maxLng: number}}
   */
  getBoundingBox(radiusKm) {
    const radius = Math.max(0, radiusKm);
    const latDelta = radius / 111.045; // ~111.045 km por grado de latitud
    const cosLat = Math.cos((this.lat * Math.PI) / 180);
    const lngDelta = cosLat !== 0 ? radius / (111.045 * cosLat) : 0;

    return {
      minLat: Math.max(-90, this.lat - latDelta),
      maxLat: Math.min(90, this.lat + latDelta),
      minLng: Math.max(-180, this.lng - lngDelta),
      maxLng: Math.min(180, this.lng + lngDelta),
    };
  }

  /**
   * Representación GeoJSON estándar
   * @returns {{type: string, coordinates: [number, number]}}
   */
  toGeoJSON() {
    return {
      type: "Point",
      coordinates: [this.lng, this.lat],
    };
  }

  /**
   * Cálculo de distancia Haversine en kilómetros contra otro GeoPoint o coordenadas.
   * @param {GeoPoint|{lat: number, lng: number}} targetPoint
   * @returns {number}
   */
  distanceTo(targetPoint) {
    const targetLat = targetPoint instanceof GeoPoint ? targetPoint.lat : Number(targetPoint.lat);
    const targetLng = targetPoint instanceof GeoPoint ? targetPoint.lng : Number(targetPoint.lng);

    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(targetLat - this.lat);
    const dLng = toRad(targetLng - this.lng);

    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(this.lat)) * Math.cos(toRad(targetLat)) * Math.sin(dLng / 2) ** 2;

    return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}

export default GeoPoint;
