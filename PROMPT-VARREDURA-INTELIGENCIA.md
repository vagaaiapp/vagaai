# Prompt — Varredura de Inteligência e Isolamento (VagaAI)

> Cole numa sessão nova, na raiz do repositório. Não pede código: pede diagnóstico com evidência.

---

## PAPEL

Você é **Principal Product Engineer + Security Engineer** auditando a VagaAI — SaaS brasileiro de
carreira que usa Claude para analisar vagas, otimizar currículos, escrever cartas, treinar
entrevistas e enviar alertas.

Duas perguntas, e cada resposta precisa de evidência em `arquivo:linha` ou em resultado de query:

> **1. PERSONALIZAÇÃO — a plataforma conhece cada profissional individualmente, ou entrega o mesmo
> produto genérico para todo mundo com o nome trocado?**
>
> **2. ISOLAMENTO — algum dado de um cliente consegue alcançar outro cliente? Por qualquer caminho:
> banco, cache, navegador, e-mail, prompt de IA, log, PDF.**

A pergunta 2 tem precedência. Um vazamento entre contas é P0 antes de qualquer discussão de produto.

## CONTEXTO (verifique, não confie)

HTML estático + funções serverless na Vercel. Sem framework, sem build.

- **Superfícies:** `index.template.html` (LP), `/login`, `/onboarding/vaga`, `/onboarding/curriculo`,
  `/criar-curriculo`, `/dashboard` (shell que carrega as outras em iframe), `/app`, `/curriculo`,
  `/cv`, `/carta`, `/entrevista`, `/admin`.
- **Backend:** `api/analyze.js`, `api/cover-letter.js`, `api/interview.js`, `api/send-alerts.js`,
  `api/fetch-job.js`, `api/generate-cv-pdf.js`, `api/cron-onboarding.js`, `api/onboarding-emails.js`,
  `api/subscription.js`, `api/webhook.js`, `api/admin.js`, `api/support.js`, `api/unsubscribe.js`.
- **Regras:** `lib/entitlements.js`, `lib/ratelimit.js`, `middleware.js`.
- **Cliente:** `js/sessao.js`, `js/cv-base.js`, `js/cv-completude.js`, `js/cv-lacunas.js`,
  `js/cv-voice.js`, `js/eventos.js`, `sidebar.js`.
- **Banco:** Supabase, projeto `kbcjchjepgejdezeuwwh`. Migrações em `migrations/` (até a 026).
- **Testes:** `tests/*.test.js` (`node --test tests/`).

**Fora do escopo.** Todo diretório `*-preview`, `*-layouts`, `*-backgrounds`, `mockup-*`, `lp-v*`,
`app-v2`, `cv-v2`, `dashboard-v2`, `output/`, `tmp/` são rascunhos não versionados. Regra prática:
**se `git ls-files` não lista, não é produto.** Se um rascunho já resolveu algo melhor que a
produção, anote numa seção à parte, sem misturar com os achados.

## REGRAS

1. Todo achado cita `arquivo:linha` ou a query que o comprova. Sem isso, o achado não existe.
2. O código é o produto; a documentação é intenção. Divergência entre os dois **é achado**.
3. Nenhuma alteração de código nesta rodada. Só os três relatórios.
4. **Nunca leia conteúdo pessoal de cliente.** Nas queries use `count(*)`, nomes de coluna,
   políticas e metadados. Nada de `select cv_text`, e-mail ou nome de pessoa real. Se precisar
   provar vazamento, prove com contagem de linhas visíveis, nunca com o conteúdo.
5. Severidade pela consequência para o usuário, não pela elegância técnica.

---

# FASE 0 — Reconhecimento (rode tudo antes de opinar)

```bash
# Superfícies reais de produção (versionadas)
git ls-files '*.html' | grep -v node_modules
git log --oneline -25

# Toda query feita com a chave de serviço (a que ignora RLS)
grep -rn "SUPABASE_SERVICE_KEY" api/ lib/ | wc -l
grep -rhoP "rest/v1/\K[a-z_]+" api/*.js | sort | uniq -c | sort -rn

# Onde o identificador do dono vem da requisição em vez do token verificado
grep -rn "req\.query\.user_id\|req\.body\.user_id\|body\.userId\|query\.email" api/

# Como cada endpoint autentica
grep -rn "getUserFromToken\|authenticateUserToken\|jwt\|Bearer \${token}" api/*.js

# Deriva de schema: tabelas que o produto usa e o repositório não versiona
mkdir -p output/auditoria
grep -rhoP "rest/v1/\K[a-z_]+" $(git ls-files '*.html' 'js/*.js') | sort -u > output/auditoria/_usadas.txt
grep -rhoiP "create table (if not exists )?(public\.)?\K[a-z_]+" migrations/*.sql | sort -u > output/auditoria/_migradas.txt
comm -23 output/auditoria/_usadas.txt output/auditoria/_migradas.txt

# Cache do navegador: chaves pessoais e páginas desprotegidas
grep -rhoP "localStorage\.(get|set|remove)Item\('\K[^']+" $(git ls-files '*.html' 'js/*.js') | sort -u
git ls-files '*.html' | xargs grep -L "js/sessao.js"

# Inteligência: onde a IA é chamada e com que instrução
grep -rn "Você é\|api.anthropic.com\|model: '" api/*.js

# Telemetria e vazamento em log
grep -rhoP "vagaaiTrack\('\K[^']+" $(git ls-files '*.html' 'js/*.js') | sort -u
grep -rn "console\.log\|console\.error" api/*.js | grep -iP "cv|curric|email|texto|prompt|body|user"

# Estado atual dos testes
node --test tests/ 2>&1 | tail -30
```

**Banco.** Use as ferramentas MCP do Supabase (`list_tables`, `list_migrations`, `list_extensions`,
`get_advisors`, `execute_sql`) no projeto `kbcjchjepgejdezeuwwh`. Comece pelo linter:
`get_advisors` com `type: "security"` e depois `type: "performance"`. Em seguida:

```sql
-- 1. RLS ligada em toda tabela pública?
select tablename, rowsecurity from pg_tables where schemaname = 'public' order by rowsecurity, tablename;

-- 2. Todas as policies, coluna a coluna
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies where schemaname = 'public' order by tablename, cmd;

-- 3. Quais tabelas têm dono e quais não têm
select table_name from information_schema.columns
where table_schema = 'public' and column_name = 'user_id' order by 1;

-- 4. Quem pode o quê, direto pela API pública
select table_name, grantee, privilege_type from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon','authenticated') order by 1, 2;

-- 5. Funções SECURITY DEFINER (rodam como dono e ignoram RLS)
select p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef order by 1;

-- 6. Índices e chaves estrangeiras em user_id (isolamento também é performance)
select tablename, indexname from pg_indexes where schemaname = 'public' and indexdef ilike '%user_id%';
```

**Teste vivo de isolamento** — simule dois clientes reais e prove que um não vê o outro.
Pegue dois UUIDs de `auth.users` (só o id, nunca e-mail) e rode, para **cada** tabela com `user_id`:

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"<UUID_A>","role":"authenticated"}';
select 'cv_saves' as tabela, count(*) as linhas_de_terceiros from cv_saves where user_id <> '<UUID_A>'
union all select 'analyses', count(*) from analyses where user_id <> '<UUID_A>'
union all select 'job_tracker', count(*) from job_tracker where user_id <> '<UUID_A>'
union all select 'cover_letters', count(*) from cover_letters where user_id <> '<UUID_A>'
union all select 'interview_sessions', count(*) from interview_sessions where user_id <> '<UUID_A>'
union all select 'job_alert_profiles', count(*) from job_alert_profiles where user_id <> '<UUID_A>'
union all select 'job_alert_history', count(*) from job_alert_history where user_id <> '<UUID_A>'
union all select 'subscriptions', count(*) from subscriptions where user_id <> '<UUID_A>';
rollback;
```

Toda linha precisa dar **0**. Qualquer número diferente de zero é P0 e vira o primeiro item do
relatório. Repita a mesma bateria para escrita, tentando `update` numa linha do outro usuário
dentro da transação — e dando `rollback` sempre. Se o MCP não aceitar transação com múltiplos
comandos, rode no SQL Editor do painel. Complete a lista com as tabelas que a Fase 0 revelar.

---

# FASE 1 — Isolamento: dez vetores de cruzamento

Um dado de cliente cruza para outro por dez caminhos. Percorra todos, e para cada um conclua
**BLOQUEADO / PARCIAL / ABERTO** com a evidência.

**V1 — RLS.** Toda tabela com `user_id` tem RLS ligada e policy por `auth.uid()`, em `select`,
`insert`, `update` e `delete`? Tabelas sem `user_id` (`analysis_cache`, `job_alert_cache`,
`ip_rate_limits`, `blog_posts`, `email_*`) são legíveis por `anon` ou `authenticated`? Uma tabela
sem dono e com grant de leitura é uma tabela pública.

**V2 — Chave de serviço.** Todo endpoint em `api/` usa `SUPABASE_SERVICE_KEY`, que **ignora RLS por
definição**. Então a única proteção é a aplicação. Monte a tabela completa:

| arquivo:linha | tabela | filtro `user_id` presente? | o id vem do JWT verificado ou da requisição? |
|---|---|---|---|

Qualquer linha em que o identificador venha de `req.query`, `req.body` ou de e-mail sem conferência
contra o token é IDOR — o cliente A pede os dados do cliente B. Confira em particular o modo manual
de `api/send-alerts.js` (que recebe `user_id` por query string), `api/admin.js`, `api/support.js`,
`api/unsubscribe.js` e `api/generate-cv-pdf.js`.

**V3 — Cache compartilhado.** `analysis_cache` é global, chaveado por hash de conteúdo, sem
`user_id` (`api/analyze.js`, funções `getCachedResult` / `setCachedResult` / `contentHash`).
Responda com o código na mão: o hash inclui o currículo inteiro ou só a vaga? Qual algoritmo, quantos
bits, truncado? Duas pessoas diferentes conseguem colidir? O que exatamente volta do cache — só o
score, ou também texto derivado do currículo de quem gerou primeiro? Mesma investigação para
`job_alert_cache`. **Cache sem dono é o vetor mais silencioso que existe: não gera erro, só entrega
a resposta errada para a pessoa errada.**

**V4 — Navegador.** `js/sessao.js` existe justamente para isso: `adotar(userId)` apaga o cache
pessoal quando outra conta entra no mesmo computador. Verifique a cobertura — hoje o script é
carregado em `/app`, `/carta`, `/curriculo`, `/cv`, `/dashboard` e `/entrevista`, mas **não** em
`/onboarding/vaga`, `/onboarding/curriculo`, `/criar-curriculo` e `/login`, que gravam e leem
`vagaai_cv`, `vagaai_last_cv`, `vagaai_last_job` e `vagaai_pending_result`. Confirme, meça a
consequência (quem entra pelo onboarding num computador compartilhado encontra o quê?) e cheque
também: a lista `PESSOAIS` cobre todas as chaves que a Fase 0 listou? `adotar()` roda antes do
primeiro `getItem` da página? Existe `sessionStorage`, cookie ou IndexedDB fora dessa proteção?

**V5 — Prompt de IA.** Em cada chamada a `api.anthropic.com`, o contexto montado contém **apenas**
dado do usuário autenticado? Procure: histórico reaproveitado, exemplos hardcoded com dado real,
resultado de cache, variável construída fora do escopo da requisição. Cheque também estado em escopo
de módulo em qualquer arquivo de `api/` — funções serverless são reaproveitadas entre invocações, e
uma variável fora do handler sobrevive de um cliente para o próximo.

**V6 — E-mail.** Em `api/send-alerts.js`, `api/cron-onboarding.js` e `api/onboarding-emails.js`:
o destinatário e o conteúdo saem sempre do mesmo `user_id`, dentro do mesmo laço? Uma variável de
laço reaproveitada aqui manda o relatório de carreira de uma pessoa para o e-mail de outra. Verifique
ainda o token de descadastro (`api/unsubscribe.js`, `UNSUBSCRIBE_SECRET`): é derivado por usuário e
não adivinhável? E o pixel de rastreio (`api/_lib/email-tracking.js`) carrega identificador que um
terceiro consegue enumerar?

**V7 — Admin.** Quem entra em `/admin` e `api/admin.js`, como isso é verificado no servidor (não no
cliente), o que fica visível, e se há registro de quem olhou o quê.

**V8 — Log e telemetria.** `console.log` com currículo, e-mail, texto de vaga ou prompt vai parar no
log da Vercel e vira dado pessoal fora do banco. `js/eventos.js` já filtra chaves proibidas —
confirme se a lista `PROIBIDOS` cobre tudo que as páginas passam de fato, e se algum evento manda
texto livre.

**V9 — Arquivo e PDF.** `api/generate-cv-pdf.js` e a foto de perfil: a URL é adivinhável? Exige
autenticação? Expira? Um PDF de currículo com URL sequencial é um vazamento em massa.

**V10 — Deriva de schema.** A saída do `comm` na Fase 0 mostra tabelas que o produto usa e o
repositório não versiona. Para cada uma: quando foi criada, tem RLS, tem dono, quem pode ler.
**Tabela criada pelo painel é tabela que ninguém revisou.**

Feche a fase com um **Placar de Isolamento**: os dez vetores, o veredito de cada um, e a frase que
você assinaria — "os dados de um cliente [não] podem alcançar outro cliente, porque…".

---

# FASE 2 — O Perfil Canônico: a plataforma conhece essa pessoa?

Personalização não é usar o primeiro nome. É o produto ter **um** modelo do profissional e todas as
telas lerem dele e escreverem nele.

Monte a tabela de tudo que a plataforma aprende sobre alguém — currículo mestre, lacunas,
completude, raio-X do perfil, cargo-alvo, senioridade, área, pretensão, localização, modelo de
trabalho, vagas analisadas, scores, requisitos ausentes recorrentes, cartas geradas, treinos feitos,
candidaturas e desfechos, filtros de alerta, plano, créditos:

| O que sabemos | Onde nasce (arquivo:linha) | Onde mora (tabela.coluna) | Quem lê depois | Onde deveria ser lido e não é |
|---|---|---|---|---|

A última coluna é o diagnóstico. **Dado que nasce e morre no mesmo lugar é personalização
prometida e não entregue.** Responda com código, não com impressão:

- A carta usa os requisitos ausentes que a análise daquela mesma vaga já identificou?
- O treino de entrevista pergunta sobre as lacunas reais daquele currículo, ou sobre o cargo em geral?
- O alerta ranqueia usando o currículo e o histórico, ou só os filtros digitados?
- Otimizar o currículo para uma vaga ensina alguma coisa ao currículo mestre?
- O dashboard sabe o que aconteceu com as candidaturas, ou só as lista?
- Existe **uma** fonte de verdade do perfil, ou cada tela remonta a sua a partir de `cv_saves`?

**Teste das 10 Perguntas.** Para cada uma: SIM / PARCIAL / NÃO, com evidência. O produto responde
hoje, sem a pessoa redigitar nada?

1. Qual é a minha lacuna recorrente entre todas as vagas que analisei?
2. Meu currículo melhorou desde que entrei?
3. Para que tipo de vaga eu tenho mais chance?
4. O que eu devo fazer agora, especificamente?
5. Por que essa vaga do alerta apareceu para mim?
6. Quantas candidaturas enviei e o que voltou?
7. Essa carta usa o que o produto já sabe sobre essa vaga e sobre mim?
8. No treino, o que eu preciso praticar por causa do MEU histórico?
9. O que muda de fato se eu assinar?
10. Onde eu parei da última vez?

E o **teste dos dois gêmeos**: dois profissionais com o mesmo cargo-alvo e currículos diferentes
percorrem o produto. Em quantos pontos a experiência diverge de fato? Se a resposta for "no texto
gerado pela IA e em mais nada", a plataforma não é personalizada — é uma interface genérica com um
gerador de texto no fim.

---

# FASE 3 — Jornadas ponta a ponta

Percorra o código na ordem em que a pessoa usa. Para cada passo: **o que a tela promete → o que o
backend faz → o que ela leva embora → o próximo passo (existe? está visível?)**.

- **J1 — Sem currículo:** LP → cadastro → onboarding → primeira análise. Quanto ela digita antes de
  receber algo de valor?
- **J2 — Com currículo pronto:** upload → análise → otimização → candidatura. O produto reaproveita
  o que ela trouxe ou pede de novo?
- **J3 — Recorrente:** 1 vaga analisada, aderência baixa, requisitos ausentes, zero candidaturas.
  Abre o dashboard. **O que o produto manda fazer, e essa é a ordem que mais aumenta a chance dela
  ser chamada?**
- **J4 — Batendo no limite do plano:** onde o limite aparece, com que palavras, e se o upgrade
  chega no pico de valor percebido ou no pico de frustração.
- **J5 — Volta depois de 7 dias:** retoma o contexto ou recomeça do zero? O e-mail
  (`api/cron-onboarding.js`) e o app contam a mesma história?
- **J6 — Computador compartilhado:** a pessoa B entra depois da A, pelo onboarding. O que B vê?
  (Cruze com V4 — aqui a falha de isolamento vira experiência concreta.)

Aponte em cada jornada os **becos sem saída**, os **loops** e as **regressões** (perda de trabalho
já feito).

---

# FASE 4 — Varredura por dimensão

**A. Coerência de estado.** Fonte de verdade duplicada; mesmo dado com nomes diferentes entre
tabela e tela; escrita em `localStorage` que o servidor ignora; iframe do dashboard discordando da
página filha; plano e crédito calculados em mais de um lugar (`lib/entitlements.js` × cliente × SQL).

**B. Comunicação.** Item de menu × título da página × texto do botão × assunto do e-mail × copy da
LP. Confira em particular se `sidebar.js` e a navegação embutida em `dashboard/index.html` usam o
mesmo vocabulário — historicamente divergiram. Entregue um **glossário canônico**: termo oficial →
onde diverge.

**C. Funcionalidade.** Botão que não leva a nada; estado vazio sem saída; erro que só faz
`console.log`; capacidade que existe no backend e nunca é oferecida; promessa na interface que o
backend não sustenta; o que quebra sem currículo, sem vaga, sem plano, offline ou com PDF ilegível.

**D. Inteligência aplicada.** O que vai em cada prompt e o que **poderia ir e não vai**. Cada saída
é acionável ou é texto bonito? O modelo é o certo para a tarefa? Onde há regra fixa que deveria ser
inteligência, e onde há IA cara fazendo o trabalho de um `if`.

**E. Resultado.** O produto entrega **artefato** (currículo pronto, carta pronta, lista de vagas) ou
**diagnóstico** (um número e uma lista de problemas)? Aderência baixa com requisitos ausentes: o
produto ensina a cobrir, ou só informa que faltam?

**F. Medição.** Cruze os eventos de `js/eventos.js` com as jornadas da Fase 3: que passo crítico não
emite evento? Passo sem evento é passo invisível — nenhuma decisão futura sobre ele terá dado.

**G. Negócio.** `lib/entitlements.js` × o que a LP promete × o que o app bloqueia. O Free entrega
valor suficiente antes do pagamento? O Pro se justifica em uma frase? Todo bloqueio explica o
benefício ou só nega o acesso?

---

# FASE 5 — Diagnóstico

1. **Veredito de isolamento.** Vazou ou não vazou. Se vazou, isso abre o relatório com o passo a
   passo da correção.
2. **A tese em um parágrafo.** Qual o defeito estrutural da VagaAI hoje? Um só — aquele que, se
   corrigido, faz os outros vinte encolherem.
3. **Ranking.** Todos os achados por impacto no resultado do usuário dividido pelo esforço.
4. **Os 5 movimentos.** Cinco mudanças que transformam ferramentas soltas num produto que conhece a
   pessoa. Para cada uma: o que muda na primeira pessoa ("agora eu consigo…"), arquivos tocados,
   esforço em dias, e o evento que provaria que funcionou.
5. **O que NÃO fazer.** O que parece problema e não é; e o que valeria a pena remover para o produto
   ficar mais claro.

---

## FORMATO DOS ACHADOS

```
### [ID] Título direto — o defeito, não o sintoma
Dimensão: V1–V10 / A–G   |   Severidade: P0/P1/P2/P3   |   Esforço: XS/S/M/L
Evidência: api/arquivo.js:123  (ou: query da Fase 0, resultado X)
O que acontece: fato observado, sem adjetivo
O que o usuário sente: uma frase, na voz dele
Correção: a menor mudança que resolve de verdade
```

**P0** = dado de um cliente alcança outro, o produto mente, ou perde trabalho da pessoa.
**P1** = ela consegue, mas redigita algo que o produto já tem. **P2** = fricção perceptível.
**P3** = polimento.

## ENTREGÁVEIS

- `output/auditoria/01-isolamento.md` — Fases 0 e 1, Placar de Isolamento, queries e resultados
- `output/auditoria/02-perfil-e-jornadas.md` — Fases 2 e 3
- `output/auditoria/03-diagnostico.md` — Fases 4 e 5 + glossário canônico

## CRITÉRIO

Fracassa se: repetir o que o código diz sem julgar; usar "melhorar a UX", "otimizar" ou qualquer
verbo sem objeto; listar achado sem evidência; tratar preferência estética como defeito; ou entregar
sessenta achados sem hierarquia.

Acerta se, ao ler o veredito de isolamento e os cinco movimentos, o dono do produto souber
exatamente o que abrir amanhã de manhã — e por quê.
