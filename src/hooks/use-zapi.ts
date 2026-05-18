import { useState } from "react";
import { normalizeBrazilPhone } from "@/lib/whatsapp";

const KEYS = {
  instanceId: "zapi_instance_id",
  token: "zapi_token",
  clientToken: "zapi_client_token",
};

export interface ZApiConfig {
  instanceId: string;
  token: string;
  clientToken: string;
}

export function useZApiConfig() {
  const [config, setConfig] = useState<ZApiConfig>({
    instanceId: localStorage.getItem(KEYS.instanceId) || "",
    token: localStorage.getItem(KEYS.token) || "",
    clientToken: localStorage.getItem(KEYS.clientToken) || "",
  });

  const isConfigured = !!(config.instanceId && config.token && config.clientToken);

  const saveConfig = (c: ZApiConfig) => {
    localStorage.setItem(KEYS.instanceId, c.instanceId);
    localStorage.setItem(KEYS.token, c.token);
    localStorage.setItem(KEYS.clientToken, c.clientToken);
    setConfig({ ...c });
  };

  const clearConfig = () => {
    Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
    setConfig({ instanceId: "", token: "", clientToken: "" });
  };

  return { config, isConfigured, saveConfig, clearConfig };
}

export async function sendViaZApi(
  config: ZApiConfig,
  phone: string,
  message: string
): Promise<{ success: boolean; error?: string }> {
  const normalizedPhone = normalizeBrazilPhone(phone);
  const url = `https://api.z-api.io/instances/${config.instanceId}/token/${config.token}/send-text`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Client-Token": config.clientToken,
      },
      body: JSON.stringify({ phone: normalizedPhone, message }),
    });
    if (!res.ok) {
      const text = await res.text();
      return { success: false, error: text };
    }
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function getZApiQrCodeUrl(config: ZApiConfig): Promise<string> {
  return `https://api.z-api.io/instances/${config.instanceId}/token/${config.token}/qr-code/image`;
}

export async function getZApiStatus(config: ZApiConfig): Promise<"connected" | "disconnected" | "error"> {
  const url = `https://api.z-api.io/instances/${config.instanceId}/token/${config.token}/status`;
  try {
    const res = await fetch(url, {
      headers: { "Client-Token": config.clientToken },
    });
    if (!res.ok) return "error";
    const data = await res.json();
    return data.connected ? "connected" : "disconnected";
  } catch {
    return "error";
  }
}
