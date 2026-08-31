# Proteção contra abuso da VagaAI

A gratuidade é validada no servidor por conta confirmada, e-mail normalizado,
dispositivo assinado e velocidade de rede. O sistema persiste somente HMACs;
e-mail, IP e cookie não são gravados em texto legível.

## Ativação em produção

1. Aplique `migrations/035_abuse_prevention.sql` no Supabase.
2. Defina `ABUSE_SIGNING_SECRET` com um segredo aleatório e estável.
3. Opcionalmente configure `TURNSTILE_SECRET_KEY` e `TURNSTILE_SITE_KEY` para
   desafios progressivos de risco.
4. Valide a aba **Abusos** em `/admin` após o deploy.

Sem o Turnstile, os limites duros continuam ativos. Sem a migração 035, a
análise gratuita e a contagem de dispositivos usam a compatibilidade de
emergência em `ip_rate_limits`; o painel detalhado e a retenção automática ficam
indisponíveis. Os sinais de prevenção são limpos em até 90 dias.

## Limites atuais

- uma gratuidade por conta/e-mail normalizado a cada 30 dias;
- no máximo duas contas gratuitas por dispositivo a cada 30 dias;
- desafio progressivo a partir de cinco usos suspeitos na mesma rede por dia;
- bloqueio de rede em risco alto;
- desafio de compartilhamento acima de cinco dispositivos por conta em 30 dias;
- bloqueio acima de oito dispositivos por conta em 30 dias.

O painel administrativo permite acompanhar bloqueios, desafios e contas com
muitos dispositivos, além de liberar manualmente uma gratuidade legítima.
