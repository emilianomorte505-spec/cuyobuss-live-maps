CREATE TABLE public.horarios_import (parada_slug text, parada_nombre text, linea text, lv text[], sab text[], dom text[]);
GRANT ALL ON public.horarios_import TO service_role;
GRANT INSERT, SELECT ON public.horarios_import TO postgres;
ALTER TABLE public.horarios_import ENABLE ROW LEVEL SECURITY;