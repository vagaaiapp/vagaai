from pathlib import Path
import html

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "planejamento-completo-vagaai"
OUT_DIR.mkdir(exist_ok=True)

HTML_PATH = OUT_DIR / "Planejamento Completo VagaAI.html"
MD_PATH = OUT_DIR / "Planejamento Completo VagaAI.md"

brand = {
    "forest": "#0A1A10",
    "deep": "#0D5A35",
    "emerald": "#1A7A4A",
    "bright": "#4ECE91",
    "paper": "#F5F7F5",
    "card": "#FFFFFF",
    "ink": "#071209",
    "text": "#254B34",
    "muted": "#6E8A78",
    "border": "#DDE8E2",
    "amber": "#C47D0A",
    "red": "#D94F4F",
}


def esc(value):
    return html.escape(str(value), quote=True)


def table(headers, rows, cls=""):
    head = "".join(f"<th>{esc(h)}</th>" for h in headers)
    body = []
    for row in rows:
        body.append("<tr>" + "".join(f"<td>{cell}</td>" for cell in row) + "</tr>")
    return f'<table class="{cls}"><thead><tr>{head}</tr></thead><tbody>{"".join(body)}</tbody></table>'


def bullets(items):
    return "<ul>" + "".join(f"<li>{item}</li>" for item in items) + "</ul>"


def card(title, text, tag=None):
    tag_html = f'<div class="tag">{esc(tag)}</div>' if tag else ""
    return f'<div class="mini-card">{tag_html}<h4>{esc(title)}</h4><p>{text}</p></div>'


sections = []

sections.append(
    """
    <section class="cover" id="inicio">
      <div class="cover-copy">
        <div class="kicker">Planejamento estrategico completo</div>
        <h1>VagaAI: da vaga certa a uma candidatura mais forte.</h1>
        <p>Documento executivo baseado na estrutura de plano de negocios ja adotada no projeto, expandido para orientar produto, aquisicao, monetizacao, operacao, marca, jornada do usuario e prioridades dos proximos ciclos.</p>
        <div class="cover-actions">
          <span>Versao interna</span>
          <span>Base: plano interno de 05/07/2026</span>
          <span>Atualizado em 07/07/2026</span>
        </div>
      </div>
      <div class="cover-panel">
        <div class="panel-top"><span></span><span></span><span></span><b>VagaAI - Plano</b></div>
        <div class="score-ring"><strong>90</strong><small>dias</small></div>
        <div class="bar"><span style="width:82%"></span><b>Aquisicao e ativacao</b></div>
        <div class="bar"><span style="width:72%"></span><b>Retencao por alertas</b></div>
        <div class="bar amber"><span style="width:58%"></span><b>Produto e confiabilidade</b></div>
        <div class="panel-note">Prioridade: provar aquisicao com produto estavel antes de ampliar escopo.</div>
      </div>
    </section>
    """
)

sections.append(
    """
    <section class="section" id="sumario">
      <div class="sec-label">00 / Leitura executiva</div>
      <h2>Resumo em uma pagina</h2>
      <p class="lead">O VagaAI deve ser tratado como um sistema de candidatura, nao apenas como um gerador de curriculo. O diferencial defensavel esta em conectar dados da vaga, diagnostico, materiais, acompanhamento e preparo em uma jornada unica.</p>
      <div class="grid-4">
        <div class="metric"><b>Oferta central</b><span>Clareza, estrategia e preparo antes de enviar o curriculo.</span></div>
        <div class="metric"><b>Beachhead</b><span>Candidatos brasileiros em busca ativa ou transicao de carreira.</span></div>
        <div class="metric"><b>Monetizacao</b><span>Freemium, Starter, Pro e creditos avulsos.</span></div>
        <div class="metric"><b>Prioridade</b><span>Confiabilidade + aquisicao mensuravel nos proximos 90 dias.</span></div>
      </div>
      <div class="callout">
        <b>Tese principal:</b> o mercado nao precisa de mais uma promessa de emprego. Precisa de uma ferramenta que ajude o candidato a decidir melhor onde aplicar, adaptar o material certo e se preparar com contexto real.
      </div>
    </section>
    """
)

sections.append(
    f"""
    <section class="section" id="fundamentos">
      <div class="sec-label">01 / Fundamentos do negocio</div>
      <h2>Identidade, promessa e problema resolvido</h2>
      <div class="two-col">
        <div>
          <h3>O que e o VagaAI</h3>
          <p>Um copiloto de empregabilidade para candidatos brasileiros. O produto analisa a compatibilidade entre curriculo e vaga, aponta lacunas, gera materiais mais direcionados, acompanha candidaturas, envia alertas de oportunidades e prepara o usuario para entrevista.</p>
          <h3>Por que existe</h3>
          <p>Porque a busca por emprego ficou digital, fragmentada e opaca. O candidato envia curriculos em massa, muitas vezes sem entender se a vaga combina, o que falta no CV ou como se preparar para a entrevista.</p>
        </div>
        <div>
          <h3>Promessa central</h3>
          <p class="quote">Ajudar profissionais a buscar emprego com mais clareza, estrategia e preparo, conectando vagas, curriculo, candidatura e entrevista em uma jornada unica.</p>
          <h3>Limite etico da promessa</h3>
          <p>O VagaAI nao promete contratacao. Promete diagnostico, direcionamento, adaptacao e acompanhamento para aumentar a qualidade da candidatura.</p>
        </div>
      </div>
      {table(["Tema", "Direcao estrategica"], [
        ["Missao", "Eliminar erros evitaveis que impedem bons candidatos de chegar a entrevista."],
        ["Visao 3 anos", "Ser a ferramenta padrao de preparacao de candidatura em portugues, com expansao posterior para espanhol na LatAm."],
        ["Valores", "Honestidade com o usuario, velocidade, custo enxuto, decisao por dados e experiencia premium acessivel."],
        ["Personalidade", "Mentor pratico: direto, inteligente, cuidadoso e sem promessas frageis."]
      ])}
    </section>
    """
)

sections.append(
    f"""
    <section class="section" id="mercado">
      <div class="sec-label">02 / Diagnostico de mercado</div>
      <h2>Por que a oportunidade existe agora</h2>
      <p class="lead">Mesmo com melhora em alguns indicadores de emprego, a disputa por boas vagas continua alta, os processos sao mediados por plataformas e a IA entrou de vez no recrutamento. Isso aumenta a necessidade de clareza, personalizacao e preparo do lado do candidato.</p>
      {table(["Sinal", "Leitura", "Implicacao para o VagaAI"], [
        ["Mercado competitivo", "O IBGE registrou desocupacao de 5,8% e subutilizacao de 13,8% no trimestre encerrado em abril de 2026.", "A dor nao e apenas falta de vaga; e escolher melhor, aplicar melhor e reduzir desperdicio de energia."],
        ["Recrutamento digitalizado", "Plataformas como Gupy reforcam o uso de dados, tendencias setoriais e automacao em RH.", "O candidato precisa entender como sua experiencia aparece para sistemas e recrutadores."],
        ["IA no recrutamento", "Relatorios como o Future of Recruiting do LinkedIn destacam o papel crescente de IA para eficiencia e qualidade de contratacao.", "O VagaAI se posiciona como a camada de IA do candidato, nao apenas da empresa."],
        ["ChatGPT como substituto", "Ferramentas genericas conseguem escrever textos, mas nao organizam a jornada inteira.", "A defesa do VagaAI e fluxo, contexto salvo, alertas, rastreador e decisoes guiadas."]
      ])}
      <div class="source-note">Fontes externas consultadas: IBGE/PNAD Continua 2026, LinkedIn Future of Recruiting 2025 e Relatorio Gupy Mercado de Trabalho 2026. Links no anexo final.</div>
    </section>
    """
)

sections.append(
    """
    <section class="section" id="personas">
      <div class="sec-label">03 / Publico e personas</div>
      <h2>Quem o VagaAI deve conquistar primeiro</h2>
      <div class="cards-3">
        """ +
        card("Busca ativa pragmatica", "Profissional desempregado ou subempregado que precisa acelerar retorno, reduzir tentativa e erro e entender onde vale aplicar.", "Persona primaria") +
        card("Transicao silenciosa", "Profissional empregado que quer trocar de vaga com discricao, mais estrategia e materiais prontos para oportunidades especificas.", "Persona primaria") +
        card("Candidato em crescimento", "Analista, assistente, coordenador ou especialista que tem experiencia, mas nao sabe traduzi-la para a vaga certa.", "Persona primaria") +
        """
      </div>
      <h3>Dores prioritarias</h3>
      <div class="pain-grid">
        <span>Envio curriculo e nao recebo retorno.</span>
        <span>Nao sei se a vaga combina comigo.</span>
        <span>Meu curriculo parece generico.</span>
        <span>Perco vagas por nao adaptar meu material.</span>
        <span>Chego na entrevista sem saber o que destacar.</span>
        <span>Nao acompanho prazos e proximas acoes.</span>
      </div>
    </section>
    """
)

sections.append(
    f"""
    <section class="section" id="produto">
      <div class="sec-label">04 / Sistema de produto</div>
      <h2>A jornada integrada como principal diferencial</h2>
      <p class="lead">O produto deve ser comunicado e evoluido como um sistema operacional da candidatura. Cada feature precisa alimentar a proxima etapa.</p>
      {table(["Etapa", "Funcao", "Valor para o usuario", "Indicador"], [
        ["Alertas", "Receber vagas por cargo, local, salario e perfil.", "Menos busca manual e mais oportunidades alinhadas.", "Alertas ativos, cliques e vagas salvas."],
        ["Analise", "Comparar CV com vaga e gerar score.", "Entender chance relativa antes de aplicar.", "Analises por usuario, score medio, retorno ao resultado."],
        ["Curriculo otimizado", "Adaptar CV sem inventar experiencia.", "Enviar material mais especifico e ATS-friendly.", "PDFs baixados, taxa de uso apos analise."],
        ["Carta", "Gerar carta contextual para a vaga.", "Aumentar qualidade de candidatura quando a vaga pede mensagem.", "Cartas geradas e copiadas."],
        ["Candidaturas", "Acompanhar status, prazos e proximas acoes.", "Nao perder oportunidades e criar rotina.", "Candidaturas ativas, status atualizados."],
        ["Entrevista", "Treinar perguntas baseadas na vaga e CV.", "Chegar mais preparado e com narrativa clara.", "Simulacoes iniciadas, perguntas respondidas."]
      ])}
      <div class="journey-line">
        <div><b>1</b><span>Vaga escolhida</span></div>
        <div><b>2</b><span>Score e lacunas</span></div>
        <div><b>3</b><span>Material otimizado</span></div>
        <div><b>4</b><span>Candidatura rastreada</span></div>
        <div><b>5</b><span>Entrevista preparada</span></div>
      </div>
    </section>
    """
)

sections.append(
    f"""
    <section class="section" id="modelo">
      <div class="sec-label">05 / Modelo de negocio</div>
      <h2>Receita, planos e logica comercial</h2>
      <p class="lead">O modelo atual combina entrada gratuita, planos recorrentes e compra avulsa. A decisao estrategica e manter o gratis como ativacao e usar os limites no momento de alta intencao.</p>
      {table(["Oferta", "Preco", "Papel estrategico", "Mensagem"], [
        ["Free", "R$0", "Provar valor rapido e capturar usuario.", "Teste a primeira analise e entenda sua aderencia antes de enviar."],
        ["Starter", "R$19,90/mes", "Converter usuario com busca recorrente.", "Use com frequencia para vagas prioritarias."],
        ["Pro", "R$39,90/mes", "Produto completo e principal plano de margem.", "Transforme o VagaAI no seu sistema de candidatura."],
        ["Creditos avulsos", "R$9,90 / R$39,90 / R$97", "Monetizar urgencia sem assinatura.", "Compre analises quando precisar, sem recorrencia."],
        ["B2B Hire", "A definir", "Opcao futura, nao prioridade atual.", "Validar demanda antes de produto dedicado."]
      ])}
      <div class="callout amber"><b>Direcao comercial:</b> vender o proximo passo, nao a plataforma inteira. O upgrade deve aparecer quando o usuario sente limite, urgencia ou valor acumulado.</div>
    </section>
    """
)

sections.append(
    f"""
    <section class="section" id="funil">
      <div class="sec-label">06 / Funil e crescimento</div>
      <h2>Plano de aquisicao e conversao</h2>
      <div class="two-col">
        <div>
          <h3>Funil recomendado</h3>
          {bullets([
            "<b>Topo:</b> conteudo de dor real, SEO, Reels/Carrosseis e comparativos de vaga.",
            "<b>Ativacao:</b> analise gratis com resultado rapido e CTA claro para otimizar CV.",
            "<b>Retencao:</b> alertas de vagas, rastreador, lembretes e proximas acoes.",
            "<b>Conversao:</b> limites do Free, simulador, mais analises e uso recorrente.",
            "<b>Expansao:</b> anual, creditos em lote e indicacao."
          ])}
        </div>
        <div>
          <h3>Canais prioritarios</h3>
          {bullets([
            "<b>SEO de cauda longa:</b> guias por cargo, exemplos de CV e preparacao por area.",
            "<b>Conteudo social:</b> dores de busca, ATS, curriculo generico, entrevista e rotina.",
            "<b>Parcerias:</b> creators de carreira, escolas livres, mentorias e comunidades.",
            "<b>Produto como aquisicao:</b> resultado compartilhavel e antes/depois do score.",
            "<b>Pago experimental:</b> remarketing para quem analisou e nao otimizou."
          ])}
        </div>
      </div>
      {table(["Metrica", "90 dias", "12 meses", "Observacao"], [
        ["Usuarios cadastrados", "100", "2.000", "Meta herdada do plano interno; validar com canal."],
        ["Assinantes pagos", "5", "60", "Conversao inicial baixa e realista."],
        ["MRR", "R$200+", "R$1.500-R$2.000", "Com Pro e Starter misturados."],
        ["Blog/SEO", "8 posts", "60+ ativos", "Canal composto de baixo custo."],
        ["Entrevistas com usuarios", "10", "Mensal continuo", "Qualitativo vira backlog."]
      ])}
    </section>
    """
)

sections.append(
    f"""
    <section class="section" id="operacao">
      <div class="sec-label">07 / Operacao e tecnologia</div>
      <h2>Como operar com fundador solo sem perder confiabilidade</h2>
      <p class="lead">A operacao deve continuar enxuta, mas precisa de deteccao automatica. Escalar aquisicao antes de observar falhas aumenta suporte, retrabalho e perda de confianca.</p>
      {table(["Area", "Estado atual", "Risco", "Proxima acao"], [
        ["Arquitetura", "HTML estatico + APIs serverless + Supabase + Stripe + Resend + Anthropic.", "Regressoes entre paginas e funcoes.", "Checklist de fluxos e monitoramento."],
        ["Alertas", "Multi-fonte com historico e filtros.", "Fontes quebram e retornam vazio.", "Invariantes: busca nunca silenciosa; log de fonte por envio."],
        ["Entitlements", "Planos e creditos com regras por backend.", "UI mostrar ilimitado enquanto API bloqueia.", "Testes de plano Free/Starter/Pro em CI."],
        ["PDF/CV", "Fluxo sensivel a print/A4/layout.", "PDF cortado ou fora de margem.", "Teste visual automatizado dos modelos."],
        ["Suporte", "Fundador responde manualmente.", "Sobrecarga com crescimento.", "FAQ in-app + logs de erro amigaveis."]
      ])}
      <div class="priority-box">
        <b>Prioridade operacional #1:</b> rede de deteccao com testes de jornada: cadastro, analise, credito, plano Pro, gerar CV, candidatura, alerta, carta e entrevista.
      </div>
    </section>
    """
)

sections.append(
    f"""
    <section class="section" id="frameworks">
      <div class="sec-label">08 / Frameworks aplicados</div>
      <h2>Leitura estrategica do plano de negocios</h2>
      <div class="cards-2">
        {card("SWOT", "<b>Forcas:</b> jornada completa, baixo custo marginal, produto em uso. <br><b>Fraquezas:</b> marca nova, fundador unico, aquisicao ainda pequena. <br><b>Oportunidades:</b> SEO, LatAm, creator partnerships. <br><b>Ameacas:</b> ChatGPT generico, APIs de vagas e concorrentes globais.", "Diagnostico")}
        {card("Porter", "A maior ameaca sao substitutos gratuitos. A defesa nao e escrever melhor que o ChatGPT; e entregar fluxo, historico, alertas, rastreador e contexto acumulado.", "Competicao")}
        {card("BCG", "Analise ATS e estrela; alertas podem virar estrela de retencao; CV/carta sustentam monetizacao; B2B Hire fica como opcao futura.", "Portfolio")}
        {card("Ansoff", "Agora: penetracao no Brasil. Depois: desenvolvimento de produto. Expansao para espanhol so apos sinais claros de PMF local.", "Crescimento")}
      </div>
    </section>
    """
)

sections.append(
    f"""
    <section class="section" id="roadmap">
      <div class="sec-label">09 / Roadmap</div>
      <h2>Plano de execucao por horizonte</h2>
      {table(["Horizonte", "Foco", "Entregas"], [
        ["0-30 dias", "Confiabilidade e clareza comercial", "Testes de jornada, correcoes criticas, eventos GA4, Sentry, mensagens por plano, base de FAQ."],
        ["31-60 dias", "Aquisicao orgânica", "8 posts SEO, 20 carrosseis, 3 parcerias pequenas, landing com prova de fluxo e onboarding de email refinado."],
        ["61-90 dias", "Conversao e retencao", "Experimentos de paywall, email de retorno, alertas mais inteligentes, dashboard de metricas e entrevistas de usuarios."],
        ["3-6 meses", "Produto composto", "PDF servidor confiavel, melhorias de rastreador, simulador mais integrado e historico de insights por usuario."],
        ["6-12 meses", "Tração e escala controlada", "Vercel Pro se MRR justificar, SEO programatico, programa de indicacao e beta de localizacao."],
        ["12-24 meses", "Expansao opcional", "LatAm espanhol ou PT-PT, conforme dados de aquisicao e suporte."],
      ])}
    </section>
    """
)

sections.append(
    f"""
    <section class="section" id="financeiro">
      <div class="sec-label">10 / Financeiro e unit economics</div>
      <h2>Logica financeira inicial</h2>
      <p class="lead">O plano deve priorizar validacao com custo baixo. Os numeros abaixo usam a base real informada no plano interno e estimativas conservadoras; devem ser recalculados com dados de uso e custo real por API.</p>
      {table(["Item", "Base atual", "Leitura"], [
        ["Usuarios", "5", "Produto ainda em validacao, mas com uso real."],
        ["Assinantes", "1 Pro", "Sinal inicial de pagamento; ainda insuficiente para conclusao de PMF."],
        ["MRR", "R$39,90", "Negocio roda em caixa pequeno; escalar com cautela."],
        ["Analises/30d", "56", "Core sendo usado acima da base de usuarios, bom sinal de valor."],
        ["Creditos vendidos", "11", "Compra avulsa valida urgencia sem assinatura."],
        ["Custo IA", "R$0,05-R$0,15 por analise (estimativa do plano)", "Manter logs de custo por endpoint antes de subir trafego."]
      ])}
      <div class="callout"><b>Regra de decisao:</b> enquanto MRR for baixo, o principal investimento deve ser tempo, conteudo e automacao. Gastos fixos so entram quando reduzem risco ou destravam crescimento mensuravel.</div>
    </section>
    """
)

sections.append(
    f"""
    <section class="section" id="marca">
      <div class="sec-label">11 / Marca e comunicacao</div>
      <h2>Como vender sem prometer demais</h2>
      <div class="two-col">
        <div>
          <h3>Mensagem central</h3>
          <p class="quote">Receba vagas alinhadas, entenda sua aderencia e adapte sua candidatura antes de enviar.</p>
          {bullets([
            "Fale de clareza, preparo e candidatura mais forte.",
            "Evite prometer emprego, entrevista garantida ou aprovacao.",
            "Mostre fluxo visual: alerta -> analise -> CV -> candidatura -> entrevista.",
            "Use linguagem direta, adulta e acolhedora."
          ])}
        </div>
        <div>
          <h3>Mensagens por momento</h3>
          {table(["Momento", "Mensagem"], [
            ["Primeira analise", "Veja se essa vaga vale seu tempo antes de enviar o curriculo."],
            ["Resultado baixo", "Agora voce sabe o que precisa ajustar antes de se candidatar."],
            ["CV otimizado", "Seu material foi adaptado para esta oportunidade."],
            ["Candidatura", "Acompanhe proximas acoes para nao perder timing."],
            ["Entrevista", "Treine com perguntas baseadas na vaga e no seu CV."],
          ])}
        </div>
      </div>
    </section>
    """
)

sections.append(
    f"""
    <section class="section" id="riscos">
      <div class="sec-label">12 / Riscos e mitigacoes</div>
      <h2>O que pode quebrar a tese</h2>
      {table(["Risco", "Severidade", "Mitigacao"], [
        ["Baixa aquisicao", "Alta", "Conteudo, SEO, parcerias e medicao de funil antes de pago pesado."],
        ["Produto parecer complexo", "Alta", "Jornada guiada e CTAs por proximo passo, nao por feature solta."],
        ["APIs/fontes de vaga instaveis", "Alta", "Multi-fonte, cache, logs por fonte e fallback visual claro."],
        ["ChatGPT gratuito substituir", "Media-alta", "Diferenciar por fluxo, historico, alertas, rastreador e contexto salvo."],
        ["Custo de IA crescer", "Media", "Rate-limit, modelo barato por padrao, custo por endpoint e planos com gates."],
        ["Promessa exagerada gerar frustracao", "Media", "Manual de marca: nunca prometer contratacao; prometer preparo e clareza."],
      ])}
    </section>
    """
)

sections.append(
    f"""
    <section class="section" id="checklist">
      <div class="sec-label">13 / Checklist de gestao</div>
      <h2>Rotina de decisao</h2>
      <div class="cards-3">
        {card("Toda semana", "Revisar cadastros, analises, upgrades, erros, custo de IA, fontes de alertas e 3 feedbacks de usuario.", "30 min")}
        {card("Todo mes", "Escolher uma aposta de aquisicao, uma melhoria de retencao e uma correcao de confiabilidade. Matar uma iniciativa sem tracao.", "2 h")}
        {card("Todo trimestre", "Revisar SWOT, Porter, BCG, metas e tese de mercado. Atualizar este plano com dados reais.", "Meio dia")}
      </div>
      <div class="source-note">
        Fontes: <a href="https://agenciadenoticias.ibge.gov.br/agencia-sala-de-imprensa/2013-agencia-de-noticias/releases/46888-pnad-continua-taxa-de-desocupacao-e-de-5-8-e-taxa-de-subutilizacao-e-de-13-8-no-trimestre-encerrado-em-abril">IBGE PNAD Continua, trimestre encerrado em abril de 2026</a> ·
        <a href="https://business.linkedin.com/hire/resources/future-of-recruiting">LinkedIn Future of Recruiting 2025</a> ·
        <a href="https://conteudos.gupy.io/materiais/relatorio/empregabilidade-2026">Gupy - Mercado de Trabalho no Brasil 2026</a>.
      </div>
    </section>
    """
)

css = f"""
:root {{
  --forest:{brand['forest']}; --deep:{brand['deep']}; --emerald:{brand['emerald']}; --bright:{brand['bright']};
  --paper:{brand['paper']}; --card:{brand['card']}; --ink:{brand['ink']}; --text:{brand['text']};
  --muted:{brand['muted']}; --border:{brand['border']}; --amber:{brand['amber']}; --red:{brand['red']};
  --shadow:0 18px 50px rgba(7,18,9,.10); --r:24px; --r-sm:14px;
}}
* {{ box-sizing:border-box; }}
body {{ margin:0; background:var(--paper); color:var(--ink); font-family:Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height:1.55; }}
a {{ color:var(--emerald); font-weight:700; text-decoration:none; }}
.layout {{ display:grid; grid-template-columns:292px 1fr; min-height:100vh; }}
aside {{ position:sticky; top:0; height:100vh; padding:30px 24px; background:radial-gradient(circle at 20% 0%, rgba(78,206,145,.16), transparent 28%), var(--forest); color:#fff; overflow:auto; }}
.brand {{ display:flex; gap:12px; align-items:center; margin-bottom:30px; }}
.mark {{ width:36px; height:36px; border-radius:50%; background:#151515; display:grid; place-items:center; color:#fff; font-weight:900; font-family:Georgia, serif; box-shadow:0 0 0 1px rgba(255,255,255,.08); }}
.brand b {{ font-family:Georgia, serif; font-size:22px; letter-spacing:-.02em; }}
.brand b span {{ color:var(--bright); }}
.nav-label {{ font-size:10px; color:rgba(255,255,255,.42); text-transform:uppercase; letter-spacing:.16em; font-weight:800; margin:18px 0 10px; }}
nav {{ display:grid; gap:5px; }}
nav a {{ display:flex; align-items:center; gap:10px; padding:9px 10px; border-radius:12px; color:rgba(255,255,255,.72); font-size:13px; font-weight:600; }}
nav a span {{ width:24px; height:24px; border-radius:8px; display:grid; place-items:center; background:rgba(255,255,255,.06); color:var(--bright); font-size:11px; font-weight:800; }}
nav a:hover {{ background:rgba(255,255,255,.07); color:#fff; }}
.side-note {{ margin-top:28px; border:1px solid rgba(255,255,255,.10); border-radius:18px; padding:16px; background:rgba(255,255,255,.045); }}
.side-note b {{ color:var(--bright); font-size:12px; text-transform:uppercase; letter-spacing:.08em; }}
.side-note p {{ margin:8px 0 0; color:rgba(255,255,255,.67); font-size:12.5px; }}
main {{ padding:42px clamp(28px, 5vw, 72px) 72px; }}
.cover {{ position:relative; overflow:hidden; border-radius:32px; padding:56px; min-height:500px; background:linear-gradient(135deg,#081510,#0E3D26 58%,#177247); color:#fff; box-shadow:var(--shadow); margin-bottom:34px; display:grid; grid-template-columns:1.15fr .85fr; gap:40px; align-items:center; }}
.cover:before {{ content:""; position:absolute; right:-130px; top:-130px; width:360px; height:360px; border-radius:50%; background:rgba(78,206,145,.16); }}
.cover-copy, .cover-panel {{ position:relative; z-index:1; }}
.kicker, .sec-label {{ color:var(--emerald); font-size:11px; text-transform:uppercase; letter-spacing:.15em; font-weight:900; margin-bottom:14px; }}
.cover .kicker {{ color:var(--bright); }}
h1, h2, h3 {{ font-family:Georgia, "Times New Roman", serif; letter-spacing:-.035em; }}
h1 {{ font-size:58px; line-height:1.02; margin:0 0 18px; max-width:820px; }}
h2 {{ font-size:38px; line-height:1.08; margin:0 0 14px; }}
h3 {{ font-size:22px; line-height:1.15; margin:24px 0 8px; }}
h4 {{ font-size:16px; margin:0 0 8px; }}
p {{ color:var(--text); margin:0 0 14px; }}
.cover p {{ color:#d8efe0; font-size:18px; max-width:760px; }}
.cover-actions {{ display:flex; flex-wrap:wrap; gap:10px; margin-top:26px; }}
.cover-actions span {{ border:1px solid rgba(255,255,255,.14); background:rgba(255,255,255,.08); color:#d7f2df; padding:9px 12px; border-radius:999px; font-size:12px; font-weight:700; }}
.cover-panel {{ background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.14); border-radius:24px; padding:24px; box-shadow:0 24px 70px rgba(0,0,0,.22); backdrop-filter:blur(10px); }}
.panel-top {{ display:flex; align-items:center; gap:7px; color:#aacdb7; font-size:12px; margin-bottom:22px; }}
.panel-top span {{ width:9px; height:9px; border-radius:50%; background:#ff6b5f; }}
.panel-top span:nth-child(2) {{ background:#f5bd4f; }}
.panel-top span:nth-child(3) {{ background:#42d37b; }}
.panel-top b {{ margin-left:auto; color:#cfe8d7; }}
.score-ring {{ width:132px; height:132px; margin:0 auto 26px; border-radius:50%; display:grid; place-items:center; background:conic-gradient(var(--bright) 0 74%, rgba(255,255,255,.12) 74% 100%); position:relative; }}
.score-ring:after {{ content:""; width:102px; height:102px; border-radius:50%; background:#0b2114; position:absolute; }}
.score-ring strong, .score-ring small {{ position:relative; z-index:1; display:block; text-align:center; color:#fff; }}
.score-ring strong {{ font-size:36px; line-height:1; }}
.score-ring small {{ margin-top:42px; font-size:11px; color:#9ac9aa; text-transform:uppercase; letter-spacing:.1em; }}
.bar {{ margin:14px 0 34px; background:rgba(255,255,255,.09); height:8px; border-radius:999px; position:relative; }}
.bar span {{ display:block; height:100%; border-radius:999px; background:var(--bright); }}
.bar.amber span {{ background:#f5b84b; }}
.bar b {{ display:block; margin-top:6px; font-size:12px; color:#cfe8d7; }}
.panel-note {{ margin-top:8px; color:#b9d8c5; font-size:13px; border-top:1px solid rgba(255,255,255,.1); padding-top:14px; }}
.section {{ background:var(--card); border:1px solid var(--border); border-radius:var(--r); padding:34px; margin-bottom:22px; box-shadow:0 8px 30px rgba(10,26,16,.06); break-inside:avoid; }}
.lead {{ font-size:17px; color:var(--text); max-width:980px; }}
.two-col {{ display:grid; grid-template-columns:1fr 1fr; gap:34px; }}
.grid-4 {{ display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-top:22px; }}
.metric {{ background:linear-gradient(180deg,#fff,#f4faf6); border:1px solid var(--border); border-radius:18px; padding:18px; }}
.metric b {{ display:block; font-size:17px; color:var(--ink); }}
.metric span {{ display:block; margin-top:4px; color:var(--muted); font-size:13px; }}
.callout, .priority-box {{ border:1px solid rgba(26,122,74,.20); background:#ebf8f1; color:var(--text); border-radius:18px; padding:18px 20px; margin-top:22px; }}
.callout.amber {{ background:#fff7e8; border-color:rgba(196,125,10,.25); }}
.quote {{ font-family:Georgia, serif; font-size:23px; line-height:1.25; color:var(--forest); border-left:4px solid var(--bright); padding-left:18px; }}
table {{ width:100%; border-collapse:separate; border-spacing:0; margin:20px 0 0; overflow:hidden; border:1px solid var(--border); border-radius:16px; font-size:13px; }}
th, td {{ padding:13px 14px; border-bottom:1px solid var(--border); vertical-align:top; text-align:left; }}
th {{ background:#eef6f1; color:var(--forest); text-transform:uppercase; letter-spacing:.08em; font-size:10px; }}
tr:last-child td {{ border-bottom:none; }}
td:first-child {{ font-weight:800; color:var(--ink); }}
.cards-3 {{ display:grid; grid-template-columns:repeat(3,1fr); gap:16px; margin-top:18px; }}
.cards-2 {{ display:grid; grid-template-columns:repeat(2,1fr); gap:16px; margin-top:18px; }}
.mini-card {{ background:linear-gradient(180deg,#fff,#f7fbf8); border:1px solid var(--border); border-radius:18px; padding:20px; min-height:150px; }}
.tag {{ display:inline-flex; align-items:center; height:24px; padding:0 9px; border-radius:999px; background:#e5f5ed; color:var(--emerald); font-size:10px; text-transform:uppercase; letter-spacing:.08em; font-weight:900; margin-bottom:12px; }}
.pain-grid {{ display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-top:14px; }}
.pain-grid span {{ display:block; padding:12px 14px; background:#f6faf8; border:1px solid var(--border); border-radius:14px; color:var(--text); font-weight:700; font-size:13px; }}
.journey-line {{ display:grid; grid-template-columns:repeat(5,1fr); gap:12px; margin-top:26px; position:relative; }}
.journey-line div {{ border:1px solid var(--border); background:#fff; border-radius:18px; padding:16px; text-align:center; }}
.journey-line b {{ width:32px; height:32px; margin:0 auto 8px; display:grid; place-items:center; border-radius:50%; background:var(--emerald); color:#fff; }}
.journey-line span {{ color:var(--text); font-weight:800; font-size:13px; }}
.source-note {{ margin-top:18px; font-size:12px; color:var(--muted); }}
ul {{ margin:10px 0 0; padding-left:20px; color:var(--text); }}
li {{ margin:7px 0; }}
@media (max-width: 980px) {{
  .layout {{ grid-template-columns:1fr; }}
  aside {{ position:relative; height:auto; }}
  .cover, .two-col, .grid-4, .cards-3, .cards-2, .pain-grid, .journey-line {{ grid-template-columns:1fr; }}
  main {{ padding:24px; }}
  h1 {{ font-size:40px; }}
  h2 {{ font-size:30px; }}
}}
@media print {{
  @page {{ size:A4; margin:12mm; }}
  body {{ background:#fff; }}
  .layout {{ display:block; }}
  aside {{ display:none; }}
  main {{ padding:0; }}
  .cover, .section {{ box-shadow:none; break-inside:avoid; page-break-inside:avoid; }}
  .cover {{ min-height:auto; margin-bottom:14px; }}
  a {{ color:var(--emerald); }}
}}
"""

nav_items = [
    ("00", "Resumo", "sumario"),
    ("01", "Fundamentos", "fundamentos"),
    ("02", "Mercado", "mercado"),
    ("03", "Personas", "personas"),
    ("04", "Produto", "produto"),
    ("05", "Modelo", "modelo"),
    ("06", "Funil", "funil"),
    ("07", "Operacao", "operacao"),
    ("08", "Frameworks", "frameworks"),
    ("09", "Roadmap", "roadmap"),
    ("10", "Financeiro", "financeiro"),
    ("11", "Marca", "marca"),
    ("12", "Riscos", "riscos"),
    ("13", "Checklist", "checklist"),
]

nav_html = "\n".join(f'<a href="#{href}"><span>{num}</span>{label}</a>' for num, label, href in nav_items)

html_doc = f"""<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Planejamento Completo VagaAI</title>
  <style>{css}</style>
</head>
<body>
  <div class="layout">
    <aside>
      <div class="brand"><div class="mark">V</div><b>Vaga<span>AI</span></b></div>
      <div class="nav-label">Planejamento</div>
      <nav>{nav_html}</nav>
      <div class="side-note">
        <b>Tese</b>
        <p>Construir uma jornada integrada de candidatura: escolher melhor, adaptar melhor, acompanhar melhor e chegar mais preparado.</p>
      </div>
    </aside>
    <main>
      {"".join(sections)}
    </main>
  </div>
</body>
</html>
"""

md_doc = """# Planejamento Completo VagaAI

Documento completo gerado em HTML/PDF. Use o arquivo HTML como versao editavel visual
e o PDF como versao para leitura, apresentacao e compartilhamento interno.

Arquivos:

- Planejamento Completo VagaAI.html
- Planejamento Completo VagaAI.pdf

Base:

- PLANEJAMENTO-VAGAAI.md
- Manual de Marca VagaAI
- Jornada, Personas e Linha Editorial VagaAI
- Fontes externas: IBGE PNAD Continua 2026, LinkedIn Future of Recruiting 2025, Gupy Mercado de Trabalho 2026
"""

HTML_PATH.write_text(html_doc, encoding="utf-8")
MD_PATH.write_text(md_doc, encoding="utf-8")

print(HTML_PATH)
print(MD_PATH)
