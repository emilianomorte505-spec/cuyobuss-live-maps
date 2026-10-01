import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AuthGate } from "@/components/AuthGate";
import { listarClientes } from "@/lib/acceso.functions";

export const Route = createFileRoute("/clientes")({
  head: () => ({
    meta: [
      { title: "Clientes y cobros — Cuyobuss" },
      { name: "description", content: "Listado interno de clientes, pases y cobros de Cuyobuss." },
      { property: "og:title", content: "Clientes y cobros — Cuyobuss" },
      { property: "og:description", content: "Panel interno de clientes de Cuyobuss." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <AuthGate>
      <Clientes />
    </AuthGate>
  ),
});

const ORIGEN: Record<string, string> = {
  mercadopago: "Mercado Pago",
  prueba: "Prueba",
  mayor57: "Mayor de 57",
};

function Clientes() {
  const fn = useServerFn(listarClientes);
  const { data, error, isLoading } = useQuery({ queryKey: ["clientes"], queryFn: () => fn() });
  if (isLoading) return <div className="auth-screen"><p className="auth-loading">Cargando…</p></div>;
  if (error || !data)
    return (
      <div className="shell"><main><h1 className="stop-name">Solo para administradores</h1></main></div>
    );
  const ahora = new Date();
  const activos = data.clientes.filter((c) => new Date(c.vence) > ahora);
  const mes = data.clientes.filter((c) => {
    const d = new Date(c.pagado_en);
    return d.getMonth() === ahora.getMonth() && d.getFullYear() === ahora.getFullYear();
  });
  const recaudado = mes.reduce((a, c) => a + Number(c.monto), 0);
  const f = (s: string) => new Date(s).toLocaleDateString("es-AR");

  return (
    <div className="shell">
      <main>
        <div className="eyebrow">Panel · <Link to="/admin">Paradas</Link></div>
        <h1 className="stop-name">Clientes y cobros</h1>
        {data.modoPrueba && (
          <div className="detail">Modo prueba: Mercado Pago todavía no está vinculado.</div>
        )}
        <div className="section-title">
          <h2>{activos.length} activos</h2>
          <span>
            {data.clientes.length - activos.length} vencidos · ${recaudado.toLocaleString("es-AR")} este mes
          </span>
        </div>
        {data.clientes.map((c) => {
          const vigente = new Date(c.vence) > ahora;
          return (
            <article className="bus-card" key={c.id}>
              <div className="route" style={{ fontSize: 12 }}>{ORIGEN[c.origen] ?? c.origen}</div>
              <div>
                <div className="dest">{c.nombre || c.email || c.documento || "Sin nombre"}</div>
                <div className="bus-line">
                  {c.email ?? ""} {c.documento ? `· CUIL ${c.documento}` : ""}
                </div>
                <div className="bus-line">Pagó {f(c.pagado_en)} · ${Number(c.monto).toLocaleString("es-AR")}</div>
              </div>
              <div>
                <div className="status">{vigente ? "Activo" : "Vencido"}</div>
                <div className="status">vence {f(c.vence)}</div>
              </div>
            </article>
          );
        })}
      </main>
    </div>
  );
}
