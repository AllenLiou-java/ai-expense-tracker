import { NextResponse, type NextRequest } from "next/server";
import { Types, type PipelineStage } from "mongoose";
import { z } from "zod";
import { jsonError, readBody } from "@/lib/api";
import { requireLedgerAccess } from "@/lib/ledgers";
import { AI_MODEL, analyzeExpenseText } from "@/lib/ai";
import { Ledger } from "@/models/Ledger";
import { User } from "@/models/User";
import { serializeExpense as serialize } from "@/lib/expenses";

const createSchema = z.object({
  text: z.string().trim().min(1, "請輸入記帳內容").max(500, "內容最多 500 字"),
});

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

/** POST /api/ledgers/:ledgerId/expenses { text } — AI parses the sentence, then saves every entry into the ledger. */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/ledgers/[ledgerId]/expenses">) {
  const access = await requireLedgerAccess(req, (await ctx.params).ledgerId);
  if ("response" in access) return access.response;
  const { user, ledger } = access;

  const body = await readBody(req, createSchema);
  if ("response" in body) return body.response;
  const { text } = body.data;

  let analysis;
  try {
    analysis = await analyzeExpenseText(text);
  } catch (err) {
    console.error("OpenAI analysis failed", err);
    return jsonError(502, "AI 分析失敗，請稍後再試");
  }

  if (analysis.entries.length === 0) {
    return NextResponse.json(
      { error: analysis.reply, analysis, expenses: [] },
      { status: 422 },
    );
  }

  const now = new Date();
  const entries = analysis.entries.map((e) => ({
    ...e,
    _id: new Types.ObjectId(),
    date: new Date(`${e.date}T00:00:00Z`),
    rawText: text,
    aiModel: AI_MODEL,
    createdBy: new Types.ObjectId(user.id),
    createdAt: now,
    updatedAt: now,
  }));

  // Membership is re-checked in the filter, in case the user was removed meanwhile.
  const { matchedCount } = await Ledger.updateOne(
    { _id: ledger._id, "members.user": user.id },
    { $push: { entries: { $each: entries } } },
    { runValidators: true },
  );
  if (matchedCount === 0) return jsonError(404, "找不到這本記帳本");

  const created = entries
    .map((e) => ({ ...e, createdBy: { _id: e.createdBy, username: user.username } }))
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  return NextResponse.json(
    { analysis, expenses: created.map(serialize) },
    { status: 201 },
  );
}
