from __future__ import annotations

import html
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "jornada-personas-editorial-vagaai"
HTML_PATH = OUT_DIR / "Jornada, Personas e Linha Editorial VagaAI.html"


BRAND = {
    "forest": "#0A1A10",
    "deep": "#0D5A35",
    "emerald": "#1A7A4A",
    "bright": "#4ECE91",
    "mint": "#E8F5EE",
    "paper": "#F5F7F5",
    "card": "#FFFFFF",
    "ink": "#071209",
    "text": "#254B34",
    "muted": "#6E8A78",
    "amber": "#C47D0A",
    "amber_bg": "#FFF7E8",
    "red": "#D94F4F",
    "red_bg": "#FDECEC",
    "border": "#DDE8E2",
}


SOURCES = [
    ("IBGE - Indicadores de desemprego", "https://www.ibge.gov.br/explica/desemprego.php"),
    ("LinkedIn - Future of Recruiting 2025", "https://business.linkedin.com/hire/resources/future-of-recruiting"),
    ("World Economic Forum - Future of Jobs Report 2025", "https://www.weforum.org/publications/the-future-of-jobs-report-2025/"),
    ("Harvard Business School - Hidden Workers / ATS", "https://www.library.hbs.edu/working-knowledge/how-to-tap-the-talent-automated-hr-platforms-miss"),
    ("Gupy - Relatórios de empregabilidade e recrutamento", "https://conteudos.gupy.io/materiais/relatorio/empregabilidade-2026"),
    ("Indeed Hiring Lab", "https://www.hiringlab.org/"),
]


def esc(value: str) -> str:
    return html.escape(value, quote=True)


def table(headers: list[str], rows: list[list[str]], cls: str = "") -> str:
    head = "".join(f"<th>{esc(h)}</th>" for h in headers)
    body = "\n".join("<tr>" + "".join(f"<td>{cell}</td>" for cell in row) + "</tr>" for row in rows)
    return f'<table class="{cls}"><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table>'


def badge(text: str, kind: str = "") -> str:
    return f'<span class="badge {kind}">{esc(text)}</span>'


def build_html() -> str:
    today = datetime.now().strftime("%d/%m/%Y")

    nav = [
        ("01", "Resumo executivo"),
        ("02", "Diagnóstico de mercado"),
        ("03", "Personas"),
        ("04", "Jobs-to-be-done"),
        ("05", "Jornada do cliente"),
        ("06", "Mensagens por fase"),
        ("07", "Jornada por plano"),
        ("08", "Linha editorial"),
        ("09", "Pilares de conteúdo"),
        ("10", "Calendário editorial"),
        ("11", "Funil e conversão"),
        ("12", "Biblioteca de mensagens"),
        ("13", "Métricas e testes"),
        ("14", "Riscos de comunicação"),
        ("15", "Checklist operacional"),
    ]
    nav_html = "\n".join(f'<a href="#s{n}"><span>{n}</span>{esc(t)}</a>' for n, t in nav)

    market_rows = [
        [
            "<b>Busca por emprego continua competitiva</b>",
            "O Brasil segue com grande volume de profissionais buscando recolocação ou troca de emprego. Mesmo quando a taxa de desemprego melhora, a disputa por boas vagas continua alta.",
            "Posicionar o VagaAI como ferramenta de direção: menos envio no escuro, mais escolha e preparo.",
        ],
        [
            "<b>Recrutamento está mais digital e filtrado</b>",
            "Empresas usam ATS, plataformas de triagem, automações e IA para organizar alto volume de candidatos.",
            "Explicar que o candidato precisa adaptar currículo, palavras-chave e narrativa para cada vaga, sem inventar experiência.",
        ],
        [
            "<b>O candidato sofre com baixa visibilidade</b>",
            "Muitos profissionais não sabem por que não recebem retorno: vaga desalinhada, currículo genérico, lacunas de requisitos ou falta de preparo.",
            "Transformar o produto em diagnóstico: score, lacunas, próxima ação e materiais prontos.",
        ],
        [
            "<b>IA muda a dinâmica de carreira</b>",
            "Relatórios globais apontam transformação acelerada de funções, habilidades e processos de contratação.",
            "Comunicar o VagaAI como copiloto de carreira aplicado à candidatura, não como promessa mágica de emprego.",
        ],
    ]

    personas_rows = [
        [
            "<b>Ana, 27</b><br>Analista em transição",
            "Quer trocar de emprego, mas sente que o currículo não mostra bem seu potencial.",
            "Envia currículos sem retorno, não sabe quais vagas valem tempo, usa o mesmo CV para tudo.",
            "Clareza de aderência, CV otimizado e carta para vaga.",
            "“Quero parar de aplicar no escuro e mandar algo mais forte.”",
        ],
        [
            "<b>Bruno, 34</b><br>Profissional pleno/sênior",
            "Tem experiência real, mas precisa reposicionar narrativa para vagas melhores.",
            "Não sabe destacar métricas, lideranças e resultados conforme a vaga.",
            "Diagnóstico de lacunas, CV com métricas, treino de entrevista.",
            "“Eu sei fazer, mas preciso mostrar isso do jeito certo.”",
        ],
        [
            "<b>Carla, 22</b><br>Primeira vaga ou estágio",
            "Precisa entender como competir com pouca experiência formal.",
            "Não sabe traduzir projetos, cursos e habilidades em currículo.",
            "Score, sugestões, currículo inicial, orientação de candidatura.",
            "“Não sei se meu perfil serve para essa vaga.”",
        ],
        [
            "<b>Diego, 40</b><br>Recolocação urgente",
            "Precisa organizar busca, rotina e candidaturas sem desperdiçar energia.",
            "Ansiedade, volume alto de vagas, baixa resposta e falta de rastreamento.",
            "Alertas, rastreador, próximas ações e rotina semanal.",
            "“Preciso de um sistema para buscar emprego com método.”",
        ],
    ]

    jtbd_rows = [
        ["Escolher melhor", "Quando vejo muitas vagas abertas, quero saber quais combinam comigo, para não perder tempo com oportunidades desalinhadas."],
        ["Entender chances", "Quando encontro uma vaga interessante, quero saber minha aderência e lacunas, para decidir se vale aplicar agora ou ajustar antes."],
        ["Adaptar material", "Quando vou me candidatar, quero um currículo e uma carta direcionados, para mostrar a experiência certa para a vaga certa."],
        ["Acompanhar", "Quando envio candidaturas, quero rastrear status e próximas ações, para não perder prazos nem follow-ups."],
        ["Preparar entrevista", "Quando avanço no processo, quero treinar com perguntas baseadas na vaga e no meu CV, para chegar com clareza e confiança."],
    ]

    journey_rows = [
        [
            "1. Descoberta",
            "Usuário sente frustração: envia CV, não recebe retorno ou não sabe por onde começar.",
            "LP, post, anúncio, indicação, conteúdo sobre ATS e candidatura.",
            "“Você não precisa enviar mais. Precisa enviar melhor.”",
            "Analisar vaga grátis",
        ],
        [
            "2. Primeira ativação",
            "Cola a vaga e o currículo. Espera entender se tem chance.",
            "App / análise de aderência.",
            "“Veja onde seu currículo combina com a vaga e onde precisa melhorar.”",
            "Gerar versão otimizada",
        ],
        [
            "3. Momento de valor",
            "Recebe score, lacunas, keywords, resumo e próxima ação.",
            "Resultado da análise.",
            "“Sua candidatura pode ficar mais forte se você ajustar estes pontos.”",
            "Otimizar CV / rastrear candidatura",
        ],
        [
            "4. Execução",
            "Baixa currículo, gera carta, abre vaga e registra candidatura.",
            "CV, carta, candidatura.",
            "“Seu material está pronto para esta oportunidade.”",
            "Baixar PDF / abrir vaga",
        ],
        [
            "5. Organização",
            "Acompanha candidaturas, status, follow-up e histórico.",
            "Dashboard e candidaturas.",
            "“Aqui está sua próxima melhor ação.”",
            "Gerenciar próximas ações",
        ],
        [
            "6. Recorrência",
            "Recebe alertas, compara novas vagas e mantém ritmo semanal.",
            "Alertas e metas.",
            "“Encontramos oportunidades compatíveis com seu perfil.”",
            "Analisar oportunidades",
        ],
        [
            "7. Preparação",
            "Ao entrar em entrevista, precisa saber o que destacar.",
            "Simulador de entrevista.",
            "“Treine com perguntas baseadas na vaga e no seu currículo.”",
            "Treinar entrevista",
        ],
    ]

    comm_rows = [
        ["Primeiro acesso", "Reduzir ansiedade e iniciar rápido", "Comece por uma vaga real. O VagaAI mostra se ela combina com você e o que ajustar antes de enviar."],
        ["Sem análise ainda", "Evitar tela vazia sem sentido", "Analise uma vaga que você realmente pretende enviar. Em poucos segundos você vê score, lacunas e próximos passos."],
        ["Score baixo", "Ser honesto sem desmotivar", "Sua aderência ainda está baixa, mas existem ajustes claros para fortalecer o currículo antes da candidatura."],
        ["Score médio", "Incentivar foco", "Você tem pontos fortes, mas algumas lacunas podem reduzir suas chances. Priorize os ajustes abaixo."],
        ["Score alto", "Acelerar ação", "Boa aderência. Revise os pontos finais, baixe o currículo e envie com mais segurança."],
        ["Upgrade", "Vender continuidade", "Seu plano atual mostra o caminho. O Pro libera a jornada completa: análise, currículo, rastreador, alertas e entrevista."],
    ]

    plan_rows = [
        [
            "Free",
            "Provar valor rápido",
            "Análise limitada, alertas/ofertas básicas e primeira experiência com score.",
            "“Teste com uma vaga real e veja onde seu currículo pode melhorar.”",
            "Converter quando o usuário quiser repetir ou acompanhar a jornada.",
        ],
        [
            "Starter",
            "Criar hábito",
            "Mais análises, alertas recorrentes e uso prático na busca semanal.",
            "“Use o VagaAI para escolher melhor onde aplicar durante a semana.”",
            "Converter quando precisar de currículo, entrevista, carta e rastreador completo.",
        ],
        [
            "Pro",
            "Sistema completo",
            "Jornada inteira: alertas, análise, CV, carta, rastreador, entrevista e rotina.",
            "“Centralize sua busca por emprego e avance com uma próxima ação clara.”",
            "Reter com metas, histórico, alertas e preparação para entrevista.",
        ],
    ]

    pillars_rows = [
        ["Educação ATS", "Explicar filtros, palavras-chave, aderência e como evitar erro comum.", "Carrossel, reels curto, checklist", "“Seu currículo não precisa ser perfeito. Precisa ser claro para esta vaga.”"],
        ["Vaga real, análise real", "Mostrar exemplos de vaga, score, lacunas e ajustes.", "Antes/depois, thread, vídeo tela", "“Veja por que essa vaga parece boa, mas exige 4 pontos que seu CV não mostra.”"],
        ["Rotina de busca", "Ensinar método semanal: escolher, analisar, adaptar, rastrear, preparar.", "Checklist, calendário, templates", "“Sua busca por emprego precisa de sistema, não só motivação.”"],
        ["Currículo por oportunidade", "Mostrar como adaptar sem inventar experiência.", "Mini aulas, comparativos, estudo de caso", "“O mesmo currículo para todas as vagas vira um currículo fraco para muitas.”"],
        ["Entrevista e narrativa", "Preparar resposta, postura e pontos de prova.", "Perguntas, exemplos STAR, simulações", "“A entrevista começa antes da ligação: começa no que você decidiu destacar.”"],
        ["Produto em ação", "Demonstrar benefícios reais do VagaAI.", "Mockups, vídeos, stories, casos", "“Cole vaga + CV. Receba score, lacunas e próximo passo.”"],
    ]

    calendar_rows = [
        ["Segunda", "Oportunidades da semana", "Post curto + story", "Vagas, alertas e prioridades da semana."],
        ["Terça", "Erro de currículo", "Carrossel", "Um erro específico que reduz aderência."],
        ["Quarta", "Vaga real, análise real", "Reel/screen recording", "Mostra score e lacunas de uma vaga simulada."],
        ["Quinta", "Entrevista", "Pergunta + resposta modelo", "Como responder com prova e clareza."],
        ["Sexta", "Checklist de aplicação", "Post salvável", "Antes de enviar: vaga, CV, carta, rastreador."],
        ["Domingo", "Planejamento", "Story + enquete", "Que tipo de vaga você quer receber esta semana?"],
    ]

    metrics_rows = [
        ["Aquisição", "CTR de anúncios, taxa de cadastro, custo por lead, visitas LP -> app", "Se headline e promessa estão atraindo o público certo."],
        ["Ativação", "% que faz primeira análise, tempo até primeiro score, conclusão do fluxo", "Se o usuário entende o primeiro valor."],
        ["Valor", "% que gera CV, carta, rastreia vaga ou treina entrevista", "Se o produto vira ação concreta."],
        ["Retenção", "Alertas lidos, análises/semana, candidaturas atualizadas, retornos ao dashboard", "Se vira rotina de busca."],
        ["Receita", "Free -> Starter, Starter -> Pro, recuperação de checkout, churn", "Se comunicação por plano está clara."],
    ]

    cta_rows = [
        ["Topo da LP", "Analisar vaga grátis", "Ver como funciona"],
        ["Resultado de análise", "Gerar versão otimizada do currículo", "Ver prioridades"],
        ["Currículo pronto", "Baixar PDF", "Gerar carta de apresentação"],
        ["Candidaturas", "Gerenciar próximas ações", "Treinar entrevista"],
        ["Alertas", "Receber vagas agora", "Editar preferências"],
        ["Upsell", "Liberar jornada completa", "Comparar planos"],
    ]

    source_cards = "".join(
        f'<a class="source" href="{esc(url)}"><b>{esc(name)}</b><span>{esc(url)}</span></a>'
        for name, url in SOURCES
    )

    return f"""<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Jornada, Personas e Linha Editorial VagaAI</title>
  <style>
    :root {{
      --forest:{BRAND["forest"]}; --deep:{BRAND["deep"]}; --emerald:{BRAND["emerald"]};
      --bright:{BRAND["bright"]}; --mint:{BRAND["mint"]}; --paper:{BRAND["paper"]};
      --card:{BRAND["card"]}; --ink:{BRAND["ink"]}; --text:{BRAND["text"]};
      --muted:{BRAND["muted"]}; --amber:{BRAND["amber"]}; --amber-bg:{BRAND["amber_bg"]};
      --red:{BRAND["red"]}; --red-bg:{BRAND["red_bg"]}; --border:{BRAND["border"]};
      --shadow:0 18px 50px rgba(7,18,9,.10); --r:22px; --r-sm:14px;
    }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; background:var(--paper); color:var(--ink); font-family:Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height:1.55; }}
    a {{ color:inherit; text-decoration:none; }}
    .layout {{ display:grid; grid-template-columns:286px 1fr; min-height:100vh; }}
    aside {{ position:sticky; top:0; height:100vh; padding:28px 22px; background:radial-gradient(circle at 20% 0%, rgba(78,206,145,.16), transparent 28%), var(--forest); color:#fff; overflow:auto; }}
    .brand {{ display:flex; gap:12px; align-items:center; margin-bottom:34px; }}
    .mark {{ width:34px; height:34px; border-radius:50%; background:#151515; display:grid; place-items:center; color:#fff; font-weight:900; font-family:Georgia, serif; box-shadow:0 0 0 1px rgba(255,255,255,.08); }}
    .brand b {{ font-family:Georgia, serif; font-size:22px; letter-spacing:-.02em; }}
    .brand b span {{ color:var(--bright); }}
    .nav-label {{ font-size:10px; color:rgba(255,255,255,.42); text-transform:uppercase; letter-spacing:.16em; font-weight:800; margin:18px 0 10px; }}
    nav {{ display:grid; gap:5px; }}
    nav a {{ display:flex; align-items:center; gap:10px; padding:9px 10px; border-radius:12px; color:rgba(255,255,255,.72); font-size:13px; }}
    nav a span {{ width:24px; height:24px; border-radius:8px; display:grid; place-items:center; background:rgba(255,255,255,.06); color:var(--bright); font-size:11px; font-weight:800; }}
    nav a:hover {{ background:rgba(255,255,255,.07); color:#fff; }}
    .side-note {{ margin-top:28px; border:1px solid rgba(255,255,255,.10); border-radius:18px; padding:16px; background:rgba(255,255,255,.045); }}
    .side-note b {{ color:var(--bright); font-size:12px; text-transform:uppercase; letter-spacing:.08em; }}
    .side-note p {{ margin:8px 0 0; color:rgba(255,255,255,.67); font-size:12.5px; }}
    main {{ padding:42px clamp(28px, 5vw, 72px) 72px; }}
    .cover {{ position:relative; overflow:hidden; min-height:520px; border-radius:32px; padding:56px; background:linear-gradient(135deg,#081510,#0E3D26 58%,#177247); color:#fff; box-shadow:var(--shadow); margin-bottom:34px; }}
    .cover:before {{ content:""; position:absolute; right:-130px; top:-130px; width:360px; height:360px; border-radius:50%; background:rgba(78,206,145,.16); }}
    .cover-grid {{ position:relative; z-index:1; display:grid; grid-template-columns:1.05fr .95fr; gap:44px; align-items:center; }}
    .kicker {{ color:var(--bright); font-size:12px; font-weight:900; text-transform:uppercase; letter-spacing:.16em; display:flex; align-items:center; gap:8px; }}
    .kicker:before {{ content:""; width:7px; height:7px; border-radius:2px; background:var(--bright); }}
    h1,h2,h3 {{ font-family:Georgia, "Times New Roman", serif; letter-spacing:-.035em; line-height:1.04; }}
    h1 {{ margin:18px 0 18px; font-size:54px; max-width:770px; }}
    h1 em, h2 em {{ color:var(--bright); font-style:italic; }}
    .cover p {{ color:rgba(255,255,255,.76); font-size:17px; max-width:650px; margin:0 0 24px; }}
    .meta-strip {{ display:flex; flex-wrap:wrap; gap:10px; margin-top:30px; }}
    .pill {{ display:inline-flex; align-items:center; gap:8px; border:1px solid rgba(255,255,255,.16); background:rgba(255,255,255,.07); color:#fff; border-radius:999px; padding:10px 13px; font-size:12px; font-weight:700; }}
    .mock {{ background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.13); border-radius:24px; padding:18px; backdrop-filter:blur(12px); box-shadow:0 24px 70px rgba(0,0,0,.2); }}
    .mock-head {{ display:flex; gap:7px; align-items:center; padding:8px 8px 14px; color:rgba(255,255,255,.56); font-size:12px; }}
    .dot {{ width:10px; height:10px; border-radius:50%; background:#ff6b5b; }} .dot:nth-child(2){{background:#ffbd4a}} .dot:nth-child(3){{background:#3ddc84}}
    .journey-card {{ background:#fff; color:var(--ink); border-radius:18px; padding:18px; display:grid; gap:10px; }}
    .journey-line {{ display:flex; align-items:center; gap:12px; padding:12px; border-radius:14px; background:#f3f8f5; }}
    .journey-line strong {{ flex:1; font-size:13px; }}
    .score {{ width:46px; height:46px; border-radius:50%; display:grid; place-items:center; background:conic-gradient(var(--bright) 78%, #dfeae4 0); font-weight:900; color:#08311d; }}
    section {{ margin:28px 0; scroll-margin-top:24px; }}
    .section-card {{ background:var(--card); border:1px solid var(--border); border-radius:var(--r); box-shadow:var(--shadow); overflow:hidden; }}
    .section-head {{ padding:30px 34px 22px; border-bottom:1px solid var(--border); background:linear-gradient(180deg,#fff,#fbfdfb); }}
    .num {{ color:var(--emerald); font-weight:900; font-size:12px; letter-spacing:.12em; text-transform:uppercase; }}
    h2 {{ font-size:34px; margin:8px 0 10px; }}
    .lead {{ color:var(--text); font-size:16px; max-width:880px; margin:0; }}
    .section-body {{ padding:28px 34px 34px; }}
    .grid {{ display:grid; gap:16px; }}
    .grid.two {{ grid-template-columns:repeat(2,minmax(0,1fr)); }}
    .grid.three {{ grid-template-columns:repeat(3,minmax(0,1fr)); }}
    .mini {{ background:var(--paper); border:1px solid var(--border); border-radius:18px; padding:18px; }}
    .mini b {{ display:block; color:var(--ink); margin-bottom:7px; }}
    .mini p {{ margin:0; color:var(--text); font-size:14px; }}
    .callout {{ padding:18px 20px; border-radius:18px; background:linear-gradient(135deg,var(--mint),#fff); border:1px solid rgba(26,122,74,.18); color:var(--text); margin-top:18px; }}
    .amber {{ background:var(--amber-bg); border-color:rgba(196,125,10,.26); }}
    table {{ width:100%; border-collapse:separate; border-spacing:0; overflow:hidden; border:1px solid var(--border); border-radius:18px; background:#fff; margin:16px 0 4px; font-size:13px; }}
    th {{ text-align:left; padding:13px 14px; background:#edf5f0; color:var(--emerald); font-size:11px; text-transform:uppercase; letter-spacing:.08em; }}
    td {{ padding:14px; border-top:1px solid var(--border); vertical-align:top; color:var(--text); }}
    td b {{ color:var(--ink); }}
    .persona td:nth-child(1) {{ width:18%; }}
    .persona td:nth-child(2), .persona td:nth-child(3) {{ width:22%; }}
    .badge {{ display:inline-flex; align-items:center; border-radius:999px; padding:5px 9px; background:var(--mint); color:var(--emerald); font-size:11px; font-weight:800; margin:2px 4px 2px 0; }}
    .badge.warn {{ background:var(--amber-bg); color:var(--amber); }}
    .badge.red {{ background:var(--red-bg); color:var(--red); }}
    .flow {{ display:grid; grid-template-columns:repeat(7,1fr); gap:10px; margin-top:18px; }}
    .flow-step {{ position:relative; border:1px solid var(--border); border-radius:16px; background:#fff; padding:14px 12px; min-height:130px; }}
    .flow-step:after {{ content:""; position:absolute; top:28px; right:-10px; width:10px; height:2px; background:var(--bright); }}
    .flow-step:last-child:after {{ display:none; }}
    .flow-step .circle {{ width:28px; height:28px; border-radius:50%; background:var(--emerald); color:#fff; display:grid; place-items:center; font-weight:900; font-size:12px; margin-bottom:9px; }}
    .flow-step b {{ font-size:12px; color:var(--ink); display:block; margin-bottom:6px; }}
    .flow-step p {{ margin:0; color:var(--muted); font-size:11.5px; line-height:1.35; }}
    .quote {{ font-family:Georgia, serif; font-size:24px; line-height:1.18; color:var(--ink); background:#fff; border-left:4px solid var(--bright); padding:18px 22px; border-radius:0 18px 18px 0; box-shadow:var(--shadow); }}
    .source-grid {{ display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }}
    .source {{ display:block; padding:14px 16px; border:1px solid var(--border); border-radius:14px; background:#fff; }}
    .source b {{ display:block; color:var(--ink); font-size:13px; }}
    .source span {{ color:var(--muted); font-size:11px; overflow-wrap:anywhere; }}
    .footer {{ margin:34px 0 0; text-align:center; color:var(--muted); font-size:12px; }}
    @media print {{
      @page {{ size:A4; margin:12mm; }}
      body {{ background:#fff; }}
      .layout {{ display:block; }}
      aside {{ display:none; }}
      main {{ padding:0; }}
      .cover, .section-card {{ box-shadow:none; break-inside:avoid; }}
      section {{ break-inside:auto; page-break-inside:auto; }}
      .section-card {{ page-break-inside:auto; }}
      table {{ page-break-inside:auto; }}
      tr {{ page-break-inside:avoid; }}
      .flow {{ grid-template-columns:repeat(2,1fr); }}
      .flow-step:after {{ display:none; }}
    }}
    @media (max-width: 980px) {{
      .layout {{ grid-template-columns:1fr; }}
      aside {{ position:relative; height:auto; }}
      .cover-grid, .grid.two, .grid.three, .source-grid {{ grid-template-columns:1fr; }}
      .flow {{ grid-template-columns:1fr; }}
      .flow-step:after {{ display:none; }}
      .cover {{ padding:34px 24px; }}
      h1 {{ font-size:38px; }}
    }}
  </style>
</head>
<body>
  <div class="layout">
    <aside>
      <div class="brand"><div class="mark">V</div><b>Vaga<span>AI</span></b></div>
      <div class="nav-label">Documento estratégico</div>
      <nav>{nav_html}</nav>
      <div class="side-note">
        <b>Uso recomendado</b>
        <p>Use este material para alinhar produto, marketing, conteúdo, e-mails, anúncios, onboarding e comunicação comercial.</p>
      </div>
    </aside>
    <main>
      <div class="cover">
        <div class="cover-grid">
          <div>
            <div class="kicker">VagaAI Strategy System</div>
            <h1>Jornada dos clientes, personas e <em>linha editorial</em>.</h1>
            <p>Um documento exclusivo para transformar o VagaAI em uma marca mais clara, educativa e orientada à conversão, conectando o que o usuário sente, o que o produto entrega e como a comunicação deve aparecer em cada etapa.</p>
            <div class="meta-strip">
              <span class="pill">Pesquisa de mercado</span>
              <span class="pill">Personas acionáveis</span>
              <span class="pill">Jornada por plano</span>
              <span class="pill">Calendário editorial</span>
              <span class="pill">Atualizado em {today}</span>
            </div>
          </div>
          <div class="mock">
            <div class="mock-head"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span style="margin-left:auto">VagaAI — Jornada</span></div>
            <div class="journey-card">
              <div class="journey-line"><div class="score">82</div><strong>Análise de aderência</strong>{badge("Lacunas claras")}</div>
              <div class="journey-line"><div class="score">CV</div><strong>Currículo otimizado</strong>{badge("Pronto para vaga")}</div>
              <div class="journey-line"><div class="score">→</div><strong>Candidatura rastreada</strong>{badge("Próxima ação")}</div>
              <div class="journey-line"><div class="score">8x</div><strong>Entrevista simulada</strong>{badge("Perguntas reais")}</div>
            </div>
          </div>
        </div>
      </div>

      <section id="s01" class="section-card">
        <div class="section-head"><div class="num">01 / Resumo executivo</div><h2>A estratégia central</h2><p class="lead">O VagaAI deve ser comunicado como um sistema de candidatura inteligente: ele ajuda o usuário a escolher melhor, entender aderência, adaptar materiais, acompanhar oportunidades e se preparar para entrevista.</p></div>
        <div class="section-body">
          <div class="grid three">
            <div class="mini"><b>Promessa realista</b><p>Não prometer emprego. Prometer clareza, preparo e candidaturas mais fortes.</p></div>
            <div class="mini"><b>Principal mudança de percepção</b><p>De “ferramenta de currículo” para “central da busca por emprego”.</p></div>
            <div class="mini"><b>Tom comercial</b><p>Menos ansiedade, mais direção. Menos volume, mais estratégia.</p></div>
          </div>
          <div class="quote">“O VagaAI transforma a busca por emprego em uma jornada organizada: da escolha da vaga ao preparo para entrevista.”</div>
        </div>
      </section>

      <section id="s02" class="section-card">
        <div class="section-head"><div class="num">02 / Diagnóstico de mercado</div><h2>Por que o VagaAI é necessário agora</h2><p class="lead">O mercado combina competição por boas vagas, recrutamento digital, filtros automáticos e profissionais com baixa visibilidade sobre seus próprios pontos fortes e lacunas.</p></div>
        <div class="section-body">
          {table(["Sinal de mercado", "Leitura estratégica", "Implicação para o VagaAI"], market_rows)}
          <div class="callout amber"><b>Direção de comunicação:</b> o produto deve falar menos como “IA que melhora currículo” e mais como “sistema que reduz incerteza na candidatura”. O candidato não compra só um PDF; compra direção.</div>
        </div>
      </section>

      <section id="s03" class="section-card">
        <div class="section-head"><div class="num">03 / Personas</div><h2>Quem o VagaAI precisa convencer</h2><p class="lead">As personas abaixo organizam a comunicação por dor, nível de maturidade e momento de carreira. Elas não são públicos isolados; são modos de uso do produto.</p></div>
        <div class="section-body">
          {table(["Persona", "Contexto", "Dores", "O que compra", "Frase mental"], personas_rows, "persona")}
        </div>
      </section>

      <section id="s04" class="section-card">
        <div class="section-head"><div class="num">04 / Jobs-to-be-done</div><h2>O que o usuário contrata o VagaAI para fazer</h2><p class="lead">O produto vence quando resolve tarefas reais da busca por emprego, não quando apenas lista funcionalidades.</p></div>
        <div class="section-body">
          {table(["Job", "Formulação prática"], jtbd_rows)}
        </div>
      </section>

      <section id="s05" class="section-card">
        <div class="section-head"><div class="num">05 / Jornada do cliente</div><h2>Do primeiro clique à candidatura mais forte</h2><p class="lead">A jornada ideal reduz fricção e mantém contexto: a vaga analisada deve alimentar currículo, candidatura, carta e entrevista.</p></div>
        <div class="section-body">
          <div class="flow">
            <div class="flow-step"><div class="circle">1</div><b>Descobre</b><p>Dor: envia no escuro e não recebe retorno.</p></div>
            <div class="flow-step"><div class="circle">2</div><b>Analisa</b><p>Cola vaga + CV e entende score/lacunas.</p></div>
            <div class="flow-step"><div class="circle">3</div><b>Otimiza</b><p>Recebe CV direcionado para aquela vaga.</p></div>
            <div class="flow-step"><div class="circle">4</div><b>Aplica</b><p>Gera carta, abre vaga e envia material.</p></div>
            <div class="flow-step"><div class="circle">5</div><b>Rastreia</b><p>Acompanha status e próximas ações.</p></div>
            <div class="flow-step"><div class="circle">6</div><b>Recebe</b><p>Alertas trazem novas oportunidades.</p></div>
            <div class="flow-step"><div class="circle">7</div><b>Treina</b><p>Simula entrevista com base na vaga.</p></div>
          </div>
          {table(["Fase", "Estado do usuário", "Ponto de contato", "Mensagem guia", "CTA"], journey_rows)}
        </div>
      </section>

      <section id="s06" class="section-card">
        <div class="section-head"><div class="num">06 / Mensagens por fase</div><h2>O que dizer em cada momento</h2><p class="lead">A comunicação deve acompanhar emoção e intenção: ansiedade no começo, clareza no diagnóstico, ação no resultado e disciplina na recorrência.</p></div>
        <div class="section-body">
          {table(["Momento", "Objetivo", "Texto recomendado"], comm_rows)}
        </div>
      </section>

      <section id="s07" class="section-card">
        <div class="section-head"><div class="num">07 / Jornada por plano</div><h2>Free, Starter e Pro precisam contar uma história</h2><p class="lead">O plano não deve parecer apenas limite técnico. Ele deve representar o nível de maturidade da busca do usuário.</p></div>
        <div class="section-body">
          {table(["Plano", "Função na jornada", "Entrega percebida", "Mensagem", "Gatilho de avanço"], plan_rows)}
        </div>
      </section>

      <section id="s08" class="section-card">
        <div class="section-head"><div class="num">08 / Linha editorial</div><h2>A linha editorial do VagaAI</h2><p class="lead">A comunicação deve educar, demonstrar produto e gerar urgência saudável. O conteúdo precisa fazer o usuário pensar: “eu estou aplicando sem método”.</p></div>
        <div class="section-body">
          <div class="grid three">
            <div class="mini"><b>Missão editorial</b><p>Ensinar o profissional a buscar emprego com mais clareza, estratégia e preparo.</p></div>
            <div class="mini"><b>Ângulo principal</b><p>Não é mandar mais currículos. É escolher melhor, adaptar melhor e acompanhar melhor.</p></div>
            <div class="mini"><b>Regra de ouro</b><p>Todo conteúdo deve terminar com uma decisão prática: analisar, ajustar, rastrear ou treinar.</p></div>
          </div>
          <div class="callout"><b>Promessa editorial:</b> ajudar o público a entender por que candidaturas falham e como transformar cada vaga em um plano de ação.</div>
        </div>
      </section>

      <section id="s09" class="section-card">
        <div class="section-head"><div class="num">09 / Pilares de conteúdo</div><h2>O que publicar com consistência</h2><p class="lead">Os pilares equilibram educação, prova de produto, dor real e conversão. Eles servem para Instagram, blog, e-mail, anúncios e landing page.</p></div>
        <div class="section-body">
          {table(["Pilar", "Objetivo", "Formatos", "Exemplo de hook"], pillars_rows)}
        </div>
      </section>

      <section id="s10" class="section-card">
        <div class="section-head"><div class="num">10 / Calendário editorial</div><h2>Ritmo semanal recomendado</h2><p class="lead">Um calendário simples e repetível ajuda a construir hábito no público e facilita produção interna.</p></div>
        <div class="section-body">
          {table(["Dia", "Tema", "Formato", "Conteúdo"], calendar_rows)}
        </div>
      </section>

      <section id="s11" class="section-card">
        <div class="section-head"><div class="num">11 / Funil e conversão</div><h2>Como conteúdo vira uso do produto</h2><p class="lead">A conversão não deve depender só de CTA agressivo. Ela precisa nascer do diagnóstico: mostrar o problema e oferecer o próximo passo.</p></div>
        <div class="section-body">
          {table(["Local", "CTA principal", "CTA secundário"], cta_rows)}
          <div class="grid two">
            <div class="mini"><b>Entrada ideal</b><p>“Cole uma vaga real e veja se vale seu tempo.” É mais concreto do que “melhore seu currículo”.</p></div>
            <div class="mini"><b>Oferta ideal</b><p>“Sua busca em um só sistema” é mais forte que vender recursos isolados.</p></div>
          </div>
        </div>
      </section>

      <section id="s12" class="section-card">
        <div class="section-head"><div class="num">12 / Biblioteca de mensagens</div><h2>Frases prontas para produto e marketing</h2><p class="lead">Mensagens consistentes evitam promessa exagerada e reforçam a lógica do produto.</p></div>
        <div class="section-body">
          <div class="grid two">
            <div class="mini"><b>Landing page</b><p>Receba vagas alinhadas ao seu perfil. Otimize seu currículo para cada oportunidade. Chegue mais forte na entrevista.</p></div>
            <div class="mini"><b>Dashboard</b><p>Sua próxima melhor ação: fortaleça esta candidatura antes de enviar.</p></div>
            <div class="mini"><b>Alerta</b><p>Encontramos oportunidades compatíveis com o perfil que você definiu.</p></div>
            <div class="mini"><b>Currículo</b><p>Seu currículo foi adaptado para esta vaga. Revise ou baixe a versão final.</p></div>
            <div class="mini"><b>Entrevista</b><p>Treine com perguntas baseadas na vaga, no seu currículo e nas lacunas identificadas.</p></div>
            <div class="mini"><b>Upsell</b><p>O Pro libera a jornada completa: análise, currículo, carta, rastreador, alertas e entrevista.</p></div>
          </div>
        </div>
      </section>

      <section id="s13" class="section-card">
        <div class="section-head"><div class="num">13 / Métricas e testes</div><h2>Como saber se a comunicação está funcionando</h2><p class="lead">A marca deve medir clareza e progressão de jornada, não só cliques.</p></div>
        <div class="section-body">
          {table(["Área", "Métricas", "O que responde"], metrics_rows)}
        </div>
      </section>

      <section id="s14" class="section-card">
        <div class="section-head"><div class="num">14 / Riscos de comunicação</div><h2>O que evitar para proteger a marca</h2><p class="lead">O VagaAI deve ser ambicioso na utilidade, mas cuidadoso na promessa.</p></div>
        <div class="section-body">
          <div class="grid two">
            <div class="mini"><b>{badge("Evitar", "red")} “Garanta sua aprovação”</b><p>Promessa frágil e juridicamente arriscada. Substituir por “Envie uma candidatura mais forte”.</p></div>
            <div class="mini"><b>{badge("Evitar", "red")} “A IA faz tudo por você”</b><p>Gera expectativa errada. Melhor: “A IA organiza diagnóstico, material e próximos passos”.</p></div>
            <div class="mini"><b>{badge("Usar")} “Entenda se vale aplicar”</b><p>Concreto, útil e orientado à decisão.</p></div>
            <div class="mini"><b>{badge("Usar")} “Adapte sem inventar experiência”</b><p>Reforça ética, confiança e qualidade do produto.</p></div>
          </div>
        </div>
      </section>

      <section id="s15" class="section-card">
        <div class="section-head"><div class="num">15 / Checklist operacional</div><h2>Antes de publicar qualquer campanha ou tela</h2><p class="lead">Use este checklist para manter produto, conteúdo e vendas alinhados.</p></div>
        <div class="section-body">
          <div class="grid two">
            <div class="mini"><b>Clareza</b><p>A pessoa entende em 5 segundos o que o VagaAI faz?</p></div>
            <div class="mini"><b>Jornada</b><p>A mensagem leva para uma ação real: analisar, otimizar, rastrear, alertar ou treinar?</p></div>
            <div class="mini"><b>Promessa</b><p>O texto promete preparo e decisão, não contratação garantida?</p></div>
            <div class="mini"><b>Persona</b><p>A dor está clara para transição, recolocação, primeiro emprego ou sênior?</p></div>
            <div class="mini"><b>Produto</b><p>A comunicação mostra o sistema completo, não só currículo?</p></div>
            <div class="mini"><b>Conversão</b><p>O CTA está natural para o momento do usuário?</p></div>
          </div>
          <div class="callout"><b>Recomendação final:</b> posicionar o VagaAI como o sistema que transforma candidatura solta em jornada organizada. Essa é a diferença estratégica mais forte.</div>
        </div>
      </section>

      <section class="section-card">
        <div class="section-head"><div class="num">Fontes consultadas</div><h2>Base de pesquisa</h2><p class="lead">Referências usadas para orientar o diagnóstico de mercado, sem transformar o material em relatório acadêmico.</p></div>
        <div class="section-body"><div class="source-grid">{source_cards}</div></div>
      </section>

      <div class="footer">VagaAI — Documento estratégico de jornada, personas e linha editorial.</div>
    </main>
  </div>
</body>
</html>"""


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    HTML_PATH.write_text(build_html(), encoding="utf-8")
    print(HTML_PATH)


if __name__ == "__main__":
    main()
