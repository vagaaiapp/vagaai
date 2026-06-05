// /api/onboarding-emails.js
// Chamado pelo webhook após criação de conta ou assinatura
// Envia sequência: Dia 0 (boas-vindas), Dia 2 (dica ATS), Dia 5 (lembrete)

const RESEND_API_KEY = process.env.RESEND_API_KEY;

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

  const secret = process.env.CRON_SECRET || 'vagaai-cron-secret-2026';
  const auth = (req.headers.authorization || '').replace('Bearer ', '');
  if (auth !== secret) return res.status(401).json({ error: 'Unauthorized' });

  const { email, name, type, credits_left } = req.body || {};
  if (!email || !type) return res.status(400).json({ error: 'email e type obrigatórios' });

  const displayName = name || email.split('@')[0];

  try {
    let emailData;
    if (type === 'welcome') emailData = EMAILS.welcome(displayName);
    else if (type === 'day2') emailData = EMAILS.day2(displayName);
    else if (type === 'day5') emailData = EMAILS.day5(displayName, credits_left || 0);
    else return res.status(400).json({ error: 'type inválido' });

    const r = await sendEmail(email, emailData.subject, emailData.html);
    if (!r?.ok) throw new Error('Resend error');
    return res.status(200).json({ sent: true, type, to: email });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
