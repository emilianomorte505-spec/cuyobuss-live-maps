CREATE TABLE public.pases_jubilado (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  usuario_id uuid NOT NULL UNIQUE,
  documento text NOT NULL UNIQUE,
  tipo_documento text NOT NULL DEFAULT 'dni',
  activo boolean NOT NULL DEFAULT true,
  vence timestamptz NOT NULL DEFAULT (now() + interval '365 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.pases_jubilado TO authenticated;
GRANT ALL ON public.pases_jubilado TO service_role;
ALTER TABLE public.pases_jubilado ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ver mi pase jubilado" ON public.pases_jubilado FOR SELECT TO authenticated USING (auth.uid() = usuario_id OR public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Crear mi pase jubilado" ON public.pases_jubilado FOR INSERT TO authenticated WITH CHECK (auth.uid() = usuario_id);
CREATE POLICY "Admin edita pases jubilado" ON public.pases_jubilado FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE OR REPLACE FUNCTION public.tocar_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
CREATE TRIGGER pases_jubilado_updated_at BEFORE UPDATE ON public.pases_jubilado FOR EACH ROW EXECUTE FUNCTION public.tocar_updated_at();

CREATE TABLE public.clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  llave text NOT NULL UNIQUE,
  email text,
  nombre text,
  origen text NOT NULL DEFAULT 'prueba',
  documento text UNIQUE,
  monto numeric NOT NULL DEFAULT 0,
  mp_pago_id text UNIQUE,
  pagado_en timestamptz NOT NULL DEFAULT now(),
  vence timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.clientes TO authenticated;
GRANT ALL ON public.clientes TO service_role;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin ve clientes" ON public.clientes FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER clientes_updated_at BEFORE UPDATE ON public.clientes FOR EACH ROW EXECUTE FUNCTION public.tocar_updated_at();

CREATE TABLE public.pruebas_cortesia (huella text NOT NULL, llave text NOT NULL, inicio timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (huella, llave));
CREATE INDEX pruebas_cortesia_llave_idx ON public.pruebas_cortesia(llave);
CREATE INDEX pruebas_cortesia_huella_idx ON public.pruebas_cortesia(huella);
GRANT ALL ON public.pruebas_cortesia TO service_role;
ALTER TABLE public.pruebas_cortesia ENABLE ROW LEVEL SECURITY;

REVOKE EXECUTE ON FUNCTION public.crear_perfil() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;