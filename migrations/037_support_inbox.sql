-- 037_support_inbox.sql - caixa de entrada administrativa de suporte
--
-- As mensagens continuam sendo notificadas por e-mail, mas passam a ter um
-- registro operacional com status, prioridade, respostas e notas internas.
-- Somente a service_role acessa estas tabelas. O navegador administrativo
-- sempre atravessa /api/admin, que valida o token e public.admins.

BEGIN;

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email                   text NOT NULL CHECK (char_length(email) BETWEEN 3 AND 254),
  category                text NOT NULL CHECK (category IN ('duvida', 'problema', 'cobranca', 'sugestao', 'outro')),
  message                 text NOT NULL CHECK (char_length(message) BETWEEN 10 AND 5000),
  status                  text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'waiting_user', 'resolved')),
  priority                text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  source                  text NOT NULL DEFAULT 'dashboard' CHECK (source IN ('dashboard', 'public')),
  admin_notes             text NOT NULL DEFAULT '' CHECK (char_length(admin_notes) <= 10000),
  notification_status     text NOT NULL DEFAULT 'pending' CHECK (notification_status IN ('pending', 'sent', 'failed')),
  notification_message_id text,
  first_response_at       timestamptz,
  last_reply_at           timestamptz,
  resolved_at             timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_tickets_status_created_idx
  ON public.support_tickets (status, created_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_user_created_idx
  ON public.support_tickets (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS support_tickets_email_created_idx
  ON public.support_tickets (lower(email), created_at DESC);

CREATE TABLE IF NOT EXISTS public.support_replies (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id           uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  author_type         text NOT NULL CHECK (author_type IN ('admin', 'user')),
  author_email        text NOT NULL CHECK (char_length(author_email) BETWEEN 3 AND 254),
  message             text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 10000),
  delivery_status     text NOT NULL DEFAULT 'pending' CHECK (delivery_status IN ('pending', 'sent', 'failed', 'received')),
  provider_message_id text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_replies_ticket_created_idx
  ON public.support_replies (ticket_id, created_at ASC);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_replies ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.support_tickets FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.support_replies FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.support_tickets TO service_role;
GRANT ALL ON TABLE public.support_replies TO service_role;

COMMIT;
