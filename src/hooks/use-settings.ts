import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AppSettings {
  id: string;
  default_late_fee_percent: number;
  default_interest_percent: number;
}

export const FALLBACK_LATE_FEE = 10;
export const FALLBACK_INTEREST = 1;

export function useAppSettings() {
  return useQuery({
    queryKey: ["app-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings" as any)
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as AppSettings) || null;
    },
  });
}

export function useUpdateAppSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (updates: Partial<AppSettings> & { id: string }) => {
      const { id, ...rest } = updates;
      const { data, error } = await supabase
        .from("app_settings" as any)
        .update(rest as any)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["app-settings"] }),
  });
}

/**
 * Resolve as taxas efetivas para um inquilino:
 * tenant override > global setting > fallback constante.
 */
export function resolveFees(
  tenant: { default_late_fee_percent?: number | null; default_interest_percent?: number | null } | null | undefined,
  settings: AppSettings | null | undefined,
) {
  const lateFee =
    tenant?.default_late_fee_percent ??
    settings?.default_late_fee_percent ??
    FALLBACK_LATE_FEE;
  const interest =
    tenant?.default_interest_percent ??
    settings?.default_interest_percent ??
    FALLBACK_INTEREST;
  return { lateFee: Number(lateFee), interest: Number(interest) };
}
