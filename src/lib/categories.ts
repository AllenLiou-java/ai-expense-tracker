// Shared by the server (validation, AI schema) and the client (category picker).
export const EXPENSE_TYPES = ["expense", "income"] as const;
export type EntryType = (typeof EXPENSE_TYPES)[number];

export const ENTRY_SOURCES = ["ai", "manual"] as const;

/** Built-in categories every ledger starts with. "其他" is always listed last. */
export const PRESET_CATEGORIES: Record<EntryType, readonly string[]> = {
  expense: ["餐飲", "交通", "購物", "娛樂", "居住", "醫療", "教育", "帳單", "其他"],
  income: ["薪資", "獎金", "投資", "其他"],
};

export const CATEGORY_NAME_MAX = 12;
export const CUSTOM_CATEGORY_LIMIT = 50;
const FALLBACK = "其他";

/** A ledger's categories for one type: presets, then the ledger's own, then "其他". */
export function categoriesFor(type: EntryType, custom: readonly { name: string; type: string }[] = []) {
  const names = [...PRESET_CATEGORIES[type], ...custom.filter((c) => c.type === type).map((c) => c.name)];
  return [...new Set(names.filter((n) => n !== FALLBACK)), FALLBACK];
}

/** Trims and collapses inner whitespace so "  早 餐 " and "早 餐" count as one category. */
export function normalizeCategoryName(name: string) {
  return name.trim().replace(/\s+/g, " ");
}
