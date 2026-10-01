import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Prefijos válidos de CUIL/CUIT emitidos por ANSES/AFIP. */
const PREFIJOS = new Set([20, 23, 24, 27, 30, 33, 34]);
const PESOS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

/** Dígito verificador oficial (módulo 11) del CUIL argentino. */
export function cuilValido(cuil: string): boolean {
  if (!/^\d{11}$/.test(cuil)) return false;
  if (!PREFIJOS.has(Number(cuil.slice(0, 2)))) return false;
  const suma = PESOS.reduce((acc, p, i) => acc + p * Number(cuil[i]), 0);
  const resto = 11 - (suma % 11);
  const dv = resto === 11 ? 0 : resto === 10 ? 9 : resto;
  return dv === Number(cuil[10]);
}

/** Un DNI argentino real está entre 1.000.000 y 99.999.999. */
export function dniValido(dni: string): boolean {
  if (!/^\d{7,8}$/.test(dni)) return false;
  const n = Number(dni);
  return n >= 1_000_000 && n <= 99_999_999;
}

/** Arma el CUIL completo a partir de un DNI probando los prefijos posibles. */
export function cuilDesdeDni(dni: string): string | null {
  const base = dni.padStart(8, "0");
  for (const p of [20, 27, 23, 24]) {
    for (let dv = 0; dv <= 9; dv++) {
      const cand = `${p}${base}${dv}`;
      if (cuilValido(cand)) return cand;
    }
  }
  return null;
}

export type ResultadoPase =
  | { ok: true; documento: string; vence: string }
  | { ok: false; motivo: string };

export const solicitarPaseJubilado = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { documento: string }) => ({
    documento: String(input?.documento ?? "").replace(/\D/g, "").slice(0, 11),
  }))
  .handler(async ({ data, context }): Promise<ResultadoPase> => {
    const doc = data.documento;

    // 1. Validación automática del número: descarta cualquier documento inventado.
    let documento: string;
    let tipo: "cuil" | "dni";
    if (doc.length === 11) {
      if (!cuilValido(doc)) return { ok: false, motivo: "Ese CUIL no existe. Revisá los 11 números." };
      documento = doc;
      tipo = "cuil";
    } else if (dniValido(doc)) {
      const cuil = cuilDesdeDni(doc);
      if (!cuil) return { ok: false, motivo: "Ese DNI no es válido. Revisá los números." };
      documento = cuil;
      tipo = "dni";
    } else {
      return { ok: false, motivo: "Escribí tu DNI (7 u 8 números) o tu CUIL (11 números)." };
    }

    // Edad automática: DNI correlativo por año; hasta 21.500.000 = nacidos ≤1969 (57+ en 2026).
    if (Number(documento.slice(2, 10)) > 21_500_000) {
      return { ok: false, motivo: "El beneficio es para mayores de 57 años según tu DNI." };
    }

    // 2. Un solo pase por documento y por cuenta.
    const { data: yaTiene } = await context.supabase
      .from("pases_jubilado")
      .select("documento, vence")
      .eq("usuario_id", context.userId)
      .maybeSingle();
    if (yaTiene) {
      return { ok: true, documento: yaTiene.documento, vence: yaTiene.vence };
    }

    const { data: creado, error } = await context.supabase
      .from("pases_jubilado")
      .insert({ usuario_id: context.userId, documento, tipo_documento: tipo })
      .select("documento, vence")
      .single();

    if (error) {
      if (error.code === "23505") {
        return { ok: false, motivo: "Ese documento ya tiene un pase asignado en otro teléfono." };
      }
      return { ok: false, motivo: "No pudimos activar el pase. Probá de nuevo." };
    }

    // 3. Deja la cuenta habilitada para ver horarios durante un año.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("perfiles")
      .update({ suscripcion_activa: true, suscripcion_hasta: creado.vence })
      .eq("id", context.userId);

    return { ok: true, documento: creado.documento, vence: creado.vence };
  });
