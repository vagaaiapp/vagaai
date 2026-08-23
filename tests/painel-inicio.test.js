import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/* Coerência entre o que o card "Faça agora" promete e para onde ele leva.
   Todos os casos aqui foram encontrados olhando a tela de Início com o produto
   aberto, não lendo o código: o botão principal mandava analisar outra vaga
   depois de dizer para revisar o currículo. */

const dash = fs.readFileSync(new URL('../dashboard/index.html', import.meta.url), 'utf8');
const carta = fs.readFileSync(new URL('../carta/index.html', import.meta.url), 'utf8');
const curriculo = fs.readFileSync(new URL('../curriculo/index.html', import.meta.url), 'utf8');

describe('o botão principal leva ao lugar que a copy manda', () => {
  it('vai para o currículo com foco nas lacunas, não para o analisador em branco', () => {
    assert.match(dash, /btnPri\.textContent = 'Revisar meu currículo →';/);
    assert.match(dash, /switchDashTab\('curriculo', '\/curriculo\?foco=lacunas'\)/);
  });

  it('não sobrou o destino antigo', () => {
    assert.doesNotMatch(
      dash,
      /'Otimizar meu currículo →'/,
      'o rótulo antigo prometia otimização e caía no formulário de análise'
    );
  });

  it('/curriculo sabe receber ?foco=lacunas', () => {
    // Sem isso o link levaria ao topo da página e a pessoa procuraria sozinha
    // o painel que ela acabou de pedir.
    assert.match(curriculo, /get\('foco'\) !== 'lacunas'/);
    assert.match(curriculo, /panel\.scrollIntoView/);
  });
});

describe('o card não oferece o que o plano não libera', () => {
  it('calcula se o treino está liberado antes de montar o texto', () => {
    assert.match(dash, /var treinoLiberado = !_planoPba \|\| _planoPba === 'pro' \|\| !!_entPba\.simulador_entrevista;/);
  });

  it('avisa quando o treino é do Pro', () => {
    assert.match(dash, /treinoLiberado \? '' : ' O treino de entrevista é do plano Pro\.'/);
  });

  it('assinatura ainda não carregada não pisca cadeado', () => {
    // `!_planoPba` entra como liberado de propósito: mostrar cadeado errado
    // para quem paga é pior que mostrá-lo meio segundo depois.
    const trecho = dash.slice(dash.indexOf('var _subPba'), dash.indexOf('if (interviewJob) {'));
    assert.match(trecho, /!_planoPba \|\|/);
  });
});

describe('a vaga em foco não se perde entre os blocos', () => {
  it('a carta recebe o analysis_id da vaga que o card escolheu', () => {
    assert.match(dash, /var vagaEmFoco = _pbaChosen && _pbaChosen\.analysisId;/);
    assert.match(dash, /\/carta\?analysis_id=/);
  });

  it('sem vaga em foco, abre a carta sem parâmetro em vez de quebrar', () => {
    // O fim tem que ser procurado A PARTIR do início: `strip.innerHTML` também
    // aparece antes no arquivo, e o slice saía vazio.
    const ini = dash.indexOf('var acaoCarta');
    assert.ok(ini > 0, 'não achei acaoCarta');
    const trecho = dash.slice(ini, dash.indexOf('strip.innerHTML', ini));
    assert.match(trecho, /: "switchDashTab\('carta'\)"/);
  });

  it('/carta sabe receber analysis_id', () => {
    assert.match(carta, /params\.get\('analysis_id'\)/);
  });

  it('_pbaChosen já está definido quando a faixa monta', () => {
    // buildFerramentas lê _pbaChosen; se rodasse antes de buildPBACard, o
    // parâmetro sairia sempre vazio e o defeito voltaria em silêncio.
    const ordem = dash.indexOf('_pbaChosen = buildPBACard');
    const uso = dash.indexOf('buildFerramentas();', ordem);
    assert.ok(ordem > 0 && uso > ordem, 'buildFerramentas precisa rodar depois de buildPBACard');
  });
});

describe('empresa desconhecida não vira a palavra "Empresa"', () => {
  it('o fallback é vazio', () => {
    assert.doesNotMatch(
      dash,
      /ji\.empresa \|\| \(untrackedBest \? 'Empresa' : ''\)/,
      'anúncio sem empresa fazia o card escrever "na Empresa" como se fosse o nome'
    );
    assert.match(dash, /var emp = ji\.empresa \|\| '';/);
  });
});
