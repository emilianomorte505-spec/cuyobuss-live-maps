import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { AuthGate } from "@/components/AuthGate";
import { StopPage } from "@/components/StopPage";
import { getStop } from "@/lib/arrivals.functions";

export const Route = createFileRoute("/p/$stopId")({
  loader: async ({ params }) => {
    const stop = await getStop({ data: { stopId: params.stopId } });
    if (!stop) throw notFound();
    return { stop };
  },
  head: ({ loaderData }) => {
    const stop = loaderData?.stop;
    const title = stop ? `${stop.nombre} — Cuyobuss` : "Parada — Cuyobuss";
    const description = stop
      ? `Próximos colectivos en ${stop.nombre}, ${stop.zona}.`
      : "Consultá los próximos colectivos de tu parada en San Juan.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  notFoundComponent: () => (
    <div className="shell">
      <main>
        <div className="eyebrow">Parada desconocida</div>
        <h1 className="stop-name">Todavía no cargamos esta parada</h1>
        <div className="detail">Revisá el código del tag o volvé al inicio.</div>
        <div className="section-title">
          <Link to="/">Ir al inicio</Link>
        </div>
      </main>
    </div>
  ),
  errorComponent: () => (
    <div className="shell">
      <main>
        <h1 className="stop-name">No pudimos cargar la parada</h1>
        <div className="detail">Probá de nuevo en unos segundos.</div>
      </main>
    </div>
  ),
  component: StopRoute,
});

function StopRoute() {
  const { stop } = Route.useLoaderData();
  return (
    <AuthGate>
      <StopPage stop={stop} />
    </AuthGate>
  );
}
