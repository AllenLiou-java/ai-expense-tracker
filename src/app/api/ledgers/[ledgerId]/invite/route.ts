import { NextResponse, type NextRequest } from "next/server";
import { isDuplicateKeyError, jsonError } from "@/lib/api";
import { generateInviteCode, INVITE_TTL_MS, requireLedgerAccess } from "@/lib/ledgers";

/** POST /api/ledgers/:ledgerId/invite — owner only; issues a fresh code and invalidates the old one. */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/ledgers/[ledgerId]/invite">) {
  const access = await requireLedgerAccess(req, (await ctx.params).ledgerId, { ownerOnly: true });
  if ("response" in access) return access.response;
  const { ledger } = access;

  for (let attempt = 0; attempt < 3; attempt++) {
    ledger.inviteCode = generateInviteCode();
    ledger.inviteCodeExpiresAt = new Date(Date.now() + INVITE_TTL_MS);
    try {
      await ledger.save();
      return NextResponse.json({
        invite: { code: ledger.inviteCode, expiresAt: ledger.inviteCodeExpiresAt },
      });
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err;
    }
  }
  return jsonError(500, "無法產生邀請碼，請再試一次");
}

/** DELETE /api/ledgers/:ledgerId/invite — owner only; stops anyone new from joining. */
export async function DELETE(req: NextRequest, ctx: RouteContext<"/api/ledgers/[ledgerId]/invite">) {
  const access = await requireLedgerAccess(req, (await ctx.params).ledgerId, { ownerOnly: true });
  if ("response" in access) return access.response;

  access.ledger.inviteCode = null;
  access.ledger.inviteCodeExpiresAt = null;
  await access.ledger.save();
  return NextResponse.json({ invite: null });
}
