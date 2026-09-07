import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

/* Dois defeitos que sairam da mesma raiz: a assinatura nao carregava o
   suficiente sobre a propria cobranca.

   1. O periodo (current_period_start/end) era lido so da raiz do objeto
      Subscription. A partir da API 2025-03-31.basil o Stripe moveu esses campos
      para items.data[], e o repo nao fixa Stripe-Version — a Pro ativa em
      producao esta com periodo NULL por causa disso.
   2. A periodicidade (mensal/trimestral/anual) era resolvida no webhook e
      jogada fora, entao o preco tinha de ser chutado pelo plano. Chute que
      mostrava R$39,90/mes para quem assina o Pro trimestral a R$29,90/mes. */

const ler = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const webhook = ler('api/webhook.js');
const subscription = ler('api/subscription.js');
const dashboard = ler('dashboard/index.html');
const migracao = ler('migrations/040_billing_interval.sql');

// Extrai periodoDaSubscription do fonte para exercitar a funcao de verdade.
function carregarPeriodo() {
  const inicio = webhook.indexOf('function periodoDaSubscription');
  assert.ok(inicio > 0, 'periodoDaSubscription sumiu de api/webhook.js');
  const fim = webhook.indexOf('\n}', inicio);
  assert.ok(fim > inicio, 'nao achei o fim de periodoDaSubscription');
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(webhook.slice(inicio, fim + 2) + '; this.fn = periodoDaSubscription;', sandbox);
  return sandbox.fn;
}

describe('periodo da assinatura: raiz ou item (versao da API do Stripe)', () => {
  const bruto = carregarPeriodo();
  /* O objeto sai do vm, ou seja, de outro realm: seu prototipo nao e o
     Object.prototype deste modulo e deepStrictEqual reprovaria valores
     identicos. Recopia os campos para comparar conteudo, nao realm. */
  const periodo = (sub) => { const r = bruto(sub); return { start: r.start, end: r.end }; };

  it('le da raiz — payload das versoes antigas', () => {
    assert.deepEqual(
      periodo({ current_period_start: 100, current_period_end: 200 }),
      { start: 100, end: 200 }
    );
  });

  it('le do item — payload de 2025-03-31.basil em diante', () => {
    assert.deepEqual(
      periodo({ items: { data: [{ current_period_start: 300, current_period_end: 400 }] } }),
      { start: 300, end: 400 }
    );
  });

  it('a raiz ganha quando os dois existem', () => {
    assert.deepEqual(
      periodo({
        current_period_start: 100, current_period_end: 200,
        items: { data: [{ current_period_start: 300, current_period_end: 400 }] },
      }),
      { start: 100, end: 200 }
    );
  });

  it('sem periodo em lugar nenhum devolve null, nao undefined', () => {
    assert.deepEqual(periodo({}), { start: null, end: null });
    assert.deepEqual(periodo({ items: { data: [] } }), { start: null, end: null });
    assert.deepEqual(periodo(null), { start: null, end: null });
  });

  it('so aceita numero: string do Stripe nao passa como epoch', () => {
    assert.deepEqual(
      periodo({ current_period_start: '100', items: { data: [{ current_period_start: 300 }] } }),
      { start: 300, end: null }
    );
  });

  it('o webhook usa o periodo resolvido, nao o campo cru', () => {
    assert.match(webhook, /const periodo = periodoDaSubscription\(sub\)/);
    assert.match(webhook, /periodo\.end, periodo\.start/);
    // dedup de past_due tambem, senao um payload novo geraria sempre a chave "_x"
    assert.match(webhook, /payfail_\$\{sub\.id\}_\$\{periodo\.end \|\| 'x'\}/);
    assert.doesNotMatch(webhook, /sub\.status, sub\.current_period_end/);
  });
});

describe('periodicidade de cobranca e preco', () => {
  it('a migracao 040 cria a coluna anulavel e restringe os valores', () => {
    assert.match(migracao, /ADD COLUMN IF NOT EXISTS billing_interval TEXT/);
    assert.match(migracao, /billing_interval IS NULL OR billing_interval IN \('mensal', 'trimestral', 'anual'\)/);
  });

  it('o webhook grava a periodicidade que ja resolvia no PRICE_PLAN_MAP', () => {
    assert.match(webhook, /if \(billing\) body\.billing_interval = billing;/);
    assert.match(webhook, /planInfo\.billing\);/);
  });

  it('o cancelamento nao apaga a periodicidade ja gravada', () => {
    // o 'deleted' chama sem billing, entao o if nao poe a coluna no body
    assert.match(webhook, /upsertSubscription\(userId, sub\.id, customerId, 'free', 'canceled', null, null\)/);
  });

  it('o preco e chaveado por plano E periodicidade', () => {
    assert.match(subscription, /'pro:trimestral':\s+'R\$29,90\/mês'/);
    assert.match(subscription, /'pro:mensal':\s+'R\$39,90\/mês'/);
    assert.doesNotMatch(subscription, /const precos = \{ starter:/);
  });

  it('periodicidade desconhecida devolve null em vez de chutar a mensal', () => {
    assert.match(subscription, /isActiveSub && billing \? \(PRECOS\[/);
  });

  it('o dashboard usa o preco do backend, nao um hardcode por plano', () => {
    assert.match(dashboard, /var price = plan === 'free' \? 'R\$0' : \(sub\.preco \|\| '-'\)/);
    assert.doesNotMatch(dashboard, /var price = plan === 'pro' \? 'R\$39,90/);
  });
});
