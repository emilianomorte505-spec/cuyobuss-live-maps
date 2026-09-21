import { createServerFn } from "@tanstack/react-start";
import { findStop, type Arrival } from "./stops";

/**
 * Destinos de referencia dentro del Gran San Juan.
 * Google devuelve, para cada destino, qué colectivos salen de la parada y a qué hora.
 * Así no hay que cargar ningún horario a mano.
 */
const DESTINOS = [
  { nombre: "Centro / Plaza 25 de Mayo", lat: -31.5375, lng: -68.5261 },
  { nombre: "Rawson", lat: -31.5814, lng: -68.5322 },
  { nombre: "Chimbas", lat: -31.4989, lng: -68.5346 },
  { nombre: "Santa Lucía", lat: -31.5318, lng: -68.4869 },
  { nombre: "Rivadavia / Marquesado", lat: -31.5389, lng: -68.5866 },
];

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";
const CACHE_MS = 3 * 60 * 1000;
const cache = new Map<string, { at: number; arribos: Arrival[] }>();

type TransitStep = {
  transitDetails?: {
    headsign?: string;
    stopDetails?: {
      departureTime?: string;
      departureStop?: { name?: string; location?: { latLng?: { latitude: number; longitude: number } } };
    };
    transitLine?: { nameShort?: string; name?: string };
  };
};

function metros(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const lat = ((aLat + bLat) / 2) * (Math.PI / 180);
  const x = dLng * Math.cos(lat);
  return Math.sqrt(dLat * dLat + x * x) * R;
}

export const getArrivals = createServerFn({ method: "POST" })
  .inputValidator((input: { stopId: string }) => {
    if (!input || typeof input.stopId !== "string" || input.stopId.length > 60) {
      throw new Error("Parada inválida");
    }
    return { stopId: input.stopId.toLowerCase() };
  })
  .handler(async ({ data }): Promise<{ arribos: Arrival[]; fuente: "google" | "ejemplo" }> => {
    const stop = findStop(data.stopId);
    if (!stop) throw new Error("Parada desconocida");

    const hit = cache.get(stop.code);
    if (hit && Date.now() - hit.at < CACHE_MS) {
      return { arribos: hit.arribos, fuente: "google" };
    }

    const lovableKey = process.env["LOVABLE_API_KEY"];
    const mapsKey = process.env["GOOGLE_MAPS_API_KEY"];
    if (!lovableKey || !mapsKey) {
      return { arribos: stop.arribos, fuente: "ejemplo" };
    }

    const ahora = Date.now();
    const encontrados = new Map<string, Arrival>();

    const consultas = DESTINOS.map(async (destino) => {
      if (metros(stop.lat, stop.lng, destino.lat, destino.lng) < 700) return;
      const res = await fetch(`${GATEWAY_URL}/routes/directions/v2:computeRoutes`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "X-Connection-Api-Key": mapsKey,
          "Content-Type": "application/json",
          "X-Goog-FieldMask": "routes.legs.steps.transitDetails",
        },
        body: JSON.stringify({
          origin: { location: { latLng: { latitude: stop.lat, longitude: stop.lng } } },
          destination: { location: { latLng: { latitude: destino.lat, longitude: destino.lng } } },
          travelMode: "TRANSIT",
          computeAlternativeRoutes: true,
          languageCode: "es-AR",
          departureTime: new Date(ahora + 60_000).toISOString(),
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        console.error(`Google Routes falló [${res.status}]: ${body}`);
        return;
      }

      const json = (await res.json()) as {
        routes?: { legs?: { steps?: TransitStep[] }[] }[];
      };

      for (const route of json.routes ?? []) {
        for (const leg of route.legs ?? []) {
          for (const step of leg.steps ?? []) {
            const td = step.transitDetails;
            const salida = td?.stopDetails?.departureStop?.location?.latLng;
            const hora = td?.stopDetails?.departureTime;
            if (!td || !salida || !hora) continue;
            // Solo arribos que salen de esta parada (o de una a menos de 300 m).
            if (metros(stop.lat, stop.lng, salida.latitude, salida.longitude) > 300) continue;

            const minutos = Math.round((new Date(hora).getTime() - ahora) / 60000);
            if (minutos < 0 || minutos > 90) continue;

            const linea = td.transitLine?.nameShort ?? td.transitLine?.name ?? "—";
            const dest = td.headsign ?? destino.nombre;
            const clave = `${linea}|${dest}`;
            const previo = encontrados.get(clave);
            if (!previo || previo.minutos > minutos) {
              encontrados.set(clave, { linea, destino: dest, minutos, estado: "A tiempo" });
            }
          }
        }
      }
    });

    await Promise.allSettled(consultas);

    const arribos = [...encontrados.values()].sort((a, b) => a.minutos - b.minutos).slice(0, 6);
    if (arribos.length === 0) {
      return { arribos: hit?.arribos ?? stop.arribos, fuente: hit ? "google" : "ejemplo" };
    }

    cache.set(stop.code, { at: ahora, arribos });
    return { arribos, fuente: "google" };
  });
