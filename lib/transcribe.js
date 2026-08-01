// lib/transcribe.js
// Transcrição de áudio via AssemblyAI (pt-BR). Extraído de api/interview.js
// para ser compartilhado entre o simulador de entrevista e a entrada por voz
// do criador de currículo (api/cv-voice.js).
//
// Os erros carregam statusCode/publicMessage para o handler devolver a
// mensagem certa ao usuário sem vazar detalhe de infra.

const ASSEMBLYAI_KEY = process.env.ASSEMBLYAI_API_KEY;

// Limite do payload aceito pelo bodyParser das rotas (8mb) com folga para o
// overhead de base64. ~7MB de áudio opus são vários minutos de fala.
const MAX_AUDIO_BYTES = 7 * 1024 * 1024;
const MIN_AUDIO_BYTES = 1000;

function fail(message, statusCode, publicMessage) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.publicMessage = publicMessage;
  return err;
}

export function decodeBase64Audio(audioBase64) {
  const clean = String(audioBase64 || '').replace(/^data:audio\/[a-z0-9.+-]+;base64,/i, '');
  if (!clean) return null;
  return Buffer.from(clean, 'base64');
}

export async function transcribeAudio(audioBase64) {
  if (!ASSEMBLYAI_KEY) {
    throw fail('ASSEMBLYAI_API_KEY not configured', 500, 'Servico de transcricao nao configurado');
  }

  const buffer = decodeBase64Audio(audioBase64);
  if (!buffer || buffer.length < MIN_AUDIO_BYTES) {
    throw fail('Audio invalid', 400, 'Audio invalido ou vazio');
  }
  if (buffer.length > MAX_AUDIO_BYTES) {
    throw fail('Audio too large', 413, 'Audio muito grande. Grave um trecho mais curto.');
  }

  // 1. Upload do áudio
  const uploadRes = await fetch('https://api.assemblyai.com/v2/upload', {
    method: 'POST',
    headers: { 'Authorization': ASSEMBLYAI_KEY, 'Content-Type': 'application/octet-stream' },
    body: buffer,
  });
  if (!uploadRes.ok) {
    console.error('AssemblyAI upload error:', uploadRes.status);
    throw fail('Upload failed', 502, 'Falha ao enviar audio para transcricao');
  }
  const { upload_url } = await uploadRes.json();

  // 2. Submete transcrição
  const transcriptRes = await fetch('https://api.assemblyai.com/v2/transcript', {
    method: 'POST',
    headers: { 'Authorization': ASSEMBLYAI_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ audio_url: upload_url, language_code: 'pt', language_detection: false }),
  });
  if (!transcriptRes.ok) {
    console.error('AssemblyAI transcript request error:', transcriptRes.status);
    throw fail('Transcription request failed', 502, 'Falha ao iniciar transcricao');
  }
  const { id } = await transcriptRes.json();

  // 3. Polling até concluir (max ~15s — as rotas que usam esta lib precisam de
  // maxDuration:60 no vercel.json; os 10s default estouram em áudios longos)
  const pollingUrl = `https://api.assemblyai.com/v2/transcript/${id}`;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 500));
    const pollRes = await fetch(pollingUrl, { headers: { 'Authorization': ASSEMBLYAI_KEY } });
    const result = await pollRes.json();
    if (result.status === 'completed') return (result.text || '').trim();
    if (result.status === 'error') {
      console.error('AssemblyAI transcription error:', result.error);
      throw fail('Transcription error', 502, 'Falha ao transcrever o audio');
    }
  }

  throw fail('Transcription timeout', 504, 'Transcricao demorou demais. Tente novamente com um trecho mais curto.');
}
