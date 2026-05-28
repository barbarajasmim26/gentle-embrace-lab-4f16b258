/**
 * Banco de Dados Local (Fallback)
 * Este arquivo fornece uma camada de persistência local caso o Supabase falhe.
 */

const STORAGE_KEYS = {
  TENANTS: 'mesquita_tenants',
  PAYMENTS: 'mesquita_payments',
  PROPERTIES: 'mesquita_properties',
};

// Dados Iniciais de Exemplo (para não vir vazio)
const INITIAL_DATA = {
  properties: [
    { id: 'p1', name: 'Casa 01', address: 'Rua das Flores, 123', created_at: new Date().toISOString() },
    { id: 'p2', name: 'Apartamento 202', address: 'Av. Central, 456', created_at: new Date().toISOString() },
  ],
  tenants: [
    { 
      id: 't1', 
      name: 'Exemplo: João Silva', 
      property_id: 'p1', 
      house_number: 'Casa A', 
      rent_amount: 1200, 
      payment_day: 10, 
      status: 'active', 
      entry_date: '2024-01-10',
      phone: '11999999999',
      created_at: new Date().toISOString() 
    },
    { 
      id: 't2', 
      name: 'Exemplo: Maria Oliveira', 
      property_id: 'p2', 
      house_number: 'Apto 101', 
      rent_amount: 1800, 
      payment_day: 5, 
      status: 'active', 
      entry_date: '2024-05-15',
      phone: '11888888888',
      created_at: new Date().toISOString() 
    }
  ]
};

export const localDB = {
  get: (key: string) => {
    const data = localStorage.getItem(key);
    if (!data) {
      // Se for a primeira vez, inicializa com dados de exemplo
      if (key === STORAGE_KEYS.PROPERTIES) return INITIAL_DATA.properties;
      if (key === STORAGE_KEYS.TENANTS) return INITIAL_DATA.tenants;
      return [];
    }
    return JSON.parse(data);
  },
  
  save: (key: string, data: any) => {
    localStorage.setItem(key, JSON.stringify(data));
  },

  // Helpers para Inquilinos
  getTenants: () => localDB.get(STORAGE_KEYS.TENANTS),
  saveTenants: (tenants: any[]) => localDB.save(STORAGE_KEYS.TENANTS, tenants),
  
  // Helpers para Pagamentos
  getPayments: () => localDB.get(STORAGE_KEYS.PAYMENTS),
  savePayments: (payments: any[]) => localDB.save(STORAGE_KEYS.PAYMENTS, payments),

  // Helpers para Propriedades
  getProperties: () => localDB.get(STORAGE_KEYS.PROPERTIES),
  saveProperties: (properties: any[]) => localDB.save(STORAGE_KEYS.PROPERTIES, properties),
};
