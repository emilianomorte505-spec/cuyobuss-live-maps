export type TransitRouteStep = {
  transitDetails?: {
    headsign?: string;
    stopDetails?: {
      departureStop?: { name?: string; location?: { latLng?: { latitude: number; longitude: number } } };
      arrivalStop?: { name?: string; location?: { latLng?: { latitude: number; longitude: number } } };
    };
    transitLine?: { nameShort?: string; name?: string };
  };
};

export type DestinationRoute = {
  lineas: string[];
  hacia: string;
  bajarEn: string;
  duracionMin: number | null;
  caminarMetros?: number;
};

/** Max straight-line walk (≈5 cuadras) from the first bus's stop to the destination to skip a transfer. */
export const CAMINATA_MAX_M = 500;

type LatLng = { latitude: number; longitude: number };
function metros(a: LatLng, b: LatLng) {
  const dy = (a.latitude - b.latitude) * Math.PI / 180;
  const dx = (a.longitude - b.longitude) * Math.PI / 180 * Math.cos((a.latitude + b.latitude) * Math.PI / 360);
  return Math.hypot(dx, dy) * 6371000;
}

export type GoogleTransitRoute = { duration?: string; legs?: { endLocation?: { latLng?: LatLng }; steps?: TransitRouteStep[] }[] };

function normalizarLinea(value: string) {
  return (value.match(/\d{1,4}[A-Za-z]?/)?.[0] ?? value).trim().toUpperCase();
}

/** Only journeys whose first bus boards at the current post and belongs to its lines. */
export function routesFromCurrentStop(
  routes: GoogleTransitRoute[],
  origin: { lat: number; lng: number },
  allowedLines: string[],
): DestinationRoute[] {
  const allowed = new Set(allowedLines.map(normalizarLinea));
  const options: DestinationRoute[] = [];
  const seen = new Set<string>();
  for (const route of routes) {
    const transit = (route.legs ?? []).flatMap((leg) => leg.steps ?? [])
      .flatMap((step) => step.transitDetails ? [step.transitDetails] : []);
    const first = transit[0];
    const departure = first?.stopDetails?.departureStop?.location?.latLng;
    if (!first || !departure) continue;
    const dy = (departure.latitude - origin.lat) * Math.PI / 180;
    const dx = (departure.longitude - origin.lng) * Math.PI / 180
      * Math.cos((departure.latitude + origin.lat) * Math.PI / 360);
    if (Math.hypot(dx, dy) * 6371000 > 45) continue;
    let lineas = transit.map((step) => normalizarLinea(step.transitLine?.nameShort ?? step.transitLine?.name ?? ""));
    if (!lineas[0] || !allowed.has(lineas[0]) || lineas.some((line) => !line)) continue;
    let last = transit[transit.length - 1];
    let caminarMetros: number | undefined;
    let directo = false;
    const end = route.legs?.[route.legs.length - 1]?.endLocation?.latLng;
    const firstOff = first.stopDetails?.arrivalStop?.location?.latLng;
    if (lineas.length > 1 && end && firstOff) {
      const m = metros(firstOff, end);
      if (m <= CAMINATA_MAX_M) {
        lineas = [lineas[0]]; last = first; directo = true;
        caminarMetros = Math.round(m / 50) * 50 || 50;
      }
    }
    const bajarEn = last?.stopDetails?.arrivalStop?.name ?? "";
    const identity = `${lineas.join("|")}|${bajarEn}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    const seconds = /^\d+(\.\d+)?s$/.test(route.duration ?? "") ? Number(route.duration?.slice(0, -1)) : NaN;
    options.push({ lineas, hacia: first.headsign ?? "", bajarEn, caminarMetros,
      duracionMin: !directo && Number.isFinite(seconds) ? Math.ceil(seconds / 60) : null });
  }
  return options.sort((a, b) => a.lineas.length - b.lineas.length).slice(0, 3);
}