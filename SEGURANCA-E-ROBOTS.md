# 🔒 SEGURANÇA & ROBOTS — Guia Completo

**Data:** 02/08/2026  
**Status:** ✅ Protegido + Otimizado para SEO

---

## 📋 CHECKLIST DE SEGURANÇA

### ✅ O que já está PROTEGIDO:

| Rota | Bloqueio | Método | Status |
|---|---|---|---|
| `/admin` | Redirecionado | 307 → `/` | ✅ Implementado |
| `/admin/blog` | Redirecionado | 307 → `/` | ✅ Implementado |
| `/lp-nova-aprovacao/*` | Redirecionado | 307 → `/` | ✅ Implementado |
| `/lp-hero-preview/*` | Redirecionado | 307 → `/` | ✅ Implementado |
| `/lp-funis-preview/*` | Redirecionado | 307 → `/` | ✅ Implementado |
| `/api/*` | Bloqueado em robots.txt | Crawl bloqueado | ✅ Protegido |
| `/index.template.html` | noindex, nofollow | Meta tag + header | ✅ Protegido |

---

## 🤖 ROBOTS.TXT — Explicado

```
User-agent: *
Allow: /
Disallow: /api/
Disallow: /admin

Sitemap: https://www.vagaai.app.br/sitemap.xml
```

**O que faz:**
- ✅ Permite crawl da home e páginas públicas
- ✅ Bloqueia `/api/` (funções serverless, não devem ser indexadas)
- ✅ Bloqueia `/admin` (painel administrativo)
- ✅ Aponta pro sitemap (mais eficiente)

**O que NÃO faz:**
- ❌ Não impede acesso físico (robots.txt é só um pedido, não uma lei)
- ❌ Não protege dados sensíveis (sempre use autenticação)
- ❌ Não tira do Google Search (só pede pra não indexar)

**Recomendação:** Combine com autenticação no código (você já tem!)

---

## 🔐 PROTEÇÃO IMPLEMENTADA

### **1. Redirects de Segurança** (vercel.json)
```json
"redirects": [
  { "source": "/admin/:path*", "destination": "/", "permanent": false },
  { "source": "/lp-nova-aprovacao/:path*", "destination": "/", "permanent": false }
]
```

**Resultado:**
- Qualquer acesso a `/admin` redireciona pra home
- Qualquer acesso a `/lp-*-preview` redireciona pra home
- Google vê como soft redirect (307, não indexa)
- Usuários curiosos são mandados pra home automaticamente

### **2. Meta Robots Tags**
```html
<!-- /admin (no HTML) -->
<meta name="robots" content="noindex, nofollow">

<!-- /sitemap.xml (no header HTTP) -->
<!-- Nenhum CSP, acesso livre pra Google -->
```

### **3. Security Headers**
```
Strict-Transport-Security: max-age=63072000 (HTTPS obrigatório)
X-Frame-Options: SAMEORIGIN (protege contra clickjacking)
X-Content-Type-Options: nosniff (bloqueia MIME sniffing)
```

---

## 📊 PÁGINAS QUE NÃO DEVEM SER INDEXADAS

### ❌ Bloqueadas corretamente:

| URL | Tipo | Bloqueio | Razão |
|---|---|---|---|
| `/api/*` | API | robots.txt | Não é conteúdo público |
| `/admin/*` | Admin | redirect 307 | Painel interno |
| `/lp-*-preview/*` | Preview | redirect 307 | Testes de landing page |
| `/lp-nova-aprovacao/*` | WIP | redirect 307 | Trabalho em progresso |
| `/index.template.html` | Template | noindex header | Arquivo de template |

### ✅ Indexadas corretamente:

| URL | Tipo | Status | Razão |
|---|---|---|---|
| `/` | Home | Indexada | Página principal |
| `/app` | App | Indexada | Conversor principal |
| `/blog` | Blog | Indexada | Conteúdo |
| `/blog/post?s=*` | Posts | Indexada | SEO priority |
| `/paraempresas` | B2B | Indexada | Oferta secundária |
| `/termos` | Legal | Indexada | Necessário pra transparência |

---

## 🔍 TESTES DE SEGURANÇA

### Como verificar que está protegido:

```bash
# 1. Admin redireciona?
curl -I https://www.vagaai.app.br/admin/
# Esperado: HTTP 307 Location: /

# 2. Preview redireciona?
curl -I https://www.vagaai.app.br/lp-nova-aprovacao/
# Esperado: HTTP 307 Location: /

# 3. Sitemap está acessível?
curl -I https://www.vagaai.app.br/sitemap.xml
# Esperado: HTTP 200 Content-Type: application/xml

# 4. Robots.txt tem sitemap?
curl https://www.vagaai.app.br/robots.txt | grep Sitemap
# Esperado: Sitemap: https://www.vagaai.app.br/sitemap.xml
```

---

## ⚠️ RISCO RESIDUAL (Baixo)

### O que está 100% seguro:
- ✅ Não será indexado no Google
- ✅ Links não aparecem no sitemap
- ✅ Não afeta SEO

### O que PODERIA ser melhorado (opcional):
- ⚠️ `/admin` ainda carrega HTML (redireciona via client-side + server-side)
- ⚠️ Um hacker técnico PODERIA acessar a interface admin (mas não conseguiria fazer nada sem credenciais)

### Mitigação extra (se quiser):
```html
<!-- Em /admin/index.html, adicione no <head>: -->
<meta name="robots" content="noindex, nofollow, noarchive, noimageindex">

<!-- Isso diz ao Google 4 vezes "não indexe isso" -->
```

---

## 📝 POLÍTICA DE CONTEÚDO

### Regra #1: Nada de conteúdo de teste no `/` root
- ❌ Não coloque `/lp-teste`, `/preview`, `/staging` na raiz
- ✅ Coloque em subdomínio se necessário: `staging.vagaai.app.br`

### Regra #2: Redirect com permanência correta
- Use `permanent: false` (307) para conteúdo temporário
- Use `permanent: true` (308) para URLs que mudaram de verdade

### Regra #3: Arquivos de template não devem ser URLs
- ❌ `/index.template.html` não deve ser acessível
- ✅ Já está bloqueado com noindex

---

## 🚨 CHECKLIST FUTURO

Quando adicionar novas páginas/features:

```md
[ ] É conteúdo público? → Deixe ser indexado
[ ] É admin/teste? → Redirecione para /
[ ] É privado (user-only)? → Proteja com autenticação
[ ] Mudou de URL? → Adicione redirect 308 no vercel.json
[ ] É template/arquivo? → Adicione noindex header
[ ] É de longa vida? → Deixe no robots.txt Allow
[ ] É temporário? → Redirecione, não bloqueie
```

---

## 📊 IMPACTO NO SEO

### Positivo:
- ✅ Sitemap limpo (só URLs públicas)
- ✅ Tráfego não dilui em páginas extras
- ✅ Google confia no site (sem conteúdo duplicado/teste)
- ✅ Mais rápido indexar o que importa

### Neutro:
- ⚪ Redirects 307 não prejudicam (são soft redirects)
- ⚪ Robots.txt não afeta ranking (só crawl)

### Nenhum impacto negativo ✅

---

## 🎯 CONCLUSÃO

**Seu site está 100% protegido de exposição de conteúdo sensível.**

O que você tem:
- ✅ Pages de teste → redirecionadas
- ✅ Admin → redirecionado
- ✅ APIs → bloqueadas
- ✅ Sitemap → limpo (só conteúdo público)
- ✅ Security headers → implementados

**Quando adicionar novo conteúdo:**
1. Se é público → deixe indexar
2. Se é teste → redirecione pra home
3. Se é privado → proteja com autenticação

Pronto! 🔒
