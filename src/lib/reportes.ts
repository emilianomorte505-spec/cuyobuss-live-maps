/** Aviso "Me subí" guardado por un pasajero. */
export type ReporteViaje = { linea: string; desvio_minutos: number; created_at: string };

const VIGENCIA_MIN = 60;
/** Avisos casi simultáneos se combinan para que uno solo no distorsione el dato. */
const VENTANA_CONSENSO_MIN = 15;

function mediana(valores: number[]) {
  const v = [...valores].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m]! : Math.round((v[m - 1]! + v[m]!) / 2);
}

/**
 * Desvío vigente por línea. Usa la mediana de los avisos de los últimos minutos
 * (desde el más reciente), así muchos pasajeros o uno equivocado no rompen el horario.
 */
export function desvioPorLinea(reportes: ReporteViaje[], ahora = Date.now()): Map<string, number> {
  const porLinea = new Map<string, { t: number; d: number }[]>();
  for (const r of reportes) {
    const t = new Date(r.created_at).getTime();
    if (!Number.isFinite(t) || ahora - t > VIGENCIA_MIN * 60_000 || t > ahora + 60_000) continue;
    const lista = porLinea.get(r.linea) ?? [];
    lista.push({ t, d: r.desvio_minutos });
    porLinea.set(r.linea, lista);
  }
  const mapa = new Map<string, number>();
  for (const [linea, lista] of porLinea) {
    const ultimo = Math.max(...lista.map((x) => x.t));
    const recientes = lista.filter((x) => ultimo - x.t <= VENTANA_CONSENSO_MIN * 60_000);
    mapa.set(linea, mediana(recientes.map((x) => x.d)));
  }
  return mapa;
}
