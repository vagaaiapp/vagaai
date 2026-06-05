// /api/send-alerts.js
// Cron job: busca vagas (Jooble), calcula compatibilidade, envia emails
// Roda toda sexta às 8h via vercel.json cron
// Também pode ser chamado manualmente com ?test=1

import crypto from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const JOOBLE_API_KEY = process.env.JOOBLE_API_KEY; // Cadastrar em jooble.org/api
const CRON_SECRET = process.env.CRON_SECRET; // Opcional: segurança extra

function jobHash(title, company, location) {
  return crypto.createHash('md5')
    .update((title + company + location).toLowerCase())
    .digest('hex').slice(0, 16);
}

// Calcula score de compatibilidade estimado (sem IA)
function calcScore(job, profile) {
  let score = 0;
  const title = (job.title || '').toLowerCase();
  const desc = (job.snippet || job.description || '').toLowerCase();
  const cargo = (profile.cargo_desejado || '').toLowerCase();
  const nivel = (profile.nivel || '').toLowerCase();
  const keywords = profile.keywords || [];

  // Cargo no título
  const cargoWords = cargo.split(/\s+/).filter(w => w.length > 3);
  cargoWords.forEach(w => { if (title.includes(w)) score += 15; });

  // Keywords no título ou descrição
  keywords.forEach(kw => {
    const k = kw.toLowerCase();
    if (title.includes(k)) score += 15;
    else if (desc.includes(k)) score += 8;
  });

  // Nível
  const nivelMap = { junior: ['júnior','junior','jr','entry'], pleno: ['pleno','mid','pl'], senior: ['sênior','senior','sr','lead'] };
  if (nivel && nivelMap[nivel]) {
    nivelMap[nivel].forEach(n => { if (title.includes(n) || desc.includes(n)) score += 20; });
  }

  // Salário (se disponível)
  if (profile.salario_min && job.salary) {
    const salNum = parseInt(String(job.salary).replace(/\D/g, ''));
    if (salNum >= profile.salario_min) score += 10;
  }

  return Math.min(100, score);
}

function starsFromScore(score) {
  if (score >= 60) return '★★★★☆';
  if (score >= 40) return '★★★☆☆';
  return '★★☆☆☆';
}

function compatLabel(score) {
  if (score >= 60) return 'Alta compatibilidade estimada';
  if (score >= 40) return 'Média compatibilidade estimada';
  return 'Compatibilidade básica';
}

// Normaliza texto removendo acentos e mapeando PT → EN
function normalizeForJooble(text) {
  const ptToEn = {
    'desenvolvedor': 'developer', 'desenvolvedor front-end': 'frontend developer',
    'desenvolvedor backend': 'backend developer', 'desenvolvedor fullstack': 'fullstack developer',
    'engenheiro de software': 'software engineer', 'analista de dados': 'data analyst',
    'cientista de dados': 'data scientist', 'designer': 'designer', 'ux designer': 'ux designer',
    'product manager': 'product manager', 'gerente de produto': 'product manager',
    'analista de marketing': 'marketing analyst', 'marketing': 'marketing',
    'recursos humanos': 'human resources', 'financeiro': 'finance', 'contabilidade': 'accounting',
    'suporte': 'support', 'vendas': 'sales', 'comercial': 'sales',
  };
  const lower = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return ptToEn[lower] || lower;
}

function normalizeLocation(cidade) {
  if (!cidade || cidade.toLowerCase().includes('remoto') || cidade.toLowerCase().includes('remote')) return 'Brazil';
  return cidade.normalize('NFD').replace(/[̀-ͯ]/g, '').replace('Sao Paulo', 'Sao Paulo').trim() + ', Brazil';
}

// Busca vagas na Jooble API
async function fetchJoobleJobs(profile) {
  if (!JOOBLE_API_KEY) {
    return [
      { title: profile.cargo_desejado + ' Pleno', company: 'Empresa Demo', location: profile.cidade || 'Brasil', snippet: 'Vaga de demonstração. Configure a JOOBLE_API_KEY para ver vagas reais.', link: 'https://vagaai.app.br', salary: '' },
      { title: profile.cargo_desejado + ' Sênior', company: 'Startup Demo', location: profile.cidade || 'Remoto', snippet: 'Configure a JOOBLE_API_KEY no Vercel para ativar a busca real de vagas.', link: 'https://vagaai.app.br', salary: '' },
    ];
  }

  const cargoEn = normalizeForJooble(profile.cargo_desejado || '');
  const kwEn = (profile.keywords || []).slice(0, 3).map(k => normalizeForJooble(k)).join(' ');
  const keywords = [cargoEn, kwEn].filter(Boolean).join(' ').trim();
  const location = normalizeLocation(profile.cidade);

  // Tenta busca principal, depois busca ampla se sem resultado
  async function doFetch(kw, loc) {
    const body = JSON.stringify({ keywords: kw, location: loc, page: 1, resultsOnPage: 20 });
    const res = await fetch(`https://jooble.org/api/${JOOBLE_API_KEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`Jooble ${res.status}`);
    const data = await res.json();
    return data.jobs || [];
  }

  let jobs = await doFetch(keywords, location);
  if (!jobs.length && location !== 'Brazil') jobs = await doFetch(keywords, 'Brazil');
  if (!jobs.length) jobs = await doFetch(cargoEn, 'Brazil');
  return jobs;
}

// Normaliza campos do objeto de vaga (Jooble pode variar)
function normalizeJob(j) {
  return {
    title: j.title || j.position || 'Vaga',
    company: j.company || j.employer || j.companyName || 'Empresa',
    location: j.location || j.city || 'Brasil',
    snippet: j.snippet || j.description || '',
    salary: j.salary || '',
    link: j.link || j.url || 'https://vagaai.app.br',
    _score: j._score || 0,
  };
}

// Remove vagas já enviadas para este usuário
async function filterSentJobs(userId, jobs) {
  if (!jobs.length) return [];
  const hashes = jobs.map(j => jobHash(j.title, j.company, j.location));
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/job_alert_sent?user_id=eq.${userId}&job_hash=in.(${hashes.join(',')})&select=job_hash`,
    { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
  );
  const sent = await res.json();
  const sentSet = new Set((sent || []).map(s => s.job_hash));
  return jobs.filter(j => !sentSet.has(jobHash(j.title, j.company, j.location)));
}

// Registra vagas enviadas
async function markJobsSent(userId, jobs) {
  if (!jobs.length) return;
  const rows = jobs.map(j => ({
    user_id: userId,
    job_hash: jobHash(j.title, j.company, j.location),
    job_title: j.title,
    job_company: j.company,
    job_url: j.link,
    sent_at: new Date().toISOString(),
  }));
  await fetch(`${SUPABASE_URL}/rest/v1/job_alert_sent`, {
    method: 'POST',
    headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates' },
    body: JSON.stringify(rows),
  });
}

// Gera HTML do email
function buildEmailHTML(profile, jobs, userName) {
  const name = userName || 'você';
  const jobsHTML = jobs.map(j => {
    const analyzeUrl = `https://www.vagaai.app.br/app?vaga=${encodeURIComponent(j.link)}`;
    const company = j.company || j.employer || 'Empresa';
    const companyInitial = company[0].toUpperCase();
    const colors = ['#820AD1','#EA1D2C','#21C25E','#F04E23','#003D7B','#FF6B00','#0061FF'];
    const color = colors[Math.abs(company.charCodeAt(0)) % colors.length];
    return `
    <div style="border:1px solid #e8f5ee;border-radius:10px;padding:14px;margin-bottom:10px;background:#fff;font-family:Arial,sans-serif">
      <div style="display:flex;gap:10px;align-items:flex-start">
        <div style="width:36px;height:36px;border-radius:8px;background:${color};display:inline-flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#fff;flex-shrink:0">${companyInitial}</div>
        <div style="flex:1">
          <div style="font-size:12px;font-weight:700;color:#555;margin-bottom:2px">${escEmail(company)}</div>
          <div style="font-size:14px;font-weight:700;color:#1a8f5c;margin-bottom:4px">${escEmail(j.title)}</div>
          <div style="font-size:11px;color:#888;margin-bottom:6px">📍 ${escEmail(j.location || 'Brasil')}${j.salary ? ' · 💰 ' + escEmail(j.salary) : ''}</div>
          <div style="font-size:11px;color:#f0a500;margin-bottom:6px">${starsFromScore(j._score)} <span style="color:#888">${compatLabel(j._score)}</span></div>
          <a href="${analyzeUrl}" style="display:inline-block;background:#1a8f5c;color:#fff;font-size:12px;font-weight:700;padding:6px 14px;border-radius:6px;text-decoration:none">⚡ Analisar essa vaga →</a>
        </div>
      </div>
    </div>`;
  }).join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f2f6f3;font-family:Arial,sans-serif">
<div style="max-width:600px;margin:0 auto;background:#fff">
  <div style="background:#0a1a10;padding:28px;text-align:center">
    <div style="font-family:Georgia,serif;font-size:24px;font-weight:700;color:#3ecf8e;margin-bottom:4px">VagaAI</div>
    <div style="font-size:12px;color:rgba(62,207,142,.6)">Seu copiloto para conseguir o emprego</div>
  </div>
  <div style="padding:24px">
    <div style="font-size:16px;font-weight:700;color:#111;margin-bottom:6px">Olá, ${escEmail(name)}! 👋</div>
    <div style="font-size:13px;color:#555;line-height:1.6;margin-bottom:20px">
      Encontramos <strong>${jobs.length} vaga${jobs.length > 1 ? 's novas' : ' nova'}</strong> compatíveis com seu perfil de
      <strong>${escEmail(profile.cargo_desejado)}</strong>${profile.cidade ? ' em <strong>' + escEmail(profile.cidade) + '</strong>' : ''}.
      Clique em "Analisar" para ver o score ATS real do seu currículo antes de candidatar.
    </div>
    ${jobsHTML}
    <div style="border-top:1px solid #eee;margin-top:20px;padding-top:16px;text-align:center;font-size:12px;color:#aaa;line-height:1.8">
      Compatibilidades acima são <em>estimadas</em>. O score real aparece após analisar.<br>
      <a href="https://www.vagaai.app.br/dashboard" style="color:#1a8f5c;text-decoration:none;font-weight:600">Gerenciar alertas</a>
      &nbsp;·&nbsp;
      <a href="https://www.vagaai.app.br/dashboard" style="color:#aaa;text-decoration:none">Cancelar inscrição</a>
    </div>
  </div>
  <div style="background:#f9f9f9;padding:14px;text-align:center;font-size:11px;color:#bbb;border-top:1px solid #eee">
    © 2026 VagaAI · <a href="https://vagaai.app.br" style="color:#1a8f5c;text-decoration:none">vagaai.app.br</a>
  </div>
</div>
</body></html>`;
}

function escEmail(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// Processa alertas para um usuário
async function processUserAlert(profile, isTest = false) {
  const userId = profile.user_id;
  const email = profile.email;
  if (!email) return { skipped: 'no email' };

  // Busca vagas
  let jobs = await fetchJoobleJobs(profile);

  // Remove já enviadas (exceto em modo teste)
  if (!isTest) {
    jobs = await filterSentJobs(userId, jobs);
  }

  if (!jobs.length) return { skipped: 'no new jobs' };

  // Normaliza e calcula scores
  jobs = jobs
    .map(j => normalizeJob({ ...j, _score: calcScore(j, profile) }))
    .sort((a, b) => b._score - a._score)
    .slice(0, 8);

  // Busca nome do usuário
  let userName = email.split('@')[0];
  try {
    const ur = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` }
    });
    const ud = await ur.json();
    if (ud.user_metadata?.name) userName = ud.user_metadata.name.split(' ')[0];
  } catch(e) {}

  // Envia email
  const html = buildEmailHTML(profile, jobs, userName);
  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'VagaAI Alertas <alertas@vagaai.app.br>',
      to: [email],
      subject: `🎯 ${jobs.length} vaga${jobs.length > 1 ? 's novas' : ' nova'} compatíveis com seu perfil`,
      html,
    }),
  });

  if (!emailRes.ok) {
    const err = await emailRes.text();
    throw new Error(`Resend error: ${err}`);
  }

  // Registra vagas enviadas e atualiza último envio
  if (!isTest) {
    await markJobsSent(userId, jobs);
    await fetch(`${SUPABASE_URL}/rest/v1/job_alert_profiles?user_id=eq.${userId}`, {
      method: 'PATCH',
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ ultimo_envio: new Date().toISOString() }),
    });
  }

  return { sent: true, jobs: jobs.length, email };
}

export default async function handler(req, res) {
  // Segurança: verifica Authorization ou secret
  const authHeader = req.headers.authorization || '';
  const isTest = req.query.test === '1';
  const testUserId = req.query.user_id;

  if (!isTest) {
    // Chamada do cron: verifica CRON_SECRET
    const secret = CRON_SECRET || 'vagaai-cron-secret-2026';
    if (authHeader !== `Bearer ${secret}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: 'Missing Supabase config' });
  }
  if (!RESEND_API_KEY) {
    return res.status(500).json({ error: 'Missing RESEND_API_KEY' });
  }

  try {
    let profiles;

    if (isTest && testUserId) {
      // Modo teste: só para o usuário atual
      const r = await fetch(`${SUPABASE_URL}/rest/v1/job_alert_profiles?user_id=eq.${testUserId}&select=*`, {
        headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` }
      });
      profiles = await r.json();
      if (!profiles?.length) return res.status(404).json({ error: 'Perfil de alerta não encontrado. Configure o perfil primeiro.' });
    } else {
      // Cron: todos os usuários ativos
      const r = await fetch(`${SUPABASE_URL}/rest/v1/job_alert_profiles?ativo=eq.true&select=*`, {
        headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` }
      });
      profiles = await r.json();
    }

    const results = [];
    for (const profile of profiles) {
      try {
        const result = await processUserAlert(profile, isTest);
        results.push({ user: profile.user_id, ...result });
        console.log(`Alert sent: user=${profile.user_id} jobs=${result.jobs || 0}`);
      } catch (e) {
        console.error(`Alert error for ${profile.user_id}:`, e.message);
        results.push({ user: profile.user_id, error: e.message });
      }
    }

    return res.status(200).json({ ok: true, processed: results.length, results });
  } catch (err) {
    console.error('send-alerts error:', err);
    return res.status(500).json({ error: err.message });
  }
}
