
DROP POLICY IF EXISTS "Anon manage tenants" ON public.tenants;
DROP POLICY IF EXISTS "Anon manage properties" ON public.properties;
DROP POLICY IF EXISTS "Anon manage payments" ON public.payments;
DROP POLICY IF EXISTS "Anon manage documents" ON public.documents;
DROP POLICY IF EXISTS "Anon manage app_settings" ON public.app_settings;
DROP POLICY IF EXISTS "Anon manage ai_conversations" ON public.ai_conversations;
DROP POLICY IF EXISTS "Anon manage ai_messages" ON public.ai_messages;
DROP POLICY IF EXISTS "Anon manage whatsapp_config" ON public.whatsapp_config;
DROP POLICY IF EXISTS "Anon manage whatsapp_messages" ON public.whatsapp_messages;
DROP POLICY IF EXISTS "Anon manage whatsapp_pending_actions" ON public.whatsapp_pending_actions;

REVOKE ALL ON public.tenants, public.properties, public.payments, public.documents,
  public.app_settings, public.ai_conversations, public.ai_messages,
  public.whatsapp_config, public.whatsapp_messages, public.whatsapp_pending_actions
  FROM anon;
