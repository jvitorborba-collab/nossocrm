-- Entradas de leads: permite mover um lead que JÁ existe no funil para a etapa configurada
-- (ex.: webhook "entrou na aula" avança o lead para a etapa "Entrou na aula").
-- Só avança (nunca puxa o lead para uma etapa anterior à que ele já está).
ALTER TABLE public.integration_inbound_sources
  ADD COLUMN IF NOT EXISTS move_existing BOOLEAN NOT NULL DEFAULT false;

-- Tag opcional aplicada ao lead quando a entrada é acionada (ex.: "entrou-na-aula").
ALTER TABLE public.integration_inbound_sources
  ADD COLUMN IF NOT EXISTS add_tag TEXT;
