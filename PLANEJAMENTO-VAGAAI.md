# Planejamento Estratégico — VagaAI

> Documento interno. Estrutura adaptada do eBook "Plano de Negócios" (Townprint):
> **Parte 1** Fundamentos de gestão · **Parte 2** Plano de crescimento ·
> **Parte 3** Frameworks aplicados · **Parte 4** Mentalidade e mandamentos.
>
> Dados reais em 05/07/2026: 5 usuários, 1 assinante Pro (MRR R$39,90),
> 56 análises/30d, 11 créditos avulsos vendidos, 1 alerta ativo.
> Números marcados como *estimativa* devem ser validados antes de decisões grandes.

---

## PARTE 1 — Fundamentos e identidade do negócio

### 1.1 O que é o VagaAI

Copiloto de empregabilidade para candidatos brasileiros: analisa CV contra vaga
(score ATS), gera CV otimizado e carta de apresentação, simula entrevista com IA,
envia alertas de vagas compatíveis e rastreia candidaturas — em um único fluxo.

- **Missão:** eliminar os erros evitáveis que impedem um bom candidato de chegar à entrevista.
- **Visão (3 anos):** ser a ferramenta padrão de preparação de candidatura do mercado
  de língua portuguesa, com beachhead em espanhol (LatAm).
- **Valores operacionais:** honestidade com o usuário (não prometemos contratação),
  velocidade de entrega, custo enxuto, decisão por dados.

### 1.2 Modelo de negócio

| Fonte de receita | Mecânica | Status |
|---|---|---|
| Assinatura Starter R$19,90/mês (anual R$14,92) | 10 análises/mês, CV PDF, carta, alertas 15 vagas | Ativo |
| Assinatura Pro R$39,90/mês (anual R$24,92) | Ilimitado + simulador + alertas diários ilimitados | Ativo (1 assinante) |
| Créditos avulsos R$9,90 / R$39,90 / R$97 | 1 / 10 / 50 análises, sem assinatura | Ativo (11 vendidos) |
| B2B "VagaAI Hire" (empresas) | Lead form em /paraempresas | Semente — sem oferta definida |

Freemium: plano grátis com 1 análise/mês + alerta semanal (5 vagas) + rastreador.
O grátis é o motor de aquisição; a conversão acontece no momento de maior dor
(limite atingido / vaga urgente).

### 1.3 O administrador (adaptação: fundador solo + IA)

O eBook descreve papéis do administrador (planejar, organizar, dirigir, controlar).
No VagaAI isso se traduz em um fundador solo com IA como copiloto operacional:

| Papel clássico | Como se executa aqui |
|---|---|
| Planejar | Este documento + revisão mensal (Parte 4) |
| Organizar | Backlog enxuto; infra serverless sem ops manual |
| Dirigir | Fundador decide; IA executa desenvolvimento/auditoria |
| Controlar | Rede de detecção (invariantes + CI + Sentry) — **pendente, prioridade #1** |

### 1.4 Fatores de sucesso e insucesso (mapeados ao contexto)

**O que costuma matar negócios assim (e a defesa):**

| Risco clássico | Aplicado ao VagaAI | Defesa |
|---|---|---|
| Falta de clientes | 5 usuários; aquisição ainda não estruturada | Parte 2: foco 90 dias em aquisição |
| Custo descontrolado | Custo de IA por usuário | Rate-limits persistentes; gates por plano; Haiku (custo/análise ≈ R$0,05–0,15 *estimativa*) |
| Dependência de terceiros | Anthropic, fontes de vagas, Stripe, Supabase, Resend | Multi-fonte já implementado (17 fontes); risco Anthropic aceito conscientemente |
| Fundador único (bus factor) | Tudo na cabeça de 1 pessoa | Documentação no repo + memória de projeto; este plano |
| Qualidade silenciosamente quebrada | 9 varreduras acharam bugs invisíveis | Rede de detecção automática (prioridade #1) |

---

## PARTE 2 — Plano de crescimento

### 2.1 Onde estamos (base real, 05/07/2026)

- 5 usuários cadastrados · 1 assinante Pro · MRR R$39,90
- 56 análises nos últimos 30 dias (produto core sendo usado)
- Receita one-off: ~R$49,80 em créditos
- Custo fixo de infra: ~R$0 (tiers gratuitos) + domínio — *o negócio já opera acima do breakeven de caixa*
- Funil atual: landing → análise grátis → cadastro → upgrade (conversão visitante→cadastro ainda não medida)

### 2.2 Os 6 elementos essenciais do crescimento (adaptados)

1. **Cliente** — candidato brasileiro classe B/C em busca ativa, ansioso com triagem
   automática; persona secundária: profissional empregado em transição.
2. **Produto** — jornada completa (analisar → otimizar → aplicar → preparar), diferencial
   vs. concorrentes de feature única.
3. **Aquisição** — hoje: orgânico/boca a boca. Falta: SEO programático (blog está vazio),
   conteúdo, parcerias, tráfego pago experimental.
4. **Monetização** — freemium com 3 degraus + avulso. Alavanca: anual (já precificado).
5. **Operação** — serverless enxuto; gargalos conhecidos: Vercel Hobby (12 funções,
   logs 1h, PDF desativado), quotas SerpApi/JSearch.
6. **Mentalidade** — Parte 4.

### 2.3 Objetivos mensuráveis (proposta — ajustar ao apetite)

**Horizonte 90 dias (validação de aquisição):**

| Meta | Alvo | Como medir |
|---|---|---|
| Rede de detecção no ar | Invariantes + CI + Sentry | Existe e alerta |
| Usuários cadastrados | 100 | auth.users |
| Assinantes pagos | 5 | subscriptions |
| Conversão visitante→cadastro | medir baseline | GA4 |
| Publicar blog (SEO) | 8 posts | blog_posts |
| Entrevistar usuários | 10 conversas | notas |

**Horizonte 12 meses (tração):**

| Meta | Alvo *estimativa* |
|---|---|
| Usuários | 2.000 |
| Assinantes | 60 (3% dos cadastrados) |
| MRR | R$1.500–2.000 |
| Churn mensal | < 10% |
| Migrar Vercel Pro + reativar PDF | feito |

**Horizonte 24 meses (expansão):**
- Beta em espanhol (LatAm) ou pt-PT conforme análise da Parte 3.6/3.8
- B2B Hire com oferta definida se os leads de /paraempresas validarem demanda

### 2.4 Processo de planejamento (cadência)

- **Semanal (30 min):** funil da semana (cadastros, análises, upgrades), erros novos no Sentry.
- **Mensal (2h):** revisar metas 90 dias, decidir 1 aposta do mês, matar 1 coisa que não funcionou.
- **Trimestral:** revisitar este documento inteiro; frameworks da Parte 3 mudam devagar.

---

## PARTE 3 — Frameworks aplicados ao VagaAI

### 3.1 PESTEL (ambiente externo — Brasil)

| Fator | Oportunidades | Ameaças |
|---|---|---|
| **P**olítico | Programas de qualificação/emprego geram pauta | Instabilidade regulatória sobre IA |
| **E**conômico | Desemprego/rotatividade altos = demanda constante | Renda apertada do público-alvo pressiona preço |
| **S**ocial | Ansiedade com ATS cresce; busca de emprego digitalizada | Desconfiança de "ferramenta milagrosa" |
| **T**ecnológico | Custo de IA caindo (Haiku); APIs de vagas | ChatGPT genérico como substituto grátis; mudança/fechamento de APIs de fontes |
| **E**cológico | Irrelevante direto | — |
| **L**egal | LGPD já endereçada (RLS, consent, unsubscribe) | IVA/GDPR na expansão EU; termos de uso das fontes raspadas |

### 3.2 SWOT

| | Positivo | Negativo |
|---|---|---|
| **Interno** | **Forças:** jornada completa (análise+CV+carta+entrevista+alertas+rastreador) vs. feature única dos rivais; custo marginal baixíssimo; velocidade de iteração (solo+IA); 17 fontes de vaga integradas; preço acessível | **Fraquezas:** marca desconhecida; 1 fundador (bus factor); sem rede de detecção em produção; blog/SEO vazios; dependência de scrapers que quebram |
| **Externo** | **Oportunidades:** LatAm em espanhol (1 localização, mercado gigante, cultura próxima); B2B Hire; SEO programático de vagas/carreira; cultura ATS chegando ao BR | **Ameaças:** Jobscan/LinkedIn Premium descerem ao BR; ChatGPT grátis "bom o suficiente"; CAC de tráfego pago alto para B2C de ticket baixo |

**Cruzamentos que viram ação:** Força (jornada completa) × Oportunidade (SEO) →
conteúdo que demonstra a jornada. Fraqueza (detecção) × Ameaça (qualquer) →
rede de detecção antes de escalar aquisição.

### 3.3 Cinco Forças de Porter

| Força | Intensidade | Leitura |
|---|---|---|
| Rivalidade | **Média** | Jobscan/Teal/Rezi fortes em inglês, fracos em pt-BR; Catho/Gupy não fazem otimização de candidatura |
| Novos entrantes | **Alta** | Wrapper de IA é barato de construir → defesa: jornada integrada + dados de vagas + marca |
| Substitutos | **Alta (a maior ameaça)** | ChatGPT/Claude direto, grátis. Defesa: fluxo estruturado, alertas contínuos, rastreador — coisas que chat genérico não faz sozinho |
| Poder dos fornecedores | **Média-alta** | Anthropic (crítico), fontes de vagas (mitigado por 17 fontes), Stripe/Supabase (substituíveis) |
| Poder dos compradores | **Alta** | B2C ticket baixo, custo de troca zero → retenção vem de alertas + rastreador (dados acumulados) |

**Conclusão estratégica:** o fosso não é a IA — é a **jornada integrada + dados
acumulados do usuário** (histórico, alertas, rastreador). Tudo que aumenta dado
acumulado aumenta retenção.

### 3.4 Matriz BCG (portfólio de features)

| Feature | Quadrante | Decisão |
|---|---|---|
| Análise ATS (core) | ⭐ **Estrela** | Investir: é o motor de aquisição e conversão |
| Alertas de vagas | ❓→⭐ Interrogação virando estrela | Investir: é o motor de **retenção** (e-mail diário/semanal traz de volta) |
| CV otimizado + carta | 🐄 Vaca leiteira em formação | Manter: justifica o upgrade, custo baixo |
| Simulador de entrevista | ❓ Interrogação | Manter sem investir: exclusividade Pro; medir uso antes de evoluir |
| Rastreador | ❓ Interrogação | Manter: gera lock-in de dados; uso ainda baixo (1 registro) |
| B2B Hire | ❓ Interrogação | Não investir até leads validarem (só form hoje) |

### 3.5 Matriz GE/McKinsey (mercados — atratividade × força competitiva)

| Mercado | Atratividade | Força do VagaAI | Célula → ação |
|---|---|---|---|
| Brasil | Alta | Alta (idioma, fontes, preço) | **INVESTIR** — prioridade absoluta |
| LatAm (espanhol) | Alta | Média (1 localização destrava tudo) | **INVESTIR depois do PMF BR** |
| Portugal | Média (mercado pequeno) | Alta (idioma ~zero custo) | **MANTER/testar** — beachhead EUR barato |
| UK/Irlanda | Alta (cultura ATS) | Baixa (Jobscan em casa, inglês) | **MANTER em observação** |
| DE/FR/IT | Média | Baixa (localização cara, cultura de CV distinta) | **COLHER/adiar** |

### 3.6 Dimensões de Hofstede (aplicação à expansão)

Uso prático: adaptar produto/copy por cultura, não só idioma.
- **Brasil/LatAm** (alto PDI, coletivista, alta aversão à incerteza): copy de segurança
  e prova social ("X pessoas passaram da triagem"), tom acolhedor — o atual já acerta.
- **UK/NL/Nórdicos** (baixo PDI, individualista): copy direto de eficiência e dados
  ("aumente seu match score em N pontos"), menos emocional — exigiria reescrita, não tradução.
- **PT**: intermediário; o copy brasileiro funciona com ajustes lexicais.
Conclusão: reforça a rota BR → LatAm → PT antes de UK/EU continental.

### 3.7 Modelo 7S (alinhamento interno)

| S | Estado | Lacuna |
|---|---|---|
| Strategy | Freemium B2C, foco BR | ok |
| Structure | Fundador solo + IA | Bus factor — mitigar com documentação |
| Systems | Serverless, cron, Stripe, Supabase | **Falta rede de detecção** (maior lacuna) |
| Staff | 1 pessoa | Congelado até MRR justificar |
| Skills | Produto/dev fortes; marketing/vendas fracos | Lacuna nº1 de skill: aquisição |
| Style | Decisão rápida, dados > opinião | ok |
| Shared values | Honestidade com usuário, enxuto | ok |

### 3.8 Matriz Ansoff (rotas de crescimento)

| | Produtos existentes | Produtos novos |
|---|---|---|
| **Mercados existentes** | **Penetração (AGORA):** SEO, conteúdo, indicação, otimizar funil grátis→pago | **Desenvolvimento de produto (6–12m):** multi-alerta Fase 2, PDF servidor, melhorias de retenção |
| **Mercados novos** | **Desenvolvimento de mercado (12–24m):** espanhol→LatAm; pt-PT | **Diversificação (24m+):** B2B Hire como produto real — só com validação |

Regra de ouro: esgotar penetração antes de abrir mercado. Com 5 usuários, 99% do
crescimento disponível está no quadrante superior-esquerdo.

### 3.9 Cadeia de valor (adaptada a SaaS)

**Atividades primárias:**
Aquisição (landing/SEO/blog) → Ativação (análise grátis, welcome email) →
Entrega de valor (análise, CV, carta, simulador) → Retenção (alertas, rastreador,
onboarding d2/d5) → Monetização (gates, checkout, portal).

**Atividades de apoio:** infra serverless; pipeline de 17 fontes de vagas;
segurança/RLS; e-mail transacional; este planejamento.

**Elo mais fraco hoje:** Aquisição (topo do funil quase vazio).
**Elo mais forte:** Entrega de valor (produto completo e barato de operar).

---

## PARTE 4 — Mentalidade de crescimento: os 10 mandamentos do VagaAI

1. **Falarás com usuários toda semana** — 56 análises/mês são 56 pessoas com dor real; 10 conversas valem mais que 10 features.
2. **Medirás antes de opinar** — nenhuma decisão de produto sem olhar funil/GA4/banco.
3. **Não construirás o que ninguém pediu** — B2B Hire e novos mercados esperam validação.
4. **Protegerás o caixa** — infra em tier grátis até a receita pagar o upgrade; IA barata (Haiku) por padrão.
5. **Automatizarás a vigilância** — bugs silenciosos custaram semanas; detecção > varredura manual.
6. **Publicarás conteúdo semanalmente** — SEO é o único canal composto que o caixa atual permite.
7. **Venderás o degrau, não a escada** — o upgrade acontece na dor (limite atingido), não na landing.
8. **Manterás o foco no Brasil até o PMF** — expansão é recompensa, não fuga.
9. **Documentarás como se fosses ser atropelado amanhã** — bus factor de 1 exige repo autoexplicativo.
10. **Reverás este plano todo trimestre** — plano desatualizado é pior que plano nenhum.

### Exercício trimestral (do eBook, adaptado)

Responder por escrito, comparar com o trimestre anterior:
1. Qual meta dos 90 dias bati? Qual errei e por quê?
2. O que aprendi de usuários que não sabia?
3. Qual framework da Parte 3 mudou de leitura? (ex.: um substituto ficou mais forte?)
4. O que vou **parar** de fazer?

---

## Anexo — Riscos aceitos conscientemente

- Dependência da Anthropic como fornecedor único de IA (mitigação futura: abstrair provider).
- Scrapers de fontes BR podem quebrar sem aviso (mitigação: 17 fontes, monitor de invariantes).
- HIBP desabilitado no Supabase Auth (decisão de UX; revisitar com escala).
- Vercel Hobby: logs 1h e 12 funções (aceito até ~500 usuários ativos).
