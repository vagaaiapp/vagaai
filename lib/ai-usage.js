const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Precos de referencia do Claude Haiku 4.5 por milhao de tokens. O valor
// salvo e uma estimativa operacional; os tokens brutos permanecem na tabela
// para reconciliacao com a fatura real, inclusive se o preco mudar.
const HAIKU_45_USD_PER_MILLION = {
  input: 1,
  output: 5,
  cacheWrite: 1.25,
  cacheRead: 0.10,
};

let telemetryUnavailableUntil = 0;

function nonNegativeInt(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

export function anthropicUsageRecord(data, context = {}) {
  const usage = data?.usage || {};
  const input = nonNegativeInt(usage.input_tokens);
  const output = nonNegativeInt(usage.output_tokens);
  const cacheWrite = nonNegativeInt(usage.cache_creation_input_tokens);
  const cacheRead = nonNegativeInt(usage.cache_read_input_tokens);
  const estimated = (
    input * HAIKU_45_USD_PER_MILLION.input
    + output * HAIKU_45_USD_PER_MILLION.output
    + cacheWrite * HAIKU_45_USD_PER_MILLION.cacheWrite
    + cacheRead * HAIKU_45_USD_PER_MILLION.cacheRead
  ) / 1_000_000;

  return {
    user_id: context.userId || null,
    endpoint: String(context.endpoint || '').slice(0, 80),
    action: String(context.action || '').slice(0, 80),
    model: String(data?.model || context.model || '').slice(0, 100),
    prompt_version: String(context.promptVersion || '').slice(0, 80) || null,
    input_tokens: input,
    output_tokens: output,
    cache_creation_input_tokens: cacheWrite,
    cache_read_input_tokens: cacheRead,
    estimated_cost_usd: Number(estimated.toFixed(8)),
    provider_request_id: String(context.requestId || '').slice(0, 160) || null,
  };
}

export async function recordAnthropicUsage(data, context = {}) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !data?.usage) return false;
  if (Date.now() < telemetryUnavailableUntil) return false;
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/ai_usage_events`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(anthropicUsageRecord(data, context)),
      signal: AbortSignal.timeout(1200),
    });
    if (!response.ok) {
      // Durante uma implantacao gradual, a funcao pode chegar antes da
      // migration. Evita repetir uma chamada sem utilidade em toda geracao.
      if (response.status === 404) telemetryUnavailableUntil = Date.now() + 5 * 60 * 1000;
      console.warn('ai_usage_events insert HTTP', response.status);
      return false;
    }
    return true;
  } catch (error) {
    // Telemetria nunca interrompe a entrega principal.
    console.warn('ai_usage_events insert error:', error.message);
    return false;
  }
}
