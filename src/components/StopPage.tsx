import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CuyobussLogo } from "./CuyobussLogo";
import { supabase } from "@/integrations/supabase/client";
import { getArrivals, reportarViaje } from "@/lib/arrivals.functions";
import { estadoAcceso, iniciarPago, paseMayor } from "@/lib/acceso.functions";
import { arribosBase, type Arrival, type Stop } from "@/lib/stops";
import { huellaDispositivo } from "@/lib/huella";

export function StopPage({ stop }: { stop: Stop }) {
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [jubiladoAbierto, setJubiladoAbierto] = useState(false);
  const [documento, setDocumento] = useState("");
  const [jubiladoMsg, setJubiladoMsg] = useState<string | null>(null);
  const [verificando, setVerificando] = useState(false);
  const pedirPase = useServerFn(paseMayor);
  const consultarEstado = useServerFn(estadoAcceso);
  const pagar = useServerFn(iniciarPago);
  const [llave, setLlave] = useState<string | null>(null);
  const [modoPrueba, setModoPrueba] = useState(false);
  const [pagando, setPagando] = useState(false);
  const [huella, setHuella] = useState<string | null>(null);
  const [vigente, setVigente] = useState(false);
  const [finPrueba, setFinPrueba] = useState<number | null>(null);
  const [ahora, setAhora] = useState(0);

  async function activarPaseJubilado() {
    if (!llave) return;
    setJubiladoMsg(null);
    setVerificando(true);
    try {
      const r = await pedirPase({ data: { llave, documento } });
      if (r.ok) {
        setPaywallOpen(false);
      } else {
        setJubiladoMsg(r.motivo);
      }
    } catch {
      setJubiladoMsg("No pudimos verificar el documento. Probá de nuevo.");
    } finally {
      setVerificando(false);
    }
  }

  async function empezarPago() {
    if (!llave) return;
    setPagando(true);
    try {
      const r = await pagar({ data: { llave, volverA: window.location.href } });
      if (r.tipo === "redirigir") window.location.href = r.url;
      else if (r.tipo === "activado") setPaywallOpen(false);
      else alert(r.mensaje);
    } catch {
      alert("No pudimos iniciar el pago. Probá de nuevo.");
    } finally {
      setPagando(false);
    }
  }

  // Llave única por celular: sin cuentas ni contraseñas.
  useEffect(() => {
    let k = localStorage.getItem("cuyobuss_llave");
    if (!k) {
      k = crypto.randomUUID();
      localStorage.setItem("cuyobuss_llave", k);
    }
    setLlave(k);
  }, []);

  useEffect(() => {
    void huellaDispositivo().then(setHuella).catch(() => setHuella(""));
  }, []);

  useEffect(() => {
    if (!llave || huella === null) return;
    let activo = true;
    const revisar = () =>
      consultarEstado({ data: { llave, huella: huella ?? "" } })
        .then((e) => {
          if (!activo) return;
          try {
            localStorage.setItem("cuyobuss_estado", JSON.stringify({ vigente: e.vigente }));
          } catch {}
          setModoPrueba(e.modoPrueba);
          setVigente(e.vigente);
          setFinPrueba(e.pruebaRestante > 0 ? Date.now() + e.pruebaRestante * 1000 : null);
          setPaywallOpen(!e.vigente && e.pruebaRestante <= 0);
        })
        .catch(() => {
          // Sin conexión: si el último estado fue pase vigente, no bloqueamos.
          if (!activo) return;
          try {
            const g = JSON.parse(localStorage.getItem("cuyobuss_estado") ?? "{}") as {
              vigente?: boolean;
            };
            if (g.vigente) {
              setVigente(true);
              setPaywallOpen(false);
              return;
            }
          } catch {}
          setPaywallOpen(true);
        });
    void revisar();
    const t = setInterval(revisar, 8000);
    return () => {
      activo = false;
      clearInterval(t);
    };
  }, [llave, huella, consultarEstado]);

  useEffect(() => {
    if (vigente || !finPrueba) return;
    const t = setInterval(() => {
      const r = Math.max(0, Math.round((finPrueba - Date.now()) / 1000));
      setAhora(r);
      if (r <= 0) setPaywallOpen(true);
    }, 1000);
    return () => clearInterval(t);
  }, [finPrueba, vigente]);
  const restante = !vigente && finPrueba ? ahora : 0;
  const [aviso, setAviso] = useState<string | null>(null);
  const fetchArrivals = useServerFn(getArrivals);
  const enviarReporte = useServerFn(reportarViaje);
  const claveArribos = `cuyobuss_arribos_${stop.code}`;
  const { data, refetch } = useQuery({
    queryKey: ["arribos", stop.code],
    queryFn: async () => {
      try {
        const r = await fetchArrivals({ data: { stopId: stop.code } });
        try {
          localStorage.setItem(claveArribos, JSON.stringify(r));
        } catch {}
        return r;
      } catch {
        // Sin conexión: mostramos los horarios guardados en el celular.
        const guardado = localStorage.getItem(claveArribos);
        if (guardado) {
          const g = JSON.parse(guardado) as { arribos?: Arrival[]; fuente?: string };
          return { arribos: g.arribos ?? [], fuente: "guardado" };
        }
        throw new Error("sin conexión y sin horarios guardados");
      }
    },
    refetchInterval: 60_000,
  });
  const reporte = useMutation({
    mutationFn: (linea: string) =>
      enviarReporte({ data: { stopId: stop.code, linea, llave: llave ?? "" } }),
    onSuccess: (res) => {
      setAviso(res.mensaje);
      void refetch();
    },
    onError: () => setAviso("No pudimos registrar tu aviso. Probá de nuevo."),
  });
  const arribos: Arrival[] = data?.arribos ?? arribosBase(stop);
  const fuente = data?.fuente;
  const etiqueta =
    fuente === "horario"
      ? "Horarios oficiales"
      : fuente === "google"
        ? "Datos en vivo"
        : fuente === "guardado"
          ? "Sin conexión · horarios guardados"
          : "Buscando horarios";


  useEffect(() => {
    document.body.style.overflow = paywallOpen ? "hidden" : "auto";
    return () => {
      document.body.style.overflow = "auto";
    };
  }, [paywallOpen]);


  return (
    <>
      <div className="shell">
        <header className="topbar">
          <div className="brand">
            <CuyobussLogo />
            <span>
              CUYOBUSS<small className="sub">Llegá antes</small>
            </span>
          </div>
          <div className="live">
            <span className="dot" />
            {etiqueta}
          </div>
        </header>

        <main>
          {restante > 0 && (
            <div
              className="detail"
              role="status"
              style={{ marginBottom: 12, color: "#a63a22", fontWeight: 800 }}
            >
              ⏱ Prueba de cortesía: te quedan {Math.floor(restante / 60)}:
              {String(restante % 60).padStart(2, "0")} min ·{" "}
              <button
                type="button"
                className="logout"
                onClick={() => setPaywallOpen(true)}
                style={{ fontWeight: 800 }}
              >
                Activar pase
              </button>
            </div>
          )}
          <div className="eyebrow">Tu parada actual</div>
          <h1 className="stop-name">{stop.nombre}</h1>
          <div className="detail">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
              <circle cx="12" cy="10" r="2.5" />
            </svg>
            {stop.zona} · {stop.sentido} · Actualizado ahora
          </div>

          <div className="section-title">
            <h2>Próximos arribos</h2>
            <span>{arribos.length} recorridos</span>
          </div>

          {aviso && (
            <div
              className="detail"
              style={{ marginBottom: 12, color: "#2b6b40", fontWeight: 700 }}
              role="status"
            >
              {aviso}
            </div>
          )}

          <div id="busList">
            {arribos.map((b) => (
              <article className="bus-card" key={`${b.linea}-${b.destino}`}>
                <div className="route">{b.linea}</div>
                <div>
                  <div className="bus-line">Línea {b.linea} · Hacia</div>
                  <div className="dest">{b.destino}</div>
                  <button
                    type="button"
                    disabled={reporte.isPending || !llave}
                    onClick={() => {
                      setAviso(null);
                      reporte.mutate(b.linea);
                    }}
                    style={{
                      marginTop: 8,
                      border: "1.5px solid #315c40",
                      background: "#315c400f",
                      borderRadius: 999,
                      padding: "6px 12px",
                      font: "700 11px Manrope, sans-serif",
                      letterSpacing: "0.4px",
                      cursor: "pointer",
                      opacity: reporte.isPending || !llave ? 0.5 : 1,
                      color: "#1c2823",
                    }}
                  >
                    Me subí al {b.linea}
                  </button>
                </div>
                <div>
                  <div className="mins">{b.minutos < 0 ? "—" : `${b.minutos} min`}</div>
                  <div
                    className="status"
                    style={{
                      color:
                        b.estado === "A tiempo"
                          ? "#2b6b40"
                          : b.estado === "Demorado"
                            ? "#a63a22"
                            : b.estado === "Adelantado"
                              ? "#2b6b40"
                              : "#4a544d",
                    }}
                  >
                    {b.estado === "Sin datos" ? "Buscando horario" : b.estado}
                  </div>
                  {b.reportado && b.desvio !== undefined && b.desvio !== 0 && (
                    <div className="status" style={{ color: "#a63a22" }}>
                      {b.desvio > 0 ? `+${b.desvio}` : b.desvio} min · avisado a bordo
                    </div>
                  )}
                  {b.minutosProximo >= 0 && (
                    <div className="status" style={{ color: "#4a544d" }}>
                      después: {b.minutosProximo} min
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>

        </main>

        <footer>
          © 2026 Cuyobuss · Hecho en San Juan · Información orientativa ·{" "}
          <button className="logout" type="button" onClick={() => supabase.auth.signOut()}>
            Salir
          </button>
        </footer>
      </div>

      <div
        className={`paywall${paywallOpen ? "" : " hidden"}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="offerTitle"
      >
        <div className="offer">
          <section className="story">
            <div className="story-brand">
              <CuyobussLogo className="mark logo-copy" />
              CUYOBUSS
            </div>
            <div className="kicker">Membresía Explorador</div>
            <h1 id="offerTitle">Que esperar el colectivo no sea prehistórico.</h1>
            <p>
              Horarios claros para moverte por San Juan con menos incertidumbre y más tiempo para
              vos.
            </p>
            <svg className="dino" viewBox="0 0 220 130" fill="none" aria-hidden="true">
              <path
                d="M22 106c25-2 37-17 42-36 7-30 21-49 54-51 24-2 38 9 41 29 2 15 11 24 32 22-8 21-27 31-54 23-4 14-15 24-31 29"
                stroke="currentColor"
                strokeWidth="11"
                strokeLinecap="round"
              />
              <path
                d="m102 22-10-17 23 13m23 2 15-16-3 24M118 89v30m33-25 12 25M61 75 28 51"
                stroke="currentColor"
                strokeWidth="9"
                strokeLinecap="round"
              />
              <circle cx="139" cy="39" r="4" fill="currentColor" />
            </svg>
          </section>

          <section className="plan">
            <div className="plan-label">Acceso completo</div>
            <div className="price">
              $1.500 <small>ARS / mes</small>
            </div>
            <p className="cancel">Cancelá cuando quieras, sin permanencia.</p>
            <ul className="benefits">
              <li>
                <span className="check">✓</span>
                <span>
                  <strong>Todos los recorridos</strong>
                  <br />
                  Consultá cualquier parada de San Juan.
                </span>
              </li>
              <li>
                <span className="check">✓</span>
                <span>
                  <strong>Arribos actualizados</strong>
                  <br />
                  Decidí cuándo salir, sin adivinar.
                </span>
              </li>
              <li>
                <span className="check">✓</span>
                <span>
                  <strong>Sin instalar aplicaciones</strong>
                  <br />
                  Acceso directo desde cualquier celular.
                </span>
              </li>
            </ul>
            <button className="btn" disabled={pagando || !llave} onClick={() => void empezarPago()}>
              {pagando ? "Abriendo Mercado Pago…" : "Pagar con Mercado Pago"}
            </button>
            {modoPrueba && <p className="cancel">Modo prueba: el pago se aprueba solo, sin cobrar.</p>}
            <button className="secondary" onClick={() => setJubiladoAbierto((v) => !v)}>
              Mayores de 57 o jubilados · Pase gratuito
            </button>
            {jubiladoAbierto && (
              <div style={{ marginTop: 10 }}>
                <label className="auth-label" htmlFor="doc-jubilado">
                  Tu DNI o CUIL
                </label>
                <input
                  id="doc-jubilado"
                  className="auth-input"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={13}
                  placeholder="Ej: 10234567"
                  value={documento}
                  onChange={(e) => setDocumento(e.target.value.replace(/\D/g, "").slice(0, 11))}
                />
                {jubiladoMsg && (
                  <p className="auth-msg" style={{ color: "#a63a22" }} role="alert">
                    {jubiladoMsg}
                  </p>
                )}
                <button
                  className="btn"
                  disabled={verificando || documento.length < 7}
                  style={{ width: "100%", opacity: verificando || documento.length < 7 ? 0.5 : 1 }}
                  onClick={() => void activarPaseJubilado()}
                >
                  {verificando ? "Verificando…" : "Verificar y activar pase"}
                </button>
                <p className="cancel">Un solo pase por documento. Verificación automática.</p>
              </div>
            )}
            <div className="secure">▣ Pago protegido · Acceso inmediato</div>
          </section>
        </div>
      </div>
    </>
  );
}
