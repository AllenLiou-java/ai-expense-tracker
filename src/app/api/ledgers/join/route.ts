import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { jsonError, readBody } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { normalizeInviteCode, serializeLedger } from "@/lib/ledgers";
import { Ledger } from "@/models/Ledger";
import "@/models/User"; // registers the model for populate()

const joinSchema = z.object({
  code: z.string().trim().min(1, "請輸入邀請碼").max(32, "邀請碼格式不正確"),
});

/** POST /api/ledgers/join { code } — joins the ledger the invite code belongs to. */
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return jsonError(401, "尚未登入");

  const body = await readBody(req, joinSchema);
  if ("response" in body) return body.response;
  const code = normalizeInviteCode(body.data.code);

  await connectDB();
  const ledger = await Ledger.findOne({ inviteCode: code, inviteCodeExpiresAt: { $gt: new Date() } })
    .select("-entries");
  if (!ledger) return jsonError(404, "邀請碼無效或已過期");

  const alreadyMember = ledger.members.some((m) => String(m.user) === user.id);
  if (!alreadyMember) {
    // Conditional push keeps a double-submit from adding the same member twice.
    await Ledger.updateOne(
      { _id: ledger._id, "members.user": { $ne: user.id } },
      { $push: { members: { user: user.id, role: "member", joinedAt: new Date() } } },
    );
  }

  const updated = await Ledger.findById(ledger._id)
    .select("-entries")
    .populate("members.user", "username")
    .lean();
  return NextResponse.json(
    { ledger: serializeLedger(updated!, user.id), alreadyMember },
    { status: alreadyMember ? 200 : 201 },
  );
}
