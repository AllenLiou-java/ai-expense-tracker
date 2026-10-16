import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";

export function jsonError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

/** Parses a JSON body against a schema; returns the data or a 400 response. */
export async function readBody<T extends z.ZodType>(
  req: Request,
  schema: T,
): Promise<{ data: z.infer<T> } | { response: NextResponse }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { response: jsonError(400, "請求內容不是有效的 JSON") };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      response: jsonError(400, parsed.error.issues[0]?.message ?? "欄位格式錯誤"),
    };
  }
  return { data: parsed.data };
}

export function isDuplicateKeyError(err: unknown): err is { keyPattern: Record<string, number> } {
  return typeof err === "object" && err !== null && (err as { code?: number }).code === 11000;
}
