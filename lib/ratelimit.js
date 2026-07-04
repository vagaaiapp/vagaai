// lib/ratelimit.js
// Rate limit persistente por chave arbitrária, usando a tabela ip_rate_limits
// (PK: ip text — além de IPs reais, aceita chaves sintéticas como
// "u:<userId>:carta"). Substitui os Maps em memória de cover-letter.js e
// interview.js, que zeravam a cada cold start do serverless e não seguravam
// abuso de custo de IA.
//
// Janela fixa ancorada em first_seen. Fail-open em erro de infra (mesma
// política do rate limit anônimo em analyze.js: indisponibilidade do banco
// não pode derrubar feature paga). A corrida read-increment pode subcontar
// em requisições simultâneas — aceitável para limite de abuso.
//
// A limpeza de linhas velhas (last_seen > 30 dias) já é feita pelo cleanup
// fire-and-forget em analyze.js e vale para estas chaves também.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

export async function checkAndCountLimit({ key, limit, windowMs }) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return true;
  const headers = {
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
  };
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/ip_rate_limits?ip=eq.${encodeURIComponent(key)}&select=count,first_seen`,
      { headers }
    );
    if (!r.ok) throw new Error(`GET ${r.status}`);
    const rows = await r.json();
    const row = rows?.[0];
    const nowIso = new Date().toISOString();

    if (row && Date.now() - new Date(row.first_seen).getTime() < windowMs) {
      if ((row.count || 0) >= limit) return false;
      await fetch(`${SUPABASE_URL}/rest/v1/ip_rate_limits?ip=eq.${encodeURIComponent(key)}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ count: (row.count || 0) + 1, last_seen: nowIso }),
      });
      return true;
    }

    // Sem linha ou janela expirada → (re)inicia a janela com count=1
    await fetch(`${SUPABASE_URL}/rest/v1/ip_rate_limits?on_conflict=ip`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ ip: key, count: 1, first_seen: nowIso, last_seen: nowIso }),
    });
    return true;
  } catch (e) {
    console.error('ratelimit error:', e.message);
    return true; // fail-open
  }
}
