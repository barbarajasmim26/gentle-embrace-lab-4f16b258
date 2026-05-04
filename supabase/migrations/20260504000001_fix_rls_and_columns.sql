-- Garantir que a coluna last_error_message exista
ALTER TABLE public.whatsapp_config ADD COLUMN IF NOT EXISTS last_error_message TEXT;

-- Ajustar RLS para permitir que as Edge Functions (que usam service_role) funcionem sem restrições,
-- mas também garantir que o painel (autenticado) possa ler e escrever.
-- As políticas atuais já permitem 'authenticated', mas vamos reforçar.

DROP POLICY IF EXISTS "Authenticated can manage whatsapp_config" ON public.whatsapp_config;
CREATE POLICY "Authenticated can manage whatsapp_config" ON public.whatsapp_config FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Permitir que o webhook (anon) insira mensagens se necessário, embora o ideal seja via service_role.
-- Como o webhook é configurado com verify_jwt = false, ele roda como anon se não passar chave.
-- No entanto, a função usa SERVICE_ROLE internamente para falar com o banco, então RLS de anon não deve afetar.

-- Adicionar colunas faltantes em whatsapp_messages que podem causar erro de insert
ALTER TABLE public.whatsapp_messages ADD COLUMN IF NOT EXISTS wa_message_id TEXT;
ALTER TABLE public.whatsapp_messages ADD COLUMN IF NOT EXISTS raw_payload JSONB;

-- Corrigir a constraint de action_type novamente para garantir que não falhe
ALTER TABLE public.whatsapp_pending_actions DROP CONSTRAINT IF EXISTS whatsapp_pending_actions_action_type_check;
ALTER TABLE public.whatsapp_pending_actions ADD CONSTRAINT whatsapp_pending_actions_action_type_check 
CHECK (action_type IN ('payment', 'profile_update', 'unknown_number', 'duplicate_proof', 'amount_mismatch', 'missing_data', 'unknown_sender', 'unclear_message'));
