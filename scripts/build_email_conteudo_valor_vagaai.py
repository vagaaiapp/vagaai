from pathlib import Path
from html import escape

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "email-marketing-vagaai"
OUT.mkdir(exist_ok=True)

HTML_PATH = OUT / "Estrategia de Conteudo por Email VagaAI.html"
MD_PATH = OUT / "Estrategia de Conteudo por Email VagaAI.md"


def card(title, body="", cls="card"):
    return f'<div class="{cls}"><h3>{escape(title)}</h3><p>{escape(body)}</p></div>'


pillars = [
    {
        "name": "1. Vagas que valem seu tempo",
        "role": "Ensinar o usuario a escolher melhor antes de gastar energia aplicando.",
        "promise": "Menos candidaturas no escuro. Mais clareza sobre onde vale insistir.",
        "ideas": [
            ("Antes de aplicar, faca esta pergunta sobre a vaga", "A maioria olha so cargo e salario. O que decide suas chances esta nos requisitos, no momento da empresa e na aderencia real.", "Analise uma vaga antes de enviar o curriculo"),
            ("Nem toda vaga boa e uma boa vaga para voce", "Uma vaga pode parecer perfeita e ainda assim desperdiçar sua energia se pedir um historico que seu CV nao prova.", "Veja seu score de aderencia"),
            ("O erro de enviar curriculo para toda vaga parecida", "Volume sem criterio cria cansaco, frustracao e baixa taxa de retorno.", "Filtre oportunidades por cargo, local e salario"),
            ("Como identificar uma vaga-armadilha em 2 minutos", "Descricao generica, requisitos conflitantes e senioridade confusa sao sinais de baixa qualidade.", "Use o alerta para separar oportunidades melhores"),
            ("A vaga que parece junior, mas cobra senior", "Muitas descricoes misturam escopo, senioridade e salario de forma desalinhada.", "Compare requisitos antes de aplicar"),
            ("O recrutador nao le sua intencao. Ele le evidencias", "Querer a vaga nao basta. O curriculo precisa mostrar o que aquela oportunidade pede.", "Descubra lacunas da vaga"),
            ("Quando vale aplicar mesmo com score medio", "Nem todo score medio e rejeicao. Algumas lacunas sao ajustaveis no curriculo.", "Veja o que pode melhorar"),
            ("Quando nao vale aplicar, mesmo que voce queira muito", "Se a vaga exige experiencia que voce nao tem e nao pode demonstrar, a energia talvez esteja melhor em outra oportunidade.", "Priorize vagas com melhor encaixe"),
            ("Seu tempo de busca tambem precisa de estrategia", "A busca por emprego melhora quando voce decide onde investir atencao, nao quando dispara curriculos sem contexto.", "Organize sua lista de vagas"),
            ("A melhor vaga da semana talvez nao seja a mais famosa", "Empresas menores, cargos especificos e requisitos mais claros podem gerar oportunidades melhores.", "Receba vagas alinhadas ao seu perfil"),
        ],
    },
    {
        "name": "2. Curriculo que prova valor",
        "role": "Mostrar que curriculo bom nao e bonito: e especifico, claro e comprovavel.",
        "promise": "Transformar experiencias em argumentos que combinam com a vaga.",
        "ideas": [
            ("Seu curriculo nao precisa falar tudo. Precisa provar o que importa", "Curriculos genericos tentam agradar todo mundo e acabam nao convencendo ninguem.", "Otimize para uma vaga real"),
            ("O que seu curriculo esta dizendo sem voce perceber", "Ausencia de metricas, verbos fracos e experiencias soltas comunicam menos senioridade do que voce tem.", "Veja a qualidade ATS"),
            ("A experiencia esta la. O problema e como ela aparece", "Muitos profissionais tem repertorio, mas apresentam isso de forma que nao conversa com a vaga.", "Reescreva com foco na oportunidade"),
            ("Por que seu resumo profissional pode estar te enfraquecendo", "Resumo generico abre o curriculo com baixa precisao e tira contexto das suas conquistas.", "Ajuste o resumo para a vaga"),
            ("O recrutador procura sinais, nao autobiografia", "A primeira leitura busca correspondencia rapida entre requisito e evidencia.", "Destaque palavras-chave certas"),
            ("Seu curriculo precisa de menos adjetivo e mais prova", "Proativo, dinamico e comunicativo dizem pouco sem resultado, escopo e contexto.", "Adicione metricas e evidencias"),
            ("Um curriculo para cada oportunidade nao e exagero", "E estrategia. Cada vaga valoriza uma parte diferente da sua experiencia.", "Gerar versao otimizada"),
            ("O que tirar do curriculo para ele parecer mais forte", "Excesso de informacao dilui relevancia. O foco certo aumenta percepcao de encaixe.", "Compacte e priorize secoes"),
            ("A diferenca entre listar tarefas e vender impacto", "Tarefa mostra o que voce fez. Impacto mostra por que aquilo importou.", "Transforme tarefas em resultados"),
            ("Seu CV esta pronto para humanos e sistemas?", "ATS, recrutadores e gestores procuram pistas diferentes. O ideal e equilibrar clareza e aderencia.", "Ver score de aderencia"),
        ],
    },
    {
        "name": "3. ATS sem terrorismo",
        "role": "Educar sem medo barato. Explicar filtros, palavras-chave e legibilidade com honestidade.",
        "promise": "Ajudar o usuario a entender filtros automaticos sem prometer milagre.",
        "ideas": [
            ("ATS nao e um robo vilao. E um filtro de contexto", "O problema nao e o sistema existir. E enviar um curriculo que nao conversa com a vaga.", "Ver palavras-chave ausentes"),
            ("O que pode fazer seu CV sumir antes da entrevista", "Pouca aderencia, termos ausentes e experiencias mal descritas reduzem leitura e ranqueamento.", "Diagnosticar uma vaga"),
            ("Palavra-chave nao e copiar requisito", "Copiar a descricao da vaga pode soar artificial. O ideal e traduzir requisitos em experiencia real.", "Otimizar sem inventar"),
            ("O mito do curriculo perfeito para todas as vagas", "Nao existe curriculo universal forte. Existe curriculo bem posicionado para uma oportunidade.", "Criar versao por vaga"),
            ("Score baixo nao significa fim. Significa mapa", "Um score mostra lacunas. Algumas sao estruturais, outras sao apenas ajuste de comunicacao.", "Ver prioridades de melhoria"),
            ("Como ler uma descricao de vaga como um recrutador", "Cargo, senioridade, verbos e requisitos repetidos indicam o que pesa na triagem.", "Comparar vaga e CV"),
            ("Tres sinais de que seu CV esta generico demais", "Resumo amplo, experiencias sem metricas e habilidades soltas dificultam correspondencia.", "Melhorar com IA"),
            ("Por que formatacao tambem influencia", "Leitura ruim, secoes confusas e excesso visual podem atrapalhar sistemas e pessoas.", "Exportar modelo ATS-friendly"),
            ("Nem toda lacuna precisa ser corrigida", "Algumas lacunas sao experiencia real que voce nao tem. Outras sao apenas coisas que voce nao explicou.", "Separar lacuna real de lacuna de escrita"),
            ("O ATS nao contrata. Mas pode impedir voce de ser visto", "A meta nao e agradar algoritmo. E garantir que sua experiencia seja entendida.", "Fortalecer candidatura"),
        ],
    },
    {
        "name": "4. Rotina de candidatura",
        "role": "Ensinar organizacao, follow-up, priorizacao e consistencia sem ansiedade.",
        "promise": "Transformar busca por emprego em processo, nao em caos.",
        "ideas": [
            ("Se voce nao acompanha suas candidaturas, voce perde contexto", "Depois de alguns envios, fica dificil lembrar onde aplicou, quando responderam e qual vaga merece follow-up.", "Abrir rastreador"),
            ("A busca por emprego precisa de rotina, nao impulso", "Aplicar em dias aleatorios aumenta sensacao de descontrole. Processo simples reduz ansiedade.", "Organizar proximas acoes"),
            ("O melhor follow-up e curto, contextual e no tempo certo", "A mensagem certa nao implora. Ela reforca interesse e disponibilidade.", "Ver candidaturas pendentes"),
            ("O que fazer depois de enviar o curriculo", "A candidatura nao termina no envio. Existe acompanhamento, entrevista, carta e preparacao.", "Marcar status da vaga"),
            ("Por que voce esquece vagas boas no meio do caminho", "Sem rastreador, oportunidades importantes viram abas perdidas e prints soltos.", "Salvar oportunidade"),
            ("Uma candidatura forte tem memoria", "Vaga, CV, carta, score e entrevista precisam ficar conectados.", "Centralizar no VagaAI"),
            ("Como saber qual vaga merece sua atencao hoje", "Priorize por prazo, score, etapa e impacto na sua carreira.", "Gerenciar proximas acoes"),
            ("O erro de tratar todas as candidaturas igual", "Algumas precisam de follow-up. Outras pedem CV melhor. Outras pedem treino de entrevista.", "Ver prioridade da semana"),
            ("Seu funil de emprego precisa ser visivel", "Quando voce enxerga analisadas, aplicadas e entrevistas, entende onde esta travando.", "Acompanhar funil"),
            ("Busca organizada nao garante vaga. Mas evita desperdicio", "Clareza operacional aumenta constancia e melhora decisoes.", "Criar sistema de candidaturas"),
        ],
    },
    {
        "name": "5. Entrevista com contexto",
        "role": "Mostrar que preparacao boa nasce da vaga, da empresa e do CV enviado.",
        "promise": "Chegar com respostas mais especificas, menos improvisadas.",
        "ideas": [
            ("A entrevista comeca antes da primeira pergunta", "Ela comeca quando voce entende o que aquela vaga realmente precisa validar.", "Treinar entrevista"),
            ("Responder bem nao e decorar frase pronta", "Resposta forte conecta experiencia, contexto e resultado.", "Simular perguntas da vaga"),
            ("O que destacar quando perguntam sobre sua experiencia", "Nem toda experiencia merece o mesmo peso. A vaga define o que precisa ir para frente.", "Ver perguntas personalizadas"),
            ("A pergunta que derruba bons candidatos", "Fale sobre voce pode virar resposta generica se voce nao tiver narrativa.", "Preparar resposta com base no CV"),
            ("Se voce nao sabe o que a empresa busca, voce responde no escuro", "Briefing de empresa e descricao da vaga ajudam a antecipar temas importantes.", "Gerar briefing"),
            ("Treinar entrevista nao e parecer ensaiado", "E ganhar clareza para responder com calma, estrutura e exemplos reais.", "Praticar com feedback"),
            ("Como transformar uma lacuna em resposta honesta", "Nem toda fraqueza precisa ser escondida. Algumas precisam ser contextualizadas.", "Treinar objecoes"),
            ("Sua resposta precisa ter exemplo, decisao e resultado", "O modelo simples evita respostas vagas e aumenta credibilidade.", "Avaliar resposta"),
            ("A entrevista mede aderencia e maturidade", "Tecnica importa, mas raciocinio, postura e clareza tambem pesam.", "Treinar perguntas comportamentais"),
            ("O que revisar 30 minutos antes da entrevista", "Vaga, empresa, conquistas mais relevantes, perguntas provaveis e motivacao.", "Abrir preparacao da vaga"),
        ],
    },
    {
        "name": "6. Carreira em movimento",
        "role": "Conteudos conceituais que criam identificacao emocional e mantem a marca lembrada.",
        "promise": "Ajudar o profissional a repensar rota, valor, estrategia e mercado.",
        "ideas": [
            ("Talvez voce nao precise de mais coragem. Precise de mais direcao", "Buscar emprego sem clareza transforma ansiedade em movimento sem resultado.", "Comecar por uma vaga real"),
            ("As vezes mudar de rota e sinal de maturidade", "Recalcular carreira nao e fracasso. E leitura de contexto.", "Mapear oportunidades melhores"),
            ("O silencio depois do envio cansa mais do que a vaga em si", "O problema nao e apenas nao passar. E nao saber por que nao passou.", "Entender sua aderencia"),
            ("Voce nao esta atrasado. Mas talvez esteja aplicando sem estrategia", "Comparar trajetorias pode esconder a pergunta certa: qual vaga conversa com o que voce prova hoje?", "Criar plano de candidatura"),
            ("Experiencia sem narrativa vira ruido", "O mercado nao adivinha sua historia. Voce precisa organizar sinais.", "Fortalecer seu curriculo"),
            ("Ser bom nao basta se ninguem entende onde voce se encaixa", "Valor profissional precisa ser traduzido para a oportunidade certa.", "Testar encaixe da vaga"),
            ("A pressa de sair pode te levar para outra vaga errada", "Trocar de emprego pede criterio, nao apenas urgencia.", "Receber vagas alinhadas"),
            ("O curriculo tambem conta como voce enxerga sua carreira", "Foco, escolhas e progresso aparecem na forma como voce organiza sua trajetoria.", "Revisar narrativa profissional"),
            ("Nao e sobre mandar mais. E sobre mandar melhor", "Quantidade pode dar sensacao de controle, mas qualidade aumenta chance de retorno.", "Analisar antes de enviar"),
            ("Quando tudo parece urgente, priorizar vira autocuidado", "A busca por emprego fica menos pesada quando o proximo passo e claro.", "Ver proxima melhor acao"),
        ],
    },
    {
        "name": "7. Mercado, IA e bastidores do recrutamento",
        "role": "Trazer contexto de mercado e educar o candidato sobre como a selecao mudou.",
        "promise": "Dar leitura de ambiente para o usuario tomar melhores decisoes.",
        "ideas": [
            ("O recrutamento ficou mais digital. Sua candidatura tambem precisa ficar mais clara", "Mais tecnologia na triagem exige curriculos mais legiveis, especificos e contextualizados.", "Preparar candidatura completa"),
            ("IA no recrutamento nao elimina criterio. Ela aumenta a importancia do contexto", "Quanto mais automatizacao, mais importante e conectar requisitos, experiencia e evidencias.", "Ver score de compatibilidade"),
            ("A vaga mudou. O jeito de se candidatar tambem", "Candidatura forte hoje combina escolha, diagnostico, adaptacao, acompanhamento e preparo.", "Conhecer o fluxo VagaAI"),
            ("O mercado nao premia apenas quem tem experiencia. Premia quem comunica valor", "Experiencia escondida em texto fraco perde para experiencia bem apresentada.", "Melhorar apresentacao do CV"),
            ("Empresas buscam sinais de encaixe antes de conversar", "Seu curriculo, carta e respostas precisam antecipar esse encaixe.", "Criar materiais por vaga"),
            ("O candidato tambem precisa de inteligencia de busca", "Nao basta esperar retorno. E preciso entender padroes, funil e proximas acoes.", "Acompanhar candidaturas"),
            ("A triagem ficou mais rapida. Sua mensagem precisa ser mais precisa", "O primeiro contato com seu perfil precisa mostrar relevancia em poucos segundos.", "Ajustar resumo e keywords"),
            ("O excesso de vagas online criou outro problema: escolha ruim", "Com muitas oportunidades, o desafio vira decidir onde investir tempo.", "Receber alertas filtrados"),
            ("O futuro da candidatura e contextual", "Um curriculo, uma carta e uma entrevista preparados para a mesma vaga comunicam maturidade.", "Unificar sua jornada"),
            ("O profissional que aprende com cada envio evolui mais rapido", "Cada score, lacuna e resposta vira dado para a proxima candidatura.", "Usar historico de analises"),
        ],
    },
]

series = [
    ("Segunda", "Vaga da semana", "Uma vaga real ou perfil de vaga + o que observar antes de aplicar.", "Educacao + ativacao"),
    ("Terca", "Erro de curriculo", "Um erro especifico que reduz aderencia e como corrigir.", "Autoridade"),
    ("Quarta", "ATS sem panico", "Explicacao simples sobre filtros, score e palavras-chave.", "Educacao"),
    ("Quinta", "Candidatura mais forte", "Checklist pratico para enviar melhor uma oportunidade.", "Conversao suave"),
    ("Sexta", "Carreira em movimento", "Texto conceitual curto, emocional e sofisticado.", "Relacionamento"),
]

templates = [
    {
        "name": "Newsletter educativa",
        "subject": "Voce pode estar perdendo vagas boas por um detalhe simples",
        "preheader": "Antes de enviar mais um curriculo, olhe para a aderencia.",
        "body": [
            "A maioria dos candidatos decide aplicar olhando cargo, salario e nome da empresa.",
            "Mas a triagem olha outra coisa: requisitos, palavras-chave, senioridade e evidencias no curriculo.",
            "Isso significa que uma vaga aparentemente perfeita pode estar desalinhada com o que seu CV prova hoje.",
            "Antes de enviar, pergunte: meu curriculo mostra exatamente o que essa vaga esta pedindo?",
        ],
        "cta": "Analisar uma vaga gratis",
    },
    {
        "name": "Dor + reframe",
        "subject": "Mandar mais curriculos pode nao ser o melhor proximo passo",
        "preheader": "Quando o retorno nao vem, talvez o problema seja direcao.",
        "body": [
            "Se voce ja enviou dezenas de curriculos e recebeu pouco retorno, a resposta natural e mandar mais.",
            "Mas volume sem diagnostico costuma repetir o mesmo problema em escala.",
            "O caminho mais inteligente e entender onde sua candidatura perde forca: escolha da vaga, aderencia, curriculo, carta ou entrevista.",
        ],
        "cta": "Ver onde sua candidatura pode melhorar",
    },
    {
        "name": "Produto sem parecer propaganda",
        "subject": "A diferenca entre um curriculo bom e um curriculo certo para a vaga",
        "preheader": "O VagaAI compara os dois antes de voce aplicar.",
        "body": [
            "Um curriculo pode estar bem escrito e ainda assim nao ser o melhor curriculo para aquela vaga.",
            "Isso acontece porque cada oportunidade valoriza sinais diferentes.",
            "O VagaAI ajuda a comparar a descricao da vaga com seu perfil, mostra lacunas e gera uma versao mais direcionada.",
        ],
        "cta": "Testar com uma vaga real",
    },
    {
        "name": "Conteudo conceitual",
        "subject": "Talvez voce nao precise enviar mais. Precise enxergar melhor.",
        "preheader": "Busca por emprego tambem e estrategia.",
        "body": [
            "Existe uma fase da busca em que tudo parece depender de insistir mais.",
            "Mais vagas, mais curriculos, mais abas abertas.",
            "Mas as vezes a virada vem quando voce para de se mover no escuro e comeca a entender quais oportunidades realmente combinam com sua trajetoria.",
        ],
        "cta": "Organizar minha busca",
    },
]


def render_ideas(pillar):
    rows = []
    for i, (headline, angle, cta) in enumerate(pillar["ideas"], 1):
        rows.append(
            f"""
            <div class="idea">
              <div class="idea-num">{i:02d}</div>
              <div>
                <h4>{escape(headline)}</h4>
                <p>{escape(angle)}</p>
                <span>CTA sutil: {escape(cta)}</span>
              </div>
            </div>
            """
        )
    return "\n".join(rows)


pillar_html = "\n".join(
    f"""
    <section class="section pillar" id="pilar-{idx}">
      <div class="label">Pilar editorial {idx}</div>
      <h2>{escape(p['name'])}</h2>
      <p class="lead">{escape(p['role'])}</p>
      <div class="promise">{escape(p['promise'])}</div>
      <div class="ideas">{render_ideas(p)}</div>
    </section>
    """
    for idx, p in enumerate(pillars, 1)
)

series_rows = "\n".join(
    f"<tr><td>{escape(day)}</td><td>{escape(name)}</td><td>{escape(desc)}</td><td>{escape(goal)}</td></tr>"
    for day, name, desc, goal in series
)

template_html = "\n".join(
    f"""
    <div class="template">
      <div class="tag">{escape(t['name'])}</div>
      <h3>{escape(t['subject'])}</h3>
      <p><b>Preheader:</b> {escape(t['preheader'])}</p>
      <ul>{"".join(f"<li>{escape(x)}</li>" for x in t['body'])}</ul>
      <div class="cta">CTA: {escape(t['cta'])}</div>
    </div>
    """
    for t in templates
)

html = f"""<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Estrategia Editorial de E-mails VagaAI</title>
  <style>
    :root {{
      --forest:#0A1A10; --deep:#0D5A35; --emerald:#1A7A4A; --bright:#4ECE91;
      --paper:#F5F7F5; --card:#FFFFFF; --ink:#071209; --text:#254B34; --muted:#6E8A78;
      --line:#DDE8E1; --soft:#EAF4EE; --amber:#C47D0A; --red:#D94F4F;
    }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; background:var(--paper); color:var(--ink); font-family: Inter, Arial, sans-serif; line-height:1.55; }}
    h1,h2,h3,h4 {{ font-family: Georgia, 'Times New Roman', serif; margin:0; letter-spacing:-.03em; }}
    h1 {{ font-size:58px; line-height:.96; color:#fff; max-width:860px; }}
    h2 {{ font-size:34px; line-height:1.05; margin-bottom:14px; }}
    h3 {{ font-size:20px; line-height:1.15; }}
    h4 {{ font-family:Inter, Arial, sans-serif; font-size:16px; letter-spacing:-.01em; margin-bottom:5px; }}
    p {{ margin:0; color:var(--text); }}
    .wrap {{ max-width:1120px; margin:0 auto; padding:38px 32px 80px; }}
    .cover {{ background:linear-gradient(135deg,#071209,#0D5A35 65%,#1A7A4A); border-radius:36px; padding:56px; margin-bottom:30px; position:relative; overflow:hidden; box-shadow:0 30px 80px rgba(7,18,9,.22); }}
    .cover:after {{ content:''; position:absolute; right:-90px; top:-120px; width:360px; height:360px; border-radius:50%; background:rgba(78,206,145,.14); }}
    .kicker,.label {{ color:var(--bright); text-transform:uppercase; font-weight:900; letter-spacing:.14em; font-size:12px; margin-bottom:14px; }}
    .cover p {{ color:#D6E8DC; font-size:19px; max-width:760px; margin-top:20px; }}
    .chips {{ display:flex; flex-wrap:wrap; gap:10px; margin-top:30px; }}
    .chip {{ color:#D8F5E5; border:1px solid rgba(255,255,255,.18); background:rgba(255,255,255,.07); border-radius:999px; padding:9px 14px; font-size:13px; font-weight:800; }}
    .hero-grid {{ display:grid; grid-template-columns:repeat(3,1fr); gap:14px; margin-top:34px; }}
    .hero-card {{ background:rgba(255,255,255,.09); border:1px solid rgba(255,255,255,.13); border-radius:18px; padding:18px; color:#fff; }}
    .hero-card b {{ display:block; font-size:28px; margin-bottom:4px; color:#fff; }}
    .hero-card span {{ color:#BFE8CF; font-size:12px; font-weight:800; text-transform:uppercase; letter-spacing:.08em; }}
    .section {{ background:var(--card); border:1px solid var(--line); border-radius:28px; padding:36px; margin-bottom:22px; box-shadow:0 16px 40px rgba(10,26,16,.06); break-inside:avoid; page-break-inside:avoid; }}
    .lead {{ font-size:18px; max-width:820px; margin-bottom:18px; }}
    .grid {{ display:grid; grid-template-columns:repeat(3,1fr); gap:14px; margin-top:20px; }}
    .card {{ border:1px solid var(--line); background:#FBFDFC; border-radius:18px; padding:20px; min-height:145px; }}
    .card h3 {{ font-family:Inter, Arial, sans-serif; font-size:17px; letter-spacing:-.02em; margin-bottom:8px; }}
    .promise {{ border-left:4px solid var(--emerald); background:var(--soft); color:var(--deep); padding:14px 16px; border-radius:14px; margin:18px 0 22px; font-weight:800; }}
    .ideas {{ display:grid; grid-template-columns:1fr 1fr; gap:12px; }}
    .idea {{ display:flex; gap:12px; align-items:flex-start; border:1px solid var(--line); background:#FBFDFC; border-radius:18px; padding:16px; break-inside:avoid; page-break-inside:avoid; }}
    .idea-num {{ width:34px; height:34px; border-radius:10px; display:flex; align-items:center; justify-content:center; background:var(--soft); color:var(--emerald); font-weight:900; flex-shrink:0; }}
    .idea p {{ font-size:13.5px; color:var(--text); margin-bottom:9px; }}
    .idea span {{ font-size:12px; color:var(--emerald); font-weight:900; }}
    table {{ width:100%; border-collapse:collapse; margin-top:18px; overflow:hidden; border-radius:16px; }}
    th,td {{ text-align:left; border-bottom:1px solid var(--line); padding:14px; vertical-align:top; font-size:14px; }}
    th {{ background:var(--soft); color:var(--deep); text-transform:uppercase; font-size:11px; letter-spacing:.08em; }}
    .template {{ border:1px solid var(--line); background:#FBFDFC; border-radius:22px; padding:24px; margin-top:14px; break-inside:avoid; page-break-inside:avoid; }}
    .template h3 {{ margin-bottom:10px; }}
    .template ul {{ margin:14px 0; padding-left:20px; color:var(--text); }}
    .tag {{ display:inline-block; background:var(--soft); color:var(--emerald); border-radius:999px; padding:6px 10px; font-size:11px; font-weight:900; text-transform:uppercase; letter-spacing:.08em; margin-bottom:12px; }}
    .cta {{ display:inline-block; border-radius:12px; background:var(--emerald); color:#fff; padding:10px 14px; font-size:13px; font-weight:900; }}
    .checklist {{ display:grid; grid-template-columns:repeat(2,1fr); gap:10px; margin-top:20px; }}
    .checklist span {{ background:var(--soft); border:1px solid var(--line); border-radius:14px; padding:13px 14px; font-weight:800; color:var(--deep); }}
    @media print {{
      body {{ background:#fff; }}
      .wrap {{ max-width:none; padding:24px; }}
      .section,.cover {{ break-inside:avoid; page-break-inside:avoid; }}
      h1 {{ font-size:46px; }}
      h2 {{ font-size:28px; }}
    }}
  </style>
</head>
<body>
  <div class="wrap">
    <section class="cover">
      <div class="kicker">Newsletter e conteudo de valor para conversao</div>
      <h1>Uma caixa de e-mail que ajuda o candidato a procurar emprego melhor.</h1>
      <p>Este plano nao e uma regua de jornada do produto. E uma estrategia editorial para nutrir audiencia, gerar confianca, educar o mercado e criar conversao por valor percebido.</p>
      <div class="chips">
        <span class="chip">Conteudo util antes da venda</span>
        <span class="chip">Dores reais de candidatura</span>
        <span class="chip">Produto como proximo passo natural</span>
      </div>
      <div class="hero-grid">
        <div class="hero-card"><b>7</b><span>pilares editoriais</span></div>
        <div class="hero-card"><b>70</b><span>ideias de e-mails</span></div>
        <div class="hero-card"><b>5</b><span>series recorrentes</span></div>
      </div>
    </section>

    <section class="section">
      <div class="label">01 / Direcao estrategica</div>
      <h2>O papel do e-mail no VagaAI</h2>
      <p class="lead">O e-mail deve fazer o usuario sentir que recebeu clareza, nao apenas propaganda. A venda acontece quando o leitor percebe que o VagaAI organiza um problema que ele ja vive: escolher vagas, entender aderencia, adaptar curriculo e se preparar melhor.</p>
      <div class="grid">
        {card("Objetivo principal", "Transformar leitores em usuarios que testam uma vaga real no VagaAI.")}
        {card("Objetivo secundario", "Manter a marca presente durante a busca por emprego, mesmo quando o usuario ainda nao esta pronto para assinar.")}
        {card("Tese editorial", "Quem ajuda antes de vender ganha permissao para vender com mais naturalidade.")}
      </div>
    </section>

    <section class="section">
      <div class="label">02 / Cadencia recomendada</div>
      <h2>Frequencia sem virar spam</h2>
      <p class="lead">A cadencia ideal e previsivel, util e leve: duas mensagens por semana para base geral, uma newsletter mais conceitual por semana e campanhas extras apenas quando houver oportunidade ou lancamento.</p>
      <table>
        <thead><tr><th>Dia</th><th>Serie</th><th>O que enviar</th><th>Funcao</th></tr></thead>
        <tbody>{series_rows}</tbody>
      </table>
    </section>

    <section class="section">
      <div class="label">03 / Regras de conversao</div>
      <h2>Como vender sem parecer que esta vendendo o tempo todo</h2>
      <div class="grid">
        {card("1. Comece pela dor", "Abra com uma situacao que o usuario reconhece: silencio apos envio, vaga confusa, CV generico, entrevista sem preparo.")}
        {card("2. Entregue um criterio", "Ensine uma forma melhor de pensar: como avaliar uma vaga, como ler requisitos, como priorizar candidaturas.")}
        {card("3. Mostre o produto como ferramenta", "O CTA entra como a forma mais facil de aplicar o criterio na pratica, nao como interrupcao comercial.")}
      </div>
    </section>

    {pillar_html}

    <section class="section">
      <div class="label">11 / Templates prontos</div>
      <h2>Modelos de e-mails para disparo</h2>
      <p class="lead">Use estes modelos como base para campanhas semanais. O ideal e alternar dor, educacao, prova de valor e convite ao produto.</p>
      {template_html}
    </section>

    <section class="section">
      <div class="label">12 / Calendario de 30 dias</div>
      <h2>Primeiro mes de disparos</h2>
      <table>
        <thead><tr><th>Semana</th><th>E-mail 1</th><th>E-mail 2</th><th>E-mail 3 opcional</th></tr></thead>
        <tbody>
          <tr><td>Semana 1</td><td>Antes de aplicar, faca esta pergunta sobre a vaga</td><td>Seu curriculo nao precisa falar tudo</td><td>Talvez voce nao precise de mais coragem</td></tr>
          <tr><td>Semana 2</td><td>ATS nao e um robo vilao</td><td>O que fazer depois de enviar o curriculo</td><td>A entrevista comeca antes da primeira pergunta</td></tr>
          <tr><td>Semana 3</td><td>Nem toda vaga boa e boa para voce</td><td>O recrutador procura sinais, nao autobiografia</td><td>A vaga mudou. O jeito de se candidatar tambem</td></tr>
          <tr><td>Semana 4</td><td>Score baixo nao significa fim</td><td>O melhor follow-up e curto</td><td>Ser bom nao basta se ninguem entende onde voce se encaixa</td></tr>
        </tbody>
      </table>
    </section>

    <section class="section">
      <div class="label">13 / Checklist editorial</div>
      <h2>Antes de disparar</h2>
      <div class="checklist">
        <span>O assunto cria curiosidade sem exagero?</span>
        <span>O e-mail entrega valor mesmo sem clique?</span>
        <span>Existe uma dor real do candidato?</span>
        <span>O CTA e um proximo passo natural?</span>
        <span>A promessa evita garantir emprego?</span>
        <span>O texto parece mentor, nao vendedor agressivo?</span>
        <span>O conteudo reforca clareza, estrategia e preparo?</span>
        <span>Ha UTM e segmentacao por campanha?</span>
      </div>
    </section>
  </div>
</body>
</html>
"""

md_lines = [
    "# Estrategia Editorial de E-mails VagaAI",
    "",
    "Documento focado em conteudos de valor para caixa de e-mail, nao em regua operacional da jornada.",
    "",
    "## Pilares",
]
for p in pillars:
    md_lines.append(f"- {p['name']}: {p['promise']}")
md_lines.extend(["", "## Series recorrentes"])
for s in series:
    md_lines.append(f"- {s[0]} - {s[1]}: {s[2]}")
md_lines.extend(["", "## Arquivos", "- Estrategia de Conteudo por Email VagaAI.html", "- Estrategia de Conteudo por Email VagaAI.pdf", "- Estrategia de Conteudo por Email VagaAI.md"])

HTML_PATH.write_text(html, encoding="utf-8")
MD_PATH.write_text("\n".join(md_lines), encoding="utf-8")
print(HTML_PATH)
print(MD_PATH)
