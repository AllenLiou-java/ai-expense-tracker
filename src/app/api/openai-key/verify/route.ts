import { NextResponse, type NextRequest } from "next/server";
import { jsonError } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { describeAiError, readApiKey, verifyApiKey } from "@/lib/ai";

/**
 * POST /api/openai-key/verify — checks the key in the x-openai-key header before the browser saves it.
 * Signed-in users only, so this can't be used as an open key-testing service.
 */
export async function POST(req: NextRequest) {
  if (!(await getSessionUser(req))) return jsonError(401, "尚未登入");

  const key = readApiKey(req);
  if (!("apiKey" in key)) return NextResponse.json(key, { status: key.status });

  try {
    await verifyApiKey(key.apiKey);
  } catch (err) {
    const failure = describeAiError(err);
    return NextResponse.json(failure, { status: failure.status });
  }
  return NextResponse.json({ ok: true });
}
