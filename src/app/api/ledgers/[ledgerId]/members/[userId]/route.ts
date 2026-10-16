import { NextResponse, type NextRequest } from "next/server";
import { jsonError } from "@/lib/api";
import { requireLedgerAccess } from "@/lib/ledgers";
import { Ledger } from "@/models/Ledger";

/**
 * DELETE /api/ledgers/:ledgerId/members/:userId
 * The owner can remove any member; a member can remove themselves (leave the ledger).
 * The owner can't leave, they delete the ledger instead. Entries the member recorded stay.
 */
export async function DELETE(
  req: NextRequest,
  ctx: RouteContext<"/api/ledgers/[ledgerId]/members/[userId]">,
) {
  const { ledgerId, userId } = await ctx.params;
  const access = await requireLedgerAccess(req, ledgerId);
  if ("response" in access) return access.response;
  const { user, ledger, role } = access;

  if (userId !== user.id && role !== "owner") {
    return jsonError(403, "只有記帳本擁有者可以移除成員");
  }
  if (userId === String(ledger.owner)) {
    return jsonError(400, "擁有者無法退出記帳本，請改為刪除記帳本");
  }
  if (!ledger.members.some((m) => String(m.user) === userId)) {
    return jsonError(404, "此使用者不是記帳本成員");
  }

  await Ledger.updateOne({ _id: ledger._id }, { $pull: { members: { user: userId } } });
  return NextResponse.json({ ok: true });
}
