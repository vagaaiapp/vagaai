from pathlib import Path
import html


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "produto-vagaai"
OUT.mkdir(exist_ok=True)


title = "Mapa Completo do Produto VagaAI"
subtitle = "Funcionalidades, logica de funcionamento, beneficios, gaps e caminhos de evolucao"


sections = [
    {
        "kicker": "Resumo executivo",
        "title": "O VagaAI nao e apenas um gerador de curriculo. E um sistema de candidatura.",
        "body": [
            "O VagaAI organiza a busca por emprego em uma jornada unica: encontrar oportunidades, entender aderencia, adaptar o curriculo, acompanhar candidaturas, preparar entrevista e gerar materiais de apoio.",
            "A promessa mais forte da marca deve ser clara e realista: ajudar o profissional a tomar decisoes melhores e enviar candidaturas mais fortes, sem prometer contratacao.",
            "O produto atual ja tem uma base poderosa. O maior desafio agora e transformar muitas funcionalidades boas em uma experiencia mais conectada, confiavel, mensuravel e facil de entender."
        ],
        "bullets": [
            "Tese central: clareza antes de aplicar, materiais melhores antes de enviar, acompanhamento depois da candidatura.",
            "Maior oportunidade: posicionar o VagaAI como sistema operacional da busca por emprego.",
            "Maior risco: excesso de funcionalidades parecer fragmentado se cada fluxo nao conversar com os demais.",
            "Prioridade: confiabilidade, plano/creditos, alertas, rastreador, mobile e metricas de ativacao."
        ]
    },
    {
        "kicker": "Contexto de mercado",
        "title": "A busca por emprego ficou mais digital, mais competitiva e mais opaca para o candidato.",
        "body": [
            "O candidato moderno vive uma contradicao: ha mais canais para encontrar vagas, mas tambem mais ruido, mais filtros automatizados e menos clareza sobre o que realmente aumenta suas chances.",
            "Relatorios de recrutamento e empregabilidade reforcam a digitalizacao do processo seletivo, o uso crescente de tecnologia na triagem e a necessidade de profissionais se posicionarem com mais precisao.",
            "Nesse contexto, o VagaAI deve se vender como um copiloto de decisao: ele nao substitui a experiencia real do candidato, mas ajuda essa experiencia a aparecer melhor para a vaga certa."
        ],
        "bullets": [
            "O mercado premia candidaturas especificas, nao curriculos genericos enviados em massa.",
            "O usuario precisa saber se vale a pena aplicar antes de gastar tempo.",
            "A dor principal nao e somente desemprego: e falta de retorno, falta de clareza e falta de preparacao.",
            "Fontes de contexto: IBGE, LinkedIn Future of Recruiting, Gupy e Indeed Hiring Lab."
        ]
    },
    {
        "kicker": "Produto atual",
        "title": "Mapa das funcionalidades existentes",
        "body": [
            "O produto cobre praticamente toda a jornada de uma candidatura: diagnostico, materiais, rastreamento, alerta e preparo. Isso e raro em ferramentas de curriculo, que normalmente param no documento.",
            "Abaixo esta o mapa funcional do VagaAI com a logica de cada modulo e o valor percebido para o cliente."
        ],
        "cards": [
            ("Analise de vaga + CV", "Recebe vaga e curriculo, calcula score, identifica lacunas, keywords presentes/ausentes, briefing e prioridades.", "Evita candidatura no escuro e mostra onde melhorar antes de enviar."),
            ("Curriculo otimizado", "Gera uma versao direcionada para a vaga, com foco ATS, templates, edicao e exportacao em PDF.", "Entrega um material mais especifico e profissional sem inventar experiencia."),
            ("Rastreador de candidaturas", "Organiza vagas analisadas, status, salario, link, proximas acoes, entrevista e historico.", "Reduz perda de contexto e transforma candidatura em processo acompanhado."),
            ("Alertas de vagas", "Monitora oportunidades com base em cargo, local, salario, senioridade e keywords.", "Traz vagas alinhadas para o usuario em vez dele buscar tudo manualmente."),
            ("Simulador de entrevista", "Gera perguntas com base na vaga e no CV, avalia respostas e pode aceitar audio.", "Prepara o usuario para destacar o que importa naquela oportunidade."),
            ("Carta de apresentacao", "Gera carta personalizada por tom e por vaga usando o curriculo do usuario.", "Ajuda em processos que pedem mensagem, e-mail ou apresentacao mais humana."),
            ("Dashboard inteligente", "Mostra proxima melhor acao, prioridades, oportunidades, funil e avisos.", "Transforma dados em direcao pratica."),
            ("Planos e pagamentos", "Free, Starter, Pro e creditos avulsos com Stripe, webhook e regras de uso.", "Cria caminhos de monetizacao flexiveis e progressivos.")
        ]
    },
    {
        "kicker": "Logica de funcionamento",
        "title": "A arquitetura de valor deve manter contexto entre todos os modulos.",
        "body": [
            "O ponto mais importante do VagaAI e preservar contexto. Quando o usuario analisa uma vaga, essa vaga deve alimentar automaticamente curriculo, carta, entrevista, candidatura e alertas futuros.",
            "O produto fica mais forte quando cada acao gera a proxima acao sem friccao. Exemplo: analisou a vaga -> recebeu score -> gerou CV otimizado -> marcou candidatura -> treinou entrevista -> recebeu follow-up."
        ],
        "bullets": [
            "Entrada principal: descricao/link da vaga + curriculo.",
            "Processamento: analise de aderencia, extracao de requisitos, keywords, score e briefing.",
            "Saidas: diagnostico, CV otimizado, carta, perguntas de entrevista e card de candidatura.",
            "Retencao: alertas, rastreador, proximas acoes, historico e e-mails.",
            "Monetizacao: limites por plano, recursos premium e upgrade contextual."
        ]
    },
    {
        "kicker": "Beneficios por perfil",
        "title": "O mesmo produto resolve dores diferentes para publicos diferentes.",
        "body": [
            "A comunicacao deve mudar conforme o momento do usuario. Quem esta desempregado quer velocidade e clareza. Quem esta empregado e quer trocar de cargo quer estrategia e discricao. Quem esta mudando de area quer saber onde esta o gap real."
        ],
        "cards": [
            ("Profissional buscando recolocacao", "Reduz tentativa e erro, prioriza vagas melhores e organiza candidatura.", "Mensagem: pare de enviar no escuro."),
            ("Profissional empregado querendo trocar", "Ajuda a escolher oportunidades com mais criterio e preparar materiais fortes.", "Mensagem: troque com estrategia, nao por impulso."),
            ("Junior ou inicio de carreira", "Mostra lacunas, estrutura melhor o CV e prepara para entrevistas.", "Mensagem: transforme pouca experiencia em clareza e potencial."),
            ("Transicao de carreira", "Compara experiencia atual com requisitos da nova area.", "Mensagem: entenda o que reaproveitar e o que precisa reforcar."),
            ("Profissionais de marketing, negocios e tech", "Beneficiam-se de keywords, metricas, portfolio verbal e adaptacao por vaga.", "Mensagem: mostre resultado, contexto e aderencia.")
        ]
    },
    {
        "kicker": "Gaps atuais",
        "title": "O produto esta rico, mas precisa reduzir friccao, inconsistencias e pontos cegos.",
        "body": [
            "Os gaps abaixo nao diminuem o potencial do VagaAI. Eles mostram onde o produto precisa amadurecer para vender com mais seguranca e reter melhor."
        ],
        "table": [
            ("Conexao entre fluxos", "Alguns caminhos ainda podem pedir dados que o sistema ja conhece.", "Preservar contexto por analysis_id/job_id entre app, CV, carta, entrevista e candidaturas."),
            ("Alertas", "Dependem de fontes externas, filtros e cron. Podem parecer inconsistentes se nao houver historico claro.", "Criar diagnostico de fontes, historico persistente e explicacao quando nao houver vaga."),
            ("Planos e creditos", "UI pode mostrar ilimitado enquanto backend bloqueia se houver divergencia.", "Ter uma fonte unica de verdade e teste automatizado de entitlements."),
            ("Exportacao de CV", "PDF/A4, margens, quebras e modelos precisam ser impecaveis.", "Padronizar motor de PDF server-side ou workflow controlado com preflight."),
            ("Mobile", "Produto e denso; precisa bottom nav, menus e cards compactos.", "Tratar mobile como jornada prioritaria, nao so adaptacao visual."),
            ("Observabilidade", "Bugs de cron, API, Stripe e Supabase precisam ser detectados antes do usuario.", "Adicionar logs estruturados, alertas internos e painel de saude."),
            ("Onboarding", "Usuario pode nao entender o fluxo completo logo no primeiro uso.", "Criar trilha guiada: analise -> CV -> candidatura -> entrevista."),
            ("Prova e confianca", "Mercado sensivel a promessas exageradas.", "Mostrar limites honestos, exemplos reais, privacidade e antes/depois.")
        ]
    },
    {
        "kicker": "Roadmap realista",
        "title": "Caminho de evolucao dentro da realidade atual",
        "body": [
            "A evolucao recomendada prioriza confiabilidade e ativacao antes de escalar aquisicao. O produto ja tem muitas alavancas; o proximo passo e fazer cada uma funcionar de forma previsivel."
        ],
        "timeline": [
            ("0-30 dias", "Estabilizar planos/creditos, alertas, PDF, mobile, links quebrados, tracking e metricas basicas de funil."),
            ("31-60 dias", "Criar jornada guiada e e-mails de ativacao: primeira analise, baixar CV, rastrear candidatura, simular entrevista."),
            ("61-90 dias", "Transformar alertas e rastreador em motor de retencao: resumo semanal, proximas acoes, follow-up e reativacao."),
            ("3-6 meses", "Melhorar motor de vagas, fontes, qualidade dos alertas, PWA/mobile e painel de saude operacional."),
            ("6-12 meses", "Explorar B2B leve: universidades, mentorias, outplacement, escolas e comunidades profissionais.")
        ]
    },
    {
        "kicker": "Projetos fora da caixa",
        "title": "Ideias que podem mudar o jogo se forem bem executadas",
        "body": [
            "Essas apostas nao devem ser todas feitas agora. Elas funcionam como direcao de longo prazo para transformar o VagaAI de ferramenta em ecossistema."
        ],
        "cards": [
            ("Extensao de navegador", "Botao em LinkedIn, Gupy, Indeed e sites de vaga: 'Analisar com VagaAI' direto na pagina.", "Alto potencial de aquisicao e uso recorrente."),
            ("Candidatura Pack", "Um clique gera: score, CV otimizado, carta, perguntas de entrevista e card no rastreador.", "Transforma o produto em fluxo magico, mas sem prometer emprego."),
            ("Relatorio semanal de carreira", "Resumo por e-mail/WhatsApp: vagas boas, candidaturas paradas, entrevistas proximas, score medio.", "Retencao forte e alto valor percebido."),
            ("Mapa de aderencia de mercado", "Mostra quais cargos combinam mais com o perfil atual e quais skills destravam novas vagas.", "Ajuda usuario a decidir carreira, nao so candidatura."),
            ("Treino de entrevista por voz", "Simulacao falada, feedback de clareza, estrutura, exemplos e postura.", "Diferenciacao premium para plano Pro."),
            ("Copiloto no WhatsApp", "Alertas, lembretes e proximas acoes por conversa.", "Canal natural no Brasil, mas exige cuidado operacional."),
            ("Benchmark anonimo", "Comparar score e gaps com perfis similares, sem expor dados pessoais.", "Aumenta urgencia e clareza, com privacidade."),
            ("Outplacement/educacao", "Versao para escolas, cursos, mentorias e empresas que recolocam profissionais.", "Novo canal B2B com ticket maior.")
        ]
    },
    {
        "kicker": "Metricas essenciais",
        "title": "O que medir para saber se o produto esta funcionando",
        "body": [
            "Sem metricas, o VagaAI pode parecer cheio de recursos sem provar quais geram valor. O foco deve ser ativacao, retencao e conversao por momento da jornada."
        ],
        "table": [
            ("Ativacao", "Primeira analise concluida", "Mostra se o usuario chegou ao primeiro valor."),
            ("Aha moment", "CV otimizado baixado ou candidatura rastreada", "Indica que o usuario transformou diagnostico em acao."),
            ("Retencao", "Retorno por alerta, dashboard ou candidatura", "Mostra se o produto virou rotina."),
            ("Conversao", "Free -> Starter/Pro; limite atingido -> upgrade", "Mostra monetizacao contextual."),
            ("Qualidade", "Taxa de alerta analisado, vaga salva, CV baixado, entrevista iniciada", "Mostra se os modulos estao conectados."),
            ("Confiabilidade", "Falhas de API, webhook, cron, PDF, Supabase e Stripe", "Mostra se o produto esta pronto para escala.")
        ]
    },
    {
        "kicker": "Planos e proposta comercial",
        "title": "Cada plano precisa comunicar um nivel de maturidade na busca por emprego.",
        "body": [
            "A diferenca entre planos deve ser apresentada como progressao natural, nao como bloqueio agressivo."
        ],
        "cards": [
            ("Free", "Testar valor rapidamente: uma analise, alertas basicos e entrada no rastreador.", "Mensagem: entenda se o VagaAI faz sentido para voce."),
            ("Starter", "Uso recorrente moderado: mais analises, CV otimizado, cartas e alertas melhores.", "Mensagem: comece a aplicar com mais criterio."),
            ("Pro", "Sistema completo de candidatura: analises amplas, simulador, alertas diarios e recursos avancados.", "Mensagem: organize sua busca como um processo profissional."),
            ("Creditos avulsos", "Compra pontual para quem nao quer assinar.", "Mensagem: use quando precisar, sem compromisso.")
        ]
    },
    {
        "kicker": "Recomendacoes finais",
        "title": "O proximo salto nao e adicionar mais uma funcionalidade. E conectar melhor as que ja existem.",
        "body": [
            "O VagaAI tem um caminho forte: virar o sistema onde o profissional entende, prepara, envia e acompanha cada oportunidade.",
            "A evolucao mais inteligente agora e transformar o produto em uma jornada inevitavel: cada tela precisa responder 'qual e a proxima melhor acao para este usuario?'."
        ],
        "bullets": [
            "Reforcar o posicionamento: sistema de candidatura, nao ferramenta isolada.",
            "Fazer toda vaga analisada nascer automaticamente em Candidaturas.",
            "Transformar Alertas + Rastreador no motor de retencao.",
            "Conectar entrevista e carta diretamente a cada candidatura.",
            "Aprimorar PDF, mobile e confiabilidade antes de aumentar muito a aquisicao.",
            "Criar comunicacao honesta: nao garante emprego; aumenta clareza, preparo e qualidade da candidatura.",
            "Medir cada etapa da jornada para saber onde o usuario trava."
        ]
    }
]


sources = [
    ("IBGE - Desemprego", "https://www.ibge.gov.br/explica/desemprego.php"),
    ("LinkedIn - Future of Recruiting", "https://business.linkedin.com/hire/resources/future-of-recruiting"),
    ("Gupy - Empregabilidade 2026", "https://conteudos.gupy.io/materiais/relatorio/empregabilidade-2026"),
    ("Indeed Hiring Lab", "https://www.hiringlab.org/"),
]


def render_cards(cards):
    return "\n".join(
        f"""<article class="card">
          <h4>{html.escape(a)}</h4>
          <p>{html.escape(b)}</p>
          <small>{html.escape(c)}</small>
        </article>"""
        for a, b, c in cards
    )


def render_table(rows):
    body = "\n".join(
        f"<tr><td>{html.escape(a)}</td><td>{html.escape(b)}</td><td>{html.escape(c)}</td></tr>"
        for a, b, c in rows
    )
    return f"<table><tbody>{body}</tbody></table>"


def render_timeline(rows):
    return "\n".join(
        f"""<div class="step"><span>{html.escape(a)}</span><p>{html.escape(b)}</p></div>"""
        for a, b in rows
    )


def render_section(s):
    content = [f"""<section class="section">
      <div class="kicker">{html.escape(s['kicker'])}</div>
      <h2>{html.escape(s['title'])}</h2>"""]
    for p in s.get("body", []):
        content.append(f"<p>{html.escape(p)}</p>")
    if s.get("bullets"):
        content.append("<ul>" + "".join(f"<li>{html.escape(x)}</li>" for x in s["bullets"]) + "</ul>")
    if s.get("cards"):
        content.append('<div class="grid">' + render_cards(s["cards"]) + "</div>")
    if s.get("table"):
        content.append(render_table(s["table"]))
    if s.get("timeline"):
        content.append('<div class="timeline">' + render_timeline(s["timeline"]) + "</div>")
    content.append("</section>")
    return "\n".join(content)


html_doc = f"""<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>{html.escape(title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Lora:wght@600;700&family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {{
      --forest:#071f12; --deep:#0a2b19; --green:#1a8f5c; --bright:#4ece91;
      --mint:#eef8f2; --paper:#f7faf7; --card:#ffffff; --line:#dfe9e2;
      --text:#07130b; --muted:#587461; --soft:#789281; --amber:#c47d0a; --red:#d94f4f;
      --shadow:0 18px 50px rgba(7,31,18,.10);
    }}
    *{{box-sizing:border-box}}
    body{{margin:0;background:linear-gradient(180deg,#f7faf7 0%,#edf5f0 100%);color:var(--text);font-family:Manrope,Arial,sans-serif;line-height:1.62}}
    .page{{max-width:1120px;margin:0 auto;padding:46px 34px 70px}}
    .cover{{position:relative;background:linear-gradient(140deg,var(--forest),#0b4b2a);border-radius:28px;color:white;padding:58px 62px;overflow:hidden;box-shadow:var(--shadow);margin-bottom:26px}}
    .cover:after{{content:"";position:absolute;width:360px;height:360px;right:-90px;top:-120px;border-radius:50%;background:radial-gradient(circle,rgba(78,206,145,.42),rgba(78,206,145,0) 65%)}}
    .brand{{display:flex;align-items:center;gap:12px;margin-bottom:54px;font-weight:800;letter-spacing:.02em}}
    .logo{{width:34px;height:34px;border-radius:50%;background:#0d1510;border:1px solid rgba(255,255,255,.18);display:grid;place-items:center;color:var(--bright);font-family:Lora,serif;font-weight:700}}
    .eyebrow,.kicker{{font-size:11px;text-transform:uppercase;letter-spacing:.13em;color:var(--bright);font-weight:800;margin-bottom:10px}}
    h1,h2,h3{{font-family:Lora,Georgia,serif;line-height:1.05;letter-spacing:-.035em;margin:0}}
    h1{{font-size:58px;max-width:760px}}
    .cover p{{max-width:760px;color:rgba(255,255,255,.76);font-size:18px;margin:18px 0 0}}
    .meta{{display:flex;gap:12px;flex-wrap:wrap;margin-top:34px}}
    .pill{{border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08);border-radius:999px;padding:8px 13px;color:#dff8e9;font-size:12px;font-weight:700}}
    .toc{{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:22px 0 26px}}
    .toc div{{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px;box-shadow:0 8px 25px rgba(7,31,18,.06);font-size:12px;color:var(--muted);font-weight:700}}
    .section{{background:var(--card);border:1px solid var(--line);border-radius:24px;padding:34px 38px;margin:18px 0;box-shadow:0 10px 35px rgba(7,31,18,.06);break-inside:avoid}}
    .section h2{{font-size:34px;margin-bottom:16px;max-width:900px}}
    .section p{{color:var(--muted);font-size:14.5px;margin:10px 0}}
    ul{{margin:16px 0 0;padding:0;display:grid;gap:9px}}
    li{{list-style:none;position:relative;padding-left:22px;color:#244b34;font-size:13.5px}}
    li:before{{content:"";position:absolute;left:0;top:.72em;width:8px;height:8px;border-radius:50%;background:var(--bright)}}
    .grid{{display:grid;grid-template-columns:repeat(2,1fr);gap:14px;margin-top:22px}}
    .card{{background:linear-gradient(180deg,#fbfdfb,#f1f7f3);border:1px solid var(--line);border-radius:18px;padding:20px;min-height:150px}}
    .card h4{{margin:0 0 9px;font-size:16px;color:#072012}}
    .card p{{font-size:13px;margin:0 0 12px;color:#4c6a58}}
    .card small{{display:block;border-left:3px solid var(--green);padding-left:10px;color:#0d6d43;font-weight:700;font-size:12px;line-height:1.45}}
    table{{width:100%;border-collapse:collapse;margin-top:20px;overflow:hidden;border-radius:14px;font-size:12.5px}}
    td{{border:1px solid var(--line);padding:13px;vertical-align:top;color:#345a42}}
    td:first-child{{font-weight:800;color:#082314;width:22%}}
    td:nth-child(3){{color:#0d6d43;font-weight:650}}
    .timeline{{display:grid;gap:12px;margin-top:22px}}
    .step{{display:grid;grid-template-columns:120px 1fr;gap:20px;align-items:start;background:#f4faf6;border:1px solid var(--line);border-radius:16px;padding:16px}}
    .step span{{font-weight:900;color:var(--green);font-size:13px;text-transform:uppercase;letter-spacing:.06em}}
    .step p{{margin:0;color:#355d44;font-size:13.5px}}
    .matrix{{display:grid;grid-template-columns:1.1fr .9fr;gap:18px}}
    .callout{{background:#fff8ed;border:1px solid rgba(196,125,10,.25);border-radius:20px;padding:22px;color:#593604;margin-top:18px}}
    .callout strong{{display:block;font-size:15px;margin-bottom:6px}}
    .sources{{font-size:12px;color:var(--muted);margin-top:22px}}
    .sources a{{color:var(--green);text-decoration:none;font-weight:700}}
    .footer{{text-align:center;color:var(--soft);font-size:12px;margin-top:30px}}
    @media print {{
      body{{background:white}}
      .page{{padding:0;max-width:none}}
      .cover,.section{{box-shadow:none}}
      .section{{break-inside:avoid-page}}
      a{{color:inherit}}
    }}
    @media(max-width:800px){{
      .page{{padding:20px 14px}}
      .cover{{padding:34px 26px;border-radius:22px}}
      h1{{font-size:38px}}
      .section{{padding:26px 22px}}
      .section h2{{font-size:27px}}
      .toc,.grid{{grid-template-columns:1fr}}
      .step{{grid-template-columns:1fr;gap:6px}}
    }}
  </style>
</head>
<body>
<main class="page">
  <header class="cover">
    <div class="brand"><span class="logo">V</span><span>VagaAI</span></div>
    <div class="eyebrow">Guia estrategico de produto</div>
    <h1>{html.escape(title)}</h1>
    <p>{html.escape(subtitle)}.</p>
    <div class="meta">
      <span class="pill">Sistema de candidatura</span>
      <span class="pill">Brasil primeiro</span>
      <span class="pill">IA com promessa realista</span>
      <span class="pill">Roadmap pratico + apostas futuras</span>
    </div>
  </header>
  <nav class="toc">
    <div>01. Funcionalidades atuais</div>
    <div>02. Logica e beneficios</div>
    <div>03. Gaps e melhorias</div>
    <div>04. Futuro do produto</div>
  </nav>
  {''.join(render_section(s) for s in sections)}
  <section class="section">
    <div class="kicker">Fontes e referencias</div>
    <h2>Base de contexto usada para orientar mercado e posicionamento</h2>
    <p>As referencias abaixo servem como contexto de mercado. O documento traduz esse contexto para a realidade atual do VagaAI e para decisoes praticas de produto.</p>
    <div class="sources">
      {''.join(f'<p><a href="{url}">{html.escape(name)}</a> — {html.escape(url)}</p>' for name, url in sources)}
    </div>
    <div class="callout"><strong>Principio de comunicacao</strong>O VagaAI nao deve prometer emprego, aprovacao ou contratacao. A marca deve prometer clareza, preparo, materiais mais fortes e melhor organizacao da jornada.</div>
  </section>
  <div class="footer">VagaAI · Documento interno de produto · Gerado para planejamento estrategico</div>
</main>
</body>
</html>"""


md_lines = [
    f"# {title}",
    "",
    subtitle,
    "",
    "## Sumario executivo",
    "O VagaAI deve ser entendido como um sistema de candidatura: uma plataforma que conecta vaga, curriculo, candidatura, alerta, carta e entrevista em uma jornada unica.",
    "",
]

for s in sections:
    md_lines.append(f"## {s['kicker']} — {s['title']}")
    md_lines.extend(s.get("body", []))
    if s.get("bullets"):
        md_lines.extend([f"- {b}" for b in s["bullets"]])
    if s.get("cards"):
        for a, b, c in s["cards"]:
            md_lines.append(f"### {a}")
            md_lines.append(b)
            md_lines.append(f"**Valor:** {c}")
    if s.get("table"):
        md_lines.append("| Area | Gap / indicador | Solucao recomendada |")
        md_lines.append("|---|---|---|")
        md_lines.extend([f"| {a} | {b} | {c} |" for a, b, c in s["table"]])
    if s.get("timeline"):
        for a, b in s["timeline"]:
            md_lines.append(f"- **{a}:** {b}")
    md_lines.append("")

md_lines.append("## Fontes")
for name, url in sources:
    md_lines.append(f"- [{name}]({url})")


(OUT / "Mapa Completo do Produto VagaAI.html").write_text(html_doc, encoding="utf-8")
(OUT / "Mapa Completo do Produto VagaAI.md").write_text("\n".join(md_lines), encoding="utf-8")
print(OUT)
