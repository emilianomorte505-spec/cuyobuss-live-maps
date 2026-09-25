import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthGate } from "@/components/AuthGate";
import { CuyobussLogo } from "@/components/CuyobussLogo";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Panel de paradas — Cuyobuss" },
      { name: "description", content: "Creá paradas en el mapa, elegí sentido y líneas, y copiá el enlace del tag NFC." },
      { property: "og:title", content: "Panel de paradas — Cuyobuss" },
      { property: "og:description", content: "Panel interno para crear paradas y enlaces NFC de Cuyobuss." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <AuthGate>
      <AdminGate />
    </AuthGate>
  ),
});

type LineaSel = { linea: string; destino: string };
type Planilla = { slug: string; nombre: string; lineas: string[] };
type ParadaDb = { code: string; nombre: string; sentido: string; lineas: LineaSel[] };

const SENTIDOS = ["Hacia el Centro", "Hacia el Norte", "Hacia el Sur", "Hacia el Este", "Hacia el Oeste"];
const SAN_JUAN = { lat: -31.5375, lng: -68.5364 };

const slugify = (t: string) =>
  t
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

function AdminGate() {
  const [estado, setEstado] = useState<"cargando" | "si" | "no">("cargando");
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return setEstado("no");
      const { data: ok } = await supabase.rpc("has_role", { _user_id: data.user.id, _role: "admin" });
      setEstado(ok ? "si" : "no");
    });
  }, []);
  if (estado === "cargando") return <div className="auth-screen"><p className="auth-loading">Cargando…</p></div>;
  if (estado === "no")
    return (
      <div className="shell">
        <main>
          <h1 className="stop-name">Solo para administradores</h1>
          <div className="detail">Tu cuenta no tiene permiso para crear paradas.</div>
        </main>
      </div>
    );
  return <Admin />;
}

declare global {
  interface Window {
    google?: any;
    __cuyoMapa?: () => void;
  }
}

function cargarMapa(): Promise<void> {
  if (window.google?.maps) return Promise.resolve();
  return new Promise((resolve) => {
    window.__cuyoMapa = () => resolve();
    const key = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY;
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&callback=__cuyoMapa`;
    s.async = true;
    document.head.appendChild(s);
  });
}

function Admin() {
  const mapaRef = useRef<HTMLDivElement>(null);
  const marcador = useRef<any>(null);
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [nombre, setNombre] = useState("");
  const [code, setCode] = useState("");
  const [codeTocado, setCodeTocado] = useState(false);
  const [zona, setZona] = useState("San Juan");
  const [sentido, setSentido] = useState(SENTIDOS[0]!);
  const [lineas, setLineas] = useState<LineaSel[]>([]);
  const [nuevaLinea, setNuevaLinea] = useState("");
  const [planilla, setPlanilla] = useState<Planilla | null>(null);
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Planilla[]>([]);
  const [paradas, setParadas] = useState<ParadaDb[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);
  const [origen, setOrigen] = useState("");

  const cargarParadas = async () => {
    const { data } = await supabase.from("paradas").select("code, nombre, sentido, lineas").order("created_at", { ascending: false });
    setParadas((data ?? []) as unknown as ParadaDb[]);
  };

  useEffect(() => {
    setOrigen(window.location.origin);
    void cargarParadas();
    cargarMapa().then(() => {
      if (!mapaRef.current) return;
      const g = window.google;
      const mapa = new g.maps.Map(mapaRef.current, { center: SAN_JUAN, zoom: 14, clickableIcons: false, streetViewControl: false });
      mapa.addListener("click", (e: any) => {
        const p = { lat: e.latLng.lat(), lng: e.latLng.lng() };
        if (!marcador.current) marcador.current = new g.maps.Marker({ map: mapa });
        marcador.current.setPosition(p);
        setPos(p);
      });
    });
  }, []);

  useEffect(() => {
    if (!codeTocado) setCode(slugify(nombre));
  }, [nombre, codeTocado]);

  useEffect(() => {
    const texto = q.trim();
    if (texto.length < 3) return setRes([]);
    const t = setTimeout(async () => {
      let c = supabase.from("horarios_parada").select("parada_slug, parada_nombre, linea");
      for (const p of texto.split(/\s+/).slice(0, 4)) c = c.ilike("parada_nombre", `%${p}%`);
      const { data } = await c.limit(300);
      const m = new Map<string, Planilla>();
      for (const f of data ?? []) {
        const p = m.get(f.parada_slug) ?? { slug: f.parada_slug, nombre: f.parada_nombre, lineas: [] };
        if (!p.lineas.includes(f.linea)) p.lineas.push(f.linea);
        m.set(f.parada_slug, p);
      }
      setRes([...m.values()].slice(0, 20));
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const elegirPlanilla = (p: Planilla) => {
    setPlanilla(p);
    if (!nombre) setNombre(p.nombre);
    setLineas(p.lineas.sort().map((l) => ({ linea: l, destino: "" })));
    setRes([]);
    setQ("");
  };

  const toggleLinea = (l: string) =>
    setLineas((ls) => (ls.some((x) => x.linea === l) ? ls.filter((x) => x.linea !== l) : [...ls, { linea: l, destino: "" }]));

  const guardar = async () => {
    setMsg(null);
    if (!pos) return setMsg({ ok: false, t: "Tocá el mapa para marcar dónde está la parada." });
    if (!nombre.trim() || !code) return setMsg({ ok: false, t: "Poné el nombre de la parada." });
    if (lineas.length === 0) return setMsg({ ok: false, t: "Elegí al menos una línea." });
    const { error } = await supabase.from("paradas").insert({
      code,
      nombre: nombre.trim(),
      zona,
      sentido,
      lat: pos.lat,
      lng: pos.lng,
      planilla: planilla?.slug ?? null,
      lineas: lineas.map((l) => ({ linea: l.linea, destino: l.destino.trim() || sentido })),
    });
    if (error) return setMsg({ ok: false, t: error.code === "23505" ? "Ya existe una parada con ese enlace." : error.message });
    setMsg({ ok: true, t: `Parada creada: ${origen}/p/${code}` });
    setNombre("");
    setCodeTocado(false);
    setLineas([]);
    setPlanilla(null);
    void cargarParadas();
  };

  const borrar = async (c: string) => {
    if (!confirm("¿Borrar esta parada? El tag NFC dejará de funcionar.")) return;
    await supabase.from("paradas").delete().eq("code", c);
    void cargarParadas();
  };

  const copiar = async (t: string, id: string) => {
    await navigator.clipboard.writeText(t);
    setCopiado(id);
    setTimeout(() => setCopiado(null), 1500);
  };

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
        <div className="eyebrow">Nueva parada</div>
        <h1 className="stop-name">Creá una parada</h1>

        <div className="section-title"><h2>1. Tocá el mapa donde está el poste</h2><span>{pos ? "Marcada ✓" : "Sin marcar"}</span></div>
        <div ref={mapaRef} className="admin-map" />

        <div className="section-title"><h2>2. Buscá la parada en las planillas</h2><span>sugiere las líneas</span></div>
        <input className="admin-input" placeholder="Ej: agustin gomez acha" value={q} onChange={(e) => setQ(e.target.value)} />
        {res.map((p) => (
          <button key={p.slug} className="admin-result" onClick={() => elegirPlanilla(p)}>
            <strong>{p.nombre}</strong>
            <span>Líneas: {p.lineas.sort().join(", ")}</span>
          </button>
        ))}
        {planilla && <div className="detail">Planilla: {planilla.nombre}</div>}

        <div className="section-title"><h2>3. Datos de la parada</h2></div>
        <label className="auth-label">Nombre</label>
        <input className="admin-input" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Agustín Gómez y Gral. Acha Sur" />
        <label className="auth-label">Enlace del tag</label>
        <input className="admin-input" value={code} onChange={(e) => { setCodeTocado(true); setCode(slugify(e.target.value)); }} />
        <div className="detail">{origen}/p/{code || "…"}</div>
        <label className="auth-label">Zona</label>
        <input className="admin-input" value={zona} onChange={(e) => setZona(e.target.value)} />
        <label className="auth-label">Hacia dónde van</label>
        <div className="admin-chips">
          {SENTIDOS.map((s) => (
            <button key={s} className={`admin-chip${sentido === s ? " on" : ""}`} onClick={() => setSentido(s)}>{s.replace("Hacia el ", "")}</button>
          ))}
        </div>

        <div className="section-title"><h2>4. Líneas que frenan acá</h2><span>{lineas.length} elegidas</span></div>
        {planilla && (
          <div className="admin-chips">
            {planilla.lineas.map((l) => (
              <button key={l} className={`admin-chip${lineas.some((x) => x.linea === l) ? " on" : ""}`} onClick={() => toggleLinea(l)}>{l}</button>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <input className="admin-input" placeholder="Agregar línea, ej: 203" value={nuevaLinea} onChange={(e) => setNuevaLinea(e.target.value)} />
          <button className="admin-btn" onClick={() => { const l = nuevaLinea.trim(); if (l && !lineas.some((x) => x.linea === l)) setLineas([...lineas, { linea: l, destino: "" }]); setNuevaLinea(""); }}>Agregar</button>
        </div>
        {lineas.map((l, i) => (
          <div key={l.linea} style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
            <strong style={{ minWidth: 48 }}>{l.linea}</strong>
            <input className="admin-input" style={{ margin: 0 }} placeholder="Destino (opcional), ej: Centro" value={l.destino}
              onChange={(e) => setLineas(lineas.map((x, j) => (j === i ? { ...x, destino: e.target.value } : x)))} />
            <button className="admin-btn" onClick={() => toggleLinea(l.linea)}>Quitar</button>
          </div>
        ))}

        {msg && <p className="auth-msg" style={{ color: msg.ok ? "#397a50" : "#c45b42" }}>{msg.t}</p>}
        <button className="btn" style={{ marginTop: 16, width: "100%" }} onClick={guardar}>Crear parada</button>

        <div className="section-title"><h2>Paradas creadas</h2><span>{paradas.length}</span></div>
        {paradas.length > 0 && (
          <button className="admin-btn" style={{ marginBottom: 12 }} onClick={() => copiar(paradas.map((p) => `${p.nombre}\t${origen}/p/${p.code}`).join("\n"), "__todo")}>
            {copiado === "__todo" ? "¡Lista copiada!" : "Copiar todos los enlaces"}
          </button>
        )}
        {paradas.map((p) => (
          <article className="bus-card" key={p.code} style={{ gridTemplateColumns: "1fr auto" }}>
            <div>
              <div className="dest">{p.nombre}</div>
              <div className="bus-line">{p.sentido} · Líneas: {p.lineas.map((l) => l.linea).join(", ")}</div>
              <div className="bus-line" style={{ wordBreak: "break-all" }}>{origen}/p/{p.code}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <button className="admin-btn" onClick={() => copiar(`${origen}/p/${p.code}`, p.code)}>{copiado === p.code ? "¡Copiado!" : "Copiar enlace"}</button>
              <Link to="/p/$stopId" params={{ stopId: p.code }} className="admin-btn" target="_blank">Ver</Link>
              <button className="admin-btn" onClick={() => borrar(p.code)}>Borrar</button>
            </div>
          </article>
        ))}
      </main>
    </div>
  );
}
