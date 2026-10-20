// The legal pages (terms, privacy, cookies, legal notice), in French and Dutch.
// The operator's details live in one place so a change of company is one edit.

export const LEGAL_PAGES = [
  "mentions",
  "conditions",
  "confidentialite",
  "cookies",
  "suppression",
] as const;
export type LegalPage = (typeof LEGAL_PAGES)[number];

export type LegalDoc = {
  title: string;
  sections: { title: string; body: string[] }[];
};
export type LegalTexts = {
  updated: string;
  nav: Record<LegalPage, string>;
  docs: Record<LegalPage, LegalDoc>;
};

/** The company that runs BatiNode. */
export const OPERATOR = {
  name: "Modern X Renov",
  enterprise: "1015.519.625",
  vat: "BE 1015.519.625",
  address: "Ruisbroeksesteenweg 9, 1600 Sint-Pieters-Leeuw, Belgique",
  addressNl: "Ruisbroeksesteenweg 9, 1600 Sint-Pieters-Leeuw, België",
  email: "support@batinode.be",
  site: "app.batinode.be",
};

/** Date the texts below came into force. */
export const LEGAL_UPDATED = "2026-10-20";

export function isLegalPage(page: string | undefined): page is LegalPage {
  return (LEGAL_PAGES as readonly string[]).includes(page ?? "");
}
