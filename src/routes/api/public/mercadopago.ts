import { createFileRoute } from "@tanstack/react-router";

/** Aviso de Mercado Pago: se verifica consultando el pago directo a Mercado Pago. */
export const Route = createFileRoute("/api/public/mercadopago")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = process.env["MERCADOPAGO_ACCESS_TOKEN"];
        if (!token) return new Response("ok");
        const url = new URL(request.url);
        let id = url.searchParams.get("data.id") ?? url.searchParams.get("id");
        let tipo = url.searchParams.get("type") ?? url.searchParams.get("topic");
        try {
          const body = (await request.json()) as { type?: string; data?: { id?: string | number } };
          id = id ?? (body.data?.id != null ? String(body.data.id) : null);
          tipo = tipo ?? body.type ?? null;
        } catch {
          /* sin cuerpo */
        }
        if (tipo !== "payment" || !id || !/^\d+$/.test(id)) return new Response("ok");

        const r = await fetch(`https://api.mercadopago.com/v1/payments/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!r.ok) return new Response("retry", { status: 500 });
        const p = (await r.json()) as {
          status: string;
          external_reference?: string;
          transaction_amount?: number;
          payer?: { email?: string; first_name?: string; last_name?: string };
        };
        if (p.status !== "approved" || !p.external_reference) return new Response("ok");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const nombre = [p.payer?.first_name, p.payer?.last_name].filter(Boolean).join(" ") || null;
        await supabaseAdmin.from("clientes").upsert(
          {
            llave: p.external_reference,
            origen: "mercadopago",
            email: p.payer?.email ?? null,
            nombre,
            monto: p.transaction_amount ?? 0,
            mp_pago_id: id,
            pagado_en: new Date().toISOString(),
            vence: new Date(Date.now() + 30 * 86400000).toISOString(),
          },
          { onConflict: "llave" },
        );
        return new Response("ok");
      },
    },
  },
});
