import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { localDB } from "@/lib/local-db";
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
      try {
        const { data, error } = await supabase.from("properties").select("*").order("address");
        if (error) throw error;
        if (data && data.length > 0) {
          localDB.saveProperties(data);
          return data;
        }
      } catch (e) {
        console.warn("Usando banco de dados local para propriedades");
      }
      return localDB.getProperties();
    },
  });
}

export function useTenants(status?: string) {
  return useQuery({
    queryKey: ["tenants", status],
    queryFn: async () => {
      try {
        let query = supabase.from("tenants").select("*, property:properties(id, address, name)").order("name");
        if (status) query = query.eq("status", status);
        const { data, error } = await query;
        if (error) throw error;
        if (data && data.length > 0) {
          localDB.saveTenants(data);
          return data as Tenant[];
        }
      } catch (e) {
        console.warn("Usando banco de dados local para inquilinos");
      }
      const local = localDB.getTenants();
      return status ? local.filter((t: any) => t.status === status) : local;
    },
  });
}

export function useTenant(id: string) {
  return useQuery({
    queryKey: ["tenant", id],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("tenants")
          .select("*, property:properties(id, address, name)")
          .eq("id", id)
          .single();
        if (error) throw error;
        return data as Tenant;
      } catch (e) {
        return localDB.getTenants().find((t: any) => t.id === id);
      }
    },
    enabled: !!id,
  });
}

export function usePayments(tenantId?: string, year?: number) {
  return useQuery({
    queryKey: ["payments", tenantId, year],
    queryFn: async () => {
      try {
        let query = supabase.from("payments").select("*").order("year", { ascending: false }).order("month", { ascending: false });
        if (tenantId) query = query.eq("tenant_id", tenantId);
        if (year) query = query.eq("year", year);
        const { data, error } = await query;
        if (error) throw error;
        if (data) return data as Payment[];
      } catch (e) {
        let local = localDB.getPayments();
        if (tenantId) local = local.filter((p: any) => p.tenant_id === tenantId);
        if (year) local = local.filter((p: any) => p.year === year);
        return local;
      }
      return [];
    },
  });
}

export function useAllPayments(year?: number) {
  return useQuery({
    queryKey: ["all-payments", year],
    queryFn: async () => {
      try {
        let query = supabase.from("payments").select("*, tenant:tenants(id, name, house_number, rent_amount, property_id, property:properties(address))");
        if (year) query = query.eq("year", year);
        const { data, error } = await query;
        if (error) throw error;
        if (data && data.length > 0) {
          localDB.savePayments(data);
          return data;
        }
      } catch (e) {
        console.warn("Usando banco de dados local para pagamentos");
      }
      const local = localDB.getPayments();
      return year ? local.filter((p: any) => p.year === year) : local;
    },
  });
}

export function useCreateTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tenant: Partial<Tenant>) => {
      try {
        const { data, error } = await supabase.from("tenants").insert(tenant as any).select().single();
        if (error) throw error;
        return data;
      } catch (e) {
        const tenants = localDB.getTenants();
        const newTenant = { ...tenant, id: crypto.randomUUID(), created_at: new Date().toISOString() };
        localDB.saveTenants([...tenants, newTenant]);
        return newTenant;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tenants"] }),
  });
}

export function useUpdateTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Tenant> & { id: string }) => {
      try {
        const { data, error } = await supabase.from("tenants").update(updates as any).eq("id", id).select().single();
        if (error) throw error;
        return data;
      } catch (e) {
        const tenants = localDB.getTenants();
        const updated = tenants.map((t: any) => t.id === id ? { ...t, ...updates } : t);
        localDB.saveTenants(updated);
        return updated.find((t: any) => t.id === id);
      }
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
      try {
        const { data, error } = await supabase
          .from("payments")
          .upsert(payment as any, { onConflict: "tenant_id,month,year" })
          .select()
          .single();
        if (error) throw error;
        return data;
      } catch (e) {
        const payments = localDB.getPayments();
        const existingIdx = payments.findIndex((p: any) => p.tenant_id === payment.tenant_id && p.month === payment.month && p.year === payment.year);
        let newPayments;
        if (existingIdx > -1) {
          newPayments = [...payments];
          newPayments[existingIdx] = { ...newPayments[existingIdx], ...payment };
        } else {
          newPayments = [...payments, { ...payment, id: crypto.randomUUID(), created_at: new Date().toISOString() }];
        }
        localDB.savePayments(newPayments);
        return payment;
      }
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
      let tenants, allPayments;
      
      try {
        const { data: tData, error: te } = await supabase.from("tenants").select("id, status, rent_amount, entry_date, payment_day, payment_cycle");
        if (te) throw te;
        tenants = tData;
        
        const { data: pData, error: pe } = await supabase.from("payments").select("tenant_id, month, year, status, amount").eq("year", new Date().getFullYear());
        if (pe) throw pe;
        allPayments = pData;
      } catch (e) {
        tenants = localDB.getTenants();
        allPayments = localDB.getPayments();
      }

      const active = tenants?.filter((t: any) => t.status === "active") || [];
      const totalContracts = tenants?.length || 0;
      const activeContracts = active.length;
      const monthlyRevenue = active.reduce((sum: number, t: any) => sum + Number(t.rent_amount || 0), 0);

      const now = new Date();
      const month = now.getMonth() + 1;
      const year = now.getFullYear();

      let pendingAmount = 0;
      active.forEach((t: any) => {
        for (let m = 1; m <= month; m++) {
          const payment = allPayments?.find((p: any) => p.tenant_id === t.id && p.month === m);
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
