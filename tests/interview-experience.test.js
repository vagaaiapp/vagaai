import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dashboard = fs.readFileSync(path.join(root, 'dashboard', 'index.html'), 'utf8');
const interview = fs.readFileSync(path.join(root, 'entrevista', 'index.html'), 'utf8');
const api = fs.readFileSync(path.join(root, 'api', 'interview.js'), 'utf8');
const vercel = fs.readFileSync(path.join(root, 'vercel.json'), 'utf8');

test('painel de entrevistas usa a sala de preparo aprovada com dados reais', () => {
  assert.match(dashboard, /Sua sala de preparo\./);
  assert.match(dashboard, /id="intFocusTitle"/);
  assert.match(dashboard, /id="intFocusAction"/);
  assert.match(dashboard, /id="interviewListBody"/);
  assert.match(dashboard, /Texto ou áudio, com orientação após cada resposta/);
  assert.match(dashboard, /window\.location\.href = '\/entrevista\?analysis_id='/);
  assert.doesNotMatch(dashboard, /Sua entrevista é amanhã/);
});

test('hub mantém acesso Pro, filtros, estados vazios e histórico', () => {
  assert.match(dashboard, /canUseInterviewSimulator\(\)/);
  assert.match(dashboard, /id="interviewUpsell"/);
  assert.match(dashboard, /data-filter="marcadas"/);
  assert.match(dashboard, /data-filter="oferta"/);
  assert.match(dashboard, /data-filter="todas"/);
  assert.match(dashboard, /id="treinoHistorico"/);
  assert.match(dashboard, /finished_at=not\.is\.null/);
});

test('resposta por áudio preserva gravação, limite e transcrição no campo', () => {
  assert.match(interview, /id="audioRecordBtn" onclick="startAudioAnswer\(\)"/);
  assert.match(interview, /id="audioStopBtn" onclick="stopAudioAnswer\(\)"/);
  assert.match(interview, /navigator\.mediaDevices\.getUserMedia\(\{ audio: true \}\)/);
  assert.match(interview, /new MediaRecorder\(_audioStream/);
  assert.match(interview, /seconds >= 120/);
  assert.match(interview, /_mediaRecorder\.onstop = transcribeRecordedAudio/);
  assert.match(interview, /action: 'transcribe'/);
  assert.match(interview, /input\.value = clean/);
  assert.match(interview, /updateCharHint\(\)/);
});

test('falhas de áudio mantêm a resposta por texto disponível', () => {
  assert.match(interview, /Seu navegador não suporta gravação de áudio\. Use a resposta por texto\./);
  assert.match(interview, /Não foi possível acessar o microfone\. Verifique a permissão do navegador\./);
  assert.match(interview, /Você ainda pode responder por texto/);
  assert.match(interview, /A gravação ficou muito curta/);
  assert.match(interview, /Sessão expirada\. Recarregue a página e faça login novamente\./);
});

test('backend e cabeçalhos mantêm a transcrição autorizada', () => {
  assert.match(api, /action === 'transcribe'/);
  assert.match(api, /transcribeAudio\(audioBase64\)/);
  assert.match(vercel, /microphone=\(self\)/);
});
