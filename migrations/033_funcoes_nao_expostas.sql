-- 033_funcoes_nao_expostas.sql — tira do PostgREST as funções que as 028 e 031 expuseram
--
-- Autocrítica das duas migrações anteriores. Toda função criada em `public`
-- herda EXECUTE de PUBLIC por padrão, e o PostgREST publica tudo que está em
-- `public` como `/rest/v1/rpc/<nome>`. As duas passaram a aparecer no linter:
--
--   registrar_versao_cv()  é função de TRIGGER. Chamá-la pela API dá erro
--                          ("trigger functions can only be called as
--                          triggers"), então não é explorável — mas é
--                          SECURITY DEFINER pendurada numa rota pública, e
--                          superfície que não serve para nada deve sumir.
--                          Revogar EXECUTE não afeta o trigger: o Postgres
--                          confere a permissão no CREATE TRIGGER, não a cada
--                          disparo.
--
--   e_admin()              devolve se QUEM CHAMA é admin, lendo o próprio JWT.
--                          Não vaza a lista nem o estado de terceiros. Mas
--                          `anon` chamando isso não tem uso nenhum, e a
--                          migração 031 só quis conceder a `authenticated` —
--                          o acesso de anon veio do padrão do PUBLIC, não de
--                          uma decisão.
--
-- `authenticated` mantém EXECUTE em e_admin() porque a política blog_admin_all
-- é avaliada com o papel de quem consulta: sem esse EXECUTE, o painel do blog
-- para de funcionar.

BEGIN;

REVOKE EXECUTE ON FUNCTION public.registrar_versao_cv() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.e_admin() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.e_admin() TO authenticated;

COMMIT;
