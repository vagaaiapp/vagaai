import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/* Um recurso, um nome. O treino de entrevista chegou a ter quatro nomes ao
   mesmo tempo — "Entrevistas" na sidebar, "Treino de entrevista" no dashboard,
   "Simulador de Entrevista" no <title> e na tela, e um quarto na mensagem de
   bloqueio que a pessoa lê no momento exato em que decide se paga. O menu
   tinha cinco vocabulários espalhados, um deles escrevendo "Conta e Plano"
   com P maiúsculo.

   O canônico é o vocabulário do dashboard: nomeia o que a pessoa faz, não o
   que o sistema é. */

const ler = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');

const CANONICO = {
  painel: 'Início',
  app: 'Analisar vaga',
  curriculo: 'Meu currículo',
  vagas: 'Candidaturas',
  entrevistas: 'Treino de entrevista',
  carta: 'Carta de apresentação',
  alertas: 'Vagas para você',
  plano: 'Conta e plano'
};

/* Termos aposentados e onde ainda podem aparecer. Comentário que conta a
   história de uma mudança é prosa sobre o passado, não rótulo — por isso a
   checagem ignora linhas de comentário. */
const APOSENTADOS = [
  'Carta para vaga',
  'Simulador de Entrevista',
  'Conta e Plano'
];

const ARQUIVOS = [
  'sidebar.js',
  'app/index.html',
  'carta/index.html',
  'curriculo/index.html',
  'cv/index.html',
  'dashboard/index.html',
  'entrevista/index.html'
];

function linhasDeCodigo(fonte) {
  // Comentário de bloco pode ter linhas que não começam com nenhum marcador —
  // filtrar por prefixo deixava passar o meio de um /* ... */. Tira os blocos
  // inteiros primeiro, depois as linhas de comentário de uma linha só. O `//`
  // é removido apenas quando abre a linha, para não cortar em "https://".
  const semBlocos = fonte
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  return semBlocos.split('\n').filter(l => !l.trim().startsWith('//'));
}

describe('glossário canônico', () => {
  it('a sidebar usa o vocabulário do dashboard', () => {
    // sidebar.js escreve os acentos como escape \\uXXXX.
    const src = ler('sidebar.js').replace(/\\u([0-9a-f]{4})/gi, (_, h) =>
      String.fromCharCode(parseInt(h, 16))
    );
    for (const [id, label] of Object.entries(CANONICO)) {
      assert.ok(
        src.includes("label: '" + label + "'"),
        `sidebar.js não usa o nome canônico de ${id}: "${label}"`
      );
    }
  });

  for (const arquivo of ARQUIVOS) {
    it(`${arquivo} não ressuscita termo aposentado`, () => {
      const codigo = linhasDeCodigo(ler(arquivo));
      for (const termo of APOSENTADOS) {
        const achou = codigo.filter(l => l.includes(termo));
        assert.equal(
          achou.length, 0,
          `${arquivo} voltou a usar "${termo}":\n  ${achou[0]?.trim().slice(0, 120)}`
        );
      }
    });
  }

  it('o bloqueio do Pro usa o nome canônico e diz o ganho', () => {
    const src = ler('api/interview.js');
    const linha = src.split('\n').find(l => l.includes('message:') && l.includes('Pro'));
    assert.ok(linha, 'não achei a mensagem do gate');
    assert.match(linha, /Treino de entrevista/);
    assert.match(linha, /8 perguntas/, 'a mensagem precisa dizer o que a pessoa leva, não só a regra');
  });

  it('/app mantém o título indexável', () => {
    // Única página do produto com robots="index, follow": o título dela é
    // busca orgânica, não navegação, e não segue o glossário de propósito.
    const src = ler('app/index.html');
    assert.match(src, /name="robots" content="index, follow"/);
    assert.match(src, /<title>VagaAI \| Analisar minha vaga grátis<\/title>/);
  });
});
