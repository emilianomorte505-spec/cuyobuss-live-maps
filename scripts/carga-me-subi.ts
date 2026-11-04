/**
 * Prueba de carga de avisos "Me subí" contra la base real.
 * Uso: bun scripts/carga-me-subi.ts [pasajeros]
 * Cada aviso de prueba usa una llave "cargatest-..." y se borra al terminar.
 */
import { createClient } from "@supabase/supabase-js";
import { desvioPorLinea } from "../src/lib/reportes";

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const N = Number(process.argv[2] ?? 300);
const PREFIJO = `cargatest-${Date.now()}-`;
const LINEAS = ["L901", "L902", "L903", "L904", "L905"]; // líneas ficticias, no tocan las reales
const PARADAS = ["carga-a", "carga-b", "carga-c", "carga-d", "carga-e", "carga-f"];

type Aviso = { usuario_id: string; linea: string; stop_code: string; desvio_minutos: number; hora_programada: string };
const esperados: Aviso[] = Array.from({ length: N }, (_, i) => ({
  usuario_id: `${PREFIJO}${String(i).padStart(5, "0")}`,
  linea: LINEAS[i % LINEAS.length]!,
  stop_code: PARADAS[i % PARADAS.length]!,
  desvio_minutos: (i % 11) - 3,
  hora_programada: "12:00",
}));

let fallas = 0;
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? "✔" : "✘"} ${msg}`);
  if (!cond) fallas++;
};

try {
  // 1) Todos a la vez, desde paradas distintas.
  const t0 = Date.now();
  const res = await Promise.all(esperados.map((a) => db.from("reportes_viaje").insert(a)));
  const errores = res.filter((r) => r.error);
  console.log(`${N} avisos simultáneos en ${Date.now() - t0} ms`);
  ok(errores.length === 0, `sin errores al guardar (${errores.length} errores)`);

  const { data: guardados, error } = await db
    .from("reportes_viaje")
    .select("usuario_id, linea, stop_code, desvio_minutos, created_at")
    .like("usuario_id", `${PREFIJO}%`)
    .limit(N + 50);
  ok(!error, "lectura correcta");
  const filas = guardados ?? [];
  ok(filas.length === N, `no se perdió ninguno (${filas.length}/${N})`);

  const porUsuario = new Map(filas.map((f) => [f.usuario_id, f]));
  const mezclados = esperados.filter((e) => {
    const g = porUsuario.get(e.usuario_id);
    return !g || g.linea !== e.linea || g.stop_code !== e.stop_code || g.desvio_minutos !== e.desvio_minutos;
  });
  ok(mezclados.length === 0, `ningún aviso mezclado con otro (${mezclados.length} mal)`);

  // 2) Cada línea calcula su desvío solo con sus propios avisos.
  const mapa = desvioPorLinea(filas);
  for (const linea of LINEAS) {
    const propios = desvioPorLinea(filas.filter((f) => f.linea === linea)).get(linea);
    ok(mapa.get(linea) === propios, `línea ${linea}: desvío ${mapa.get(linea)} min sin mezclar líneas`);
  }

  // 3) Un pasajero que toca "Me subí" 5 veces a la vez: el tiempo de espera de 20 min
  //    se controla antes de guardar, así que mostramos cuántos entran.
  const llave = `${PREFIJO}doble`;
  await Promise.all(
    Array.from({ length: 5 }, async () => {
      const desde = new Date(Date.now() - 20 * 60_000).toISOString();
      const { data } = await db.from("reportes_viaje").select("id").eq("usuario_id", llave).gte("created_at", desde).limit(1);
      if (data && data.length > 0) return;
      await db.from("reportes_viaje").insert({ ...esperados[0]!, usuario_id: llave });
    }),
  );
  const { count } = await db.from("reportes_viaje").select("id", { count: "exact", head: true }).eq("usuario_id", llave);
  ok(count === 1, `toques repetidos al mismo tiempo cuentan una sola vez (${count} guardados)`);
} finally {
  await db.from("reportes_viaje").delete().like("usuario_id", `${PREFIJO}%`);
  const { count } = await db.from("reportes_viaje").select("id", { count: "exact", head: true }).like("usuario_id", `${PREFIJO}%`);
  console.log(`limpieza: quedan ${count ?? "?"} avisos de prueba`);
}
process.exit(fallas ? 1 : 0);
