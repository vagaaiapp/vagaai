-- Migration 020: política RLS para o painel admin do blog
--
-- blog_posts só tinha políticas para anon (leitura de publicados) e
-- service_role. O painel /admin/blog opera com o access_token do usuário
-- admin (role authenticated) — sem política para esse role, TODAS as
-- operações eram negadas: listagem vinha vazia e salvar dava 403.
-- O painel nunca funcionou.
--
-- A allowlist espelha ADMIN_EMAILS de api/admin.js e admin/index.html.
-- (select auth.jwt()) — forma com initplan, avaliada uma vez por query.

CREATE POLICY blog_admin_all ON public.blog_posts
  FOR ALL
  TO authenticated
  USING (((SELECT auth.jwt()) ->> 'email') IN ('contato@vagaai.app.br', 'jvhr96@gmail.com'))
  WITH CHECK (((SELECT auth.jwt()) ->> 'email') IN ('contato@vagaai.app.br', 'jvhr96@gmail.com'));
