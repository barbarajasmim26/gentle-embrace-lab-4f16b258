import { useState, useCallback } from "react";

export type TemplateKey = "reminder" | "overdue" | "expiring" | "confirmation" | "welcome";

export const TEMPLATE_LABELS: Record<TemplateKey, string> = {
  reminder: "Lembrete de aluguel",
  overdue: "Cobrança com multa/juros",
  expiring: "Aviso de vencimento de contrato",
  confirmation: "Confirmação de pagamento",
  welcome: "Boas-vindas",
};

export const DEFAULT_TEMPLATES: Record<TemplateKey, string> = {
  reminder:
    "Olá {nome}! 😊\n\nLembramos que o aluguel de {mes}/{ano} no valor de R$ {valor} vence dia {vencimento}.\n\nImóvel: {endereco}{casa}\n\nQualquer dúvida, estamos à disposição!",
  overdue:
    "Olá {nome},\n\nIdentificamos que o aluguel de {mes}/{ano} está em atraso.\n\nValor original: R$ {valor}\nMulta: {multa}%\nJuros: {juros}%\nTotal atualizado: R$ {total}\n\nImóvel: {endereco}{casa}\n\nPor favor, regularize o quanto antes. Estamos à disposição!",
  expiring:
    "Olá {nome}!\n\nInformamos que seu contrato de aluguel está próximo do vencimento.\n\nImóvel: {endereco}{casa}\n\nEntre em contato para renovação. Obrigado!",
  confirmation:
    "Olá {nome}! ✅\n\nConfirmamos o recebimento do aluguel de {mes}/{ano} no valor de R$ {valor}.\n\nObrigado pela pontualidade!",
  welcome:
    "Olá {nome}! 🏠\n\nSeja bem-vindo(a) ao nosso imóvel!\n\nEndereço: {endereco}{casa}\nAluguel: R$ {valor}\nVencimento: todo dia {vencimento}\n\nQualquer dúvida, estamos à disposição!",
};

export const TEMPLATE_VARIABLES = [
  { tag: "{nome}", desc: "Nome do inquilino" },
  { tag: "{valor}", desc: "Valor do aluguel" },
  { tag: "{mes}", desc: "Mês de referência" },
  { tag: "{ano}", desc: "Ano de referência" },
  { tag: "{endereco}", desc: "Endereço do imóvel" },
  { tag: "{casa}", desc: "Número da casa" },
  { tag: "{vencimento}", desc: "Dia de vencimento" },
  { tag: "{multa}", desc: "% multa" },
  { tag: "{juros}", desc: "% juros" },
  { tag: "{total}", desc: "Total com encargos" },
];

const STORAGE_KEY = "whatsapp-templates";

function loadTemplates(): Record<TemplateKey, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_TEMPLATES, ...parsed };
    }
  } catch {}
  return { ...DEFAULT_TEMPLATES };
}

function saveTemplates(templates: Record<TemplateKey, string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
}

const MONTHS_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export interface FillData {
  name: string;
  amount: number;
  month: number;
  year: number;
  property: string;
  houseNumber?: string;
  dueDay?: number;
  lateFee?: number;
  interest?: number;
  totalWithFees?: number;
}

export function fillTemplate(tpl: string, data: FillData): string {
  const monthName = MONTHS_PT[data.month - 1] || "";
  return tpl
    .replace(/\{nome\}/g, data.name)
    .replace(/\{valor\}/g, data.amount.toFixed(2))
    .replace(/\{mes\}/g, monthName)
    .replace(/\{ano\}/g, String(data.year))
    .replace(/\{endereco\}/g, data.property)
    .replace(/\{casa\}/g, data.houseNumber ? `, Casa ${data.houseNumber}` : "")
    .replace(/\{vencimento\}/g, String(data.dueDay || 10))
    .replace(/\{multa\}/g, String(data.lateFee || 10))
    .replace(/\{juros\}/g, String(data.interest || 1))
    .replace(/\{total\}/g, (data.totalWithFees || data.amount).toFixed(2));
}

export function useMessageTemplates() {
  const [templates, setTemplates] = useState<Record<TemplateKey, string>>(loadTemplates);

  const updateTemplate = useCallback((key: TemplateKey, text: string) => {
    setTemplates((prev) => {
      const next = { ...prev, [key]: text };
      saveTemplates(next);
      return next;
    });
  }, []);

  const resetTemplate = useCallback((key: TemplateKey) => {
    setTemplates((prev) => {
      const next = { ...prev, [key]: DEFAULT_TEMPLATES[key] };
      saveTemplates(next);
      return next;
    });
  }, []);

  const resetAll = useCallback(() => {
    const defaults = { ...DEFAULT_TEMPLATES };
    setTemplates(defaults);
    saveTemplates(defaults);
  }, []);

  const isModified = useCallback(
    (key: TemplateKey) => templates[key] !== DEFAULT_TEMPLATES[key],
    [templates]
  );

  return { templates, updateTemplate, resetTemplate, resetAll, isModified };
}
