from __future__ import annotations

import html
import zipfile
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "manual-marca-vagaai"
HTML_PATH = OUT_DIR / "Manual de Marca VagaAI.html"
DOCX_PATH = OUT_DIR / "Manual de Marca VagaAI.docx"


BRAND = {
    "forest": "0A1A10",
    "deep": "0D5A35",
    "emerald": "1A7A4A",
    "bright": "4ECE91",
    "mint": "E8F5EE",
    "paper": "F5F7F5",
    "card": "FFFFFF",
    "ink": "071209",
    "text": "254B34",
    "muted": "6E8A78",
    "amber": "C47D0A",
    "amber_bg": "FFF7E8",
    "red": "D94F4F",
    "red_bg": "FDECEC",
    "border": "DDE8E2",
}


SECTIONS = [
    {
        "num": "01",
        "title": "Introdução da marca",
        "lead": "O VagaAI é uma plataforma de inteligência aplicada à busca por emprego. Ele conecta vagas, currículo, candidatura e entrevista em uma jornada única, ajudando profissionais a decidir melhor antes de aplicar.",
        "blocks": [
            ("O que é", "Uma plataforma que ajuda profissionais a encontrar vagas alinhadas, analisar aderência, otimizar currículo, gerar carta, rastrear candidaturas e treinar entrevistas."),
            ("Por que existe", "A busca por emprego ficou digital, competitiva e fragmentada. O candidato precisa lidar com filtros automáticos, currículos genéricos, pouca resposta e entrevistas mais exigentes."),
            ("Problema que resolve", "Falta de clareza. O usuário muitas vezes não sabe se a vaga combina, o que falta no currículo, quais palavras-chave importam ou qual próximo passo tomar."),
            ("Promessa central", "Buscar emprego com mais clareza, estratégia e preparo. O VagaAI não promete contratação; promete uma candidatura mais bem direcionada."),
        ],
        "callout": "Direção guia: o VagaAI ajuda profissionais a buscar emprego com mais clareza, estratégia e preparo, conectando vagas, currículo, candidatura e entrevista em uma jornada única.",
    },
    {
        "num": "02",
        "title": "Essência da marca",
        "lead": "A marca deve agir como um mentor estratégico: clara, premium, confiável e objetiva.",
        "blocks": [
            ("Propósito", "Dar mais direção à busca por emprego, ajudando profissionais a tomarem decisões melhores antes de enviar uma candidatura."),
            ("Missão", "Transformar a candidatura em um processo mais inteligente, mostrando aderência, lacunas e próximo passo mais importante."),
            ("Visão", "Ser o copiloto de carreira mais confiável para profissionais que querem conquistar novas oportunidades com estratégia."),
            ("Personalidade", "Mentor estratégico, especialista acessível, copiloto de decisão e ferramenta premium sem arrogância."),
            ("Tom emocional", "Seguro, encorajador e direto. A marca deve transmitir: você não está perdido; existe um próximo passo claro."),
        ],
        "values": ["Clareza acima de volume", "Preparo acima de improviso", "Honestidade acima de promessa exagerada", "Personalização acima de currículo genérico", "Tecnologia a serviço da decisão humana"],
    },
    {
        "num": "03",
        "title": "Posicionamento",
        "lead": "Para profissionais que querem buscar emprego com mais estratégia, o VagaAI é uma plataforma de candidatura inteligente que conecta vagas, currículo, acompanhamento e entrevista em um só lugar.",
        "blocks": [
            ("Público principal", "Profissionais em busca ativa, transição de carreira ou troca de emprego que querem aumentar a qualidade das candidaturas enviadas."),
            ("Dores", "Enviar currículos sem retorno, não saber se a vaga combina, usar currículo genérico, perder tempo com vaga desalinhada e chegar despreparado à entrevista."),
            ("Desejos", "Conseguir mais entrevistas, se sentir preparado, entender prioridades, organizar candidaturas e adaptar materiais sem inventar experiência."),
            ("Diferenciais", "Jornada completa, análise por vaga, score de aderência, currículo otimizado, rastreador, alertas, entrevista contextual e carta personalizada."),
        ],
        "do_dont": [
            ("É", "Copiloto de candidatura; sistema de clareza profissional; ferramenta de preparo; produto premium acessível."),
            ("Não é", "Garantia de emprego; agência de recrutamento; ferramenta que inventa experiência; atalho mágico para aprovação."),
        ],
    },
    {
        "num": "04",
        "title": "Mensagem central",
        "lead": "A mensagem precisa ser direta, útil e realista: clareza antes de aplicar, currículo certo para a vaga certa e preparo para a entrevista.",
        "tagline": "Passe pelo filtro. Chegue mais forte na entrevista.",
        "headlines": [
            "Receba vagas alinhadas ao seu perfil.",
            "Otimize seu currículo para cada oportunidade.",
            "Entenda se essa vaga vale seu tempo.",
            "Pare de enviar currículo no escuro.",
            "Veja onde seu currículo combina com a vaga e onde precisa melhorar.",
        ],
        "features": [
            ("Alertas de vagas", "Receba oportunidades alinhadas ao cargo, localização, salário e perfil definidos."),
            ("Análise de aderência", "Veja score, pontos fortes e lacunas antes de se candidatar."),
            ("Currículo otimizado", "Gere uma versão direcionada para a vaga, sem inventar experiências."),
            ("Rastreador de candidaturas", "Acompanhe status, prazos e próximas ações de cada oportunidade."),
            ("Simulador de entrevista", "Treine com perguntas baseadas na vaga, no currículo e nas lacunas identificadas."),
            ("Carta de apresentação", "Crie uma carta personalizada com foco no que o recrutador precisa entender."),
        ],
    },
    {
        "num": "05",
        "title": "Tom de voz",
        "lead": "O VagaAI fala com clareza, sem inflar promessa. A linguagem deve reduzir ansiedade e aumentar direção.",
        "voice": [
            ("Como fala", "Direto, humano, estratégico, simples, premium, confiante e educativo."),
            ("Como não fala", "Promessa milagrosa, medo artificial, jargão técnico excessivo, tom frio ou motivação vazia."),
        ],
        "examples": [
            ("Botão", "Ver minha aderência", "Garantir aprovação"),
            ("Empty state", "Analise uma vaga que você realmente pretende enviar.", "Você ainda não fez nada."),
            ("Erro", "Não conseguimos carregar essa informação agora. Tente novamente.", "Erro inesperado."),
            ("Upsell", "No Pro, você acompanha análise, currículo, candidatura e entrevista.", "Desbloqueie seu sucesso agora."),
            ("Landing page", "Entenda se essa vaga vale seu tempo.", "Passe em qualquer processo seletivo."),
        ],
    },
    {
        "num": "06",
        "title": "Identidade visual",
        "lead": "A identidade deve equilibrar tecnologia, confiança e orientação humana. O verde escuro é a assinatura institucional; o verde brilhante é ação e progresso.",
        "blocks": [
            ("Logo principal", "Usar a versão horizontal VagaAI em landing page, e-mails, documentos e materiais comerciais."),
            ("Logo reduzida", "Usar o ícone V em sidebar, favicon, botões compactos e espaços pequenos."),
            ("Tema claro", "Garantir leitura sobre fundo off-white ou branco, com verde em contraste suficiente."),
            ("Tema escuro", "Usar logo clara ou símbolo destacado sobre o verde institucional."),
            ("Área de respiro", "Manter no mínimo a altura do símbolo V como margem ao redor da logo."),
        ],
    },
    {
        "num": "07",
        "title": "Cores da marca",
        "lead": "As cores devem ter função: verde para direção e avanço; âmbar para atenção; vermelho para erro; neutros para legibilidade.",
        "colors": [
            ("Verde VagaAI", "#4ECE91", "Ação, progresso, destaque positivo."),
            ("Verde institucional", "#0A1A10", "Sidebar, áreas premium, assinatura da marca."),
            ("Verde ação", "#1A7A4A", "CTAs e estados ativos."),
            ("Fundo claro premium", "#F5F7F5", "Base do app e materiais."),
            ("Atenção", "#C47D0A", "Lacunas, ajustes e score médio."),
            ("Erro", "#D94F4F", "Falhas, remoções e score baixo."),
        ],
    },
    {
        "num": "08",
        "title": "Tipografia",
        "lead": "A tipografia precisa transmitir sofisticação sem prejudicar leitura. O produto não deve parecer uma fintech microscópica.",
        "type": [
            ("Principal", "Inter, Manrope ou similar sem serifa", "Interface, corpo, menus, botões e formulários."),
            ("Secundária", "Lora, Georgia, Playfair Display ou similar", "Headlines, landing page e momentos editoriais."),
            ("H1", "40–56px desktop / 32–38px mobile", "Títulos curtos, fortes e com respiro."),
            ("Corpo", "15–17px, linha 1.5–1.7", "Texto funcional confortável."),
            ("Microcopy", "12–13px", "Nunca usar cinza claro demais em informação importante."),
        ],
    },
    {
        "num": "09",
        "title": "Sistema visual do produto",
        "lead": "O sistema visual deve deixar a jornada óbvia: o usuário precisa entender onde está, o que aconteceu e qual ação tomar.",
        "components": [
            ("Cards", "Bordas médias, sombra leve, agrupamento claro e ação principal evidente."),
            ("Botões", "Primário verde sólido; secundário claro com borda; perigo discreto com ícone."),
            ("Badges", "Pequenos, semânticos e consistentes: Pro, Analisada, Entrevista, CV otimizado."),
            ("Menus", "Sidebar escura no desktop; menu inferior e hambúrguer no mobile."),
            ("Modais", "Overlay suave, título claro, texto curto e botões objetivos."),
            ("Listas", "Score visual, status claro, próxima ação destacada e painel lateral de detalhes."),
            ("Motion", "Score preenchendo, cards entrando, alertas chegando e loading inteligente."),
        ],
    },
    {
        "num": "10",
        "title": "Mockups, imagens e ilustrações",
        "lead": "Mockups devem vender entendimento, não decorar. Toda representação visual precisa mostrar uma ação real do produto.",
        "blocks": [
            ("Como devem ser", "Baseados em telas reais, com dados plausíveis, fluxo claro e hierarquia objetiva."),
            ("Representar análise", "Score, lacunas, keywords, prioridade e CTA para otimizar currículo."),
            ("Representar candidaturas", "Status, próxima ação, histórico e oportunidade selecionada."),
            ("Representar entrevista", "Pergunta contextual, campo de resposta, feedback e progresso."),
            ("Evitar", "Imagens genéricas, personagens sem contexto, mockups irreais e enfeites sem função."),
        ],
    },
    {
        "num": "11",
        "title": "Comunicação por jornada",
        "lead": "A comunicação deve acompanhar o momento do usuário. Cada tela precisa responder: o que aconteceu, por que importa e o que fazer agora.",
        "journey": [
            ("Primeiro acesso", "Comece analisando uma vaga que você realmente pretende enviar."),
            ("Primeira análise", "Comparamos a vaga com seu currículo para mostrar pontos fortes e lacunas."),
            ("Resultado", "Sua aderência atual é X%. Veja os principais ajustes para fortalecer sua candidatura."),
            ("Currículo otimizado", "Seu currículo foi adaptado para esta vaga. Revise ou baixe a versão final."),
            ("Candidatura rastreada", "Esta oportunidade foi adicionada ao rastreador para acompanhar próximos passos."),
            ("Alerta recebido", "Encontramos vagas compatíveis com o perfil que você definiu."),
            ("Entrevista", "Treine perguntas baseadas na vaga, no currículo e no que a empresa pode investigar."),
            ("Upgrade", "Seu plano atual permite começar. O Pro libera a jornada completa."),
        ],
    },
    {
        "num": "12",
        "title": "Planos e comunicação comercial",
        "lead": "A comunicação comercial deve vender continuidade de jornada, não pressão. O usuário precisa entender o que ganha em cada plano.",
        "plans": [
            ("Free", "Entrada e ativação", "Teste o VagaAI e entenda o valor de analisar uma vaga antes de se candidatar."),
            ("Starter", "Uso recorrente leve", "Para quem quer buscar emprego com mais frequência e parar de aplicar no escuro."),
            ("Pro", "Sistema completo", "Para quem quer usar o VagaAI como central da busca por emprego."),
        ],
    },
    {
        "num": "13",
        "title": "Aplicações da marca",
        "lead": "A marca precisa se comportar de forma consistente em landing page, app, e-mails, anúncios, Instagram, PDFs e apresentações.",
        "applications": [
            ("Landing page", "Headline direta, mockups reais, benefícios concretos e objeções claras."),
            ("Dashboard", "Próxima melhor ação, candidaturas, alertas, metas úteis e pouca repetição."),
            ("Mobile", "Menu inferior, hambúrguer, botões grandes e textos confortáveis."),
            ("E-mails", "Curtos, com uma ação principal e baseados em oportunidade ou progresso."),
            ("Instagram", "Dor do candidato, ATS, currículo, bastidores do recrutamento e uso do produto."),
            ("PDFs e currículos", "A4 correto, legível, limpo e profissional acima de decorativo."),
        ],
    },
    {
        "num": "14",
        "title": "Exemplos práticos",
        "lead": "Exemplos prontos ajudam a manter consistência entre produto, marketing e suporte.",
        "examples_full": [
            ("Seção de LP", "Antes de enviar o currículo, entenda se a vaga combina com você.", "O VagaAI compara a descrição da vaga com seu currículo, identifica lacunas e mostra ajustes para fortalecer sua candidatura."),
            ("Card do app", "Próxima melhor ação", "Seu currículo ainda não destaca 4 requisitos importantes para esta vaga."),
            ("E-mail de alerta", "Encontramos vagas compatíveis com seu perfil", "Selecionamos oportunidades com base no cargo, localização e preferências que você definiu."),
            ("Notificação", "Nova vaga com 82% de aderência encontrada.", "Analisar vaga agora"),
            ("Post", "Mandar mais currículos nem sempre aumenta suas chances.", "Antes de aplicar, entenda onde você está forte e onde precisa ajustar."),
        ],
    },
    {
        "num": "15",
        "title": "Checklist de consistência",
        "lead": "Antes de publicar qualquer tela, texto ou campanha, usar este checklist como filtro de qualidade.",
        "checks": [
            "A mensagem está clara em até 5 segundos?",
            "A promessa é realista e evita garantir emprego?",
            "O texto ajuda o usuário a tomar uma decisão?",
            "O próximo passo está evidente?",
            "O visual parece premium sem ficar pesado?",
            "A cor usada tem função?",
            "O componente reduz esforço ou só decora?",
            "A comunicação respeita o plano do usuário?",
            "O mobile está legível?",
            "O fluxo continua a jornada ou cria uma quebra?",
        ],
    },
]


SOURCES = [
    ("IBGE - Desemprego", "https://www.ibge.gov.br/explica/desemprego.php"),
    ("IBGE - PNAD Contínua", "https://www.ibge.gov.br/estatisticas/sociais/saude/9173-pesquisa-nacional-por-amostra-de-domicilios-continua-trimestral.html"),
    ("LinkedIn Future of Recruiting 2025", "https://business.linkedin.com/content/dam/me/business/en-us/talent-solutions/resources/pdfs/future-of-recruiting-2025.pdf"),
    ("Gupy - Mercado de Trabalho no Brasil 2026", "https://conteudos.gupy.io/materiais/relatorio/empregabilidade-2026"),
    ("Indeed Hiring Lab", "https://www.hiringlab.org/"),
]


def esc(s: str) -> str:
    return html.escape(s, quote=True)


def build_html() -> str:
    sections_nav = "\n".join(
        f'<a href="#s{s["num"]}"><span>{s["num"]}</span>{esc(s["title"])}</a>' for s in SECTIONS
    )
    section_html = []
    for s in SECTIONS:
        body = []
        if "blocks" in s:
            body.append('<div class="grid two">')
            for label, text in s["blocks"]:
                body.append(f'<div class="mini"><b>{esc(label)}</b><p>{esc(text)}</p></div>')
            body.append("</div>")
        if s.get("callout"):
            body.append(f'<div class="callout">{esc(s["callout"])}</div>')
        if "values" in s:
            body.append('<div class="chips">' + "".join(f"<span>{esc(v)}</span>" for v in s["values"]) + "</div>")
        if "do_dont" in s:
            body.append('<div class="grid two">')
            for label, text in s["do_dont"]:
                cls = "positive" if label == "É" else "negative"
                body.append(f'<div class="mini {cls}"><b>{esc(label)}</b><p>{esc(text)}</p></div>')
            body.append("</div>")
        if "tagline" in s:
            body.append(f'<div class="tagline">{esc(s["tagline"])}</div>')
        if "headlines" in s:
            body.append("<h3>Headlines recomendadas</h3><ul>" + "".join(f"<li>{esc(x)}</li>" for x in s["headlines"]) + "</ul>")
        if "features" in s:
            body.append("<h3>Mensagens por funcionalidade</h3>" + table_html(["Funcionalidade", "Mensagem"], s["features"]))
        if "voice" in s:
            body.append(table_html(["Diretriz", "Descrição"], s["voice"]))
        if "examples" in s:
            body.append("<h3>Exemplos de tom</h3>" + table_html(["Contexto", "Mais VagaAI", "Evitar"], s["examples"]))
        if "colors" in s:
            rows = []
            for name, color, use in s["colors"]:
                rows.append(f"<tr><td><span class='swatch' style='background:{color}'></span>{esc(name)}</td><td><code>{esc(color)}</code></td><td>{esc(use)}</td></tr>")
            body.append("<table><thead><tr><th>Cor</th><th>Hex</th><th>Uso</th></tr></thead><tbody>" + "".join(rows) + "</tbody></table>")
        if "type" in s:
            body.append(table_html(["Elemento", "Recomendação", "Uso"], s["type"]))
        if "components" in s:
            body.append(table_html(["Componente", "Direção"], s["components"]))
        if "journey" in s:
            body.append(table_html(["Momento", "Mensagem orientadora"], s["journey"]))
        if "plans" in s:
            body.append(table_html(["Plano", "Papel", "Mensagem"], s["plans"]))
        if "applications" in s:
            body.append(table_html(["Aplicação", "Direção"], s["applications"]))
        if "examples_full" in s:
            body.append(table_html(["Peça", "Texto principal", "Apoio/CTA"], s["examples_full"]))
        if "checks" in s:
            body.append('<div class="checklist">' + "".join(f"<label><span>✓</span>{esc(c)}</label>" for c in s["checks"]) + "</div>")

        section_html.append(
            f"""
            <section id="s{s['num']}" class="section">
              <div class="sec-num">{s['num']}</div>
              <div>
                <h2>{esc(s['title'])}</h2>
                <p class="lead">{esc(s['lead'])}</p>
                {''.join(body)}
              </div>
            </section>
            """
        )

    sources = "".join(f'<li><a href="{esc(url)}">{esc(name)}</a></li>' for name, url in SOURCES)
    return f"""<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Manual de Marca VagaAI</title>
  <style>
    :root {{
      --forest:#0A1A10; --deep:#0D5A35; --green:#1A7A4A; --bright:#4ECE91;
      --paper:#F5F7F5; --card:#FFFFFF; --ink:#071209; --text:#254B34; --muted:#6E8A78;
      --border:#DDE8E2; --amber:#C47D0A; --red:#D94F4F;
    }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; font-family: Inter, Manrope, Arial, sans-serif; background:var(--paper); color:var(--ink); line-height:1.55; }}
    .layout {{ display:grid; grid-template-columns:300px 1fr; min-height:100vh; }}
    aside {{ position:sticky; top:0; height:100vh; background:linear-gradient(180deg,#061108,#0A1A10); color:#fff; padding:34px 28px; overflow:auto; }}
    .brand {{ display:flex; align-items:center; gap:12px; margin-bottom:32px; }}
    .mark {{ width:38px; height:38px; border-radius:50%; background:#111; border:1px solid rgba(255,255,255,.15); display:grid; place-items:center; font-weight:900; font-family:Georgia,serif; }}
    .word {{ font-family:Georgia,serif; font-size:24px; font-weight:800; }} .word span {{ color:var(--bright); }}
    .side-sub {{ color:#9fbaa9; font-size:12px; text-transform:uppercase; letter-spacing:.12em; margin:22px 0 10px; }}
    aside a {{ display:flex; align-items:center; gap:10px; color:#cfe4d6; text-decoration:none; padding:10px 0; font-size:13px; border-bottom:1px solid rgba(255,255,255,.05); }}
    aside a span {{ color:var(--bright); font-weight:800; min-width:28px; }}
    main {{ padding:48px 64px 80px; }}
    .cover {{ background:radial-gradient(circle at 80% 20%,rgba(78,206,145,.28),transparent 32%), linear-gradient(140deg,#0A1A10,#0D5A35); color:#fff; border-radius:30px; padding:56px; box-shadow:0 24px 80px rgba(10,26,16,.22); margin-bottom:38px; overflow:hidden; position:relative; }}
    .cover:after {{ content:""; position:absolute; width:360px; height:360px; border-radius:50%; border:1px solid rgba(78,206,145,.25); right:-120px; bottom:-160px; }}
    .kicker {{ color:var(--bright); font-size:12px; text-transform:uppercase; letter-spacing:.14em; font-weight:800; margin-bottom:16px; }}
    h1 {{ font-family:Georgia,serif; font-size:54px; line-height:1.02; margin:0 0 18px; letter-spacing:-.03em; max-width:760px; }}
    .cover p {{ max-width:760px; color:#d8efe0; font-size:18px; margin:0 0 28px; }}
    .cover-grid {{ display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-top:34px; }}
    .metric {{ background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.12); border-radius:18px; padding:18px; }}
    .metric b {{ display:block; color:#fff; font-size:18px; }} .metric span {{ color:#a9cbb6; font-size:12px; }}
    .section {{ display:grid; grid-template-columns:70px 1fr; gap:28px; background:var(--card); border:1px solid var(--border); border-radius:24px; padding:34px; margin-bottom:22px; box-shadow:0 8px 30px rgba(10,26,16,.06); }}
    .sec-num {{ width:54px; height:54px; border-radius:16px; background:#E8F5EE; color:var(--green); display:grid; place-items:center; font-weight:900; }}
    h2 {{ font-family:Georgia,serif; font-size:34px; letter-spacing:-.03em; margin:0 0 8px; }}
    h3 {{ margin:24px 0 10px; font-size:15px; text-transform:uppercase; letter-spacing:.08em; color:var(--green); }}
    .lead {{ color:var(--text); font-size:16px; margin:0 0 22px; max-width:880px; }}
    .grid {{ display:grid; gap:14px; }} .grid.two {{ grid-template-columns:repeat(2,minmax(0,1fr)); }}
    .mini {{ background:#F8FBF9; border:1px solid var(--border); border-radius:16px; padding:18px; }}
    .mini b {{ color:var(--green); }} .mini p {{ margin:6px 0 0; color:var(--text); font-size:14px; }}
    .mini.negative b {{ color:var(--red); }} .mini.positive b {{ color:var(--green); }}
    .callout, .tagline {{ border-left:4px solid var(--bright); background:#EAF8F0; border-radius:14px; padding:18px 20px; color:#143621; font-weight:700; margin:18px 0; }}
    .tagline {{ font-family:Georgia,serif; font-size:26px; }}
    .chips {{ display:flex; flex-wrap:wrap; gap:10px; margin-top:14px; }}
    .chips span {{ background:#EAF8F0; border:1px solid #BFE7CF; color:var(--green); border-radius:999px; padding:8px 12px; font-size:13px; font-weight:700; }}
    table {{ width:100%; border-collapse:separate; border-spacing:0; overflow:hidden; border:1px solid var(--border); border-radius:16px; margin:14px 0 4px; background:#fff; }}
    th {{ background:#0A1A10; color:#fff; text-align:left; font-size:12px; text-transform:uppercase; letter-spacing:.08em; padding:12px 14px; }}
    td {{ border-top:1px solid var(--border); padding:13px 14px; vertical-align:top; font-size:14px; color:var(--text); }}
    code {{ background:#F0F4F1; border:1px solid var(--border); border-radius:8px; padding:4px 6px; }}
    .swatch {{ width:24px; height:24px; display:inline-block; border-radius:8px; border:1px solid rgba(0,0,0,.08); margin-right:10px; vertical-align:middle; }}
    .checklist {{ display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }}
    .checklist label {{ background:#F8FBF9; border:1px solid var(--border); border-radius:14px; padding:12px 14px; font-size:14px; }}
    .checklist span {{ color:var(--green); font-weight:900; margin-right:8px; }}
    .sources {{ background:#fff; border:1px solid var(--border); border-radius:22px; padding:28px 34px; margin-top:24px; }}
    .sources a {{ color:var(--green); }}
    @media print {{ aside {{ display:none; }} .layout {{ display:block; }} main {{ padding:0; }} .section, .cover {{ break-inside:avoid; box-shadow:none; }} }}
    @media (max-width:900px) {{ .layout {{ grid-template-columns:1fr; }} aside {{ position:relative; height:auto; }} main {{ padding:28px 18px; }} .section {{ grid-template-columns:1fr; }} .grid.two,.cover-grid,.checklist {{ grid-template-columns:1fr; }} h1 {{ font-size:38px; }} }}
  </style>
</head>
<body>
  <div class="layout">
    <aside>
      <div class="brand"><div class="mark">V</div><div class="word">Vaga<span>AI</span></div></div>
      <div class="side-sub">Manual da marca</div>
      {sections_nav}
    </aside>
    <main>
      <section class="cover">
        <div class="kicker">Brand handbook estratégico</div>
        <h1>Manual de Marca VagaAI</h1>
        <p>Um guia para alinhar posicionamento, tom de voz, identidade visual, produto, marketing e comunicação comercial em torno de uma promessa realista: buscar emprego com mais clareza, estratégia e preparo.</p>
        <div class="cover-grid">
          <div class="metric"><b>Clareza</b><span>antes de aplicar</span></div>
          <div class="metric"><b>Preparo</b><span>currículo e entrevista</span></div>
          <div class="metric"><b>Jornada</b><span>vaga até candidatura</span></div>
          <div class="metric"><b>Confiança</b><span>sem prometer contratação</span></div>
        </div>
      </section>
      {''.join(section_html)}
      <section class="sources">
        <h2>Base estratégica de mercado</h2>
        <p class="lead">O posicionamento do VagaAI parte de um mercado de trabalho competitivo, digitalizado e cada vez mais mediado por tecnologia. O candidato não precisa apenas de mais vagas; precisa de clareza para escolher, adaptar, acompanhar e se preparar melhor.</p>
        <ul>{sources}</ul>
      </section>
    </main>
  </div>
</body>
</html>"""


def table_html(headers, rows):
    head = "".join(f"<th>{esc(h)}</th>" for h in headers)
    body = []
    for row in rows:
        body.append("<tr>" + "".join(f"<td>{esc(str(c))}</td>" for c in row) + "</tr>")
    return f"<table><thead><tr>{head}</tr></thead><tbody>{''.join(body)}</tbody></table>"


def wx(text: str) -> str:
    return html.escape(text, quote=False)


def w_p(text="", style=None, color=None, size=None, bold=False, align=None, fill=None):
    ppr = []
    if style:
        ppr.append(f'<w:pStyle w:val="{style}"/>')
    if align:
        ppr.append(f'<w:jc w:val="{align}"/>')
    if fill:
        ppr.append(f'<w:shd w:fill="{fill}"/>')
    rpr = []
    if bold:
        rpr.append("<w:b/>")
    if color:
        rpr.append(f'<w:color w:val="{color}"/>')
    if size:
        rpr.append(f'<w:sz w:val="{int(size * 2)}"/>')
    rpr_xml = f"<w:rPr>{''.join(rpr)}</w:rPr>" if rpr else ""
    ppr_xml = f"<w:pPr>{''.join(ppr)}</w:pPr>" if ppr else ""
    return f"<w:p>{ppr_xml}<w:r>{rpr_xml}<w:t>{wx(text)}</w:t></w:r></w:p>"


def w_table(headers, rows, widths=None, header_fill="0A1A10"):
    cols = len(headers)
    if widths is None:
        widths = [int(9360 / cols)] * cols
    grid = "".join(f'<w:gridCol w:w="{w}"/>' for w in widths)
    xml = [
        '<w:tbl><w:tblPr><w:tblW w:w="9360" w:type="dxa"/><w:tblBorders>'
        '<w:top w:val="single" w:sz="4" w:color="DDE8E2"/><w:left w:val="single" w:sz="4" w:color="DDE8E2"/>'
        '<w:bottom w:val="single" w:sz="4" w:color="DDE8E2"/><w:right w:val="single" w:sz="4" w:color="DDE8E2"/>'
        '<w:insideH w:val="single" w:sz="4" w:color="DDE8E2"/><w:insideV w:val="single" w:sz="4" w:color="DDE8E2"/>'
        '</w:tblBorders><w:tblCellMar><w:top w:w="100" w:type="dxa"/><w:left w:w="140" w:type="dxa"/><w:bottom w:w="100" w:type="dxa"/><w:right w:w="140" w:type="dxa"/></w:tblCellMar></w:tblPr>',
        f"<w:tblGrid>{grid}</w:tblGrid>",
    ]
    xml.append("<w:tr>")
    for h, width in zip(headers, widths):
        xml.append(f'<w:tc><w:tcPr><w:tcW w:w="{width}" w:type="dxa"/><w:shd w:fill="{header_fill}"/></w:tcPr>{w_p(h, color="FFFFFF", bold=True, size=9)}</w:tc>')
    xml.append("</w:tr>")
    for row in rows:
        xml.append("<w:tr>")
        for c, width in zip(row, widths):
            xml.append(f'<w:tc><w:tcPr><w:tcW w:w="{width}" w:type="dxa"/></w:tcPr>{w_p(str(c), size=9, color="254B34")}</w:tc>')
        xml.append("</w:tr>")
    xml.append("</w:tbl>")
    return "".join(xml)


def w_bullets(items):
    return "".join(w_p("• " + item, style="Bullet") for item in items)


def w_callout(text):
    return (
        '<w:tbl><w:tblPr><w:tblW w:w="9360" w:type="dxa"/><w:tblBorders>'
        '<w:top w:val="single" w:sz="4" w:color="BFE7CF"/><w:left w:val="single" w:sz="12" w:color="4ECE91"/>'
        '<w:bottom w:val="single" w:sz="4" w:color="BFE7CF"/><w:right w:val="single" w:sz="4" w:color="BFE7CF"/>'
        '</w:tblBorders><w:tblCellMar><w:top w:w="180" w:type="dxa"/><w:left w:w="220" w:type="dxa"/><w:bottom w:w="180" w:type="dxa"/><w:right w:w="220" w:type="dxa"/></w:tblCellMar></w:tblPr>'
        '<w:tblGrid><w:gridCol w:w="9360"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:tcW w:w="9360" w:type="dxa"/><w:shd w:fill="EAF8F0"/></w:tcPr>'
        + w_p(text, color="143621", bold=True)
        + "</w:tc></w:tr></w:tbl>"
    )


def styles_xml():
    return f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr><w:spacing w:after="120" w:line="300" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos"/><w:sz w:val="22"/><w:color w:val="{BRAND['ink']}"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:pPr><w:spacing w:before="0" w:after="160"/></w:pPr><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia"/><w:b/><w:sz w:val="72"/><w:color w:val="FFFFFF"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:pPr><w:spacing w:after="260" w:line="320" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos"/><w:sz w:val="26"/><w:color w:val="D8EFE0"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="300" w:after="120"/></w:pPr><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia"/><w:b/><w:sz w:val="34"/><w:color w:val="{BRAND['deep']}"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="220" w:after="90"/></w:pPr><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos"/><w:b/><w:sz w:val="25"/><w:color w:val="{BRAND['emerald']}"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="160" w:after="70"/></w:pPr><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos"/><w:b/><w:sz w:val="22"/><w:color w:val="{BRAND['text']}"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Kicker"><w:name w:val="Kicker"/><w:pPr><w:spacing w:after="90"/></w:pPr><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos"/><w:b/><w:caps/><w:sz w:val="18"/><w:color w:val="{BRAND['bright']}"/><w:spacing w:val="24"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Bullet"><w:name w:val="Bullet"/><w:pPr><w:spacing w:after="70" w:line="290" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos"/><w:sz w:val="21"/><w:color w:val="{BRAND['text']}"/></w:rPr></w:style>
</w:styles>'''


def document_xml():
    parts = []
    parts.append(w_p("Brand handbook estratégico", style="Kicker", fill="0A1A10"))
    parts.append(w_p("Manual de Marca VagaAI", style="Title", fill="0A1A10"))
    parts.append(w_p("Guia estratégico para posicionamento, tom de voz, identidade visual, produto, marketing e comunicação comercial.", style="Subtitle", fill="0A1A10"))
    parts.append(w_callout("Promessa central: buscar emprego com mais clareza, estratégia e preparo — sem prometer contratação."))
    parts.append(w_p("Resumo executivo", style="Heading1"))
    parts.append(w_p("O VagaAI deve ser percebido como um copiloto de candidatura: uma plataforma premium, clara e acionável que ajuda o usuário a escolher oportunidades, adaptar materiais e avançar com mais preparo."))
    parts.append(w_table(["Pilar", "Direção"], [
        ("Clareza", "Mostrar se a vaga faz sentido antes de o usuário investir tempo."),
        ("Preparo", "Transformar análise em currículo, carta e entrevista mais fortes."),
        ("Jornada", "Conectar vaga, currículo, candidatura e entrevista em um único sistema."),
        ("Confiança", "Prometer decisões melhores, não contratação garantida."),
    ], widths=[2200, 7160]))

    for s in SECTIONS:
        parts.append(w_p(f"{s['num']} — {s['title']}", style="Heading1"))
        parts.append(w_p(s["lead"]))
        if "blocks" in s:
            parts.append(w_table(["Tema", "Direção"], s["blocks"], widths=[2200, 7160]))
        if s.get("callout"):
            parts.append(w_callout(s["callout"]))
        if "values" in s:
            parts.append(w_p("Valores", style="Heading2"))
            parts.append(w_bullets(s["values"]))
        if "do_dont" in s:
            parts.append(w_table(["O que a marca é / não é", "Definição"], s["do_dont"], widths=[2600, 6760]))
        if "tagline" in s:
            parts.append(w_callout("Tagline principal: " + s["tagline"]))
        if "headlines" in s:
            parts.append(w_p("Headlines recomendadas", style="Heading2"))
            parts.append(w_bullets(s["headlines"]))
        if "features" in s:
            parts.append(w_table(["Funcionalidade", "Mensagem"], s["features"], widths=[2600, 6760]))
        if "voice" in s:
            parts.append(w_table(["Diretriz", "Descrição"], s["voice"], widths=[2600, 6760]))
        if "examples" in s:
            parts.append(w_table(["Contexto", "Mais VagaAI", "Evitar"], s["examples"], widths=[1800, 3900, 3660]))
        if "colors" in s:
            parts.append(w_table(["Cor", "Hex", "Uso"], s["colors"], widths=[2400, 1700, 5260]))
        if "type" in s:
            parts.append(w_table(["Elemento", "Recomendação", "Uso"], s["type"], widths=[1700, 3800, 3860]))
        if "components" in s:
            parts.append(w_table(["Componente", "Direção"], s["components"], widths=[2200, 7160]))
        if "journey" in s:
            parts.append(w_table(["Momento", "Mensagem orientadora"], s["journey"], widths=[2400, 6960]))
        if "plans" in s:
            parts.append(w_table(["Plano", "Papel", "Mensagem"], s["plans"], widths=[1600, 2400, 5360]))
        if "applications" in s:
            parts.append(w_table(["Aplicação", "Direção"], s["applications"], widths=[2200, 7160]))
        if "examples_full" in s:
            parts.append(w_table(["Peça", "Texto principal", "Apoio/CTA"], s["examples_full"], widths=[1800, 3600, 3960]))
        if "checks" in s:
            parts.append(w_bullets(s["checks"]))

    parts.append(w_p("Base estratégica de mercado", style="Heading1"))
    parts.append(w_p("O posicionamento do VagaAI parte de um mercado de trabalho competitivo, digitalizado e mediado por tecnologia. O candidato não precisa apenas de mais vagas; precisa de clareza para escolher, adaptar, acompanhar e se preparar melhor."))
    parts.append(w_table(["Fonte", "URL"], SOURCES, widths=[3300, 6060]))
    return f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    {''.join(parts)}
    <w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>
  </w:body>
</w:document>'''


def write_docx():
    files = {
        "[Content_Types].xml": '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>''',
        "_rels/.rels": '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>''',
        "word/_rels/document.xml.rels": '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>''',
        "word/document.xml": document_xml(),
        "word/styles.xml": styles_xml(),
        "word/settings.xml": '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:zoom w:percent="100"/><w:defaultTabStop w:val="720"/></w:settings>''',
        "docProps/app.xml": '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Codex</Application></Properties>''',
        "docProps/core.xml": f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Manual de Marca VagaAI</dc:title><dc:creator>VagaAI</dc:creator><cp:lastModifiedBy>Codex</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">{datetime.utcnow().isoformat()}Z</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">{datetime.utcnow().isoformat()}Z</dcterms:modified></cp:coreProperties>''',
    }
    with zipfile.ZipFile(DOCX_PATH, "w", compression=zipfile.ZIP_DEFLATED) as z:
        for name, data in files.items():
            z.writestr(name, data)


def main():
    OUT_DIR.mkdir(exist_ok=True)
    HTML_PATH.write_text(build_html(), encoding="utf-8")
    write_docx()
    print(HTML_PATH)
    print(DOCX_PATH)


if __name__ == "__main__":
    main()
