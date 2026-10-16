import { NextResponse, type NextRequest } from "next/server";
import { isValidObjectId } from "mongoose";
import { jsonError } from "@/lib/api";
import { requireLedgerAccess } from "@/lib/ledgers";
import { Ledger } from "@/models/Ledger";

/** The entry's author, the ledger owner, or an admin may delete it. */
export async function DELETE(
  req: NextRequest,
  ctx: RouteContext<"/api/ledgers/[ledgerId]/expenses/[expenseId]">,
) {
  const { ledgerId, expenseId } = await ctx.params;
  const access = await requireLedgerAccess(req, ledgerId);
  if ("response" in access) return access.response;
  const { user, ledger, role } = access;

  if (!isValidObjectId(expenseId)) return jsonError(404, "找不到這筆紀錄");
  // Fetch only the matching entry, not the whole entries array.
  const found = await Ledger.findOne(
    { _id: ledger._id, "entries._id": expenseId },
    { "entries.$": 1 },
  ).lean();
  const entry = found?.entries[0];
  if (!entry) return jsonError(404, "找不到這筆紀錄");

  if (String(entry.createdBy) !== user.id && role !== "owner" && user.role !== "admin") {
    return jsonError(403, "只能刪除自己記的帳");
  }

  await Ledger.updateOne({ _id: ledger._id }, { $pull: { entries: { _id: expenseId } } });
  return NextResponse.json({ ok: true });
}
