import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { GeoPoint } from "../../app/utils/geoPoint.js";

describe("GeoPoint Class", () => {
  test("debería instanciar correctamente con coordenadas válidas", () => {
    const point = new GeoPoint(40.4168, -3.7038);
    assert.equal(point.lat, 40.4168);
    assert.equal(point.lng, -3.7038);
  });

  test("debería parsear coordenadas en formato string", () => {
    const point = new GeoPoint("40.4168", "-3.7038");
    assert.equal(point.lat, 40.4168);
    assert.equal(point.lng, -3.7038);
  });

  test("debería rechazar latitudes fuera del rango [-90, 90]", () => {
    assert.throws(() => new GeoPoint(91, 0), /Latitud inválida/);
    assert.throws(() => new GeoPoint(-90.5, 0), /Latitud inválida/);
    assert.throws(() => new GeoPoint("invalido", 0), /Latitud inválida/);
  });

  test("debería rechazar longitudes fuera del rango [-180, 180]", () => {
    assert.throws(() => new GeoPoint(0, 181), /Longitud inválida/);
    assert.throws(() => new GeoPoint(0, -180.1), /Longitud inválida/);
    assert.throws(() => new GeoPoint(0, "invalido"), /Longitud inválida/);
  });

  test("toWKT() debería generar formato estándar OGC POINT(longitude latitude)", () => {
    const point = new GeoPoint(40.4168, -3.7038);
    assert.equal(point.toWKT(), "POINT(-3.7038 40.4168)");
  });

  test("toGeoJSON() debería devolver coordenadas [longitude, latitude]", () => {
    const point = new GeoPoint(40.4168, -3.7038);
    assert.deepEqual(point.toGeoJSON(), {
      type: "Point",
      coordinates: [-3.7038, 40.4168],
    });
  });

  test("getBoundingBox() debería calcular límites correctos y sin desbordar", () => {
    const point = new GeoPoint(40.4168, -3.7038);
    const bbox = point.getBoundingBox(10); // 10 km

    assert.ok(bbox.minLat < point.lat);
    assert.ok(bbox.maxLat > point.lat);
    assert.ok(bbox.minLng < point.lng);
    assert.ok(bbox.maxLng > point.lng);

    assert.ok(bbox.minLat >= -90);
    assert.ok(bbox.maxLat <= 90);
    assert.ok(bbox.minLng >= -180);
    assert.ok(bbox.maxLng <= 180);
  });

  test("toEnvelopePolygonWKT() debería generar un polígono cerrado y en formato OGC lon-lat", () => {
    const point = new GeoPoint(40.4168, -3.7038);
    const wkt = point.toEnvelopePolygonWKT(10);

    assert.ok(wkt.startsWith("POLYGON(("));
    assert.ok(wkt.endsWith("))"));

    // Comprobar que el polígono tiene 5 vértices y el primero coincide con el último (anillo cerrado)
    const coordsStr = wkt.replace("POLYGON((", "").replace("))", "");
    const vertices = coordsStr.split(", ");
    assert.equal(vertices.length, 5);
    assert.equal(vertices[0], vertices[4], "El primer y último vértice deben coincidir para cerrar el polígono");
  });

  test("distanceTo() calcula correctamente distancias Haversine", () => {
    const madrid = new GeoPoint(40.4168, -3.7038);
    const toledo = new GeoPoint(39.8628, -4.0273);

    const dist = madrid.distanceTo(toledo);
    // Distancia Madrid - Toledo es de aproximadamente 67-72 km en línea recta
    assert.ok(dist > 65 && dist < 75, `Distancia calculada: ${dist} km`);
  });
});
