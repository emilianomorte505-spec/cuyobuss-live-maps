import { createServerFn } from "@tanstack/react-start";

const SAN_JUAN = { lat: -31.5375, lng: -68.5364 };

/** Busca las coordenadas de una esquina de San Juan. Si falla, devuelve el centro. */
export const ubicarEsquina = createServerFn({ method: "POST" })
  .inputValidator((input: { texto: string }) => ({ texto: String(input?.texto ?? "").slice(0, 120).trim() }))
  .handler(async ({ data }) => {
    const lovable = process.env["LOVABLE_API_KEY"];
    const maps = process.env["GOOGLE_MAPS_API_KEY"];
    if (!data.texto || !lovable || !maps) return { ...SAN_JUAN, exacta: false };
    try {
      const q = encodeURIComponent(`${data.texto.replace(/-/g, " ")}, San Juan, Argentina`);
      const r = await fetch(`https://connector-gateway.lovable.dev/google_maps/maps/api/geocode/json?address=${q}&region=ar`, {
        headers: { Authorization: `Bearer ${lovable}`, "X-Connection-Api-Key": maps },
      });
      if (!r.ok) return { ...SAN_JUAN, exacta: false };
      const j = (await r.json()) as { results?: { geometry: { location: { lat: number; lng: number } } }[] };
      const loc = j.results?.[0]?.geometry.location;
      return loc ? { lat: loc.lat, lng: loc.lng, exacta: true } : { ...SAN_JUAN, exacta: false };
    } catch {
      return { ...SAN_JUAN, exacta: false };
    }
  });
