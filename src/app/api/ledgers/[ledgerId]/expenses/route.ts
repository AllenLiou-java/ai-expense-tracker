import { NextResponse, type NextRequest } from "next/server";
import { Types, type PipelineStage } from "mongoose";
import { z } from "zod";
import { jsonError, readBody } from "@/lib/api";
import { requireLedgerAccess } from "@/lib/ledgers";
import { AI_MODEL, analyzeExpenseText, describeAiError, readApiKey } from "@/lib/ai";
import { Ledger } from "@/models/Ledger";
import { User } from "@/models/User";
import { serializeExpense as serialize } from "@/lib/expenses";
import { categoriesFor, EXPENSE_TYPES } from "@/lib/categories";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式需為 YYYY-MM-DD")
  .refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)), "日期不正確");

const createSchema = z.discriminatedUnion("mode", [
  // AI mode: one sentence, possibly several entries.
  z.object({
    mode: z.literal("ai"),
    text: z.string().trim().min(1, "請輸入記帳內容").max(500, "內容最多 500 字"),
  }),
  // Manual mode: exactly one entry picked from the form.
  z.object({
    mode: z.literal("manual"),
    type: z.enum(EXPENSE_TYPES, "請選擇支出或收入"),
    amount: z.number("請輸入金額").positive("金額需大於 0").max(1e10, "金額太大"),
    category: z.string().trim().min(1, "請選擇類別").max(20, "類別名稱太長"),
    description: z.string().trim().max(60, "品項最多 60 字").optional(),
    date: isoDate,
  }),
], { error: "mode 需為 ai 或 manual" });

type NewEntry = {
  type: string;
  amount: number;
  currency: string;
  category: string;
  description: string;
  merchant: string | null;
  date: string;
};

/**
 * GET /api/ledgers/:ledgerId/expenses?scope=mine|all&month=YYYY-MM
 * Members see every entry in the ledger; scope=mine narrows to the caller's entries.
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/ledgers/[ledgerId]/expenses">) {
  const access = await requireLedgerAccess(req, (await ctx.params).ledgerId);
  if ("response" in access) return access.response;
  const { user, ledger } = access;

  const params = req.nextUrl.searchParams;
  const filter: Record<string, unknown> = {};
  if (params.get("scope") === "mine") filter.createdBy = new Types.ObjectId(user.id);

  const month = params.get("month");
  if (month) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return jsonError(400, "month 格式需為 YYYY-MM");
    }
    const [y, m] = month.split("-").map(Number);
    filter.date = { $gte: new Date(Date.UTC(y, m - 1, 1)), $lt: new Date(Date.UTC(y, m, 1)) };
  }

  // Entries are embedded in the ledger document; unwind them so the database filters and sorts.
  const pipeline: PipelineStage[] = [
    { $match: { _id: ledger._id } },
    { $unwind: "$entries" },
    { $replaceRoot: { newRoot: "$entries" } },
    { $match: filter },
    { $sort: { date: -1, createdAt: -1 } },
    { $limit: 500 },
  ];
  const entries = await Ledger.aggregate(pipeline);
  await User.populate(entries, { path: "createdBy", select: "username", model: User });

  return NextResponse.json({ expenses: entries.map(serialize) });
}

/**
 * POST /api/ledgers/:ledgerId/expenses
 *   { mode: "ai", text } — AI parses the sentence into one or more entries.
 *     The caller's own OpenAI key goes in the x-openai-key header.
 *   { mode: "manual", type, amount, category, description?, date } — saves exactly one entry as given.
 */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/ledgers/[ledgerId]/expenses">) {
  const access = await requireLedgerAccess(req, (await ctx.params).ledgerId);
  if ("response" in access) return access.response;
  const { user, ledger } = access;

  const body = await readBody(req, createSchema);
  if ("response" in body) return body.response;
  const input = body.data;

  if (input.mode === "manual") {
    if (!categoriesFor(input.type, ledger.categories).includes(input.category)) {
      return jsonError(400, `這本記帳本沒有「${input.category}」類別`);
    }
    const entry: NewEntry = {
      type: input.type,
      amount: Math.round(input.amount * 100) / 100,
      currency: "TWD",
      category: input.category,
      // The category stands in when no item was typed, so the list never shows a blank row.
      description: input.description || input.category,
      merchant: null,
      date: input.date,
    };
    return save(ledger._id, user, [entry], { source: "manual", rawText: null, aiModel: null });
  }

  const { text } = input;
  const key = readApiKey(req);
  if (!("apiKey" in key)) return NextResponse.json(key, { status: key.status });

  let analysis;
  try {
    analysis = await analyzeExpenseText(text, key.apiKey, ledger.categories);
  } catch (err) {
    const failure = describeAiError(err);
    // Log only the classification: OpenAI's own messages can echo part of the key.
    console.error("OpenAI analysis failed:", failure.code, (err as { status?: number })?.status ?? "");
    return NextResponse.json(failure, { status: failure.status });
  }

  if (analysis.entries.length === 0) {
    return NextResponse.json(
      { error: analysis.reply, analysis, expenses: [] },
      { status: 422 },
    );
  }

  return save(ledger._id, user, analysis.entries, { source: "ai", rawText: text, aiModel: AI_MODEL }, { analysis });
}

async function save(
  ledgerId: Types.ObjectId,
  user: { id: string; username: string },
  parsed: NewEntry[],
  origin: { source: "ai" | "manual"; rawText: string | null; aiModel: string | null },
  extra: Record<string, unknown> = {},
) {
  const now = new Date();
  const entries = parsed.map((e) => ({
    ...e,
    ...origin,
    _id: new Types.ObjectId(),
    date: new Date(`${e.date}T00:00:00Z`),
    createdBy: new Types.ObjectId(user.id),
    createdAt: now,
    updatedAt: now,
  }));

  // Membership is re-checked in the filter, in case the user was removed meanwhile.
  const { matchedCount } = await Ledger.updateOne(
    { _id: ledgerId, "members.user": user.id },
    { $push: { entries: { $each: entries } } },
    { runValidators: true },
  );
  if (matchedCount === 0) return jsonError(404, "找不到這本記帳本");

  const created = entries
    .map((e) => ({ ...e, createdBy: { _id: e.createdBy, username: user.username } }))
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  return NextResponse.json(
    { ...extra, expenses: created.map(serialize) },
    { status: 201 },
  );
}
