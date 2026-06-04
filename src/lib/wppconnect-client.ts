// Cliente para o servidor WPPConnect local (Windows).
// Configuração é salva em localStorage para o usuário não precisar
// definir variáveis de build no Lovable.

export interface WppServerConfig {
  baseUrl: string; // ex.: http://localhost:3333
  apiKey: string;
}

const KEYS = { baseUrl: "wpp_base_url", apiKey: "wpp_api_key" };

export function getWppConfig(): WppServerConfig {
  return {
    baseUrl: localStorage.getItem(KEYS.baseUrl) || "http://localhost:3333",
    apiKey: localStorage.getItem(KEYS.apiKey) || "",
  };
}

export function saveWppConfig(c: WppServerConfig) {
  localStorage.setItem(KEYS.baseUrl, c.baseUrl.replace(/\/$/, ""));
  localStorage.setItem(KEYS.apiKey, c.apiKey);
}

async function req<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const { baseUrl, apiKey } = getWppConfig();
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { "X-Api-Key": apiKey } : {}),
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
  return data as T;
}

export const wpp = {
  status: () => req<{ status: string; session: string; error: string | null }>("/status"),
  qrCode: () => req<{ status: string; qr: string | null }>("/qr-code"),
  start: () => req<{ ok: boolean; status: string }>("/start", { method: "POST" }),
  reconnect: () => req<{ ok: boolean; status: string }>("/reconnect", { method: "POST" }),
  logout: () => req<{ ok: boolean }>("/logout", { method: "POST" }),
  send: (phone: string, message: string, tenantId?: string) =>
    req<{ ok: boolean; id: string }>("/send-message", {
      method: "POST",
      body: JSON.stringify({ phone, message, tenantId }),
    }),
};
