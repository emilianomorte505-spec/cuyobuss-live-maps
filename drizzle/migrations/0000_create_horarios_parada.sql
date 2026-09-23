CREATE TABLE public.horarios_parada (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parada_slug text NOT NULL,
  parada_nombre text NOT NULL,
  linea text NOT NULL,
  lv text[] NOT NULL DEFAULT '{}',
  sab text[] NOT NULL DEFAULT '{}',
  dom text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (parada_slug, linea)
);

CREATE INDEX horarios_parada_slug_idx ON public.horarios_parada (parada_slug);
CREATE INDEX horarios_parada_linea_idx ON public.horarios_parada (linea);

GRANT SELECT ON public.horarios_parada TO anon;
GRANT SELECT ON public.horarios_parada TO authenticated;
GRANT ALL ON public.horarios_parada TO service_role;

ALTER TABLE public.horarios_parada ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Horarios son publicos para lectura"
ON public.horarios_parada
FOR SELECT
TO anon, authenticated
USING (true);