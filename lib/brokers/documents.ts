/**
 * Document types a broker's KYC checklist can ask for. The usual set for a
 * Pakistani brokerage account; confirm the list with the owner (see PROGRESS.md).
 */
export const DOCUMENT_TYPES = [
  { key: "cnic_front", label: "CNIC front" },
  { key: "cnic_back", label: "CNIC back" },
  { key: "photo", label: "Passport-size photo" },
  { key: "signature", label: "Signature specimen" },
  { key: "proof_of_income", label: "Proof of income or source of funds" },
  { key: "bank_proof", label: "Bank statement or cancelled cheque" },
  { key: "proof_of_address", label: "Proof of address (utility bill)" },
  { key: "zakat_declaration", label: "Zakat declaration (CZ-50)" },
  { key: "nominee_cnic", label: "Nominee CNIC" },
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number]["key"];
export const DOCUMENT_KEYS = DOCUMENT_TYPES.map((d) => d.key) as DocumentType[];

/** What a new broker starts with. */
export const DEFAULT_CHECKLIST: DocumentType[] = [
  "cnic_front",
  "cnic_back",
  "photo",
  "signature",
  "proof_of_income",
  "bank_proof",
];

export function documentLabel(key: string): string {
  return DOCUMENT_TYPES.find((d) => d.key === key)?.label ?? key;
}

export const MARKETS = [
  { value: "psx", label: "PSX", long: "Pakistan Stock Exchange" },
  { value: "pmex", label: "PMEX", long: "Pakistan Mercantile Exchange" },
  { value: "other", label: "Other", long: "Other market" },
] as const;

export type Market = (typeof MARKETS)[number]["value"];
