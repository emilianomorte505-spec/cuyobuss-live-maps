import { useEffect, useState } from "react";
import { CuyobussLogo } from "./CuyobussLogo";
import type { Stop } from "@/lib/stops";

export function StopPage({ stop }: { stop: Stop }) {
  const [paywallOpen, setPaywallOpen] = useState(true);

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
            Datos en vivo
          </div>
        </header>

        <main>
          <div className="eyebrow">Tu parada actual</div>
          <h1 className="stop-name">{stop.nombre}</h1>
          <div className="detail">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
              <circle cx="12" cy="10" r="2.5" />
            </svg>
            {stop.zona} · Actualizado ahora
          </div>

          <div className="section-title">
            <h2>Próximos arribos</h2>
            <span>{stop.arribos.length} recorridos</span>
          </div>

          <div id="busList">
            {stop.arribos.map((b) => (
              <article className="bus-card" key={`${b.linea}-${b.destino}`}>
                <div className="route">{b.linea}</div>
                <div>
                  <div className="bus-line">Línea {b.linea} · Hacia</div>
                  <div className="dest">{b.destino}</div>
                </div>
                <div>
                  <div className="mins">{b.minutos} min</div>
                  <div
                    className="status"
                    style={{ color: b.estado === "A tiempo" ? "#397a50" : "#c45b42" }}
                  >
                    {b.estado}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </main>

        <footer>© 2026 Cuyobuss · Hecho en San Juan · Información orientativa</footer>
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
            <button
              className="btn"
              onClick={() => {
                setPaywallOpen(false);
                setTimeout(
                  () => alert("¡Excelente elección! La conexión con Mercado Pago se habilitará próximamente."),
                  350,
                );
              }}
            >
              Empezar mi suscripción
            </button>
            <button className="secondary" onClick={() => setPaywallOpen(false)}>
              Probar una parada gratis
            </button>
            <div className="secure">▣ Pago protegido · Acceso inmediato</div>
          </section>
        </div>
      </div>
    </>
  );
}
