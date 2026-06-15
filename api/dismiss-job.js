// /api/dismiss-job.js
// Registra a exclusão de uma vaga pelo usuário: insere em job_alert_sent com dismissed_reason.
// A vaga entra no dedup de 60 dias e não aparece em envios futuros.

import crypto from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

function jobHash(title, company, location) {
  return crypto.createHash('md5')
    .update(((title || '') + (company || '') + (location || '')).toLowerCase())
    .digest('hex').slice(0, 16);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: 'Supabase não configurado' });
  }

  const authHeader = req.headers.authorization || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!bearerToken) return res.status(401).json({ error: 'Token obrigatório' });

  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${bearerToken}` },
  });
  if (!userRes.ok) return res.status(401).json({ error: 'Token inválido ou expirado' });
  const userData = await userRes.json();
  const userId = userData?.id;
  if (!userId) return res.status(401).json({ error: 'Usuário não identificado' });

  const { job_link, job_title, job_company, job_location, reason } = req.body || {};
  if (!job_link) return res.status(400).json({ error: 'job_link obrigatório' });

  const hash = jobHash(job_title || '', job_company || '', job_location || '');
  const now = new Date().toISOString();

  const r = await fetch(`${SUPABASE_URL}/rest/v1/job_alert_sent`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({
      user_id: userId,
      job_hash: hash,
      job_title: (job_title || '').slice(0, 255),
      job_company: (job_company || '').slice(0, 255),
      job_url: (job_link || '').slice(0, 1000),
      sent_at: now,
      dismissed_reason: reason || null,
      dismissed_at: reason ? now : null,
    }),
  });

  if (!r.ok) {
    const err = await r.text();
    console.error('dismiss-job upsert failed:', err);
    return res.status(500).json({ error: 'Erro ao registrar exclusão' });
  }

  return res.status(200).json({ ok: true, hash });
}
