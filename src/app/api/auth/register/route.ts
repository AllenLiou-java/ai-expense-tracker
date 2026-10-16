import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { isDuplicateKeyError, jsonError, readBody } from "@/lib/api";
import { setSessionCookie, toSessionUser } from "@/lib/auth";
import { createLedger } from "@/lib/ledgers";
import { exceedsBcryptLimit, hashPassword, PASSWORD_MAX_BYTES } from "@/lib/password";
import { User } from "@/models/User";

const registerSchema = z.object({
  username: z.string().trim().min(2, "使用者名稱至少 2 個字").max(32, "使用者名稱最多 32 個字"),
  email: z.email("Email 格式不正確"),
  password: z
    .string()
    .min(8, "密碼至少 8 個字元")
    .refine((p) => !exceedsBcryptLimit(p), `密碼最多 ${PASSWORD_MAX_BYTES} 位元組`),
});

export async function POST(req: NextRequest) {
  const body = await readBody(req, registerSchema);
  if ("response" in body) return body.response;
  const { username, email, password } = body.data;

  await connectDB();
  try {
    // New accounts are always "user"; admins are promoted directly in the database.
    const user = await User.create({
      username,
      email,
      role: "user",
      passwordHash: await hashPassword(password),
    });
    // Everyone starts with a personal ledger they can invite others into.
    await createLedger(String(user._id), `${user.username} 的記帳本`);

    const res = NextResponse.json({ user: toSessionUser(user) }, { status: 201 });
    await setSessionCookie(res, String(user._id));
    return res;
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      const field = "email" in err.keyPattern ? "Email" : "使用者名稱";
      return jsonError(409, `${field}已被使用`);
    }
    throw err;
  }
}
