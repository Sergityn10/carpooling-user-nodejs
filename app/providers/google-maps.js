import dotenv from "dotenv";
dotenv.config();
// Asegúrate de que esta URL base esté disponible (debe ser importada o definida)
const GEOCODE_URL =
  "https://maps.googleapis.com/maps/api/geocode/json?address=";
const API_KEY = process.env.GOOGLE_MAPS_API_KEY; // Usar tu clave de entorno

function getComponent(addressComponents, type) {
  return (
    (addressComponents ?? []).find((c) => (c?.types ?? []).includes(type)) ??
    null
  );
}

async function geocodeAddressDetails(address) {
  if (!API_KEY) {
    throw new Error("GOOGLE_MAPS_API_KEY no configurada");
  }

  const response = await fetch(
    `${GEOCODE_URL}${encodeURIComponent(address)}&key=${API_KEY}`,
  );
  const data = await response.json();
  if (data.status !== "OK" || data.results.length === 0) {
    throw new Error(`No se pudo geocodificar la dirección: ${address}`);
  }

  const result = data.results[0];
  const { lat, lng } = result.geometry.location;
  const addressComponents = result.address_components ?? [];

  const locality = getComponent(addressComponents, "locality")?.long_name;
  const postalTown = getComponent(addressComponents, "postal_town")?.long_name;
  const admin2 = getComponent(
    addressComponents,
    "administrative_area_level_2",
  )?.long_name;
  const city = locality ?? postalTown ?? admin2 ?? null;

  const province =
    getComponent(addressComponents, "administrative_area_level_1")?.long_name ??
    null;
  const postal_code =
    getComponent(addressComponents, "postal_code")?.long_name ?? null;
  const country =
    getComponent(addressComponents, "country")?.short_name ?? null;

  return {
    lat,
    lng,
    formatted_address: result.formatted_address ?? null,
    place_id: result.place_id ?? null,
    city,
    province,
    postal_code,
    country,
  };
}

async function geocodeAddress(address) {
  const details = await geocodeAddressDetails(address);
  return { lat: details.lat, lng: details.lng };
}

export const GoogleMapsProvider = {
  geocodeAddress,
  geocodeAddressDetails,
};
