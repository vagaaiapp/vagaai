# 🔐 COMO ACESSAR O PAINEL ADMIN

**Seu painel admin agora está 100% seguro com login!**

---

## 🚀 PASSO 1: Acessar a página de login

Abra seu navegador e acesse:

```
https://www.vagaai.app.br/login
```

Ou clique aqui: [https://www.vagaai.app.br/login](https://www.vagaai.app.br/login)

---

## 📝 PASSO 2: Fazer login

Na página, você verá:

```
┌─────────────────────────────┐
│   VagaAI — Entrar           │
│                             │
│  [Entrar]  [Criar conta]    │
│                             │
│  Email: ____________________│
│  Senha: ____________________│
│                             │
│  [ Entrar ]                 │
│  Esqueceu a senha?          │
└─────────────────────────────┘
```

**Preencha:**
- Email: seu email do Supabase
- Senha: sua senha segura

**Clique em "Entrar"**

---

## ✅ PASSO 3: Acessar o painel admin

Após fazer login, você será redirecionado automaticamente para:

```
https://www.vagaai.app.br/admin
```

Lá você vai encontrar:
- 📊 Dashboard (estatísticas)
- 📝 Blog (gerenciar posts)
- 📈 Métricas

---

## ⚠️ SE ALGO DER ERRADO

### **Problema: Página fica branca ao acessar /admin**

**Solução:** Isso significa que JavaScript está carregando. Aguarde 2-3 segundos.

**Se continuar branco:**
1. Abra DevTools (F12)
2. Vá em "Console"
3. Veja se há erro vermelho
4. Compartilhe o erro comigo

### **Problema: "Email ou senha incorretos"**

**Solução:**
1. Verifique CAPS LOCK (senha é case-sensitive)
2. Certifique-se que o email está correto
3. Se esqueceu a senha, clique em "Esqueceu a senha?"
4. Resete via email

### **Problema: "Acesso negado" ou "Não autorizado"**

**Solução:** Seu email não está na lista de admins no Supabase.

**O que fazer:**
1. Avisa que precisa de acesso admin
2. Eu adiciono seu email no Supabase (settings)
3. Você tenta novamente

### **Problema: Redirecionado de volta pro /login**

**Solução:** Sua sessão expirou. Faça login novamente.

---

## 🔑 FLUXO DE ACESSO

```
1️⃣  /login → Faz login com email + senha
              ↓
2️⃣  Valida credenciais no Supabase
              ↓
3️⃣  ✅ Corretas → Cria session (token)
    ❌ Erradas → Mostra erro
              ↓
4️⃣  Redirecionado para /admin
              ↓
5️⃣  /admin valida session
              ↓
6️⃣  ✅ Valid → Mostra painel
    ❌ Inválido → Redireciona pro /login
```

---

## 🛡️ SEGURANÇA

✅ **Sua senha:**
- Armazenada com hash (bcrypt)
- Nunca é enviada em texto plano
- HTTPS (criptografia TLS)

✅ **Seu token:**
- Armazenado localmente (localStorage)
- Expira automaticamente
- Não aparece em URLs

✅ **Seus dados:**
- Protegidos por RLS (Row Level Security)
- Só você consegue acessar
- Bloqueado por firewall no Supabase

---

## 📱 ACESSAR DO CELULAR

Você pode acessar o admin do celular também:

1. Abra: `https://www.vagaai.app.br/login` no seu celular
2. Faça login
3. Use normalmente

O painel é responsivo (adapta ao tamanho da tela).

---

## ⏰ SESSÃO EXPIRA?

**Tempo de sessão:** 1 hora (padrão)

**O que acontece:**
- Após 1h sem atividade → token expira
- Você é redirecionado pro /login
- Faça login novamente

**Se quiser aumentar/diminuir:**
- Me avisa
- Eu mudo no Supabase

---

## 📞 SUPORTE

Se não conseguir acessar:

1. Verifica se JavaScript está ativado (F12 → Console)
2. Tenta em outro navegador
3. Limpa cache (Ctrl+Shift+Delete)
4. Se continuar, me avisa com:
   - Email que está tentando
   - Navegador/versão
   - O que aparece na tela

---

## ✨ TUDO PRONTO!

Seu painel admin está 100% seguro e funcional.

**Acesse:** [https://www.vagaai.app.br/login](https://www.vagaai.app.br/login)

Boa sorte! 🚀
