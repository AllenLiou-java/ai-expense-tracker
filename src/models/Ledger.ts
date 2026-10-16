import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { expenseEntrySchema } from "./Expense";

export const MEMBER_ROLES = ["owner", "member"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

const memberSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, required: true, enum: MEMBER_ROLES, default: "member" },
    joinedAt: { type: Date, required: true, default: Date.now },
  },
  { _id: false },
);

/**
 * A shared ledger, stored in the `expenses` collection: one document per ledger,
 * with its members, invite code and every entry embedded. One owner creates it,
 * others join with the invite code.
 */
const ledgerSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 40 },
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true },
    // The owner is also listed here (role "owner"), so membership checks need one query.
    members: { type: [memberSchema], required: true },
    // Rotated by the owner; null disables joining.
    inviteCode: { type: String, default: null },
    inviteCodeExpiresAt: { type: Date, default: null },
    // Can grow large; exclude with select("-entries") unless the entries are needed.
    entries: { type: [expenseEntrySchema], default: [] },
  },
  { timestamps: true, collection: "expenses" },
);

ledgerSchema.index({ "members.user": 1 });
// Partial so many ledgers can have inviteCode null.
ledgerSchema.index(
  { inviteCode: 1 },
  { unique: true, partialFilterExpression: { inviteCode: { $type: "string" } } },
);

export type LedgerDoc = InferSchemaType<typeof ledgerSchema>;

export const Ledger: Model<LedgerDoc> =
  (models.Ledger as Model<LedgerDoc>) || model<LedgerDoc>("Ledger", ledgerSchema);
