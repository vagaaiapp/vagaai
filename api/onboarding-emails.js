// /api/onboarding-emails.js
// Chamado pelo webhook após criação de conta/assinatura, ou pelo cliente no primeiro login
// Envia sequência: Dia 0 (boas-vindas), Dia 2 (dica ATS), Dia 5 (lembrete)

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

async function sendEmail(to, subject, html, replyTo = null) {
  if (!RESEND_API_KEY) return;
  const payload = { from: 'VagaAI <ola@vagaai.app.br>', to: [to], subject, html };
  if (replyTo) payload.reply_to = replyTo;
  return fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

// Escapa valores dinâmicos antes de interpolar no HTML dos e-mails.
// name vem de user_metadata (controlável pelo usuário no signup) e
// empresa/cargo vêm do job_tracker — nunca interpolar sem escapar.
function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const EMAILS = {
  welcome: (rawName) => { const name = esc(rawName); return {
    subject: 'Bem-vindo ao VagaAI! Veja o que você pode fazer agora 🎯',
    html: `<div style="font-family:Inter,sans-serif;max-width:520px;margin:0 auto;background:#0a0f0d;color:#e8ede9;border-radius:12px;overflow:hidden">
  <div style="background:#111814;padding:2rem;text-align:center;border-bottom:1px solid rgba(255,255,255,.07)">
    <div style="font-family:Georgia,serif;font-size:24px;font-weight:700;color:#3ecf8e">VagaAI</div>
    <div style="font-size:12px;color:#8a9e90;margin-top:.3rem">Seu copiloto para conseguir o emprego</div>
  </div>
  <div style="padding:2rem">
    <h1 style="font-family:Georgia,serif;font-size:22px;font-weight:700;color:#e8ede9;margin-bottom:.5rem">Olá, ${name}! 👋</h1>
    <p style="color:#8a9e90;font-size:14px;line-height:1.7;margin-bottom:1.5rem">Sua conta está ativa. Aqui está o que você pode fazer agora:</p>
    <div style="background:#161d19;border-radius:10px;padding:1.2rem;margin-bottom:1rem">
      <div style="font-size:13px;font-weight:700;color:#3ecf8e;margin-bottom:.5rem">⚡ 1. Faça sua primeira análise grátis</div>
      <div style="font-size:13px;color:#8a9e90">Cole a vaga + currículo e veja onde você perde pontos no ATS.</div>
    </div>
    <div style="background:#161d19;border-radius:10px;padding:1.2rem;margin-bottom:1rem">
      <div style="font-size:13px;font-weight:700;color:#3ecf8e;margin-bottom:.5rem">📋 2. Rastreie suas candidaturas</div>
      <div style="font-size:13px;color:#8a9e90">Use o Kanban para organizar: Quero aplicar → Aplicado → Entrevista.</div>
    </div>
    <div style="background:#161d19;border-radius:10px;padding:1.2rem;margin-bottom:1.5rem">
      <div style="font-size:13px;font-weight:700;color:#3ecf8e;margin-bottom:.5rem">🔔 3. Ative alertas de vaga</div>
      <div style="font-size:13px;color:#8a9e90">Configure seu perfil e receba vagas compatíveis toda sexta-feira.</div>
    </div>
    <a href="https://www.vagaai.app.br/app" style="display:block;background:#3ecf8e;color:#0a0f0d;font-weight:700;font-size:14px;text-align:center;padding:.9rem;border-radius:9px;text-decoration:none">→ Começar agora</a>
    <p style="color:#4d6e57;font-size:11px;margin-top:1.5rem;text-align:center">VagaAI · vagaai.app.br</p>
  </div>
</div>`
  }; },

  day2: (rawName) => { const name = esc(rawName); return {
    subject: '3 erros que fazem o ATS rejeitar seu currículo (e como corrigir)',
    html: `<div style="font-family:Inter,sans-serif;max-width:520px;margin:0 auto;background:#0a0f0d;color:#e8ede9;border-radius:12px;overflow:hidden">
  <div style="background:#111814;padding:1.5rem 2rem;border-bottom:1px solid rgba(255,255,255,.07)">
    <div style="font-family:Georgia,serif;font-size:20px;font-weight:700;color:#3ecf8e">VagaAI</div>
  </div>
  <div style="padding:2rem">
    <h1 style="font-family:Georgia,serif;font-size:20px;font-weight:700;color:#e8ede9;margin-bottom:.5rem">Olá, ${name}!</h1>
    <p style="color:#8a9e90;font-size:14px;line-height:1.7;margin-bottom:1.5rem">Os 3 erros mais comuns que fazem currículos serem rejeitados automaticamente:</p>
    <div style="border-left:3px solid #ff6b6b;padding:.75rem 1rem;background:#161d19;border-radius:0 8px 8px 0;margin-bottom:.75rem">
      <div style="font-size:13px;font-weight:700;color:#ff8f8f">❌ Erro 1: Keywords genéricas</div>
      <div style="font-size:12px;color:#8a9e90;margin-top:.3rem">Escrever "experiência em TI" em vez das tecnologias específicas da vaga. O ATS não faz inferências.</div>
    </div>
    <div style="border-left:3px solid #ff6b6b;padding:.75rem 1rem;background:#161d19;border-radius:0 8px 8px 0;margin-bottom:.75rem">
      <div style="font-size:13px;font-weight:700;color:#ff8f8f">❌ Erro 2: CV genérico para todas as vagas</div>
      <div style="font-size:12px;color:#8a9e90;margin-top:.3rem">Um CV sem personalização para a vaga específica reduz o score ATS em até 40%.</div>
    </div>
    <div style="border-left:3px solid #ff6b6b;padding:.75rem 1rem;background:#161d19;border-radius:0 8px 8px 0;margin-bottom:1.5rem">
      <div style="font-size:13px;font-weight:700;color:#ff8f8f">❌ Erro 3: Bullets sem resultado quantificado</div>
      <div style="font-size:12px;color:#8a9e90;margin-top:.3rem">"Trabalhei em projetos" vs "Liderei 3 projetos com redução de 30% no prazo". O segundo passa, o primeiro não.</div>
    </div>
    <a href="https://www.vagaai.app.br/app" style="display:block;background:#3ecf8e;color:#0a0f0d;font-weight:700;font-size:14px;text-align:center;padding:.9rem;border-radius:9px;text-decoration:none">⚡ Analisar meu currículo agora</a>
    <p style="color:#4d6e57;font-size:11px;margin-top:1.5rem;text-align:center">VagaAI · <a href="https://vagaai.app.br" style="color:#3ecf8e;text-decoration:none">vagaai.app.br</a></p>
  </div>
</div>`
  }; },

  tracker_followup: (rawName, rawEmpresa, rawCargo) => { const name = esc(rawName), empresa = esc(rawEmpresa), cargo = esc(rawCargo); return {
    subject: `Já faz 7 dias desde que você aplicou para ${String(rawEmpresa || 'a vaga')} — e agora?`,
    html: `<div style="font-family:Inter,sans-serif;max-width:520px;margin:0 auto;background:#0a0f0d;color:#e8ede9;border-radius:12px;overflow:hidden">
  <div style="background:#111814;padding:1.5rem 2rem;border-bottom:1px solid rgba(255,255,255,.07)">
    <div style="font-family:Georgia,serif;font-size:20px;font-weight:700;color:#3ecf8e">VagaAI</div>
  </div>
  <div style="padding:2rem">
    <h1 style="font-family:Georgia,serif;font-size:20px;font-weight:700;color:#e8ede9;margin-bottom:.5rem">Olá, ${name}! 👋</h1>
    <p style="color:#8a9e90;font-size:14px;line-height:1.7;margin-bottom:1rem">
      Há 7 dias você se candidatou para <strong style="color:#e8ede9">${cargo}</strong> na <strong style="color:#3ecf8e">${empresa}</strong>. Sem retorno ainda?
    </p>
    <div style="background:#161d19;border-radius:10px;padding:1.2rem;margin-bottom:.75rem">
      <div style="font-size:13px;font-weight:700;color:#ffd166;margin-bottom:.4rem">📬 Faça follow-up agora</div>
      <div style="font-size:13px;color:#8a9e90;line-height:1.6">Um e-mail curto e direto para o recrutador pode fazer toda a diferença. Reforce seu interesse e mencione algo específico da empresa.</div>
    </div>
    <div style="background:#161d19;border-radius:10px;padding:1.2rem;margin-bottom:1.5rem">
      <div style="font-size:13px;font-weight:700;color:#3ecf8e;margin-bottom:.4rem">💡 Modelo de follow-up</div>
      <div style="font-size:12px;color:#8a9e90;line-height:1.7;font-style:italic">
        "Olá [Recrutador], tudo bem? Gostaria de reforçar meu interesse na vaga de ${cargo}. Tenho acompanhado o trabalho de ${empresa} e acredito que posso contribuir diretamente com [X]. Fico à disposição para conversar. Abraços, ${name}."
      </div>
    </div>
    <a href="https://www.vagaai.app.br/dashboard" style="display:block;background:#3ecf8e;color:#0a0f0d;font-weight:700;font-size:14px;text-align:center;padding:.9rem;border-radius:9px;text-decoration:none">→ Ver rastreador de candidaturas</a>
    <p style="color:#4d6e57;font-size:11px;margin-top:1.5rem;text-align:center">VagaAI · <a href="https://vagaai.app.br" style="color:#3ecf8e;text-decoration:none">vagaai.app.br</a></p>
  </div>
</div>`
  }; },

  // ── Régua 2026-07: D7 radar, D21 win-back, ciclo free, ciclo de assinatura ──

  // D7 — só para quem NÃO tem alerta ativo. Objetivo: ligar o motor de retenção.
  day7_alerts: (rawName) => { const name = esc(rawName); return {
    subject: 'Ligue seu radar de vagas — leva 1 minuto 🔔',
    html: `<div style="font-family:Inter,sans-serif;max-width:520px;margin:0 auto;background:#0a0f0d;color:#e8ede9;border-radius:12px;overflow:hidden">
  <div style="background:#111814;padding:1.5rem 2rem;border-bottom:1px solid rgba(255,255,255,.07)">
    <div style="font-family:Georgia,serif;font-size:20px;font-weight:700;color:#3ecf8e">VagaAI</div>
  </div>
  <div style="padding:2rem">
    <h1 style="font-family:Georgia,serif;font-size:20px;font-weight:700;color:#e8ede9;margin-bottom:.5rem">Olá, ${name}!</h1>
    <p style="color:#8a9e90;font-size:14px;line-height:1.7;margin-bottom:1.2rem">
      As melhores vagas fecham em dias. Em vez de procurar todo dia, deixe o radar procurar por você:
      diga o cargo e a cidade, e você recebe por e-mail só as vagas compatíveis com seu perfil — com score estimado.
    </p>
    <div style="background:#161d19;border-radius:10px;padding:1.2rem;margin-bottom:1.5rem">
      <div style="font-size:13px;color:#8a9e90;line-height:1.6">🔔 Grátis, direto no seu e-mail, cancela quando quiser. Leva 1 minuto para configurar.</div>
    </div>
    <a href="https://www.vagaai.app.br/dashboard?tab=alertas" style="display:block;background:#3ecf8e;color:#0a0f0d;font-weight:700;font-size:14px;text-align:center;padding:.9rem;border-radius:9px;text-decoration:none">→ Configurar meu alerta de vagas</a>
    <p style="color:#4d6e57;font-size:11px;margin-top:1.5rem;text-align:center">VagaAI · <a href="https://vagaai.app.br" style="color:#3ecf8e;text-decoration:none">vagaai.app.br</a></p>
  </div>
</div>`
  }; },

  // D21 — win-back único, texto simples e pessoal; convida a responder o e-mail
  // (reply chega em contato@ — configurado no envio com reply_to).
  winback: (rawName) => { const name = esc(rawName); return {
    subject: 'Posso te perguntar uma coisa?',
    html: `<div style="font-family:Inter,sans-serif;max-width:520px;margin:0 auto;color:#222;line-height:1.7;font-size:14px;padding:1rem">
  <p>Olá, ${name}!</p>
  <p>Vi que você criou sua conta no VagaAI há algumas semanas, mas acabou não voltando. Tudo bem — mas sua resposta me ajudaria muito a melhorar o produto:</p>
  <p style="font-weight:700">O que te travou? Faltou alguma coisa, o resultado não ajudou, ou a busca de emprego mudou?</p>
  <p>É só responder este e-mail — eu leio todas as respostas pessoalmente.</p>
  <p>Abraço,<br>Equipe VagaAI · <a href="https://vagaai.app.br" style="color:#1a7a4a">vagaai.app.br</a></p>
</div>`
  }; },

  // Ciclo mensal do grátis — a janela de análise reabriu e não foi usada.
  free_renewed: (rawName) => { const name = esc(rawName); return {
    subject: 'Sua análise grátis do mês voltou ✅',
    html: `<div style="font-family:Inter,sans-serif;max-width:520px;margin:0 auto;background:#0a0f0d;color:#e8ede9;border-radius:12px;overflow:hidden">
  <div style="background:#111814;padding:1.5rem 2rem;border-bottom:1px solid rgba(255,255,255,.07)">
    <div style="font-family:Georgia,serif;font-size:20px;font-weight:700;color:#3ecf8e">VagaAI</div>
  </div>
  <div style="padding:2rem">
    <h1 style="font-family:Georgia,serif;font-size:20px;font-weight:700;color:#e8ede9;margin-bottom:.5rem">Olá, ${name}!</h1>
    <p style="color:#8a9e90;font-size:14px;line-height:1.7;margin-bottom:1.5rem">
      Sua <strong style="color:#3ecf8e">análise completa grátis</strong> deste mês já está disponível.
      Escolha a vaga mais importante da sua semana e veja exatamente onde seu currículo perde pontos antes de aplicar.
    </p>
    <a href="https://www.vagaai.app.br/app" style="display:block;background:#3ecf8e;color:#0a0f0d;font-weight:700;font-size:14px;text-align:center;padding:.9rem;border-radius:9px;text-decoration:none">⚡ Usar minha análise grátis</a>
    <p style="color:#4d6e57;font-size:11px;margin-top:1.5rem;text-align:center">VagaAI · <a href="https://vagaai.app.br" style="color:#3ecf8e;text-decoration:none">vagaai.app.br</a></p>
  </div>
</div>`
  }; },

  // Assinatura ativada — específico por plano; substitui o welcome genérico
  // no fluxo do webhook de assinatura (o welcome de conta continua no signup).
  sub_activated: (rawName, plan) => {
    const name = esc(rawName);
    const isPro = plan === 'pro';
    const label = isPro ? 'Pro' : 'Starter';
    const items = isPro
      ? [['⚡ Análises ilimitadas', 'Analise todas as vagas que quiser, sem contador.'],
         ['🎤 Simulador de entrevista', 'Treine com perguntas geradas para a SUA vaga e receba feedback da IA.'],
         ['🔔 Alertas diários sem limite', 'Todas as vagas compatíveis, com análise da IA no topo do e-mail.']]
      : [['⚡ 10 análises por mês', 'Analise as vagas mais importantes antes de aplicar.'],
         ['📄 Currículo otimizado em PDF', 'Gere a versão otimizada pronta para enviar.'],
         ['✉️ Carta de apresentação', 'Uma carta personalizada para cada vaga, em segundos.']];
    return {
      subject: `Seu plano ${label} está ativo 🎉 Comece por aqui`,
      html: `<div style="font-family:Inter,sans-serif;max-width:520px;margin:0 auto;background:#0a0f0d;color:#e8ede9;border-radius:12px;overflow:hidden">
  <div style="background:#111814;padding:2rem;text-align:center;border-bottom:1px solid rgba(255,255,255,.07)">
    <div style="font-family:Georgia,serif;font-size:24px;font-weight:700;color:#3ecf8e">VagaAI ${label}</div>
  </div>
  <div style="padding:2rem">
    <h1 style="font-family:Georgia,serif;font-size:22px;font-weight:700;color:#e8ede9;margin-bottom:.5rem">Obrigado, ${name}! 🎉</h1>
    <p style="color:#8a9e90;font-size:14px;line-height:1.7;margin-bottom:1.5rem">Seu plano ${label} já está ativo. Isto é o que ele libera:</p>
    ${items.map(([t, d]) => `<div style="background:#161d19;border-radius:10px;padding:1.2rem;margin-bottom:1rem">
      <div style="font-size:13px;font-weight:700;color:#3ecf8e;margin-bottom:.4rem">${t}</div>
      <div style="font-size:13px;color:#8a9e90">${d}</div>
    </div>`).join('')}
    <a href="https://www.vagaai.app.br/dashboard" style="display:block;background:#3ecf8e;color:#0a0f0d;font-weight:700;font-size:14px;text-align:center;padding:.9rem;border-radius:9px;text-decoration:none;margin-top:.5rem">→ Ir para o meu painel</a>
    <p style="color:#4d6e57;font-size:11px;margin-top:1.5rem;text-align:center">Gerencie sua assinatura a qualquer momento no painel · VagaAI</p>
  </div>
</div>`
    };
  },

  // Pagamento falhou — período de graça ativo; tom tranquilo, 1 CTA.
  payment_failed: (rawName) => { const name = esc(rawName); return {
    subject: 'Não conseguimos renovar sua assinatura — seu acesso continua ativo',
    html: `<div style="font-family:Inter,sans-serif;max-width:520px;margin:0 auto;background:#0a0f0d;color:#e8ede9;border-radius:12px;overflow:hidden">
  <div style="background:#111814;padding:1.5rem 2rem;border-bottom:1px solid rgba(255,255,255,.07)">
    <div style="font-family:Georgia,serif;font-size:20px;font-weight:700;color:#3ecf8e">VagaAI</div>
  </div>
  <div style="padding:2rem">
    <h1 style="font-family:Georgia,serif;font-size:20px;font-weight:700;color:#e8ede9;margin-bottom:.5rem">Olá, ${name}!</h1>
    <p style="color:#8a9e90;font-size:14px;line-height:1.7;margin-bottom:1rem">
      A renovação da sua assinatura não foi aprovada pelo banco — isso é comum (limite, cartão vencido ou bloqueio temporário).
    </p>
    <p style="color:#8a9e90;font-size:14px;line-height:1.7;margin-bottom:1.5rem">
      <strong style="color:#e8ede9">Seu acesso continua ativo</strong> enquanto tentamos novamente. Para não perder seus recursos, atualize a forma de pagamento:
    </p>
    <a href="https://www.vagaai.app.br/dashboard?tab=plano" style="display:block;background:#3ecf8e;color:#0a0f0d;font-weight:700;font-size:14px;text-align:center;padding:.9rem;border-radius:9px;text-decoration:none">→ Atualizar forma de pagamento</a>
    <p style="color:#4d6e57;font-size:11px;margin-top:1.5rem;text-align:center">Dúvida de cobrança? Responda este e-mail. · VagaAI</p>
  </div>
</div>`
  }; },

  // Cancelamento confirmado — sem culpa; lista o que permanece no grátis.
  sub_canceled: (rawName) => { const name = esc(rawName); return {
    subject: 'Cancelamento confirmado — você continua com o plano gratuito',
    html: `<div style="font-family:Inter,sans-serif;max-width:520px;margin:0 auto;background:#0a0f0d;color:#e8ede9;border-radius:12px;overflow:hidden">
  <div style="background:#111814;padding:1.5rem 2rem;border-bottom:1px solid rgba(255,255,255,.07)">
    <div style="font-family:Georgia,serif;font-size:20px;font-weight:700;color:#3ecf8e">VagaAI</div>
  </div>
  <div style="padding:2rem">
    <h1 style="font-family:Georgia,serif;font-size:20px;font-weight:700;color:#e8ede9;margin-bottom:.5rem">Olá, ${name}</h1>
    <p style="color:#8a9e90;font-size:14px;line-height:1.7;margin-bottom:1.2rem">
      Sua assinatura foi cancelada e você não será mais cobrado. Obrigado por ter feito parte — e boa sorte na sua busca! 🍀
    </p>
    <div style="background:#161d19;border-radius:10px;padding:1.2rem;margin-bottom:1.5rem">
      <div style="font-size:13px;font-weight:700;color:#3ecf8e;margin-bottom:.5rem">Você continua com o plano gratuito:</div>
      <div style="font-size:13px;color:#8a9e90;line-height:1.8">✓ 1 análise completa por mês<br>✓ Alerta semanal com até 5 vagas<br>✓ Rastreador de candidaturas com seu histórico intacto</div>
    </div>
    <a href="https://www.vagaai.app.br/dashboard" style="display:block;background:#3ecf8e;color:#0a0f0d;font-weight:700;font-size:14px;text-align:center;padding:.9rem;border-radius:9px;text-decoration:none">→ Continuar no plano gratuito</a>
    <p style="color:#4d6e57;font-size:11px;margin-top:1.5rem;text-align:center">Mudou de ideia? É só reassinar pelo painel. · VagaAI</p>
  </div>
</div>`
  }; },

  // O 2º parâmetro (creditsLeft) é aceito por compatibilidade com call-sites
  // antigos, mas ignorado — créditos avulsos foram descontinuados; a copy
  // reflete o modelo atual (análise mensal grátis + assinaturas).
  day5: (rawName) => { const name = esc(rawName); return {
    subject: 'Como está sua busca de emprego? 🎯',
    html: `<div style="font-family:Inter,sans-serif;max-width:520px;margin:0 auto;background:#0a0f0d;color:#e8ede9;border-radius:12px;overflow:hidden">
  <div style="background:#111814;padding:1.5rem 2rem;border-bottom:1px solid rgba(255,255,255,.07)">
    <div style="font-family:Georgia,serif;font-size:20px;font-weight:700;color:#3ecf8e">VagaAI</div>
  </div>
  <div style="padding:2rem">
    <h1 style="font-family:Georgia,serif;font-size:20px;font-weight:700;color:#e8ede9;margin-bottom:.5rem">Olá, ${name}!</h1>
    <p style="color:#8a9e90;font-size:14px;line-height:1.7;margin-bottom:1.5rem">
      Está em busca ativa? Seu plano gratuito inclui <strong style="color:#3ecf8e">1 análise completa por mês</strong> — e o plano Pro libera análises ilimitadas, currículo otimizado e simulador de entrevista.
    </p>
    <div style="background:#161d19;border-radius:10px;padding:1.2rem;margin-bottom:1.5rem">
      <div style="font-size:13px;font-weight:700;color:#e8ede9;margin-bottom:.5rem">💡 Dica da semana</div>
      <div style="font-size:13px;color:#8a9e90;line-height:1.6">Antes de cada candidatura, leia a vaga com atenção e identifique as 5 palavras-chave principais. Certifique-se que todas aparecem no seu CV antes de enviar.</div>
    </div>
    <a href="https://www.vagaai.app.br/app" style="display:block;background:#3ecf8e;color:#0a0f0d;font-weight:700;font-size:14px;text-align:center;padding:.9rem;border-radius:9px;text-decoration:none">→ Analisar uma vaga agora</a>
    <p style="color:#4d6e57;font-size:11px;margin-top:1.5rem;text-align:center">VagaAI · <a href="https://vagaai.app.br" style="color:#3ecf8e;text-decoration:none">vagaai.app.br</a></p>
  </div>
</div>`
  }; },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action } = req.body || {};
  const authHeader = (req.headers.authorization || '').replace('Bearer ', '');

  // ── Rota especial: cliente chama com seu próprio token após signup ─────────
  if (action === 'welcome_self') {
    if (!authHeader || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      return res.status(401).json({ error: 'Token ou env ausente' });
    }
    try {
      // Valida token do usuário
      const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${authHeader}` },
      });
      if (!userRes.ok) return res.status(401).json({ error: 'Token inválido' });
      const user = await userRes.json();
      const email = user.email;
      if (!email) return res.status(400).json({ error: 'Usuário sem email' });

      // Verifica se já enviou welcome (evita duplicatas). webhook_events NÃO tem
      // coluna "type" — usa a chave sintética em stripe_session_id, o mesmo
      // padrão do cron-onboarding (onboarding_dayN_USERID).
      const welcomeKey = `onboarding_welcome_${user.id}`;
      const evtRes = await fetch(
        `${SUPABASE_URL}/rest/v1/webhook_events?stripe_session_id=eq.${encodeURIComponent(welcomeKey)}&select=id&limit=1`,
        { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
      );
      const evts = await evtRes.json();
      if (Array.isArray(evts) && evts.length > 0) {
        return res.status(200).json({ sent: false, reason: 'already_sent' });
      }

      // Envia welcome
      const name = user.user_metadata?.full_name || user.user_metadata?.name || email.split('@')[0];
      const emailData = EMAILS.welcome(name);
      const r = await sendEmail(email, emailData.subject, emailData.html);

      // Registra envio (colunas reais da tabela: stripe_session_id, user_id, amount, processed_at)
      await fetch(`${SUPABASE_URL}/rest/v1/webhook_events`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=ignore-duplicates',
        },
        body: JSON.stringify({ stripe_session_id: welcomeKey, user_id: user.id, amount: 0, processed_at: new Date().toISOString() }),
      });

      return res.status(200).json({ sent: r?.ok || false, to: email });
    } catch (e) {
      console.error('welcome_self error:', e);
      return res.status(500).json({ error: e.message });
    }
  }

  // ── Rota padrão: chamada pelo cron/webhook com CRON_SECRET ────────────────
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('onboarding-emails: CRON_SECRET não configurado');
    return res.status(500).json({ error: 'CRON_SECRET não configurado' });
  }
  // Comparação timing-safe: impede ataques de timing.
  // authHeader já vem sem o prefixo "Bearer " (removido no topo do handler) —
  // um .slice() extra aqui cortava 7 chars do segredo e fazia TODA chamada
  // legítima do cron/webhook receber 401 (e-mails de onboarding nunca saíam).
  const authBuf = Buffer.from(authHeader || '', 'utf8');
  const secretBuf = Buffer.from(secret, 'utf8');
  const validLength = authBuf.length === secretBuf.length;
  // Usa buffers de igual comprimento para timingSafeEqual (padding se necessário)
  const a = Buffer.alloc(Math.max(authBuf.length, secretBuf.length));
  const b = Buffer.alloc(Math.max(authBuf.length, secretBuf.length));
  authBuf.copy(a); secretBuf.copy(b);
  const { timingSafeEqual } = await import('crypto');
  if (!validLength || !timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { email, name, type, credits_left, empresa, cargo, plan } = req.body || {};
  if (!email || !type) return res.status(400).json({ error: 'email e type obrigatórios' });

  const displayName = name || email.split('@')[0];

  try {
    let emailData;
    let replyTo = null;
    if (type === 'welcome') emailData = EMAILS.welcome(displayName);
    else if (type === 'day2') emailData = EMAILS.day2(displayName);
    else if (type === 'day5') emailData = EMAILS.day5(displayName, credits_left || 0);
    else if (type === 'day7_alerts') emailData = EMAILS.day7_alerts(displayName);
    else if (type === 'winback') { emailData = EMAILS.winback(displayName); replyTo = 'contato@vagaai.app.br'; }
    else if (type === 'free_renewed') emailData = EMAILS.free_renewed(displayName);
    else if (type === 'sub_activated') emailData = EMAILS.sub_activated(displayName, plan === 'pro' ? 'pro' : 'starter');
    else if (type === 'payment_failed') { emailData = EMAILS.payment_failed(displayName); replyTo = 'contato@vagaai.app.br'; }
    else if (type === 'sub_canceled') emailData = EMAILS.sub_canceled(displayName);
    else if (type === 'tracker_followup') emailData = EMAILS.tracker_followup(displayName, empresa || 'empresa', cargo || 'vaga');
    else return res.status(400).json({ error: 'type inválido' });

    const r = await sendEmail(email, emailData.subject, emailData.html, replyTo);
    if (!r?.ok) throw new Error('Resend error');
    return res.status(200).json({ sent: true, type, to: email });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
