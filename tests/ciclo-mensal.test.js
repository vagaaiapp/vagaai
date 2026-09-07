import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { inicioDoCiclo } from '../lib/cotas.js';

/* A cota mensal precisa ser mensal para TODA periodicidade de cobranca.
   current_period_start e o inicio do periodo de COBRANCA: no Pro trimestral
   (vendido no painel a R$29,90/mes) ele so avanca a cada 3 meses, no anual a
   cada 12. Usar a data crua como ancora dava 100 analises por trimestre em vez
   de 100 por mes — e o assinante que gastasse a cota no primeiro mes ficava
   bloqueado nos dois seguintes, pagando, enquanto o painel prometia uma data de
   reset que nao acontecia. */

// inicioDoCiclo le a hora do sistema; congela o relogio para o teste ser
// deterministico em qualquer dia do mes.
function comAgora(iso, fn) {
  const Real = Date;
  const fixo = new Real(iso).getTime();
  class Fake extends Real {
    constructor(...args) { super(...(args.length ? args : [fixo])); }
    static now() { return fixo; }
  }
  global.Date = Fake;
  try { return fn(); } finally { global.Date = Real; }
}

const ancora = (periodStart, agora) =>
  comAgora(agora, () => inicioDoCiclo({ current_period_start: periodStart }));

describe('inicioDoCiclo — ancora do ciclo mensal', () => {
  it('plano MENSAL: a ancora e o proprio current_period_start (rolagem e no-op)', () => {
    assert.equal(
      ancora('2026-03-15T10:00:00.000Z', '2026-03-20T12:00:00.000Z'),
      '2026-03-15T10:00:00.000Z'
    );
  });

  it('plano TRIMESTRAL: rola mes a mes dentro do trimestre — este era o bug', () => {
    const inicio = '2026-01-10T08:00:00.000Z';
    assert.equal(ancora(inicio, '2026-01-20T00:00:00.000Z'), '2026-01-10T08:00:00.000Z');
    assert.equal(ancora(inicio, '2026-02-20T00:00:00.000Z'), '2026-02-10T08:00:00.000Z');
    assert.equal(ancora(inicio, '2026-03-20T00:00:00.000Z'), '2026-03-10T08:00:00.000Z');
  });

  it('plano ANUAL: continua mensal no 11o mes, nao anual', () => {
    assert.equal(
      ancora('2026-01-05T00:00:00.000Z', '2026-11-09T00:00:00.000Z'),
      '2026-11-05T00:00:00.000Z'
    );
  });

  it('antes do dia de virada, a ancora e a do mes anterior', () => {
    // Ciclo vira dia 20; hoje e dia 5 → o ciclo em curso comecou em 20/02.
    assert.equal(
      ancora('2026-01-20T00:00:00.000Z', '2026-03-05T00:00:00.000Z'),
      '2026-02-20T00:00:00.000Z'
    );
  });

  it('ciclo que comeca dia 31 nao vaza para o mes seguinte', () => {
    // 31/01 + 1 mes e 28/02, nao 03/03: somar sempre a partir da data original
    // impede a deriva de alguns dias acumulada a cada virada.
    assert.equal(
      ancora('2026-01-31T00:00:00.000Z', '2026-02-28T12:00:00.000Z'),
      '2026-02-28T00:00:00.000Z'
    );
    assert.equal(
      ancora('2026-01-31T00:00:00.000Z', '2026-04-15T00:00:00.000Z'),
      '2026-03-31T00:00:00.000Z'
    );
  });

  it('sem periodo conhecido, cai no primeiro dia do mes corrente', () => {
    assert.equal(
      comAgora('2026-05-17T00:00:00.000Z', () => inicioDoCiclo(null)),
      '2026-05-01T00:00:00.000Z'
    );
    assert.equal(
      comAgora('2026-05-17T00:00:00.000Z', () => inicioDoCiclo({ current_period_start: 'nao-e-data' })),
      '2026-05-01T00:00:00.000Z'
    );
  });

  it('a ancora nunca fica no futuro', () => {
    const iso = ancora('2026-06-10T00:00:00.000Z', '2026-06-01T00:00:00.000Z');
    assert.ok(new Date(iso).getTime() <= new Date('2026-06-01T00:00:00.000Z').getTime());
  });
});

describe('reset de analises usa a mesma ancora que cartas e treinos', () => {
  const analyze = fs.readFileSync(new URL('../api/analyze.js', import.meta.url), 'utf8');
  const rpc = fs.readFileSync(
    new URL('../migrations/039_ciclo_mensal_planos_longos.sql', import.meta.url), 'utf8'
  );

  it('api/analyze.js compara analyses_reset_at contra inicioDoCiclo', () => {
    assert.match(analyze, /import \{ inicioDoCiclo \} from '\.\.\/lib\/cotas\.js'/);
    assert.match(analyze, /const ancora = new Date\(inicioDoCiclo\(sub\)\)\.getTime\(\)/);
  });

  it('api/analyze.js nao volta a ancorar em current_period_start cru', () => {
    assert.doesNotMatch(analyze, /resetAt < new Date\(sub\.current_period_start\)/);
  });

  it('a RPC (trava de verdade) usa inicio_do_ciclo_mensal', () => {
    assert.match(rpc, /CREATE OR REPLACE FUNCTION public\.inicio_do_ciclo_mensal/);
    assert.match(
      rpc,
      /analyses_reset_at < public\.inicio_do_ciclo_mensal\(v_sub\.current_period_start\)/
    );
  });

  it('a RPC continua sendo a trava atomica e fechada ao cliente', () => {
    assert.match(rpc, /FOR UPDATE/);
    assert.match(rpc, /REVOKE EXECUTE ON FUNCTION check_and_increment_analyses\(UUID\) FROM PUBLIC, anon, authenticated/);
    assert.match(rpc, /GRANT  EXECUTE ON FUNCTION check_and_increment_analyses\(UUID\) TO service_role/);
  });

  it('a RPC nao mexeu nos tetos (10 starter / 100 pro)', () => {
    assert.match(rpc, /v_starter_cap  CONSTANT INTEGER := 10/);
    assert.match(rpc, /v_pro_cap      CONSTANT INTEGER := 100/);
  });
});
