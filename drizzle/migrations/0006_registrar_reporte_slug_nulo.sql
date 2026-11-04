CREATE OR REPLACE FUNCTION public.registrar_reporte(
  _usuario_id uuid, _linea text, _stop_code text, _parada_slug text,
  _hora_programada text, _desvio_minutos integer, _espera_min integer DEFAULT 20)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(_usuario_id::text, 0));
  IF EXISTS (SELECT 1 FROM public.reportes_viaje WHERE usuario_id = _usuario_id
             AND created_at >= now() - make_interval(mins => _espera_min)) THEN
    RETURN false;
  END IF;
  INSERT INTO public.reportes_viaje(usuario_id, linea, stop_code, parada_slug, hora_programada, desvio_minutos)
  VALUES (_usuario_id, _linea, _stop_code, NULLIF(_parada_slug, ''), _hora_programada, _desvio_minutos);
  RETURN true;
END $$;