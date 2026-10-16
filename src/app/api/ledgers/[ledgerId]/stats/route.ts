import { NextResponse, type NextRequest } from "next/server";
import { type PipelineStage } from "mongoose";
import { jsonError } from "@/lib/api";
import { requireLedgerAccess } from "@/lib/ledgers";
import { Ledger } from "@/models/Ledger";
import { User } from "@/models/User";

type Bucket = { _id: string; amount: number; count: number };

/**
 * GET /api/ledgers/:ledgerId/stats?period=month&value=YYYY-MM
 * GET /api/ledgers/:ledgerId/stats?period=year&value=YYYY
 * Spending totals for the period, broken down by category, by member, and (for a year) by month.
 * Only TWD entries are summed; entries in other currencies are counted separately.
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/ledgers/[ledgerId]/stats">) {
  const access = await requireLedgerAccess(req, (await ctx.params).ledgerId);
  if ("response" in access) return access.response;
  const { ledger } = access;

  const params = req.nextUrl.searchParams;
  const period = params.get("period");
  const value = params.get("value") ?? "";
  let from: Date, to: Date;
  if (period === "month" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    const [y, m] = value.split("-").map(Number);
    from = new Date(Date.UTC(y, m - 1, 1));
    to = new Date(Date.UTC(y, m, 1));
  } else if (period === "year" && /^\d{4}$/.test(value)) {
    from = new Date(Date.UTC(Number(value), 0, 1));
    to = new Date(Date.UTC(Number(value) + 1, 0, 1));
  } else {
    return jsonError(400, "period 需為 month（value=YYYY-MM）或 year（value=YYYY）");
  }

  const spending = { type: "expense", currency: "TWD" };
  const sumBy = (key: unknown): PipelineStage.FacetPipelineStage[] => [
    { $match: spending },
    { $group: { _id: key, amount: { $sum: "$amount" }, count: { $sum: 1 } } },
    { $sort: { amount: -1 } },
  ];

  const [result] = await Ledger.aggregate<{
    totals: { spent: number; income: number; count: number }[];
    otherCurrency: { count: number }[];
    byCategory: Bucket[];
    byMember: Bucket[];
    byMonth: Bucket[];
  }>([
    { $match: { _id: ledger._id } },
    { $unwind: "$entries" },
    { $replaceRoot: { newRoot: "$entries" } },
    { $match: { date: { $gte: from, $lt: to } } },
    {
      $facet: {
        totals: [
          { $match: { currency: "TWD" } },
          {
            $group: {
              _id: null,
              spent: { $sum: { $cond: [{ $eq: ["$type", "expense"] }, "$amount", 0] } },
              income: { $sum: { $cond: [{ $eq: ["$type", "income"] }, "$amount", 0] } },
              count: { $sum: 1 },
            },
          },
        ],
        otherCurrency: [{ $match: { currency: { $ne: "TWD" } } }, { $count: "count" }],
        byCategory: sumBy("$category"),
        byMember: sumBy("$createdBy"),
        // Months only matter for a year; a facet can't be empty, so match nothing otherwise.
        byMonth:
          period === "year"
            ? sumBy({ $dateToString: { format: "%Y-%m", date: "$date" } })
            : [{ $match: { _id: { $exists: false } } }],
      },
    },
  ]);

  const { spent = 0, income = 0, count = 0 } = result?.totals[0] ?? {};
  const totals = { spent, income, count };

  // Every current member is listed (at 0 if they spent nothing); former members only if they spent.
  const spentByUser = new Map((result?.byMember ?? []).map((b) => [String(b._id), b]));
  const userIds = [...new Set([...ledger.members.map((m) => String(m.user)), ...spentByUser.keys()])];
  const users = await User.find({ _id: { $in: userIds } }, { username: 1 }).lean();
  const names = new Map(users.map((u) => [String(u._id), u.username]));
  const byMember = userIds
    .map((id) => ({
      id,
      label: names.get(id) ?? "已刪除的使用者",
      amount: spentByUser.get(id)?.amount ?? 0,
      count: spentByUser.get(id)?.count ?? 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  const monthly = new Map((result?.byMonth ?? []).map((b) => [b._id, b]));
  const byMonth =
    period === "year"
      ? Array.from({ length: 12 }, (_, i) => {
          const key = `${value}-${String(i + 1).padStart(2, "0")}`;
          return { month: key, amount: monthly.get(key)?.amount ?? 0, count: monthly.get(key)?.count ?? 0 };
        })
      : null;

  return NextResponse.json({
    period,
    value,
    totals: { ...totals, balance: totals.income - totals.spent },
    otherCurrencyCount: result?.otherCurrency[0]?.count ?? 0,
    byCategory: (result?.byCategory ?? []).map((b) => ({ id: b._id, label: b._id, amount: b.amount, count: b.count })),
    byMember,
    byMonth,
  });
}
