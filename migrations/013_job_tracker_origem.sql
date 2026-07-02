-- Coluna de procedência da candidatura no rastreador.
-- Sem ela, o insert "Salvar vaga do alerta" (dashboard) era rejeitado pelo PostgREST
-- e a métrica "candidaturas dos alertas" nunca contava nada.
ALTER TABLE public.job_tracker
  ADD COLUMN IF NOT EXISTS origem text;

COMMENT ON COLUMN public.job_tracker.origem IS
  'Procedência do registro: alerta | analise | manual (null = legado/desconhecido)';

CREATE INDEX IF NOT EXISTS job_tracker_origem_idx
  ON public.job_tracker (user_id, origem);
