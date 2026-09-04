import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const migration = read('migrations/037_support_inbox.sql');
const supportApi = read('api/support.js');
const adminApi = read('api/admin.js');
const adminHtml = read('admin/index.html');
const adminCss = read('assets/admin-support.css');

test('mensagens de suporte ganham persistencia privada e historico', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.support_tickets/i);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.support_replies/i);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/i);
  assert.match(migration, /REVOKE ALL ON TABLE public\.support_tickets FROM PUBLIC, anon, authenticated/i);
  assert.match(migration, /REVOKE ALL ON TABLE public\.support_replies FROM PUBLIC, anon, authenticated/i);
  assert.match(migration, /status IN \('new', 'in_progress', 'waiting_user', 'resolved'\)/i);
});

test('envio atual continua por e-mail e registra o chamado sem misturar lead comercial', () => {
  assert.match(supportApi, /const ticket = await createSupportTicket\(/);
  assert.match(supportApi, /markSupportNotification\(ticket\?\.id, 'sent'/);
  assert.match(supportApi, /sendAutoReply\(contactEmail, false\)/);
  assert.match(supportApi, /body\.type === 'company-lead'/);
  assert.ok(
    supportApi.indexOf("body.type === 'company-lead'") < supportApi.indexOf('const ticket = await createSupportTicket'),
    'lead de empresa deve sair antes da persistencia de suporte'
  );
});

test('admin lista organiza responde e audita chamados pela fronteira existente', () => {
  assert.match(adminApi, /req\.query\.action === 'support'/);
  assert.match(adminApi, /action === 'update_support_ticket'/);
  assert.match(adminApi, /action === 'reply_support_ticket'/);
  assert.match(adminApi, /auditar\(user\.email, 'ler_suporte'/);
  assert.match(adminApi, /auditar\(user\.email, 'atualizar_chamado'/);
  assert.match(adminApi, /auditar\(user\.email, 'responder_chamado'/);
  assert.match(adminApi, /migration_037_pending/);
});

test('central oferece contexto do cliente, indicadores e todos os filtros combinados', () => {
  assert.match(adminHtml, /data-tab="support"/);
  assert.match(adminHtml, /id="supportNavBadge"/);
  assert.match(adminHtml, /id="supportSearch"/);
  assert.match(adminHtml, /id="supportStatusFilter"/);
  assert.match(adminHtml, /id="supportCategoryFilter"/);
  assert.match(adminHtml, /id="supportPeriodFilter"/);
  assert.match(adminHtml, /id="supportPlanFilter"/);
  assert.match(adminHtml, /option value="starter">Plano Starter/);
  assert.match(adminHtml, /id="supportAdminNotes"/);
  assert.match(adminHtml, /id="supportReplyMessage"/);
  assert.match(adminHtml, /customer\.last_sign_in_at/);
});

test('interface de suporte responde em desktop e mobile sem gradientes genéricos', () => {
  assert.match(adminCss, /grid-template-columns: minmax\(300px, 360px\) minmax\(0, 1fr\)/);
  assert.match(adminCss, /@media \(max-width: 980px\)/);
  assert.match(adminCss, /@media \(max-width: 720px\)/);
  assert.match(adminCss, /@media \(max-width: 480px\)/);
  assert.doesNotMatch(adminCss, /linear-gradient|radial-gradient/);
});
