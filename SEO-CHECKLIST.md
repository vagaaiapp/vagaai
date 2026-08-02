# SEO Checklist — VagaAI 100% Impecável

## ✅ STATUS ATUAL (02/08/2026)

**O que já está CORRETO:**
- ✅ robots.txt correto (permite crawling, bloqueia /api e /admin)
- ✅ Sitemap dinâmico funcionando (processa novos posts automaticamente)
- ✅ Google Search Console verificado e integrado
- ✅ Home e /app solicitadas para indexação
- ✅ Canonical tags corretos (evita conteúdo duplicado)
- ✅ Meta descriptions preenchidas (home, blog, paraempresas, etc.)
- ✅ Open Graph tags (og:title, og:description, og:image) — social sharing
- ✅ Mobile viewport configurado (responsivo)
- ✅ HTTPS + HSTS (segurança + ranking)
- ✅ Schema.org (Organization + Article para posts)
- ✅ Middleware SSR (home + posts já renderizados no servidor — critical pra blogs)

---

## 📋 O QUE FAZER PARA MANTER 100%

### **1. MONITORAMENTO MENSAL (15 minutos/mês)**

**Google Search Console:**
- [ ] Verificar "Páginas" → quantas estão indexadas vs excluídas
- [ ] Se alguma foi excluída, investigar o motivo
- [ ] Revisar "Erros de rastreamento" (deve estar zerado)
- [ ] Desempenho → ver quais palavras-chave trazem tráfego

**Google Analytics 4:**
- [ ] Organic traffic trend (deve estar crescendo)
- [ ] Top landing pages from organic
- [ ] Bounce rate (ideal <50% pra landing pages)

### **2. BLOG — CHECKLIST POR POST (quando publicar)**

Cada novo post precisa ter:

```md
✅ Título único e descritivo (50-60 caracteres)
   Bom: "Como Otimizar Currículo para ATS: Guia Completo 2026"
   Ruim: "Dicas de Currículo"

✅ Meta description (150-160 caracteres)
   Deve estar no Supabase.blog_posts.excerpt

✅ Slug em português (sem acentos)
   transicao-de-carreira-como-mudar-de-area ✅
   transição-de-carreira ❌

✅ Cover image (1200x630px recomendado)
   Ativa Open Graph (og:image) — mostra preview no compartilhamento

✅ Categorias preenchidas (ex: "Currículo", "Entrevista")
   Vai aparecer no card do blog

✅ Conteúdo com headers H2/H3 (estrutura)
   Google entende melhor

✅ Pelo menos 1 link interno (pra /app ou /paraempresas)
   Aumenta engajamento + SEO

✅ CTA no final (call-to-action)
   "Teste o VagaAI gratuitamente" — já está no middleware
```

**Depois de publicar:**
- [ ] Voltar no Google Search Console → "Inspeção de URL"
- [ ] Colar a URL do post: `https://www.vagaai.app.br/blog/post?s=seu-slug`
- [ ] Clicar "Solicitar Indexação"
- [ ] Compartilhar no LinkedIn/Twitter pra acelerar crawl

### **3. PERFORMANCE — CORE WEB VITALS**

Verificar a cada trimestre em [PageSpeed Insights](https://pagespeed.web.dev):

```
Bom:
- Largest Contentful Paint (LCP): <2.5s ✅
- First Input Delay (FID): <100ms
- Cumulative Layout Shift (CLS): <0.1

Seu site atual: provavelmente 80+ (Vercel + Edge Middleware = rápido)
```

Se cair, checá:
- Imagens otimizadas (usar WebP, lazy loading)
- Cache headers corretos (já está em vercel.json)
- JavaScript desnecessário (buscar no console errors)

### **4. TECHNICAL SEO — ANUALMENTE**

- [ ] Verificar 404s no Search Console → não deve ter
- [ ] Revisar canonical tags em todas as páginas principais
- [ ] Testar redirect de `vagaai.app.br` → `www.vagaai.app.br` (já funciona 307)
- [ ] Checar hreflang se tiver versões em outro idioma (não aplica agora)
- [ ] Verificar XML sitemap (deve ter <50k URLs — vocês têm ~10)

### **5. CONTENT — PARA TRAZER TRÁFEGO ORGÂNICO**

**Keywords pra explorar (baseado no seu produto):**

| Intenção | Palavra-chave | Dificuldade | Oportunidade |
|---|---|---|---|
| Informativo | "o que é ATS" | Baixa | Trazer gente curiosa |
| Informativo | "como otimizar currículo para ATS" | Média | Post de referência |
| Informativo | "transição de carreira" | Alta | Já têm! |
| Transacional | "analisador de currículo" | Alta | Difícil ranquear |
| Transacional | "compatibilidade vaga currículo" | Média | Oportunidade! |

**Estratégia:**
1. Comece com 1-2 posts/mês sobre **problemas** (informativo)
2. Rankear em palavra-chave de baixa concorrência
3. Depois linkar pra /app dentro do post
4. Posts viram "ímã" de tráfego pra converter

**Exemplo:**
- Usuário busca "como passar no ATS"
- Encontra seu post no blog
- Lê, aprende, confia em você
- Clica "Teste o VagaAI" no final do post
- Converte ✓

### **6. LINKS INTERNOS — ESTRUTURA**

Seu site já tem links:
- Home → /app (botão principal) ✅
- Home → /blog ✅
- Blog → posts individuais ✅
- Cada post → /app (CTA final) ✅

**Adicionar pra melhorar:**
- [ ] Link "Voltar ao blog" nos posts individuais
- [ ] Sidebar "Posts relacionados" no blog
- [ ] /app → link pra blog ("Dicas ATS" lado a lado com analisador)

### **7. BACKLINKS — FORA DO SEU CONTROLE, MAS...**

Você não controla, mas pode incentivar:
- Mencionar VagaAI em comunidades (Reddit, LinkedIn, Discord)
- Pedir reviews de usuários (eles linkam pro site naturalmente)
- Conteúdo tão bom que outras pessoas linkam

**NÃO FAZER:**
- ❌ Comprar backlinks
- ❌ Comentar spam em outros blogs
- ❌ Trocar links artificialmente

---

## 🚀 ROADMAP SEO — PRÓXIMOS 3 MESES

### Mês 1 (Agosto):
- ✅ Sitemap corrigido (já feito)
- ✅ Home indexada (já solicitada)
- Publicar 2 posts de blog (palavras-chave baixa dificuldade)
- Configurar Google Analytics 4 (se não tiver)

### Mês 2 (Setembro):
- Monitorar primeiros 50-100 users do Google Search
- Publicar 2 posts
- Revisar Google Search Console → palavras-chave com impressões mas sem cliques (otimizar titles)

### Mês 3 (Outubro):
- Meta: 500+ impressões/mês do Google
- Meta: 20-30 cliques/mês
- Publicar 2-3 posts
- Começar a rankear em "como otimizar currículo"

---

## 🔴 RED FLAGS — SE ALGO CAIR, INVESTIGAR LOGO

| Sinal | Causa | Ação |
|---|---|---|
| 0 indexadas no GSC | Bloqueio no robots.txt ou DNS | Verificar robots.txt, re-verificar domínio |
| Queda de tráfego 50%+ | Penalidade manual ou core update | Verificar GSC "Manual actions", revisar qualidade |
| 404s em massa | URL mudou, redirect quebrou | Verificar vercel.json rewrites, testar URLs |
| Slow Core Web Vitals | Imagens grandes, JS pesado | Comprimir imagens, defer JS, usar CDN |
| Posts não indexados | Middleware caindo, Supabase down | Checar logs Vercel, testar sitemap.xml |

---

## 📊 MÉTRICAS QUE IMPORTAM

**Acompanhar mensalmente:**
- Sessions orgânicas (Google Analytics)
- Impressões no Google (Search Console)
- CTR (Click-Through Rate) — ideal 3-5%
- Posição média das keywords (Search Console)
- Bounce rate dos landing pages

**Acompanhar trimestralmente:**
- Core Web Vitals (PageSpeed)
- Backlinks novos (Semrush free tier)
- Ranking keywords (qual está em top 10, 50, 100)

---

## 💡 DICAS PRÁTICAS

**✅ DO's:**
- Publicar blog regularmente (1-2x/mês mínimo)
- Usar palavras-chave naturalmente no texto
- Link pra /app dentro dos posts
- Responder comentários (engajamento = sinal de qualidade)
- Mobile-first (a maioria dos usuários vem de celular)

**❌ DON'Ts:**
- Não fazer redirecionais em cascata (A→B→C, só A→C)
- Não duplicar conteúdo (mesma página com URLs diferentes)
- Não linkar pra spam (afeta credibilidade)
- Não esconder keywords (stuffing) — Google penaliza
- Não mudar URL de página indexada sem redirect 301

---

## 📞 PROXIMOS PASSOS

1. **Hoje:** Volta no GSC e vê se o erro do sitemap desapareceu
2. **Esta semana:** Publicar primeiro post de blog
3. **Próximo mês:** Monitorar tráfego no Analytics
4. **Mensal:** Revisar GSC + Analytics (15 min)

Qualquer dúvida sobre SEO específico, avisa.
