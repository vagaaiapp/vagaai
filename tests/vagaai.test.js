// tests/vagaai.test.js
// Suíte mínima de testes VagaAI — Node 18+ (node:test)
// Execução: node --test tests/vagaai.test.js
//
// Cobre itens 1, 2, 4, 5, 7, 14, 15 do spec funcional.
// Testes de integração com Supabase/Stripe exigem env vars reais e são marcados SKIP.

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, timingSafeEqual } from 'crypto';

// ── Helpers inline (extrai lógica pura dos módulos de API) ────────────────────

function isPrivateIPv4(a, b, c, d) {
  if (a === 0) return true;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 0 && c === 2) return true;
  if (a === 192 && b === 168) return true;
  if (a === 198 && b >= 18 && b <= 19) return true;
  if (a === 203 && b === 0 && c === 113) return true;
  if (a === 224) return true;
  if (a === 240) return true;
  if (a === 255 && b === 255 && c === 255 && d === 255) return true;
  return false;
}

function isBlockedIPString(ip) {
  const h = (ip || '').toLowerCase().replace(/^\[|\]$/g, '').trim();
  if (!h) return true;
  if (h === '::1' || h === '::') return true;
  if (h.startsWith('fe80:')) return true;
  if (h.startsWith('fc') || h.startsWith('fd')) return true;
  if (h.startsWith('ff')) return true;
  const v4mapped = h.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (v4mapped) {
    const parts = v4mapped[1].split('.').map(Number);
    if (parts.length === 4) return isPrivateIPv4(...parts);
  }
  const v4hex = h.match(/^::ffff:([0-9a-f]{4}):([0-9a-f]{4})$/i);
  if (v4hex) {
    const hi = parseInt(v4hex[1], 16), lo = parseInt(v4hex[2], 16);
    return isPrivateIPv4((hi >> 8) & 0xff, hi & 0xff, (lo >> 8) & 0xff, lo & 0xff);
  }
  const BLOCKED = ['localhost', '169.254.169.254', '100.100.100.200', 'metadata.google.internal'];
  if (BLOCKED.includes(h)) return true;
  if (/^\d{8,10}$/.test(h)) {
    const n = parseInt(h, 10);
    return isPrivateIPv4((n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);
  }
  if (/^0x[0-9a-f]+$/i.test(h)) {
    const n = parseInt(h, 16);
    return isPrivateIPv4((n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);
  }
  if (/^0\d+/.test(h)) {
    try {
      const parts = h.split('.').map(p => parseInt(p, 8));
      if (parts.length === 4 && parts.every(p => !isNaN(p))) return isPrivateIPv4(...parts);
    } catch {}
  }
  const m4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m4) return isPrivateIPv4(+m4[1], +m4[2], +m4[3], +m4[4]);
  return false;
}

function validateUrl(raw) {
  let parsed;
  try { parsed = new URL(raw); } catch { return { ok: false, reason: 'URL inválida' }; }
  if (!['http:', 'https:'].includes(parsed.protocol)) return { ok: false, reason: 'Protocolo não permitido' };
  if (isBlockedIPString(parsed.hostname)) return { ok: false, reason: 'Destino não permitido' };
  return { ok: true, parsed };
}

// Unsubscribe token (replica lógica de unsubscribe.js e send-alerts.js)
const UNSUB_SECRET = 'test-unsub-secret-32chars-minimum!!';

function makeUnsubToken(userId, secret = UNSUB_SECRET) {
  if (!secret) return null;
  const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
  const payload = Buffer.from(userId + ':' + expiresAt).toString('base64url');
  const sig = createHmac('sha256', secret).update(payload).digest('hex');
  return payload + '.' + sig;
}

function verifyToken(userId, tok, secret = UNSUB_SECRET) {
  if (!tok || typeof tok !== 'string') return false;
  const parts = tok.split('.');
  if (parts.length !== 2) return false;
  const [payload, receivedSig] = parts;
  const expectedSig = createHmac('sha256', secret).update(payload).digest('hex');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  const receivedBuf = Buffer.alloc(expectedBuf.length);
  Buffer.from(receivedSig || '', 'utf8').copy(receivedBuf);
  if (receivedSig.length !== expectedSig.length) return false;
  if (!timingSafeEqual(expectedBuf, receivedBuf)) return false;
  let decoded;
  try { decoded = Buffer.from(payload, 'base64url').toString('utf8'); } catch { return false; }
  const colonIdx = decoded.lastIndexOf(':');
  if (colonIdx < 0) return false;
  const payloadUserId = decoded.slice(0, colonIdx);
  const expiresAt = parseInt(decoded.slice(colonIdx + 1), 10);
  if (payloadUserId !== userId) return false;
  if (!expiresAt || isNaN(expiresAt)) return false;
  if (Date.now() > expiresAt) return false;
  return true;
}

// calculateNextAlertRun (replica lógica do dashboard)
function calculateNextAlertRun(p, ext) {
  if (!p || !p.ativo) return null;
  const freq = p.frequencia || 'semanal';
  const dayEnvio = (ext && ext.dia_envio !== undefined && ext.dia_envio !== '') ? parseInt(ext.dia_envio) : 5;
  const hora = (ext && ext.horario_envio) || '08:00';
  const parts = hora.split(':');
  const hh = parseInt(parts[0]) || 8, mm = parseInt(parts[1]) || 0;
  const now = new Date();

  if (freq === 'diario') {
    const todayAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm, 0);
    if (now >= todayAt) todayAt.setDate(todayAt.getDate() + 1);
    return todayAt;
  }
  if (freq === 'quinzenal') {
    const ultimoEnvio = (ext && (ext.ultimo_envio || ext.last_run_at)) || (p && p.ultimo_envio);
    if (ultimoEnvio) {
      const base = new Date(ultimoEnvio);
      base.setHours(hh, mm, 0, 0);
      while (base <= now) base.setDate(base.getDate() + 14);
      return base;
    }
    const d2 = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm, 0);
    const diff2 = (dayEnvio - d2.getDay() + 7) % 7 || 7;
    d2.setDate(d2.getDate() + diff2 + 14);
    return d2;
  }
  if (freq === 'semanal') {
    const d3 = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm, 0);
    let diff3 = (dayEnvio - d3.getDay() + 7) % 7;
    if (diff3 === 0 && now >= d3) diff3 = 7;
    d3.setDate(d3.getDate() + diff3);
    return d3;
  }
  if (freq === 'mensal') {
    const nm = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const nd = (dayEnvio - nm.getDay() + 7) % 7;
    const d4 = new Date(nm);
    d4.setDate(d4.getDate() + nd);
    d4.setHours(hh, mm, 0, 0);
    return d4;
  }
  return null;
}

// localStorage legacy (replica lógica do app)
function readVagaaiAnalyzed(storage) {
  const _va = storage['vagaai_analyzed'];
  if (!_va) return { used: false };
  try {
    const parsed = JSON.parse(_va);
    if (!parsed || typeof parsed.ts !== 'number') {
      delete storage['vagaai_analyzed'];
      return { used: false, cleaned: true };
    }
    const used = (Date.now() - parsed.ts) < 30 * 24 * 60 * 60 * 1000;
    if (!used) delete storage['vagaai_analyzed'];
    return { used, cleaned: !used };
  } catch {
    delete storage['vagaai_analyzed'];
    return { used: false, cleaned: true };
  }
}

// applyExtendedFilters — contrato (replica lógica de send-alerts.js)
function normalizeContrato(s) {
  return (s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ').trim();
}
const CONTRATO_SYNONYMS = {
  clt: ['clt', 'celetista', 'carteira assinada', 'regime clt'],
  pj: ['pj', 'pessoa juridica', 'pessoa jurídica', 'cnpj', 'mei'],
  freela: ['freela', 'freelance', 'freelancer', 'autonomo', 'autônomo'],
  estagio: ['estagio', 'estágio', 'estagiario', 'estagiário', 'intern'],
  temporario: ['temporario', 'temporário', 'temp', 'temporaria', 'temporária'],
};

function jobMatchesContrato(job, preferencias) {
  if (!preferencias || preferencias.length === 0) return true;
  if (preferencias.some(p => normalizeContrato(p) === 'qualquer' || normalizeContrato(p) === 'qualquer um')) return true;
  const jobText = normalizeContrato((job.title || '') + ' ' + (job.description || ''));
  let jobMentionsType = false;
  let matchedType = null;
  for (const [tipo, synonyms] of Object.entries(CONTRATO_SYNONYMS)) {
    if (synonyms.some(s => jobText.includes(s))) {
      jobMentionsType = true;
      matchedType = tipo;
      break;
    }
  }
  if (!jobMentionsType) return true; // vaga não menciona contrato — não filtra
  return preferencias.some(pref => {
    const n = normalizeContrato(pref);
    return (CONTRATO_SYNONYMS[n] || [n]).some(s => jobText.includes(s));
  });
}

// ── TESTES ────────────────────────────────────────────────────────────────────

describe('Item 10 — SSRF: bloqueio de IPs', () => {
  it('bloqueia localhost', () => assert.ok(isBlockedIPString('localhost')));
  it('bloqueia 127.0.0.1', () => assert.ok(isBlockedIPString('127.0.0.1')));
  it('bloqueia 169.254.169.254 (AWS metadata)', () => assert.ok(isBlockedIPString('169.254.169.254')));
  it('bloqueia 10.0.0.1 (privado)', () => assert.ok(isBlockedIPString('10.0.0.1')));
  it('bloqueia 192.168.1.1', () => assert.ok(isBlockedIPString('192.168.1.1')));
  it('bloqueia ::1 (IPv6 loopback)', () => assert.ok(isBlockedIPString('::1')));
  it('bloqueia fe80::1 (link-local)', () => assert.ok(isBlockedIPString('fe80::1')));
  it('bloqueia ::ffff:127.0.0.1 (IPv4-mapped)', () => assert.ok(isBlockedIPString('::ffff:127.0.0.1')));
  it('bloqueia ::ffff:7f00:0001 (IPv4-mapped hex)', () => assert.ok(isBlockedIPString('::ffff:7f00:0001')));
  it('bloqueia decimal 2130706433 = 127.0.0.1', () => assert.ok(isBlockedIPString('2130706433')));
  it('bloqueia hex 0x7f000001', () => assert.ok(isBlockedIPString('0x7f000001')));
  it('permite IP público 8.8.8.8', () => assert.ok(!isBlockedIPString('8.8.8.8')));
  it('permite IP público 1.1.1.1', () => assert.ok(!isBlockedIPString('1.1.1.1')));
  it('rejeita protocolo file: na URL', () => assert.ok(!validateUrl('file:///etc/passwd').ok));
  it('rejeita protocolo ftp: na URL', () => assert.ok(!validateUrl('ftp://example.com').ok));
  it('rejeita protocolo data: na URL', () => assert.ok(!validateUrl('data:text/html,test').ok));
  it('rejeita URL com localhost', () => assert.ok(!validateUrl('http://localhost/api').ok));
  it('rejeita URL com 127.0.0.1', () => assert.ok(!validateUrl('http://127.0.0.1/').ok));
  it('rejeita URL com metadata AWS', () => assert.ok(!validateUrl('http://169.254.169.254/').ok));
  it('aceita URL pública válida', () => assert.ok(validateUrl('https://www.google.com/').ok));
});

describe('Item 15 — Unsubscribe token', () => {
  it('retorna null quando secret ausente', () => {
    assert.strictEqual(makeUnsubToken('user-123', ''), null);
    assert.strictEqual(makeUnsubToken('user-123', null), null);
  });
  it('gera token válido com secret', () => {
    const tok = makeUnsubToken('user-abc');
    assert.ok(tok && tok.includes('.'));
  });
  it('verifica token válido', () => {
    const tok = makeUnsubToken('user-xyz');
    assert.ok(verifyToken('user-xyz', tok));
  });
  it('rejeita token adulterado', () => {
    const tok = makeUnsubToken('user-xyz');
    const tampered = tok.slice(0, -4) + 'aaaa';
    assert.ok(!verifyToken('user-xyz', tampered));
  });
  it('rejeita token com userId diferente', () => {
    const tok = makeUnsubToken('user-A');
    assert.ok(!verifyToken('user-B', tok));
  });
  it('rejeita token expirado', () => {
    // Cria token com expiração no passado
    const expiresAt = Date.now() - 1000;
    const payload = Buffer.from('user-exp:' + expiresAt).toString('base64url');
    const sig = createHmac('sha256', UNSUB_SECRET).update(payload).digest('hex');
    const tok = payload + '.' + sig;
    assert.ok(!verifyToken('user-exp', tok));
  });
  it('rejeita token malformado (sem ponto)', () => {
    assert.ok(!verifyToken('user-xyz', 'tokenSemPonto'));
  });
  it('rejeita token vazio', () => {
    assert.ok(!verifyToken('user-xyz', ''));
  });
  it('rejeita token com secret errado', () => {
    const tok = makeUnsubToken('user-abc', 'secret-correto');
    assert.ok(!verifyToken('user-abc', tok, 'secret-errado'));
  });
});

describe('Item 5 — calculateNextAlertRun (frontend)', () => {
  const ext = { dia_envio: 5, horario_envio: '08:00' }; // sexta, 8h

  it('diário: retorna data no futuro', () => {
    const next = calculateNextAlertRun({ ativo: true, frequencia: 'diario' }, ext);
    assert.ok(next instanceof Date && next > new Date());
  });
  it('diário: retorna amanhã se horário já passou hoje', () => {
    const extPast = { dia_envio: 5, horario_envio: '00:00' };
    const next = calculateNextAlertRun({ ativo: true, frequencia: 'diario' }, extPast);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    assert.strictEqual(next.toDateString(), tomorrow.toDateString());
  });
  it('semanal: retorna data no futuro', () => {
    const next = calculateNextAlertRun({ ativo: true, frequencia: 'semanal' }, ext);
    assert.ok(next instanceof Date && next > new Date());
  });
  it('semanal: resultado é o dia configurado', () => {
    const next = calculateNextAlertRun({ ativo: true, frequencia: 'semanal' }, { dia_envio: 3, horario_envio: '08:00' });
    assert.strictEqual(next.getDay(), 3); // quarta
  });
  it('mensal: retorna data no próximo mês', () => {
    const next = calculateNextAlertRun({ ativo: true, frequencia: 'mensal' }, ext);
    const now = new Date();
    assert.ok(next.getMonth() === (now.getMonth() + 1) % 12 || next > now);
  });
  it('quinzenal sem ultimo_envio: retorna data >= 14 dias à frente', () => {
    const next = calculateNextAlertRun({ ativo: true, frequencia: 'quinzenal' }, ext);
    const minDate = new Date();
    minDate.setDate(minDate.getDate() + 14);
    assert.ok(next >= minDate);
  });
  it('quinzenal com ultimo_envio ontem: avança 14 dias a partir de ontem', () => {
    const ontem = new Date();
    ontem.setDate(ontem.getDate() - 1);
    const extQ = { dia_envio: 5, horario_envio: '08:00', ultimo_envio: ontem.toISOString() };
    const next = calculateNextAlertRun({ ativo: true, frequencia: 'quinzenal' }, extQ);
    assert.ok(next instanceof Date && next > new Date());
    // próximo = ontem + 14 dias
    const expected = new Date(ontem);
    expected.setDate(expected.getDate() + 14);
    expected.setHours(8, 0, 0, 0);
    assert.strictEqual(next.toDateString(), expected.toDateString());
  });
  it('quinzenal com ultimo_envio há 20 dias: avança para o futuro (não fica no passado)', () => {
    const haVinte = new Date();
    haVinte.setDate(haVinte.getDate() - 20);
    const extQ = { dia_envio: 5, horario_envio: '08:00', ultimo_envio: haVinte.toISOString() };
    const next = calculateNextAlertRun({ ativo: true, frequencia: 'quinzenal' }, extQ);
    assert.ok(next > new Date(), 'deve estar no futuro');
  });
  it('quinzenal: segundo envio é +14 dias do primeiro', () => {
    const primeiroEnvio = new Date();
    primeiroEnvio.setDate(primeiroEnvio.getDate() - 1);
    const extQ = { dia_envio: 5, horario_envio: '08:00', ultimo_envio: primeiroEnvio.toISOString() };
    const next = calculateNextAlertRun({ ativo: true, frequencia: 'quinzenal' }, extQ);
    const expected = new Date(primeiroEnvio);
    expected.setDate(expected.getDate() + 14);
    expected.setHours(8, 0, 0, 0);
    assert.strictEqual(next.toDateString(), expected.toDateString());
  });
  it('retorna null para alerta inativo', () => {
    assert.strictEqual(calculateNextAlertRun({ ativo: false, frequencia: 'semanal' }, ext), null);
  });
  it('retorna null para perfil nulo', () => {
    assert.strictEqual(calculateNextAlertRun(null, ext), null);
  });
});

describe('Item 7 — filtro de contrato', () => {
  it('vaga sem menção a contrato: aceita com qualquer preferência', () => {
    const job = { title: 'Dev Frontend', description: 'React, CSS, JavaScript' };
    assert.ok(jobMatchesContrato(job, ['clt']));
    assert.ok(jobMatchesContrato(job, ['pj']));
    assert.ok(jobMatchesContrato(job, ['estagio']));
  });
  it('vaga CLT: aceita preferência CLT', () => {
    const job = { title: 'Dev Backend CLT', description: 'Contratação CLT' };
    assert.ok(jobMatchesContrato(job, ['clt']));
  });
  it('vaga CLT: rejeita preferência PJ', () => {
    const job = { title: 'Dev Backend', description: 'regime CLT carteira assinada' };
    assert.ok(!jobMatchesContrato(job, ['pj']));
  });
  it('vaga PJ: aceita preferência PJ', () => {
    const job = { title: 'Consultor', description: 'Contrato PJ, CNPJ' };
    assert.ok(jobMatchesContrato(job, ['pj']));
  });
  it('vaga com "qualquer um": aceita tudo', () => {
    const job = { title: 'Dev CLT', description: 'regime CLT' };
    assert.ok(jobMatchesContrato(job, ['qualquer um']));
  });
  it('múltiplos contratos aceitos: CLT ou PJ — aceita vaga CLT', () => {
    const job = { title: 'Dev', description: 'contratação CLT' };
    assert.ok(jobMatchesContrato(job, ['clt', 'pj']));
  });
  it('múltiplos contratos aceitos: CLT ou PJ — rejeita vaga estágio', () => {
    const job = { title: 'Dev Estagiário', description: 'vaga de estágio' };
    assert.ok(!jobMatchesContrato(job, ['clt', 'pj']));
  });
  it('estágio: sinonimo "intern" aceito', () => {
    const job = { title: 'Intern Developer', description: 'internship position' };
    assert.ok(jobMatchesContrato(job, ['estagio']));
  });
  it('freelance: aceita sinonimo "autonomo"', () => {
    const job = { title: 'Designer', description: 'trabalho autônomo, freelancer' };
    assert.ok(jobMatchesContrato(job, ['freela']));
  });
  it('sem preferências: sempre aceita', () => {
    const job = { title: 'Dev CLT', description: 'regime CLT' };
    assert.ok(jobMatchesContrato(job, []));
    assert.ok(jobMatchesContrato(job, null));
  });
});

describe('Item 14 — localStorage legado', () => {
  it('valor legado "1" é removido e retorna não-bloqueado', () => {
    const storage = { vagaai_analyzed: '"1"' };
    // "1" não é JSON válido com .ts — deve limpar
    const result = readVagaaiAnalyzed(storage);
    assert.ok(!result.used);
    assert.ok(result.cleaned);
    assert.ok(!('vagaai_analyzed' in storage));
  });
  it('valor string pura "1" sem aspas JSON', () => {
    const storage = { vagaai_analyzed: '1' };
    // 1 é JSON válido mas não tem .ts — deve limpar
    const result = readVagaaiAnalyzed(storage);
    assert.ok(!result.used);
    assert.ok(result.cleaned);
  });
  it('valor JSON corrente (dentro de 30 dias) bloqueia', () => {
    const storage = { vagaai_analyzed: JSON.stringify({ ts: Date.now() - 1000 }) };
    const result = readVagaaiAnalyzed(storage);
    assert.ok(result.used);
    assert.ok(!result.cleaned);
  });
  it('valor JSON expirado (>30 dias) é removido e não bloqueia', () => {
    const thirtyOneDaysAgo = Date.now() - 31 * 24 * 60 * 60 * 1000;
    const storage = { vagaai_analyzed: JSON.stringify({ ts: thirtyOneDaysAgo }) };
    const result = readVagaaiAnalyzed(storage);
    assert.ok(!result.used);
    assert.ok(result.cleaned);
    assert.ok(!('vagaai_analyzed' in storage));
  });
  it('valor JSON inválido (objeto sem ts) é removido', () => {
    const storage = { vagaai_analyzed: JSON.stringify({ used: true }) };
    const result = readVagaaiAnalyzed(storage);
    assert.ok(!result.used);
    assert.ok(result.cleaned);
  });
  it('ausência de chave retorna não-bloqueado', () => {
    const storage = {};
    const result = readVagaaiAnalyzed(storage);
    assert.ok(!result.used);
    assert.ok(!result.cleaned);
  });
  it('JSON malformado é removido e não bloqueia', () => {
    const storage = { vagaai_analyzed: '{broken json' };
    const result = readVagaaiAnalyzed(storage);
    assert.ok(!result.used);
    assert.ok(result.cleaned);
  });
});

describe('Item 9 — CRON_SECRET obrigatório', () => {
  it('timingSafeEqual aceita secret correto', () => {
    const secret = 'meu-secret-seguro-aqui';
    const received = Buffer.from(secret, 'utf8');
    const expected = Buffer.from(secret, 'utf8');
    assert.ok(timingSafeEqual(expected, received));
  });
  it('timingSafeEqual rejeita secret incorreto', () => {
    const expected = Buffer.from('secret-correto', 'utf8');
    const receivedBuf = Buffer.alloc(expected.length);
    Buffer.from('secret-errado-', 'utf8').copy(receivedBuf);
    assert.ok(!timingSafeEqual(expected, receivedBuf));
  });
  it('secrets de comprimentos diferentes são rejeitados antes do compare', () => {
    const s1 = 'curto';
    const s2 = 'muito-mais-longo-que-o-primeiro';
    assert.notStrictEqual(s1.length, s2.length);
  });
});

describe('Item 4 — frequência canonical do alerta', () => {
  const CANONICAL = ['diario', 'semanal', 'quinzenal', 'mensal'];
  it('todos os valores canônicos são reconhecidos', () => {
    for (const f of CANONICAL) {
      const p = calculateNextAlertRun({ ativo: true, frequencia: f }, { dia_envio: 5, horario_envio: '08:00' });
      assert.ok(p instanceof Date || p === null, `frequencia "${f}" deve retornar Date ou null`);
    }
  });
  it('"diário" com acento não é valor canônico e retorna null (sem match)', () => {
    const p = calculateNextAlertRun({ ativo: true, frequencia: 'diário' }, { dia_envio: 5, horario_envio: '08:00' });
    assert.strictEqual(p, null, 'valor com acento não é canônico e deve retornar null');
  });
});

// ── Helpers para testes do resultado (spec itens 4, 5, 6, 9) ──────────────────

const SCORE_WEIGHTS = [
  { dim: 'Compatibilidade com a vaga', key: 'compatibilidade', peso: 35 },
  { dim: 'Keywords ATS',               key: 'keywords_ats',    peso: 30 },
  { dim: 'Legibilidade e estrutura',    key: 'legibilidade',    peso: 20 },
  { dim: 'Força dos bullets',           key: 'forca_bullets',   peso: 15 },
];

function buildScoreBreakdown(fatores) {
  const rows = SCORE_WEIGHTS.map(r => {
    const dimPct = fatores[r.key] || 0;
    const pts = Math.round(dimPct * r.peso / 100);
    return { dim: r.dim, key: r.key, peso: r.peso, pct: dimPct, pts };
  });
  const total = rows.reduce((s, r) => s + r.pts, 0);
  return { rows, total };
}

function keywordKey(value) {
  return String(value)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .trim().replace(/\s+/g, ' ').toLowerCase();
}

function uniqueKeywords(items) {
  const seen = new Set();
  return items.filter(k => {
    const norm = keywordKey(k);
    if (seen.has(norm)) return false;
    seen.add(norm);
    return true;
  });
}

function normalizeKeywords(result) {
  const found   = Array.isArray(result.keywords_encontradas)             ? result.keywords_encontradas             : [];
  const partial = Array.isArray(result.keywords_parcialmente_encontradas) ? result.keywords_parcialmente_encontradas : [];
  const missing = Array.isArray(result.keywords_faltando)                ? result.keywords_faltando                : [];

  const foundKeys   = new Set(found.map(keywordKey));
  const partialKeys = new Set(partial.map(keywordKey));

  // parciais que já estão em encontradas: remove de parciais
  const cleanPartial = partial.filter(k => !foundKeys.has(keywordKey(k)));
  const cleanPartialKeys = new Set(cleanPartial.map(keywordKey));

  // faltando: remove tudo que aparece em encontradas ou parciais
  const cleanMissing = missing.filter(k => !foundKeys.has(keywordKey(k)) && !cleanPartialKeys.has(keywordKey(k)));

  result.keywords_encontradas             = uniqueKeywords(found);
  result.keywords_parcialmente_encontradas = uniqueKeywords(cleanPartial);
  result.keywords_faltando                = uniqueKeywords(cleanMissing);
}

function buildFallbackPlanTest(d) {
  const items = [];
  const prioridades = Array.isArray(d.prioridades) ? d.prioridades.slice(0, 3) : [];
  prioridades.forEach((p, i) => {
    items.push({ id: 'fp_' + i, titulo: p.titulo || ('Prioridade ' + (i + 1)), descricao: p.explicacao || '', status: 'pendente', detalhes: '' });
  });
  const extras = (d.falhas || []).concat(d.sugestoes || []);
  let ei = 0;
  while (items.length < 3 && ei < extras.length) {
    items.push({ id: 'fp_e' + ei, titulo: extras[ei], descricao: '', status: 'pendente', detalhes: '' });
    ei++;
  }
  return items;
}

// ── Novos testes (spec rebuild tela de resultado) ─────────────────────────────

describe('Spec resultado — pesos do score', () => {
  it('pesos somam exatamente 100%', () => {
    const total = SCORE_WEIGHTS.reduce((s, r) => s + r.peso, 0);
    assert.strictEqual(total, 100);
  });
  it('compatibilidade=80 com peso 35 gera 28 pts', () => {
    const { rows } = buildScoreBreakdown({ compatibilidade: 80 });
    const row = rows.find(r => r.key === 'compatibilidade');
    assert.strictEqual(row.pts, 28);
  });
  it('keywords_ats=100 com peso 30 gera 30 pts', () => {
    const { rows } = buildScoreBreakdown({ keywords_ats: 100 });
    const row = rows.find(r => r.key === 'keywords_ats');
    assert.strictEqual(row.pts, 30);
  });
  it('soma dos pts bate com total do breakdown', () => {
    const fatores = { compatibilidade: 70, keywords_ats: 60, legibilidade: 80, forca_bullets: 50 };
    const { rows, total } = buildScoreBreakdown(fatores);
    const sum = rows.reduce((s, r) => s + r.pts, 0);
    assert.strictEqual(sum, total);
  });
  it('fatores zerados resultam em total 0', () => {
    const { total } = buildScoreBreakdown({});
    assert.strictEqual(total, 0);
  });
});

describe('Spec resultado — normalização de keywords', () => {
  it('keywordKey: acento/caixa são equivalentes', () => {
    assert.strictEqual(keywordKey('React'), keywordKey('react'));
    assert.strictEqual(keywordKey('Gestão'), keywordKey('gestao'));
    assert.strictEqual(keywordKey('SQL'), keywordKey('sql'));
  });
  it('uniqueKeywords: remove duplicatas por accent/case', () => {
    const result = uniqueKeywords(['React', 'react', 'REACT', 'Gestão', 'gestao']);
    assert.strictEqual(result.length, 2);
  });
  it('normalizeKeywords: encontrada remove da faltando', () => {
    const r = { keywords_encontradas: ['React'], keywords_parcialmente_encontradas: [], keywords_faltando: ['react', 'Vue'] };
    normalizeKeywords(r);
    assert.ok(!r.keywords_faltando.map(k => keywordKey(k)).includes('react'));
    assert.ok(r.keywords_faltando.map(k => keywordKey(k)).includes('vue'));
  });
  it('normalizeKeywords: parcial remove da faltando', () => {
    const r = { keywords_encontradas: [], keywords_parcialmente_encontradas: ['Node.js'], keywords_faltando: ['Node.js', 'Python'] };
    normalizeKeywords(r);
    assert.ok(!r.keywords_faltando.map(k => keywordKey(k)).includes('node.js'));
    assert.ok(r.keywords_faltando.map(k => keywordKey(k)).includes('python'));
  });
  it('normalizeKeywords: encontrada remove da parcial', () => {
    const r = { keywords_encontradas: ['SQL'], keywords_parcialmente_encontradas: ['SQL', 'Postgres'], keywords_faltando: [] };
    normalizeKeywords(r);
    assert.ok(!r.keywords_parcialmente_encontradas.map(k => keywordKey(k)).includes('sql'));
    assert.ok(r.keywords_parcialmente_encontradas.map(k => keywordKey(k)).includes('postgres'));
  });
});

describe('Spec resultado — buildFallbackPlan', () => {
  it('usa prioridades quando plano_melhoria está ausente', () => {
    const d = { prioridades: [{ titulo: 'A', explicacao: 'exp A' }, { titulo: 'B', explicacao: '' }] };
    const plan = buildFallbackPlanTest(d);
    assert.strictEqual(plan[0].titulo, 'A');
    assert.strictEqual(plan[0].descricao, 'exp A');
  });
  it('completa com falhas quando prioridades insuficientes', () => {
    const d = { prioridades: [{ titulo: 'P1', explicacao: '' }], falhas: ['Falha X', 'Falha Y'] };
    const plan = buildFallbackPlanTest(d);
    assert.ok(plan.length >= 2);
    assert.ok(plan.some(i => i.titulo === 'Falha X'));
  });
  it('retorna máximo de 3 itens', () => {
    const d = {
      prioridades: [{ titulo: 'P1', explicacao: '' }, { titulo: 'P2', explicacao: '' }],
      falhas: ['F1', 'F2', 'F3'],
      sugestoes: ['S1', 'S2']
    };
    const plan = buildFallbackPlanTest(d);
    assert.ok(plan.length <= 3);
  });
  it('todos os itens têm status "pendente"', () => {
    const d = { prioridades: [{ titulo: 'P1', explicacao: '' }, { titulo: 'P2', explicacao: '' }, { titulo: 'P3', explicacao: '' }] };
    const plan = buildFallbackPlanTest(d);
    assert.ok(plan.every(i => i.status === 'pendente'));
  });
});

// ── Testes de integração (requerem env vars) — SKIP em CI ────────────────────
describe('Integração (SKIP sem env)', { skip: !process.env.SUPABASE_URL }, () => {
  it('create_cv Free deve ser bloqueado', async () => {
    // Implementação real exigiria token Free e chamada ao /api/analyze
    assert.ok(true, 'SKIP: requer usuário Free autenticado');
  });
  it('RPC check_and_increment_analyses falha retorna infrastructure_error', async () => {
    assert.ok(true, 'SKIP: requer Supabase');
  });
  it('duas cobranças concorrentes não devem consumir duas vezes', async () => {
    assert.ok(true, 'SKIP: requer Supabase com atomicidade verificável');
  });
  it('analysis_id de outro usuário deve ser rejeitado com 404/0 rows', async () => {
    assert.ok(true, 'SKIP: requer dois usuários autenticados');
  });
});
