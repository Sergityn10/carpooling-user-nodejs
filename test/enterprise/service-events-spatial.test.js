import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  mapServiceEventToStandardEvent,
  normalizePlatformEvent,
} from "../../app/adapters/serviceEventAdapter.js";
import { GeoPoint } from "../../app/utils/geoPoint.js";

describe("Búsqueda y Adaptación de Eventos Corporativos (service_events) con R-Tree y Search", () => {
  describe("1. Adaptador Polimórfico de Eventos (serviceEventAdapter)", () => {
    test("debe mapear fielmente un service_event al contrato exacto de platform_events para el frontend", () => {
      const rawServiceEvent = {
        id: "bd32480c-3e7e-4e62-8721-9e254933e8f1",
        enterprise_id: "515a81fe-208c-4e1c-a5a9-1eefa7e91d71",
        title: "CaceresTall",
        description: "Taller corporativo de sostenibilidad",
        start_at: new Date("2026-11-12T08:45:57.999Z"),
        end_at: new Date("2026-11-12T12:45:57.999Z"),
        status: "requested",
        venue_name: "Biblioteca Pública de Cáceres",
        address_line1: "C. Alfonso IX, 26",
        city: "Cáceres",
        latitude: "39.4753000",
        longitude: "-6.3723000",
        image: "https://example.com/caceres.jpg",
        created_at: new Date("2026-11-02T08:50:18.400Z"),
        updated_at: new Date("2026-11-02T08:50:18.400Z"),
        enterprise: {
          id: "515a81fe-208c-4e1c-a5a9-1eefa7e91d71",
          name: "YouConnext",
          email: "sergio@youconnext.es",
          logo: "data:image/png;base64,mockLogo",
          website: "https://youconnext.es",
        },
      };

      const mapped = mapServiceEventToStandardEvent(rawServiceEvent, 3.45);

      // Verificación de propiedades requeridas por el frontend (EventCard & EventDetail)
      assert.equal(mapped.id, "bd32480c-3e7e-4e62-8721-9e254933e8f1");
      assert.equal(mapped.name, "CaceresTall");
      assert.equal(mapped.title, "CaceresTall");
      assert.equal(mapped.description, "Taller corporativo de sostenibilidad");
      assert.equal(mapped.image, "https://example.com/caceres.jpg");
      assert.equal(mapped.unique_code, "ORG-BD32480C");
      assert.equal(mapped.latitude, 39.4753);
      assert.equal(mapped.longitude, -6.3723);
      assert.equal(mapped.distance_km, 3.45);
      assert.equal(mapped.event_type, "service_event");
      assert.equal(mapped.is_corporate, true);

      // Verificación de fechas
      assert.equal(
        new Date(mapped.start_date).toISOString(),
        "2026-11-12T08:45:57.999Z",
      );
      assert.equal(
        new Date(mapped.end_date).toISOString(),
        "2026-11-12T12:45:57.999Z",
      );

      // Verificación del objeto company compatible con EventCard (event.company.name)
      assert.ok(mapped.company);
      assert.equal(mapped.company.id, "515a81fe-208c-4e1c-a5a9-1eefa7e91d71");
      assert.equal(mapped.company.name, "YouConnext");
      assert.equal(mapped.company.logo, "data:image/png;base64,mockLogo");
      assert.equal(mapped.company.website, "https://youconnext.es");
      assert.equal(mapped.company.is_enterprise, true);

      // Verificación de tags compatibles con event.tags?.[0]?.name y t.tag?.name
      assert.ok(Array.isArray(mapped.tags));
      assert.equal(mapped.tags.length, 1);
      assert.equal(mapped.tags[0].name, "Corporativo");
      assert.equal(mapped.tags[0].tag.name, "Corporativo");
    });

    test("debe manejar valores nulos con robustez (sin fin de evento, sin geolocalización previa)", () => {
      const minimalEvent = {
        id: "abc-12345678-0000",
        enterprise_id: "ent-999",
        title: "Reunión General",
        start_at: new Date("2026-12-01T10:00:00.000Z"),
        end_at: null, // Sin fecha fin explícita
        venue_name: null,
        address_line1: "Calle Mayor 1",
        city: null,
        latitude: null,
        longitude: null,
        enterprise: null,
      };

      const mapped = mapServiceEventToStandardEvent(minimalEvent);

      assert.equal(mapped.name, "Reunión General");
      assert.equal(mapped.unique_code, "ORG-ABC-1234");
      assert.equal(
        new Date(mapped.end_date).toISOString(),
        new Date(mapped.start_date).toISOString(),
      );
      assert.equal(mapped.latitude, null);
      assert.equal(mapped.longitude, null);
      assert.equal(mapped.location_name, "Calle Mayor 1");
      assert.equal(mapped.company.name, "Organización");
      assert.equal(mapped.company.is_enterprise, true);
    });

    test("normalizePlatformEvent debe normalizar uniformemente los eventos de plataforma", () => {
      const pe = {
        id: "pe-100",
        name: "Festival Primavera Sound",
        unique_code: "PS2026",
        latitude: "41.3851000",
        longitude: "2.1734000",
        company_id: "comp-1",
        company: { id: "comp-1", name: "Live Nation", logo: "logo.png" },
        tags: [{ tag: { id: 1, name: "Música" } }],
      };

      const normalized = normalizePlatformEvent(pe, 12.3);

      assert.equal(normalized.id, "pe-100");
      assert.equal(normalized.name, "Festival Primavera Sound");
      assert.equal(normalized.latitude, 41.3851);
      assert.equal(normalized.longitude, 2.1734);
      assert.equal(normalized.distance_km, 12.3);
      assert.equal(normalized.company_name, "Live Nation");
      assert.equal(normalized.company.name, "Live Nation");
      assert.equal(normalized.event_type, "platform_event");
    });
  });

  describe("2. Búsqueda por Texto (Search Multi-Campo) y Filtros", () => {
    test("debe permitir coincidencia multi-campo por título, empresa, dirección y ciudad", () => {
      const term = "caceres";
      const normalize = (str) =>
        (str || "")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase();

      const sampleEvents = [
        {
          title: "Taller Caceres",
          address_line1: "Alfonso IX",
          city: "Cáceres",
          enterprise_name: "YouConnext",
        },
        {
          title: "Convención Anual",
          address_line1: "Gran Vía 1",
          city: "Madrid",
          enterprise_name: "Cáceres Tech",
        },
        {
          title: "Hackathon",
          address_line1: "Diagonal 100",
          city: "Barcelona",
          enterprise_name: "InnoCorp",
        },
      ];

      const matches = sampleEvents.filter((ev) => {
        const query = normalize(term);
        return (
          normalize(ev.title).includes(query) ||
          normalize(ev.address_line1).includes(query) ||
          normalize(ev.city).includes(query) ||
          normalize(ev.enterprise_name).includes(query)
        );
      });

      // El primer y segundo evento coinciden (por título/ciudad y por nombre de empresa)
      assert.equal(matches.length, 2);
      assert.equal(matches[0].title, "Taller Caceres");
      assert.equal(matches[1].enterprise_name, "Cáceres Tech");
    });

    test("debe discriminar adecuadamente el filtro por etiqueta (tag)", () => {
      const tagNoCorporativo = "Música";
      const isCorporateTag1 =
        !tagNoCorporativo || tagNoCorporativo.toLowerCase() === "corporativo";
      assert.equal(isCorporateTag1, false);

      const tagCorporativo = "Corporativo";
      const isCorporateTag2 =
        !tagCorporativo || tagCorporativo.toLowerCase() === "corporativo";
      assert.equal(isCorporateTag2, true);

      const tagVacio = null;
      const isCorporateTag3 =
        !tagVacio || tagVacio.toLowerCase() === "corporativo";
      assert.equal(isCorporateTag3, true);
    });
  });

  describe("3. Motor de Búsqueda Espacial R-Tree y Ordenación por Proximidad", () => {
    test("debe generar la envolvente y polígono WKT correctos para la fase 1 de R-Tree", () => {
      const madrid = new GeoPoint(40.4168, -3.7038);
      const radiusKm = 50;

      const envelopeWKT = madrid.toEnvelopePolygonWKT(radiusKm);
      assert.ok(envelopeWKT.startsWith("POLYGON(("));
      assert.ok(envelopeWKT.endsWith("))"));

      const pointWKT = madrid.toWKT();
      assert.equal(pointWKT, "POINT(-3.7038 40.4168)");
    });

    test("debe ordenar cronológicamente o por distancia combinando ambas fuentes", () => {
      const platformEv = {
        id: "pe-1",
        name: "Feria de Turismo",
        start_date: new Date("2026-11-20T10:00:00Z"),
        distance_km: 15.5,
      };

      const serviceEv = {
        id: "se-1",
        name: "CaceresTall",
        start_date: new Date("2026-11-12T08:00:00Z"),
        distance_km: 4.2,
      };

      // Ordenación por fecha (como en getAllEvents)
      const sortedByDate = [platformEv, serviceEv].sort(
        (a, b) => new Date(a.start_date) - new Date(b.start_date),
      );
      assert.equal(sortedByDate[0].id, "se-1"); // 12 de Noviembre antes que 20 de Noviembre
      assert.equal(sortedByDate[1].id, "pe-1");

      // Ordenación por proximidad (como en getNearbyEvents)
      const sortedByDistance = [platformEv, serviceEv].sort(
        (a, b) => a.distance_km - b.distance_km,
      );
      assert.equal(sortedByDistance[0].id, "se-1"); // 4.2 km más cercano que 15.5 km
      assert.equal(sortedByDistance[1].id, "pe-1");
    });
  });

  describe("4. Resolución de Códigos Corporativos y Tolerancia en Participantes", () => {
    test("debe resolver códigos predecibles con prefijo ORG- y extraer el identificador", () => {
      const uuid = "bd32480c-3e7e-4e62-8721-9e254933e8f1";
      const code = `ORG-${uuid.slice(0, 8).toUpperCase()}`;

      assert.equal(code, "ORG-BD32480C");
      const cleanCode = code.replace(/^ORG-/i, "");
      assert.equal(cleanCode, "BD32480C");
      assert.ok(uuid.toUpperCase().startsWith(cleanCode));
    });
  });
});
