import { createClient } from '@supabase/supabase-js';
  import type { Database } from './types';

  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    console.error("ERRO: Chaves do Supabase não encontradas! Verifique as variáveis de ambiente no Render.");
  }

  export const supabase = createClient<Database>(
    SUPABASE_URL || "", 
    SUPABASE_PUBLISHABLE_KEY || "", 
    {
      auth: {
        storage: localStorage,
        persistSession: true,
        autoRefreshToken: true,
      }
    }
  );

  // Log para verificar conexão (apenas em desenvolvimento/debug)
  supabase.from('tenants').select('count', { count: 'exact', head: true })
    .then(({ count, error }) => {
      if (error) console.error("Erro de conexão Supabase:", error.message);
      else console.log("Conexão Supabase OK. Registros encontrados:", count);
    });
  