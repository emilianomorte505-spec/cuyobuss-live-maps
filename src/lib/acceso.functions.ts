import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { cuilDesdeDni, cuilValido, dniValido } from "./jubilados.functions";

export const PRECIO_MENSUAL = 1500;
const DIAS = 30;

const llaveOk = (v: unknown) => {
  const s = String(v ?? "");
  if (!/^[a-zA-Z0-9-]{20,64}$/.test(s)) throw new Error("Llave inválida");
  return s;
};

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Si hay sesión válida, la llave pasa a ser la de la cuenta (prueba y pase atados al usuario). */
async function llaveDeCuenta(): Promise<string | null> {
  const { getRequestHeader } = await import("@tanstack/react-start/server");
  const auth = getRequestHeader("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return null;
  const db = await admin();
  const { data } = await db.auth.getUser(token);
  return data.user ? `cuenta-${data.user.id}` : null;
}

async function llaveEfectiva(llave: string) {
  return (await llaveDeCuenta()) ?? llave;
}

export const PRUEBA_SEGUNDOS = 180;
const CUPO_POR_HUELLA = 3;

/** Pase vigente de la cuenta o del celular; si no, una única prueba de cortesía por cuenta. */
export const estadoAcceso = createServerFn({ method: "POST" })
  .inputValidator((i: { llave: string; huella?: string }) => ({
    llave: llaveOk(i?.llave),
    huella: /^[a-f0-9]{32,64}$/.test(String(i?.huella ?? "")) ? String(i.huella) : null,
  }))
  .handler(async ({ data }) => {
    const db = await admin();
    const cuenta = await llaveDeCuenta();
    const llaves = cuenta ? [cuenta, data.llave] : [data.llave];
    const { data: filas } = await db
      .from("clientes")
      .select("vence, origen, nombre")
      .in("llave", llaves)
      .order("vence", { ascending: false })
      .limit(1);
    const c = filas?.[0];
    const vigente = !!c && new Date(c.vence) > new Date();
    const llavePrueba = cuenta ?? data.llave;
    let pruebaRestante = 0;
    if (!vigente && (cuenta || data.huella)) {
      const { data: propia } = await db
        .from("pruebas_cortesia" as never)
        .select("inicio")
        .eq("llave", llavePrueba)
        .order("inicio", { ascending: true })
        .limit(1);
      const fila = (propia as { inicio: string }[] | null)?.[0];
      let inicio: number | null = fila ? new Date(fila.inicio).getTime() : null;
      if (!inicio) {
        let count = 0;
        if (data.huella) {
          const r = await db
            .from("pruebas_cortesia" as never)
            .select("llave", { count: "exact", head: true })
            .eq("huella", data.huella);
          count = r.count ?? 0;
        }
        if (count < CUPO_POR_HUELLA) {
          await db
            .from("pruebas_cortesia" as never)
            .insert({ huella: data.huella ?? "sin-huella", llave: llavePrueba } as never);
          inicio = Date.now();
        } else {
          inicio = 0;
        }
      }
      pruebaRestante = Math.max(0, Math.round(PRUEBA_SEGUNDOS - (Date.now() - inicio) / 1000));
    }
    return {
      vigente,
      pruebaRestante,
      vence: c?.vence ?? null,
      origen: c?.origen ?? null,
      modoPrueba: !process.env["MERCADOPAGO_ACCESS_TOKEN"],
    };
  });

/** Inicia el pago. Sin Mercado Pago vinculado, simula un cobro aprobado (modo prueba). */
export const iniciarPago = createServerFn({ method: "POST" })
  .inputValidator((i: { llave: string; volverA: string }) => ({
    llave: llaveOk(i?.llave),
    volverA: String(i?.volverA ?? "").slice(0, 500),
  }))
  .handler(async ({ data }) => {
    const token = process.env["MERCADOPAGO_ACCESS_TOKEN"];
    const db = await admin();
    data = { ...data, llave: await llaveEfectiva(data.llave) };

    if (!token) {
      const vence = new Date(Date.now() + DIAS * 86400000).toISOString();
      const { error } = await db.from("clientes").upsert(
        {
          llave: data.llave,
          origen: "prueba",
          nombre: "Cliente de prueba",
          monto: PRECIO_MENSUAL,
          pagado_en: new Date().toISOString(),
          vence,
        },
        { onConflict: "llave" },
      );
      if (error) return { tipo: "error" as const, mensaje: "No pudimos activar el pase." };
      return { tipo: "activado" as const };
    }

    const origen = new URL(data.volverA).origin;
    const r = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [
          { title: "Cuyobuss · Pase mensual", quantity: 1, currency_id: "ARS", unit_price: PRECIO_MENSUAL },
        ],
        external_reference: data.llave,
        back_urls: { success: data.volverA, failure: data.volverA, pending: data.volverA },
        auto_return: "approved",
        notification_url: `${origen}/api/public/mercadopago`,
      }),
    });
    if (!r.ok) {
      console.error("Mercado Pago preferencia", r.status, await r.text());
      return { tipo: "error" as const, mensaje: "Mercado Pago no respondió. Probá de nuevo." };
    }
    const pref = (await r.json()) as { init_point: string };
    return { tipo: "redirigir" as const, url: pref.init_point };
  });

/** Pase gratuito para mayores de 57 sin crear cuenta. */
export const paseMayor = createServerFn({ method: "POST" })
  .inputValidator((i: { llave: string; documento: string }) => ({
    llave: llaveOk(i?.llave),
    documento: String(i?.documento ?? "").replace(/\D/g, "").slice(0, 11),
  }))
  .handler(async ({ data }) => {
    const doc = data.documento;
    let cuil: string | null = null;
    if (doc.length === 11) cuil = cuilValido(doc) ? doc : null;
    else if (dniValido(doc)) cuil = cuilDesdeDni(doc);
    if (!cuil) return { ok: false as const, motivo: "Ese DNI o CUIL no es válido. Revisá los números." };
    if (Number(cuil.slice(2, 10)) > 21_500_000) {
      return { ok: false as const, motivo: "El beneficio es para mayores de 57 años según tu DNI." };
    }
    const db = await admin();
    const { data: previo } = await db.from("clientes").select("llave").eq("documento", cuil).maybeSingle();
    if (previo && previo.llave !== data.llave) {
      return { ok: false as const, motivo: "Ese documento ya tiene un pase asignado en otro teléfono." };
    }
    const vence = new Date(Date.now() + 365 * 86400000).toISOString();
    const { error } = await db.from("clientes").upsert(
      { llave: data.llave, origen: "mayor57", documento: cuil, monto: 0, pagado_en: new Date().toISOString(), vence },
      { onConflict: "llave" },
    );
    if (error) return { ok: false as const, motivo: "No pudimos activar el pase. Probá de nuevo." };
    return { ok: true as const };
  });

/** Listado para el administrador. */
export const listarClientes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: esAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!esAdmin) throw new Error("Solo administradores");
    const { data } = await context.supabase
      .from("clientes")
      .select("id, email, nombre, origen, documento, monto, pagado_en, vence")
      .order("pagado_en", { ascending: false })
      .limit(1000);
    return { clientes: data ?? [], modoPrueba: !process.env["MERCADOPAGO_ACCESS_TOKEN"] };
  });
