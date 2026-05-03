-- 1. Tabela de mensagens recebidas/enviadas pelo WhatsApp
CREATE TABLE public.whatsapp_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wa_message_id TEXT UNIQUE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  from_phone TEXT NOT NULL,
  to_phone TEXT,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  message_type TEXT NOT NULL DEFAULT 'text',
  body TEXT,
  media_url TEXT,
  media_mime_type TEXT,
  raw_payload JSONB,
  ai_extracted JSONB,
  ai_confidence NUMERIC,
  processed BOOLEAN NOT NULL DEFAULT false,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_whatsapp_messages_tenant ON public.whatsapp_messages(tenant_id);
CREATE INDEX idx_whatsapp_messages_received ON public.whatsapp_messages(received_at DESC);
CREATE INDEX idx_whatsapp_messages_processed ON public.whatsapp_messages(processed) WHERE processed = false;

ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can manage whatsapp_messages" ON public.whatsapp_messages FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 2. Tabela de pendências/automações pra revisão manual
CREATE TABLE public.whatsapp_pending_actions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID REFERENCES public.whatsapp_messages(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('payment', 'profile_update', 'unknown_number', 'duplicate_proof', 'amount_mismatch', 'missing_data')),
  proposed_data JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'auto_applied')),
  confidence NUMERIC,
  notes TEXT,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pending_status ON public.whatsapp_pending_actions(status, created_at DESC);
CREATE INDEX idx_pending_tenant ON public.whatsapp_pending_actions(tenant_id);

ALTER TABLE public.whatsapp_pending_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can manage pending_actions" ON public.whatsapp_pending_actions FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER update_pending_actions_updated_at
BEFORE UPDATE ON public.whatsapp_pending_actions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Configuração do WhatsApp (status da conexão, número, etc.)
CREATE TABLE public.whatsapp_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone_number_id TEXT,
  business_phone TEXT,
  webhook_verified BOOLEAN NOT NULL DEFAULT false,
  last_webhook_at TIMESTAMPTZ,
  auto_approve_payments BOOLEAN NOT NULL DEFAULT true,
  auto_approve_profile BOOLEAN NOT NULL DEFAULT false,
  auto_send_receipt BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can manage whatsapp_config" ON public.whatsapp_config FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER update_whatsapp_config_updated_at
BEFORE UPDATE ON public.whatsapp_config
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.whatsapp_config DEFAULT VALUES;