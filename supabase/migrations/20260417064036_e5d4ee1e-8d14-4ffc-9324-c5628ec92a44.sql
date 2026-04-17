
-- Tabela de configurações globais do app (single row)
CREATE TABLE IF NOT EXISTS public.app_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  default_late_fee_percent numeric NOT NULL DEFAULT 10,
  default_interest_percent numeric NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage app settings"
ON public.app_settings FOR ALL TO authenticated
USING (true) WITH CHECK (true);

CREATE TRIGGER update_app_settings_updated_at
BEFORE UPDATE ON public.app_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Insere linha default
INSERT INTO public.app_settings (default_late_fee_percent, default_interest_percent)
SELECT 10, 1
WHERE NOT EXISTS (SELECT 1 FROM public.app_settings);

-- Override por inquilino (NULL = usa o global)
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS default_late_fee_percent numeric,
  ADD COLUMN IF NOT EXISTS default_interest_percent numeric;
