import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { estadoAcceso, paseMayor } from "@/lib/acceso.functions";
import { CuyobussLogo } from "./CuyobussLogo";

function llaveDelDispositivo() {
  let llave = localStorage.getItem("cuyobuss_llave");
  if (!llave) {
    llave = crypto.randomUUID();
    localStorage.setItem("cuyobuss_llave", llave);
  }
  return llave;
}

/** Muestra el inicio de sesión antes que cualquier otra cosa. */
export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [paseDispositivo, setPaseDispositivo] = useState(false);
  const [cargando, setCargando] = useState(true);
  const consultarEstado = useServerFn(estadoAcceso);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_evento, sesion) => {
      setSession(sesion);
      setCargando(false);
    });
    supabase.auth.getSession().then(({ data: { session: sesion } }) => {
      setSession(sesion);
      consultarEstado({ data: { llave: llaveDelDispositivo() } })
        .then((estado) => setPaseDispositivo(estado.vigente))
        .finally(() => setCargando(false));
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (cargando) {
    return (
      <div className="auth-screen">
        <p className="auth-loading">Cargando…</p>
      </div>
    );
  }

  if (!session && !paseDispositivo) {
    return <AuthForm onPaseActivado={() => setPaseDispositivo(true)} />;
  }

  return <>{children}</>;
}

function AuthForm({ onPaseActivado }: { onPaseActivado: () => void }) {
  const [modo, setModo] = useState<"entrar" | "crear">("crear");
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [documento, setDocumento] = useState("");
  const [mensajePase, setMensajePase] = useState<string | null>(null);
  const [verificandoPase, setVerificandoPase] = useState(false);
  const activarPase = useServerFn(paseMayor);

  async function verificarPase() {
    setMensajePase(null);
    setVerificandoPase(true);
    try {
      const resultado = await activarPase({
        data: { llave: llaveDelDispositivo(), documento },
      });
      if (resultado.ok) {
        onPaseActivado();
        return;
      }
      setMensajePase(resultado.motivo);
    } catch {
      setMensajePase("No pudimos verificar el DNI. Probá de nuevo.");
    } finally {
      setVerificandoPase(false);
    }
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setMensaje(null);
    setEnviando(true);
    try {
      if (modo === "entrar") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin, data: { nombre } },
        });
        if (error) throw error;
        if (!data.session) {
          setMensaje("Te mandamos un correo para confirmar tu cuenta. Revisá tu bandeja.");
        }
      }
    } catch (error) {
      const texto = error instanceof Error ? error.message : "No pudimos continuar.";
      setMensaje(
        texto.includes("Invalid login credentials")
          ? "Correo o contraseña incorrectos."
          : texto.includes("already registered")
            ? "Ese correo ya tiene cuenta. Iniciá sesión."
            : texto,
      );
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={enviar}>
        <div className="auth-brand">
          <CuyobussLogo className="mark" />
          CUYOBUSS
        </div>
        <h1 className="auth-title">
          {modo === "entrar" ? "Entrá a tu cuenta" : "Creá tu cuenta"}
        </h1>
        <p className="auth-sub">
          {modo === "crear"
            ? "Creá tu cuenta y probá 3 minutos gratis. Después, activá tu pase."
            : "Con tu correo y una contraseña alcanza."}
        </p>

        {modo === "crear" && (
          <>
            <label className="auth-label" htmlFor="nombre">
              Tu nombre
            </label>
            <input
              id="nombre"
              className="auth-input"
              autoComplete="name"
              required
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Damián"
            />
          </>
        )}
        <label className="auth-label" htmlFor="email">
          Correo
        </label>
        <input
          id="email"
          className="auth-input"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="vos@gmail.com"
        />

        <label className="auth-label" htmlFor="password">
          Contraseña
        </label>
        <input
          id="password"
          className="auth-input"
          type="password"
          autoComplete={modo === "entrar" ? "current-password" : "new-password"}
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Mínimo 6 caracteres"
        />

        {mensaje && <p className="auth-msg">{mensaje}</p>}

        <button className="btn auth-btn" type="submit" disabled={enviando}>
          {enviando ? "Un segundo…" : modo === "entrar" ? "Entrar" : "Crear cuenta"}
        </button>
        <button
          className="secondary"
          type="button"
          onClick={() => {
            setMensaje(null);
            setModo(modo === "entrar" ? "crear" : "entrar");
          }}
        >
          {modo === "entrar" ? "No tengo cuenta, quiero crearla" : "Ya tengo cuenta, quiero entrar"}
        </button>

        <div className="auth-free-pass">
          <strong>¿Tenés 57 años o más?</strong>
          <p>Tu pase es gratuito. Ingresá tu DNI o CUIL y accedé sin pagar.</p>
          <label className="auth-label" htmlFor="dni-mayor">
            DNI o CUIL
          </label>
          <input
            id="dni-mayor"
            className="auth-input"
            inputMode="numeric"
            autoComplete="off"
            maxLength={11}
            placeholder="Ej: 10234567"
            value={documento}
            onChange={(e) => setDocumento(e.target.value.replace(/\D/g, "").slice(0, 11))}
          />
          {mensajePase && <p className="auth-msg">{mensajePase}</p>}
          <button
            className="secondary auth-free-pass-button"
            type="button"
            disabled={verificandoPase || documento.length < 7}
            onClick={() => void verificarPase()}
          >
            {verificandoPase ? "Verificando…" : "Verificar y activar pase gratis"}
          </button>
        </div>
      </form>
    </div>
  );
}
