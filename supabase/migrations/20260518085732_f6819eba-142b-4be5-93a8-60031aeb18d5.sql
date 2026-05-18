-- Remover cron job do Z-API se existir
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('zapi-daily-billing') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'zapi-daily-billing');
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Apagar tabelas antigas do Z-API
DROP TABLE IF EXISTS public.whatsapp_pending_actions CASCADE;
DROP TABLE IF EXISTS public.whatsapp_messages CASCADE;
DROP TABLE IF EXISTS public.whatsapp_config CASCADE;

-- Recriar limpas para a Evolution API
CREATE TABLE public.whatsapp_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_name text,
  connection_status text NOT NULL DEFAULT 'disconnected',
  qr_code text,
  last_status_check timestamptz,
  last_webhook_at timestamptz,
  webhook_verified boolean NOT NULL DEFAULT false,
  last_error_message text,
  auto_send_receipt boolean NOT NULL DEFAULT true,
  auto_approve_payments boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.whatsapp_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated manage whatsapp_config" ON public.whatsapp_config FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  direction text NOT NULL,
  from_phone text NOT NULL,
  to_phone text,
  message_type text NOT NULL DEFAULT 'text',
  body text,
  media_url text,
  media_mime_type text,
  tenant_id uuid,
  wa_message_id text,
  raw_payload jsonb,
  ai_extracted jsonb,
  ai_confidence numeric,
  processed boolean NOT NULL DEFAULT false,
  received_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated manage whatsapp_messages" ON public.whatsapp_messages FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX idx_whatsapp_messages_created ON public.whatsapp_messages(created_at DESC);
CREATE INDEX idx_whatsapp_messages_tenant ON public.whatsapp_messages(tenant_id);

CREATE TABLE public.whatsapp_pending_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid,
  tenant_id uuid,
  action_type text NOT NULL,
  proposed_data jsonb NOT NULL,
  confidence numeric,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid,
  reviewed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.whatsapp_pending_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated manage pending_actions" ON public.whatsapp_pending_actions FOR ALL TO authenticated USING (true) WITH CHECK (true);