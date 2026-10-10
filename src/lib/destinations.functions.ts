import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getStop } from "./arrivals.functions";
import { routesFromCurrentStop, type GoogleTransitRoute, type DestinationRoute } from "./destination-routes";

type DestinationResult = {
  opciones: DestinationRoute[];
  origen: string;
  destino: string;
  mensaje: string | null;
};
const cache = new Map<string, { at: number; result: DestinationResult }>();

export const buscarDestino = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { stopId: string; destino: string }) => z.object({
    stopId: z.string().trim().min(1).max(80),
    destino: z.string().trim().min(3).max(160),
  }).parse(input))
  .handler(async ({ data, context }): Promise<DestinationResult> => {
    const stop = await getStop({ data: { stopId: data.stopId } });
    if (!stop) throw new Error("No encontramos esta parada.");
    const destino = `${data.destino}, San Juan, Argentina`;
    const key = `${stop.code}|${destino.toLocaleLowerCase()}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < 180_000) return hit.result;
    const lovable = process.env["LOVABLE_API_KEY"];
    const maps = process.env["GOOGLE_MAPS_API_KEY"];
    if (!lovable || !maps) throw new Error("La búsqueda de destinos no está disponible todavía.");
    const headers = { Authorization: `Bearer ${lovable}`, "X-Connection-Api-Key": maps, "Content-Type": "application/json" };
    const gateway = "https://connector-gateway.lovable.dev/google_maps";

    async function readResponse(response: Response) {
      if (response.ok) return;
      const body = await response.text();
      console.error(`Búsqueda de destino Google Maps [${response.status}]: ${body}`);
      if (response.status === 403) {
        let reason = "";
        try { reason = (JSON.parse(body).error?.details ?? []).find((detail: { reason?: string }) => detail.reason)?.reason ?? ""; } catch {}
        if (reason === "API_KEY_HTTP_REFERRER_BLOCKED") throw new Error("Google Maps bloqueó la consulta: el administrador debe revisar las restricciones de la clave del servidor.");
        if (reason === "API_KEY_SERVICE_BLOCKED") throw new Error("Google Maps bloqueó la consulta: el administrador debe habilitar la búsqueda de recorridos en la clave del servidor.");
        throw new Error("Google Maps no autorizó la búsqueda. El administrador debe revisar la conexión.");
      }
      throw new Error(`Google Maps no pudo consultar el destino (${response.status}). Probá más tarde.`);
    }

    let origin = { lat: stop.lat, lng: stop.lng };
    if (origin.lat === 0 && origin.lng === 0) {
      const response = await fetch(`${gateway}/maps/api/geocode/json?address=${encodeURIComponent(`${stop.nombre}, ${stop.zona}, Argentina`)}&region=ar`, {
        headers, signal: AbortSignal.timeout(12_000),
      });
      await readResponse(response);
      const json = await response.json() as { status?: string; results?: { geometry?: { location?: { lat: number; lng: number } } }[] };
      const found = json.results?.[0]?.geometry?.location;
      if (json.status !== "OK" || !found) throw new Error("No pudimos ubicar esta parada para buscar un recorrido. Probá otra parada.");
      origin = found;
    }
    let allowed = stop.lineas.map((line) => line.linea);
    if (allowed.length === 0 && stop.planilla) {
      const { data: rows, error } = await context.supabase.from("horarios_parada").select("linea").eq("parada_slug", stop.planilla);
      if (error) throw new Error("No pudimos consultar las líneas de esta parada.");
      allowed = (rows ?? []).map((row) => row.linea);
    }
    if (allowed.length === 0) throw new Error("Todavía no tenemos las líneas de esta parada.");
    const response = await fetch(`${gateway}/routes/directions/v2:computeRoutes`, {
      method: "POST", headers: { ...headers, "X-Goog-FieldMask": "routes.duration,routes.legs.steps.transitDetails" },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
        destination: { address: destino },
        travelMode: "TRANSIT", computeAlternativeRoutes: true,
        languageCode: "es-AR", departureTime: new Date(Date.now() + 60_000).toISOString(),
      }),
    });
    await readResponse(response);
    const json = await response.json() as { routes?: GoogleTransitRoute[] };
    const opciones = routesFromCurrentStop(json.routes ?? [], origin, allowed);
    const result = {
      opciones, origen: `${origin.lat},${origin.lng}`, destino,
      mensaje: opciones.length ? null : "Google Maps no encontró un recorrido desde este poste a ese destino en este momento. No significa que no exista una línea.",
    };
    if (cache.size >= 100) cache.clear();
    cache.set(key, { at: Date.now(), result });
    return result;
  });