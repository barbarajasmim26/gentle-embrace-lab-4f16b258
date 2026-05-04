-- Habilitar a extensão pg_cron se não estiver habilitada
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Agendar a execução da Edge Function zapi-auto-billing todos os dias às 9h
-- O fuso horário do banco costuma ser UTC, então 9h BRT (GMT-3) seria 12h UTC.
-- Se o servidor estiver configurado para o horário local, ajustamos conforme necessário.
-- Usamos net.http_post para chamar a Edge Function.

SELECT cron.schedule(
  'zapi-daily-billing', -- Nome do job
  '0 12 * * *',         -- Cron: 12:00 UTC (9:00 AM BRT)
  $$
  SELECT
    net.http_post(
      url:=(SELECT value FROM settings WHERE key = 'supabase_url') || '/functions/v1/zapi-auto-billing',
      headers:=jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT value FROM settings WHERE key = 'service_role_key')
      ),
      body:='{}'::jsonb
    )
  $$
);

-- Nota: Esta migração assume que você tem uma tabela 'settings' ou similar para guardar a URL e Key.
-- Caso não tenha, o administrador deve configurar manualmente no painel do Supabase -> Database -> Cron Jobs
-- ou via CLI passando as variáveis de ambiente.
