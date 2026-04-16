import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "whatsapp_message_templates";

export interface SavedTemplates {
  reminder: string;
  overdue: string;
  expiring: string;
  confirmation: string;
  welcome: string;
}

const DEFAULT_TEMPLATES: SavedTemplates = {
  reminder: `Olá {nome}! 😊\n\nLembramos que o aluguel de {mes}/{ano} no valor de R$ {valor} vence dia {vencimento}.\n\nImóvel: {endereco}{casa}\n\nQualquer dúvida, estamos à disposição!`,
  overdue: `Olá {nome},\n\nIdentificamos que o aluguel de {mes}/{ano} está em atraso.\n\nValor original: R$ {valor}\nMulta: {multa}%\nJuros: {juros}%\nTotal atualizado: R$ {total}\n\nImóvel: {endereco}{casa}\n\nPor favor, regularize o quanto antes. Estamos à disposição!`,
  expiring: `Olá {nome}!\n\nInformamos que seu contrato de aluguel está próximo do vencimento.\n\nImóvel: {endereco}{casa}\n\nEntre em contato para renovação. Obrigado!`,
  confirmation: `Olá {nome}! ✅\n\nConfirmamos o recebimento do aluguel de {mes}/{ano} no valor de R$ {valor}.\n\nObrigado pela pontualidade!`,
  welcome: `Olá {nome}! 🏠\n\nSeja bem-vindo(a) ao nosso imóvel!\n\nEndereço: {endereco}{casa}\nAluguel: R$ {valor}\nVencimento: todo dia {vencimento}\n\nQualquer dúvida, estamos à disposição!`,
};

export const TEMPLATE_VARIABLES = [
  { tag: "{nome}", desc: "Nome do inquilino" },
  { tag: "{valor}", desc: "Valor do aluguel" },
  { tag: "{mes}", desc: "Mês de referência" },
  { tag: "{ano}", desc: "Ano de referência" },
  { tag: "{vencimento}", desc: "Dia do vencimento" },
  { tag: "{endereco}", desc: "Endereço do imóvel" },
  { tag: "{casa}", desc: "Número da casa" },
  { tag: "{multa}", desc: "% da multa" },
  { tag: "{juros}", desc: "% dos juros" },
  { tag: "{total}", desc: "Total com multa/juros" },
];

export function useMessageTemplates() {
  const [templates, setTemplates] = useState<SavedTemplates>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return { ...DEFAULT_TEMPLATES, ...JSON.parse(saved) };
    } catch { /* ignore */ }
    return DEFAULT_TEMPLATES;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
  }, [templates]);

  const updateTemplate = useCallback((key: keyof SavedTemplates, value: string) => {
    setTemplates((prev) => ({ ...prev, [key]: value }));
  }, []);

  const resetTemplate = useCallback((key: keyof SavedTemplates) => {
    setTemplates((prev) => ({ ...prev, [key]: DEFAULT_TEMPLATES[key] }));
  }, []);

  const resetAll = useCallback(() => {
    setTemplates(DEFAULT_TEMPLATES);
  }, []);

  return { templates, updateTemplate, resetTemplate, resetAll, defaults: DEFAULT_TEMPLATES };
}

const MONTHS_PT = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export interface FillTemplateData {
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

export function fillTemplate(template: string, data: FillTemplateData): string {
  const monthName = MONTHS_PT[data.month - 1] || "";
  return template
    .replace(/\{nome\}/g, data.name)
    .replace(/\{valor\}/g, data.amount.toFixed(2))
    .replace(/\{mes\}/g, monthName)
    .replace(/\{ano\}/g, String(data.year))
    .replace(/\{vencimento\}/g, String(data.dueDay || 10))
    .replace(/\{endereco\}/g, data.property)
    .replace(/\{casa\}/g, data.houseNumber ? `, Casa ${data.houseNumber}` : "")
    .replace(/\{multa\}/g, String(data.lateFee || 2))
    .replace(/\{juros\}/g, String(data.interest || 1))
    .replace(/\{total\}/g, (data.totalWithFees || data.amount).toFixed(2));
}
