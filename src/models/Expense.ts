import { Schema, type InferSchemaType } from "mongoose";

export const EXPENSE_TYPES = ["expense", "income"] as const;
export const CATEGORIES = [
  "餐飲",
  "交通",
  "購物",
  "娛樂",
  "居住",
  "醫療",
  "教育",
  "帳單",
  "薪資",
  "投資",
  "其他",
] as const;

/** One entry, embedded in a ledger's `entries` array (see models/Ledger.ts). */
export const expenseEntrySchema = new Schema(
  {
    type: { type: String, required: true, enum: EXPENSE_TYPES },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, default: "TWD" },
    category: { type: String, required: true, enum: CATEGORIES },
    description: { type: String, required: true, trim: true },
    merchant: { type: String, default: null },
    date: { type: Date, required: true },
    // The user's original sentence and which model interpreted it.
    rawText: { type: String, required: true },
    aiModel: { type: String, required: true },
    // Who recorded this entry.
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

export type ExpenseEntry = InferSchemaType<typeof expenseEntrySchema>;
