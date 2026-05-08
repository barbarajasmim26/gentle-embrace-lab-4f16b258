import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isOverdue, isPaymentPaid, isNotApplicable } from "@/lib/payment-status";

export interface Tenant {
  id: string;
  property_id: string | null;
  name: string;
  phone: string | null;
  house_number: string | null;
  rent_amount: number;
  deposit: number | null;
  payment_day: number | null;
  entry_date: string | null;
  exit_date: string | null;
  status: string;
  cpf: string | null;
  notes: string | null;
  payment_cycle: string | null;
  default_late_fee_percent?: number | null;
  default_interest_percent?: number | null;
  created_at: string;
  updated_at: string;
  property?: { id: string; address: string; name: string | null };
}

export interface Payment {
  id: string;
  tenant_id: string;
  month: number;
  year: number;
  status: string;
  amount: number | null;
  paid_at: string | null;
  late_fee_percent: number | null;
  interest_percent: number | null;
  created_at: string;
}

export function useProperties() {
  return useQuery({
    queryKey: ["properties"],
    queryFn: async () => {
      const { data, error } = await supabase.from("properties").select("*").order("address");
      if (error) throw error;
      return data;
    },
  });
}

export function useTenants(status?: string) {
  return useQuery({
    queryKey: ["tenants", status],
    queryFn: async () => {
      let query = supabase.from("tenants").select("*, property:properties(id, address, name)").order("name");
      if (status) query = query.eq("status", status);
      const { data, error } = await query;
      if (error) throw error;
      return data as Tenant[];
    },
  });
}

export function useTenant(id: string) {
  return useQuery({
    queryKey: ["tenant", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("*, property:properties(id, address, name)")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as Tenant;
    },
    enabled: !!id,
  });
}

export function usePayments(tenantId?: string, year?: number) {
  return useQuery({
    queryKey: ["payments", tenantId, year],
    queryFn: async () => {
      let query = supabase.from("payments").select("*").order("year", { ascending: false }).order("month", { ascending: false });
      if (tenantId) query = query.eq("tenant_id", tenantId);
      if (year) query = query.eq("year", year);
      const { data, error } = await query;
      if (error) throw error;
      return data as Payment[];
    },
  });
}

export function useAllPayments(year?: number) {
  return useQuery({
    queryKey: ["all-payments", year],
    queryFn: async () => {
      let query = supabase.from("payments").select("*, tenant:tenants(id, name, house_number, rent_amount, property_id, property:properties(address))");
      if (year) query = query.eq("year", year);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tenant: Partial<Tenant>) => {
      const { data, error } = await supabase.from("tenants").insert(tenant as any).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tenants"] }),
  });
}

export function useUpdateTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Tenant> & { id: string }) => {
      const { data, error } = await supabase.from("tenants").update(updates as any).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["tenants"] });
      qc.invalidateQueries({ queryKey: ["tenant", vars.id] });
    },
  });
}

export function useUpsertPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payment: Partial<Payment>) => {
      const { data, error } = await supabase
        .from("payments")
        .upsert(payment as any, { onConflict: "tenant_id,month,year" })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["all-payments"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });
}

export function useDashboardStats() {
  return useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const { data: tenants, error: te } = await supabase.from("tenants").select("id, status, rent_amount, entry_date, payment_day, payment_cycle");
      if (te) throw te;
      const active = tenants?.filter((t) => t.status === "active") || [];
      const totalContracts = tenants?.length || 0;
      const activeContracts = active.length;
      const monthlyRevenue = active.reduce((sum, t) => sum + Number(t.rent_amount || 0), 0);

      const now = new Date();
      const month = now.getMonth() + 1;
      const year = now.getFullYear();

      // Buscar todos os pagamentos do ano atual para calcular a inadimplência real baseada em competência
      const { data: allPayments, error: pe } = await supabase
        .from("payments")
        .select("tenant_id, month, year, status, amount")
        .eq("year", year);
      
      if (pe) throw pe;

      // Inadimplência real: Ativos que possuem meses de competência (até o atual) sem pagamento e que já venceram
      let pendingAmount = 0;
      active.forEach(t => {
        for (let m = 1; m <= month; m++) {
          const payment = allPayments?.find(p => p.tenant_id === t.id && p.month === m);
          const isPaid = isPaymentPaid(payment?.status) || payment?.status === "deposit";
          
          if (!isPaid && !isNotApplicable(m, year, t.entry_date)) {
            if (isOverdue(m, year, t.payment_day || 10, t.payment_cycle, now)) {
              pendingAmount += Number(payment?.amount || t.rent_amount || 0);
            }
          }
        }
      });

      return { totalContracts, activeContracts, monthlyRevenue, pendingAmount };
    },
  });
}
