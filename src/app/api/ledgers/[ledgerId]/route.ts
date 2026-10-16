import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { readBody } from "@/lib/api";
import { ledgerNameSchema, requireLedgerAccess, serializeLedger } from "@/lib/ledgers";
import "@/models/User"; // registers the model for populate()

const updateSchema = z.object({ name: ledgerNameSchema });

/** GET /api/ledgers/:ledgerId — members only. */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/ledgers/[ledgerId]">) {
  const access = await requireLedgerAccess(req, (await ctx.params).ledgerId);
  if ("response" in access) return access.response;

  await access.ledger.populate("members.user", "username");
  return NextResponse.json({ ledger: serializeLedger(access.ledger.toObject(), access.user.id) });
}

/** PATCH /api/ledgers/:ledgerId { name } — owner only. */
export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/ledgers/[ledgerId]">) {
  const access = await requireLedgerAccess(req, (await ctx.params).ledgerId, { ownerOnly: true });
  if ("response" in access) return access.response;

  const body = await readBody(req, updateSchema);
  if ("response" in body) return body.response;

  access.ledger.name = body.data.name;
  await access.ledger.save();
  await access.ledger.populate("members.user", "username");
  return NextResponse.json({ ledger: serializeLedger(access.ledger.toObject(), access.user.id) });
}

/** DELETE /api/ledgers/:ledgerId — owner only; the embedded entries go with it. */
export async function DELETE(req: NextRequest, ctx: RouteContext<"/api/ledgers/[ledgerId]">) {
  const access = await requireLedgerAccess(req, (await ctx.params).ledgerId, { ownerOnly: true });
  if ("response" in access) return access.response;

  await access.ledger.deleteOne();
  return NextResponse.json({ ok: true });
}
