// /api/onboarding-emails.js
// Chamado pelo webhook após criação de conta/assinatura, ou pelo cliente no primeiro login
// Envia sequência: Dia 0 (boas-vindas), Dia 2 (dica ATS), Dia 5 (lembrete)

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

async function sendEmail(to, subject, html) {
  if (!RESEND_API_KEY) return;
  return fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'VagaAI <ola@vagaai.app.br>', to: [to], subject, html }),
  });
}

const EMAILS = {
  welcome: (name) => ({
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
  }),

  day2: (name) => ({
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
  }),

  tracker_followup: (name, empresa, cargo) => ({
    subject: `Já faz 7 dias desde que você aplicou para ${empresa} — e agora?`,
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
  }),

  day5: (name, creditsLeft) => ({
    subject: creditsLeft > 0
      ? `Você tem ${creditsLeft} análise${creditsLeft > 1 ? 's' : ''} disponíve${creditsLeft > 1 ? 'is' : 'l'} — use antes de precisar`
      : 'Como está sua busca de emprego? 🎯',
    html: `<div style="font-family:Inter,sans-serif;max-width:520px;margin:0 auto;background:#0a0f0d;color:#e8ede9;border-radius:12px;overflow:hidden">
  <div style="background:#111814;padding:1.5rem 2rem;border-bottom:1px solid rgba(255,255,255,.07)">
    <div style="font-family:Georgia,serif;font-size:20px;font-weight:700;color:#3ecf8e">VagaAI</div>
  </div>
  <div style="padding:2rem">
    <h1 style="font-family:Georgia,serif;font-size:20px;font-weight:700;color:#e8ede9;margin-bottom:.5rem">Olá, ${name}!</h1>
    <p style="color:#8a9e90;font-size:14px;line-height:1.7;margin-bottom:1.5rem">
      ${creditsLeft > 0
        ? `Você ainda tem <strong style="color:#3ecf8e">${creditsLeft} análise${creditsLeft > 1 ? 's' : ''}</strong> disponíve${creditsLeft > 1 ? 'is' : 'l'} na sua conta. Aproveite para otimizar suas próximas candidaturas.`
        : 'Está em busca ativa? Cada candidatura sem análise ATS é uma chance perdida. Veja nossos planos.'}
    </p>
    <div style="background:#161d19;border-radius:10px;padding:1.2rem;margin-bottom:1.5rem">
      <div style="font-size:13px;font-weight:700;color:#e8ede9;margin-bottom:.5rem">💡 Dica da semana</div>
      <div style="font-size:13px;color:#8a9e90;line-height:1.6">Antes de cada candidatura, leia a vaga com atenção e identifique as 5 palavras-chave principais. Certifique-se que todas aparecem no seu CV antes de enviar.</div>
    </div>
    <a href="https://www.vagaai.app.br/app" style="display:block;background:#3ecf8e;color:#0a0f0d;font-weight:700;font-size:14px;text-align:center;padding:.9rem;border-radius:9px;text-decoration:none">→ Analisar uma vaga agora</a>
    <p style="color:#4d6e57;font-size:11px;margin-top:1.5rem;text-align:center">VagaAI · <a href="https://vagaai.app.br" style="color:#3ecf8e;text-decoration:none">vagaai.app.br</a></p>
  </div>
</div>`
  }),
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

      // Verifica se já enviou welcome (evita duplicatas)
      const evtRes = await fetch(
        `${SUPABASE_URL}/rest/v1/webhook_events?user_id=eq.${user.id}&type=eq.onboarding_welcome&select=id&limit=1`,
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

      // Registra envio
      await fetch(`${SUPABASE_URL}/rest/v1/webhook_events`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=ignore-duplicates',
        },
        body: JSON.stringify({ user_id: user.id, type: 'onboarding_welcome', payload: { email, source: 'signup' }, created_at: new Date().toISOString() }),
      });

      return res.status(200).json({ sent: r?.ok || false, to: email });
    } catch (e) {
      console.error('welcome_self error:', e);
      return res.status(500).json({ error: e.message });
    }
  }

  // ── Rota padrão: chamada pelo cron/webhook com CRON_SECRET ────────────────
  const secret = process.env.CRON_SECRET || 'vagaai-cron-secret-2026';
  if (authHeader !== secret) return res.status(401).json({ error: 'Unauthorized' });

  const { email, name, type, credits_left, empresa, cargo } = req.body || {};
  if (!email || !type) return res.status(400).json({ error: 'email e type obrigatórios' });

  const displayName = name || email.split('@')[0];

  try {
    let emailData;
    if (type === 'welcome') emailData = EMAILS.welcome(displayName);
    else if (type === 'day2') emailData = EMAILS.day2(displayName);
    else if (type === 'day5') emailData = EMAILS.day5(displayName, credits_left || 0);
    else if (type === 'tracker_followup') emailData = EMAILS.tracker_followup(displayName, empresa || 'empresa', cargo || 'vaga');
    else return res.status(400).json({ error: 'type inválido' });

    const r = await sendEmail(email, emailData.subject, emailData.html);
    if (!r?.ok) throw new Error('Resend error');
    return res.status(200).json({ sent: true, type, to: email });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
