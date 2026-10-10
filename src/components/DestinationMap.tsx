import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { MapPin, Search, ExternalLink, ArrowRight, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buscarDestino } from "@/lib/destinations.functions";
import type { DestinationRoute } from "@/lib/destination-routes";
import type { Stop } from "@/lib/stops";

type Result = { opciones: DestinationRoute[]; origen: string; destino: string; mensaje: string | null };

export function DestinationMap({ stop }: { stop: Stop }) {
  const [destino, setDestino] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const search = useServerFn(buscarDestino);
  const key = import.meta.env["VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY"];
  const origin = stop.lat !== 0 || stop.lng !== 0 ? `${stop.lat},${stop.lng}` : `${stop.nombre}, ${stop.zona}, Argentina`;
  const params = new URLSearchParams({ key: key ?? "", language: "es" });
  if (result?.opciones.length) {
    params.set("origin", result.origen);
    params.set("destination", result.destino);
    params.set("mode", "transit");
  } else {
    params.set("q", result?.destino ?? origin);
    params.set("zoom", "15");
  }
  const mapUrl = `https://www.google.com/maps/embed/v1/${result?.opciones.length ? "directions" : "place"}?${params}`;
  const directionsUrl = `https://www.google.com/maps/dir/?${new URLSearchParams({ api: "1", origin: result?.origen ?? origin, destination: result?.destino ?? "", travelmode: "transit" })}`;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || destino.trim().length < 3) return;
    setPending(true);
    setError(null);
    setResult(null);
    try {
      setResult(await search({ data: { stopId: stop.code, destino: destino.trim() } }));
    } catch (e) {
      setError(e instanceof Error && !e.message.includes("fetch") && !e.message.includes("timeout")
        ? e.message : "No pudimos buscar tu destino. Revisá tu conexión y probá de nuevo.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="destination-section" aria-labelledby="destination-title">
      <div className="section-title"><h2 id="destination-title">¿Hacia dónde vas?</h2><MapPin size={20} aria-hidden="true" /></div>
      <div className="destination-origin"><MapPin size={16} aria-hidden="true" /><span>Desde {stop.nombre} · {stop.sentido}</span></div>
      <form className="destination-form" onSubmit={submit}>
        <label htmlFor={`destination-${stop.code}`} className="destination-label">Tu destino en San Juan</label>
        <div className="destination-search">
          <input id={`destination-${stop.code}`} className="destination-input" type="search" placeholder="Dirección, esquina o lugar" value={destino} maxLength={160} onChange={(event) => setDestino(event.target.value)} disabled={pending} required minLength={3} />
          <Button type="submit" className="destination-button" disabled={pending || destino.trim().length < 3}>
            {pending ? <LoaderCircle className="destination-spinner" /> : <Search />} {pending ? "Buscando…" : "Buscar líneas"}
          </Button>
        </div>
      </form>
      <div aria-live="polite" aria-busy={pending}>
        {error && <div className="ride-alert ride-alert-warning" role="alert"><span className="ride-alert-icon">!</span><span>{error}</span></div>}
        {result && <div className="destination-results">
          <h3>{result.destino.replace(/, San Juan, Argentina$/, "")}</h3>
          {result.mensaje && <div className="ride-alert ride-alert-warning"><span className="ride-alert-icon">!</span><span>{result.mensaje}</span></div>}
          {result.opciones.map((route, index) => <article className="destination-route" key={`${route.lineas.join("-")}-${index}`}>
            <div className="destination-route-lines">{route.lineas.map((line, i) => <span className="destination-line-step" key={`${line}-${i}`}>{i > 0 && <ArrowRight size={16} aria-hidden="true" />}<strong className="destination-line">{line}</strong></span>)}</div>
            <div className="destination-route-detail">
              <strong>{route.lineas.length === 1 ? "Sin cambiar de colectivo" : `${route.lineas.length - 1} ${route.lineas.length === 2 ? "combinación" : "combinaciones"}`}</strong>
              {route.hacia && <span>Tomá el {route.lineas[0]} hacia {route.hacia}</span>}
              {route.bajarEn && <span>Bajá en {route.bajarEn}</span>}
              {route.duracionMin !== null && <span>{route.duracionMin} min de viaje estimado</span>}
            </div>
          </article>)}
          <Button variant="link" asChild className="destination-external"><a href={directionsUrl} target="_blank" rel="noopener noreferrer">Ver recorrido en Google Maps <ExternalLink /></a></Button>
        </div>}
      </div>
      {key ? <iframe title={result ? `Mapa hacia ${result.destino}` : `Mapa de ${stop.nombre}`} className="destination-map" src={mapUrl} loading="lazy" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" /> : <div className="destination-map destination-map-unavailable">El mapa no está disponible en este momento.</div>}
    </section>
  );
}