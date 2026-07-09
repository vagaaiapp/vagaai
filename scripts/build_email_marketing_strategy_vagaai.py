from pathlib import Path
import html

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "email-marketing-vagaai"
OUT_DIR.mkdir(exist_ok=True)

HTML_PATH = OUT_DIR / "Estrategia de Email Marketing VagaAI.html"
MD_PATH = OUT_DIR / "Estrategia de Email Marketing VagaAI.md"


def esc(value):
    return html.escape(str(value), quote=True)


def table(headers, rows):
    head = "".join(f"<th>{esc(h)}</th>" for h in headers)
    body = []
    for row in rows:
        body.append("<tr>" + "".join(f"<td>{cell}</td>" for cell in row) + "</tr>")
    return f"<table><thead><tr>{head}</tr></thead><tbody>{''.join(body)}</tbody></table>"


def bullets(items):
    return "<ul>" + "".join(f"<li>{item}</li>" for item in items) + "</ul>"


def card(title, text, tag=None):
    tag_html = f'<div class="tag">{esc(tag)}</div>' if tag else ""
    return f'<div class="mini-card">{tag_html}<h4>{esc(title)}</h4><p>{text}</p></div>'


def email_card(title, subject, preheader, body, cta, stage):
    return f"""
    <div class="email-card">
      <div class="tag">{esc(stage)}</div>
      <h4>{esc(title)}</h4>
      <div class="email-line"><b>Assunto:</b> {esc(subject)}</div>
      <div class="email-line"><b>Preheader:</b> {esc(preheader)}</div>
      <p>{body}</p>
      <div class="cta-pill">{esc(cta)}</div>
    </div>
    """


sections = []

sections.append("""
<section class="cover" id="inicio">
  <div class="cover-copy">
    <div class="kicker">E-mail marketing para conversao</div>
    <h1>Conteudo que educa, ativa e converte o candidato.</h1>
    <p>Planejamento editorial completo para transformar contatos do VagaAI em usuarios ativos, candidatos recorrentes e assinantes pagos sem prometer emprego, sem exagero e sem parecer spam.</p>
    <div class="cover-actions">
      <span>Lifecycle marketing</span>
      <span>Conversao Free -> Starter -> Pro</span>
      <span>Conteudo + produto</span>
    </div>
  </div>
  <div class="cover-panel">
    <div class="panel-top"><span></span><span></span><span></span><b>Régua VagaAI</b></div>
    <div class="flow">
      <div><b>1</b><span>Entrou</span></div>
      <div><b>2</b><span>Analisou</span></div>
      <div><b>3</b><span>Otimizou</span></div>
      <div><b>4</b><span>Rastreou</span></div>
      <div><b>5</b><span>Assinou</span></div>
    </div>
    <div class="panel-note">A melhor venda do VagaAI nao e “compre agora”. E mostrar o proximo passo certo para a vaga que o usuario ja quer.</div>
  </div>
</section>
""")

sections.append("""
<section class="section" id="resumo">
  <div class="sec-label">00 / Resumo executivo</div>
  <h2>A tese da estratégia</h2>
  <p class="lead">O e-mail do VagaAI deve funcionar como um copiloto de busca de emprego: ajuda o usuario a voltar, entender o que fazer em seguida e perceber que a plataforma resolve uma jornada inteira, nao apenas uma tarefa isolada.</p>
  <div class="grid-4">
    <div class="metric"><b>Educar</b><span>Mostrar por que curriculo generico, vaga errada e falta de preparo custam oportunidades.</span></div>
    <div class="metric"><b>Ativar</b><span>Levar o usuario para a primeira analise, primeiro CV, primeiro alerta e primeira candidatura rastreada.</span></div>
    <div class="metric"><b>Converter</b><span>Usar limites, urgencia e valor percebido para vender Starter, Pro ou creditos.</span></div>
    <div class="metric"><b>Reter</b><span>Trazer o usuario de volta com alertas, follow-ups, proximas acoes e rotina semanal.</span></div>
  </div>
  <div class="callout"><b>Principio central:</b> cada e-mail precisa responder a uma pergunta simples: “qual e o proximo passo mais util para esse candidato agora?”</div>
</section>
""")

sections.append(f"""
<section class="section" id="estado-atual">
  <div class="sec-label">01 / Estado atual</div>
  <h2>O que ja existe no produto</h2>
  <p class="lead">O app ja possui uma base funcional de e-mails transacionais e de onboarding. A estrategia abaixo expande essa base para uma régua de conversao, nutricao e retencao.</p>
  {table(["Fluxo atual", "Momento", "Objetivo", "Oportunidade de melhoria"], [
    ["Welcome", "Apos cadastro ou primeiro login", "Apresentar primeiras acoes", "Transformar em e-mail mais curto, com CTA unico e segmentacao por origem."],
    ["Day 2 - dica ATS", "2 dias apos cadastro", "Educar sobre erros de curriculo", "Conectar com a ultima vaga analisada quando houver contexto."],
    ["Day 5 - lembrete", "5 dias apos cadastro", "Trazer usuario de volta", "Trocar lembrete generico por proximo passo personalizado."],
    ["Tracker follow-up", "Candidatura aplicada ha cerca de 7 dias", "Sugerir follow-up", "Adicionar contexto da vaga, status e modelo pronto de mensagem."]
  ])}
  <div class="callout amber"><b>Leitura:</b> hoje a base existe. O ganho esta em segmentar melhor e fazer cada e-mail conversar com a jornada real: vaga analisada, score, CV otimizado, candidatura, alerta e entrevista.</div>
</section>
""")

sections.append(f"""
<section class="section" id="segmentacao">
  <div class="sec-label">02 / Segmentacao</div>
  <h2>Quem recebe o que</h2>
  <p class="lead">A conversao melhora quando o VagaAI para de mandar a mesma mensagem para todos e passa a enviar e-mails com base no comportamento do usuario.</p>
  {table(["Segmento", "Sinal comportamental", "Mensagem principal", "CTA"], [
    ["Novo usuario sem analise", "Criou conta, nao analisou vaga", "Comece por uma vaga real; nao tente melhorar o CV no escuro.", "Analisar minha primeira vaga"],
    ["Fez analise com score baixo", "Score abaixo de 50", "Agora voce sabe o que esta travando sua candidatura.", "Gerar CV otimizado"],
    ["Fez analise com score medio", "Score entre 50 e 74", "Alguns ajustes podem aumentar sua aderencia.", "Ver prioridades de melhoria"],
    ["Fez analise com score alto", "Score acima de 75", "Essa vaga merece uma candidatura mais forte agora.", "Baixar CV e rastrear vaga"],
    ["Otimizou CV, nao rastreou", "PDF gerado, sem candidatura", "Nao deixe a vaga solta; acompanhe a proxima acao.", "Adicionar em candidaturas"],
    ["Tem candidatura parada", "Status aplicado sem atualizacao", "Hora de fazer follow-up ou preparar entrevista.", "Gerenciar candidatura"],
    ["Recebe alertas, nao analisa", "Clica/abre alerta mas nao analisa", "Veja se a oportunidade realmente combina antes de aplicar.", "Analisar vaga do alerta"],
    ["Free no limite", "Usou cota mensal", "Voce ja viu valor; agora destrave a rotina.", "Ver plano Starter"],
    ["Starter ativo", "Uso recorrente, sem simulador", "Pro ajuda a fechar a jornada com entrevista.", "Conhecer Pro"],
    ["Pro ativo", "Assinante completo", "Aumentar uso e retencao por rotina semanal.", "Ver proximas acoes"]
  ])}
</section>
""")

sections.append(f"""
<section class="section" id="pilares">
  <div class="sec-label">03 / Pilares editoriais</div>
  <h2>Conteudos que vendem sem parecer venda</h2>
  <div class="cards-3">
    {card("1. Clareza antes de aplicar", "Conteudos que ensinam o usuario a parar de enviar curriculo no escuro e avaliar se a vaga merece energia.", "Diagnostico")}
    {card("2. Curriculo especifico", "Conteudos sobre por que um CV generico perde forca e como adaptar sem inventar experiencia.", "Produto")}
    {card("3. ATS e filtros", "Conteudos simples sobre triagem, palavras-chave, legibilidade e estrutura de curriculo.", "Educacional")}
    {card("4. Rotina de candidatura", "Conteudos sobre acompanhar vagas, follow-up, timing e proximas acoes.", "Retencao")}
    {card("5. Entrevista com contexto", "Conteudos sobre narrativa, perguntas provaveis, briefing e preparo por vaga.", "Pro")}
    {card("6. Mercado e carreira", "Conteudos de dor real: silencio apos envio, ansiedade, mudanca de rota, decisao e estrategia.", "Relacionamento")}
  </div>
</section>
""")

sections.append(f"""
<section class="section" id="automacoes">
  <div class="sec-label">04 / Automacoes recomendadas</div>
  <h2>Reguas de e-mail por jornada</h2>
  {table(["Régua", "Gatilho", "Sequencia", "Objetivo"], [
    ["Onboarding Free", "Cadastro sem uso", "D0 boas-vindas, D1 primeira vaga, D2 erro ATS, D4 exemplo real, D7 limite/plano", "Levar a primeira analise e mostrar valor rapido."],
    ["Pos-analise", "Analise concluida", "Imediato resultado, +6h prioridade, D1 CV otimizado, D3 candidatura", "Transformar diagnostico em acao."],
    ["CV otimizado", "PDF gerado", "Imediato download, D1 carta, D2 rastreador, D5 entrevista se status avancar", "Completar candidatura."],
    ["Alertas", "Novo alerta enviado", "Resumo de vagas, melhor oportunidade, lembrete de analise", "Retorno recorrente ao app."],
    ["Candidaturas", "Status aplicado", "D3 checklist, D7 follow-up, D14 proxima decisao", "Evitar abandono e dar rotina."],
    ["Entrevista", "Status entrevista ou botao treinar", "Preparacao, perguntas, resposta modelo, reforco Pro", "Vender valor premium e aumentar sucesso percebido."],
    ["Winback", "14 dias sem uso", "Diagnostico da busca, nova vaga, credito/analise, plano", "Reativar sem parecer cobranca."],
    ["Upgrade", "Limite atingido ou uso alto", "Comparativo plano, caso de uso, oferta anual", "Converter no momento de dor."]
  ])}
</section>
""")

sections.append("""
<section class="section" id="sequencia-free">
  <div class="sec-label">05 / Sequencia de conversao Free</div>
  <h2>Do cadastro ao primeiro upgrade</h2>
  <p class="lead">Essa régua deve ser curta, objetiva e muito conectada ao produto. O usuario precisa sentir que cada e-mail ajuda a buscar emprego melhor, nao que esta recebendo uma newsletter generica.</p>
  <div class="email-grid">
""" +
email_card("Boas-vindas com proximo passo", "Sua busca pode ficar mais clara a partir de uma vaga real", "Cole uma vaga e veja onde seu curriculo ganha ou perde pontos.", "Você não precisa começar tentando reescrever o currículo inteiro. Comece por uma vaga real. O VagaAI compara a oportunidade com seu perfil e mostra o que vale priorizar antes de enviar.", "Analisar minha primeira vaga", "D0") +
email_card("Primeira dor", "Mandar mais currículos não resolve se eles dizem a coisa errada", "Veja o erro que mais faz bons profissionais passarem despercebidos.", "Muitos candidatos têm experiência, mas apresentam essa experiência de forma genérica. O problema não é só o currículo. É a falta de alinhamento entre a vaga e o que o currículo destaca.", "Ver meu score de aderência", "D1") +
email_card("Educacional ATS", "3 sinais de que seu CV pode estar perdendo pontos no filtro", "Palavras-chave, legibilidade e foco importam mais do que parece.", "O VagaAI olha para compatibilidade, palavras-chave, legibilidade e força dos bullets para mostrar onde seu material pode estar enfraquecendo sua candidatura.", "Analisar uma vaga agora", "D2") +
email_card("Prova de valor", "Antes de enviar, descubra se essa vaga vale seu tempo", "Uma análise simples evita candidaturas no escuro.", "A pergunta não é apenas 'eu consigo me candidatar?'. A pergunta melhor é: 'essa vaga combina com meu perfil e meu currículo mostra isso?'.", "Testar com uma vaga real", "D4") +
email_card("Conversao suave", "Se você está aplicando com frequência, o plano grátis vai te limitar", "Starter e Pro foram feitos para quem está em busca ativa.", "Se você quer analisar mais vagas, gerar currículos direcionados e acompanhar candidaturas com mais consistência, faz sentido destravar uma rotina de busca.", "Comparar planos", "D7") +
"""
  </div>
</section>
""")

sections.append("""
<section class="section" id="pos-analise">
  <div class="sec-label">06 / Sequencia pos-analise</div>
  <h2>Transformar score em acao</h2>
  <div class="email-grid">
""" +
email_card("Score baixo", "Seu score não é uma sentença. É um mapa.", "Veja o que ajustar antes de enviar essa candidatura.", "Um score baixo não significa que você não serve para a vaga. Significa que, do jeito que seu currículo está hoje, a conexão não aparece com força suficiente.", "Gerar versão otimizada", "Score < 50") +
email_card("Score médio", "Você está perto, mas alguns detalhes podem custar retorno", "Ajustes pequenos podem deixar a candidatura mais específica.", "Quando a aderência está no meio do caminho, normalmente faltam palavras-chave, métricas ou uma narrativa mais alinhada ao cargo.", "Ver prioridades", "Score 50-74") +
email_card("Score alto", "Essa vaga merece uma candidatura bem feita", "Seu perfil parece promissor. Agora envie com mais força.", "Quando a vaga combina, o melhor próximo passo é baixar o CV otimizado, gerar a carta se fizer sentido e rastrear a candidatura para não perder timing.", "Concluir candidatura", "Score 75+") +
email_card("Sem CV otimizado", "Você viu o diagnóstico. Falta transformar em material.", "A análise mostra o problema; o currículo otimizado vira a ação.", "O VagaAI pode adaptar resumo, palavras-chave e experiências para a vaga sem inventar informações.", "Otimizar meu currículo", "+6h") +
email_card("Não rastreou", "Não deixe essa vaga perdida depois da análise", "Adicione ao rastreador e acompanhe a próxima ação.", "A busca por emprego melhora quando cada vaga tem status, prazo e próximo passo. Isso evita esquecimento e ajuda a manter ritmo.", "Adicionar em candidaturas", "D1") +
"""
  </div>
</section>
""")

sections.append(f"""
<section class="section" id="conteudos-semanais">
  <div class="sec-label">07 / Campanhas semanais</div>
  <h2>Calendario editorial de 8 semanas</h2>
  <p class="lead">Além das automações, o VagaAI pode ter uma newsletter curta, altamente prática, com foco em conversão indireta. Uma vez por semana é suficiente no começo.</p>
  {table(["Semana", "Tema", "Assunto sugerido", "CTA"], [
    ["1", "Curriculo generico", "Seu currículo parece feito para qualquer vaga?", "Analisar uma vaga real"],
    ["2", "Escolha de vaga", "A vaga certa não é sempre a mais bonita do LinkedIn", "Configurar alertas"],
    ["3", "ATS sem mito", "O ATS não odeia seu currículo. Ele só não entende o que não está claro.", "Ver score ATS"],
    ["4", "Rotina", "Buscar emprego sem rastreador vira memória solta", "Abrir candidaturas"],
    ["5", "Carta", "Quando uma carta de apresentação vale a pena?", "Gerar carta para vaga"],
    ["6", "Entrevista", "A entrevista começa antes da entrevista", "Treinar perguntas"],
    ["7", "Mercado", "O silêncio depois do envio também é um dado", "Rever candidaturas"],
    ["8", "Upgrade", "Se você está aplicando toda semana, precisa de sistema", "Ver plano Pro"]
  ])}
</section>
""")

sections.append("""
<section class="section" id="templates">
  <div class="sec-label">08 / Templates prontos</div>
  <h2>Exemplos de e-mails de conversao</h2>
  <div class="email-grid">
""" +
email_card("Limite Free", "Você usou sua análise grátis. Agora vem a parte importante.", "Transforme o diagnóstico em rotina de candidatura.", "Se você está realmente em busca de emprego, uma única análise mostra valor, mas não sustenta a rotina. O Starter libera mais análises para comparar oportunidades e adaptar seu material com frequência.", "Desbloquear Starter", "Upgrade") +
email_card("Starter para Pro", "Você já analisa vagas. Falta se preparar para a entrevista.", "O Pro fecha a jornada com simulador e uso completo.", "Analisar e otimizar ajuda você a enviar melhor. Mas quando a vaga avança, o diferencial passa a ser a entrevista. O Pro foi pensado para quem quer preparar a candidatura inteira.", "Conhecer Pro", "Upsell") +
email_card("Alerta com oportunidade", "Encontramos vagas que parecem combinar com seu perfil", "Antes de aplicar, veja qual delas realmente vale seu tempo.", "Selecionamos oportunidades com base no seu perfil. A melhor próxima ação é analisar a vaga mais promissora antes de adaptar o currículo.", "Analisar melhor oportunidade", "Alertas") +
email_card("Follow-up de candidatura", "Já faz 7 dias desde sua candidatura. Vale fazer follow-up?", "Uma mensagem curta pode reabrir a conversa.", "Se você já enviou o currículo e ainda não teve retorno, um follow-up objetivo ajuda a reforçar interesse sem parecer insistente.", "Ver modelo de follow-up", "Retencao") +
email_card("Winback", "Sua busca ficou parada ou só saiu do radar?", "Volte por uma vaga. Não por uma lista de tarefas.", "Às vezes a busca por emprego cansa porque tudo vira tentativa. Recomece com uma vaga específica: o VagaAI mostra aderência, lacunas e próximo passo.", "Retomar minha busca", "Reativacao") +
email_card("Objeção preço", "Vale pagar por algo que não garante emprego?", "A resposta honesta: não pague por promessa, pague por clareza.", "O VagaAI não garante contratação. Ele ajuda você a evitar erros evitáveis: vaga sem aderência, currículo genérico, candidatura sem acompanhamento e entrevista sem preparo.", "Ver como funciona", "Objeção") +
"""
  </div>
</section>
""")

sections.append(f"""
<section class="section" id="copy">
  <div class="sec-label">09 / Guia de copy para e-mails</div>
  <h2>Como escrever sem soar agressivo</h2>
  <div class="two-col">
    <div>
      <h3>Usar mais</h3>
      {bullets([
        "Entenda se essa vaga vale seu tempo.",
        "Veja o que falta antes de enviar.",
        "Adapte seu currículo para esta oportunidade.",
        "Sua candidatura fica mais forte quando tem contexto.",
        "Acompanhe o próximo passo para não perder timing.",
        "Treine com base na vaga real."
      ])}
    </div>
    <div>
      <h3>Evitar</h3>
      {bullets([
        "Garanta sua aprovação.",
        "Passe em qualquer processo.",
        "Currículo perfeito em segundos.",
        "A IA consegue seu emprego.",
        "Nunca mais seja rejeitado.",
        "Aumente 10x suas chances sem esforço."
      ])}
    </div>
  </div>
  <div class="callout"><b>Tom recomendado:</b> direto, adulto, estrategico e acolhedor. O usuario precisa sentir que esta sendo orientado, nao pressionado.</div>
</section>
""")

sections.append(f"""
<section class="section" id="metricas">
  <div class="sec-label">10 / KPIs e testes</div>
  <h2>Como medir se a estrategia funciona</h2>
  {table(["Camada", "Indicador", "Meta inicial", "O que fazer se estiver baixo"], [
    ["Entrega", "Delivery rate", "> 97%", "Revisar dominio, SPF/DKIM/DMARC, bounce e lista."],
    ["Abertura", "Open rate", "35%+ em onboarding; 25%+ em campanhas", "Melhorar assunto, segmentacao e timing."],
    ["Clique", "CTR", "4% a 10%", "CTA unico, conteudo mais curto e proximo passo claro."],
    ["Ativacao", "Analise iniciada apos e-mail", "10%+ dos cliques", "Levar para tela certa com contexto preenchido."],
    ["Conversao", "Upgrade apos e-mail", "1% a 4% em fluxos de limite", "Testar oferta, comparativo e urgencia real."],
    ["Retencao", "Retorno ao app em 7 dias", "15%+ para usuarios ativos", "Usar alertas e proximas acoes mais personalizadas."],
    ["Descadastro", "Unsubscribe", "< 0,5%", "Reduzir frequencia e melhorar relevancia."]
  ])}
  {table(["Teste A/B", "Versao A", "Versao B", "Decisao"], [
    ["Assunto", "Dor direta", "Beneficio pratico", "Manter maior abertura com clique saudavel."],
    ["CTA", "Analisar vaga", "Ver meu score", "Escolher por ativacao real, nao clique bruto."],
    ["Timing", "D+1", "D+2", "Comparar uso do app apos 48h."],
    ["Oferta", "Starter", "Pro", "Ofertar plano conforme intensidade de uso."],
    ["Conteudo", "Educacional", "Exemplo concreto", "Manter o que gera clique para produto."]
  ])}
</section>
""")

sections.append(f"""
<section class="section" id="implementacao">
  <div class="sec-label">11 / Implementacao tecnica</div>
  <h2>Como tirar do papel sem quebrar o app</h2>
  <p class="lead">A implementação deve respeitar LGPD, descadastro e histórico de envios. O VagaAI já usa Resend e Supabase; o próximo passo é organizar eventos e filas por jornada.</p>
  {table(["Necessidade", "Como implementar", "Observacao"], [
    ["Eventos de produto", "Registrar analysis_completed, cv_generated, tracker_added, alert_clicked, plan_limit_hit.", "Sem evento, a segmentacao vira chute."],
    ["Tabela de e-mails", "Criar email_events ou reaproveitar com cuidado chave sintética por campanha.", "Evitar duplicidade e medir clique/conversao."],
    ["Preferencias", "Guardar opt-in, unsubscribe e categorias: produto, alertas, conteudo.", "Transacional pode ser separado de marketing."],
    ["UTMs", "Adicionar utm_source=email, utm_medium=lifecycle, utm_campaign=nome.", "Ajuda GA4 e funil."],
    ["Templates", "Criar componentes HTML consistentes com marca.", "Evitar copiar HTML gigante em cada rota."],
    ["Frequencia", "No maximo 1 campanha semanal + automacoes comportamentais relevantes.", "Candidato em busca ativa tem ansiedade; excesso queima marca."]
  ])}
  <div class="priority-box"><b>Prioridade tecnica:</b> antes de aumentar volume, garantir autenticação de domínio, unsubscribe funcional, dedupe de envio e tracking mínimo de clique/conversão.</div>
</section>
""")

sections.append(f"""
<section class="section" id="plano-30">
  <div class="sec-label">12 / Plano de 30 dias</div>
  <h2>Execucao prática</h2>
  {table(["Semana", "Entregas", "Resultado esperado"], [
    ["Semana 1", "Reescrever welcome, day2, day5; configurar UTMs; revisar descadastro.", "Onboarding mais direto e mensurável."],
    ["Semana 2", "Criar pos-analise por score e limite Free.", "Primeiros e-mails de conversao comportamental."],
    ["Semana 3", "Criar régua de candidaturas e alertas.", "Retencao e retorno ao app."],
    ["Semana 4", "Enviar newsletter semanal piloto + medir abertura/clique/conversao.", "Baseline editorial para repetir ou ajustar."]
  ])}
  <div class="callout amber"><b>Sequência recomendada:</b> comece por e-mails que já têm contexto de produto. Eles convertem melhor que newsletter ampla.</div>
</section>
""")

sections.append("""
<section class="section" id="checklist">
  <div class="sec-label">13 / Checklist final</div>
  <h2>Antes de disparar</h2>
  <div class="check-grid">
    <span>Assunto promete algo realista?</span>
    <span>Existe um CTA principal?</span>
    <span>O link leva para a tela certa?</span>
    <span>O e-mail usa contexto real do usuario?</span>
    <span>Tem opt-out quando for marketing?</span>
    <span>Tem UTM?</span>
    <span>Evita prometer emprego?</span>
    <span>Está alinhado ao plano do usuário?</span>
    <span>Tem dedupe para nao enviar duplicado?</span>
    <span>Foi testado em mobile?</span>
  </div>
</section>
""")

css = """
:root {
  --forest:#0A1A10; --deep:#0D5A35; --emerald:#1A7A4A; --bright:#4ECE91;
  --paper:#F5F7F5; --card:#FFFFFF; --ink:#071209; --text:#254B34;
  --muted:#6E8A78; --border:#DDE8E2; --amber:#C47D0A; --amber-bg:#FFF7E8;
  --red:#D94F4F; --shadow:0 18px 50px rgba(7,18,9,.10); --r:24px; --r-sm:14px;
}
* { box-sizing:border-box; }
body { margin:0; background:var(--paper); color:var(--ink); font-family:Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height:1.55; }
a { color:var(--emerald); font-weight:800; text-decoration:none; }
.layout { display:grid; grid-template-columns:292px 1fr; min-height:100vh; }
aside { position:sticky; top:0; height:100vh; padding:30px 24px; background:radial-gradient(circle at 20% 0%, rgba(78,206,145,.16), transparent 28%), var(--forest); color:#fff; overflow:auto; }
.brand { display:flex; gap:12px; align-items:center; margin-bottom:30px; }
.mark { width:36px; height:36px; border-radius:50%; background:#151515; display:grid; place-items:center; color:#fff; font-weight:900; font-family:Georgia, serif; box-shadow:0 0 0 1px rgba(255,255,255,.08); }
.brand b { font-family:Georgia, serif; font-size:22px; letter-spacing:-.02em; }
.brand b span { color:var(--bright); }
.nav-label { font-size:10px; color:rgba(255,255,255,.42); text-transform:uppercase; letter-spacing:.16em; font-weight:800; margin:18px 0 10px; }
nav { display:grid; gap:5px; }
nav a { display:flex; align-items:center; gap:10px; padding:9px 10px; border-radius:12px; color:rgba(255,255,255,.72); font-size:13px; font-weight:600; }
nav a span { width:24px; height:24px; border-radius:8px; display:grid; place-items:center; background:rgba(255,255,255,.06); color:var(--bright); font-size:11px; font-weight:800; }
nav a:hover { background:rgba(255,255,255,.07); color:#fff; }
.side-note { margin-top:28px; border:1px solid rgba(255,255,255,.10); border-radius:18px; padding:16px; background:rgba(255,255,255,.045); }
.side-note b { color:var(--bright); font-size:12px; text-transform:uppercase; letter-spacing:.08em; }
.side-note p { margin:8px 0 0; color:rgba(255,255,255,.67); font-size:12.5px; }
main { padding:42px clamp(28px, 5vw, 72px) 72px; }
.cover { position:relative; overflow:hidden; border-radius:32px; padding:56px; min-height:500px; background:linear-gradient(135deg,#081510,#0E3D26 58%,#177247); color:#fff; box-shadow:var(--shadow); margin-bottom:34px; display:grid; grid-template-columns:1.08fr .92fr; gap:40px; align-items:center; }
.cover:before { content:""; position:absolute; right:-130px; top:-130px; width:360px; height:360px; border-radius:50%; background:rgba(78,206,145,.16); }
.cover-copy, .cover-panel { position:relative; z-index:1; }
.kicker, .sec-label { color:var(--emerald); font-size:11px; text-transform:uppercase; letter-spacing:.15em; font-weight:900; margin-bottom:14px; }
.cover .kicker { color:var(--bright); }
h1, h2, h3 { font-family:Georgia, "Times New Roman", serif; letter-spacing:-.035em; }
h1 { font-size:56px; line-height:1.02; margin:0 0 18px; max-width:820px; }
h2 { font-size:38px; line-height:1.08; margin:0 0 14px; }
h3 { font-size:22px; line-height:1.15; margin:24px 0 8px; }
h4 { font-size:16px; margin:0 0 8px; }
p { color:var(--text); margin:0 0 14px; }
.cover p { color:#d8efe0; font-size:18px; max-width:760px; }
.cover-actions { display:flex; flex-wrap:wrap; gap:10px; margin-top:26px; }
.cover-actions span { border:1px solid rgba(255,255,255,.14); background:rgba(255,255,255,.08); color:#d7f2df; padding:9px 12px; border-radius:999px; font-size:12px; font-weight:700; }
.cover-panel { background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.14); border-radius:24px; padding:24px; box-shadow:0 24px 70px rgba(0,0,0,.22); backdrop-filter:blur(10px); }
.panel-top { display:flex; align-items:center; gap:7px; color:#aacdb7; font-size:12px; margin-bottom:22px; }
.panel-top span { width:9px; height:9px; border-radius:50%; background:#ff6b5f; }
.panel-top span:nth-child(2) { background:#f5bd4f; }
.panel-top span:nth-child(3) { background:#42d37b; }
.panel-top b { margin-left:auto; color:#cfe8d7; }
.flow { display:grid; gap:12px; }
.flow div { display:flex; gap:12px; align-items:center; padding:12px; border-radius:14px; background:rgba(255,255,255,.07); border:1px solid rgba(255,255,255,.09); }
.flow b { width:30px; height:30px; display:grid; place-items:center; border-radius:50%; background:var(--bright); color:#062012; }
.flow span { color:#e5f7eb; font-weight:800; }
.panel-note { margin-top:20px; color:#b9d8c5; font-size:13px; border-top:1px solid rgba(255,255,255,.1); padding-top:14px; }
.section { background:var(--card); border:1px solid var(--border); border-radius:var(--r); padding:34px; margin-bottom:22px; box-shadow:0 8px 30px rgba(10,26,16,.06); break-inside:avoid; }
.lead { font-size:17px; color:var(--text); max-width:980px; }
.two-col { display:grid; grid-template-columns:1fr 1fr; gap:34px; }
.grid-4 { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-top:22px; }
.metric { background:linear-gradient(180deg,#fff,#f4faf6); border:1px solid var(--border); border-radius:18px; padding:18px; }
.metric b { display:block; font-size:17px; color:var(--ink); }
.metric span { display:block; margin-top:4px; color:var(--muted); font-size:13px; }
.callout, .priority-box { border:1px solid rgba(26,122,74,.20); background:#ebf8f1; color:var(--text); border-radius:18px; padding:18px 20px; margin-top:22px; }
.callout.amber { background:#fff7e8; border-color:rgba(196,125,10,.25); }
table { width:100%; border-collapse:separate; border-spacing:0; margin:20px 0 0; overflow:hidden; border:1px solid var(--border); border-radius:16px; font-size:13px; }
th, td { padding:13px 14px; border-bottom:1px solid var(--border); vertical-align:top; text-align:left; }
th { background:#eef6f1; color:var(--forest); text-transform:uppercase; letter-spacing:.08em; font-size:10px; }
tr:last-child td { border-bottom:none; }
td:first-child { font-weight:800; color:var(--ink); }
.cards-3 { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; margin-top:18px; }
.mini-card { background:linear-gradient(180deg,#fff,#f7fbf8); border:1px solid var(--border); border-radius:18px; padding:20px; min-height:150px; }
.tag { display:inline-flex; align-items:center; height:24px; padding:0 9px; border-radius:999px; background:#e5f5ed; color:var(--emerald); font-size:10px; text-transform:uppercase; letter-spacing:.08em; font-weight:900; margin-bottom:12px; }
.email-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:16px; margin-top:20px; }
.email-card { border:1px solid var(--border); border-radius:18px; background:#fff; padding:20px; break-inside:avoid; }
.email-line { color:var(--text); font-size:13px; margin:7px 0; }
.email-card p { margin-top:12px; font-size:13px; }
.cta-pill { display:inline-flex; margin-top:8px; border-radius:999px; background:var(--emerald); color:#fff; padding:8px 12px; font-size:12px; font-weight:800; }
.check-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:10px; margin-top:18px; }
.check-grid span { background:#f6faf8; border:1px solid var(--border); border-radius:14px; padding:13px 14px; color:var(--text); font-weight:700; }
ul { margin:10px 0 0; padding-left:20px; color:var(--text); }
li { margin:7px 0; }
@media (max-width: 980px) {
  .layout { grid-template-columns:1fr; }
  aside { position:relative; height:auto; }
  .cover, .two-col, .grid-4, .cards-3, .email-grid, .check-grid { grid-template-columns:1fr; }
  main { padding:24px; }
  h1 { font-size:40px; }
  h2 { font-size:30px; }
}
@media print {
  @page { size:A4; margin:12mm; }
  body { background:#fff; }
  .layout { display:block; }
  aside { display:none; }
  main { padding:0; }
  .cover, .section, .email-card { box-shadow:none; break-inside:avoid; page-break-inside:avoid; }
  .cover { min-height:auto; margin-bottom:14px; }
}
"""

nav_items = [
    ("00", "Resumo", "resumo"),
    ("01", "Estado atual", "estado-atual"),
    ("02", "Segmentacao", "segmentacao"),
    ("03", "Pilares", "pilares"),
    ("04", "Automacoes", "automacoes"),
    ("05", "Free", "sequencia-free"),
    ("06", "Pos-analise", "pos-analise"),
    ("07", "Campanhas", "conteudos-semanais"),
    ("08", "Templates", "templates"),
    ("09", "Copy", "copy"),
    ("10", "KPIs", "metricas"),
    ("11", "Implementacao", "implementacao"),
    ("12", "30 dias", "plano-30"),
    ("13", "Checklist", "checklist"),
]

nav_html = "\n".join(f'<a href="#{href}"><span>{num}</span>{label}</a>' for num, label, href in nav_items)

html_doc = f"""<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Estratégia de E-mail Marketing VagaAI</title>
  <style>{css}</style>
</head>
<body>
  <div class="layout">
    <aside>
      <div class="brand"><div class="mark">V</div><b>Vaga<span>AI</span></b></div>
      <div class="nav-label">E-mail marketing</div>
      <nav>{nav_html}</nav>
      <div class="side-note">
        <b>Direcao</b>
        <p>Nutrir por dor real, ativar pelo proximo passo e converter quando o usuario ja percebeu valor.</p>
      </div>
    </aside>
    <main>{"".join(sections)}</main>
  </div>
</body>
</html>
"""

md_doc = """# Estratégia de E-mail Marketing VagaAI

Documento gerado em HTML/PDF com:

- estratégia editorial para conversão
- segmentação por jornada
- réguas automatizadas
- calendário de campanhas
- templates de e-mails
- guia de copy
- KPIs e testes
- implementação técnica sugerida

Arquivos:

- Estrategia de Email Marketing VagaAI.html
- Estrategia de Email Marketing VagaAI.pdf
- Estrategia de Email Marketing VagaAI.md
"""

HTML_PATH.write_text(html_doc, encoding="utf-8")
MD_PATH.write_text(md_doc, encoding="utf-8")

print(HTML_PATH)
print(MD_PATH)
