import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { jsonError, readBody } from "@/lib/api";
import { setSessionCookie, toSessionUser } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import { User } from "@/models/User";

const loginSchema = z.object({
  // Accepts either email or username.
  identifier: z.string().trim().min(1, "請輸入 Email 或使用者名稱"),
  password: z.string().min(1, "請輸入密碼"),
});

export async function POST(req: NextRequest) {
  const body = await readBody(req, loginSchema);
  if ("response" in body) return body.response;
  const { identifier, password } = body.data;

  await connectDB();
  const user = await User.findOne(
    identifier.includes("@")
      ? { email: identifier.toLowerCase() }
      : { username: identifier },
  ).select("+passwordHash");

  if (!(await verifyPassword(password, user?.passwordHash)) || !user) {
    return jsonError(401, "帳號或密碼錯誤");
  }

  const res = NextResponse.json({ user: toSessionUser(user) });
  await setSessionCookie(res, String(user._id));
  return res;
}
