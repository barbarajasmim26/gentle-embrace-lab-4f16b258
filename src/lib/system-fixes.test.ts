import { describe, expect, it } from "vitest";
import { extractSupabaseStoragePath, isAbsoluteHttpUrl } from "@/lib/document-url";
import { buildWhatsAppUrl, normalizeBrazilPhone } from "@/lib/whatsapp";
import { formatReceiptDate, parseReceiptDate } from "@/lib/receipt-generator";

describe("whatsapp helpers", () => {
  it("normalizes Brazilian phone numbers and builds the redirect URL", () => {
    expect(normalizeBrazilPhone("(88) 99999-1111")).toBe("5588999991111");

    const url = buildWhatsAppUrl({
      phone: "(88) 99999-1111",
      message: "Olá, vencimento do aluguel.",
    });

    expect(url).toContain("https://api.whatsapp.com/send");
    expect(url).toContain("phone=5588999991111");
    expect(url).toContain("text=Ol%C3%A1%2C+vencimento+do+aluguel.");
  });
});

describe("document url helpers", () => {
  it("extracts the storage path from direct Supabase storage URLs", () => {
    const path = extractSupabaseStoragePath(
      "https://abc.supabase.co/storage/v1/object/public/contracts/tenant-1/Contrato%20Adones.pdf",
    );

    expect(path).toBe("tenant-1/Contrato Adones.pdf");
  });

  it("keeps raw storage paths and detects absolute URLs", () => {
    expect(extractSupabaseStoragePath("tenant-1/contrato.pdf")).toBe("tenant-1/contrato.pdf");
    expect(isAbsoluteHttpUrl("https://example.com/file.pdf")).toBe(true);
    expect(isAbsoluteHttpUrl("tenant-1/contrato.pdf")).toBe(false);
  });
});

describe("receipt date helpers", () => {
  it("parses both ISO and pt-BR date formats consistently", () => {
    const isoDate = parseReceiptDate("2026-04-15");
    const brDate = parseReceiptDate("15/04/2026");

    expect(isoDate.getFullYear()).toBe(2026);
    expect(isoDate.getMonth()).toBe(3);
    expect(isoDate.getDate()).toBe(15);

    expect(brDate.getFullYear()).toBe(2026);
    expect(brDate.getMonth()).toBe(3);
    expect(brDate.getDate()).toBe(15);
  });

  it("formats the receipt city and date in Portuguese", () => {
    expect(formatReceiptDate("2026-04-15")).toBe("Fortaleza 15 de abril de 2026");
  });
});
