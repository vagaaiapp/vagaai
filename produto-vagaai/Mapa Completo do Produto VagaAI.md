# Mapa Completo do Produto VagaAI

Funcionalidades, logica de funcionamento, beneficios, gaps e caminhos de evolucao

## Sumario executivo
O VagaAI deve ser entendido como um sistema de candidatura: uma plataforma que conecta vaga, curriculo, candidatura, alerta, carta e entrevista em uma jornada unica.

## Resumo executivo — O VagaAI nao e apenas um gerador de curriculo. E um sistema de candidatura.
O VagaAI organiza a busca por emprego em uma jornada unica: encontrar oportunidades, entender aderencia, adaptar o curriculo, acompanhar candidaturas, preparar entrevista e gerar materiais de apoio.
A promessa mais forte da marca deve ser clara e realista: ajudar o profissional a tomar decisoes melhores e enviar candidaturas mais fortes, sem prometer contratacao.
O produto atual ja tem uma base poderosa. O maior desafio agora e transformar muitas funcionalidades boas em uma experiencia mais conectada, confiavel, mensuravel e facil de entender.
- Tese central: clareza antes de aplicar, materiais melhores antes de enviar, acompanhamento depois da candidatura.
- Maior oportunidade: posicionar o VagaAI como sistema operacional da busca por emprego.
- Maior risco: excesso de funcionalidades parecer fragmentado se cada fluxo nao conversar com os demais.
- Prioridade: confiabilidade, plano/creditos, alertas, rastreador, mobile e metricas de ativacao.

## Contexto de mercado — A busca por emprego ficou mais digital, mais competitiva e mais opaca para o candidato.
O candidato moderno vive uma contradicao: ha mais canais para encontrar vagas, mas tambem mais ruido, mais filtros automatizados e menos clareza sobre o que realmente aumenta suas chances.
Relatorios de recrutamento e empregabilidade reforcam a digitalizacao do processo seletivo, o uso crescente de tecnologia na triagem e a necessidade de profissionais se posicionarem com mais precisao.
Nesse contexto, o VagaAI deve se vender como um copiloto de decisao: ele nao substitui a experiencia real do candidato, mas ajuda essa experiencia a aparecer melhor para a vaga certa.
- O mercado premia candidaturas especificas, nao curriculos genericos enviados em massa.
- O usuario precisa saber se vale a pena aplicar antes de gastar tempo.
- A dor principal nao e somente desemprego: e falta de retorno, falta de clareza e falta de preparacao.
- Fontes de contexto: IBGE, LinkedIn Future of Recruiting, Gupy e Indeed Hiring Lab.

## Produto atual — Mapa das funcionalidades existentes
O produto cobre praticamente toda a jornada de uma candidatura: diagnostico, materiais, rastreamento, alerta e preparo. Isso e raro em ferramentas de curriculo, que normalmente param no documento.
Abaixo esta o mapa funcional do VagaAI com a logica de cada modulo e o valor percebido para o cliente.
### Analise de vaga + CV
Recebe vaga e curriculo, calcula score, identifica lacunas, keywords presentes/ausentes, briefing e prioridades.
**Valor:** Evita candidatura no escuro e mostra onde melhorar antes de enviar.
### Curriculo otimizado
Gera uma versao direcionada para a vaga, com foco ATS, templates, edicao e exportacao em PDF.
**Valor:** Entrega um material mais especifico e profissional sem inventar experiencia.
### Rastreador de candidaturas
Organiza vagas analisadas, status, salario, link, proximas acoes, entrevista e historico.
**Valor:** Reduz perda de contexto e transforma candidatura em processo acompanhado.
### Alertas de vagas
Monitora oportunidades com base em cargo, local, salario, senioridade e keywords.
**Valor:** Traz vagas alinhadas para o usuario em vez dele buscar tudo manualmente.
### Simulador de entrevista
Gera perguntas com base na vaga e no CV, avalia respostas e pode aceitar audio.
**Valor:** Prepara o usuario para destacar o que importa naquela oportunidade.
### Carta de apresentacao
Gera carta personalizada por tom e por vaga usando o curriculo do usuario.
**Valor:** Ajuda em processos que pedem mensagem, e-mail ou apresentacao mais humana.
### Dashboard inteligente
Mostra proxima melhor acao, prioridades, oportunidades, funil e avisos.
**Valor:** Transforma dados em direcao pratica.
### Planos e pagamentos
Free, Starter, Pro e creditos avulsos com Stripe, webhook e regras de uso.
**Valor:** Cria caminhos de monetizacao flexiveis e progressivos.

## Logica de funcionamento — A arquitetura de valor deve manter contexto entre todos os modulos.
O ponto mais importante do VagaAI e preservar contexto. Quando o usuario analisa uma vaga, essa vaga deve alimentar automaticamente curriculo, carta, entrevista, candidatura e alertas futuros.
O produto fica mais forte quando cada acao gera a proxima acao sem friccao. Exemplo: analisou a vaga -> recebeu score -> gerou CV otimizado -> marcou candidatura -> treinou entrevista -> recebeu follow-up.
- Entrada principal: descricao/link da vaga + curriculo.
- Processamento: analise de aderencia, extracao de requisitos, keywords, score e briefing.
- Saidas: diagnostico, CV otimizado, carta, perguntas de entrevista e card de candidatura.
- Retencao: alertas, rastreador, proximas acoes, historico e e-mails.
- Monetizacao: limites por plano, recursos premium e upgrade contextual.

## Beneficios por perfil — O mesmo produto resolve dores diferentes para publicos diferentes.
A comunicacao deve mudar conforme o momento do usuario. Quem esta desempregado quer velocidade e clareza. Quem esta empregado e quer trocar de cargo quer estrategia e discricao. Quem esta mudando de area quer saber onde esta o gap real.
### Profissional buscando recolocacao
Reduz tentativa e erro, prioriza vagas melhores e organiza candidatura.
**Valor:** Mensagem: pare de enviar no escuro.
### Profissional empregado querendo trocar
Ajuda a escolher oportunidades com mais criterio e preparar materiais fortes.
**Valor:** Mensagem: troque com estrategia, nao por impulso.
### Junior ou inicio de carreira
Mostra lacunas, estrutura melhor o CV e prepara para entrevistas.
**Valor:** Mensagem: transforme pouca experiencia em clareza e potencial.
### Transicao de carreira
Compara experiencia atual com requisitos da nova area.
**Valor:** Mensagem: entenda o que reaproveitar e o que precisa reforcar.
### Profissionais de marketing, negocios e tech
Beneficiam-se de keywords, metricas, portfolio verbal e adaptacao por vaga.
**Valor:** Mensagem: mostre resultado, contexto e aderencia.

## Gaps atuais — O produto esta rico, mas precisa reduzir friccao, inconsistencias e pontos cegos.
Os gaps abaixo nao diminuem o potencial do VagaAI. Eles mostram onde o produto precisa amadurecer para vender com mais seguranca e reter melhor.
| Area | Gap / indicador | Solucao recomendada |
|---|---|---|
| Conexao entre fluxos | Alguns caminhos ainda podem pedir dados que o sistema ja conhece. | Preservar contexto por analysis_id/job_id entre app, CV, carta, entrevista e candidaturas. |
| Alertas | Dependem de fontes externas, filtros e cron. Podem parecer inconsistentes se nao houver historico claro. | Criar diagnostico de fontes, historico persistente e explicacao quando nao houver vaga. |
| Planos e creditos | UI pode mostrar ilimitado enquanto backend bloqueia se houver divergencia. | Ter uma fonte unica de verdade e teste automatizado de entitlements. |
| Exportacao de CV | PDF/A4, margens, quebras e modelos precisam ser impecaveis. | Padronizar motor de PDF server-side ou workflow controlado com preflight. |
| Mobile | Produto e denso; precisa bottom nav, menus e cards compactos. | Tratar mobile como jornada prioritaria, nao so adaptacao visual. |
| Observabilidade | Bugs de cron, API, Stripe e Supabase precisam ser detectados antes do usuario. | Adicionar logs estruturados, alertas internos e painel de saude. |
| Onboarding | Usuario pode nao entender o fluxo completo logo no primeiro uso. | Criar trilha guiada: analise -> CV -> candidatura -> entrevista. |
| Prova e confianca | Mercado sensivel a promessas exageradas. | Mostrar limites honestos, exemplos reais, privacidade e antes/depois. |

## Roadmap realista — Caminho de evolucao dentro da realidade atual
A evolucao recomendada prioriza confiabilidade e ativacao antes de escalar aquisicao. O produto ja tem muitas alavancas; o proximo passo e fazer cada uma funcionar de forma previsivel.
- **0-30 dias:** Estabilizar planos/creditos, alertas, PDF, mobile, links quebrados, tracking e metricas basicas de funil.
- **31-60 dias:** Criar jornada guiada e e-mails de ativacao: primeira analise, baixar CV, rastrear candidatura, simular entrevista.
- **61-90 dias:** Transformar alertas e rastreador em motor de retencao: resumo semanal, proximas acoes, follow-up e reativacao.
- **3-6 meses:** Melhorar motor de vagas, fontes, qualidade dos alertas, PWA/mobile e painel de saude operacional.
- **6-12 meses:** Explorar B2B leve: universidades, mentorias, outplacement, escolas e comunidades profissionais.

## Projetos fora da caixa — Ideias que podem mudar o jogo se forem bem executadas
Essas apostas nao devem ser todas feitas agora. Elas funcionam como direcao de longo prazo para transformar o VagaAI de ferramenta em ecossistema.
### Extensao de navegador
Botao em LinkedIn, Gupy, Indeed e sites de vaga: 'Analisar com VagaAI' direto na pagina.
**Valor:** Alto potencial de aquisicao e uso recorrente.
### Candidatura Pack
Um clique gera: score, CV otimizado, carta, perguntas de entrevista e card no rastreador.
**Valor:** Transforma o produto em fluxo magico, mas sem prometer emprego.
### Relatorio semanal de carreira
Resumo por e-mail/WhatsApp: vagas boas, candidaturas paradas, entrevistas proximas, score medio.
**Valor:** Retencao forte e alto valor percebido.
### Mapa de aderencia de mercado
Mostra quais cargos combinam mais com o perfil atual e quais skills destravam novas vagas.
**Valor:** Ajuda usuario a decidir carreira, nao so candidatura.
### Treino de entrevista por voz
Simulacao falada, feedback de clareza, estrutura, exemplos e postura.
**Valor:** Diferenciacao premium para plano Pro.
### Copiloto no WhatsApp
Alertas, lembretes e proximas acoes por conversa.
**Valor:** Canal natural no Brasil, mas exige cuidado operacional.
### Benchmark anonimo
Comparar score e gaps com perfis similares, sem expor dados pessoais.
**Valor:** Aumenta urgencia e clareza, com privacidade.
### Outplacement/educacao
Versao para escolas, cursos, mentorias e empresas que recolocam profissionais.
**Valor:** Novo canal B2B com ticket maior.

## Metricas essenciais — O que medir para saber se o produto esta funcionando
Sem metricas, o VagaAI pode parecer cheio de recursos sem provar quais geram valor. O foco deve ser ativacao, retencao e conversao por momento da jornada.
| Area | Gap / indicador | Solucao recomendada |
|---|---|---|
| Ativacao | Primeira analise concluida | Mostra se o usuario chegou ao primeiro valor. |
| Aha moment | CV otimizado baixado ou candidatura rastreada | Indica que o usuario transformou diagnostico em acao. |
| Retencao | Retorno por alerta, dashboard ou candidatura | Mostra se o produto virou rotina. |
| Conversao | Free -> Starter/Pro; limite atingido -> upgrade | Mostra monetizacao contextual. |
| Qualidade | Taxa de alerta analisado, vaga salva, CV baixado, entrevista iniciada | Mostra se os modulos estao conectados. |
| Confiabilidade | Falhas de API, webhook, cron, PDF, Supabase e Stripe | Mostra se o produto esta pronto para escala. |

## Planos e proposta comercial — Cada plano precisa comunicar um nivel de maturidade na busca por emprego.
A diferenca entre planos deve ser apresentada como progressao natural, nao como bloqueio agressivo.
### Free
Testar valor rapidamente: uma analise, alertas basicos e entrada no rastreador.
**Valor:** Mensagem: entenda se o VagaAI faz sentido para voce.
### Starter
Uso recorrente moderado: mais analises, CV otimizado, cartas e alertas melhores.
**Valor:** Mensagem: comece a aplicar com mais criterio.
### Pro
Sistema completo de candidatura: analises amplas, simulador, alertas diarios e recursos avancados.
**Valor:** Mensagem: organize sua busca como um processo profissional.
### Creditos avulsos
Compra pontual para quem nao quer assinar.
**Valor:** Mensagem: use quando precisar, sem compromisso.

## Recomendacoes finais — O proximo salto nao e adicionar mais uma funcionalidade. E conectar melhor as que ja existem.
O VagaAI tem um caminho forte: virar o sistema onde o profissional entende, prepara, envia e acompanha cada oportunidade.
A evolucao mais inteligente agora e transformar o produto em uma jornada inevitavel: cada tela precisa responder 'qual e a proxima melhor acao para este usuario?'.
- Reforcar o posicionamento: sistema de candidatura, nao ferramenta isolada.
- Fazer toda vaga analisada nascer automaticamente em Candidaturas.
- Transformar Alertas + Rastreador no motor de retencao.
- Conectar entrevista e carta diretamente a cada candidatura.
- Aprimorar PDF, mobile e confiabilidade antes de aumentar muito a aquisicao.
- Criar comunicacao honesta: nao garante emprego; aumenta clareza, preparo e qualidade da candidatura.
- Medir cada etapa da jornada para saber onde o usuario trava.

## Fontes
- [IBGE - Desemprego](https://www.ibge.gov.br/explica/desemprego.php)
- [LinkedIn - Future of Recruiting](https://business.linkedin.com/hire/resources/future-of-recruiting)
- [Gupy - Empregabilidade 2026](https://conteudos.gupy.io/materiais/relatorio/empregabilidade-2026)
- [Indeed Hiring Lab](https://www.hiringlab.org/)