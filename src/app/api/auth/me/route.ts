import { NextResponse, type NextRequest } from "next/server";
import { jsonError } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return jsonError(401, "尚未登入");
  return NextResponse.json({ user });
}
