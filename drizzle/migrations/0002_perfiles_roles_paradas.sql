CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Cada uno ve sus roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE TABLE public.perfiles (
  id uuid PRIMARY KEY,
  email text,
  nombre text,
  suscripcion_activa boolean NOT NULL DEFAULT false,
  suscripcion_hasta timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  ultimo_acceso timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.perfiles TO authenticated;
GRANT ALL ON public.perfiles TO service_role;
ALTER TABLE public.perfiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ver mi perfil" ON public.perfiles FOR SELECT TO authenticated USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Crear mi perfil sin suscripcion" ON public.perfiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id AND suscripcion_activa = false);
GRANT UPDATE ON public.perfiles TO authenticated;
CREATE POLICY "Admin actualiza perfiles" ON public.perfiles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.crear_perfil()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.perfiles (id, email, nombre)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'nombre')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER al_crear_usuario AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.crear_perfil();

INSERT INTO public.perfiles (id, email) SELECT id, email FROM auth.users ON CONFLICT DO NOTHING;

CREATE TABLE public.paradas (
  code text PRIMARY KEY,
  nombre text NOT NULL,
  zona text NOT NULL DEFAULT 'San Juan',
  sentido text NOT NULL DEFAULT 'Hacia el Centro',
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  lineas jsonb NOT NULL DEFAULT '[]'::jsonb,
  planilla text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.paradas TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.paradas TO authenticated;
GRANT ALL ON public.paradas TO service_role;
ALTER TABLE public.paradas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Paradas publicas" ON public.paradas FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admin crea paradas" ON public.paradas FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin edita paradas" ON public.paradas FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin borra paradas" ON public.paradas FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));