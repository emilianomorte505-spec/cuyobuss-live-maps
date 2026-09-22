import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { CuyobussLogo } from "./CuyobussLogo";

/** Muestra el inicio de sesión antes que cualquier otra cosa. */
export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_evento, sesion) => {
      setSession(sesion);
      setCargando(false);
    });
    supabase.auth.getSession().then(({ data: { session: sesion } }) => {
      setSession(sesion);
      setCargando(false);
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

  if (!session) return <AuthForm />;

  return <>{children}</>;
}

function AuthForm() {
  const [modo, setModo] = useState<"entrar" | "crear">("entrar");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

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
          options: { emailRedirectTo: window.location.origin },
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
        <p className="auth-sub">Con tu correo y una contraseña alcanza.</p>

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
      </form>
    </div>
  );
}
