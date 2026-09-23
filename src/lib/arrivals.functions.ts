import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { findStop, arribosBase, type Arrival, type Stop } from "./stops";
import { horariosDe, proximosMinutos, type Horarios } from "./timetables";
import type { Database } from "@/integrations/supabase/types";

/** Planillas oficiales cargadas en la base (tabla horarios_parada). */
async function desdeBase(stop: Stop): Promise<Arrival[] | null> {
  if (!stop.planilla) return null;
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) return null;

  const db = createClient<Database>(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
          h.delete("Authorization");
        }
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });

  const { data, error } = await db
    .from("horarios_parada")
    .select("linea, lv, sab, dom")
    .eq("parada_slug", stop.planilla);

  if (error) {
    console.error("horarios_parada", error.message);
    return null;
  }
  if (!data || data.length === 0) return null;

  const etiquetas = new Map(stop.lineas.map((l) => [l.linea, l.destino]));
  const ahora = new Date();

  return data
    .map((fila) => {
      const horarios: Horarios = { lv: fila.lv ?? [], sab: fila.sab ?? [], dom: fila.dom ?? [] };
      const proximos = proximosMinutos(horarios, ahora, 2);
      const proximo = proximos[0];
      return {
        linea: fila.linea,
        destino: etiquetas.get(fila.linea) ?? "Recorrido oficial",
        minutos: proximo ?? -1,
        minutosProximo: proximos[1] ?? -1,
        estado: proximo === undefined ? ("Sin datos" as const) : ("A tiempo" as const),
      };
    })
    .sort((a, b) => (a.minutos < 0 ? 1 : b.minutos < 0 ? -1 : a.minutos - b.minutos));
}

/** Arribos calculados con la planilla oficial de la línea. */
function desdeHorarios(stop: Stop): { arribos: Arrival[]; completo: boolean } {
  let completo = true;
  const arribos = stop.lineas.map<Arrival>((l) => {
    const horarios = horariosDe(stop.code, l.linea);
    const proximos = horarios ? proximosMinutos(horarios, new Date(), 2) : [];
    const proximo = proximos[0];
    if (proximo === undefined) completo = false;
    return {
      linea: l.linea,
      destino: l.destino,
      minutos: proximo ?? -1,
      minutosProximo: proximos[1] ?? -1,
      estado: proximo === undefined ? ("Sin datos" as const) : ("A tiempo" as const),
    };
  });
  return { arribos, completo };
}

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
/** Solo el poste exacto: en una misma calle hay varias paradas distintas. */
const RADIO_POSTE_M = 45;
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

/** "203", "Línea 203", "L203" → "203" para poder comparar con las líneas de la parada. */
function normalizarLinea(valor: string) {
  const soloNumero = valor.match(/\d{1,4}[A-Za-z]?/);
  return (soloNumero ? soloNumero[0] : valor).toUpperCase().trim();
}

/** Mezcla las tarjetas fijas de la parada con los minutos reales encontrados. */
function combinar(stop: Stop, vivos: Map<string, number[]>): Arrival[] {
  return stop.lineas.map((l) => {
    const minutos = vivos.get(normalizarLinea(l.linea))?.sort((a, b) => a - b) ?? [];
    const proximo = minutos[0];
    return {
      linea: l.linea,
      destino: l.destino,
      minutos: proximo ?? -1,
      minutosProximo: minutos[1] ?? -1,
      estado: proximo === undefined ? ("Sin datos" as const) : ("A tiempo" as const),
    };
  });
}

export const getArrivals = createServerFn({ method: "POST" })
  .inputValidator((input: { stopId: string }) => {
    if (!input || typeof input.stopId !== "string" || input.stopId.length > 60) {
      throw new Error("Parada inválida");
    }
    return { stopId: input.stopId.toLowerCase() };
  })
  .handler(
    async ({
      data,
    }): Promise<{ arribos: Arrival[]; fuente: "horario" | "google" | "ejemplo" }> => {
      const stop = findStop(data.stopId);
      if (!stop) throw new Error("Parada desconocida");

      // Primero las planillas oficiales cargadas en la base.
      const deBase = await desdeBase(stop);
      if (deBase && deBase.length > 0) {
        return { arribos: deBase, fuente: "horario" };
      }

      // La planilla oficial de la línea manda: no gasta consultas y nunca cambia de parada.
      const planilla = desdeHorarios(stop);
      if (planilla.completo) {
        return { arribos: planilla.arribos, fuente: "horario" };
      }

    const hit = cache.get(stop.code);
    if (hit && Date.now() - hit.at < CACHE_MS) {
      return { arribos: hit.arribos, fuente: "google" };
    }

    const lovableKey = process.env["LOVABLE_API_KEY"];
    const mapsKey = process.env["GOOGLE_MAPS_API_KEY"];
    if (!lovableKey || !mapsKey) {
      return { arribos: arribosBase(stop), fuente: "ejemplo" };
    }

    const ahora = Date.now();
    const permitidas = new Set(stop.lineas.map((l) => normalizarLinea(l.linea)));
    const vivos = new Map<string, number[]>();

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
            // Solo el poste exacto de esta parada.
            if (metros(stop.lat, stop.lng, salida.latitude, salida.longitude) > RADIO_POSTE_M) continue;

            const minutos = Math.round((new Date(hora).getTime() - ahora) / 60000);
            if (minutos < 0 || minutos > 90) continue;

            const linea = normalizarLinea(td.transitLine?.nameShort ?? td.transitLine?.name ?? "—");
            // Las líneas de la parada están fijas: lo que no sea de ellas no entra.
            if (!permitidas.has(linea)) continue;

            const previos = vivos.get(linea) ?? [];
            if (!previos.includes(minutos)) previos.push(minutos);
            vivos.set(linea, previos);
          }
        }
      }
    });

    await Promise.allSettled(consultas);

    const arribos = combinar(stop, vivos);
    if (vivos.size === 0) {
      return { arribos: hit?.arribos ?? arribos, fuente: hit ? "google" : "ejemplo" };
    }

    cache.set(stop.code, { at: ahora, arribos });
    return { arribos, fuente: "google" };
  });
