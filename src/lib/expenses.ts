import "server-only";

type PopulatedExpense = {
  _id: unknown;
  type: string;
  amount: number;
  currency: string;
  category: string;
  description: string;
  merchant?: string | null;
  date: Date;
  rawText: string;
  createdBy: unknown;
  createdAt?: Date;
};

/** Shape sent to the client; createdBy is expected to be populated with username. */
export function serializeExpense(e: PopulatedExpense) {
  const author = e.createdBy as { _id?: unknown; username?: string } | null;
  return {
    id: String(e._id),
    type: e.type,
    amount: e.amount,
    currency: e.currency,
    category: e.category,
    description: e.description,
    merchant: e.merchant ?? null,
    date: new Date(e.date).toISOString().slice(0, 10),
    rawText: e.rawText,
    createdBy: {
      id: String(author?._id ?? author),
      username: author?.username ?? "已刪除的使用者",
    },
    createdAt: e.createdAt,
  };
}

export type ExpenseDTO = ReturnType<typeof serializeExpense>;
