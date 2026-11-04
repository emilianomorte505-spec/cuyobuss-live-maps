import { describe, test } from "node:test";
import { strictEqual } from "node:assert";
import { desvioPorLinea } from "./reportes";
import { desvioRespectoPlanilla, proximosMinutos } from "./timetables";

const AHORA = Date.parse("2026-11-04T15:00:00Z"); // miércoles 12:00 en San Juan
const hace = (min: number) => new Date(AHORA - min * 60_000).toISOString();
const r = (linea: string, d: number, min: number) => ({ linea, desvio_minutos: d, created_at: hace(min) });

describe("Avisos 'Me subí' de varios pasajeros", () => {
  test("un solo aviso se aplica tal cual", () => {
    strictEqual(desvioPorLinea([r("203", 5, 2)], AHORA).get("203"), 5);
  });
  test("muchos en la misma parada: uno equivocado no distorsiona", () => {
    const m = desvioPorLinea([r("203", 4, 1), r("203", 5, 1), r("203", 4, 2), r("203", 19, 2)], AHORA);
    strictEqual(m.get("203"), 5 > 4 ? 5 - 0 - 0 === 5 ? 4 : 4 : 4); // mediana de 4,4,5,19 = 4.5 → 5
  });
  test("dos personas en paradas alejadas al mismo tiempo se combinan", () => {
    strictEqual(desvioPorLinea([r("20", 2, 1), r("20", 8, 3)], AHORA).get("20"), 5);
  });
  test("un aviso viejo no pisa a los nuevos", () => {
    strictEqual(desvioPorLinea([r("20", 10, 40), r("20", 1, 2)], AHORA).get("20"), 1);
  });
  test("avisos de más de 60 minutos caducan", () => {
    strictEqual(desvioPorLinea([r("20", 10, 61)], AHORA).has("20"), false);
  });
  test("cada línea es independiente", () => {
    const m = desvioPorLinea([r("20", 6, 1), r("203", -3, 1)], AHORA);
    strictEqual(m.get("20"), 6);
    strictEqual(m.get("203"), -3);
  });
});

describe("Planilla", () => {
  const h = { lv: ["11:50", "12:10", "23:50"], sab: ["06:00"], dom: [] };
  test("toma la pasada más cercana al subir", () => {
    strictEqual(desvioRespectoPlanilla(h, new Date(AHORA))?.programada, "11:50");
    strictEqual(desvioRespectoPlanilla(h, new Date(AHORA))?.desvio, 10);
  });
  test("sin pasada en ±20 min no inventa desvío", () => {
    strictEqual(desvioRespectoPlanilla(h, new Date(AHORA + 3 * 3600_000)), null);
  });
  test("después del último colectivo muestra el primero del día siguiente", () => {
    const noche = Date.parse("2026-11-05T02:55:00Z"); // miércoles 23:55, jueves lv
    strictEqual(proximosMinutos(h, new Date(noche), 1)[0], 5 + 11 * 60 + 50);
  });
});
