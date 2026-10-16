import { Schema, type InferSchemaType } from "mongoose";
import { ENTRY_SOURCES, EXPENSE_TYPES } from "@/lib/categories";

export { EXPENSE_TYPES };

/** One entry, embedded in a ledger's `entries` array (see models/Ledger.ts). */
export const expenseEntrySchema = new Schema(
  {
    type: { type: String, required: true, enum: EXPENSE_TYPES },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, default: "TWD" },
    // A preset or one of the ledger's own categories; the API checks which are allowed.
    category: { type: String, required: true, trim: true, maxlength: 20 },
    description: { type: String, required: true, trim: true },
    merchant: { type: String, default: null },
    date: { type: Date, required: true },
    // How the entry was recorded. Entries from before this field existed were all AI-parsed.
    source: { type: String, enum: ENTRY_SOURCES, default: "ai" },
    // For AI entries: the user's original sentence and which model interpreted it.
    rawText: { type: String, default: null },
    aiModel: { type: String, default: null },
    // Who recorded this entry.
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

export type ExpenseEntry = InferSchemaType<typeof expenseEntrySchema>;
