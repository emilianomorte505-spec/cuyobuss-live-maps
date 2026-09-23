CREATE TABLE public.reportes_viaje (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL,
  linea text NOT NULL,
  stop_code text NOT NULL,
  parada_slug text,
  hora_programada text,
  desvio_minutos integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_reportes_viaje_linea_fecha ON public.reportes_viaje (linea, created_at DESC);
CREATE INDEX idx_reportes_viaje_usuario_fecha ON public.reportes_viaje (usuario_id, created_at DESC);

GRANT SELECT, INSERT ON public.reportes_viaje TO authenticated;
GRANT SELECT ON public.reportes_viaje TO anon;
GRANT ALL ON public.reportes_viaje TO service_role;

ALTER TABLE public.reportes_viaje ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reportes visibles para todos"
  ON public.reportes_viaje FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Cada usuario reporta por si mismo"
  ON public.reportes_viaje FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = usuario_id);