import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthGate } from "@/components/AuthGate";
import { CuyobussLogo } from "@/components/CuyobussLogo";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Panel de paradas — Cuyobuss" },
      { name: "description", content: "Buscá paradas de San Juan y copiá el enlace para grabar en el tag NFC." },
      { property: "og:title", content: "Panel de paradas — Cuyobuss" },
      { property: "og:description", content: "Buscador interno de paradas y enlaces NFC de Cuyobuss." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <AuthGate>
      <Admin />
    </AuthGate>
  ),
});

type Parada = { slug: string; nombre: string; lineas: string[] };
const LISTA_KEY = "cuyobuss-lista-nfc";

function Admin() {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Parada[]>([]);
  const [cargando, setCargando] = useState(false);
  const [lista, setLista] = useState<Parada[]>([]);
  const [copiado, setCopiado] = useState<string | null>(null);
  const [origen, setOrigen] = useState("");

  useEffect(() => {
    setOrigen(window.location.origin);
    try {
      setLista(JSON.parse(localStorage.getItem(LISTA_KEY) ?? "[]"));
    } catch {
      /* lista vacía */
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(LISTA_KEY, JSON.stringify(lista));
  }, [lista]);

  useEffect(() => {
    const texto = q.trim();
    if (texto.length < 3) {
      setRes([]);
      return;
    }
    const t = setTimeout(async () => {
      setCargando(true);
      const palabras = texto.split(/\s+/).slice(0, 4);
      let consulta = supabase.from("horarios_parada").select("parada_slug, parada_nombre, linea");
      for (const p of palabras) consulta = consulta.ilike("parada_nombre", `%${p}%`);
      const { data } = await consulta.limit(300);
      const mapa = new Map<string, Parada>();
      for (const f of data ?? []) {
        const p = mapa.get(f.parada_slug) ?? { slug: f.parada_slug, nombre: f.parada_nombre, lineas: [] };
        if (!p.lineas.includes(f.linea)) p.lineas.push(f.linea);
        mapa.set(f.parada_slug, p);
      }
      setRes([...mapa.values()].slice(0, 40));
      setCargando(false);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const url = (slug: string) => `${origen}/p/${slug}`;
  const copiar = async (texto: string, id: string) => {
    await navigator.clipboard.writeText(texto);
    setCopiado(id);
    setTimeout(() => setCopiado(null), 1500);
  };
  const enLista = (slug: string) => lista.some((p) => p.slug === slug);

  const tarjeta = (p: Parada, quitar = false) => (
    <article className="bus-card" key={p.slug} style={{ gridTemplateColumns: "1fr auto" }}>
      <div>
        <div className="dest">{p.nombre}</div>
        <div className="bus-line">Líneas: {p.lineas.sort().join(", ")}</div>
        <div className="bus-line" style={{ wordBreak: "break-all" }}>{url(p.slug)}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <button className="admin-btn" onClick={() => copiar(url(p.slug), p.slug)}>
          {copiado === p.slug ? "¡Copiado!" : "Copiar enlace"}
        </button>
        <Link to="/p/$stopId" params={{ stopId: p.slug }} className="admin-btn" target="_blank">
          Ver
        </Link>
        {quitar ? (
          <button className="admin-btn" onClick={() => setLista((l) => l.filter((x) => x.slug !== p.slug))}>
            Quitar
          </button>
        ) : (
          <button
            className="admin-btn"
            disabled={enLista(p.slug)}
            onClick={() => setLista((l) => [...l, p])}
          >
            {enLista(p.slug) ? "En la lista" : "Agregar"}
          </button>
        )}
      </div>
    </article>
  );

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <CuyobussLogo />
          <span>
            CUYOBUSS<small className="sub">Panel de paradas</small>
          </span>
        </div>
      </header>
      <main>
        <div className="eyebrow">Buscador</div>
        <h1 className="stop-name">Elegí tus esquinas</h1>
        <input
          className="admin-input"
          placeholder="Ej: agustin gomez acha"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="section-title">
          <h2>Resultados</h2>
          <span>{cargando ? "Buscando…" : `${res.length} paradas`}</span>
        </div>
        {res.map((p) => tarjeta(p))}

        <div className="section-title">
          <h2>Mi lista para grabar</h2>
          <span>{lista.length} paradas</span>
        </div>
        {lista.length > 0 && (
          <button
            className="admin-btn"
            style={{ marginBottom: 12 }}
            onClick={() =>
              copiar(lista.map((p) => `${p.nombre}\t${url(p.slug)}`).join("\n"), "__todo")
            }
          >
            {copiado === "__todo" ? "¡Lista copiada!" : "Copiar todos los enlaces"}
          </button>
        )}
        {lista.map((p) => tarjeta(p, true))}
      </main>
    </div>
  );
}
