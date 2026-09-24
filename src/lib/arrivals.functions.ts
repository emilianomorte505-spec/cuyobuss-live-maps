import { createServerFn } from "@tanstack/react-start";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { findStop, arribosBase, type Arrival, type Stop } from "./stops";
import { horariosDe, proximosMinutos, desvioRespectoPlanilla, type Horarios } from "./timetables";
import type { Database } from "@/integrations/supabase/types";

/** Un reporte de pasajero vale para el resto de la vuelta del colectivo. */
const VIGENCIA_REPORTE_MIN = 60;
/** Cada persona puede avisar una vez cada tanto, para que nadie distorsione el dato. */
const ESPERA_ENTRE_REPORTES_MIN = 20;

function clientePublico(): SupabaseClient<Database> | null {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) return null;

  return createClient<Database>(url, key, {
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
}

/** Planillas oficiales cargadas en la base (tabla horarios_parada). */
async function horariosDeLaBase(stop: Stop): Promise<Map<string, Horarios> | null> {
  if (!stop.planilla) return null;
  const db = clientePublico();
  if (!db) return null;

  const { data, error } = await db
    .from("horarios_parada")
    .select("linea, lv, sab, dom")
    .eq("parada_slug", stop.planilla);

  if (error) {
    console.error("horarios_parada", error.message);
    return null;
  }
  if (!data || data.length === 0) return null;

  return new Map(
    data.map((fila) => [
      fila.linea,
      { lv: fila.lv ?? [], sab: fila.sab ?? [], dom: fila.dom ?? [] } as Horarios,
    ]),
  );
}

/** Desvíos vigentes avisados por pasajeros a bordo, por línea. */
async function desviosVigentes(): Promise<Map<string, number>> {
  const db = clientePublico();
  const mapa = new Map<string, number>();
  if (!db) return mapa;

  const desde = new Date(Date.now() - VIGENCIA_REPORTE_MIN * 60_000).toISOString();
  const { data, error } = await db
    .from("reportes_viaje")
    .select("linea, desvio_minutos, created_at")
    .gte("created_at", desde)
    .order("created_at", { ascending: false });

  if (error || !data) return mapa;
  for (const fila of data) {
    // El primero de cada línea es el más reciente.
    if (!mapa.has(fila.linea)) mapa.set(fila.linea, fila.desvio_minutos);
  }
  return mapa;
}

/** Suma el atraso o adelanto avisado a bordo a los minutos de la planilla. */
function aplicarDesvios(arribos: Arrival[], desvios: Map<string, number>): Arrival[] {
  if (desvios.size === 0) return arribos;
  return arribos.map((a) => {
    const desvio = desvios.get(a.linea);
    if (desvio === undefined || desvio === 0 || a.minutos < 0) return a;
    return {
      ...a,
      minutos: Math.max(0, a.minutos + desvio),
      minutosProximo: a.minutosProximo < 0 ? -1 : Math.max(0, a.minutosProximo + desvio),
      estado: desvio > 0 ? ("Demorado" as const) : ("Adelantado" as const),
      desvio,
      reportado: true,
    };
  });
}

function arribosDesdeHorarios(
  lineas: { linea: string; destino: string }[],
  tabla: Map<string, Horarios>,
  ahora = new Date(),
): Arrival[] {
  return lineas
    .map<Arrival>((l) => {
      const horarios = tabla.get(l.linea);
      const proximos = horarios ? proximosMinutos(horarios, ahora, 2) : [];
      const proximo = proximos[0];
      return {
        linea: l.linea,
        destino: l.destino,
        minutos: proximo ?? -1,
        minutosProximo: proximos[1] ?? -1,
        estado: proximo === undefined ? ("Sin datos" as const) : ("A tiempo" as const),
      };
    })
    .sort((a, b) => (a.minutos < 0 ? 1 : b.minutos < 0 ? -1 : a.minutos - b.minutos));
}

/**
 * Destinos de referencia dentro del Gran San Juan.
 * Google devuelve, para cada destino, qué colectivos salen de la parada y a qué hora.
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

      const [tablaBase, desvios] = await Promise.all([horariosDeLaBase(stop), desviosVigentes()]);

      // Primero las planillas oficiales cargadas en la base.
      if (tablaBase && tablaBase.size > 0) {
        const etiquetas = new Map(stop.lineas.map((l) => [l.linea, l.destino]));
        const lineas = [...tablaBase.keys()].map((linea) => ({
          linea,
          destino: etiquetas.get(linea) ?? "Recorrido oficial",
        }));
        return { arribos: aplicarDesvios(arribosDesdeHorarios(lineas, tablaBase), desvios), fuente: "horario" };
      }

      // La planilla local de la línea: no gasta consultas y nunca cambia de parada.
      const tablaLocal = new Map<string, Horarios>();
      for (const l of stop.lineas) {
        const h = horariosDe(stop.code, l.linea);
        if (h) tablaLocal.set(l.linea, h);
      }
      if (tablaLocal.size === stop.lineas.length && stop.lineas.length > 0) {
        return {
          arribos: aplicarDesvios(arribosDesdeHorarios(stop.lineas, tablaLocal), desvios),
          fuente: "horario",
        };
      }

      const hit = cache.get(stop.code);
      if (hit && Date.now() - hit.at < CACHE_MS) {
        return { arribos: aplicarDesvios(hit.arribos, desvios), fuente: "google" };
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
        return {
          arribos: aplicarDesvios(hit?.arribos ?? arribos, desvios),
          fuente: hit ? "google" : "ejemplo",
        };
      }

      cache.set(stop.code, { at: ahora, arribos });
      return { arribos: aplicarDesvios(arribos, desvios), fuente: "google" };
    },
  );

/**
 * El pasajero avisa que se subió: comparamos con la planilla y guardamos el
 * atraso o adelanto para que las paradas siguientes lo muestren al instante.
 */
export const reportarViaje = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { stopId: string; linea: string }) => {
    if (!input || typeof input.stopId !== "string" || typeof input.linea !== "string") {
      throw new Error("Datos inválidos");
    }
    return { stopId: input.stopId.toLowerCase().slice(0, 60), linea: input.linea.slice(0, 10) };
  })
  .handler(
    async ({
      data,
      context,
    }): Promise<{ ok: boolean; desvio: number; mensaje: string }> => {
      const stop = findStop(data.stopId);
      if (!stop) throw new Error("Parada desconocida");

      const { supabase, userId } = context;

      const desdeEspera = new Date(Date.now() - ESPERA_ENTRE_REPORTES_MIN * 60_000).toISOString();
      const { data: recientes } = await supabase
        .from("reportes_viaje")
        .select("id")
        .eq("usuario_id", userId)
        .gte("created_at", desdeEspera)
        .limit(1);

      if (recientes && recientes.length > 0) {
        return {
          ok: false,
          desvio: 0,
          mensaje: "Ya avisaste hace un rato. Podés volver a avisar en unos minutos.",
        };
      }

      const tabla = await horariosDeLaBase(stop);
      const horarios = tabla?.get(data.linea) ?? horariosDe(stop.code, data.linea);
      if (!horarios) {
        return { ok: false, desvio: 0, mensaje: "Todavía no tenemos la planilla de esta línea." };
      }

      const resultado = desvioRespectoPlanilla(horarios, new Date());
      if (!resultado) {
        return { ok: false, desvio: 0, mensaje: "No encontramos una pasada cercana en la planilla." };
      }

      const { error } = await supabase.from("reportes_viaje").insert({
        usuario_id: userId,
        linea: data.linea,
        stop_code: stop.code,
        parada_slug: stop.planilla ?? null,
        hora_programada: resultado.programada,
        desvio_minutos: resultado.desvio,
      });

      if (error) {
        console.error("reportes_viaje", error.message);
        return { ok: false, desvio: 0, mensaje: "No pudimos guardar tu aviso, probá de nuevo." };
      }

      const mensaje =
        resultado.desvio > 0
          ? `¡Gracias! Avisamos que la ${data.linea} va ${resultado.desvio} min demorada.`
          : resultado.desvio < 0
            ? `¡Gracias! Avisamos que la ${data.linea} va ${Math.abs(resultado.desvio)} min adelantada.`
            : `¡Gracias! La ${data.linea} va en horario.`;

      return { ok: true, desvio: resultado.desvio, mensaje };
    },
  );
