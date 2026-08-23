import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/* Guardas do que a varredura de isolamento arrumou. Não substituem a revisão
   das políticas no banco — testam o lado do código, que é o que regride sem
   ninguém perceber. */

const ler = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const admin = ler('api/admin.js');
const analyze = ler('api/analyze.js');

describe('quem é admin tem uma fonte só', () => {
  it('api/admin.js não carrega a lista de e-mails', () => {
    assert.doesNotMatch(
      admin,
      /ADMIN_EMAILS\s*=\s*\[/,
      'a lista voltou para o código; ela mora em public.admins (migração 031)'
    );
    assert.match(admin, /rest\/v1\/admins\?email=eq\./);
  });

  it('o controle de acesso falha fechado', () => {
    // Se a consulta não responder, ninguém entra. Controle de acesso que abre
    // quando a infraestrutura tosse não é controle de acesso.
    const fn = admin.slice(admin.indexOf('async function isAdmin'), admin.indexOf('async function auditar'));
    assert.match(fn, /if \(!res\.ok\) \{[\s\S]*return false;/);
    assert.match(fn, /catch \(err\) \{[\s\S]*return false;/);
  });

  it('as ações sensíveis deixam rastro', () => {
    for (const acao of ['ler_painel', 'remover_usuario', 'ajustar_creditos']) {
      assert.ok(admin.includes(`'${acao}'`), `sem auditoria de ${acao}`);
    }
  });

  it('a auditoria não grava conteúdo de cliente', () => {
    const chamadas = admin.match(/auditar\([^)]*\)/g) || [];
    assert.ok(chamadas.length >= 3);
    for (const c of chamadas) {
      assert.doesNotMatch(c, /result|cv_data|curriculo|job_excerpt/i, `auditoria carregando conteúdo: ${c}`);
    }
  });
});

describe('cache de análise tem dono e prazo', () => {
  it('grava o user_id de quem gerou', () => {
    assert.match(analyze, /setCachedResult\(hash, result, authenticatedUserId\)/);
    assert.match(analyze, /user_id: userId \|\| null/);
  });

  it('dispara a limpeza por idade', () => {
    assert.match(analyze, /rpc\/limpar_analysis_cache/);
  });
});

describe('log não vira depósito de dado pessoal', () => {
  it('o erro de onboarding_cv descreve a forma, não o conteúdo', () => {
    assert.doesNotMatch(
      analyze,
      /obText\.slice\(0, 300\)/,
      'voltou a despejar 300 caracteres do currículo montado pela IA no log da Vercel'
    );
    assert.match(analyze, /onboarding_cv: JSON inválido \| chars=/);
  });
});

describe('rate limit não vive na memória do processo', () => {
  // Map por instância serverless: o teto real era o configurado vezes o número
  // de instâncias quentes, e zerava a cada cold start.
  for (const arquivo of ['api/fetch-job.js', 'api/support.js', 'api/generate-cv-pdf.js']) {
    it(arquivo, () => {
      const src = ler(arquivo);
      assert.match(src, /from '\.\.\/lib\/ratelimit\.js'/);
      assert.doesNotMatch(src, /_ipHits|_userHits/, 'voltou o Map em memória');
    });
  }
});

describe('as migrações da varredura estão versionadas', () => {
  const esperadas = [
    '027_cv_generations.sql',
    '028_cv_saves_history.sql',
    '029_retencao_e_cascata.sql',
    '030_grants_lockdown.sql',
    '031_admins_e_auditoria.sql'
  ];
  const existentes = fs.readdirSync(new URL('../migrations/', import.meta.url));

  for (const m of esperadas) {
    it(m, () => assert.ok(existentes.includes(m), `${m} sumiu de migrations/`));
  }

  it('toda função SECURITY DEFINER nova fixa o search_path', () => {
    // Sem search_path fixo, um search_path manipulado na sessão resolve o nome
    // da tabela para outro schema.
    for (const m of esperadas) {
      const bruto = fs.readFileSync(new URL('../migrations/' + m, import.meta.url), 'utf8');
      // Os comentários dessas migrações explicam por que SECURITY DEFINER exige
      // search_path — contar o texto do comentário como se fosse declaração
      // reprovava o arquivo que estava certo.
      const sql = bruto.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
      const definers = (sql.match(/SECURITY DEFINER/g) || []).length;
      const paths = (sql.match(/SET search_path/g) || []).length;
      assert.equal(paths, definers, `${m}: ${definers} SECURITY DEFINER e ${paths} SET search_path`);
    }
  });
});
