import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface WhatsAppMessageRecord {
  id: string;
  tenant_id: string | null;
  from_phone: string;
  to_phone: string | null;
  body: string | null;
  direction: string;
  received_at: string;
  created_at: string;
  message_type: string;
}

export function useWhatsAppMessages(tenantId?: string | null) {
  return useQuery({
    queryKey: ["whatsapp-messages", tenantId ?? "all"],
    queryFn: async () => {
      const query = supabase
        .from("whatsapp_messages" as any)
        .select("*")
        .order("received_at", { ascending: false })
        .limit(200);

      if (tenantId) {
        (query as any).eq("tenant_id", tenantId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data as unknown as WhatsAppMessageRecord[]) || [];
    },
  });
}

export function useAllWhatsAppMessages() {
  return useQuery({
    queryKey: ["whatsapp-messages", "all"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("whatsapp_messages")
        .select("*")
        .order("received_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data as unknown as WhatsAppMessageRecord[]) || [];
    },
  });
}

export function useTenantWhatsAppMessages(tenantId: string | undefined) {
  return useQuery({
    queryKey: ["whatsapp-messages-tenant", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("whatsapp_messages")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("received_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data as unknown as WhatsAppMessageRecord[]) || [];
    },
  });
}

export function useSaveWhatsAppMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (msg: {
      tenant_id?: string | null;
      to_phone: string;
      body: string;
    }) => {
      const { error } = await (supabase as any)
        .from("whatsapp_messages")
        .insert({
          direction: "outbound",
          from_phone: "system",
          to_phone: msg.to_phone,
          body: msg.body,
          tenant_id: msg.tenant_id || null,
          message_type: "text",
          processed: true,
          received_at: new Date().toISOString(),
        });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["whatsapp-messages"] });
      qc.invalidateQueries({ queryKey: ["whatsapp-messages-tenant"] });
    },
  });
}
