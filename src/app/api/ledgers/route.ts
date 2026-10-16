import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { jsonError, readBody } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { ledgerNameSchema, createLedger, serializeLedger } from "@/lib/ledgers";
import { Ledger } from "@/models/Ledger";
import "@/models/User"; // registers the model for populate()

const createSchema = z.object({ name: ledgerNameSchema });

/** GET /api/ledgers — every ledger the caller owns or has joined. */
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return jsonError(401, "尚未登入");

  await connectDB();
  const ledgers = await Ledger.find({ "members.user": user.id })
    .select("-entries")
    .sort({ createdAt: 1 })
    .populate("members.user", "username")
    .lean();

  return NextResponse.json({ ledgers: ledgers.map((b) => serializeLedger(b, user.id)) });
}

/** POST /api/ledgers { name } — the caller becomes the owner; an invite code is issued right away. */
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return jsonError(401, "尚未登入");

  const body = await readBody(req, createSchema);
  if ("response" in body) return body.response;

  const ledger = await createLedger(user.id, body.data.name);
  await ledger.populate("members.user", "username");
  return NextResponse.json({ ledger: serializeLedger(ledger.toObject(), user.id) }, { status: 201 });
}
