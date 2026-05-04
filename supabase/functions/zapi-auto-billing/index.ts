import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const now = new Date();
    const currentDay = now.getDate();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    console.log(`Iniciando cobrança automática para ${currentDay}/${currentMonth}/${currentYear}`);

    // 1. Buscar inquilinos ativos cujo dia de pagamento já passou
    // Consideramos atraso se o dia atual for maior que o dia de pagamento
    const { data: tenants, error: tenantError } = await supabase
      .from("tenants")
      .select("id, name, phone, payment_day, rent_amount")
      .eq("status", "active")
      .lt("payment_day", currentDay);

    if (tenantError) throw tenantError;

    const results = [];

    for (const tenant of tenants) {
      // 2. Verificar se já existe pagamento para o mês/ano atual
      const { data: payments, error: paymentError } = await supabase
        .from("payments")
        .select("id, status")
        .eq("tenant_id", tenant.id)
        .eq("month", currentMonth)
        .eq("year", currentYear)
        .eq("status", "paid");

      if (paymentError) throw paymentError;

      // Se não houver pagamento confirmado, envia a cobrança
      if (!payments || payments.length === 0) {
        if (!tenant.phone) {
          console.log(`Inquilino ${tenant.name} sem telefone cadastrado.`);
          continue;
        }

        const message = `Olá ${tenant.name}, seu aluguel está vencido. Por favor, regularizar.`;
        
        console.log(`Enviando cobrança para ${tenant.name} (${tenant.phone})`);

        // Chamar a função interna de envio Z-API
        const { data: sendData, error: sendError } = await supabase.functions.invoke("zapi-send", {
          body: { 
            phone: tenant.phone, 
            message: message,
            tenantId: tenant.id 
          }
        });

        results.push({
          tenant: tenant.name,
          status: sendError ? "error" : "sent",
          details: sendError || sendData
        });
      }
    }

    return new Response(JSON.stringify({ success: true, processed: results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Erro na automação de cobrança:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
