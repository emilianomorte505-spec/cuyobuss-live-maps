import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { AuthGate } from "@/components/AuthGate";
import { StopPage } from "@/components/StopPage";
import { findStop } from "@/lib/stops";

export const Route = createFileRoute("/p/$stopId")({
  head: ({ params }) => {
    const stop = findStop(params.stopId);
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
  loader: ({ params }) => {
    if (!findStop(params.stopId)) throw notFound();
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
  component: StopRoute,
});

function StopRoute() {
  const { stopId } = Route.useParams();
  const stop = findStop(stopId)!;
  return <StopPage stop={stop} />;
}
