-- Ajustar restrição de action_type para incluir os valores usados no webhook
ALTER TABLE public.whatsapp_pending_actions 
DROP CONSTRAINT IF EXISTS whatsapp_pending_actions_action_type_check;

ALTER TABLE public.whatsapp_pending_actions 
ADD CONSTRAINT whatsapp_pending_actions_action_type_check 
CHECK (action_type IN ('payment', 'profile_update', 'unknown_number', 'duplicate_proof', 'amount_mismatch', 'missing_data', 'unknown_sender', 'unclear_message'));

-- Adicionar coluna para armazenar o erro real da API na configuração
ALTER TABLE public.whatsapp_config 
ADD COLUMN IF NOT EXISTS last_error_message TEXT;
